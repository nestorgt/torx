// Test script for the new transaction endpoints
// Run this to test Mercury and Airwallex transaction fetching

import 'dotenv/config';

const PROXY_URL = 'http://localhost:8081'; // Adjust if your proxy runs on different port
const PROXY_TOKEN = process.env.PROXY_TOKEN || 'your-token-here';

async function testMercuryTransactions() {
  console.log('Testing Mercury transactions...');
  try {
    const response = await fetch(`${PROXY_URL}/mercury/transactions?month=7&year=2025`, {
      headers: {
        'x-proxy-token': PROXY_TOKEN,
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Mercury transactions:', JSON.stringify(data, null, 2));
    } else {
      const error = await response.text();
      console.log('❌ Mercury error:', response.status, error);
    }
  } catch (e) {
    console.log('❌ Mercury exception:', e.message);
  }
}

async function testAirwallexTransactions() {
  console.log('Testing Airwallex transactions...');
  try {
    const response = await fetch(`${PROXY_URL}/airwallex/transactions?month=7&year=2025`, {
      headers: {
        'x-proxy-token': PROXY_TOKEN,
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Airwallex transactions:', JSON.stringify(data, null, 2));
    } else {
      const error = await response.text();
      console.log('❌ Airwallex error:', response.status, error);
    }
  } catch (e) {
    console.log('❌ Airwallex exception:', e.message);
  }
}

async function runTests() {
  console.log('🚀 Starting transaction endpoint tests...\n');
  
  await testMercuryTransactions();
  console.log('');
  await testAirwallexTransactions();
  
  console.log('\n✨ Tests completed!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { testMercuryTransactions, testAirwallexTransactions };
