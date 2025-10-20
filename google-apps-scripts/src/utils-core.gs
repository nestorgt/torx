/**
 * utils-core.gs
 *
 * Core utilities (date, props, bool, sheet)
 */

/**
 * Returns current timestamp in Madrid timezone
 * @returns {string} Formatted timestamp "yyyy-MM-dd HH:mm:ss"
 */
function nowStamp_() {
  return Utilities.formatDate(new Date(), CURRENT_TIMEZONE, "yyyy-MM-dd HH:mm:ss");
}

/**
 * Returns current timestamp for cell display
 * @returns {string} Formatted timestamp "yyyy-MM-dd HH:mm"
 */
function nowStampCell_() {
  return Utilities.formatDate(new Date(), CURRENT_TIMEZONE, "yyyy-MM-dd HH:mm");
}

/**
 * Convert value to boolean
 */
function toBool_(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    var clean = value.trim().toLowerCase();
    return clean === 'true' || clean === '1' || clean === 'yes';
  }
  return Boolean(value);
}

/**
 * Check if current day is weekend
 */
function isWeekend_(tz) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  Logger.log('[WEEKEND_CHECK] Day: %s, Is weekend: %s', dayOfWeek, isWeekend);
  return isWeekend;
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function getProp_(key) {
  try {
    return props_().getProperty(key);
  } catch (e) {
    Logger.log('[ERROR] getProp_ failed for %s: %s', key, e.message);
    return null;
  }
}

function setProp_(key, value) {
  try {
    props_().setProperty(key, value);
  } catch (e) {
    Logger.log('[ERROR] setProp_ failed for %s: %s', key, e.message);
  }
}

function sheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function dbg_() {
  Logger.log('[DEBUG] Function called at: %s', nowStamp_());
}

function formatCurrency(amount, currency) {
  var formatted = new Number(amount).toLocaleString('es-UY', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatted;
}

function padStart(str, length, padChar) {
  str = String(str);
  var padStr = String(padChar || ' ');
  while (str.length < length) {
    str = padStr + str;
  }
  return str;
}

