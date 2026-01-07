# Torx AI Context - Quick Reference

**Purpose:** Quick reference guide for AI models working with the Torx financial automation system.

---

## Start Here

When working with Torx, **always read these documents first**:

1. **[ARCHITECTURE.md](ARCHITECTURE.md)** - System overview, data flow, component interaction
2. **[AI_CODING_PATTERNS.md](AI_CODING_PATTERNS.md)** - Code patterns, anti-patterns, best practices
3. **[BANK_INTEGRATIONS.md](BANK_INTEGRATIONS.md)** - Bank-specific API details and quirks

---

## System at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                        TORX SYSTEM                          │
│                                                             │
│  ┌────────────┐    ┌──────────────┐    ┌────────────────┐ │
│  │ macOS App  │───▶│ Node.js      │◀───│ Google Apps    │ │
│  │ (Swift)    │    │ Proxy Server │    │ Script (GAS)   │ │
│  │            │    │              │    │                │ │
│  │ - IP       │    │ - Revolut    │    │ - Balances     │ │
│  │   Monitor  │    │ - Mercury    │    │ - Payments     │ │
│  │ - Workflow │    │ - Airwallex  │    │ - Expenses     │ │
│  │   Enforce  │    │ - Wise       │    │ - Consolidate  │ │
│  │            │    │ - Nexo       │    │                │ │
│  └────────────┘    └──────────────┘    └────────────────┘ │
│                                                             │
│  Component 1       Component 2          Component 3        │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Facts

| Aspect | Detail |
|--------|--------|
| **Languages** | Swift, JavaScript (Node.js), Google Apps Script |
| **Banks Supported** | 5 (Revolut, Mercury, Airwallex, Wise, Nexo) |
| **Primary Files** | `server.js` (4,198 lines), `gs_torx_main.gs` (8,346 lines), `StatusController.swift` (946 lines) |
| **Authentication** | OAuth2 + mTLS (Revolut), API tokens (Mercury, Airwallex, Wise), Puppeteer (Nexo) |
| **Data Storage** | Google Sheets |
| **Port** | 52018 (proxy server) |

---

## Critical Rules

### Before Modifying Code

1. ✅ Read `RULES.md` in the relevant directory first
2. ✅ Check [ARCHITECTURE.md](ARCHITECTURE.md) for data flow understanding
3. ✅ Test in **dry run mode** before live execution
4. ✅ Implement **idempotency** for all state-changing operations
5. ✅ Never log secrets (tokens, keys, passwords)

### Code Conventions

```javascript
// ✅ GOOD - Private function with underscore
function fetchMercurySummary_() { }

// ✅ GOOD - Error handling with graceful degradation
try {
  const mercury = fetchMercurySummary_();
} catch (error) {
  console.error('[ERROR] Mercury failed:', error);
  // Continue with other banks
}

// ✅ GOOD - Normalized response format
return { success: true, data: { usd: 100000 } };

// ❌ BAD - Hardcoded credentials
const apiKey = 'sk_live_123...';

// ❌ BAD - Polling (use reactive patterns)
setInterval(() => checkIP(), 5000);

// ❌ BAD - Non-idempotent operation
function processPayment() {
  makePayment(); // Can run multiple times = duplicate payments
}
```

---

## Common Tasks

### Task: Add New Bank Integration

**Files to modify:**
1. `proxy-banks/server.js` - Add auth + endpoints
2. `google-apps-scripts/gs_torx_main.gs` - Add fetch functions
3. Sheet: Add column to "Payouts"
4. `.env` - Add credentials

**Steps:**
1. Implement OAuth/token logic in server.js
2. Add `/newbank/summary` endpoint
3. Create `fetchNewBankSummary_()` in GAS
4. Update `updateBalances_()` function
5. Test with mock data first
6. Deploy and test live

**See:** [BANK_INTEGRATIONS.md - Adding New Banks](BANK_INTEGRATIONS.md#adding-new-banks)

### Task: Debug OAuth Errors

**Checklist:**
- [ ] Check token cache expiry logic (5-min buffer)
- [ ] Verify credentials in `.env`
- [ ] Test token generation separately
- [ ] Check server logs: `pm2 logs torx-proxy`
- [ ] For Revolut: Verify mTLS certificates

**See:** [BANK_INTEGRATIONS.md - Common Issues](BANK_INTEGRATIONS.md#common-issues--solutions)

### Task: Modify Payment Logic

**CRITICAL:**
1. Always implement idempotency checks
2. Support dry run mode (`dryRun = true`)
3. Log all operations to audit trail
4. Handle errors gracefully (don't stop entire batch)
5. Test with small amounts first

**See:** [AI_CODING_PATTERNS.md - GAS Patterns](AI_CODING_PATTERNS.md#google-apps-script-patterns)

---

## File Locations

### Main Code Files
```
torx/
├── mac-app/torx-mac/StatusController.swift     [946 lines] - macOS app
├── proxy-banks/server.js                       [4,198 lines] - Proxy server
├── google-apps-scripts/gs_torx_main.gs         [8,346 lines] - GAS automation
└── proxy-banks/.env                            [Credentials - DO NOT COMMIT]
```

### Documentation Files
```
torx/
├── README.md                                   [Root documentation]
├── ARCHITECTURE.md                             [System overview - READ FIRST]
├── AI_CODING_PATTERNS.md                       [Code patterns for AI]
├── BANK_INTEGRATIONS.md                        [Bank API reference]
├── AI_CONTEXT.md                               [This file]
├── mac-app/README.md                           [macOS app docs]
├── mac-app/RULES.md                            [macOS app rules]
├── proxy-banks/README.md                       [Proxy server docs]
├── proxy-banks/RULES.md                        [Proxy server rules]
├── proxy-banks/README-MONTHLY-EXPENSES.md      [Expense tracking]
└── google-apps-scripts/README.md               [GAS documentation]
```

---

## API Endpoint Reference

### Proxy Server Endpoints

All endpoints require `x-api-key` header (except `/healthz`).

| Endpoint | Method | Purpose | Response Time |
|----------|--------|---------|---------------|
| `/healthz` | GET | Health check | <100ms |
| `/revolut/summary` | GET | Account summary | ~2s |
| `/revolut/accounts` | GET | Account details | ~2s |
| `/revolut/transactions` | GET | Transaction list | ~3s |
| `/revolut/transfer` | POST | Transfer funds | ~5s |
| `/mercury/summary` | GET | Account summary | ~1s |
| `/mercury/transactions` | GET | Transaction list | ~2s |
| `/airwallex/summary` | GET | Account summary | ~1s |
| `/airwallex/transactions` | GET | Transaction list | ~2s |
| `/wise/summary` | GET | Account summary | ~1s |
| `/nexo/summary` | GET | Account summary | ~30s (Puppeteer) |

**Response Format (all endpoints):**
```json
{
  "success": true,
  "data": { /* bank-specific data */ }
}
```

**Error Format:**
```json
{
  "success": false,
  "error": "Error message here"
}
```

---

## Sheet Structure

### Payouts Sheet (Bank Balances)
```
Row 1: Headers
Row 2: Current balances

     A           B            C           D           E           F
1  Month    | Airwallex  | Mercury   | Revolut   | Wise      | Nexo
2  [date]   | [USD/EUR]  | [USD/EUR] | [USD/EUR] | [USD/EUR] | [USD]
```

**Cell References (in code):**
```javascript
CELLS = {
  Airwallex: { USD: 'B2', EUR: 'B3' },
  Mercury:   { USD: 'C2', EUR: 'C3' },
  Revolut:   { USD: 'D2', EUR: 'D3' },
  Wise:      { USD: 'E2', EUR: 'E3' },
  Nexo:      { USD: 'F2' }
};
```

### Users Sheet (Payment Processing)
```
     A          B           C          D              E                F
1  User ID  | User Name | Amount   | Frequency   | Last Payment  | Status
2  user123  | John Doe  | 1000     | monthly     | 2025-01-15    | active
```

---

## Authentication Summary

| Bank | Auth Type | Token Expiry | Cache? | Special Requirements |
|------|-----------|--------------|--------|---------------------|
| **Revolut** | OAuth2 + mTLS | 40 min | Yes | JWT client assertion, mTLS certificates |
| **Mercury** | API Token | Never | No | Bearer token only |
| **Airwallex** | OAuth2 Client Credentials | 30 min | Yes | Standard OAuth |
| **Wise** | API Token | Never | No | Bearer token only |
| **Nexo** | Puppeteer (Email/Password + TOTP) | 7 days (cookies) | Yes | Browser automation, TOTP 2FA |

---

## Error Handling Patterns

### Pattern 1: Graceful Degradation
```javascript
// ✅ GOOD - One bank failure doesn't stop others
const results = { banks: {}, errors: [] };

try {
  results.banks.mercury = fetchMercury();
} catch (e) {
  results.errors.push({ bank: 'mercury', error: e.message });
}

try {
  results.banks.revolut = fetchRevolut();
} catch (e) {
  results.errors.push({ bank: 'revolut', error: e.message });
}

return results; // Returns partial data even if some banks fail
```

### Pattern 2: Retry with Backoff
```javascript
// ✅ GOOD - Retry failed operations with exponential backoff
async function retryWithBackoff(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = 1000 * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
}
```

### Pattern 3: Idempotency
```javascript
// ✅ GOOD - Check if operation already completed
function processPayment(userId) {
  const lastPayment = getLastPaymentDate(userId);
  const currentMonth = getCurrentMonth();

  if (lastPayment.startsWith(currentMonth)) {
    console.log('[SKIP] Already paid this month');
    return { success: true, skipped: true };
  }

  // Process payment...
}
```

---

## Testing Checklist

Before deploying changes:

- [ ] Test in dry run mode (`dryRun = true`)
- [ ] Verify idempotency (run operation twice)
- [ ] Check error handling (simulate failures)
- [ ] Test with mock data first
- [ ] Verify logs show expected output
- [ ] Test with small amounts (if financial operation)
- [ ] Check sheet formatting preserved
- [ ] Verify audit trail logged correctly
- [ ] Test token refresh logic (if OAuth)
- [ ] Run health check: `curl http://localhost:52018/healthz`

---

## Troubleshooting Quick Guide

### "Proxy server not responding"
```bash
# Check if running
pm2 status

# Check logs
pm2 logs torx-proxy

# Restart
pm2 restart torx-proxy
```

### "Token expired" or 401 errors
```bash
# Delete token cache
rm .secrets/tokens.json

# Test token generation
node -e "require('./server.js').testRevolutToken()"
```

### "Nexo login fails"
```bash
# Delete stale cookies
rm .secrets/nexo.cookies.json

# Run with visible browser (for debugging)
# Set headless: false in server.js
```

### "Sheet formatting broken"
```javascript
// ALWAYS use setCellKeepFmt_() instead of setValue()
setCellKeepFmt_(sheet, 'C2', value, 'note');  // ✅ Preserves format
// NOT: sheet.getRange('C2').setValue(value);  // ❌ Loses format
```

---

## Performance Tips

### Caching Strategy
```javascript
// Cache OAuth tokens with 5-min buffer
if (cached.token && Date.now() < cached.expiresAt - 5*60*1000) {
  return cached.token;
}

// Cache bank balances for 5 minutes
// Cache Nexo data for 15+ minutes (slow Puppeteer)
```

### Rate Limiting
```
Mercury:    60 requests/minute
Revolut:    1000 requests/hour
Airwallex:  100 requests/minute
Wise:       180 requests/minute
Nexo:       1 request/5 minutes (Puppeteer limit)
```

### Parallel Operations
```javascript
// ✅ GOOD - Fetch banks in parallel
const [mercury, revolut, airwallex] = await Promise.allSettled([
  fetchMercury(),
  fetchRevolut(),
  fetchAirwallex()
]);

// ❌ BAD - Sequential (slow)
const mercury = await fetchMercury();
const revolut = await fetchRevolut();
const airwallex = await fetchAirwallex();
```

---

## Security Checklist

When handling Torx code:

- [ ] Never log tokens/keys/passwords
- [ ] All credentials in `.env` file
- [ ] `.env` in `.gitignore`
- [ ] Redact secrets in logs: `token.substring(0,4)...`
- [ ] mTLS certificates have 600 permissions
- [ ] API keys not in code or documentation
- [ ] HTTPS for all API calls
- [ ] Validate input parameters
- [ ] Use Script Properties (not document properties) in GAS

---

## Key Gotchas

### 1. Revolut Token Audience
```javascript
// ❌ WRONG
aud: 'https://b2b.revolut.com'

// ✅ RIGHT
aud: 'https://revolut.com'
```

### 2. Amount Formats
```javascript
// Mercury & Revolut: Cents
const usd = 10000; // = $100.00

// Airwallex & Wise: Decimal
const eur = 100.00; // = €100.00
```

### 3. Weekend FX Restrictions
```javascript
// NEVER do FX operations on weekends
if (isWeekend()) {
  Logger.log('[SKIP] No FX on weekends');
  return;
}
```

### 4. Nexo UI Changes
```javascript
// Nexo integration breaks when UI changes
// Always keep selectors up to date
// Run with headless: false to debug
```

### 5. Token Caching
```javascript
// Always include 5-minute buffer
if (Date.now() < expiresAt - 5*60*1000) {
  return cachedToken;
}
```

---

## Resources

### External Documentation
- **Revolut API:** https://developer.revolut.com/docs/business/business-api
- **Mercury API:** https://docs.mercury.com
- **Airwallex API:** https://www.airwallex.com/docs/api
- **Wise API:** https://docs.wise.com/api-docs
- **Nexo:** No public API (Puppeteer-based)

### Internal Documentation
- **Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Patterns:** [AI_CODING_PATTERNS.md](AI_CODING_PATTERNS.md)
- **Banks:** [BANK_INTEGRATIONS.md](BANK_INTEGRATIONS.md)
- **Main README:** [README.md](README.md)

---

## Commands

```bash
# Proxy Server
pm2 start proxy-banks/server.js --name torx-proxy
pm2 logs torx-proxy
pm2 restart torx-proxy
pm2 status

# Health Check
curl -H "x-api-key: YOUR_KEY" http://localhost:52018/healthz

# Test Bank Endpoint
curl -H "x-api-key: YOUR_KEY" http://localhost:52018/mercury/summary

# Build macOS App
cd mac-app
./build_root_app.sh

# Certificate Check (Revolut)
openssl x509 -in .secrets/certs/client-cert.pem -noout -dates
```

---

## Need Help?

1. **First:** Read [ARCHITECTURE.md](ARCHITECTURE.md)
2. **Code patterns:** Check [AI_CODING_PATTERNS.md](AI_CODING_PATTERNS.md)
3. **Bank issues:** See [BANK_INTEGRATIONS.md](BANK_INTEGRATIONS.md)
4. **Specific component:** Read component-specific README.md and RULES.md

---

**Last Updated:** 2025-10-17
**Document Version:** 1.0
**For:** AI models (Claude, GPT, etc.)
