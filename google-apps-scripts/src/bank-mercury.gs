/**
 * bank-mercury.gs
 *
 * Mercury bank integration
 */

function fetchMercurySummary_() { 
  return httpProxyJson_('/mercury/summary'); 
}

function fetchMercuryMainBalance_() {
  /*
   * Get Mercury Main account balance specifically (not total across all accounts)
   * This is the balance that matters for card spending and business operations
   */
  try {
    Logger.log('[MERCURY_MAIN] Fetching Main account balance specifically...');
    
    // Get detailed account breakdown
    var accountsData = httpProxyJson_('/mercury/accounts');
    
    if (accountsData && Array.isArray(accountsData.accounts)) {
      // Find the Main account (Mercury Checking ••2290)
      var mainAccount = accountsData.accounts.find(account => 
        (account.name ? account.name.includes('2290') : false) || 
        (account.nickpage ? account.nickpage.includes('2290') : false) ||
        account.isMainAccount === true
      );
      
      if (mainAccount) {
        Logger.log('[MERCURY_MAIN] Main account found: %s with $%s USD', mainAccount.name, mainAccount.balance);
        Logger.log('[MERCURY_MAIN] Available balance: $%s USD', mainAccount.availableBalance);
        
        return {
          USD: parseFloat(mainAccount.availableBalance || mainAccount.balance || 0),
          EUR: 0, // Mercury typically uses USD
          accountId: mainAccount.id,
          accountName: mainAccount.name,
          isMainAccount: true,
          note: 'Main account balance only'
        };
      } else {
        Logger.log('[WARNING] Mercury Main account not found, falling back to summary');
        // Fallback to summary if main account not found
        var summary = fetchMercurySummary_();
        return {
          USD: parseFloat(summary.USD || 0),
          EUR: parseFloat(summary.EUR || 0),
          note: 'Total across all accounts (Main account not identified)'
        };
      }
    } else {
      Logger.log('[WARNING] Mercury accounts endpoint not available, falling back to summary');
      // Fallback to summary
      var summary = fetchMercurySummary_();
      return {
        USD: parseFloat(summary.USD || 0),
        EUR: parseFloat(summary.EUR || 0),
        note: 'Total across all accounts (detailed accounts not available)'
      };
    }
  } catch (e) {
    Logger.log('[ERROR] fetchMercuryMainBalance_ failed: %s', e.message);
    // Fallback to summary on error
    try {
      var summary = fetchMercurySummary_();
      return {
        USD: parseFloat(summary.USD || 0),
        EUR: parseFloat(summary.EUR || 0),
        error: e.message,
        note: 'Fallback to summary due to error'
      };
    } catch (e2) {
      Logger.log('[ERROR] Summary fallback also failed: %s', e2.message);
      return { USD: 0, EUR: 0, error: e.message };
    }
  }
}

function getMercuryAccounts_() {
  try {
    // Try different possible Mercury endpoints
    var endpoints = ['/mercury/accounts', '/mercury/summary'];
    
    for (var i = 0; i < endpoints.length; i++) {
      try {
        Logger.log('[MERCURY] Testing endpoint: %s', endpoints[i]);
        var response = httpProxyJson_(endpoints[i]);
        Logger.log('[MERCURY] ✅ SUCCESS with endpoint %s', endpoints[i]);
        
        // Handle Mercury accounts endpoint returning individual accounts
        if (Array.isArray(response.accounts) && endpoints[i] === '/mercury/accounts') {
          Logger.log('[MERCURY] Found %s individual Mercury accounts', response.accounts.length);
          return response.accounts;
        }
        
        // Handle Mercury summary format: {"USD":9962.15,"EUR":0,"count":9}
        if (response.USD && typeof response.USD === 'number' && response.USD >= 0) {
          var totalUsd = response.USD;
          var accountCount = response.count || 1;
          
          Logger.log('[MERCURY] Summary shows $%s USD across %s accounts', totalUsd, accountCount);
          
          // For fund consolidation purposes, treat summary as Main account
          // Individual accounts would require /mercury/accounts endpoint
          if (totalUsd > 0) {
            Logger.log('[MERCURY] Treating summary as Main account - individual accounts not accessible for consolidation');
            return [{ 
              name: 'Main', 
              balance: totalUsd, 
              currency: 'USD', 
              id: 'mercury-main',
              summary: response,
              accountCount: accountCount,
              note: 'Main account balance from ' + accountCount + ' sources'
            }];
          } else {
            Logger.log('[MERCURY] No USD funds found - no consolidation needed');
            return [];
          }
        }
        
        // For other non-array responses, wrap in array
        return [response].filter(Boolean);
      } catch (e) {
        Logger.log('[MERCURY] ⚪ Endpoint %s not available (expected): %s', endpoints[i], e.message.split('HTTP')[1] || e.message);
      }
    }
    
    Logger.log('[ERROR] All Mercury endpoints failed - Mercury API may not be implemented');
    return []; // Return empty array instead of throwing error
  } catch (e) {
    Logger.log('[ERROR] Failed to get Mercury accounts: %s', e.message);
    return []; // Return empty array instead of throwing error
  }
}

function getMercuryAccountBalance_(accountId, currency) {
  try {
    Logger.log('[MERCURY] Getting balance for account %s with currency %s', accountId, currency);
    
    // Try different possible Mercury balance endpoints
    var endpoints = [
      '/mercury/balance/' + accountId + '?currency=' + currency,
      '/mercury/accounts/' + accountId + '?currency=' + currency,
      '/mercury/' + accountId + '/balance?currency=' + currency
    ];
    
    for (var i = 0; i < endpoints.length; i++) {
      try {
        Logger.log('[MERCURY] Trying balance endpoint: %s', endpoints[i]);
        var account = httpProxyJson_(endpoints[i]);
        
        var balance = account.balance || account[currency] || account.accountBalance || 0;
        Logger.log('[MERCURY] ✅ Balance endpoint %s success - %s %s balance: %s', endpoints[i], accountId, currency, balance);
        return balance;
      } catch (e) {
        Logger.log('[MERCURY] ⚪ Balance endpoint %s failed: %s', endpoints[i], e.message.split('HTTP')[1] || e.message);
      }
    }
    
    Logger.log('[WARNING] All Mercury balance endpoints failed for account %s', accountId);
    return 0;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Mercury account %s balance: %s', accountId, e.message);
    return 0;
  }
}

function mercuryTransferToMain_(fromAccountId, amount, currency, reference) {
  Logger.log('[MERCURY] Transfer request: %s -> Main, %s %s, "%s"', fromAccountId, amount, currency, reference);
  
  var body = {
    fromAccountId: fromAccountId,
    toAccountId: 'main',
    amount: amount,
    currency: currency,
    reference: reference || 'Consolidate ' + currency + ' funds to Main',
    request_id: nowStamp_() + '-' + amount + '-' + currency
  };
  
  Logger.log('[MERCURY] Transfer payload: %s', JSON.stringify(body, null, 2));
  
  // Try different transfer endpoints
  var endpoints = ['/mercury/transfer', '/mercury/move', '/mercury/consolidate'];
  
  for (var i = 0; i < endpoints.length; i++) {
    try {
      Logger.log('[MERCURY] Trying transfer endpoint: %s', endpoints[i]);
      var result = httpProxyPostJson_(endpoints[i], body);
      
      // Check if consolidation was requested (this is a success)
      if (result && result.transfer && result.transfer.status === 'consolidation_requested') {
        Logger.log('[MERCURY] ✅ Transfer endpoint %s success - consolidation requested', endpoints[i]);
        return result;
      }
      
      // Check if manual transfer is required (this is not a success, but a valid response)
      if (result && result.transfer && result.transfer.status === 'manual_required') {
        Logger.log('[MERCURY] ⚠️ Transfer endpoint %s - manual transfer required', endpoints[i]);
        return result;
      }
      
      Logger.log('[MERCURY] ✅ Transfer endpoint %s success', endpoints[i]);
      return result;
    } catch (e) {
      // Truncate HTML error responses to avoid log noise
      var errorMsg = e.message.split('HTTP')[1] || e.message;
      if (errorMsg.includes('<!DOCTYPE html>') || errorMsg.includes('<html')) {
        errorMsg = 'HTML Error Page (truncated)';
      } else if (errorMsg.length > 200) {
        errorMsg = errorMsg.substring(0, 200) + '...';
      }
      Logger.log('[MERCURY] ⚪ Transfer endpoint %s failed: %s', endpoints[i], errorMsg);
    }
  }
  
  Logger.log('[ERROR] All Mercury transfer endpoints failed');
  throw new Error('Mercury transfer failed - no available endpoints');
}

function fetchMercuryExpenses_(month, year) { 
  return httpProxyJson_('/mercury/transactions?month=' + month + '&year=' + year); 
}

function consolidateMercuryUsdFunds_(dryRun) {
  var result = {
    processed: 0,
    foundTotal: 0,
    movedTotal: 0,
    transfers: [],
    errors: []
  };
  
  try {
    // Get detailed Mercury accounts for proper consolidation
    Logger.log('[MERCURY_CONSOLIDATION] Fetching detailed Mercury accounts for consolidation...');
    var accountsData = httpProxyJson_('/mercury/accounts');
    
    if (!accountsData || !Array.isArray(accountsData.accounts)) {
      Logger.log('[ERROR] Mercury accounts endpoint not available for consolidation');
      result.errors.push('Mercury accounts endpoint not available');
      return result;
    }
    
    var accounts = accountsData.accounts;
    Logger.log('[MERCURY_CONSOLIDATION] Retrieved %s detailed Mercury accounts', accounts.length);
    
    for (var i = 0; i < accounts.length; i++) {
      var account = accounts[i];
      var accountName = account.name || account.displayName || 'Unknown';
      var accountId = account.id || account.account_id || '';
      
      result.processed++;
      
      // Identify and skip Main account (Mercury Checking ••2290)
      var currency = account.currency || 'USD';
      var isMainAccount = (
        (account.name ? account.name.includes('2290') : false) || 
        (account.nickname ? account.nickname.includes('2290') : false) ||
        account.isMainAccount === true ||
        (account.nickname ? account.nickname.toLowerCase().includes('main') : false)
      );
      
      // Skip non-USD accounts
      if (currency.toUpperCase() !== 'USD') {
        Logger.log('[MERCURY_CONSOLIDATION] Skipping non-USD account: %s (%s)', accountName, currency);
        continue;
      }
      
      if (isMainAccount) {
        Logger.log('[MERCURY_CONSOLIDATION] Skipping Main account: %s', accountName);
        continue;
      }
      
      // Use actual balance from detailed account data
      try {
        var balance = account.balance || 0;
        var availableBalance = account.availableBalance || balance;
        var usdBalance = availableBalance;
        
        Logger.log('[MERCURY_CONSOLIDATION] Account %s: $%s USD (available: $%s)', accountName, balance, availableBalance);
        
        if (usdBalance > 0) {
          result.foundTotal += usdBalance;
          
          // DETECT PAYOUT: Non-Main USD account with balance indicates a payout
          Logger.log('[MERCURY_PAYOUT] Detected payout: $%s USD on %s (non-Main account)', usdBalance, accountName);
          
          // Attempt payout reconciliation with Payouts sheet
          try {
            var reconciliationResult = reconcileTransferWithSpreadsheet(usdBalance, 'Mercury', accountName);
            if (reconciliationResult.success) {
              Logger.log('[MERCURY_PAYOUT] ✅ Payout reconciled: %s', reconciliationResult.message);
              result.payoutsReconciled = (result.payoutsReconciled || 0) + 1;
            } else {
              Logger.log('[MERCURY_PAYOUT] ⚠️ Payout not reconciled: %s', reconciliationResult.error || 'No match found');
              result.payoutsUnreconciled = (result.payoutsUnreconciled || 0) + 1;
            }
          } catch (e) {
            Logger.log('[ERROR] Payout reconciliation failed for $%s: %s', usdBalance, e.message);
          }
          
          var transfer = {
            bank: 'Mercury',
            fromAccount: accountName,
            toAccount: 'Main',
            amount: usdBalance,
            currency: 'USD',
            status: 'pending'
          };
          
          if (!dryRun) {
            try {
              Logger.log('[MERCURY_CONSOLIDATION] Attempting to consolidate $%s USD from %s to Main Account', usdBalance, accountName);
              
              // Find the Main account ID for the transfer
              var mainAccountId = null;
              for (var j = 0; j < accounts.length; j++) {
                var acc = accounts[j];
                if ((acc.name ? acc.name.includes('2290') : false) || acc.isMainAccount === true) {
                  mainAccountId = acc.id;
                  break;
                }
              }
              
              if (!mainAccountId) {
                Logger.log('[ERROR] Main account ID not found for transfer');
                throw new Error('Main account ID not found');
              }
              
              var transferResult = mercuryTransferToMain_(accountId, usdBalance, 'USD', 'Consolidate USD funds to Main');
              
              if (transferResult && transferResult.transfer && transferResult.transfer.status) {
                if (transferResult.transfer.status === 'completed' || transferResult.transfer.status === 'processing' || transferResult.transfer.status === 'consolidation_requested') {
                  transfer.status = 'success';
                  transfer.transactionId = transferResult.transfer.id;
                  result.movedTotal += usdBalance;
                  
                  // Track pending transfers (except for completed ones)
                  if (transferResult.transfer.status === 'processing' || transferResult.transfer.status === 'consolidation_requested') {
                    addPendingTransfer_(accountId, usdBalance, 'USD', transferResult.transfer.id, 'Mercury');
                  }
                  
                  Logger.log('[MERCURY_FUNDS] Successfully moved $%s USD from %s to Main (status: %s)', usdBalance, accountName, transferResult.transfer.status);
                } else if (transferResult.transfer.status === 'manual_required') {
                  transfer.status = 'manual_required';
                  transfer.transactionId = transferResult.transfer.id;
                  transfer.error = 'Manual transfer required - Mercury API does not support programmatic internal transfers';
                  
                  // Don't count as moved since it requires manual action
                  result.errors.push('Manual transfer required: $' + usdBalance + ' USD from ' + accountName + ' - Mercury API limitation');
                  
                  Logger.log('[MERCURY_FUNDS] Manual transfer required: $%s USD from %s to Main (Mercury API limitation)', usdBalance, accountName);
                } else {
                  transfer.status = 'failed';
                  transfer.error = 'Transfer status: ' + transferResult.transfer.status;
                  result.errors.push('Failed to move $' + usdBalance + ' USD from ' + accountName + ': ' + transferResult.transfer.status);
                }
              } else {
                transfer.status = 'failed';
                transfer.error = 'Invalid response';
                result.errors.push('Failed to move $' + usdBalance + ' USD from ' + accountName + ': Invalid response');
              }
            } catch (e) {
              transfer.status = 'failed';
              transfer.error = e.message;
              result.errors.push('Failed to move $' + usdBalance + ' USD from ' + accountName + ': ' + e.message);
              Logger.log('[ERROR] Failed to move $%s USD from %s to Main: %s', usdBalance, accountName, e.message);
            }
          } else {
            Logger.log('[MERCURY_FUNDS] DRY RUN: Would move $%s USD from %s to Main', usdBalance, accountName);
          }
          
          result.transfers.push(transfer);
        }
      } catch (e) {
        Logger.log('[ERROR] Failed to process Mercury account %s: %s', accountName, e.message);
        result.errors.push('Failed to process account ' + accountName + ': ' + e.message);
      }
    }
  } catch (e) {
    Logger.log('[ERROR] Failed to get Mercury accounts: %s', e.message);
    result.errors.push('Failed to get Mercury accounts: ' + e.message);
  }
  
  return result;
}

function processMercuryTransactionsForPayouts_(dryRun, result, processedTxnState) {
  /*
   * Process recent Mercury transactions to reconcile payouts
   * This ensures payouts are detected even after balances have been moved
   */
  try {
    Logger.log('[MERCURY_TX_PROCESSING] Fetching recent Mercury transactions for payout reconciliation...');
    
    var recentTxns = httpProxyJson_('/mercury/recent-transactions?limit=50');
    if (!recentTxns || !recentTxns.transactions) {
      Logger.log('[MERCURY_TX_PROCESSING] No recent transactions found');
      return;
    }
    
    Logger.log('[MERCURY_TX_PROCESSING] Processing %s recent transactions...', recentTxns.transactions.length);
    
    for (var i = 0; i < recentTxns.transactions.length; i++) {
      var tx = recentTxns.transactions[i];
      var amount = Number(tx.amount || 0);
      var currency = tx.amountCurrency || 'USD';
      var accountName = tx.accountName || 'Unknown';
      var transactionId = tx.id || tx.transactionId || 'unknown';
      
      // Skip non-USD transactions
      if (currency.toUpperCase() !== 'USD') continue;
      
      // Skip outgoing transactions (negative amounts)
      if (amount <= 0) continue;
      
      // Skip Main account transactions
      if (accountName.toLowerCase().includes('main')) continue;
      
      // Skip already processed transactions
      if (processedTxnState.data.has(transactionId)) {
        Logger.log('[MERCURY_TX_PROCESSING] Skipping already processed transaction: %s', transactionId);
        continue;
      }
      
      Logger.log('[MERCURY_TX_PROCESSING] Processing incoming transaction: $%s USD on %s (ID: %s)', amount, accountName, transactionId);
      result.transactionDetected++;
      
      if (!dryRun) {
        try {
          var reconciliationResult = reconcileTransferWithSpreadsheet(amount, 'Mercury', accountName);
          if (reconciliationResult.success) {
            result.transactionReconciled++;
            Logger.log('[MERCURY_TX_PROCESSING] ✅ Transaction reconciled: %s', reconciliationResult.message);

            // Mark transaction as processed
            processedTxnState.data.add(transactionId);
            processedTxnState.changed = true;
          } else {
            Logger.log('[MERCURY_TX_PROCESSING] ⚠️ Transaction not reconciled: %s', reconciliationResult.error);
          }
        } catch (e) {
          Logger.log('[ERROR] Mercury transaction reconciliation failed: %s', e.message);
          result.errors.push('Mercury transaction reconciliation: ' + e.message);
        }
      }
    }
    
    // Save processed transaction state if changed
    if (processedTxnState.changed) {
      saveProcessedPayoutTransactions_(processedTxnState.data);
    }
    
  } catch (e) {
    Logger.log('[ERROR] Mercury transaction processing failed: %s', e.message);
    result.errors.push('Mercury transaction processing: ' + e.message);
  }
}

