/**
 * bank-nexo.gs
 *
 * Nexo bank integration
 */

function fetchNexoSummary_() { 
  return httpProxyJson_('/nexo/summary'); 
}

