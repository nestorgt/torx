/**
 * test-utils.gs
 *
 * Unit tests for utility functions
 */

function testUtilityFunctions() {
  runTestSuite('Utility Functions', function() {
    // Test toBool_
    assertEquals(true, toBool_(true), 'toBool_ should handle boolean true');
    assertEquals(false, toBool_(false), 'toBool_ should handle boolean false');
    assertEquals(true, toBool_('true'), 'toBool_ should handle string "true"');
    assertEquals(true, toBool_('TRUE'), 'toBool_ should handle string "TRUE"');
    assertEquals(true, toBool_('1'), 'toBool_ should handle string "1"');
    assertEquals(true, toBool_('yes'), 'toBool_ should handle string "yes"');
    assertEquals(false, toBool_('false'), 'toBool_ should handle string "false"');
    assertEquals(false, toBool_('0'), 'toBool_ should handle string "0"');
    assertEquals(false, toBool_(''), 'toBool_ should handle empty string');

    // Test nowStamp_ returns a valid timestamp
    var timestamp = nowStamp_();
    assertNotNull(timestamp, 'nowStamp_ should return a value');
    assertTrue(timestamp.includes('-'), 'nowStamp_ should contain date separators');
    assertTrue(timestamp.includes(':'), 'nowStamp_ should contain time separators');

    // Test formatCurrency
    assertEquals('$1,000.00', formatCurrency(1000, 'USD'), 'formatCurrency should format USD');
    assertEquals('€500.00', formatCurrency(500, 'EUR'), 'formatCurrency should format EUR');
    assertEquals('$0.00', formatCurrency(0, 'USD'), 'formatCurrency should handle zero');

    // Test padStart
    assertEquals('007', padStart('7', 3, '0'), 'padStart should pad with zeros');
    assertEquals('abc', padStart('abc', 3, '0'), 'padStart should not pad if already long enough');
    assertEquals('00123', padStart('123', 5, '0'), 'padStart should pad correctly');
  });
}
