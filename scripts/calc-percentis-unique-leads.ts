import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function calculate() {
  // Obter total de leads
  const { count } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true });

  const totalLeads = count!;
  console.log('\n📊 Total de leads:', totalLeads);
  console.log('\n=== Análise com UNIQUE_LEADS (Document Frequency real) ===\n');
  console.log('| % leads | min_df | Hashtags | P50 | P90 |');
  console.log('|---------|--------|----------|-----|-----|');

  for (const pct of [0.01, 0.005, 0.003, 0.002, 0.001]) {
    const minDf = Math.ceil(totalLeads * pct);

    const { data } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH hashtag_normalized AS (
          SELECT
            LOWER(TRANSLATE(hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) as hashtag_clean,
            id as lead_id
          FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
          WHERE hashtags_bio IS NOT NULL
          UNION ALL
          SELECT
            LOWER(TRANSLATE(hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) as hashtag_clean,
            id as lead_id
          FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
          WHERE hashtags_posts IS NOT NULL
        ),
        freq AS (
          SELECT hashtag_clean, COUNT(DISTINCT lead_id) as unique_leads
          FROM hashtag_normalized
          WHERE hashtag_clean IS NOT NULL AND hashtag_clean != ''
          GROUP BY hashtag_clean
          HAVING COUNT(DISTINCT lead_id) >= ${minDf}
        )
        SELECT
          COUNT(*) as total,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY unique_leads) as p50,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY unique_leads) as p90
        FROM freq
      `
    });

    const d = data![0];
    const p50 = d.p50 ? Math.round(d.p50) : 0;
    const p90 = d.p90 ? Math.round(d.p90) : 0;
    console.log(`| ${(pct*100).toFixed(1)}%     | ${String(minDf).padStart(6)} | ${String(d.total).padStart(8)} | ${String(p50).padStart(3)} | ${String(p90).padStart(3)} |`);
  }

  console.log('\n=== Interpretação ===');
  console.log('min_df = Hashtag deve aparecer em pelo menos X leads (Document Frequency)');
  console.log('P50 = Metade das hashtags filtradas têm unique_leads >= este valor');
  console.log('P90 = 10% das hashtags filtradas têm unique_leads >= este valor (top hashtags)');
}

calculate();
