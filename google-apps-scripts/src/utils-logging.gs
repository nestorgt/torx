/**
 * utils-logging.gs
 *
 * Logging and audit utilities
 */

function logPaymentOperation(operation, monthStr, details) {
  var timestamp = nowStamp_();
  var logMsg = '[PAYMENT_OP] ' + timestamp + ' | ' + operation + ' | ' + monthStr + ' | ' + details;
  Logger.log(logMsg);
  
  try {
    var sh = sheet_(SHEET_NAME);
    var note = 'PAYMENT LOG | ' + timestamp + ' | ' + operation + ' | ' + monthStr + '\n' + details;
    setNoteOnly_(sh, 'A1', note);
  } catch (e) {
    Logger.log('[LOG_ERROR] Failed to write payment log: %s', e.message);
  }
}

function parseNumber(value) {
  if (!value || value === '') return 0;
  
  // Convert to string and remove common formatting
  var str = String(value);
  
  // Remove currency symbols, commas, spaces
  str = str.replace(/[$,\s]/g, '');
  
  // Parse as number
  var num = parseFloat(str);
  
  // Return 0 if not a valid number
  return isNaN(num) ? 0 : num;
}

