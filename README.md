# Local Business Lead Miner

**High-performance Apify Actor for scraping local business leads from Google Maps**

Built with Apify SDK v3, Crawlee, and PlaywrightCrawler to handle dynamic content rendering with advanced anti-blocking measures.

## 🚀 Features

- **Multi-Search Support**: Process multiple search terms in a single run
- **Auto-Scroll Mechanism**: Automatically scrolls through Google Maps sidebar to load all results
- **Smart Detail Extraction**: Clicks into business detail pages when needed to extract phone/website
- **Anti-Blocking Measures**:
    - Session pooling with cookie persistence
    - Apify Proxy integration (mandatory)
    - Ghost-cursor for human-like mouse movements
    - Browser fingerprinting
    - Stealth navigation techniques
- **Robust Error Handling**: Automatic retries with exponential backoff
- **Clean JSON Output**: Structured data ready for CRM integration

## 📋 Input Schema

```json
{
    "searchTerms": ["Plumbers in New York", "Dentists in London"],
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

| Parameter            | Type          | Required | Default | Description                                             |
| -------------------- | ------------- | -------- | ------- | ------------------------------------------------------- |
| `searchTerms`        | Array[String] | ✅       | -       | Array of search queries (e.g., "Plumbers in New York")  |
| `maxItems`           | Integer       | ✅       | 100     | Maximum number of businesses to scrape per search term  |
| `proxyConfiguration` | Object        | ✅       | -       | Apify Proxy configuration (mandatory for anti-blocking) |
| `includeWebsite`     | Boolean       | ❌       | true    | Extract website URLs (may require detail page visits)   |
| `includePhone`       | Boolean       | ❌       | true    | Extract phone numbers (may require detail page visits)  |
| `scrollDelay`        | Integer       | ❌       | 2000    | Delay in milliseconds between scroll actions            |

## 📤 Output Format

Each business record contains:

```json
{
    "businessName": "ABC Plumbing Services",
    "address": "123 Main Street, New York, NY 10001",
    "website": "https://abcplumbing.com",
    "phone": "+1 (555) 123-4567",
    "rating": 4.5,
    "reviewCount": 127,
    "category": "Plumber",
    "googleMapsUrl": "https://www.google.com/maps/place/...",
    "searchTerm": "Plumbers in New York",
    "scrapedAt": "2026-01-20T10:30:00.000Z"
}
```

## 🏗️ Architecture

### Core Components

1. **main.js**: Crawler initialization and configuration
    - Manages input validation
    - Configures proxy and anti-blocking measures
    - Initializes PlaywrightCrawler with session pooling

2. **routes.js**: Request handlers for different page types
    - **LIST Handler**: Processes search results sidebar with auto-scrolling
    - **DETAIL Handler**: Extracts additional data from business detail pages

3. **INPUT_SCHEMA.json**: Apify input schema definition

### Scraping Flow

```
Search Terms → Generate Google Maps URLs → LIST Handler
                                              ↓
                                    Auto-scroll & Extract
                                              ↓
                         ┌─────────────────────────────┐
                         ↓                             ↓
              Data Complete?                    Missing Phone/Website?
                    ↓ Yes                              ↓ Yes
              Push to Dataset          Enqueue DETAIL Handler
                                              ↓
                                    Extract Missing Data
                                              ↓
                                       Push to Dataset
```

## 🛠️ Technical Implementation

### Anti-Blocking Strategies

1. **Session Management**
    - Session pool with up to 50 concurrent sessions
    - Cookie persistence across requests
    - Automatic session rotation

2. **Proxy Configuration**
    - Mandatory Apify Proxy usage
    - Residential proxy group recommended
    - Automatic IP rotation

3. **Browser Fingerprinting**
    - Randomized browser fingerprints
    - Multiple OS and device combinations
    - Chrome-based user agents

4. **Human-like Behavior**
    - Ghost-cursor for natural mouse movements
    - Random delays between actions
    - Realistic scrolling patterns

### Error Handling

- Maximum 5 retries per request
- Exponential backoff strategy
- Graceful degradation (push partial data if detail extraction fails)
- Network timeout handling (60s navigation, 180s handler)

## 🚦 Getting Started

### Local Development

```bash
# Install dependencies
npm install

# Run locally with Apify CLI
apify run

# Or run directly
npm start
```

### Deploy to Apify Platform

```bash
# Login to Apify
apify login

# Push to Apify platform
apify push
```

### Test Input Example

Create `storage/key_value_stores/default/INPUT.json`:

```json
{
    "searchTerms": ["Coffee Shops in San Francisco", "Yoga Studios in Austin"],
    "maxItems": 50,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    },
    "includeWebsite": true,
    "includePhone": true,
    "scrollDelay": 2000
}
```

## 📊 Performance Considerations

- **Concurrency**: Set to 5 concurrent requests by default (adjustable)
- **Rate Limiting**: Built-in delays and session management prevent rate limits
- **Memory**: ~2GB recommended for smooth operation
- **Execution Time**: ~5-10 minutes per 100 businesses (varies by location)

## ⚠️ Important Notes

1. **Proxy is Mandatory**: The Actor will fail without Apify Proxy configuration
2. **Google Maps ToS**: Ensure compliance with Google's Terms of Service
3. **Data Accuracy**: Some businesses may have incomplete information
4. **Rate Limits**: Residential proxies recommended for higher volumes

## 🔧 Customization

### Adjust Concurrency

In `src/main.js`, modify:

```javascript
maxConcurrency: 5,  // Increase for faster scraping
minConcurrency: 1,
```

### Change Scroll Behavior

In `src/routes.js`, adjust:

```javascript
const maxScrollAttempts = 50; // Increase to find more results
```

### Modify Selectors

If Google Maps updates their HTML structure, update selectors in `routes.js`:

```javascript
const sidebarSelector = 'div[role="feed"]'; // Main results container
```

## 📝 License

ISC

## 👨‍💻 Author

Senior Node.js Developer specializing in Web Scraping and Apify SDK

## 🐛 Troubleshooting

### "Could not find results sidebar"

- Google Maps layout may have changed
- Try reducing maxConcurrency
- Check proxy configuration

### "Request timeout"

- Increase `navigationTimeoutSecs` in main.js
- Reduce concurrent requests
- Check internet connection

### Incomplete data

- Some businesses don't list all information publicly
- Try enabling `includeWebsite` and `includePhone` to visit detail pages

## 📚 Resources

- [Apify Documentation](https://docs.apify.com)
- [Crawlee Documentation](https://crawlee.dev)
- [Playwright Documentation](https://playwright.dev)
- [Apify SDK for JavaScript documentation](https://docs.apify.com/sdk/js)
- [Join our developer community on Discord](https://discord.com/invite/jyEM2PRvMU)

---

**Ready to mine local business leads at scale! 🚀**
