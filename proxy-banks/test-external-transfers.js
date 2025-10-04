#!/usr/bin/env node

// Test script for external bank transfers
import axios from 'axios';

const SERVER_URL = 'http://localhost:8081';
const AUTH_TOKEN = 'proxy123';

async function testExternalTransfers() {
  console.log('🧪 Testing External Bank Transfer Capabilities');
  console.log('=' * 50);
  
  // Test Mercury external transfer
  console.log('\n1️⃣ Testing Mercury External Transfer...');
  try {
    const mercuryPayload = {
      fromAccountId: 'main',
      toAccountId: 'external_bank_account',
      amount: 100,
      currency: 'USD',
      reference: 'Test external transfer'
    };
    
    const mercuryResponse = await axios.post(
      `${SERVER_URL}/mercury/external-transfer`,
      mercuryPayload,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Mercury External Transfer Response:');
    console.log(JSON.stringify(mercuryResponse.data, null, 2));
  } catch (error) {
    console.log('❌ Mercury External Transfer Error:');
    console.log(error.response?.data || error.message);
  }
  
  // Test Revolut external transfer
  console.log('\n2️⃣ Testing Revolut External Transfer...');
  try {
    const revolutPayload = {
      fromAccountId: 'main_account_id_123',
      externalBankAccount: {
        name: 'Chase Bank Account',
        accountNumber: '1234567890',
        routingNumber: '021000021',
        accountType: 'checking',
        bankName: 'Chase'
      },
      amount: 150,
      currency: 'USD',
      reference: 'Test external transfer to Chase'
    };
    
    const revolutResponse = await axios.post(
      `${SERVER_URL}/revolut/external-transfer`,
      revolutPayload,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Revolut External Transfer Response:');
    console.log(JSON.stringify(revolutResponse.data, null, 2));
  } catch (error) {
    console.log('❌ Revolut External Transfer Error:');
    console.log(error.response?.data || error.message);
  }
  
  // Test current beneficiary capabilities
  console.log('\n3️⃣ Checking Available Beneficiaries...');
  try {
    const beneficiariesResponse = await axios.get(
      `${SERVER_URL}/revolut/beneficiaries`,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );
    
    console.log('📋 Beneficiaries Response:');
    console.log(JSON.stringify(beneficiariesResponse.data, null, 2));
  } catch (error) {
    console.log('❌ Beneficiaries Error:');
    console.log(error.response?.data || error.message);
  }
  
  console.log('\n📋 Summary:');
  console.log('- External transfer endpoints created');
  console.log('- Both Mercury and Revolut external transfer APIs implemented');
  console.log('- Fallback logic for multiple endpoint attempts');
  console.log('- Comprehensive error handling and logging');
  console.log('- Ready for testing with actual bank accounts');
}

testExternalTransfers().catch(console.error);
