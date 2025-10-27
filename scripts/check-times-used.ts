import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTimesUsed() {
  console.log('🔍 VERIFICANDO STATUS DO times_used:\n');

  // Query para verificar todos os segmentos
  const { data, error } = await supabase
    .from('lead_search_terms')
    .select('id, target_segment, times_used, search_terms')
    .order('target_segment', { ascending: true });

  if (error) {
    console.error('❌ Erro:', error);
    return;
  }

  console.log('📊 STATUS DE TODOS OS SEGMENTOS:\n');
  data?.forEach(segment => {
    const totalTermos = Array.isArray(segment.search_terms)
      ? segment.search_terms.length
      : 0;

    console.log(`Segmento: ${segment.target_segment}`);
    console.log(`  times_used: ${segment.times_used}`);
    console.log(`  total_termos: ${totalTermos}`);
    console.log('');
  });

  // Query específica para o segmento que foi processado
  console.log('\n🎯 DETALHES DO SEGMENTO PROCESSADO (marketing_digital):\n');

  const { data: marketing, error: marketingError } = await supabase
    .from('lead_search_terms')
    .select('*')
    .eq('target_segment', 'marketing_digital_gestao_de_trafego_pago')
    .single();

  if (marketingError) {
    console.error('❌ Erro ao buscar marketing_digital:', marketingError);
    return;
  }

  console.log(JSON.stringify(marketing, null, 2));

  // Verificar quantos leads foram capturados do segmento marketing_digital
  console.log('\n📈 LEADS CAPTURADOS DO SEGMENTO marketing_digital:\n');

  const { data: leads, error: leadsError } = await supabase
    .from('instagram_leads')
    .select('id, username, search_term_used, created_at')
    .eq('segment', 'marketing_digital_gestao_de_trafego_pago')
    .gte('created_at', '2025-10-22 23:00:00')
    .order('created_at', { ascending: false });

  if (leadsError) {
    console.error('❌ Erro ao buscar leads:', leadsError);
    return;
  }

  console.log(`Total de leads capturados: ${leads?.length || 0}`);
  console.log(`Search terms usados: ${[...new Set(leads?.map(l => l.search_term_used))].join(', ')}`);
}

checkTimesUsed();
