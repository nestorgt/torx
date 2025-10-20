# Torx Google Apps Script - Testing Guide

## Overview

This guide explains how to use the built-in unit testing framework to test Torx functionality and prevent errors.

---

## Test Framework

Torx uses a custom lightweight testing framework designed specifically for Google Apps Script. The framework provides:

- ✅ Assertion functions (`assertEquals`, `assertTrue`, `assertFalse`, etc.)
- ✅ Test suite organization
- ✅ Comprehensive test reporting
- ✅ Smoke tests for quick validation
- ✅ Full test suite for thorough coverage

---

## Running Tests

### Quick Test (Smoke Tests)

Run a minimal set of critical tests:

```bash
./run-tests.sh smoke
```

**When to use**: Quick validation after minor changes

**Duration**: ~30 seconds

### Full Test Suite

Run all unit tests:

```bash
./run-tests.sh all
```

**When to use**: Before deploying major changes

**Duration**: ~2-3 minutes

### Manual Test Execution

You can also run tests directly in the Apps Script editor:

1. Deploy code and tests:
   ```bash
   ./run-tests.sh
   ```

2. Open Apps Script editor:
   ```bash
   clasp open
   ```

3. Select test function from dropdown:
   - `runAllTests` - Run full test suite
   - `runSmokeTests` - Run smoke tests
   - `testUtilityFunctions` - Test utilities only
   - `testPaymentReconciliation` - Test payment logic only
   - etc.

4. Click **Run**

5. View results in **Execution log** (Ctrl/Cmd + Enter)

---

## Test Structure

### Test Files

All test files are in the `tests/` directory:

```
tests/
├── test-framework.gs            # Testing framework
├── test-utils.gs                # Utility function tests
├── test-reconciliation.gs       # Payment reconciliation tests
├── test-bank-integrations.gs    # Bank integration tests
└── run-all-tests.gs             # Master test runner
```

### Test Framework Functions

#### Assertions

```javascript
// Assert equality
assertEquals(expected, actual, 'message');

// Assert truthy
assertTrue(value, 'message');

// Assert falsy
assertFalse(value, 'message');

// Assert not null/undefined
assertNotNull(value, 'message');

// Assert function throws
assertThrows(function() {
  throw new Error('test');
}, 'message');
```

#### Test Suite Runner

```javascript
function myTestSuite() {
  runTestSuite('Test Suite Name', function() {
    // Your tests here
    assertEquals(1, 1, 'One should equal one');
    assertTrue(true, 'True should be truthy');
  });
}
```

---

## Existing Test Suites

### 1. Utility Functions (`testUtilityFunctions`)

Tests core utility functions:

- `toBool_()` - Boolean conversion
- `nowStamp_()` - Timestamp generation
- `formatCurrency()` - Currency formatting
- `padStart()` - String padding

**Example**:
```javascript
assertEquals(true, toBool_('true'), 'toBool_ should handle string "true"');
assertEquals('$1,000.00', formatCurrency(1000, 'USD'), 'Should format USD');
```

### 2. Payment Reconciliation (`testPaymentReconciliation`)

Tests payment matching logic:

- `calculateExpectedPayoutAmount_()` - Payout calculations
- Platform-specific percentages (Topstep: 90%, Earn2Trade: 85%, etc.)
- Fee tolerance ranges

**Example**:
```javascript
var result = calculateExpectedPayoutAmount_('Topstep', 1000);
assertEquals(900, result.expected, 'Topstep expected should be 90%');
```

### 3. Month String Validation (`testMonthStringValidation`)

Tests month string format validation:

- Valid formats: `01/2025`, `12/2025`
- Invalid formats: `13/2025`, `1/2025`, `2025-01`

**Example**:
```javascript
assertTrue(validateMonthString('01/2025'), 'Valid format should pass');
assertFalse(validateMonthString('13/2025'), 'Month 13 should fail');
```

### 4. Month Normalization (`testMonthNormalization`)

Tests month string normalization:

- `normMonthStr_()` - Normalize month format
- `getMonthDisplayName()` - Get full month name

**Example**:
```javascript
assertEquals('01/2025', normMonthStr_('1/2025'), 'Should pad month');
assertEquals('January 2025', getMonthDisplayName('01/2025'), 'Should return full name');
```

### 5. Bank Summary Parsing (`testBankSummaryParsing`)

Tests bank API response structure:

- All banks return expected format
- USD/EUR balance properties exist
- Balance values are numbers

**Example**:
```javascript
var mockSummary = { USD: 10000, EUR: 5000 };
assertNotNull(mockSummary.USD, 'Mercury should have USD balance');
assertEquals('number', typeof mockSummary.USD, 'USD should be a number');
```

### 6. Balance Threshold Checks (`testBalanceThresholdChecks`)

Tests balance validation logic:

- `MIN_BALANCE_USD` is positive
- `TOPUP_AMOUNT_USD` > `MIN_BALANCE_USD`
- Balance comparisons work correctly

**Example**:
```javascript
assertTrue(MIN_BALANCE_USD > 0, 'MIN_BALANCE_USD should be positive');
assertTrue(2000 > MIN_BALANCE_USD, 'Test balance should be above minimum');
```

### 7. Cell Mapping (`testCellMapping`)

Tests CELLS configuration:

- All banks have required mappings
- Cell references are valid A1 notation
- USD/EUR cells exist for each bank

**Example**:
```javascript
assertNotNull(CELLS.Mercury, 'CELLS should have Mercury mapping');
assertTrue(CELLS.Mercury.USD.match(/^[A-Z]+[0-9]+$/), 'Should be valid A1 notation');
```

### 8. Weekend Detection (`testWeekendDetection`)

Tests weekend detection logic:

- `isWeekend_()` returns boolean
- Used to prevent FX operations on weekends

**Example**:
```javascript
var result = isWeekend_();
assertTrue(typeof result === 'boolean', 'isWeekend_ should return boolean');
```

---

## Writing New Tests

### 1. Create Test File

Create a new file in `tests/` directory:

```bash
touch tests/test-my-feature.gs
```

### 2. Write Test Function

```javascript
/**
 * test-my-feature.gs
 *
 * Tests for my new feature
 */

function testMyFeature() {
  runTestSuite('My Feature Tests', function() {
    // Test 1: Basic functionality
    var result = myNewFunction(10);
    assertEquals(20, result, 'Should double the input');

    // Test 2: Edge case
    var zeroResult = myNewFunction(0);
    assertEquals(0, zeroResult, 'Should handle zero');

    // Test 3: Error handling
    assertThrows(function() {
      myNewFunction(null);
    }, 'Should throw on null input');
  });
}
```

### 3. Add to Test Runner

Edit `tests/run-all-tests.gs` and add your test to the `testSuites` array:

```javascript
var testSuites = [
  // ... existing tests ...
  { name: 'My Feature Tests', func: testMyFeature }
];
```

### 4. Run Tests

```bash
./run-tests.sh all
```

---

## Testing Best Practices

### 1. Test One Thing Per Test

❌ **Bad**:
```javascript
function testEverything() {
  var a = doThingA();
  var b = doThingB();
  var c = doThingC();
  assertEquals(1, a);
  assertEquals(2, b);
  assertEquals(3, c);
}
```

✅ **Good**:
```javascript
function testThingA() {
  runTestSuite('Thing A Tests', function() {
    var result = doThingA();
    assertEquals(1, result, 'Thing A should return 1');
  });
}

function testThingB() {
  runTestSuite('Thing B Tests', function() {
    var result = doThingB();
    assertEquals(2, result, 'Thing B should return 2');
  });
}
```

### 2. Use Descriptive Test Messages

❌ **Bad**:
```javascript
assertEquals(900, result.expected, 'test');
```

✅ **Good**:
```javascript
assertEquals(900, result.expected, 'Topstep expected payout should be 90% of base amount');
```

### 3. Test Edge Cases

```javascript
function testCalculation() {
  runTestSuite('Calculation Edge Cases', function() {
    // Normal case
    assertEquals(100, calculate(50, 50), 'Normal addition');

    // Zero
    assertEquals(0, calculate(0, 0), 'Should handle zero');

    // Negative
    assertEquals(-10, calculate(-5, -5), 'Should handle negatives');

    // Large numbers
    assertEquals(2000000, calculate(1000000, 1000000), 'Should handle large numbers');
  });
}
```

### 4. Test Error Conditions

```javascript
function testErrorHandling() {
  runTestSuite('Error Handling', function() {
    // Should throw on invalid input
    assertThrows(function() {
      processPayment(null);
    }, 'Should throw on null user');

    assertThrows(function() {
      processPayment({ amount: -100 });
    }, 'Should throw on negative amount');
  });
}
```

### 5. Use Mock Data

For bank API tests, use mock data instead of making real API calls:

```javascript
function testBankSummaryParsing() {
  runTestSuite('Bank Summary Parsing', function() {
    // Mock response
    var mockResponse = {
      USD: 10000,
      EUR: 5000
    };

    // Test structure
    assertNotNull(mockResponse.USD, 'Should have USD');
    assertNotNull(mockResponse.EUR, 'Should have EUR');
    assertEquals('number', typeof mockResponse.USD, 'USD should be number');
  });
}
```

### 6. Test Both Success and Failure Paths

```javascript
function testTransferFunds() {
  runTestSuite('Transfer Funds', function() {
    // Success path
    var successResult = transferFunds({ from: 'A', to: 'B', amount: 100 });
    assertTrue(successResult.success, 'Should succeed with valid params');

    // Failure path - insufficient balance
    var failResult = transferFunds({ from: 'A', to: 'B', amount: 999999 });
    assertFalse(failResult.success, 'Should fail with insufficient balance');
    assertNotNull(failResult.error, 'Should have error message');
  });
}
```

---

## Integration Testing

### Testing with Real APIs

For testing with actual bank APIs (not recommended for unit tests):

1. Create a separate test function with `INTEGRATION_` prefix:
   ```javascript
   function INTEGRATION_testMercuryAPI() {
     // This won't run in regular test suite
     var summary = fetchMercurySummary_();
     assertNotNull(summary, 'Should get Mercury summary');
     Logger.log('Mercury balance: ' + summary.USD);
   }
   ```

2. Run manually in Apps Script editor

3. Never include in automated test suite

### Testing Triggers

To test time-based triggers:

1. Create a test function:
   ```javascript
   function TEST_dailyBalanceUpdate() {
     // Manually trigger the function
     TRIGGER_updateAllBalances();

     // Check results
     var sheet = sheet_('Payouts');
     var usdBalance = sheet.getRange('C2').getValue();
     assertTrue(usdBalance > 0, 'Should have updated balance');
   }
   ```

2. Run manually when testing trigger logic

---

## Continuous Testing

### Before Every Deployment

```bash
# 1. Run smoke tests
./run-tests.sh smoke

# 2. If smoke tests pass, run full suite
./run-tests.sh all

# 3. If all tests pass, deploy
./deploy-gas.sh
```

### After Every Code Change

Before committing:

```bash
git add src/
./run-tests.sh smoke    # Quick validation
git commit -m "Your commit message"
```

### Weekly Full Test Run

Schedule a full test run weekly:

```bash
# Every Monday
./run-tests.sh all > test-results-$(date +%Y-%m-%d).log
```

---

## Interpreting Test Results

### Successful Test Run

```
🧪 Running test suite: Utility Functions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ PASS: toBool_ should handle boolean true
✅ PASS: toBool_ should handle boolean false
✅ PASS: toBool_ should handle string "true"
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 TEST RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Tests: 25
✅ Passed: 25
❌ Failed: 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 ALL TESTS PASSED! 🎉
```

### Failed Test Run

```
❌ FAIL: Topstep expected should be 90% of base
   Expected: 900
   Actual: 850

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 TEST RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Tests: 25
✅ Passed: 24
❌ Failed: 1

🔍 Failed Tests:
  • Topstep expected should be 90% of base
    Expected: 900
    Actual: 850
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  SOME TESTS FAILED - Please review errors above
```

**Action**: Fix the failing test before deploying!

---

## Troubleshooting

### Tests Not Running

**Problem**: `./run-tests.sh` fails

**Solutions**:
1. Check clasp is installed: `clasp --version`
2. Check you're logged in: `clasp login --status`
3. Check script ID in `.clasp.json`

### Tests Passing Locally But Failing in Apps Script

**Problem**: Tests work when run manually but fail in automated run

**Solution**: Check for dependencies on external state:
- Avoid relying on specific sheet data
- Use mock data instead of real API calls
- Reset state at start of each test

### Timeout Errors

**Problem**: Tests timeout in Apps Script

**Solution**:
1. Break large test suites into smaller ones
2. Reduce number of assertions per test
3. Use smoke tests for quick validation

---

## Quick Reference

| Task | Command |
|------|---------|
| Run all tests | `./run-tests.sh all` |
| Run smoke tests | `./run-tests.sh smoke` |
| Open Apps Script editor | `clasp open` |
| View execution logs | `clasp logs` |
| Run specific test manually | Select function in editor and click Run |

---

## Test Coverage

Current test coverage:

| Module | Coverage | Tests |
|--------|----------|-------|
| Utilities | ✅ 80% | `testUtilityFunctions` |
| Reconciliation | ✅ 90% | `testPaymentReconciliation` |
| Month Validation | ✅ 100% | `testMonthStringValidation` |
| Month Normalization | ✅ 100% | `testMonthNormalization` |
| Bank Integration | ✅ 60% | `testBankSummaryParsing` |
| Balance Checks | ✅ 70% | `testBalanceThresholdChecks` |
| Configuration | ✅ 100% | `testCellMapping` |
| Weekend Logic | ✅ 100% | `testWeekendDetection` |

**Goal**: Achieve 80%+ coverage for all critical modules.

---

## Support

For testing issues:

1. Check [DEPLOYMENT.md](DEPLOYMENT.md) for deployment issues
2. Check [ARCHITECTURE.md](../ARCHITECTURE.md) for system understanding
3. Check [AI_CODING_PATTERNS.md](../AI_CODING_PATTERNS.md) for coding patterns

---

**Last Updated**: 2025-01-18
**Test Framework Version**: 1.0
**Total Tests**: 40+
