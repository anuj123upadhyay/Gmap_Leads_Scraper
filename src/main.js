/**
 * Local Business Lead Miner v3.0 — Pay Per Event (PPE) Edition
 * Built with Apify SDK v3 and Crawlee PlaywrightCrawler
 *
 * Pricing: $0.051 per lead ($51 per 1,000 leads)
 *
 * PPE features:
 *  • Charges $0.051 per extracted lead via Actor.charge()
 *  • Respects user spending limits (ACTOR_MAX_TOTAL_CHARGE_USD)
 *  • Gracefully aborts crawler when charge limit is reached
 *  • Live status messages in Apify Console showing progress & cost
 *  • Uses apify-actor-start synthetic event (configured in Console)
 *
 * Performance features (inherited from v2):
 *  • Adaptive scroll delay — waits for real DOM change, not a fixed timer
 *  • Rich data extracted from LIST view — minimal detail-page visits
 *  • Block-list for media/fonts/analytics to cut bandwidth ~60%
 *  • Graceful abort handler for clean user cancellation
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

// ─── PPE: Log spending limit ─────────────────────────────────────────────────
const maxTotalChargeUsd = parseFloat(process.env.ACTOR_MAX_TOTAL_CHARGE_USD || '0');
if (maxTotalChargeUsd > 0) {
    log.info(`[PPE] User spending limit: $${maxTotalChargeUsd.toFixed(2)}`);
} else {
    log.info('[PPE] No user spending limit set (ACTOR_MAX_TOTAL_CHARGE_USD not configured).');
}

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

log.info('Starting Local Business Lead Miner v3 (PPE)', {
    searchTermsCount: searchTerms.length,
    maxItems,
    includeWebsite,
    includePhone,
    maxScrollDelay: scrollDelay,
    pricePerLead: '$0.051',
});

await Actor.setStatusMessage('Starting scraper — configuring proxies and browser...');

// Create proxy configuration
const proxyConfig = await Actor.createProxyConfiguration({
    ...proxyConfiguration,
    checkAccess: true,
});

// Store configuration in global state for access in route handlers
const crawlerState = (await Actor.getValue('CRAWLER_STATE')) || {};
crawlerState.maxItems = maxItems;
crawlerState.includeWebsite = includeWebsite;
crawlerState.includePhone = includePhone;
crawlerState.scrollDelay = scrollDelay;
crawlerState.scrapedCounts = {};
// PPE tracking
crawlerState.totalCharged = 0;
crawlerState.chargeAborted = false;
await Actor.setValue('CRAWLER_STATE', crawlerState);

// Generate start URLs — one per search term
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
await Actor.setStatusMessage(`Processing ${searchTerms.length} search term(s) — 0 leads extracted so far...`);

// ─── Crawler initialisation ───────────────────────────────────────────────────
const crawler = new PlaywrightCrawler({
    proxyConfiguration: proxyConfig,
    requestHandler: router,

    // ── Session pool ──────────────────────────────────────────────────────────
    useSessionPool: true,
    persistCookiesPerSession: true,
    sessionPoolOptions: {
        maxPoolSize: 50,
        sessionOptions: {
            maxUsageCount: 15,
            maxErrorScore: 3,
        },
    },

    // ── Retry / timeout settings ──────────────────────────────────────────────
    maxRequestRetries: 2,
    maxRequestsPerCrawl: searchTerms.length * maxItems * 2,
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 60,

    // ── Concurrency ───────────────────────────────────────────────────────────
    maxConcurrency: 5,
    minConcurrency: 1,

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
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-sync',
                '--metrics-recording-only',
                '--no-first-run',
            ],
        },
    },

    // ── Browser fingerprinting ────────────────────────────────────────────────
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
            await page.route(
                (url) => {
                    const u = url.toString();
                    return (
                        u.includes('google-analytics') ||
                        u.includes('googletagmanager') ||
                        u.includes('doubleclick') ||
                        u.includes('googlesyndication') ||
                        (u.includes('/maps/api/js/') && u.includes('librariesOnly')) ||
                        /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u) ||
                        /\.(png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/i.test(u)
                    );
                },
                (route) => route.abort(),
            );

            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
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
const dataInfo = await dataset.getData({ limit: 1 });

const totalLeads = dataInfo.total;
const totalCharged = finalState?.totalCharged || 0;
const wasAborted = finalState?.chargeAborted || false;
const estimatedCost = (totalCharged * 0.051).toFixed(2);

const finalMessage = wasAborted
    ? `✅ Completed (stopped at spending limit): ${totalLeads} leads extracted — ~$${estimatedCost} charged`
    : `✅ Scraping completed: ${totalLeads} leads extracted — ~$${estimatedCost} charged`;

log.info(finalMessage, {
    totalScraped: totalLeads,
    totalEventsCharged: totalCharged,
    estimatedCostUsd: estimatedCost,
    bySearchTerm: finalState?.scrapedCounts || {},
    stoppedBySpendingLimit: wasAborted,
});

await Actor.setStatusMessage(finalMessage);
await Actor.exit();
