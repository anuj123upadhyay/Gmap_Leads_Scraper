# 💰 Cost & Resource Guide

## Who Pays for What?

### TL;DR

- **You (Actor Developer):** Pay nothing when others use your Actor ✅
- **Users:** Pay for their own compute, proxy, and storage usage 💳
- **Deployment:** FREE to host on Apify platform ✅

---

## 🎯 Resource Ownership Model

### When You Deploy to Apify (`apify push`)

```
┌─────────────────────────────────────────────┐
│  YOUR APIFY ACCOUNT                         │
├─────────────────────────────────────────────┤
│  What You Pay:                              │
│  ✅ Actor Hosting: FREE (unlimited)         │
│  ✅ Code Storage: FREE (up to 1GB)          │
│  ✅ Public Actor: FREE                      │
│  ❌ User Runs: $0 (users pay themselves!)  │
│  ❌ Proxy Usage: $0 (users pay themselves!)│
│                                             │
│  Total Monthly Cost: $0 🎉                  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  USER'S APIFY ACCOUNT (When they run)      │
├─────────────────────────────────────────────┤
│  What They Pay:                             │
│  ✅ Compute: $0.60/hour                     │
│  ✅ Proxy (Residential): ~$3 per 1000 reqs │
│  ✅ Proxy (Datacenter): ~$0.30 per 1000    │
│  ✅ Storage: $0.05/GB (minimal)            │
│                                             │
│  For 1000 businesses: ~$3-5                │
└─────────────────────────────────────────────┘
```

---

## 🔐 How Credentials Work

### On Apify Platform (Recommended)

**User's Experience:**

```
1. User visits your Actor page
2. Clicks "Try for free" or "Run"
3. Fills input:
   - Search terms: "Plumbers in NYC"
   - Max items: 100
   - Proxy: [Dropdown shows THEIR proxy options]
     • Residential (their account)
     • Datacenter (their account)
     • None (not recommended)
4. Clicks "Start"
5. Actor runs using THEIR credentials automatically
```

**Behind the Scenes:**

```javascript
// Your code (main.js)
const proxyConfig = await Actor.createProxyConfiguration({
    ...proxyConfiguration, // ← Apify injects USER's credentials here!
});

// User never sees or needs YOUR credentials
// You never see or access THEIR credentials
// Perfect isolation! 🔒
```

**Cost Distribution:**

- Actor runs on Apify servers: **User pays compute**
- Uses Apify Proxy: **User's proxy credits deducted**
- Stores results: **User's storage quota**
- Your cost: **$0** ✅

---

### Local Development (Advanced Users)

**If User Downloads Your Code:**

```bash
# They create THEIR OWN .env file
cat > .env << EOF
APIFY_TOKEN=their_own_token_here
APIFY_PROXY_PASSWORD=their_password  # Optional, auto-fetched from token
EOF

# Run locally
npm start
```

**Cost:**

- Compute: Free (their local machine)
- Proxy: From their Apify account
- Your cost: **$0** ✅

---

## 💳 Apify Pricing Tiers (For Users)

### Free Tier (Users Get This)

```
✅ 5 hours compute per month
✅ 5,000 residential proxy requests
✅ 25,000 datacenter proxy requests
✅ 2GB storage
✅ Unlimited public Actors

Perfect for:
- Testing your Actor
- Small-scale scraping (up to 500-1000 businesses)
- Learning and development
```

### Paid Tier (If Users Need More)

```
💰 Pay As You Go:
   - Compute: $0.60/hour
   - Residential Proxy: $3/1000 requests
   - Datacenter Proxy: $0.30/1000 requests
   - Storage: $0.05/GB

💰 Starter Plan ($49/month):
   - 200 hours compute
   - 200,000 residential proxy requests
   - 2 million datacenter proxy requests
   - 50GB storage

💰 Scale Plan ($499/month):
   - 2,000 hours compute
   - 2M residential proxy requests
   - 20M datacenter proxy requests
   - 500GB storage
```

---

## 📊 Real-World Cost Examples

### Example 1: Small Business Owner

```
Goal: Scrape 1,000 coffee shops in California

Using Your Actor:
- Runtime: ~30 minutes
- Proxy requests: ~2,000 (with detail pages)

User's Cost (Free Tier):
✅ Compute: 0.5 hours (within free 5 hours)
✅ Proxy: 2,000 reqs (within free 5,000)
✅ Storage: ~5MB (within free 2GB)
Total: $0 (completely free!)

Your Cost: $0 ✅
```

### Example 2: Marketing Agency

```
Goal: Scrape 10,000 businesses across multiple cities

Using Your Actor:
- Runtime: ~5 hours
- Proxy requests: ~20,000

User's Cost (Paid):
💰 Compute: 5 hours × $0.60 = $3
💰 Proxy: 20,000 × $0.003 = $60
💰 Storage: ~50MB = $0
Total: ~$63

Your Cost: $0 ✅

VS. Competitors:
- Outscraper: $200 (for 10k credits)
- Phantombuster: $159/month
- Bright Data: $500/month minimum
Your Actor Saves Them: $137-437! 🎉
```

### Example 3: Enterprise Lead Generation

```
Goal: Scrape 100,000 businesses nationwide

Using Your Actor:
- Runtime: ~50 hours
- Proxy requests: ~200,000

User's Cost (Scale Plan):
💰 Monthly Plan: $499
   - Includes: 2,000 hours + 2M proxy requests
   - Uses: 50 hours + 200k requests
   - Remaining for other tasks: 1,950 hours, 1.8M requests
Total: $499/month (tons of capacity left)

Your Cost: $0 ✅

VS. Competitors:
- Outscraper: $2,000+ per month
- Phantombuster: $500+ per month
- Custom solution: $5,000+ to build
Your Actor Saves Them: $1,500-4,500! 🎉
```

---

## 🚀 Monetization Options (Optional)

If you want to earn revenue from your Actor:

### Option 1: Free Actor (Current)

```
Visibility: Public
Price: FREE
Revenue: $0
Benefits:
- Build portfolio
- Get feedback
- Gain users
- No support obligations
```

### Option 2: Paid Actor (Pay Per Event)

```
Visibility: Public
Price: $0.051 per lead ($51.00 per 1,000 leads)
Revenue Share: 80% (you) / 20% (Apify)

Example Pricing (Lead-Extracted Event):
- $0.051 per lead

If 10 users/month extract 500 leads each (5,000 total leads):
Revenue from Events: $255.00
Your Share (80%): $204.00
Platform Costs (Apify deducts compute): ~$1.50
Your Net Profit: ~$202.50/month

Total User Cost: Usage of events + Apify Compute & Proxy
Excellent for guaranteed profit margins! ✅
```

### Option 3: Freemium Model

```
Free Version:
- Up to 100 businesses per run
- Basic fields only
- Public

Paid Version ($10/run):
- Unlimited businesses
- All data fields (hours, reviews, photos)
- Priority support
- Private

Best of both worlds! 🎯
```

---

## 🔒 Security & Privacy

### What Users CANNOT Access:

```
❌ Your APIFY_TOKEN
❌ Your proxy credentials
❌ Your account resources
❌ Your payment information
❌ Your private Actors
❌ Other users' data
```

### What Users CAN Access:

```
✅ Your Actor's source code (if public)
✅ Input/output schemas
✅ Documentation
✅ Their own run results
✅ Their own usage statistics
```

### Credential Isolation:

```javascript
// On Apify Platform, this happens automatically:

User A runs Actor:
  → Uses User A's proxy credentials
  → Stores in User A's dataset
  → Charged to User A's account

User B runs Actor:
  → Uses User B's proxy credentials
  → Stores in User B's dataset
  → Charged to User B's account

Perfect isolation! 🔒
```

---

## 📝 Summary

### For You (Actor Developer):

```
✅ Zero hosting costs
✅ Zero runtime costs
✅ Zero proxy costs
✅ Unlimited free deployment
✅ Usage statistics
✅ User feedback
✅ Portfolio builder

Total Cost: $0/month 🎉
```

### For Users:

```
Option A: Use on Apify Platform
  - Compute: $0.60/hour or free tier
  - Proxy: From their account
  - Storage: From their account
  - Your Actor: FREE (unless you charge)

Option B: Run Locally
  - Compute: Free (their machine)
  - Proxy: From their Apify account
  - Storage: Local disk
  - Your Actor: FREE

Both options: They pay their own costs ✅
```

---

## 🎓 FAQ

**Q: Do I pay when users run my Actor on Apify?**  
A: No! Users pay for their own compute, proxy, and storage. ✅

**Q: Can users steal my proxy credits?**  
A: No! Each user's credentials are completely isolated. ✅

**Q: What if a user runs my Actor 10,000 times?**  
A: You still pay $0. Each run uses their resources. ✅

**Q: How do users get proxy access?**  
A: They need their own Apify account (free tier works). ✅

**Q: Can I limit how many times users run my Actor?**  
A: On free actors, no. On paid actors, you can set per-run pricing. ℹ️

**Q: What's the best option for most users?**  
A: Run on Apify Platform - no setup, auto credentials, easy! ✅

---

## 💡 Recommendation

**For You:**

1. Deploy as FREE public Actor
2. Build user base
3. Gather feedback
4. Add to portfolio
5. (Optional) Add paid version later

**For Users:**

1. Use on Apify Platform (easiest)
2. Free tier perfect for testing/small jobs
3. Upgrade to paid if needed (still cheaper than competitors)

**Everyone Wins!** 🎉

---

**Questions?** Check the main [README.md](./README.md) or [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md)
