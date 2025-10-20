/**
 * bank-revolut.gs
 *
 * Revolut bank integration
 */

function fetchRevolutSummary_() { 
  return httpProxyJson_('/revolut/summary'); 
}

function getRevolutMainBalance_(currency) {
  Logger.log('[REVOLUT] Getting Main account balance for %s', currency);
  try {
    var summary = fetchRevolutSummary_();
    var balance = summary[currency] || 0;
    Logger.log('[REVOLUT] Main %s balance: %s', currency, balance);
    return balance;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut Main %s balance: %s', currency, e.message);
    return 0;
  }
}

function getRevolutAccounts_() {
  try {
    Logger.log('[REVOLUT] Fetching all accounts...');
    var accounts = httpProxyJson_('/revolut/accounts');
    Logger.log('[REVOLUT] Retrieved %s accounts', accounts.length);
    return accounts;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut accounts: %s', e.message);
    return [];
  }
}

function getRevolutAccountBalance_(accountId, currency) {
  try {
    Logger.log('[REVOLUT] Getting balance for account %s with currency %s', accountId, currency);
    var path = '/revolut/account/' + encodeURIComponent(accountId) + '?currency=' + currency;
    var account = httpProxyJson_(path);
    
    var balance = account.balance || account[currency] || 0;
    Logger.log('[REVOLUT] Account %s %s balance: %s', accountId, currency, balance);
    return balance;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut account %s %s balance: %s', accountId, currency, e.message);
    return 0;
  }
}

function revolutTransferBetweenAccounts_(fromName, toName, currency, amount, reference) {
  Logger.log('[REVOLUT] Transfer request: %s -> %s, %s %s, "%s"', fromName, toName, amount, currency, reference);
  
  var body = {
    fromName: fromName,  // Add the source account name
    toName: toName,
    amount: amount,
    currency: currency,
    reference: reference || 'Transfer from ' + fromName,
    request_id: nowStamp_() + '-' + amount + '-' + currency
  };
  
  Logger.log('[REVOLUT] Transfer payload: %s', JSON.stringify(body, null, 2));
  return httpProxyPostJson_('/revolut/transfer', body);
}

function getRevolutTransactions_(month, year) {
  Logger.log('[REVOLUT] Getting transactions for %s-%s', month, year);
  try {
    var path = '/revolut/transactions?month=' + month + '&year=' + year;
    var response = httpProxyJson_(path);
    Logger.log('[REVOLUT] Retrieved %s transactions', response.transactions ? response.transactions.length : 0);
    return response;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut transactions: %s', e.message);
    return { transactions: [] };
  }
}

function fetchRevolutExpenses_(month, year) { 
  return httpProxyJson_('/revolut/transactions?month=' + month + '&year=' + year); 
}

function getRevolutToNestorTransfers_(month, year) {
  try {
    // Fetch Revolut transactions for the month
    var re = fetchRevolutExpenses_(month, year);
    var transfersToNestor = [];
    
    // Check USD transfer details
    if (re && re.usdTransferDetails && Array.isArray(re.usdTransferDetails)) {
      Logger.log('[REVOLUT-TO-NESTOR] Found %s USD transfer details', re.usdTransferDetails.length);
      
      for (var i = 0; i < re.usdTransferDetails.length; i++) {
        var tx = re.usdTransferDetails[i];
        var desc = (tx.description || '').toLowerCase();
        var cp   = (tx.counterparty || '').toLowerCase();
        var hay  = desc + ' ' + cp;
        // Look for transfers to Nestor (match by name in description or counterparty)
        if ((hay.indexOf('nestor') >= 0 && hay.indexOf('trabazo') >= 0) || hay.indexOf('nestor garcia trabazo') >= 0) {
          transfersToNestor.push({
            amount: tx.amount,
            description: tx.description,
            date: tx.date,
            type: 'Revolut-to-Nestor (USD)'
          });
          Logger.log('[REVOLUT-TO-NESTOR] Found USD Nestor transfer: $%s - %s', tx.amount, tx.description);
        }
      }
    }
    
    // Check EUR transfer details
    if (re && re.eurTransferDetails && Array.isArray(re.eurTransferDetails)) {
      Logger.log('[REVOLUT-TO-NESTOR] Found %s EUR transfer details', re.eurTransferDetails.length);
      
      for (var i = 0; i < re.eurTransferDetails.length; i++) {
        var tx = re.eurTransferDetails[i];
        var desc = (tx.description || '').toLowerCase();
        var cp   = (tx.counterparty || '').toLowerCase();
        var hay  = desc + ' ' + cp;
        // Look for transfers to Nestor (match by name in description or counterparty)
        if ((hay.indexOf('nestor') >= 0 && hay.indexOf('trabazo') >= 0) || hay.indexOf('nestor garcia trabazo') >= 0) {
          transfersToNestor.push({
            amount: tx.amount,
            description: tx.description,
            date: tx.date,
            type: 'Revolut-to-Nestor (EUR)'
          });
          Logger.log('[REVOLUT-TO-NESTOR] Found EUR Nestor transfer: $%s - %s', tx.amount, tx.description);
        }
      }
    }
    
    Logger.log('[REVOLUT-TO-NESTOR] Total transfers to Nestor: %s', transfersToNestor.length);
    return transfersToNestor;
    
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut-to-Nestor transfers %s-%s: %s', month, year, e.message);
    return [];
  }
}

function consolidateRevolutUsdFunds_(dryRun) {
  var result = {
    processed: 0,
    foundTotal: 0,
    movedTotal: 0,
    transfers: [],
    errors: []
  };
  
  try {
    var accounts = getRevolutAccounts_();
    Logger.log('[REVOLUT] Retrieved %s accounts', accounts.length);
    
    for (var i = 0; i < accounts.length; i++) {
      var account = accounts[i];
      var accountName = account.name || account.displayName || 'Unknown';
      var accountId = account.id || account.account_id || '';
      var currency = account.currency || 'USD';
      
      // Skip non-USD accounts for consolidation
      if (currency.toUpperCase() !== 'USD') {
        Logger.log('[REVOLUT_FUNDS] Skipping non-USD account: %s (%s)', accountName, currency);
        continue;
      }
      
      result.processed++;
      
      // Skip Main account for consolidation
      if (accountName.toLowerCase().includes('main')) {
        Logger.log('[REVOLUT_FUNDS] Skipping Main account: %s', accountName);
        continue;
      }
      
      // Use balance directly from account data
      var usdBalance = account.balance || 0;
      Logger.log('[REVOLUT_FUNDS] Account %s USD balance: $%s', accountName, usdBalance);
      
      if (usdBalance > 0) {
        result.foundTotal += usdBalance;
        
        // DETECT PAYOUT: Non-Main USD account with balance indicates a payout
        Logger.log('[REVOLUT_PAYOUT] Detected payout: $%s USD on %s (non-Main account)', usdBalance, accountName);
        
        // Attempt payout reconciliation with Payouts sheet
        try {
          var reconciliationResult = reconcileTransferWithSpreadsheet(usdBalance, 'Revolut', accountName);
          if (reconciliationResult.success) {
            Logger.log('[REVOLUT_PAYOUT] ✅ Payout reconciled: %s', reconciliationResult.message);
            result.payoutsReconciled = (result.payoutsReconciled || 0) + 1;
          } else {
            Logger.log('[REVOLUT_PAYOUT] ⚠️ Payout not reconciled: %s', reconciliationResult.error || 'No match found');
            result.payoutsUnreconciled = (result.payoutsUnreconciled || 0) + 1;
          }
        } catch (e) {
          Logger.log('[ERROR] Payout reconciliation failed for $%s: %s', usdBalance, e.message);
        }
        
        var transfer = {
          bank: 'Revolut',
          fromAccount: accountName,
          toAccount: 'Main',
          amount: usdBalance,
          currency: 'USD',
          status: 'pending'
        };
        
        if (!dryRun) {
          try {
            Logger.log('[REVOLUT_FUNDS] Attempting to move $%s USD from %s to Main', usdBalance, accountName);
            var transferResult = revolutTransferBetweenAccounts_(accountName, 'Main', 'USD', usdBalance, 'Consolidate USD funds to Main');
            
            if (transferResult && transferResult.transfer && transferResult.transfer.id) {
              transfer.status = 'success';
              transfer.transactionId = transferResult.transfer.id;
              result.movedTotal += usdBalance;
              
              // Track pending transfers (Revolut transfers are usually processing)
              var transferStatus = transferResult.transfer.status || 'processing';
              if (transferStatus === 'processing' || transferStatus === 'pending') {
                addPendingTransfer_('Revolut_' + accountName, usdBalance, 'USD', transferResult.transfer.id, 'Revolut');
              }
              
              Logger.log('[REVOLUT_FUNDS] Successfully moved $%s USD from %s to Main', usdBalance, accountName);
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
          Logger.log('[REVOLUT_FUNDS] DRY RUN: Would move $%s USD from %s to Main', usdBalance, accountName);
        }
        
        result.transfers.push(transfer);
      }
    }
  } catch (e) {
    Logger.log('[ERROR] Failed to get Revolut accounts: %s', e.message);
    result.errors.push('Failed to get Revolut accounts: ' + e.message);
  }
  
  return result;
}

function revolutFxUsdToEur_(usdAmount, requestId, reference) {
  Logger.log('[REVOLUT_PAY] Converting $%s USD to EUR (request: %s)', usdAmount, requestId);
  
  var fxMultiplier = props_().getProperty('REV_FX_USD_MULT') || '1.20';
  var eurAmount = Number(usdAmount) * Number(fxMultiplier);
  
  var body = {
    amount: eurAmount,
    currency: 'EUR',
    reference: reference || 'USD to EUR conversion',
    request_id: requestId || 'fx-' + nowStamp_() + '-' + usdAmount
  };
  
  Logger.log('[REVOLUT_FX] Sending EUR amount: %s for USD: %s', eurAmount, usdAmount);
  return httpProxyPostJson_('/revolut/transfer', body);
}

function revolutMove_(toName, eurAmount, requestId, reference) {
  Logger.log('[REVOLUT] Sending payment: %s EUR to %s (request: %s)', eurAmount, toName, requestId);
  
  var body = {
    to: toName,
    amount: eurAmount,
    currency: 'EUR',
    reference: reference || 'Payment to ' + toName,
    request_id: requestId || 'payment-' + nowStamp_() + '-' + eurAmount
  };
  
  Logger.log('[REVOLUT] Payment payload: %s', JSON.stringify(body, null, 2));
  return httpProxyPostJson_('/revolut/transfer', body);
}

