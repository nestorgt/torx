# Torx System Architecture - AI Context Guide

**Purpose:** This document provides AI models with essential context for understanding, maintaining, and extending the Torx financial automation system.

---

## System Overview

Torx is a three-component financial automation system:

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────────┐
│  macOS Menu Bar │────────▶│  Node.js Proxy   │◀────────│  Google Apps Script │
│  App (Swift)    │  HTTP   │  Server          │  HTTP   │  (GAS)              │
│                 │         │                  │         │                     │
│  - IP Monitor   │         │  - 5 Bank APIs   │         │  - Balance Updates  │
│  - Workflow     │         │  - OAuth/mTLS    │         │  - Payment Processor│
│    Enforcement  │         │  - Transaction   │         │  - Expense Tracker  │
│                 │         │    Fetching      │         │                     │
└─────────────────┘         └──────────────────┘         └─────────────────────┘
                                     │                             │
                                     │                             │
                                     ▼                             ▼
                            ┌─────────────────┐         ┌──────────────────┐
                            │  Bank APIs:     │         │  Google Sheets   │
                            │  - Revolut      │         │  - Payouts       │
                            │  - Mercury      │         │  - Users         │
                            │  - Airwallex    │         │  - Project Torx  │
                            │  - Wise         │         │  - Transactions  │
                            │  - Nexo         │         │  - Reconciliation│
                            └─────────────────┘         └──────────────────┘
```

---

## Component 1: macOS Menu Bar App

**Location:** `/Users/wsou/Developer/torx/mac-app/`
**Language:** Swift
**Primary File:** `StatusController.swift` (946 lines)

### Purpose
Monitors public IP address and enforces workflow automation by closing Chrome when IP matches target.

### Key Patterns

#### Network Monitoring
```swift
// Uses reactive Apple frameworks (no polling)
NWPathMonitor()      // Monitor network path changes
SCDynamicStore       // Monitor system configuration changes
```

**Important:** Never implement polling - the app is entirely reactive to system notifications.

#### State Management
```swift
enum IPStatus {
    case unknown    // Initial state or error
    case white      // IP doesn't match target
    case orange     // IP matches target (185.87.45.245)
    case blue       // Alternative state
}
```

#### IP History Tracking
- Stored in UserDefaults as JSON array
- Limited to last 100 entries
- Each entry: `{timestamp, ip, status}`

### Critical Rules
1. **No polling** - Use Apple native frameworks for reactive updates
2. **Minimal comments** - Code should be self-documenting
3. **Auto-updates** - Uses GitHub releases (check semver)
4. **Permissions** - Requires network access entitlements

---

## Component 2: Node.js Proxy Server

**Location:** `/Users/wsou/Developer/torx/proxy-banks/`
**Primary File:** `server.js` (4,198 lines)
**Port:** 52018

### Purpose
Unified proxy server that authenticates with 5 banking APIs and provides normalized REST endpoints.

### Bank Integration Patterns

#### 1. Revolut (OAuth2 + mTLS)
```javascript
// CRITICAL: Uses JWT client assertion for OAuth
// Token audience must match: https://revolut.com
// Requires mTLS certificates in .secrets/certs/

const jwt = require('jsonwebtoken');
const privateKey = fs.readFileSync('.secrets/certs/privatekey.pem');

// Generate client assertion
const assertion = jwt.sign({
  iss: clientId,
  sub: clientId,
  aud: 'https://revolut.com',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 300
}, privateKey, { algorithm: 'RS256' });

// Token exchange with mTLS
const response = await axios.post('https://b2b.revolut.com/api/1.0/auth/token', {
  grant_type: 'client_credentials',
  client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
  client_assertion: assertion
}, {
  httpsAgent: new https.Agent({
    cert: fs.readFileSync('.secrets/certs/client-cert.pem'),
    key: fs.readFileSync('.secrets/certs/privatekey.pem'),
    ca: fs.readFileSync('.secrets/certs/ca-cert.pem')
  })
});
```

**Gotchas:**
- Tokens expire every 40 minutes
- mTLS certificates must be valid
- Retry logic for token refresh failures (max 3 attempts)

#### 2. Mercury (API Token)
```javascript
// Simple Bearer token auth
headers: {
  'Authorization': `Bearer ${process.env.MERCURY_API_KEY}`,
  'Content-Type': 'application/json'
}

// API quirks:
// - Returns USD cents (divide by 100)
// - Date filtering uses ISO 8601: YYYY-MM-DD
// - Rate limit: 60 requests/minute
```

#### 3. Airwallex (Client Credentials)
```javascript
// OAuth2 client credentials flow
const tokenResponse = await axios.post(
  'https://api.airwallex.com/api/v1/authentication/login',
  {
    client_id: process.env.AIRWALLEX_CLIENT_ID,
    client_secret: process.env.AIRWALLEX_CLIENT_SECRET
  }
);

// Token expires in 30 minutes
// Cache token and refresh on 401
```

#### 4. Wise (API Token)
```javascript
// Bearer token authentication
// Returns balance in smallest currency unit
// Example: EUR 1234.56 = 123456 (divide by 100)

headers: {
  'Authorization': `Bearer ${process.env.WISE_API_TOKEN}`
}
```

#### 5. Nexo (Puppeteer Automation)
```javascript
// COMPLEX: No public API, uses browser automation
// Steps:
// 1. Load saved cookies from .secrets/nexo.cookies.json
// 2. Navigate to Nexo login page
// 3. Fill email/password
// 4. Handle TOTP 2FA (uses speakeasy library)
// 5. Save new cookies for next run
// 6. Scrape balance from dashboard

// IMPORTANT: Fragile - breaks if Nexo changes UI
// Requires headless: false for debugging
```

### API Endpoint Pattern
```javascript
// Standard endpoint structure:
GET /[bank]/summary          // Account summaries
GET /[bank]/accounts         // Account details
GET /[bank]/transactions     // Transaction history

// All responses normalized to:
{
  success: boolean,
  data: any,
  error?: string
}
```

### Error Handling Pattern
```javascript
// Three-layer error handling:
try {
  // 1. API call with retry logic
  const response = await retryWithBackoff(apiCall, maxRetries=3);

  // 2. Validate response
  if (!response.data) throw new Error('Invalid response');

  // 3. Return normalized response
  res.json({ success: true, data: response.data });

} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  res.status(500).json({ success: false, error: error.message });
}
```

### Critical Rules for Proxy Server
1. **Never log tokens** - Use `[REDACTED]` in logs
2. **Always use retry logic** - Network calls can fail
3. **Normalize responses** - All endpoints return `{success, data, error?}`
4. **Cache tokens** - Avoid unnecessary OAuth flows
5. **Health checks** - `/healthz` must always respond

---

## Component 3: Google Apps Script

**Location:** `/Users/wsou/Developer/torx/google-apps-scripts/`
**Primary File:** `gs_torx_main.gs` (8,346 lines)

### Purpose
Orchestrates financial operations: balance updates, expense tracking, payment processing, fund consolidation.

### Sheet Structure

#### Payouts Sheet
```
Row 1: Headers
Row 2: Current month balances
Columns:
  C: Mercury USD
  D: Airwallex USD
  E: Revolut EUR
  F: Wise EUR
  G: Nexo USD
```

#### Users Sheet
```
Columns:
  A: User ID
  B: User Name
  C: Payment Amount (EUR)
  D: Payment Frequency (monthly/one-time)
  E: Last Payment Date
  F: Status (active/inactive)
  G: Notes
```

#### Project Torx Sheet (Monthly Expenses)
```
Columns:
  A: Month (YYYY-MM)
  B: Category
  C: Description
  D: Amount (EUR)
  E: Status (pending/paid/reconciled)
  F: Payment Date
  G: Bank Source
```

### Key Functions

#### Balance Update Pattern
```javascript
/**
 * Updates balances by calling proxy server and writing to sheet
 * @returns {Object} {success: boolean, data: Object}
 */
function updateBalances_() {
  // 1. Call proxy server for each bank
  const mercury = fetchMercurySummary_();
  const airwallex = fetchAirwallexSummary_();
  const revolut = fetchRevolutSummary_();
  const wise = fetchWiseSummary_();
  const nexo = fetchNexoSummary_();

  // 2. Write to "Payouts" sheet (row 2, columns C-G)
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payouts');
  sheet.getRange(2, 3).setValue(mercury.usd);  // Column C
  sheet.getRange(2, 4).setValue(airwallex.usd); // Column D
  // ... etc

  // 3. Log audit trail
  logToSheet_('Balance Update', `Updated at ${new Date()}`);

  return { success: true, data: { mercury, airwallex, revolut, wise, nexo } };
}
```

#### HTTP Proxy Pattern
```javascript
/**
 * Makes HTTP request to proxy server with error handling
 * @param {string} endpoint - API endpoint (e.g., '/mercury/summary')
 * @returns {Object} Response data or throws error
 */
function httpGet_(endpoint) {
  const BASE_URL = 'http://localhost:52018';
  const options = {
    method: 'get',
    headers: { 'x-api-key': PropertiesService.getScriptProperties().getProperty('API_KEY') },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(BASE_URL + endpoint, options);
    const data = JSON.parse(response.getContentText());

    if (!data.success) {
      throw new Error(data.error || 'API request failed');
    }

    return data.data;
  } catch (error) {
    console.error(`HTTP GET ${endpoint} failed: ${error}`);
    throw error;
  }
}
```

#### Payment Processing Pattern
```javascript
/**
 * Processes monthly user payments with idempotency checks
 * @param {boolean} dryRun - If true, simulates without making changes
 */
function processMonthlyPayments_(dryRun = false) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const currentMonth = Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM');

  for (let i = 1; i < data.length; i++) { // Skip header
    const userId = data[i][0];
    const userName = data[i][1];
    const amount = data[i][2];
    const lastPayment = data[i][4];
    const status = data[i][5];

    // Idempotency check: Skip if already paid this month
    if (lastPayment && lastPayment.startsWith(currentMonth)) {
      console.log(`[SKIP] ${userName} already paid for ${currentMonth}`);
      continue;
    }

    if (status !== 'active') {
      console.log(`[SKIP] ${userName} is inactive`);
      continue;
    }

    // Process payment
    if (dryRun) {
      console.log(`[DRY RUN] Would pay ${userName} €${amount}`);
    } else {
      // Make payment via proxy server
      const result = httpPost_('/revolut/transfer', {
        to: userId,
        amount: amount,
        currency: 'EUR'
      });

      // Update sheet with payment date
      sheet.getRange(i + 1, 5).setValue(new Date());

      // Send WhatsApp notification
      sendWhatsAppNotification_(userName, amount);
    }
  }
}
```

### Critical Patterns

#### 1. Idempotency
```javascript
// ALWAYS check if operation already completed
const lastUpdate = sheet.getRange(row, col).getValue();
if (isSameDay(lastUpdate, new Date())) {
  console.log('[SKIP] Already processed today');
  return;
}
```

#### 2. Dry Run Mode
```javascript
// ALWAYS support dry run for testing
function processPayments(dryRun = false) {
  if (dryRun) {
    console.log('[DRY RUN] Would execute operation');
    return { success: true, simulated: true };
  }
  // ... actual operation
}
```

#### 3. Error Recovery
```javascript
// ALWAYS wrap external calls in try-catch
try {
  const result = httpGet_('/mercury/summary');
} catch (error) {
  // Log error but don't stop entire operation
  console.error(`[ERROR] Mercury fetch failed: ${error}`);
  // Continue with other banks
}
```

#### 4. Audit Logging
```javascript
// ALWAYS log significant operations
function logToSheet_(operation, details) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Transactions');
  sheet.appendRow([
    new Date(),
    operation,
    details,
    Session.getActiveUser().getEmail()
  ]);
}
```

### Time-Based Triggers
```javascript
// Set up in GAS editor: Edit > Current project's triggers
// - Daily: updateBalances_() at 9:00 AM
// - Monthly: processMonthlyPayments_() on 1st at 10:00 AM
// - Hourly: checkForPendingExpenses_()
```

---

## Data Flow Examples

### Example 1: Balance Update Flow
```
1. GAS Trigger fires at 9:00 AM
   ↓
2. gs_torx_main.gs: updateBalances_()
   ↓
3. httpGet_('/mercury/summary')
   → HTTP GET localhost:52018/mercury/summary
   ↓
4. server.js: GET /mercury/summary handler
   ↓
5. Fetch Mercury API with Bearer token
   ← Mercury returns JSON with account balances
   ↓
6. Normalize response: { success: true, data: { usd: 123456 } }
   ← Return to GAS
   ↓
7. Write to "Payouts" sheet, column C (Mercury USD)
   ↓
8. Log to "Transactions" sheet
```

### Example 2: Monthly Payment Flow
```
1. GAS Trigger fires on 1st of month at 10:00 AM
   ↓
2. gs_torx_main.gs: processMonthlyPayments_(dryRun=false)
   ↓
3. Read "Users" sheet for active users
   ↓
4. For each user:
   a. Check if already paid this month (idempotency)
   b. If not, call httpPost_('/revolut/transfer', {to, amount, currency})
      ↓
   c. server.js: POST /revolut/transfer handler
      ↓
   d. Get Revolut OAuth token (check cache, refresh if expired)
      ↓
   e. POST to Revolut API with mTLS
      ← Revolut confirms transfer
      ↓
   f. Return success to GAS
      ↓
   g. Update "Users" sheet with payment date
      ↓
   h. Send WhatsApp notification via Twilio
   ↓
5. Log entire operation to "Transactions" sheet
```

---

## Authentication Flow Details

### Revolut OAuth + mTLS
```
1. Generate JWT client assertion
   - iss: client_id
   - sub: client_id
   - aud: "https://revolut.com"
   - exp: current_time + 300s
   - Sign with RS256 using privatekey.pem

2. POST to /api/1.0/auth/token
   - Body: { grant_type, client_assertion_type, client_assertion }
   - mTLS: client-cert.pem + privatekey.pem + ca-cert.pem

3. Receive access_token (expires in 40 minutes)

4. Cache token in memory with expiry timestamp

5. On API calls:
   - Check if token expired
   - If expired, goto step 1
   - If valid, use: Authorization: Bearer {token}

6. On 401 response:
   - Retry token refresh (max 3 times)
   - If all retries fail, log error and return failure
```

### Nexo Puppeteer Flow
```
1. Check if cookies exist in .secrets/nexo.cookies.json

2. If cookies exist:
   a. Load cookies into Puppeteer browser
   b. Navigate to dashboard
   c. Check if logged in (look for balance element)
   d. If logged in: scrape balance and return

3. If not logged in or no cookies:
   a. Navigate to login page
   b. Fill email field: process.env.NEXO_EMAIL
   c. Fill password field: process.env.NEXO_PASSWORD
   d. Click login button
   e. Wait for 2FA prompt
   f. Generate TOTP code: speakeasy.totp({ secret: process.env.NEXO_2FA_SECRET })
   g. Fill TOTP code
   h. Submit
   i. Wait for dashboard
   j. Save cookies to .secrets/nexo.cookies.json
   k. Scrape balance

4. Return balance: { usd: amount }
```

---

## Configuration Management

### Environment Variables (.env)
```bash
# Proxy Server
PORT=52018
API_KEY=your_secure_api_key_here

# Revolut (OAuth + mTLS)
REVOLUT_CLIENT_ID=your_client_id
# Certificates stored in .secrets/certs/
# - client-cert.pem
# - privatekey.pem
# - ca-cert.pem

# Mercury (API Token)
MERCURY_API_KEY=your_api_key

# Airwallex (Client Credentials)
AIRWALLEX_CLIENT_ID=your_client_id
AIRWALLEX_CLIENT_SECRET=your_client_secret

# Wise (API Token)
WISE_API_TOKEN=your_api_token

# Nexo (Puppeteer)
NEXO_EMAIL=your_email@example.com
NEXO_PASSWORD=your_password
NEXO_2FA_SECRET=your_totp_secret

# Google Apps Script (GAS calls proxy)
# Script Properties in GAS:
# - API_KEY (matches proxy server API_KEY)
# - PROXY_URL (default: http://localhost:52018)
```

---

## Common Operations

### Adding a New Bank
1. **Add to proxy server:**
   - Create auth function (e.g., `getNewBankToken()`)
   - Add endpoints: `/newbank/summary`, `/newbank/transactions`
   - Implement error handling and retry logic
   - Add to health check

2. **Add to Google Apps Script:**
   - Create fetch function: `fetchNewBankSummary_()`
   - Update `updateBalances_()` to call new function
   - Add column to "Payouts" sheet
   - Update menu functions

3. **Update documentation:**
   - Add to ARCHITECTURE.md (this file)
   - Update README.md
   - Add to .env.example

### Debugging OAuth Issues
```bash
# 1. Check token generation
node -e "console.log(require('./server.js').testRevolutToken())"

# 2. Verify certificates
openssl x509 -in .secrets/certs/client-cert.pem -text -noout

# 3. Test mTLS connection
curl --cert .secrets/certs/client-cert.pem \
     --key .secrets/certs/privatekey.pem \
     --cacert .secrets/certs/ca-cert.pem \
     https://b2b.revolut.com/api/1.0/auth/token

# 4. Check proxy server logs
pm2 logs torx-proxy
```

### Testing Without Real API Calls
```javascript
// In server.js, add mock mode:
const MOCK_MODE = process.env.MOCK_MODE === 'true';

if (MOCK_MODE) {
  return res.json({
    success: true,
    data: { usd: 100000, accounts: [...] }
  });
}
```

---

## Security Considerations

### Secrets Management
- **Never commit:** `.env`, `tokens.json`, `*.pem`, `*.cookies.json`
- **File permissions:** `chmod 600` for all secrets
- **Rotation:** Rotate API keys quarterly
- **mTLS certs:** Monitor expiry dates

### API Key Protection
```javascript
// WRONG - Don't log full keys
console.log(`Using API key: ${apiKey}`);

// RIGHT - Redact in logs
console.log(`Using API key: ${apiKey.substring(0, 4)}...`);
```

### Google Sheets Access Control
- Limit script execution to authorized users only
- Use Script Properties (not document properties) for secrets
- Enable audit logging for all sheet modifications

---

## Performance Considerations

### Caching Strategy
- **OAuth tokens:** Cache in memory with expiry
- **Bank balances:** Cache for 5 minutes (balance updates are slow)
- **Transaction lists:** Don't cache (need real-time data)

### Rate Limiting
```javascript
// Mercury: 60 req/min
// Revolut: 1000 req/hour
// Airwallex: 100 req/min
// Wise: 180 req/min
// Nexo: 1 req/5min (Puppeteer is slow)

// Implement rate limiting:
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50 // 50 requests per minute
});
app.use(limiter);
```

---

## Troubleshooting Guide

### Issue: Proxy server returns 500
**Check:**
1. Is server running? `pm2 status`
2. Are credentials valid? Check `.env`
3. Are tokens expired? Delete `tokens.json` to force refresh
4. Check logs: `pm2 logs torx-proxy`

### Issue: GAS function times out
**Solutions:**
1. Increase timeout in GAS editor (max 6 minutes)
2. Break into smaller functions
3. Use exponential backoff for retries
4. Check proxy server is responding

### Issue: Nexo login fails
**Solutions:**
1. Delete `.secrets/nexo.cookies.json` to force fresh login
2. Check TOTP secret is correct
3. Run with `headless: false` to debug visually
4. Verify Nexo UI hasn't changed (selector updates needed)

### Issue: mTLS certificate errors
**Check:**
1. Certificate not expired: `openssl x509 -in client-cert.pem -noout -dates`
2. Private key matches cert: `openssl rsa -in privatekey.pem -check`
3. CA cert is correct for Revolut
4. File paths are correct in code

---

## Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `proxy-banks/server.js` | 4,198 | Main proxy server with all bank integrations |
| `google-apps-scripts/gs_torx_main.gs` | 8,346 | Unified GAS automation script |
| `mac-app/torx-mac/StatusController.swift` | 946 | macOS app main controller |
| `proxy-banks/.env` | - | Environment variables (DO NOT COMMIT) |
| `proxy-banks/.secrets/certs/` | - | mTLS certificates for Revolut |
| `proxy-banks/.secrets/tokens.json` | - | Cached OAuth tokens |
| `proxy-banks/.secrets/nexo.cookies.json` | - | Puppeteer session cookies |

---

## Modification Guidelines

### Before Making Changes
1. Read RULES.md in relevant directory
2. Understand data flow (see diagrams above)
3. Test in dry run mode first
4. Check for breaking changes to sheet structure

### When Modifying API Integration
1. Update both proxy server AND GAS
2. Test with mock data first
3. Implement comprehensive error handling
4. Update health check endpoint
5. Document any API quirks discovered

### When Modifying Sheet Structure
1. Update column references in GAS code
2. Test with copy of production sheet first
3. Implement migration script if needed
4. Update ARCHITECTURE.md (this file)

---

## AI Model Guidelines

When helping with Torx:

1. **Always check RULES.md** in the relevant directory first
2. **Never log secrets** - redact tokens, keys, passwords
3. **Preserve idempotency** - operations should be safe to retry
4. **Use dry run mode** - test before executing real operations
5. **Follow naming conventions:**
   - Private functions end with `_` (e.g., `fetchMercury_()`)
   - GAS functions use camelCase
   - Swift uses camelCase for functions, PascalCase for types
   - Node.js uses camelCase
6. **Error handling is critical** - wrap all external calls in try-catch
7. **Maintain audit trails** - log all significant operations
8. **Test incrementally** - don't make sweeping changes
9. **Respect rate limits** - implement backoff and retries
10. **Document OAuth quirks** - each bank has unique requirements

---

## Frequently Asked Questions

**Q: Why are there three separate components?**
A: Separation of concerns: Mac app handles UI/workflow, proxy server handles sensitive auth, GAS handles spreadsheet automation.

**Q: Why not use a database?**
A: Google Sheets provides built-in UI, version history, and is accessible to non-technical users.

**Q: Why Puppeteer for Nexo?**
A: Nexo has no public API. Puppeteer is fragile but necessary.

**Q: Why mTLS for Revolut?**
A: Revolut's security requirements for B2B API access.

**Q: Can I run proxy server on different machine than Mac app?**
A: Yes, update `PROXY_URL` in GAS Script Properties to point to remote server.

**Q: How do I add support for a new currency?**
A: Update conversion functions in GAS, add FX rate fetching, update sheet columns.

---

**Last Updated:** 2025-10-17
**Document Version:** 1.0
**Maintained By:** AI-generated from codebase analysis
