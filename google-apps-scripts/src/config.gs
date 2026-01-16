/**
 * config.gs
 *
 * Global configuration constants and cell mappings for Torx system
 */

/* ============== Sheet Names ============== */
var SHEET_NAME = 'Payouts';           // Bank balance sheet
var USERS_SHEET = 'Users';            // User payments sheet

/* ============== Financial Configuration ============== */
var MIN_BALANCE_USD = 1000;           // Minimum balance for main banks
var TOPUP_AMOUNT_USD = 3000;          // Amount to transfer for topups

/* ============== System Configuration ============== */
var TS_CELL = 'A1';                   // Timestamp cell for payouts
var CURRENT_TIMEZONE = 'Europe/Madrid';
var USERS_FIRST_MONTH_ROW = 30;       // First month row for user payments
var USERS_FIRST_COLUMN = 2;           // First user column (column B)
var USERS_SALARY_ROW = 29;            // Monthly salary row
var USERS_BONUS_COLUMN = 4;           // Column D: Bonus column for T2 (1% of profits per month row)

/* ============== Cell Mapping ============== */
// Note: Wise and Nexo removed from balance tracking (not counted towards total)
// Nexo transactions are still tracked for expense calculation (Revolut→Nestor→Nexo)
var CELLS = {
  Airwallex: { USD: 'B2', EUR: 'B3' },
  Mercury:   { USD: 'C2', EUR: 'C3' },
  Revolut:   { USD: 'D2', EUR: 'D3' }
};
