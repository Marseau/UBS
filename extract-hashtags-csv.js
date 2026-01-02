/**
 * Script para extrair top 100 hashtags mais frequentes
 * e gerar arquivo CSV
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Carregar variáveis de ambiente
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function extractHashtags() {
  console.log('🔍 Extraindo top 100 hashtags de bio + posts...\n');

  try {
    // Query SQL direta
    console.log('⚠️  Executando query SQL direta...\n');

    const query = `
        WITH hashtags_bio AS (
          SELECT
            UNNEST(hashtags_bio) as hashtag,
            'bio' as source
          FROM instagram_leads
          WHERE hashtags_bio IS NOT NULL
        ),
        hashtags_posts AS (
          SELECT
            UNNEST(hashtags_posts) as hashtag,
            'posts' as source
          FROM instagram_leads
          WHERE hashtags_posts IS NOT NULL
        ),
        all_hashtags AS (
          SELECT hashtag, source FROM hashtags_bio
          UNION ALL
          SELECT hashtag, source FROM hashtags_posts
        ),
        hashtag_frequency AS (
          SELECT
            hashtag,
            COUNT(*) as frequency,
            COUNT(CASE WHEN source = 'bio' THEN 1 END) as freq_bio,
            COUNT(CASE WHEN source = 'posts' THEN 1 END) as freq_posts
          FROM all_hashtags
          GROUP BY hashtag
          ORDER BY frequency DESC
          LIMIT 100
        )
        SELECT
          ROW_NUMBER() OVER (ORDER BY frequency DESC) as ranking,
          hashtag,
          frequency as total_frequency,
          freq_bio as frequency_in_bio,
          freq_posts as frequency_in_posts,
          ROUND((freq_bio::NUMERIC / NULLIF(frequency, 0) * 100), 1) as pct_bio,
          ROUND((freq_posts::NUMERIC / NULLIF(frequency, 0) * 100), 1) as pct_posts
        FROM hashtag_frequency
        ORDER BY frequency DESC
      `;

    const { data, error } = await supabase.rpc('exec_sql', { query });

    if (error) {
      console.error('❌ Erro ao executar query:', error);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.log('⚠️  Nenhuma hashtag encontrada no banco de dados');
      process.exit(0);
    }

    console.log(`✅ ${data.length} hashtags extraídas\n`);

    // Gerar CSV
    const csvHeader = 'Ranking,Hashtag,Frequência Total,Freq. Bio,Freq. Posts,% Bio,% Posts\n';
    const csvRows = data.map(row =>
      `${row.ranking},"#${row.hashtag}",${row.total_frequency},${row.frequency_in_bio},${row.frequency_in_posts},${row.pct_bio}%,${row.pct_posts}%`
    ).join('\n');

    const csvContent = csvHeader + csvRows;
    const outputPath = path.join(__dirname, 'top_100_hashtags.csv');

    fs.writeFileSync(outputPath, csvContent, 'utf8');

    console.log(`✅ CSV gerado com sucesso!`);
    console.log(`📄 Arquivo: ${outputPath}\n`);

    // Mostrar preview das top 10
    console.log('📊 Preview Top 10:\n');
    console.log('Rank | Hashtag                    | Freq. Total | Bio | Posts');
    console.log('-----|----------------------------|-------------|-----|------');
    data.slice(0, 10).forEach(row => {
      const hashtag = `#${row.hashtag}`.padEnd(25);
      console.log(
        `${String(row.ranking).padStart(4)} | ${hashtag} | ${String(row.total_frequency).padStart(11)} | ${String(row.frequency_in_bio).padStart(3)} | ${String(row.frequency_in_posts).padStart(5)}`
      );
    });

    console.log(`\n📈 Total de hashtags únicas: ${data.length}`);
    console.log(`🔥 Hashtag mais frequente: #${data[0].hashtag} (${data[0].total_frequency}x)`);

  } catch (err) {
    console.error('❌ Erro ao extrair hashtags:', err);
    process.exit(1);
  }
}

// Executar
extractHashtags();
