# Torx Coding Patterns - AI Reference Guide

**Purpose:** Provides AI models with common coding patterns, anti-patterns, and best practices specific to the Torx codebase.

---

## Table of Contents
1. [Google Apps Script Patterns](#google-apps-script-patterns)
2. [Node.js Proxy Server Patterns](#nodejs-proxy-server-patterns)
3. [Swift macOS App Patterns](#swift-macos-app-patterns)
4. [Cross-Component Patterns](#cross-component-patterns)
5. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## Google Apps Script Patterns

### Pattern: HTTP Request to Proxy Server
```javascript
/**
 * Makes authenticated HTTP GET request to proxy server
 * @param {string} endpoint - API endpoint (e.g., '/mercury/summary')
 * @returns {Object} Response data
 * @throws {Error} If request fails after retries
 */
function httpGet_(endpoint) {
  const BASE_URL = PropertiesService.getScriptProperties().getProperty('PROXY_URL') || 'http://localhost:52018';
  const API_KEY = PropertiesService.getScriptProperties().getProperty('API_KEY');

  const options = {
    method: 'get',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(BASE_URL + endpoint, options);
    const statusCode = response.getResponseCode();

    if (statusCode !== 200) {
      throw new Error(`HTTP ${statusCode}: ${response.getContentText()}`);
    }

    const data = JSON.parse(response.getContentText());

    if (!data.success) {
      throw new Error(data.error || 'Request failed');
    }

    return data.data;

  } catch (error) {
    console.error(`[httpGet_] ${endpoint} failed: ${error.message}`);
    throw error;
  }
}

/**
 * Makes authenticated HTTP POST request to proxy server
 * @param {string} endpoint - API endpoint
 * @param {Object} payload - Request body
 * @returns {Object} Response data
 */
function httpPost_(endpoint, payload) {
  const BASE_URL = PropertiesService.getScriptProperties().getProperty('PROXY_URL') || 'http://localhost:52018';
  const API_KEY = PropertiesService.getScriptProperties().getProperty('API_KEY');

  const options = {
    method: 'post',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(BASE_URL + endpoint, options);
    const data = JSON.parse(response.getContentText());

    if (!data.success) {
      throw new Error(data.error || 'Request failed');
    }

    return data.data;

  } catch (error) {
    console.error(`[httpPost_] ${endpoint} failed: ${error.message}`);
    throw error;
  }
}
```

### Pattern: Idempotent Operations
```javascript
/**
 * CRITICAL: All operations that modify state MUST be idempotent
 * Check if operation already executed before proceeding
 */

// Example: Check if balance already updated today
function updateBalances_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payouts');
  const lastUpdateCell = sheet.getRange('B2'); // Timestamp cell
  const lastUpdate = lastUpdateCell.getValue();

  // Check if already updated today
  if (lastUpdate && isSameDay_(lastUpdate, new Date())) {
    console.log('[SKIP] Balances already updated today');
    return { success: true, skipped: true };
  }

  // Proceed with update
  const mercury = fetchMercurySummary_();
  const airwallex = fetchAirwallexSummary_();
  // ... update sheet

  // Update timestamp
  lastUpdateCell.setValue(new Date());

  return { success: true };
}

/**
 * Helper: Check if two dates are the same day
 */
function isSameDay_(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}
```

### Pattern: Dry Run Mode
```javascript
/**
 * All operations with side effects MUST support dry run mode
 * @param {boolean} dryRun - If true, simulate without making changes
 */
function processMonthlyPayments_(dryRun = false) {
  console.log(`[processMonthlyPayments_] Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const results = [];

  for (let i = 1; i < data.length; i++) {
    const userName = data[i][1];
    const amount = data[i][2];
    const status = data[i][5];

    if (status !== 'active') {
      continue;
    }

    if (dryRun) {
      console.log(`[DRY RUN] Would pay ${userName} €${amount}`);
      results.push({ user: userName, amount: amount, simulated: true });
    } else {
      // Execute real payment
      try {
        const result = httpPost_('/revolut/transfer', {
          to: userName,
          amount: amount,
          currency: 'EUR'
        });

        // Update sheet
        sheet.getRange(i + 1, 5).setValue(new Date());

        results.push({ user: userName, amount: amount, success: true });
      } catch (error) {
        console.error(`[ERROR] Payment to ${userName} failed: ${error}`);
        results.push({ user: userName, amount: amount, error: error.message });
      }
    }
  }

  return { success: true, results: results, dryRun: dryRun };
}
```

### Pattern: Graceful Error Handling
```javascript
/**
 * NEVER let one failure stop entire operation
 * Collect errors and continue processing
 */
function updateAllBankBalances_() {
  const results = {
    success: true,
    banks: {},
    errors: []
  };

  // Mercury
  try {
    results.banks.mercury = fetchMercurySummary_();
  } catch (error) {
    console.error(`[ERROR] Mercury: ${error.message}`);
    results.errors.push({ bank: 'mercury', error: error.message });
  }

  // Airwallex
  try {
    results.banks.airwallex = fetchAirwallexSummary_();
  } catch (error) {
    console.error(`[ERROR] Airwallex: ${error.message}`);
    results.errors.push({ bank: 'airwallex', error: error.message });
  }

  // Revolut
  try {
    results.banks.revolut = fetchRevolutSummary_();
  } catch (error) {
    console.error(`[ERROR] Revolut: ${error.message}`);
    results.errors.push({ bank: 'revolut', error: error.message });
  }

  // If ALL banks failed, mark as failure
  if (Object.keys(results.banks).length === 0) {
    results.success = false;
  }

  return results;
}
```

### Pattern: Audit Logging
```javascript
/**
 * Log all significant operations for audit trail
 */
function logOperation_(operation, details, status = 'success') {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Transactions');

  sheet.appendRow([
    new Date(),                              // Timestamp
    operation,                               // Operation name
    JSON.stringify(details),                 // Details (JSON)
    status,                                  // success/failure
    Session.getActiveUser().getEmail()       // User
  ]);
}

// Usage
function transferFunds_(from, to, amount) {
  try {
    const result = httpPost_('/revolut/transfer', { from, to, amount });

    logOperation_('transfer', { from, to, amount, result }, 'success');

    return { success: true, result };
  } catch (error) {
    logOperation_('transfer', { from, to, amount, error: error.message }, 'failure');
    throw error;
  }
}
```

### Pattern: Sheet Data Access
```javascript
/**
 * ALWAYS use named ranges or explicit row/column references
 * NEVER use magic numbers without comments
 */

// GOOD: Named constants
const SHEET_NAMES = {
  PAYOUTS: 'Payouts',
  USERS: 'Users',
  TRANSACTIONS: 'Transactions'
};

const PAYOUTS_COLUMNS = {
  MONTH: 1,           // A
  TIMESTAMP: 2,       // B
  MERCURY_USD: 3,     // C
  AIRWALLEX_USD: 4,   // D
  REVOLUT_EUR: 5,     // E
  WISE_EUR: 6,        // F
  NEXO_USD: 7         // G
};

function updateMercuryBalance_(balance) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.PAYOUTS);

  const currentRow = 2; // Row 2 = current month
  sheet.getRange(currentRow, PAYOUTS_COLUMNS.MERCURY_USD).setValue(balance);
}

// BAD: Magic numbers
function updateMercuryBalance_(balance) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payouts');
  sheet.getRange(2, 3).setValue(balance); // What does 2, 3 mean?
}
```

---

## Node.js Proxy Server Patterns

### Pattern: OAuth Token Management
```javascript
/**
 * Cache OAuth tokens in memory with expiry tracking
 * Auto-refresh on expiry or 401 errors
 */

// Token cache
const tokenCache = {
  revolut: { token: null, expiresAt: null },
  airwallex: { token: null, expiresAt: null }
};

/**
 * Get cached token or fetch new one
 * @param {string} bank - Bank name
 * @returns {Promise<string>} Access token
 */
async function getToken(bank) {
  const cached = tokenCache[bank];

  // Check if cached token is still valid (with 5 min buffer)
  if (cached.token && cached.expiresAt &&
      Date.now() < cached.expiresAt - 5 * 60 * 1000) {
    console.log(`[${bank}] Using cached token`);
    return cached.token;
  }

  // Fetch new token
  console.log(`[${bank}] Fetching new token`);
  const tokenData = await fetchNewToken(bank);

  // Cache token
  tokenCache[bank] = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000)
  };

  return tokenData.access_token;
}

/**
 * Fetch new token with bank-specific logic
 */
async function fetchNewToken(bank) {
  switch(bank) {
    case 'revolut':
      return await fetchRevolutToken();
    case 'airwallex':
      return await fetchAirwallexToken();
    default:
      throw new Error(`Unknown bank: ${bank}`);
  }
}
```

### Pattern: Retry with Exponential Backoff
```javascript
/**
 * Retry failed operations with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelay - Initial delay in ms
 * @returns {Promise<any>} Operation result
 */
async function retryWithBackoff(operation, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.error(`[Retry] Attempt ${attempt}/${maxRetries} failed: ${error.message}`);

      if (attempt === maxRetries) {
        throw new Error(`Operation failed after ${maxRetries} attempts: ${error.message}`);
      }

      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`[Retry] Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Usage
app.get('/revolut/transactions', async (req, res) => {
  try {
    const transactions = await retryWithBackoff(async () => {
      const token = await getToken('revolut');
      return await fetchRevolutTransactions(token);
    });

    res.json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### Pattern: Normalized API Responses
```javascript
/**
 * ALL endpoints MUST return normalized response format
 */

// Success response
{
  success: true,
  data: { /* actual data */ }
}

// Error response
{
  success: false,
  error: "Error message here"
}

// Implementation
app.get('/mercury/summary', async (req, res) => {
  try {
    const accounts = await fetchMercuryAccounts();
    const balances = calculateBalances(accounts);

    // ALWAYS return normalized format
    res.json({
      success: true,
      data: {
        usd: balances.usd,
        accounts: accounts
      }
    });

  } catch (error) {
    console.error('[/mercury/summary] Error:', error);

    // ALWAYS return normalized error format
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Pattern: Request Authentication
```javascript
/**
 * Middleware to verify API key on all requests
 */
function authenticateRequest(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Missing x-api-key header'
    });
  }

  if (apiKey !== process.env.API_KEY) {
    console.error('[AUTH] Invalid API key attempt');
    return res.status(403).json({
      success: false,
      error: 'Invalid API key'
    });
  }

  next();
}

// Apply to all routes except health check
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(authenticateRequest); // Apply to all routes below this line

app.get('/revolut/summary', async (req, res) => {
  // This route is now protected
});
```

### Pattern: Secure Logging
```javascript
/**
 * NEVER log sensitive data (tokens, keys, passwords)
 * ALWAYS redact secrets in logs
 */

// WRONG
console.log(`Using API key: ${apiKey}`);
console.log(`Token: ${token}`);

// RIGHT
function redact(secret) {
  if (!secret || secret.length < 8) return '[REDACTED]';
  return `${secret.substring(0, 4)}...${secret.substring(secret.length - 4)}`;
}

console.log(`Using API key: ${redact(apiKey)}`);
console.log(`Token: ${redact(token)}`);

// For objects with secrets
function redactObject(obj, secretKeys = ['token', 'apiKey', 'password', 'secret']) {
  const redacted = { ...obj };
  secretKeys.forEach(key => {
    if (redacted[key]) {
      redacted[key] = redact(redacted[key]);
    }
  });
  return redacted;
}

console.log('Request:', redactObject(requestData));
```

### Pattern: mTLS Client Configuration
```javascript
/**
 * Revolut requires mTLS (mutual TLS) authentication
 */
const https = require('https');
const fs = require('fs');
const axios = require('axios');

/**
 * Create HTTPS agent with mTLS certificates
 */
function createMTLSAgent() {
  return new https.Agent({
    cert: fs.readFileSync('.secrets/certs/client-cert.pem'),
    key: fs.readFileSync('.secrets/certs/privatekey.pem'),
    ca: fs.readFileSync('.secrets/certs/ca-cert.pem'),
    rejectUnauthorized: true // IMPORTANT: Verify server certificate
  });
}

/**
 * Make authenticated request to Revolut API
 */
async function callRevolutAPI(endpoint, method = 'GET', data = null) {
  const token = await getToken('revolut');

  const config = {
    method: method,
    url: `https://b2b.revolut.com/api/1.0${endpoint}`,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    httpsAgent: createMTLSAgent()
  };

  if (data) {
    config.data = data;
  }

  const response = await axios(config);
  return response.data;
}
```

---

## Swift macOS App Patterns

### Pattern: Reactive Network Monitoring
```swift
/**
 * NEVER use polling - use Apple native frameworks for reactive updates
 */
import Network
import SystemConfiguration

class StatusController {
    private var pathMonitor: NWPathMonitor?
    private var dynamicStore: SCDynamicStore?

    func startMonitoring() {
        // 1. Monitor network path changes
        pathMonitor = NWPathMonitor()
        pathMonitor?.pathUpdateHandler = { [weak self] path in
            if path.status == .satisfied {
                self?.checkIPAddress()
            }
        }
        pathMonitor?.start(queue: DispatchQueue.global())

        // 2. Monitor IP address changes
        var context = SCDynamicStoreContext(
            version: 0,
            info: UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque()),
            retain: nil,
            release: nil,
            copyDescription: nil
        )

        dynamicStore = SCDynamicStoreCreate(
            nil,
            "IPMonitor" as CFString,
            { (store, changedKeys, info) in
                guard let info = info else { return }
                let controller = Unmanaged<StatusController>.fromOpaque(info).takeUnretainedValue()
                controller.checkIPAddress()
            },
            &context
        )

        // Monitor State:/Network/Global/IPv4
        let pattern = "State:/Network/Global/IPv4" as CFString
        SCDynamicStoreSetNotificationKeys(dynamicStore!, nil, [pattern] as CFArray)

        let runLoopSource = SCDynamicStoreCreateRunLoopSource(nil, dynamicStore!, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), runLoopSource, .commonModes)
    }

    func stopMonitoring() {
        pathMonitor?.cancel()
        pathMonitor = nil

        if let store = dynamicStore {
            SCDynamicStoreSetNotificationKeys(store, nil, nil)
            dynamicStore = nil
        }
    }
}
```

### Pattern: IP Address Fetching
```swift
/**
 * Fetch public IP address with timeout and error handling
 */
import Foundation

func fetchPublicIP(completion: @escaping (Result<String, Error>) -> Void) {
    let url = URL(string: "https://api.ipify.org")!

    var request = URLRequest(url: url)
    request.timeoutInterval = 5.0

    let task = URLSession.shared.dataTask(with: request) { data, response, error in
        if let error = error {
            completion(.failure(error))
            return
        }

        guard let data = data,
              let ip = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) else {
            completion(.failure(NSError(domain: "IPFetch", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])))
            return
        }

        completion(.success(ip))
    }

    task.resume()
}

// Usage
fetchPublicIP { result in
    DispatchQueue.main.async {
        switch result {
        case .success(let ip):
            self.updateStatus(with: ip)
        case .failure(let error):
            print("Failed to fetch IP: \(error)")
            self.updateStatus(with: nil)
        }
    }
}
```

### Pattern: UserDefaults for Persistence
```swift
/**
 * Store data in UserDefaults with proper typing
 */
import Foundation

struct IPHistoryEntry: Codable {
    let timestamp: Date
    let ip: String
    let status: String
}

class IPHistory {
    private let maxEntries = 100
    private let key = "ipHistory"

    func addEntry(ip: String, status: String) {
        var history = getHistory()

        // Add new entry
        history.append(IPHistoryEntry(timestamp: Date(), ip: ip, status: status))

        // Keep only last N entries
        if history.count > maxEntries {
            history = Array(history.suffix(maxEntries))
        }

        // Save
        saveHistory(history)
    }

    func getHistory() -> [IPHistoryEntry] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let history = try? JSONDecoder().decode([IPHistoryEntry].self, from: data) else {
            return []
        }
        return history
    }

    private func saveHistory(_ history: [IPHistoryEntry]) {
        if let data = try? JSONEncoder().encode(history) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    func clearHistory() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
```

---

## Cross-Component Patterns

### Pattern: Error Response Format
```javascript
// CONSISTENT across all components

// Google Apps Script
function fetchBankData_() {
  try {
    const data = httpGet_('/mercury/summary');
    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Node.js Server
app.get('/mercury/summary', async (req, res) => {
  try {
    const data = await getMercuryData();
    res.json({ success: true, data: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Swift (for local operations)
struct OperationResult {
    let success: Bool
    let data: Any?
    let error: String?
}
```

### Pattern: Consistent Naming Conventions

```javascript
// GAS: Private functions end with underscore
function fetchMercurySummary_() { }   // Private
function updateBalances() { }         // Public (called from menu)

// Node.js: camelCase for functions
async function fetchMercuryAccounts() { }
async function getRevolutToken() { }

// Swift: camelCase for functions, PascalCase for types
func fetchPublicIP() { }
class StatusController { }
enum IPStatus { }
```

---

## Anti-Patterns to Avoid

### Anti-Pattern: Polling for Updates
```javascript
// WRONG - Do not poll
setInterval(() => {
  checkIPAddress();
}, 5000);

// RIGHT - Use reactive/event-driven approach
// In Swift: Use NWPathMonitor, SCDynamicStore
// In Node.js: Use webhooks or server-sent events
// In GAS: Use time-based triggers
```

### Anti-Pattern: Ignoring Errors
```javascript
// WRONG - Silent failures
try {
  const data = fetchData();
} catch (error) {
  // Do nothing
}

// RIGHT - Log and handle errors
try {
  const data = fetchData();
} catch (error) {
  console.error(`[fetchData] Error: ${error.message}`);
  logOperation_('fetchData', { error: error.message }, 'failure');
  throw error; // Re-throw or return error response
}
```

### Anti-Pattern: Hardcoded Credentials
```javascript
// WRONG
const apiKey = 'sk_live_1234567890abcdef';

// RIGHT
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable not set');
}
```

### Anti-Pattern: Non-Idempotent Operations
```javascript
// WRONG - Can duplicate payments if called twice
function processPayment(user, amount) {
  makePayment(user, amount);
  updateSheet(user, amount);
}

// RIGHT - Check if already processed
function processPayment(user, amount) {
  if (isAlreadyPaid(user, getCurrentMonth())) {
    console.log(`[SKIP] ${user} already paid this month`);
    return { success: true, skipped: true };
  }
  makePayment(user, amount);
  updateSheet(user, amount);
}
```

### Anti-Pattern: Magic Numbers
```javascript
// WRONG
sheet.getRange(2, 3).setValue(balance);

// RIGHT
const CURRENT_MONTH_ROW = 2;
const MERCURY_USD_COLUMN = 3;
sheet.getRange(CURRENT_MONTH_ROW, MERCURY_USD_COLUMN).setValue(balance);
```

### Anti-Pattern: Blocking Operations
```javascript
// WRONG - Blocks entire script
function updateAllBalances() {
  updateMercury();  // Takes 5 seconds
  updateAirwallex(); // Takes 5 seconds
  updateRevolut();   // Takes 5 seconds
  // Total: 15 seconds
}

// RIGHT - Use async/await for parallel execution
async function updateAllBalances() {
  const results = await Promise.allSettled([
    updateMercury(),
    updateAirwallex(),
    updateRevolut()
  ]);
  // Total: ~5 seconds (parallel)

  // Check results
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Bank ${index} failed: ${result.reason}`);
    }
  });
}
```

### Anti-Pattern: Insufficient Error Context
```javascript
// WRONG
catch (error) {
  console.error('Error occurred');
}

// RIGHT
catch (error) {
  console.error(`[fetchMercurySummary] Failed to fetch Mercury data: ${error.message}`, {
    stack: error.stack,
    timestamp: new Date().toISOString(),
    endpoint: '/mercury/summary'
  });
}
```

---

## Testing Patterns

### Pattern: Dry Run Testing
```javascript
// Test in dry run mode first
function testPaymentProcessing() {
  console.log('=== DRY RUN TEST ===');
  const results = processMonthlyPayments_(true); // dryRun = true
  console.log('Results:', JSON.stringify(results, null, 2));

  // Verify:
  // 1. Correct users identified
  // 2. Correct amounts calculated
  // 3. No actual API calls made
  // 4. No sheet modifications made
}
```

### Pattern: Mock Responses
```javascript
// Node.js: Environment variable to enable mocking
const MOCK_MODE = process.env.MOCK_MODE === 'true';

app.get('/mercury/summary', async (req, res) => {
  if (MOCK_MODE) {
    return res.json({
      success: true,
      data: {
        usd: 100000,
        accounts: [{ id: 'test', balance: 100000 }]
      }
    });
  }

  // Real implementation
  try {
    const data = await fetchMercuryAccounts();
    res.json({ success: true, data: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## Performance Patterns

### Pattern: Caching with TTL
```javascript
// Cache expensive operations with time-to-live
const cache = new Map();

function getCached(key, ttlMs, fetchFn) {
  const cached = cache.get(key);

  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[CACHE HIT] ${key}`);
    return cached.value;
  }

  console.log(`[CACHE MISS] ${key}`);
  const value = fetchFn();

  cache.set(key, {
    value: value,
    expiresAt: Date.now() + ttlMs
  });

  return value;
}

// Usage
function getBalances() {
  return getCached('balances', 5 * 60 * 1000, () => {
    // Expensive operation: fetch from all banks
    return fetchAllBankBalances();
  });
}
```

### Pattern: Batch Operations
```javascript
// Process multiple items in batches to avoid timeouts
function processBatch(items, batchSize, processFn) {
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1}...`);

    const batchResults = batch.map(processFn);
    results.push(...batchResults);

    // Optional: Add delay between batches to avoid rate limits
    if (i + batchSize < items.length) {
      Utilities.sleep(1000); // 1 second delay (GAS)
    }
  }

  return results;
}

// Usage
const users = getUsersSheet().getDataRange().getValues();
const results = processBatch(users, 10, processUserPayment);
```

---

## Documentation Patterns

### Pattern: Function Documentation (JSDoc)
```javascript
/**
 * Fetches account summary from Mercury API
 *
 * @param {Object} options - Configuration options
 * @param {Date} options.startDate - Start date for transaction range
 * @param {Date} options.endDate - End date for transaction range
 * @param {boolean} options.includeDetails - Include transaction details
 * @returns {Promise<Object>} Account summary object
 * @returns {number} returns.usd - Total balance in USD cents
 * @returns {Array<Object>} returns.accounts - Array of account objects
 * @throws {Error} If API request fails after retries
 *
 * @example
 * const summary = await fetchMercurySummary({
 *   startDate: new Date('2024-01-01'),
 *   endDate: new Date(),
 *   includeDetails: true
 * });
 * console.log(`Balance: $${summary.usd / 100}`);
 */
async function fetchMercurySummary(options = {}) {
  // Implementation
}
```

---

**Last Updated:** 2025-10-17
**Document Version:** 1.0
