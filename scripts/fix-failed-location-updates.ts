/**
 * Script para corrigir leads que falharam na re-extração de localização
 * devido ao erro VARCHAR(100) overflow no campo city.
 *
 * Este script re-processa os leads específicos que falharam na execução anterior,
 * agora que o extrator foi corrigido para truncar city > 100 chars.
 *
 * Uso:
 *   npx ts-node scripts/fix-failed-location-updates.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { extractLocation, inferStateFromCity } from '../src/services/location-extractor.service';

// Carregar variáveis de ambiente
config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// IDs dos leads que falharam na execução anterior
const FAILED_LEAD_IDS = [
  '158ff6b8-aa32-41c7-a4fc-3d43231027e6',
  'b4ef1a06-3513-469a-89f6-827ea6906a89',
  '0052fb80-bef6-4571-b3dd-10caf726b739',
  'becfe32d-c011-45e6-ac56-a14cd1335525',
  '403b13e1-6c9a-416a-bff2-8a0c1ad59594',
  'b43e2c68-b5b7-4562-a8c7-3d7c56e0e13a',
  '6f808bde-5f1f-491c-8fa2-ba310bb73e01',
  '34ba1562-b12f-4235-b354-7a8fb514654e',
  'd795c941-9198-4a9f-aa68-91e626d47bd7',
  '0dc2d724-7be3-4888-a6d2-b338f7c7fe4a',
  '327da022-f2b1-464c-9d08-e6d69f5bf942',
  'aba0d94d-9759-443f-847e-89c3d91c59ea',
  '48dd414a-fafe-49b2-a673-765de8456022',
  '88588a47-f748-4b96-876f-6b781a01a12e',
  '2cd1f44b-533c-40b0-9229-907eb8b51c7e',
  'f6ee4e83-661f-4881-a39c-869a92b969d0',
  '90499502-a9eb-46c5-9221-4998f4c165bb',
  '5db81243-4c61-45f1-aad3-eded2195a40e',
  'dd048bbe-4603-47f6-b8ae-4662aea8abe3',
  'cf14e6ab-452e-468c-8cb7-9f09c1417455',
  'dde01826-09ee-44a4-a89b-23ee76a47497',
  '6d5bc3ce-28cc-45dd-b448-53fdc71df376',
  '809f25d8-dccc-4547-9df0-bd5a3c55e2f6',
  '132d4804-b193-430c-80af-533b631cb97d',
  '1f28b6a6-b559-4ea5-9e65-8016cb10234b',
  '5656e40b-fe1c-47f5-9e72-acca4b378fc1',
  '1c29dda6-08b1-4799-b31f-d40c2ae576ab',
  '87e37203-9fa5-4ba7-a9c2-a6d663054d98',
  'ccb7cc39-779b-46c6-b640-d6112f086c8e',
  '07b3da78-4cb6-4d47-8682-6ee7be2dccbb',
  '48e5721a-c70b-4326-87ae-0829a9a02f85',
  '273b149c-b774-440c-b5eb-b5ff47115603',
  '80fb926a-ac3d-4ea0-a947-9e60bf72244a',
  '4101b84b-2b34-43db-b1c9-78e586a0a606',
  'ff7b61a9-fbf1-4080-b155-7931f4091525',
  '03c3afe7-c255-4824-aa86-fb7d05c15e50',
  '421d2616-70c8-4caf-bbe0-374a25c5ce36',
  'f4534318-652c-4b30-92d8-c4a0a0c49dc0',
  '611d3db5-9c82-4c45-83c6-a75d0d318f73',
  '87f06b17-0d2c-4692-92f3-0dad0dd83335',
  '430c2bc8-6b84-4a0c-9c87-c742e64b45f4',
];

interface Lead {
  id: string;
  username: string;
  bio: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
}

async function main() {
  console.log('🔧 CORREÇÃO DE LEADS COM CITY > 100 CARACTERES\n');
  console.log('=' .repeat(50));
  console.log(`📋 ${FAILED_LEAD_IDS.length} leads para re-processar\n`);

  // Buscar dados dos leads
  const { data: leads, error: fetchError } = await supabase
    .from('instagram_leads')
    .select('id, username, bio, phone, city, state')
    .in('id', FAILED_LEAD_IDS);

  if (fetchError) {
    console.error('❌ Erro ao buscar leads:', fetchError.message);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.log('⚠️ Nenhum lead encontrado');
    return;
  }

  console.log(`✅ ${leads.length} leads encontrados\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const lead of leads as Lead[]) {
    console.log(`\n📍 @${lead.username}`);

    // Re-extrair localização (agora com truncamento)
    const extracted = extractLocation(lead.bio, lead.phone);

    // Se tem city existente sem state, tentar inferir
    let city = extracted?.city || lead.city;
    let state = extracted?.state || lead.state;

    if (city && !state) {
      state = inferStateFromCity(city);
    }

    // Aplicar truncamento manual de segurança
    if (city && city.length > 100) {
      console.log(`   ⚠️ City truncada: "${city.substring(0, 50)}..." (${city.length} chars)`);
      city = city.substring(0, 100).trim();
    }

    if (!city && !state) {
      console.log('   ⏭️ Sem dados de localização');
      skipped++;
      continue;
    }

    console.log(`   📍 ${city || '-'} / ${state || '-'}`);

    // Atualizar no banco
    const { error: updateError } = await supabase
      .from('instagram_leads')
      .update({
        city: city,
        state: state,
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);

    if (updateError) {
      console.log(`   ❌ Erro: ${updateError.message}`);
      errors++;
    } else {
      console.log('   ✅ Atualizado');
      updated++;
    }
  }

  // Relatório
  console.log('\n' + '=' .repeat(50));
  console.log('📊 RELATÓRIO FINAL\n');
  console.log(`   Total: ${leads.length}`);
  console.log(`   ✅ Atualizados: ${updated}`);
  console.log(`   ⏭️ Pulados: ${skipped}`);
  console.log(`   ❌ Erros: ${errors}`);
  console.log('\n✨ Processamento concluído!');
}

main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
