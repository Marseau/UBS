/**
 * Script de Análise da Tabela editorial_content
 * Objetivo: Verificar estrutura atual e comparar com linha editorial proposta
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function analyzeEditorialContentTable() {
  console.log('📊 ========== ANÁLISE DA TABELA editorial_content ==========\n');

  // 1. Obter dados de amostra diretamente (estratégia simples e confiável)
  console.log('🔍 Obtendo estrutura da tabela...\n');

  const { data: sampleData, error: sampleError } = await supabase
    .from('editorial_content')
    .select('*')
    .limit(1);

  if (sampleError) {
    console.error('❌ Erro ao obter amostra:', sampleError);
    return;
  }

  console.log('✅ Campos encontrados na tabela editorial_content:\n');
  if (sampleData && sampleData.length > 0) {
    const fields = Object.keys(sampleData[0]);
    fields.forEach((field, index) => {
      console.log(`  ${index + 1}. ${field}`);
    });
    console.log(`\n📊 Total de campos: ${fields.length}\n`);
  } else {
    console.log('⚠️  Tabela vazia, não é possível inferir estrutura');
    return;
  }

  // 3. Obter dados de exemplo
  const { data: multipleData, error: dataError } = await supabase
    .from('editorial_content')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  if (dataError) {
    console.error('❌ Erro ao obter dados:', dataError);
  } else {
    console.log('📝 Últimos 3 registros criados:\n');
    multipleData?.forEach((record: any, index: number) => {
      console.log(`\n  [${index + 1}] ID: ${record.id}`);
      console.log(`      Week: ${record.week_number}/${record.year}`);
      console.log(`      Theme: ${record.main_theme || record.theme || 'N/A'}`);
      console.log(`      Status: ${record.status || 'N/A'}`);
      console.log(`      Created: ${record.created_at}`);
    });
  }

  console.log('\n\n🎯 ========== ANÁLISE DE CONSISTÊNCIA ==========\n');

  // 4. Verificar campos críticos baseado nas migrações
  const expectedFields = {
    'Campos Base': [
      'id',
      'week_number',
      'year',
      'main_theme',
      'status',
      'created_at',
      'updated_at'
    ],
    'Campos de Métricas LLM (Migration 012)': [
      'llm_model',
      'llm_prompt_tokens',
      'llm_completion_tokens',
      'llm_total_tokens',
      'llm_cost_usd',
      'llm_generation_time_ms',
      'llm_temperature'
    ],
    'Campo de Custo API (Migration 013)': [
      'api_cost_usd'
    ],
    'Campos de Aprovação (Migration 015)': [
      'approved_for_x',
      'approved_for_instagram',
      'approved_for_youtube',
      'approved_by',
      'approved_at',
      'rejected',
      'rejection_reason',
      'published_x',
      'published_instagram',
      'published_youtube'
    ],
    'Campos de Mídia (Migration 016)': [
      'instagram_reel_url',
      'youtube_video_url',
      'instagram_thumbnail_url',
      'youtube_thumbnail_url',
      'media_generated_at',
      'media_generation_status'
    ],
    'Campos Dual Persona (Migration 017)': [
      'carla_script',
      'bruno_script',
      'carla_video_url',
      'bruno_video_url',
      'merged_video_url',
      'persona_format',
      'carla_video_status',
      'bruno_video_status',
      'merged_video_status'
    ],
    'Campos YouTube Short (Migration 017)': [
      'youtube_short_url',
      'youtube_caption',
      'youtube_short_duration_seconds',
      'related_reel_ids'
    ]
  };

  const allFields = sampleData && sampleData.length > 0 ? Object.keys(sampleData[0]) : [];

  Object.entries(expectedFields).forEach(([category, fields]) => {
    console.log(`\n📦 ${category}:`);
    fields.forEach((field) => {
      const exists = allFields.includes(field);
      console.log(`  ${exists ? '✅' : '❌'} ${field}`);
    });
  });

  console.log('\n\n🚨 ========== PROBLEMAS IDENTIFICADOS ==========\n');

  // 5. Identificar campos faltantes críticos
  const criticalMissingFields = [
    'twitter_thread_1',
    'twitter_thread_2',
    'twitter_thread_3',
    'twitter_publication_schedule',
    'twitter_publication_status',
    'instagram_caption',
    'instagram_hashtags',
    'audio_name',
    'sub_theme'
  ];

  const missingFields = criticalMissingFields.filter(field => !allFields.includes(field));

  if (missingFields.length > 0) {
    console.log('❌ Campos faltantes para linha editorial completa:\n');
    missingFields.forEach(field => {
      console.log(`  - ${field}`);
    });
  } else {
    console.log('✅ Todos os campos críticos estão presentes!');
  }

  console.log('\n\n💡 ========== RECOMENDAÇÕES ==========\n');

  console.log(`
1. 📝 FALTAM CAMPOS DE TWITTER:
   - twitter_thread_1 (JSONB): Array de 7 tweets da Thread 1
   - twitter_thread_2 (JSONB): Array de 7 tweets da Thread 2
   - twitter_thread_3 (JSONB): Array de 7 tweets da Thread 3
   - twitter_publication_schedule (JSONB): Horários agendados para cada tweet
   - twitter_publication_status (TEXT): 'pending', 'scheduled', 'published', 'failed'
   - twitter_metrics (JSONB): Likes, retweets, impressions

2. 📝 FALTAM CAMPOS DE INSTAGRAM:
   - instagram_caption (TEXT): Caption do Reel
   - instagram_hashtags (TEXT[]): Array de hashtags
   - instagram_publication_status (TEXT): Status de publicação
   - instagram_metrics (JSONB): Visualizações, likes, comments

3. 📝 FALTAM CAMPOS ORGANIZACIONAIS:
   - audio_name (TEXT): Nome do áudio trending usado
   - sub_theme (TEXT): Sub-tema específico do dia/reel
   - content_type (TEXT): 'anatomy_pain', 'failed_attempts', 'solution_principles'

4. 🔄 TABELA ESTÁ FRAGMENTADA:
   - Múltiplas migrações adicionaram campos sem planejamento
   - Falta de consistência na nomenclatura
   - Campos duplicados (migration 016 tem 2 versões)

5. ✅ SOLUÇÃO PROPOSTA:
   - Criar migration unificada de refatoração
   - Remover campos duplicados/obsoletos
   - Adicionar campos faltantes
   - Normalizar nomenclatura
  `);

  console.log('\n========================================\n');
}

analyzeEditorialContentTable()
  .then(() => {
    console.log('✅ Análise concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro na análise:', error);
    process.exit(1);
  });
