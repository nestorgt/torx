/**
 * payouts.gs
 *
 * Payout detection and reconciliation
 */

function listPendingPayouts() {
  /*
   * Lists all pending payouts with detailed information:
   * - Nickname (from Payouts tab column A22+)
   * - Full name (from Users tab row 7)
   * - Amount (from Payouts tab column G22+)
   * - Expected amount (calculated based on platform)
   */
  try {
    Logger.log('[PENDING_PAYOUTS] Generating list of pending payouts...');
    
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var payoutsSheet = spreadsheet.getSheetByName('Payouts');
    var usersSheet = spreadsheet.getSheetByName('Users');
    
    if (!payoutsSheet) {
      Logger.log('[ERROR] Could not find Payouts sheet');
      return { success: false, error: 'Payouts sheet not found' };
    }
    
    if (!usersSheet) {
      Logger.log('[ERROR] Could not find Users sheet');
      return { success: false, error: 'Users sheet not found' };
    }
    
    // Get payout data from row 22 onwards (A22: nickname, B22: platform, G22: amount, H22: received)
    var lastRow = payoutsSheet.getLastRow();
    if (lastRow < 22) {
      Logger.log('[ERROR] No payout data found (sheet too short)');
      return { success: false, error: 'No payout data found' };
    }
    
    var payoutData = payoutsSheet.getRange(22, 1, lastRow - 21, 8).getValues();
    Logger.log('[PENDING_PAYOUTS] Checking ' + payoutData.length + ' payout entries...');
    
    // Get user data from Users sheet (row 1: nicknames, row 7: full names)
    var userNicknames = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
    var userFullNames = usersSheet.getRange(7, 1, 1, usersSheet.getLastColumn()).getValues()[0];
    
    // Create nickname to full name mapping
    var nicknameToFullName = {};
    for (var i = 0; i < userNicknames.length; i++) {
      var nickname = String(userNicknames[i] || '').trim();
      var fullName = String(userFullNames[i] || '').trim();
      if (nickname && fullName) {
        nicknameToFullName[nickname] = fullName;
      }
    }
    
    var pendingPayouts = [];
    
    // Process each payout entry
    for (var i = 0; i < payoutData.length; i++) {
      var row = payoutData[i];
      var nickname = String(row[0] || '').trim(); // Column A (Nickname)
      var platform = String(row[1] || '').trim(); // Column B (Platform)
      var amount = Number(row[6] || 0); // Column G (Amount)
      var received = row[7]; // Column H (Received) - checkbox value
      
      // Skip if already marked as received
      if (received === true || received === 'true' || received === 'received' || received === 'yes') {
        continue;
      }
      
      // Skip if no amount or nickname
      if (amount <= 0 || !nickname) {
        continue;
      }
      
      // Get full name from Users sheet
      var fullName = nicknameToFullName[nickname] || 'Unknown';
      
      // Calculate expected amount based on platform
      var expectedCalc = calculateExpectedPayoutAmount_(platform, amount);
      
      pendingPayouts.push({
        nickname: nickname,
        fullName: fullName,
        platform: platform,
        amount: amount,
        expectedAmount: expectedCalc.expected,
        minAmount: expectedCalc.min,
        maxAmount: expectedCalc.max,
        row: i + 22 // Actual row number in sheet
      });
    }
    
    Logger.log('[PENDING_PAYOUTS] Found ' + pendingPayouts.length + ' pending payouts');
    
    return {
      success: true,
      count: pendingPayouts.length,
      payouts: pendingPayouts
    };
    
  } catch (e) {
    Logger.log('[ERROR] Failed to list pending payouts: %s', e.message);
    return { success: false, error: e.message };
  }
}

function formatPendingPayoutsList(payoutsData) {
  /*
   * Formats the pending payouts data into a readable list
   */
  if (!payoutsData.success || payoutsData.count === 0) {
    return 'No pending payouts found.';
  }
  
  var message = '📋 *PENDING PAYOUTS LIST*\n\n';
  message += 'Found ' + payoutsData.count + ' pending payout(s):\n\n';
  
  payoutsData.payouts.forEach(function(payout, index) {
    message += (index + 1) + '. ' + payout.nickname + ', ' + payout.fullName + ', $' + 
               payout.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + 
               ', $' + payout.expectedAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '\n';
    message += '   Platform: ' + payout.platform + ' | Expected Range: $' + 
               payout.minAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + 
               ' - $' + payout.maxAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '\n\n';
  });
  
  return message;
}

function calculateExpectedPayoutAmount_(platformName, baseAmount) {
  if (platformName && platformName.toLowerCase().includes('topstep')) {
    // Topstep: 90% of original payment, fees can go from $0 to $20. Sometimes they pay 100% of original amount
    var expected90 = baseAmount * 0.9;
    var expected100 = baseAmount; // Sometimes 100%
    var expected = expected90; // Default to 90%
    return {
      expected: expected,
      min: Math.max(expected90 - 20, baseAmount * 0.85),  // Allow $0-$20 fee range
      max: Math.min(expected100, baseAmount),             // Up to 100% of original
      platform: 'Topstep'
    };
  } else if (platformName && platformName.toLowerCase().includes('mffu')) {
    // MFFU: 80% of original payment, fees can go from $0 to $20
    var expected80 = baseAmount * 0.8;
    return {
      expected: expected80,
      min: Math.max(expected80 - 20, baseAmount * 0.75),  // Allow $0-$20 fee range
      max: expected80,                                     // Up to 80% of original
      platform: 'MFFU'
    };
  } else if (platformName && platformName.toLowerCase().includes('tradeify')) {
    // Tradeify: 90% of original payment, fees can go from $0 to $20
    var expected90 = baseAmount * 0.9;
    return {
      expected: expected90,
      min: Math.max(expected90 - 20, baseAmount * 0.85),  // Allow $0-$20 fee range
      max: expected90,                                    // Up to 90% of original
      platform: 'Tradeify'
    };
  } else {
    // Unknown Platform: 90% of original payment (standard payout percentage)
    var expected90 = baseAmount * 0.9;
    return {
      expected: expected90,
      min: Math.max(expected90 - 20, baseAmount * 0.85),  // Allow $0-$20 fee range
      max: baseAmount,                                     // Up to 100% of original
      platform: 'Unknown'
    };
  }
}

