/**
 * Script para normalizar todas as hashtags existentes no banco de dados
 *
 * Execução: npx ts-node scripts/run-normalize-hashtags.ts
 *
 * O script:
 * 1. Busca todos os leads com hashtags_bio ou hashtags_posts
 * 2. Normaliza cada hashtag (remove acentos, lowercase)
 * 3. Remove duplicatas resultantes
 * 4. Atualiza o banco em batches
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Mesma função de normalização do utils
function normalizeHashtag(hashtag: string): string {
  if (!hashtag) return '';

  let normalized = hashtag.startsWith('#') ? hashtag.substring(1) : hashtag;

  const accentMap: Record<string, string> = {
    'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'ç': 'c', 'ñ': 'n',
    'Á': 'a', 'À': 'a', 'Â': 'a', 'Ã': 'a', 'Ä': 'a', 'Å': 'a',
    'É': 'e', 'È': 'e', 'Ê': 'e', 'Ë': 'e',
    'Í': 'i', 'Ì': 'i', 'Î': 'i', 'Ï': 'i',
    'Ó': 'o', 'Ò': 'o', 'Ô': 'o', 'Õ': 'o', 'Ö': 'o',
    'Ú': 'u', 'Ù': 'u', 'Û': 'u', 'Ü': 'u',
    'Ç': 'c', 'Ñ': 'n'
  };

  normalized = normalized.split('').map(char => accentMap[char] || char).join('');
  normalized = normalized.toLowerCase();
  normalized = normalized.replace(/[^a-z0-9_]/g, '');

  return normalized;
}

function normalizeHashtagArray(hashtags: string[]): string[] {
  if (!hashtags || !Array.isArray(hashtags)) return [];

  const normalized = hashtags
    .map(h => normalizeHashtag(h))
    .filter(h => h.length > 0);

  // Remove duplicatas
  return [...new Set(normalized)];
}

async function normalizeLeadsHashtags() {
  console.log('\n🚀 Iniciando normalização de hashtags...\n');

  const batchSize = 500;
  let offset = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let hasMore = true;

  while (hasMore) {
    // Buscar batch de leads
    const { data: leads, error } = await supabase
      .from('instagram_leads')
      .select('id, hashtags_bio, hashtags_posts')
      .or('hashtags_bio.not.is.null,hashtags_posts.not.is.null')
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('❌ Erro ao buscar leads:', error);
      break;
    }

    if (!leads || leads.length === 0) {
      hasMore = false;
      break;
    }

    // Processar cada lead
    for (const lead of leads) {
      let needsUpdate = false;
      const updates: any = {};

      // Normalizar hashtags_bio
      if (lead.hashtags_bio && Array.isArray(lead.hashtags_bio)) {
        const originalBio = JSON.stringify(lead.hashtags_bio);
        const normalizedBio = normalizeHashtagArray(lead.hashtags_bio);
        const normalizedBioStr = JSON.stringify(normalizedBio);

        if (originalBio !== normalizedBioStr) {
          updates.hashtags_bio = normalizedBio;
          needsUpdate = true;
        }
      }

      // Normalizar hashtags_posts
      if (lead.hashtags_posts && Array.isArray(lead.hashtags_posts)) {
        const originalPosts = JSON.stringify(lead.hashtags_posts);
        const normalizedPosts = normalizeHashtagArray(lead.hashtags_posts);
        const normalizedPostsStr = JSON.stringify(normalizedPosts);

        if (originalPosts !== normalizedPostsStr) {
          updates.hashtags_posts = normalizedPosts;
          needsUpdate = true;
        }
      }

      // Atualizar se necessário
      if (needsUpdate) {
        const { error: updateError } = await supabase
          .from('instagram_leads')
          .update(updates)
          .eq('id', lead.id);

        if (updateError) {
          console.error(`   ⚠️  Erro ao atualizar lead ${lead.id}:`, updateError.message);
        } else {
          totalUpdated++;
        }
      }

      totalProcessed++;
    }

    offset += batchSize;
    console.log(`   ✅ Processados ${totalProcessed} leads (${totalUpdated} atualizados)...`);

    if (leads.length < batchSize) {
      hasMore = false;
    }
  }

  console.log(`\n✅ Normalização concluída!`);
  console.log(`   📊 Total processados: ${totalProcessed}`);
  console.log(`   🔄 Total atualizados: ${totalUpdated}`);
}

async function normalizeHashtagVariations() {
  console.log('\n🔄 Normalizando tabela instagram_hashtag_variations...\n');

  const { data: variations, error } = await supabase
    .from('instagram_hashtag_variations')
    .select('id, hashtag')
    .limit(10000);

  if (error) {
    console.error('❌ Erro ao buscar variations:', error);
    return;
  }

  if (!variations || variations.length === 0) {
    console.log('   ℹ️  Nenhuma variação encontrada');
    return;
  }

  let updated = 0;

  for (const variation of variations) {
    const normalized = normalizeHashtag(variation.hashtag);

    if (normalized !== variation.hashtag) {
      const { error: updateError } = await supabase
        .from('instagram_hashtag_variations')
        .update({ hashtag: normalized })
        .eq('id', variation.id);

      if (!updateError) {
        updated++;
      }
    }
  }

  console.log(`   ✅ Variações atualizadas: ${updated}/${variations.length}`);
}

async function showStats() {
  console.log('\n📊 Estatísticas pós-normalização:\n');

  // Contar hashtags únicas
  const { data: stats } = await supabase.rpc('execute_sql', {
    query_text: `
      SELECT
        'hashtags_bio' as campo,
        COUNT(DISTINCT hashtag) as hashtags_unicas
      FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
      WHERE hashtags_bio IS NOT NULL
      UNION ALL
      SELECT
        'hashtags_posts' as campo,
        COUNT(DISTINCT hashtag) as hashtags_unicas
      FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
      WHERE hashtags_posts IS NOT NULL
    `
  });

  if (stats) {
    console.log('   Hashtags únicas:');
    stats.forEach((s: any) => {
      console.log(`   - ${s.campo}: ${s.hashtags_unicas}`);
    });
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  NORMALIZAÇÃO DE HASHTAGS - Instagram Leads');
  console.log('═══════════════════════════════════════════════════');

  await normalizeLeadsHashtags();
  await normalizeHashtagVariations();
  await showStats();

  console.log('\n✅ Processo finalizado!\n');
}

main().catch(console.error);
