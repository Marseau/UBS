const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data, error } = await supabase
    .from('instagram_hashtag_variations')
    .select('parent_hashtag, hashtag, post_count, post_count_formatted, priority_score, volume_category, last_scraped_at, scrape_count, leads_found, discovered_at')
    .eq('parent_hashtag', 'empreendedorismo')
    .order('priority_score', { ascending: false });

  if (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('❌ Nenhuma variação encontrada para #empreendedorismo');
    process.exit(0);
  }

  console.log('\n✅ Variações de #empreendedorismo persistidas no banco:\n');
  console.log('Hashtag'.padEnd(30) + ' | ' + 'Volume'.padEnd(18) + ' | Score | Categoria | Scrapes | Leads');
  console.log('-'.repeat(95));

  data.forEach(row => {
    const hashtag = '#' + row.hashtag;
    const volume = row.post_count_formatted || 'N/A';
    const score = String(row.priority_score);
    const category = row.volume_category || 'N/A';
    const scrapes = String(row.scrape_count || 0);
    const leads = String(row.leads_found || 0);

    console.log(
      hashtag.padEnd(30) + ' | ' +
      volume.padEnd(18) + ' | ' +
      score.padEnd(6) + '| ' +
      category.padEnd(9) + ' | ' +
      scrapes.padEnd(7) + ' | ' +
      leads
    );
  });

  console.log('\n📊 Total de variações descobertas: ' + data.length);
  console.log('🎯 Prioritárias (score ≥ 80): ' + data.filter(r => r.priority_score >= 80).length);
})();
