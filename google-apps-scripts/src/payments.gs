/**
 * payments.gs
 *
 * User payment processing
 */

function sendPaymentNotification_(userName, monthStr, amount, requestId, phoneNumber) {
  if (!phoneNumber || phoneNumber.trim() === '') {
    Logger.log('[WHATSAPP] No phone number for %s - skipping notification', userName);
    return;
  }
  
  Logger.log('[WHATSAPP] Sending payment notification to %s (%s)', userName, phoneNumber);
  
  try {
    var message = '$' + amount + ' EUR sent to your Revolut account ' + phoneNumber + ' for ' + monthStr + '. Transaction ID: ' + requestId;
    
    var payload = {
      to: phoneNumber.replace(/[^\d+]/g, ''),
      body: message,
      payment_month: monthStr,
      amount: amount,
      user: userName,
      request_id: requestId,
      timestamp: nowStamp_()
    };
    
    Logger.log('[WHATSAPP] Sending to server: %s', JSON.stringify(payload, null, 2));
    
    var response = httpProxyPostJson_('/notify-payment', payload);
    Logger.log('[WHATSAPP] ✅ Notification sent successfully');
    return response;
    
  } catch (e) {
    Logger.log('[WHATSAPP] ❌ Failed to send notification: %s', e.message);
    throw e;
  }
}

function checkPaymentPrerequisites() {
  Logger.log('[PAYMENT_PREREQ] Checking payment system prerequisites...');
  
  try {
    var issues = [];
    var checks = {
      allGood: true,
      proxyUrl: false,
      proxyToken: false,
      sheetExists: false,
      userData: false
    };
    
    // Check proxy configuration
    var props = props_();
    var proxyUrl = props.getProperty('PROXY_URL');
    var proxyToken = props.getProperty('PROXY_TOKEN');
    
    if (!proxyUrl || !proxyToken) {
      checks.proxyUrl = false;
      checks.allGood = false;
      issues.push('Missing PROXY_URL or PROXY_TOKEN in Script Properties');
    } else {
      checks.proxyUrl = true;
      
      // Test proxy connectivity
      if (proxyIsUp_()) {
        checks.proxyToken = true;
      } else {
        checks.proxyToken = false;
        checks.allGood = false;
        issues.push('Proxy server is not responding');
      }
    }
    
    // Check sheet structure
    var userSheet = sheet_(USERS_SHEET);
    if (!userSheet) {
      checks.sheetExists = false;
      checks.allGood = false;
      issues.push('Users sheet not found');
    } else {
      checks.sheetExists = true;
      
      // Check if user data exists
      var lastColumn = userSheet.getLastColumn();
      var lastRow = userSheet.getLastRow();
      
      if (lastColumn >= 2 && lastRow >= 30) {
        checks.userData = true;
      } else {
        checks.userData = false;
        checks.allGood = false;
        issues.push('Insufficient user data in sheet');
      }
    }
    
    Logger.log('[PAYMENT_PREREQ] Prerequisites check completed: %s', checks.allGood ? 'PASS' : 'FAIL');
    Logger.log('[PAYMENT_PREREQ] Issues found: %s', issues.length);
    
    return {
      ...checks,
      issues: issues,
      timestamp: new Date().toISOString()
    };
    
  } catch (e) {
    Logger.log('[ERROR] Payment prerequisites check failed: %s', e.message);
    return {
      allGood: false,
      issues: ['Prerequisite check failed: ' + e.message],
      timestamp: new Date().toISOString()
    };
  }
}

function dryRunPayUsersForCurrentMonth() {
  var now = new Date();
  var currentMonth = padStart(String(now.getMonth() + 1), 2, '0');
  var currentYear = now.getFullYear();
  var monthStr = currentMonth + '-' + currentYear;
  
  Logger.log('[DRY_RUN] Running dry run for current month: %s', monthStr);
  return dryRunPayUsersForMonth(monthStr);
}

function payUsersForCurrentMonth() {
  var now = new Date();
  var currentMonth = padStart(String(now.getMonth() + 1), 2, '0');
  var currentYear = now.getFullYear();
  var monthStr = currentMonth + '-' + currentYear;
  
  Logger.log('[PAY_USERS] Processing payments for current month: %s', monthStr);
  return payUsersForMonth(monthStr);
}

function dryRunPayUsersForPreviousMonth() {
  var now = new Date();
  var previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var monthStr = padStart(String(previousMonthDate.getMonth() + 1), 2, '0') + '-' + previousMonthDate.getFullYear();
  
  Logger.log('[DRY_RUN] Running dry run for previous month: %s', monthStr);
  return dryRunPayUsersForMonth(monthStr);
}

function payUsersForPreviousMonth() {
  var now = new Date();
  var previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var monthStr = padStart(String(previousMonthDate.getMonth() + 1), 2, '0') + '-' + previousMonthDate.getFullYear();
  
  Logger.log('[PAY_USERS] Processing payments for previous month: %s', monthStr);
  return payUsersForMonth(monthStr);
}

function dryRunPayUsersForMonth(monthStr) {
  Logger.log('[DRY_RUN] Starting dry run for month: %s', monthStr);

  try {
    // Get actual payment data from sheet
    var paymentData = getPaymentDataForMonth_(monthStr);

    if (!paymentData || paymentData.length === 0) {
      Logger.log('[DRY_RUN] No users to pay for month: %s', monthStr);
      return {
        month: monthStr,
        totalUsers: 0,
        totalPayoutUsd: 0,
        totalPayoutEur: 0,
        users: [],
        dryRun: true,
        timestamp: new Date().toISOString()
      };
    }

    // Calculate totals and build user list
    var totalEur = 0;
    var users = [];

    for (var i = 0; i < paymentData.length; i++) {
      var userData = paymentData[i];
      var userName = userData[0];
      var amount = userData[1];
      var currency = userData[2];
      var accountIdentifier = userData[3];
      var paymentType = userData[4] || 'salary';

      totalEur += amount;

      users.push({
        name: userName,
        amount: amount,
        currency: currency,
        recipient: accountIdentifier,
        type: paymentType
      });

      Logger.log('[DRY_RUN] Would pay %s: %s -> €%s to %s', paymentType.toUpperCase(), userName, amount, accountIdentifier);
    }

    // Estimate USD equivalent (rough estimate at 1.08 EUR/USD)
    var estimatedUsd = totalEur / 1.08;

    var result = {
      month: monthStr,
      totalUsers: paymentData.length,
      totalPayoutUsd: estimatedUsd,
      totalPayoutEur: totalEur,
      users: users,
      dryRun: true,
      timestamp: new Date().toISOString()
    };

    Logger.log('[DRY_RUN] Dry run completed: %s users, ~$%s USD, €%s EUR',
               result.totalUsers, result.totalPayoutUsd.toFixed(2), result.totalPayoutEur.toFixed(2));

    return result;

  } catch (e) {
    Logger.log('[ERROR] Dry run failed: %s', e.message);
    throw e;
  }
}

function payUsersForMonth(monthStr) {
  Logger.log('[PAY_USERS] Starting payments for month: %s', monthStr);
  
  try {
    // Get payment data from Google Sheet
    var paymentData = getPaymentDataForMonth_(monthStr);
    if (!paymentData || paymentData.length === 0) {
      Logger.log('[PAY_USERS] No payment data found for month: %s', monthStr);
      return { success: false, error: 'No payment data found', month: monthStr };
    }
    
    Logger.log('[PAY_USERS] Found %s users to pay for %s', paymentData.length, monthStr);

    // Calculate total EUR needed
    var totalEurNeeded = 0;
    for (var i = 0; i < paymentData.length; i++) {
      totalEurNeeded += paymentData[i][1]; // amount is at index 1
    }

    Logger.log('[PAY_USERS] Total EUR needed: €%s', totalEurNeeded);

    // Check current Main EUR balance
    var currentEurBalance = 0;
    try {
      var revolutSummary = fetchRevolutSummary_();
      currentEurBalance = revolutSummary.EUR || 0;
      Logger.log('[PAY_USERS] Current Main EUR balance: €%s', currentEurBalance);
    } catch (balErr) {
      Logger.log('[PAY_USERS] ⚠️ Failed to fetch EUR balance: %s', balErr.message);
    }

    // Calculate EUR shortfall (how much we need to exchange from USD)
    var eurShortfall = totalEurNeeded - currentEurBalance;

    // Do bulk USD -> EUR exchange only if we need more EUR
    if (eurShortfall > 0) {
      try {
        var exchangePayload = {
          fromName: 'Main',
          fromCcy: 'USD',
          toName: 'Main',
          toCcy: 'EUR',
          amount: Math.ceil(eurShortfall * 1.15), // 15% buffer for exchange rate + safety
          reference: 'Bulk exchange for ' + monthStr + ' payments'
        };

        Logger.log('[PAY_USERS] EUR shortfall: €%s - Exchanging USD -> EUR: %s', eurShortfall, JSON.stringify(exchangePayload));
        var exchangeResponse = httpProxyPostJson_('/revolut/exchange', exchangePayload);

        if (exchangeResponse && exchangeResponse.ok) {
          Logger.log('[PAY_USERS] ✅ Bulk exchange successful: %s', exchangeResponse.exchange_id || 'completed');
        } else {
          Logger.log('[PAY_USERS] ⚠️ Bulk exchange failed: %s', exchangeResponse ? exchangeResponse.error : 'Unknown error');
        }
      } catch (exchangeErr) {
        Logger.log('[PAY_USERS] ⚠️ Bulk exchange error: %s', exchangeErr.message);
      }
    } else {
      Logger.log('[PAY_USERS] ✅ Sufficient EUR balance (€%s), no exchange needed', currentEurBalance);
    }

    var results = {
      month: monthStr,
      totalUsers: paymentData.length,
      successfulPayments: 0,
      failedPayments: 0,
      totalUsdFromMain: 0,
      users: [],
      errors: [],
      timestamp: nowStamp_()
    };

    // Process each user payment
    for (var i = 0; i < paymentData.length; i++) {
      var userData = paymentData[i];
      var userName = userData[0];     // User ID
      var amount = userData[1];       // Amount
      var currency = userData[2];     // Currency (USD/EUR)
      var accountName = userData[3];  // Account name
      var paymentType = userData[4] || 'salary';  // 'salary' or 'bonus'

      Logger.log('[PAY_USERS] Processing %s payment: %s -> %s %s %s', paymentType, userName, amount, currency, accountName);

      try {
        var paymentResult = processUserPayment_(userName, amount, currency, accountName, monthStr, paymentType);

        if (paymentResult.success) {
          results.successfulPayments++;
          results.totalUsdFromMain += paymentResult.usdAmount;
          results.users.push({
            name: userName,
            amount: amount,
            currency: currency,
            account: accountName,
            type: paymentType,
            status: 'sent',
            transactionId: paymentResult.transactionId,
            usdAmount: paymentResult.usdAmount,
            exchangeRate: paymentResult.exchangeRate
          });

          Logger.log('[PAY_USERS] ✅ %s payment successful: %s %s to %s (ID: %s)',
                     paymentType.toUpperCase(), amount, currency, accountName, paymentResult.transactionId);
        } else {
          results.failedPayments++;
          results.errors.push(userName + ' (' + paymentType + '): ' + paymentResult.error);
          Logger.log('[PAY_USERS] ❌ %s payment failed: %s - %s', paymentType, userName, paymentResult.error);
        }

      } catch (e) {
        results.failedPayments++;
        results.errors.push(userName + ' (' + paymentType + '): ' + e.message);
        Logger.log('[PAY_USERS] ❌ %s payment error: %s - %s', paymentType, userName, e.message);
      }
    }
    
    Logger.log('[PAY_USERS] Payments completed: %s successful, %s failed, $%s total from Main USD', 
               results.successfulPayments, results.failedPayments, results.totalUsdFromMain.toFixed(2));
    
    return {
      success: results.failedPayments === 0,
      results: results,
      timestamp: nowStamp_()
    };
    
  } catch (e) {
    Logger.log('[ERROR] Payments failed: %s', e.message);
    return { success: false, error: e.message, month: monthStr };
  }
}

function menuDryRunSpecificMonth() {
  try {
    var ui = SpreadsheetApp.getUi();
    var response = ui.prompt('Dry Run Specific Month', 'Enter the month to test (format: YYYY-MM):\n\nExample: 2024-01', ui.ButtonSet.OK_CANCEL);
    
    if (response.getSelectedButton() === ui.Button.OK && response.getResponseText()) {
      var month = response.getResponseText().trim();
      ui.alert('Testing Payment System', 'Running dry run test for ' + month + '...\n\nThis will show what would happen without making actual payments.', ui.ButtonSet.OK);
      
      // Call the specific month dry run function
      var result = dryRunPayUsersForSpecificMonth(month);
      
      var resultText = '🧪 DRY RUN RESULT for ' + month + ':\n\n';
      resultText += 'Status: ' + result.status + '\n';
      resultText += 'Users Found: ' + result.usersToPay + '\n';
      resultText += 'Total USD: $' + result.totalUsd + '\n';
      resultText += 'Total USDX: ' + result.totalUsdx + '\n';
      resultText += 'Processing Fee: $' + (result.totalUsd * 0.014).toFixed(2) + '\n\n';
      
      if (result.errors && result.errors.length > 0) {
        resultText += '⚠️ Errors Found:\n';
        result.errors.forEach(error => resultText += '• ' + error + '\n');
      } else {
        resultText += '✅ No errors found - ready for payment!';
      }
      
      ui.alert('🧪 Dry Run Complete', resultText, ui.ButtonSet.OK);
    }
  } catch (e) {
    Logger.log('[ERROR] Menu dry run specific month failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ Dry Run Error', 'Failed to run dry run for specific month:\n\n' + e.message, ui.ButtonSet.OK);
  }
}

function menuPaySpecificMonth() {
  try {
    var ui = SpreadsheetApp.getUi();
    var response = ui.prompt('Pay Specific Month', '⚠️ WARNING: This will make REAL PAYMENTS!\n\nEnter the month to pay (format: YYYY-MM):\n\nExample: 2024-01', ui.ButtonSet.OK_CANCEL);
    
    if (response.getSelectedButton() === ui.Button.OK && response.getResponseText()) {
      var month = response.getResponseText().trim();
      
      // Confirm the real payment
      var confirmResponse = ui.alert('Final Confirmation', '🚨 ARE YOU SURE?\n\nThis will make REAL payments for ' + month + '!\n\nTotal payout will be calculated and transferred.\n\nType YES to confirm:');
      ui.prompt('Final Confirmation', 'Type YES to confirm real payment:', ui.ButtonSet.OK_CANCEL);
      
      var confirmResponse = ui.prompt('Final Confirmation', 'Type YES to confirm real payment:', ui.ButtonSet.OK_CANCEL);
      if (confirmResponse.getSelectedButton() === ui.Button.OK && confirmResponse.getResponseText().trim().toUpperCase() === 'YES') {
        
        ui.alert('Processing Payments', 'Executing real payments for ' + month + '...\n\nThis may take a few minutes.', ui.ButtonSet.OK);
        
        // Call the specific month payment function
        var result = payUsersForSpecificMonth(month);
        
        var resultText = '💰 PAYMENT RESULT for ' + month + ':\n\n';
        resultText += 'Status: ' + result.status + '\n';
        resultText += 'Users Paid: ' + result.usersPaid + '\n';
        resultText += 'Total Transferred: $' + result.totalTransferred + '\n';
        resultText += 'Processing Fee: $' + result.processingFee + '\n\n';
        
        if (result.transactionIds && result.transactionIds.length > 0) {
          resultText += '🔗 Transactions:\n';
          result.transactionIds.forEach(id => resultText += '• ' + id + '\n');
        }
        
        if (result.errors && result.errors.length > 0) {
          resultText += '\n⚠️ Errors:\n';
          result.errors.forEach(error => resultText += '• ' + error + '\n');
        } else {
          resultText += '✅ All payments successful!';
        }
        
        ui.alert('💰 Payments Complete', resultText, ui.ButtonSet.OK);
      } else {
        ui.alert('Payment Cancelled', 'Payment was cancelled. No payment was made.', ui.ButtonSet.OK);
      }
    }
  } catch (e) {
    Logger.log('[ERROR] Menu pay specific month failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ Payment Error', 'Failed to process payments for specific month:\n\n' + e.message, ui.ButtonSet.OK);
  }
}

/**
 * Get payment data for a specific month from Users sheet
 * Returns array of [userName, amount, currency, accountName/phone, paymentType]
 * paymentType: 'salary' or 'bonus'
 */
function getPaymentDataForMonth_(monthStr) {
  try {
    Logger.log('[PAYMENT_DATA] Getting payment data for month: %s', monthStr);

    var usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    if (!usersSheet) {
      Logger.log('[ERROR] Users sheet not found');
      return [];
    }

    // Find the month row
    var monthRow = findExistingMonthRow_(usersSheet, monthStr);
    if (!monthRow) {
      Logger.log('[PAYMENT_DATA] Month row not found for: %s', monthStr);
      return [];
    }

    Logger.log('[PAYMENT_DATA] Found month row: %s', monthRow);

    var paymentData = [];
    var lastColumn = usersSheet.getLastColumn();

    Logger.log('[PAYMENT_DATA] Scanning columns %s to %s for users', USERS_FIRST_COLUMN, lastColumn);

    // Iterate through user columns (starting from column 2 = B)
    for (var col = USERS_FIRST_COLUMN; col <= lastColumn; col++) {
      var userId = String(usersSheet.getRange(1, col).getValue() || '').trim();
      if (!userId) {
        Logger.log('[PAYMENT_DATA] Column %s: No user ID, skipping', col);
        continue;
      }

      // Check if user is active (row 28)
      var isActive = toBool_(usersSheet.getRange(28, col).getValue());
      if (!isActive) {
        Logger.log('[PAYMENT_DATA] Column %s - %s: Inactive (row 28 = %s)', col, userId, usersSheet.getRange(28, col).getValue());
        continue;
      }

      // Get monthly payment amount (row 29 = USERS_SALARY_ROW)
      var monthlyAmount = Number(usersSheet.getRange(USERS_SALARY_ROW, col).getValue()) || 0;
      if (monthlyAmount <= 0) {
        Logger.log('[PAYMENT_DATA] Column %s - %s: No payment amount (row %s = %s)', col, userId, USERS_SALARY_ROW, usersSheet.getRange(USERS_SALARY_ROW, col).getValue());
        continue;
      }

      // Check if already paid for this month
      var paidValue = usersSheet.getRange(monthRow, col).getValue();
      if (paidValue && String(paidValue).trim() !== '') {
        Logger.log('[PAYMENT_DATA] Column %s - %s: Already paid (row %s = %s)', col, userId, monthRow, paidValue);
        continue;
      }

      // Use the userId (Row 1) as the recipient identifier
      // Currency is always EUR for user payments (target accounts are EUR)
      var currency = 'EUR';

      // Add salary payment
      paymentData.push([userId, monthlyAmount, currency, userId, 'salary']);
      Logger.log('[PAYMENT_DATA] Added salary: %s -> €%s', userId, monthlyAmount);
    }

    // Check for bonus in column D (USERS_BONUS_COLUMN) for the month row
    // This is the 1% of profits bonus - only T2 has this currently
    var bonusAmount = Number(usersSheet.getRange(monthRow, USERS_BONUS_COLUMN).getValue()) || 0;
    if (bonusAmount > 0) {
      // Get the user ID for the bonus column (should be the user who gets bonuses)
      var bonusUserId = String(usersSheet.getRange(1, USERS_BONUS_COLUMN).getValue() || '').trim();
      if (bonusUserId) {
        paymentData.push([bonusUserId, bonusAmount, 'EUR', bonusUserId, 'bonus']);
        Logger.log('[PAYMENT_DATA] Added bonus for %s: €%s (1%% of profits)', bonusUserId, bonusAmount);
      }
    }

    Logger.log('[PAYMENT_DATA] Found %s payments to process for %s', paymentData.length, monthStr);
    return paymentData;

  } catch (e) {
    Logger.log('[ERROR] Failed to get payment data: %s', e.message);
    return [];
  }
}

/**
 * Process individual user payment
 * paymentType: 'salary' or 'bonus'
 */
function processUserPayment_(userName, amount, targetCurrency, accountIdentifier, monthStr, paymentType) {
  paymentType = paymentType || 'salary';
  Logger.log('[USER_PAYMENT] Processing %s: %s %s %s to %s (%s)', paymentType, amount, targetCurrency, accountIdentifier, userName, monthStr);

  try {
    // Create transfer request via proxy
    var requestId = nowStamp_().replace(/[^0-9]/g, '') + '-' + userName.replace(/[^a-zA-Z0-9]/g, '') + '-' + paymentType;

    // Build reference based on payment type
    var reference = paymentType === 'bonus'
      ? 'Bonus 1% ' + monthStr + ' - ' + userName
      : 'Payment ' + monthStr + ' - ' + userName;

    var payload = {
      toName: accountIdentifier,
      amount: amount,
      currency: targetCurrency,
      reference: reference,
      request_id: requestId
    };

    Logger.log('[USER_PAYMENT] Sending transfer request: %s', JSON.stringify(payload, null, 2));

    // Call Revolut transfer API via proxy
    var response = httpProxyPostJson_('/revolut/transfer', payload);

    if (response && response.ok) {
      Logger.log('[USER_PAYMENT] ✅ Transfer successful: %s', response.transfer_id || requestId);

      // Mark as paid in Users sheet
      markUserAsPaid_(userName, monthStr, amount, requestId);

      return {
        success: true,
        transactionId: response.transfer_id || requestId,
        usdAmount: response.usd_deducted || 0,
        exchangeRate: response.exchange_rate || 0,
        message: 'Payment successful'
      };
    } else {
      throw new Error('Transfer failed: ' + (response?.error || 'Unknown error'));
    }

  } catch (e) {
    Logger.log('[ERROR] User payment failed: %s', e.message);
    return {
      success: false,
      error: e.message,
      usdAmount: 0,
      exchangeRate: 0
    };
  }
}

/**
 * Mark user as paid in Users sheet
 */
function markUserAsPaid_(userName, monthStr, amount, transactionId) {
  try {
    var usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    if (!usersSheet) return;

    var monthRow = findExistingMonthRow_(usersSheet, monthStr);
    if (!monthRow) return;

    // Find user column (starting from column 2 = B)
    var lastColumn = usersSheet.getLastColumn();
    for (var col = USERS_FIRST_COLUMN; col <= lastColumn; col++) {
      var userId = String(usersSheet.getRange(1, col).getValue() || '').trim();
      Logger.log('[MARK_PAID] Checking column %s: "%s" vs "%s"', col, userId, userName);
      if (userId === userName) {
        // Mark as paid with amount
        usersSheet.getRange(monthRow, col).setValue(amount);
        Logger.log('[MARK_PAID] ✅ Marked %s as paid for %s: €%s (txn: %s)', userName, monthStr, amount, transactionId);
        return;
      }
    }

    Logger.log('[MARK_PAID] User not found: %s', userName);
  } catch (e) {
    Logger.log('[ERROR] Failed to mark user as paid: %s', e.message);
  }
}

/**
 * Alias for dryRunPayUsersForMonth to match menu function call
 */
function dryRunPayUsersForSpecificMonth(monthStr) {
  return dryRunPayUsersForMonth(monthStr);
}

