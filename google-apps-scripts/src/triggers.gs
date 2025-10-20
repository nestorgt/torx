/**
 * triggers.gs
 *
 * Time-based triggers and automation
 */

function TRIGGER_test() {
  Logger.log('[TEST_TRIGGER] Test trigger executed successfully');
  return 'Test trigger works';
}

function TRIGGER_makeMonthlyPayments() {
  Logger.log('=== MONTHLY PAYMENTS TRIGGER ===');
  Logger.log('[TRIGGER] Starting monthly payments...');
  
  try {
    var startTime = new Date().getTime();
    
    // First, sync all bank data to ensure we have latest balances
    Logger.log('[TRIGGER] Step 1: Syncing bank data...');
    var syncResult = syncBanksData({
      dryRun: false,
      skipExpenses: false,
      skipConsolidation: false,
      skipPayoutReconciliation: false
    });
    
    if (!syncResult.success) {
      throw new Error('Bank data sync failed: ' + syncResult.error);
    }
    
    // Then, process monthly payments
    Logger.log('[TRIGGER] Step 2: Processing monthly payments...');
    var paymentResult = payUsersForCurrentMonth();
    
    var duration = new Date().getTime() - startTime;
    
    Logger.log('[TRIGGER] Monthly payments completed in %s ms', duration);
    Logger.log('[TRIGGER] Sync results: %s', JSON.stringify(syncResult, null, 2));
    Logger.log('[TRIGGER] Payment results: %s', JSON.stringify(paymentResult, null, 2));
    
    return {
      success: paymentResult.success,
      message: 'Monthly payments completed',
      duration: duration,
      syncResults: syncResult,
      paymentResults: paymentResult,
      timestamp: nowStamp_()
    };
    
  } catch (e) {
    Logger.log('[ERROR] Monthly payments trigger failed: %s', e.message);
    return {
      success: false,
      error: e.message,
      timestamp: nowStamp_()
    };
  }
}

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

function TRIGGER_syncBanksDataFull() {
  Logger.log('=== AUTOMATIC UNIFIED BANK DATA SYNC TRIGGER ===');
  Logger.log('[SYNC_TRIGGER] Starting automatic unified bank data sync');
  
  try {
    // Run the unified sync with full options
    var result = syncBanksData({
      dryRun: false,
      skipExpenses: false,
      skipConsolidation: false,
      skipPayoutReconciliation: false
    });
    
    if (result.status === 'success') {
      Logger.log('[SYNC_TRIGGER] Unified sync completed successfully');
      Logger.log('[SYNC_TRIGGER] Duration: %s ms', result.duration);
      Logger.log('[SYNC_TRIGGER] Balances updated: %s', result.summary.totalBalancesUpdated);
      Logger.log('[SYNC_TRIGGER] Transfers detected: %s', result.summary.totalPayoutsDetected);
      Logger.log('[SYNC_TRIGGER] Transfers reconciled: %s', result.summary.totalPayoutsReconciled);
      Logger.log('[SYNC_TRIGGER] Funds consolidated: $%s', result.summary.totalFundsConsolidated);
      Logger.log('[SYNC_TRIGGER] Expenses calculated: %s', result.summary.totalExpensesCalculated);
      
      return {
        success: true,
        timestamp: new Date().toISOString(),
        duration: result.duration,
        summary: result.summary,
        message: 'Automatic unified bank data sync completed successfully'
      };
    } else {
      Logger.log('[SYNC_TRIGGER] Unified sync failed: %s', result.error);
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: result.error,
        message: 'Automatic unified bank data sync failed'
      };
    }
    
  } catch (e) {
    Logger.log('[ERROR] Unified sync trigger failed: %s', e.message);
    Logger.log('[ERROR] Stack trace: %s', e.stack);
    
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: e.message,
      message: 'Unified sync trigger execution failed'
    };
  }
}

function TRIGGER_syncBanksDataBalancesOnly() {
  Logger.log('=== AUTOMATIC BALANCE SYNC TRIGGER ===');
  Logger.log('[SYNC_TRIGGER] Starting automatic balance-only sync');
  
  try {
    // Run the unified sync with only balance updates
    var result = syncBanksData({
      dryRun: false,
      skipExpenses: true,
      skipConsolidation: true,
      skipPayoutReconciliation: true
    });
    
    if (result.status === 'success') {
      Logger.log('[SYNC_TRIGGER] Balance sync completed successfully');
      Logger.log('[SYNC_TRIGGER] Duration: %s ms', result.duration);
      Logger.log('[SYNC_TRIGGER] Balances updated: %s', result.summary.totalBalancesUpdated);
      
      return {
        success: true,
        timestamp: new Date().toISOString(),
        duration: result.duration,
        summary: result.summary,
        message: 'Automatic balance sync completed successfully'
      };
    } else {
      Logger.log('[SYNC_TRIGGER] Balance sync failed: %s', result.error);
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: result.error,
        message: 'Automatic balance sync failed'
      };
    }
    
  } catch (e) {
    Logger.log('[ERROR] Balance sync trigger failed: %s', e.message);
    Logger.log('[ERROR] Stack trace: %s', e.stack);
    
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: e.message,
      message: 'Balance sync trigger execution failed'
    };
  }
}

function TRIGGER_syncBanksDataWithTransfers() {
  Logger.log('=== AUTOMATIC TRANSFER SYNC TRIGGER ===');
  Logger.log('[SYNC_TRIGGER] Starting automatic sync with transfer detection');
  
  try {
    // Run the unified sync with balance updates and transfer detection
    var result = syncBanksData({
      dryRun: false,
      skipExpenses: false,
      skipConsolidation: false,
      skipPayoutReconciliation: false
    });
    
    if (result.status === 'success') {
      Logger.log('[SYNC_TRIGGER] Transfer sync completed successfully');
      Logger.log('[SYNC_TRIGGER] Duration: %s ms', result.duration);
      Logger.log('[SYNC_TRIGGER] Balances updated: %s', result.summary.totalBalancesUpdated);
      Logger.log('[SYNC_TRIGGER] Transfers detected: %s', result.summary.totalPayoutsDetected);
      Logger.log('[SYNC_TRIGGER] Transfers reconciled: %s', result.summary.totalPayoutsReconciled);
      Logger.log('[SYNC_TRIGGER] Funds consolidated: $%s', result.summary.totalFundsConsolidated);
      Logger.log('[SYNC_TRIGGER] Expenses calculated: %s', result.summary.totalExpensesCalculated);
      
      return {
        success: true,
        timestamp: new Date().toISOString(),
        duration: result.duration,
        summary: result.summary,
        message: 'Automatic transfer sync completed successfully'
      };
    } else {
      Logger.log('[SYNC_TRIGGER] Transfer sync failed: %s', result.error);
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: result.error,
        message: 'Automatic transfer sync failed'
      };
    }
    
  } catch (e) {
    Logger.log('[ERROR] Transfer sync trigger failed: %s', e.message);
    Logger.log('[ERROR] Stack trace: %s', e.stack);
    
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: e.message,
      message: 'Transfer sync trigger execution failed'
    };
  }
}

function TRIGGER_sendDailySummaryToSlack() {
  try {
    Logger.log('[TRIGGER] Starting automated daily summary to Slack');
    
    // Generate and send summary to daily channel
    var result = sendDailySummaryToSlack('daily');
    
    Logger.log('[TRIGGER] Daily summary result: ' + result);
    
    // Return success/failure for monitoring
    return {
      success: result.includes('successfully'),
      message: result,
      timestamp: new Date().toISOString()
    };
    
  } catch (e) {
    Logger.log('[TRIGGER] Error in automated daily summary: ' + e.message);
    return {
      success: false,
      error: e.message,
      timestamp: new Date().toISOString()
    };
  }
}

