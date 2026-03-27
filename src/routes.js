/**
 * Route handlers for Google Maps scraping — v3.0 (PPE Edition)
 *
 * Pay Per Event changes:
 *  1. pushBusinessData() charges $0.051 per lead via Actor.charge()
 *  2. Checks eventChargeLimitReached to gracefully abort the crawler
 *  3. Tracks charge count in CRAWLER_STATE for status messages
 *  4. Updates Actor.setStatusMessage() after every lead for live Console feedback
 *  5. Both LIST and DETAIL handlers check if charge limit was already reached
 *     before doing expensive work (browser navigation, DOM extraction)
 *
 * Inherited from v2:
 *  • Adaptive scroll delay (resolves on DOM change, not fixed timer)
 *  • Rich list-view extraction (phone, website, category — zero detail visits)
 *  • DETAIL fallback only when genuinely missing phone/website
 *  • Single $$eval per scroll cycle (minimal browser round-trips)
 *  • Data cleaning: trimmed fields, validated phones, unwrapped Google redirects
 */

import { Actor } from 'apify';
import { createPlaywrightRouter, sleep } from 'crawlee';

export const router = createPlaywrightRouter();

// ─── PPE Event Name ──────────────────────────────────────────────────────────
const PPE_EVENT_NAME = 'lead-extracted';
const PPE_PRICE_PER_LEAD = 0.051; // $0.051 per lead ($51 per 1,000)

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Check if charging was already aborted (spending limit hit)
// ─────────────────────────────────────────────────────────────────────────────
async function isChargeAborted() {
    const state = await Actor.getValue('CRAWLER_STATE');
    return state?.chargeAborted === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST Handler
// ─────────────────────────────────────────────────────────────────────────────
router.addHandler('LIST', async ({ page, request, log, crawler }) => {
    const { searchTerm, scrapedCount = 0 } = request.userData;
    const state = await Actor.getValue('CRAWLER_STATE');
    const { maxItems, scrollDelay, includeWebsite, includePhone } = state;

    // PPE: Skip work if charge limit was already reached
    if (state.chargeAborted) {
        log.info(`[LIST] Skipping "${searchTerm}" — spending limit already reached.`);
        return;
    }

    log.info(`[LIST] Processing: "${searchTerm}"`, { scrapedCount, maxItems });

    try {
        // ── 1. Wait only for the feed — NOT for networkidle ──────────────────
        const FEED_SELECTORS = [
            'div[role="feed"]',
            'div[role="main"]',
            'div.m6QErb.DxyBCb.kA9KIf.dS8AEf',
            '[aria-label*="Results for" i]',
            '[aria-label*="results" i]',
        ];

        await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});

        // ── 2. Cookie consent (fast path) ─────────────────────────────────────
        await handleCookieConsent(page, log);

        // ── 3. Find the scrollable sidebar ────────────────────────────────────
        let sidebarSelector = null;
        for (const sel of FEED_SELECTORS) {
            const found = await page.waitForSelector(sel, { timeout: 8000 }).catch(() => null);
            if (found) {
                sidebarSelector = sel;
                log.info(`[LIST] Sidebar found: "${sel}"`);
                break;
            }
        }

        if (!sidebarSelector) {
            const screenshotBuffer = await page.screenshot({ fullPage: false });
            await Actor.setValue('debug-no-sidebar', screenshotBuffer, { contentType: 'image/png' });
            const pageTitle = await page.title();
            throw new Error(
                `Could not find results sidebar. Page title: "${pageTitle}". ` +
                    `Debug screenshot saved as "debug-no-sidebar".`,
            );
        }

        const scrollContainer = await page.$(sidebarSelector);
        if (!scrollContainer) {
            throw new Error('Sidebar element disappeared after detection.');
        }

        // ── 4. Scroll + extract ───────────────────────────────────────────────
        const businessLinks = await autoScrollAndExtract(
            page,
            scrollContainer,
            maxItems,
            scrollDelay,
            sidebarSelector,
            log,
        );

        log.info(`[LIST] Extracted ${businessLinks.length} businesses for: "${searchTerm}"`);

        // ── 5. Decide: push directly or enqueue detail page ───────────────────
        let processedCount = 0;
        for (const businessData of businessLinks) {
            if (scrapedCount + processedCount >= maxItems) break;

            // PPE: Re-check if limit was hit during this loop
            if (await isChargeAborted()) {
                log.info(`[LIST] Stopping loop for "${searchTerm}" — spending limit reached.`);
                break;
            }

            const needsPhone = includePhone && !businessData.phone;
            const needsWebsite = includeWebsite && !businessData.website;

            if ((needsPhone || needsWebsite) && businessData.detailUrl) {
                let { detailUrl } = businessData;
                try {
                    const u = new URL(detailUrl);
                    u.searchParams.set('hl', 'en');
                    detailUrl = u.toString();
                } catch {
                    // keep original if URL parsing fails
                }

                await crawler.addRequests([
                    {
                        url: detailUrl,
                        label: 'DETAIL',
                        userData: { searchTerm, businessData },
                    },
                ]);
                log.debug(`[LIST] Enqueued DETAIL fallback: "${businessData.name}"`);
            } else {
                await pushBusinessData(businessData, searchTerm, log, crawler);
                processedCount++;
            }
        }

        // Update scraped count in shared state
        const freshState = await Actor.getValue('CRAWLER_STATE');
        freshState.scrapedCounts[searchTerm] = (freshState.scrapedCounts[searchTerm] || 0) + processedCount;
        await Actor.setValue('CRAWLER_STATE', freshState);

        log.info(`[LIST] Done for "${searchTerm}" — pushed ${processedCount} directly, rest via DETAIL fallback.`);
    } catch (error) {
        log.error(`[LIST] Fatal error for "${searchTerm}": ${error.message}`, { stack: error.stack });
        throw error;
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL Fallback Handler
// Only called when list-view data was genuinely missing phone / website.
// ─────────────────────────────────────────────────────────────────────────────
router.addHandler('DETAIL', async ({ page, request, log, crawler }) => {
    const { searchTerm, businessData } = request.userData;

    // PPE: Skip if charge limit was already reached
    if (await isChargeAborted()) {
        log.info(`[DETAIL] Skipping "${businessData.name}" — spending limit already reached.`);
        return;
    }

    log.info(`[DETAIL] Fetching missing data for: "${businessData.name}"`);

    try {
        await page.waitForSelector('div[role="main"]', { timeout: 30000 }).catch(() => {});

        await page
            .waitForSelector(
                'a[href^="tel:"], button[data-item-id*="phone"], a[data-item-id="authority"], a[href*="http"][data-item-id*="website"]',
                { timeout: 8000 },
            )
            .catch(() => {});

        if (!businessData.phone) {
            businessData.phone = await extractPhone(page, log);
        }
        if (!businessData.website) {
            businessData.website = await extractWebsite(page, log);
        }
        if (!businessData.rating) {
            businessData.rating = await extractRating(page, log);
        }
        if (!businessData.reviewCount) {
            businessData.reviewCount = await extractReviewCount(page, log);
        }
        if (!businessData.address) {
            businessData.address = await extractAddress(page, log);
        }
        if (!businessData.category) {
            businessData.category = await extractCategory(page, log);
        }

        await pushBusinessData(businessData, searchTerm, log, crawler);

        const state = await Actor.getValue('CRAWLER_STATE');
        state.scrapedCounts[searchTerm] = (state.scrapedCounts[searchTerm] || 0) + 1;
        await Actor.setValue('CRAWLER_STATE', state);
    } catch (error) {
        log.error(`[DETAIL] Error for "${businessData.name}": ${error.message}`);
        // Always push — partial data is better than no data for the customer
        await pushBusinessData(businessData, searchTerm, log, crawler);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// autoScrollAndExtract
// Scrolls the sidebar and extracts rich business data from the card HTML.
// Uses an adaptive wait instead of a fixed sleep.
// ─────────────────────────────────────────────────────────────────────────────
async function autoScrollAndExtract(page, scrollContainer, maxItems, maxScrollDelay, sidebarSelector, log) {
    const businesses = [];
    const seenUrls = new Set();
    let scrollAttempts = 0;
    const MAX_SCROLL_ATTEMPTS = 50;
    let staleRounds = 0;

    log.info(`[SCROLL] Starting adaptive scroll (max delay: ${maxScrollDelay} ms)`);

    while (businesses.length < maxItems && scrollAttempts < MAX_SCROLL_ATTEMPTS) {
        const currentBusinesses = await extractBusinessesFromPage(page, sidebarSelector, log);

        const prevCount = businesses.length;
        for (const biz of currentBusinesses) {
            if (!seenUrls.has(biz.detailUrl) && businesses.length < maxItems) {
                businesses.push(biz);
                seenUrls.add(biz.detailUrl);
            }
        }
        const newCount = businesses.length - prevCount;

        if (newCount > 0) {
            staleRounds = 0;
            log.debug(`[SCROLL] +${newCount} businesses (total: ${businesses.length}/${maxItems})`);
        } else {
            staleRounds++;
            if (staleRounds >= 3) {
                log.info(`[SCROLL] No new results in ${staleRounds} rounds — stopping.`);
                break;
            }
        }

        if (businesses.length >= maxItems) break;

        const countBefore = businesses.length;
        await scrollContainer.evaluate((el) => el.scrollBy(0, el.clientHeight));

        try {
            await page.waitForFunction(
                ({ sel, minCount }) => {
                    const links = document.querySelectorAll(`${sel} a[href*="/maps/place/"]`);
                    return links.length > minCount;
                },
                { sel: sidebarSelector, minCount: countBefore + seenUrls.size - 1 },
                { timeout: maxScrollDelay },
            );
        } catch {
            // Timeout is fine — we just didn't get new results this round
        }

        scrollAttempts++;
    }

    log.info(`[SCROLL] Complete: ${businesses.length} businesses after ${scrollAttempts} scrolls`);
    return businesses.slice(0, maxItems);
}

// ─────────────────────────────────────────────────────────────────────────────
// extractBusinessesFromPage
// Pulls all the rich data available in the sidebar cards in a single $$eval.
// ─────────────────────────────────────────────────────────────────────────────
async function extractBusinessesFromPage(page, sidebarSelector, log) {
    try {
        const primary = await page.$$eval(`${sidebarSelector} a[href*="/maps/place/"]`, (anchors) => {
            function findCard(el) {
                let node = el.parentElement;
                for (let i = 0; i < 6; i++) {
                    if (!node) break;
                    const heading = node.querySelector(
                        'div[role="heading"], div.fontHeadlineSmall, div.fontHeadlineLarge',
                    );
                    if (heading) return node;
                    node = node.parentElement;
                }
                return el.parentElement;
            }

            function clean(str) {
                if (!str) return '';
                return str
                    .replace(/\s+/g, ' ')
                    .trim()
                    .replace(/^[·•\-–—]+\s*/, '')
                    .replace(/\s*[·•\-–—]+$/, '');
            }

            const seen = new Set();
            const results = [];

            for (const anchor of anchors) {
                const detailUrl = anchor.href;
                if (!detailUrl || seen.has(detailUrl)) continue;

                const card = findCard(anchor);
                if (!card) continue;

                let name = '';
                const headingEl = card.querySelector(
                    'div[role="heading"], div.fontHeadlineSmall, div.fontHeadlineLarge',
                );
                if (headingEl) {
                    name = clean(headingEl.textContent);
                }
                if (!name) {
                    name = clean(anchor.getAttribute('aria-label') || '');
                }
                if (!name || name.length < 2) continue;

                let rating = null;
                let reviewCount = null;
                const ratingImg = card.querySelector('span[role="img"][aria-label]');
                if (ratingImg) {
                    const label = ratingImg.getAttribute('aria-label') || '';
                    const ratingM = label.match(/([\d.]+)\s*star/i);
                    if (ratingM) rating = parseFloat(ratingM[1]);
                    const reviewM = label.match(/([\d,]+)\s+review/i);
                    if (reviewM) reviewCount = parseInt(reviewM[1].replace(/,/g, ''), 10);
                }
                if (reviewCount === null) {
                    const reviewSpan = card.querySelector('span[aria-label*="review" i]');
                    if (reviewSpan) {
                        const m = (reviewSpan.getAttribute('aria-label') || reviewSpan.textContent).match(/([\d,]+)/);
                        if (m) reviewCount = parseInt(m[1].replace(/,/g, ''), 10);
                    }
                }

                let category = '';
                let address = '';
                let phone = null;
                let website = null;

                const infoTexts = [];
                const infoEls = card.querySelectorAll('div, span');
                for (const el of infoEls) {
                    if (el.children.length > 0) continue;
                    const t = clean(el.textContent);
                    if (t && t !== name && t.length > 1) infoTexts.push(t);
                }

                for (const t of infoTexts) {
                    if (!phone && /^[\d\s()+-]{7,}$/u.test(t) && t.replace(/\D/g, '').length >= 7) {
                        phone = t;
                        continue;
                    }
                    if (!website && /^https?:\/\//i.test(t)) {
                        website = t;
                        continue;
                    }
                    if (
                        !address &&
                        /\d/.test(t) &&
                        (t.includes(',') || /\b(St|Ave|Rd|Blvd|Dr|Ln|Way|Nagar|Marg|Road|Colony|Sector)\b/i.test(t))
                    ) {
                        address = t;
                        continue;
                    }
                    if (!category && !address && t.length < 60 && !/\d/.test(t) && t.length > 2) {
                        if (!/^(open|closed|website|directions|call|saved|share|more)/i.test(t)) {
                            category = t.split('·')[0].trim();
                        }
                    }
                }

                if (!website) {
                    const websiteAnchor = card.querySelector(
                        'a[data-item-id="authority"], a[data-item-id*="website"], a[aria-label*="website" i]',
                    );
                    if (websiteAnchor) {
                        try {
                            const raw = websiteAnchor.href || '';
                            const urlObj = new URL(raw);
                            website = urlObj.searchParams.get('url') || raw;
                        } catch {
                            website = websiteAnchor.href || null;
                        }
                    }
                }

                if (!phone) {
                    const telAnchor = card.querySelector('a[href^="tel:"]');
                    if (telAnchor) {
                        phone = decodeURIComponent(telAnchor.href.replace('tel:', '').trim());
                    }
                }

                seen.add(detailUrl);
                results.push({ name, address, rating, reviewCount, category, detailUrl, phone, website });
            }

            return results;
        });

        if (primary.length > 0) return primary;

        log.debug('[EXTRACT] Primary extraction returned 0 — trying fallback');
        const fallback = await page.$$eval('a[href*="/maps/place/"]', (anchors) => {
            const seen = new Set();
            return anchors
                .map((el) => {
                    const detailUrl = el.href;
                    if (!detailUrl || seen.has(detailUrl)) return null;
                    const name = (el.getAttribute('aria-label') || '').trim();
                    if (!name || name.length < 2) return null;
                    seen.add(detailUrl);
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
                })
                .filter(Boolean);
        });

        log.debug(`[EXTRACT] Fallback found ${fallback.length} businesses`);
        return fallback;
    } catch (err) {
        log.warning(`[EXTRACT] Extraction error: ${err.message}`);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail-page helpers (used only in the DETAIL fallback handler)
// ─────────────────────────────────────────────────────────────────────────────

async function extractPhone(page, log) {
    try {
        const selectors = [
            'a[href^="tel:"]',
            'button[data-item-id*="phone"]',
            'button[aria-label*="phone" i]',
            'div[data-section-id="pn0"]',
        ];

        for (const sel of selectors) {
            const el = await page.$(sel);
            if (!el) continue;

            const raw = await el.evaluate(
                (node) => node.getAttribute('href') || node.textContent || node.getAttribute('aria-label') || '',
            );
            const cleaned = raw.replace(/^tel:/, '').trim();
            const digits = cleaned.replace(/\D/g, '');
            if (digits.length >= 7) {
                log.debug(`[PHONE] Extracted: ${cleaned}`);
                return cleaned;
            }
        }
        return null;
    } catch (err) {
        log.warning(`[PHONE] Extraction failed: ${err.message}`);
        return null;
    }
}

async function extractWebsite(page, log) {
    try {
        const selectors = [
            'a[data-item-id="authority"]',
            'a[href*="http"][data-item-id*="website"]',
            'a[aria-label*="website" i]',
            'a[aria-label*="Web site" i]',
        ];

        for (const sel of selectors) {
            const el = await page.$(sel);
            if (!el) continue;

            const href = await el.evaluate((node) => node.href || '');
            if (!href.startsWith('http')) continue;

            let finalUrl = href;
            try {
                const u = new URL(href);
                finalUrl = u.searchParams.get('url') || u.searchParams.get('q') || href;
                if (!isValidUrl(finalUrl)) finalUrl = href;
            } catch {
                finalUrl = href;
            }
            log.debug(`[WEBSITE] Extracted: ${finalUrl}`);
            return finalUrl;
        }
        return null;
    } catch (err) {
        log.warning(`[WEBSITE] Extraction failed: ${err.message}`);
        return null;
    }
}

async function extractRating(page, log) {
    try {
        const el = await page.$('div[role="img"][aria-label*="star" i], span[role="img"][aria-label*="star" i]');
        if (el) {
            const label = await el.evaluate((node) => node.getAttribute('aria-label') || '');
            const m = label.match(/([\d.]+)/);
            if (m) return parseFloat(m[1]);
        }
        return null;
    } catch (err) {
        log.debug(`[RATING] ${err.message}`);
        return null;
    }
}

async function extractReviewCount(page, log) {
    try {
        const el = await page.$('button[aria-label*="review" i], span[aria-label*="review" i]');
        if (el) {
            const text = await el.evaluate((node) => node.getAttribute('aria-label') || node.textContent || '');
            const m = text.match(/([\d,]+)/);
            if (m) return parseInt(m[1].replace(/,/g, ''), 10);
        }
        return null;
    } catch (err) {
        log.debug(`[REVIEWS] ${err.message}`);
        return null;
    }
}

async function extractAddress(page, log) {
    try {
        const el = await page.$(
            'button[data-item-id*="address"], div[data-item-id*="address"], button[aria-label*="address" i]',
        );
        if (el) {
            const text = await el.evaluate((node) => node.textContent || node.getAttribute('aria-label') || '');
            const cleaned = text.replace(/\s+/g, ' ').trim();
            if (cleaned.length > 3) return cleaned;
        }
        return null;
    } catch (err) {
        log.debug(`[ADDRESS] ${err.message}`);
        return null;
    }
}

async function extractCategory(page, log) {
    try {
        const el = await page.$('button[jsaction*="category"], span[jstcache] button, div.fontBodyMedium span');
        if (el) {
            const text = await el.evaluate((node) => node.textContent || '');
            const cleaned = text.replace(/\s+/g, ' ').trim();
            if (cleaned && cleaned.length > 1 && cleaned.length < 80) return cleaned;
        }
        return null;
    } catch (err) {
        log.debug(`[CATEGORY] ${err.message}`);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// handleCookieConsent
// ─────────────────────────────────────────────────────────────────────────────
async function handleCookieConsent(page, log) {
    try {
        const CONSENT_SELECTORS = [
            'button[jsname="higCR"]',
            'button:has-text("Accept all")',
            'button:has-text("I agree")',
            'button:has-text("Accept")',
            'button[aria-label*="Accept" i]',
            'form[action*="consent"] button',
        ];

        for (const sel of CONSENT_SELECTORS) {
            try {
                const btn = await page.$(sel);
                if (btn && (await btn.isVisible())) {
                    await btn.click();
                    log.info(`[CONSENT] Dismissed via: ${sel}`);
                    await sleep(600);
                    return;
                }
            } catch {
                // try next selector
            }
        }
    } catch {
        log.debug('[CONSENT] No consent dialog found or already dismissed.');
    }
}

function isValidUrl(str) {
    if (!str) return false;
    if (typeof URL.canParse === 'function') return URL.canParse(str);
    try {
        return Boolean(new URL(str));
    } catch {
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// pushBusinessData — Production PPE version
// Normalises data, pushes to dataset, charges the PPE event, and gracefully
// aborts the crawler if the user's spending limit is reached.
// ─────────────────────────────────────────────────────────────────────────────
async function pushBusinessData(businessData, searchTerm, log, crawler) {
    // ── Normalise fields ──────────────────────────────────────────────────────
    let phone = businessData.phone ? businessData.phone.replace(/\s+/g, ' ').trim() : null;
    if (phone && phone.replace(/\D/g, '').length < 7) phone = null;

    let website = businessData.website ? businessData.website.trim() : null;
    if (website && !isValidUrl(website)) website = null;

    let rating = businessData.rating != null ? parseFloat(businessData.rating) : null;
    if (rating != null && (Number.isNaN(rating) || rating < 0 || rating > 5)) rating = null;

    let reviewCount = businessData.reviewCount != null ? parseInt(businessData.reviewCount, 10) : null;
    if (reviewCount != null && (Number.isNaN(reviewCount) || reviewCount < 0)) reviewCount = null;

    const cleanData = {
        businessName: businessData.name ? businessData.name.replace(/\s+/g, ' ').trim() : null,
        address: businessData.address ? businessData.address.replace(/\s+/g, ' ').trim() : null,
        website,
        phone,
        rating,
        reviewCount,
        category: businessData.category ? businessData.category.replace(/\s+/g, ' ').trim() : null,
        googleMapsUrl: businessData.detailUrl || null,
        searchTerm,
        scrapedAt: new Date().toISOString(),
    };

    // ── Push data to dataset ──────────────────────────────────────────────────
    await Actor.pushData(cleanData);
    log.debug(`[PUSH] "${cleanData.businessName}" — phone: ${phone ?? 'null'}, website: ${website ?? 'null'}`);

    // ── PPE: Charge for this lead ─────────────────────────────────────────────
    try {
        const chargeResult = await Actor.charge({ eventName: PPE_EVENT_NAME });

        // Update charge counter for status messages
        const state = await Actor.getValue('CRAWLER_STATE');
        state.totalCharged = (state.totalCharged || 0) + 1;
        const totalLeads = state.totalCharged;
        const estimatedCost = (totalLeads * PPE_PRICE_PER_LEAD).toFixed(2);

        // Live status message in Apify Console
        await Actor.setStatusMessage(
            `Scraping in progress — ${totalLeads} leads extracted (~$${estimatedCost} charged)`,
        );

        // Check if user's spending limit has been reached
        if (chargeResult?.eventChargeLimitReached) {
            log.warning(
                `[PPE] User spending limit reached after ${totalLeads} leads (~$${estimatedCost}). Aborting gracefully.`,
            );
            state.chargeAborted = true;
            await Actor.setValue('CRAWLER_STATE', state);

            // Gracefully stop the Playwright crawler (Crawlee best practice)
            if (crawler?.autoscaledPool) {
                await crawler.autoscaledPool.abort();
            }
        } else {
            await Actor.setValue('CRAWLER_STATE', state);
        }
    } catch (err) {
        // Charge failures should not crash the Actor — log and continue
        log.warning(`[PPE] Failed to charge '${PPE_EVENT_NAME}': ${err.message}`);
    }
}
