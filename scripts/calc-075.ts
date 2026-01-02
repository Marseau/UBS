import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function calc() {
  const { count } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true });

  const totalLeads = count!;
  const minDf075 = Math.ceil(totalLeads * 0.0075); // 0.75%
  const minDf1 = Math.ceil(totalLeads * 0.01);     // 1%

  console.log('Total leads:', totalLeads);
  console.log('');
  console.log('| Corte | min_df | Cálculo |');
  console.log('|-------|--------|---------|');
  console.log(`| 1.00% | ${minDf1}    | ${totalLeads} × 0.01 |`);
  console.log(`| 0.75% | ${minDf075}     | ${totalLeads} × 0.0075 |`);

  // Calcular hashtags e percentis para 0.75%
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
        HAVING COUNT(DISTINCT lead_id) >= ${minDf075}
      )
      SELECT
        COUNT(*) as total,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY unique_leads) as p50,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY unique_leads) as p90,
        MIN(unique_leads) as min_leads,
        MAX(unique_leads) as max_leads
      FROM freq
    `
  });

  const d = data![0];
  console.log('');
  console.log(`=== Com 0.75% (min_df=${minDf075}) ===`);
  console.log('Hashtags:', d.total);
  console.log('P50:', Math.round(d.p50));
  console.log('P90:', Math.round(d.p90));
  console.log('Min leads:', d.min_leads);
  console.log('Max leads:', d.max_leads);
}

calc();
