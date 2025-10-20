/**
 * utils-dates.gs
 *
 * Date and month utilities
 */

function mmYYYY_(month, year) {
  return String(month).padStart(2, '0') + '-' + year;
}

function normMonthStr_(s) {
  s = String(s).trim();
  
  // Handle formats like "2025-01", "01-2025", "January 2025", etc.
  var patterns = [
    /^(20\d{2})-(\d{1,2})$/,      // 2025-1, 2025-01
    /^(\d{1,2})-(20\d{2})$/,      // 1-2025, 01-2025
    /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})$/i
  ];
  
  for (var i = 0; i < patterns.length; i++) {
    var match = s.match(patterns[i]);
    if (match) {
      var month, year;
      if (i === 0) {  // YYYY-MM format
        year = match[1];
        month = padStart(match[2], 2, '0');
  } else if (i === 1) {  // MM-YYYY format
        month = padStart(match[1], 2, '0');
        year = match[2];
      } else {  // Month name format
        var monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                         'july', 'august', 'september', 'october', 'november', 'december'];
        month = padStart(String(monthNames.indexOf(match[1].toLowerCase()) + 1), 2, '0');
        year = match[2];
      }
      
      if (month >= '01' && month <= '12' && year >= '2020' && year <= '2030') {
        return month + '-' + year;
      }
    }
  }
  
  Logger.log('[VALIDATION] Invalid month format: %s', s);
  return null;
}

function validateMonthString(monthStr) {
  var normalized = normMonthStr_(monthStr);
  if (!normalized) {
    Logger.log('[VALIDATION] Invalid month string: %s', monthStr);
    return false;
  }
  
  var parts = normalized.split('-');
  var month = parseInt(parts[0]);
  var year = parseInt(parts[1]);
  
  var now = new Date();
  var currentYear = now.getFullYear();
  var currentMonth = now.getMonth() + 1;
  
  // Allow past months (minimum 2020) and up to next month
  var minYear = 2020;
  var maxYear = currentYear + 1;
  
  if (year < minYear || year > maxYear) {
    Logger.log('[VALIDATION] Year out of range: %s (min: %s, max: %s)', year, minYear, maxYear);
    return false;
  }
  
  if (month < 1 || month > 12) {
    Logger.pub('[VALIDATION] Month out of range: %s', month);
    return false;
  }
  
  // Don't allow future months beyond next month
  if (year === currentYear + 1 && month > 1) {
 return false;
  }
  if (year === currentYear && month > currentMonth + 1) {
    Logger.log('[VALIDATION] Month too far in future: %s-%s (current: %s)', year, month, currentMonth);
    return false;
  }
  
  Logger.log('[VALIDATION] Valid month: %s', normalized);
  return true;
}

function getMonthDisplayName(monthStr) {
  var normalized = normMonthStr_(monthStr);
  if (!normalized) return monthStr;
  
  var parts = normalized.split('-');
  var monthNum = parseInt(parts[0]);
  var year = parts[1];
  
  var monthNames = [, 'January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
  
  var monthName = monthNames[monthNum] || parts[0];
  return monthName + ' ' + year;
}

function findExistingMonthRow_(sh, monthStr) {
  try {
    Logger.log('[MONTH_MGMT] Looking for existing row for month: %s', monthStr);
    var lastRow = sh.getLastRow();
    Logger.log('[MONTH_MGMT] Last row in sheet: %s', lastRow);
    
    for (var row = USERS_FIRST_MONTH_ROW; row <= lastRow; row++) {
      var cellValue = sh.getRange(row, 1).getValue();
      if (cellValue && String(cellValue).trim() === monthStr) {
        Logger.log('[MONTH_MGMT] Found existing row %s for month %s', row, monthStr);
        return row;
      }
    }
    
    Logger.log('[MONTH_MGMT] No existing row found for month %s', monthStr);
    return null;
  } catch (e) {
    Logger.log('[ERROR] Failed to find existing month row: %s', e.message);
    return null;
  }
}

function ensureMonthRow_(sh, monthStr) {
  try {
    Logger.log('[MONTH_MGMT] Ensuring row exists for month: %s', monthStr);
    var existingRow = findExistingMonthRow_(sh, monthStr);
    
    if (existingRow) {
      Logger.log('[MONTH_MGMT] Month row already exists at row %s', existingRow);
      return existingRow;
    }
    
    // Insert new row after the last month row
    Logger.log('[MONTH_MGMT] Creating new row for month %s', monthStr);
    var insertRow = sh.getLastRow() + 1;
    
    // Set the month string in column A
    sh.getRange(insertRow, 1).setValue(monthStr);
    
    Logger.log('[MONTH_MGMT] Created new row %s for month %s', insertRow, monthStr);
    return insertRow;
  } catch (e) {
    Logger.log('[ERROR] Failed to ensure month row: %s', e.message);
    return null;
  }
}

