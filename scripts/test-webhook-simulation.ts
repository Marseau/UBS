import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createTestData() {
  console.log('🚀 Creating test data for webhook simulation...\n');

  // 1. Create test journey
  const { data: journey, error: journeyError } = await supabase
    .from('aic_client_journeys')
    .insert({
      client_name: 'Teste Webhook',
      client_email: 'teste@webhook.com',
      client_phone: '11999998888',
      current_step: 'contrato_enviado',
      access_token: crypto.randomUUID(),
      next_action_message: 'Aguardando assinatura',
      proposal_data: {
        project_name: 'Campanha Teste Webhook',
        target_niche: 'Salões de Beleza',
        service_description: 'Prospecção de clientes',
        target_audience: 'Salões em SP',
        contract_value: 5000,
        lead_value: 12
      }
    })
    .select()
    .single();

  if (journeyError) {
    console.error('❌ Error creating journey:', journeyError);
    return;
  }
  console.log('✅ Journey created:', journey.id);

  // 2. Create test contract linked to journey
  const docId = 'test-doc-' + Date.now();
  const { data: contract, error: contractError } = await supabase
    .from('aic_contracts')
    .insert({
      contract_id: 'TEST-' + Date.now(),
      journey_id: journey.id,
      client_name: 'Teste Webhook',
      client_email: 'teste@webhook.com',
      client_phone: '11999998888',
      client_document: '12345678901',
      client_address: 'Rua Teste, 123',
      project_name: 'Campanha Teste Webhook',
      campaign_whatsapp: '11988887777',
      target_niche: 'Salões de Beleza',
      service_description: 'Prospecção de clientes via WhatsApp e Instagram',
      target_audience: 'Salões de beleza em São Paulo',
      contract_value: 5000,
      lead_value: 12,
      esignature_provider: 'd4sign',
      esignature_document_id: docId,
      esignature_status: 'waiting',
      status: 'pending'
    })
    .select()
    .single();

  if (contractError) {
    console.error('❌ Error creating contract:', contractError);
    return;
  }
  console.log('✅ Contract created:', contract.id);

  // Update journey with contract_id
  await supabase
    .from('aic_client_journeys')
    .update({ contract_id: contract.id })
    .eq('id', journey.id);

  console.log('\n📋 Test data created successfully!');
  console.log('─'.repeat(50));
  console.log('Journey ID:', journey.id);
  console.log('Contract ID:', contract.id);
  console.log('Document ID:', docId);
  console.log('─'.repeat(50));
  console.log('\n🔗 Run this curl to simulate webhook:\n');
  console.log(`curl -X POST http://localhost:3004/api/aic/esignature/webhook \\
  -H "Content-Type: application/json" \\
  -d '{
    "uuid": "${docId}",
    "type": "signature",
    "status": "signed",
    "signer": {
      "email": "teste@webhook.com",
      "name": "Teste Webhook",
      "signed_at": "${new Date().toISOString()}"
    }
  }'`);
}

createTestData().catch(console.error);
