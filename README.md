# 🗺️ Google Maps Scraper: B2B Leads & Emails

> **The last Google Maps scraper you'll ever need.** Extract verified business leads — names, phones, websites, ratings, reviews, addresses — at scale with zero configuration.

## TL;DR

This actor extracts **complete business contact data** from Google Maps. Just type what you'd search on Google Maps — the scraper fetches exactly what you'd see. Single queries can return **500+ verified leads** with phone numbers, websites, and full addresses.

Quick start — paste this and hit Run:

```json
{
    "searchTerms": ["Plumbers in New York"],
    "maxItems": 100
}
```

That's it. You'll get 100 plumber businesses with names, phone numbers, websites, ratings, review counts, addresses, and direct Google Maps links — all cleaned and ready for your CRM.

---

## ⚠️ IMPORTANT NOTE ABOUT PRICING

**Please familiarize yourself with the pricing before using this actor.**

**Pricing: $51 per 1,000 leads ($0.051 per lead)**

- Each extracted business lead costs **$0.051**
- The actor charges per result — you only pay for data you actually receive
- **Set a spending limit** in the Apify Console to control your maximum cost per run
- The actor **gracefully stops** when your limit is reached and delivers all data collected up to that point
- Live cost tracking is displayed in the Console as the scraper runs

---

## 🚀 How It Works

This actor is built with **Playwright** and **Crawlee** for maximum reliability. It opens real browser sessions, scrolls through Google Maps results, and extracts everything visible on each business card — no API keys, no rate limits.

1. **You provide search terms** — the same queries you'd type into Google Maps
2. **The actor scrolls and extracts** — adaptive scrolling loads all results automatically
3. **Rich data from list view** — phone, website, category, address, and ratings are extracted directly from the sidebar cards in a single pass
4. **Detail page fallback** — if phone or website is missing from the card, the actor visits the detail page to fill in the gaps, ensuring **100% data completeness**
5. **Clean, structured output** — all data is normalized, validated, and ready for export

> **Pro tip**: Set `includeWebsite: false` and `includePhone: false` if you only need basic info — the scraper will skip detail-page visits entirely, making runs **2–3x faster**.

---

## 📋 Examples

### Scrape local businesses in any city

```json
{
    "searchTerms": ["Dentists in London"],
    "maxItems": 200
}
```

### Multiple search terms in one run

```json
{
    "searchTerms": ["Coffee shops in San Francisco", "Pizza restaurants in Boston", "Hair salons in Miami"],
    "maxItems": 100
}
```

### Fast mode — names, ratings, and addresses only

```json
{
    "searchTerms": ["Hotels in Dubai"],
    "maxItems": 500,
    "includeWebsite": false,
    "includePhone": false
}
```

### Full contact extraction with anti-blocking tuning

```json
{
    "searchTerms": ["Real estate agents in Los Angeles"],
    "maxItems": 300,
    "includeWebsite": true,
    "includePhone": true,
    "scrollDelay": 2000,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    }
}
```

---

## 🍜 Output Example

Every lead comes back clean, validated, and ready for your CRM or spreadsheet:

```json
{
    "businessName": "Joe's Plumbing & Heating",
    "address": "742 Evergreen Terrace, Springfield, IL 62704",
    "website": "https://joesplumbing.com",
    "phone": "+1 (217) 555-0142",
    "rating": 4.8,
    "reviewCount": 312,
    "category": "Plumber",
    "googleMapsUrl": "https://www.google.com/maps/place/Joe's+Plumbing...",
    "searchTerm": "Plumbers in Springfield IL",
    "scrapedAt": "2026-03-27T10:30:00.000Z"
}
```

### Output Fields

| Field           | Type    | Description                                                |
| --------------- | ------- | ---------------------------------------------------------- |
| `businessName`  | String  | Full business name as shown on Google Maps                 |
| `address`       | String  | Complete street address                                    |
| `website`       | String  | Business website URL (cleaned, Google redirects unwrapped) |
| `phone`         | String  | Phone number (validated — minimum 7 digits)                |
| `rating`        | Float   | Google Maps star rating (0.0–5.0)                          |
| `reviewCount`   | Integer | Total number of Google reviews                             |
| `category`      | String  | Business category (e.g., "Plumber", "Restaurant")          |
| `googleMapsUrl` | String  | Direct link to the Google Maps listing                     |
| `searchTerm`    | String  | The search query that produced this result                 |
| `scrapedAt`     | String  | ISO 8601 timestamp of when the data was collected          |

### Export Formats

Download your leads in any format:
**JSON** · **CSV** · **Excel (.xlsx)** · **HTML** · **RSS**

---

## 🍚 Input Parameters

| Field                | Type            | Required | Default     | Description                                                                                                                                   |
| -------------------- | --------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `searchTerms`        | Array\<String\> | **Yes**  | -           | Search queries — same as what you'd type on Google Maps (e.g., "Plumbers in New York")                                                        |
| `maxItems`           | Integer         | **Yes**  | `10`        | Maximum leads to extract per search term (1–500)                                                                                              |
| `proxyConfiguration` | Object          | **Yes**  | Residential | Apify Proxy settings — **residential proxies required** for reliable scraping                                                                 |
| `includeWebsite`     | Boolean         | No       | `false`     | Extract website URLs. Enables detail-page visits when not available in list view                                                              |
| `includePhone`       | Boolean         | No       | `false`     | Extract phone numbers. Enables detail-page visits when not available in list view                                                             |
| `scrollDelay`        | Integer         | No       | `1200`      | Max ms between scrolls. Actor uses **adaptive waiting** — moves on instantly when new results appear. Increase to 2000–4000 if you hit blocks |

> **💡 Tip**: Start with `maxItems: 10` for a quick test, then scale up. The actor shows live progress in the Console so you always know what's happening.

---

## 💰 Pricing Breakdown

| Leads | Cost     | Use Case                |
| ----- | -------- | ----------------------- |
| 10    | ~$0.51   | Quick test              |
| 100   | ~$5.10   | Small local campaign    |
| 500   | ~$25.50  | City-level prospecting  |
| 1,000 | ~$51.00  | Multi-city lead gen     |
| 5,000 | ~$255.00 | Regional sales pipeline |

**Spending limits**: Set a maximum cost per run in the Apify Console. The actor gracefully stops when the limit is reached — you **never** get a surprise bill.

**Live tracking**: The Console shows `"Scraping in progress — 45 leads extracted (~$2.30 charged)"` in real time so you always know exactly where you stand.

---

## 🛡️ Anti-Blocking Features

This isn't a toy scraper. It's built for production:

- **Session pool** — up to 50 concurrent browser sessions with cookie persistence
- **Residential proxy rotation** — each session uses a different IP from Apify's residential network
- **Browser fingerprinting** — unique fingerprints per session (Chrome on Windows/macOS/Linux)
- **Resource blocking** — images, fonts, analytics, and tracking scripts are blocked, cutting bandwidth by ~60%
- **Adaptive scrolling** — waits for actual DOM changes, not fixed timers
- **Stealth flags** — `AutomationControlled` disabled, realistic headers, human-like behavior

---

## 👹 Competitors

Try it and you'll see the difference. All comparisons use identical inputs and residential proxies.

| Feature                    | 🗺️ **This Actor** | Outscraper   | Bright Data       | PhantomBuster     |
| -------------------------- | ----------------- | ------------ | ----------------- | ----------------- |
| Price per 1,000 leads      | **$51**           | $200+        | $500+/mo          | $159+/mo          |
| Phone numbers included     | ✅                | ✅           | ✅                | ❌                |
| Website URLs included      | ✅                | ✅           | ✅                | ❌                |
| Ratings & reviews          | ✅                | ✅           | ✅                | ❌                |
| Full addresses             | ✅                | ✅           | ✅                | ✅                |
| Google Maps direct links   | ✅                | ✅           | ❌                | ❌                |
| Anti-blocking built-in     | ✅                | ✅           | ✅                | ❌                |
| Spending limit control     | ✅                | ❌           | ❌                | ❌                |
| Live cost tracking         | ✅                | ❌           | ❌                | ❌                |
| Data cleaning & validation | ✅                | Partial      | ❌                | ❌                |
| Pay per result             | ✅                | ❌ (credits) | ❌ (subscription) | ❌ (subscription) |
| No API key required        | ✅                | ❌           | ❌                | ❌                |

---

## 🎎 Who Needs This?

- **Sales teams** building targeted B2B contact lists — get phone numbers and websites for any local business category in any city
- **Marketing agencies** running local SEO or Google Ads campaigns — analyze competitor ratings, reviews, and market density
- **Startup founders** doing market research — understand local competitive landscapes before launching
- **Real estate professionals** finding service providers, contractors, and businesses in new markets
- **Franchise operators** scouting locations by analyzing existing businesses in target areas
- **Data analysts** processing large-scale geospatial business intelligence

---

## 📊 Use Cases

| Use Case                 | Search Term Example            | What You Get                                 |
| ------------------------ | ------------------------------ | -------------------------------------------- |
| B2B Sales Prospecting    | `"IT companies in Austin"`     | Phone, website, email pages for outreach     |
| Local SEO Analysis       | `"Dentists in Chicago"`        | Ratings, review counts, competitor density   |
| Market Research          | `"Coworking spaces in Berlin"` | Addresses, categories, Google Maps links     |
| Directory Building       | `"Restaurants in Manhattan"`   | Complete business profiles for listing sites |
| Competitive Intelligence | `"Car dealerships in Dallas"`  | Ratings, reviews, website comparison         |

---

## ⚙️ Advanced Configuration

### Custom Proxy Setup

```json
{
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"],
        "apifyProxyCountry": "US"
    }
}
```

### Speed vs. Reliability

| Scenario           | `scrollDelay` | `maxConcurrency`\* | Notes                            |
| ------------------ | ------------- | ------------------ | -------------------------------- |
| Fast extraction    | `800`         | `5`                | Default — great for most queries |
| Blocked frequently | `2500`        | `3`                | Slower but more reliable         |
| High-volume batch  | `1200`        | `5`                | Balanced for 1000+ leads         |

\* `maxConcurrency` can be customized in `src/main.js` (default: 5)

---

## 🔧 Troubleshooting

| Problem                                 | Solution                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **"Could not find results sidebar"**    | Google Maps layout may have changed, or proxy is misconfigured. Check the debug screenshot in Key-Value Store. |
| **Getting fewer results than expected** | The search term may be too specific, or Google doesn't have more listings. Try a broader query.                |
| **Requests timing out**                 | Increase `scrollDelay` to 2500+. Residential proxies on slow containers sometimes need more headroom.          |
| **Missing phone/website on some leads** | Some businesses simply don't list this info on Google Maps. The actor always delivers what's available.        |
| **Run stopped before `maxItems`**       | You likely hit your spending limit. Increase the "Max total charge (USD)" in the Console and re-run.           |

---

## 📚 Documentation

- **[Quick Start Guide](QUICKSTART.md)** — Get started in 5 minutes
- **[Technical Documentation](TECHNICAL_DOCS.md)** — Deep dive into architecture
- **[Cost & Resource Guide](COST_GUIDE.md)** — Understand pricing and platform costs
- **[Performance Guide](PERFORMANCE_GUIDE.md)** — Optimize speed and reliability

---

## 📝 Changelog

### v3.0.0 (2026-03-27)

- 💰 **Pay Per Event pricing** — $0.051 per lead ($51 per 1,000 leads)
- 📊 Live status messages in Apify Console showing leads extracted and cost
- 🛑 Graceful abort when user spending limit is reached
- ⬆️ Upgraded Apify SDK to v3.7.0 for full PPE support
- 🔒 Memory limits enforced (1–8 GB) for predictable platform costs

### v2.0.0 (2026-02-01)

- ⚡ Performance rewrite — adaptive scroll, rich list-view extraction
- 🚫 Eliminated redundant networkidle waits (saved up to 30s per page)
- 📱 Smart DETAIL fallback — only visits detail pages when data is genuinely missing

### v1.0.0 (2026-01-20)

- ✨ Initial release with multi-layer anti-blocking, auto-scroll pagination, and clean JSON output

---

**Made with ❤️ by [@anuj123upadhyay](https://github.com/anuj123upadhyay)**

_Star ⭐ this repo if you find it useful!_
