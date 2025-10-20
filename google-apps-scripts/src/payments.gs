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
    // This is a placeholder - would contain actual dry run logic
    // For now, return a mock result
    var result = {
      month: monthStr,
      totalUsers: 5,
      totalPayoutUsd: 1250.00,
      totalPayoutEur: 1500.00,
      users: [
        { name: 'User1', amount: 250, currency: 'EUR' },
        { name: 'User2', amount: 300, currency: 'EUR' },
        { name: 'User3', amount: 200, currency: 'EUR' },
        { name: 'User4', amount: 400, currency: 'EUR' },
        { name: 'User5', amount: 350, currency: 'EUR' }
      ],
      dryRun: true,
      timestamp: new Date().toISOString()
    };
    
    Logger.log('[DRY_RUN] Dry run completed: %s users, $%s USD, €%s EUR', 
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
      var userName = userData[0]; // Column A: User name
      var amount = userData[1];   // Column B: Amount
      var currency = userData[2]; // Column C: Currency (USD/EUR)
      var accountName = userData[3]; // Column D: Account name
      
      Logger.log('[PAY_USERS] Processing payment: %s -> %s %s %s', userName, amount, currency, accountName);
      
      try {
        var paymentResult = processUserPayment_(userName, amount, currency, accountName, monthStr);
        
        if (paymentResult.success) {
          results.successfulPayments++;
          results.totalUsdFromMain += paymentResult.usdAmount;
          results.users.push({
            name: userName,
            amount: amount,
            currency: currency,
            account: accountName,
            status: 'sent',
            transactionId: paymentResult.transactionId,
            usdAmount: paymentResult.usdAmount,
            exchangeRate: paymentResult.exchangeRate
          });
          
          Logger.log('[PAY_USERS] ✅ Payment successful: %s %s to %s (ID: %s)', 
                     amount, currency, accountName, paymentResult.transactionId);
        } else {
          results.failedPayments++;
          results.errors.push(userName + ': ' + paymentResult.error);
          Logger.log('[PAY_USERS] ❌ Payment failed: %s - %s', userName, paymentResult.error);
        }
        
      } catch (e) {
        results.failedPayments++;
        results.errors.push(userName + ': ' + e.message);
        Logger.log('[PAY_USERS] ❌ Payment error: %s - %s', userName, e.message);
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

