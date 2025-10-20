/**
 * utils-sheets.gs
 *
 * Sheet manipulation utilities
 */

function setCellKeepFmt_(sh, a1, value, note) {
  Logger.log('[setCellKeepFmt_] Setting %s to value=%s, note="%s"', a1, value, note);

  try {
    var rng = sh.getRange(a1);
    var fmt = rng.getNumberFormat();

    if (value !== undefined) {
      rng.setValue(value);
      if (fmt) rng.setNumberFormat(fmt);
    }

    if (note === null || note === '') {
      rng.setNote('');
    } else if (note) {
      var existingNote = rng.getNote() || '';
      var timestamp = nowStamp_();
      var newNote = existingNote ? existingNote + '\n' + timestamp + ': ' + note : timestamp + ': ' + note;
      rng.setNote(newNote);
    }
  } catch (e) {
    Logger.log('[ERROR] setCellKeepFmt_ failed for %s: %s', a1, e.message);
  }
}

function setNoteOnly_(sh, a1, note) {
  try {
    var range = sh.getRange(a1);
    
    if (note === null) {
      range.setNote('');
      return;
    }

    note = safeErrorNote_(note) || note;
    var existingNote = range.getNote() || '';
    note = existingNote ? existingNote + '\n' + nowStamp_() + ': ' + note : nowStamp_() + ': ' + note;
    range.setNote(note);
  } catch (e) {
    Logger.log('[ERROR] setNoteOnly_ failed for %s: %s', a1, e.message);
  }
}

function a1_(row, col) { 
  return String.fromCharCode(64 + col) + row; 
}

function fmt2dec_(sh, a1) { 
  sh.getRange(a1).setNumberFormat('#,##0.00'); 
}

function clearNote_(sh, a1) {
  try {
    sh.getRange(a1).clearNote();
  } catch (e) {
    Logger.log('[ERROR] clearNote_ failed for %s: %s', a1, e.message);
  }
}

function safeErrorNote_(msg) {
  try {
    return String(msg).replace(/[^\x20-\x7E\t\n\r]/g, '').substr(0, 500);
  } catch (e) {
    return String(msg).substr(0, 500);
  }
}

function appendNoteTop_(sh, a1, lines, tz) {
  try {
    var existingNote = sh.getRange(a1).getNote() || '';
    var timestamp = nowStamp_();
    var newNote = '';
    for (var i = 0; i < lines.length; i++) {
      newNote += (i > 0 ? '\n' : '') + timestamp + ': ' + lines[i];
    }
    var fullNote = newNote + (existingNote ? '\n' + existingNote : '');
    sh.getRange(a1).setNote(fullNote);
  } catch (e) {
    Logger.log('[ERROR] appendNoteTop_ failed: %s', e.message);
  }
}

function setCellWithNote_(sheetName, a1, value, note) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    setCellKeepFmt_(sheet, a1, value, note);
  } catch (e) {
    Logger.log('[ERROR] setCellWithNote_ failed: %s', e.message);
  }
}

