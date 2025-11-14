/**
 * Script de Limpeza: Instagram Leads com Baixo Engajamento
 *
 * Remove perfis que TÊM followers_count informado E são < 250
 * Preserva registros com followers_count NULL (serão processados pela API)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function cleanLowFollowers() {
  console.log('\n🧹 ========== LIMPEZA DE LEADS COM BAIXO ENGAJAMENTO ==========\n');

  try {
    // 1. CONTAR quantos leads serão deletados
    console.log('📊 Contando leads com followers_count < 250...');

    const { count: totalToDelete, error: countError } = await supabase
      .from('instagram_leads')
      .select('*', { count: 'exact', head: true })
      .not('followers_count', 'is', null)
      .lt('followers_count', 250);

    if (countError) {
      console.error('❌ Erro ao contar:', countError);
      process.exit(1);
    }

    console.log(`   Total de leads a deletar: ${totalToDelete}`);

    if (totalToDelete === 0) {
      console.log('\n✅ Nenhum lead para deletar. Base já está limpa!\n');
      process.exit(0);
    }

    // 2. MOSTRAR ALGUNS EXEMPLOS antes de deletar
    console.log('\n📋 Exemplos de leads que serão deletados:');

    const { data: examples, error: examplesError } = await supabase
      .from('instagram_leads')
      .select('username, followers_count, full_name')
      .not('followers_count', 'is', null)
      .lt('followers_count', 250)
      .order('followers_count', { ascending: false })
      .limit(10);

    if (!examplesError && examples) {
      examples.forEach((lead, i) => {
        console.log(`   ${i + 1}. @${lead.username} - ${lead.followers_count} followers - ${lead.full_name || 'N/A'}`);
      });

      if (totalToDelete && totalToDelete > 10) {
        console.log(`   ... e mais ${totalToDelete - 10} leads`);
      }
    }

    // 3. AVISO (sem confirmação para execução automática)
    console.log(`\n⚠️  ATENÇÃO: ${totalToDelete} leads serão DELETADOS PERMANENTEMENTE!`);
    console.log('   Critério: followers_count IS NOT NULL AND followers_count < 250');
    console.log('   Leads com followers_count NULL serão PRESERVADOS.\n');

    // 4. EXECUTAR DELEÇÃO
    console.log('🗑️  Deletando leads...');

    const { error: deleteError, count: deletedCount } = await supabase
      .from('instagram_leads')
      .delete({ count: 'exact' })
      .not('followers_count', 'is', null)
      .lt('followers_count', 250);

    if (deleteError) {
      console.error('❌ Erro ao deletar:', deleteError);
      process.exit(1);
    }

    console.log(`\n✅ Limpeza concluída!`);
    console.log(`   ${deletedCount} leads deletados com sucesso`);

    // 5. ESTATÍSTICAS FINAIS
    const { count: totalRemaining } = await supabase
      .from('instagram_leads')
      .select('*', { count: 'exact', head: true });

    const { count: nullFollowers } = await supabase
      .from('instagram_leads')
      .select('*', { count: 'exact', head: true })
      .is('followers_count', null);

    console.log(`\n📊 Estatísticas pós-limpeza:`);
    console.log(`   Total de leads restantes: ${totalRemaining}`);
    console.log(`   Leads com followers_count NULL: ${nullFollowers} (serão processados pela API)`);
    console.log(`   Leads qualificados (>= 250 followers): ${(totalRemaining || 0) - (nullFollowers || 0)}`);

    console.log('\n🎉 ========== LIMPEZA FINALIZADA ==========\n');

  } catch (error: any) {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  }
}

// Executar
cleanLowFollowers();
