/**
 * Script: Verificação em Massa de Follow Backs
 *
 * Processa todos os leads com follow_status='followed' e verifica
 * quem seguiu de volta usando o endpoint /check-follow-back
 *
 * Uso:
 *   npx ts-node scripts/check-all-follow-backs.ts
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_BASE = process.env.API_BASE_URL || 'http://192.168.15.5:3000';

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

const CONFIG = {
  batchSize: 10, // Processar 10 por vez
  delayBetweenChecks: 15000, // 15s entre cada verificação
  delayBetweenBatches: 120000, // 2min entre lotes
  maxRetries: 3,
};

// ============================================================================
// FUNÇÕES
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getLeadsToCheck(limit: number = 280) {
  console.log(`\n📊 Buscando leads para verificação...`);

  const { data, error } = await supabase
    .from('instagram_leads')
    .select('id, username, follow_status, followed_at, last_check_notified_at')
    .eq('follow_status', 'followed')
    .order('followed_at', { ascending: true }) // Mais antigos primeiro
    .limit(limit);

  if (error) {
    console.error('❌ Erro ao buscar leads:', error);
    return [];
  }

  console.log(`✅ Encontrados ${data?.length || 0} leads para verificar`);
  return data || [];
}

async function checkFollowBack(lead: any, retryCount = 0): Promise<boolean> {
  try {
    console.log(`\n🔍 Verificando @${lead.username}...`);
    console.log(`   Seguindo desde: ${new Date(lead.followed_at).toLocaleDateString()}`);

    const response = await axios.post(
      `${API_BASE}/api/instagram/check-follow-back`,
      {
        lead_id: lead.id,
        username: lead.username,
        current_status: lead.follow_status,
        last_notified_at: lead.last_check_notified_at,
      },
      { timeout: 60000 }
    );

    if (!response.data.success) {
      throw new Error(response.data.message || 'Verificação falhou');
    }

    const result = response.data;

    // Atualizar banco de dados
    const { error } = await supabase
      .from('instagram_leads')
      .update({
        follow_status: result.follow_status,
        last_interaction_at: result.checked_at,
        last_check_notified_at: result.should_notify ? result.checked_at : lead.last_check_notified_at,
      })
      .eq('id', lead.id);

    if (error) {
      console.error(`   ❌ Erro ao atualizar BD:`, error.message);
    }

    if (result.followed_back) {
      console.log(`   🎉 SEGUIU DE VOLTA!`);
      console.log(`   ✅ Status atualizado: ${result.follow_status}`);
      return true;
    } else {
      console.log(`   ⏳ Ainda aguardando follow back`);
      return false;
    }

  } catch (error: any) {
    console.error(`   ❌ Erro ao verificar @${lead.username}:`);
    console.error(`      ${error.message}`);

    // Retry em caso de erro
    if (retryCount < CONFIG.maxRetries) {
      console.log(`   🔄 Tentando novamente (${retryCount + 1}/${CONFIG.maxRetries})...`);
      await sleep(5000); // Aguardar 5s antes de retry
      return checkFollowBack(lead, retryCount + 1);
    }

    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🚀 Verificação em Massa de Follow Backs');
  console.log('=========================================\n');
  console.log(`⚙️  Configuração:`);
  console.log(`   Tamanho do lote: ${CONFIG.batchSize}`);
  console.log(`   Delay entre checks: ${CONFIG.delayBetweenChecks / 1000}s`);
  console.log(`   Delay entre lotes: ${CONFIG.delayBetweenBatches / 1000}s`);
  console.log(`   Max retries: ${CONFIG.maxRetries}`);

  // Buscar todos os leads
  const leads = await getLeadsToCheck();

  if (leads.length === 0) {
    console.log('\n✅ Nenhum lead para verificar!');
    return;
  }

  // Dividir em lotes
  const batches: any[][] = [];
  for (let i = 0; i < leads.length; i += CONFIG.batchSize) {
    batches.push(leads.slice(i, i + CONFIG.batchSize));
  }

  console.log(`\n📦 Total de lotes: ${batches.length}`);
  console.log(`⏱️  Tempo estimado: ${Math.round((leads.length * CONFIG.delayBetweenChecks + batches.length * CONFIG.delayBetweenBatches) / 1000 / 60)} minutos\n`);

  let totalChecked = 0;
  let totalFollowedBack = 0;
  const followedBackList: string[] = [];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    if (!batch) continue;

    console.log(`\n📦 ===== LOTE ${batchIndex + 1}/${batches.length} =====`);
    console.log(`   Processando ${batch.length} leads...`);

    for (const lead of batch) {
      const followedBack = await checkFollowBack(lead);

      totalChecked++;

      if (followedBack) {
        totalFollowedBack++;
        followedBackList.push(lead.username);
      }

      // Delay entre verificações (exceto na última)
      if (totalChecked < leads.length) {
        console.log(`   ⏰ Aguardando ${CONFIG.delayBetweenChecks / 1000}s...`);
        await sleep(CONFIG.delayBetweenChecks);
      }
    }

    // Delay entre lotes (exceto no último)
    if (batchIndex < batches.length - 1) {
      console.log(`\n⏸️  Aguardando ${CONFIG.delayBetweenBatches / 1000}s antes do próximo lote...`);
      await sleep(CONFIG.delayBetweenBatches);
    }
  }

  // Relatório final
  console.log('\n\n📊 ===== RELATÓRIO FINAL =====');
  console.log(`✅ Total verificado: ${totalChecked}`);
  console.log(`🎉 Seguiram de volta: ${totalFollowedBack} (${Math.round((totalFollowedBack / totalChecked) * 100)}%)`);
  console.log(`⏳ Não seguiram: ${totalChecked - totalFollowedBack}`);

  if (followedBackList.length > 0) {
    console.log(`\n🎯 Leads que seguiram de volta:`);
    followedBackList.forEach((username, index) => {
      console.log(`   ${index + 1}. @${username}`);
    });
  }

  // Estatísticas atualizadas do banco
  const { data: stats } = await supabase
    .from('instagram_leads')
    .select('follow_status')
    .in('follow_status', ['followed', 'followed_back', 'unfollowed']);

  if (stats) {
    const counts = stats.reduce((acc: any, lead: any) => {
      acc[lead.follow_status] = (acc[lead.follow_status] || 0) + 1;
      return acc;
    }, {});

    console.log(`\n📈 Estatísticas Atualizadas:`);
    console.log(`   Seguindo: ${counts.followed || 0}`);
    console.log(`   Seguiram de volta: ${counts.followed_back || 0}`);
    console.log(`   Desseguidos: ${counts.unfollowed || 0}`);
  }

  console.log('\n✅ Processo concluído!');
}

main()
  .then(() => {
    console.log('\n👋 Finalizando...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });
