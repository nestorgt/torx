/************ Project Torx → Automated User Payments System ************/
/* 
 * This system automates monthly payments to users through Revolut.
 * 
 * Features:
 * 1. Automated monthly payments with FX conversion (USD→EUR) when needed
 * 2. Dry run mode for testing without actual transfers
 * 3. Idempotent operations (handles duplicate requests gracefully)
 * 4. Comprehensive logging and audit trail
 * 5. Balance checking and validation before payments
 * 6. Weekend FX restrictions (no FX on weekends)
 * 7. User activity and amount validation
 * 8. Month row management (auto-creates new months as needed)
 * 
 * Sheet Structure:
 * - Users sheet with columns for each user
 * - Row 1: User names
 * - Row 28: User active status (TRUE/FALSE)
 * - Row 29: Monthly payment amounts
 * - Row 30+: Monthly payment records (one row per month)
 * 
 * Required Script Properties:
 * - PROXY_URL: Your proxy server URL
 * - PROXY_TOKEN: Authentication token for proxy
 * - REV_FX_USD_MULT: FX multiplier for USD→EUR (default: 1.20)
 * 
 * WhatsApp Integration:
 * - Google Apps Script sends payment notifications to your server
 * - Server handles Twilio WhatsApp integration
 * - Phone numbers are read from row 11 of the Users sheet
 * 
 * Revolut Integration:
 * - Uses working root transactions endpoint (/revolut/transactions)
 * - OAuth authentication with proper parameters
 * - Transaction filtering by month/year
 * 
 * Usage:
 * - Menu: Payments → Pay Current Month (💰)
 * - Menu: Payments → Dry Run Current Month (🧪)
 * - Menu: Payments → July 2025 (📅) - Direct payment
 * - Menu: Payments → August 2025 (📅) - Direct payment  
 * - Menu: Payments → September 2025 (📅) - Direct payment
 * - Menu: Payments → Check Status (🔍) - Current month status
 * - Menu: Payments → Validate Sheet (📊) - Sheet validation
 * - Menu: Payments → Test System (🧪) - System health check
 * 
 * Test Functions (Safe - No Payments):
 * - testJuly2025(): Test July 2025 simulation
 * - testAugust2025(): Test August 2025 simulation
 * - testSeptember2025(): Test September 2025 simulation
 */

var USERS_SHEET = 'Users';

/* ============== Utility Functions ============== */
function nowStamp_() {
  var tz = 'Europe/Andorra';
  return Utilities.formatDate(new Date(), tz, 'dd-MM HH:mm');
}

function proxyIsUp_() {
  try {
    var PROXY_URL = (props_().getProperty('PROXY_URL') || '').replace(/\/+$/,'');
    if (!PROXY_URL) return false;
    var r = UrlFetchApp.fetch(PROXY_URL + '/healthz', {
      method: 'get', muteHttpExceptions: true, validateHttpsCertificates: true
    });
    var code = r.getResponseCode();
    var txt = String(r.getContentText() || '').trim().toLowerCase();
    return code === 200 && (txt === 'ok' || txt.indexOf('ok') === 0);
  } catch (e) { return false; }
}
function isWeekend_(tz) {
  var d = Number(Utilities.formatDate(new Date(), tz || 'Europe/Andorra', 'u')); // 1..7 (Mon..Sun)
  return d === 6 || d === 7;
}

function toBool_(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    var s = String(value).toLowerCase().trim();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
  }
  if (typeof value === 'number') return value > 0;
  return false;
}

function props_() { 
  return PropertiesService.getScriptProperties(); 
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(USERS_SHEET);
  if (!sh) throw new Error('No existe la pestaña: ' + USERS_SHEET);
  return sh;
}

function setCellKeepFmt_(sh, a1, value, note) {
  try {
    var rng = sh.getRange(a1);
    var fmt = rng.getNumberFormat();
    
    // Set value
    rng.setValue(value);
    
    // Set note if provided
    if (note && note !== '') {
      rng.setNote(note);
    }
    
    // Re-apply format
    if (fmt) {
      rng.setNumberFormat(fmt);
    }
  } catch (error) {
    Logger.log('[setCellKeepFmt_] ERROR: %s', error.message);
    throw error;
  }
}

function setNoteOnly_(sh, a1, note) {
  sh.getRange(a1).setNote(String(note || ''));
}

function a1_(row, col) { 
  return sheet_().getRange(row, col).getA1Notation(); 
}

/* ============== HTTP Proxy Functions ============== */
function httpProxyJson_(path) {
  var PROXY_URL = (props_().getProperty('PROXY_URL') || '').replace(/\/+$/,'');
  var PROXY_TOKEN = props_().getProperty('PROXY_TOKEN');
  if (!PROXY_URL) throw new Error('Falta Script Property: PROXY_URL');
  if (!PROXY_TOKEN) throw new Error('Falta Script Property: PROXY_TOKEN');

  var url = PROXY_URL + path;
  var r = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'x-proxy-token': PROXY_TOKEN, 'Accept': 'application/json' },
    muteHttpExceptions: true,
    validateHttpsCertificates: true
  });
  var code = r.getResponseCode();
  var text = r.getContentText();
  Logger.log('[HTTP] %s -> %s, bodyLen=%s, head=%s', path, code, (text||'').length, (text||'').substring(0, 300));
  if (code >= 400) throw new Error('HTTP '+code+' '+path+' -> '+text);
  return JSON.parse(text);
}

function httpProxyPostJson_(path, body) {
  var PROXY_URL = (props_().getProperty('PROXY_URL') || '').replace(/\/+$/,'');
  var PROXY_TOKEN = props_().getProperty('PROXY_TOKEN');
  if (!PROXY_URL) throw new Error('Falta Script Property: PROXY_URL');
  if (!PROXY_TOKEN) throw new Error('Falta Script Property: PROXY_TOKEN');

  var url = PROXY_URL + path;
  var r = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { 
      'x-proxy-token': PROXY_TOKEN, 
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
    validateHttpsCertificates: true
  });
  var code = r.getResponseCode();
  var text = r.getContentText();
  Logger.log('[HTTP POST] %s -> %s, bodyLen=%s, head=%s', path, code, (text||'').length, (text||'').substring(0, 300));
  if (code >= 400) throw new Error('HTTP '+code+' '+path+' -> '+text);
  return JSON.parse(text);
}

/* ============== Revolut Balance Functions ============== */
function getRevolutMainBalance_(currency) {
  try {
    var summary = httpProxyJson_('/revolut/summary');
    var balance = summary[currency] || 0;
    Logger.log('[REVOLUT] Main %s balance: %s', currency, balance);
    return balance;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut %s balance: %s', currency, e.message);
    throw e;
  }
}

/* ============== Revolut Transaction Functions ============== */
function getRevolutTransactions_(month, year) {
  try {
    var response = httpProxyJson_('/revolut/transactions?month=' + month + '&year=' + year);
    Logger.log('[REVOLUT] Transactions for %s-%s: %s total, %s filtered', month, year, response.totalTransactions || 0, response.filteredTransactions || 0);
    return response;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut transactions for %s-%s: %s', month, year, e.message);
    throw e;
  }
}

/* ============== Note Management Functions ============== */
function appendNoteTop_(sh, a1, lines, tz) {
  try {
    var cell = sh.getRange(a1);
    var existingNote = cell.getNote() || '';
    var timestamp = Utilities.formatDate(new Date(), tz || 'Europe/Andorra', 'dd-MM HH:mm');
    
    var newNote = timestamp + ':\n' + lines.join('\n');
    if (existingNote) {
      newNote += '\n\n' + existingNote;
    }
    
    cell.setNote(newNote);
    Logger.log('[NOTE] Appended note to %s: %s lines', a1, lines.length);
  } catch (e) {
    Logger.log('[ERROR] Failed to append note to %s: %s', a1, e.message);
  }
}

/* ============== Revolut FX and Transfer Functions ============== */
function revolutFxUsdToEur_(usdAmount, requestId, reference) {
  var body = {
    fromName: 'Main',
    fromCcy:  'USD',
    toName:   'Main',
    toCcy:    'EUR',
    amount:   Number(usdAmount),
    request_id: (requestId || '').slice(0, 40),
    reference: reference || ''
  };
  return httpProxyPostJson_('/revolut/exchange', body);
}

function revolutMove_(toName, eurAmount, requestId, reference) {
  var body = {
    fromName: 'Main',
    toName: String(toName || '').trim(),
    currency: 'EUR',
    amount: Number(eurAmount),
    request_id: (requestId || '').slice(0, 40),
    reference: reference || ''
  };

  var resp;
  try {
    resp = httpProxyPostJson_('/revolut/transfer', body);
  } catch (e) {
    var msg = String(e && e.message || e);
    if (/<!doctype html>|cloudflare|502|504|gateway/i.test(msg)) {
      // fallback GET
      var PROXY_URL = (props_().getProperty('PROXY_URL') || '').replace(/\/+$/,'');
      var PROXY_TOKEN = props_().getProperty('PROXY_TOKEN');
      var qs = [
        'toName='   + encodeURIComponent(body.toName),
        'amount='   + encodeURIComponent(body.amount.toFixed(2)),
        'currency=' + encodeURIComponent(body.currency),
        'fromName=' + encodeURIComponent(body.fromName),
        'reference='+ encodeURIComponent(body.reference || ''),
        'request_id='+ encodeURIComponent(body.request_id)
      ].join('&');
      var r = UrlFetchApp.fetch(PROXY_URL + '/revolut/transfer_qs?' + qs, {
        method: 'get',
        headers: { 'x-proxy-token': PROXY_TOKEN, 'Accept': 'application/json' },
        muteHttpExceptions: true,
        validateHttpsCertificates: true
      });
      var code = r.getResponseCode(), text = r.getContentText();
      Logger.log('[HTTP GET Fallback] /revolut/transfer_qs -> %s, head=%s', code, (text||'').substring(0, 300));
      if (code >= 400) throw new Error('HTTP '+code+' /revolut/transfer_qs -> '+text);
      resp = JSON.parse(text || '{}');
    } else {
      throw e;
    }
  }

  // Handle duplicate request_id as success (idempotent)
  if (resp && resp.duplicate) {
    Logger.log('[IDEMPOTENT] Duplicate request_id treated as OK: %s', body.request_id);
    return resp;
  }
  return resp;
}

/* ============== Month Management Functions ============== */
// ===== Config: row where months start (A29 in your sheet) =====
var USERS_FIRST_MONTH_ROW = 30;

// Normalize "month" -> "MM-YYYY" (tolerates "M-YYYY", "MM/YY", spaces, etc.)
function normMonthStr_(s) {
  var raw = String(s || '').trim();
  if (!raw) return '';
  var cleaned = raw.replace(/\s+/g, '');
  var parts = cleaned.split(/[-/]/);
  if (parts.length === 2) {
    var mm = parts[0];
    var yy = parts[1];
    // month to 2 digits
    mm = ('0' + parseInt(mm, 10)).slice(-2);
    // year to 4 digits if comes as "25"
    if (/^\d{2}$/.test(yy)) yy = '20' + yy;
    return mm + '-' + yy;
  }
  // If already comes as "MM-YYYY", return as is
  if (/^\d{2}-\d{4}$/.test(cleaned)) return cleaned;
  return raw; // fallback
}

// Find existing row whose DISPLAY in col A == normalized monthStr
function findExistingMonthRow_(sh, monthStr) {
  var goal = normMonthStr_(monthStr);
  if (!goal) return 0;

  var last = sh.getLastRow();
  if (last < USERS_FIRST_MONTH_ROW) return 0;

  var numRows = last - USERS_FIRST_MONTH_ROW + 1;
  var colA = sh.getRange(USERS_FIRST_MONTH_ROW, 1, numRows, 1).getDisplayValues();
  for (var i = 0; i < colA.length; i++) {
    var v = normMonthStr_(colA[i][0]);
    if (v === goal) return USERS_FIRST_MONTH_ROW + i;
  }
  return 0;
}

// Ensure month row: if exists, reuse; if not, insert 1 new row at end of months zone
function ensureMonthRow_(sh, monthStr) {
  var existing = findExistingMonthRow_(sh, monthStr);
  if (existing) return existing;

  // Locate last existing month (or row before month block)
  var last = Math.max(sh.getLastRow(), USERS_FIRST_MONTH_ROW - 1);

  // Insert 1 new row below
  sh.insertRowsAfter(last, 1);
  var newRow = last + 1;

  // Write month with text format (so it's always "MM-YYYY" literal)
  var cell = sh.getRange(newRow, 1);
  cell.setValue(normMonthStr_(monthStr));
  cell.setNumberFormat('@STRING@');

  return newRow;
}

/* ============== Additional Utility Functions ============== */
function validateMonthString(monthStr) {
  if (!monthStr || typeof monthStr !== 'string') {
    throw new Error('Month string is required and must be a string');
  }
  
  var normalized = normMonthStr_(monthStr);
  if (!/^\d{2}-\d{4}$/.test(normalized)) {
    throw new Error('Invalid month format. Expected MM-YYYY, got: ' + monthStr);
  }
  
  var parts = normalized.split('-');
  var month = parseInt(parts[0], 10);
  var year = parseInt(parts[1], 10);
  
  if (month < 1 || month > 12) {
    throw new Error('Invalid month. Must be 1-12, got: ' + month);
  }
  
  if (year < 2020 || year > 2030) {
    throw new Error('Invalid year. Must be 2020-2030, got: ' + year);
  }
  
  return normalized;
}

function getMonthDisplayName(monthStr) {
  var normalized = validateMonthString(monthStr);
  var parts = normalized.split('-');
  var month = parseInt(parts[0], 10);
  var year = parts[1];
  
  var monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  return monthNames[month - 1] + ' ' + year;
}

function checkPaymentPrerequisites() {
  var errors = [];
  
  // Check required script properties
  var proxyUrl = props_().getProperty('PROXY_URL');
  var proxyToken = props_().getProperty('PROXY_TOKEN');
  
  if (!proxyUrl) {
    errors.push('Missing PROXY_URL script property');
  }
  if (!proxyToken) {
    errors.push('Missing PROXY_TOKEN script property');
  }
  
  // Check if Users sheet exists
  try {
    var sh = sheet_();
    if (!sh) {
      errors.push('Users sheet not found');
    }
  } catch (e) {
    errors.push('Error accessing Users sheet: ' + e.message);
  }
  
  // Check if we can reach the proxy server
  if (proxyUrl && proxyToken) {
    try {
      var testResponse = httpProxyJson_('/revolut/summary');
      if (!testResponse || typeof testResponse.USD !== 'number') {
        errors.push('Proxy server response invalid - cannot get Revolut balances');
      }
    } catch (e) {
      errors.push('Cannot reach proxy server: ' + e.message);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

function formatCurrency(amount, currency) {
  currency = currency || 'EUR';
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '€0.00';
  }
  return '€' + amount.toFixed(2);
}

function logPaymentOperation(operation, monthStr, details) {
  var timestamp = new Date().toISOString();
  var logEntry = {
    timestamp: timestamp,
    operation: operation,
    month: monthStr,
    details: details
  };
  
  Logger.log('[PAYMENT_LOG] %s: %s for %s - %s', timestamp, operation, monthStr, JSON.stringify(details));
  
  // Store in script properties for audit trail (optional)
  try {
    var auditKey = 'PAYMENT_AUDIT_' + new Date().getTime();
    var auditData = JSON.stringify(logEntry);
    props_().setProperty(auditKey, auditData);
    
    // Keep only last 100 audit entries
    var allKeys = props_().getProperties();
    var auditKeys = Object.keys(allKeys).filter(function(key) {
      return key.startsWith('PAYMENT_AUDIT_');
    }).sort().reverse();
    
    if (auditKeys.length > 100) {
      for (var i = 100; i < auditKeys.length; i++) {
        props_().deleteProperty(auditKeys[i]);
      }
    }
  } catch (e) {
    Logger.log('[WARN] Could not store audit log: %s', e.message);
  }
}

/* ============== Enhanced Payment Functions ============== */
function payUsersForMonthWithValidation(monthStr, options) {
  // Validate month string
  var validatedMonth = validateMonthString(monthStr);
  
  // Check prerequisites
  var prereq = checkPaymentPrerequisites();
  if (!prereq.valid) {
    var errorMsg = 'Payment prerequisites not met:\n' + prereq.errors.join('\n');
    Logger.log('[ERROR] %s', errorMsg);
    throw new Error(errorMsg);
  }
  
  Logger.log('[INFO] Starting payments for %s (%s)', validatedMonth, getMonthDisplayName(validatedMonth));
  
  // Log the operation
  logPaymentOperation('START_PAYMENTS', validatedMonth, {
    options: options,
    timestamp: new Date().toISOString()
  });
  
  return payUsersForMonth(validatedMonth, options);
}

function getPaymentStatus(monthStr) {
  try {
    var validatedMonth = validateMonthString(monthStr);
    var sh = sheet_();
    var monthRow = findExistingMonthRow_(sh, validatedMonth);
    
    if (!monthRow) {
      return {
        month: validatedMonth,
        exists: false,
        message: 'Month not found in sheet'
      };
    }
    
    var lastCol = sh.getLastColumn();
    var payments = [];
    var totalPaid = 0;
    var totalRequired = 0;
    
    for (var c = 2; c <= lastCol; c++) {
      var user = String(sh.getRange(1, c).getValue() || '').trim();
      if (!user) continue;
      
      var active = toBool_(sh.getRange(28, c).getValue());
      var amount = Number(sh.getRange(29, c).getValue() || 0);
      var paid = sh.getRange(monthRow, c).getValue();
      
      if (active && amount > 0) {
        totalRequired += amount;
        if (typeof paid === 'number' && paid > 0) {
          totalPaid += paid;
        }
        
        payments.push({
          user: user,
          required: amount,
          paid: (typeof paid === 'number' && paid > 0) ? paid : 0,
          status: (typeof paid === 'number' && paid > 0) ? 'PAID' : 'PENDING'
        });
      }
    }
    
    return {
      month: validatedMonth,
      exists: true,
      totalRequired: totalRequired,
      totalPaid: totalPaid,
      pending: totalRequired - totalPaid,
      payments: payments,
      message: 'Status retrieved successfully'
    };
    
  } catch (e) {
    Logger.log('[ERROR] Failed to get payment status for %s: %s', monthStr, e.message);
    return {
      month: monthStr,
      error: e.message
    };
  }
}

function listAllPaymentMonths() {
  try {
    var sh = sheet_();
    var lastRow = sh.getLastRow();
    var months = [];
    
    for (var row = USERS_FIRST_MONTH_ROW; row <= lastRow; row++) {
      var monthValue = sh.getRange(row, 1).getValue();
      if (monthValue && typeof monthValue === 'string') {
        try {
          var normalized = normMonthStr_(monthValue);
          if (/^\d{2}-\d{4}$/.test(normalized)) {
            months.push({
              row: row,
              month: normalized,
              displayName: getMonthDisplayName(normalized)
            });
          }
        } catch (e) {
          // Skip invalid month formats
        }
      }
    }
    
    return months;
  } catch (e) {
    Logger.log('[ERROR] Failed to list payment months: %s', e.message);
    return [];
  }
}

/* ============== Main Payment Function ============== */
/* Pay the indicated month (MM-YYYY) reusing row if exists.
   - If month row already exists, NO new one is created.
   - If user already paid in that row (value > 0), NO repeat payment.
   - Note in month cell (col A) is ACCUMULATIVE: each execution adds
     to the BEGINNING with timestamp and summary of what happened.
*/
function payUsers_Revolut_ForMonth_(monthStr, options) {
  var tz = 'Europe/Andorra';
  var sh = sheet_();
  
  var monthRow = ensureMonthRow_(sh, monthStr);  // ← reuse if exists
  var lastCol  = sh.getLastColumn();

  var opts    = options || {};
  var dryRun  = !!opts.dryRun;
  var only    = (opts.users || null);

  var headerA1 = a1_(monthRow, 1);
  var modeStr  = dryRun ? 'DRY RUN' : 'REAL';

  // ========== 1) Build valid payments list ==========
  var payList = [];   // [{ col, user, amount }]
  var skipInfo = [];
  for (var c = 2; c <= lastCol; c++) {
    var user = String(sh.getRange(1, c).getValue() || '').trim();
    if (!user) continue;
    if (only && only.indexOf(user) === -1) continue;

    var active = toBool_(sh.getRange(28, c).getValue());
    var amount = Number(sh.getRange(29, c).getValue() || 0);

    // already paid this month?
    var already = sh.getRange(monthRow, c).getValue();
    var alreadyPaid = (typeof already === 'number' && already > 0);

    if (!active) { skipInfo.push(user + ': inactive'); continue; }
    if (!(amount > 0)) { skipInfo.push(user + ': amount<=0'); continue; }
    if (alreadyPaid) { skipInfo.push(user + ': already paid (' + already + ')'); continue; }

    payList.push({ col: c, user: user, amount: amount });
  }

  // total required
  var required = payList.reduce(function(s, r){ return s + Number(r.amount || 0); }, 0);

  // If nothing to pay: ACCUMULATE note and exit
  if (required <= 0) {
    var linesNoPay = [];
    linesNoPay.push(modeStr + ' ' + monthStr);
    if (skipInfo.length) {
      linesNoPay.push('— SKIP:');
      skipInfo.forEach(function(s){ linesNoPay.push('  - ' + s); });
    }
    linesNoPay.push('No pending payments.');
    appendNoteTop_(sh, headerA1, linesNoPay, tz); // ← ACCUMULATE
    return;
  }

  // ========== 2) Balance check and FX beforehand (REAL only) ==========
  var linesHead = [];
  linesHead.push(modeStr + ' payouts ' + monthStr);

  if (!dryRun) {
    var eurAvail = 0;
    try { eurAvail = Number(getRevolutMainBalance_('EUR')); }
    catch (e) {
      linesHead.push('ERROR: could not get Main EUR balance (' + (e && e.message || e) + ').');
      linesHead.push('Abort before transfers.');
      appendNoteTop_(sh, headerA1, linesHead, tz); // ← ACCUMULATE
      Logger.log('[ABORT] Could not read Main EUR balance: %s', e.message);
      return;
    }

    if (eurAvail < required) {
      var missingEur = required - eurAvail;

      if (isWeekend_(tz)) {
        var usdAvailWE = 0; try { usdAvailWE = Number(getRevolutMainBalance_('USD')); } catch (_){}
        linesHead.push('ERROR: insufficient EUR balance and it\'s weekend (no FX).');
        linesHead.push('Required: ' + required.toFixed(2) + ' | EUR available: ' + eurAvail.toFixed(2) + ' | USD avail.: ' + usdAvailWE.toFixed(2));
        linesHead.push('Abort before transfers.');
        appendNoteTop_(sh, headerA1, linesHead, tz); // ← ACCUMULATE
        return;
      }

      var usdAvail = 0; try { usdAvail = Number(getRevolutMainBalance_('USD')); } catch (_){}

      if (usdAvail <= 0) {
        linesHead.push('ERROR: insufficient EUR balance and no USD for FX.');
        linesHead.push('Required: ' + required.toFixed(2) + ' | EUR: ' + eurAvail.toFixed(2) + ' | USD: ' + usdAvail.toFixed(2));
        linesHead.push('Abort before transfers.');
        appendNoteTop_(sh, headerA1, linesHead, tz); // ← ACCUMULATE
        return;
      }

      var mult = Number(props_().getProperty('REV_FX_USD_MULT') || '1.20');
      if (!(mult > 0)) mult = 1.20;
      var usdToSell = Math.min(usdAvail, Number((missingEur * mult).toFixed(2)));

      var fxReqId = ('REV-FX-' + monthStr.replace('-', '')).slice(0, 40);
      try {
        var fxRef = 'FX pre-payout ' + monthStr + ' (sell ' + usdToSell + ' USD)';
        var fxRes = revolutFxUsdToEur_(usdToSell, fxReqId, fxRef);
        var fxState = String((fxRes && fxRes.exchange && fxRes.exchange.state) || fxRes.state || '').toLowerCase();
        linesHead.push('FX USD→EUR: sell ' + usdToSell.toFixed(2) + ' USD (state=' + (fxState || 'unknown') + ')');
      } catch (e3) {
        linesHead.push('ERROR FX: ' + e3.message);
        linesHead.push('Abort before transfers.');
        appendNoteTop_(sh, headerA1, linesHead, tz); // ← ACCUMULATE
        return;
      }

      try { eurAvail = Number(getRevolutMainBalance_('EUR')); } catch (_){}
      if (eurAvail < required) {
        linesHead.push('ERROR: after FX still insufficient EUR.');
        linesHead.push('Required: ' + required.toFixed(2) + ' | EUR now: ' + eurAvail.toFixed(2));
        linesHead.push('Abort before transfers.');
        appendNoteTop_(sh, headerA1, linesHead, tz); // ← ACCUMULATE
        return;
      }
    }
  }

  // ========== 3) Pay (or simulate) and dump summary in note (ACCUMULATIVE) ==========
  var lines = linesHead.slice(0);
  var okCount = 0, errCount = 0, skipCount = skipInfo.length, totalPaid = 0;

  if (skipInfo.length) {
    lines.push('— Previous SKIP:');
    skipInfo.forEach(function(s){ lines.push('  - ' + s); });
  }

  for (var c2 = 2; c2 <= lastCol; c2++) {
    var user2 = String(sh.getRange(1, c2).getValue() || '').trim();
    if (!user2) continue;
    if (only && only.indexOf(user2) === -1) continue;

    var active2 = toBool_(sh.getRange(28, c2).getValue());
    var amount2 = Number(sh.getRange(29, c2).getValue() || 0);
    var cellA1  = a1_(monthRow, c2);

    // re-check for security: if already value >0, don't repay
    var already2 = sh.getRange(monthRow, c2).getValue();
    if (!active2) { setNoteOnly_(sh, cellA1, 'SKIP: user inactive'); continue; }
    if (!(amount2 > 0)) { setNoteOnly_(sh, cellA1, 'SKIP: amount<=0'); continue; }
    if (typeof already2 === 'number' && already2 > 0) {
      setNoteOnly_(sh, cellA1, 'SKIP: already paid (' + already2 + ')');
      continue;
    }

    // is it in validated list?
    var plan = payList.find(function(p){ return p.col === c2; });
    if (!plan) continue;

    var reqId = ('REV-' + monthStr.replace('-', '') + '-' + user2).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40);
    var ref   = 'Payout ' + monthStr + ' ' + user2;

    if (dryRun) {
      setNoteOnly_(sh, cellA1, '[DRY RUN] ' + ref + ' ' + amount2 + ' EUR');
      lines.push('DRY ' + user2 + ': ' + amount2.toFixed(2) + ' EUR');
      continue;
    }

    try {
      var resp  = revolutMove_(user2, Number(amount2.toFixed(2)), reqId, ref);
      var state = String((resp && resp.transfer && resp.transfer.state) || resp.state || '').toLowerCase();
      var dup   = !!(resp && resp.duplicate);
      var tid   = (resp && resp.transfer && resp.transfer.id) || resp.id || '';

      if (dup || (state && state !== 'declined' && state !== 'failed')) {
        setCellKeepFmt_(sh, cellA1, amount2, null); // write amount and clear note
        var tag = dup ? 'duplicate-ok' : (state || 'completed');
        lines.push('OK ' + user2 + ': ' + amount2.toFixed(2) + ' EUR (state=' + tag + ', id=' + (tid || '?') + ')');
        okCount++;
        totalPaid += amount2;
        
        // Send WhatsApp notification for successful payment
        if (!dryRun) {
          try {
            sendPaymentWhatsAppNotification_(user2, amount2, monthStr);
          } catch (whatsappError) {
            Logger.log('[WHATSAPP] Error sending notification to %s: %s', user2, whatsappError.message);
            // Don't fail the payment if WhatsApp fails
          }
        }
      } else {
        setCellKeepFmt_(sh, cellA1, '', 'ERROR: state=' + (state || 'unknown'));
        lines.push('ERROR ' + user2 + ': state=' + (state || 'unknown'));
        errCount++;
      }
    } catch (e) {
      setCellKeepFmt_(sh, cellA1, '', 'ERROR: ' + e.message);
      lines.push('ERROR ' + user2 + ': ' + e.message);
      errCount++;
    }
  }

  lines.push('—');
  lines.push('Summary: OK=' + okCount + ', SKIP=' + skipCount + ', ERR=' + errCount + ', total EUR=' + totalPaid.toFixed(2));

  // 🧾 ACCUMULATE month note in column A (new entry at top with timestamp)
  appendNoteTop_(sh, headerA1, lines, tz);
}

/* ============== Public Interface Functions ============== */
function payUsersForMonth(monthStr, options) {
  try {
    // Early exit if proxy is down
    if (!proxyIsUp_()) {
      var sh = sheet_();
      appendNoteTop_(sh, a1_(USERS_FIRST_MONTH_ROW, 1), ['SERVER DOWN (proxy) ' + nowStamp_()], 'Europe/Andorra');
      throw new Error('Proxy server is down');
    }
    Logger.log('=== STARTING PAYMENTS FOR MONTH: %s ===', monthStr);
    payUsers_Revolut_ForMonth_(monthStr, options || {});
    Logger.log('=== PAYMENTS COMPLETED FOR MONTH: %s ===', monthStr);
    return 'Payments completed successfully';
  } catch (e) {
    Logger.log('[ERROR] Payments failed for month %s: %s', monthStr, e.message);
    throw e;
  }
}

function payUsersForCurrentMonth(options) {
  var now = new Date();
  var month = (now.getMonth() + 1).toString();
  var monthStr = (month.length === 1 ? '0' : '') + month + '-' + now.getFullYear();
  return payUsersForMonth(monthStr, options);
}

function dryRunPayUsersForMonth(monthStr, options) {
  var dryRunOptions = options || {};
  dryRunOptions.dryRun = true;
  return payUsersForMonth(monthStr, dryRunOptions);
}

function dryRunPayUsersForCurrentMonth(options) {
  var now = new Date();
  var month = (now.getMonth() + 1).toString();
  var monthStr = (month.length === 1 ? '0' : '') + month + '-' + now.getFullYear();
  return dryRunPayUsersForMonth(monthStr, options);
}



/* ============== Test Functions ============== */
function testPaymentSystem() {
  Logger.log('=== TESTING PAYMENT SYSTEM ===');
  try {
    // Check prerequisites
    var prereq = checkPaymentPrerequisites();
    if (!prereq.valid) {
      Logger.log('[ERROR] Prerequisites not met: %s', prereq.errors.join(', '));
      return 'Prerequisites not met: ' + prereq.errors.join(', ');
    }
    
    // Test current month with dry run
    var result = dryRunPayUsersForCurrentMonth();
    Logger.log('Test result: %s', result);
    return 'Payment system test completed successfully';
  } catch (e) {
    Logger.log('[ERROR] Payment system test failed: %s', e.message);
    return 'Test failed: ' + e.message;
  }
}

function testSpecificMonth(monthStr) {
  Logger.log('=== TESTING SPECIFIC MONTH: %s ===', monthStr);
  try {
    var result = dryRunPayUsersForMonth(monthStr);
    Logger.log('Test result: %s', result);
    return 'Month test completed successfully';
  } catch (e) {
    Logger.log('[ERROR] Month test failed: %s', e.message);
    return 'Test failed: ' + e.message;
  }
}

function testMonthValidation() {
  Logger.log('=== TESTING MONTH VALIDATION ===');
  try {
    var testCases = [
      '08-2025',
      '8-2025', 
      '12-25',
      '01-2026',
      'invalid',
      '13-2025',
      '00-2025'
    ];
    
    for (var i = 0; i < testCases.length; i++) {
      var testCase = testCases[i];
      try {
        var result = validateMonthString(testCase);
        Logger.log('[VALID] %s -> %s', testCase, result);
      } catch (e) {
        Logger.log('[INVALID] %s -> %s', testCase, e.message);
      }
    }
    
    return 'Month validation test completed';
  } catch (e) {
    Logger.log('[ERROR] Month validation test failed: %s', e.message);
    return 'Test failed: ' + e.message;
  }
}

function testPaymentStatus() {
  Logger.log('=== TESTING PAYMENT STATUS ===');
  try {
    var now = new Date();
    var month = (now.getMonth() + 1).toString();
    var monthStr = (month.length === 1 ? '0' : '') + month + '-' + now.getFullYear();
    
    var status = getPaymentStatus(monthStr);
    Logger.log('Payment status for %s: %s', monthStr, JSON.stringify(status, null, 2));
    
    return 'Payment status test completed';
  } catch (e) {
    Logger.log('[ERROR] Payment status test failed: %s', e.message);
    return 'Test failed: ' + e.message;
  }
}

function testListMonths() {
  Logger.log('=== TESTING LIST MONTHS ===');
  try {
    var months = listAllPaymentMonths();
    Logger.log('Found %s payment months:', months.length);
    for (var i = 0; i < months.length; i++) {
      var month = months[i];
      Logger.log('[%s] %s (%s) at row %s', i + 1, month.month, month.displayName, month.row);
    }
    
    return 'List months test completed - found ' + months.length + ' months';
  } catch (e) {
    Logger.log('[ERROR] List months test failed: %s', e.message);
    return 'Test failed: ' + e.message;
  }
}

function testUserAnalysis() {
  Logger.log('=== TESTING USER ANALYSIS ===');
  try {
    var sh = sheet_();
    var lastCol = sh.getLastColumn();
    
    // Find first user to test with
    var testUser = '';
    for (var c = 2; c <= lastCol; c++) {
      var user = String(sh.getRange(1, c).getValue() || '').trim();
      if (user) {
        testUser = user;
        break;
      }
    }
    
    if (!testUser) {
      return 'No users found to test with';
    }
    
    Logger.log('Testing user analysis with: %s', testUser);
    var analysis = analyzeUserPayments(testUser);
    
    Logger.log('User analysis test completed successfully');
    return 'User analysis test completed for ' + testUser;
  } catch (e) {
    Logger.log('[ERROR] User analysis test failed: %s', e.message);
    return 'Test failed: ' + e.message;
  }
}

function testPaymentReport() {
  Logger.log('=== TESTING PAYMENT REPORT ===');
  try {
    var now = new Date();
    var month = (now.getMonth() + 1).toString();
    var monthStr = (month.length === 1 ? '0' : '') + month + '-' + now.getFullYear();
    
    Logger.log('Testing payment report for: %s', monthStr);
    var report = generatePaymentReport(monthStr);
    
    Logger.log('Payment report test completed successfully');
    return 'Payment report test completed for ' + monthStr;
  } catch (e) {
    Logger.log('[ERROR] Payment report test failed: %s', e.message);
    return 'Test failed: ' + e.message;
  }
}

/* ============== Comprehensive Testing Methods ============== */
function simulatePaymentProcess(monthStr, options) {
  Logger.log('=== SIMULATING PAYMENT PROCESS FOR %s ===', monthStr);
  
  try {
    var validatedMonth = validateMonthString(monthStr);
    var sh = sheet_();
    var monthRow = ensureMonthRow_(sh, validatedMonth);
    var lastCol = sh.getLastColumn();
    
    var simulation = {
      month: validatedMonth,
      monthRow: monthRow,
      timestamp: new Date().toISOString(),
      users: [],
      summary: {
        totalUsers: 0,
        activeUsers: 0,
        inactiveUsers: 0,
        usersWithAmount: 0,
        alreadyPaid: 0,
        pendingPayments: 0,
        totalRequired: 0,
        totalPaid: 0,
        totalPending: 0
      },
      balanceCheck: {
        eurAvailable: 0,
        usdAvailable: 0,
        required: 0,
        fxNeeded: false,
        fxAmount: 0,
        fxMultiplier: Number(props_().getProperty('REV_FX_USD_MULT') || '1.20')
      },
      weekendCheck: {
        isWeekend: false,
        timezone: 'Europe/Andorra'
      }
    };
    
    // Check if it's weekend
    simulation.weekendCheck.isWeekend = isWeekend_(simulation.weekendCheck.timezone);
    
    // Analyze users and payments
    for (var c = 2; c <= lastCol; c++) {
      var user = String(sh.getRange(1, c).getValue() || '').trim();
      if (!user) continue;
      
      simulation.summary.totalUsers++;
      
      var active = toBool_(sh.getRange(28, c).getValue());
      var amount = Number(sh.getRange(29, c).getValue() || 0);
      var already = sh.getRange(monthRow, c).getValue();
      var alreadyPaid = (typeof already === 'number' && already > 0);
      
      var userInfo = {
        column: c,
        user: user,
        active: active,
        amount: amount,
        alreadyPaid: alreadyPaid,
        status: 'UNKNOWN'
      };
      
      if (!active) {
        userInfo.status = 'INACTIVE';
        simulation.summary.inactiveUsers++;
      } else if (!(amount > 0)) {
        userInfo.status = 'NO_AMOUNT';
      } else if (alreadyPaid) {
        userInfo.status = 'ALREADY_PAID';
        simulation.summary.alreadyPaid++;
        simulation.summary.totalPaid += already;
      } else {
        userInfo.status = 'PENDING_PAYMENT';
        simulation.summary.activeUsers++;
        simulation.summary.usersWithAmount++;
        simulation.summary.pendingPayments++;
        simulation.summary.totalRequired += amount;
      }
      
      simulation.users.push(userInfo);
    }
    
    simulation.summary.totalPending = simulation.summary.totalRequired;
    
    // Simulate balance check (without actual API calls)
    if (simulation.summary.totalRequired > 0) {
      simulation.balanceCheck.required = simulation.summary.totalRequired;
      
      // Try to get actual balances (this will fail in simulation but shows the process)
      try {
        simulation.balanceCheck.eurAvailable = Number(getRevolutMainBalance_('EUR'));
        simulation.balanceCheck.usdAvailable = Number(getRevolutMainBalance_('USD'));
      } catch (e) {
        simulation.balanceCheck.eurAvailable = 'ERROR: ' + e.message;
        simulation.balanceCheck.usdAvailable = 'ERROR: ' + e.message;
      }
      
      // Check if FX is needed
      if (typeof simulation.balanceCheck.eurAvailable === 'number' && 
          simulation.balanceCheck.eurAvailable < simulation.summary.totalRequired) {
        simulation.balanceCheck.fxNeeded = true;
        var missingEur = simulation.summary.totalRequired - simulation.balanceCheck.eurAvailable;
        simulation.balanceCheck.fxAmount = missingEur * simulation.balanceCheck.fxMultiplier;
      }
    }
    
    // Log simulation results
    Logger.log('[SIMULATION] Month: %s, Row: %s', simulation.month, simulation.monthRow);
    Logger.log('[SIMULATION] Total Users: %s, Active: %s, Inactive: %s', 
               simulation.summary.totalUsers, simulation.summary.activeUsers, simulation.summary.inactiveUsers);
    Logger.log('[SIMULATION] Pending Payments: %s, Already Paid: %s', 
               simulation.summary.pendingPayments, simulation.summary.alreadyPaid);
    Logger.log('[SIMULATION] Total Required: €%s, Total Pending: €%s', 
               simulation.summary.totalRequired.toFixed(2), simulation.summary.totalPending.toFixed(2));
    
    if (simulation.balanceCheck.fxNeeded) {
      Logger.log('[SIMULATION] FX NEEDED: €%s EUR missing, need to sell €%s USD', 
                 (simulation.balanceCheck.required - simulation.balanceCheck.eurAvailable).toFixed(2),
                 simulation.balanceCheck.fxAmount.toFixed(2));
    }
    
    if (simulation.weekendCheck.isWeekend) {
      Logger.log('[SIMULATION] WEEKEND: No FX conversion possible');
    }
    
    return simulation;
    
  } catch (e) {
    Logger.log('[ERROR] Simulation failed: %s', e.message);
    throw e;
  }
}

function simulatePaymentProcessDetailed(monthStr, options) {
  var simulation = simulatePaymentProcess(monthStr, options);
  
  Logger.log('\n=== DETAILED SIMULATION RESULTS ===');
  Logger.log('Month: %s (%s)', simulation.month, getMonthDisplayName(simulation.month));
  Logger.log('Sheet Row: %s', simulation.monthRow);
  Logger.log('Timestamp: %s', simulation.timestamp);
  
  Logger.log('\n--- USER ANALYSIS ---');
  for (var i = 0; i < simulation.users.length; i++) {
    var user = simulation.users[i];
    var status = user.status;
    var details = '';
    
    switch (status) {
      case 'INACTIVE':
        details = 'User inactive, will be skipped';
        break;
      case 'NO_AMOUNT':
        details = 'No payment amount set, will be skipped';
        break;
      case 'ALREADY_PAID':
        details = 'Already paid €' + Number(user.alreadyPaid || 0).toFixed(2) + ', will be skipped';
        break;
      case 'PENDING_PAYMENT':
        details = 'Will pay €' + user.amount.toFixed(2);
        break;
      default:
        details = 'Unknown status';
    }
    
    Logger.log('[%s] %s: %s - %s', 
               (i + 1).toString().padStart(2, ' '), 
               user.user.padEnd(15, ' '), 
               status.padEnd(15, ' '), 
               details);
  }
  
  Logger.log('\n--- SUMMARY STATISTICS ---');
  Logger.log('Total Users: %s', simulation.summary.totalUsers);
  Logger.log('Active Users: %s', simulation.summary.activeUsers);
  Logger.log('Inactive Users: %s', simulation.summary.inactiveUsers);
  Logger.log('Users with Amount: %s', simulation.summary.usersWithAmount);
  Logger.log('Already Paid: %s', simulation.summary.alreadyPaid);
  Logger.log('Pending Payments: %s', simulation.summary.pendingPayments);
  Logger.log('Total Required: €%s', simulation.summary.totalRequired.toFixed(2));
  Logger.log('Total Paid: €%s', simulation.summary.totalPaid.toFixed(2));
  Logger.log('Total Pending: €%s', simulation.summary.totalPending.toFixed(2));
  
  Logger.log('\n--- BALANCE ANALYSIS ---');
  Logger.log('EUR Available: %s', simulation.balanceCheck.eurAvailable);
  Logger.log('USD Available: %s', simulation.balanceCheck.usdAvailable);
  Logger.log('Required: €%s', simulation.balanceCheck.required.toFixed(2));
  Logger.log('FX Needed: %s', simulation.balanceCheck.fxNeeded ? 'YES' : 'NO');
  if (simulation.balanceCheck.fxNeeded) {
    Logger.log('FX Amount: €%s USD', simulation.balanceCheck.fxAmount.toFixed(2));
    Logger.log('FX Multiplier: %s', simulation.balanceCheck.fxMultiplier);
  }
  
  Logger.log('\n--- ENVIRONMENT CHECKS ---');
  Logger.log('Is Weekend: %s', simulation.weekendCheck.isWeekend ? 'YES' : 'NO');
  Logger.log('Timezone: %s', simulation.weekendCheck.timezone);
  
  Logger.log('\n=== SIMULATION COMPLETED ===');
  return simulation;
}

function testPaymentSimulation() {
  Logger.log('=== TESTING PAYMENT SIMULATION ===');
  try {
    var now = new Date();
    var month = (now.getMonth() + 1).toString();
    var monthStr = (month.length === 1 ? '0' : '') + month + '-' + now.getFullYear();
    
    Logger.log('Testing simulation for current month: %s', monthStr);
    
    var simulation = simulatePaymentProcessDetailed(monthStr);
    
    Logger.log('Simulation test completed successfully');
    return 'Simulation test completed - check logs for details';
  } catch (e) {
    Logger.log('[ERROR] Simulation test failed: %s', e.message);
    return 'Test failed: ' + e.message;
  }
}

function testPaymentSimulationSpecific(monthStr) {
  Logger.log('=== TESTING PAYMENT SIMULATION FOR %s ===', monthStr);
  try {
    var simulation = simulatePaymentProcessDetailed(monthStr);
    
    Logger.log('Specific month simulation test completed successfully');
    return 'Simulation test completed for ' + monthStr + ' - check logs for details';
  } catch (e) {
    Logger.log('[ERROR] Specific month simulation test failed: %s', e.message);
    return 'Test failed: ' + e.message;
  }
}

function compareMonths(month1, month2) {
  Logger.log('=== COMPARING MONTHS: %s vs %s ===', month1, month2);
  
  try {
    var sim1 = simulatePaymentProcess(month1);
    var sim2 = simulatePaymentProcess(month2);
    
    var comparison = {
      month1: sim1,
      month2: sim2,
      differences: {
        totalUsers: sim2.summary.totalUsers - sim1.summary.totalUsers,
        activeUsers: sim2.summary.activeUsers - sim1.summary.activeUsers,
        pendingPayments: sim2.summary.pendingPayments - sim1.summary.pendingPayments,
        totalRequired: sim2.summary.totalRequired - sim1.summary.totalRequired
      }
    };
    
    Logger.log('\n--- MONTH COMPARISON ---');
    Logger.log('Month 1 (%s): %s users, €%s required', 
               month1, sim1.summary.totalUsers, sim1.summary.totalRequired.toFixed(2));
    Logger.log('Month 2 (%s): %s users, €%s required', 
               month2, sim2.summary.totalUsers, sim2.summary.totalRequired.toFixed(2));
    
    Logger.log('\n--- DIFFERENCES ---');
    Logger.log('Total Users: %s', comparison.differences.totalUsers);
    Logger.log('Active Users: %s', comparison.differences.activeUsers);
    Logger.log('Pending Payments: %s', comparison.differences.pendingPayments);
    Logger.log('Total Required: €%s', comparison.differences.totalRequired.toFixed(2));
    
    return comparison;
  } catch (e) {
    Logger.log('[ERROR] Month comparison failed: %s', e.message);
    throw e;
  }
}

function validatePaymentSheet() {
  Logger.log('=== VALIDATING PAYMENT SHEET ===');
  
  try {
    var sh = sheet_();
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    
    var validation = {
      sheetName: USERS_SHEET,
      dimensions: {
        rows: lastRow,
        columns: lastCol
      },
      structure: {
        hasHeaderRow: false,
        hasUserColumns: false,
        hasActiveRow: false,
        hasAmountRow: false,
        hasMonthRows: false
      },
      issues: [],
      recommendations: []
    };
    
    // Check header row (row 1)
    if (lastRow >= 1) {
      var headerRow = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      var userCount = headerRow.filter(function(cell) { return String(cell || '').trim() !== ''; }).length;
      validation.structure.hasHeaderRow = true;
      validation.structure.hasUserColumns = userCount > 1; // More than just the month column
      
      if (userCount <= 1) {
        validation.issues.push('Header row has no user names');
      } else {
        Logger.log('Found %s user columns in header row', userCount - 1);
      }
    } else {
      validation.issues.push('Sheet is empty');
    }
    
    // Check active status row (row 28)
    if (lastRow >= 28) {
      var activeRow = sh.getRange(28, 1, 1, lastCol).getValues()[0];
      var activeCount = activeRow.filter(function(cell) { 
        return toBool_(cell); 
      }).length;
      validation.structure.hasActiveRow = true;
      
      Logger.log('Found %s active users in row 28', activeCount);
    } else {
      validation.issues.push('Missing active status row (row 28)');
    }
    
    // Check amount row (row 29)
    if (lastRow >= 29) {
      var amountRow = sh.getRange(29, 1, 1, lastCol).getValues()[0];
      var amountCount = amountRow.filter(function(cell) { 
        return Number(cell || 0) > 0; 
      }).length;
      validation.structure.hasAmountRow = true;
      
      Logger.log('Found %s users with payment amounts in row 29', amountCount);
    } else {
      validation.issues.push('Missing amount row (row 29)');
    }
    
    // Check month rows (starting from row 30)
    if (lastRow >= USERS_FIRST_MONTH_ROW) {
      var monthCount = 0;
      for (var row = USERS_FIRST_MONTH_ROW; row <= lastRow; row++) {
        var monthValue = sh.getRange(row, 1).getValue();
        if (monthValue && typeof monthValue === 'string') {
          try {
            var normalized = normMonthStr_(monthValue);
            if (/^\d{2}-\d{4}$/.test(normalized)) {
              monthCount++;
            }
          } catch (e) {
            // Skip invalid month formats
          }
        }
      }
      validation.structure.hasMonthRows = monthCount > 0;
      
      Logger.log('Found %s month rows starting from row %s', monthCount, USERS_FIRST_MONTH_ROW);
    } else {
      validation.issues.push('No month rows found (starting from row ' + USERS_FIRST_MONTH_ROW + ')');
    }
    
    // Generate recommendations
    if (validation.issues.length === 0) {
      validation.recommendations.push('Sheet structure is valid and ready for payments');
    } else {
      validation.recommendations.push('Fix the identified issues before running payments');
    }
    
    if (validation.structure.hasUserColumns && validation.structure.hasActiveRow && validation.structure.hasAmountRow) {
      validation.recommendations.push('Consider running a dry run to test the payment process');
    }
    
    Logger.log('\n--- VALIDATION RESULTS ---');
    Logger.log('Sheet: %s', validation.sheetName);
    Logger.log('Dimensions: %s rows × %s columns', validation.dimensions.rows, validation.dimensions.columns);
    Logger.log('Issues found: %s', validation.issues.length);
    Logger.log('Recommendations: %s', validation.recommendations.length);
    
    if (validation.issues.length > 0) {
      Logger.log('\nIssues:');
      validation.issues.forEach(function(issue, index) {
        Logger.log('  %s. %s', index + 1, issue);
      });
    }
    
    if (validation.recommendations.length > 0) {
      Logger.log('\nRecommendations:');
      validation.recommendations.forEach(function(rec, index) {
        Logger.log('  %s. %s', index + 1, rec);
      });
    }
    
    Logger.log('\n=== VALIDATION COMPLETED ===');
    return validation;
    
  } catch (e) {
    Logger.log('[ERROR] Sheet validation failed: %s', e.message);
    throw e;
  }
}

function analyzeUserPayments(userName) {
  Logger.log('=== ANALYZING USER PAYMENTS: %s ===', userName);
  
  try {
    var sh = sheet_();
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    
    // Find user column
    var userCol = 0;
    for (var c = 2; c <= lastCol; c++) {
      var header = String(sh.getRange(1, c).getValue() || '').trim();
      if (header === userName) {
        userCol = c;
        break;
      }
    }
    
    if (userCol === 0) {
      throw new Error('User "' + userName + '" not found in sheet');
    }
    
    var analysis = {
      user: userName,
      column: userCol,
      active: false,
      monthlyAmount: 0,
      paymentHistory: [],
      totalPaid: 0,
      totalMonths: 0,
      lastPayment: null
    };
    
    // Get user status and amount
    analysis.active = toBool_(sh.getRange(28, userCol).getValue());
    analysis.monthlyAmount = Number(sh.getRange(29, userCol).getValue() || 0);
    
    // Analyze payment history
    for (var row = USERS_FIRST_MONTH_ROW; row <= lastRow; row++) {
      var monthValue = sh.getRange(row, 1).getValue();
      if (monthValue && typeof monthValue === 'string') {
        try {
          var normalized = normMonthStr_(monthValue);
          if (/^\d{2}-\d{4}$/.test(normalized)) {
            var payment = sh.getRange(row, userCol).getValue();
            var paymentAmount = (typeof payment === 'number' && payment > 0) ? payment : 0;
            
            if (paymentAmount > 0) {
              analysis.totalPaid += paymentAmount;
              analysis.lastPayment = {
                month: normalized,
                amount: paymentAmount,
                row: row
              };
            }
            
            analysis.paymentHistory.push({
              month: normalized,
              amount: paymentAmount,
              row: row
            });
            
            analysis.totalMonths++;
          }
        } catch (e) {
          // Skip invalid month formats
        }
      }
    }
    
    // Log analysis results
    Logger.log('[ANALYSIS] User: %s (Column %s)', analysis.user, analysis.column);
    Logger.log('[ANALYSIS] Active: %s', analysis.active ? 'YES' : 'NO');
    Logger.log('[ANALYSIS] Monthly Amount: €%s', analysis.monthlyAmount.toFixed(2));
    Logger.log('[ANALYSIS] Total Paid: €%s', analysis.totalPaid.toFixed(2));
    Logger.log('[ANALYSIS] Total Months: %s', analysis.totalMonths);
    
    if (analysis.lastPayment) {
      Logger.log('[ANALYSIS] Last Payment: €%s in %s', 
                 analysis.lastPayment.amount.toFixed(2), analysis.lastPayment.month);
    }
    
    Logger.log('[ANALYSIS] Payment History:');
    for (var i = 0; i < analysis.paymentHistory.length; i++) {
      var payment = analysis.paymentHistory[i];
      if (payment.amount > 0) {
        Logger.log('[ANALYSIS]   %s: €%s', payment.month, payment.amount.toFixed(2));
      }
    }
    
    Logger.log('=== USER ANALYSIS COMPLETED ===');
    return analysis;
    
  } catch (e) {
    Logger.log('[ERROR] User analysis failed: %s', e.message);
    throw e;
  }
}

function generatePaymentReport(monthStr) {
  Logger.log('=== GENERATING PAYMENT REPORT FOR %s ===', monthStr);
  
  try {
    var simulation = simulatePaymentProcess(monthStr);
    var sh = sheet_();
    var monthRow = simulation.monthRow;
    
    var report = {
      month: monthStr,
      monthRow: monthRow,
      timestamp: new Date().toISOString(),
      summary: simulation.summary,
      userDetails: [],
      recommendations: []
    };
    
    // Generate detailed user report
    for (var i = 0; i < simulation.users.length; i++) {
      var user = simulation.users[i];
      var userReport = {
        user: user.user,
        status: user.status,
        amount: user.amount,
        alreadyPaid: user.alreadyPaid,
        action: 'NONE'
      };
      
      // Determine recommended action
      switch (user.status) {
        case 'INACTIVE':
          userReport.action = 'SKIP - User inactive';
          break;
        case 'NO_AMOUNT':
          userReport.action = 'SKIP - No amount set';
          break;
        case 'ALREADY_PAID':
          userReport.action = 'SKIP - Already paid €' + Number(user.alreadyPaid || 0).toFixed(2);
          break;
        case 'PENDING_PAYMENT':
          userReport.action = 'PAY €' + user.amount.toFixed(2);
          break;
      }
      
      report.userDetails.push(userReport);
    }
    
    // Generate recommendations
    if (simulation.summary.pendingPayments === 0) {
      report.recommendations.push('No payments needed for this month');
    } else {
      report.recommendations.push('Process ' + simulation.summary.pendingPayments + ' pending payments');
      report.recommendations.push('Total amount required: €' + simulation.summary.totalRequired.toFixed(2));
      
      if (simulation.balanceCheck.fxNeeded) {
        report.recommendations.push('FX conversion needed: €' + simulation.balanceCheck.fxAmount.toFixed(2) + ' USD');
      }
      
      if (simulation.weekendCheck.isWeekend) {
        report.recommendations.push('⚠️  Weekend detected - no FX conversion possible');
        report.recommendations.push('Ensure sufficient EUR balance before weekend');
      }
    }
    
    // Log report
    Logger.log('[REPORT] Month: %s', report.month);
    Logger.log('[REPORT] Pending Payments: %s', report.summary.pendingPayments);
    Logger.log('[REPORT] Total Required: €%s', report.summary.totalRequired.toFixed(2));
    
    Logger.log('\n--- USER DETAILS ---');
    for (var j = 0; j < report.userDetails.length; j++) {
      var detail = report.userDetails[j];
      Logger.log('[REPORT] %s: %s - %s', 
                 detail.user.padEnd(15, ' '), 
                 detail.status.padEnd(15, ' '), 
                 detail.action);
    }
    
    Logger.log('\n--- RECOMMENDATIONS ---');
    for (var k = 0; k < report.recommendations.length; k++) {
      Logger.log('[REPORT] %s. %s', k + 1, report.recommendations[k]);
    }
    
    Logger.log('=== PAYMENT REPORT GENERATED ===');
    return report;
    
  } catch (e) {
    Logger.log('[ERROR] Payment report generation failed: %s', e.message);
    throw e;
  }
}

/* ============== SIMPLIFIED MENU FUNCTIONS ============== */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Payments')
    .addSeparator()
    .addItem('📅 July 2025', 'runJuly2025')
    .addItem('📅 August 2025', 'runAugust2025')
    .addItem('📅 September 2025', 'runSeptember2025')
    .addItem('📅 October 2025', 'runOctober2025')
    .addSeparator()
    .addItem('🔍 Check Status', 'checkCurrentMonthStatus')
    .addToUi();
}

/* ============== SIMPLIFIED MONTH FUNCTIONS ============== */
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

function runPaymentsAugust2025() {
  try {
    Logger.log('[AUGUST 2025] Starting payment process...');
    var result = payUsersForMonth('08-2025');
    Logger.log('[SUCCESS] August 2025 payment process completed successfully!');
    Logger.log('[SUCCESS] Check the logs above for payment details.');
    return result;
  } catch (error) {
    var errorMsg = 'August 2025 failed: ' + error.message;
    Logger.log('[ERROR] ' + errorMsg);
    throw error;
  }
}

function runPaymentsSeptember2025() {
  try {
    Logger.log('[SEPTEMBER 2025] Starting payment process...');
    var result = payUsersForMonth('09-2025');
    Logger.log('[SUCCESS] September 2025 payment process completed successfully!');
    Logger.log('[SUCCESS] Check the logs above for payment details.');
    return result;
  } catch (error) {
    var errorMsg = 'September 2025 failed: ' + error.message;
    Logger.log('[ERROR] ' + errorMsg);
    throw error;
  }
}

function runOctober2025() {
  try {
    Logger.log('[OCTOBER 2025] Starting payment process...');
    var result = payUsersForMonth('10-2025');
    Logger.log('[SUCCESS] October 2025 payment process completed successfully!');
    Logger.log('[SUCCESS] Check the logs above for payment details.');
    return result;
  } catch (error) {
    var errorMsg = 'October 2025 failed: ' + error.message;
    Logger.log('[ERROR] ' + errorMsg);
    throw error;
  }
}

function checkCurrentMonthStatus() {
  try {
    var now = new Date();
    var month = (now.getMonth() + 1).toString();
    var monthStr = (month.length === 1 ? '0' : '') + month + '-' + now.getFullYear();
    
    Logger.log('[STATUS] Checking status for current month: %s', monthStr);
    var status = getPaymentStatus(monthStr);
    
    var message = '📊 Payment Status for ' + monthStr + ':\n\n';
    
    if (status.error) {
      message += '❌ Error: ' + status.error;
    } else if (!status.exists) {
      message += '📝 ' + status.message;
    } else {
      message += '💰 Total Required: €' + status.totalRequired.toFixed(2) + '\n';
      message += '✅ Total Paid: €' + status.totalPaid.toFixed(2) + '\n';
      message += '⏳ Pending: €' + status.pending.toFixed(2) + '\n\n';
      message += '👥 Payments:\n';
      
      for (var i = 0; i < status.payments.length; i++) {
        var payment = status.payments[i];
        var emoji = payment.status === 'PAID' ? '✅' : payment.status === 'PENDING' ? '⏳' : '❌';
        message += emoji + ' ' + payment.user + ': €' + payment.required.toFixed(2) + ' (' + payment.status + ')\n';
      }
    }
    
    Logger.log('[STATUS] Payment Status for ' + monthStr + ':');
    Logger.log('[STATUS] ' + message.replace(/\n/g, ' '));
    return status;
  } catch (error) {
    var errorMessage = 'Failed to get payment status: ' + error.message;
    Logger.log('[ERROR] ' + errorMessage);
    throw error;
  }
}

/* ============== SAFE TEST FUNCTIONS ============== */
function testPaymentSystem() {
  try {
    Logger.log('[TEST] Starting payment system test...');
    
    // Test basic functionality without making payments
    var validation = validatePaymentSheet();
    var currentMonth = new Date();
    var monthStr = (currentMonth.getMonth() + 1).toString().padStart(2, '0') + '-' + currentMonth.getFullYear();
    var status = getPaymentStatus(monthStr);
    
    Logger.log('[TEST] Payment System Test Results:');
    Logger.log('[TEST] 📊 Sheet Validation: ' + (validation.isValid ? '✅ PASSED' : '❌ FAILED'));
    Logger.log('[TEST] 📅 Current Month: ' + monthStr);
    Logger.log('[TEST] 💰 Status: ' + (status.exists ? 'Month exists' : 'Month not found'));
    Logger.log('[TEST] ');
    
    if (validation.issues.length > 0) {
      Logger.log('[TEST] ⚠️ Issues Found:');
      validation.issues.forEach(function(issue, index) {
        Logger.log('[TEST] ' + (index + 1) + '. ' + issue);
      });
      Logger.log('[TEST] ');
    }
    
    if (validation.recommendations.length > 0) {
      Logger.log('[TEST] 💡 Recommendations:');
      validation.recommendations.forEach(function(rec, index) {
        Logger.log('[TEST] ' + (index + 1) + '. ' + rec);
      });
    }
    
    Logger.log('[TEST] Payment system test completed successfully');
    return { validation: validation, status: status };
  } catch (error) {
    var errorMsg = 'Test failed: ' + error.message;
    Logger.log('[ERROR] ' + errorMsg);
    throw error;
  }
}

function testJuly2025() {
  try {
    Logger.log('[TEST] Testing July 2025 payment simulation...');
    var simulation = simulatePaymentProcessDetailed('07-2025');
    
    Logger.log('[TEST] July 2025 Test Results:');
    Logger.log('[TEST] 📊 SUMMARY:');
    Logger.log('[TEST] • Total Users: ' + simulation.summary.totalUsers);
    Logger.log('[TEST] • Active Users: ' + simulation.summary.activeUsers);
    Logger.log('[TEST] • Total Required: €' + simulation.summary.totalRequired.toFixed(2));
    Logger.log('[TEST] • Already Paid: €' + simulation.summary.totalPaid.toFixed(2));
    Logger.log('[TEST] • Total Pending: €' + simulation.summary.totalPending.toFixed(2));
    Logger.log('[TEST] ');
    Logger.log('[TEST] 💱 BALANCE CHECK:');
    Logger.log('[TEST] • EUR Available: €' + simulation.balanceCheck.eurAvailable);
    Logger.log('[TEST] • USD Available: €' + simulation.balanceCheck.usdAvailable);
    Logger.log('[TEST] • FX Needed: ' + (simulation.balanceCheck.fxNeeded ? 'YES' : 'NO'));
    Logger.log('[TEST] ');
    Logger.log('[TEST] ⚠️  WEEKEND CHECK:');
    Logger.log('[TEST] • Is Weekend: ' + (simulation.weekendCheck.isWeekend ? 'YES' : 'NO'));
    Logger.log('[TEST] ');
    Logger.log('[TEST] 📋 Simulation only – no Revolut transfers are executed by this test.');
    
    Logger.log('[TEST] July 2025 test completed successfully');
    return simulation;
  } catch (error) {
    var errorMsg = 'July 2025 test failed: ' + error.message;
    Logger.log('[ERROR] ' + errorMsg);
    throw error;
  }
}

function testAugust2025() {
  try {
    Logger.log('[TEST] Testing August 2025 payment simulation...');
    var simulation = simulatePaymentProcessDetailed('08-2025');
    
    Logger.log('[TEST] August 2025 Test Results:');
    Logger.log('[TEST] 📊 SUMMARY:');
    Logger.log('[TEST] • Total Users: ' + simulation.summary.totalUsers);
    Logger.log('[TEST] • Active Users: ' + simulation.summary.activeUsers);
    Logger.log('[TEST] • Total Required: €' + simulation.summary.totalRequired.toFixed(2));
    Logger.log('[TEST] • Already Paid: €' + simulation.summary.totalPaid.toFixed(2));
    Logger.log('[TEST] • Total Pending: €' + simulation.summary.totalPending.toFixed(2));
    Logger.log('[TEST] ');
    Logger.log('[TEST] 💱 BALANCE CHECK:');
    Logger.log('[TEST] • EUR Available: €' + simulation.balanceCheck.eurAvailable);
    Logger.log('[TEST] • USD Available: €' + simulation.balanceCheck.usdAvailable);
    Logger.log('[TEST] • FX Needed: ' + (simulation.balanceCheck.fxNeeded ? 'YES' : 'NO'));
    Logger.log('[TEST] ');
    Logger.log('[TEST] ⚠️  WEEKEND CHECK:');
    Logger.log('[TEST] • Is Weekend: ' + (simulation.weekendCheck.isWeekend ? 'YES' : 'NO'));
    Logger.log('[TEST] ');
    Logger.log('[TEST] 📋 Simulation only – no Revolut transfers are executed by this test.');
    
    Logger.log('[TEST] August 2025 test completed successfully');
    return simulation;
  } catch (error) {
    var errorMsg = 'August 2025 test failed: ' + error.message;
    Logger.log('[ERROR] ' + errorMsg);
    throw error;
  }
}

function testSeptember2025() {
  try {
    Logger.log('[TEST] Testing September 2025 payment simulation...');
    var simulation = simulatePaymentProcessDetailed('09-2025');
    
    Logger.log('[TEST] September 2025 Test Results:');
    Logger.log('[TEST] 📊 SUMMARY:');
    Logger.log('[TEST] • Total Users: ' + simulation.summary.totalUsers);
    Logger.log('[TEST] • Active Users: ' + simulation.summary.activeUsers);
    Logger.log('[TEST] • Total Required: €' + simulation.summary.totalRequired.toFixed(2));
    Logger.log('[TEST] • Already Paid: €' + simulation.summary.totalPaid.toFixed(2));
    Logger.log('[TEST] • Total Pending: €' + simulation.summary.totalPending.toFixed(2));
    Logger.log('[TEST] ');
    Logger.log('[TEST] • EUR Available: €' + simulation.balanceCheck.eurAvailable);
    Logger.log('[TEST] • USD Available: €' + simulation.balanceCheck.usdAvailable);
    Logger.log('[TEST] • FX Needed: ' + (simulation.balanceCheck.fxNeeded ? 'YES' : 'NO'));
    Logger.log('[TEST] ');
    Logger.log('[TEST] ⚠️  WEEKEND CHECK:');
    Logger.log('[TEST] • Is Weekend: ' + (simulation.weekendCheck.isWeekend ? 'YES' : 'NO'));
    Logger.log('[TEST] ');
    Logger.log('[TEST] 📋 Simulation only – no Revolut transfers are executed by this test.');
    
    Logger.log('[TEST] September 2025 test completed successfully');
    return simulation;
  } catch (error) {
    var errorMsg = 'September 2025 test failed: ' + error.message;
    Logger.log('[ERROR] ' + errorMsg);
    throw error;
  }
}

function debugActiveStatus() {
  try {
    Logger.log('[DEBUG] Inspecting active status and amounts...');
    var sh = sheet_();
    var lastCol = sh.getLastColumn();
    
    Logger.log('[DEBUG] Last column: ' + lastCol);
    
    // Get row 28 (actual active status)
    var activeRow28 = sh.getRange(28, 1, 1, lastCol).getValues()[0];
    Logger.log('[DEBUG] Row 28 (Actual Active Status):');
    for (var i = 0; i < activeRow28.length; i++) {
      var value = activeRow28[i];
      var user = sh.getRange(1, i + 1).getValue();
      if (user) {
        Logger.log('[DEBUG] Column ' + (i + 1) + ' (' + user + '): ' + value + ' (type: ' + typeof value + ')');
      }
    }
    
    // Get row 29 (actual amounts)
    var amountRow29 = sh.getRange(29, 1, 1, lastCol).getValues()[0];
    Logger.log('[DEBUG] Row 29 (Actual Amounts):');
    for (var i = 0; i < amountRow29.length; i++) {
      var value = amountRow29[i];
      var user = sh.getRange(1, i + 1).getValue();
      if (user) {
        Logger.log('[DEBUG] Column ' + (i + 1) + ' (' + user + '): ' + value + ' (type: ' + typeof value + ')');
      }
    }
    
    // Test the toBool_ function on row 28 values (active status)
    Logger.log('[DEBUG] Testing toBool_ function on Row 28 (Active Status):');
    activeRow28.forEach(function(value, index) {
      var user = sh.getRange(1, index + 1).getValue();
      if (user) {
        var boolResult = toBool_(value);
        Logger.log('[DEBUG] toBool_(' + value + ') for ' + user + ' = ' + boolResult);
      }
    });
    
    // Test the toBool_ function on row 29 values (amounts)
    Logger.log('[DEBUG] Testing toBool_ function on Row 29 (Amounts):');
    amountRow29.forEach(function(value, index) {
      var user = sh.getRange(1, index + 1).getValue();
      if (user) {
        var boolResult = toBool_(value);
        Logger.log('[DEBUG] toBool_(' + value + ') for ' + user + ' = ' + boolResult);
      }
    });
    
    // Count active users in each row
    var activeCount28 = 0;
    var amountCount29 = 0;
    
    activeRow28.forEach(function(value) {
      if (toBool_(value)) activeCount28++;
    });
    
    amountRow29.forEach(function(value) {
      if (typeof value === 'number' && value > 0) amountCount29++;
    });
    
    Logger.log('[DEBUG] Active count in Row 28: ' + activeCount28);
    Logger.log('[DEBUG] Users with amounts in Row 29: ' + amountCount29);
    
    return { 
      activeRow28: activeRow28, 
      amountRow29: amountRow29,
      activeCount28: activeCount28,
      amountCount29: amountCount29
    };
  } catch (error) {
    Logger.log('[ERROR] Debug failed: ' + error.message);
    throw error;
  }
}

function checkWhichRowHasActiveStatus() {
  try {
    Logger.log('[DEBUG] Checking which row actually contains active status...');
    var sh = sheet_();
    var lastCol = sh.getLastColumn();
    
    // Check rows 25-30 for boolean values
    for (var row = 25; row <= 30; row++) {
      var rowData = sh.getRange(row, 1, 1, lastCol).getValues()[0];
      var booleanCount = 0;
      var totalCount = 0;
      
      rowData.forEach(function(value) {
        if (value !== '' && value !== null) {
          totalCount++;
          if (typeof value === 'boolean' || value === 'TRUE' || value === 'FALSE') {
            booleanCount++;
          }
        }
      });
      
      Logger.log('[DEBUG] Row ' + row + ': ' + booleanCount + '/' + totalCount + ' cells contain boolean-like values');
      
      if (booleanCount > 0) {
        Logger.log('[DEBUG] Row ' + row + ' sample values:');
        for (var i = 0; i < Math.min(5, rowData.length); i++) {
          var value = rowData[i];
          var user = sh.getRange(1, i + 1).getValue();
          if (user && value !== '' && value !== null) {
            Logger.log('[DEBUG]   Column ' + (i + 1) + ' (' + user + '): ' + value + ' (type: ' + typeof value + ')');
          }
        }
      }
    }
    
    return 'Check logs for row analysis';
  } catch (error) {
    Logger.log('[ERROR] Row check failed: ' + error.message);
    throw error;
  }
}

function fixActiveStatusRow() {
  try {
    Logger.log('[FIX] Temporarily switching active status to row 28...');
    
    // This function will temporarily modify the active status check to use row 28
    // WARNING: This is a temporary fix - the proper solution is to move data to row 27
    
    var sh = sheet_();
    var lastCol = sh.getLastColumn();
    
    // Get active status from row 28 (where you say it actually is)
    var activeRow = sh.getRange(28, 1, 1, lastCol).getValues()[0];
    var activeCount = 0;
    var userList = [];
    
    for (var i = 0; i < activeRow.length; i++) {
      var value = activeRow[i];
      var user = sh.getRange(1, i + 1).getValue();
      if (user && toBool_(value)) {
        activeCount++;
        userList.push(user);
      }
    }
    
    Logger.log('[FIX] Found ' + activeCount + ' active users in row 28:');
    userList.forEach(function(user) {
      Logger.log('[FIX] - ' + user);
    });
    
    // Also check amounts in row 29 (assuming that's where amounts are now)
    var amountRow = sh.getRange(29, 1, 1, lastCol).getValues()[0];
    var amountCount = 0;
    var totalAmount = 0;
    
    for (var i = 0; i < amountRow.length; i++) {
      var value = amountRow[i];
      var user = sh.getRange(1, i + 1).getValue();
      if (user && typeof value === 'number' && value > 0) {
        amountCount++;
        totalAmount += value;
        Logger.log('[FIX] ' + user + ': €' + value);
      }
    }
    
    Logger.log('[FIX] Found ' + amountCount + ' users with amounts in row 29, total: €' + totalAmount.toFixed(2));
    
    return {
      activeCount: activeCount,
      activeUsers: userList,
      amountCount: amountCount,
      totalAmount: totalAmount
    };
  } catch (error) {
    Logger.log('[ERROR] Fix failed: ' + error.message);
    throw error;
  }
}

/* ============== Server WhatsApp Integration ============== */
function notifyServerOfPayment_(userName, amount, monthStr) {
  try {
    var PROXY_URL = (props_().getProperty('PROXY_URL') || '').replace(/\/+$/,'');
    var PROXY_TOKEN = props_().getProperty('PROXY_TOKEN');
    
    if (!PROXY_URL || !PROXY_TOKEN) {
      Logger.log('[WHATSAPP] Missing proxy credentials, skipping server notification');
      return { success: false, error: 'Missing proxy credentials' };
    }
    
    var payload = {
      'userName': userName,
      'amount': amount,
      'month': monthStr,
      'type': 'payment_confirmation'
    };
    
    var options = {
      'method': 'post',
      'headers': { 
        'x-proxy-token': PROXY_TOKEN, 
        'Content-Type': 'application/json' 
      },
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };
    
    var response = UrlFetchApp.fetch(PROXY_URL + '/notify-payment', options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    if (responseCode === 200 || responseCode === 201) {
      Logger.log('[WHATSAPP] Server notification sent successfully for %s', userName);
      return { success: true, response: responseText };
    } else {
      Logger.log('[WHATSAPP] Server notification failed for %s: HTTP %s - %s', userName, responseCode, responseText);
      return { success: false, error: 'HTTP ' + responseCode + ': ' + responseText };
    }
    
  } catch (error) {
    Logger.log('[WHATSAPP] Error notifying server for %s: %s', userName, error.message);
    return { success: false, error: error.message };
  }
}

function getUserPhoneNumber_(userName) {
  try {
    var sh = sheet_();
    var lastCol = sh.getLastColumn();
    
    // Find the user column
    for (var c = 2; c <= lastCol; c++) {
      var user = String(sh.getRange(1, c).getValue() || '').trim();
      if (user === userName) {
        // Phone numbers are stored in row 11
        var phoneNumber = sh.getRange(11, c).getValue();
        if (phoneNumber && typeof phoneNumber === 'string') {
          return phoneNumber.trim();
        }
        break;
      }
    }
    
    return null;
  } catch (error) {
    Logger.log('[WHATSAPP] Error getting phone number for %s: %s', userName, error.message);
    return null;
  }
}

function sendPaymentWhatsAppNotification_(userName, amount, monthStr) {
  try {
    // Notify server to handle WhatsApp notification
    var result = notifyServerOfPayment_(userName, amount, monthStr);
    
    if (result.success) {
      Logger.log('[WHATSAPP] Payment notification request sent to server for %s', userName);
    } else {
      Logger.log('[WHATSAPP] Failed to notify server for %s: %s', userName, result.error);
    }
    
    return result;
    
  } catch (error) {
    Logger.log('[WHATSAPP] Error sending payment notification for %s: %s', userName, error.message);
    return { success: false, error: error.message };
  }
}

/* ============== WhatsApp Test Functions ============== */
function testWhatsAppNotification(userName) {
  try {
    Logger.log('[WHATSAPP] Testing WhatsApp notification for user: %s', userName);
    
    // Send test notification request to server
    var payload = {
      'userName': userName,
      'type': 'test_message',
      'message': '🧪 Test Message\n\nHello ' + userName + ',\n\nThis is a test WhatsApp message from the Proxy Banks payment system.\n\nIf you receive this message, the WhatsApp integration is working correctly!\n\nBest regards,\nProxy Banks Team'
    };
    
    var PROXY_URL = (props_().getProperty('PROXY_URL') || '').replace(/\/+$/,'');
    var PROXY_TOKEN = props_().getProperty('PROXY_TOKEN');
    
    if (!PROXY_URL || !PROXY_TOKEN) {
      return 'Missing proxy credentials for server communication';
    }
    
    var options = {
      'method': 'post',
      'headers': { 
        'x-proxy-token': PROXY_TOKEN, 
        'Content-Type': 'application/json' 
      },
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };
    
    var response = UrlFetchApp.fetch(PROXY_URL + '/test-whatsapp', options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    if (responseCode === 200 || responseCode === 201) {
      return 'WhatsApp test request sent to server for ' + userName;
    } else {
      return 'WhatsApp test failed: HTTP ' + responseCode + ' - ' + responseText;
    }
    
  } catch (error) {
    Logger.log('[WHATSAPP] Test failed for %s: %s', userName, error.message);
    return 'WhatsApp test failed: ' + error.message;
  }
}

function testWhatsAppForAllUsers() {
  try {
    Logger.log('[WHATSAPP] Testing WhatsApp notifications for all users');
    
    var sh = sheet_();
    var lastCol = sh.getLastColumn();
    var results = [];
    
    for (var c = 2; c <= lastCol; c++) {
      var userName = String(sh.getRange(1, c).getValue() || '').trim();
      if (!userName) continue;
      
      var active = toBool_(sh.getRange(28, c).getValue());
      if (!active) {
        results.push(userName + ': SKIP (inactive)');
        continue;
      }
      
      var phoneNumber = sh.getRange(11, c).getValue();
      if (!phoneNumber) {
        results.push(userName + ': SKIP (no phone number)');
        continue;
      }
      
      var result = testWhatsAppNotification(userName);
      results.push(userName + ': ' + result);
    }
    
    return results.join('\n');
    
  } catch (error) {
    Logger.log('[WHATSAPP] Bulk test failed: %s', error.message);
    return 'Bulk WhatsApp test failed: ' + error.message;
  }
}

/* ============== WhatsApp Menu Handlers ============== */
function testWhatsAppSingleUser() {
  try {
    var ui = SpreadsheetApp.getUi();
    var response = ui.prompt(
      'Test WhatsApp Notification',
      'Enter the username to test WhatsApp notification:',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (response.getSelectedButton() === ui.Button.OK) {
      var userName = response.getResponseText().trim();
      if (userName) {
        var result = testWhatsAppNotification(userName);
        ui.alert('WhatsApp Test Result', result, ui.ButtonSet.OK);
      } else {
        ui.alert('Error', 'Please enter a valid username.', ui.ButtonSet.OK);
      }
    }
  } catch (error) {
    var ui = SpreadsheetApp.getUi();
    ui.alert('Error', 'WhatsApp test failed: ' + error.message, ui.ButtonSet.OK);
  }
}

function testWhatsAppAllUsers() {
  try {
    var ui = SpreadsheetApp.getUi();
    var response = ui.alert(
      'Test WhatsApp for All Users',
      'This will send test WhatsApp messages to all active users with phone numbers. Continue?',
      ui.ButtonSet.YES_NO
    );
    
    if (response === ui.Button.YES) {
      var result = testWhatsAppForAllUsers();
      ui.alert('WhatsApp Test Results', result, ui.ButtonSet.OK);
    }
  } catch (error) {
    var ui = SpreadsheetApp.getUi();
    ui.alert('Error', 'WhatsApp bulk test failed: ' + error.message, ui.ButtonSet.OK);
  }
}

function sendWhatsAppNotificationsForMonth(monthStr) {
  try {
    Logger.log('[WHATSAPP] Sending WhatsApp notifications for month: %s', monthStr);
    
    var sh = sheet_();
    var monthRow = findExistingMonthRow_(sh, monthStr);
    if (!monthRow) {
      return 'Month not found: ' + monthStr;
    }
    
    var lastCol = sh.getLastColumn();
    var results = [];
    var successCount = 0;
    var errorCount = 0;
    
    for (var c = 2; c <= lastCol; c++) {
      var userName = String(sh.getRange(1, c).getValue() || '').trim();
      if (!userName) continue;
      
      var active = toBool_(sh.getRange(28, c).getValue());
      if (!active) {
        results.push(userName + ': SKIP (inactive)');
        continue;
      }
      
      var amount = sh.getRange(monthRow, c).getValue();
      if (!(typeof amount === 'number' && amount > 0)) {
        results.push(userName + ': SKIP (no payment recorded)');
        continue;
      }
      
      var result = sendPaymentWhatsAppNotification_(userName, amount, monthStr);
      if (result.success) {
        results.push(userName + ': ✅ WhatsApp sent');
        successCount++;
      } else {
        results.push(userName + ': ❌ ' + result.error);
        errorCount++;
      }
    }
    
    var summary = '📱 WhatsApp Notifications for ' + monthStr + ':\n';
    summary += '✅ Success: ' + successCount + '\n';
    summary += '❌ Errors: ' + errorCount + '\n\n';
    summary += 'Details:\n' + results.join('\n');
    
    Logger.log('[WHATSAPP] Summary: %s', summary);
    return summary;
    
  } catch (error) {
    Logger.log('[WHATSAPP] Error sending notifications for month %s: %s', monthStr, error.message);
    return 'Error: ' + error.message;
  }
}

function sendWhatsAppForMonth() {
  try {
    var ui = SpreadsheetApp.getUi();
    var response = ui.prompt(
      'Send WhatsApp Notifications',
      'Enter the month to send WhatsApp notifications (e.g., 08-2025):',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (response.getSelectedButton() === ui.Button.OK) {
      var monthStr = response.getResponseText().trim();
      if (monthStr && /^\d{2}-\d{4}$/.test(monthStr)) {
        var result = sendWhatsAppNotificationsForMonth(monthStr);
        ui.alert('WhatsApp Notifications Result', result, ui.ButtonSet.OK);
      } else {
        ui.alert('Error', 'Please enter a valid month format (MM-YYYY).', ui.ButtonSet.OK);
      }
    }
  } catch (error) {
    var ui = SpreadsheetApp.getUi();
    ui.alert('Error', 'Failed to send WhatsApp notifications: ' + error.message, ui.ButtonSet.OK);
  }
}

function getUsersPhoneNumbers() {
  try {
    var sh = sheet_();
    var lastCol = sh.getLastColumn();
    var users = [];
    
    for (var c = 2; c <= lastCol; c++) {
      var userName = String(sh.getRange(1, c).getValue() || '').trim();
      if (!userName) continue;
      
      var active = toBool_(sh.getRange(28, c).getValue());
      var phoneNumber = sh.getRange(11, c).getValue();
      
      if (active && phoneNumber) {
        users.push({
          userName: userName,
          phoneNumber: String(phoneNumber).trim(),
          column: c
        });
      }
    }
    
    return users;
    
  } catch (error) {
    Logger.log('[ERROR] Failed to get users phone numbers: %s', error.message);
    return [];
  }
}

