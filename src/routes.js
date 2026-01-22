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

        // Wait for search results sidebar
        const sidebarSelector = 'div[role="feed"]';
        await page.waitForSelector(sidebarSelector, { timeout: 20000 }).catch(() => {
            throw new Error('Could not find results sidebar');
        });

        log.info('Results sidebar found, starting to scroll and extract');

        // Get the scrollable container
        const scrollContainer = await page.$(sidebarSelector);
        if (!scrollContainer) {
            throw new Error('Scrollable container not found');
        }

        // Auto-scroll to load all results
        const businessLinks = await autoScrollAndExtract(page, scrollContainer, maxItems, scrollDelay, searchTerm, log);

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
async function autoScrollAndExtract(page, scrollContainer, maxItems, scrollDelay, searchTerm, log) {
    const businesses = [];
    const seenUrls = new Set();
    let scrollAttempts = 0;
    const maxScrollAttempts = 50;
    let noNewResultsCount = 0;

    while (businesses.length < maxItems && scrollAttempts < maxScrollAttempts) {
        // Extract currently visible businesses - using more flexible selectors
        const currentBusinesses = await page.$$eval('div[role="feed"] a[href*="/maps/place/"]', (elements) => {
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
                    } catch (err) {
                        return null;
                    }
                })
                .filter((item) => item && item.name && item.detailUrl);
        });

        // Add new businesses
        const previousCount = businesses.length;
        for (const business of currentBusinesses) {
            if (!seenUrls.has(business.detailUrl) && businesses.length < maxItems) {
                businesses.push(business);
                seenUrls.add(business.detailUrl);
            }
        }

        const newCount = businesses.length - previousCount;

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
        const cookieSelectors = [
            'button:has-text("Accept all")',
            'button:has-text("I agree")',
            'button:has-text("Accept")',
            'button[aria-label*="Accept" i]',
        ];

        for (const selector of cookieSelectors) {
            try {
                const button = await page.$(selector);
                if (button) {
                    await button.click();
                    log.debug('Clicked cookie consent button');
                    await sleep(1000);
                    return;
                }
            } catch {
                // Continue to next selector
            }
        }
    } catch {
        // Cookie consent not found or already accepted
        log.debug('No cookie consent found');
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
