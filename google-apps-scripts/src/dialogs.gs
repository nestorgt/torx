/**
 * dialogs.gs
 *
 * UI dialogs and user interaction
 */

function displayBalanceDialog(result) {
  try {
    var ui = SpreadsheetApp.getUi();
    var title = '💰 USD Balance Check';
    var message = '📊 BANK BALANCE STATUS\n\n';
    
    if (result.status === 'ALERT') {
      message += '🚨 BANK BALANCE ALERT!\n\n';
      message += '🎯 Threshold per bank: $1,000\n\n';
      
      // Add bank status with visual indicators
      var mercuryStatus = (result.mercury ? result.mercury.status : 0) === 'OK' ? '✅' : '🚨';
      var revolutStatus = (result.revolut ? result.revolut.status : 0) === 'OK' ? '✅' : '🚨';
      
      message += '🏦 Mercury Main: $' + ((result.mercury ? result.mercury.balance : 0) || 0).toFixed(2) + ' ' + mercuryStatus + '\n';
      message += '🏦 Revolut: $' + ((result.revolut ? result.revolut.balance : 0) || 0).toFixed(2) + ' ' + revolutStatus + '\n\n';
      
      // Add low balance details
      var lowBanks = [];
      if (((result.mercury ? result.mercury.balance : 0) || 0) < 1000) {
        var shortage = (1000 - ((result.mercury ? result.mercury.balance : 0) || 0)).toFixed(2);
        lowBanks.push('MERCURY MAIN: Below threshold (-$' + shortage + ')\n💸 Recommended Transfer: $2,000');
      }
      if (((result.revolut ? result.revolut.balance : 0) || 0) < 1000) {
        var shortage = (1000 - ((result.revolut ? result.revolut.balance : 0) || 0)).toFixed(2);
        lowBanks.push('REVOLUT: Below threshold (-$' + shortage + ')\n💸 Recommended Transfer: $2,000');
      }
      
      if (lowBanks.length > 0) {
        message += lowBanks.join('\n\n') + '\n\n';
      }
      
      message += '⚠️ Consider topping up low accounts!';
      
    } else if (result.status === 'OK') {
      message += '✅ HEALTHY STATUS\n\n';
      message += '🎯 Threshold per bank: $1,000\n\n';
      
      message += '🏦 Mercury Main: $' + ((result.mercury ? result.mercury.balance : 0) || 0).toFixed(2) + ' ✅\n';
      message += '🏦 Revolut: $' + ((result.revolut ? result.revolut.balance : 0) || 0).toFixed(2) + ' ✅\n\n';
      
      var totalSurplus = ((result.mercury ? result.mercury.surplus : 0) || 0) + ((result.revolut ? result.revolut.surplus : 0) || 0);
      message += '📈 Total Surplus Above Threshold: $' + totalSurplus.toFixed(2) + '\n\n';
      message += '✅ All banks above $1,000 threshold';
    } else {
      message += '❌ ERROR STATUS\n\n';
      message += 'Error: ' + (result.error || 'Unknown error') + '\n\n';
      message += 'Please check logs for details';
    }
    
    message += '\n\n⏰ Checked: ' + new Date().toLocaleString();
    
    ui.alert(title, message, ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Display balance dialog failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('Error', 'Failed to display balance results: ' + e.message, ui.ButtonSet.OK);
  }
}

function displayIndividualBanksDialog(result) {
  try {
    var ui = SpreadsheetApp.getUi();
    var title = '🏦 Individual Bank Check';
    var message = '🏦 Individual Bank Balance Analysis\n\n';
    
    if (result.overallStatus === 'ALERT') {
      message += '🚨 OVERALL STATUS: ALERT\n';
    } else {
      message += '✅ OVERALL STATUS: HEALTHY\n';
    }
    
    message += '🎯 Threshold: $' + result.thresholdUSD + '\n';
    message += '💸 Transfer Amount: $' + result.transferAmountUSD + '\n\n';
    
    for (var i = 0; i < result.banks.length; i++) {
      var bank = result.banks[i];
      message += '🏦 ' + bank.name + '\n';
      message += '  Balance: $' + bank.balance.toFixed(2) + '\n';
      message += '  Status: ' + (bank.status === 'OK' ? '✅ OK' : '🚨 LOW') + '\n';
      
      if (bank.status === 'LOW' && bank.shortfall) {
        message += '  Shortfall: $' + bank.shortfall.toFixed(2) + '\n';
        message += '  Transfer Needed: $' + bank.transferNeeded + '\n';
      } else if (bank.surplus) {
        message += '  Surplus: +$' + bank.surplus.toFixed(2) + '\n';
      }
      
      message += '  Message: ' + bank.message + '\n\n';
    }
    
    if (result.actionRequired && result.actionRequired.length > 0) {
      message += '🎯 ACTIONS REQUIRED:\n';
      for (var j = 0; j < result.actionRequired.length; j++) {
        var action = result.actionRequired[j];
        message += '• Transfer $' + action.transferNeeded + ' to ' + action.name + '\n';
      }
      message += '\n';
    }
    
    message += '⏰ Checked: ' + new Date().toLocaleString();
    
    ui.alert(title, message, ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Display individual banks dialog failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('Error', 'Failed to display bank results: ' + e.message, ui.ButtonSet.OK);
  }
}

function displaySummaryDialog(result) {
  try {
    var ui = SpreadsheetApp.getUi();
    var title = '📊 Balance Summary';
    var message = '📊 Complete Balance Summary\n\n';
    
    message += '💵 TOTAL USD BALANCE: $' + ((result.totals ? result.totals.totalUSD : 0) || 0).toFixed(2) + '\n';
    message += '💶 TOTAL EUR BALANCE: €' + ((result.totals ? result.totals.totalEUR : 0) || 0).toFixed(2) + '\n\n';
    
    message += '🏦 BANK BREAKDOWN:\n';
    message += '• Mercury USD: $' + (result.banks && result.banks.mercury && result.banks.mercury.USD ? result.banks.mercury.USD : 0).toFixed(2) + '\n';
    message += '• Mercury EUR: €' + (result.banks && result.banks.mercury && result.banks.mercury.EUR ? result.banks.mercury.EUR : 0).toFixed(2) + '\n';
    message += '• Revolut USD: $' + (result.banks && result.banks.revolut && result.banks.revolut.USD ? result.banks.revolut.USD : 0).toFixed(2) + '\n';
    message += '• Revolut EUR: €' + (result.banks && result.banks.revolut && result.banks.revolut.EUR ? result.banks.revolut.EUR : 0).toFixed(2) + '\n\n';
    
    message += '🛡️ HEALTH STATUS:\n';
    message += '• Mercury Healthy: ' + ((result.health ? result.health.mercuryOK : 0) ? '✅ Yes' : '❌ No') + '\n';
    message += '• Revolut Healthy: ' + ((result.health ? result.health.revolutOK : 0) ? '✅ Yes' : '❌ No') + '\n';
    message += '• All Banks Healthy: ' + ((result.health ? result.health.allHealthy : 0) ? '✅ Yes' : '❌ No') + '\n\n';
    
    message += '⏰ Generated: ' + new Date().toLocaleString();
    
    ui.alert(title, message, ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('[ERROR] Display summary dialog failed: %s', e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert('Error', 'Failed to display summary results: ' + e.message, ui.ButtonSet.OK);
  }
}

function displaySummaryResult(title, result) {
  try {
    var sh = sheet_(SHEET_NAME);
    if (!sh) {
      Logger.log('[ERROR] Sheet not found for display');
      return;
    }

    function numberOrZero(value) {
      var num = Number(value);
      return isNaN(num) ? 0 : num;
    }

    var timestamp = (result && result.timestamp) ? result.timestamp : new Date().toLocaleString();
    var totals = (result && result.totals) ? result.totals : {};
    var banks = (result && result.banks) ? result.banks : {};
    var health = (result && result.health) ? result.health : {};

    var mercury = banks.mercury || {};
    var revolut = banks.revolut || {};

    var output = [];
    output.push(['📊 ' + title, timestamp]);
    output.push([, ]);
    output.push(['💵 TOTAL USD BALANCE', '$' + numberOrZero(totals.totalUSD).toFixed(2)]);
    output.push(['💶 TOTAL EUR BALANCE', '€' + numberOrZero(totals.totalEUR).toFixed(2)]);
    output.push([, ]);
    output.push(['🏦 BANK BREAKDOWN:', ]);
    output.push(['Mercury USD', '$' + numberOrZero(mercury.USD).toFixed(2)]);
    output.push(['Mercury EUR', '€' + numberOrZero(mercury.EUR).toFixed(2)]);
    output.push(['Revolut USD', '$' + numberOrZero(revolut.USD).toFixed(2)]);
    output.push(['Revolut EUR', '€' + numberOrZero(revolut.EUR).toFixed(2)]);
    output.push([, ]);
    output.push(['🛡️ HEALTH STATUS:', ]);
    output.push(['Mercury Healthy', health.mercuryOK ? '✅ Yes' : '❌ No']);
    output.push(['Revolut Healthy', health.revolutOK ? '✅ Yes' : '❌ No']);
    output.push(['All Banks Healthy', health.allHealthy ? '✅ Yes' : '❌ No']);

    sh.getRange('A10:B' + (10 + output.length - 1)).setValues(output);

  } catch (e) {
    Logger.log('[ERROR] Display summary result failed: %s', e.message);
  }
}

function displayErrorDialog(title, errorMessage) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert('❌ ' + title, 'An error occurred:\n\n' + errorMessage + '\n\nPlease try again or check the logs for more details.\n\n⏰ ' + new Date().toLocaleString(), ui.ButtonSet.OK);
  } catch (e) {
    Logger.log('[ERROR] Display error dialog failed: %s', e.message);
  }
}

function displayError(title, errorMessage) {
  try {
    var sh = sheet_(SHEET_NAME);
    if (!sh) {
      Logger.log('[ERROR] Sheet not found for display');
      return;
    }
    
    var output = [];
    output.push(['❌ ' + title, new Date().toLocaleString()]);
    output.push(['Error Message', errorMessage]);
    output.push(['', '']);
    output.push(['Please try again or check logs', '']);
    
    sh.getRange('A10:B14').setValues(output);
    
  } catch (e) {
    Logger.log('[ERROR] Display error failed: %s', e.message);
  }
}

function showMultiLineDialog(promptText) {
  /*
   * Show a custom HTML dialog with true multi-line textarea input
   * Uses a synchronous approach to get the result
   */
  try {
    var html = HtmlService.createHtmlOutputFromFile('fon-dialog')
      .setWidth(500)
      .setHeight(400);
    
    var ui = SpreadsheetApp.getUi();
    ui.showModalDialog(html, '🪖 Fon - Funded Accounts');
    
    // The HTML dialog will call processFundedAccounts when user clicks OK/Cancel
    // We need to wait for the result
    var maxWait = 30; // Maximum wait time in seconds
    var waitTime = 0;
    
    while (fundedAccountsResult === undefined && waitTime < maxWait) {
      Utilities.sleep(100); // Wait 100ms
      waitTime += 0.1;
    }
    
    var result = fundedAccountsResult;
    fundedAccountsResult = undefined; // Reset for next use
    
    return result;
    
  } catch (e) {
    Logger.log('[ERROR] Multi-line dialog failed: %s', e.message);
    
    // Fallback to simple prompt
    var ui = SpreadsheetApp.getUi();
    var response = ui.prompt(
      '🪖 Fon - Funded Accounts',
      promptText + '\n\n(Enter multiple lines separated by commas)',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (response.getSelectedButton() !== ui.Button.OK) {
      return null;
    }
    
    return response.getResponseText().trim();
  }
}

