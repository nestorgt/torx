/**
 * balances.gs
 *
 * Balance management and updates
 */

function adjustBalancesForPendingTransfers_(balances) {
  /*
   * Adjust bank balances to account for pending outbound transfers
   * This ensures consolidation doesn't double-count funds already "in transit"
   * Note: Wise and Nexo removed - not counted towards total
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

      // Note: Wise and Nexo pending transfers no longer tracked - not counted towards total
    }

    return balances;

  } catch (e) {
    Logger.log('[ERROR] Failed to adjust balances for pending transfers: %s', e.message);
    return balances;
  }
}

function fetchAllBankUsdBalances_() {
  /*
   * STEP 1: Fetch USD balances from all banks
   * Returns detailed balance information for each bank's Main account
   * Note: Wise and Nexo removed from balance tracking (not counted towards total)
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

  // Note: Wise and Nexo balances no longer fetched - not counted towards total
  // Nexo transactions are still tracked for expense calculation (Revolut→Nestor→Nexo)

  // Adjust balances for pending transfers from previous consolidation systems
  balances = adjustBalancesForPendingTransfers_(balances);

  return balances;
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
    var summary = '🏦 BANK BALANCE ANALYSIS (DRY RUN)\n\n';
    
    for (var j = 0; j < results.length; j++) {
      var result = results[j];
      var status = result.needsTopup ? '⚠️ NEEDS TOPUP' : '✅ OK';
      summary += String.format(
        '%s: $%.2f / $%d required %s\n',
        result.bankName,
        result.currentBalance,
        MIN_BALANCE_USD,
        status
      );
      
      if (result.needsTopup) {
        summary += String.format('  → Would transfer $%.2f from Revolut\n', result.topupAmount);
      }
    }
    
    summary += '\n';
    
    if (needsTopup.length > 0) {
      var totalToTransfer = needsTopup.reduce(function(sum, topup) { return sum + topup.topupAmount; }, 0);
      summary += String.format(
        '📊 SUMMARY: %d banks need topup\nTotal to transfer: $%.2f\n\n',
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

function updateBankBalance_(sh, bankName, summary, note) {
  try {
    Logger.log('[BALANCE] Updating %s balance: %s', bankName, JSON.stringify(summary));

    var bankCells = CELLS[bankName];
    if (!bankCells) {
      Logger.log('[ERROR] No cell mapping found for bank: %s', bankName);
      return;
    }

    if (summary.USD !== undefined) {
      // Pass empty string to avoid adding timestamp notes
      setCellKeepFmt_(sh, bankCells.USD, summary.USD, '');
    }

    if (summary.EUR !== undefined && bankCells.EUR) {
      // Pass empty string to avoid adding timestamp notes
      setCellKeepFmt_(sh, bankCells.EUR, summary.EUR, '');
    }

    // Update timestamp
    sh.getRange(TS_CELL).setValue(nowStampCell_());

    Logger.log('[BALANCE] ✅ %s balance updated successfully', bankName);
  } catch (e) {
    Logger.log('[ERROR] Failed to update %s balance: %s', bankName, e.message);
  }
}

function updateAllBalances() {
  /*
   * 🔄 UPDATE ALL BALANCES (Legacy)
   * 
   * This function now uses the unified syncBanksData method
   * for consistency and better error handling
   */
  
  try {
    Logger.log('=== STARTING BALANCE UPDATE (Legacy) ===');
    
    // Use the unified sync method with default options
    var result = syncBanksData({
      dryRun: false,
      skipExpenses: false,
      skipConsolidation: false,
      skipPayoutReconciliation: false
    });
    
    if (result.status === 'success') {
      Logger.log('=== BALANCE UPDATE COMPLETED ===');
      Logger.log('Sync completed in %s ms', result.duration);
      Logger.log('Balances updated: %s', result.summary.totalBalancesUpdated);
      Logger.log('Payouts detected: %s', result.summary.totalPayoutsDetected);
      Logger.log('Payouts reconciled: %s', result.summary.totalPayoutsReconciled);
      Logger.log('Funds consolidated: $%s', result.summary.totalFundsConsolidated);
      Logger.log('Expenses calculated: %s', result.summary.totalExpensesCalculated);
    } else {
      Logger.log('[ERROR] Balance update failed: %s', result.error);
    }
    
  } catch (e) {
    Logger.log('[ERROR] Balance update failed: %s', e.message);
    Logger.log('[ERROR] Stack trace: %s', e.stack);
  }
}

function updateBankBalances_(sh, dryRun) {
  var result = {
    status: 'success',
    updated: 0,
    errors: []
  };
  
  try {
    // Update Mercury
    try {
      var mercurySummary = fetchMercurySummary_();
      updateBankBalance_(sh, 'Mercury', mercurySummary, mercurySummary && mercurySummary.error ? mercurySummary.error : null);
      result.updated++;
    } catch (e) {
      Logger.log('[ERROR] Mercury balance update failed: %s', e.message);
      result.errors.push('Mercury: ' + e.message);
      var mercuryCells = CELLS['Mercury'];
      if (mercuryCells && mercuryCells.USD) {
        setNoteOnly_(sh, mercuryCells.USD, 'Error updating Mercury balance: ' + e.message);
      }
    }

    // Update Airwallex
    try {
      var airwallexSummary = fetchAirwallexSummary_();
      updateBankBalance_(sh, 'Airwallex', airwallexSummary, airwallexSummary && airwallexSummary.error ? airwallexSummary.error : null);
      result.updated++;
    } catch (e) {
      Logger.log('[ERROR] Airwallex balance update failed: %s', e.message);
      result.errors.push('Airwallex: ' + e.message);
      var airwallexCells = CELLS['Airwallex'];
      if (airwallexCells && airwallexCells.USD) {
        setNoteOnly_(sh, airwallexCells.USD, 'Error updating Airwallex balance: ' + e.message);
      }
    }

    // Update Revolut
    try {
      var revolutSummary = fetchRevolutSummary_();
      updateBankBalance_(sh, 'Revolut', revolutSummary, revolutSummary && revolutSummary.error ? revolutSummary.error : null);
      result.updated++;
    } catch (e) {
      Logger.log('[ERROR] Revolut balance update failed: %s', e.message);
      result.errors.push('Revolut: ' + e.message);
      var revolutCells = CELLS['Revolut'];
      if (revolutCells && revolutCells.USD) {
        setNoteOnly_(sh, revolutCells.USD, 'Error updating Revolut balance: ' + e.message);
      }
    }

    // Note: Wise and Nexo balance updates removed - not counted towards total
    // Nexo transactions are still tracked for expense calculation (Revolut→Nestor→Nexo)

    Logger.log('[BALANCES] Updated %s bank balances', result.updated);
    if (!dryRun) {
      try {
        sh.getRange(TS_CELL).setValue(nowStampCell_());
      } catch (tsError) {
        Logger.log('[WARNING] Failed to update timestamp cell %s: %s', TS_CELL, tsError.message);
      }
    }
    return result;
    
  } catch (e) {
    Logger.log('[ERROR] Bank balance update failed: %s', e.message);
    result.status = 'error';
    result.errors.push(e.message);
    return result;
  }
}

