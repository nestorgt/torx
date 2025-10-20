# Testing Triggers in Apps Script Editor

## Quick Start: Test Full Bank Sync

### Step 1: Open Apps Script Editor

```bash
cd /Users/wsou/Developer/torx/google-apps-scripts
clasp open
```

This will open the Apps Script editor in your browser.

---

### Step 2: Select the Function

1. At the top of the editor, you'll see a dropdown that says "Select function"
2. Click the dropdown
3. Scroll down and find: **`TRIGGER_syncBanksDataFull`**
4. Click it to select

---

### Step 3: Run the Function

1. Click the **▶️ Run** button (next to the function dropdown)
2. **First time only**: You may be asked to authorize the script
   - Click **Review Permissions**
   - Select your Google account
   - Click **Advanced** → **Go to [Project Name] (unsafe)**
   - Click **Allow**

---

### Step 4: Monitor Execution

**View Execution Log:**
1. Click **View** → **Logs** (or press `Ctrl/Cmd + Enter`)
2. You'll see real-time logs of what the function is doing

**Expected log output:**
```
[SYNC_TRIGGER] Starting automatic unified bank data sync
[BALANCE] Updating Mercury balance...
[BALANCE] Updating Revolut balance...
[BALANCE] Updating Airwallex balance...
[BALANCE] Updating Wise balance...
[BALANCE] Updating Nexo balance...
[PAYOUT] Detecting incoming transfers...
[CONSOLIDATION] Checking for USD funds to consolidate...
[EXPENSES] Calculating monthly expenses...
[SYNC_TRIGGER] Unified sync completed successfully
[SYNC_TRIGGER] Duration: 4523 ms
[SYNC_TRIGGER] Balances updated: 5
[SYNC_TRIGGER] Transfers detected: 2
[SYNC_TRIGGER] Transfers reconciled: 2
[SYNC_TRIGGER] Funds consolidated: $150.00
[SYNC_TRIGGER] Expenses calculated: 1
```

---

### Step 5: Verify Results

After the function completes:

1. **Check your Google Sheet**:
   - Go to the **Payouts** sheet
   - Check that bank balances are updated (columns B-F, rows 2-3)
   - Look for updated timestamps in cell notes

2. **Check the Execution Log**:
   - Look for any `[ERROR]` messages
   - Verify all banks were processed
   - Check the summary at the end

---

## Testing Individual Components

### Test Balance Update Only

**Function to run**: `TRIGGER_updateAllBalances`

**What it does**: Updates all bank balances (no transfers, consolidation, or expenses)

**Faster than**: Full sync (takes ~30 seconds vs ~60 seconds)

**When to use**: Quick balance refresh

---

### Test Consolidation Only

**Function to run**: `TRIGGER_consolidateUsdFundsToMainDaily`

**What it does**: Moves USD funds from sub-accounts to main accounts

**What to check**:
- Look for log messages about transfers
- Check if any funds were moved
- Verify transaction IDs in logs

---

### Test Slack Summary

**Function to run**: `TRIGGER_sendDailySummaryToSlack`

**What it does**: Generates and sends daily summary to Slack

**Prerequisites**: Slack webhook must be configured

**What to check**:
- Check your Slack channel for the message
- Verify metrics are accurate

---

## Dry Run Testing (Safe Testing)

If you want to test WITHOUT making actual changes:

### Test Full Sync (Dry Run)

**Function to run**: `testSyncDryRun`

**What it does**: Simulates full sync without making changes

**Safe because**:
- No actual API calls to banks
- No fund transfers
- No sheet updates
- Only logs what WOULD happen

**How to run**:
1. Select `testSyncDryRun` from dropdown
2. Click **Run**
3. Check logs to see what would happen

---

## Understanding the Logs

### Log Prefixes

| Prefix | Meaning |
|--------|---------|
| `[SYNC_TRIGGER]` | Main sync orchestration |
| `[BALANCE]` | Balance update operations |
| `[PAYOUT]` | Transfer detection and reconciliation |
| `[CONSOLIDATION]` | Fund consolidation operations |
| `[EXPENSES]` | Expense calculation |
| `[ERROR]` | Something went wrong |
| `[WARNING]` | Non-critical issue |

### Success Indicators

✅ **Good logs to see:**
```
[SYNC_TRIGGER] Unified sync completed successfully
[BALANCE] Mercury: $10,000.00 USD
[PAYOUT] Marked 2 transfers as received
[CONSOLIDATION] Moved $150.00 USD
```

❌ **Problem logs:**
```
[ERROR] Mercury API call failed: timeout
[ERROR] Failed to update balance
[WARNING] Airwallex balance not available
```

---

## Viewing Execution History

### See Past Executions

1. In Apps Script editor, click **Executions** (icon on left sidebar)
2. You'll see a list of all recent executions
3. Click on any execution to see:
   - Start time
   - Duration
   - Status (Success/Failed)
   - Error messages (if any)
   - Full logs

---

## Testing with Real-time Logs

### Watch Logs in Terminal

While the function runs in Apps Script, you can watch logs in your terminal:

```bash
# In a separate terminal window
cd /Users/wsou/Developer/torx/google-apps-scripts
clasp logs --watch
```

This shows real-time logs as the function executes.

---

## Testing Checklist

Before relying on automated triggers, test each manually:

- [ ] **Test Full Sync**
  - Function: `TRIGGER_syncBanksDataFull`
  - Check: Balances updated, no errors

- [ ] **Test Balance Update**
  - Function: `TRIGGER_updateAllBalances`
  - Check: All 5 banks updated

- [ ] **Test Consolidation**
  - Function: `TRIGGER_consolidateUsdFundsToMainDaily`
  - Check: USD funds moved (if any available)

- [ ] **Test Slack Summary**
  - Function: `TRIGGER_sendDailySummaryToSlack`
  - Check: Message appears in Slack

- [ ] **Test Monthly Payments** (Dry Run First!)
  - Function: `dryRunPayUsersForCurrentMonth`
  - Check: Logs show what would happen
  - Then: `TRIGGER_makeMonthlyPayments` (when ready)

- [ ] **Test Trigger**
  - Function: `TRIGGER_test`
  - Check: Logs show success message

---

## Common Issues and Solutions

### Issue: "Function not found"

**Cause**: Function name misspelled or code not deployed

**Solution**:
1. Verify function exists in the dropdown
2. If not, redeploy: `./deploy-gas.sh`
3. Refresh the Apps Script editor page

---

### Issue: "Authorization required"

**Cause**: First time running or permissions changed

**Solution**:
1. Click **Review Permissions**
2. Follow the authorization flow
3. Allow all requested permissions

---

### Issue: "Timeout after 6 minutes"

**Cause**: Function takes too long (Apps Script limit is 6 minutes)

**Solution**:
1. Run individual components instead of full sync
2. Check for slow API responses in logs
3. Consider splitting into smaller operations

---

### Issue: "Proxy server error"

**Cause**: Proxy server not running or not accessible

**Solution**:
1. Check proxy server is running:
   ```bash
   curl -H "x-proxy-token: 8c92f4a0a1b9d3c4e6f7asdasd213w1sda2" http://localhost:8081/health
   # Or remote:
   curl -H "x-proxy-token: 8c92f4a0a1b9d3c4e6f7asdasd213w1sda2" https://proxy.waresoul.org/health
   ```
2. Verify `PROXY_URL` and `PROXY_TOKEN` in Script Properties

---

### Issue: "Mercury/Revolut balance shows $0"

**Cause**: API error or authentication issue

**Solution**:
1. Check logs for specific error
2. Test individual bank function:
   - `fetchMercurySummary_()`
   - `fetchRevolutSummary_()`
3. Verify API credentials in proxy server

---

## Step-by-Step: Your First Test

### Complete Walkthrough

**1. Deploy the code** (if you haven't already):
```bash
cd /Users/wsou/Developer/torx/google-apps-scripts
./deploy-gas.sh
```

Wait for: `✅ Deployment successful!`

---

**2. Open Apps Script editor**:
```bash
clasp open
```

A browser tab will open showing your script.

---

**3. Find the function**:
- Look at the top of the page
- Find the dropdown that says "Select function"
- Click it
- Scroll through the list and find: `TRIGGER_syncBanksDataFull`
- Click to select it

---

**4. Open the log window**:
- Click **View** in the menu bar
- Click **Logs** (or press `Ctrl/Cmd + Enter`)
- A panel will appear at the bottom showing logs

---

**5. Run the function**:
- Click the **▶️ Run** button (big triangle at the top)
- Watch the logs appear in real-time

---

**6. Wait for completion**:
- The function typically takes 30-60 seconds
- You'll see the logs streaming
- When done, you'll see: `Execution completed`

---

**7. Check the results**:
- Open your Google Sheet
- Go to the **Payouts** sheet
- Check cells B2, C2, D2, E2, F2 for USD balances
- Check cells B3, C3, D3, E3 for EUR balances
- Hover over cells to see timestamp notes

---

**8. Review the summary**:
Scroll to the bottom of the logs to see the summary:
```
[SYNC_TRIGGER] Unified sync completed successfully
[SYNC_TRIGGER] Duration: 4523 ms
[SYNC_TRIGGER] Balances updated: 5
[SYNC_TRIGGER] Transfers detected: 2
[SYNC_TRIGGER] Transfers reconciled: 2
[SYNC_TRIGGER] Funds consolidated: $150.00
[SYNC_TRIGGER] Expenses calculated: 1
```

---

## Advanced: Testing with Custom Parameters

You can also run functions with custom parameters directly in the editor:

1. Click on the `{ }` **Script editor** tab
2. Find the function you want to test
3. Add a test function at the bottom:

```javascript
function TEST_customSync() {
  // Test with specific options
  var result = syncBanksData({
    dryRun: true,              // Don't make actual changes
    skipExpenses: false,       // Include expenses
    skipConsolidation: true,   // Skip consolidation
    skipPayoutReconciliation: false  // Include payout detection
  });

  Logger.log('Result: ' + JSON.stringify(result, null, 2));
}
```

4. Select `TEST_customSync` from dropdown
5. Click **Run**

---

## Quick Reference

| What to Test | Function Name | Expected Time |
|--------------|---------------|---------------|
| Full sync | `TRIGGER_syncBanksDataFull` | 30-60 sec |
| Balance only | `TRIGGER_updateAllBalances` | 20-30 sec |
| Consolidation | `TRIGGER_consolidateUsdFundsToMainDaily` | 15-30 sec |
| Slack summary | `TRIGGER_sendDailySummaryToSlack` | 10-15 sec |
| Test trigger | `TRIGGER_test` | < 1 sec |
| Dry run sync | `testSyncDryRun` | 5-10 sec |
| Dry run payments | `dryRunPayUsersForCurrentMonth` | 10-20 sec |

---

## Ready to Go!

You now know how to:
- ✅ Open the Apps Script editor
- ✅ Select and run trigger functions
- ✅ Monitor execution logs
- ✅ Verify results in your sheet
- ✅ Troubleshoot common issues
- ✅ Test safely with dry run mode

**Next step**: Run your first test!

```
clasp open
→ Select: TRIGGER_syncBanksDataFull
→ Click: Run
→ Watch: Logs
→ Check: Sheet
```

Good luck! 🚀
