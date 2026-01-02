import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function calculate() {
  const { count } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true });

  const totalLeads = count!;
  console.log('\n📊 Total de leads:', totalLeads);
  console.log('\n| % | min_df | Hashtags | P50 | P90 |');
  console.log('|---|--------|----------|-----|-----|');

  for (const pct of [0.01, 0.005, 0.003, 0.002, 0.001]) {
    const minDf = Math.ceil(totalLeads * pct);

    const { data } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH hashtag_normalized AS (
          SELECT
            LOWER(TRANSLATE(hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) as hashtag_clean
          FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
          WHERE hashtags_bio IS NOT NULL
          UNION ALL
          SELECT
            LOWER(TRANSLATE(hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) as hashtag_clean
          FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
          WHERE hashtags_posts IS NOT NULL
        ),
        freq AS (
          SELECT hashtag_clean, COUNT(*) as frequency
          FROM hashtag_normalized
          WHERE hashtag_clean IS NOT NULL AND hashtag_clean != ''
          GROUP BY hashtag_clean
          HAVING COUNT(*) >= ${minDf}
        )
        SELECT
          COUNT(*) as total,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY frequency) as p50,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY frequency) as p90
        FROM freq
      `
    });

    const d = data![0];
    console.log(`| ${(pct*100).toFixed(1)}% | ${minDf} | ${d.total} | ${Math.round(d.p50)} | ${Math.round(d.p90)} |`);
  }
}

calculate();
