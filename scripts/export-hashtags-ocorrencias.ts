import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function exportOcorrencias() {
  console.log('\n🚀 Exportando todas as 103.759 ocorrências de hashtags...\n');

  const filePath = './hashtags_ocorrencias.csv';
  const header = 'hashtag,source,lead_id,has_contact\n';
  fs.writeFileSync(filePath, header);

  let totalRecords = 0;
  const batchSize = 10000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error } = await supabase.rpc('execute_sql', {
      query_text: `
        SELECT
          hashtag,
          source,
          lead_id,
          has_contact
        FROM (
          SELECT
            jsonb_array_elements_text(hashtags_bio) as hashtag,
            'bio' as source,
            id as lead_id,
            (email IS NOT NULL OR phone IS NOT NULL) as has_contact
          FROM instagram_leads
          WHERE hashtags_bio IS NOT NULL
          UNION ALL
          SELECT
            jsonb_array_elements_text(hashtags_posts) as hashtag,
            'posts' as source,
            id as lead_id,
            (email IS NOT NULL OR phone IS NOT NULL) as has_contact
          FROM instagram_leads
          WHERE hashtags_posts IS NOT NULL
        ) t
        WHERE hashtag IS NOT NULL AND hashtag != ''
        ORDER BY lead_id, source, hashtag
        LIMIT ${batchSize} OFFSET ${offset}
      `
    });

    if (error) {
      console.error('❌ Erro:', error);
      throw error;
    }

    if (!batch || batch.length === 0) {
      hasMore = false;
      break;
    }

    const csvLines = batch.map((row: any) => {
      const safeHashtag = (row.hashtag || '').replace(/[",\n\r]/g, '');
      return `${safeHashtag},${row.source},${row.lead_id},${row.has_contact}`;
    }).join('\n') + '\n';

    fs.appendFileSync(filePath, csvLines);

    totalRecords += batch.length;
    offset += batchSize;

    console.log(`   ✓ Processados ${totalRecords.toLocaleString()} registros...`);

    if (batch.length < batchSize) {
      hasMore = false;
    }
  }

  const stats = fs.statSync(filePath);
  console.log('\n✅ Export concluído!');
  console.log(`   📁 Arquivo: ${filePath}`);
  console.log(`   📊 Total de ocorrências: ${totalRecords.toLocaleString()}`);
  console.log(`   💾 Tamanho: ${Math.round(stats.size / 1024).toLocaleString()} KB`);
}

exportOcorrencias().catch(console.error);
