# 🗺️ Google Maps Business Scraper (Lead Miner)

[![Apify Actor](https://img.shields.io/badge/Apify-Actor-orange)](https://apify.com)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![Maintained](https://img.shields.io/badge/Maintained-Yes-green.svg)](https://github.com/anuj123upadhyay/Gmap_Leads_Scraper)

> **Extract local business data from Google Maps at scale with advanced anti-blocking protection**

This Apify Actor efficiently scrapes business information from Google Maps, including names, addresses, phone numbers, websites, ratings, and reviews. Perfect for lead generation, market research, and competitive analysis.

Built with [Apify SDK v3](https://docs.apify.com/sdk/js), [Crawlee](https://crawlee.dev), and [Playwright](https://playwright.dev) for maximum reliability and performance.

## ✨ What Can This Actor Do?

- 🔍 **Search Multiple Locations**: Process multiple search queries simultaneously
- 📊 **Extract Complete Data**: Business names, addresses, phones, websites, ratings, reviews
- 🤖 **Auto-Scroll Pagination**: Automatically loads all results from Google Maps sidebar
- 🛡️ **Advanced Anti-Blocking**: Session management, proxy rotation, browser fingerprinting
- 📱 **Detail Page Scraping**: Intelligently navigates to detail pages for missing information
- 💾 **Clean JSON Export**: Structured data ready for CRM, spreadsheets, or databases
- ⚡ **High Performance**: Scrape hundreds of businesses in minutes with concurrent processing

## 📊 Use Cases

- **Lead Generation**: Build targeted business contact lists for B2B sales
- **Market Research**: Analyze competitor locations and customer sentiment
- **Local SEO**: Monitor business listings and ratings in specific areas
- **Directory Building**: Create comprehensive business directories
- **Competitive Analysis**: Track competitor reviews and ratings over time

## 🚀 Quick Start

### Run on Apify Platform (Recommended)

1. **[Open the Actor](https://console.apify.com/actors)** (or deploy this repo)
2. **Configure Input**:
   - Add search terms (e.g., "Coffee shops in San Francisco")
   - Set maximum results per search
   - Select proxy configuration (your Apify Proxy)
3. **Start the Run** - Results appear in the Dataset
4. **Export Data** - Download as JSON, CSV, Excel, or HTML

### Run Locally

```bash
# Clone the repository
git clone https://github.com/anuj123upadhyay/Gmap_Leads_Scraper.git
cd Gmap_Leads_Scraper

# Install dependencies
npm install

# Set up environment (copy and edit .env)
cp .env.example .env
# Add your APIFY_TOKEN to .env

# Run the scraper
npm start
```

## 📋 Input Configuration

The Actor accepts the following input parameters:

### Example Input

```json
{
    "searchTerms": [
        "Plumbers in New York",
        "Dentists in London",
        "Coffee shops in San Francisco"
    ],
    "maxItems": 100,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    },
    "includeWebsite": true,
    "includePhone": true,
    "scrollDelay": 2000
}
```

### Input Parameters

| Field                | Type            | Required | Default | Description                                                                |
| -------------------- | --------------- | -------- | ------- | -------------------------------------------------------------------------- |
| `searchTerms`        | Array\<String\> | **Yes**  | -       | List of search queries (e.g., "Pizza restaurants in Boston")               |
| `maxItems`           | Integer         | **Yes**  | `100`   | Maximum number of businesses to scrape per search term (1-500)             |
| `proxyConfiguration` | Object          | **Yes**  | -       | Apify Proxy settings - **required** for reliable scraping                 |
| `includeWebsite`     | Boolean         | No       | `true`  | Extract website URLs (may require navigating to detail pages)              |
| `includePhone`       | Boolean         | No       | `true`  | Extract phone numbers (may require navigating to detail pages)             |
| `scrollDelay`        | Integer         | No       | `2000`  | Delay in milliseconds between scroll actions (500-5000)                    |

> **💡 Tip**: Start with `maxItems: 10` for testing, then scale up to your desired amount.

> **⚠️ Important**: Apify Proxy is **required** for reliable scraping. Without it, Google Maps will block requests after ~10-20 attempts.

## 📤 Output Data

Each scraped business includes the following fields:

```json
{
    "businessName": "Best Pizza Place",
    "address": "123 Main Street, Boston, MA 02108",
    "website": "https://bestpizza.com",
    "phone": "+1 (617) 555-0123",
    "rating": 4.7,
    "reviewCount": 450,
    "category": "Pizza restaurant",
    "googleMapsUrl": "https://www.google.com/maps/place/...",
    "searchTerm": "Pizza restaurants in Boston",
    "scrapedAt": "2026-01-20T15:30:00.000Z"
}
```

### Output Fields

| Field           | Type   | Description                                  |
| --------------- | ------ | -------------------------------------------- |
| `businessName`  | String | Name of the business                         |
| `address`       | String | Full address                                 |
| `website`       | String | Business website URL (if available)          |
| `phone`         | String | Phone number (if available)                  |
| `rating`        | Float  | Star rating (0-5)                            |
| `reviewCount`   | Int    | Total number of reviews                      |
| `category`      | String | Business category/type                       |
| `googleMapsUrl` | String | Direct link to Google Maps listing           |
| `searchTerm`    | String | The search query used to find this business  |
| `scrapedAt`     | String | ISO timestamp of when the data was collected |

### Export Options

Results can be exported in multiple formats:

- **JSON** - For API integration
- **CSV** - For spreadsheets (Excel, Google Sheets)
- **Excel** - Direct .xlsx download
- **HTML** - For viewing in browser
- **RSS** - For feed readers

## 🛡️ Anti-Blocking Features

This Actor implements multiple layers of protection against blocking:

### Session Management

- **Session Pool**: Manages up to 50 concurrent browser sessions
- **Cookie Persistence**: Maintains cookies across requests per session
- **Automatic Rotation**: Sessions rotate automatically to avoid detection

### Proxy Integration

- **Residential Proxies**: Uses Apify's residential proxy network
- **IP Rotation**: Each session uses different IP addresses
- **Geographic Distribution**: Proxies from multiple countries

### Browser Stealth

- **Fingerprint Randomization**: Unique browser fingerprints per session
- **Navigator Masking**: Removes automation detection flags
- **Human-like Behavior**: Random delays and realistic scrolling patterns

### Error Recovery

- **5 Automatic Retries**: Failed requests retry up to 5 times
- **Exponential Backoff**: Increasing delays between retries
- **Graceful Degradation**: Saves partial data if full extraction fails

## 💰 Cost Breakdown

### Typical Costs (using Apify Platform)

| Businesses | Compute Time | Proxy Requests | Total Cost\* |
| ---------- | ------------ | -------------- | ------------ |
| 100        | ~10 min      | ~200           | $0.10        |
| 500        | ~30 min      | ~800           | $0.30        |
| 1,000      | ~1 hour      | ~1,500         | $0.60        |
| 5,000      | ~5 hours     | ~7,000         | $3.00        |

\* Estimated with residential proxies. Actual costs may vary.

> **Free Tier**: Apify's free tier includes 5 hours of compute time and 5,000 proxy requests per month - enough for ~2,000 businesses!

## ⚙️ How It Works

### Step-by-Step Process

1. **URL Generation**: Creates Google Maps search URLs from your search terms
2. **Page Loading**: Opens each URL with stealth browser settings
3. **Auto-Scrolling**: Intelligently scrolls the results sidebar to load all businesses
4. **Data Extraction**: Extracts business information from each listing card
5. **Detail Navigation**: If phone/website missing, clicks into detail page
6. **Data Cleaning**: Removes Google redirects, formats phone numbers
7. **Dataset Storage**: Saves clean, structured JSON to Apify Dataset

## 🎯 Best Practices

### Search Terms

✅ **Good**: `"Coffee shops in San Francisco, CA"`  
✅ **Good**: `"Plumbers near Boston"`  
✅ **Good**: `"Italian restaurants in Manhattan"`

❌ **Avoid**: `"shops"` (too generic)  
❌ **Avoid**: `"business"` (will return mixed results)

### Performance Tips

- Start with `maxItems: 10-20` for testing
- Use **Residential proxies** for best success rate
- Increase `scrollDelay` if experiencing blocks (try 3000-4000ms)
- Run multiple smaller batches instead of one giant batch

### Cost Optimization

- Set `includeWebsite: false` and `includePhone: false` if not needed (skips detail pages)
- Use `maxItems` to limit results per search
- Batch similar searches together in one run

## 🔧 Advanced Configuration

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

### Performance Tuning

You can modify `src/main.js` to adjust:

- `maxConcurrency`: Number of parallel pages (default: 5)
- `navigationTimeoutSecs`: Page load timeout (default: 60s)
- `requestHandlerTimeoutSecs`: Handler timeout (default: 180s)

## 📚 Documentation

- **[Quick Start Guide](QUICKSTART.md)** - Get started in 5 minutes
- **[Technical Documentation](TECHNICAL_DOCS.md)** - Deep dive into implementation
- **[Build Summary](BUILD_SUMMARY.md)** - Complete build overview

## 🐛 Troubleshooting

### "Could not find results sidebar"

- Google Maps layout may have changed
- Try reducing `maxConcurrency` to 1-2
- Ensure proxy is configured correctly

### "No businesses found"

- Check if search term is too specific
- Verify Google Maps has results for that search
- Try a different location or broader search

### "Request timeout"

- Increase `navigationTimeoutSecs` in code
- Check internet connection
- Reduce concurrent requests

### "Proxy errors"

- Verify you have Apify Proxy credits
- Try datacenter proxies for testing
- Check proxy configuration in input

## 💡 Tips & Tricks

### Extracting More Data

Want to extract additional fields? Modify `src/routes.js`:

```javascript
// Add business hours
const hours = await page.$eval('[aria-label*="Hours"]', (el) => el.textContent).catch(() => null);

// Add price range
const priceRange = await page.$eval('[aria-label*="Price"]', (el) => el.textContent).catch(() => null);
```

### Scheduling Runs

Set up automated daily/weekly scrapes:

1. Go to your Actor's "Schedule" tab on Apify
2. Click "Create new schedule"
3. Set frequency (daily, weekly, monthly)
4. Configure input parameters

### Integrations

Export data directly to:

- **Google Sheets**: Use Apify's Google Sheets integration
- **Slack**: Get notifications when run completes
- **Webhooks**: Send data to your API endpoint
- **Zapier/Make**: Connect to 5,000+ apps

## 🤝 Contributing

Contributions are welcome! Feel free to:

- Report bugs via [GitHub Issues](https://github.com/anuj123upadhyay/Gmap_Leads_Scraper/issues)
- Submit pull requests
- Suggest new features
- Improve documentation

## 📄 License

ISC License - See [LICENSE](LICENSE) file for details

## 💬 Support & Community

- **Issues**: [GitHub Issues](https://github.com/anuj123upadhyay/Gmap_Leads_Scraper/issues)
- **Discussions**: [GitHub Discussions](https://github.com/anuj123upadhyay/Gmap_Leads_Scraper/discussions)
- **Apify Discord**: [Join Community](https://discord.com/invite/jyEM2PRvMU)

## 🌟 Acknowledgments

Built with:

- [Apify SDK](https://docs.apify.com/sdk/js) - Actor framework
- [Crawlee](https://crawlee.dev) - Web scraping library
- [Playwright](https://playwright.dev) - Browser automation

## 🔗 Related Actors

Looking for similar solutions?

- [Apify's Google Maps Scraper](https://apify.com/drobnikj/crawler-google-places)
- [Instagram Scraper](https://apify.com/apify/instagram-scraper)
- [Amazon Product Scraper](https://apify.com/junglee/amazon-crawler)

---

**Made with ❤️ by [@anuj123upadhyay](https://github.com/anuj123upadhyay)**

_Star ⭐ this repo if you find it useful!_

---

## 📝 Changelog

### v1.0.0 (2026-01-20)

- ✨ Initial release
- 🛡️ Multi-layer anti-blocking protection
- 🤖 Auto-scroll pagination
- 📱 Smart detail page extraction
- 📊 Clean JSON output
- 📚 Comprehensive documentation
