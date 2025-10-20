/**
 * bank-wise.gs
 *
 * Wise bank integration
 */

function fetchWiseSummary_() { 
  return httpProxyJson_('/wise/summary'); 
}

