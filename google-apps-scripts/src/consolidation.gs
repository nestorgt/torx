/**
 * consolidation.gs
 *
 * Fund consolidation logic
 */

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
  var revolutBalance = parseFloat((bankBalances.revolut ? bankBalances.revolut.USD : 0) || 0);
  if (revolutBalance >= thresholdUsd + transferAmountUsd) {
    sourceBankCandidates.push({
      bankName: 'Revolut',
      balance: revolutBalance,
      canSupply: revolutBalance - transferAmountUsd,
      priority: 1
    });
  }
  
  // 2. Try Mercury as fallback
  var mercuryBalance = parseFloat((bankBalances.mercury ? bankBalances.mercury.USD : 0) || 0);
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

function consolidateUsdFundsToMain_(options) {
  Logger.log('=== STARTING FUND CONSOLIDATION ===');
  Logger.log('[FUND_CONSOLIDATION] Starting USD fund consolidation (dryRun: %s)', options.dryRun);
  
  // Check for pending transfers before starting (inline to avoid function recognition issues)
  var hasPendingTransfers = false;
  try {
    var pendingTransfers = getProp_('pending_transfers');
    if (pendingTransfers) {
      var transfers = JSON.parse(pendingTransfers);
      hasPendingTransfers = transfers.length > 0;
    }
  } catch (e) {
    Logger.log('[FUND_CONSOLIDATION] Pending transfer check error: %s', e.message);
  }
  
  if (hasPendingTransfers && !options.force) {
    Logger.log('[FUND_CONSOLIDATION] Skipping consolidation - pending transfers detected');
    return {
      skipped: true,
      reason: 'Pending transfers detected',
      pendingTransfers: [],
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

function consolidateFundsToMain_(dryRun) {
  var result = {
    status: 'success',
    moved: 0,
    errors: []
  };
  
  try {
    Logger.log('[CONSOLIDATION] Starting fund consolidation to Main accounts...');
    
    // Consolidate Revolut funds (only bank that supports programmatic transfers)
    try {
      var revolutResult = consolidateRevolutUsdFunds_(dryRun);
      result.moved += revolutResult.movedTotal || 0;
      if (revolutResult.errors && revolutResult.errors.length > 0) {
        result.errors.push('Revolut: ' + revolutResult.errors.join(', '));
      }
      Logger.log('[CONSOLIDATION] Revolut: $%s moved to Main', revolutResult.movedTotal || 0);
    } catch (e) {
      Logger.log('[ERROR] Revolut consolidation failed: %s', e.message);
      result.errors.push('Revolut: ' + e.message);
    }
    
    // Mercury consolidation (manual transfer required)
    try {
      var mercuryResult = consolidateMercuryUsdFunds_(dryRun);
      // Note: Mercury doesn't actually move funds due to API limitation
      Logger.log('[CONSOLIDATION] Mercury: Manual transfer required for $%s', mercuryResult.foundTotal || 0);
    } catch (e) {
      Logger.log('[ERROR] Mercury consolidation failed: %s', e.message);
      result.errors.push('Mercury: ' + e.message);
    }
    
    Logger.log('[CONSOLIDATION] Fund consolidation completed: $%s moved', result.moved);
    return result;
    
  } catch (e) {
    Logger.log('[ERROR] Fund consolidation failed: %s', e.message);
    result.status = 'error';
    result.errors.push(e.message);
    return result;
  }
}

