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
    // Load previously processed Mercury balances to detect only NEW deposits
    var mercuryProcessedBalances = loadMercuryProcessedBalances_();

    try {
      var mercuryAccounts = getMercuryAccounts_();
      for (var i = 0; i < mercuryAccounts.length; i++) {
        var account = mercuryAccounts[i];
        var accountName = account.name || account.displayName || 'Unknown';
        var accountId = account.id || accountName;
        // Use nickname for user matching (Mercury accounts have user names in nickname field)
        var userIdentifier = account.nickname || accountName;
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
          // Calculate the NEW deposit amount (delta from last known balance)
          var lastKnownBalance = mercuryProcessedBalances[accountId] || 0;
          var newDeposit = balance - lastKnownBalance;

          Logger.log('[TRANSFERS] Mercury account %s (nickname: %s): Current=$%s, LastKnown=$%s, NewDeposit=$%s',
            accountName, userIdentifier, balance, lastKnownBalance, newDeposit);

          // Only reconcile if there's a NEW deposit (delta > 0)
          if (newDeposit > 0) {
            result.detected++;
            Logger.log('[TRANSFERS] Detected NEW Mercury deposit: $%s USD on %s (nickname: %s)', newDeposit, accountName, userIdentifier);

            if (!dryRun) {
              try {
                // Use userIdentifier (nickname) for reconciliation to match user names
                // Reconcile only the NEW deposit amount, not the total balance
                var reconciliationResult = reconcileTransferWithSpreadsheet(newDeposit, 'Mercury', userIdentifier);
                if (reconciliationResult.success) {
                  result.reconciled++;
                  Logger.log('[TRANSFERS] ✅ Mercury transfer reconciled: %s', reconciliationResult.message);
                  // Update the processed balance after successful reconciliation
                  mercuryProcessedBalances[accountId] = balance;
                } else {
                  Logger.log('[TRANSFERS] ⚠️ Mercury transfer not reconciled: %s', reconciliationResult.error);
                  // Still update the balance to avoid re-trying the same amount
                  // The payout might not exist in the sheet yet
                  mercuryProcessedBalances[accountId] = balance;
                }
              } catch (e) {
                Logger.log('[ERROR] Mercury transfer reconciliation failed: %s', e.message);
                result.errors.push('Mercury reconciliation: ' + e.message);
              }
            }
          } else if (balance > 0 && newDeposit === 0) {
            Logger.log('[TRANSFERS] Mercury account %s: No new deposits (balance unchanged at $%s)', accountName, balance);
          }
        } else {
          // Balance is 0, clear the processed balance tracking
          if (mercuryProcessedBalances[accountId]) {
            Logger.log('[TRANSFERS] Mercury account %s: Balance cleared (was $%s, now $0)', accountName, mercuryProcessedBalances[accountId]);
            delete mercuryProcessedBalances[accountId];
          }
        }
      }

      // Save updated processed balances
      if (!dryRun) {
        saveMercuryProcessedBalances_(mercuryProcessedBalances);
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

    // Note: Revolut transaction processing disabled - endpoint /revolut/recent-transactions not available
    // Revolut reconciliation happens during consolidation step instead

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

function getUserIdFromAccountName_(accountName) {
  /*
   * Look up user ID (e.g., "T-11-Cris") from full name (e.g., "Cristina Otero Blanco")
   * Uses the Users sheet: L1 has user IDs, L7 has full names
   */
  try {
    var usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    if (!usersSheet) {
      Logger.log('[WARN] Users sheet not found, cannot match account name to user');
      return null;
    }

    // Get user IDs from row 1 (L1, M1, N1, etc.)
    var userIds = usersSheet.getRange(1, 12, 1, 20).getValues()[0]; // L1:AE1

    // Get full names from row 7 (L7, M7, N7, etc.)
    var fullNames = usersSheet.getRange(7, 12, 1, 20).getValues()[0]; // L7:AE7

    // Find matching full name
    for (var i = 0; i < fullNames.length; i++) {
      var fullName = String(fullNames[i] || '').trim();
      if (fullName && accountName.indexOf(fullName) >= 0) {
        var userId = String(userIds[i] || '').trim();
        Logger.log('[USER_MATCH] Account "%s" matched to user "%s" (full name: "%s")', accountName, userId, fullName);
        return userId;
      }
    }

    Logger.log('[USER_MATCH] No user match found for account name: "%s"', accountName);
    return null;
  } catch (e) {
    Logger.log('[ERROR] getUserIdFromAccountName_ failed: %s', e.message);
    return null;
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

    // Look up which user this account belongs to
    var expectedUserId = getUserIdFromAccountName_(accountName);

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

      // Skip if this payout doesn't belong to the expected user
      if (expectedUserId && userName !== expectedUserId) {
        Logger.log('[TRANSFER_RECONCILE] Row ' + (i + 22) + ': SKIPPED (wrong user) - User="' + userName + '", Expected="' + expectedUserId + '"');
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

      sendPaymentsReceivedNotification([{
        reference: referenceValue,
        baseAmount: bestMatch.baseAmount,
        receivedAmount: receivedAmount
      }]);
      
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
      if (expectedUserId) {
        Logger.log('[TRANSFER_RECONCILE] 💡 Filtering combinations for user: %s', expectedUserId);
      }

      var pendingPayouts = [];
      for (var i = 0; i < payoutData.length; i++) {
        var row = payoutData[i];
        var userName = String(row[0] || '').trim();
        var platform = String(row[1] || '').trim();
        var baseAmount = Number(row[6] || 0);
        var received = row[7];

        if (!userName || received === true || baseAmount <= 0) continue;

        // If we know which user this account belongs to, only consider their payouts
        if (expectedUserId && userName !== expectedUserId) continue;

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

      Logger.log('[TRANSFER_RECONCILE] 💡 Found %s pending payouts to check', pendingPayouts.length);

      // Check for 2-payout combinations and find the best match
      var bestCombo = null;
      var bestDiff = Infinity;
      var tolerance = receivedAmount * 0.05; // 5% tolerance

      for (var a = 0; a < pendingPayouts.length; a++) {
        for (var b = a + 1; b < pendingPayouts.length; b++) {
          // Only combine payouts from the same user and same platform
          if (pendingPayouts[a].user !== pendingPayouts[b].user) {
            continue; // Different users - skip
          }
          if (pendingPayouts[a].platform !== pendingPayouts[b].platform) {
            continue; // Different platforms - skip
          }

          var combo = pendingPayouts[a].expected + pendingPayouts[b].expected;
          var diff = Math.abs(combo - receivedAmount);

          if (diff < tolerance) {
            Logger.log('[TRANSFER_RECONCILE] 💡 POSSIBLE MATCH - Two payouts:');
            Logger.log('[TRANSFER_RECONCILE]   Row %s: %s - %s $%s (expected: $%s)',
              pendingPayouts[a].row, pendingPayouts[a].user, pendingPayouts[a].platform,
              pendingPayouts[a].base, pendingPayouts[a].expected);
            Logger.log('[TRANSFER_RECONCILE]   Row %s: %s - %s $%s (expected: $%s)',
              pendingPayouts[b].row, pendingPayouts[b].user, pendingPayouts[b].platform,
              pendingPayouts[b].base, pendingPayouts[b].expected);
            Logger.log('[TRANSFER_RECONCILE]   Combined expected: $%s, Received: $%s (diff: $%s)',
              combo, receivedAmount, diff);

            // Track the best match
            // If difference is the same, prefer older payouts (higher row numbers)
            var shouldUpdate = false;
            if (diff < bestDiff) {
              shouldUpdate = true;
            } else if (diff === bestDiff && bestCombo) {
              // Same difference - prefer the combination with older (higher row number) payouts
              var currentMaxRow = Math.max(pendingPayouts[a].row, pendingPayouts[b].row);
              var bestMaxRow = Math.max(bestCombo.payoutA.row, bestCombo.payoutB.row);
              if (currentMaxRow > bestMaxRow) {
                shouldUpdate = true;
              }
            }

            if (shouldUpdate) {
              bestDiff = diff;
              bestCombo = {
                payoutA: pendingPayouts[a],
                payoutB: pendingPayouts[b],
                combo: combo,
                diff: diff
              };
            }
          }
        }
      }

      // Check for 3-payout combinations if no 2-payout match was found
      if (!bestCombo || bestDiff >= tolerance) {
        for (var a = 0; a < pendingPayouts.length; a++) {
          for (var b = a + 1; b < pendingPayouts.length; b++) {
            for (var c = b + 1; c < pendingPayouts.length; c++) {
              // Only combine payouts from the same user and same platform
              if (pendingPayouts[a].user !== pendingPayouts[b].user ||
                  pendingPayouts[a].user !== pendingPayouts[c].user) {
                continue; // Different users - skip
              }
              if (pendingPayouts[a].platform !== pendingPayouts[b].platform ||
                  pendingPayouts[a].platform !== pendingPayouts[c].platform) {
                continue; // Different platforms - skip
              }

              var combo = pendingPayouts[a].expected + pendingPayouts[b].expected + pendingPayouts[c].expected;
              var diff = Math.abs(combo - receivedAmount);

              if (diff < tolerance && diff < bestDiff) {
                Logger.log('[TRANSFER_RECONCILE] 💡 POSSIBLE MATCH - Three payouts:');
                Logger.log('[TRANSFER_RECONCILE]   Row %s: %s - %s $%s (expected: $%s)',
                  pendingPayouts[a].row, pendingPayouts[a].user, pendingPayouts[a].platform,
                  pendingPayouts[a].base, pendingPayouts[a].expected);
                Logger.log('[TRANSFER_RECONCILE]   Row %s: %s - %s $%s (expected: $%s)',
                  pendingPayouts[b].row, pendingPayouts[b].user, pendingPayouts[b].platform,
                  pendingPayouts[b].base, pendingPayouts[b].expected);
                Logger.log('[TRANSFER_RECONCILE]   Row %s: %s - %s $%s (expected: $%s)',
                  pendingPayouts[c].row, pendingPayouts[c].user, pendingPayouts[c].platform,
                  pendingPayouts[c].base, pendingPayouts[c].expected);
                Logger.log('[TRANSFER_RECONCILE]   Combined expected: $%s, Received: $%s (diff: $%s)',
                  combo, receivedAmount, diff);

                bestDiff = diff;
                bestCombo = {
                  payoutA: pendingPayouts[a],
                  payoutB: pendingPayouts[b],
                  payoutC: pendingPayouts[c],
                  combo: combo,
                  diff: diff,
                  count: 3
                };
              }
            }
          }
        }
      }

      // If we found a good combination match, automatically mark the rows
      if (bestCombo && bestDiff < tolerance) {
        var isThreePayout = bestCombo.count === 3;

        if (isThreePayout) {
          Logger.log('[TRANSFER_RECONCILE] ✅ Auto-marking BEST MATCH - Three payouts:');
          Logger.log('[TRANSFER_RECONCILE]   Row %s: %s - %s $%s',
            bestCombo.payoutA.row, bestCombo.payoutA.user, bestCombo.payoutA.platform, bestCombo.payoutA.base);
          Logger.log('[TRANSFER_RECONCILE]   Row %s: %s - %s $%s',
            bestCombo.payoutB.row, bestCombo.payoutB.user, bestCombo.payoutB.platform, bestCombo.payoutB.base);
          Logger.log('[TRANSFER_RECONCILE]   Row %s: %s - %s $%s',
            bestCombo.payoutC.row, bestCombo.payoutC.user, bestCombo.payoutC.platform, bestCombo.payoutC.base);
        } else {
          Logger.log('[TRANSFER_RECONCILE] ✅ Auto-marking BEST MATCH - Two payouts:');
          Logger.log('[TRANSFER_RECONCILE]   Row %s: %s - %s $%s',
            bestCombo.payoutA.row, bestCombo.payoutA.user, bestCombo.payoutA.platform, bestCombo.payoutA.base);
          Logger.log('[TRANSFER_RECONCILE]   Row %s: %s - %s $%s',
            bestCombo.payoutB.row, bestCombo.payoutB.user, bestCombo.payoutB.platform, bestCombo.payoutB.base);
        }

        Logger.log('[TRANSFER_RECONCILE]   Combined: $%s, Received: $%s, Diff: $%s',
          bestCombo.combo, receivedAmount, bestCombo.diff);

        // Mark rows as received
        var note = 'Combined payout from ' + bankName + ' (' + accountName + ') - $' + receivedAmount;
        var matchedRows = [];
        var notifications = [];

        // Mark first payout
        var rowA = bestCombo.payoutA.row;
        sheet.getRange(rowA, 8).setValue(true);
        sheet.getRange(rowA, 8).setNote(note);
        Logger.log('[TRANSFER_RECONCILE] ✅ Marked row %s as received', rowA);
        matchedRows.push(rowA);

        // Mark second payout
        var rowB = bestCombo.payoutB.row;
        sheet.getRange(rowB, 8).setValue(true);
        sheet.getRange(rowB, 8).setNote(note);
        Logger.log('[TRANSFER_RECONCILE] ✅ Marked row %s as received', rowB);
        matchedRows.push(rowB);

        // Mark third payout if it exists
        if (isThreePayout) {
          var rowC = bestCombo.payoutC.row;
          sheet.getRange(rowC, 8).setValue(true);
          sheet.getRange(rowC, 8).setNote(note);
          Logger.log('[TRANSFER_RECONCILE] ✅ Marked row %s as received', rowC);
          matchedRows.push(rowC);
        }

        // Calculate proportional received amounts for notifications
        var totalBase = bestCombo.payoutA.base + bestCombo.payoutB.base + (isThreePayout ? bestCombo.payoutC.base : 0);
        var receivedA = Math.round((bestCombo.payoutA.base / totalBase) * receivedAmount);
        var receivedB = Math.round((bestCombo.payoutB.base / totalBase) * receivedAmount);
        var receivedC = isThreePayout ? (receivedAmount - receivedA - receivedB) : 0;

        var referenceA = bestCombo.payoutA.user + ' - ' + bestCombo.payoutA.platform;
        var referenceB = bestCombo.payoutB.user + ' - ' + bestCombo.payoutB.platform;

        notifications.push({ reference: referenceA, baseAmount: bestCombo.payoutA.base, receivedAmount: receivedA });
        notifications.push({ reference: referenceB, baseAmount: bestCombo.payoutB.base, receivedAmount: receivedB });

        if (isThreePayout) {
          var referenceC = bestCombo.payoutC.user + ' - ' + bestCombo.payoutC.platform;
          notifications.push({ reference: referenceC, baseAmount: bestCombo.payoutC.base, receivedAmount: receivedC });
        }

        sendPaymentsReceivedNotification(notifications);

        return {
          success: true,
          matchedRows: matchedRows,
          combo: true,
          message: 'Reconciled combination: ' + matchedRows.join(' + ') + ' (diff: $' + bestCombo.diff.toFixed(2) + ')',
          note: note
        };
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

function loadMercuryProcessedBalances_() {
  /*
   * Load previously processed Mercury account balances from PropertiesService
   * Used for delta-based reconciliation: only reconcile NEW deposits
   * Returns: { accountId: lastKnownBalance, ... }
   */
  try {
    var properties = PropertiesService.getScriptProperties();
    var data = properties.getProperty('mercury_processed_balances');
    if (!data) {
      Logger.log('[MERCURY_BALANCES] No previous balances found, starting fresh');
      return {};
    }
    var balances = JSON.parse(data);
    Logger.log('[MERCURY_BALANCES] Loaded processed balances for %s accounts', Object.keys(balances).length);
    return balances;
  } catch (e) {
    Logger.log('[ERROR] Failed to load Mercury processed balances: %s', e.message);
    return {};
  }
}

function saveMercuryProcessedBalances_(balances) {
  /*
   * Save processed Mercury account balances to PropertiesService
   * Called after successful reconciliation to track what we've already processed
   */
  try {
    var properties = PropertiesService.getScriptProperties();
    properties.setProperty('mercury_processed_balances', JSON.stringify(balances));
    Logger.log('[MERCURY_BALANCES] Saved processed balances for %s accounts', Object.keys(balances).length);
  } catch (e) {
    Logger.log('[ERROR] Failed to save Mercury processed balances: %s', e.message);
  }
}

function clearMercuryProcessedBalances_() {
  /*
   * Clear all Mercury processed balances (useful for testing/reset)
   */
  try {
    var properties = PropertiesService.getScriptProperties();
    properties.deleteProperty('mercury_processed_balances');
    Logger.log('[MERCURY_BALANCES] Cleared all processed balances');
    return true;
  } catch (e) {
    Logger.log('[ERROR] Failed to clear Mercury processed balances: %s', e.message);
    return false;
  }
}

