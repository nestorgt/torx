/**
 * expenses.gs
 *
 * Expense tracking and calculation
 */

function calculateMonthlyExpensesTotal(month, year) {
  Logger.log('=== CALCULATING MONTHLY EXPENSES TOTAL ===');
  Logger.log('[EXPENSES] Month: %s, Year: %s', month, year);
  
  // Validate parameters
  if (!month || !year) {
    throw new Error('Month and year parameters are required');
  }
  if (month < 1 || month > 12) {
    throw new Error('Month must be between 1 and 12');
  }
  if (year < 2025) {
    throw new Error('Year must be 2025 or later');
  }
  
  var result = {
    month: month,
    year: year,
    monthStr: month.toString().padStart(2, '0') + '-' + year,
    totalExpenses: 0,
    breakdown: {
      mercury: { cardExpenses: 0, transfersOut: 0, transfersIn: 0, total: 0 },
      airwallex: { cardExpenses: 0, transfersOut: 0, transfersIn: 0, total: 0 },
      revolut: { cardExpenses: 0, transfersOut: 0, transfersIn: 0, total: 0 },
      revolutToNestor: { transfers: 0, total: 0 }
    },
    details: {
      mercury: null,
      airwallex: null,
      revolut: null,
      revolutToNestor: []
    },
    errors: []
  };
  
  // ===== MERCURY =====
  try {
    Logger.log('[MERCURY] Fetching expenses for %s-%s', month, year);
    var me = fetchMercuryExpenses_(month, year);
    result.breakdown.mercury.cardExpenses = Number(me.cardExpenses || 0);
    result.breakdown.mercury.transfersOut = Number(me.transfersOut || 0);
    result.breakdown.mercury.transfersIn = Number(me.transfersIn || 0);
    result.breakdown.mercury.total = result.breakdown.mercury.cardExpenses + result.breakdown.mercury.transfersOut;
    result.details.mercury = me;
    result.totalExpenses += result.breakdown.mercury.total;
    Logger.log('[MERCURY] %s-%s: Cards $%s, TransfersOut $%s, Total $%s', 
      month, year, result.breakdown.mercury.cardExpenses, result.breakdown.mercury.transfersOut, result.breakdown.mercury.total);
  } catch(e) {
    Logger.log('[ERROR] Mercury expenses %s-%s: %s', month, year, e.message);
    result.errors.push('Mercury: ' + e.message);
  }
  
  // ===== AIRWALLEX =====
  try {
    Logger.log('[AIRWALLEX] Fetching expenses for %s-%s', month, year);
    var ae = fetchAirwallexExpenses_(month, year);
    result.breakdown.airwallex.cardExpenses = Number(ae.cardExpenses || 0);
    result.breakdown.airwallex.transfersOut = Number(ae.waresoulTransfersOut || 0) + Number(ae.nestorTransfersOut || 0) + Number(ae.otherTransfersOut || 0);
    result.breakdown.airwallex.transfersIn = Number(ae.waresoulTransfersIn || 0) + Number(ae.nestorTransfersIn || 0) + Number(ae.otherTransfersIn || 0);
    result.breakdown.airwallex.total = result.breakdown.airwallex.cardExpenses + result.breakdown.airwallex.transfersOut;
    result.details.airwallex = ae;
    result.totalExpenses += result.breakdown.airwallex.total;
    Logger.log('[AIRWALLEX] %s-%s: Cards $%s, TransfersOut $%s, Total $%s', 
      month, year, result.breakdown.airwallex.cardExpenses, result.breakdown.airwallex.transfersOut, result.breakdown.airwallex.total);
  } catch(e) {
    Logger.log('[ERROR] Airwallex expenses %s-%s: %s', month, year, e.message);
    result.errors.push('Airwallex: ' + e.message);
  }
  
  // ===== REVOLUT =====
  try {
    Logger.log('[REVOLUT] Fetching expenses for %s-%s', month, year);
    var re = fetchRevolutExpenses_(month, year);
    result.breakdown.revolut.cardExpenses = Number(re.cardExpenses || 0);
    result.breakdown.revolut.transfersOut = Number(re.transfersOut || 0);
    result.breakdown.revolut.transfersIn = Number(re.transfersIn || 0);
    result.breakdown.revolut.total = result.breakdown.revolut.cardExpenses + result.breakdown.revolut.transfersOut;
    result.details.revolut = re;
    result.totalExpenses += result.breakdown.revolut.total;
    Logger.log('[REVOLUT] %s-%s: Cards $%s, TransfersOut $%s, Total $%s', 
      month, year, result.breakdown.revolut.cardExpenses, result.breakdown.revolut.transfersOut, result.breakdown.revolut.total);
  } catch(e) {
    Logger.log('[ERROR] Revolut expenses %s-%s: %s', month, year, e.message);
    result.errors.push('Revolut: ' + e.message);
  }
  
  // ===== REVOLUT-TO-NESTOR TRANSFERS (revtag) =====
  try {
    Logger.log('[REVOLUT-TO-NESTOR] Fetching transfers for %s-%s', month, year);
    var revolutToNestor = getRevolutToNestorTransfers_(month, year);
    if (revolutToNestor && revolutToNestor.length > 0) {
      var rawTotal = revolutToNestor.reduce(function(sum, tx) { return sum + tx.amount; }, 0);

      // Subtract transfers to Nexo (internal transfers, not expenses)
      // Since we don't have access to personal Revolut, we use configured amounts
      var nexoTransferTotal = getRevolutToNexoAmount_(month, year);

      var actualExpenses = rawTotal - nexoTransferTotal;

      result.breakdown.revolutToNestor.transfers = revolutToNestor.length;
      result.breakdown.revolutToNestor.total = actualExpenses;
      result.breakdown.revolutToNestor.rawTotal = rawTotal;
      result.breakdown.revolutToNestor.nexoTransfers = nexoTransferTotal;
      result.details.revolutToNestor = revolutToNestor;
      result.totalExpenses += actualExpenses;

      Logger.log('[REVOLUT-TO-NESTOR] %s-%s: %s transfers, Raw total $%s, Nexo transfers $%s, Actual expenses $%s',
        month, year, result.breakdown.revolutToNestor.transfers, rawTotal.toFixed(2), nexoTransferTotal.toFixed(2), actualExpenses.toFixed(2));
    }
  } catch(e) {
    Logger.log('[ERROR] Revolut-to-Nestor transfers %s-%s: %s', month, year, e.message);
    result.errors.push('Revolut-to-Nestor: ' + e.message);
  }
  
  // Round totals
  result.totalExpenses = Math.round(result.totalExpenses * 100) / 100;
  result.breakdown.mercury.total = Math.round(result.breakdown.mercury.total * 100) / 100;
  result.breakdown.airwallex.total = Math.round(result.breakdown.airwallex.total * 100) / 100;
  result.breakdown.revolut.total = Math.round(result.breakdown.revolut.total * 100) / 100;
  result.breakdown.revolutToNestor.total = Math.round(result.breakdown.revolutToNestor.total * 100) / 100;
  
  Logger.log('[EXPENSES] %s-%s TOTAL: $%s', month, year, result.totalExpenses);
  Logger.log('=== MONTHLY EXPENSES CALCULATION COMPLETED ===');
  
  return result;
}

function calculateCurrentMonthExpensesToDate() {
  Logger.log('=== CALCULATING CURRENT MONTH EXPENSES TO DATE ===');
  
  var now = new Date();
  var currentMonth = now.getMonth() + 1; // getMonth() returns 0-11
  var currentYear = now.getFullYear();
  var today = now.getDate();
  
  Logger.log('[EXPENSES] Current month: %s-%s, Today: %s', currentMonth, currentYear, today);
  
  // Use the monthly calculation function
  var result = calculateMonthlyExpensesTotal(currentMonth, currentYear);
  
  // Add current month context
  result.currentMonth = true;
  result.today = today;
  result.monthProgress = Math.round((today / new Date(currentYear, currentMonth, 0).getDate()) * 100);
  
  Logger.log('[EXPENSES] Current month %s-%s (day %s/%s, %s%% complete): $%s', 
    currentMonth, currentYear, today, new Date(currentYear, currentMonth, 0).getDate(), result.monthProgress, result.totalExpenses);
  
  return result;
}

function calculateMultipleMonthsExpenses(months) {
  Logger.log('=== CALCULATING MULTIPLE MONTHS EXPENSES ===');
  Logger.log('[EXPENSES] Processing %s months', months.length);
  
  var results = [];
  var grandTotal = 0;
  var errors = [];
  
  for (var i = 0; i < months.length; i++) {
    var monthData = months[i];
    try {
      var monthResult = calculateMonthlyExpensesTotal(monthData.month, monthData.year);
      results.push(monthResult);
      grandTotal += monthResult.totalExpenses;
      Logger.log('[EXPENSES] %s-%s: $%s', monthData.month, monthData.year, monthResult.totalExpenses);
    } catch (e) {
      Logger.log('[ERROR] Failed to calculate %s-%s: %s', monthData.month, monthData.year, e.message);
      errors.push(monthData.month + '-' + monthData.year + ': ' + e.message);
    }
  }
  
  var summary = {
    totalMonths: months.length,
    successfulMonths: results.length,
    failedMonths: errors.length,
    grandTotal: Math.round(grandTotal * 100) / 100,
    results: results,
    errors: errors
  };
  
  Logger.log('[EXPENSES] Multiple months summary: %s successful, %s failed, Grand total: $%s', 
    summary.successfulMonths, summary.failedMonths, summary.grandTotal);
  
  return summary;
}

function buildMonthlyExpensesNotes_(me, ae, re, totalToNestor) {
  var noteDetails = [];
  
  // 1. Airwallex
  if (ae && ae.cardExpenses !== undefined) {
    noteDetails.push('Airwallex: Cards $' + (ae.cardExpenses || 0).toFixed(2));
  } else {
    noteDetails.push('Airwallex: ERROR - ' + (ae && ae.error || 'Unknown error'));
  }

  // 2. Mercury
  if (me && me.cardExpenses !== undefined) {
    noteDetails.push('Mercury: Cards $' + (me.cardExpenses || 0).toFixed(2));
  } else {
    noteDetails.push('Mercury: ERROR - ' + (me && me.error || 'Unknown error'));
  }  
  
  // 3. Revolut
  if (re && re.cardExpenses !== undefined) {
    noteDetails.push('Revolut: Cards $' + (re.cardExpenses || 0).toFixed(2));
    
    // Add Revolut-to-Nestor transfers as bullet line (now counted in total)
    if (totalToNestor > 0) {
      noteDetails.push('revtag: $' + totalToNestor.toFixed(2));
    }
  } else {
    noteDetails.push('Revolut: ERROR - ' + (re && re.error || 'Unknown error'));
  }
  
  return noteDetails;
}

function formatMonthlyExpensesNote_(noteDetails) {
  var formattedNote = '';
  noteDetails.forEach(function(detail) {
    if (detail.includes('Mercury:') || detail.includes('Airwallex:') || detail.includes('Revolut:')) {
      // Bank header - no bullet
      formattedNote += detail + '\n';
    } else {
      // Error messages get bullet
      formattedNote += '- ' + detail + '\n';
    }
  });
  return formattedNote;
}

function updateMonthlyExpenses(month, year) {
  // Validate parameters
  if (!month || !year) {
    Logger.log('[ERROR] updateMonthlyExpenses: month and year are required');
    throw new Error('Month and year parameters are required');
  }
  if (month < 1 || month > 12) {
    Logger.log('[ERROR] updateMonthlyExpenses: month must be 1-12, got: %s', month);
    throw new Error('Month must be between 1 and 12');
  }
  if (year < 2025) {
    Logger.log('[ERROR] updateMonthlyExpenses: year must be >= 2025, got: %s', year);
    throw new Error('Year must be 2025 or later');
  }
  
  Logger.log('--- INICIO updateMonthlyExpenses %s ---', mmYYYY_(month, year));
  
  var sh = sheet_(SHEET_NAME);
  // Early exit if proxy is down
  if (!proxyIsUp_()) {
    setNoteOnly_(sh, TS_CELL, 'SERVER DOWN (proxy) ' + nowStamp_() + ' — cannot update ' + month + '-' + year);
    Logger.log('[ERROR] Proxy health check failed. Aborting updateMonthlyExpenses.');
    return;
  }
  
  // Calculate target row: G8 for July 2025, G9 for August 2025, etc.
  // Expenses column is G in the monthly data section (rows 8+)
  var targetRow = 8 + (year - 2025) * 12 + (month - 7);

  // Validate target row is reasonable
  if (targetRow < 8 || targetRow > 200) {
    Logger.log('[ERROR] updateMonthlyExpenses: calculated target row %s is out of range', targetRow);
    throw new Error('Calculated target row ' + targetRow + ' is out of valid range');
  }

  var targetCell = 'G' + targetRow;
  
  var totalCardExpenses = 0;
  var noteDetails = [];
  var me = null, ae = null, re = null; // Store results for ordered display
  
  // ===== MERCURY =====
  try {
    me = fetchMercuryExpenses_(month, year);
    totalCardExpenses += Number(me.cardExpenses || 0);
    Logger.log('[MERCURY] Month %s: Cards $%s', mmYYYY_(month, year), me.cardExpenses);
  } catch(e) {
    Logger.log('[ERROR] Mercury expenses %s: %s', mmYYYY_(month, year), e.message);
  }
  
  // ===== AIRWALLEX =====
  try {
    ae = fetchAirwallexExpenses_(month, year);
    totalCardExpenses += Number(ae.cardExpenses || 0);
    Logger.log('[AIRWALLEX] Month %s: Cards $%s', mmYYYY_(month, year), ae.cardExpenses);
  } catch(e) {
    Logger.log('[ERROR] Airwallex expenses %s: %s', mmYYYY_(month, year), e.message);
  }
  
  // ===== REVOLUT =====
  try {
    re = fetchRevolutExpenses_(month, year);
    totalCardExpenses += Number(re.cardExpenses || 0);
    Logger.log('[REVOLUT] Month %s: Cards $%s', mmYYYY_(month, year), re.cardExpenses);
  } catch(e) {
    Logger.log('[ERROR] Revolut expenses %s: %s', mmYYYY_(month, year), e.message);
  }
  
  // ===== REVOLUT-TO-NESTOR TRANSFERS (revtag) =====
  var revolutToNestor = getRevolutToNestorTransfers_(month, year);
  var totalToNestor = 0;
  if (revolutToNestor && revolutToNestor.length > 0) {
    var rawTotal = revolutToNestor.reduce(function(sum, tx) { return sum + tx.amount; }, 0);

    // Subtract transfers to Nexo (internal transfers, not expenses)
    var nexoTransferTotal = getRevolutToNexoAmount_(month, year);

    totalToNestor = rawTotal - nexoTransferTotal;
    totalCardExpenses += totalToNestor;

    Logger.log('[REVOLUT-TO-NESTOR] Month %s-%s: Raw $%s, Nexo transfers $%s, Actual expenses $%s (%s transactions)',
      month, year, rawTotal.toFixed(2), nexoTransferTotal.toFixed(2), totalToNestor.toFixed(2), revolutToNestor.length);
  }
  
  // ===== BUILD NOTES USING HELPER FUNCTION =====
  var noteDetails = buildMonthlyExpensesNotes_(me, ae, re, totalToNestor);
  
  // Write total card expenses to sheet
  var finalNote = noteDetails.join('\n');
  Logger.log('[NOTE] Final note for %s: "%s"', mmYYYY_(month, year), finalNote);
  
  // Format the note with proper line breaks
  var formattedNote = formatMonthlyExpensesNote_(noteDetails);
  
  Logger.log('[NOTE] Formatted note: "%s"', formattedNote);
  
  // Set value and note directly
  var targetRange = sh.getRange(targetCell);
  targetRange.setValue(Number(totalCardExpenses));
  targetRange.setNote(formattedNote);
  
  // Verify the note was added
  var addedNote = sh.getRange(targetCell).getNote();
  Logger.log('[VERIFY] Note added to %s: "%s"', targetCell, addedNote);
  
  Logger.log('[WRITE] Monthly expenses %s: $%s -> %s', mmYYYY_(month, year), totalCardExpenses.toFixed(2), targetCell);

  // Update total transfers cell (hidden white text)
  updateTotalTransfersCell_(sh);

  Logger.log('--- FIN updateMonthlyExpenses %s ---', mmYYYY_(month, year));
}

function updateTotalTransfersCell_(sh) {
  /**
   * Calculate total Revolut-to-Nestor transfers across all months
   * by reading notes from expense cells (G8, G9, etc.)
   * Note: This function only logs the total, doesn't write to any cell
   * (D4 is reserved for Revolut balance formulas)
   */
  try {
    var totalTransfers = 0;

    // Sum up all months (rows 8-19 = Jul 2025 to Jun 2026)
    // Monthly expenses are in column G starting at row 8
    for (var row = 8; row <= 19; row++) {
      var cellAddress = 'G' + row;
      var cellNote = sh.getRange(cellAddress).getNote();

      if (cellNote) {
        // Extract revtag amount from note
        // Note format: "...revtag: $8910.00..."
        var revtagMatch = cellNote.match(/revtag:\s*\$?([\d,]+\.?\d*)/i);
        if (revtagMatch) {
          var amount = parseFloat(revtagMatch[1].replace(/,/g, ''));
          totalTransfers += amount;
          Logger.log('[TOTAL_TRANSFERS] %s: Found $%s', cellAddress, amount.toFixed(2));
        }
      }
    }

    Logger.log('[TOTAL_TRANSFERS] ✅ Total revtag transfers: $%s', totalTransfers.toFixed(2));

  } catch (e) {
    Logger.log('[ERROR] updateTotalTransfersCell_: %s', e.message);
  }
}

function updateCurrentMonthExpenses() {
  var now = new Date();
  var month = now.getMonth() + 1; // getMonth() returns 0-11
  var year = now.getFullYear();
  updateMonthlyExpenses(month, year);
}

function updateSpecificMonthExpenses(month, year) {
  if (!month || !year) {
    Logger.log('[ERROR] updateSpecificMonthExpenses: month y year son obligatorios');
    return;
  }
  if (month < 1 || month > 12) {
    Logger.log('[ERROR] updateSpecificMonthExpenses: month debe ser 1-12');
    return;
  }
  if (year < 2025) {
    Logger.log('[ERROR] updateSpecificMonthExpenses: year debe ser >= 2025');
    return;
  }
  updateMonthlyExpenses(month, year);
}

function testMonthlyExpenses(month, year) {
  if (!month || !year) { throw new Error('Month and year are required'); }
  if (month < 1 || month > 12) { throw new Error('Month must be 1-12'); }
  if (year < 2025) { throw new Error('Year must be >= 2025'); }

  var totalCardExpenses = 0;
  var noteDetails = [];
  var me = null, ae = null, re = null;

  try {
    me = fetchMercuryExpenses_(month, year);
    totalCardExpenses += Number(me.cardExpenses || 0);
  } catch (e) {
    // Error will be handled in ordered display
  }

  try {
    ae = fetchAirwallexExpenses_(month, year);
    totalCardExpenses += Number(ae.cardExpenses || 0);
  } catch (e) {
    // Error will be handled in ordered display
  }

  try {
    re = fetchRevolutExpenses_(month, year);
    totalCardExpenses += Number(re.cardExpenses || 0);
  } catch (e) {
    // Error will be handled in ordered display
  }

  // Add Revolut-to-Nestor transfers (revtag)
  var revolutToNestor = getRevolutToNestorTransfers_(month, year);
  var totalToNestor = 0;
  if (revolutToNestor && revolutToNestor.length > 0) {
    var rawTotal = revolutToNestor.reduce(function(sum, tx) { return sum + tx.amount; }, 0);
    var nexoTransferTotal = getRevolutToNexoAmount_(month, year);
    totalToNestor = rawTotal - nexoTransferTotal;
    totalCardExpenses += totalToNestor;
  }

  // ===== BUILD NOTES USING HELPER FUNCTION =====
  var noteDetails = buildMonthlyExpensesNotes_(me, ae, re, totalToNestor);
  var formattedNote = formatMonthlyExpensesNote_(noteDetails);

  Logger.log('[TEST RUN] %s-%s total cards $%s', month, year, (totalCardExpenses || 0).toFixed(2));
  Logger.log('[TEST RUN] Details:\n%s', formattedNote);

  return {
    month: Number(month),
    year: Number(year),
    totalCardExpenses: Number(totalCardExpenses),
    note: formattedNote,
    mercury: me,
    airwallex: ae,
    revolut: re
  };
}

function calculateMonthlyExpenses_() {
  var result = {
    status: 'success',
    calculated: false,
    errors: []
  };

  try {
    var now = new Date();
    var dayOfMonth = now.getDate();

    // During first 5 days of month, also update last month (in case of late transactions)
    if (dayOfMonth <= 5) {
      Logger.log('[EXPENSES] Day %s of month - updating last month and current month...', dayOfMonth);
      updateLastAndCurrentMonthExpenses();
    } else {
      Logger.log('[EXPENSES] Calculating current month expenses...');
      updateCurrentMonthExpenses();
    }

    result.calculated = true;
    Logger.log('[EXPENSES] Monthly expenses calculated successfully');
    return result;
  } catch (e) {
    Logger.log('[ERROR] Monthly expense calculation failed: %s', e.message);
    result.status = 'error';
    result.errors.push(e.message);
    return result;
  }
}

/* ============== Menu Functions ============== */

function menuUpdateCurrentMonthExpenses() {
  var now = new Date();
  var month = now.getMonth() + 1;
  var year = now.getFullYear();

  Logger.log('[MENU] Updating current month expenses: %s/%s', month, year);
  updateMonthlyExpenses(month, year);

  SpreadsheetApp.getUi().alert(
    'Expenses Updated',
    'Current month expenses (' + month + '/' + year + ') have been updated.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function menuUpdateSpecificMonthExpenses() {
  var ui = SpreadsheetApp.getUi();

  // Prompt for month
  var monthResponse = ui.prompt(
    'Enter Month',
    'Enter the month number (1-12):',
    ui.ButtonSet.OK_CANCEL
  );

  if (monthResponse.getSelectedButton() !== ui.Button.OK) return;
  var month = parseInt(monthResponse.getResponseText());

  if (isNaN(month) || month < 1 || month > 12) {
    ui.alert('Invalid month. Please enter a number between 1 and 12.');
    return;
  }

  // Prompt for year
  var yearResponse = ui.prompt(
    'Enter Year',
    'Enter the year (e.g., 2025):',
    ui.ButtonSet.OK_CANCEL
  );

  if (yearResponse.getSelectedButton() !== ui.Button.OK) return;
  var year = parseInt(yearResponse.getResponseText());

  if (isNaN(year) || year < 2025) {
    ui.alert('Invalid year. Please enter a year >= 2025.');
    return;
  }

  Logger.log('[MENU] Updating specific month expenses: %s/%s', month, year);
  updateMonthlyExpenses(month, year);

  ui.alert(
    'Expenses Updated',
    'Expenses for ' + month + '/' + year + ' have been updated.',
    ui.ButtonSet.OK
  );
}

function menuTestCurrentMonthExpenses() {
  var now = new Date();
  var month = now.getMonth() + 1;
  var year = now.getFullYear();

  Logger.log('[MENU] Testing current month expenses: %s/%s', month, year);
  var result = testMonthlyExpenses(month, year);

  SpreadsheetApp.getUi().alert(
    'Test Results',
    'Current month (' + month + '/' + year + ') expense test:\n\n' +
    'Total Card Expenses: $' + result.totalCardExpenses.toFixed(2) + '\n' +
    'Total Revtag: $' + result.totalRevtag.toFixed(2) + '\n' +
    'Total Nexo Deposits: $' + result.totalNexoDeposits.toFixed(2) + '\n\n' +
    'Details:\n' + result.details.join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function updateLastAndCurrentMonthExpenses() {
  /**
   * Update expenses for both last month and current month
   * Useful for the first days of the month when last month may still need updates
   */
  var now = new Date();
  var currentMonth = now.getMonth() + 1;
  var currentYear = now.getFullYear();

  // Calculate last month
  var lastMonth = currentMonth - 1;
  var lastYear = currentYear;
  if (lastMonth < 1) {
    lastMonth = 12;
    lastYear = currentYear - 1;
  }

  Logger.log('[BATCH_UPDATE] Updating expenses for %s/%s and %s/%s', lastMonth, lastYear, currentMonth, currentYear);

  // Update last month first
  if (lastYear >= 2025) {
    updateMonthlyExpenses(lastMonth, lastYear);
  }

  // Then update current month
  updateMonthlyExpenses(currentMonth, currentYear);

  Logger.log('[BATCH_UPDATE] Completed expense updates');
}

