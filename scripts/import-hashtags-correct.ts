import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface HashtagData {
  hashtag: string;
  frequency: number;
  percentage: number;
  qualification_rate?: number;
  hybrid_score?: number;
  qualified_frequency?: number;
}

async function importHashtagsCorrect() {
  console.log('🔧 CORREÇÃO: Importando hashtags no formato correto\n');
  console.log('='  .repeat(80));

  // 1. Deletar registros errados (50 linhas separadas)
  console.log('🗑️  Deletando importação incorreta (50 registros separados)...');
  const { error: deleteError } = await supabase
    .from('lead_search_terms')
    .delete()
    .eq('generated_by_model', 'real_data_extraction_v2');

  if (deleteError) {
    console.error('❌ Erro ao deletar:', deleteError.message);
  } else {
    console.log('✅ Registros incorretos removidos\n');
  }

  // 2. Ler CSV Top 100 (todas as leads)
  console.log('📊 Lendo Top 100 (todas as leads)...');
  const csv100 = fs.readFileSync(path.join(process.cwd(), 'top_100_hashtags.csv'), 'utf-8');
  const lines100 = csv100.trim().split('\n').slice(1); // Skip header

  const top100: HashtagData[] = lines100.map(line => {
    const [hashtag, frequency, percentage] = line.split(',');
    return {
      hashtag: hashtag.trim(),
      frequency: parseInt(frequency.trim()),
      percentage: parseFloat(percentage.trim())
    };
  });

  console.log(`✅ ${top100.length} hashtags carregadas do Top 100\n`);

  // 3. Ler CSV Top 50 (leads qualificados)
  console.log('📊 Lendo Top 50 Otimizado (leads qualificados)...');
  const csv50 = fs.readFileSync(path.join(process.cwd(), 'top_100_hashtags_qualified.csv'), 'utf-8');
  const lines50 = csv50.trim().split('\n').slice(1); // Skip header

  const top50: HashtagData[] = lines50.map(line => {
    const [hashtag, frequency, percentage] = line.split(',');
    return {
      hashtag: hashtag.trim(),
      qualified_frequency: parseInt(frequency.trim()),
      percentage: parseFloat(percentage.trim())
    };
  });

  console.log(`✅ ${top50.length} hashtags carregadas do Top 50 Otimizado\n`);

  // 4. Criar registro Top 100 (1 linha com 100 pares)
  console.log('💾 Criando registro Top 100 (1 linha com 100 pares)...');

  const top100Record = {
    categoria_geral: 'Dados Reais Instagram - Top 100',
    area_especifica: 'Top 100 hashtags mais frequentes extraídas de 2.918 leads reais',
    target_segment: 'leads_reais_top_100',
    search_terms: top100.map(item => ({
      termo: item.hashtag,
      hashtag: item.hashtag
    })),
    generated_by_model: 'real_data_extraction',
    generation_prompt: `Top 100 hashtags baseadas em dados reais. Frequência total: ${top100.reduce((sum, h) => sum + h.frequency, 0)} menções em 2.918 leads.`,
    generation_cost_usd: 0.0,
    tokens_prompt: 0,
    tokens_completion: 0,
    tokens_total: 0
  };

  const { error: error100 } = await supabase
    .from('lead_search_terms')
    .insert([top100Record]);

  if (error100) {
    console.error('❌ Erro ao inserir Top 100:', error100.message);
  } else {
    console.log('✅ Top 100 inserido com sucesso (1 registro, 100 pares)\n');
  }

  // 5. Criar registro Top 50 Otimizado (1 linha com 50 pares)
  console.log('💾 Criando registro Top 50 Otimizado (1 linha com 50 pares)...');

  const top50Record = {
    categoria_geral: 'Dados Reais Instagram - Top 50 Otimizado',
    area_especifica: 'Top 50 hashtags com melhor taxa de qualificação (leads com email/telefone)',
    target_segment: 'leads_qualificados_top_50',
    search_terms: top50.map(item => ({
      termo: item.hashtag,
      hashtag: item.hashtag
    })),
    generated_by_model: 'real_data_extraction_v2',
    generation_prompt: `Top 50 hashtags otimizadas por taxa de qualificação. Total: ${top50.reduce((sum, h) => sum + h.qualified_frequency!, 0)} menções em 1.489 leads qualificados (50.9% da base).`,
    generation_cost_usd: 0.0,
    tokens_prompt: 0,
    tokens_completion: 0,
    tokens_total: 0
  };

  const { error: error50 } = await supabase
    .from('lead_search_terms')
    .insert([top50Record]);

  if (error50) {
    console.error('❌ Erro ao inserir Top 50:', error50.message);
  } else {
    console.log('✅ Top 50 Otimizado inserido com sucesso (1 registro, 50 pares)\n');
  }

  // 6. Verificar resultado
  console.log('='  .repeat(80));
  console.log('📊 VERIFICAÇÃO FINAL:\n');

  const { data: check100 } = await supabase
    .from('lead_search_terms')
    .select('categoria_geral, search_terms')
    .eq('generated_by_model', 'real_data_extraction')
    .single();

  if (check100) {
    console.log(`✅ Top 100: ${check100.search_terms.length} pares termo/hashtag`);
  }

  const { data: check50 } = await supabase
    .from('lead_search_terms')
    .select('categoria_geral, search_terms')
    .eq('generated_by_model', 'real_data_extraction_v2')
    .single();

  if (check50) {
    console.log(`✅ Top 50 Otimizado: ${check50.search_terms.length} pares termo/hashtag`);
  }

  console.log('\n🎉 Importação corrigida com sucesso!\n');
  console.log('📋 Resultado:');
  console.log('   • 2 registros na tabela lead_search_terms');
  console.log('   • 1 registro com 100 pares (Top 100 - todas as leads)');
  console.log('   • 1 registro com 50 pares (Top 50 - leads qualificados)');
  console.log('');
}

importHashtagsCorrect().catch(console.error);
