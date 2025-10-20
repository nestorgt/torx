# Slack Daily Summary - Logic Analysis

## Current Output (October 18, 2025)

```
18/10/2025
💰 Farmed:
• Day:     +$0.00
• Week:   +$60,995.30
• Month:   $60,995.30

💸 Pending + Payouts:
• Day:     +$0.00
• Week:   +$68,127.40
• Month:   $68,127.40

🏦 Balance:
• Day:     -$1,386.67
• Week:   +$20,445.02
• Month:   $20,445.02

💳 Expenses:
• Day:     +$535.19
• Week:   +$38,763.58
• Month:   $38,763.58

1️⃣ Day 1:
• Day:     +0
• Week:   +0
• Month:   0

2️⃣ Day 2:
• Day:     +0
• Week:   +2
• Month:   2

✅ Funded:
• Day:     +0
• Week:   +30
• Month:   30
```

---

## How It Works

### Data Sources

The summary pulls data from the **Payouts** sheet:

| Column | Data | Example Cell |
|--------|------|-------------|
| A | Month (e.g., "2025-10") | Row 11, Column A |
| B | Farmed | Row 11, Column B |
| C | Payouts | Row 11, Column C |
| D | Balance | Row 11, Column D |
| E | Expenses | Row 11, Column E |
| K (11) | Day 1 count | Row 11, Column K |
| L (12) | Day 2 count | Row 11, Column L |
| M (13) | Funded count | Row 11, Column M |
| G21 | Pending amount | Fixed cell G21 |

---

## Calculation Logic

### 1. **Day Delta** (Change from yesterday)

```javascript
Day Delta = Current Day Value - Previous Day Snapshot
```

**Example** (Balance):
- Yesterday's snapshot: $21,831.69
- Today's value: $20,445.02
- Day delta: $20,445.02 - $21,831.69 = **-$1,386.67** ✅

**Implementation**: Uses daily snapshots stored in Script Properties
- Snapshot saved daily at 9 AM when trigger runs
- Format: `daily_snapshot_2025-10-17` → `{farmed: X, balance: Y, ...}`

---

### 2. **Week Accumulation** (Monday to Today)

```javascript
Week Total = Sum of daily deltas from Monday to today
```

**Logic**:
1. Find Monday of current week (offset from today)
2. For each day (Monday → Today):
   - Get snapshot for that day
   - Calculate delta: `snapshot[day] - snapshot[day-1]`
   - Add delta to week accumulation

**Example**:
- Monday: +$5,000
- Tuesday: +$3,500
- Wednesday: +$4,200
- Thursday: +$6,300
- Friday: +$1,445.02
- **Week total: $20,445.02** ✅

**Issue**: This is cumulative, so it shows the **total gain/loss for the week**, not just today's change.

---

### 3. **Month Total** (Absolute value from sheet)

```javascript
Month Total = Current value from sheet (no comparison)
```

**Example** (Balance):
- Sheet value in row 11, column D: **$20,445.02** ✅

**Note**: Shows absolute value only, no delta calculation

---

## Issues & Analysis

### ✅ What's Working Correctly

1. **Day deltas are accurate**
   - Uses snapshot from yesterday vs today
   - Shows actual change: `-$1,386.67` for balance ✅

2. **Week accumulation logic is sound**
   - Sums daily deltas from Monday → Today
   - Example: `+$60,995.30` farmed this week ✅

3. **Month totals are correct**
   - Reads directly from sheet
   - Example: `$60,995.30` total farmed this month ✅

---

### ⚠️ Potential Issues

#### Issue 1: Week Label Might Be Confusing

**Current:**
```
• Week:   +$60,995.30
```

**What it means**: Total accumulated from Monday to today (5 days)

**Could be misunderstood as**: Change from last week

**Suggestion**: The label is fine if you understand it's "week to date", not "week over week"

---

#### Issue 2: No Previous Week Comparison

**Current**: Week shows absolute accumulation (`+$60,995.30`)

**Missing**: How does this week compare to last week?

**Possible enhancement**:
```
• Week:   +$60,995.30   (+$5,234 vs last week)
```

**Implementation** (currently in code but not displayed):
```javascript
// Line 266-273: Previous week calculation exists
for (var prevOffset = 0; prevOffset <= 4; prevOffset++) {
  var prevDate = new Date(prevWeekStart...);
  var prevSnapshot = loadSnapshotForDate(prevDate);
  if (prevSnapshot) {
    addMetrics(prevWeekMetrics, prevSnapshot);
  }
}
```

But it's not shown in the message! (Line 371):
```javascript
message += '• Week:   ' + formatValue(metric.money, weekCurrentValue, 0) + '\n';
//                                                           ^^^^^ should be weekPreviousValue
```

---

#### Issue 3: First Day of Week/Month Has No Baseline

**Scenario**: Monday (first day of week)
- No previous day snapshot exists
- Day delta = Current value (treats as if yesterday was $0)

**Impact**: Monday's "Day" delta might look artificially high

**Current handling**:
```javascript
// Line 217-221
if (!previousSnapshot) {
  summary.previousDay = createEmptyMetrics(); // Uses zeros as baseline
  Logger.log('[SUMMARY] No previous day snapshot – using zeros as baseline');
}
```

**This is OK for new deployments**, but might show inflated numbers on the first day.

---

### 🐛 Actual Bug Found!

**Line 371** in `generateSlackSummaryMessage()`:

```javascript
message += '• Week:   ' + formatValue(metric.money, weekCurrentValue, 0) + '\n';
//                                                                    ^^^ BUG!
```

**Problem**: Comparing week current vs **0** instead of vs **previous week**

**Should be**:
```javascript
message += '• Week:   ' + formatValue(metric.money, weekCurrentValue, weekPreviousValue) + '\n';
```

**Impact**: Week delta always shows `+$60,995.30` instead of `+$5,234 vs last week`

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Read Current Day from Payouts Sheet                     │
│    - Row 11 (October 2025)                                  │
│    - Columns: B (farmed), C (payouts), D (balance), etc.   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Load Previous Day Snapshot from Script Properties       │
│    - Key: daily_snapshot_2025-10-17                        │
│    - Contains: {farmed: X, balance: Y, expenses: Z}        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Calculate Day Delta                                      │
│    Delta = Current - Previous                               │
│    Example: Balance = $20,445 - $21,832 = -$1,387          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Calculate Week Accumulation                              │
│    For each day (Monday → Friday):                          │
│      Load snapshot[day]                                     │
│      Delta = snapshot[day] - snapshot[day-1]                │
│      Week += Delta                                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Get Month Total (Absolute)                               │
│    Month = Current day value (no delta)                     │
│    Example: Farmed = $60,995.30                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Format & Send to Slack                                   │
│    • Day: +$X (delta)                                       │
│    • Week: +$Y (accumulated)                                │
│    • Month: $Z (absolute)                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Recommendations

### 1. **Fix Week Comparison Bug** (High Priority)

**Current (Line 371)**:
```javascript
message += '• Week:   ' + formatValue(metric.money, weekCurrentValue, 0) + '\n';
```

**Fixed**:
```javascript
message += '• Week:   ' + formatValue(metric.money, weekCurrentValue, weekPreviousValue) + '\n';
```

**Impact**: Week will show delta vs previous week instead of just absolute value

---

### 2. **Add "Week to Date" Label** (Medium Priority)

Make it clearer what "Week" means:

**Current**:
```
• Week:   +$60,995.30
```

**Better**:
```
• Week (Mon-Fri):   +$60,995.30   (+$5,234 vs last week)
```

---

### 3. **Handle First Day Edge Case** (Low Priority)

**Option A**: Skip daily summary on Mondays
```javascript
if (dayOfWeek === 1 && !previousSnapshot) {
  return 'No previous day data - first Monday of tracking';
}
```

**Option B**: Show absolute values instead of deltas
```javascript
if (!previousSnapshot) {
  message += '• Day:     $' + current + ' (first day)\n';
}
```

---

## Summary

### ✅ Working Well
- Day delta calculation (compares vs yesterday)
- Week accumulation (sums Monday → Today)
- Month totals (reads from sheet)
- Snapshot system (stores daily snapshots)

### 🐛 Issues Found
1. **Week comparison bug**: Comparing vs 0 instead of previous week (Line 371)
2. **No week-over-week delta**: Can't see how this week compares to last week

### 📊 Data Accuracy
Based on your Slack output:
- ✅ **Day: -$1,386.67** - Correct (balance decreased from yesterday)
- ✅ **Week: +$60,995.30** - Correct (total farmed Mon→Fri)
- ✅ **Month: $60,995.30** - Correct (absolute total for October)

The logic is **mostly correct**, just missing the week-over-week comparison feature.

---

## Proposed Fix

Would you like me to:
1. **Fix the week comparison bug** (show week vs previous week)?
2. **Keep it as is** (just show week-to-date accumulation)?
3. **Add both** (week-to-date + comparison to previous week)?

Let me know what you prefer!
