/**
 * bank-airwallex.gs
 *
 * Airwallex bank integration
 */

function fetchAirwallexSummary_() {
  try {
    Logger.log('[AIRWALLEX] Fetching summary via proxy server');
    return httpProxyJson_('/airwallex/summary');
  } catch (e) {
    Logger.log('[ERROR] Failed to get Airwallex summary: %s', e.message);
    return { USD: 0, EUR: 0, count: 0 };
  }
}

function fetchAirwallexExpenses_(month, year) { 
  Logger.log('[AIRWALLEX] Fetching expenses via proxy server for %s-%s', month, year);
  return httpProxyJson_('/airwallex/transactions?month=' + month + '&year=' + year);
}

function testAirwallexExpenseCalculation() {
  Logger.log('=== TESTING AIRWALLEX EXPENSE CALCULATION FOR 5 MONTHS ===');
  
  var currentDate = new Date();
  var results = [];
  
  // Test current month and past 4 months
  for (var i = 0; i < 5; i++) {
    var testDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    var month = testDate.getMonth() + 1;
    var year = testDate.getFullYear();
    var monthStr = month.toString().padStart(2, '0') + '-' + year;
    
    Logger.log('[TEST] Testing month: %s', monthStr);
    
    try {
      var expenses = fetchAirwallexExpenses_(month, year);
      
      var result = {
        month: monthStr,
        success: true,
        cardExpenses: expenses.cardExpenses || 0,
        transfersOut: expenses.transfersOut || 0,
        transfersIn: expenses.transfersIn || 0,
        totalExpenses: (expenses.cardExpenses || 0) + (expenses.transfersOut || 0),
        details: expenses.cardDetails ? expenses.cardDetails.length : 0,
        error: null
      };
      
      Logger.log('[TEST] %s: Cards=$%s, TransfersOut=$%s, TransfersIn=$%s, Total=$%s', 
        monthStr, result.cardExpenses, result.transfersOut, result.transfersIn, result.totalExpenses);
      
      results.push(result);
      
    } catch (e) {
      Logger.log('[ERROR] Failed to fetch expenses for %s: %s', monthStr, e.message);
      
      results.push({
        month: monthStr,
        success: false,
        cardExpenses: 0,
        transfersOut: 0,
        transfersIn: 0,
        totalExpenses: 0,
        details: 0,
        error: e.message
      });
    }
  }
  
  // Generate summary
  var summary = {
    totalMonths: results.length,
    successfulMonths: results.filter(r => r.success).length,
    failedMonths: results.filter(r => !r.success).length,
    totalCardExpenses: results.reduce((sum, r) => sum + r.cardExpenses, 0),
    totalTransfersOut: results.reduce((sum, r) => sum + r.transfersOut, 0),
    totalTransfersIn: results.reduce((sum, r) => sum + r.transfersIn, 0),
    totalExpenses: results.reduce((sum, r) => sum + r.totalExpenses, 0),
    results: results
  };
  
  Logger.log('[TEST] === SUMMARY ===');
  Logger.log('[TEST] Total months tested: %s', summary.totalMonths);
  Logger.log('[TEST] Successful: %s, Failed: %s', summary.successfulMonths, summary.failedMonths);
  Logger.log('[TEST] Total card expenses: $%s', summary.totalCardExpenses);
  Logger.log('[TEST] Total transfers out: $%s', summary.totalTransfersOut);
  Logger.log('[TEST] Total transfers in: $%s', summary.totalTransfersIn);
  Logger.log('[TEST] Total expenses: $%s', summary.totalExpenses);
  
  // Display results
  var ui = SpreadsheetApp.getUi();
  var message = 'Airwallex Expense Calculation Test Results:\n\n';
  
  message += '📊 SUMMARY:\n';
  message += '• Months tested: ' + summary.totalMonths + '\n';
  message += '• Successful: ' + summary.successfulMonths + '\n';
  message += '• Failed: ' + summary.failedMonths + '\n\n';
  
  message += '💰 TOTALS:\n';
  message += '• Card expenses: $' + summary.totalCardExpenses.toFixed(2) + '\n';
  message += '• Transfers out: $' + summary.totalTransfersOut.toFixed(2) + '\n';
  message += '• Transfers in: $' + summary.totalTransfersIn.toFixed(2) + '\n';
  message += '• Total expenses: $' + summary.totalExpenses.toFixed(2) + '\n\n';
  
  message += '📅 MONTHLY BREAKDOWN:\n';
  results.forEach(function(result) {
    if (result.success) {
      message += '• ' + result.month + ': $' + result.totalExpenses.toFixed(2) + 
                 ' (Cards: $' + result.cardExpenses.toFixed(2) + 
                 ', Transfers: $' + result.transfersOut.toFixed(2) + ')\n';
    } else {
      message += '• ' + result.month + ': ERROR - ' + result.error + '\n';
    }
  });
  
  ui.alert('Airwallex Expense Test Results', message, ui.ButtonSet.OK);
  
  return summary;
}

