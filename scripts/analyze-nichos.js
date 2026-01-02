const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function analyzeNiche(nicho) {
  const query = `
    WITH raw_hashtags AS (
      SELECT
        LOWER(TRANSLATE(h.hashtag, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')) as hashtag_norm,
        l.id as lead_id,
        (l.email IS NOT NULL OR l.phone IS NOT NULL) as has_contact
      FROM instagram_leads l
      CROSS JOIN LATERAL (
        SELECT jsonb_array_elements_text(l.hashtags_bio) as hashtag WHERE l.hashtags_bio IS NOT NULL
        UNION ALL
        SELECT jsonb_array_elements_text(l.hashtags_posts) as hashtag WHERE l.hashtags_posts IS NOT NULL
      ) h
      WHERE h.hashtag IS NOT NULL AND h.hashtag != ''
    ),
    filtered AS (
      SELECT * FROM raw_hashtags WHERE hashtag_norm LIKE '%${nicho}%'
    ),
    agg AS (
      SELECT
        hashtag_norm,
        COUNT(*) as freq,
        COUNT(DISTINCT lead_id) as unique_leads,
        COUNT(DISTINCT lead_id) FILTER (WHERE has_contact) as with_contact
      FROM filtered
      GROUP BY hashtag_norm
    )
    SELECT
      COUNT(*) as total_hashtags,
      COUNT(*) FILTER (WHERE freq >= 5) as freq5,
      COUNT(*) FILTER (WHERE unique_leads >= 3) as leads3,
      COALESCE(SUM(unique_leads), 0) as sum_leads,
      COALESCE(SUM(with_contact), 0) as sum_contact,
      ROUND(COALESCE(SUM(with_contact), 0)::numeric / NULLIF(SUM(unique_leads), 0)::numeric * 100, 1) as cr
    FROM agg
  `;

  const { data, error } = await supabase.rpc('execute_sql', { query_text: query });
  if (error) return null;
  return data[0];
}

async function main() {
  console.log('=== ANALISE DE VIABILIDADE DE NICHOS ===');
  console.log('BASE: 10.605 leads | 5.967 com contato (56.3%)');
  console.log('Criterios ATUAIS: freq>=5: 20 | leads>=3: 5 | total_leads: 100 | cr: 20%');
  console.log('');

  const nichos = [
    'marketingdigital', 'trafego', 'contabil', 'advogad', 'psicolog',
    'coach', 'nutri', 'estetic', 'unha', 'cabelo', 'maquiag', 'sobrancelha',
    'personal', 'fitness', 'pilates', 'yoga', 'fisio', 'dentist', 'medic'
  ];

  console.log('NICHO              | HASH | F5  | L3  | LEADS  | CR%   | STATUS');
  console.log('-------------------|------|-----|-----|--------|-------|-------');

  for (const nicho of nichos) {
    const s = await analyzeNiche(nicho);
    if (!s) {
      console.log(nicho.padEnd(18) + ' | ERRO');
      continue;
    }

    const f5 = parseInt(s.freq5 || 0);
    const l3 = parseInt(s.leads3 || 0);
    const tl = parseInt(s.sum_leads || 0);
    const cr = parseFloat(s.cr || 0);

    const viable = f5 >= 20 && l3 >= 5 && tl >= 100 && cr >= 20;
    const status = viable ? 'VIAVEL' : 'NAO';

    console.log(
      nicho.padEnd(18) + ' | ' +
      String(s.total_hashtags).padStart(4) + ' | ' +
      String(f5).padStart(3) + ' | ' +
      String(l3).padStart(3) + ' | ' +
      String(tl).padStart(6) + ' | ' +
      String(cr).padStart(5) + ' | ' +
      status
    );
  }
}

main().catch(console.error);
