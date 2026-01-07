/**
 * run-all-tests.gs
 *
 * Master test runner - executes all test suites
 */

function runAllTests() {
  Logger.log('\n\n');
  Logger.log('╔══════════════════════════════════════════════════════════╗');
  Logger.log('║                                                          ║');
  Logger.log('║           TORX UNIT TEST SUITE - FULL RUN                ║');
  Logger.log('║                                                          ║');
  Logger.log('╚══════════════════════════════════════════════════════════╝');
  Logger.log('\n');

  var allResults = {
    total: 0,
    passed: 0,
    failed: 0,
    suites: []
  };

  // Run all test suites
  var testSuites = [
    { name: 'Utility Functions', func: testUtilityFunctions },
    { name: 'Payment Reconciliation', func: testPaymentReconciliation },
    { name: 'Month String Validation', func: testMonthStringValidation },
    { name: 'Month Normalization', func: testMonthNormalization },
    { name: 'Bank Summary Parsing', func: testBankSummaryParsing },
    { name: 'Balance Threshold Checks', func: testBalanceThresholdChecks },
    { name: 'Cell Mapping', func: testCellMapping },
    { name: 'Weekend Detection', func: testWeekendDetection }
  ];

  testSuites.forEach(function(suite) {
    try {
      suite.func();
      allResults.total += TEST_RESULTS.total;
      allResults.passed += TEST_RESULTS.passed;
      allResults.failed += TEST_RESULTS.failed;
      allResults.suites.push({
        name: suite.name,
        result: TEST_RESULTS
      });
    } catch (e) {
      Logger.log('❌ Test suite "' + suite.name + '" crashed: ' + e.message);
      allResults.failed++;
    }
  });

  // Print overall summary
  Logger.log('\n\n');
  Logger.log('╔══════════════════════════════════════════════════════════╗');
  Logger.log('║                                                          ║');
  Logger.log('║                    OVERALL RESULTS                       ║');
  Logger.log('║                                                          ║');
  Logger.log('╚══════════════════════════════════════════════════════════╝');
  Logger.log('\n');
  Logger.log('📊 Total Test Suites: ' + testSuites.length);
  Logger.log('📊 Total Tests: ' + allResults.total);
  Logger.log('✅ Total Passed: ' + allResults.passed);
  Logger.log('❌ Total Failed: ' + allResults.failed);

  if (allResults.failed === 0) {
    Logger.log('\n🎉 ALL TESTS PASSED! 🎉\n');
  } else {
    Logger.log('\n⚠️  SOME TESTS FAILED - Please review errors above\n');
  }

  Logger.log('═══════════════════════════════════════════════════════════\n\n');

  return allResults;
}

/**
 * Quick smoke test - runs a minimal set of critical tests
 */
function runSmokeTests() {
  Logger.log('\n🔥 Running smoke tests...\n');

  resetTestResults();

  // Critical utility tests
  assertTrue(toBool_(true), 'toBool_ basic test');
  assertNotNull(nowStamp_(), 'nowStamp_ returns value');

  // Critical configuration tests
  assertNotNull(CELLS, 'CELLS configuration exists');
  assertTrue(MIN_BALANCE_USD > 0, 'MIN_BALANCE_USD is positive');

  // Critical function existence tests
  assertNotNull(sheet_, 'sheet_ function exists');
  assertNotNull(props_, 'props_ function exists');

  printTestSummary();

  if (TEST_RESULTS.failed === 0) {
    Logger.log('✅ Smoke tests passed - system is operational\n');
  } else {
    Logger.log('❌ Smoke tests failed - critical issues detected\n');
  }

  return TEST_RESULTS;
}
