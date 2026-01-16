/**
 * snapshots.gs
 *
 * Daily snapshot management
 */

function saveDailySnapshot(metrics, currentMonth, currentYear) {
  try {
    var today = new Date();
    var dateStr = today.getFullYear() + '-' + (today.getMonth() + 1).toString().padStart(2, '0') + '-' + today.getDate().toString().padStart(2, '0');

    var properties = PropertiesService.getScriptProperties();
    var snapshotsJson = properties.getProperty('daily_snapshot_collection');
    var snapshots = snapshotsJson ? JSON.parse(snapshotsJson) : {};
    var snapshotData = cloneMetrics(metrics);
    snapshots[dateStr] = snapshotData;

    // Cleanup old snapshots - keep only what we need
    cleanupOldSnapshots(snapshots, today);

    properties.setProperty('daily_snapshot_collection', JSON.stringify(snapshots));
    properties.setProperty('daily_snapshot_' + dateStr, JSON.stringify({ date: dateStr, month: currentMonth, year: currentYear, data: snapshotData }));
    Logger.log('[SNAPSHOT] Saved daily snapshot for ' + dateStr);

  } catch (e) {
    Logger.log('[ERROR] Failed to save daily snapshot: ' + e.message);
  }
}

function cleanupOldSnapshots(snapshots, today) {
  /*
   * Keep only recent snapshots:
   * - Current week (Monday-Friday of this week)
   * - Last week's Friday (for week-over-week comparison)
   * - Yesterday (for daily delta)
   *
   * This prevents infinite storage growth
   */
  try {
    var now = new Date(today);
    var keepDates = [];

    // 1. Keep yesterday
    var yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    keepDates.push(formatDate(yesterday));

    // 2. Keep current week (Monday through today)
    var dayOfWeek = now.getDay();
    var daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    var monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday);

    // Add each day from Monday to today
    for (var d = 0; d <= daysToMonday; d++) {
      var weekDay = new Date(monday);
      weekDay.setDate(monday.getDate() + d);
      keepDates.push(formatDate(weekDay));
    }

    // 3. Keep last week's Friday (for week comparisons)
    var lastFriday = new Date(monday);
    lastFriday.setDate(monday.getDate() - 3); // Monday - 3 days = last Friday
    keepDates.push(formatDate(lastFriday));

    Logger.log('[SNAPSHOT_CLEANUP] Keeping snapshots: %s', keepDates.join(', '));

    // Remove snapshots not in the keep list
    var deletedCount = 0;
    for (var dateKey in snapshots) {
      if (keepDates.indexOf(dateKey) === -1) {
        delete snapshots[dateKey];
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      Logger.log('[SNAPSHOT_CLEANUP] Deleted %s old snapshots', deletedCount);
    }

  } catch (e) {
    Logger.log('[ERROR] Failed to cleanup old snapshots: %s', e.message);
  }
}

function formatDate(date) {
  return date.getFullYear() + '-' + (date.getMonth() + 1).toString().padStart(2, '0') + '-' + date.getDate().toString().padStart(2, '0');
}

function loadPreviousDaySnapshot(currentMonth, currentYear) {
  try {
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    var dateStr = yesterday.getFullYear() + '-' + (yesterday.getMonth() + 1).toString().padStart(2, '0') + '-' + yesterday.getDate().toString().padStart(2, '0');
    var snapshot = loadSnapshotForDate(dateStr);
    if (snapshot) {
      Logger.log('[SNAPSHOT] Loaded previous day snapshot for ' + dateStr);
      return snapshot;
    }
    Logger.log('[SNAPSHOT] No previous day snapshot found for ' + dateStr);
    return null;
  } catch (e) {
    Logger.log('[ERROR] Failed to load previous day snapshot: ' + e.message);
    return null;
  }
}

function loadLastAvailableSnapshot(maxDaysBack) {
  /**
   * Load the most recent snapshot going back up to maxDaysBack days
   * This handles cases where the script didn't run on weekends or holidays
   * Returns null if no snapshot found within the range
   */
  try {
    maxDaysBack = maxDaysBack || 7; // Default to 7 days back

    var currentDate = new Date();

    for (var daysBack = 1; daysBack <= maxDaysBack; daysBack++) {
      var checkDate = new Date(currentDate);
      checkDate.setDate(currentDate.getDate() - daysBack);

      var snapshot = loadSnapshotForDate(checkDate);
      if (snapshot) {
        var dateStr = formatDate(checkDate);
        Logger.log('[SNAPSHOT] Found last available snapshot from %s (%s days back)', dateStr, daysBack);
        return snapshot;
      }
    }

    Logger.log('[SNAPSHOT] No snapshot found in the last %s days', maxDaysBack);
    return null;
  } catch (e) {
    Logger.log('[ERROR] Failed to load last available snapshot: ' + e.message);
    return null;
  }
}

function loadSnapshotForDate(dateObj) {
  try {
    var dateStr = typeof dateObj === 'string'
      ? dateObj
      : (dateObj.getFullYear() + '-' + (dateObj.getMonth() + 1).toString().padStart(2, '0') + '-' + dateObj.getDate().toString().padStart(2, '0'));

    Logger.log('[SNAPSHOT] Loading snapshot for date: %s', dateStr);

    var properties = PropertiesService.getScriptProperties();
    var snapshotsJson = properties.getProperty('daily_snapshot_collection');
    if (!snapshotsJson) {
      Logger.log('[SNAPSHOT] No snapshots collection found');
      return null;
    }
    var snapshots = JSON.parse(snapshotsJson);
    var snapshot = snapshots[dateStr] || null;

    Logger.log('[SNAPSHOT] Snapshot for %s: %s', dateStr, snapshot ? 'FOUND' : 'NOT FOUND');

    return snapshot;
  } catch (e) {
    Logger.log('[ERROR] Failed to load snapshot for given date: ' + e.message);
    return null;
  }
}

function createEmptyMetrics() {
  return {
    farmed: 0,
    farmedMonth: 0,
    pending: 0,
    payouts: 0,
    pendingPayouts: 0,
    balance: 0,
    expenses: 0,
    day1: 0,
    day2: 0,
    funded: 0
  };
}

function cloneMetrics(data) {
  var metrics = createEmptyMetrics();
  if (!data) {
    return metrics;
  }
  metrics.farmed = Number(data.farmed || 0);
  metrics.farmedMonth = Number(data.farmedMonth || 0);
  metrics.pending = Number(data.pending || 0);
  metrics.payouts = Number(data.payouts || 0);
  metrics.pendingPayouts = Number(data.pending || 0) + Number(data.payouts || 0);
  metrics.balance = Number(data.balance || 0);
  metrics.expenses = Number(data.expenses || 0);
  metrics.day1 = Number(data.day1 || 0);
  metrics.day2 = Number(data.day2 || 0);
  metrics.funded = Number(data.funded || 0);
  return metrics;
}

function sanitizeMetrics(data) {
  var metrics = createEmptyMetrics();
  if (!data) {
    return metrics;
  }
  metrics.farmed = Number(data.farmed || 0);
  metrics.farmedMonth = Number(data.farmedMonth || 0);
  metrics.pending = Number(data.pending || 0);
  metrics.payouts = Number(data.payouts || 0);
  metrics.pendingPayouts = Number(data.pending || 0) + Number(data.payouts || 0);
  metrics.balance = Number(data.balance || 0);
  metrics.expenses = Number(data.expenses || 0);
  metrics.day1 = Number(data.day1 || 0);
  metrics.day2 = Number(data.day2 || 0);
  metrics.funded = Number(data.funded || 0);
  return metrics;
}

function addMetrics(target, source) {
  if (!source) return target;
  target.farmed += Number(source.farmed || 0);
  target.farmedMonth += Number(source.farmedMonth || 0);
  target.pending += Number(source.pending || 0);
  target.payouts += Number(source.payouts || 0);
  target.pendingPayouts += Number(source.pendingPayouts || 0);
  target.balance += Number(source.balance || 0);
  target.expenses += Number(source.expenses || 0);
  target.day1 += Number(source.day1 || 0);
  target.day2 += Number(source.day2 || 0);
  target.funded += Number(source.funded || 0);
  return target;
}

function subtractMetrics(target, source) {
  if (!source) return target;
  target.farmed -= Number(source.farmed || 0);
  target.farmedMonth -= Number(source.farmedMonth || 0);
  target.pending -= Number(source.pending || 0);
  target.payouts -= Number(source.payouts || 0);
  target.pendingPayouts -= Number(source.pendingPayouts || 0);
  target.balance -= Number(source.balance || 0);
  target.expenses -= Number(source.expenses || 0);
  target.day1 -= Number(source.day1 || 0);
  target.day2 -= Number(source.day2 || 0);
  target.funded -= Number(source.funded || 0);
  return target;
}

function formatValue(isMoney, current, previous, options) {
  options = options || {};
  var showTotal = !!options.showTotal;
  var includeDifference = options.includeDifference !== false;
  current = Number(current || 0);
  previous = Number(previous || 0);
  var diff = current - previous;
  var sign = diff >= 0 ? '+' : (diff < 0 ? '-' : '+');
  var formattedDiff;

  if (isMoney) {
    formattedDiff = sign + '$' + Math.abs(diff).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else {
    formattedDiff = sign + Math.abs(diff).toLocaleString('en-US');
  }

  if (showTotal) {
    var formattedCurrent;
    if (isMoney) {
      formattedCurrent = '$' + current.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
      formattedCurrent = current.toLocaleString('en-US');
    }
    if (!includeDifference) {
      return formattedCurrent;
    }
    if (formattedDiff.length === 0 || (formattedDiff[0] !== '+' && formattedDiff[0] !== '-')) {
      formattedDiff = (diff >= 0 ? '+' : '-') + formattedDiff.replace(/^[-+]/, '');
    }
    return formattedCurrent + '   ' + formattedDiff;
  }

  return formattedDiff;
}

function deleteSnapshot(dateStr) {
  /**
   * Delete a specific snapshot by date string (YYYY-MM-DD)
   * Example: deleteSnapshot('2025-11-03')
   */
  try {
    var properties = PropertiesService.getScriptProperties();

    // Delete from collection
    var snapshotsJson = properties.getProperty('daily_snapshot_collection');
    if (snapshotsJson) {
      var snapshots = JSON.parse(snapshotsJson);
      if (snapshots[dateStr]) {
        delete snapshots[dateStr];
        properties.setProperty('daily_snapshot_collection', JSON.stringify(snapshots));
        Logger.log('[DELETE] Removed %s from snapshot collection', dateStr);
      } else {
        Logger.log('[DELETE] Snapshot %s not found in collection', dateStr);
      }
    }

    // Delete individual property if it exists
    var individualKey = 'daily_snapshot_' + dateStr;
    try {
      properties.deleteProperty(individualKey);
      Logger.log('[DELETE] Deleted individual snapshot property: %s', individualKey);
    } catch (e) {
      Logger.log('[DELETE] No individual property to delete for %s', dateStr);
    }

    return 'Deleted snapshot for ' + dateStr;
  } catch (e) {
    Logger.log('[ERROR] Failed to delete snapshot for %s: %s', dateStr, e.message);
    return 'Error deleting snapshot: ' + e.message;
  }
}

function viewAllSnapshots() {
  /**
   * View all stored snapshots for debugging
   * Run this from Apps Script editor to see what's stored
   */
  try {
    var properties = PropertiesService.getScriptProperties();
    var snapshotsJson = properties.getProperty('daily_snapshot_collection');

    if (!snapshotsJson) {
      Logger.log('[VIEW] No snapshots collection found');
      return 'No snapshots found';
    }

    var snapshots = JSON.parse(snapshotsJson);
    var dates = Object.keys(snapshots).sort();

    Logger.log('[VIEW] Found %s snapshots:', dates.length);

    for (var i = 0; i < dates.length; i++) {
      var date = dates[i];
      var snap = snapshots[date];
      Logger.log('[VIEW] %s: balance=$%s, expenses=$%s, farmed=$%s, payouts=$%s',
        date, snap.balance, snap.expenses, snap.farmed, snap.payouts);
    }

    return JSON.stringify(snapshots, null, 2);
  } catch (e) {
    Logger.log('[ERROR] Failed to view snapshots: %s', e.message);
    return 'Error: ' + e.message;
  }
}

function clearAllSnapshotData() {
  try {
    var properties = PropertiesService.getScriptProperties();

    // Get all properties
    var allProperties = properties.getProperties();
    var keysToDelete = [];

    // Find all snapshot-related keys
    for (var key in allProperties) {
      if (key.startsWith('daily_snapshot_') || key === 'daily_snapshot_collection') {
        keysToDelete.push(key);
      }
    }

    // Delete all snapshot keys
    properties.deleteProperties(keysToDelete);

    Logger.log('[CLEAR] Deleted %s snapshot properties: %s', keysToDelete.length, keysToDelete.join(', '));
    return 'Cleared ' + keysToDelete.length + ' snapshot properties: ' + keysToDelete.join(', ');
  } catch (e) {
    Logger.log('[ERROR] Failed to clear snapshot data: ' + e.message);
    return 'Error clearing snapshot data: ' + e.message;
  }
}

function formatDifferenceLine(label, current, previous, isNumber = false) {
  var difference = current - previous;
  var changeSign = difference >= 0 ? '+' : '';
  
  // Format numbers with proper commas
  var currentStr, diffStr;
  if (isNumber) {
    currentStr = current.toLocaleString();
    diffStr = changeSign + difference.toLocaleString();
  } else {
    currentStr = '$' + current.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    diffStr = changeSign + '$' + difference.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }
  
  // Add 3 spaces for alignment if there's text to the right
  var alignmentSpaces = '   ';
  
  return '• ' + label + ': ' + currentStr + alignmentSpaces + diffStr + '\n';
}

function formatAccumulatedLine(label, amount, isNumber = false) {
  // Format numbers with proper commas
  var amountStr;
  if (isNumber) {
    amountStr = amount.toLocaleString();
  } else {
    amountStr = '$' + amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }

  return '• ' + label + ': ' + amountStr + '\n';
}

function saveSnapshotForYesterday() {
  /**
   * Manually save a snapshot for yesterday using today's values
   * This helps fix the issue when no previous snapshot exists
   * Run this once to initialize the snapshot system
   */
  try {
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    var dateStr = yesterday.getFullYear() + '-' + (yesterday.getMonth() + 1).toString().padStart(2, '0') + '-' + yesterday.getDate().toString().padStart(2, '0');

    // Get current month data
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    var currentMonth = new Date().getMonth() + 1;
    var currentMonthRow = 1 + currentMonth;

    var metrics = {
      farmed: Number(sheet.getRange(currentMonthRow, 2).getValue()) || 0,
      farmedMonth: Number(sheet.getRange(currentMonthRow, 2).getValue()) || 0,
      payouts: Number(sheet.getRange(currentMonthRow, 3).getValue()) || 0,
      balance: Number(sheet.getRange(currentMonthRow, 4).getValue()) || 0,
      expenses: Number(sheet.getRange(currentMonthRow, 5).getValue()) || 0,
      day1: Number(sheet.getRange(currentMonthRow, 11).getValue()) || 0,
      day2: Number(sheet.getRange(currentMonthRow, 12).getValue()) || 0,
      funded: Number(sheet.getRange(currentMonthRow, 13).getValue()) || 0,
      pending: Number(sheet.getRange('G21').getValue()) || 0
    };
    metrics.pendingPayouts = metrics.pending + metrics.payouts;

    var properties = PropertiesService.getScriptProperties();
    var snapshotsJson = properties.getProperty('daily_snapshot_collection');
    var snapshots = snapshotsJson ? JSON.parse(snapshotsJson) : {};
    snapshots[dateStr] = metrics;

    properties.setProperty('daily_snapshot_collection', JSON.stringify(snapshots));
    properties.setProperty('daily_snapshot_' + dateStr, JSON.stringify({
      date: dateStr,
      month: currentMonth,
      year: yesterday.getFullYear(),
      data: metrics
    }));

    Logger.log('[SNAPSHOT] ✅ Manually saved snapshot for yesterday (%s)', dateStr);
    Logger.log('[SNAPSHOT] Values: Farmed=$%s, Balance=$%s, Expenses=$%s',
      metrics.farmed.toFixed(2), metrics.balance.toFixed(2), metrics.expenses.toFixed(2));

    return {
      success: true,
      date: dateStr,
      metrics: metrics
    };
  } catch (e) {
    Logger.log('[ERROR] Failed to save yesterday snapshot: %s', e.message);
    return {
      success: false,
      error: e.message
    };
  }
}

