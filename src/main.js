/**
 * Local Business Lead Miner - High-Performance Google Maps Scraper
 * Built with Apify SDK v3 and Crawlee PlaywrightCrawler
 * Handles dynamic rendering, auto-scrolling, and anti-blocking measures
 */

import { Actor } from 'apify';
import { log, PlaywrightCrawler } from 'crawlee';

import { router } from './routes.js';

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
    scrollDelay = 2000,
} = input;

// Validate required fields
if (!searchTerms || searchTerms.length === 0) {
    throw new Error('searchTerms is required and must contain at least one search term!');
}

if (!proxyConfiguration || !proxyConfiguration.useApifyProxy) {
    throw new Error('Apify Proxy configuration is mandatory for anti-blocking!');
}

log.info('Starting Local Business Lead Miner', {
    searchTermsCount: searchTerms.length,
    maxItems,
    includeWebsite,
    includePhone,
});

// Create proxy configuration with checkAccess enabled
const proxyConfig = await Actor.createProxyConfiguration({
    ...proxyConfiguration,
    checkAccess: true,
});

// Store configuration in global state for access in routes
const crawlerState = (await Actor.getValue('CRAWLER_STATE')) || {};
crawlerState.maxItems = maxItems;
crawlerState.includeWebsite = includeWebsite;
crawlerState.includePhone = includePhone;
crawlerState.scrollDelay = scrollDelay;
crawlerState.scrapedCounts = {};
await Actor.setValue('CRAWLER_STATE', crawlerState);

// Generate start URLs from search terms
const startUrls = searchTerms.map((searchTerm) => {
    const encodedQuery = encodeURIComponent(searchTerm);
    return {
        url: `https://www.google.com/maps/search/${encodedQuery}`,
        label: 'LIST',
        userData: {
            searchTerm,
            scrapedCount: 0,
        },
    };
});

log.info(`Generated ${startUrls.length} start URLs from search terms`);

// Initialize the crawler
const crawler = new PlaywrightCrawler({
    proxyConfiguration: proxyConfig,
    requestHandler: router,

    // Session management for anti-blocking
    useSessionPool: true,
    persistCookiesPerSession: true,
    sessionPoolOptions: {
        maxPoolSize: 50,
        sessionOptions: {
            maxUsageCount: 10,
            maxErrorScore: 5,
        },
    },

    // Request handling options
    maxRequestRetries: 5,
    maxRequestsPerCrawl: searchTerms.length * maxItems * 2, // Account for detail pages
    requestHandlerTimeoutSecs: 180, // 3 minutes per request
    navigationTimeoutSecs: 60,

    // Performance and resource management
    maxConcurrency: 5,
    minConcurrency: 1,

    // Browser launch configuration
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
            ],
        },
    },

    // Browser context options
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

    // Error handling
    failedRequestHandler: async ({ request, log: requestLog }, error) => {
        requestLog.error(`Request ${request.url} failed after max retries`, {
            error: error.message,
            searchTerm: request.userData.searchTerm,
        });
    },
});

// Run the crawler
await crawler.run(startUrls);

// Log final statistics
const finalState = await Actor.getValue('CRAWLER_STATE');
const dataset = await Actor.openDataset();
const stats = await dataset.getData();

log.info('Scraping completed!', {
    totalScraped: stats.items.length,
    bySearchTerm: finalState?.scrapedCounts || {},
});

// Exit successfully
await Actor.exit();
