#!/usr/bin/env ts-node

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DID_API_KEY = process.env.DID_API_KEY;

async function testUpload() {
  console.log('🧪 Testando Upload de Avatar para D-ID\n');

  const carlaPath = path.join(__dirname, '..', 'assets', 'Carla.png');

  console.log('📁 Arquivo:', carlaPath);
  console.log('📏 Existe:', fs.existsSync(carlaPath));

  if (!fs.existsSync(carlaPath)) {
    console.error('❌ Arquivo não encontrado!');
    return;
  }

  const imageBuffer = fs.readFileSync(carlaPath);
  console.log('📦 Buffer size:', imageBuffer.length, 'bytes');

  const formData = new FormData();
  formData.append('image', imageBuffer, {
    filename: 'Carla.png',
    contentType: 'image/png'
  });

  console.log('\n📤 Enviando para D-ID...');
  console.log('Authorization:', DID_API_KEY);
  console.log('Headers:', formData.getHeaders());

  try {
    const response = await axios.post(
      'https://api.d-id.com/images',
      formData,
      {
        headers: {
          'Authorization': DID_API_KEY,
          ...formData.getHeaders()
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    console.log('\n✅ SUCCESS!');
    console.log('Avatar URL:', response.data.url);

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.response?.status);
    console.error('Status Text:', error.response?.statusText);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('\nRequest headers:', error.config?.headers);
  }
}

testUpload();
