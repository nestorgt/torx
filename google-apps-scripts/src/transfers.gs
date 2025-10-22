/**
 * transfers.gs
 *
 * Transfer tracking and reconciliation
 */

function markTransferAsReceived_(transactionId, bankName) {
  /*
   * Mark a pending transfer as received/completed
   * Removes it from pending transfers and logs the completion
   */
  try {
    Logger.log('[TRANSFER_COMPLETE] Marking transfer %s (%s) as received', transactionId, bankName);
    
    // Remove from pending transfers
    clearCompletedTransfer_(transactionId);
    
    // Log completion
    Logger.log('[TRANSFER_COMPLETE] Transfer %s from %s marked as completed', transactionId, bankName || 'Unknown');
    
    return true;
  } catch (e) {
    Logger.log('[ERROR] Failed to mark transfer as received: %s', e.message);
    return false;
  }
}

function autoDetectCompletedTransfers_() {
  /*
   * Auto-detect and mark transfers as completed based on account balance changes
   * This doesn't actually check bank APIs, but provides a framework for doing so
   */
  try {
    var pendingTransfers = getPendingTransfers_();
    var completedTransfers = [];
    
    Logger.log('[AUTO_COMPLETE] Checking %s pending transfers for completion', pendingTransfers.length);
    
    // This would ideally check actual bank balances or transaction status
    // For now, just clean up very old transfers (> 5 days)
    var now = new Date().getTime();
    for (var i = 0; i < pendingTransfers.length; i++) {
      var transfer = pendingTransfers[i];
      var transferDate = new Date(transfer.timestamp).getTime();
      var daysSince = (now - transferDate) / (1000 * 60 * 60 * 24);
      
      if (daysSince > 5) {
        Logger.log('[AUTO_COMPLETE] Transfer %s is %s days old - marking as timeout', transfer.transactionId, daysSince.toFixed(1));
        completedTransfers.push(transfer.transactionId);
      }
    }
    
    // Mark detected transfers as complete
    for (var j = 0; j < completedTransfers.length; j++) {
      markTransferAsReceived_(completedTransfers[j], 'auto-timeout');
    }
    
    return completedTransfers.length;
    
  } catch (e) {
    Logger.log('[ERROR] Auto-detect completed transfers failed: %s', e.message);
    return 0;
  }
}

function detectAndReconcilePayouts_(dryRun) {
  var result = {
    status: 'success',
    detected: 0,
    reconciled: 0,
    transactionDetected: 0,
    transactionReconciled: 0,
    errors: []
  };
  
  try {
    Logger.log('[TRANSFERS] Detecting all incoming transfers on non-Main USD accounts...');

    var processedTxnState = {
      data: loadProcessedPayoutTransactions_(),
      changed: false
    };

    // Optional: fetch recent transactions from Mercury for logging purposes
    try {
      Logger.log('[TRANSFERS] Fetching recent Mercury transactions for audit...');
      var recentTxns = httpProxyJson_('/mercury/recent-transactions?limit=25');
      if (recentTxns && recentTxns.transactions) {
        recentTxns.transactions.slice(0, 5).forEach(function(tx) {
          Logger.log('[MERCURY_TX] %s | %s | %s %s', tx.postedAt || tx.createdAt || 'Unknown date', tx.accountName || 'Unknown account', tx.amount || '0', tx.amountCurrency || '');
        });
      }
    } catch (txErr) {
      Logger.log('[TRANSFERS] Warning: Unable to fetch recent Mercury transactions: %s', txErr.message);
    }
    
    // Check Mercury accounts
    try {
      var mercuryAccounts = getMercuryAccounts_();
      for (var i = 0; i < mercuryAccounts.length; i++) {
        var account = mercuryAccounts[i];
        var accountName = account.name || account.displayName || 'Unknown';
        var currency = account.currency || 'USD';
        var balance = account.balance || 0;
        
        // Skip non-USD accounts
        if (currency.toUpperCase() !== 'USD') continue;
        
        // Skip Main account
        var isMainAccount = (
          (account.name ? account.name.includes('2290') : false) || 
          (account.nickname ? account.nickname.includes('2290') : false) ||
          account.isMainAccount === true ||
          (account.nickname ? account.nickname.toLowerCase().includes('main') : false)
        );
        
        if (isMainAccount) continue;
        
        if (balance > 0) {
          result.detected++;
          Logger.log('[TRANSFERS] Detected Mercury transfer: $%s USD on %s (non-Main account)', balance, accountName);
          
          if (!dryRun) {
            try {
              var reconciliationResult = reconcileTransferWithSpreadsheet(balance, 'Mercury', accountName);
              if (reconciliationResult.success) {
                result.reconciled++;
                Logger.log('[TRANSFERS] ✅ Mercury transfer reconciled: %s', reconciliationResult.message);
              } else {
                Logger.log('[TRANSFERS] ⚠️ Mercury transfer not reconciled: %s', reconciliationResult.error);
              }
            } catch (e) {
              Logger.log('[ERROR] Mercury transfer reconciliation failed: %s', e.message);
              result.errors.push('Mercury reconciliation: ' + e.message);
            }
          }
        }
      }
    } catch (e) {
      Logger.log('[ERROR] Mercury transfer detection failed: %s', e.message);
      result.errors.push('Mercury detection: ' + e.message);
    }
    
    // Check Revolut accounts
    try {
      var revolutAccounts = getRevolutAccounts_();
      for (var i = 0; i < revolutAccounts.length; i++) {
        var account = revolutAccounts[i];
        var accountName = account.name || account.displayName || 'Unknown';
        var currency = account.currency || 'USD';
        var balance = account.balance || 0;
        
        // Skip non-USD accounts
        if (currency.toUpperCase() !== 'USD') continue;
        
        // Skip Main account
        if (accountName.toLowerCase().includes('main')) continue;
        
        if (balance > 0) {
          result.detected++;
          Logger.log('[TRANSFERS] Detected Revolut transfer: $%s USD on %s (non-Main account)', balance, accountName);
          
          if (!dryRun) {
            try {
              var reconciliationResult = reconcileTransferWithSpreadsheet(balance, 'Revolut', accountName);
              if (reconciliationResult.success) {
                result.reconciled++;
                Logger.log('[TRANSFERS] ✅ Revolut transfer reconciled: %s', reconciliationResult.message);
              } else {
                Logger.log('[TRANSFERS] ⚠️ Revolut transfer not reconciled: %s', reconciliationResult.error);
              }
            } catch (e) {
              Logger.log('[ERROR] Revolut transfer reconciliation failed: %s', e.message);
              result.errors.push('Revolut reconciliation: ' + e.message);
            }
          }
        }
      }
    } catch (e) {
      Logger.log('[ERROR] Revolut transfer detection failed: %s', e.message);
      result.errors.push('Revolut detection: ' + e.message);
    }
    
    // Process recent Mercury transactions to ensure payouts are reconciled even after balances move
    try {
      processMercuryTransactionsForPayouts_(dryRun, result, processedTxnState);
    } catch (merTxErr) {
      Logger.log('[TRANSFERS] Warning: Mercury transaction processing failed: %s', merTxErr.message);
      result.errors.push('Mercury transaction processing: ' + merTxErr.message);
    }

    // Persist processed transaction ids
    if (!dryRun && processedTxnState.changed) {
      saveProcessedPayoutTransactions_(processedTxnState.data);
    }

    Logger.log('[TRANSFERS] Transfer detection completed: %s detected, %s reconciled', result.detected, result.reconciled);
    if (result.transactionDetected || result.transactionReconciled) {
      Logger.log('[TRANSFERS] Transaction-level reconciliation: %s detected, %s reconciled', result.transactionDetected, result.transactionReconciled);
    }
    return result;
    
  } catch (e) {
    Logger.log('[ERROR] Transfer detection and reconciliation failed: %s', e.message);
    result.status = 'error';
    result.errors.push(e.message);
    return result;
  }
}

function getTransfersByBank_(bankName) {
  // Get all pending transfers for a specific bank
  // Useful for bank-specific consolidation logic
  try {
    var allTransfers = getPendingTransfers_();
    return allTransfers.filter(t => t.bankName === bankName);
  } catch (e) {
    Logger.log('[ERROR] getTransfersByBank_ failed for %s: %s', bankName, e.message);
    return [];
  }
}

function reconcileTransferWithSpreadsheet(receivedAmount, bankName, accountName) {
  /*
   * 🔄 RECONCILE ALL TRANSFERS WITH SPREADSHEET
   * 
   * This function reconciles ANY incoming transfer (not just payouts)
   * with the Payouts sheet, marking them as "Received" in column H
   * 
   * @param {number} receivedAmount - Amount received
   * @param {string} bankName - Bank name (Mercury/Revolut)
   * @param {string} accountName - Account name where transfer was received
   */
  try {
    Logger.log('[TRANSFER_RECONCILE] Reconciling transfer: $' + receivedAmount + ' from ' + bankName + ' (' + accountName + ')');
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payouts');
    if (!sheet) {
      Logger.log('[ERROR] Could not find Payouts sheet');
      return { success: false, error: 'Payouts sheet not found' };
    }
    
    // Get the data from A22 downwards (User, Platform, Account ID, Month, Day, Amount, Received)
    var lastRow = sheet.getLastRow();
    if (lastRow < 22) {
      Logger.log('[ERROR] No payout data found (sheet too short)');
      return { success: false, error: 'No payout data found' };
    }
    
    var payoutData = sheet.getRange(22, 1, lastRow - 21, 8).getValues();
    Logger.log('[TRANSFER_RECONCILE] Checking ' + payoutData.length + ' payout entries...');
    
    // Debug: Show first few entries to understand the data structure
    for (var d = 0; d < Math.min(5, payoutData.length); d++) {
      var debugRow = payoutData[d];
      Logger.log('[TRANSFER_RECONCILE] DEBUG Row ' + (d + 22) + ': User="' + debugRow[0] + '", Platform="' + debugRow[1] + '", Amount=' + debugRow[6] + ', Received=' + debugRow[7] + ' (checkbox)');
      // Debug all columns to find the correct amount column
      Logger.log('[TRANSFER_RECONCILE] DEBUG All columns: A="' + debugRow[0] + '", B="' + debugRow[1] + '", C="' + debugRow[2] + '", D="' + debugRow[3] + '", E="' + debugRow[4] + '", F="' + debugRow[5] + '", G="' + debugRow[6] + '", H="' + debugRow[7] + '"');
    }
    
    var bestMatch = { row: -1, score: 0, adjustment: 0 };
    
    // Look for unmatched payouts that could match this received amount
    for (var i = 0; i < payoutData.length; i++) {
      var row = payoutData[i];
      var userName = String(row[0] || '').trim(); // Column A (User)
      var platform = String(row[1] || '').trim(); // Column B (Platform)
      var baseAmount = Number(row[6] || 0); // Column G (Amount)
      var received = row[7]; // Column H (Received) - checkbox value

      // Skip empty rows (no user name)
      if (!userName) {
        continue;
      }

      // Skip if already marked as received (checkbox is checked)
      if (received === true || received === 'true' || received === 'received' || received === 'yes' || String(received).toLowerCase() === 'true') {
        Logger.log('[TRANSFER_RECONCILE] Row ' + (i + 22) + ': SKIPPED (already received) - User="' + userName + '", Received=' + received);
        continue;
      }

      // Skip if no base amount
      if (baseAmount <= 0) {
        continue;
      }
      
      // Calculate expected amount based on platform
      var expectedCalc = calculateExpectedPayoutAmount_(platform, baseAmount);
      
      // Debug logging for troubleshooting
      Logger.log('[TRANSFER_RECONCILE] Row ' + (i + 22) + ': Platform="' + platform + '", Base=$' + baseAmount + ', Expected=$' + expectedCalc.expected + ', Range=$' + expectedCalc.min + '-$' + expectedCalc.max + ', Received=$' + receivedAmount);
      
      // Check if received amount matches expected range
      if (receivedAmount >= expectedCalc.min && receivedAmount <= expectedCalc.max) {
        var score = 1 - Math.abs(receivedAmount - expectedCalc.expected) / expectedCalc.expected;
        Logger.log('[TRANSFER_RECONCILE] ✅ MATCH: Row ' + (i + 22) + ': Platform=' + platform + ', Base=$' + baseAmount + ', Expected=' + expectedCalc.expected + ', Score=' + score.toFixed(3));
        
        if (score > bestMatch.score) {
          bestMatch = { 
            row: i + 22, 
            score: score, 
            adjustment: receivedAmount - baseAmount,
            platform: platform,
            baseAmount: baseAmount
          };
        }
      }
    }
    
    // If we found a good match (score > 0.8), mark it as received
    if (bestMatch.score > 0.8) {
      var reconcileRow = bestMatch.row;
      var adjustmentAmount = bestMatch.adjustment;

      Logger.log('[TRANSFER_RECONCILE] ⭐ MARKING AS RECEIVED: Row=' + reconcileRow + ', Column=H(8), Value=TRUE');

      // Mark as received
      try {
        sheet.getRange(reconcileRow, 8).setValue(true); // Column H - Check the checkbox
        Logger.log('[TRANSFER_RECONCILE] ✅ Checkbox set successfully at row ' + reconcileRow);
      } catch (e) {
        Logger.log('[ERROR] Failed to set checkbox at row ' + reconcileRow + ': ' + e.message);
        throw e;
      }

      var referenceValue = sheet.getRange(reconcileRow, 1).getValue();
      Logger.log('[TRANSFER_RECONCILE] Reference value from Column A: "' + referenceValue + '"');

      sendPaymentsReceivedNotification([{ reference: referenceValue, amount: receivedAmount }]);
      
      // Add adjustment note if needed
      if (Math.abs(adjustmentAmount) > 10) { // Only note significant adjustments
        var note = receivedAmount + ' received (base: ' + bestMatch.baseAmount + ', adjustment: ' + (adjustmentAmount >= 0 ? '+' : '') + adjustmentAmount.toFixed(2) + ')';
        Logger.log('[TRANSFER_RECONCILE] Marked row ' + reconcileRow + ' as received: ' + note);
        
        return { 
          success: true, 
          matchedRow: reconcileRow,
          adjustment: adjustmentAmount,
          message: 'Reconciled with row ' + reconcileRow + ': ' + bestMatch.platform + ' transfer',
          note: note
        };
      } else {
        Logger.log('[TRANSFER_RECONCILE] Marked row ' + reconcileRow + ' as received: $' + receivedAmount);
        return { 
          success: true, 
          matchedRow: reconcileRow,
          adjustment: adjustmentAmount,
          message: 'Reconciled with row ' + reconcileRow + ': ' + bestMatch.platform + ' transfer'
        };
      }
    } else {
      Logger.log('[TRANSFER_RECONCILE] No suitable match found for $' + receivedAmount + ' (best score: ' + bestMatch.score.toFixed(3) + ')');

      // Try to find combinations of pending payouts that might match this amount
      Logger.log('[TRANSFER_RECONCILE] 💡 Checking for possible combinations of multiple payouts...');
      var pendingPayouts = [];
      for (var i = 0; i < payoutData.length; i++) {
        var row = payoutData[i];
        var userName = String(row[0] || '').trim();
        var platform = String(row[1] || '').trim();
        var baseAmount = Number(row[6] || 0);
        var received = row[7];

        if (!userName || received === true || baseAmount <= 0) continue;

        var expectedCalc = calculateExpectedPayoutAmount_(platform, baseAmount);
        pendingPayouts.push({
          row: i + 22,
          user: userName,
          platform: platform,
          base: baseAmount,
          expected: expectedCalc.expected,
          min: expectedCalc.min,
          max: expectedCalc.max
        });
      }

      // Check for 2-payout combinations
      for (var a = 0; a < pendingPayouts.length; a++) {
        for (var b = a + 1; b < pendingPayouts.length; b++) {
          var combo = pendingPayouts[a].expected + pendingPayouts[b].expected;
          var tolerance = receivedAmount * 0.05; // 5% tolerance

          if (Math.abs(combo - receivedAmount) < tolerance) {
            Logger.log('[TRANSFER_RECONCILE] 💡 POSSIBLE MATCH - Two payouts:');
            Logger.log('[TRANSFER_RECONCILE]   Row %s: %s - %s $%s (expected: $%s)',
              pendingPayouts[a].row, pendingPayouts[a].user, pendingPayouts[a].platform,
              pendingPayouts[a].base, pendingPayouts[a].expected);
            Logger.log('[TRANSFER_RECONCILE]   Row %s: %s - %s $%s (expected: $%s)',
              pendingPayouts[b].row, pendingPayouts[b].user, pendingPayouts[b].platform,
              pendingPayouts[b].base, pendingPayouts[b].expected);
            Logger.log('[TRANSFER_RECONCILE]   Combined expected: $%s, Received: $%s (diff: $%s)',
              combo, receivedAmount, Math.abs(combo - receivedAmount));
          }
        }
      }

      return {
        success: false,
        error: 'No suitable match found for $' + receivedAmount + ' from ' + bankName + ' (' + accountName + ')',
        bestScore: bestMatch.score
      };
    }
    
  } catch (e) {
    Logger.log('[ERROR] Transfer reconciliation failed: %s', e.message);
    return { success: false, error: e.message };
  }
}

function loadProcessedPayoutTransactions_() {
  /*
   * Load the set of processed transaction IDs from PropertiesService
   */
  try {
    var properties = PropertiesService.getScriptProperties();
    var data = properties.getProperty('processed_payout_transactions');
    if (!data) {
      return new Set();
    }
    var transactionIds = JSON.parse(data);
    return new Set(transactionIds);
  } catch (e) {
    Logger.log('[ERROR] Failed to load processed payout transactions: %s', e.message);
    return new Set();
  }
}

function saveProcessedPayoutTransactions_(transactionSet) {
  /*
   * Save the set of processed transaction IDs to PropertiesService
   */
  try {
    var properties = PropertiesService.getScriptProperties();
    var transactionIds = Array.from(transactionSet);
    properties.setProperty('processed_payout_transactions', JSON.stringify(transactionIds));
    Logger.log('[PROCESSED_TXNS] Saved %s processed transaction IDs', transactionIds.length);
  } catch (e) {
    Logger.log('[ERROR] Failed to save processed payout transactions: %s', e.message);
  }
}

function getPendingTransfers_() {
  /*
   * Get all pending transfers from PropertiesService
   * Returns an array of transfer objects
   */
  try {
    var properties = PropertiesService.getScriptProperties();
    var data = properties.getProperty('pending_transfers');
    if (!data) {
      return [];
    }
    return JSON.parse(data);
  } catch (e) {
    Logger.log('[ERROR] Failed to load pending transfers: %s', e.message);
    return [];
  }
}

function addPendingTransfer_(accountId, amount, currency, transactionId, bankName) {
  /*
   * Add a pending transfer to track
   * @param {string} accountId - Account identifier
   * @param {number} amount - Transfer amount
   * @param {string} currency - Currency code (USD, EUR, etc)
   * @param {string} transactionId - Unique transaction ID
   * @param {string} bankName - Bank name (Mercury, Revolut, etc)
   */
  try {
    var transfers = getPendingTransfers_();

    var transfer = {
      accountId: accountId,
      amount: amount,
      currency: currency,
      transactionId: transactionId,
      bankName: bankName,
      timestamp: new Date().toISOString()
    };

    transfers.push(transfer);

    var properties = PropertiesService.getScriptProperties();
    properties.setProperty('pending_transfers', JSON.stringify(transfers));

    Logger.log('[PENDING_TRANSFER] Added: %s %s %s from %s (ID: %s)', amount, currency, accountId, bankName, transactionId);

    return transfer;
  } catch (e) {
    Logger.log('[ERROR] Failed to add pending transfer: %s', e.message);
    return null;
  }
}

function clearPendingTransfer_(transactionId) {
  /*
   * Remove a pending transfer by transaction ID
   */
  try {
    var transfers = getPendingTransfers_();
    var filtered = transfers.filter(function(t) {
      return t.transactionId !== transactionId;
    });

    var properties = PropertiesService.getScriptProperties();
    properties.setProperty('pending_transfers', JSON.stringify(filtered));

    Logger.log('[PENDING_TRANSFER] Cleared: %s (remaining: %s)', transactionId, filtered.length);

    return true;
  } catch (e) {
    Logger.log('[ERROR] Failed to clear pending transfer: %s', e.message);
    return false;
  }
}

function clearCompletedTransfer_(transactionId) {
  /*
   * Alias for clearPendingTransfer_ for backward compatibility
   */
  return clearPendingTransfer_(transactionId);
}

