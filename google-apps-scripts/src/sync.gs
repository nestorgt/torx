/**
 * sync.gs
 *
 * Synchronization orchestration
 */

function syncBanksData(options) {
  /*
   * 🚀 UNIFIED BANK DATA SYNCHRONIZATION
   * 
   * This method combines all bank operations into one comprehensive sync:
   * 1. Update bank balances
   * 2. Detect payouts on non-Main USD accounts
   * 3. Consolidate funds to Main accounts (where possible)
   * 4. Reconcile payouts with Payouts sheet
   * 5. Calculate monthly expenses
   * 6. Update all sheet data
   * 
   * @param {Object} options - Configuration options
   * @param {boolean} options.dryRun - If true, don't make actual changes
   * @param {boolean} options.skipExpenses - If true, skip expense calculation
   * @param {boolean} options.skipConsolidation - If true, skip fund consolidation
   * @param {boolean} options.skipPayoutReconciliation - If true, skip payout reconciliation
   */
  
  // Set default options if not provided
  if (!options) {
    options = {
      dryRun: false,
      skipExpenses: false,
      skipConsolidation: false,
      skipPayoutReconciliation: false
    };
  }
  
  var startTime = new Date();
  var result = {
    status: 'success',
    startTime: startTime,
    endTime: null,
    duration: 0,
    steps: {
      balances: { status: 'pending', updated: 0, errors: [] },
      payouts: { status: 'pending', detected: 0, reconciled: 0, errors: [] },
      consolidation: { status: 'pending', moved: 0, errors: [] },
      expenses: { status: 'pending', calculated: false, errors: [] }
    },
    summary: {
      totalBalancesUpdated: 0,
      totalPayoutsDetected: 0,
      totalPayoutsReconciled: 0,
      totalFundsConsolidated: 0,
      totalExpensesCalculated: 0
    }
  };
  
  try {
    Logger.log('=== STARTING UNIFIED BANK DATA SYNC ===');
    Logger.log('[SYNC] Options: dryRun=%s, skipExpenses=%s, skipConsolidation=%s, skipPayoutReconciliation=%s', 
               options.dryRun || false, options.skipExpenses || false, options.skipConsolidation || false, options.skipPayoutReconciliation || false);
    
    var sh = sheet_(SHEET_NAME);
    if (!sh) {
      throw new Error('Payouts sheet not found');
    }
    
    // Check proxy health
    if (!proxyIsUp_()) {
      Logger.log('[WARNING] Proxy is not healthy, skipping sync');
      result.status = 'error';
      result.error = 'Proxy server not healthy';
      return result;
    }
    
    // STEP 1: Update Bank Balances
    Logger.log('[STEP_1] Updating bank balances...');
    try {
      var balanceResult = updateBankBalances_(sh, options.dryRun);
      result.steps.balances = balanceResult;
      result.summary.totalBalancesUpdated = balanceResult.updated;
      Logger.log('[STEP_1] ✅ Bank balances updated: %s banks', balanceResult.updated);
    } catch (e) {
      Logger.log('[ERROR] Step 1 failed: %s', e.message);
      result.steps.balances.status = 'error';
      result.steps.balances.errors.push(e.message);
    }
    
    // STEP 2: Detect and Reconcile Payouts
    if (!options.skipPayoutReconciliation) {
      Logger.log('[STEP_2] Detecting and reconciling payouts...');
      try {
        var payoutResult = detectAndReconcilePayouts_(options.dryRun);
        result.steps.payouts = payoutResult;
        result.summary.totalPayoutsDetected = payoutResult.detected;
        result.summary.totalPayoutsReconciled = payoutResult.reconciled;
        Logger.log('[STEP_2] ✅ Payouts processed: %s detected, %s reconciled', payoutResult.detected, payoutResult.reconciled);
    } catch (e) {
        Logger.log('[ERROR] Step 2 failed: %s', e.message);
        result.steps.payouts.status = 'error';
        result.steps.payouts.errors.push(e.message);
      }
    } else {
      Logger.log('[STEP_2] ⏭️ Skipping payout reconciliation');
      result.steps.payouts.status = 'skipped';
    }
    
    // STEP 3: Consolidate Funds to Main Accounts
    if (!options.skipConsolidation) {
      Logger.log('[STEP_3] Consolidating funds to Main accounts...');
      try {
        var consolidationResult = consolidateFundsToMain_(options.dryRun);
        result.steps.consolidation = consolidationResult;
        result.summary.totalFundsConsolidated = consolidationResult.moved;
        Logger.log('[STEP_3] ✅ Fund consolidation completed: $%s moved', consolidationResult.moved);

        // STEP 3.5: Refresh balances after consolidation (if funds were moved)
        if (consolidationResult.moved > 0 && !options.dryRun) {
          Logger.log('[STEP_3.5] Refreshing balances after consolidation...');
          try {
            var refreshResult = updateBankBalances_(sh, options.dryRun);
            Logger.log('[STEP_3.5] ✅ Balances refreshed: %s banks updated', refreshResult.updated);
          } catch (refreshErr) {
            Logger.log('[WARNING] Failed to refresh balances after consolidation: %s', refreshErr.message);
          }
        }
    } catch (e) {
        Logger.log('[ERROR] Step 3 failed: %s', e.message);
        result.steps.consolidation.status = 'error';
        result.steps.consolidation.errors.push(e.message);
      }
    } else {
      Logger.log('[STEP_3] ⏭️ Skipping fund consolidation');
      result.steps.consolidation.status = 'skipped';
    }

    // STEP 4: Calculate Monthly Expenses
    if (!options.skipExpenses) {
      Logger.log('[STEP_4] Calculating monthly expenses...');
      try {
        var expenseResult = calculateMonthlyExpenses_();
        result.steps.expenses = expenseResult;
        result.summary.totalExpensesCalculated = expenseResult.calculated ? 1 : 0;
        Logger.log('[STEP_4] ✅ Monthly expenses calculated');
      } catch (e) {
        Logger.log('[ERROR] Step 4 failed: %s', e.message);
        result.steps.expenses.status = 'error';
        result.steps.expenses.errors.push(e.message);
      }
    } else {
      Logger.log('[STEP_4] ⏭️ Skipping expense calculation');
      result.steps.expenses.status = 'skipped';
    }
    
    // Calculate final duration
    result.endTime = new Date();
    result.duration = result.endTime.getTime() - result.startTime.getTime();
    
    Logger.log('[SYNC] ✅ Unified bank data sync completed in %s ms', result.duration);
    Logger.log('=== UNIFIED BANK DATA SYNC COMPLETED ===');
    
    return result;
    
  } catch (e) {
    Logger.log('[ERROR] Unified bank data sync failed: %s', e.message);
    result.status = 'error';
    result.error = e.message;
    result.endTime = new Date();
    result.duration = result.endTime.getTime() - result.startTime.getTime();
    return result;
  }
}

function testSyncBalancesOnly() {
  /*
   * 🧪 TEST: Sync Bank Balances Only
   * Tests only the balance update functionality
   */
  Logger.log('=== TESTING: Bank Balances Only ===');
  
  var options = {
    dryRun: false,
    skipExpenses: true,
    skipConsolidation: true,
    skipPayoutReconciliation: true
  };
  
  var result = syncBanksData(options);
  
  Logger.log('=== BALANCE TEST RESULTS ===');
  Logger.log('Status: %s', result.status);
  Logger.log('Duration: %s ms', result.duration);
  Logger.log('Balances Updated: %s', result.summary.totalBalancesUpdated);
  
  if (result.steps.balances.errors.length > 0) {
    Logger.log('Balance Errors: %s', result.steps.balances.errors.join(', '));
  }
  
  return result;
}

function testSyncPayoutsOnly() {
  /*
   * 🧪 TEST: Sync Payouts Only
   * Tests only the payout detection and reconciliation
   */
  Logger.log('=== TESTING: Payouts Only ===');
  
  var options = {
    dryRun: false,
    skipExpenses: true,
    skipConsolidation: true,
    skipPayoutReconciliation: false
  };
  
  var result = syncBanksData(options);
  
  Logger.log('=== PAYOUT TEST RESULTS ===');
  Logger.log('Status: %s', result.status);
  Logger.log('Duration: %s ms', result.duration);
  Logger.log('Payouts Detected: %s', result.summary.totalPayoutsDetected);
  Logger.log('Payouts Reconciled: %s', result.summary.totalPayoutsReconciled);
  
  if (result.steps.payouts.errors.length > 0) {
    Logger.log('Payout Errors: %s', result.steps.payouts.errors.join(', '));
  }
  
  return result;
}

function testSyncConsolidationOnly() {
  /*
   * 🧪 TEST: Sync Consolidation Only
   * Tests only the fund consolidation functionality
   */
  Logger.log('=== TESTING: Consolidation Only ===');
  
  var options = {
    dryRun: false,
    skipExpenses: true,
    skipConsolidation: false,
    skipPayoutReconciliation: true
  };
  
  var result = syncBanksData(options);
  
  Logger.log('=== CONSOLIDATION TEST RESULTS ===');
  Logger.log('Status: %s', result.status);
  Logger.log('Duration: %s ms', result.duration);
  Logger.log('Funds Consolidated: $%s', result.summary.totalFundsConsolidated);
  
  if (result.steps.consolidation.errors.length > 0) {
    Logger.log('Consolidation Errors: %s', result.steps.consolidation.errors.join(', '));
  }
  
  return result;
}

function testSyncExpensesOnly() {
  /*
   * 🧪 TEST: Sync Expenses Only
   * Tests only the expense calculation functionality
   */
  Logger.log('=== TESTING: Expenses Only ===');
  
  var options = {
    dryRun: false,
    skipExpenses: false,
    skipConsolidation: true,
    skipPayoutReconciliation: true
  };
  
  var result = syncBanksData(options);
  
  Logger.log('=== EXPENSE TEST RESULTS ===');
  Logger.log('Status: %s', result.status);
  Logger.log('Duration: %s ms', result.duration);
  Logger.log('Expenses Calculated: %s', result.summary.totalExpensesCalculated);
  
  if (result.steps.expenses.errors.length > 0) {
    Logger.log('Expense Errors: %s', result.steps.expenses.errors.join(', '));
  }
  
  return result;
}

function testSyncDryRun() {
  /*
   * 🧪 TEST: Sync Dry Run
   * Tests all functionality without making actual changes
   */
  Logger.log('=== TESTING: Dry Run (All Steps) ===');
  
  var options = {
    dryRun: true,
    skipExpenses: false,
    skipConsolidation: false,
    skipPayoutReconciliation: false
  };
  
  var result = syncBanksData(options);
  
  Logger.log('=== DRY RUN TEST RESULTS ===');
  Logger.log('Status: %s', result.status);
  Logger.log('Duration: %s ms', result.duration);
  Logger.log('Balances Updated: %s', result.summary.totalBalancesUpdated);
  Logger.log('Payouts Detected: %s', result.summary.totalPayoutsDetected);
  Logger.log('Payouts Reconciled: %s', result.summary.totalPayoutsReconciled);
  Logger.log('Funds Consolidated: $%s', result.summary.totalFundsConsolidated);
  Logger.log('Expenses Calculated: %s', result.summary.totalExpensesCalculated);
  
  // Log any errors
  Object.keys(result.steps).forEach(function(step) {
    if (result.steps[step].errors && result.steps[step].errors.length > 0) {
      Logger.log('%s Errors: %s', step, result.steps[step].errors.join(', '));
    }
  });
  
  return result;
}

function testSyncFull() {
  /*
   * 🧪 TEST: Sync Full
   * Tests all functionality with actual changes
   */
  Logger.log('=== TESTING: Full Sync (All Steps) ===');
  
  var options = {
    dryRun: false,
    skipExpenses: false,
    skipConsolidation: false,
    skipPayoutReconciliation: false
  };
  
  var result = syncBanksData(options);
  
  Logger.log('=== FULL SYNC TEST RESULTS ===');
  Logger.log('Status: %s', result.status);
  Logger.log('Duration: %s ms', result.duration);
  Logger.log('Balances Updated: %s', result.summary.totalBalancesUpdated);
  Logger.log('Payouts Detected: %s', result.summary.totalPayoutsDetected);
  Logger.log('Payouts Reconciled: %s', result.summary.totalPayoutsReconciled);
  Logger.log('Funds Consolidated: $%s', result.summary.totalFundsConsolidated);
  Logger.log('Expenses Calculated: %s', result.summary.totalExpensesCalculated);
  
  // Log any errors
  Object.keys(result.steps).forEach(function(step) {
    if (result.steps[step].errors && result.steps[step].errors.length > 0) {
      Logger.log('%s Errors: %s', step, result.steps[step].errors.join(', '));
    }
  });
  
  return result;
}

