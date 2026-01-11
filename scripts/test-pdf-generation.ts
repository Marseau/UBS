import * as dotenv from 'dotenv';
dotenv.config();

import { contractPDFService } from '../src/services/contract-pdf.service';

async function testPDF() {
  console.log('Gerando PDF de teste...\n');

  const result = await contractPDFService.generateAndUpload({
    client_name: 'Maria Silva',
    client_document: '123.456.789-00',
    client_address: 'Rua das Flores, 123 - Jardins, Sao Paulo/SP',
    client_representative: 'Maria Silva',
    contract_id: 'TEST-PDF-001',
    contract_date: new Date().toISOString(),
    contract_value: 6000,
    lead_value: 15,
    signature_name: '',
    signature_ip: '',
    signature_date: '',
    signature_user_agent: ''
  });

  console.log('Resultado:');
  console.log('- URL:', result.url || 'N/A');
  console.log('- Buffer size:', result.buffer?.length || 0, 'bytes');
  console.log('- Success:', !!result.buffer);

  if (result.buffer) {
    // Save PDF locally for inspection
    const fs = require('fs');
    fs.writeFileSync('/tmp/test-contract.pdf', result.buffer);
    console.log('\nPDF salvo em: /tmp/test-contract.pdf');
  }
}

testPDF().catch(console.error);
