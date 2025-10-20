# Torx Google Apps Script - Triggers Reference

## Overview

This document lists all time-based triggers and how to set them up after deployment. The modular refactoring **preserves all trigger functions** - they just need to be re-configured in the Apps Script editor.

---

## Quick Verification

Run the trigger check script:

```bash
./check-triggers.sh
```

This will show you all available trigger functions and how to set them up.

---

## All Trigger Functions

### ✅ Active Trigger Functions

8 trigger functions are available in [src/triggers.gs](src/triggers.gs):

| Function Name | Purpose | Recommended Schedule |
|---------------|---------|---------------------|
| `TRIGGER_updateAllBalances` | Update all bank balances | Daily: 10:00 AM & 10:00 PM |
| `TRIGGER_syncBanksDataFull` | Complete sync (balances, transfers, expenses, consolidation) | Daily: 11:00 AM |
| `TRIGGER_syncBanksDataBalancesOnly` | Balance updates only | Daily: 10:00 AM (alternative) |
| `TRIGGER_syncBanksDataWithTransfers` | Sync with transfer detection | Daily: 11:00 AM (alternative) |
| `TRIGGER_consolidateUsdFundsToMainDaily` | Consolidate USD funds to main accounts | Daily: 2:00 PM |
| `TRIGGER_sendDailySummaryToSlack` | Send daily summary to Slack | Daily: 9:00 AM |
| `TRIGGER_makeMonthlyPayments` | Process monthly user payments | Manual/Monthly |
| `TRIGGER_test` | Test trigger functionality | Manual |

---

## Setting Up Triggers

### Method 1: Via Apps Script Editor (Recommended)

1. **Open the Apps Script Editor**:
   ```bash
   clasp open
   ```

2. **Navigate to Triggers**:
   - Click the **clock icon (⏰)** in the left sidebar
   - Or go to **Edit > Current project's triggers**

3. **Check Existing Triggers**:
   - You should see a list of currently configured triggers
   - If the list is empty or missing triggers, you need to add them

4. **Add a New Trigger**:
   - Click **+ Add Trigger** (bottom right)

   **Example: Daily Balance Update**
   - Choose which function to run: `TRIGGER_updateAllBalances`
   - Choose which deployment should run: `Head`
   - Select event source: `Time-driven`
   - Select type of time based trigger: `Day timer`
   - Select time of day: `10am to 11am`
   - Click **Save**

5. **Repeat for All Required Triggers**

### Method 2: Via Script (Programmatic)

You can also create triggers programmatically. Add this function to your script:

```javascript
function setupAllTriggers() {
  // Delete all existing triggers first (optional)
  deleteAllTriggers();

  // Create triggers
  ScriptApp.newTrigger('TRIGGER_updateAllBalances')
    .timeBased()
    .atHour(10)
    .everyDays(1)
    .create();

  ScriptApp.newTrigger('TRIGGER_updateAllBalances')
    .timeBased()
    .atHour(22)
    .everyDays(1)
    .create();

  ScriptApp.newTrigger('TRIGGER_syncBanksDataFull')
    .timeBased()
    .atHour(11)
    .everyDays(1)
    .create();

  ScriptApp.newTrigger('TRIGGER_consolidateUsdFundsToMainDaily')
    .timeBased()
    .atHour(14)
    .everyDays(1)
    .create();

  ScriptApp.newTrigger('TRIGGER_sendDailySummaryToSlack')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();

  Logger.log('All triggers created successfully');
}

function deleteAllTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  Logger.log('All triggers deleted');
}
```

Then run `setupAllTriggers()` once in the Apps Script editor.

---

## Recommended Trigger Schedule

### Daily Operations (Europe/Madrid Timezone)

```
09:00 AM - TRIGGER_sendDailySummaryToSlack
           └─ Send daily summary to Slack channel

10:00 AM - TRIGGER_updateAllBalances (morning)
           └─ Update balances from all banks

11:00 AM - TRIGGER_syncBanksDataFull
           └─ Complete sync: balances, transfers, expenses, consolidation

02:00 PM - TRIGGER_consolidateUsdFundsToMainDaily
           └─ Move USD funds from sub-accounts to main accounts

10:00 PM - TRIGGER_updateAllBalances (evening)
           └─ Evening balance update
```

### Optional Triggers

```
03:00 PM - TRIGGER_checkBankMinimumBalances
           └─ Check if banks meet minimum balance thresholds
           └─ (Only if you want alerts for low balances)
```

---

## Trigger Details

### 1. TRIGGER_updateAllBalances

**Purpose**: Updates all bank balances in the Google Sheet

**What it does**:
- Fetches current balances from all banks (Mercury, Revolut, Airwallex, Wise, Nexo)
- Updates the `Payouts` sheet with latest balances
- Adds notes with timestamp and any errors

**Schedule**: Twice daily (morning and evening)

**Code Location**: [src/triggers.gs:173](src/triggers.gs#L173)

**Test**:
```javascript
TRIGGER_updateAllBalances()
// Check Payouts sheet - balances should be updated
```

---

### 2. TRIGGER_syncBanksDataFull

**Purpose**: Complete synchronization of all bank data

**What it does**:
1. Updates all bank balances
2. Detects and reconciles incoming transfers (payouts)
3. Consolidates USD funds to main accounts
4. Calculates monthly expenses

**Schedule**: Once daily (11:00 AM recommended)

**Code Location**: [src/triggers.gs:203](src/triggers.gs#L203)

**Test**:
```javascript
TRIGGER_syncBanksDataFull()
// Check logs for summary of all operations
```

---

### 3. TRIGGER_syncBanksDataBalancesOnly

**Purpose**: Quick balance-only sync (skips transfers, consolidation, expenses)

**What it does**:
- Updates balances only
- Faster than full sync
- Use when you only need balance updates

**Schedule**: Alternative to full sync (if you want more frequent balance updates)

**Code Location**: [src/triggers.gs:255](src/triggers.gs#L255)

**Test**:
```javascript
TRIGGER_syncBanksDataBalancesOnly()
// Check Payouts sheet - balances updated, nothing else
```

---

### 4. TRIGGER_syncBanksDataWithTransfers

**Purpose**: Sync with transfer detection (includes consolidation and expenses)

**What it does**:
- Updates balances
- Detects and reconciles transfers
- Consolidates funds
- Calculates expenses

**Schedule**: Alternative to full sync

**Code Location**: [src/triggers.gs:303](src/triggers.gs#L303)

---

### 5. TRIGGER_consolidateUsdFundsToMainDaily

**Purpose**: Consolidate USD funds from sub-accounts to main accounts

**What it does**:
- Checks all Revolut sub-accounts for USD balances
- Moves USD funds to Revolut Main account
- Checks all Mercury sub-accounts for USD balances
- Moves USD funds to Mercury Main account

**Schedule**: Once daily (2:00 PM recommended)

**Code Location**: [src/triggers.gs:99](src/triggers.gs#L99)

**Test**:
```javascript
TRIGGER_consolidateUsdFundsToMainDaily()
// Check logs for consolidation summary
```

---

### 6. TRIGGER_sendDailySummaryToSlack

**Purpose**: Send daily financial summary to Slack

**What it does**:
- Generates daily summary with metrics
- Compares to previous day
- Sends to Slack channel via webhook

**Schedule**: Once daily (9:00 AM recommended)

**Prerequisites**: Slack webhook must be configured

**Code Location**: [src/triggers.gs:387](src/triggers.gs#L387)

**Test**:
```javascript
TRIGGER_sendDailySummaryToSlack()
// Check Slack channel for summary message
```

---

### 7. TRIGGER_checkBankMinimumBalances

**Purpose**: Check if banks meet minimum balance thresholds

**What it does**:
- Checks each bank's USD balance
- Compares against `MIN_BALANCE_USD` (default: $1,000)
- Logs warnings for banks below threshold
- Can trigger alerts or notifications

**Schedule**: Optional (3:00 PM if needed)

**Code Location**: [src/triggers.gs:355](src/triggers.gs#L355)

**Test**:
```javascript
TRIGGER_checkBankMinimumBalances()
// Check logs for balance warnings
```

---

### 8. TRIGGER_makeMonthlyPayments

**Purpose**: Process monthly user payments

**What it does**:
1. Syncs all bank data first
2. Processes payments for current month
3. Sends WhatsApp notifications
4. Updates payment tracking

**Schedule**: Manual (run when ready to make payments)

**Code Location**: [src/triggers.gs:50](src/triggers.gs#L50)

**⚠️ Warning**: This executes real payments! Always test with dry run first.

**Test**:
```javascript
// Dry run first!
dryRunPayUsersForCurrentMonth()

// Then execute (only when ready)
TRIGGER_makeMonthlyPayments()
```

---

### 9. TRIGGER_runPaymentsJuly2025

**Purpose**: Process payments for a specific month (July 2025)

**What it does**:
- Processes payments for July 2025 specifically
- Example of month-specific trigger

**Schedule**: Manual

**Code Location**: [src/triggers.gs:159](src/triggers.gs#L159)

**Note**: Create similar triggers for other months as needed

---

### 10. TRIGGER_syncAllBankData

**Purpose**: Daily bank data sync (legacy, use `TRIGGER_syncBanksDataFull` instead)

**Status**: ⚠️ Deprecated - use `TRIGGER_syncBanksDataFull` instead

**Code Location**: [src/triggers.gs:12](src/triggers.gs#L12)

---

### 11. TRIGGER_test

**Purpose**: Test that triggers are working

**What it does**:
- Simply logs a test message
- Returns success message

**Schedule**: Manual

**Code Location**: [src/triggers.gs:7](src/triggers.gs#L7)

**Test**:
```javascript
TRIGGER_test()
// Should log: "[TEST_TRIGGER] Test trigger executed successfully"
```

---

## Verifying Triggers After Deployment

### Step 1: Check Trigger Functions Exist

```bash
# Run the verification script
./check-triggers.sh
```

This will show you all 11 trigger functions.

### Step 2: Open Apps Script Editor

```bash
clasp open
```

### Step 3: Check Triggers Page

1. Click the **⏰ clock icon** in left sidebar
2. You should see existing triggers (if any)
3. If triggers are missing, add them using the steps above

### Step 4: Test a Trigger

1. In Apps Script editor, select `TRIGGER_test` from dropdown
2. Click **Run**
3. Check logs (View > Logs or Ctrl/Cmd+Enter)
4. Should see: `[TEST_TRIGGER] Test trigger executed successfully`

### Step 5: Test Main Triggers

Test each critical trigger manually before relying on automation:

```javascript
// Test balance update
TRIGGER_updateAllBalances()

// Test full sync
TRIGGER_syncBanksDataFull()

// Test consolidation
TRIGGER_consolidateUsdFundsToMainDaily()
```

---

## Monitoring Triggers

### View Trigger Execution History

1. Open Apps Script editor: `clasp open`
2. Click **⏰ Triggers** in left sidebar
3. Click on a specific trigger
4. View execution history, errors, and logs

### View Execution Logs

```bash
# Real-time log monitoring
clasp logs --watch

# View recent logs
clasp logs
```

### Common Issues

#### Trigger Not Running

**Symptoms**: Trigger scheduled but not executing

**Solutions**:
1. Check trigger is enabled (not disabled)
2. Check authorization (may need to re-authorize)
3. Check quota limits (triggers have daily execution limits)
4. Check for runtime errors in execution log

#### Trigger Fails with Error

**Symptoms**: Trigger runs but fails

**Solutions**:
1. Check execution logs: `clasp logs`
2. Run the function manually to see detailed error
3. Check proxy server is running (for bank API calls)
4. Check Script Properties are configured

#### Trigger Runs But Nothing Happens

**Symptoms**: Trigger executes successfully but no changes

**Solutions**:
1. Check if running in dry run mode
2. Check function logs for actual operations
3. Verify Google Sheet permissions
4. Check bank API credentials

---

## Trigger Best Practices

### 1. Don't Overlap Triggers

Avoid scheduling triggers that might conflict:

❌ **Bad**:
```
10:00 AM - TRIGGER_syncBanksDataFull
10:00 AM - TRIGGER_updateAllBalances  ← Overlap!
```

✅ **Good**:
```
10:00 AM - TRIGGER_updateAllBalances
11:00 AM - TRIGGER_syncBanksDataFull
```

### 2. Space Out API-Heavy Triggers

Give time between triggers that make many API calls:

✅ **Good**:
```
10:00 AM - TRIGGER_updateAllBalances
11:00 AM - TRIGGER_syncBanksDataFull  ← 1 hour gap
02:00 PM - TRIGGER_consolidateUsdFundsToMainDaily  ← 3 hour gap
```

### 3. Monitor Execution Time

Check trigger execution times in Apps Script editor. If a trigger takes longer than 6 minutes, it will timeout.

### 4. Use Test Functions First

Always test with dry run before scheduling automated triggers:

```javascript
// First: test with dry run
testSyncDryRun()

// Then: manually run once
TRIGGER_syncBanksDataFull()

// Finally: schedule as trigger
```

### 5. Set Up Error Notifications

Configure Apps Script to notify you of trigger failures:

1. Apps Script editor > Triggers page
2. Click on trigger
3. Click **Notifications**
4. Set **Notify me when this project fails**: Immediately or Daily

---

## Emergency: Disable All Triggers

If triggers are causing issues:

1. Open Apps Script editor: `clasp open`
2. Click **⏰ Triggers**
3. Click **︙** (three dots) next to each trigger
4. Select **Delete**

Or run programmatically:

```javascript
function deleteAllTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  Logger.log('Deleted ' + triggers.length + ' triggers');
}
```

---

## Migration Checklist

After deploying the modular code:

- [ ] Run `./check-triggers.sh` to see all trigger functions
- [ ] Open Apps Script editor: `clasp open`
- [ ] Check triggers page (⏰ icon)
- [ ] Verify existing triggers still reference correct functions
- [ ] Add any missing triggers
- [ ] Test each trigger manually
- [ ] Set up error notifications
- [ ] Monitor first automated run
- [ ] Check logs after first day of automation

---

## Quick Reference

| Task | Command / Action |
|------|------------------|
| Check trigger functions | `./check-triggers.sh` |
| Open trigger management | `clasp open` → Click ⏰ icon |
| Test a trigger | Select function in editor → Run |
| View trigger logs | `clasp logs --watch` |
| Add new trigger | Triggers page → + Add Trigger |
| Delete all triggers | Run `deleteAllTriggers()` function |

---

## Support

For trigger issues:
- Check [DEPLOYMENT.md](DEPLOYMENT.md) for deployment issues
- Check [TESTING.md](TESTING.md) for testing trigger functions
- Check [src/triggers.gs](src/triggers.gs) for trigger implementations

---

**Last Updated**: 2025-01-18
**Total Trigger Functions**: 11
**Recommended Daily Triggers**: 5
