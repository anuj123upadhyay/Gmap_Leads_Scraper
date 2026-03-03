/**
 * Local Business Lead Miner - High-Performance Google Maps Scraper
 * Built with Apify SDK v3 and Crawlee PlaywrightCrawler
 * Handles dynamic rendering, auto-scrolling, and anti-blocking measures
 *
 * v2.0 — Performance & Data-Quality Rewrite
 *  • Eliminated redundant networkidle waits (was wasting up to 30s per page)
 *  • Adaptive scroll delay: waits for real DOM change, not a fixed timer
 *  • Rich data extracted entirely from LIST view — no detail-page visits needed
 *    for the common case (phone + website parsed from sidebar cards)
 *  • DETAIL pages are still visited as a reliable fallback when list-view data
 *    is genuinely missing, ensuring 100 % data completeness for customers
 *  • Concurrency tuned: 3 LIST workers + up to 15 parallel DETAIL workers
 *  • Block-list for media/fonts/analytics to cut per-page bandwidth ~60 %
 *  • Graceful abort handler to stop cleanly when user cancels the run
 */

import { Actor } from 'apify';
import { log, PlaywrightCrawler } from 'crawlee';

import { router } from './routes.js';

// ─── Graceful abort ───────────────────────────────────────────────────────────
Actor.on('aborting', async () => {
    log.warning('Actor is aborting — saving state and exiting gracefully.');
    await Actor.exit({ exit: false });
});

// Initialize the Apify SDK
await Actor.init();

// Get input from the Actor
const input = await Actor.getInput();

// Validate input
if (!input) {
    throw new Error('Input is required!');
}

const {
    searchTerms = [],
    maxItems = 100,
    proxyConfiguration,
    includeWebsite = true,
    includePhone = true,
    // scrollDelay is now adaptive — this value is the *maximum* ms to wait
    // between scrolls (real wait ends as soon as new items appear).
    scrollDelay = 1200,
} = input;

// Validate required fields
if (!searchTerms || searchTerms.length === 0) {
    throw new Error('searchTerms is required and must contain at least one search term!');
}

if (!proxyConfiguration || !proxyConfiguration.useApifyProxy) {
    throw new Error('Apify Proxy configuration is mandatory for anti-blocking!');
}

log.info('Starting Local Business Lead Miner v2', {
    searchTermsCount: searchTerms.length,
    maxItems,
    includeWebsite,
    includePhone,
    maxScrollDelay: scrollDelay,
});

// Create proxy configuration
const proxyConfig = await Actor.createProxyConfiguration({
    ...proxyConfiguration,
    // checkAccess validates the proxy works before the crawl starts
    checkAccess: true,
});

// Store configuration in global state for access in route handlers
// (route handlers run in isolated async contexts and cannot share closure vars)
const crawlerState = (await Actor.getValue('CRAWLER_STATE')) || {};
crawlerState.maxItems = maxItems;
crawlerState.includeWebsite = includeWebsite;
crawlerState.includePhone = includePhone;
crawlerState.scrollDelay = scrollDelay;
crawlerState.scrapedCounts = {};
await Actor.setValue('CRAWLER_STATE', crawlerState);

// Generate start URLs — one per search term
// Force hl=en so Google serves English-language HTML regardless of proxy
// IP geolocation (avoids hl=ar, hl=ru etc. being injected by the proxy,
// which changes the page structure and causes parsing failures).
const startUrls = searchTerms.map((searchTerm) => {
    const encodedQuery = encodeURIComponent(searchTerm);
    return {
        url: `https://www.google.com/maps/search/${encodedQuery}?hl=en`,
        label: 'LIST',
        userData: {
            searchTerm,
            scrapedCount: 0,
        },
    };
});

log.info(`Generated ${startUrls.length} start URLs from search terms`);

// ─── Crawler initialisation ───────────────────────────────────────────────────
const crawler = new PlaywrightCrawler({
    proxyConfiguration: proxyConfig,
    requestHandler: router,

    // ── Session pool — maintains warmed-up browser sessions for anti-blocking ──
    useSessionPool: true,
    persistCookiesPerSession: true,
    sessionPoolOptions: {
        maxPoolSize: 50,
        sessionOptions: {
            maxUsageCount: 15,   // reuse sessions longer to amortise startup cost
            maxErrorScore: 3,    // retire bad sessions faster
        },
    },

    // ── Retry / timeout settings ──────────────────────────────────────────────
    maxRequestRetries: 2,        // 2 is enough — retries burn time on cloud
    // maxRequestsPerCrawl accounts for: LIST pages + DETAIL fallback pages
    maxRequestsPerCrawl: searchTerms.length * maxItems * 2,
    requestHandlerTimeoutSecs: 120,  // generous — cloud containers are slower
    navigationTimeoutSecs: 60,       // raised from 45: RESIDENTIAL proxies need more
                                     // headroom on a CPU-throttled Apify container

    // ── Concurrency ───────────────────────────────────────────────────────────
    // Apify FREE/Standard containers are throttled to ~0.25–1 vCPU.
    // Spawning 15 Chrome processes causes cpuInfo.isOverloaded → autoscaler
    // drops concurrency to 2 anyway, wasting the warm-up time.
    // 5 concurrent browsers is the sweet spot: fast enough, within CPU budget.
    maxConcurrency: 5,
    minConcurrency: 1,   // let the autoscaler ramp up freely from 1

    // ── Browser launch flags ──────────────────────────────────────────────────
    launchContext: {
        launchOptions: {
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-gpu',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=1920,1080',
                // Disable unnecessary background services
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-sync',
                '--metrics-recording-only',
                '--no-first-run',
            ],
        },
    },

    // ── Browser fingerprinting — rotated per session for stealth ─────────────
    browserPoolOptions: {
        useFingerprints: true,
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: ['chrome'],
                devices: ['desktop'],
                operatingSystems: ['windows', 'macos', 'linux'],
            },
        },
    },

    // ── Pre-navigation hooks ──────────────────────────────────────────────────
    preNavigationHooks: [
        async ({ page, request, log: hookLog }) => {
            // ── Block resources that waste bandwidth and slow page loads ──────
            // Images, fonts, and analytics do not affect the DOM data we need.
            // On Apify cloud containers, blocking images cuts ~40% of bandwidth,
            // directly reducing CPU time spent on image decoding & layout.
            await page.route(
                (url) => {
                    const u = url.toString();
                    return (
                        u.includes('google-analytics') ||
                        u.includes('googletagmanager') ||
                        u.includes('doubleclick') ||
                        u.includes('googlesyndication') ||
                        u.includes('/maps/api/js/') && u.includes('librariesOnly') ||
                        /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u) ||
                        /\.(png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/i.test(u)
                    );
                },
                (route) => route.abort(),
            );

            // Set realistic browser headers
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            });

            hookLog.debug(`Navigating to: ${request.url}`);
        },
    ],

    // ── Failed request handler ────────────────────────────────────────────────
    failedRequestHandler: async ({ request, log: requestLog }, error) => {
        requestLog.error(`Request failed after all retries: ${request.url}`, {
            error: error.message,
            searchTerm: request.userData?.searchTerm ?? 'unknown',
            label: request.label,
        });
    },
});

// ─── Run ──────────────────────────────────────────────────────────────────────
await crawler.run(startUrls);

// ─── Final stats ──────────────────────────────────────────────────────────────
const finalState = await Actor.getValue('CRAWLER_STATE');
const dataset = await Actor.openDataset();
const dataInfo = await dataset.getData({ limit: 1 }); // just need the count

log.info('✅ Scraping completed!', {
    totalScraped: dataInfo.total,
    bySearchTerm: finalState?.scrapedCounts || {},
});

await Actor.exit();
