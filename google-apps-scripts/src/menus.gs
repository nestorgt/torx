/**
 * menus.gs
 *
 * Custom menu functions
 */

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
      mercuryReport.message = '⚠️ Below threshold by $' + mercuryReport.shortfall.toFixed(2);
    } else {
      mercuryReport.surplus = mercuryBalance - THRESHOLD_USD;
      mercuryReport.message = '✅ Above threshold (+$' + mercuryReport.surplus.toFixed(2) + ')';
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
      revolutReport.message = '🚨 Below threshold by $' + revolutReport.shortfall.toFixed(2) + ' - Transfer $' + TRANSFER_AMOUNT_USD;
    } else {
      revolutReport.surplus = revolutBalance - THRESHOLD_USD;
      revolutReport.message = '✅ Above threshold (+$' + revolutReport.surplus.toFixed(2) + ')';
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

function processFundedAccounts(input) {
  /*
   * Process the funded accounts input from the HTML dialog
   * This function is called by the HTML dialog when user clicks OK/Cancel
   */
  fundedAccountsResult = input;
}

