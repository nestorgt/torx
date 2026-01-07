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
    var webhookUrl = properties.getProperty('SLACK_WEBHOOK_URL_BANK-CARDS');

    if (!webhookUrl) {
      Logger.log('[SLACK] Missing bank-cards webhook URL');
      return { sent: false, reason: 'Missing webhook URL' };
    }

    var messageLines = ['💵 Payments received:'];
    notifications.forEach(function(entry) {
      var reference = entry.reference || 'Unknown';
      var baseAmount = Number(entry.baseAmount || entry.amount || 0);
      var receivedAmount = Number(entry.receivedAmount || entry.amount || 0);

      var formattedBase = '$' + Math.abs(baseAmount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      var formattedReceived = '$' + Math.abs(receivedAmount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

      // Format: Reference $5000 ($4480) if amounts differ, otherwise just $5000
      var amountStr = formattedBase;
      if (Math.abs(baseAmount - receivedAmount) > 1) {
        amountStr = formattedBase + ' (' + formattedReceived + ')';
      }

      messageLines.push('• ' + reference + ' ' + amountStr);
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

    Logger.log('[SUMMARY] Looking for month: %s (Year=%s, Month=%s)', currentMonthStr, currentYear, currentMonth);

    for (var row = 7; row <= lastRow; row++) {
      try {
        var monthValue = sheet.getRange(row, 1).getValue();
        var monthStr = String(monthValue).trim();

        Logger.log('[SUMMARY] Row %s, Column A: "%s"', row, monthStr);

        // Check multiple formats: "2025-11", "11-2025", "November", "Nov", or Date object
        var isMatch = false;

        if (monthValue instanceof Date) {
          // It's a Date object - check month and year
          var dateMonth = monthValue.getMonth() + 1;
          var dateYear = monthValue.getFullYear();
          if (dateMonth === currentMonth && dateYear === currentYear) {
            isMatch = true;
            Logger.log('[SUMMARY] Row %s matches as Date: month=%s, year=%s', row, dateMonth, dateYear);
          }
        } else if (monthStr.includes(currentMonthStr)) {
          // String contains "2025-11"
          isMatch = true;
          Logger.log('[SUMMARY] Row %s matches string: "%s"', row, monthStr);
        } else if (monthStr.includes(currentMonth + '-' + currentYear)) {
          // Format is "11-2025" instead of "2025-11"
          isMatch = true;
          Logger.log('[SUMMARY] Row %s matches reversed format: "%s"', row, monthStr);
        }

        if (isMatch) {
          currentMonthRow = row;
          Logger.log('[SUMMARY] ✅ Found current month row: %s for %s/%s', currentMonthRow, currentMonth, currentYear);
          break;
        }
      } catch (innerErr) {
        Logger.log('[SUMMARY] Error reading month at row %s: %s', row, innerErr.message);
      }
    }

    if (currentMonthRow === -1) {
      // Fallback: row 2 = January (month 1), row 3 = February, ..., row 12 = November (month 11)
      currentMonthRow = 1 + currentMonth; // Row 2 for Jan, Row 3 for Feb, ..., Row 12 for Nov
      Logger.log('[SUMMARY] ⚠️ Month not found, using calculated row %s for month %s', currentMonthRow, currentMonth);
    }

    try {
      Logger.log('[SUMMARY] Reading current day data from row %s', currentMonthRow);
      summary.currentDay.farmed = Number(sheet.getRange(currentMonthRow, 2).getValue()) || 0;
      summary.currentDay.farmedMonth = Number(sheet.getRange(currentMonthRow, 2).getValue()) || 0;
      summary.currentDay.payouts = Number(sheet.getRange(currentMonthRow, 3).getValue()) || 0;
      summary.currentDay.balance = Number(sheet.getRange(currentMonthRow, 4).getValue()) || 0;
      summary.currentDay.expenses = Number(sheet.getRange(currentMonthRow, 7).getValue()) || 0;
      summary.currentDay.day1 = Number(sheet.getRange(currentMonthRow, 10).getValue()) || 0;
      summary.currentDay.day2 = Number(sheet.getRange(currentMonthRow, 11).getValue()) || 0;
      summary.currentDay.funded = Number(sheet.getRange(currentMonthRow, 12).getValue()) || 0;
      summary.currentDay.pending = Number(sheet.getRange('G21').getValue()) || 0;
      summary.currentDay.pendingPayouts = summary.currentDay.pending + summary.currentDay.payouts;

      Logger.log('[SUMMARY] Current day values: Farmed=$%s, Payouts=$%s, Balance=$%s, Expenses=$%s, Day1=%s, Day2=%s, Funded=%s',
        summary.currentDay.farmed, summary.currentDay.payouts, summary.currentDay.balance, summary.currentDay.expenses,
        summary.currentDay.day1, summary.currentDay.day2, summary.currentDay.funded);
    } catch (sheetErr) {
      Logger.log('[SUMMARY] Error reading current month row %s: %s', currentMonthRow, sheetErr.message);
    }

    // Load last available snapshot (handles weekends and missed days)
    var previousSnapshot = loadLastAvailableSnapshot(7);

    // On the 1st of the month, don't compare to previous month's snapshot
    // because cumulative values reset and deltas would be nonsensical
    var today = new Date().getDate();
    if (today === 1) {
      Logger.log('[SUMMARY] First day of month - skipping previous snapshot comparison');
      summary.previousDay = createEmptyMetrics(); // Use zeros as baseline for first day of month
      summary.hasPreviousDaySnapshot = false;
    } else {
      summary.previousDay = sanitizeMetrics(previousSnapshot);
      summary.hasPreviousDaySnapshot = !!previousSnapshot;

      // Debug logging
      if (!previousSnapshot) {
        summary.previousDay = createEmptyMetrics(); // Use zeros as baseline if no snapshot
        Logger.log('[SUMMARY] No previous snapshot found in last 7 days – using zeros as baseline');
      } else {
        summary.hasPreviousDaySnapshot = true;
      }
    }

    // Week accumulation: Sum up daily deltas from Monday through today (Friday max)
    // For each weekday, calculate delta from previous day and sum them up
    var weekMetrics = createEmptyMetrics();

    var currentDate = new Date(weekStart);
    var endDate = new Date(now);

    // Don't go beyond Friday (day 5)
    var currentDayOfWeek = now.getDay();
    if (currentDayOfWeek === 0 || currentDayOfWeek === 6) {
      // Weekend - use Friday as end date
      endDate = new Date(weekStart);
      endDate.setDate(weekStart.getDate() + 4); // Friday
    }

    Logger.log('[SUMMARY] Week sum: Monday=%s/%s to %s=%s/%s',
      weekStart.getDate(), weekStart.getMonth() + 1,
      endDate.getDay() === 5 ? 'Friday' : 'Today',
      endDate.getDate(), endDate.getMonth() + 1);

    // Sum up daily deltas for each day in the week
    while (currentDate <= endDate) {
      var daySnapshot = loadSnapshotForDate(currentDate);
      if (daySnapshot) {
        // Get previous day snapshot
        var prevDate = new Date(currentDate);
        prevDate.setDate(prevDate.getDate() - 1);
        var prevSnapshot = loadSnapshotForDate(prevDate);

        if (prevSnapshot) {
          // Add this day's delta to week total
          var dayDelta = cloneMetrics(daySnapshot);
          subtractMetrics(dayDelta, prevSnapshot);
          addMetrics(weekMetrics, dayDelta);

          Logger.log('[SUMMARY] Day %s/%s: delta farmed $%s, payouts $%s',
            currentDate.getDate(), currentDate.getMonth() + 1, dayDelta.farmed, dayDelta.payouts);
        } else {
          // First day of week or missing previous snapshot
          // Only add delta-friendly metrics (farmed), skip cumulative ones (payouts, pending, balance)
          // since we can't calculate their daily delta without a previous snapshot
          weekMetrics.farmed += Number(daySnapshot.farmed || 0);
          weekMetrics.day1 += Number(daySnapshot.day1 || 0);
          weekMetrics.day2 += Number(daySnapshot.day2 || 0);
          weekMetrics.funded += Number(daySnapshot.funded || 0);
          Logger.log('[SUMMARY] Day %s/%s: absolute farmed $%s (no previous, skipping cumulative metrics)',
            currentDate.getDate(), currentDate.getMonth() + 1, daySnapshot.farmed);
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    Logger.log('[SUMMARY] Week total farmed: $%s', weekMetrics.farmed);
    summary.weekCurrent = weekMetrics;
    // For pendingPayouts week: use payouts delta only (not pending, since pending is a current balance not accumulated)
    // pending is the current pending amount in G21, not something that should be summed over days
    summary.weekCurrent.pendingPayouts = summary.weekCurrent.payouts;

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

      if (dayBeforeSnapshot) {
        // Calculate delta and add to accumulation
        var prevDayDelta = cloneMetrics(prevDaySnapshot);
        subtractMetrics(prevDayDelta, dayBeforeSnapshot);
        addMetrics(prevWeekMetrics, prevDayDelta);
      } else {
        // No previous day snapshot - only add delta-friendly metrics
        prevWeekMetrics.farmed += Number(prevDaySnapshot.farmed || 0);
        prevWeekMetrics.day1 += Number(prevDaySnapshot.day1 || 0);
        prevWeekMetrics.day2 += Number(prevDaySnapshot.day2 || 0);
        prevWeekMetrics.funded += Number(prevDaySnapshot.funded || 0);
      }
    }
    summary.weekPrevious = prevWeekMetrics;
    // For pendingPayouts week: use payouts delta only (consistent with weekCurrent)
    summary.weekPrevious.pendingPayouts = summary.weekPrevious.payouts;
    summary.hasPreviousWeekSnapshot = Object.values(prevWeekMetrics).some(function(val) { return val !== 0; });

    // Month comparison: load previous month's data
    var previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    var previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    var previousMonthStr = previousYear + '-' + previousMonth.toString().padStart(2, '0');
    var previousMonthRow = -1;

    Logger.log('[SUMMARY] Looking for previous month: %s (Year=%s, Month=%s)', previousMonthStr, previousYear, previousMonth);

    for (var row = 7; row <= lastRow; row++) {
      try {
        var monthValue = sheet.getRange(row, 1).getValue();
        var monthStr = String(monthValue).trim();

        var isMatch = false;

        if (monthValue instanceof Date) {
          var dateMonth = monthValue.getMonth() + 1;
          var dateYear = monthValue.getFullYear();
          if (dateMonth === previousMonth && dateYear === previousYear) {
            isMatch = true;
          }
        } else if (monthStr.includes(previousMonthStr)) {
          isMatch = true;
        } else if (monthStr.includes(previousMonth + '-' + previousYear)) {
          isMatch = true;
        }

        if (isMatch) {
          previousMonthRow = row;
          Logger.log('[SUMMARY] ✅ Found previous month row: %s for %s/%s', previousMonthRow, previousMonth, previousYear);
          break;
        }
      } catch (innerErr) {
        Logger.log('[SUMMARY] Error reading previous month at row %s: %s', row, innerErr.message);
      }
    }

    if (previousMonthRow === -1) {
      previousMonthRow = 1 + previousMonth; // Row 2 for Jan, Row 3 for Feb, ..., Row 11 for Oct
      Logger.log('[SUMMARY] ⚠️ Previous month not found, using calculated row %s for month %s', previousMonthRow, previousMonth);
    }

    try {
      summary.monthCurrent.farmed = Number(sheet.getRange(currentMonthRow, 2).getValue()) || 0;
      summary.monthCurrent.farmedMonth = Number(sheet.getRange(currentMonthRow, 2).getValue()) || 0;
      summary.monthCurrent.payouts = Number(sheet.getRange(currentMonthRow, 3).getValue()) || 0;
      summary.monthCurrent.balance = Number(sheet.getRange(currentMonthRow, 4).getValue()) || 0;
      summary.monthCurrent.expenses = Number(sheet.getRange(currentMonthRow, 7).getValue()) || 0;
      summary.monthCurrent.day1 = Number(sheet.getRange(currentMonthRow, 10).getValue()) || 0;
      summary.monthCurrent.day2 = Number(sheet.getRange(currentMonthRow, 11).getValue()) || 0;
      summary.monthCurrent.funded = Number(sheet.getRange(currentMonthRow, 12).getValue()) || 0;
      summary.monthCurrent.pending = Number(sheet.getRange('G21').getValue()) || 0;
      summary.monthCurrent.pendingPayouts = summary.monthCurrent.pending + summary.monthCurrent.payouts;

      summary.monthPrevious.farmed = Number(sheet.getRange(previousMonthRow, 2).getValue()) || 0;
      summary.monthPrevious.payouts = Number(sheet.getRange(previousMonthRow, 3).getValue()) || 0;
      summary.monthPrevious.balance = Number(sheet.getRange(previousMonthRow, 4).getValue()) || 0;
      summary.monthPrevious.expenses = Number(sheet.getRange(previousMonthRow, 7).getValue()) || 0;
      summary.monthPrevious.day1 = Number(sheet.getRange(previousMonthRow, 10).getValue()) || 0;
      summary.monthPrevious.day2 = Number(sheet.getRange(previousMonthRow, 11).getValue()) || 0;
      summary.monthPrevious.funded = Number(sheet.getRange(previousMonthRow, 12).getValue()) || 0;
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

  var financialMetrics = [
    { label: '💰 Farmed', field: 'farmed', money: true },
    { label: '💸 Pending + Payouts', field: 'pendingPayouts', money: true },
    { label: '🏦 Balance', field: 'balance', money: true },
    { label: '💳 Expenses', field: 'expenses', money: true }
  ];

  financialMetrics.forEach(function(metric) {
    var dayCurrent = summary.currentDay[metric.field] || 0;
    var dayPrevious = summary.previousDay[metric.field] || 0;
    var weekCurrentValue = weekCurrent[metric.field] || 0;
    var monthCurrentValue = monthCurrent[metric.field] || 0;

    message += metric.label + ':\n';
    message += ('• Day:').padEnd(14) + formatValue(metric.money, dayCurrent, dayPrevious) + '\n';

    // Only show Week for Pending + Payouts (not Farmed)
    if (metric.field === 'pendingPayouts') {
      message += ('• Week:').padEnd(14) + formatValue(metric.money, weekCurrentValue, 0, { showTotal: true, includeDifference: false }) + '\n';
    }

    // Show Total for Farmed (current month row, column B) and Balance; Month for Pending + Payouts and Expenses
    var monthLabel = (metric.field === 'pendingPayouts' || metric.field === 'expenses') ? 'Month' : 'Total';
    var totalPadding = (metric.field === 'farmed' || metric.field === 'balance') ? 17 : 14;
    message += ('• ' + monthLabel + ':').padEnd(totalPadding) + formatValue(metric.money, monthCurrentValue, 0, { showTotal: true, includeDifference: false }) + '\n\n';
  });

  // Compact accounts table
  var day1Day = summary.currentDay.day1 || 0;
  var day1DayPrev = summary.previousDay.day1 || 0;
  var day1Month = monthCurrent.day1 || 0;

  var day2Day = summary.currentDay.day2 || 0;
  var day2DayPrev = summary.previousDay.day2 || 0;
  var day2Month = monthCurrent.day2 || 0;

  var fundedDay = summary.currentDay.funded || 0;
  var fundedDayPrev = summary.previousDay.funded || 0;
  var fundedMonth = monthCurrent.funded || 0;

  message += 'Accounts:    ' + '1️⃣'.padEnd(8) + '2️⃣'.padEnd(8) + '✅\n';
  message += ('• Day:').padEnd(16) + formatValue(false, day1Day, day1DayPrev).padEnd(8) + formatValue(false, day2Day, day2DayPrev).padEnd(8) + formatValue(false, fundedDay, fundedDayPrev) + '\n';
  message += ('• Total:').padEnd(18) + String(day1Month).padEnd(10) + String(day2Month).padEnd(8) + String(fundedMonth) + '\n';

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

