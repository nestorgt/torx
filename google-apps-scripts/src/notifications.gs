/**
 * notifications.gs
 *
 * Slack and WhatsApp notifications
 */

function sendSlackMessageWebhook(message, webhookUrl) {
  try {
    var payload = {
      'text': message
    };
    
    var options = {
      'method': 'POST',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload)
    };
    
    var response = UrlFetchApp.fetch(webhookUrl, options);
    var responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      Logger.log('[SLACK] Message sent successfully via webhook');
      return true;
    } else {
      Logger.log('[SLACK] Failed to send message via webhook. Response code: ' + responseCode);
      return false;
    }
    
  } catch (e) {
    Logger.log('[SLACK] Error sending message via webhook: ' + e.message);
    return false;
  }
}

function sendPaymentsReceivedNotification(notifications) {
  try {
    if (!notifications || notifications.length === 0) {
      return { sent: false, reason: 'No notifications queued' };
    }

    var properties = PropertiesService.getScriptProperties();
    var webhookUrl = properties.getProperty('SLACK_WEBHOOK_URL_BANK_CARDS');

    if (!webhookUrl) {
      Logger.log('[SLACK] Missing bank-cards webhook URL');
      return { sent: false, reason: 'Missing webhook URL' };
    }

    var messageLines = ['💵 Payments received:'];
    notifications.forEach(function(entry) {
      var reference = entry.reference || 'Unknown';
      var amount = Number(entry.amount || 0);
      var formattedAmount = '$' + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      messageLines.push('• ' + reference + ' · ' + formattedAmount);
    });

    var message = messageLines.join('\n');
    var sent = sendSlackMessageWebhook(message, webhookUrl);
    Logger.log('[SLACK] Payments received notification sent: ' + sent);
    return { sent: sent, message: message };
  } catch (e) {
    Logger.log('[SLACK] Error sending payments notification: ' + e.message);
    return { sent: false, error: e.message };
  }
}

function sendSlackMessageToken(message, token, channel) {
  try {
    var url = 'https://slack.com/api/chat.postMessage';
    
    var payload = {
      'channel': channel,
      'text': message,
      'token': token
    };
    
    var options = {
      'method': 'POST',
      'contentType': 'application/x-www-form-urlencoded',
      'payload': payload
    };
    
    var response = UrlFetchApp.fetch(url, options);
    var responseData = JSON.parse(response.getContentText());
    
    if (responseData.ok) {
      Logger.log('[SLACK] Message sent successfully via token');
      return true;
    } else {
      Logger.log('[SLACK] Failed to send message via token. Error: ' + responseData.error);
      return false;
    }
    
  } catch (e) {
    Logger.log('[SLACK] Error sending message via token: ' + e.message);
    return false;
  }
}

function sendDailySummaryToSlack(channel = 'daily') {
  try {
    Logger.log('[SLACK] Generating and sending daily summary to Slack channel: ' + channel);
    
    // Generate the summary message
    var summaryMessage = generateDailyWeeklySummary();
    
    // Check if summary generation failed
    if (!summaryMessage || summaryMessage.startsWith('Error generating summary:')) {
      Logger.log('[SLACK] Summary generation failed: ' + summaryMessage);
      return 'Failed to generate summary: ' + summaryMessage;
    }
    
    // Get Slack webhook URL for specific channel
    var properties = PropertiesService.getScriptProperties();
    var webhookUrl = properties.getProperty('SLACK_WEBHOOK_URL_' + channel.toUpperCase());
    
    if (!webhookUrl) {
      Logger.log('[SLACK] No webhook URL found for channel: ' + channel);
      return 'No webhook URL configured for ' + channel + ' channel. Please setup credentials first.';
    }
    
    // Send via webhook
    var success = sendSlackMessageWebhook(summaryMessage, webhookUrl);
    
    if (success) {
      Logger.log('[SLACK] Summary sent successfully via webhook to ' + channel);
      return 'Summary sent to Slack (' + channel + ') successfully!';
    } else {
      Logger.log('[SLACK] Failed to send summary to ' + channel + '. Please check webhook URL.');
      return 'Failed to send summary to Slack (' + channel + '). Please check your webhook URL.';
    }
    
  } catch (e) {
    Logger.log('[SLACK] Error in sendDailySummaryToSlack: ' + e.message);
    return 'Error sending summary to Slack (' + channel + '): ' + e.message;
  }
}

function generateDailyWeeklySummary() {
  try {
    Logger.log('=== GENERATING DAILY/WEEKLY SUMMARY ===');

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payouts');
    if (!sheet) {
      throw new Error('Payouts sheet not found');
    }

    var now = new Date();
    var today = now.getDate();
    var currentMonth = now.getMonth() + 1;
    var currentYear = now.getFullYear();

    var weekStart = new Date(now);
    var dayOfWeek = now.getDay();
    var daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(now.getDate() - daysToMonday);

    Logger.log('[SUMMARY] Processing data for today=%s, weekStart=%s/%s, month=%s/%s', today, weekStart.getDate(), weekStart.getMonth() + 1, currentMonth, currentYear);

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var allData = sheet.getRange(1, 1, lastRow, lastCol).getValues();

    var summary = {
      currentDay: createEmptyMetrics(),
      previousDay: createEmptyMetrics(),
      weekCurrent: createEmptyMetrics(),
      weekPrevious: createEmptyMetrics(),
      monthCurrent: createEmptyMetrics(),
      monthPrevious: createEmptyMetrics(),
      hasPreviousDaySnapshot: false,
      hasPreviousWeekSnapshot: false
    };

    var currentMonthStr = currentYear + '-' + currentMonth.toString().padStart(2, '0');
    var currentMonthRow = -1;

    for (var row = 7; row <= lastRow; row++) {
      try {
        var monthValue = sheet.getRange(row, 1).getValue();
        if (monthValue && String(monthValue).includes(currentMonthStr)) {
          currentMonthRow = row;
          Logger.log('[SUMMARY] Found current month row: %s for %s', currentMonthRow, currentMonthStr);
          break;
        }
      } catch (innerErr) {
        Logger.log('[SUMMARY] Error reading month at row %s: %s', row, innerErr.message);
      }
    }

    if (currentMonthRow === -1) {
      Logger.log('[SUMMARY] Using fallback row 11 for month %s', currentMonthStr);
      currentMonthRow = 11;
    }

    try {
      summary.currentDay.farmed = Number(sheet.getRange(currentMonthRow, 2).getValue()) || 0;
      summary.currentDay.payouts = Number(sheet.getRange(currentMonthRow, 3).getValue()) || 0;
      summary.currentDay.balance = Number(sheet.getRange(currentMonthRow, 4).getValue()) || 0;
      summary.currentDay.expenses = Number(sheet.getRange(currentMonthRow, 5).getValue()) || 0;
      summary.currentDay.day1 = Number(sheet.getRange(currentMonthRow, 11).getValue()) || 0;
      summary.currentDay.day2 = Number(sheet.getRange(currentMonthRow, 12).getValue()) || 0;
      summary.currentDay.funded = Number(sheet.getRange(currentMonthRow, 13).getValue()) || 0;
      summary.currentDay.pending = Number(sheet.getRange('G21').getValue()) || 0;
      summary.currentDay.pendingPayouts = summary.currentDay.pending + summary.currentDay.payouts;
    } catch (sheetErr) {
      Logger.log('[SUMMARY] Error reading current month row %s: %s', currentMonthRow, sheetErr.message);
    }

    var previousSnapshot = loadSnapshotForDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    summary.previousDay = sanitizeMetrics(previousSnapshot);
    summary.hasPreviousDaySnapshot = !!previousSnapshot;
    
    // Debug logging
    if (!previousSnapshot) {
      summary.previousDay = createEmptyMetrics(); // Use zeros as baseline for first day
      Logger.log('[SUMMARY] No previous day snapshot – using zeros as baseline');
    } else {
      summary.hasPreviousDaySnapshot = true;
    }

    // Week accumulation: Calculate total for current week ONLY (Monday to today)
    // We want the absolute difference: (Today's snapshot) - (Last snapshot before this week started)
    var weekMetrics = createEmptyMetrics();

    // Try to find the most recent snapshot before this week started
    // Start with Sunday and look back up to 7 days if needed
    var weekBaselineSnapshot = null;
    var weekBaselineDate = null;

    for (var lookback = 1; lookback <= 7; lookback++) {
      var checkDate = new Date(weekStart);
      checkDate.setDate(weekStart.getDate() - lookback);

      var snapshot = loadSnapshotForDate(checkDate);
      if (snapshot) {
        weekBaselineSnapshot = snapshot;
        weekBaselineDate = checkDate;
        Logger.log('[SUMMARY] Found week baseline: %s/%s/%s (lookback %s days)',
          checkDate.getDate(), checkDate.getMonth() + 1, checkDate.getFullYear(), lookback);
        break;
      }
    }

    Logger.log('[SUMMARY] Week calculation: Monday=%s/%s/%s, Baseline=%s, Today=%s/%s/%s',
      weekStart.getDate(), weekStart.getMonth() + 1, weekStart.getFullYear(),
      weekBaselineDate ? (weekBaselineDate.getDate() + '/' + (weekBaselineDate.getMonth() + 1) + '/' + weekBaselineDate.getFullYear()) : 'NONE',
      now.getDate(), now.getMonth() + 1, now.getFullYear());

    // The week total is simply: (today's snapshot) - (baseline snapshot)
    // This gives us the accumulated change from the week start through today
    if (weekBaselineSnapshot) {
      weekMetrics = cloneMetrics(summary.currentDay);
      subtractMetrics(weekMetrics, weekBaselineSnapshot);
      Logger.log('[SUMMARY] Week = Current - Baseline (Farmed: $%s)', weekMetrics.farmed);
    } else {
      // No baseline found, use current day's absolute values
      weekMetrics = cloneMetrics(summary.currentDay);
      Logger.log('[SUMMARY] Week = Current (no baseline) (Farmed: $%s)', weekMetrics.farmed);
    }

    summary.weekCurrent = weekMetrics;
    
    // Week comparison: compare current week total vs previous week's total
    var prevWeekMetrics = createEmptyMetrics();
    var prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    // Sum up the previous week's daily deltas (Monday to Sunday or today's day of week, whichever is earlier)
    for (var prevOffset = 0; prevOffset <= 6; prevOffset++) {
      var prevWeekDate = new Date(prevWeekStart.getFullYear(), prevWeekStart.getMonth(), prevWeekStart.getDate() + prevOffset);

      // Get snapshot for this day in previous week
      var prevDaySnapshot = loadSnapshotForDate(prevWeekDate);
      if (!prevDaySnapshot) {
        continue;
      }

      // Calculate daily delta by subtracting the day before's snapshot
      var dayBeforePrev = new Date(prevWeekDate);
      dayBeforePrev.setDate(prevWeekDate.getDate() - 1);
      var dayBeforeSnapshot = loadSnapshotForDate(dayBeforePrev);

      var prevDayDelta = cloneMetrics(prevDaySnapshot);
      if (dayBeforeSnapshot) {
        subtractMetrics(prevDayDelta, dayBeforeSnapshot);
      }

      // Add daily delta to previous week accumulation
      addMetrics(prevWeekMetrics, prevDayDelta);
    }
    summary.weekPrevious = prevWeekMetrics;
    summary.hasPreviousWeekSnapshot = Object.values(prevWeekMetrics).some(function(val) { return val !== 0; });

    // Month comparison: load previous month's data
    var previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    var previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    var previousMonthStr = previousYear + '-' + previousMonth.toString().padStart(2, '0');
    var previousMonthRow = -1;

    for (var row = 7; row <= lastRow; row++) {
      try {
        var monthValue = sheet.getRange(row, 1).getValue();
        if (monthValue && String(monthValue).includes(previousMonthStr)) {
          previousMonthRow = row;
          Logger.log('[SUMMARY] Found previous month row: %s for %s', previousMonthRow, previousMonthStr);
          break;
        }
      } catch (innerErr) {
        Logger.log('[SUMMARY] Error reading previous month at row %s: %s', row, innerErr.message);
      }
    }

    if (previousMonthRow === -1) {
      Logger.log('[SUMMARY] Using fallback row %s for previous month %s', currentMonthRow - 1, previousMonthStr);
      previousMonthRow = currentMonthRow - 1;
    }

    try {
      summary.monthCurrent.farmed = Number(sheet.getRange(currentMonthRow, 2).getValue()) || 0;
      summary.monthCurrent.payouts = Number(sheet.getRange(currentMonthRow, 3).getValue()) || 0;
      summary.monthCurrent.balance = Number(sheet.getRange(currentMonthRow, 4).getValue()) || 0;
      summary.monthCurrent.expenses = Number(sheet.getRange(currentMonthRow, 5).getValue()) || 0;
      summary.monthCurrent.day1 = Number(sheet.getRange(currentMonthRow, 11).getValue()) || 0;
      summary.monthCurrent.day2 = Number(sheet.getRange(currentMonthRow, 12).getValue()) || 0;
      summary.monthCurrent.funded = Number(sheet.getRange(currentMonthRow, 13).getValue()) || 0;
      summary.monthCurrent.pending = Number(sheet.getRange('G21').getValue()) || 0;
      summary.monthCurrent.pendingPayouts = summary.monthCurrent.pending + summary.monthCurrent.payouts;

      summary.monthPrevious.farmed = Number(sheet.getRange(previousMonthRow, 2).getValue()) || 0;
      summary.monthPrevious.payouts = Number(sheet.getRange(previousMonthRow, 3).getValue()) || 0;
      summary.monthPrevious.balance = Number(sheet.getRange(previousMonthRow, 4).getValue()) || 0;
      summary.monthPrevious.expenses = Number(sheet.getRange(previousMonthRow, 5).getValue()) || 0;
      summary.monthPrevious.day1 = Number(sheet.getRange(previousMonthRow, 11).getValue()) || 0;
      summary.monthPrevious.day2 = Number(sheet.getRange(previousMonthRow, 12).getValue()) || 0;
      summary.monthPrevious.funded = Number(sheet.getRange(previousMonthRow, 13).getValue()) || 0;
      summary.monthPrevious.pending = 20000; // Default for previous month
      summary.monthPrevious.pendingPayouts = summary.monthPrevious.pending + summary.monthPrevious.payouts;
    } catch (monthErr) {
      Logger.log('[SUMMARY] Error reading month data: %s', monthErr.message);
    }

    saveDailySnapshot(summary.currentDay, currentMonth, currentYear);

    var message = generateSlackSummaryMessage(summary, today, currentMonth, currentYear);
    Logger.log('[SUMMARY] Generated summary message (%s chars)', message.length);
    return message;
  } catch (e) {
    Logger.log('[ERROR] Error in generateDailyWeeklySummary: ' + e.message);
    return 'Error generating summary: ' + e.message;
  }
}

function generateSlackSummaryMessage(summary, today, currentMonth, currentYear) {
  var message = '';
  var now = new Date();
  var start = new Date(now.getFullYear(), 0, 1);
  var diff = now - start;
  var oneWeek = 1000 * 60 * 60 * 24 * 7;
  var weekNumber = Math.floor(diff / oneWeek) + 1;
  var monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var monthName = monthNames[currentMonth];
  var weekCurrent = summary.weekCurrent || createEmptyMetrics();
  var weekPrevious = summary.weekPrevious || createEmptyMetrics();
  var monthCurrent = summary.monthCurrent || summary.currentDay;
  var monthPrevious = summary.monthPrevious || summary.previousDay;

  message += '📅 *' + today + '/' + currentMonth + '/' + currentYear + '*\n\n';

  var metrics = [
    { label: '💰 Farmed', field: 'farmed', money: true },
    { label: '💸 Pending + Payouts', field: 'pendingPayouts', money: true },
    { label: '🏦 Balance', field: 'balance', money: true },
    { label: '💳 Expenses', field: 'expenses', money: true },
    { label: '1️⃣ Day 1', field: 'day1', money: false },
    { label: '2️⃣ Day 2', field: 'day2', money: false },
    { label: '✅ Funded', field: 'funded', money: false }
  ];

  metrics.forEach(function(metric) {
    var dayCurrent = summary.currentDay[metric.field] || 0;
    var dayPrevious = summary.previousDay[metric.field] || 0;
    var weekCurrentValue = weekCurrent[metric.field] || 0;
    var weekPreviousValue = weekPrevious[metric.field] || 0;
    var monthCurrentValue = monthCurrent[metric.field] || dayCurrent;
    var monthPreviousValue = monthPrevious[metric.field] || dayPrevious;

    message += metric.label + ':\n';
    message += '• Day:     ' + formatValue(metric.money, dayCurrent, dayPrevious) + '\n';
    message += '• Week:   ' + formatValue(metric.money, weekCurrentValue, 0, { showTotal: true, includeDifference: false }) + '\n';
    message += '• Month:   ' + formatValue(metric.money, monthCurrentValue, monthPreviousValue, { showTotal: true, includeDifference: false }) + '\n\n';
  });

  return message;
}

function getSlackWebhookUrl(channel) {
  /*
   * Get the Slack webhook URL for the specified channel
   */
  try {
    var properties = PropertiesService.getScriptProperties();
    var webhookUrl = properties.getProperty('SLACK_WEBHOOK_URL_' + channel.toUpperCase());
    return webhookUrl;
  } catch (e) {
    Logger.log('[ERROR] Failed to get Slack webhook URL for channel %s: %s', channel, e.message);
    return null;
  }
}

