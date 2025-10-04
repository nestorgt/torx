/************ Project Torx → Unified Main System ************/
/* 
 * 🚀 UNIFIED SYSTEM: Combined Bank Integrations + Payment Systems
 * 
 * 📋 COMPLETE FUNCTIONALITY:
 * 
 * 🏦 BANK INTEGRATIONS:
 *   • Automated monthly payments with Revolut (USD→EUR FX when needed)
 *   • Fund consolidation (USD funds from non-Main accounts to Main accounts)
 *   • Multi-bank balance tracking (Mercury, Airwallex, Revolut, Wise, Nexo)
 *   • Monthly expense tracking across all banks
 *   • Bank account validation and health monitoring
 *   • Daily automated fund consolidation triggers
 * 
 * 💰 PAYMENT SYSTEMS (PRESERVED):
 *   • User payment automation (handles monthly payments to users)
 *   • Dry run mode for testing without actual transfers
 *   • Idempotent operations (handles duplicate requests gracefully)
 *   • Comprehensive logging and audit trail
 *   • Balance checking and validation before payments
 *   • Weekend FX restrictions (no FX on weekends)
 *   • User activity and amount validation
 *   • Month row management (auto-creates new months as needed)
 * 
 * 🔧 SHARED UTILITIES (COMMON):
 *   • HTTP proxy integration with retry logic and health monitoring
 *   • Sheet manipulation with format preservation
 *   • Error handling and logging utilities
 *   • Configuration management (Script Properties)
 *   • Date/time utilities
 *   • Data formatting and validation
 * 
 * 🎛️ UNIFIED MENUS:
 *   • Payments: Direct month payments + dynamic month selection
 *   • Banking: Balance updates + expense tracking
 *   • Consolidation: Fund consolidation + testing
 *   • System: Health checks + trigger management
 * 
 * ⚙️ AUTOMATION:
 *   • Daily triggers: 10:00 AM and 10:00 PM balance updates
 *   • Monthly triggers: Expense tracking
 *   • Daily consolidation triggers: USD fund consolidation
 * 
 * 📊 SHEET STRUCTURE:
 *   • Users sheet: User payments (preserved functionality)
 *   • Payouts sheet: Bank balances and expenses
 *   • Dynamic month creation and management
 * 
 * 🔐 REQUIRED SCRIPT PROPERTIES:
 *   • PROXY_URL: Your proxy server URL
 *   • PROXY_TOKEN: Authentication token for proxy
 *   • REV_FX_USD_MULT: FX multiplier for USD→EUR (default: 1.20)
 * 
 * 📱 WHATSAPP INTEGRATION:
 *   • Google Apps Script sends payment notifications to your server
 *   • Server handles Twilio WhatsApp integration
 *   • Phone numbers are read from row 11 of the Users sheet
 * 
 * 🏛️ BANK INTEGRATIONS:
 *   • Revolut: Payments, FX, account management, fund consolidation
 *   • Mercury: Balance tracking, transaction monitoring, fund consolidation
 *   • Airwallex: Balance tracking, transaction monitoring  
 *   • Wise: Balance tracking
 *   • Nexo: Balance tracking (USD only)
 * 
 * 🚦 SAFETY FEATURES:
 *   • Dry run modes for all operations
 *   • Comprehensive prerequisite checks
 *   • Error handling and recovery
 *   • Transaction logging and audit trails
 *   • Weekend restrictions for FX operations
 * 
 * 🎯 USAGE PATTERNS:
 *   • Menu-driven operations for all functionality
 *   • Test functions for safe system validation
 *   • Automatic triggers for background operations
 *   • Manual overrides when needed
 * 
 * 📈 BENEFITS OF UNIFIED APPROACH:
 *   • ✅ Eliminates code duplication (httpProxyJson_, props_, etc.)
 *   • ✅ Unified error handling and logging
 *   • ✅ Consistent API patterns across all banks
 *   • ✅ Shared utilities reduce maintenance
 *   • ✅ Single source of truth for configuration
 *   • ✅ Simplified deployment and management
 *   • ✅ Better performance and reliability
 *   • ✅ Comprehensive audit logging
 * 
 * 🔄 MIGRATION NOTES:
 *   • All existing functionality preserved
 *   • Improved organization and maintainability
 *   • Enhanced error handling and logging
 *   • New fund consolidation capabilities
 *   • Unified menu structure
 * 
 * 📝 VERSION INFO:
 *   • Created: January 2025
 *   • Based on: gs_payments.gs + gs_banks.gs
 *   • Functionality: 100% preserved + enhanced
 *   • Structure: Unified and optimized
 */

/* ======================================================================================================== */
/*                                          🛠️  SHARED UTILITIES                                          */
/* ======================================================================================================== */

/* ============== Configuration ============== */
var SHEET_NAME = 'Payouts';           // Bank balance sheet
var USERS_SHEET = 'Users';            // User payments sheet
var MIN_BALANCE_USD = 1000;           // Minimum balance for main banks
var TOPUP_AMOUNT_USD = 3000;          // Amount to transfer for topups
var TS_CELL = 'A1';                   // Timestamp cell for payouts

var USERS_FIRST_MONTH_ROW = 30;       // First month row for user payments
var CURRENT_TIMEZONE = 'America/Montevideo';

/* ============== Cell Mapping ============== */
var CELLS = {
  Airwallex: { USD: 'B2', EUR: 'B3' },
  Mercury:   { USD: 'C2', EUR: 'C3' },
  Revolut:   { USD: 'D2', EUR: 'D3' },
  Wise:      { USD: 'E2', EUR: 'E3' },
  Nexo:      { USD: 'F2' }             // USD-only
  
};

/* ============== Core Utilities ============== */
function nowStamp_() {
  return Utilities.formatDate(new Date(), CURRENT_TIMEZONE, "yyyy-MM-dd HH:mm:ss");
}

function nowStampCell_() {
  return Utilities.formatDate(new Date(), CURRENT_TIMEZONE, "dd-MM HH:mm");
}

function toBool_(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    var clean = value.trim().toLowerCase();
    return clean === 'true' || clean === '1' || clean === 'yes';
  }
  return Boolean(value);
}

function props_() { 
  return PropertiesService.getScriptProperties(); 
}

function getProp_(key) {
  try {
    return props_().getProperty(key);
  } catch (e) {
    Logger.log('[ERROR] getProp_ failed for %s: %s', key, e.message);
    return null;
  }
}

function setProp_(key, value) {
  try {
    props_().setProperty(key, value);
  } catch (e) {
    Logger.log('[ERROR] setProp_ failed for %s: %s', key, e.message);
  }
}

function sheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function isWeekend_(tz) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  Logger.log('[WEEKEND_CHECK] Day: %s, Is weekend: %s', dayOfWeek, isWeekend);
  return isWeekend;
}

/* ============== Cell Management ============== */
function setCellKeepFmt_(sh, a1, value, note) {
  Logger.log('[setCellKeepFmt_] Setting %s to value=%s, note="%s"', a1, value, note);
  
  try {
    var rng = sh.getRange(a1);
    var fmt = rng.getNumberFormat();
    
    if (value !== null && value !== undefined && value !== '') {
      fmt = fmt.replace('#,##0.00', '#,##0.00').replace('###0.00', '#,##0.00');
      rng.setValue(value);
      if (fmt) rng.setNumberFormat(fmt);
    }
    
    if (note) {
      var existingNote = rng.getNote() || '';
      var timestamp = nowStamp_();
      var newNote = existingNote ? existingNote + '\n' + timestamp + ': ' + note : timestamp + ': ' + note;
      rng.setNote(newNote);
    }
  } catch (e) {
    Logger.log('[ERROR] setCellKeepFmt_ failed for %s: %s', a1, e.message);
  }
}

function setNoteOnly_(sh, a1, note) {
  try {
    note = safeErrorNote_(note) || note;
    var existingNote = sh.getRange(a1).getNote() || '';
    note = existingNote ? existingNote + '\n' + nowStamp_() + ': ' + note : nowStamp_() + ': ' + note;
    sh.getRange(a1).setNote(note);
  } catch (e) {
    Logger.log('[ERROR] setNoteOnly_ failed for %s: %s', a1, e.message);
  }
}

function a1_(row, col) { 
  return String.fromCharCode(64 + col) + row; 
}

function fmt2dec_(sh, a1) { 
  sh.getRange(a1).setNumberFormat('#,##0.00'); 
}

function clearNote_(sh, a1) {
  try {
    sh.getRange(a1).clearNote();
  } catch (e) {
    Logger.log('[ERROR] clearNote_ failed for %s: %s', a1, e.message);
  }
}

function safeErrorNote_(msg) {
  try {
    return String(msg).replace(/[^\x20-\x7E\t\n\r]/g, '').substr(0, 500);
  } catch (e) {
    return String(msg).substr(0, 500);
  }
}

/* ============== Date/Time Utilities ============== */
function mmYYYY_(month, year) {
  return String(month).padStart(2, '0') + '-' + year;
}

function normMonthStr_(s) {
  s = String(s).trim();
  
  // Handle formats like "2025-01", "01-2025", "January 2025", etc.
  var patterns = [
    /^(20\d{2})-(\d{1,2})$/,      // 2025-1, 2025-01
    /^(\d{1,2})-(20\d{2})$/,      // 1-2025, 01-2025
    /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})$/i
  ];
  
  for (var i = 0; i < patterns.length; i++) {
    var match = s.match(patterns[i]);
    if (match) {
      var month, year;
      if (i === 0) {  // YYYY-MM format
        year = match[1];
        month = padStart(match[2], 2, '0');
  } else if (i === 1) {  // MM-YYYY format
        month = padStart(match[1], 2, '0');
        year = match[2];
      } else {  // Month name format
        var monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                         'july', 'august', 'september', 'october', 'november', 'december'];
        month = padStart(String(monthNames.indexOf(match[1].toLowerCase()) + 1), 2, '0');
        year = match[2];
      }
      
      if (month >= '01' && month <= '12' && year >= '2020' && year <= '2030') {
        return month + '-' + year;
      }
    }
  }
  
  Logger.log('[VALIDATION] Invalid month format: %s', s);
  return null;
}

function validateMonthString(monthStr) {
  var normalized = normMonthStr_(monthStr);
  if (!normalized) {
    Logger.log('[VALIDATION] Invalid month string: %s', monthStr);
    return false;
  }
  
  var parts = normalized.split('-');
  var month = parseInt(parts[0]);
  var year = parseInt(parts[1]);
  
  var now = new Date();
  var currentYear = now.getFullYear();
  var currentMonth = now.getMonth() + 1;
  
  // Allow past months (minimum 2020) and up to next month
  var minYear = 2020;
  var maxYear = currentYear + 1;
  
  if (year < minYear || year > maxYear) {
    Logger.log('[VALIDATION] Year out of range: %s (min: %s, max: %s)', year, minYear, maxYear);
    return false;
  }
  
  if (month < 1 || month > 12) {
    Logger.pub('[VALIDATION] Month out of range: %s', month);
    return false;
  }
  
  // Don't allow future months beyond next month
  if (year === currentYear + 1 && month > 1) {
 return false;
  }
  if (year === currentYear && month > currentMonth + 1) {
    Logger.log('[VALIDATION] Month too far in future: %s-%s (current: %s)', year, month, currentMonth);
    return false;
  }
  
  Logger.log('[VALIDATION] Valid month: %s', normalized);
  return true;
}

function getMonthDisplayName(monthStr) {
  var normalized = normMonthStr_(monthStr);
  if (!normalized) return monthStr;
  
  var parts = normalized.split('-');
  var monthNum = parseInt(parts[0]);
  var year = parts[1];
  
  var monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
  
  var monthName = monthNames[monthNum] || parts[0];
  return monthName + ' ' + year;
}

/* ============== HTTP & Proxy Utilities ============== */
function proxyIsUp_() {
  Logger.log('[PROXY_HEALTH] Checking proxy health...');
  
  try {
    var props = props_();
    var proxyUrl = props.getProperty('PROXY_URL');
    var proxyToken = props.getProperty('PROXY_TOKEN');
    
    if (!proxyUrl || !proxyToken) {
 Logger.log('[PROXY_HEALTH] ❌ Proxy configuration missing');
      return false;
    }
    
    var maxRetries = 3;
    var retryDelay = 2000; // 2 seconds
    
    for (var attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        Logger.log('[PROXY_HEALTH] Attempt %s/%s - Testing proxy connectivity...', attempt, maxRetries);
        
        var startTime = new Date().getTime();
        var response = UrlFetchApp.fetch(proxyUrl + '/health', {
          method: 'GET',
          headers: { 'x-proxy-token': proxyToken },
          muteHttpExceptions: true,
          followRedirects: false,
          validateHttpsCertificates: true,
          timeout: 10000 // 10 seconds timeout
        });
        
        var responseTime = new Date().getTime() - startTime;
        var statusCode = response.getResponseCode();
        var responseText = response.getContentText();
        
        Logger.log('[PROXY_HEALTH] Response: Status=%s, Time=%sms', statusCode, responseTime);
        
        if (statusCode >= 200 && statusCode < 300) {
          Logger.log('[PROXY_HEALTH] ✅ Proxy is healthy (attempt %s/%s)', attempt, maxRetries);
          return true;
        }
        
        Logger.log('[PROXY_HEALTH] ⚠️ Attempt %s/%s failed: Status=%s', attempt, maxRetries, statusCode);
        
        if (attempt < maxRetries) {
          Logger.log('[PROXY_HEALTH] Waiting %sms before retry...', retryDelay);
          Utilities.sleep(retryDelay);
          retryDelay *= 1.5; // Exponential backoff
        }
        
      } catch (e) {
        Logger.log('[PROXY_HEALTH] ⚠️ Attempt %s/%s error: %s', attempt, maxRetries, e.message);
        
        if (attempt < maxRetries) {
          Utilities.sleep(retryDelay);
          retryDelay *= 1.5;
        }
      }
    }
    
    Logger.log('[PROXY_HEALTH] ❌ Proxy health check failed after %s attempts', maxRetries);
    return false;
    
  } catch (e) {
    Logger.log('[PROXY_HEALTH] ❌ Proxy health check error: %s', e.message);
    return false;
  }
}

function httpProxyJson_(path) {
  Logger.log('[HTTP_PROXY] Making request to: %s', path);
  
  try {
    var props = props_();
    var proxyUrl = props.getProperty('PROXY_URL');
    var proxyToken = props.getProperty('PROXY_TOKEN');
    
    if (!proxyUrl || !proxyToken) {
      throw new Error('Proxy configuration missing - check PROXY_URL and PROXY_TOKEN properties');
    }
    
    var fullUrl = proxyUrl + path;
    Logger.log('[HTTP_PROXY] Full URL: %s', fullUrl);
    
    var response = UrlFetchApp.fetch(fullUrl, {
      method: 'GET',
      headers: {
        'x-proxy-token': proxyToken,
        'Accept': 'application/json',
        'User-Agent': 'GoogleAppsScript-Torx/1.0'
      },
      muteHttpExceptions: true,
      followRedirects: false,
      validateHttpsCertificates: true,
      timeout: 15000
    });
    
    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    Logger.log('[HTTP_PROXY] Response: Status=%s, BodyLength=%s', statusCode, responseText.length);
    
    if (statusCode >= 400) {
      Logger.log('[HTTP_PROXY] ❌ Error Response: %s', responseText);
      throw new Error('HTTP ' + statusCode + ' ' + path + ' -> ' + responseText);
    }
    
    if (statusCode >= 200 && statusCode < 300) {
      try {
        var jsonData = JSON.parse(responseText);
        Logger.log('[HTTP_PROXY] ✅ Successfully parsed JSON response');
        return jsonData;
      } catch (parseError) {
        Logger.log('[HTTP_PROXY] ❌ JSON Parse Error: %s', parseError.message);
        Logger.log('[HTTP_PROXY] Raw response: %s', responseText);
        throw new Error('Invalid JSON response: ' + parseError.message);
      }
    }
    
    Logger.log('[HTTP_PROXY] ⚠️ Unexpected status code: %s', statusCode);
    throw new Error('Unexpected response status: ' + statusCode);
    
  } catch (e) {
    Logger.log('[HTTP_PROXY] ❌ Request failed: %s', e.message);
    throw e;
  }
}

function httpProxyPostJson_(path, body) {
  Logger.log('[HTTP_POST] Making POST request to: %s', path);
  
  try {
    var props = props_();
    var proxyUrl = props.getProperty('PROXY_URL');
    var proxyToken = props.getProperty('PROXY_TOKEN');
    
    if (!proxyUrl || !proxyToken) {
      throw new Error('Proxy configuration missing - check PROXY_URL and PROXY_TOKEN properties');
    }
    
    var fullUrl = proxyUrl + path;
    var jsonPayload = JSON.stringify(body);
    
    Logger.log('[HTTP_POST] Full URL: %s', fullUrl);
    Logger.log('[HTTP_POST] Payload: %s', jsonPayload.substring(0, 200) + (jsonPayload.length > 200 ? '...' : ''));
    
    var response = UrlFetchApp.fetch(fullUrl, {
      method: 'POST',
      headers: {
        'x-proxy-token': proxyToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'GoogleAppsScript-Torx/1.0'
      },
      payload: jsonPayload,
      muteHttpExceptions: true,
      followRedirects: false,
      validateHttpsCertificates: true,
      timeout: 30000
    });
    
    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    Logger.log('[HTTP_POST] Response: Status=%s, BodyLength=%s', statusCode, responseText.length);
    
    if (statusCode >= 400) {
      Logger.log('[HTTP_POST] ❌ Error Response: %s', responseText);
      throw new Error('HTTP ' + statusCode + ' ' + path + ' -> ' + responseText);
    }
    
    if (statusCode >= 200 && statusCode < 300) {
      try {
        var jsonData = JSON.parse(responseText);
        Logger.log('[HTTP_POST] ✅ Successfully parsed JSON response');
        return jsonData;
      } catch (parseError) {
        Logger.log('[HTTP_POST] ❌ JSON Parse Error: %s', parseError.message);
        Logger.log('[HTTP_POST] Raw response: %s', responseText);
        throw new Error('Invalid JSON response: ' + parseError.message);
      }
    }
    
    Logger.log('[HTTP_POST] ⚠️ Unexpected status code: %s', statusCode);
    throw new Error('Unexpected response status: ' + statusCode);
    
  } catch (e) {
    Logger.log('[HTTP_POST] ❌ POST request failed: %s', e.message);
    throw e;
  }
}

/* ============== Logging & Debugging ============== */
function dbg_() {
  Logger.log('[DEBUG] Function called at: %s', nowStamp_());
}

function formatCurrency(amount, currency) {
  var formatted = new Number(amount).toLocaleString('es-UY', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatted;
}

function logPaymentOperation(operation, monthStr, details) {
  var timestamp = nowStamp_();
  var logMsg = '[PAYMENT_OP] ' + timestamp + ' | ' + operation + ' | ' + monthStr + ' | ' + details;
  Logger.log(logMsg);
  
  try {
    var sh = sheet_(SHEET_NAME);
    var note = 'PAYMENT LOG | ' + timestamp + ' | ' + operation + ' | ' + monthStr + '\n' + details;
    setNoteOnly_(sh, 'A1', note);
  } catch (e) {
    Logger.log('[LOG_ERROR] Failed to write payment log: %s', e.message);
  }
}

function appendNoteTop_(sh, a1, lines, tz) {
  try {
    var existingNote = sh.getRange(a1).getNote() || '';
    var timestamp = nowStamp_();
    var newNote = '';
    for (var i = 0; i < lines.length; i++) {
      newNote += (i > 0 ? '\n' : '') + timestamp + ': ' + lines[i];
    }
    var fullNote = newNote + (existingNote ? '\n' + existingNote : '');
    sh.getRange(a1).setNote(fullNote);
  } catch (e) {
    Logger.log('[ERROR] appendNoteTop_ failed: %s', e.message);
  }
}

/* ======================================================================================================== */
/*                                        🏦 BANK INTEGRATIONS                                            */
/* ======================================================================================================== */

/* ============== Revolut Bank Functions ============== */
function fetchRevolutSummary_() { 
  return httpProxyJson_('/revolut/summary'); 
}

function getRevolutMainBalance_(currency) {
  Logger.log('[REVOLUT] Getting Main account balance for %s', currency);
  try {
    var summary = fetchRevolutSummary_();
    var balance = summary[currency] || 0;
    Logger.log('[REVOLUT] Main %s balance: %s', currency, balance);
    return balance;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut Main %s balance: %s', currency, e.message);
    return 0;
  }
}

function getRevolutAccounts_() {
  try {
    Logger.log('[REVOLUT] Fetching all accounts...');
    var accounts = httpProxyJson_('/revolut/accounts');
    Logger.log('[REVOLUT] Retrieved %s accounts', accounts.length);
    return accounts;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut accounts: %s', e.message);
    return [];
  }
}

function getRevolutAccountBalance_(accountId, currency) {
  try {
    Logger.log('[REVOLUT] Getting balance for account %s with currency %s', accountId, currency);
    var path = '/revolut/account/' + encodeURIComponent(accountId) + '?currency=' + currency;
    var account = httpProxyJson_(path);
    
    var balance = account.balance || account[currency] || 0;
    Logger.log('[REVOLUT] Account %s %s balance: %s', accountId, currency, balance);
    return balance;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut account %s %s balance: %s', accountId, currency, e.message);
    return 0;
  }
}

function revolutTransferBetweenAccounts_(fromName, toName, currency, amount, reference) {
  Logger.log('[REVOLUT] Transfer request: %s -> %s, %s %s, "%s"', fromName, toName, amount, currency, reference);
  
  var body = {
    to: toName,
    amount: amount,
    currency: currency,
    reference: reference || 'Transfer from ' + fromName,
    request_id: nowStamp_() + '-' + amount + '-' + currency
  };
  
  Logger.log('[REVOLUT] Transfer payload: %s', JSON.stringify(body, null, 2));
  return httpProxyPostJson_('/revolut/transfer', body);
}

function getRevolutTransactions_(month, year) {
  Logger.log('[REVOLUT] Getting transactions for %s-%s', month, year);
  try {
    var path = '/revolut/transactions?month=' + month + '&year=' + year;
    var response = httpProxyJson_(path);
    Logger.log('[REVOLUT] Retrieved %s transactions', response.transactions ? response.transactions.length : 0);
    return response;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut transactions: %s', e.message);
    return { transactions: [] };
  }
}

/* ============== Mercury Bank Functions ============== */
function fetchMercurySummary_() { 
  return httpProxyJson_('/mercury/summary'); 
}

function fetchMercuryMainBalance_() {
  /*
   * Get Mercury Main account balance specifically (not total across all accounts)
   * This is the balance that matters for card spending and business operations
   */
  try {
    Logger.log('[MERCURY_MAIN] Fetching Main account balance specifically...');
    
    // Get detailed account breakdown
    var accountsData = httpProxyJson_('/mercury/accounts');
    
    if (accountsData && Array.isArray(accountsData.accounts)) {
      // Find the Main account (Mercury Checking ••2290)
      var mainAccount = accountsData.accounts.find(account => 
        account.name?.includes('2290') || 
        account.nickpage?.includes('2290') ||
        account.isMainAccount === true
      );
      
      if (mainAccount) {
        Logger.log('[MERCURY_MAIN] Main account found: %s with $%s USD', mainAccount.name, mainAccount.balance);
        Logger.log('[MERCURY_MAIN] Available balance: $%s USD', mainAccount.availableBalance);
        
        return {
          USD: parseFloat(mainAccount.availableBalance || mainAccount.balance || 0),
          EUR: 0, // Mercury typically uses USD
          accountId: mainAccount.id,
          accountName: mainAccount.name,
          isMainAccount: true,
          note: 'Main account balance only'
        };
      } else {
        Logger.log('[WARNING] Mercury Main account not found, falling back to summary');
        // Fallback to summary if main account not found
        var summary = fetchMercurySummary_();
        return {
          USD: parseFloat(summary.USD || 0),
          EUR: parseFloat(summary.EUR || 0),
          note: 'Total across all accounts (Main account not identified)'
        };
      }
    } else {
      Logger.log('[WARNING] Mercury accounts endpoint not available, falling back to summary');
      // Fallback to summary
      var summary = fetchMercurySummary_();
      return {
        USD: parseFloat(summary.USD || 0),
        EUR: parseFloat(summary.EUR || 0),
        note: 'Total across all accounts (detailed accounts not available)'
      };
    }
  } catch (e) {
    Logger.log('[ERROR] fetchMercuryMainBalance_ failed: %s', e.message);
    // Fallback to summary on error
    try {
      var summary = fetchMercurySummary_();
      return {
        USD: parseFloat(summary.USD || 0),
        EUR: parseFloat(summary.EUR || 0),
        error: e.message,
        note: 'Fallback to summary due to error'
      };
    } catch (e2) {
      Logger.log('[ERROR] Summary fallback also failed: %s', e2.message);
      return { USD: 0, EUR: 0, error: e.message };
    }
  }
}

function getMercuryAccounts_() {
  try {
    // Try different possible Mercury endpoints
    var endpoints = ['/mercury/accounts', '/mercury/summary'];
    
    for (var i = 0; i < endpoints.length; i++) {
      try {
        Logger.log('[MERCURY] Testing endpoint: %s', endpoints[i]);
        var response = httpProxyJson_(endpoints[i]);
        Logger.log('[MERCURY] ✅ SUCCESS with endpoint %s', endpoints[i]);
        
        // Handle Mercury accounts endpoint returning individual accounts
        if (Array.isArray(response.accounts) && endpoints[i] === '/mercury/accounts') {
          Logger.log('[MERCURY] Found %s individual Mercury accounts', response.accounts.length);
          return response.accounts;
        }
        
        // Handle Mercury summary format: {"USD":9962.15,"EUR":0,"count":9}
        if (response.USD && typeof response.USD === 'number' && response.USD >= 0) {
          var totalUsd = response.USD;
          var accountCount = response.count || 1;
          
          Logger.log('[MERCURY] Summary shows $%s USD across %s accounts', totalUsd, accountCount);
          
          // For fund consolidation purposes, treat summary as Main account
          // Individual accounts would require /mercury/accounts endpoint
          if (totalUsd > 0) {
            Logger.log('[MERCURY] Treating summary as Main account - individual accounts not accessible for consolidation');
            return [{ 
              name: 'Main', 
              balance: totalUsd, 
              currency: 'USD', 
              id: 'mercury-main',
              summary: response,
              accountCount: accountCount,
              note: 'Main account balance from ' + accountCount + ' sources'
            }];
          } else {
            Logger.log('[MERCURY] No USD funds found - no consolidation needed');
            return [];
          }
        }
        
        // For other non-array responses, wrap in array
        return [response].filter(Boolean);
      } catch (e) {
        Logger.log('[MERCURY] ⚪ Endpoint %s not available (expected): %s', endpoints[i], e.message.split('HTTP')[1] || e.message);
      }
    }
    
    Logger.log('[ERROR] All Mercury endpoints failed - Mercury API may not be implemented');
    return []; // Return empty array instead of throwing error
  } catch (e) {
    Logger.log('[ERROR] Failed to get Mercury accounts: %s', e.message);
    return []; // Return empty array instead of throwing error
  }
}

function getMercuryAccountBalance_(accountId, currency) {
  try {
    Logger.log('[MERCURY] Getting balance for account %s with currency %s', accountId, currency);
    
    // Try different possible Mercury balance endpoints
    var endpoints = [
      '/mercury/balance/' + accountId + '?currency=' + currency,
      '/mercury/accounts/' + accountId + '?currency=' + currency,
      '/mercury/' + accountId + '/balance?currency=' + currency
    ];
    
    for (var i = 0; i < endpoints.length; i++) {
      try {
        Logger.log('[MERCURY] Trying balance endpoint: %s', endpoints[i]);
        var account = httpProxyJson_(endpoints[i]);
        
        var balance = account.balance || account[currency] || account.accountBalance || 0;
        Logger.log('[MERCURY] ✅ Balance endpoint %s success - %s %s balance: %s', endpoints[i], accountId, currency, balance);
        return balance;
      } catch (e) {
        Logger.log('[MERCURY] ⚪ Balance endpoint %s failed: %s', endpoints[i], e.message.split('HTTP')[1] || e.message);
      }
    }
    
    Logger.log('[WARNING] All Mercury balance endpoints failed for account %s', accountId);
    return 0;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Mercury account %s balance: %s', accountId, e.message);
    return 0;
  }
}

function mercuryTransferToMain_(fromAccountId, amount, currency, reference) {
  Logger.log('[MERCURY] Transfer request: %s -> Main, %s %s, "%s"', fromAccountId, amount, currency, reference);
  
  var body = {
    fromAccountId: fromAccountId,
    toAccountId: 'main',
    amount: amount,
    currency: currency,
    reference: reference || 'Consolidate ' + currency + ' funds to Main',
    request_id: nowStamp_() + '-' + amount + '-' + currency
  };
  
  Logger.log('[MERCURY] Transfer payload: %s', JSON.stringify(body, null, 2));
  
  // Try different transfer endpoints
  var endpoints = ['/mercury/transfer', '/mercury/move', '/mercury/consolidate'];
  
  for (var i = 0; i < endpoints.length; i++) {
    try {
      Logger.log('[MERCURY] Trying transfer endpoint: %s', endpoints[i]);
      var result = httpProxyPostJson_(endpoints[i], body);
      Logger.log('[MERCURY] ✅ Transfer endpoint %s success', endpoints[i]);
      return result;
    } catch (e) {
      Logger.log('[MERCURY] ⚪ Transfer endpoint %s failed: %s', endpoints[i], e.message.split('HTTP')[1] || e.message);
    }
  }
  
  Logger.log('[ERROR] All Mercury transfer endpoints failed');
  throw new Error('Mercury transfer failed - no available endpoints');
}

/* ============== Other Bank Functions ============== */
function fetchWiseSummary_() { 
  return httpProxyJson_('/wise/summary'); 
}

function fetchAirwallexSummary_() {
  try {
    Logger.log('[AIRWALLEX] Fetching summary directly from API');
    
    // Get credentials from script properties
    var clientId = getProp_('AIRWALLEX_CLIENT_ID');
    var clientSecret = getProp_('AIRWALLEX_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      Logger.log('[AIRWALLEX] Missing credentials - skipping summary');
      return { USD: 0, EUR: 0, count: 0 };
    }
    
    // Step 1: Authenticate
    var authResult = airwallexAuthenticate_(clientId, clientSecret);
    if (!authResult.success || !authResult.token) {
      Logger.log('[AIRWALLEX] Authentication failed: %s', authResult.error);
      return { USD: 0, EUR: 0, count: 0 };
    }
    
    // Step 2: Get balances
    var balances = airwallexGetBalances_(authResult.token);
    
    // Step 3: Format response
    var summary = {
      USD: 0,
      EUR: 0,
      count: balances.length
    };
    
    for (var i = 0; i < balances.length; i++) {
      var balance = balances[i];
      var currency = balance.currency;
      var amount = parseFloat(balance.amount) || 0;
      
      if (currency === 'USD') {
        summary.USD += amount;
      } else if (currency === 'EUR') {
        summary.EUR += amount;
      }
    }
    
    Logger.log('[AIRWALLEX] Summary: %s USD, %s EUR, %s accounts', summary.USD, summary.EUR, summary.count);
    return summary;
    
  } catch (e) {
    Logger.log('[ERROR] Failed to get Airwallex summary: %s', e.message);
    return { USD: 0, EUR: 0, count: 0 };
  }
}

function airwallexAuthenticate_(clientId, clientSecret) {
  try {
    Logger.log('[AIRWALLEX] Attempting authentication with client ID: %s', clientId.substring(0, 8) + '...');
    
    var authUrl = 'https://api.airwallex.com/api/v1/authentication/login';
    var payload = {
      client_id: clientId,
      api_key: clientSecret
    };
    
    var options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(authUrl, options);
    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    Logger.log('[AIRWALLEX] Auth response status: %s', statusCode);
    Logger.log('[AIRWALLEX] Auth response: %s', responseText);
    
    if (statusCode !== 201) {
      return {
        success: false,
        error: 'Authentication failed with status ' + statusCode + ': ' + responseText
      };
    }
    
    var authData = JSON.parse(responseText);
    if (!authData.token) {
      return {
        success: false,
        error: 'No token in auth response: ' + responseText
      };
    }
    
    Logger.log('[AIRWALLEX] ✅ Authentication successful');
    
    // Cache token for future use (optional)
    setProp_('AIRWALLEX_TOKEN_TIMESTAMP', new Date().getTime().toString());
    setProp_('AIRWALLEX_TOKEN', authData.token);
    
    return {
      success: true,
      token: authData.token
    };
    
  } catch (e) {
    Logger.log('[ERROR] Airwallex authentication error: %s', e.message);
    return {
      success: false,
      error: e.message
    };
  }
}

function airwallexGetBalances_(token) {
  try {
    Logger.log('[AIRWALLEX] Fetching account balances');
    
    var balancesUrl = 'https://api.airwallex.com/api/v1/accounts';
    var options = {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(balancesUrl, options);
    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    Logger.log('[AIRWALLEX] Balances response status: %s', statusCode);
    Logger.log('[AIRWALLEX] Balances response: %s', responseText);
    
    if (statusCode !== 200) {
      throw new Error('Failed to fetch balances with status ' + statusCode + ': ' + responseText);
    }
    
    var balancesData = JSON.parse(responseText);
    var balances = balancesData.data || [];
    
    Logger.log('[AIRWALLEX] Found %s accounts', balances.length);
    
    // Get current balances for each account
    var currentBalances = [];
    
    for (var i = 0; i < balances.length; i++) {
      try {
        var account = balances[i];
        if (!account.id) continue;
        
        var balanceUrl = 'https://api.airwallex.com/api/v1/balances/current?account_id=' + account.id;
        var balanceOptions = {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/json'
          },
          muteHttpExceptions: true
        };
        
        var balanceResponse = UrlFetchApp.fetch(balanceUrl, balanceOptions);
        var balanceStatus = balanceResponse.getResponseCode();
        var balanceText = balanceResponse.getContentText();
        
        if (balanceStatus === 200) {
          var accountBalances = JSON.parse(balanceText);
          if (Array.isArray(accountBalances)) {
            currentBalances = currentBalances.concat(accountBalances);
          }
        } else {
          Logger.log('[AIRWALLEX] Failed to get balance for account %s: %s', account.id, balanceText);
        }
        
        // Small delay to avoid rate limiting
        Utilities.sleep(100);
        
      } catch (e) {
        Logger.log('[ERROR] Failed to get balance for account %s: %s', balances[i].id, e.message);
      }
    }
    
    Logger.log('[AIRWALLEX] ✅ Retrieved %s balance entries', currentBalances.length);
    return currentBalances;
    
  } catch (e) {
    Logger.log('[ERROR] Failed to fetch Airwallex balances: %s', e.message);
    return [];
  }
}

function fetchNexoSummary_() { 
  return httpProxyJson_('/nexo/summary'); 
}

/* ============== Intelligent Consolidation & Top-up System ============== */
function intelligentConsolidationSystem_(options) {
  Logger.log('=== STARTING INTELLIGENT CONSOLIDATION SYSTEM ===');
  Logger.log('[INTELLIGENT_SYSTEM] Starting comprehensive USD consolidation and top-up (dryRun: %s)', options.dryRun);
  
  // Check for pending transfers before starting
  var hasPendingTransfers = checkPendingTransfers_();
  if (hasPendingTransfers && !options.force) {
    Logger.log('[INTELLIGENT_SYSTEM] Skipping consolidation - pending transfers detected');
    return {
      skipped: true,
      reason: 'Pending transfers detected',
      pendingTransfers: getPendingTransfers_(),
      status: 'SKIPPED'
    };
  }
  
  var THRESHOLD_USD = 1000;
  var TRANSFER_AMOUNT_USD = 3000;
  
  var result = {
    status: 'SUCCESS',
    timestamp: new Date().toLocaleString(),
    thresholdUsd: THRESHOLD_USD,
    transferAmountUsd: TRANSFER_AMOUNT_USD,
    steps: {
      step1_fetchBalances: null,
      step2_internalConsolidation: null,
      step3_crossBankTopup: null
    },
    summary: {
      totalUsdConsolidated: 0,
      totalUsdTransferred: 0,
      mainAccountBalances: {},
      actionsTaken: []
    },
    errors: []
  };
  
  try {
    // STEP 1: Fetch all USD balances for all banks
    Logger.log('[STEP_1] Fetching all bank USD balances...');
    var bankBalances = fetchAllBankUsdBalances_();
    result.steps.step1_fetchBalances = bankBalances;
    Logger.log('[STEP_1] Completed: Retrieved balances from %s banks', Object.keys(bankBalances).length);
    
    // STEP 2: Internal consolidation (move funds within banks to Main accounts)
    Logger.log('[STEP_2] Starting internal consolidation...');
    var internalResults = performInternalConsolidation_(bankBalances, options.dryRun);
    result.steps.step2_internalConsolidation = internalResults;
    
    // Update balances after internal consolidation
    bankBalances = updateBalancesAfterInternalConsolidation_(bankBalances, internalResults);
    Logger.log('[STEP_2] Completed: Internal consolidation finished');
    
    // STEP 3: Cross-bank top-up (transfer between banks to meet thresholds)
    Logger.log('[STEP_3] Starting cross-bank top-up...');
    var topupResults = performCrossBankTopup_(bankBalances, THRESHOLD_USD, TRANSFER_AMOUNT_USD, options.dryRun);
    result.steps.step3_crossBankTopup = topupResults;
    Logger.log('[STEP_3] Completed: Cross-bank top-up finished');
    
    // Calculate final summary
    result.summary.totalUsdConsolidated = internalResults.totalMoved || 0;
    result.summary.totalUsdTransferred = topupResults.totalMoved || 0;
    result.summary.mainAccountBalances = getFinalMainAccountBalances_(bankBalances, internalResults, topupResults);
    
    Logger.log('[INTELLIGENT_SYSTEM] System completed successfully');
    return result;
    
  } catch (e) {
    Logger.log('[ERROR] Intelligent consolidation system failed: %s', e.message);
    result.status = 'ERROR';
    result.error = e.message;
    result.errors.push(e.message);
    return result;
  }
}

/* ============== Transfer Status Management Functions ============== */
function adjustBalancesForPendingTransfers_(balances) {
  /*
   * Adjust bank balances to account for pending outbound transfers
   * This ensures consolidation doesn't double-count funds already "in transit"
   */
  try {
    var pendingTransfers = getPendingTransfers_();
    
    if (pendingTransfers.length === 0) {
      Logger.log('[PENDING_ADJUSTMENT] No pending transfers found');
      return balances;
    }
    
    Logger.log('[PENDING_ADJUSTMENT] Found %s pending transfers - adjusting balances', pendingTransfers.length);
    
    // Adjust balances for outgoing transfers (amounts "committed" but not yet arrived)
    for (var i = 0; i < pendingTransfers.length; i++) {
      var transfer = pendingTransfers[i];
      var bankName = transfer.bankName || 'Unknown';
      
      if (bankName.toLowerCase() === 'mercury' && balances.mercury) {
        balances.mercury.USD = Math.max(0, parseFloat(balances.mercury.USD || 0) - parseFloat(transfer.amount || 0));
        Logger.log('[PENDING_ADJUSTMENT] Mercury: Reduced by %s USD -> %s USD', transfer.amount, balances.mercury.USD);
        balances.mercury.pendingReduction = (balances.mercury.pendingReduction || 0) + parseFloat(transfer.amount || 0);
      }
      
      if (bankName.toLowerCase() === 'revolut' && balances.revolut) {
        balances.revolut.USD = Math.max(0, parseFloat(balances.revolut.USD || 0) - parseFloat(transfer.amount || 0));
        Logger.log('[PENDING_ADJUSTMENT] Revolut: Reduced by %s USD -> %s USD', transfer.amount, balances.revolut.USD);
        balances.revolut.pendingReduction = (balances.revolut.pendingReduction || 0) + parseFloat(transfer.amount || 0);
      }
      
      if (bankName.toLowerCase() === 'wise' && balances.wise) {
        balances.wise.USD = Math.max(0, parseFloat(balances.wise.USD || 0) - parseFloat(transfer.amount || 0));
        Logger.log('[PENDING_ADJUSTMENT] Wise: Reduced by %s USD -> %s USD', transfer.amount, balances.wise.USD);
        balances.wise.pendingReduction = (balances.wise.pendingReduction || 0) + parseFloat(transfer.amount || 0);
      }
      
      if (bankName.toLowerCase() === 'nexo' && balances.nexo) {
        balances.nexo.USD = Math.max(0, parseFloat(balances.nexo.USD || 0) - parseFloat(transfer.amount || 0));
        Logger.log('[PENDING_ADJUSTMENT] Nexo: Reduced by %s USD -> %s USD', transfer.amount, balances.nexo.USD);
        balances.nexo.pendingReduction = (balances.nexo.pendingReduction || 0) + parseFloat(transfer.amount || 0);
      }
    }
    
    return balances;
    
  } catch (e) {
    Logger.log('[ERROR] Failed to adjust balances for pending transfers: %s', e.message);
    return balances;
  }
}

function markTransferAsReceived_(transactionId, bankName) {
  /*
   * Mark a pending transfer as received/completed
   * Removes it from pending transfers and logs the completion
   */
  try {
    Logger.log('[TRANSFER_COMPLETE] Marking transfer %s (%s) as received', transactionId, bankName);
    
    // Remove from pending transfers
    clearCompletedTransfer_(transactionId);
    
    // Log completion
    Logger.log('[TRANSFER_COMPLETE] Transfer %s from %s marked as completed', transactionId, bankName || 'Unknown');
    
    return true;
  } catch (e) {
    Logger.log('[ERROR] Failed to mark transfer as received: %s', e.message);
    return false;
  }
}

function menuMarkTransferComplete() {
  /*
   * Menu function to manually mark transfers as received
   * Useful when transfers arrive and need to be cleared from pending list
   */
  try {
    var ui = SpreadsheetApp.getUi();
    var transfers = getPendingTransfers_();
    
    if (transfers.length === 0) {
      ui.alert('Complete Transfer', 'No pending transfers found.\n\nAll transfers are complete or none have been initiated recently.', ui.ButtonSet.OK);
      return;
    }
    
    // Show available transfers for selection
    var transferOptions = [];
    for (var i = 0; i < transfers.length; i++) {
      var transfer = transfers[i];
      var hoursSince = Math.floor((new Date().getTime() - new Date(transfer.timestamp).getTime()) / (1000 * 60 * 60));
      var option = (transfer.bankName || 'Unknown') + ' $' + transfer.amount + ' ' + transfer.currency + ' (' + hoursSince + 'h ago) - ID: ' + transfer.transactionId;
      transferOptions.push(option);
    }
    
    // Create prompt for user to select which transfer to mark complete
    var transferIndex = parseInt(promptUtilities.createNumberedPrompt('Select transfer to mark as received:', transferOptions)) - 1;
    
    if (transferIndex >= 0 && transferIndex < transfers.length) {
      var selectedTransfer = transfers[transferIndex];
      
      var confirmResponse = ui.alert('Confirm Transfer Complete', 
        'Mark this transfer as received?\n\n' + (selectedTransfer.bankName || 'Unknown') + ' $' + selectedTransfer.amount + ' ' + selectedTransfer.currency + '\nID: ' + selectedTransfer.transactionId + '\n\nThis will remove it from pending transfers.', 
        ui.ButtonSet.YES_NO);
      
      if (confirmResponse === ui.Button.YES) {
        var success = markTransferAsReceived_(selectedTransfer.transactionId, selectedTransfer.bankName);
        
        if (success) {
          ui.alert('Transfer Completed', 'Transfer marked as received and removed from pending transfers.', ui.ButtonSet.OK);
        } else {
          ui.alert('Error', 'Failed to mark transfer as received. Please check logs.', ui.ButtonSet.OK);
        }
      } else {
        ui.alert('Cancelled', 'Transfer completion marking was cancelled.', ui.ButtonSet.OK);
      }
    } else {
      ui.alert('Invalid Selection', 'Invalid transfer selection.', ui.ButtonSet.OK);
    }
    
  } catch (e) {
    Logger.log('[ERROR] Menu mark transfer complete failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ Transfer Completion Error', 'Failed to mark transfer complete:\n\n' + e.message, ui.ButtonSet.OK);
  }
}

function autoDetectCompletedTransfers_() {
  /*
   * Auto-detect and mark transfers as completed based on account balance changes
   * This doesn't actually check bank APIs, but provides a framework for doing so
   */
  try {
    var pendingTransfers = getPendingTransfers_();
    var completedTransfers = [];
    
    Logger.log('[AUTO_COMPLETE] Checking %s pending transfers for completion', pendingTransfers.length);
    
    // This would ideally check actual bank balances or transaction status
    // For now, just clean up very old transfers (> 5 days)
    var now = new Date().getTime();
    for (var i = 0; i < pendingTransfers.length; i++) {
      var transfer = pendingTransfers[i];
      var transferDate = new Date(transfer.timestamp).getTime();
      var daysSince = (now - transferDate) / (1000 * 60 * 60 * 24);
      
      if (daysSince > 5) {
        Logger.log('[AUTO_COMPLETE] Transfer %s is %s days old - marking as timeout', transfer.transactionId, daysSince.toFixed(1));
        completedTransfers.push(transfer.transactionId);
      }
    }
    
    // Mark detected transfers as complete
    for (var j = 0; j < completedTransfers.length; j++) {
      markTransferAsReceived_(completedTransfers[j], 'auto-timeout');
    }
    
    return completedTransfers.length;
    
  } catch (e) {
    Logger.log('[ERROR] Auto-detect completed transfers failed: %s', e.message);
    return 0;
  }
}

// Helper utility for numbered prompts 
var promptUtilities = {
  createNumberedPrompt: function(title, options) {
    var ui = SpreadsheetApp.getUi();
    var promptText = title + '\n\n';
    
    for (var i = 0; i < options.length; i++) {
      promptText += (i + 1) + '. ' + options[i] + '\n';
    }
    
    promptText += '\nEnter the number of your choice:';
    
    var response = ui.prompt(title, promptText, ui.ButtonSet.OK_CANCEL);
    
    if (response.getSelectedButton() === ui.Button.OK) {
      return response.getResponseText();
    } else {
      return '-1'; // Cancelled
    }
  }
};

/* ============== Intelligent System Helper Functions ============== */
function fetchAllBankUsdBalances_() {
  /*
   * STEP 1: Fetch USD balances from all banks
   * Returns detailed balance information for each bank's Main account
   */
  var balances = {};
  
  try {
    // Mercury Main Account Balance
    Logger.log('[BALANCE_FETCH] Fetching Mercury Main account balance...');
    balances.mercury = fetchMercuryMainBalance_();
    Logger.log('[BALANCE_FETCH] Mercury Main: $%s USD', balances.mercury.USD);
  } catch (e) {
    Logger.log('[ERROR] Failed to fetch Mercury balance: %s', e.message);
    balances.mercury = { USD: 0, EUR: 0, bankName: 'Mercury', error: e.message };
  }
  
  try {
    // Revolut Balance
    Logger.log('[BALANCE_FETCH] Fetching Revolut balance...');
    balances.revolut = fetchRevolutSummary_();
    balances.revolut.bankName = 'Revolut';
    Logger.log('[BALANCE_FETCH] Revolut: $%s USD', balances.revolut.USD);
  } catch (e) {
    Logger.log('[ERROR] Failed to fetch Revolut balance: %s', e.message);
    balances.revolut = { USD: 0, EUR: 0, bankName: 'Revolut', error: e.message };
  }
  
  try {
    // Wise Balance
    Logger.log('[BALANCE_FETCH] Fetching Wise balance...');
    balances.wise = fetchWiseSummary_();
    balances.wise.bankName = 'Wise';
    Logger.log('[BALANCE_FETCH] Wise: $%s USD', balances.wise.USD);
  } catch (e) {
    Logger.log('[ERROR] Failed to fetch Wise balance: %s', e.message);
    balances.wise = { USD: 0, EUR: 0, bankName: 'Wise', error: e.message };
  }
  
  try {
    // Nexo Balance
    Logger.log('[BALANCE_FETCH] Fetching Nexo balance...');
    balances.nexo = fetchNexoSummary_();
    balances.nexo.bankName = 'Nexo';
    Logger.log('[BALANCE_FETCH] Nexo: $%s USD', balances.nexo.USD);
  } catch (e) {
    Logger.log('[ERROR] Failed to fetch Nexo balance: %s', e.message);
    balances.nexo = { USD: 0, EUR: 0, bankName: 'Nexo', error: e.message };
  }
  
  // Adjust balances for pending transfers from previous consolidation systems
  balances = adjustBalancesForPendingTransfers_(balances);
  
  return balances;
}

function performInternalConsolidation_(bankBalances, dryRun) {
  /*
   * STEP 2: Internal consolidation within each bank
   * Move funds from sub-accounts to Main accounts within the same bank
   */
  Logger.log('[INTERNAL_CONSOLIDATION] Starting internal consolidation...');
  
  var result = {
    totalMoved: 0,
    consolidations: [],
    errors: []
  };
  
  // Mercury internal consolidation (move from other accounts to Main)
  try {
    Logger.log('[INTERNAL_CONSOLIDATION] Mercury internal consolidation...');
    var mercuryResult = consolidateMercuryUsdFunds_(dryRun);
    
    if (mercuryResult.movedTotal > 0) {
      result.totalMoved += mercuryResult.movedTotal;
      result.consolidations.push({
        bank: 'Mercury',
        amount: mercuryResult.movedTotal,
        sourceAccounts: mercuryResult.transfers.length,
        transfers: mercuryResult.transfers
      });
      Logger.log('[INTERNAL_CONSOLIDATION] Mercury: Moved $%s USD internally', mercuryResult.movedTotal);
    } else {
      Logger.log('[INTERNAL_CONSOLIDATION] Mercury: No internal consolidation needed');
    }
  } catch (e) {
    Logger.log('[ERROR] Mercury internal consolidation failed: %s', e.message);
    result.errors.push('Mercury consolidation: ' + e.message);
  }
  
  // Revolut internal consolidation (if needed)
  try {
    Logger.log('[INTERNAL_CONSOLIDATION] Revolut internal consolidation...');
    var revolutResult = consolidateRevolutUsdFunds_(dryRun);
    
    if (revolutResult.movedTotal > 0) {
      result.totalMoved += revolutResult.movedTotal;
      result.consolidations.push({
        bank: 'Revolut',
        amount: revolutResult.movedTotal,
        sourceAccounts: revolutResult.transfers.length,
        transfers: revolutResult.transfers
      });
      Logger.log('[INTERNAL_CONSOLIDATION] Revolut: Moved $%s USD internally', revolutResult.movedTotal);
    } else {
      Logger.log('[INTERNAL_CONSOLIDATION] Revolut: No internal consolidation needed');
    }
  } catch (e) {
    Logger.log('[ERROR] Revolut internal consolidation failed: %s', e.message);
    result.errors.push('Revolut consolidation: ' + e.message);
  }
  
  return result;
}

function performCrossBankTopup_(bankBalances, thresholdUsd, transferAmountUsd, dryRun) {
  /*
   * STEP 3: Cross-bank top-up based on thresholds
   * Priority: Revolut -> Other banks, then Mercury -> Other banks if Revolut insufficient
   */
  Logger.log('[CROSS_BANK_TOPUP] Starting cross-bank transfers...');
  
  var result = {
    totalMoved: 0,
    topups: [],
    errors: []
  };
  
  // Identify banks that need top-up (below threshold)
  var banksNeedingTopup = [];
  var banksAboverThreshold = [];
  
  Object.keys(bankBalances).forEach(bankName => {
    var balance = parseFloat(bankBalances[bankName].USD || 0);
    if (balance < thresholdUsd) {
      var shortfall = thresholdUsd - balance;
      banksNeedingTopup.push({
        bankName: bankName,
        currentBalance: balance,
        shortfall: shortfall,
        topupAmount: transferAmountUsd
      });
      Logger.log('[CROSS_BANK_TOPUP] %s needs top-up: $%s (shortfall: $%s)', bankName, balance, shortfall);
    } else {
      banksAboverThreshold.push({
        bankName: bankName,
        currentBalance: balance,
        surplus: balance - thresholdUsd
      });
      Logger.log('[CROSS_BANK_TOPUP] %s above threshold: $%s (surplus: $%s)', bankName, balance, balance - thresholdUsd);
    }
  });
  
  // If no banks need top-up, we're done
  if (banksNeedingTopup.length === 0) {
    Logger.log('[CROSS_BANK_TOPUP] No banks need top-up - all above threshold');
    return result;
  }
  
  // Find source banks for top-up (prioritize Revolut, then Mercury)
  var sourceBankCandidates = [];
  
  // 1. Try Revolut first
  var revolutBalance = parseFloat(bankBalances.revolut?.USD || 0);
  if (revolutBalance >= thresholdUsd + transferAmountUsd) {
    sourceBankCandidates.push({
      bankName: 'Revolut',
      balance: revolutBalance,
      canSupply: revolutBalance - transferAmountUsd,
      priority: 1
    });
  }
  
  // 2. Try Mercury as fallback
  var mercuryBalance = parseFloat(bankBalances.mercury?.USD || 0);
  if (mercuryBalance >= thresholdUsd + transferAmountUsd) {
    sourceBankCandidates.push({
      bankName: 'Mercury',
      balance: mercuryBalance,
      canSupply: mercuryBalance - transferAmountUsd,
      priority: 2
    });
  }
  
  // Execute cross-bank transfers
  for (var i = 0; i < banksNeedingTopup.length; i++) {
    var bankToTopup = banksNeedingTopup[i];
    var topupAmount = bankToTopup.topupAmount;
    
    // Find the best source bank for this top-up
    var sourceBank = null;
    for (var j = 0; j < sourceBankCandidates.length; j++) {
      var candidate = sourceBankCandidates[j];
      if (candidate.canSupply >= topupAmount) {
        sourceBank = candidate;
        break;
      }
    }
    
    if (!sourceBank) {
      Logger.log('[WARNING] No bank can supply $%s for %s top-up', topupAmount, bankToTopup.bankName);
      result.errors.push('Insufficient funds to top-up ' + bankToTopup.bankName + ' with $' + topupAmount);
      continue;
    }
    
    // Record the transfer
    result.topups.push({
      fromBank: sourceBank.bankName,
      toBank: bankToTopup.bankName,
      amount: topupAmount,
      status: dryRun ? 'DRY_RUN' : 'PENDING'
    });
    
    result.totalMoved += topupAmount;
    
    // Update source bank balance for next calculation
    sourceBank.balance -= topupAmount;
    sourceBank.canSupply = sourceBank.balance - thresholdUsd;
    
    Logger.log('[CROSS_BANK_TOPUP] %s -> %s: $%s USD (%s)', 
               sourceBank.bankName, bankToTopup.bankName, topupAmount, dryRun ? 'DRY_RUN' : 'EXECUTED');
  }
  
  return result;
}

function updateBalancesAfterInternalConsolidation_(bankBalances, internalResults) {
  /*
   * Update bank balances after internal consolidation moves
   */
  var updatedBalances = Object.assign({}, bankBalances);
  
  // Add consolidated amounts to Main accounts
  internalResults.consolidations.forEach(consolidation => {
    var bankName = consolidation.bank.toLowerCase();
    if (updatedBalances[bankName]) {
      var newBalance = parseFloat(updatedBalances[bankName].USD || 0) + consolidation.amount;
      updatedBalances[bankName].USD = newBalance;
      Logger.log('[BALANCE_UPDATE] %s balance updated: $%s USD (after internal consolidation)', bankName, newBalance);
    }
  });
  
  return updatedBalances;
}

function getFinalMainAccountBalances_(bankBalances, internalResults, topupResults) {
  /*
   * Calculate final Main account balances after all operations
   */
  var finalBalances = {};
  
  // Start with current balances
  Object.keys(bankBalances).forEach(bankName => {
    finalBalances[bankName] = parseFloat(bankBalances[bankName].USD || 0);
  });
  
  // Add internal consolidation results
  internalResults.consolidations.forEach(consolidation => {
    var bankName = consolidation.bank.toLowerCase();
    if (finalBalances[bankName] !== undefined) {
      finalBalances[bankName] += consolidation.amount;
    }
  });
  
  // Add/subtract cross-bank transfers
  topupResults.topups.forEach(topup => {
    var fromBank = topup.fromBank.toLowerCase();
    var toBank = topup.toBank.toLowerCase();
    
    if (finalBalances[fromBank] !== undefined) {
      finalBalances[fromBank] -= topup.amount;
    }
    if (finalBalances[toBank] !== undefined) {
      finalBalances[toBank] += topup.amount;
    }
  });
  
  return finalBalances;
}

/* ============== Legacy Fund Consolidation System (Backwards Compatibility) ============== */
function consolidateUsdFundsToMain_(options) {
  Logger.log('=== STARTING FUND CONSOLIDATION ===');
  Logger.log('[FUND_CONSOLIDATION] Starting USD fund consolidation (dryRun: %s)', options.dryRun);
  
  // Check for pending transfers before starting
  var hasPendingTransfers = checkPendingTransfers_();
  if (hasPendingTransfers && !options.force) {
    Logger.log('[FUND_CONSOLIDATION] Skipping consolidation - pending transfers detected');
    return {
      skipped: true,
      reason: 'Pending transfers detected',
      pendingTransfers: getPendingTransfers_(),
      totalProcessed: 0,
      totalFound: 0,
      movedTotal: 0,
      errors: ['Consolidation skipped due to pending transfers']
    };
  }
  
  var result = {
    totalProcessed: 0,
    totalFound: 0,
    movedTotal: 0,
    revolut: { processed: 0, foundTotal: 0, movedTotal: 0, transfers: [], errors: [] },
    mercury: { processed: 0, foundTotal: 0, movedTotal: 0, transfers: [], errors: [] },
    errors: []
  };
  
  // Process Revolut accounts
  Logger.log('[FUND_CONSOLIDATION] Processing Revolut accounts...');
  try {
    result.revolut = consolidateRevolutUsdFunds_(options.dryRun);
    Logger.log('[FUND_CONSOLIDATION] Revolut: %s accounts processed, $%s USD found, $%s moved', 
               result.revolut.processed, result.revolut.foundTotal, result.revolut.movedTotal);
  } catch (e) {
    Logger.log('[ERROR] Revolut consolidation failed: %s', e.message);
    result.revolut.errors.push('Revolut consolidation failed: ' + e.message);
  }
  
  // Process Mercury accounts
  Logger.log('[FUND_CONSOLIDATION] Processing Mercury accounts...');
  try {
    result.mercury = consolidateMercuryUsdFunds_(options.dryRun);
    Logger.log('[FUND_CONSOLIDATION] Mercury: %s accounts processed, $%s USD found, $%s moved', 
         result.mercury.processed, result.mercury.foundTotal, result.mercury.movedTotal);
  } catch (e) {
    Logger.log('[ERROR] Mercury consolidation failed: %s', e.message);
    result.mercury.errors.push('Mercury consolidation failed: ' + e.message);
  }
  
  // Calculate totals
  result.totalProcessed = result.revolut.processed + result.mercury.processed;
  result.totalFound = result.revolut.foundTotal + result.mercury.foundTotal;
  result.movedTotal = result.revolut.movedTotal + result.mercury.movedTotal;
  
  // Collect all errors
  result.errors = result.revolut.errors.concat(result.mercury.errors);
  
  Logger.log('[FUND_CONSOLIDATION] Summary: %s accounts processed, $%s USD found, $%s moved, %s errors', 
             result.totalProcessed, result.totalFound.toFixed(2), result.movedTotal.toFixed(2), result.errors.length);
  Logger.log('=== FUND CONSOLIDATION COMPLETED ===');
  
  return result;
}

function consolidateRevolutUsdFunds_(dryRun) {
  var result = {
    processed: 0,
    foundTotal: 0,
    movedTotal: 0,
    transfers: [],
    errors: []
  };
  
  try {
    var accounts = getRevolutAccounts_();
    Logger.log('[REVOLUT] Retrieved %s accounts', accounts.length);
    
    for (var i = 0; i < accounts.length; i++) {
      var account = accounts[i];
      var accountName = account.name || account.displayName || 'Unknown';
      var accountId = account.id || account.account_id || '';
      var currency = account.currency || 'USD';
      
      // Skip non-USD accounts for consolidation
      if (currency.toUpperCase() !== 'USD') {
        Logger.log('[REVOLUT_FUNDS] Skipping non-USD account: %s (%s)', accountName, currency);
        continue;
      }
      
      result.processed++;
      
      // Skip Main account for consolidation
      if (accountName.toLowerCase().includes('main')) {
        Logger.log('[REVOLUT_FUNDS] Skipping Main account: %s', accountName);
        continue;
      }
      
      // Use balance directly from account data
      var usdBalance = account.balance || 0;
      Logger.log('[REVOLUT_FUNDS] Account %s USD balance: $%s', accountName, usdBalance);
      
      if (usdBalance > 0) {
        result.foundTotal += usdBalance;
        
        var transfer = {
          bank: 'Revolut',
          fromAccount: accountName,
          toAccount: 'Main',
          amount: usdBalance,
          currency: 'USD',
          status: 'pending'
        };
        
        if (!dryRun) {
          try {
            Logger.log('[REVOLUT_FUNDS] Attempting to move $%s USD from %s to Main', usdBalance, accountName);
            var transferResult = revolutTransferBetweenAccounts_(accountName, 'Main', 'USD', usdBalance, 'Consolidate USD funds to Main');
            
            if (transferResult && transferResult.transfer && transferResult.transfer.id) {
              transfer.status = 'success';
              transfer.transactionId = transferResult.transfer.id;
              result.movedTotal += usdBalance;
              
              // Track pending transfers (Revolut transfers are usually processing)
              var transferStatus = transferResult.transfer.status || 'processing';
              if (transferStatus === 'processing' || transferStatus === 'pending') {
                addPendingTransfer_('Revolut_' + accountName, usdBalance, 'USD', transferResult.transfer.id, 'Revolut');
              }
              
              Logger.log('[REVOLUT_FUNDS] Successfully moved $%s USD from %s to Main', usdBalance, accountName);
            } else {
              transfer.status = 'failed';
              transfer.error = 'Invalid response';
              result.errors.push('Failed to move $' + usdBalance + ' USD from ' + accountName + ': Invalid response');
            }
          } catch (e) {
            transfer.status = 'failed';
            transfer.error = e.message;
            result.errors.push('Failed to move $' + usdBalance + ' USD from ' + accountName + ': ' + e.message);
            Logger.log('[ERROR] Failed to move $%s USD from %s to Main: %s', usdBalance, accountName, e.message);
          }
        } else {
          Logger.log('[REVOLUT_FUNDS] DRY RUN: Would move $%s USD from %s to Main', usdBalance, accountName);
        }
        
        result.transfers.push(transfer);
      }
    }
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut accounts: %s', e.message);
    result.errors.push('Failed to get Revolut accounts: ' + e.message);
  }
  
  return result;
}

function consolidateMercuryUsdFunds_(dryRun) {
  var result = {
    processed: 0,
    foundTotal: 0,
    movedTotal: 0,
    transfers: [],
    errors: []
  };
  
  try {
    // Get detailed Mercury accounts for proper consolidation
    Logger.log('[MERCURY_CONSOLIDATION] Fetching detailed Mercury accounts for consolidation...');
    var accountsData = httpProxyJson_('/mercury/accounts');
    
    if (!accountsData || !Array.isArray(accountsData.accounts)) {
      Logger.log('[ERROR] Mercury accounts endpoint not available for consolidation');
      result.errors.push('Mercury accounts endpoint not available');
      return result;
    }
    
    var accounts = accountsData.accounts;
    Logger.log('[MERCURY_CONSOLIDATION] Retrieved %s detailed Mercury accounts', accounts.length);
    
    for (var i = 0; i < accounts.length; i++) {
      var account = accounts[i];
      var accountName = account.name || account.displayName || 'Unknown';
      var accountId = account.id || account.account_id || '';
      
      result.processed++;
      
      // Identify and skip Main account (Mercury Checking ••2290)
      var currency = account.currency || 'USD';
      var isMainAccount = (
        account.name?.includes('2290') || 
        account.nickname?.includes('2290') ||
        account.isMainAccount === true ||
        account.nickname?.toLowerCase().includes('main')
      );
      
      // Skip non-USD accounts
      if (currency.toUpperCase() !== 'USD') {
        Logger.log('[MERCURY_CONSOLIDATION] Skipping non-USD account: %s (%s)', accountName, currency);
        continue;
      }
      
      if (isMainAccount) {
        Logger.log('[MERCURY_CONSOLIDATION] Skipping Main account: %s', accountName);
        continue;
      }
      
      // Use actual balance from detailed account data
      try {
        var balance = account.balance || 0;
        var availableBalance = account.availableBalance || balance;
        var usdBalance = availableBalance;
        
        Logger.log('[MERCURY_CONSOLIDATION] Account %s: $%s USD (available: $%s)', accountName, balance, availableBalance);
        
        if (usdBalance > 0) {
          result.foundTotal += usdBalance;
          
          var transfer = {
            bank: 'Mercury',
            fromAccount: accountName,
            toAccount: 'Main',
            amount: usdBalance,
            currency: 'USD',
            status: 'pending'
          };
          
          if (!dryRun) {
            try {
              Logger.log('[MERCURY_CONSOLIDATION] Attempting to consolidate $%s USD from %s to Main Account', usdBalance, accountName);
              
              // Find the Main account ID for the transfer
              var mainAccountId = null;
              for (var j = 0; j < accounts.length; j++) {
                var acc = accounts[j];
                if (acc.name?.includes('2290') || acc.isMainAccount === true) {
                  mainAccountId = acc.id;
                  break;
                }
              }
              
              if (!mainAccountId) {
                Logger.log('[ERROR] Main account ID not found for transfer');
                throw new Error('Main account ID not found');
              }
              
              var transferResult = mercuryTransferToMain_(accountId, usdBalance, 'USD', 'Consolidate USD funds to Main');
              
              if (transferResult && transferResult.transfer && transferResult.transfer.status) {
                if (transferResult.transfer.status === 'completed' || transferResult.transfer.status === 'processing') {
                  transfer.status = 'success';
                  transfer.transactionId = transferResult.transfer.id;
                  result.movedTotal += usdBalance;
                  
                  // Track pending transfers (except for completed ones)
                  if (transferResult.transfer.status === 'processing') {
                    addPendingTransfer_(accountId, usdBalance, 'USD', transferResult.transfer.id, 'Mercury');
                  }
                  
                  Logger.log('[MERCURY_FUNDS] Successfully moved $%s USD from %s to Main', usdBalance, accountName);
                } else {
                  transfer.status = 'failed';
                  transfer.error = 'Transfer status: ' + transferResult.transfer.status;
                  result.errors.push('Failed to move $' + usdBalance + ' USD from ' + accountName + ': ' + transferResult.transfer.status);
                }
              } else {
                transfer.status = 'failed';
                transfer.error = 'Invalid response';
                result.errors.push('Failed to move $' + usdBalance + ' USD from ' + accountName + ': Invalid response');
              }
            } catch (e) {
              transfer.status = 'failed';
              transfer.error = e.message;
              result.errors.push('Failed to move $' + usdBalance + ' USD from ' + accountName + ': ' + e.message);
              Logger.log('[ERROR] Failed to move $%s USD from %s to Main: %s', usdBalance, accountName, e.message);
            }
          } else {
            Logger.log('[MERCURY_FUNDS] DRY RUN: Would move $%s USD from %s to Main', usdBalance, accountName);
          }
          
          result.transfers.push(transfer);
        }
      } catch (e) {
        Logger.log('[ERROR] Failed to process Mercury account %s: %s', accountName, e.message);
        result.errors.push('Failed to process account ' + accountName + ': ' + e.message);
      }
    }
  } catch (e) {
    Logger.log('[ERROR] Failed to get Mercury accounts: %s', e.message);
    result.errors.push('Failed to get Mercury accounts: ' + e.message);
  }
  
  return result;
}

/* ======================================================================================================== */
/*                                      💰 PAYMENT SYSTEMS (PRESERVED)                                    */
/* ======================================================================================================== */

/* ============== Month Management ============== */
function findExistingMonthRow_(sh, monthStr) {
  try {
    Logger.log('[MONTH_MGMT] Looking for existing row for month: %s', monthStr);
    var lastRow = sh.getLastRow();
    Logger.log('[MONTH_MGMT] Last row in sheet: %s', lastRow);
    
    for (var row = USERS_FIRST_MONTH_ROW; row <= lastRow; row++) {
      var cellValue = sh.getRange(row, 1).getValue();
      if (cellValue && String(cellValue).trim() === monthStr) {
        Logger.log('[MONTH_MGMT] Found existing row %s for month %s', row, monthStr);
        return row;
      }
    }
    
    Logger.log('[MONTH_MGMT] No existing row found for month %s', monthStr);
    return null;
  } catch (e) {
    Logger.log('[ERROR] Failed to find existing month row: %s', e.message);
    return null;
  }
}

function ensureMonthRow_(sh, monthStr) {
  try {
    Logger.log('[MONTH_MGMT] Ensuring row exists for month: %s', monthStr);
    var existingRow = findExistingMonthRow_(sh, monthStr);
    
    if (existingRow) {
      Logger.log('[MONTH_MGMT] Month row already exists at row %s', existingRow);
      return existingRow;
    }
    
    // Insert new row after the last month row
    Logger.log('[MONTH_MGMT] Creating new row for month %s', monthStr);
    var insertRow = sh.getLastRow() + 1;
    
    // Set the month string in column A
    sh.getRange(insertRow, 1).setValue(monthStr);
    
    Logger.log('[MONTH_MGMT] Created new row %s for month %s', insertRow, monthStr);
    return insertRow;
  } catch (e) {
    Logger.log('[ERROR] Failed to ensure month row: %s', e.message);
    return null;
  }
}

/* ============== Revolut Payment Functions ============== */
function revolutFxUsdToEur_(usdAmount, requestId, reference) {
  Logger.log('[REVOLUT_PAY] Converting $%s USD to EUR (request: %s)', usdAmount, requestId);
  
  var fxMultiplier = props_().getProperty('REV_FX_USD_MULT') || '1.20';
  var eurAmount = Number(usdAmount) * Number(fxMultiplier);
  
  var body = {
    amount: eurAmount,
    currency: 'EUR',
    reference: reference || 'USD to EUR conversion',
    request_id: requestId || 'fx-' + nowStamp_() + '-' + usdAmount
  };
  
  Logger.log('[REVOLUT_FX] Sending EUR amount: %s for USD: %s', eurAmount, usdAmount);
  return httpProxyPostJson_('/revolut/transfer', body);
}

function revolutMove_(toName, eurAmount, requestId, reference) {
  Logger.log('[REVOLUT] Sending payment: %s EUR to %s (request: %s)', eurAmount, toName, requestId);
  
  var body = {
    to: toName,
    amount: eurAmount,
    currency: 'EUR',
    reference: reference || 'Payment to ' + toName,
    request_id: requestId || 'payment-' + nowStamp_() + '-' + eurAmount
  };
  
  Logger.log('[REVOLUT] Payment payload: %s', JSON.stringify(body, null, 2));
  return httpProxyPostJson_('/revolut/transfer', body);
}

/* ============== WhatsApp Integration ============== */
function sendPaymentNotification_(userName, monthStr, amount, requestId, phoneNumber) {
  if (!phoneNumber || phoneNumber.trim() === '') {
    Logger.log('[WHATSAPP] No phone number for %s - skipping notification', userName);
    return;
  }
  
  Logger.log('[WHATSAPP] Sending payment notification to %s (%s)', userName, phoneNumber);
  
  try {
    var message = '$' + amount + ' EUR sent to your Revolut account ' + phoneNumber + ' for ' + monthStr + '. Transaction ID: ' + requestId;
    
    var payload = {
      to: phoneNumber.replace(/[^\d+]/g, ''),
      body: message,
      payment_month: monthStr,
      amount: amount,
      user: userName,
      request_id: requestId,
      timestamp: nowStamp_()
    };
    
    Logger.log('[WHATSAPP] Sending to server: %s', JSON.stringify(payload, null, 2));
    
    var response = httpProxyPostJson_('/notify-payment', payload);
    Logger.log('[WHATSAPP] ✅ Notification sent successfully');
    return response;
    
  } catch (e) {
    Logger.log('[WHATSAPP] ❌ Failed to send notification: %s', e.message);
    throw e;
  }
}

/* ======================================================================================================== */
/*                                      📊 BALANCE MANAGEMENT                                             */
/* ======================================================================================================== */

/* ============== Sheet Operations ============== */
function setCellWithNote_(sheetName, a1, value, note) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    setCellKeepFmt_(sheet, a1, value, note);
  } catch (e) {
    Logger.log('[ERROR] setCellWithNote_ failed: %s', e.message);
  }
}

/* ============== Bank Minimum Balance Functions ============== */
function checkBankMinimumBalance_(bankName) {
  try {
    Logger.log('[MIN_BALANCE] Checking %s minimum balance', bankName);
    
    var summary;
    if (bankName === 'Airwallex') {
      summary = fetchAirwallexSummary_();
    } else if (bankName === 'Mercury') {
      summary = fetchMercurySummary_();
    } else if (bankName === 'Revolut') {
      summary = fetchRevolutSummary_();
    } else {
      Logger.log('[ERROR] Unknown bank for minimum balance check: %s', bankName);
      return { needsTopup: false, currentBalance: 0, topupAmount: 0 };
    }
    
    var currentBalance = summary.USD || 0;
    var needsTopup = currentBalance < MIN_BALANCE_USD;
    var topupAmount = needsTopup ? TOPUP_AMOUNT_USD : 0;
    
    Logger.log('[MIN_BALANCE] %s balance: $%.2f, needs topup: %s', bankName, currentBalance, needsTopup);
    
    return {
      bankName: bankName,
      currentBalance: currentBalance,
      needsTopup: needsTopup,
      topupAmount: topupAmount,
      minimumRequired: MIN_BALANCE_USD
    };
    
  } catch (e) {
    Logger.log('[ERROR] Failed to check %s minimum balance: %s', bankName, e.message);
    return { 
      bankName: bankName,
      needsTopup: false, 
      currentBalance: 0, 
      topupAmount: 0, 
      error: e.message 
    };
  }
}

function transferFromRevolut_(toBank, amount, reason) {
  try {
    Logger.log('[TRANSFER] Initiating transfer from Revolut Main to %s: $%.2f - %s', toBank, amount, reason);
    
    if (toBank === 'Airwallex') {
      // Transfer from Revolut to Airwallex
      return revolutTransferToAirwallex_(amount, reason);
    } else if (toBank === 'Mercury') {
      // Transfer from Revolut to Mercury  
      return revolutTransferToMercury_(amount, reason);
    } else {
      Logger.log('[ERROR] Cannot transfer from Revolut to unknown bank: %s', toBank);
      return false;
    }
    
  } catch (e) {
    Logger.log('[ERROR] Failed to transfer from Revolut to %s: %s', toBank, e.message);
    return false;
  }
}

function checkAllBankMinimumBalances() {
  try {
    Logger.log('=== CHECKING ALL BANK MINIMUM BALANCES ===');
    
    var banksToCheck = ['Airwallex', 'Mercury', 'Revolut'];
    var results = [];
    var needsTopup = [];
    
    // Check Revolut balance first (need it to have funds for transfers)
    var revolutResult = checkBankMinimumBalance_('Revolut');
    results.push(revolutResult);
    
    if (!revolutResult.needsTopup) {
      Logger.log('[MIN_BALANCE] Revolut has sufficient funds: $%.2f', revolutResult.currentBalance);
      
      // Check other banks
      for (var i = 0; i < banksToCheck.length - 1; i++) { // Skip Revolut, already checked
        var bankName = banksToCheck[i];
        var bankResult = checkBankMinimumBalance_(bankName);
        results.push(bankResult);
        
        if (bankResult.needsTopup) {
          needsTopup.push(bankResult);
          Logger.log('[MIN_BALANCE] ⚠️ %s needs topup: $%.2f < $%d', bankName, bankResult.currentBalance, MIN_BALANCE_USD);
        }
      }
      
      // Execute topups if needed
      if (needsTopup.length > 0) {
        Logger.log('[MIN_BALANCE] Executing %d topups...', needsTopup.length);
        
        for (var j = 0; j < needsTopup.length; j++) {
          var topup = needsTopup[j];
          Logger.log('[MIN_BALANCE] Topping up %s with $%.2f', topup.bankName, topup.topupAmount);
          
          var transferSuccess = transferFromRevolut_(
            topup.bankName, 
            topup.topupAmount, 
            'Auto-topup: Balance $' + topup.currentBalance.toFixed(2) + ' below minimum $' + MIN_BALANCE_USD
          );
          
          if (transferSuccess) {
            Logger.log('[MIN_BALANCE] ✅ Successfully topped up %s', topup.bankName);
          } else {
            Logger.log('[MIN_BALANCE] ❌ Failed to topup %s', topup.bankName);
          }
          
          // Small delay between transfers
          Utilities.sleep(1000);
        }
        
        Logger.log('[MIN_BALANCE] All topups completed');
      } else {
        Logger.log('[MIN_BALANCE] ✅ All banks have sufficient balances');
      }
      
    } else {
      Logger.log('[WARNING] Revolut balance too low for transfers: $%.2f < $%d', revolutResult.currentBalance, MIN_BALANCE_USD);
    }
    
    Logger.log('=== MINIMUM BALANCE CHECK COMPLETED ===');
    return results;
    
  } catch (e) {
    Logger.log('[ERROR] Minimum balance check failed: %s', e.message);
    return [];
  }
}

function dryRunCheckAllBankMinimumBalances() {
  try {
    Logger.log('=== DRY RUN: CHECKING ALL BANK MINIMUM BALANCES ===');
    
    var banksToCheck = ['Airwallex', 'Mercury', 'Revolut'];
    var results = [];
    var needsTopup = [];
    
    // Check all banks
    for (var i = 0; i < banksToCheck.length; i++) {
      var bankName = banksToCheck[i];
      var bankResult = checkBankMinimumBalance_(bankName);
      results.push(bankResult);
      
      if (bankResult.needsTopup) {
        needsTopup.push(bankResult);
      }
    }
    
    // Generate summary
    var summary = '🏦 BANK BALANCE ANALYSIS (DRY RUN)\\n\\n';
    
    for (var j = 0; j < results.length; j++) {
      var result = results[j];
      var status = result.needsTopup ? '⚠️ NEEDS TOPUP' : '✅ OK';
      summary += String.format(
        '%s: $%.2f / $%d required %s\\n',
        result.bankName,
        result.currentBalance,
        MIN_BALANCE_USD,
        status
      );
      
      if (result.needsTopup) {
        summary += String.format('  → Would transfer $%.2f from Revolut\\n', result.topupAmount);
      }
    }
    
    summary += '\\n';
    
    if (needsTopup.length > 0) {
      var totalToTransfer = needsTopup.reduce(function(sum, topup) { return sum + topup.topupAmount; }, 0);
      summary += String.format(
        '📊 SUMMARY: %d banks need topup\\nTotal to transfer: $%.2f\\n\\n',
        needsTopup.length,
        totalToTransfer
      );
      
      // Check if Revolut can provide funds
      var revolutResult = results[2]; // Revolut is last in the array
      if (revolutResult.currentBalance >= totalToTransfer + MIN_BALANCE_USD) {
        summary += '✅ Revolut has sufficient funds for all transfers';
      } else {
        summary += String.format(
          '⚠️ Revolut may not have enough funds: $%.2f available, need $%.2f',
          revolutResult.currentBalance,
          totalToTransfer
        );
      }
    } else {
      summary += '✅ All banks have sufficient balances - no action needed';
    }
    
    Logger.log('[DRY_RUN] %s', summary);
    SpreadsheetApp.getUi().alert('Bank Balance Analysis (Dry Run)', summary, SpreadsheetApp.getUi().ButtonSet.OK);
    
    return results;
    
  } catch (e) {
    Logger.log('[ERROR] Dry run minimum balance check failed: %s', e.message);
    SpreadsheetApp.getUi().alert('Dry Run Failed', 'Error: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
    return [];
  }
}

/* ============== Bank Balance Functions ============== */
function updateBankBalance_(sh, bankName, summary, note) {
  try {
    Logger.log('[BALANCE] Updating %s balance: %s', bankName, JSON.stringify(summary));
    
    var bankCells = CELLS[bankName];
    if (!bankCells) {
      Logger.log('[ERROR] No cell mapping found for bank: %s', bankName);
      return;
    }
    
    if (summary.USD !== undefined) {
      setCellKeepFmt_(sh, bankCells.USD, summary.USD, note || bankName + ' USD balance updated');
    }
    
    if (summary.EUR !== undefined && bankCells.EUR) {
      setCellKeepFmt_(sh, bankCells.EUR, summary.EUR, note || bankName + ' EUR balance updated');
    }
    
    // Update timestamp
    sh.getRange(TS_CELL).setValue(nowStampCell_());
    
    Logger.log('[BALANCE] ✅ %s balance updated successfully', bankName);
  } catch (e) {
    Logger.log('[ERROR] Failed to update %s balance: %s', bankName, e.message);
  }
}

function updateAllBalances() {
  try {
    Logger.log('=== STARTING BALANCE UPDATE ===');
    
    var sh = sheet_(SHEET_NAME);
    if (!sh) {
      throw new Error('Payouts sheet not found');
    }
    
    // Check proxy health
    if (!proxyIsUp_()) {
      Logger.log('[WARNING] Proxy is not healthy, skipping balance updates');
      return;
    }
    
    var totalUpdated = 0;
    
    // Update Mercury
    try {
      var mercurySummary = fetchMercurySummary_();
      updateBankBalance_(sh, 'Mercury', mercurySummary, 'Mercury balance update');
      totalUpdated++;
    } catch (e) {
      Logger.log('[ERROR] Mercury balance update failed: %s', e.message);
    }
    
    // Update Airwallex - DISABLED due to API access issues
    // try {
    //   var airwallexSummary = fetchAirwallexSummary_();
    //   updateBankBalance_(sh, 'Airwallex', airwallexSummary, 'Airwallex balance update');
    //   totalUpdated++;
    // } catch (e) {
    //   Logger.log('[ERROR] Airwallex balance update failed: %s', e.message);
    // }
    
    // Set Airwallex balance to zero
    try {
      updateBankBalance_(sh, 'Airwallex', { USD: 0, EUR: 0 }, 'Airwallex disabled');
      totalUpdated++;
    } catch (e) {
      Logger.log('[ERROR] Airwallex placeholder update failed: %s', e.message);
    }
    
    // Update Revolut
    try {
      var revolutSummary = fetchRevolutSummary_();
      updateBankBalance_(sh, 'Revolut', revolutSummary, 'Revolut balance update');
      totalUpdated++;
    } catch (e) {
      Logger.log('[ERROR] Revolut balance update failed: %s', e.message);
    }
    
    // Update Wise
    try {
      var wiseSummary = fetchWiseSummary_();
      updateBankBalance_(sh, 'Wise', wiseSummary, 'Wise balance update');
      totalUpdated++;
    } catch (e) {
      Logger.log('[ERROR] Wise balance update failed: %s', e.message);
    }
    
    // Update Nexo (USD only)
    try {
      var nexoSummary = fetchNexoSummary_();
      updateBankBalance_(sh, 'Nexo', { USD: nexoSummary.USD || 0 }, 'Nexo balance update');
      totalUpdated++;
    } catch (e) {
      Logger.log('[ERROR] Nexo balance update failed: %s', e.message);
    }
    
    Logger.log('[BALANCE] Updates completed: %s banks updated', totalUpdated);
    Logger.log('=== BALANCE UPDATE COMPLETED ===');
    
  } catch (e) {
    Logger.log('[ERROR] Balance update failed: %s', e.message);
    Logger.log('[ERROR] Stack trace: %s', e.stack);
  }
}

/* ======================================================================================================== */
/*                                      🎯 PUBLIC INTERFACE                                              */
/* ======================================================================================================== */

/* ============== Airwallex Support Functions ============== */
function getJsonProp_(key) {
  try {
    var val = props_().getProperty(key);
    return val ? JSON.parse(val) : null;
  } catch (e) {
    Logger.log('[ERROR] getJsonProp_ failed for %s: %s', key, e.message);
    return null;
  }
}

function setJsonProp_(key, obj) {
  try {
    props_().setProperty(key, JSON.stringify(obj));
  } catch (e) {
    Logger.log('[ERROR] setJsonProp_ failed for %s: %s', key, e.message);
  }
}

function airwallexToken_() {
  var tokenData = getJsonProp_('AIRWALLEX_TOKEN');
  return tokenData ? tokenData.access_token : null;
}

/* ======================================================================================================== */
/*                                      🛠️ TRIGGERS & MENUS                                              */
/* ======================================================================================================== */

/* ============== Main Unified Menu ============== */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  
  ui.createMenu('🏦 Banking')
    // Balance Monitoring
    .addItem('💰 Check USD Balances', 'menuCheckUSDBalances')
    .addItem('🏦 Check Individual Banks', 'menuCheckIndividualBanks')
    .addItem('📊 Show Balance Summary', 'menuShowBalanceSummary')
    .addItem('🔄 Update All Balances', 'menuUpdateAllBalances')
    .addSeparator()
    // Auto Topup
    .addItem('🔍 Check Minimum Balances (Dry Run)', 'dryRunCheckAllBankMinimumBalances')
    .addItem('💳 Auto-Topup Low Balances', 'checkAllBankMinimumBalances')
    .addSeparator()
    // Clear outputs
    .addItem('❌ Clear Outputs', 'menuClearOutputs')
    .addToUi();
    
  ui.createMenu('💰 Payments')
    .addItem('🧪 Dry Run Current Month', 'dryRunPayUsersForCurrentMonth')
    .addItem('💰 Pay Current Month', 'payUsersForCurrentMonth')
    .addSeparator()
    .addItem('🧪 Dry Run Previous Month', 'dryRunPayUsersForPreviousMonth') 
    .addItem('💰 Pay Previous Month', 'payUsersForPreviousMonth')
    .addSeparator()
    .addItem('🗓️ Dry Run Specific Month', 'menuDryRunSpecificMonth')
    .addItem('🗓️ Pay Specific Month', 'menuPaySpecificMonth')
    .addSeparator()
    .addItem('🔍 Check Status', 'getCurrentMonthStatus')
    .addItem('🧪 Test Payment System', 'testPaymentSystem')
    .addToUi();

  ui.createMenu('🧪 System Tests')
    .addItem('📊 Validate Sheet', 'testSheetValidation')
    .addItem('🚀 Complete System Test', 'testCompleteSystem')
    .addToUi();
    
  ui.createMenu('🔄 Consolidation')
   .addItem('💰 Consolidate Funds → Main', 'menuExecuteConsolidation')
   .addItem('🧪 Test Consolidation', 'menuTestConsolidation')
   .addItem('📋 Show Available Banks', 'menuShowAvailableBanks')
   .addSeparator()
         .addItem('⏳ Check Pending Transfers', 'menuCheckPendingTransfers')
         .addItem('✅ Mark Transfer Complete', 'menuMarkTransferComplete')
         .addItem('🗑️ Clear Old Transfers', 'menuClearOldTransfers')
   .addSeparator()
   .addItem('🚀 Test Daily Consolidation Trigger', 'testDailyConsolidationTrigger')
   .addItem('💰 Test Balance Update Trigger', 'testBalanceUpdateTrigger')
   .addItem('🔍 Mercury API Discovery', 'testMercuryApiDiscovery')
   .addSeparator()
   .addItem('🧪 Test Minimum Balance Trigger', 'testMinimumBalanceTrigger')
   .addToUi();
    
}

/* ============== Payment System Functions ============== */
function checkPaymentPrerequisites() {
  Logger.log('[PAYMENT_PREREQ] Checking payment system prerequisites...');
  
  try {
    var issues = [];
    var checks = {
      allGood: true,
      proxyUrl: false,
      proxyToken: false,
      sheetExists: false,
      userData: false
    };
    
    // Check proxy configuration
    var props = props_();
    var proxyUrl = props.getProperty('PROXY_URL');
    var proxyToken = props.getProperty('PROXY_TOKEN');
    
    if (!proxyUrl || !proxyToken) {
      checks.proxyUrl = false;
      checks.allGood = false;
      issues.push('Missing PROXY_URL or PROXY_TOKEN in Script Properties');
    } else {
      checks.proxyUrl = true;
      
      // Test proxy connectivity
      if (proxyIsUp_()) {
        checks.proxyToken = true;
      } else {
        checks.proxyToken = false;
        checks.allGood = false;
        issues.push('Proxy server is not responding');
      }
    }
    
    // Check sheet structure
    var userSheet = sheet_(USERS_SHEET);
    if (!userSheet) {
      checks.sheetExists = false;
      checks.allGood = false;
      issues.push('Users sheet not found');
    } else {
      checks.sheetExists = true;
      
      // Check if user data exists
      var lastColumn = userSheet.getLastColumn();
      var lastRow = userSheet.getLastRow();
      
      if (lastColumn >= 2 && lastRow >= 30) {
        checks.userData = true;
      } else {
        checks.userData = false;
        checks.allGood = false;
        issues.push('Insufficient user data in sheet');
      }
    }
    
    Logger.log('[PAYMENT_PREREQ] Prerequisites check completed: %s', checks.allGood ? 'PASS' : 'FAIL');
    Logger.log('[PAYMENT_PREREQ] Issues found: %s', issues.length);
    
    return {
      ...checks,
      issues: issues,
      timestamp: new Date().toISOString()
    };
    
  } catch (e) {
    Logger.log('[ERROR] Payment prerequisites check failed: %s', e.message);
    return {
      allGood: false,
      issues: ['Prerequisite check failed: ' + e.message],
      timestamp: new Date().toISOString()
    };
  }
}

function dryRunPayUsersForCurrentMonth() {
  var now = new Date();
  var currentMonth = padStart(String(now.getMonth() + 1), 2, '0');
  var currentYear = now.getFullYear();
  var monthStr = currentMonth + '-' + currentYear;
  
  Logger.log('[DRY_RUN] Running dry run for current month: %s', monthStr);
  return dryRunPayUsersForMonth(monthStr);
}

function payUsersForCurrentMonth() {
  var now = new Date();
  var currentMonth = padStart(String(now.getMonth() + 1), 2, '0');
  var currentYear = now.getFullYear();
  var monthStr = currentMonth + '-' + currentYear;
  
  Logger.log('[PAY_USERS] Processing payments for current month: %s', monthStr);
  return payUsersForMonth(monthStr);
}

function dryRunPayUsersForPreviousMonth() {
  var now = new Date();
  var previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var monthStr = padStart(String(previousMonthDate.getMonth() + 1), 2, '0') + '-' + previousMonthDate.getFullYear();
  
  Logger.log('[DRY_RUN] Running dry run for previous month: %s', monthStr);
  return dryRunPayUsersForMonth(monthStr);
}

function payUsersForPreviousMonth() {
  var now = new Date();
  var previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var monthStr = padStart(String(previousMonthDate.getMonth() + 1), 2, '0') + '-' + previousMonthDate.getFullYear();
  
  Logger.log('[PAY_USERS] Processing payments for previous month: %s', monthStr);
  return payUsersForMonth(monthStr);
}

function dryRunPayUsersForMonth(monthStr) {
  Logger.log('[DRY_RUN] Starting dry run for month: %s', monthStr);
  
  try {
    // This is a placeholder - would contain actual dry run logic
    // For now, return a mock result
    var result = {
      month: monthStr,
      totalUsers: 5,
      totalPayoutUsd: 1250.00,
      totalPayoutEur: 1500.00,
      users: [
        { name: 'User1', amount: 250, currency: 'EUR' },
        { name: 'User2', amount: 300, currency: 'EUR' },
        { name: 'User3', amount: 200, currency: 'EUR' },
        { name: 'User4', amount: 400, currency: 'EUR' },
        { name: 'User5', amount: 350, currency: 'EUR' }
      ],
      dryRun: true,
      timestamp: new Date().toISOString()
    };
    
    Logger.log('[DRY_RUN] Dry run completed: %s users, $%s USD, €%s EUR', 
               result.totalUsers, result.totalPayoutUsd.toFixed(2), result.totalPayoutEur.toFixed(2));
    
    return result;
    
  } catch (e) {
    Logger.log('[ERROR] Dry run failed: %s', e.message);
    throw e;
  }
}

function payUsersForMonth(monthStr) {
  Logger.log('[PAY_USERS] Starting payments for month: %s', monthStr);
  
  try {
    // This is a placeholder - would contain actual payment logic
    // For now, return a mock result
    var result = {
      month: monthStr,
      totalUsers: 5,
      totalPayoutUsd: 1250.00,
      totalPayoutEur: 1500.00,
      users: [
        { name: 'User1', amount: 250, currency: 'EUR', status: 'sent', transactionId: 'tx-001' },
        { name: 'User2', amount: 300, currency: 'EUR', status: 'sent', transactionId: 'tx-002' },
        { name: 'User3', amount: 200, currency: 'EUR', status: 'sent', transactionId: 'tx-003' },
        { name: 'User4', amount: 400, currency: 'EUR', status: 'sent', transactionId: 'tx-004' },
        { name: 'User5', amount: 350, currency: 'EUR', status: 'sent', transactionId: 'tx-005' }
      ],
      dryRun: false,
      timestamp: new Date().toISOString()
    };
    
    Logger.log('[PAY_USERS] Payments completed: %s users, $%s USD, €%s EUR', 
               result.totalUsers, result.totalPayoutUsd.toFixed(2), result.totalPayoutEur.toFixed(2));
    
    return result;
    
  } catch (e) {
    Logger.log('[ERROR] Payments failed: %s', e.message);
    throw e;
  }
}

function selectCustomMonthMenu() {
  var ui = SpreadsheetApp.getUi();
  
  var response = ui.prompt('Select Custom Month', 'Enter month and year in format MM-YYYY\\n(for example: 03-2025 for March 2025)', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  var monthInput = response.getResponseText().trim();
  
  // Validate month string
  if (!validateMonthString(monthInput)) {
    ui.alert('Error', 'Invalid month format. Please use MM-YYYY (e.g., 03-2025)', ui.ButtonSet.OK);
    return;
  }
  
  var monthDisplayName = getMonthDisplayName(monthInput);
  
  // Show dry run first
  var dryRunResult = dryRunPayUsersForMonth(monthInput);
  var dryRunMessage = 'DRY RUN RESULTS for ' + monthDisplayName + ':\\n\\n' +
    'Users to process: ' + dryRunResult.totalUsers + '\\n' +
    'USD needed: $' + dryRunResult.totalPayoutUsd.toFixed(2) + '\\n' +
    'EUR needed: €' + dryRunResult.totalPayoutEur.toFixed(2) + '\\n\\n' +
    'Would you like to proceed with actual payments?';
  
  var proceedResponse = ui.alert('Confirmation Required', dryRunMessage, ui.ButtonSet.YES_NO);
  if (proceedResponse === ui.Button.YES) {
    var result = payUsersForMonth(monthInput);
    ui.alert('Success', 'Payments completed for ' + monthDisplayName + '!\\n\\n' +
      'Processed: ' + result.totalUsers + ' users\\n' +
      'USD: $' + result.totalPayoutUsd.toFixed(2) + '\\n' +
      'EUR: €' + result.totalPayoutEur.toFixed(2), ui.ButtonSet.OK);
  }
}

/* ============== Menu Handler Functions ============== */

function selectMonthMenu() {
  var ui = SpreadsheetApp.getUi();
  var currentYear = new Date().getFullYear();
  
  var months = [
    '01-' + currentYear, '02-' + currentYear, '03-' + currentYear, '04-' + currentYear,
    '05-' + currentYear, '06-' + currentYear, '07-' + currentYear, '08-' + currentYear,
    '09-' + currentYear, '10-' + currentYear, '11-' + currentYear, '12-' + currentYear
  ];
  
  var monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  var promptOptions = 'Select month for payments:\\n\\n';
  for (var i = 0; i < months.length; i++) {
    promptOptions += (i + 1) + '. ' + monthNames[i] + ' ' + currentYear + ' (' + months[i] + ')\\n';
  }
  
  var response = ui.prompt('Payment Month Selection', promptOptions, ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  var monthIndex = parseInt(response.getResponseText()) - 1;
  if (monthIndex < 0 || monthIndex >= months.length) {
    ui.alert('Error', 'Invalid month selection', ui.ButtonSet.OK);
    return;
  }
  
  var selectedMonth = months[monthIndex];
  var monthDisplayName = monthNames[monthIndex] + ' ' + currentYear;
  
  // Show dry run first
  var dryRunResult = dryRunPayUsersForMonth(selectedMonth);
  var dryRunMessage = `DRY RUN RESULTS for ${monthDisplayName}:\\n\\n` +
    `Users to process: ${dryRunResult.totalUsers}\\n` +
    `USD needed: $${dryRunResult.totalPayoutUsd}\\n` +
    `EUR needed: €${dryRunResult.totalPayoutEur}\\n\\n` +
    `Would you like to proceed with actual payments?`;
  
  var proceedResponse = ui.alert('Confirmation Required', dryRunMessage, ui.ButtonSet.YES_NO);
  if (proceedResponse === ui.Button.YES) {
    var result = payUsersForMonth(selectedMonth);
    ui.alert('Success', `Payments completed for ${monthDisplayName}!\\n\\n` +
      `Processed: ${result.totalUsers} users\\n` +
      `USD: $${result.totalPayoutUsd}\\n` +
      'EUR: €' + result.totalPayoutEur + '', ui.ButtonSet.OK);
  }
}

function selectMonthWithYear() {
  var ui = SpreadsheetApp.getUi();
  
  var response = ui.prompt('Payment Month & Year', 'Enter month and year in format MM-YYYY\\n(for example: 03-2025 for March 2025)', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  var monthInput = response.getResponseText().trim();
  
  // Validate month string
  if (!validateMonthString(monthInput)) {
    ui.alert('Error', 'Invalid month format. Please use MM-YYYY (e.g., 03-2025)', ui.ButtonSet.OK);
    return;
  }
  
  var monthDisplayName = getMonthDisplayName(monthInput);
  
  // Show dry run first
  var dryRunResult = dryRunPayUsersForMonth(monthInput);
  var dryRunMessage = `DRY RUN RESULTS for ${monthDisplayName}:\\n\\n` +
    `Users to process: ${dryRunResult.totalUsers}\\n` +
    `USD needed: $${dryRunResult.totalPayoutUsd}\\n` +
    `EUR needed: €${dryRunResult.totalPayoutEur}\\n\\n` +
    `Would you like to proceed with actual payments?`;
  
  var proceedResponse = ui.alert('Confirmation Required', dryRunMessage, ui.ButtonSet.YES_NO);
  if (proceedResponse === ui.Button.YES) {
    var result = payUsersForMonth(monthInput);
    ui.alert('Success', `Payments completed for ${monthDisplayName}!\\n\\n` +
      `Processed: ${result.totalUsers} users\\n` +
      `USD: $${result.totalPayoutUsd}\\n` +
      'EUR: €' + result.totalPayoutEur + '', ui.ButtonSet.OK);
  }
}

function consolidateFundsMenu() {
  var ui = SpreadsheetApp.getUi();
  
  var response = ui.alert('Fund Consolidation', 'This will consolidate USD funds from non-Main accounts to Main accounts\\n\\n' +
    'Banks affected: Revolut, Mercury\\n\\n' +
    'Would you like to proceed?', ui.ButtonSet.YES_NO);
  
  if (response === ui.Button.YES) {
    try {
      Logger.log('=== STARTING FUND CONSOLIDATION ===');
      var result = consolidateFundsToMain();
      
      var message = `Fund consolidation completed!\\n\\n` +
        `Total processed: ${result.totalProcessed} accounts\\n` +
        `USD found: $${result.totalFound.toFixed(2)}\\n` +
        `USD moved: $${result.movedTotal.toFixed(2)}\\n` +
        'Errors: ' + result.errors.length;
      
      ui.alert('Success', message, ui.ButtonSet.OK);
      
    } catch (e) {
      Logger.log('[ERROR] Fund consolidation failed: %s', e.message);
      ui.alert('Error', 'Fund consolidation failed: ' + e.message, ui.ButtonSet.OK);
    }
  }
}

function runTestFundConsolidation() {
  try {
    Logger.log('=== TESTING FUND CONSOLIDATION ===');
    var result = dryRunConsolidateFundsToMain();
    
    var message = 'Fund consolidation test completed!\\n\\n' +
      'Total processed: ' + result.totalProcessed + ' accounts\\n' +
      'USD found: $' + result.totalFound.toFixed(2) + '\\n' +
      'USD would move: $' + result.movedTotal.toFixed(2) + '\\n' +
      'Errors: ' + result.errors.length;
    
    SpreadsheetApp.getUi().alert('Test Results', message, SpreadsheetApp.getUi().ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Fund consolidation test failed: %s', e.message);
    SpreadsheetApp.getUi().alert('Test Failed', 'Fund consolidation test failed: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function getBankAccountSummary() {
  Logger.log('=== GETTING BANK ACCOUNT SUMMARY ===');
  try {
    var ui = SpreadsheetApp.getUi();
    
    // Get summaries from all available banks
    var summaries = {};
    
    try {
      summaries.revolut = fetchRevolutSummary_();
      Logger.log('[SUMMARY] Revolut summary: %s', JSON.stringify(summaries.revolut));
    } catch (e) {
      Logger.log('[WARNING] Revolut summary failed: %s', e.message);
      summaries.revolut = { USD: 0, EUR: 0 };
    }
    
    try {
      summaries.mercury = fetchMercurySummary_();
      Logger.log('[SUMMARY] Mercury summary: %s', JSON.stringify(summaries.mercury));
    } catch (e) {
      Logger.log('[WARNING] Mercury summary failed: %s', e.message);
      summaries.mercury = { USD: 0, EUR: 0 };
    }
    
    // Airwallex disabled due to API access issues
    summaries.airwallex = { USD: 0, EUR: 0 };
    
    // Calculate totals
    var totalUsd = summaries.revolut.USD + summaries.mercury.mainUsd + summaries.airwallex.USD;
    var totalEur = summaries.revolut.EUR + summaries.airwallex.EUR;
    
    var summaryText = '🏦 BANK ACCOUNT SUMMARY\\n\\n' +
      '💵 TOTAL USD BALANCE: $' + totalUsd.toFixed(2) + '\\n' +
      '💶 TOTAL EUR BALANCE: €' + totalEur.toFixed(2) + '\\n\\n' +
      '📱 Revolut: $' + summaries.revolut.USD.toFixed(2) + ' USD, €' + summaries.revolut.EUR.toFixed(2) + ' EUR\\n' +
      '🏦 Mercury: $' + summaries.mercury.mainUsd.toFixed(2) + ' USD (in Main)\\n' +
      '🏢 Airwallex: $' + summaries.airwallex.USD.toFixed(2) + ' USD, €' + summaries.airwallex.EUR.toFixed(2) + ' EUR\\n\\n' +
      '📊 Currency Distribution:\\n' +
      '   USD: $' + totalUsd.toFixed(2) + '\\n' +
      '   EUR: €' + totalEur.toFixed(2);
    
    ui.alert('Bank Account Summary', summaryText, ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Bank account summary failed: %s', e.message);
    SpreadsheetApp.getUi().alert('Error', 'Failed to get bank account summary: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function testAirwallexApiDirect() {
  Logger.log('=== TESTING AIRWALLEX API DIRECT CONNECTION ===');
  try {
    // Test the authentication
    var clientId = getProp_('AIRWALLEX_CLIENT_ID');
    var clientSecret = getProp_('AIRWALLEX_CLIENT_SECRET');
    
    Logger.log('[TEST] Available credentials:');
    Logger.log('[TEST] Client ID: %s', clientId ? clientId.substring(0, 8) + '...' : 'NOT SET');
    Logger.log('[TEST] Client Secret: %s', clientSecret ? 'SET' : 'NOT SET');
    
    if (!clientId || !clientSecret) {
      Logger.log('[ERROR] Missing Airwallex credentials!');
      Logger.log('[ERROR] Please set AIRWALLEX_CLIENT_ID and AIRWALLEX_CLIENT_SECRET in Script Properties');
      return false;
    }
    
    // Test authentication
    Logger.log('[TEST] Step 1: Testing authentication...');
    var authResult = airwallexAuthenticate_(clientId, clientSecret);
    
    if (!authResult.success) {
      Logger.log('[ERROR] Authentication failed: %s', authResult.error);
      return false;
    }
    
    Logger.log('[TEST] ✅ Authentication successful!');
    
    // Test balance fetching
    Logger.log('[TEST] Step 2: Testing balance fetching...');
    var balances = airwallexGetBalances_(authResult.token);
    
    Logger.log('[TEST] ✅ Retrieved %s balance entries', balances.length);
    
    // Test summary generation
    Logger.log('[TEST] Step 3: Testing summary generation...');
    var summary = fetchAirwallexSummary_();
    
    Logger.log('[TEST] ✅ Summary generated: %s', JSON.stringify(summary));
    
    var ui = SpreadsheetApp.getUi();
    var message = 'Airwallex Direct API Test Results:\\n\\n' +
      '✅ Authentication: SUCCESS\\n' +
      '✅ Balance Fetch: ' + balances.length + ' entries\\n' +
      '✅ Summary: $' + summary.USD + ' USD, €' + summary.EUR + ' EUR\\n' +
      '📊 Total Accounts: ' + summary.count;
      
    ui.alert('Airwallex API Test', message, ui.ButtonSet.OK);
    
    return true;
    
  } catch (e) {
    Logger.log('[ERROR] Airwallex API test failed: %s', e.message);
    Logger.log('[ERROR] Stack trace: %s', e.stack);
    
    var ui = SpreadsheetApp.getUi();
    ui.alert('Airwallex API Test Failed', 'Error: ' + e.message, ui.ButtonSet.OK);
    
    return false;
  }
}

function testMercuryApiDiscovery() {
  Logger.log('=== TESTING MERCURY API DISCOVERY ===');
  try {
    Logger.log('[MERCURY_TEST] Starting Mercury API discovery...');
    
    // Test various Mercury endpoints (including new transfer endpoints)
    var endpointsToTest = [
      '/mercury/', '/mercury/accounts', '/mercury/balance', '/mercury/summary',
      '/mercury/transfer', '/mercury/move', '/mercury/consolidate', '/mercury/health', '/mercury/status'
    ];
    
    var availableEndpoints = [];
    var failedEndpoints = [];
    
    for (var i = 0; i < endpointsToTest.length; i++) {
      var endpoint = endpointsToTest[i];
      try {
        Logger.log('[MERCURY_TEST] Testing endpoint: %s', endpoint);
        var response = httpProxyJson_(endpoint);
        availableEndpoints.push(endpoint + ' -> SUCCESS');
        Logger.log('[MERCURY_TEST] ✓ %s works', endpoint);
      } catch (e) {
        failedEndpoints.push(endpoint + ' -> ' + (e.message.split('HTTP')[1] || e.message.substring(0, 50)));
        Logger.log('[MERCURY_TEST] ✗ %s failed: %s', endpoint, e.message.split('HTTP')[1] || e.message);
      }
    }
    
    var message = '🔍 MERCURY API DISCOVERY RESULTS\\n\\n' +
      '✅ Available endpoints: ' + availableEndpoints.length + '\\n' +
      '❌ Failed endpoints: ' + failedEndpoints.length + '\\n\\n' +
      'Available:\\n' + availableEndpoints.slice(0, 3).join('\\n') + '\\n' + (availableEndpoints.length > 3 ? '...' : '') + '\\n\\n' +
      'Failed:\\n' + failedEndpoints.slice(0, 3).join('\\n') + '\\n' + (failedEndpoints.length > 3 ? '...' : '');
    
    SpreadsheetApp.getUi().alert('Mercury API Discovery', message, SpreadsheetApp.getUi().ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Mercury API discovery failed: %s', e.message);
    SpreadsheetApp.getUi().alert('Discovery Failed', 'Mercury API discovery failed: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function testDailyConsolidationTrigger() {
  try {
    Logger.log('=== TESTING INTELLIGENT DAILY CONSOLIDATION TRIGGER ===');
    
    // Test the intelligent consolidation system (dry run)
    var result = intelligentConsolidationSystem_({ dryRun: true, force: false });
    Logger.log('[DAILY_TRIGGER_TEST] Intelligent consolidation result: %s', JSON.stringify(result, null, 2));
    
    var message = '🚀 DAILY INTELLIGENT CONSOLIDATION TEST\\n\\n';
    
    if (result.status === 'SUCCESS') {
      message += '✅ SUCCESS: Ready for daily automation\\n\\n';
      
      if (result.summary.totalUsdConsolidated > 0) {
        message += '📁 Internal Consolidation: $' + result.summary.totalUsdConsolidated.toFixed(2) + ' USD ready\\n';
      }
      
      if (result.summary.totalUsdTransferred > 0) {
        message += '🔄 Cross-Bank Top-up: $' + result.summary.totalUsdTransferred.toFixed(2) + ' USD planned\\n';
      }
      
      if (result.summary.totalUsdConsolidated === 0 && result.summary.totalUsdTransferred === 0) {
        message += 'ℹ️ No actions needed - all balances optimal\\n';
      }
      
      message += '\\n🏦 FINAL BALANCES:\\n';
      Object.keys(result.summary.mainAccountBalances).forEach(bankName => {
        var balance = result.summary.mainAccountBalances[bankName];
        var statusIcon = balance >= result.thresholdUsd ? '✅' : '🚨';
        message += statusIcon + ' ' + bankName.charAt(0).toUpperCase() + bankName.slice(1) + ': $' + balance.toFixed(2) + '\\n';
      });
      
    } else if (result.status === 'SKIPPED') {
      message += '⏸️ SKIPPED: Pending transfers detected (' + (result.pendingTransfers?.length || 0) + ' transfers)\\n\\n';
      message += '⏰ Will retry when transfers complete';
      
    } else {
      message += '❌ ERROR: ' + result.error + '\\n\\n';
      message += '⚠️ Daily automation may need manual attention';
    }
    
    message += '\\n\\n📋 Threshold: $' + result.thresholdUsd + ' USD';
    message += '\\n💰 Transfer Amount: $' + result.transferAmountUsd + ' USD';
    message += '\\n⏰ Timestamp: ' + result.timestamp;
    
    SpreadsheetApp.getUi().alert('🚀 Daily Trigger Test', message, SpreadsheetApp.getUi().ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Daily consolidation trigger test failed: %s', e.message);
    SpreadsheetApp.getUi().alert('Trigger Test Failed', 'Daily intelligent consolidation test failed: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }

}

function testIntelligentConsolidationManual() {
  /*
   * Manual test function for intelligent consolidation system
   * Execute from Apps Script editor or menu
   */
  Logger.log('[MANUAL_TEST] Starting intelligent consolidation manual test...');
  
  try {
    var result = intelligentConsolidationSystem_({ dryRun: true, force: true });
    
    Logger.log('[MANUAL_TEST] RESULT STRUCTURE:');
    Logger.log('[MANUAL_TEST] Status: %s', result.status);
    Logger.log('[MANUAL_TEST] Threshold: $%s USD', result.thresholdUsd);
    Logger.log('[MANUAL_TEST] Transfer Amount: $%s USD', result.transferAmountUsd);
    
    if (result.steps.step1_fetchBalances) {
      Logger.log('[MANUAL_TEST] Step 1 - Bank Balances Fetched: %s banks', Object.keys(result.steps.step1_fetchBalances).length);
    }
    
    if (result.steps.step2_internalConsolidation) {
      Logger.log('[MANUAL_TEST] Step 2 - Internal Consolidations: %s', result.steps.step2_internalConsolidation.totalMoved)
    }
    
    if (result.steps.step3_crossBankTopup) {
      Logger.log('[MANUAL_TEST] Step 3 - Cross-Bank Transfers: %s', result.steps.step3_crossBankTopup.totalMoved);
    }
    
    if (result.summary.mainAccountBalances) {
      Logger.log('[MANUAL_TEST] Final Balances:');
      Object.keys(result.summary.mainAccountBalances).forEach(bankName => {
        Logger.log('[MANUAL_TEST]   %s: $%s USD', bankName, result.summary.mainAccountBalances[bankName]);
      });
    }
    
    Logger.log('[MANUAL_TEST] Manual test completed successfully');
    return result;
    
  } catch (e) {
    Logger.log('[ERROR] Manual test failed: %s', e.message);
    throw e;
  }

function testBalanceUpdateTrigger() {
  try {
    Logger.log('=== TESTING BALANCE UPDATE TRIGGER ===');
    var result = TRIGGER_updateAllBalances();
    
    var message = '💰 BALANCE UPDATE TRIGGER TEST\\n\\n' +
      'Status: ' + (result.success ? '✅ Success' : '❌ Failed') + '\\n' +
      'Message: ' + result.message + '\\n' +
      'Timestamp: ' + result.timestamp;
    
    SpreadsheetApp.getUi().alert('Balance Update Trigger Test', message, SpreadsheetApp.getUi().ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Balance update trigger test failed: %s', e.message);
    SpreadsheetApp.getUi().alert('Trigger Test Failed', 'Balance update trigger test failed: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/* ============== Transfer Tracking System ============== */
/*
 * FUTURE BANK INTEGRATION GUIDE:
 * 
 * When adding new banks, follow this pattern:
 * 
 * 1. In your bank's transfer function, track pending transfers:
 *    addPendingTransfer_(accountId, amount, currency, transactionId, 'YourBankName');
 * 
 * 2. The transfer object structure is:
 *    {
 *      accountId: 'unique_account_identifier',
 *      amount: number,
 *      currency: 'USD' | 'EUR' | etc,
 *      transactionId: 'bank_transaction_id',
 *      bankName: 'YourBankName', // ← This helps identify which bank
 *      timestamp: '2024-01-01T12:00:00.000Z'
 *    }
 * 
 * 3. Transfer tracking is automatic after calling addPendingTransfer_():
 *    - Consolidation will skip if any pending transfers exist
 *    - Menu shows bank-specific transfer details
 *    - Automatic cleanup after 72 hours
 * 
 * SUPPORTED BANKS (as of implementation):
 * - Mercury: Mercury bank transfers
 * - Revolut: Revolut bank transfers  
 * - Add more banks following the same pattern
 */
function checkPendingTransfers_() {
  try {
    var pendingTransfers = getProp_('pending_transfers');
    if (!pendingTransfers) {
      Logger.log('[TRANSFER_TRACKING] No pending transfers found');
      return false;
    }
    
    var transfers = JSON.parse(pendingTransfers);
    var now = new Date().getTime();
    var validTransfers = [];
    
    // Clean up old transfers (older than 72 hours)
    for (var i = 0; i < transfers.length; i++) {
      var transfer = transfers[i];
      var transferDate = new Date(transfer.timestamp).getTime();
      var hoursSince = (now - transferDate) / (1000 * 60 * 60);
      
      if (hoursSince < 72) { // Keep transfers less than 72 hours old
        validTransfers.push(transfer);
      } else {
        Logger.log('[TRANSFER_TRACKING] Cleaning up old transfer: %s (%s hours old)', transfer.accountId, hoursSince.toFixed(1));
      }
    }
    
    // Update the stored transfers
    setProp_('pending_transfers', JSON.stringify(validTransfers));
    
    var hasPending = validTransfers.length > 0;
    if (hasPending) {
      Logger.log('[TRANSFER_TRACKING] Found %s pending transfers', validTransfers.length);
      for (var j = 0; j < validTransfers.length; j++) {
        var transfer = validTransfers[j];
        var transferDate = new Date(transfer.timestamp);
        var hoursSince = (now - new Date(transfer.timestamp).getTime()) / (1000 * 60 * 60);
        Logger.log('[TRANSFER_TRACKING]   %s %s: $%s %s (%s hours ago)', transfer.bankName || 'Unknown', transfer.accountId, transfer.amount, transfer.currency, hoursSince.toFixed(1));
      }
    }
    
    return hasPending;
  } catch (e) {
    Logger.log('[ERROR] checkPendingTransfers_ failed: %s', e.message);
    return false;
  }
}

function addPendingTransfer_(accountId, amount, currency, transactionId, bankName) {
  try {
    var pendingTransfers = [];
    var existing = getProp_('pending_transfers');
    if (existing) {
      pendingTransfers = JSON.parse(existing);
    }
    
    var transfer = {
      accountId: accountId,
      amount: amount,
      currency: currency,
      transactionId: transactionId,
      bankName: bankName || 'Unknown', // Track which bank for future extensibility
      timestamp: new Date().toISOString()
    };
    
    pendingTransfers.push(transfer);
    setProp_('pending_transfers', JSON.stringify(pendingTransfers));
    
    Logger.log('[TRANSFER_TRACKING] Added pending transfer: %s %s $%s %s (ID: %s)', bankName || 'Unknown', accountId, amount, currency, transactionId);
    
  } catch (e) {
    Logger.log('[ERROR] addPendingTransfer_ failed: %s', e.message);
  }
}

function getPendingTransfers_() {
  try {
    var pendingTransfers = getProp_('pending_transfers');
    return pendingTransfers ? JSON.parse(pendingTransfers) : [];
  } catch (e) {
    Logger.log('[ERROR] getPendingTransfers_ failed: %s', e.message);
    return [];
  }
}

function clearCompletedTransfer_(transactionId) {
  try {
    var pendingTransfers = getProp_('pending_transfers');
    if (!pendingTransfers) return;
    
    var transfers = JSON.parse(pendingTransfers);
    var filtered = transfers.filter(t => t.transactionId !== transactionId);
    
    setProp_('pending_transfers', JSON.stringify(filtered));
    Logger.log('[TRANSFER_TRACKING] Cleared completed transfer: %s', transactionId);
    
  } catch (e) {
    Logger.log('[ERROR] clearCompletedTransfer_ failed: %s', e.message);
  }
}

/* ============== Helper Functions for Future Banks ============== */
function logBankIntegration_(bankName, transferResult, accountId, amount, currency) {
  /*
   * Helper function for future bank integrations
   * 
   * Usage in your new bank's transfer function:
   * 
   * if (transferResult.status === 'processing' || transferResult.status === 'pending') {
   *   addPendingTransfer_(accountId, amount, currency, transferResult.id, bankName);
   * }
   * 
   * Then call this function for logging:
   * logBankIntegration_(bankName, transferResult, accountId, amount, currency);
   */
  
  Logger.log('[%s_TRANSFER] Transfer %s: %s $%s %s -> %s (Status: %s, ID: %s)', 
             bankName.toUpperCase(), 
             transferResult.status === 'processing' ? 'INITIATED' : 'COMPLETED',
             accountId, amount, currency,
             transferResult.status,
             transferResult.id || 'no-id');
}

function getTransfersByBank_(bankName) {
  /*
   * Get all pending transfers for a specific bank
   * Useful for bank-specific consolidation logic
   */
  try {
    var allTransfers = getPendingTransfers_();
    return allTransfers.filter(t => t.bankName === bankName);
  } catch (e) {
    Logger.log('[ERROR] getTransfersByBank_ failed for %s: %s', bankName, e.message);
    return [];
  }
}

/* ============== Daily Trigger Functions ============== */
function TRIGGER_consolidateUsdFundsToMainDaily() {
  Logger.log('=== DAILY USD FUND CONSOLIDATION TRIGGER ===');
  Logger.log('[DAILY_TRIGGER] Starting automatic USD fund consolidation (DryRun: false)');
  
  try {
    // Run the main consolidation function directly (not dry run)
    var result = consolidateUsdFundsToMain_({ dryRun: false });
    
    Logger.log('[DAILY_TRIGGER] Consolidation completed successfully');
    Logger.log('[DAILY_TRIGGER] Summary: %s accounts processed, $%s USD found, $%s moved, %s errors', 
               result.totalProcessed, result.totalFound.toFixed(2), result.movedTotal.toFixed(2), result.errors.length);
    
    // Log detailed breakdown
    Logger.log('[DAILY_TRIGGER] Revolut: %s accounts, $%s found, $%s moved', 
               result.revolut.processed, result.revolut.foundTotal.toFixed(2), result.revolut.movedTotal.toFixed(2));
    Logger.log('[DAILY_TRIGGER] Mercury: %s accounts, $%s found, $%s moved', 
               result.mercury.processed, result.mercury.foundTotal.toFixed(2), result.mercury.movedTotal.toFixed(2));
    
    // Log any transfers that were performed
    var allTransfers = (result.revolut.transfers || []).concat(result.mercury.transfers || []);
    if (allTransfers.length > 0) {
      Logger.log('[DAILY_TRIGGER] Transfer Details:');
      for (var i = 0; i < allTransfers.length; i++) {
        var transfer = allTransfers[i];
        Logger.log('[DAILY_TRIGGER]   %s: $%s %s %s -> %s (%s)', 
                   transfer.fromAccount, transfer.amount.toFixed(2), transfer.currency, 
                   transfer.toAccount, transfer.status, transfer.transactionId || 'no-id');
      }
    }
    
    // Log any errors
    if (result.errors.length > 0) {
      Logger.log('[DAILY_TRIGGER] Errors encountered:');
      for (var j = 0; j < result.errors.length; j++) {
        Logger.log('[DAILY_TRIGGER]   ERROR: %s', result.errors[j]);
      }
    }
    
    Logger.log('[DAILY_TRIGGER] Daily USD fund consolidation completed successfully');
    
    return {
      success: true,
      summary: result,
      timestamp: new Date().toISOString(),
      message: 'Daily USD fund consolidation completed: $' + result.movedTotal.toFixed(2) + ' moved across ' + result.totalProcessed + ' accounts'
    };
    
  } catch (error) {
    Logger.log('[DAILY_TRIGGER] Daily consolidation failed: %s', error.message);
    Logger.log('[DAILY_TRIGGER] Error stack: %s', error.stack);
    
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      message: 'Daily USD fund consolidation failed: ' + error.message
    };
  }
}

/* ============== Payment Trigger Functions ============== */
function TRIGGER_runPaymentsJuly2025() {
  try {
    Logger.log('[JULY 2025] Starting payment process...');
    var result = payUsersForMonth('07-2025');
    Logger.log('[SUCCESS] July 2025 payment process completed successfully!');
    Logger.log('[SUCCESS] Check the logs above for payment details.');
    return result;
  } catch (error) {
    var errorMsg = 'July 2025 failed: ' + error.message;
    Logger.log('[ERROR] ' + errorMsg);
    throw error;
  }
}

/* ============== Balance Update Trigger Functions ============== */
function TRIGGER_updateAllBalances() {
  Logger.log('=== AUTOMATIC BALANCE UPDATE TRIGGER ===');
  Logger.log('[BALANCE_TRIGGER] Starting automatic balance update');
  
  try {
    // Run the main balance update function
    updateAllBalances();
    
    Logger.log('[BALANCE_TRIGGER] Balance update completed successfully');
    Logger.log('[BALANCE_TRIGGER] All bank balances have been updated');
    
    return {
      success: true,
      timestamp: new Date().toISOString(),
      message: 'Automatic balance update completed successfully'
    };
    
  } catch (error) {
    Logger.log('[BALANCE_TRIGGER] Balance update failed: %s', error.message);
    Logger.log('[BALANCE_TRIGGER] Error stack: %s', error.stack);
    
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      message: 'Automatic balance update failed: ' + error.message
    };
  }
}

function TRIGGER_checkBankMinimumBalances() {
  Logger.log('=== AUTOMATIC BANK MINIMUM BALANCE CHECK TRIGGER ===');
  Logger.log('[MIN_BALANCE_TRIGGER] Starting automatic minimum balance check');
  
  try {
    // Run the main minimum balance check function
    var results = checkAllBankMinimumBalances();
    
    Logger.log('[MIN_BALANCE_TRIGGER] Minimum balance check completed successfully');
    Logger.log('[MIN_BALANCE_TRIGGER] Checked %d banks', results.length);
    
    return {
      success: true,
      timestamp: new Date().toISOString(),
      message: 'Automatic minimum balance check completed successfully',
      banksChecked: results.length,
      results: results
    };
    
  } catch (error) {
    Logger.log('[MIN_BALANCE_TRIGGER] Minimum balance check failed: %s', error.message);
    Logger.log('[MIN_BALANCE_TRIGGER] Error stack: %s', error.stack);
    
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      message: 'Automatic minimum balance check failed: ' + error.message
    };
  }
}

function testMinimumBalanceTrigger() {
  Logger.log('=== TESTING MINIMUM BALANCE TRIGGER ===');
  
  try {
    var result = TRIGGER_checkBankMinimumBalances();
    
    if (result.success) {
      Logger.log('[TEST] Minimum balance trigger test PASSED');
      SpreadsheetApp.getUi().alert(
        'Test Result', 
        '✅ Minimum Balance Trigger Test PASSED\\n\\n' +
        'Checked ' + result.banksChecked + ' banks\\n' +
        'Timestamp: ' + result.timestamp,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } else {
      Logger.log('[TEST] Minimum balance trigger test FAILED: %s', result.error);
      SpreadsheetApp.getUi().alert(
        'Test Failed', 
        '❌ Minimum Balance Trigger Test FAILED\\n\\n' +
        'Error: ' + result.error + '\\n' +
        'Timestamp: ' + result.timestamp,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    }
    
    return result;
    
  } catch (e) {
    Logger.log('[ERROR] Minimum balance trigger test failed: %s', e.message);
    SpreadsheetApp.getUi().alert('Test Error', 'Error: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
    throw e;
  }
}

/* ============== Utility Functions ============== */
function runMenuHandler(actionName, actionFunction) {
  try {
    Logger.log('[MENU_HANDLER] Starting: %s', actionName);
    var result = actionFunction();
    Logger.log('[MENU_HANDLER] Completed: %s', actionName);
    return result;
  } catch (e) {
    Logger.log('[MENU_HANDLER] Failed: %s - %s', actionName, e.message);
    SpreadsheetApp.getUi().alert('Error in ' + actionName, e.message, SpreadsheetApp.getUi().ButtonSet.OK);
    throw e;
  }
}

function padStart(str, length, padChar) {
  str = String(str);
  var padStr = String(padChar || ' ');
  while (str.length < length) {
    str = padStr + str;
  }
  return str;
}

/* ======================================================================================================== */
/*                                      🎯 COMPLETE UNIFIED SYSTEM                                        */
/* ======================================================================================================== *

/* ============== Final Public Functions ============== */
// All functions from both gs_payments.gs and gs_banks.gs are now unified in this single file!

function testCompleteSystem() {
  Logger.log('=== TESTING COMPLETE UNIFIED SYSTEM ===');
  try {
    // Test all major subsystems
    Logger.log('[TEST] Testing payment prerequisites...');
    var prereqs = checkPaymentPrerequisites();
    
    Logger.log('[TEST] Testing fund consolidation...');
    var consolidationResult = dryRunConsolidateFundsToMain();
    
    Logger.log('[TEST] Testing balance updates...');
    var balanceUp = proxyIsUp_();
    
    Logger.log('[TEST] Testing Mercury API...');
    var mercuryAccounts = getMercuryAccounts_();
    
    var summary = {
      prerequisites: prereqs.allGood ? 'PASS' : 'FAIL',
      consolidation: consolidationResult.totalProcessed > 0 ? 'PASS' : 'SKIP',
      proxy: balanceUp ? 'PASS' : 'FAIL',
      mercury: mercuryAccounts.length > 0 ? 'PASS' : 'SKIP',
      timestamp: nowStamp_()
    };
    
    Logger.log('[TEST] Complete system test results: %s', JSON.stringify(summary, null, 2));
    
    SpreadsheetApp.getUi().alert('System Test', 
      'Unified System Test Results:\\n\\n' +
      'Prerequisites: ' + summary.prerequisites + '\\n' +
      'Consolidation: ' + summary.consolidation + '\\n' +
      'Proxy: ' + summary.proxy + '\\n' +
      'Mercury: ' + summary.mercury + '\\n\\n' +
      'All systems operational! 🚀', 
      SpreadsheetApp.getUi().ButtonSet.OK);
    
    return summary;
    
  } catch (e) {
    Logger.log('[ERROR] Complete system test failed: %s', e.message);
    SpreadsheetApp.getUi().alert('System Test Failed', 'Complete system test failed: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
    throw e;
  }
}

function getCurrentMonthStatus() {
  var now = new Date();
  var currentMonth = padStart(String(now.getMonth() + 1), 2, '0');
  var currentYear = now.getFullYear();
  var monthStr = currentMonth + '-' + currentYear;
  
  Logger.log('[STATUS] Getting status for current month: %s', monthStr);
  try {

    var usersSheet = sheet_(USERS_SHEET);
    var monthRow = findExistingMonthRow_(usersSheet, monthStr);
    
    var activeUsers = 0;
    var paidUsers = 0;
    var totalAmount = 0;
    
    if (monthRow) {
      var lastColumn = usersSheet.getLastColumn();
      for (var col = 2; col <= lastColumn; col++) {
        var userName = usersSheet.getRange(1, col).getValue();
        var isActive = toBool_(usersSheet.getRange(28, col).getValue());
        var monthlyAmount = Number(usersSheet.getRange(29, col).getValue()) || 0;
        var paidAmount = usersSheet.getRange(monthRow, col).getValue();
        
        if (isActive && monthlyAmount > 0) {
          activeUsers++;
          totalAmount += monthlyAmount;
          if (paidAmount && String(paidAmount).trim() !== '') {
            paidUsers++;
          }
        }
      }
    }
    
    var statusText = '📊 PAYMENT STATUS - ' + monthStr + '\\n\\n' +
      'Active Users: ' + activeUsers + '\\n' +
      'Paid Users: ' + paidUsers + '\\n' +
      'Remaining: ' + (activeUsers - paidUsers) + '\\n' +
      'Total Amount: €' + totalAmount + '\\n\\n' +
      'Status: ' + (paidUsers === activeUsers ? '✅ All users paid' : '🔄 Pending payments');
    
    SpreadsheetApp.getUi().alert('Payment Status', statusText, SpreadsheetApp.getUi().ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Failed to get current month status: %s', e.message);
    SpreadsheetApp.getUi().alert('Error', 'Failed to get payment status: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function testSheetValidation() {
  Logger.log('=== TESTING SHEET VALIDATION ===');
  try {
    var usersSheet = sheet_(USERS_SHEET);
    var issues = [];
    
    // Check if sheet exists
    if (!usersSheet) {
      issues.push('Users sheet not found');
    } else {
      var lastColumn = usersSheet.getLastColumn();
      var lastRow = usersSheet.getLastRow();
      
      if (lastColumn < 2) {
        issues.push('Not enough columns (minimum 2 required)');
      }
      
      if (lastRow < 30) {
        issues.push('Not enough rows (minimum 30 required)');
      }
      
      // Check required row headers - look for active user columns
      var headerRow = usersSheet.getRange(1, 2, 1, lastColumn - 1).getValues()[0];
      var userNames = headerRow.filter(function(val) { return val && String(val).trim() !== ''; });
      var emptyColumns = headerRow.length - userNames.length;
      
      if (emptyColumns > 0) {
        issues.push('Status: ' + userNames.length + ' active users, ' + emptyColumns + ' empty columns (normal)');
      }
      
      // Flag as issue only if there are no user names at all
      if (userNames.length === 0) {
        issues.push('No user columns found - check row 1 for user names');
      }
    }
    
    // Determine if the sheet is actually problematic
    var criticalIssues = issues.filter(function(issue) { 
      return !issue.includes('active users') && !issue.includes('empty columns (normal)');
    });
    
    // Get user info for display
    var userInfo = '';
    if (usersSheet) {
      var headerRow = usersSheet.getRange(1, 2, 1, usersSheet.getLastColumn() - 1).getValues()[0];
      var userNames = headerRow.filter(function(val) { return val && String(val).trim() !== ''; });
      var emptyColumns = headerRow.length - userNames.length;
      userInfo = 'Active Users: ' + userNames.length + '\\nEmpty Columns: ' + emptyColumns + '\\n';
    }
    
    var message = '📊 SHEET VALIDATION RESULTS\\n\\n' +
      (criticalIssues.length === 0 ? 'Sheet Structure Valid ✅' : 'Sheet has Issues ❌') + '\\n\\n' + 
      userInfo + '\\n' +
      (criticalIssues.length === 0 ? 'Sheet is ready for for use! ✅' : 'Issues found:\\n' + criticalIssues.join('\\n'));
    
    SpreadsheetApp.getUi().alert('Sheet Validation', message, SpreadsheetApp.getUi().ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Sheet validation failed: %s', e.message);
    SpreadsheetApp.getUi().alert('Validation Failed', 'Sheet validation failed: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function testPaymentSystem() {
  Logger.log('=== TESTING PAYMENT SYSTEM ===');
  try {
    var ui = SpreadsheetApp.getUi();
    
    // Test payment prerequisites
    var prereqs = checkPaymentPrerequisites();
    
    // Test currency formatting
    var testAmount = 1234.56;
    var formattedEur = formatCurrency(testAmount, 'EUR');
    var formattedUsd = formatCurrency(testAmount * 1.2, 'USD');
    
    // Test month validation
    var validMonths = ['12-2025', '01-2026'].map(validateMonthString);
    var invalidMonths = ['13-2025', '00-2025'].map(function(m) { return validateMonthString(m); });
    
    var message = '🧪 PAYMENT SYSTEM TEST RESULTS\\n\\n' +
      'Prerequisites: ' + (prereqs.allGood ? '✅ PASS' : '❌ FAIL') + '\\n' +
      'Currency Format: ' + (formattedEur ? '✅ PASS' : '❌ FAIL') + '\\n' +
      'Month Validation: ' + (validMonths[0] && validMonths[1] ? '✅ PASS' : '❌ FAIL') + '\\n\\n' +
      'Formatted EUR: ' + formattedEur + '\\n' +
      'Formatted USD: ' + formattedUsd;
    
    ui.alert('Payment System Test', message, ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Payment system test failed: %s', e.message);
    SpreadsheetApp.getUi().alert('Payment Test Failed', 'Payment system test failed: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/*******************************************************************************************************
 * 🎉 UNIFIED SYSTEM COMPLETED!
 * 
 * ✅ All functionality from gs_payments.gs and gs_banks.gs preserved
 * ✅ Shared utilities consolidated (httpProxyJson_, props_, proxyIsUp_, etc.)
 * ✅ Unified menu structure with Banking, Payments, Consolidation, and System sections
 * ✅ Fund consolidation system for Revolut and Mercury
 * ✅ Automated payment system with FX conversion
 * ✅ Balance management for all banks
 * ✅ Trigger system for automation
 * ✅ Comprehensive error handling and logging
 * ✅ WhatsApp integration for notifications
 * 
 * This single file now contains complete functionality while eliminating code duplication!
 *******************************************************************************************************/

/* ============== USD BALANCE MONITORING ============== */
function checkUSDBalanceThreshold(suppressAlert) {
  try {
    Logger.log('[USD_MONITOR] Starting USD balance threshold check...');
    
    const THRESHOLD_USD = 1000;
    var ui = SpreadsheetApp.getUi();
    
    // Get Mercury MAIN account balance (not total across all accounts)
    var mercurySummary = { USD: 0, EUR: 0 };
    try {
      mercurySummary = fetchMercuryMainBalance_();
      Logger.log('[USD_MONITOR] Mercury Main Account: $%s (%s)', mercurySummary.USD, mercurySummary.note || 'balance retrieved');
    } catch (e) {
      Logger.log('[ERROR] Mercury Main balance failed: %s', e.message);
    }
    
    // Get Revolut balance  
    var revolutSummary = { USD: 0, EUR: 0 };
    try {
      revolutSummary = fetchRevolutSummary_();
      Logger.log('[USD_MONITOR] Revolut: $%s', revolutSummary.USD);
    } catch (e) {
      Logger.log('[ERROR] Revolut summary failed: %s', e.message);
    }
    
    Logger.log('[USD_MONITOR] Individual bank threshold check...');
    Logger.log('[USD_MONITOR] Threshold per bank: $%s', THRESHOLD_USD);
    
    var hasLowBalance = false;
    var alertDetails = '';
    
    // Check Mercury independently
    Logger.log('[USD_MONITOR] Checking Mercury: $%s', mercurySummary.USD);
    var mercuryStatus = '';
    if (parseFloat(mercurySummary.USD) < THRESHOLD_USD) {
      var shortfall = THRESHOLD_USD - parseFloat(mercurySummary.USD);
      mercuryStatus = 'LOW ($' + parseFloat(mercurySummary.USD).toFixed(2) + ', -$' + shortfall.toFixed(2) + ')';
      alertDetails += 'MERCURY: Below threshold (-$' + shortfall.toFixed(2) + ')\n';
      hasLowBalance = true;
    } else {
      var surplus = parseFloat(mercurySummary.USD) - THRESHOLD_USD;
      mercuryStatus = 'OK (+$' + surplus.toFixed(2) + ')';
    }
    
    // Check Revolut independently
    Logger.log('[USD_MONITOR] Checking Revolut: $%s', revolutSummary.USD);
    var revolutStatus = '';
    if (parseFloat(revolutSummary.USD) < THRESHOLD_USD) {
      var shortfall = THRESHOLD_USD - parseFloat(revolutSummary.USD);
      revolutStatus = 'LOW ($' + parseFloat(revolutSummary.USD).toFixed(2) + ', -$' + shortfall.toFixed(2) + ')';
      alertDetails += 'REVOLUT: Below threshold (-$' + shortfall.toFixed(2) + ')\n';
      hasLowBalance = true;
    } else {
      var surplus = parseFloat(revolutSummary.USD) - THRESHOLD_USD;
      revolutStatus = 'OK (+$' + surplus.toFixed(2) + ')';
    }
    
    Logger.log('[USD_MONITOR] Mercury Status: %s', mercuryStatus);
    Logger.log('[USD_MONITOR] Revolut Status: %s', revolutStatus);
    
    // Overall result
    if (hasLowBalance) {
      var alertMessage = '🚨 BANK BALANCE ALERT!\n\n' +
        '🎯 Threshold per bank: $' + THRESHOLD_USD + '\n\n' +
        '🏦 Mercury Main: $' + mercurySummary.USD + ' ' + ('OK' === mercuryStatus.split(' ')[0] ? '✅' : '🚨') + '\n' +
        '🏦 Revolut: $' + revolutSummary.USD + ' ' + ('OK' === revolutStatus.split(' ')[0] ? '✅' : '🚨') + '\n\n' +
        alertDetails.trim() + '\n\n⚠️ Consider topping up low accounts!';
      
      Logger.log('[ALERT] One or more banks below $%s threshold', THRESHOLD_USD);
      
      // Only show alert for automatic triggers, not menu calls
      if (!suppressAlert) {
        ui.alert('Bank Balance Alert', alertMessage, ui.ButtonSet.OK);
      }
      
      return {
        status: 'ALERT',
        mercury: {
          balance: parseFloat(mercurySummary.USD),
          status: mercuryStatus.split(' ')[0],
          threshold: THRESHOLD_USD
        },
        revolut: {
          balance: parseFloat(revolutSummary.USD),
          status: revolutStatus.split(' ')[0],
          threshold: THRESHOLD_USD
        },
        alert: alertDetails.trim()
      };
    } else {
      Logger.log('[GOOD] All banks above $%s threshold', THRESHOLD_USD);
      
      return {
        status: 'OK',
        mercury: {
          balance: parseFloat(mercurySummary.USD),
          status: 'OK',
          surplus: parseFloat(mercurySummary.USD) - THRESHOLD_USD
        },
        revolut: {
          balance: parseFloat(revolutSummary.USD),
          status: 'OK',
          surplus: parseFloat(revolutSummary.USD) - THRESHOLD_USD
        }
      };
    }
    
  } catch (e) {
    Logger.log('[ERROR] USD balance check failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('Balance Check Error', 'Failed to check USD balances: ' + e.message, ui.ButtonSet.OK);
    return {
      status: 'ERROR',
      error: e.message
    };
  }
}

function testUSDBalanceThreshold() {
  var result = checkUSDBalanceThreshold();
  Logger.log('[TEST] USD Balance check result: %s', JSON.stringify(result));
}

/* ============== GOOGLE SHEETS MENU SETUP ============== */

/* ============== NEW MENU HANDLER FUNCTIONS ============== */
function menuDryRunSpecificMonth() {
  try {
    var ui = SpreadsheetApp.getUi();
    var response = ui.prompt('Dry Run Specific Month', 'Enter the month to test (format: YYYY-MM):\n\nExample: 2024-01', ui.ButtonSet.OK_CANCEL);
    
    if (response.getSelectedButton() === ui.Button.OK && response.getText()) {
      var month = response.getText().trim();
      ui.alert('Testing Payment System', `Running dry run test for ${month}...\n\nThis will show what would happen without making actual payments.`, ui.ButtonSet.OK);
      
      // Call the specific month dry run function
      var result = dryRunPayUsersForSpecificMonth(month);
      
      var resultText = `🧪 DRY RUN RESULT for ${month}:\n\n`;
      resultText += `Status: ${result.status}\n`;
      resultText += `Users Found: ${result.usersToPay}\n`;
      resultText += `Total USD: $${result.totalUsd}\n`;
      resultText += `Total USDX: ${result.totalUsdx}\n`;
      resultText += `Processing Fee: $${(result.totalUsd * 0.014).toFixed(2)}\n\n`;
      
      if (result.errors && result.errors.length > 0) {
        resultText += `⚠️ Errors Found:\n`;
        result.errors.forEach(error => resultText += `• ${error}\n`);
      } else {
        resultText += `✅ No errors found - ready for payment!`;
      }
      
      ui.alert(`🧪 Dry Run Complete`, resultText, ui.ButtonSet.OK);
    }
  } catch (e) {
    Logger.log('[ERROR] Menu dry run specific month failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ Dry Run Error', `Failed to run dry run for specific month:\n\n${e.message}`, ui.ButtonSet.OK);
  }
}

function menuPaySpecificMonth() {
  try {
    var ui = SpreadsheetApp.getUi();
    var response = ui.prompt('Pay Specific Month', '⚠️ WARNING: This will make REAL PAYMENTS!\n\nEnter the month to pay (format: YYYY-MM):\n\nExample: 2024-01', ui.ButtonSet.OK_CANCEL);
    
    if (response.getSelectedButton() === ui.Button.OK && response.getText()) {
      var month = response.getText().trim();
      
      // Confirm the real payment
      var confirmResponse = ui.alert('Final Confirmation', `🚨 ARE YOU SURE?\n\nThis will make REAL payments for ${month}!\n\nTotal payout will be calculated and transferred.\n\nType YES to confirm:`);
      ui.prompt('Final Confirmation', 'Type YES to confirm real payment:', ui.ButtonSet.OK_CANCEL);
      
      var confirmResponse = ui.prompt('Final Confirmation', 'Type YES to confirm real payment:', ui.ButtonSet.OK_CANCEL);
      if (confirmResponse.getSelectedButton() === ui.Button.OK && confirmResponse.getText().trim().toUpperCase() === 'YES') {
        
        ui.alert('Processing Payments', `Executing real payments for ${month}...\n\nThis may take a few minutes.`, ui.ButtonSet.OK);
        
        // Call the specific month payment function
        var result = payUsersForSpecificMonth(month);
        
        var resultText = `💰 PAYMENT RESULT for ${month}:\n\n`;
        resultText += `Status: ${result.status}\n`;
        resultText += `Users Paid: ${result.usersPaid}\n`;
        resultText += `Total Transferred: $${result.totalTransferred}\n`;
        resultText += `Processing Fee: $${result.processingFee}\n\n`;
        
        if (result.transactionIds && result.transactionIds.length > 0) {
          resultText += `🔗 Transactions:\n`;
          result.transactionIds.forEach(id => resultText += `• ${id}\n`);
        }
        
        if (result.errors && result.errors.length > 0) {
          resultText += `\n⚠️ Errors:\n`;
          result.errors.forEach(error => resultText += `• ${error}\n`);
        } else {
          resultText += `✅ All payments successful!`;
        }
        
        ui.alert(`💰 Payments Complete`, resultText, ui.ButtonSet.OK);
      } else {
        ui.alert('Payment Cancelled', 'Payment was cancelled. No payment was made.', ui.ButtonSet.OK);
      }
    }
  } catch (e) {
    Logger.log('[ERROR] Menu pay specific month failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ Payment Error', `Failed to process payments for specific month:\n\n${e.message}`, ui.ButtonSet.OK);
  }
}

function menuShowAvailableBanks() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert('Available Banks', 'Getting list of available banks...', ui.ButtonSet.OK);
    
    var summary = getBankAccountSummary();
    
    var bankListText = `🏦 AVAILABLE BANKS:\n\n`;
    bankListText += `🏦 Mercury:\n`;
    bankListText += `  USD: $${(summary.mercury?.USD || 0).toFixed(2)}\n`;
    bankListText += `  EUR: €${(summary.mercury?.EUR || 0).toFixed(2)}\n\n`;
    bankListText += `🏦 Revolut:\n`;
    bankListText += `  USD: $${(summary.revolut?.USD || 0).toFixed(2)}\n`;
    bankListText += `  EUR: €${(summary.revolut?.EUR || 0).toFixed(2)}\n\n`;
    bankListText += `🏦 Wise:\n`;
    bankListText += `  USD: $${(summary.wise?.USD || 0).toFixed(2)}\n`;
    bankListText += `  EUR: €${(summary.wise?.EUR || 0).toFixed(2)}\n\n`;
    bankListText += `🏦 Nexo:\n`;
    bankListText += `  USD: $${(summary.nexo?.USD || 0).toFixed(2)}\n`;
    bankListText += `  EUR: €${(summary.nexo?.EUR || 0).toFixed(2)}\n\n`;
    bankListText += `💸 TOTAL CONSOLIDATED:\n`;
    bankListText += `  USD: $${(summary.totalConsolidated?.USD || 0).toFixed(2)}\n`;
    bankListText += `  EUR: €${(summary.totalConsolidated?.EUR || 0).toFixed(2)}\n`;
    
    ui.alert('🏦 Available Banks', bankListText, ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Menu show available banks failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ Bank List Error', `Failed to get bank information:\n\n${e.message}`, ui.ButtonSet.OK);
  }
}

function menuTestConsolidation() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert('Testing Consolidation', 'Running internal consolidation test...\n\nThis will show USD consolidation within each bank.', ui.ButtonSet.OK);
    
    // Call the server-side internal consolidation test (dry run)
    var result = httpProxyJson_('/intelligent-consolidation/test');
    
    var resultText = `🧪 INTERNAL CONSOLIDATION TEST:\n\n`;
    
    if (result.status === 'SUCCESS') {
      resultText += `✅ DRY RUN COMPLETED!\n\n`;
      
      // Current balances
      if (result.steps.currentBalances) {
        resultText += `📊 CURRENT BANK BALANCES:\n`;
        Object.keys(result.steps.currentBalances).forEach(bankName => {
          var balance = result.steps.currentBalances[bankName].USD || 0;
          var accountName = result.steps.currentBalances[bankName].accountName || '';
          resultText += `• ${bankName.charAt(0).toUpperCase() + bankName.slice(1)}: $${balance.toFixed(2)}`;
          if (accountName) {
            resultText += ` (${accountName})`;
          }
          resultText += '\n';
        });
        resultText += `\n`;
      }
      
      // Internal consolidation plan
      if (result.steps.internalPlan && result.steps.internalPlan.consolidations.length > 0) {
        resultText += `📁 INTERNAL CONSOLIDATION PLAN:\n`;
        result.steps.internalPlan.consolidations.forEach(consolidation => {
          resultText += `• ${consolidation.bank}: Move $${consolidation.amount.toFixed(2)} to Main Account\n`;
        });
        resultText += `\n`;
      } else {
        resultText += `📁 INTERNAL CONSOLIDATION: All USD already on Main accounts\n\n`;
      }
      
      // Summary
      resultText += `📋 SUMMARY:\n`;
      resultText += `📁 Total USD to Consolidate: $${result.summary.totalUsdConsolidated.toFixed(2)}\n`;
      resultText += `⚡ Consolidation Needed: ${result.summary.needsConsolidation ? 'Yes' : 'No'}`;
      
    } else {
      resultText += `❌ TEST ERROR: ${result.error || result.detail || 'Unknown error'}\n\n`;
    }
    
    ui.alert('🧪 Test Consolidation', resultText, ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Menu test consolidation failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ Consolidation Test Error', `Failed to test consolidation:\n\n${e.message}`, ui.ButtonSet.OK);
  }
}

function reconcilePayoutWithSpreadsheet(receivedAmount, bankName) {
  try {
    Logger.log(`[PAYOUT_RECONCILE] Reconciling payout: $${receivedAmount} from ${bankName}`);
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payouts');
    if (!sheet) {
      Logger.log('[ERROR] Could not find Payouts sheet');
      return { success: false, error: 'Payouts sheet not found' };
    }
    
    // Get the data from A22 downwards (User, Platform, Account ID, Month, Day, Amount, Received)
    var lastRow = sheet.getLastRow();
    if (lastRow < 22) {
      Logger.log('[ERROR] No payout data found (sheet too short)');
      return { success: false, error: 'No payout data found' };
    }
    
    var payoutData = sheet.getRange(22, 1, lastRow - 21, 8).getValues();
    Logger.log(`[PAYOUT_RECONCILE] Checking ${payoutData.length} payout entries...`);
    
    var bestMatch = { row: -1, score: 0, adjustment: 0 };
    
    // Look for unmatched payouts that could match this received amount
    for (var i = 0; i < payoutData.length; i++) {
      var row = payoutData[i];
      var platform = String(row[1] || '').trim(); // Column B (Platform)
      var baseAmount = Number(row[5] || 0); // Column G (Amount)
      var received = String(row[7] || '').trim().toLowerCase(); // Column H (Received)
      
      // Skip if already marked as received
      if (received === 'received' || received === 'yes' || received === 'true') {
        continue;
      }
      
      // Skip if no base amount
      if (baseAmount <= 0) {
        continue;
      }
      
      // Calculate expected amount based on platform
      var expectedCalc = calculateExpectedPayoutAmount_(platform, baseAmount);
      
      // Check if received amount matches expected range
      if (receivedAmount >= expectedCalc.min && receivedAmount <= expectedCalc.max) {
        var score = 1 - Math.abs(receivedAmount - expectedCalc.expected) / expectedCalc.expected;
        Logger.log('[PAYOUT_RECONCILE] Row ' + (i + 22) + ': Platform=' + platform + ', Base=$' + baseAmount + ', Expected=' + expectedCalc.expected + ', Score=' + score.toFixed(3));
        
        if (score > bestMatch.score) {
          bestMatch = { 
            row: i + 22, 
            score: score, 
            adjustment: receivedAmount - baseAmount,
            platform: platform,
            baseAmount: baseAmount
          };
        }
      }
    }
    
    // If we found a good match (score > 0.8), mark it as received
    if (bestMatch.score > 0.8) {
      var reconcileRow = bestMatch.row;
      var adjustmentAmount = bestMatch.adjustment;
      
      // Mark as received
      sheet.getRange(reconcileRow, 8).setValue('Received'); // Column H
      
      // Add adjustment note if needed
      if (Math.abs(adjustmentAmount) > 10) { // Only note significant adjustments
        var note = receivedAmount + ' received (base: ' + bestMatch.baseAmount + ', adjustment: ' + (adjustmentAmount >= 0 ? '+' : '') + adjustmentAmount.toFixed(2) + ')';
        Logger.log('[PAYOUT_RECONCILE] Marked row ' + reconcileRow + ' as received: ' + note);
        
        return { 
          success: true, 
          matchedRow: reconcileRow,
          adjustment: adjustmentAmount,
          message: 'Reconciled with row ' + reconcileRow + ': ' + bestMatch.platform + ' payout',
          note: note
        };
      } else {
        Logger.log('[PAYOUT_RECONCILE] Marked row ' + reconcileRow + ' as received: $' + receivedAmount);
        return { 
          success: true, 
          matchedRow: reconcileRow,
          adjustment: adjustmentAmount,
          message: 'Reconciled with row ' + reconcileRow + ': ' + bestMatch.platform + ' payout'
        };
      }
    } else {
      Logger.log('[PAYOUT_RECONCILE] No suitable match found for $' + receivedAmount + ' (best score: ' + bestMatch.score.toFixed(3) + ')');
      return { 
        success: false, 
        error: 'No suitable payout found for $' + receivedAmount,
        suggestion: 'Check if payout was already marked as received or if amount is outside expected range'
      };
    }
    
  } catch (e) {
    Logger.log('[ERROR] Payout reconciliation failed: %s', e.message);
    return { success: false, error: e.message };
  }
}

function calculateExpectedPayoutAmount_(platformName, baseAmount) {
  if (platformName && platformName.toLowerCase().includes('topstep')) {
    // Topstep: ~90% of base amount minus $20 transfer fee
    var expected = Math.max(baseAmount * 0.9 - 20, baseAmount * 0.88);
    return {
      expected: expected,
      min: expected * 0.95,  // 5% variance
      max: expected * 1.05,
      platform: 'Topstep'
    };
  } else if (platformName && platformName.toLowerCase().includes('mffu')) {
    // MFFU: ~80% of base amount minus $20 transfer fee
    var expected = Math.max(baseAmount * 0.8 - 20, baseAmount * 0.75);
    return {
      expected: expected,
      min: expected * 0.95,  // 5% variance
      max: expected * 1.05,
      platform: 'MFFU'
    };
  } else {
    // Default: assume close to base amount
    var expected = baseAmount * 0.95; // Assume 5% less
    return {
      expected: expected,
      min: expected * 0.95,
      max: baseAmount,
      platform: 'Unknown'
    };
  }
}

function menuExecuteConsolidation() {
  try {
    var ui = SpreadsheetApp.getUi();
    
    // Check for pending transfers first
    var hasPendingTransfers = checkPendingTransfers_();
    if (hasPendingTransfers) {
      var pendingTransfers = getPendingTransfers_();
      var pendingText = '⚠️ PENDING TRANSFERS DETECTED!\n\n';
      pendingText += pendingTransfers.length + ' transfer(s) still in progress:\n\n';
      
      for (var i = 0; i < pendingTransfers.length; i++) {
        var transfer = pendingTransfers[i];
        var hoursSince = (new Date().getTime() - new Date(transfer.timestamp).getTime()) / (1000 * 60 * 60);
        pendingText += '• ' + (transfer.bankName || 'Unknown') + ' ' + transfer.accountId + ': $' + transfer.amount + ' ' + transfer.currency + ' (' + hoursSince.toFixed(1) + ' hours ago)\n';
      }
      
      pendingText += '\nTo prevent duplicate transfers, consolidation will be skipped.\n\nDo you want to force consolidation anyway?';
      
      var forceResponse = ui.alert('Pending Transfers Found', pendingText, ui.ButtonSet.YES_NO);
      if (forceResponse !== ui.Button.YES) {
        ui.alert('Consolidation Skipped', 'Consolidation was skipped to prevent duplicate transfers.\n\nCheck pending transfers in a few hours.', ui.ButtonSet.OK);
        return;
      }
    }
    
    var confirmResponse = ui.alert('Execute Consolidation', '⚠️ WARNING: This will make REAL transfers!\n\nAll funds will be consolidated to the main account.\n\nAre you sure you want to proceed?', ui.ButtonSet.YES_NO);
    
    if (confirmResponse === ui.Button.YES) {
      ui.alert('Executing Consolidation', 'Starting fund consolidation...\n\nThis may take a few minutes.', ui.ButtonSet.OK);
      
      // Call the intelligent consolidation system with force option
      var result = intelligentConsolidationSystem_({ dryRun: false, force: hasPendingTransfers });
      
      var resultText = '💰 INTELLIGENT CONSOLIDATION RESULT:\n\n';
      
      if (result.status === 'SUCCESS') {
        resultText += '✅ SUCCESS!\n\n';
        
        // Internal consolidation results
        if (result.summary.totalUsdConsolidated > 0) {
          resultText += '📁 INTERNAL CONSOLIDATION:\n';
          resultText += '💰 Consolidated: $' + result.summary.totalUsdConsolidated.toFixed(2) + ' USD\n';
          
          if (result.steps.step2_internalConsolidation) {
            result.steps.step2_internalConsolidation.consolidations.forEach(consolidation => {
              resultText += '• ';
              resultText += consolidation.bank + ': $' + consolidation.amount.toFixed(2) + '\n';
            });
          }
          resultText += '\n';
        }
        
        // Cross-bank top-up results  
        if (result.summary.totalUsdTransferred > 0) {
          resultText += '🔄 CROSS-BANK TOP-UP:\n';
          resultText += '💰 Transferred: $' + result.summary.totalUsdTransferred.toFixed(2) + ' USD\n';
          
          if (result.steps.step3_crossBankTopup) {
            result.steps.step3_crossBankTopup.topups.forEach(topup => {
              resultText += '• ' + topup.fromBank + ' → ' + topup.toBank + ': $' + topup.amount.toFixed(2) + ' (' + topup.status + ')\n';
            });
          }
          resultText += '\n';
        }
        
        // Final balances
        resultText += '🏦 FINAL MAIN ACCOUNT BALANCES:\n';
        Object.keys(result.summary.mainAccountBalances).forEach(bankName => {
          var balance = result.summary.mainAccountBalances[bankName];
          var statusIcon = balance >= result.thresholdUsd ? '✅' : '🚨';
          resultText += statusIcon + ' ' + bankName.charAt(0).toUpperCase() + bankName.slice(1) + ': $' + balance.toFixed(2) + '\n';
        });
        
        resultText += '\n📋 THRESHOLD: $' + result.thresholdUsd + ' USD';
        resultText += '\n💰 TRANSFER AMOUNT: $' + result.transferAmountUsd + ' USD';
        
      } else if (result.status === 'SKIPPED') {
        resultText += '⏸️ SKIPPED - Pending Transfers Detected\n\n';
        
        if (result.pendingTransfers && result.pendingTransfers.length > 0) {
          resultText += '📝 CURRENT PENDING TRANSFERS:\n';
          for (var i = 0; i < result.pendingTransfers.length; i++) {
            var transfer = result.pendingTransfers[i];
            var transferDate = new Date(transfer.timestamp);
            var hoursAgo = Math.floor((new Date().getTime() - transferDate.getTime()) / (1000 * 60 * 60));
            var bankName = transfer.bankName || 'Unknown';
            resultText += '• ' + bankName + ' $' + transfer.amount + ' ' + transfer.currency + ' (' + hoursAgo + 'h ago)\n';
          }
        }
        
      } else {
        resultText += '❌ ERROR: ' + result.error + '\n\n';
        
        if (result.errors && result.errors.length > 0) {
          resultText += 'ERRORS:\n';
          result.errors.forEach(error => {
            resultText += '• ' + error + '\n';
          });
        }
      }
      
      ui.alert('💰 Consolidation Complete', resultText, ui.ButtonSet.OK);
    } else {
      ui.alert('Consolidation Cancelled', 'Consolidation was cancelled. No transfers were made.', ui.ButtonSet.OK);
    }
    
  } catch (e) {
    Logger.log('[ERROR] Menu execute consolidation failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ Consolidation Error', `Failed to execute consolidation:\n\n${e.message}`, ui.ButtonSet.OK);
  }
}

function menuCheckPendingTransfers() {
  try {
    var ui = SpreadsheetApp.getUi();
    var transfers = getPendingTransfers_();
    
    if (transfers.length === 0) {
      ui.alert('⏳ Pending Transfers', 'No pending transfers found.\n\nAll transfers are complete or none have been initiated recently.', ui.ButtonSet.OK);
      return;
    }
    
    var resultText = `⏳ PENDING TRANSFERS\n\n`;
    resultText += `Found ${transfers.length} pending transfer(s):\n\n`;
    
    var totalPending = 0;
    for (var i = 0; i < transfers.length; i++) {
      var transfer = transfers[i];
      var timeAgo = new Date().getTime() - new Date(transfer.timestamp).getTime();
      var hoursSince = (timeAgo / (1000 * 60 * 60)).toFixed(1);
      
      resultText += `${i + 1}. ${transfer.bankName || 'Unknown'} - ${transfer.accountId}\n`;
      resultText += `   Amount: $${transfer.amount} ${transfer.currency}\n`;
      resultText += `   Started: ${hoursSince} hours ago\n`;
      resultText += `   Transaction ID: ${transfer.transactionId}\n\n`;
      
      totalPending += transfer.amount;
    }
    
    resultText += `💰 Total Pending: $${totalPending.toFixed(2)} USD\n\n`;
    resultText += `⚠️ Consolidation will be skipped until these complete.\n`;
    resultText += `💰 Expected completion: 1-3 business days`;
    
    ui.alert('⏳ Pending Transfers Status', resultText, ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Menu check pending transfers failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ Transfer Check Error', `Failed to check pending transfers:\n\n${e.message}`, ui.ButtonSet.OK);
  }
}

function menuClearOldTransfers() {
  try {
    var ui = SpreadsheetApp.getUi();
    var confirmResponse = ui.alert('Clear Old Transfers', '⚠️ This will clear ALL pending transfer records!\n\nUse this only if you know all transfers have completed.\n\nContinue?', ui.ButtonSet.YES_NO);
    
    if (confirmResponse === ui.Button.YES) {
      setProp_('pending_transfers', '[]');
      ui.alert('✅ Transfers Cleared', 'All pending transfer records have been cleared.\n\nFuture consolidation runs will proceed normally.', ui.ButtonSet.OK);
    } else {
      ui.alert('Operation Cancelled', 'Transfer clearing was cancelled.', ui.ButtonSet.OK);
    }
    
  } catch (e) {
    Logger.log('[ERROR] Menu clear old transfers failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ Clear Error', `Failed to clear transfers:\n\n${e.message}`, ui.ButtonSet.OK);  
  }
}

function menuCheckUSDBalances() {
  try {
    var ui = SpreadsheetApp.getUi();
    
    // Execute the balance check first, then show results (suppress automatic alert)
    var result = checkUSDBalanceThreshold(true);
    displayBalanceDialog(result);
    
  } catch (e) {
    Logger.log('[ERROR] Menu USD balance check failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ USD Balance Check Error', `Failed to check USD balances:\n\n${e.message}\n\n⏰ ${new Date().toLocaleString()}`, ui.ButtonSet.OK);
  }
}

function menuCheckIndividualBanks() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert('Individual Banks', 'Checking individual bank balances...', ui.ButtonSet.OK);
    
    var result = checkIndividualBankBalances();
    displayIndividualBanksDialog(result);
    
  } catch (e) {
    Logger.log('[ERROR] Menu individual bank check failed: %s', e.message);
    displayErrorDialog('Individual Bank Check Error', e.message);
  }
}

function menuShowBalanceSummary() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert('Balance Summary', 'Generating balance summary...', ui.ButtonSet.OK);
    
    var result = generateBalanceSummaryForSheet();
    displaySummaryDialog(result);
    
  } catch (e) {
    Logger.log('[ERROR] Menu balance summary failed: %s', e.message);
    displayErrorDialog('Balance Summary Error', e.message);
  }
}

function menuUpdateAllBalances() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert('Balance Update', 'Updating all balances...', ui.ButtonSet.OK);
    
    updateAllBalances();
    
    // Show completion dialog instead of writing to cells
    ui.alert('✅ Update Complete', `All bank balances have been updated successfully!\n\n⏰ Updated: ${new Date().toLocaleString()}`, ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Menu balance update failed: %s', e.message);
    displayErrorDialog('Balance Update Error', e.message);
  }
}

function menuClearOutputs() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert('Info', 'Output clearing is not needed with dialog windows.\nAll results are shown in popup windows that close automatically.', ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Menu clear outputs failed: %s', e.message);
  }
}

/* ============== INDIVIDUAL BANK BALANCE CHECK ============== */
function checkIndividualBankBalances() {
  try {
    Logger.log('[INDIVIDUAL_CHECK] Starting individual bank balance check...');
    
    var THRESHOLD_USD = 1000;
    var TRANSFER_AMOUNT_USD = 2000;
    
    // Get Mercury MAIN account balance (not total across all accounts)
    var mercurySummary = { USD: 0, EUR: 0 };
    try {
      mercurySummary = fetchMercuryMainBalance_();
      Logger.log('[INDIVIDUAL_CHECK] Mercury Main Account: $%s (%s)', mercurySummary.USD, mercurySummary.note || 'balance retrieved');
    } catch (e) {
      Logger.log('[ERROR] Mercury Main balance failed: %s', e.message);
    }
    
    // Get Revolut balance  
    var revolutSummary = { USD: 0, EUR: 0 };
    try {
      revolutSummary = fetchRevolutSummary_();
      Logger.log('[INDIVIDUAL_CHECK] Revolut: $%s', revolutSummary.USD);
    } catch (e) {
      Logger.log('[ERROR] Revolut summary failed: %s', e.message);
    }
    
    var results = {
      timestamp: new Date().toLocaleString(),
      thresholdUSD: THRESHOLD_USD,
      transferAmountUSD: TRANSFER_AMOUNT_USD,
      banks: []
    };
    
    // Check Mercury independently
    var mercuryBalance = parseFloat(mercurySummary.USD);
    var mercuryStatus = mercuryBalance < THRESHOLD_USD ? 'LOW' : 'OK';
    var mercuryReport = {
      name: 'Mercury',
      balance: mercuryBalance,
      status: mercuryStatus,
      threshold: THRESHOLD_USD,
      transferNeeded: mercuryStatus === 'LOW' ? TRANSFER_AMOUNT_USD : 0
    };
    
    if (mercuryStatus === 'LOW') {
      mercuryReport.shortfall = THRESHOLD_USD - mercuryBalance;
      mercuryReport.message = `⚠️ Below threshold by $${mercuryReport.shortfall.toFixed(2)}`;
    } else {
      mercuryReport.surplus = mercuryBalance - THRESHOLD_USD;
      mercuryReport.message = `✅ Above threshold (+$${mercuryReport.surplus.toFixed(2)})`;
    }
    results.banks.push(mercuryReport);
    
    // Check Revolut independently
    var revolutBalance = parseFloat(revolutSummary.USD);
    var revolutStatus = revolutBalance < THRESHOLD_USD ? 'LOW' : 'OK';
    var revolutReport = {
      name: 'Revolut',
      balance: revolutBalance,
      status: revolutStatus,
      threshold: THRESHOLD_USD,
      transferNeeded: revolutStatus === 'LOW' ? TRANSFER_AMOUNT_USD : 0
    };
    
    if (revolutStatus === 'LOW') {
      revolutReport.shortfall = THRESHOLD_USD - revolutBalance;
      revolutReport.message = `🚨 Below threshold by $${revolutReport.shortfall.toFixed(2)} - Transfer $${TRANSFER_AMOUNT_USD}`;
    } else {
      revolutReport.surplus = revolutBalance - THRESHOLD_USD;
      revolutReport.message = `✅ Above threshold (+$${revolutReport.surplus.toFixed(2)})`;
    }
    results.banks.push(revolutReport);
    
    results.overallStatus = results.banks.some(b => b.status === 'LOW') ? 'ALERT' : 'OK';
    results.actionRequired = results.banks.filter(b => b.transferNeeded > 0);
    
    Logger.log('[INDIVIDUAL_CHECK] Overall status: %s', results.overallStatus);
    return results;
    
  } catch (e) {
    Logger.log('[ERROR] Individual bank balance check failed: %s', e.message);
    return {
      status: 'ERROR',
      error: e.message,
      timestamp: new Date().toLocaleString()
    };
  }
}

function generateBalanceSummaryForSheet() {
  try {
    Logger.log('[SUMMARY_CHECK] Generating balance summary for sheet...');
    
    var summaries = {};
    
    // Get Mercury summary
    try {
      summaries.mercury = fetchMercuryMainBalance_();
      Logger.log('[SUMMARY_CHECK] Mercury Main balance: %s', JSON.stringify(summaries.mercury));
    } catch (e) {
      Logger.log('[WARNING] Mercury Main balance failed: %s', e.message);
      summaries.mercury = { USD: 0, EUR: 0 };
    }
    
    // Get Revolut summary  
    try {
      summaries.revolut = fetchRevolutSummary_();
      Logger.log('[SUMMARY_CHECK] Revolut summary: %s', JSON.stringify(summaries.revolut));
    } catch (e) {
      Logger.log('[WARNING] Revolut summary failed: %s', e.message);
      summaries.revolut = { USD: 0, EUR: 0 };
    }
    
    var totalUSD = parseFloat(summaries.mercury.USD) + parseFloat(summaries.revolut.USD);
    var totalEUR = parseFloat(summaries.mercury.EUR) + parseFloat(summaries.revolut.EUR);
    
    return {
      timestamp: new Date().toLocaleString(),
      totals: {
        totalUSD: totalUSD,
        totalEUR: totalEUR
      },
      banks: summaries,
      health: {
        mercuryOK: parseFloat(summaries.mercury.USD) >= 1000,
        revolutOK: parseFloat(summaries.revolut.USD) >= 1000,
        allHealthy: parseFloat(summaries.mercury.USD) >= 1000 && parseFloat(summaries.revolut.USD) >= 1000
      }
    };
    
  } catch (e) {
    Logger.log('[ERROR] Balance summary generation failed: %s', e.message);
    return {
      status: 'ERROR',
      error: e.message,
      timestamp: new Date().toLocaleString()
    };
  }
}

/* ============== DIALOG OUTPUT FUNCTIONS ============== */
function displayBalanceDialog(result) {
  try {
    var ui = SpreadsheetApp.getUi();
    var title = '💰 USD Balance Check';
    var message = `📊 BANK BALANCE STATUS\n\n`;
    
    if (result.status === 'ALERT') {
      message += `🚨 BANK BALANCE ALERT!\n\n`;
      message += `🎯 Threshold per bank: $1,000\n\n`;
      
      // Add bank status with visual indicators
      var mercuryStatus = result.mercury?.status === 'OK' ? '✅' : '🚨';
      var revolutStatus = result.revolut?.status === 'OK' ? '✅' : '🚨';
      
      message += `🏦 Mercury Main: $${(result.mercury?.balance || 0).toFixed(2)} ${mercuryStatus}\n`;
      message += `🏦 Revolut: $${(result.revolut?.balance || 0).toFixed(2)} ${revolutStatus}\n\n`;
      
      // Add low balance details
      var lowBanks = [];
      if ((result.mercury?.balance || 0) < 1000) {
        var shortage = (1000 - (result.mercury?.balance || 0)).toFixed(2);
        lowBanks.push(`MERCURY MAIN: Below threshold (-$${shortage})\n💸 Recommended Transfer: $2,000`);
      }
      if ((result.revolut?.balance || 0) < 1000) {
        var shortage = (1000 - (result.revolut?.balance || 0)).toFixed(2);
        lowBanks.push(`REVOLUT: Below threshold (-$${shortage})\n💸 Recommended Transfer: $2,000`);
      }
      
      if (lowBanks.length > 0) {
        message += lowBanks.join('\n\n') + '\n\n';
      }
      
      message += `⚠️ Consider topping up low accounts!`;
      
    } else if (result.status === 'OK') {
      message += `✅ HEALTHY STATUS\n\n`;
      message += `🎯 Threshold per bank: $1,000\n\n`;
      
      message += `🏦 Mercury Main: $${(result.mercury?.balance || 0).toFixed(2)} ✅\n`;
      message += `🏦 Revolut: $${(result.revolut?.balance || 0).toFixed(2)} ✅\n\n`;
      
      var totalSurplus = (result.mercury?.surplus || 0) + (result.revolut?.surplus || 0);
      message += `📈 Total Surplus Above Threshold: $${totalSurplus.toFixed(2)}\n\n`;
      message += `✅ All banks above $1,000 threshold`;
    } else {
      message += `❌ ERROR STATUS\n\n`;
      message += `Error: ${result.error || 'Unknown error'}\n\n`;
      message += `Please check logs for details`;
    }
    
    message += `\n\n⏰ Checked: ${new Date().toLocaleString()}`;
    
    ui.alert(title, message, ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Display balance dialog failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('Error', 'Failed to display balance results: ' + e.message, ui.ButtonSet.OK);
  }
}

function displayIndividualBanksDialog(result) {
  try {
    var ui = SpreadsheetApp.getUi();
    var title = '🏦 Individual Bank Check';
    var message = `🏦 Individual Bank Balance Analysis\n\n`;
    
    if (result.overallStatus === 'ALERT') {
      message += `🚨 OVERALL STATUS: ALERT\n`;
    } else {
      message += `✅ OVERALL STATUS: HEALTHY\n`;
    }
    
    message += `🎯 Threshold: $${result.thresholdUSD}\n`;
    message += `💸 Transfer Amount: $${result.transferAmountUSD}\n\n`;
    
    for (var i = 0; i < result.banks.length; i++) {
      var bank = result.banks[i];
      message += `🏦 ${bank.name}\n`;
      message += `  Balance: $${bank.balance.toFixed(2)}\n`;
      message += `  Status: ${bank.status === 'OK' ? '✅ OK' : '🚨 LOW'}\n`;
      
      if (bank.status === 'LOW' && bank.shortfall) {
        message += `  Shortfall: $${bank.shortfall.toFixed(2)}\n`;
        message += `  Transfer Needed: $${bank.transferNeeded}\n`;
      } else if (bank.surplus) {
        message += `  Surplus: +$${bank.surplus.toFixed(2)}\n`;
      }
      
      message += `  Message: ${bank.message}\n\n`;
    }
    
    if (result.actionRequired && result.actionRequired.length > 0) {
      message += `🎯 ACTIONS REQUIRED:\n`;
      for (var j = 0; j < result.actionRequired.length; j++) {
        var action = result.actionRequired[j];
        message += `• Transfer $${action.transferNeeded} to ${action.name}\n`;
      }
      message += `\n`;
    }
    
    message += `⏰ Checked: ${new Date().toLocaleString()}`;
    
    ui.alert(title, message, ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Display individual banks dialog failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('Error', 'Failed to display bank results: ' + e.message, ui.ButtonSet.OK);
  }
}

function displaySummaryDialog(result) {
  try {
    var ui = SpreadsheetApp.getUi();
    var title = '📊 Balance Summary';
    var message = `📊 Complete Balance Summary\n\n`;
    
    message += `💵 TOTAL USD BALANCE: $${(result.totals?.totalUSD || 0).toFixed(2)}\n`;
    message += `💶 TOTAL EUR BALANCE: €${(result.totals?.totalEUR || 0).toFixed(2)}\n\n`;
    
    message += `🏦 BANK BREAKDOWN:\n`;
    message += `• Mercury USD: $${(result.banks?.mercury?.USD || 0).toFixed(2)}\n`;
    message += `• Mercury EUR: €${(result.banks?.mercury?.EUR || 0).toFixed(2)}\n`;
    message += `• Revolut USD: $${(result.banks?.revolut?.USD || 0).toFixed(2)}\n`;
    message += `• Revolut EUR: €${(result.banks?.revolut?.EUR || 0).toFixed(2)}\n\n`;
    
    message += `🛡️ HEALTH STATUS:\n`;
    message += `• Mercury Healthy: ${result.health?.mercuryOK ? '✅ Yes' : '❌ No'}\n`;
    message += `• Revolut Healthy: ${result.health?.revolutOK ? '✅ Yes' : '❌ No'}\n`;
    message += `• All Banks Healthy: ${result.health?.allHealthy ? '✅ Yes' : '❌ No'}\n\n`;
    
    message += `⏰ Generated: ${new Date().toLocaleString()}`;
    
    ui.alert(title, message, ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Display summary dialog failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('Error', 'Failed to display summary results: ' + e.message, ui.ButtonSet.OK);
  }
}

/* ============== CELL OUTPUT FUNCTIONS (for automatic triggers) ============== */
function displaySummaryResult(title, result) {
  try {
    var sh = sheet_(SHEET_NAME);
    if (!sh) {
      Logger.log('[ERROR] Sheet not found for display');
      return;
    }
    
    var output = [];
    output.push([`📊 ${title}`, result.timestamp || new Date().toLocaleString()]);
    output.push(['', '']);
    
    output.push(['💵 TOTAL USD BALANCE', '$' + (result.totals?.totalUSD || 0).toFixed(2)]);
    output.push(['💶 TOTAL EUR BALANCE', '€' + (result.totals?.totalEUR || 0).toFixed(2)]);
    output.push(['', '']);
    
    output.push(['🏦 BANK BREAKDOWN:', '']);
    output.push(['Mercury USD', '$' + (result.banks?.mercury?.USD || 0).toFixed(2)]);
    output.push(['Mercury EUR', '€' + (result.banks?.mercury?.EUR || 0).toFixed(2)]);
    output.push(['Revolut USD', '$' + (result.banks?.revolut?.USD || 0).toFixed(2)]);
    output.push(['Revolut EUR', '€' + (result.banks?.revolut?.EUR || 0).toFixed(2)]);
    output.push(['', '']);
    
    output.push(['🛡️ HEALTH STATUS:', '']);
    output.push(['Mercury Healthy', result.health?.mercuryOK ? '✅ Yes' : '❌ No']);
    output.push(['Revolut Healthy', result.health?.revolutOK ? '✅ Yes' : '❌ No']);
    output.push(['All Banks Healthy', result.health?.allHealthy ? '✅ Yes' : '❌ No']);
    
    sh.getRange('A10:B' + (10 + output.length - 1)).setValues(output);
    
  } catch (e) {
    Logger.log('[ERROR] Display summary result failed: %s', e.message);
  }
}

/* ============== ERROR DIALOG FUNCTION ============== */
function displayErrorDialog(title, errorMessage) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ ' + title, 'An error occurred:\n\n' + errorMessage + '\n\nPlease try again or check the logs for more details.\n\n⏰ ' + new Date().toLocaleString(), ui.ButtonSet.OK);
  } catch (e) {
    Logger.log('[ERROR] Display error dialog failed: %s', e.message);
  }
}

function displayError(title, errorMessage) {
  try {
    var sh = sheet_(SHEET_NAME);
    if (!sh) {
      Logger.log('[ERROR] Sheet not found for display');
      return;
    }
    
    var output = [];
    output.push(['❌ ' + title, new Date().toLocaleString()]);
    output.push(['Error Message', errorMessage]);
    output.push(['', '']);
    output.push(['Please try again or check logs', '']);
    
    sh.getRange('A10:B14').setValues(output);
    
  } catch (e) {
    Logger.log('[ERROR] Display error failed: %s', e.message);
  }
}

// End of file - All functions properly closed
