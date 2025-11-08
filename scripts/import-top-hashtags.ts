import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface HashtagRow {
  hashtag: string;
  frequency: number;
  percentage: number;
}

async function importTopHashtags() {
  console.log('📊 Importando Top 100 Hashtags para lead_search_terms...\n');

  // Ler CSV
  const csvPath = path.join(process.cwd(), 'top_100_hashtags.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');

  // Parse CSV (skip header)
  const lines = csvContent.trim().split('\n').slice(1);
  const hashtags: HashtagRow[] = lines.map(line => {
    const [hashtag, frequency, percentage] = line.split(',');
    return {
      hashtag: hashtag.trim(),
      frequency: parseInt(frequency.trim()),
      percentage: parseFloat(percentage.trim())
    };
  });

  console.log(`✅ Parsed ${hashtags.length} hashtags do CSV\n`);

  // Preparar dados para inserção
  const searchTermsData = hashtags.map((item, index) => ({
    categoria_geral: 'Dados Reais Instagram',
    area_especifica: 'Top 100 hashtags mais frequentes extraídas de 2.918 leads reais',
    target_segment: 'leads_reais_top_100',
    search_terms: [
      {
        termo: item.hashtag,
        hashtag: item.hashtag
      }
    ],
    generated_by_model: 'real_data_extraction',
    generation_prompt: `Hashtag extraída de ${item.frequency} leads reais (${item.percentage}% da base)`,
    generation_cost_usd: 0.0, // Zero custo - dados reais
    tokens_prompt: 0,
    tokens_completion: 0,
    tokens_total: 0
  }));

  console.log('🔄 Inserindo dados no Supabase...\n');

  // Inserir em lotes de 10 para evitar timeout
  const batchSize = 10;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < searchTermsData.length; i += batchSize) {
    const batch = searchTermsData.slice(i, i + batchSize);

    const { data, error } = await supabase
      .from('lead_search_terms')
      .insert(batch)
      .select();

    if (error) {
      console.error(`❌ Erro no lote ${Math.floor(i / batchSize) + 1}:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`✅ Lote ${Math.floor(i / batchSize) + 1}: ${batch.length} hashtags inseridas`);
    }
  }

  console.log('\n📈 RESUMO DA IMPORTAÇÃO:');
  console.log(`   ✅ Inseridas com sucesso: ${inserted}`);
  console.log(`   ❌ Erros: ${errors}`);
  console.log(`   📊 Total processado: ${hashtags.length}`);
  console.log('\n🎉 Importação concluída!\n');

  // Verificar total na tabela
  const { count } = await supabase
    .from('lead_search_terms')
    .select('*', { count: 'exact', head: true })
    .eq('generated_by_model', 'real_data_extraction');

  console.log(`📊 Total de registros "real_data_extraction" na tabela: ${count}\n`);
}

importTopHashtags().catch(console.error);
