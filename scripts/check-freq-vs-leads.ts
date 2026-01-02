import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data } = await supabase.rpc('execute_sql', {
    query_text: `
      WITH hashtag_normalized AS (
          SELECT
              LOWER(TRANSLATE(
                  REPLACE(hashtag, ' ', '_'),
                  'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                  'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
              )) as hashtag_clean,
              id as lead_id
          FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
          WHERE hashtags_bio IS NOT NULL
          UNION ALL
          SELECT
              LOWER(TRANSLATE(
                  REPLACE(hashtag, ' ', '_'),
                  'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                  'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
              )) as hashtag_clean,
              id as lead_id
          FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
          WHERE hashtags_posts IS NOT NULL
      ),
      hashtag_stats AS (
          SELECT
              hashtag_clean,
              COUNT(*) as frequency,
              COUNT(DISTINCT lead_id) as unique_leads
          FROM hashtag_normalized
          WHERE hashtag_clean IS NOT NULL AND hashtag_clean != ''
          GROUP BY hashtag_clean
          ORDER BY unique_leads DESC
          LIMIT 15
      )
      SELECT
          hashtag_clean,
          frequency,
          unique_leads,
          ROUND((frequency::numeric / unique_leads::numeric), 2) as ratio
      FROM hashtag_stats
    `
  });

  console.log('\nTop 15 hashtags por unique_leads:\n');
  console.log('| Hashtag                   | Frequency | Unique Leads | Ratio |');
  console.log('|---------------------------|-----------|--------------|-------|');
  data?.forEach((h: any) => {
    const tag = h.hashtag_clean.substring(0, 25).padEnd(25);
    const freq = String(h.frequency).padStart(9);
    const leads = String(h.unique_leads).padStart(12);
    const ratio = String(h.ratio).padStart(5);
    console.log(`| ${tag} | ${freq} | ${leads} | ${ratio} |`);
  });
}

check();
