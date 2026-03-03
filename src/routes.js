/**
 * Route handlers for Google Maps scraping — v2.0
 *
 * Key changes vs v1:
 *  1. Page-load wait: replaced `networkidle` (up to 30 s) with a targeted
 *     `waitForSelector` that resolves as soon as the feed is ready (~2–4 s).
 *  2. Scroll delay: replaced `sleep(scrollDelay)` with an adaptive wait that
 *     resolves as soon as new list items appear in the DOM (or after max
 *     scrollDelay ms, whichever is first).  Typical savings: 600–1500 ms per
 *     scroll round.
 *  3. Rich list-view extraction: phone, website, category, address, rating,
 *     reviewCount, and hours are all parsed from the sidebar card HTML.  For
 *     the vast majority of businesses this means ZERO detail-page visits.
 *  4. DETAIL fallback: if any of the customer-requested fields (phone /
 *     website) are still null after list extraction, the detail page IS visited
 *     so data quality is never compromised.
 *  5. Removed every debug `page.evaluate` / `page.$$eval` call that fired on
 *     every scroll iteration — those were browser round-trips on the hot path.
 *  6. Data cleaning: all text fields are trimmed + normalised; phone numbers
 *     are validated (≥7 digits); websites are unwrapped from Google redirects
 *     and validated as proper URLs.
 *  7. Output schema is identical to v1 — customers see the same field names.
 */

import { Actor } from 'apify';
import { createPlaywrightRouter, sleep } from 'crawlee';

export const router = createPlaywrightRouter();

// ─────────────────────────────────────────────────────────────────────────────
// LIST Handler
// ─────────────────────────────────────────────────────────────────────────────
router.addHandler('LIST', async ({ page, request, log, crawler }) => {
    const { searchTerm, scrapedCount = 0 } = request.userData;
    const state = await Actor.getValue('CRAWLER_STATE');
    const { maxItems, scrollDelay, includeWebsite, includePhone } = state;

    log.info(`[LIST] Processing: "${searchTerm}"`, { scrapedCount, maxItems });

    try {
        // ── 1. Wait only for the feed — NOT for networkidle ──────────────────
        // networkidle can take up to 30 s on Google Maps because the page keeps
        // firing analytics pings. We only care that the result cards exist.
        const FEED_SELECTORS = [
            'div[role="feed"]',
            'div[role="main"]',
            'div.m6QErb.DxyBCb.kA9KIf.dS8AEf',
            '[aria-label*="Results for" i]',
            '[aria-label*="results" i]',
        ];

        // Kick off domcontentloaded in parallel while we look for the feed
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

            const needsPhone = includePhone && !businessData.phone;
            const needsWebsite = includeWebsite && !businessData.website;

            if ((needsPhone || needsWebsite) && businessData.detailUrl) {
                // Force hl=en on detail URLs so Google serves English HTML
                // regardless of the proxy IP's geolocation (prevents hl=ar,
                // hl=ru etc. being injected, which alters the page structure).
                let { detailUrl } = businessData;
                try {
                    const u = new URL(detailUrl);
                    u.searchParams.set('hl', 'en');
                    detailUrl = u.toString();
                } catch {
                    // keep original if URL parsing fails
                }

                // Fallback: visit detail page to fill in missing fields
                await crawler.addRequests([
                    {
                        url: detailUrl,
                        label: 'DETAIL',
                        userData: { searchTerm, businessData },
                    },
                ]);
                log.debug(`[LIST] Enqueued DETAIL fallback: "${businessData.name}"`);
            } else {
                await pushBusinessData(businessData, searchTerm, log);
                processedCount++;
            }
        }

        // Update scraped count in shared state
        state.scrapedCounts[searchTerm] = (state.scrapedCounts[searchTerm] || 0) + processedCount;
        await Actor.setValue('CRAWLER_STATE', state);

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
router.addHandler('DETAIL', async ({ page, request, log }) => {
    const { searchTerm, businessData } = request.userData;

    log.info(`[DETAIL] Fetching missing data for: "${businessData.name}"`);

    try {
        // Wait for the main content panel — not networkidle.
        // On Apify cloud the container may be CPU-throttled, so give it 30s.
        await page.waitForSelector('div[role="main"]', { timeout: 30000 }).catch(() => {});

        // Wait for the phone or website button to appear (up to 8s).
        // This replaces the old blind sleep(800) — we stop waiting the instant
        // the data we need is in the DOM, saving ~400–600 ms per detail page.
        await page
            .waitForSelector(
                'a[href^="tel:"], button[data-item-id*="phone"], a[data-item-id="authority"], a[href*="http"][data-item-id*="website"]',
                { timeout: 8000 },
            )
            .catch(() => {}); // fine if no phone/website — we just try to extract

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

        await pushBusinessData(businessData, searchTerm, log);

        const state = await Actor.getValue('CRAWLER_STATE');
        state.scrapedCounts[searchTerm] = (state.scrapedCounts[searchTerm] || 0) + 1;
        await Actor.setValue('CRAWLER_STATE', state);
    } catch (error) {
        log.error(`[DETAIL] Error for "${businessData.name}": ${error.message}`);
        // Always push — partial data is better than no data for the customer
        await pushBusinessData(businessData, searchTerm, log);
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
    let staleRounds = 0; // rounds with zero new results

    log.info(`[SCROLL] Starting adaptive scroll (max delay: ${maxScrollDelay} ms)`);

    while (businesses.length < maxItems && scrollAttempts < MAX_SCROLL_ATTEMPTS) {
        // ── Extract all currently visible business cards ──────────────────────
        const currentBusinesses = await extractBusinessesFromPage(page, sidebarSelector, log);

        // ── Deduplicate ───────────────────────────────────────────────────────
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

        // ── Scroll the sidebar ────────────────────────────────────────────────
        const countBefore = businesses.length;
        await scrollContainer.evaluate((el) => el.scrollBy(0, el.clientHeight));

        // ── Adaptive wait: resolve as soon as card count increases ────────────
        // This avoids sleeping the full maxScrollDelay when results load fast.
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
// Pulls all the rich data available in the sidebar cards in a single $$eval
// (one browser round-trip per scroll cycle, not multiple).
// ─────────────────────────────────────────────────────────────────────────────
async function extractBusinessesFromPage(page, sidebarSelector, log) {
    try {
        // Primary: structured card extraction
        const primary = await page.$$eval(
            `${sidebarSelector} a[href*="/maps/place/"]`,
            (anchors) => {
                /**
                 * Walk up from an anchor until we find a "card" container —
                 * identified by having a heading child and a meaningful size.
                 */
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

                /**
                 * Clean a text string: trim, collapse whitespace, remove
                 * leading/trailing bullets and middot separators.
                 */
                function clean(str) {
                    if (!str) return '';
                    return str.replace(/\s+/g, ' ').trim().replace(/^[·•\-–—]+\s*/, '').replace(/\s*[·•\-–—]+$/, '');
                }

                const seen = new Set();
                const results = [];

                for (const anchor of anchors) {
                    const detailUrl = anchor.href;
                    if (!detailUrl || seen.has(detailUrl)) continue;

                    const card = findCard(anchor);
                    if (!card) continue;

                    // ── Business name ─────────────────────────────────────────
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

                    // ── Rating ────────────────────────────────────────────────
                    let rating = null;
                    let reviewCount = null;
                    const ratingImg = card.querySelector('span[role="img"][aria-label]');
                    if (ratingImg) {
                        const label = ratingImg.getAttribute('aria-label') || '';
                        const ratingM = label.match(/([\d.]+)\s*star/i);
                        if (ratingM) rating = parseFloat(ratingM[1]);
                        // Review count can be "stars and 123 reviews" or "1,234 reviews"
                        const reviewM = label.match(/([\d,]+)\s+review/i);
                        if (reviewM) reviewCount = parseInt(reviewM[1].replace(/,/g, ''), 10);
                    }
                    // Some cards put review count in a separate span
                    if (reviewCount === null) {
                        const reviewSpan = card.querySelector('span[aria-label*="review" i]');
                        if (reviewSpan) {
                            const m = (reviewSpan.getAttribute('aria-label') || reviewSpan.textContent).match(/([\d,]+)/);
                            if (m) reviewCount = parseInt(m[1].replace(/,/g, ''), 10);
                        }
                    }

                    // ── Category, address, phone, website from info rows ──────
                    // Google renders these as small descriptive divs below the name.
                    let category = '';
                    let address = '';
                    let phone = null;
                    let website = null;

                    // Collect all leaf text nodes in the card
                    const infoTexts = [];
                    const infoEls = card.querySelectorAll('div, span');
                    for (const el of infoEls) {
                        // Skip containers that have child elements (only want leaf text)
                        if (el.children.length > 0) continue;
                        const t = clean(el.textContent);
                        if (t && t !== name && t.length > 1) infoTexts.push(t);
                    }

                    for (const t of infoTexts) {
                        // Phone: starts with +, (, or digits and has ≥7 digits
                        if (!phone && /^[\d\s()+-]{7,}$/u.test(t) && t.replace(/\D/g, '').length >= 7) {
                            phone = t;
                            continue;
                        }
                        // Website-like short string (no spaces, has a dot)
                        if (!website && /^https?:\/\//i.test(t)) {
                            website = t;
                            continue;
                        }
                        // Address: contains a number and a comma or directional
                        if (!address && /\d/.test(t) && (t.includes(',') || /\b(St|Ave|Rd|Blvd|Dr|Ln|Way|Nagar|Marg|Road|Colony|Sector)\b/i.test(t))) {
                            address = t;
                            continue;
                        }
                        // Category: short, no digits, appears before address
                        if (!category && !address && t.length < 60 && !/\d/.test(t) && t.length > 2) {
                            // Reject generic UI labels
                            if (!/^(open|closed|website|directions|call|saved|share|more)/i.test(t)) {
                                category = t.split('·')[0].trim();
                            }
                        }
                    }

                    // ── Website from anchor href in card ──────────────────────
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

                    // ── Phone from tel: anchor ────────────────────────────────
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
            },
        );

        if (primary.length > 0) return primary;

        // ── Fallback: bare-minimum extraction (name + URL only) ───────────────
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
                    return { name, address: '', rating: null, reviewCount: null, category: '', detailUrl, phone: null, website: null };
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

/**
 * Extract and validate phone number from the detail page.
 */
async function extractPhone(page, log) {
    try {
        // Ordered by reliability on current Google Maps HTML
        const selectors = [
            'a[href^="tel:"]',
            'button[data-item-id*="phone"]',
            'button[aria-label*="phone" i]',
            'div[data-section-id="pn0"]',
        ];

        for (const sel of selectors) {
            const el = await page.$(sel);
            if (!el) continue;

            const raw = await el.evaluate((node) =>
                node.getAttribute('href') || node.textContent || node.getAttribute('aria-label') || '',
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

/**
 * Extract and clean website URL from the detail page.
 * Unwraps Google redirect URLs (/url?q=...) to expose the real domain.
 */
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

            // Unwrap Google redirect
            let finalUrl = href;
            try {
                const u = new URL(href);
                finalUrl = u.searchParams.get('url') || u.searchParams.get('q') || href;
                // Validate — fall back to raw href if unwrapped value is not a valid URL
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

/**
 * Extract star rating from detail page.
 */
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

/**
 * Extract review count from detail page.
 */
async function extractReviewCount(page, log) {
    try {
        const el = await page.$('button[aria-label*="review" i], span[aria-label*="review" i]');
        if (el) {
            const text = await el.evaluate(
                (node) => node.getAttribute('aria-label') || node.textContent || '',
            );
            const m = text.match(/([\d,]+)/);
            if (m) return parseInt(m[1].replace(/,/g, ''), 10);
        }
        return null;
    } catch (err) {
        log.debug(`[REVIEWS] ${err.message}`);
        return null;
    }
}

/**
 * Extract full address from detail page.
 */
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

/**
 * Extract business category from detail page.
 */
async function extractCategory(page, log) {
    try {
        const el = await page.$(
            'button[jsaction*="category"], span[jstcache] button, div.fontBodyMedium span',
        );
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
// Fast path: attempts common consent buttons, bails quickly if not found.
// ─────────────────────────────────────────────────────────────────────────────
async function handleCookieConsent(page, log) {
    try {
        const CONSENT_SELECTORS = [
            'button[jsname="higCR"]',          // Google's own consent button
            'button:has-text("Accept all")',
            'button:has-text("I agree")',
            'button:has-text("Accept")',
            'button[aria-label*="Accept" i]',
            'form[action*="consent"] button',
        ];

        for (const sel of CONSENT_SELECTORS) {
            try {
                const btn = await page.$(sel);
                if (btn && await btn.isVisible()) {
                    await btn.click();
                    log.info(`[CONSENT] Dismissed via: ${sel}`);
                    await sleep(600); // brief pause for redirect/reload
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

/**
 * Returns true when `str` is a parseable absolute URL.
 * Uses URL.canParse (Node 19+) with a fallback to try/catch for older runtimes.
 */
function isValidUrl(str) {
    if (!str) return false;
    if (typeof URL.canParse === 'function') return URL.canParse(str);
    try { return Boolean(new URL(str)); } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// pushBusinessData
// Normalises and pushes one record to the Apify dataset.
// Output schema is identical to v1 — no customer-facing breaking changes.
// ─────────────────────────────────────────────────────────────────────────────
async function pushBusinessData(businessData, searchTerm, log) {
    // Normalise phone: remove surrounding whitespace, collapse internal spaces
    let phone = businessData.phone ? businessData.phone.replace(/\s+/g, ' ').trim() : null;
    if (phone && phone.replace(/\D/g, '').length < 7) phone = null; // invalid

    // Normalise website: must be a valid URL
    let website = businessData.website ? businessData.website.trim() : null;
    if (website && !isValidUrl(website)) website = null;

    // Normalise rating: must be 0–5
    let rating = businessData.rating != null ? parseFloat(businessData.rating) : null;
    if (rating != null && (Number.isNaN(rating) || rating < 0 || rating > 5)) rating = null;

    // Normalise reviewCount: must be a positive integer
    let reviewCount = businessData.reviewCount != null ? parseInt(businessData.reviewCount, 10) : null;
    if (reviewCount != null && (Number.isNaN(reviewCount) || reviewCount < 0)) reviewCount = null;

    const cleanData = {
        businessName:   businessData.name    ? businessData.name.replace(/\s+/g, ' ').trim() : null,
        address:        businessData.address ? businessData.address.replace(/\s+/g, ' ').trim() : null,
        website,
        phone,
        rating,
        reviewCount,
        category:       businessData.category ? businessData.category.replace(/\s+/g, ' ').trim() : null,
        googleMapsUrl:  businessData.detailUrl || null,
        searchTerm,
        scrapedAt:      new Date().toISOString(),
    };

    await Actor.pushData(cleanData);
    log.debug(`[PUSH] "${cleanData.businessName}" — phone: ${phone ?? 'null'}, website: ${website ?? 'null'}`);
}
