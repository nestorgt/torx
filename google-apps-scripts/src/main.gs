/**
 * main.gs
 *
 * Entry point and onOpen
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  
  ui.createMenu('⚙️ Torx')
    .addItem('📤 Send Summary to Slack', 'menuSendSummaryToDaily')
    .addItem('🔄 Update All Data', 'menuUpdateData')
    .addToUi();
  
  ui.createMenu('🏦 Banking')
    // Unified Sync (Primary Functions)
    .addItem('🚀 Sync Banks Data (Full)', 'menuSyncBanksDataFull')
    .addItem('🔍 Sync Banks Data (Dry Run)', 'menuSyncBanksDataDryRun')
    .addSeparator()
    // Individual Component Tests
    .addItem('🧪 Test Balances Only', 'menuTestSyncBalancesOnly')
    .addItem('🧪 Test Payouts Only', 'menuTestSyncPayoutsOnly')
    .addItem('🧪 Test Expenses Only', 'menuTestSyncExpensesOnly')
    .addItem('🧪 Test Mark Payout Received', 'menuTestMarkPayoutReceived')
    .addItem('📋 List Pending Payouts', 'menuListPendingPayouts')
    .addSeparator()
    // Balance Monitoring
    .addItem('📊 Show Balance Summary', 'menuShowBalanceSummary')
    .addItem('📈 Daily/Weekly Summary', 'menuGenerateDailyWeeklySummary')
    .addItem('📤 Send Summary to Daily', 'menuSendSummaryToDaily')
    .addItem('🧪 Test Slack Webhook', 'menuTestSlackWebhook')
    .addItem('⚙️ Setup Slack Credentials', 'menuSetupSlackCredentials')
    .addItem('🗑️ Clear Snapshot Data', 'menuClearSnapshotData')
    .addSeparator()
    // Expense Calculations
    .addSubMenu(ui.createMenu('📊 Expense Calculations')
      .addItem('📅 Calculate Specific Month', 'menuCalculateSpecificMonthExpenses')
      .addItem('📆 Calculate Current Month to Date', 'menuCalculateCurrentMonthExpenses')
      .addItem('📈 Calculate Multiple Months', 'menuCalculateMultipleMonthsExpenses')
      .addSeparator()
      .addItem('🧪 Test Specific Month', 'menuTestSpecificMonthExpenses'))
    .addSeparator()
    // Legacy Functions
    .addSubMenu(ui.createMenu('📜 Legacy')
      .addItem('🔄 Update All Balances (Old)', 'menuUpdateAllBalances')
      .addItem('📊 Update Current Month Expenses', 'menuUpdateCurrentMonthExpenses')
      .addItem('📅 Update Specific Month Expenses', 'menuUpdateSpecificMonthExpenses')
      .addItem('🧪 Test Current Month Expenses', 'menuTestCurrentMonthExpenses')
      .addItem('🔍 Check Minimum Balances (Dry Run)', 'dryRunCheckAllBankMinimumBalances')
      .addItem('💳 Auto-Topup Low Balances', 'checkAllBankMinimumBalances'))
    .addSeparator()
    .addItem('❌ Clear Outputs', 'menuClearOutputs')
    .addToUi();
    
  ui.createMenu('💰 Payments')
    // Payment Processing
    .addItem('🧪 Dry Run Current Month', 'dryRunPayUsersForCurrentMonth')
    .addItem('💰 Pay Current Month', 'payUsersForCurrentMonth')
    .addSeparator()
    .addItem('🧪 Dry Run Previous Month', 'dryRunPayUsersForPreviousMonth') 
    .addItem('💰 Pay Previous Month', 'payUsersForPreviousMonth')
    .addSeparator()
    .addItem('🗓️ Dry Run Specific Month', 'menuDryRunSpecificMonth')
    .addItem('🗓️ Pay Specific Month', 'menuPaySpecificMonth')
    .addSeparator()
    // Fund Consolidation (Money Movement)
    .addItem('🧪 Test Consolidation Only', 'menuTestSyncConsolidationOnly')
    .addSeparator()
    // Payment Status & Testing
    .addItem('🔍 Check Status', 'getCurrentMonthStatus')
    .addItem('🧪 Test Payment System', 'testPaymentSystem')
    .addToUi();

  ui.createMenu('🧪 System Tests')
    .addItem('🔐 First Time Setup (Authorize)', 'firstTimeSetup')
    .addSeparator()
    .addItem('🚀 Complete System Test', 'testCompleteSystem')
    .addItem('📊 Validate Sheet', 'testSheetValidation')
    .addSeparator()
    .addItem('🧪 Test Unified Sync (Full)', 'testSyncFull')
    .addItem('🧪 Test Unified Sync (Dry Run)', 'testSyncDryRun')
    .addSeparator()
    .addItem('🧪 Test Airwallex API', 'testAirwallexApiIntegration')
    .addItem('🧪 Test Airwallex Expenses', 'testAirwallexExpenseCalculation')
    .addSeparator()
    .addItem('🧪 Test Sync Components', 'menuTestSyncBalancesOnly')
    .addToUi();
}

function setProxyToken() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PROXY_TOKEN', '8c92f4a0a1b9d3c4e6f7asdasd213w1sda2');
  props.setProperty('PROXY_URL', 'https://proxy.waresoul.org');
}

/**
 * Menu wrapper for sending daily summary to Slack
 */
function menuSendSummaryToDaily() {
  try {
    sendDailySummaryToSlack('daily');
    SpreadsheetApp.getUi().alert('Success', 'Daily summary sent to Slack!', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log('[ERROR] Failed to send summary: %s', e.message);
    SpreadsheetApp.getUi().alert('Error', 'Failed to send summary: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Menu wrapper for updating all data (full sync)
 */
function menuUpdateData() {
  try {
    syncBanksData({
      dryRun: false,
      includeBalances: true,
      includePayouts: true,
      includeExpenses: true,
      includeTransfers: true,
      includeConsolidation: false
    });
    SpreadsheetApp.getUi().alert('Success', 'All data updated successfully!', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log('[ERROR] Failed to update data: %s', e.message);
    SpreadsheetApp.getUi().alert('Error', 'Failed to update data: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
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

    var statusText = '📊 PAYMENT STATUS - ' + monthStr + '\n\n' +
      'Active Users: ' + activeUsers + '\n' +
      'Paid Users: ' + paidUsers + '\n' +
      'Remaining: ' + (activeUsers - paidUsers) + '\n' +
      'Total Amount: €' + totalAmount + '\n\n' +
      'Status: ' + (paidUsers === activeUsers ? '✅ All users paid' : '🔄 Pending payments');

    SpreadsheetApp.getUi().alert('Payment Status', statusText, SpreadsheetApp.getUi().ButtonSet.OK);

  } catch (e) {
    Logger.log('[ERROR] Failed to get current month status: %s', e.message);
    SpreadsheetApp.getUi().alert('Error', 'Failed to get payment status: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

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

