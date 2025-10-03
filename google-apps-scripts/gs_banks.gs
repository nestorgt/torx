/************ Project Torx → Payouts: actualización de saldos ************/
/* 
 * Funcionalidades:
 * 1. Balance updates: Actualiza saldos de todos los bancos (2x día)
 *    - Mercury: USD (D2), EUR (D3)
 *    - Airwallex: USD (C2), EUR (C3) 
 *    - Revolut: USD (E2), EUR (E3)
 *    - Wise: USD (F2), EUR (F3)
 *    - Nexo: USD (G2) - solo USD
 * 
 * 2. Monthly expenses: Captura gastos de tarjetas y transferencias mensuales (1x mes)
 *    - Mercury: Gastos de tarjetas y transferencias
 *    - Airwallex: Gastos de tarjetas y transferencias  
 *    - Revolut: Gastos de tarjetas + transferencias a Nestor (revtag)
 *    - Se escribe en Project Torx tab, columna H, fila 8+ para 07-2025+
 * 
 * 3. Health monitoring: Verificación robusta del proxy con reintentos
 *    - 3 intentos con timeout de 10 segundos
 *    - Retry automático cada 2 segundos entre intentos
 *    - Logging detallado de estado del proxy
 * 
 * 4. Código refactorizado: Funciones helper para eliminar duplicación
 *    - buildMonthlyExpensesNotes_(): Construcción de notas
 *    - formatMonthlyExpensesNote_(): Formateo de notas
 *    - updateBankBalance_(): Actualización consistente de saldos
 * 
 * NOTA: Jeeves fue removido del sistema (ya no se usa)
 */

/* ============== Config hoja ============== */
var SHEET_NAME = 'Payouts';
var TS_CELL = 'A1';

/* ============== Mapeo de celdas ============== */
var CELLS = {
  Airwallex:{ USD: 'C2', EUR: 'C3' },
  Mercury:  { USD: 'D2', EUR: 'D3' },
  Revolut:  { USD: 'E2', EUR: 'E3' },
  Wise:     { USD: 'F2', EUR: 'F3' },
  Nexo:     { USD: 'G2' } // USD-only
};

/* ============== Utilidades base ============== */
function setCellKeepFmt_(sh, a1, value, note) {
  Logger.log('[setCellKeepFmt_] NEW FUNCTION CALLED with: a1=%s, value=%s, note="%s"', a1, value, note);
  
  try {
    var rng = sh.getRange(a1);
    var fmt = rng.getNumberFormat();
    
    Logger.log('[setCellKeepFmt_] Setting %s: value=%s, note="%s"', a1, value, note);
    
    // Set value
    rng.setValue(value);
    Logger.log('[setCellKeepFmt_] Value set successfully');
    
    // Set note if provided
    if (note && note !== '') {
      Logger.log('[setCellKeepFmt_] Setting note: "%s"', note);
      rng.setNote(note);
      
      // Verify immediately
      var verifyNote = rng.getNote();
      Logger.log('[setCellKeepFmt_] Immediate verification: "%s"', verifyNote);
    } else {
      Logger.log('[setCellKeepFmt_] No note to set');
    }
    
    // Re-apply format
    if (fmt) {
      Logger.log('[setCellKeepFmt_] Re-applying format: %s', fmt);
      rng.setNumberFormat(fmt);
    }
    
    Logger.log('[setCellKeepFmt_] NEW FUNCTION COMPLETED SUCCESSFULLY');
  } catch (error) {
    Logger.log('[setCellKeepFmt_] ERROR: %s', error.message);
    throw error;
  }
}
function dbg_() {
  if ((props_().getProperty('AIRWALLEX_DEBUG') || '').toLowerCase() === 'true') {
    // eslint-disable-next-line prefer-rest-params
    Logger.log.apply(Logger, arguments);
  }
}
function setNoteOnly_(sh, a1, note) {
  sh.getRange(a1).setNote(String(note || ''));
}
function clearNote_(sh, a1) {
  try {
    sh.getRange(a1).setNote('');
  } catch (e) {
    Logger.log('[WARN] clearNote_ %s failed: %s', a1, e.message);
  }
}

function safeErrorNote_(msg) {
  var raw = String(msg || '');
  var low = raw.toLowerCase();
  if (low.indexOf('<!doctype') >= 0 || low.indexOf('<html') >= 0 || low.indexOf('cloudflare') >= 0 || low.indexOf('bad gateway') >= 0 || low.indexOf(' 502') >= 0) {
    return 'SERVER DOWN (proxy)';
  }
  var trimmed = raw.replace(/\s+/g, ' ').slice(0, 180);
  return 'ERROR: ' + trimmed;
}
function payoutsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('No existe la pestaña: ' + SHEET_NAME);
  return sh;
}
function props_(){ return PropertiesService.getScriptProperties(); }

function fmt2dec_(sh, a1) { sh.getRange(a1).setNumberFormat('#,##0.00'); }
function nowStamp_() {
  var tz = 'Europe/Andorra';
  return Utilities.formatDate(new Date(), tz, 'dd-MM HH:mm');
}

function mmYYYY_(month, year) {
  var mm = ('0' + Number(month)).slice(-2);
  return mm + '-' + String(year);
}

/* ============== Helper Functions for Monthly Expenses ============== */
function buildMonthlyExpensesNotes_(me, ae, re, totalToNestor) {
  var noteDetails = [];
  
  // 1. Airwallex
  if (ae && ae.cardExpenses !== undefined) {
    noteDetails.push('Airwallex: Cards $' + (ae.cardExpenses || 0).toFixed(2));
  } else {
    noteDetails.push('Airwallex: ERROR - ' + (e && e.message || 'Unknown error'));
  }

  // 2. Mercury
  if (me && me.cardExpenses !== undefined) {
    noteDetails.push('Mercury: Cards $' + (me.cardExpenses || 0).toFixed(2));
  } else {
    noteDetails.push('Mercury: ERROR - ' + (e && e.message || 'Unknown error'));
  }  
  
  // 3. Revolut
  if (re && re.cardExpenses !== undefined) {
    noteDetails.push('Revolut: Cards $' + (re.cardExpenses || 0).toFixed(2));
    
    // Add Revolut-to-Nestor transfers as bullet line (now counted in total)
    if (totalToNestor > 0) {
      noteDetails.push('revtag: $' + totalToNestor.toFixed(2));
    }
  } else {
    noteDetails.push('Revolut: ERROR - ' + (e && e.message || 'Unknown error'));
  }
  
  return noteDetails;
}

function formatMonthlyExpensesNote_(noteDetails) {
  var formattedNote = '';
  noteDetails.forEach(function(detail) {
    if (detail.includes('Mercury:') || detail.includes('Airwallex:') || detail.includes('Revolut:')) {
      // Bank header - no bullet
      formattedNote += detail + '\n';
    } else {
      // Error messages get bullet
      formattedNote += '- ' + detail + '\n';
    }
  });
  return formattedNote;
}

function updateBankBalance_(sh, bankName, summary, note) {
  try {
    setCellKeepFmt_(sh, CELLS[bankName].USD, Number(summary.USD||0), note);
    if (CELLS[bankName].EUR) {
      setCellKeepFmt_(sh, CELLS[bankName].EUR, Number(summary.EUR||0), note);
    }
    // Clear any old error notes on success
    clearNote_(sh, CELLS[bankName].USD);
    if (CELLS[bankName].EUR) {
      clearNote_(sh, CELLS[bankName].EUR);
    }
    return true;
  } catch(e) {
    Logger.log('[ERROR] %s summary: %s', bankName, e.message);
    var errorNote = safeErrorNote_(e && e.message);
    setNoteOnly_(sh, CELLS[bankName].USD, errorNote);
    if (CELLS[bankName].EUR) {
      setNoteOnly_(sh, CELLS[bankName].EUR, errorNote);
    }
    return false;
  }
}

/* ============== Proxy health check ============== */
function proxyIsUp_() {
  try {
    var PROXY_URL = (props_().getProperty('PROXY_URL') || '').replace(/\/+$/,'');
    if (!PROXY_URL) return false;
    
    // Try multiple times with different timeouts
    for (var attempt = 1; attempt <= 3; attempt++) {
      try {
        var r = UrlFetchApp.fetch(PROXY_URL + '/healthz', {
          method: 'get',
          muteHttpExceptions: true,
          validateHttpsCertificates: true,
          timeout: 10000 // 10 second timeout
        });
        var code = r.getResponseCode();
        var txt = String(r.getContentText() || '').trim().toLowerCase();
        
        if (code === 200 && (txt === 'ok' || txt.indexOf('ok') === 0)) {
          Logger.log('[HEALTH] Proxy is up (attempt %s)', attempt);
          return true;
        }
        
        Logger.log('[HEALTH] Proxy returned code %s, text: %s (attempt %s)', code, txt, attempt);
      } catch (e) {
        Logger.log('[HEALTH] Proxy check failed (attempt %s): %s', attempt, e.message);
        if (attempt < 3) {
          Utilities.sleep(2000); // Wait 2 seconds before retry
        }
      }
    }
    
    Logger.log('[HEALTH] Proxy is down after 3 attempts');
    return false;
  } catch (e) {
    Logger.log('[HEALTH] Proxy health check error: %s', e.message);
    return false;
  }
}

function checkProxyHealth_() {
  var isUp = proxyIsUp_();
  var sh = payoutsSheet_();
  var note = isUp ? 'PROXY UP ' + nowStamp_() : 'PROXY DOWN ' + nowStamp_();
  setNoteOnly_(sh, TS_CELL, note);
  return isUp;
}

/* ============== Proxy genérico ============== */
/* Script Properties obligatorias:
    - PROXY_URL     (ej: https://proxy.tu-dominio.com)
    - PROXY_TOKEN   (mismo que en .env del proxy)
*/
function httpProxyJson_(path) {
  var PROXY_URL = (props_().getProperty('PROXY_URL') || '').replace(/\/+$/,'');
  var PROXY_TOKEN = props_().getProperty('PROXY_TOKEN');
  if (!PROXY_URL) throw new Error('Falta Script Property: PROXY_URL');
  if (!PROXY_TOKEN) throw new Error('Falta Script Property: PROXY_TOKEN');

  var url = PROXY_URL + path;
  var opts = {
    method: 'get',
    headers: { 'x-proxy-token': PROXY_TOKEN, 'Accept': 'application/json' },
    muteHttpExceptions: true,
    validateHttpsCertificates: true
  };
  for (var i = 0; i < 3; i++) {
    try {
      var r = UrlFetchApp.fetch(url, opts);
      var code = r.getResponseCode();
      var text = r.getContentText();
      Logger.log('[HTTP] %s -> %s, bodyLen=%s, head=%s', path, code, (text||'').length, (text||'').substring(0, 300));
      if (code >= 500) {
        if (i < 2) { Utilities.sleep(300 * (i + 1)); continue; }
        throw new Error('HTTP ' + code + ' ' + path + ' -> ' + text);
      }
      if (code >= 400) throw new Error('HTTP ' + code + ' ' + path + ' -> ' + text);
      try { return JSON.parse(text); } catch (e) { throw new Error('HTTP parse error ' + path + ' -> ' + (text||'').substring(0, 200)); }
    } catch (err) {
      if (i === 2) throw err;
      Utilities.sleep(300 * (i + 1));
    }
  }
}

/* ============== Summaries por banco (1 request) ============== */
function fetchRevolutSummary_() { return httpProxyJson_('/revolut/summary'); }   // { USD, EUR, count } (solo "Main")
function fetchMercurySummary_() { return httpProxyJson_('/mercury/summary'); }   // { USD, EUR, count }
function fetchWiseSummary_()    { return httpProxyJson_('/wise/summary'); }      // { USD, EUR, count }
function fetchNexoSummary_()    { return httpProxyJson_('/nexo/summary'); }      // { USD, EUR, count }

/* ============== Monthly Expenses por banco ============== */
function fetchMercuryExpenses_(month, year) { 
  return httpProxyJson_('/mercury/transactions?month=' + month + '&year=' + year); 
}
function fetchAirwallexExpenses_(month, year) { 
  // Airwallex: use direct integration (proxy may be blocked or misreport)
  Logger.log('[AIRWALLEX] FORCING direct integration for %s-%s', month, year);
  var result = fetchAirwallexExpensesDirect_(month, year);
  Logger.log('[AIRWALLEX] Direct integration returned: Cards $%s', result.cardExpenses || 0);
  return result;
}

function fetchRevolutExpenses_(month, year) { 
  return httpProxyJson_('/revolut/transactions?month=' + month + '&year=' + year); 
}

function fetchAirwallexExpensesDirect_(month, year) {
  var base = props_().getProperty('AIRWALLEX_BASE') || 'https://api.airwallex.com';
  var token = airwallexToken_();
  var startDate = new Date(Number(year), Number(month) - 1, 1);
  var endDate = new Date(Number(year), Number(month), 0);
  endDate.setHours(23, 59, 59, 999); // End of day

  Logger.log('[AIRWALLEX-DIRECT] Fetching financial transactions for %s-%s (%s to %s)', month, year, startDate.toISOString(), endDate.toISOString());

  var totalCardExpenses = 0;
  var totalTransfersOut = 0;
  var totalTransfersIn = 0;
  var cardDetails = [];
  var transferDetails = [];
  var processedTransactionIds = new Set(); // Track processed transaction IDs to avoid duplicates

  try {
    var page = 1;
    var pageSize = 100;
    var maxPages = 20;
    var totalFetched = 0;
    var augustCardTransactions = 0;
    var augustTotalTransactions = 0;
    
    while (page <= maxPages) {
      var url = base + '/api/v1/financial_transactions?page=' + page + '&page_size=' + pageSize;
      Logger.log('[AIRWALLEX-DIRECT] Fetching: %s', url);
      
      var response = UrlFetchApp.fetch(url, {
        method: 'get', headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
        muteHttpExceptions: true, validateHttpsCertificates: true
      });
      
      var code = response.getResponseCode();
      var text = response.getContentText();
      
      if (code !== 200) {
        Logger.log('[AIRWALLEX-DIRECT] Error fetching transactions (page %s): %s - %s', page, code, text.substring(0, 200));
        break;
      }
      
      var data = {};
      try { data = JSON.parse(text) || {}; } catch (e) { Logger.log('[AIRWALLEX-DIRECT] Parse error page %s: %s', page, e.message); break; }
      var transactions = Array.isArray(data.items) ? data.items : [];
      totalFetched += transactions.length;
      Logger.log('[AIRWALLEX-DIRECT] Page %s fetched %s transactions (total so far %s)', page, transactions.length, totalFetched);
      
      for (var i = 0; i < transactions.length; i++) {
        var tx = transactions[i];
        
        // Skip if we've already processed this transaction ID
        if (processedTransactionIds.has(tx.id)) {
          Logger.log('[AIRWALLEX-DIRECT] Skipping duplicate transaction: %s', tx.id);
          continue;
        }
        processedTransactionIds.add(tx.id);
        
        var settledDate = null;
        if (tx.settled_at) {
          try { settledDate = new Date(tx.settled_at); } catch(e) { Logger.log('[AIRWALLEX-DIRECT] Date parse error %s: %s', tx.settled_at, e.message); continue; }
        } else if (tx.created_at) {
          try { settledDate = new Date(tx.created_at); } catch(e) { Logger.log('[AIRWALLEX-DIRECT] Created date parse error %s: %s', tx.created_at, e.message); continue; }
        }
        if (!settledDate) continue;
        
        // Check if transaction is in August 2025
        var isAugust2025 = settledDate.getFullYear() === Number(year) && settledDate.getMonth() === Number(month) - 1;
        if (!isAugust2025) continue;
        
        augustTotalTransactions++;
        
        var amount = Number(tx.amount || 0);
        var isCard = tx.source_type === 'CARD_PURCHASE';
        var isTransfer = tx.source_type === 'TRANSFER' || tx.source_type === 'INTERNAL_TRANSFER' || tx.source_type === 'EXTERNAL_TRANSFER';
        
        Logger.log('[AIRWALLEX-DIRECT] Processing August 2025: %s, amount=%s, source_type=%s, status=%s, settled=%s', 
                  tx.id, amount, tx.source_type, tx.status, tx.settled_at || tx.created_at);
        
        if (isCard && tx.status === 'SETTLED' && amount < 0) {
          var cardAmount = Math.abs(amount);
          totalCardExpenses += cardAmount;
          augustCardTransactions++;
          cardDetails.push({ 
            card: 'Airwallex Card', 
            amount: cardAmount, 
            description: tx.description || 'Card Purchase', 
            date: tx.settled_at || tx.created_at,
            transaction_type: tx.transaction_type,
            id: tx.id
          });
          Logger.log('[AIRWALLEX-DIRECT] Added card transaction: $%s - %s', cardAmount, tx.description || 'Card Purchase');
        } else if (isTransfer && tx.status === 'SETTLED') {
          if (amount < 0) {
            totalTransfersOut += Math.abs(amount);
            transferDetails.push({ type: 'out', amount: Math.abs(amount), description: tx.description || 'Transfer out', date: tx.settled_at || tx.created_at });
          } else {
            totalTransfersIn += amount;
            transferDetails.push({ type: 'in', amount: amount, description: tx.description || 'Transfer in', date: tx.settled_at || tx.created_at });
          }
        }
      }
      
      if (transactions.length < pageSize) break;
      page++;
    }

    Logger.log('[AIRWALLEX-DIRECT] SUMMARY: August 2025 transactions processed: %s total, %s card transactions', augustTotalTransactions, augustCardTransactions);
    Logger.log('[AIRWALLEX-DIRECT] Card details count: %s', cardDetails.length);

    var result = {
      month: Number(month), year: Number(year),
      cardExpenses: Math.round(totalCardExpenses * 100) / 100,
      transfersOut: Math.round(totalTransfersOut * 100) / 100,
      transfersIn: Math.round(totalTransfersIn * 100) / 100,
      cardDetails: cardDetails, transferDetails: transferDetails
    };
    
    Logger.log('[AIRWALLEX-DIRECT] Result: Cards $%s, Transfers out $%s, Transfers in $%s', 
              result.cardExpenses, result.transfersOut, result.transfersIn);
    return result;
    
  } catch(e) {
    Logger.log('[ERROR] Airwallex direct integration failed: %s', e.message);
    return { 
      month: Number(month), year: Number(year), 
      cardExpenses: 0, transfersOut: 0, transfersIn: 0, 
      cardDetails: [], transferDetails: [], 
      error: 'Integration failed: ' + e.message 
    };
  }
}

// Test function to verify Airwallex credentials and permissions
function testAirwallexCredentials_() {
  try {
    var base = props_().getProperty('AIRWALLEX_BASE') || 'https://api.airwallex.com';
    var token = airwallexToken_();
    
    Logger.log('[TEST] Airwallex token obtained successfully: %s...', token.substring(0, 20));
    
    // Test multiple endpoints to see what we have access to
    var testEndpoints = [
      '/api/v1/accounts',
      '/api/v1/balances/current',
      '/api/v1/cards',
      '/api/v1/transactions',
      '/api/v1/authentication/status'
    ];
    
    for (var i = 0; i < testEndpoints.length; i++) {
      try {
        var endpoint = testEndpoints[i];
        Logger.log('[TEST] Testing endpoint: %s', endpoint);
        
        var testResponse = UrlFetchApp.fetch(base + endpoint, {
          method: 'get',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/json'
          },
          muteHttpExceptions: true,
          validateHttpsCertificates: true
        });
        
        var code = testResponse.getResponseCode();
        var text = testResponse.getContentText();
        
        Logger.log('[TEST] %s response: %s, body length: %s', endpoint, code, text.length);
        
        if (code === 200) {
          try {
            var data = JSON.parse(text);
            Logger.log('[TEST] %s data keys: %s', endpoint, Object.keys(data || {}));
            
            if (endpoint === '/api/v1/accounts') {
              Logger.log('[TEST] Accounts found: %s, total_count: %s', 
                        data.items ? data.items.length : 'N/A', 
                        data.total_count || 'N/A');
            } else if (endpoint === '/api/v1/cards') {
              Logger.log('[TEST] Cards found: %s', data.items ? data.items.length : 'N/A');
            } else if (endpoint === '/api/v1/transactions') {
              Logger.log('[TEST] Transactions found: %s', data.items ? data.items.length : 'N/A');
            }
          } catch(parseError) {
            Logger.log('[TEST] %s parse error: %s', endpoint, parseError.message);
          }
        } else if (code === 401) {
          Logger.log('[TEST] %s: Unauthorized - token lacks permissions', endpoint);
        } else if (code === 403) {
          Logger.log('[TEST] %s: Forbidden - access denied', endpoint);
        } else {
          Logger.log('[TEST] %s: Error %s - %s', endpoint, code, text.substring(0, 200));
        }
      } catch(e) {
        Logger.log('[TEST] Error testing %s: %s', testEndpoints[i], e.message);
      }
    }
    
    return true;
  } catch(e) {
    Logger.log('[TEST] Airwallex test failed: %s', e.message);
    return false;
  }
}

function getJsonProp_(key) {
  var v = props_().getProperty(key);
  if (!v) return null;
  try { return JSON.parse(v); } catch(e){ return null; }
}
function setJsonProp_(key, obj) {
  try { props_().setProperty(key, JSON.stringify(obj || {})); } catch(e){}
}

function airwallexToken_() {
  var cid  = props_().getProperty('AIRWALLEX_CLIENT_ID');
  var sec  = props_().getProperty('AIRWALLEX_CLIENT_SECRET'); // o API Key
  var base = props_().getProperty('AIRWALLEX_BASE') || 'https://api.airwallex.com';
  if (!cid || !sec) throw new Error('Falta AIRWALLEX_CLIENT_ID o AIRWALLEX_CLIENT_SECRET');

  var preferred = (props_().getProperty('AIRWALLEX_AUTH_MODE') || '').toLowerCase(); // 'headers'|'secret'|'apikey'|''
  var common = {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    validateHttpsCertificates: true,
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari'
    }
  };

  function trySecret() {
    var r = UrlFetchApp.fetch(base + '/api/v1/authentication/login', {
      ...common,
      payload: JSON.stringify({ client_id: cid, client_secret: sec })
    });
    var c = r.getResponseCode(), t = r.getContentText();
    dbg_('[HTTP] Airwallex token (secret body) -> %s, bodyLen=%s', c, (t||'').length);
    if (c === 201) {
      var j = JSON.parse(t); if (!j.token) throw new Error('Airwallex token ausente (secret)');
      props_().setProperty('AIRWALLEX_AUTH_MODE', 'secret');
      return j.token;
    }
    throw new Error('secret:' + c + ':' + t);
  }

  function tryApiKeyBody() {
    var r = UrlFetchApp.fetch(base + '/api/v1/authentication/login', {
      ...common,
      payload: JSON.stringify({ client_id: cid, apiKey: sec })
    });
    var c = r.getResponseCode(), t = r.getContentText();
    dbg_('[HTTP] Airwallex token (apiKey body) -> %s, bodyLen=%s', c, (t||'').length);
    if (c === 201) {
      var j = JSON.parse(t); if (!j.token) throw new Error('Airwallex token ausente (apiKey)');
      props_().setProperty('AIRWALLEX_AUTH_MODE', 'apikey');
      return j.token;
    }
    throw new Error('apikey:' + c + ':' + t);
  }

  function tryHeaders() {
    var r = UrlFetchApp.fetch(base + '/api/v1/authentication/login', {
      ...common,
      payload: JSON.stringify({ client_id: cid }), // cuerpo mínimo
      headers: {
        ...common.headers,
        'x-client-id': cid,
        'x-api-key':  sec
      }
    });
    var c = r.getResponseCode(), t = r.getContentText();
    dbg_('[HTTP] Airwallex token (x-client-id/x-api-key) -> %s, bodyLen=%s', c, (t||'').length);
    if (c === 201) {
      var j = JSON.parse(t); if (!j.token) throw new Error('Airwallex token ausente (headers)');
      props_().setProperty('AIRWALLEX_AUTH_MODE', 'headers');
      return j.token;
    }
    throw new Error('headers:' + c + ':' + t);
  }

  var orders = {
    'headers': [tryHeaders, trySecret, tryApiKeyBody],
    'secret' : [trySecret, tryApiKeyBody, tryHeaders],
    'apikey' : [tryApiKeyBody, trySecret, tryHeaders],
    ''       : [trySecret, tryApiKeyBody, tryHeaders]
  }[preferred] || [trySecret, tryApiKeyBody, tryHeaders];

  var errors = [];
  for (var i=0; i<orders.length; i++) {
    try { return orders[i](); } catch(e) { errors.push(String(e && e.message || e)); }
  }
  throw new Error('Airwallex token fallo en todos los modos: ' + errors.join(' | '));
}

function fetchAirwallexSummary_() {
  var base  = props_().getProperty('AIRWALLEX_BASE') || 'https://api.airwallex.com';
  var cacheKey = 'AIRWALLEX_CACHE_JSON';

  try {
    var token = airwallexToken_();
    var r = UrlFetchApp.fetch(base + '/api/v1/balances/current', {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari'
      },
      muteHttpExceptions: true,
      validateHttpsCertificates: true
    });
    var code = r.getResponseCode(), text = r.getContentText();
    dbg_('[HTTP] Airwallex /balances/current -> %s, bodyLen=%s', code, (text||'').length);
    if (code !== 200) throw new Error('Airwallex balances/current ' + code + ': ' + text);

    var arr = JSON.parse(text) || [];
    function sum(ccy){
      var W = String(ccy).toUpperCase(), total = 0;
      (arr || []).forEach(function(it){
        if (String(it.currency||'').toUpperCase() === W) {
          var v = (typeof it.available_amount === 'number') ? it.available_amount
                : (typeof it.total_amount     === 'number') ? it.total_amount     : 0;
          total += Number(v || 0);
        }
      });
      return total;
    }
    var resp = { USD: sum('USD'), EUR: sum('EUR'), count: arr.length };

    // log ÚNICO estilo summary
    var head = JSON.stringify(resp);
    Logger.log('[HTTP] /airwallex/summary -> %s, bodyLen=%s, head=%s', '200.0', head.length, head);

    // cachea último bueno (sin campos extra)
    setJsonProp_('AIRWALLEX_CACHE_JSON', { ...resp, asOf: new Date().toISOString() });

    return resp;

  } catch(e) {
    Logger.log('[ERROR] Airwallex summary failed: %s', e.message);
    // Don't use stale cache when API fails - return zero balances instead
    Logger.log('[AIRWALLEX] Returning zero balances due to API error');
    return { USD: 0, EUR: 0, count: 0, error: true, errorMessage: e.message };
  }
}

/* ============== Orquestación y escritura ============== */
function TRIGGER_updateAllBalances() {
  Logger.log('--- INICIO updateAllBalances ---');
  var sh = payoutsSheet_();
  var ok = true;

  // Early exit if proxy is down
  if (!proxyIsUp_()) {
    setNoteOnly_(sh, TS_CELL, 'SERVER DOWN (proxy) ' + nowStamp_());
    Logger.log('[ERROR] Proxy health check failed. Aborting updateAllBalances.');
    return;
  }

  // ===== MERCURY =====
  try {
    var ms = fetchMercurySummary_();
    if (!updateBankBalance_(sh, 'Mercury', ms, null)) {
      ok = false;
    }
  } catch(e) {
    ok = false;
    Logger.log('[ERROR] Mercury summary: %s', e.message);
    var note = safeErrorNote_(e && e.message);
    setNoteOnly_(sh, CELLS.Mercury.USD, note);
    setNoteOnly_(sh, CELLS.Mercury.EUR, note);
  }

  // ===== AIRWALLEX =====
  try {
    var as = fetchAirwallexSummary_(); // {USD, EUR, count, error?, errorMessage?}
    if (as.error === true) {
      // API failed - show error note instead of stale cache
      ok = false;
      var errorNote = 'AIRWALLEX API ERROR: ' + (as.errorMessage || 'Unknown error');
      setNoteOnly_(sh, CELLS.Airwallex.USD, errorNote);
      setNoteOnly_(sh, CELLS.Airwallex.EUR, errorNote);
      Logger.log('[ERROR] Airwallex API error: %s', as.errorMessage);
    } else {
      // API succeeded - update balances normally
      if (!updateBankBalance_(sh, 'Airwallex', as, null)) {
        ok = false;
      }
    }
  } catch(e) {
    ok = false;
    Logger.log('[ERROR] Airwallex summary: %s', e.message);
    var noteA = safeErrorNote_(e && e.message);
    setNoteOnly_(sh, CELLS.Airwallex.USD, noteA);
    setNoteOnly_(sh, CELLS.Airwallex.EUR, noteA);
  }

  // ===== REVOLUT (solo "Main") =====
  try {
    var rs = fetchRevolutSummary_();
    if (!updateBankBalance_(sh, 'Revolut', rs, null)) {
      ok = false;
    }
  } catch(e) {
    ok = false;
    Logger.log('[ERROR] Revolut summary: %s', e.message);
    var noteR = safeErrorNote_(e && e.message);
    setNoteOnly_(sh, CELLS.Revolut.USD, noteR);
    setNoteOnly_(sh, CELLS.Revolut.EUR, noteR);
  }

  // ===== WISE =====
  try {
    var ws = fetchWiseSummary_();
    if (!updateBankBalance_(sh, 'Wise', ws, null)) {
      ok = false;
    }
  } catch(e) {
    ok = false;
    Logger.log('[ERROR] Wise summary: %s', e.message);
    var noteW = safeErrorNote_(e && e.message);
    setNoteOnly_(sh, CELLS.Wise.USD, noteW);
    setNoteOnly_(sh, CELLS.Wise.EUR, noteW);
  }

  // ===== NEXO (summary homogéneo, USD, EUR=0) =====
  try {
    var nx = fetchNexoSummary_();
    if (!updateBankBalance_(sh, 'Nexo', nx, null)) {
      ok = false;
    }
  } catch(e) {
    ok = false;
    Logger.log('[ERROR] Nexo summary: %s', e.message);
    var noteN = safeErrorNote_(e && e.message);
    setNoteOnly_(sh, CELLS.Nexo.USD, noteN);
  }


  // Timestamp al final
  var ts = nowStamp_();
  sh.getRange(TS_CELL).setValue(ts).setNumberFormat('@STRING@');
  Logger.log('[WRITE] Timestamp %s -> %s', ts, TS_CELL);

  Logger.log('--- FIN updateAllBalances ---');
  // On full success, clear any status note on timestamp cell
  if (ok) {
    clearNote_(sh, TS_CELL);
  }
}

/* ============== Monthly Expenses Update ============== */
function updateMonthlyExpenses(month, year) {
  // Validate parameters
  if (!month || !year) {
    Logger.log('[ERROR] updateMonthlyExpenses: month and year are required');
    throw new Error('Month and year parameters are required');
  }
  if (month < 1 || month > 12) {
    Logger.log('[ERROR] updateMonthlyExpenses: month must be 1-12, got: %s', month);
    throw new Error('Month must be between 1 and 12');
  }
  if (year < 2025) {
    Logger.log('[ERROR] updateMonthlyExpenses: year must be >= 2025, got: %s', year);
    throw new Error('Year must be 2025 or later');
  }
  
  Logger.log('--- INICIO updateMonthlyExpenses %s ---', mmYYYY_(month, year));
  
  var sh = payoutsSheet_();
  // Early exit if proxy is down
  if (!proxyIsUp_()) {
    setNoteOnly_(sh, TS_CELL, 'SERVER DOWN (proxy) ' + nowStamp_() + ' — cannot update ' + month + '-' + year);
    Logger.log('[ERROR] Proxy health check failed. Aborting updateMonthlyExpenses.');
    return;
  }
  // Calculate target row: H8 for July 2025, H9 for August 2025, etc.
  var targetRow = 8 + (year - 2025) * 12 + (month - 7);
  
  // Validate target row is reasonable
  if (targetRow < 8 || targetRow > 200) {
    Logger.log('[ERROR] updateMonthlyExpenses: calculated target row %s is out of range', targetRow);
    throw new Error('Calculated target row ' + targetRow + ' is out of valid range');
  }
  
  var targetCell = 'H' + targetRow;
  
  var totalCardExpenses = 0;
  var noteDetails = [];
  var me = null, ae = null, re = null; // Store results for ordered display
  
  // ===== MERCURY =====
  try {
    me = fetchMercuryExpenses_(month, year);
    totalCardExpenses += Number(me.cardExpenses || 0);
    Logger.log('[MERCURY] Month %s: Cards $%s', mmYYYY_(month, year), me.cardExpenses);
  } catch(e) {
    Logger.log('[ERROR] Mercury expenses %s: %s', mmYYYY_(month, year), e.message);
  }
  
  // ===== AIRWALLEX =====
  try {
    ae = fetchAirwallexExpenses_(month, year);
    totalCardExpenses += Number(ae.cardExpenses || 0);
    Logger.log('[AIRWALLEX] Month %s: Cards $%s', mmYYYY_(month, year), ae.cardExpenses);
  } catch(e) {
    Logger.log('[ERROR] Airwallex expenses %s: %s', mmYYYY_(month, year), e.message);
  }
  
  // ===== REVOLUT =====
  try {
    re = fetchRevolutExpenses_(month, year);
    totalCardExpenses += Number(re.cardExpenses || 0);
    Logger.log('[REVOLUT] Month %s: Cards $%s', mmYYYY_(month, year), re.cardExpenses);
  } catch(e) {
    Logger.log('[ERROR] Revolut expenses %s: %s', mmYYYY_(month, year), e.message);
  }
  
  
  // ===== REVOLUT-TO-NESTOR TRANSFERS (revtag) =====
  var revolutToNestor = getRevolutToNestorTransfers_(month, year);
  var totalToNestor = 0;
  if (revolutToNestor && revolutToNestor.length > 0) {
    totalToNestor = revolutToNestor.reduce(function(sum, tx) { return sum + tx.amount; }, 0);
    totalCardExpenses += totalToNestor;
    Logger.log('[REVOLUT-TO-NESTOR] Month %s-%s: Transfers $%s (%s transactions)', month, year, totalToNestor.toFixed(2), revolutToNestor.length);
  }
  
  // ===== BUILD NOTES USING HELPER FUNCTION =====
  var noteDetails = buildMonthlyExpensesNotes_(me, ae, re, totalToNestor);
  
  // Write total card expenses to sheet
  var finalNote = noteDetails.join('\n');
  Logger.log('[NOTE] Final note for %s: "%s"', mmYYYY_(month, year), finalNote);
  
  // Format the note with proper line breaks
  var formattedNote = formatMonthlyExpensesNote_(noteDetails);
  
  Logger.log('[NOTE] Formatted note: "%s"', formattedNote);
  
  // Set value and note directly
  var targetRange = sh.getRange(targetCell);
  targetRange.setValue(Number(totalCardExpenses));
  targetRange.setNote(formattedNote);
  
  // Verify the note was added
  var addedNote = sh.getRange(targetCell).getNote();
  Logger.log('[VERIFY] Note added to %s: "%s"', targetCell, addedNote);
  
  Logger.log('[WRITE] Monthly expenses %s: $%s -> %s', mmYYYY_(month, year), totalCardExpenses.toFixed(2), targetCell);
  
  Logger.log('--- FIN updateMonthlyExpenses %s ---', mmYYYY_(month, year));
}


/* ============== Revolut to Nestor Transfers ============== */
function getRevolutToNestorTransfers_(month, year) {
  try {
    // Fetch Revolut transactions for the month
    var re = fetchRevolutExpenses_(month, year);
    var transfersToNestor = [];
    
    // Check USD transfer details
    if (re && re.usdTransferDetails && Array.isArray(re.usdTransferDetails)) {
      Logger.log('[REVOLUT-TO-NESTOR] Found %s USD transfer details', re.usdTransferDetails.length);
      
      for (var i = 0; i < re.usdTransferDetails.length; i++) {
        var tx = re.usdTransferDetails[i];
        var desc = (tx.description || '').toLowerCase();
        var cp   = (tx.counterparty || '').toLowerCase();
        var hay  = desc + ' ' + cp;
        // Look for transfers to Nestor (match by name in description or counterparty)
        if ((hay.indexOf('nestor') >= 0 && hay.indexOf('trabazo') >= 0) || hay.indexOf('nestor garcia trabazo') >= 0) {
          transfersToNestor.push({
            amount: tx.amount,
            description: tx.description,
            date: tx.date,
            type: 'Revolut-to-Nestor (USD)'
          });
          Logger.log('[REVOLUT-TO-NESTOR] Found USD Nestor transfer: $%s - %s', tx.amount, tx.description);
        }
      }
    }
    
    // Check EUR transfer details
    if (re && re.eurTransferDetails && Array.isArray(re.eurTransferDetails)) {
      Logger.log('[REVOLUT-TO-NESTOR] Found %s EUR transfer details', re.eurTransferDetails.length);
      
      for (var i = 0; i < re.eurTransferDetails.length; i++) {
        var tx = re.eurTransferDetails[i];
        var desc = (tx.description || '').toLowerCase();
        var cp   = (tx.counterparty || '').toLowerCase();
        var hay  = desc + ' ' + cp;
        // Look for transfers to Nestor (match by name in description or counterparty)
        if ((hay.indexOf('nestor') >= 0 && hay.indexOf('trabazo') >= 0) || hay.indexOf('nestor garcia trabazo') >= 0) {
          transfersToNestor.push({
            amount: tx.amount,
            description: tx.description,
            date: tx.date,
            type: 'Revolut-to-Nestor (EUR)'
          });
          Logger.log('[REVOLUT-TO-NESTOR] Found EUR Nestor transfer: $%s - %s', tx.amount, tx.description);
        }
      }
    }
    
    // Log transfer totals for reference
    if (re && re.usdTransfersOut && re.usdTransfersOut > 0) {
      Logger.log('[REVOLUT-TO-NESTOR] USD transfers out: $%s', re.usdTransfersOut);
    }
    if (re && re.eurTransfersOut && re.eurTransfersOut > 0) {
      Logger.log('[REVOLUT-TO-NESTOR] EUR transfers out: $%s', re.eurTransfersOut);
    }
    
    Logger.log('[REVOLUT-TO-NESTOR] Month %s-%s: Found %s transfers to Nestor', month, year, transfersToNestor.length);
    return transfersToNestor;
    
  } catch(e) {
    Logger.log('[ERROR] Failed to get Revolut-to-Nestor transfers %s-%s: %s', month, year, e.message);
    return [];
  }
}

function updateCurrentMonthExpenses() {
  var now = new Date();
  var month = now.getMonth() + 1; // getMonth() returns 0-11
  var year = now.getFullYear();
  updateMonthlyExpenses(month, year);
}

function updateSpecificMonthExpenses(month, year) {
  if (!month || !year) {
    Logger.log('[ERROR] updateSpecificMonthExpenses: month y year son obligatorios');
    return;
  }
  if (month < 1 || month > 12) {
    Logger.log('[ERROR] updateSpecificMonthExpenses: month debe ser 1-12');
    return;
  }
  if (year < 2025) {
    Logger.log('[ERROR] updateSpecificMonthExpenses: year debe ser >= 2025');
    return;
  }
  updateMonthlyExpenses(month, year);
}

/** ============== TRIGGERS: 10:00 y 22:00 todos los días ============== **/
function deleteTriggersFor_(handler) {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
}
function createTriggers_10_22_daily() {
  var handler = 'updateAllBalances';
  deleteTriggersFor_(handler);
  ScriptApp.newTrigger(handler).timeBased().atHour(10).everyDays(1).create();
  ScriptApp.newTrigger(handler).timeBased().atHour(22).everyDays(1).create();
  Logger.log('Triggers creados para %s a las 10:00 y 22:00 (%s)', handler, Session.getScriptTimeZone());
}

/* ============== TRIGGER MANAGEMENT ============== */

function createMonthlyExpensesTrigger() {
  try {
    // Delete any existing triggers first
    deleteMonthlyExpensesTrigger();
    
    // Create a new trigger to run on the 1st of each month at 9 AM
    var trigger = ScriptApp.newTrigger('updateCurrentMonthExpenses')
      .timeBased()
      .onMonthDay(1)
      .atHour(9)
      .create();
    
    Logger.log('Monthly expenses trigger created successfully. Trigger ID: ' + trigger.getUniqueId());
    return 'Monthly expenses trigger created for 1st of each month at 9 AM';
  } catch(e) {
    Logger.log('[ERROR] Failed to create monthly expenses trigger: ' + e.message);
    return 'Failed to create trigger: ' + e.message;
  }
}

function deleteMonthlyExpensesTrigger() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var deletedCount = 0;
    
    for (var i = 0; i < triggers.length; i++) {
      var trigger = triggers[i];
      if (trigger.getHandlerFunction() === 'updateCurrentMonthExpenses') {
        ScriptApp.deleteTrigger(trigger);
        deletedCount++;
        Logger.log('Deleted trigger: ' + trigger.getUniqueId());
      }
    }
    
    if (deletedCount > 0) {
      Logger.log('Deleted ' + deletedCount + ' monthly expenses trigger(s)');
      return 'Deleted ' + deletedCount + ' trigger(s)';
    } else {
      Logger.log('No monthly expenses triggers found to delete');
      return 'No triggers found to delete';
    }
  } catch(e) {
    Logger.log('[ERROR] Failed to delete triggers: ' + e.message);
    return 'Failed to delete triggers: ' + e.message;
  }
}

function listAllTriggers() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var triggerList = [];
    
    for (var i = 0; i < triggers.length; i++) {
      var trigger = triggers[i];
      var triggerInfo = {
        id: trigger.getUniqueId(),
        function: trigger.getHandlerFunction(),
        type: trigger.getEventType(),
        time: trigger.getTimeBasedTriggerType ? trigger.getTimeBasedTriggerType() : 'N/A'
      };
      triggerList.push(triggerInfo);
      Logger.log('Trigger ' + (i+1) + ': ' + JSON.stringify(triggerInfo));
    }
    
    Logger.log('Total triggers: ' + triggers.length);
    return 'Found ' + triggers.length + ' triggers';
  } catch(e) {
    Logger.log('[ERROR] Failed to list triggers: ' + e.message);
    return 'Failed to list triggers: ' + e.message;
  }
}

function createAllTriggers() {
  try {
    var results = [];
    
    // Create monthly expenses trigger
    var monthlyResult = createMonthlyExpensesTrigger();
    results.push('Monthly expenses: ' + monthlyResult);
    
    // Create daily balance update trigger (if you want it)
    try {
      var balanceTrigger = ScriptApp.newTrigger('updateAllBalances')
        .timeBased()
        .everyDays(1)
        .atHour(8)
        .create();
      results.push('Daily balances: Created successfully');
    } catch(e) {
      results.push('Daily balances: Failed - ' + e.message);
    }
    
    Logger.log('All triggers setup completed');
    return results.join('\n');
  } catch(e) {
    Logger.log('[ERROR] Failed to create all triggers: ' + e.message);
    return 'Failed to create triggers: ' + e.message;
  }
}

function deleteAllTriggers() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var deletedCount = 0;
    
    for (var i = 0; i < triggers.length; i++) {
      var trigger = triggers[i];
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
      Logger.log('Deleted trigger: ' + trigger.getUniqueId());
    }
    
    Logger.log('Deleted all ' + deletedCount + ' triggers');
    return 'Deleted all ' + deletedCount + ' triggers';
  } catch(e) {
    Logger.log('[ERROR] Failed to delete all triggers: ' + e.message);
    return 'Failed to delete all triggers: ' + e.message;
  }
}

function listProjectTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    Logger.log('Trigger -> handler=%s, type=%s, id=%s', t.getHandlerFunction(), t.getEventType(), t.getUniqueId());
  });
}

/* ============== MAIN FUNCTIONS ============== */

// Keep legacy name calling the actual trigger implementation
function updateAllBalances() {
  return TRIGGER_updateAllBalances();
}

/* ============== TEST FUNCTIONS (Data-only, no Excel writing) ============== */

// Test July 2025 expenses (data only)
function testJuly2025() {
  Logger.log('=== TEST JULY 2025 (data-only) ===');
  try {
    var result = testMonthlyExpenses(7, 2025);
    Logger.log('=== JULY 2025 TEST COMPLETED ===');
    return result;
  } catch(e) {
    Logger.log('[ERROR] July 2025 test failed: ' + e.message);
    return false;
  }
}

// Test August 2025 expenses (data only)
function testAugust2025() {
  Logger.log('=== TEST AUGUST 2025 (data-only) ===');
  try {
    var result = testMonthlyExpenses(8, 2025);
    Logger.log('=== AUGUST 2025 TEST COMPLETED ===');
    return result;
  } catch(e) {
    Logger.log('[ERROR] August 2025 test failed: ' + e.message);
    return false;
  }
}

// Test September 2025 expenses (data only)
function testSeptember2025() {
  Logger.log('=== TEST SEPTEMBER 2025 (data-only) ===');
  try {
    var result = testMonthlyExpenses(9, 2025);
    Logger.log('=== SEPTEMBER 2025 TEST COMPLETED ===');
    return result;
  } catch(e) {
    Logger.log('[ERROR] September 2025 test failed: ' + e.message);
    return false;
  }
}

// Test current month expenses (data only)
function testCurrentMonth() {
  Logger.log('=== TEST CURRENT MONTH (data-only) ===');
  try {
    var now = new Date();
    var month = now.getMonth() + 1;
    var year = now.getFullYear();
    var result = testMonthlyExpenses(month, year);
    Logger.log('=== CURRENT MONTH TEST COMPLETED ===');
    return result;
  } catch(e) {
    Logger.log('[ERROR] Current month test failed: ' + e.message);
    return false;
  }
}

/* ============== RUN FUNCTIONS (Write to Excel) ============== */

// Run July 2025 expenses (writes to Excel)
function TRIGGER_runExpensesJuly2025() {
  Logger.log('=== RUN EXPENSES JULY 2025 (writes to Excel) ===');
  try {
    updateMonthlyExpenses(7, 2025);
    Logger.log('=== JULY 2025 EXPENSES COMPLETED ===');
    return 'July 2025 expenses updated in Excel';
  } catch(e) {
    Logger.log('[ERROR] July 2025 expenses run failed: ' + e.message);
    return 'Error: ' + e.message;
  }
}

// Run August 2025 expenses (writes to Excel)
function TRIGGER_runExpensesAugust2025() {
  Logger.log('=== RUN EXPENSES AUGUST 2025 (writes to Excel) ===');
  try {
    updateMonthlyExpenses(8, 2025);
    Logger.log('=== AUGUST 2025 EXPENSES COMPLETED ===');
    return 'August 2025 expenses updated in Excel';
  } catch(e) {
    Logger.log('[ERROR] August 2025 expenses run failed: ' + e.message);
    return 'Error: ' + e.message;
  }
}

// Run September 2025 expenses (writes to Excel)
function TRIGGER_runExpensesSeptember2025() {
  Logger.log('=== RUN EXPENSES SEPTEMBER 2025 (writes to Excel) ===');
  try {
    updateMonthlyExpenses(9, 2025);
    Logger.log('=== SEPTEMBER 2025 EXPENSES COMPLETED ===');
    return 'September 2025 expenses updated in Excel';
  } catch(e) {
    Logger.log('[ERROR] September 2025 expenses run failed: ' + e.message);
    return 'Error: ' + e.message;
  }
}

// Run current month expenses (writes to Excel)
function TRIGGER_runExpensesCurrentMonth() {
  Logger.log('=== RUN EXPENSES CURRENT MONTH (writes to Excel) ===');
  try {
    updateCurrentMonthExpenses();
    Logger.log('=== CURRENT MONTH EXPENSES COMPLETED ===');
    return 'Current month expenses updated in Excel';
  } catch(e) {
    Logger.log('[ERROR] Current month expenses run failed: ' + e.message);
    return 'Error: ' + e.message;
  }
}

/* ============== Polished Apps Script Wrappers and Menu ============== */

/**
 * Creates a custom menu in the Google Sheet for easy access to bank functions
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Banks')
    .addItem('Update current month', 'updateCurrentMonthExpenses')
    .addItem('Update specific month…', 'promptAndUpdateMonth')
    .addSeparator()
    .addItem('Update all balances', 'updateAllBalances')
    .addToUi();
}

/**
 * Convenience function to update expenses for the current month
 */
// (removed duplicate wrappers for updateCurrentMonthExpenses/updateSpecificMonthExpenses)

/**
 * Prompts user for month and year, then updates expenses
 */
function promptAndUpdateMonth() {
  const ui = SpreadsheetApp.getUi();
  const monthResponse = ui.prompt('Month (1-12)').getResponseText();
  const yearResponse = ui.prompt('Year (e.g., 2025)').getResponseText();
  
  if (!monthResponse || !yearResponse) {
    ui.alert('Both month and year are required');
    return;
  }
  
  const month = Number(monthResponse);
  const year = Number(yearResponse);
  
  if (month < 1 || month > 12) {
    ui.alert('Month must be between 1 and 12');
    return;
  }
  
  if (year < 2025) {
    ui.alert('Year must be 2025 or later');
    return;
  }
  
  try {
    updateMonthlyExpenses(month, year);
    ui.alert('Success', `Updated expenses for ${month}/${year}`);
  } catch (error) {
    ui.alert('Error', `Failed to update expenses: ${error.message}`);
  }
}

/**
 * Sets a cell value and note while preserving number format
 */
function setCellWithNote_(sheetName, a1, value, note) {
  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const rg = sh.getRange(a1);
  const fmt = rg.getNumberFormat();
  
  rg.setValue(value);
  if (note && String(note).trim()) {
    rg.setNote(note);
  }
  
  if (fmt) {
    rg.setNumberFormat(fmt);
  }
}

/**
 * Creates a time-based trigger to run updateCurrentMonthExpenses on the 1st of each month
 */
function createMonthlyExpensesTrigger() {
  const fn = 'updateCurrentMonthExpenses';
  
  // Delete existing triggers for this function
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === fn)
    .forEach(t => ScriptApp.deleteTrigger(t));
  
  // Create new trigger: 1st of each month at 8 AM
  ScriptApp.newTrigger(fn)
    .timeBased()
    .atHour(8)
    .onMonthDay(1)
    .create();
    
  Logger.log('Monthly expenses trigger created for %s', fn);
}

/**
 * Deletes the monthly expenses trigger
 */
function deleteMonthlyExpensesTrigger() {
  const fn = 'updateCurrentMonthExpenses';
  
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === fn)
    .forEach(t => ScriptApp.deleteTrigger(t));
    
  Logger.log('Monthly expenses trigger deleted for %s', fn);
}

/**
 * Lists all project triggers for debugging
 */
function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  Logger.log('Project triggers:');
  triggers.forEach((t, i) => {
    Logger.log('[%s] %s -> %s (%s)', i, t.getHandlerFunction(), t.getEventType(), t.getUniqueId());
  });
  return triggers;
}

/* ============== Simplified runs ============== */

function testMonthlyExpenses(month, year) {
  if (!month || !year) { throw new Error('Month and year are required'); }
  if (month < 1 || month > 12) { throw new Error('Month must be 1-12'); }
  if (year < 2025) { throw new Error('Year must be >= 2025'); }

  var totalCardExpenses = 0;
  var noteDetails = [];
  var me = null, ae = null, re = null;

  try {
    me = fetchMercuryExpenses_(month, year);
    totalCardExpenses += Number(me.cardExpenses || 0);
  } catch (e) {
    // Error will be handled in ordered display
  }

  try {
    ae = fetchAirwallexExpenses_(month, year);
    totalCardExpenses += Number(ae.cardExpenses || 0);
  } catch (e) {
    // Error will be handled in ordered display
  }

  try {
    re = fetchRevolutExpenses_(month, year);
    totalCardExpenses += Number(re.cardExpenses || 0);
  } catch (e) {
    // Error will be handled in ordered display
  }

  
  // Add Revolut-to-Nestor transfers (revtag)
  var revolutToNestor = getRevolutToNestorTransfers_(month, year);
  var totalToNestor = 0;
  if (revolutToNestor && revolutToNestor.length > 0) {
    totalToNestor = revolutToNestor.reduce(function(sum, tx) { return sum + tx.amount; }, 0);
    totalCardExpenses += totalToNestor;
  }

  // ===== BUILD NOTES USING HELPER FUNCTION =====
  var noteDetails = buildMonthlyExpensesNotes_(me, ae, re, totalToNestor);
  var formattedNote = formatMonthlyExpensesNote_(noteDetails);

  Logger.log('[TEST RUN] %s-%s total cards $%s', month, year, (totalCardExpenses || 0).toFixed(2));
  Logger.log('[TEST RUN] Details:\n%s', formattedNote);

  return {
    month: Number(month),
    year: Number(year),
    totalCardExpenses: Number(totalCardExpenses),
    note: formattedNote,
    mercury: me,
    airwallex: ae,
    revolut: re
  };
}


