/**
 * test-framework.gs
 *
 * Simple unit testing framework for Google Apps Script
 * Provides assertion functions and test runner
 */

var TEST_RESULTS = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

/**
 * Assert that two values are equal
 */
function assertEquals(expected, actual, message) {
  TEST_RESULTS.total++;
  if (expected === actual) {
    TEST_RESULTS.passed++;
    Logger.log('✅ PASS: ' + (message || 'assertEquals'));
  } else {
    TEST_RESULTS.failed++;
    var error = {
      test: message || 'assertEquals',
      expected: expected,
      actual: actual
    };
    TEST_RESULTS.errors.push(error);
    Logger.log('❌ FAIL: ' + (message || 'assertEquals'));
    Logger.log('   Expected: ' + expected);
    Logger.log('   Actual: ' + actual);
  }
}

/**
 * Assert that a value is truthy
 */
function assertTrue(value, message) {
  TEST_RESULTS.total++;
  if (value) {
    TEST_RESULTS.passed++;
    Logger.log('✅ PASS: ' + (message || 'assertTrue'));
  } else {
    TEST_RESULTS.failed++;
    var error = {
      test: message || 'assertTrue',
      expected: 'truthy value',
      actual: value
    };
    TEST_RESULTS.errors.push(error);
    Logger.log('❌ FAIL: ' + (message || 'assertTrue'));
    Logger.log('   Expected: truthy value');
    Logger.log('   Actual: ' + value);
  }
}

/**
 * Assert that a value is falsy
 */
function assertFalse(value, message) {
  TEST_RESULTS.total++;
  if (!value) {
    TEST_RESULTS.passed++;
    Logger.log('✅ PASS: ' + (message || 'assertFalse'));
  } else {
    TEST_RESULTS.failed++;
    var error = {
      test: message || 'assertFalse',
      expected: 'falsy value',
      actual: value
    };
    TEST_RESULTS.errors.push(error);
    Logger.log('❌ FAIL: ' + (message || 'assertFalse'));
    Logger.log('   Expected: falsy value');
    Logger.log('   Actual: ' + value);
  }
}

/**
 * Assert that a value is not null/undefined
 */
function assertNotNull(value, message) {
  TEST_RESULTS.total++;
  if (value !== null && value !== undefined) {
    TEST_RESULTS.passed++;
    Logger.log('✅ PASS: ' + (message || 'assertNotNull'));
  } else {
    TEST_RESULTS.failed++;
    var error = {
      test: message || 'assertNotNull',
      expected: 'non-null value',
      actual: value
    };
    TEST_RESULTS.errors.push(error);
    Logger.log('❌ FAIL: ' + (message || 'assertNotNull'));
  }
}

/**
 * Assert that a function throws an error
 */
function assertThrows(func, message) {
  TEST_RESULTS.total++;
  try {
    func();
    TEST_RESULTS.failed++;
    var error = {
      test: message || 'assertThrows',
      expected: 'function to throw',
      actual: 'no error thrown'
    };
    TEST_RESULTS.errors.push(error);
    Logger.log('❌ FAIL: ' + (message || 'assertThrows'));
    Logger.log('   Expected function to throw, but it did not');
  } catch (e) {
    TEST_RESULTS.passed++;
    Logger.log('✅ PASS: ' + (message || 'assertThrows'));
  }
}

/**
 * Reset test results
 */
function resetTestResults() {
  TEST_RESULTS = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: []
  };
}

/**
 * Print test summary
 */
function printTestSummary() {
  Logger.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('📊 TEST RESULTS');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('Total Tests: ' + TEST_RESULTS.total);
  Logger.log('✅ Passed: ' + TEST_RESULTS.passed);
  Logger.log('❌ Failed: ' + TEST_RESULTS.failed);

  if (TEST_RESULTS.failed > 0) {
    Logger.log('\n🔍 Failed Tests:');
    TEST_RESULTS.errors.forEach(function(error) {
      Logger.log('  • ' + error.test);
      Logger.log('    Expected: ' + error.expected);
      Logger.log('    Actual: ' + error.actual);
    });
  }

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return TEST_RESULTS;
}

/**
 * Run a test suite
 * @param {string} suiteName - Name of the test suite
 * @param {Function} testFunc - Test function to run
 */
function runTestSuite(suiteName, testFunc) {
  Logger.log('\n🧪 Running test suite: ' + suiteName);
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  resetTestResults();

  try {
    testFunc();
  } catch (e) {
    Logger.log('❌ Test suite crashed: ' + e.message);
    Logger.log(e.stack);
  }

  return printTestSummary();
}
