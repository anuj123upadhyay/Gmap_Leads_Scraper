/**
 * Route handlers for Google Maps scraping
 * Handles LIST view (search results sidebar) and DETAIL view (individual business pages)
 */

import { Actor } from 'apify';
import { createPlaywrightRouter, sleep } from 'crawlee';
// import { createCursor } from 'ghost-cursor'; // Available for human-like interactions if needed

export const router = createPlaywrightRouter();

/**
 * LIST Handler: Processes Google Maps search results sidebar
 * Implements auto-scroll to load more results until maxItems is reached
 */
router.addHandler('LIST', async ({ page, request, log, crawler }) => {
    const { searchTerm, scrapedCount = 0 } = request.userData;
    const state = await Actor.getValue('CRAWLER_STATE');
    const { maxItems, scrollDelay, includeWebsite, includePhone } = state;

    log.info(`Processing LIST page for: ${searchTerm}`, {
        currentCount: scrapedCount,
        maxItems,
    });

    try {
        // Wait for the page to load
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
            log.warning('Network idle timeout, continuing anyway');
        });

        // Accept cookies if present
        await handleCookieConsent(page, log);

        // Wait for page to be fully loaded
        await page.waitForLoadState('domcontentloaded');
        await sleep(1500); // Reduced from 3000ms → 1500ms (50% faster)

        // Try multiple selectors for the results sidebar
        const sidebarSelectors = [
            'div[role="feed"]',
            'div[role="main"]',
            'div.m6QErb.DxyBCb.kA9KIf.dS8AEf',
            '[aria-label*="Results"]',
        ];

        let sidebarSelector = null;
        for (const selector of sidebarSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 10000 });
                sidebarSelector = selector;
                log.info(`Found results sidebar with selector: ${selector}`);
                break;
            } catch {
                log.debug(`Selector ${selector} not found, trying next...`);
            }
        }

        if (!sidebarSelector) {
            // Take a screenshot for debugging
            const screenshotBuffer = await page.screenshot({ fullPage: false });
            await Actor.setValue('debug-screenshot', screenshotBuffer, { contentType: 'image/png' });
            
            // Log page content for debugging
            const pageTitle = await page.title();
            const pageUrl = page.url();
            
            log.error('Failed to find results sidebar', {
                pageTitle,
                pageUrl,
                triedSelectors: sidebarSelectors,
            });
            
            throw new Error(`Could not find results sidebar with any selector. Page title: "${pageTitle}". Screenshot saved to key-value store as "debug-screenshot".`);
        }

        log.info('Results sidebar found, starting to scroll and extract');

        // Get the scrollable container
        const scrollContainer = await page.$(sidebarSelector);
        if (!scrollContainer) {
            throw new Error('Scrollable container not found');
        }

        // Auto-scroll to load all results
        const businessLinks = await autoScrollAndExtract(page, scrollContainer, maxItems, scrollDelay, searchTerm, sidebarSelector, log);

        log.info(`Found ${businessLinks.length} businesses for: ${searchTerm}`);

        // Process each business
        let processedCount = 0;
        for (const businessData of businessLinks) {
            if (scrapedCount + processedCount >= maxItems) {
                log.info(`Reached maxItems limit (${maxItems}) for: ${searchTerm}`);
                break;
            }

            // Check if we need to visit detail page for phone/website
            if ((includePhone && !businessData.phone) || (includeWebsite && !businessData.website)) {
                // Enqueue detail page
                if (businessData.detailUrl) {
                    await crawler.addRequests([
                        {
                            url: businessData.detailUrl,
                            label: 'DETAIL',
                            userData: {
                                searchTerm,
                                businessData,
                            },
                        },
                    ]);
                    log.debug(`Enqueued detail page: ${businessData.name}`);
                }
            } else {
                // We have all needed data, push directly
                await pushBusinessData(businessData, searchTerm, log);
                processedCount++;
            }
        }

        // Update scraped count
        state.scrapedCounts[searchTerm] = (state.scrapedCounts[searchTerm] || 0) + processedCount;
        await Actor.setValue('CRAWLER_STATE', state);
    } catch (error) {
        log.error(`Error processing LIST page for ${searchTerm}:`, {
            error: error.message,
            stack: error.stack,
        });
        throw error;
    }
});

/**
 * DETAIL Handler: Processes individual business detail pages
 * Extracts phone numbers, websites, and additional details not visible in list view
 */
router.addHandler('DETAIL', async ({ page, request, log }) => {
    const { searchTerm, businessData } = request.userData;

    log.info(`Processing DETAIL page: ${businessData.name}`);

    try {
        // Wait for page load
        await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
        await sleep(2000); // Give time for dynamic content

        // Ghost cursor available for human-like interactions if needed
        // const cursor = createCursor(page);

        // Extract phone number if not already present
        if (!businessData.phone) {
            businessData.phone = await extractPhone(page, log);
        }

        // Extract website if not already present
        if (!businessData.website) {
            businessData.website = await extractWebsite(page, log);
        }

        // Extract additional details if missing
        if (!businessData.rating) {
            businessData.rating = await extractRating(page);
        }

        if (!businessData.reviewCount) {
            businessData.reviewCount = await extractReviewCount(page);
        }

        // Push complete data
        await pushBusinessData(businessData, searchTerm, log);

        // Update counter
        const state = await Actor.getValue('CRAWLER_STATE');
        state.scrapedCounts[searchTerm] = (state.scrapedCounts[searchTerm] || 0) + 1;
        await Actor.setValue('CRAWLER_STATE', state);
    } catch (error) {
        log.error(`Error processing DETAIL page for ${businessData.name}:`, {
            error: error.message,
        });
        // Push data anyway with what we have
        await pushBusinessData(businessData, searchTerm, log);
    }
});

/**
 * Auto-scroll the results sidebar to load more businesses
 * Returns array of business data extracted from the list
 */
async function autoScrollAndExtract(page, scrollContainer, maxItems, scrollDelay, searchTerm, sidebarSelector, log) {
    const businesses = [];
    const seenUrls = new Set();
    let scrollAttempts = 0;
    const maxScrollAttempts = 50;
    let noNewResultsCount = 0;

    log.info(`Using sidebar selector: ${sidebarSelector} for extraction`);

    while (businesses.length < maxItems && scrollAttempts < maxScrollAttempts) {
        // Extract currently visible businesses - using more flexible selectors
        
        // First, let's check if we can find ANY links
        const totalLinks = await page.$$eval('a[href*="/maps/place/"]', (links) => links.length);
        log.info(`📊 Total links with /maps/place/ found on page: ${totalLinks}`);
        
        // Debug: What does the page actually contain?
        const pageDebug = await page.evaluate(() => {
            const sidebar = document.querySelector('div[role="main"]') || document.querySelector('div[role="feed"]');
            if (!sidebar) return { error: 'No sidebar found' };
            
            const allLinks = sidebar.querySelectorAll('a');
            const allDivs = sidebar.querySelectorAll('div');
            
            return {
                totalLinks: allLinks.length,
                totalDivs: allDivs.length,
                sampleLinkHrefs: Array.from(allLinks).slice(0, 5).map(a => a.href),
                sampleText: sidebar.textContent?.substring(0, 200),
            };
        });
        log.info('📋 Page debug info:', pageDebug);
        
        // Try multiple extraction strategies
        let currentBusinesses = [];
        
        // Strategy 1: Try with the sidebar selector that actually worked
        try {
            const strategy1Selector = `${sidebarSelector} a[href*="/maps/place/"]`;
            log.debug(`Strategy 1: Trying selector: ${strategy1Selector}`);
            
            currentBusinesses = await page.$$eval(strategy1Selector, (elements) => {
            return elements
                .map((el) => {
                    try {
                        // Get the parent container (usually 2-3 levels up)
                        let parent = el.parentElement;
                        for (let i = 0; i < 3; i++) {
                            if (parent && parent.parentElement) {
                                parent = parent.parentElement;
                            }
                        }
                        if (!parent) return null;

                        // Extract business name - try multiple patterns
                        let name = '';
                        const nameSelectors = [
                            'div[role="heading"]',
                            '[aria-label]',
                            'div.fontHeadlineSmall',
                            'div.fontHeadlineLarge',
                        ];

                        for (const selector of nameSelectors) {
                            const nameEl = parent.querySelector(selector);
                            if (nameEl && nameEl.textContent) {
                                name = nameEl.textContent.trim();
                                if (name) break;
                            }
                        }

                        // Fallback: use aria-label from the link itself
                        if (!name && el.getAttribute('aria-label')) {
                            name = el.getAttribute('aria-label').trim();
                        }

                        if (!name) return null;

                        // Extract rating and reviews from aria-label
                        let rating = null;
                        let reviewCount = null;
                        const ratingEl = parent.querySelector('span[role="img"][aria-label*="star" i]');
                        if (ratingEl) {
                            const ratingText = ratingEl.getAttribute('aria-label') || '';
                            const ratingMatch = ratingText.match(/([\d.]+)\s*star/i);
                            rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

                            const reviewMatch = ratingText.match(/([\d,]+)\s+review/i);
                            reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, ''), 10) : null;
                        }

                        // Extract category and address from text content
                        const textDivs = parent.querySelectorAll('div');
                        let category = '';
                        let address = '';

                        for (const div of textDivs) {
                            const text = div.textContent?.trim();
                            if (!text || text === name) continue;

                            // Category usually contains business type keywords
                            if (!category && (text.includes('·') || text.length < 50) && !text.match(/\d/)) {
                                category = text.split('·')[0].trim();
                            }

                            // Address usually contains numbers and street names
                            if (
                                !address &&
                                text.match(/\d+/) &&
                                (text.includes('St') ||
                                    text.includes('Ave') ||
                                    text.includes('Rd') ||
                                    text.includes('Blvd') ||
                                    text.includes(','))
                            ) {
                                address = text;
                            }
                        }

                        // Get detail URL
                        const detailUrl = el.href;

                        return {
                            name,
                            address,
                            rating,
                            reviewCount,
                            category,
                            detailUrl,
                            phone: null,
                            website: null,
                        };
                    } catch {
                        return null;
                    }
                })
                .filter((item) => item && item.name && item.detailUrl);
            });
            
            log.info(`Strategy 1 found ${currentBusinesses.length} businesses`);
        } catch (feedError) {
            log.warning('Strategy 1 failed, trying alternative:', feedError.message);
            currentBusinesses = [];
        }
        
        // Strategy 2: If Strategy 1 failed or found nothing, try without sidebar wrapper
        if (currentBusinesses.length === 0) {
            try {
                log.info('Trying Strategy 2: Direct link extraction without wrapper');
                currentBusinesses = await page.$$eval('a[href*="/maps/place/"]', (elements) => {
                    return elements
                        .slice(0, 20) // Limit to first 20 to avoid processing too many
                        .map((el) => {
                            try {
                                // Get aria-label as business name
                                const name = el.getAttribute('aria-label')?.trim() || '';
                                if (!name || name.length < 2) return null;
                                
                                const detailUrl = el.href;
                                
                                return {
                                    name,
                                    address: '',
                                    rating: null,
                                    reviewCount: null,
                                    category: '',
                                    detailUrl,
                                    phone: null,
                                    website: null,
                                };
                            } catch {
                                return null;
                            }
                        })
                        .filter((item) => item && item.name && item.detailUrl);
                });
                log.info(`Strategy 2 found ${currentBusinesses.length} businesses`);
            } catch (directError) {
                log.error('Strategy 2 also failed:', directError.message);
                currentBusinesses = [];
            }
        }

        // Add new businesses
        const previousCount = businesses.length;
        for (const business of currentBusinesses) {
            if (!seenUrls.has(business.detailUrl) && businesses.length < maxItems) {
                businesses.push(business);
                seenUrls.add(business.detailUrl);
            }
        }

        const newCount = businesses.length - previousCount;
        
        // If this is the first scroll and we found nothing, take a screenshot
        if (scrollAttempts === 0 && businesses.length === 0) {
            log.warning('⚠️ First scroll attempt found 0 businesses - taking debug screenshot');
            const screenshotBuffer = await page.screenshot({ fullPage: false });
            await Actor.setValue('debug-no-results-screenshot', screenshotBuffer, { contentType: 'image/png' });
        }


        if (newCount === 0) {
            noNewResultsCount++;
            if (noNewResultsCount >= 3) {
                log.info(`No new results after ${noNewResultsCount} scroll attempts, stopping`);
                break;
            }
        } else {
            noNewResultsCount = 0;
            log.debug(`Extracted ${newCount} new businesses (total: ${businesses.length}/${maxItems})`);
        }

        if (businesses.length >= maxItems) {
            log.info(`Reached maxItems: ${maxItems}`);
            break;
        }

        // Scroll down to load more results
        await scrollContainer.evaluate((el) => {
            el.scrollBy(0, el.clientHeight);
        });

        // Wait for new content to load
        await sleep(scrollDelay);
        scrollAttempts++;
    }

    log.info(`Scroll complete: ${businesses.length} businesses found after ${scrollAttempts} scroll attempts`);

    return businesses.slice(0, maxItems);
}

/**
 * Extract phone number from detail page
 */
async function extractPhone(page, log) {
    try {
        // Multiple selectors to try
        const phoneSelectors = [
            'button[data-item-id*="phone"]',
            'a[href^="tel:"]',
            'button[aria-label*="phone" i]',
            'div[data-section-id="pn0"]',
        ];

        for (const selector of phoneSelectors) {
            const element = await page.$(selector);
            if (element) {
                const text = await element.evaluate((el) => {
                    return el.textContent || el.getAttribute('href') || el.getAttribute('aria-label');
                });

                if (text) {
                    // Extract phone number
                    const phoneMatch = text.match(/[\d\s()+-]+/);
                    if (phoneMatch) {
                        const phone = phoneMatch[0].trim();
                        if (phone.length >= 7) {
                            log.debug(`Extracted phone: ${phone}`);
                            return phone;
                        }
                    }
                }
            }
        }

        return null;
    } catch (error) {
        log.warning('Failed to extract phone', { error: error.message });
        return null;
    }
}

/**
 * Extract website URL from detail page
 */
async function extractWebsite(page, log) {
    try {
        const websiteSelectors = [
            'a[data-item-id="authority"]',
            'a[href*="http"][data-item-id*="website"]',
            'a[aria-label*="website" i]',
        ];

        for (const selector of websiteSelectors) {
            const element = await page.$(selector);
            if (element) {
                const href = await element.evaluate((el) => el.href);
                if (href && href.startsWith('http')) {
                    // Clean Google redirect URLs
                    const url = new URL(href);
                    const actualUrl = url.searchParams.get('url') || href;
                    log.debug(`Extracted website: ${actualUrl}`);
                    return actualUrl;
                }
            }
        }

        return null;
    } catch (error) {
        log.warning('Failed to extract website', { error: error.message });
        return null;
    }
}

/**
 * Extract rating from detail page
 */
async function extractRating(page) {
    try {
        const ratingElement = await page.$('div[role="img"][aria-label*="star" i]');
        if (ratingElement) {
            const ariaLabel = await ratingElement.evaluate((el) => el.getAttribute('aria-label'));
            const match = ariaLabel.match(/([\d.]+)/);
            if (match) {
                return parseFloat(match[1]);
            }
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Extract review count from detail page
 */
async function extractReviewCount(page) {
    try {
        const reviewElement = await page.$('button[aria-label*="review" i]');
        if (reviewElement) {
            const text = await reviewElement.evaluate((el) => el.textContent);
            const match = text.match(/([\d,]+)/);
            if (match) {
                return parseInt(match[1].replace(/,/g, ''), 10);
            }
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Handle cookie consent dialogs
 */
async function handleCookieConsent(page, log) {
    try {
        // Wait a bit for any overlays to appear - reduced from 2000ms to 1000ms
        await sleep(1000);

        const cookieSelectors = [
            'button:has-text("Accept all")',
            'button:has-text("I agree")',
            'button:has-text("Accept")',
            'button:has-text("Reject all")', // Sometimes we need to reject instead
            'button[aria-label*="Accept" i]',
            'button[jsname="higCR"]', // Google's specific button
            'form[action*="consent"] button',
        ];

        for (const selector of cookieSelectors) {
            try {
                const button = await page.$(selector);
                if (button && await button.isVisible()) {
                    await button.click();
                    log.info(`Clicked cookie consent button: ${selector}`);
                    await sleep(2000);
                    return;
                }
            } catch (err) {
                // Continue to next selector
                log.debug(`Cookie selector ${selector} failed:`, err.message);
            }
        }

        // Alternative: Try to find and dismiss any overlay/modal
        try {
            const overlays = await page.$$('div[role="dialog"], div[role="presentation"], .consent-bump');
            if (overlays.length > 0) {
                log.info(`Found ${overlays.length} potential overlay(s), attempting to handle`);
                // Try pressing Escape key
                await page.keyboard.press('Escape');
                await sleep(1000);
            }
        } catch {
            log.debug('No overlays found or escape failed');
        }

    } catch {
        // Cookie consent not found or already accepted
        log.debug('Cookie consent handling completed or not needed');
    }
}

/**
 * Push business data to dataset
 */
async function pushBusinessData(businessData, searchTerm, log) {
    const cleanData = {
        businessName: businessData.name || null,
        address: businessData.address || null,
        website: businessData.website || null,
        phone: businessData.phone || null,
        rating: businessData.rating || null,
        reviewCount: businessData.reviewCount || null,
        category: businessData.category || null,
        googleMapsUrl: businessData.detailUrl || null,
        searchTerm,
        scrapedAt: new Date().toISOString(),
    };

    await Actor.pushData(cleanData);
    log.debug(`Pushed data for: ${cleanData.businessName}`);
}
