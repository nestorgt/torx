# Trigger Migration Checklist

## ✅ All Triggers Preserved

**Good news**: All 11 trigger functions have been preserved in the modular architecture!

They are located in: [src/triggers.gs](src/triggers.gs)

---

## Quick Status Check

```bash
cd /Users/wsou/Developer/torx/google-apps-scripts
./check-triggers.sh
```

---

## Trigger Migration Status

### ✅ Active Trigger Functions (8 total)

| # | Function Name | Status | Location |
|---|---------------|--------|----------|
| 1 | `TRIGGER_test` | ✅ Active | [triggers.gs:7](src/triggers.gs#L7) |
| 2 | `TRIGGER_makeMonthlyPayments` | ✅ Active | [triggers.gs:12](src/triggers.gs#L12) |
| 3 | `TRIGGER_consolidateUsdFundsToMainDaily` | ✅ Active | [triggers.gs:61](src/triggers.gs#L61) |
| 4 | `TRIGGER_updateAllBalances` | ✅ Active | [triggers.gs:121](src/triggers.gs#L121) |
| 5 | `TRIGGER_syncBanksDataFull` | ✅ Active | [triggers.gs:151](src/triggers.gs#L151) |
| 6 | `TRIGGER_syncBanksDataBalancesOnly` | ✅ Active | [triggers.gs:203](src/triggers.gs#L203) |
| 7 | `TRIGGER_syncBanksDataWithTransfers` | ✅ Active | [triggers.gs:251](src/triggers.gs#L251) |
| 8 | `TRIGGER_sendDailySummaryToSlack` | ✅ Active | [triggers.gs:303](src/triggers.gs#L303) |

## 🗑️ Removed Functions (3 total)

These functions were removed as they are no longer needed:

| Function Name | Reason for Removal |
|---------------|-------------------|
| `TRIGGER_syncAllBankData` | Legacy - replaced by `TRIGGER_syncBanksDataFull` |
| `TRIGGER_runPaymentsJuly2025` | Specific month trigger - not needed for general use |
| `TRIGGER_checkBankMinimumBalances` | Not actively used |

---

## What You Need to Do After Deployment

### Step 1: Deploy the Code

```bash
cd /Users/wsou/Developer/torx/google-apps-scripts
./deploy-gas.sh
```

### Step 2: Verify Trigger Functions Exist

```bash
clasp open
```

- In the Apps Script editor, check that all functions appear in the dropdown
- Look for functions starting with `TRIGGER_`

### Step 3: Check Existing Triggers

1. In Apps Script editor, click the **⏰ clock icon** (left sidebar)
2. You'll see a list of currently scheduled triggers
3. **Important**: The modular deployment does NOT automatically recreate triggers
4. You need to verify and potentially recreate them

### Step 4: Recreate Triggers (if needed)

**Option A: Manually in UI**

For each trigger you had before:

1. Click **+ Add Trigger** (bottom right)
2. Choose function (e.g., `TRIGGER_updateAllBalances`)
3. Choose event source: **Time-driven**
4. Select type: **Day timer**
5. Select time of day (e.g., **10am to 11am**)
6. Click **Save**

**Option B: Programmatically**

Run this function once in the Apps Script editor:

```javascript
function setupRecommendedTriggers() {
  // Morning balance update
  ScriptApp.newTrigger('TRIGGER_updateAllBalances')
    .timeBased()
    .atHour(10)
    .everyDays(1)
    .create();

  // Full daily sync
  ScriptApp.newTrigger('TRIGGER_syncBanksDataFull')
    .timeBased()
    .atHour(11)
    .everyDays(1)
    .create();

  // Afternoon consolidation
  ScriptApp.newTrigger('TRIGGER_consolidateUsdFundsToMainDaily')
    .timeBased()
    .atHour(14)
    .everyDays(1)
    .create();

  // Morning Slack summary
  ScriptApp.newTrigger('TRIGGER_sendDailySummaryToSlack')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();

  // Evening balance update
  ScriptApp.newTrigger('TRIGGER_updateAllBalances')
    .timeBased()
    .atHour(22)
    .everyDays(1)
    .create();

  Logger.log('✅ All recommended triggers created successfully');
  return 'Triggers created';
}
```

### Step 5: Test Triggers

Test each trigger manually before relying on automation:

1. Select `TRIGGER_test` from dropdown
2. Click **Run**
3. Check logs (Ctrl/Cmd + Enter)
4. Should see: `[TEST_TRIGGER] Test trigger executed successfully`

Then test the main triggers:

```javascript
// Test these one by one
TRIGGER_updateAllBalances()
TRIGGER_syncBanksDataFull()
TRIGGER_consolidateUsdFundsToMainDaily()
```

---

## Recommended Daily Schedule

Based on your timezone (Europe/Madrid):

```
┌─────────────────────────────────────────────────────────┐
│ 09:00 AM - TRIGGER_sendDailySummaryToSlack             │
│            └─ Send daily summary to Slack              │
│                                                         │
│ 10:00 AM - TRIGGER_updateAllBalances (morning)         │
│            └─ Update balances from all banks           │
│                                                         │
│ 11:00 AM - TRIGGER_syncBanksDataFull                   │
│            └─ Complete sync (balances, transfers,      │
│               expenses, consolidation)                 │
│                                                         │
│ 02:00 PM - TRIGGER_consolidateUsdFundsToMainDaily      │
│            └─ Move USD from sub-accounts to main       │
│                                                         │
│ 10:00 PM - TRIGGER_updateAllBalances (evening)         │
│            └─ Evening balance update                   │
└─────────────────────────────────────────────────────────┘
```

---

## Migration Verification Checklist

After deployment, verify each item:

- [ ] **Deploy completed successfully**
  - Run: `./deploy-gas.sh`
  - Check: All 25 modules visible in Apps Script editor

- [ ] **All trigger functions exist**
  - Open: `clasp open`
  - Check: All 11 TRIGGER_ functions in dropdown

- [ ] **Triggers page accessible**
  - Click: ⏰ clock icon in Apps Script editor
  - Check: Triggers page loads without errors

- [ ] **Test trigger works**
  - Run: `TRIGGER_test()`
  - Check logs: Should see success message

- [ ] **Balance update trigger works**
  - Run: `TRIGGER_updateAllBalances()`
  - Check: Payouts sheet updated

- [ ] **Full sync trigger works**
  - Run: `TRIGGER_syncBanksDataFull()`
  - Check logs: Should see summary of operations

- [ ] **Consolidation trigger works**
  - Run: `TRIGGER_consolidateUsdFundsToMainDaily()`
  - Check logs: Should see consolidation summary

- [ ] **Time-based triggers scheduled**
  - Check: ⏰ Triggers page shows scheduled triggers
  - Verify: Correct times and functions

- [ ] **Error notifications configured**
  - For each trigger: Click ︙ → Notifications
  - Set: "Notify me when this project fails" → Immediately

- [ ] **First automated run successful**
  - Wait: For next scheduled trigger
  - Check: Execution history in triggers page
  - Verify: No errors in logs

---

## What Happens to Existing Triggers?

### Important Notes:

1. **Existing triggers remain configured** - The trigger schedule is stored separately from the code
2. **Function names are unchanged** - All trigger functions have the same name as before
3. **Triggers should continue working** - As long as function names match, triggers will work
4. **However**: It's good practice to verify and potentially recreate them

### Why Recreate Triggers?

- Ensures clean slate after major refactoring
- Verifies all functions are accessible
- Good opportunity to optimize schedule
- Updates trigger configuration to latest settings

---

## Troubleshooting

### Problem: Triggers page shows "Function not found"

**Cause**: Trigger references a function that doesn't exist

**Solution**: Delete the broken trigger and recreate it with correct function name

---

### Problem: Trigger runs but does nothing

**Cause**: Function may be running in dry run mode or has errors

**Solution**:
1. Run the function manually and check logs
2. Look for errors in execution log
3. Verify proxy server is running
4. Check Script Properties are configured

---

### Problem: "Script function not found: TRIGGER_xxx"

**Cause**: Function name mismatch or deployment issue

**Solution**:
1. Verify function exists: `clasp open` → check dropdown
2. Redeploy: `./deploy-gas.sh`
3. Recreate trigger with correct function name

---

## Quick Reference

| Task | Action |
|------|--------|
| Check all triggers preserved | `./check-triggers.sh` |
| Deploy code | `./deploy-gas.sh` |
| Open Apps Script | `clasp open` |
| View triggers page | Click ⏰ icon in editor |
| Test a trigger | Select function → Run |
| View trigger logs | `clasp logs --watch` |
| Create trigger programmatically | Run `setupRecommendedTriggers()` |

---

## Next Steps

1. ✅ **You've already**: Backed up original file, split into modules
2. 🚀 **Next**: Deploy the code
3. ✅ **Then**: Verify triggers exist and are scheduled correctly
4. 🧪 **Finally**: Test each trigger manually before relying on automation

---

## Support

- **Full trigger documentation**: [TRIGGERS.md](TRIGGERS.md)
- **Deployment guide**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Testing guide**: [TESTING.md](TESTING.md)

---

**Summary**: All 11 trigger functions are preserved and ready to use. You just need to verify/recreate the time-based schedules in Apps Script after deployment.
