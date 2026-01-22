# Quick Start Guide - Local Business Lead Miner

## 🚀 Get Started in 5 Minutes

### Prerequisites

- Node.js 18+ installed
- Apify account (free tier works)
- Apify API token

### Step 1: Clone & Install

```bash
cd /Users/anujupadhyay/Developer/Apify_Actors/gmaps-leads-scraper
npm install
```

### Step 2: Configure Environment

Create `.env` file:

```bash
cp .env.example .env
# Edit .env with your Apify token
```

### Step 3: Run Locally

```bash
apify run
```

Or directly:

```bash
npm start
```

### Step 4: Check Results

```bash
# View scraped data
cat storage/datasets/default/*.json | jq

# Or open in browser
open storage/datasets/default/000000001.json
```

## 📝 Example Input

Edit `storage/key_value_stores/default/INPUT.json`:

```json
{
    "searchTerms": ["Pizza restaurants in Boston", "Hair salons in Miami"],
    "maxItems": 20,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    },
    "includeWebsite": true,
    "includePhone": true,
    "scrollDelay": 2000
}
```

## 📤 Example Output

```json
{
    "businessName": "Best Pizza Place",
    "address": "123 Main St, Boston, MA 02108",
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

## 🚢 Deploy to Apify

```bash
# Login
apify login

# Deploy
apify push
```

## 🎯 Common Commands

```bash
# Run with custom input
apify run -p

# View logs
tail -f apify_storage/logs/current.log

# Clean storage
rm -rf apify_storage/

# Format code
npm run format

# Lint code
npm run lint:fix
```

## ⚡ Pro Tips

1. **Start Small**: Test with `maxItems: 10` first
2. **Use RESIDENTIAL Proxies**: Better success rate
3. **Increase scrollDelay**: If getting blocked (try 3000ms)
4. **Reduce Concurrency**: In main.js set `maxConcurrency: 3`
5. **Monitor Logs**: Watch for errors and adjust

## 🆘 Quick Troubleshooting

### No results found

```bash
# Increase timeout
# In main.js: navigationTimeoutSecs: 90
```

### Proxy errors

```bash
# Check your Apify proxy limits
# Try datacenter proxies for testing
```

### Missing data

```bash
# Enable detail page visits
"includeWebsite": true,
"includePhone": true
```

## 📚 Learn More

- Full README: [README.md](./README.md)
- Technical Docs: [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md)
- Code: [src/main.js](./src/main.js) & [src/routes.js](./src/routes.js)

**Happy Scraping! 🎉**
