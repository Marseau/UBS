#!/usr/bin/env ts-node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const DID_API_KEY = process.env.DID_API_KEY;

console.log('🔍 Debug D-ID API\n');
console.log('DID_API_KEY:', DID_API_KEY);
console.log('Length:', DID_API_KEY?.length);
console.log('Starts with Basic:', DID_API_KEY?.startsWith('Basic'));
console.log('\n🧪 Testando conexão com D-ID...\n');

async function testAPI() {
  try {
    const response = await axios.get('https://api.d-id.com/credits', {
      headers: {
        'Authorization': DID_API_KEY
      }
    });

    console.log('✅ SUCCESS!');
    console.log('Credits:', response.data.remaining);
    console.log('\n✅ API key está funcionando!\n');
  } catch (error: any) {
    console.error('❌ ERROR:', error.response?.status);
    console.error('Message:', error.response?.data);
    console.error('\nHeaders enviados:', error.config?.headers);
  }
}

testAPI();
