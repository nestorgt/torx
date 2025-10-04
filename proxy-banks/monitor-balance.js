#!/usr/bin/env node

/**
 * USD Balance Monitor
 * Monitors Mercury + Revolut USD balances
 * Alerts when total USD drops below $1,000
 */

import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const PROXY_URL = 'http://localhost:8081';
const PROXY_TOKEN = process.env.PROXY_TOKEN;
const THRESHOLD_USD = 1000; // Balance threshold
const TRANSFER_AMOUNT_USD = 2000; // Amount to transfer when below threshold
const EXIT_CODE_LOW_BALANCE = 2; // Custom exit code for low balance

async function checkUSDBalance() {
  console.log('💰 CHECKING USD BALANCES...\n');
  
  try {
    const [mercury, revolut] = await Promise.all([
      fetchMercuryBalance(),
      fetchRevolutBalance()
    ]);
    
    console.log('📊 INDIVIDUAL BANK REPORT:');
    console.log(`🏦 Mercury: $${mercury.toFixed(2)}`);
    console.log(`🏦 Revolut: $${revolut.toFixed(2)}`);
    console.log(`🎯 Threshold per bank: $${THRESHOLD_USD}`);
    
    let hasLowBalance = false;
    let alertMessage = '';
    
    // Check Mercury independently
    console.log('\n🔍 MERCURY CHECK:');
    if (mercury < THRESHOLD_USD) {
      const shortfall = THRESHOLD_USD - mercury;
      console.log(`🚨 MERCURY: Below threshold!`);
      console.log(`⚠️  Shortfall: $${shortfall.toFixed(2)}`);
      console.log(`💰 Current: $${mercury.toFixed(2)}`);
      alertMessage += `MERCURY LOW: $${mercury.toFixed(2)} (-$${shortfall.toFixed(2)})\n`;
      hasLowBalance = true;
    } else {
      const surplus = mercury - THRESHOLD_USD;
      console.log(`✅ MERCURY: Above threshold (+$${surplus.toFixed(2)})`);
    }
    
    // Check Revolut independently
    console.log('\n🔍 REVOLUT CHECK:');
    if (revolut < THRESHOLD_USD) {
      const shortfall = THRESHOLD_USD - revolut;
      console.log(`🚨 REVOLUT: Below threshold!`);
      console.log(`⚠️  Shortfall: $${shortfall.toFixed(2)}`);
      console.log(`💰 Current: $${revolut.toFixed(2)}`);
      console.log(`💸 Required Transfer: $${TRANSFER_AMOUNT_USD}`);
      alertMessage += `REVOLUT LOW: $${revolut.toFixed(2)} (-$${shortfall.toFixed(2)}) -> Transfer $${TRANSFER_AMOUNT_USD}\n`;
      hasLowBalance = true;
    } else {
      const surplus = revolut - THRESHOLD_USD;
      console.log(`✅ REVOLUT: Above threshold (+$${surplus.toFixed(2)})`);
    }
    
    // Overall result
    if (hasLowBalance) {
      console.log(`\n🚨 ALERT: One or more banks below $${THRESHOLD_USD}!`);
      console.log(alertMessage.trim());
      
      // Exit with special code for monitoring systems
      process.exit(EXIT_CODE_LOW_BALANCE);
    } else {
      console.log(`\n✅ ALL BANKS: Above $${THRESHOLD_USD} threshold`);
    }
    
  } catch (error) {
    console.error('❌ Error checking balance:', error.message);
    process.exit(1);
  }
}

async function fetchMercuryBalance() {
  try {
    const response = await fetch(`${PROXY_URL}/mercury/summary`, {
      headers: {
        'x-proxy-token': PROXY_TOKEN,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Mercury API error: ${response.status}`);
    }
    
    const data = await response.json();
    return parseFloat(data.USD) || 0;
  } catch (error) {
    console.error('❌ Mercury fetch failed:', error.message);
    return 0;
  }
}

async function fetchRevolutBalance() {
  try {
    const response = await fetch(`${PROXY_URL}/revolut/summary`, {
      headers: {
        'x-proxy-token': PROXY_TOKEN,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Revolut API error: ${response.status}`);
    }
    
    const data = await response.json();
    return parseFloat(data.USD) || 0;
  } catch (error) {
    console.error('❌ Revolut fetch failed:', error.message);
    return 0;
  }
}

// Fetch is available in Node 18+
// No polyfill needed

// Run the check
checkUSDBalance();
