/**
 * test-reconciliation.gs
 *
 * Unit tests for payment reconciliation logic
 */

function testPaymentReconciliation() {
  runTestSuite('Payment Reconciliation', function() {
    // Test calculateExpectedPayoutAmount_ for different platforms

    // Test Topstep (90% with $0-$20 fee)
    var topstepResult = calculateExpectedPayoutAmount_('Topstep', 1000);
    assertEquals(900, topstepResult.expected, 'Topstep expected should be 90% of base');
    assertTrue(topstepResult.min <= topstepResult.expected, 'Topstep min should be <= expected');
    assertTrue(topstepResult.max >= topstepResult.expected, 'Topstep max should be >= expected');

    // Test Tradeify (90% with $0-$20 fee)
    var tradeifyResult = calculateExpectedPayoutAmount_('Tradeify', 1000);
    assertEquals(900, tradeifyResult.expected, 'Tradeify expected should be 90% of base');

    // Test Earn2Trade (85% with $0-$20 fee)
    var earn2tradeResult = calculateExpectedPayoutAmount_('Earn2Trade', 1000);
    assertEquals(850, earn2tradeResult.expected, 'Earn2Trade expected should be 85% of base');

    // Test Unknown Platform (90% with wider tolerance)
    var unknownResult = calculateExpectedPayoutAmount_('Unknown Platform', 1000);
    assertEquals(900, unknownResult.expected, 'Unknown Platform expected should be 90% of base');

    // Test edge cases
    var zeroResult = calculateExpectedPayoutAmount_('Topstep', 0);
    assertEquals(0, zeroResult.expected, 'Zero amount should return zero expected');

    // Test small amounts
    var smallResult = calculateExpectedPayoutAmount_('Topstep', 50);
    assertEquals(45, smallResult.expected, 'Small amounts should calculate correctly');
    assertTrue(smallResult.min >= 0, 'Min should never be negative');
  });
}

function testMonthStringValidation() {
  runTestSuite('Month String Validation', function() {
    // Test valid month strings
    assertTrue(validateMonthString('01/2025'), 'Valid format MM/YYYY should pass');
    assertTrue(validateMonthString('12/2025'), 'Valid format MM/YYYY should pass');

    // Test invalid month strings
    assertFalse(validateMonthString('13/2025'), 'Month 13 should fail');
    assertFalse(validateMonthString('00/2025'), 'Month 00 should fail');
    assertFalse(validateMonthString('1/2025'), 'Single digit month without zero should fail');
    assertFalse(validateMonthString('2025-01'), 'Wrong format should fail');
    assertFalse(validateMonthString(''), 'Empty string should fail');
    assertFalse(validateMonthString(null), 'Null should fail');
  });
}

function testMonthNormalization() {
  runTestSuite('Month Normalization', function() {
    // Test month string normalization
    assertEquals('01/2025', normMonthStr_('1/2025'), 'Single digit month should be padded');
    assertEquals('12/2025', normMonthStr_('12/2025'), 'Double digit month should remain unchanged');
    assertEquals('01/2025', normMonthStr_('01/2025'), 'Already normalized should remain unchanged');

    // Test display names
    assertEquals('January 2025', getMonthDisplayName('01/2025'), 'Should return full month name');
    assertEquals('December 2025', getMonthDisplayName('12/2025'), 'Should return full month name');
  });
}
