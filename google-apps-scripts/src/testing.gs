/**
 * testing.gs
 *
 * Test functions
 */

function simpleTest() {
  SpreadsheetApp.getUi().alert('Simple test works!');
}

function debugMenuFunctions() {
  var availableFunctions = [
    'menuCheckUSDBalances', 'menuTestConsolidation', 'menuExecuteConsolidation',
    'menuShowAvailableBanks', 'menuCheckPendingTransfers', 'menuMarkTransferComplete',
    'menuClearOldTransfers', 'menuDryRunSpecificMonth', 'menuPaySpecificMonth'
  ];
  
  var ui = SpreadsheetApp.getUi();
  var message = 'Available Menu Functions:\n\n';
  availableFunctions.forEach(func => {
    try {
      if (typeof window[func] === 'function') {
        message += '✅ ' + func + '\n';
      } else {
        message += '❌ ' + func + ' (not found)\n';
      }
    } catch (e) {
      message += '❌ ' + func + ' (error: ' + e.message + ')\n';
    }
  });
  
  ui.alert('Menu Functions Debug', message, ui.ButtonSet.OK);
}

function firstTimeSetup() {
  try {
    // This function helps users authorize the script for the first time
    var ui = SpreadsheetApp.getUi();
    
    // Test basic spreadsheet access
    var sheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = sheet.getName();
    
    // Test properties service
    var props = PropertiesService.getScriptProperties();
    props.setProperty('test_setup', 'completed');
    var testValue = props.getProperty('test_setup');
    
    // Test URL fetch (simple test)
    try {
      var response = UrlFetchApp.fetch('https://httpbin.org/get', {
        method: 'GET',
        muteHttpExceptions: true
      });
      var statusCode = response.getResponseCode();
    } catch (urlError) {
      throw new Error('URL Fetch test failed: ' + urlError.toString());
    }
    
    // Clean up test property
    props.deleteProperty('test_setup');
    
    ui.alert(
      '✅ Authorization Complete!',
      'All required permissions have been granted successfully.\n\n' +
      'You can now use all the banking and payment functions.\n\n' +
      'Sheet: ' + sheetName + '\n' +
      'URL Test: ' + statusCode + ' (OK)',
      ui.ButtonSet.OK
    );
    
  } catch (error) {
    var ui = SpreadsheetApp.getUi();
    ui.alert(
      '❌ Authorization Required',
      'Please complete the authorization process:\n\n' +
      '1. Click "Review permissions" when prompted\n' +
      '2. Select your Google account\n' +
      '3. Click "Advanced" if needed\n' +
      '4. Click "Go to [Script Name] (unsafe)"\n' +
      '5. Click "Allow"\n\n' +
      'Error: ' + error.toString(),
      ui.ButtonSet.OK
    );
  }
}

