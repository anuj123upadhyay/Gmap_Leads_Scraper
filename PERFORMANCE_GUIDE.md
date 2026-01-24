# ⚡ Performance Optimization Guide

## 🐌 Current Performance (Before Optimization)
- **10 businesses**: ~180 seconds (3 minutes)
- **Per business**: ~18 seconds
- **Status**: TOO SLOW ❌

## 🎯 Target Performance (After Optimization)
- **10 businesses**: 30-60 seconds
- **Per business**: 3-6 seconds
- **Status**: INDUSTRY STANDARD ✅

## 🔧 Code Optimizations Applied

### 1. **Reduced Initial Page Load Delay**
   - **Before**: 3000ms (3 seconds)
   - **After**: 1500ms (1.5 seconds)
   - **Savings**: 1.5 seconds per search page
   - **File**: `src/routes.js:37`

### 2. **Reduced Cookie Consent Wait**
   - **Before**: 2000ms (2 seconds)
   - **After**: 1000ms (1 second)
   - **Savings**: 1 second per page load
   - **File**: `src/routes.js:538`

### 3. **Increased Concurrency**
   - **Before**: maxConcurrency: 5
   - **After**: maxConcurrency: 10
   - **Benefit**: 2x faster parallel processing of detail pages
   - **File**: `src/main.js:100`

### 4. **Reduced Timeouts**
   - **Navigation**: 90s → 60s
   - **Request Handler**: 180s → 120s
   - **Benefit**: Faster failure detection, less waiting
   - **File**: `src/main.js:95-98`

## 📊 Input Configuration Options

### Option A: Maximum Speed (30-40 seconds for 10 items) ⚡⚡⚡

```json
{
  "searchTerms": ["Plumbers in New York"],
  "maxItems": 10,
  "scrollDelay": 500,
  "includeWebsite": false,
  "includePhone": false,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

**Speed Breakdown:**
- Scroll delay: 500ms × 2-3 scrolls = 1-1.5s
- Page load: 1.5s
- Cookie consent: 1s
- Extraction: 2-3s
- **Total**: ~30-40 seconds for 10 businesses

**Trade-offs:**
- ❌ No phone numbers
- ❌ No websites
- ✅ Only data from list view (name, address, rating, reviews)

### Option B: Balanced Speed + Data (60-90 seconds for 10 items) ⚡⚡

```json
{
  "searchTerms": ["Plumbers in New York"],
  "maxItems": 10,
  "scrollDelay": 800,
  "includeWebsite": true,
  "includePhone": true,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

**Speed Breakdown:**
- Scroll delay: 800ms × 2-3 scrolls = 1.6-2.4s
- Page load: 1.5s
- Detail pages: 10 items × 4s each ÷ 10 concurrency = 4-5s
- **Total**: ~60-90 seconds for 10 businesses

**Trade-offs:**
- ✅ Complete data (phone + website)
- ✅ Moderate speed
- ✅ Best balance

### Option C: Safe + Complete (90-120 seconds for 10 items) ⚡

```json
{
  "searchTerms": ["Plumbers in New York"],
  "maxItems": 10,
  "scrollDelay": 1200,
  "includeWebsite": true,
  "includePhone": true,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

**Speed Breakdown:**
- Scroll delay: 1200ms × 2-3 scrolls = 2.4-3.6s
- Page load: 1.5s
- Detail pages: 10 items × 5s each ÷ 10 concurrency = 5-6s
- **Total**: ~90-120 seconds for 10 businesses

**Trade-offs:**
- ✅ Complete data
- ✅ Very safe, less likely to get blocked
- ⚠️ Slower but more reliable

## 🚀 Recommended Settings by Use Case

### Lead Generation (Need Phone + Website)
```json
{
  "scrollDelay": 800,
  "includeWebsite": true,
  "includePhone": true,
  "maxItems": 50
}
```
**Time**: ~5-7 minutes for 50 businesses

### Market Research (Just need ratings/reviews)
```json
{
  "scrollDelay": 500,
  "includeWebsite": false,
  "includePhone": false,
  "maxItems": 100
}
```
**Time**: ~3-5 minutes for 100 businesses

### Competitor Analysis (Need everything)
```json
{
  "scrollDelay": 1000,
  "includeWebsite": true,
  "includePhone": true,
  "maxItems": 20
}
```
**Time**: ~2-3 minutes for 20 businesses

## 📈 Performance Comparison

| Configuration | 10 Items | 50 Items | 100 Items |
|--------------|----------|----------|-----------|
| **Before (slow)** | 3 min | 15 min | 30 min |
| **Option A (fast)** | 30-40s | 3-4 min | 6-8 min |
| **Option B (balanced)** | 60-90s | 5-7 min | 10-15 min |
| **Option C (safe)** | 90-120s | 7-10 min | 15-20 min |

## ⚠️ Important Notes

### 1. **Proxy Speed Matters**
   - Residential proxies are slower but more reliable
   - Datacenter proxies are faster but may get blocked
   - Your current setting: RESIDENTIAL (good choice)

### 2. **Google Maps Rate Limiting**
   - Too fast = higher chance of being blocked
   - Recommended `scrollDelay`: 500-1200ms
   - Below 500ms: risky ⚠️

### 3. **Concurrency vs Blocking**
   - Higher concurrency = faster but more suspicious
   - Current setting: 10 (good balance)
   - Don't go above 15-20

### 4. **Detail Pages Are Expensive**
   - Each detail page visit adds 3-5 seconds
   - Only enable if you NEED phone/website
   - Consider scraping list data first, then details separately

## 🧪 Testing Recommendations

### Test 1: Verify Speed Improvements
```json
{
  "searchTerms": ["Pizza restaurants in New York"],
  "maxItems": 10,
  "scrollDelay": 800,
  "includeWebsite": false,
  "includePhone": false
}
```
**Expected**: 30-40 seconds ✅

### Test 2: With Detail Pages
```json
{
  "searchTerms": ["Pizza restaurants in New York"],
  "maxItems": 10,
  "scrollDelay": 800,
  "includeWebsite": true,
  "includePhone": true
}
```
**Expected**: 60-90 seconds ✅

### Test 3: Larger Scale
```json
{
  "searchTerms": ["Coffee shops in San Francisco"],
  "maxItems": 50,
  "scrollDelay": 800,
  "includeWebsite": true,
  "includePhone": true
}
```
**Expected**: 5-7 minutes ✅

## 📝 Summary of Changes

| Setting | Before | After | Improvement |
|---------|--------|-------|-------------|
| Page load delay | 3000ms | 1500ms | 50% faster |
| Cookie consent wait | 2000ms | 1000ms | 50% faster |
| Max concurrency | 5 | 10 | 2x parallel |
| Navigation timeout | 90s | 60s | 33% faster |
| Request timeout | 180s | 120s | 33% faster |

## 🎯 Next Steps

1. **Update your INPUT.json** with one of the recommended configurations above
2. **Run**: `apify run`
3. **Monitor**: Time how long 10 businesses take
4. **Adjust**: Tweak `scrollDelay` based on results:
   - If too slow: decrease to 500-700ms
   - If getting blocked: increase to 1000-1500ms
5. **Push to Apify**: `apify push` when satisfied

## 💡 Pro Tips

- **Start conservative** (scrollDelay: 1000ms), then gradually reduce
- **Monitor success rate**: If requests start failing, slow down
- **Use residential proxies** for better success rate
- **Batch your searches**: Multiple small runs vs one huge run
- **Consider time of day**: Off-peak hours may be faster

---

**Your optimized scraper should now be 3-4x faster!** 🚀
