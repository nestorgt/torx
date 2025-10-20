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
    properties.setProperty('daily_snapshot_collection', JSON.stringify(snapshots));
    properties.setProperty('daily_snapshot_' + dateStr, JSON.stringify({ date: dateStr, month: currentMonth, year: currentYear, data: snapshotData }));
    Logger.log('[SNAPSHOT] Saved daily snapshot for ' + dateStr);
    
  } catch (e) {
    Logger.log('[ERROR] Failed to save daily snapshot: ' + e.message);
  }
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

