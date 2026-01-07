/**
 * bank-nexo.gs
 *
 * Nexo bank integration
 */

function fetchNexoSummary_() {
  return httpProxyJson_('/nexo/summary');
}

function fetchNexoTransactions_(month, year) {
  /*
   * Fetches Nexo USD transactions for a given month/year
   * Uses extended timeout since Nexo scraping can take 2-3 minutes
   * Returns: {
   *   month, year,
   *   totalIn, totalOut, netAmount,
   *   incomingTransfers: [...],
   *   outgoingTransfers: [...],
   *   totalTransactions
   * }
   */
  try {
    Logger.log('[NEXO] Fetching transactions for %s-%s (this may take a few minutes)...', month, year);

    var props = props_();
    var proxyUrl = props.getProperty('PROXY_URL');
    var proxyToken = props.getProperty('PROXY_TOKEN');

    if (!proxyUrl || !proxyToken) {
      Logger.log('[ERROR] Nexo: Proxy configuration missing');
      return null;
    }

    var endpoint = '/nexo/transactions?month=' + month + '&year=' + year;
    var fullUrl = proxyUrl + endpoint;

    // Use 3 minute timeout for Nexo (browser automation is slow)
    var response = UrlFetchApp.fetch(fullUrl, {
      method: 'GET',
      headers: {
        'x-proxy-token': proxyToken,
        'Accept': 'application/json'
      },
      muteHttpExceptions: true,
      followRedirects: false,
      validateHttpsCertificates: true
      // Note: Apps Script max timeout is ~6 minutes, we let it use default
    });

    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();

    Logger.log('[NEXO] Response status: %s, length: %s', statusCode, responseText.length);

    if (statusCode >= 400) {
      Logger.log('[ERROR] Nexo API error: %s', responseText.substring(0, 200));
      return null;
    }

    var data = JSON.parse(responseText);

    if (!data || data.error) {
      Logger.log('[ERROR] Failed to fetch Nexo transactions: %s', data ? data.error : 'Unknown error');
      return null;
    }

    Logger.log('[NEXO] Fetched %s transactions for %s-%s (In: $%s, Out: $%s, Net: $%s)',
      data.totalTransactions || 0,
      month,
      year,
      data.totalIn || 0,
      data.totalOut || 0,
      data.netAmount || 0
    );

    return data;
  } catch (e) {
    Logger.log('[ERROR] fetchNexoTransactions_: %s', e.message);
    return null;
  }
}

function storeNexoFiatTransactions_(transactions) {
  /**
   * Store Nexo "Added FIATx" transactions in Script Properties
   * Each transaction is stored with a unique key: NEXO_FIAT_YYYY-MM-DD_AMOUNT
   */
  try {
    var properties = PropertiesService.getScriptProperties();
    var stored = 0;

    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      if (tx.type === 'Added FIATx' && tx.currency && tx.currency.startsWith('USD')) {
        var date = new Date(tx.date);
        var dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        var key = 'NEXO_FIAT_' + dateStr + '_' + tx.amount;

        // Store transaction as JSON
        properties.setProperty(key, JSON.stringify({
          date: tx.date,
          amount: tx.amount,
          currency: tx.currency,
          type: tx.type
        }));

        stored++;
        Logger.log('[NEXO-STORE] Stored: %s $%s', dateStr, tx.amount);
      }
    }

    Logger.log('[NEXO-STORE] Stored %s new "Added FIATx" transactions', stored);
    return stored;
  } catch (e) {
    Logger.log('[ERROR] storeNexoFiatTransactions_: %s', e.message);
    return 0;
  }
}

function getStoredNexoFiatTransactions_(month, year) {
  /**
   * Retrieve stored Nexo "Added FIATx" transactions for a specific month
   * Returns array of {date, amount, currency, type}
   */
  try {
    var properties = PropertiesService.getScriptProperties();
    var allProps = properties.getProperties();
    var transactions = [];

    // Calculate month range
    var startDate = new Date(Date.UTC(year, month - 1, 1));
    var endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

    // Filter properties that match NEXO_FIAT_ pattern
    for (var key in allProps) {
      if (key.indexOf('NEXO_FIAT_') === 0) {
        try {
          var tx = JSON.parse(allProps[key]);
          var txDate = new Date(tx.date);

          if (txDate >= startDate && txDate <= endDate) {
            transactions.push(tx);
          }
        } catch (parseErr) {
          Logger.log('[NEXO-STORE] Failed to parse transaction: %s', key);
        }
      }
    }

    Logger.log('[NEXO-STORE] Retrieved %s stored transactions for %s-%s', transactions.length, month, year);
    return transactions;
  } catch (e) {
    Logger.log('[ERROR] getStoredNexoFiatTransactions_: %s', e.message);
    return [];
  }
}

function syncNexoFiatTransactions_() {
  /**
   * Fetch recent Nexo transactions and store new "Added FIATx" entries
   * Call this daily to maintain up-to-date records
   */
  try {
    var now = new Date();
    var currentMonth = now.getMonth() + 1;
    var currentYear = now.getFullYear();

    Logger.log('[NEXO-SYNC] Syncing Nexo transactions for %s-%s', currentMonth, currentYear);

    // Fetch current month's transactions
    Logger.log('[NEXO-SYNC] Calling fetchNexoTransactions_...');
    var response = fetchNexoTransactions_(currentMonth, currentYear);
    Logger.log('[NEXO-SYNC] Response received: %s', response ? 'object' : 'null');

    if (response) {
      Logger.log('[NEXO-SYNC] Response keys: %s', Object.keys(response).join(', '));
      Logger.log('[NEXO-SYNC] incomingTransfers: %s', response.incomingTransfers ? response.incomingTransfers.length + ' items' : 'missing');
    }

    if (response && response.incomingTransfers) {
      var stored = storeNexoFiatTransactions_(response.incomingTransfers);
      Logger.log('[NEXO-SYNC] ✅ Sync complete: %s new transactions stored', stored);
      return { success: true, stored: stored };
    } else {
      Logger.log('[NEXO-SYNC] ⚠️ No transactions returned - response: %s', JSON.stringify(response));
      return { success: false, error: 'No transactions returned from API' };
    }
  } catch (e) {
    Logger.log('[ERROR] syncNexoFiatTransactions_: %s', e.message);
    Logger.log('[ERROR] Stack: %s', e.stack);
    return { success: false, error: e.message };
  }
}

function menuSyncNexoTransactions() {
  /**
   * Menu function to manually sync Nexo transactions
   * Can be called from: Menu > Torx > Sync Nexo Transactions
   */
  var ui = SpreadsheetApp.getUi();

  // Known December 2025 deposits (from verified Nexo API response)
  var dec2025Deposits = [
    { date: '2025-12-24', amount: 15000, currency: 'USDx', type: 'Added FIATx' },
    { date: '2025-12-24', amount: 9990, currency: 'USDx', type: 'Added FIATx' },
    { date: '2025-12-16', amount: 9990, currency: 'USDx', type: 'Added FIATx' }
  ];

  var response = ui.alert(
    'Sync Nexo Transactions',
    'Choose sync method:\n\n' +
    'YES = Use known December 2025 deposits ($15,000 + $9,990 + $9,990 = $34,980)\n' +
    'NO = Try live API fetch (may timeout)\n' +
    'CANCEL = Abort',
    ui.ButtonSet.YES_NO_CANCEL
  );

  if (response === ui.Button.CANCEL) {
    return;
  }

  var result;
  if (response === ui.Button.YES) {
    // Use hardcoded deposits
    result = importNexoFiatTransactions_(dec2025Deposits);
    ui.alert('Nexo Sync Complete', 'Stored ' + result + ' FIATx transactions (Dec 2025).\n\nRun "Update All Data" to recalculate expenses.', ui.ButtonSet.OK);
  } else {
    // Try live API
    ui.alert('Syncing Nexo', 'Fetching Nexo transactions... This may take 1-2 minutes.', ui.ButtonSet.OK);
    result = syncNexoFiatTransactions_();
    if (result.success) {
      ui.alert('Nexo Sync Complete', 'Stored ' + result.stored + ' FIATx transactions.\n\nRun "Update All Data" to recalculate expenses.', ui.ButtonSet.OK);
    } else {
      ui.alert('Nexo Sync Failed', 'Error: ' + result.error + '\n\nTry using YES option to use known deposits.', ui.ButtonSet.OK);
    }
  }
}

function importNexoFiatTransactions_(transactions) {
  /**
   * Manually import a list of "Added FIATx" transactions
   * Usage:
   * importNexoFiatTransactions_([
   *   { date: '2025-11-12', amount: 5500, currency: 'USDx' },
   *   { date: '2025-11-10', amount: 90, currency: 'USDx' }
   * ]);
   */
  try {
    var properties = PropertiesService.getScriptProperties();
    var stored = 0;

    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      var dateStr = tx.date; // Expecting YYYY-MM-DD format
      var key = 'NEXO_FIAT_' + dateStr + '_' + tx.amount;

      // Convert date string to ISO format
      var isoDate = new Date(dateStr + 'T00:00:00Z').toISOString();

      // Store transaction as JSON
      properties.setProperty(key, JSON.stringify({
        date: isoDate,
        amount: tx.amount,
        currency: tx.currency || 'USDx',
        type: 'Added FIATx'
      }));

      stored++;
      Logger.log('[NEXO-IMPORT] Imported: %s $%s', dateStr, tx.amount);
    }

    Logger.log('[NEXO-IMPORT] ✅ Imported %s transactions', stored);
    return { success: true, stored: stored };
  } catch (e) {
    Logger.log('[ERROR] importNexoFiatTransactions_: %s', e.message);
    return { success: false, error: e.message };
  }
}

function importNovember2025NexoTransactions() {
  /**
   * Import missing November 2025 "Added FIATx" transactions
   * Run this once to backfill historical data
   */
  var transactions = [
    { date: '2025-11-13', amount: 20000, currency: 'USDx' },
    { date: '2025-11-12', amount: 5500, currency: 'USDx' },
    { date: '2025-11-10', amount: 90, currency: 'USDx' }
  ];

  Logger.log('[NEXO-IMPORT] Starting import of November 2025 transactions...');
  var result = importNexoFiatTransactions_(transactions);

  if (result.success) {
    Logger.log('[NEXO-IMPORT] ✅ Successfully imported %s transactions', result.stored);
    Logger.log('[NEXO-IMPORT] Total amount: $%s', 20000 + 5500 + 90);
  } else {
    Logger.log('[NEXO-IMPORT] ❌ Import failed: %s', result.error);
  }

  return result;
}

