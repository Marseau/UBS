import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function analyzeExecution() {
  console.log('🔍 ANÁLISE DA EXECUÇÃO #43521\n');
  console.log('Período: 2025-10-22 23:08:11 até 23:57:55 (49 minutos)\n');

  // 1. Buscar a session criada durante essa execução
  console.log('📋 SESSIONS CRIADAS NO PERÍODO:\n');
  const { data: sessions, error: sessionsError } = await supabase
    .from('instagram_scraping_sessions')
    .select('*')
    .gte('started_at', '2025-10-22 23:08:00')
    .lte('started_at', '2025-10-22 23:10:00')
    .order('started_at', { ascending: false });

  if (sessionsError) {
    console.error('❌ Erro:', sessionsError);
    return;
  }

  console.log(`Total de sessions encontradas: ${sessions?.length || 0}\n`);
  sessions?.forEach(session => {
    console.log(`Session ID: ${session.id}`);
    console.log(`  Segment: ${session.segment}`);
    console.log(`  Status: ${session.status}`);
    console.log(`  Terms Processed: ${session.terms_processed}`);
    console.log(`  Leads Found: ${session.leads_found}`);
    console.log(`  Started: ${session.started_at}`);
    console.log(`  Completed: ${session.completed_at}`);
    console.log(`  Duration: ${session.duration_seconds}s`);
    console.log('');
  });

  // 2. Analisar os search terms usados
  console.log('\n🎯 SEARCH TERMS UTILIZADOS:\n');
  const { data: leads, error: leadsError } = await supabase
    .from('instagram_leads')
    .select('search_term_used, created_at')
    .gte('created_at', '2025-10-22 23:08:00')
    .lte('created_at', '2025-10-22 23:58:00')
    .order('created_at', { ascending: true });

  if (leadsError) {
    console.error('❌ Erro:', leadsError);
    return;
  }

  // Agrupar por search_term
  const termCounts = new Map<string, { count: number, first: string, last: string }>();
  leads?.forEach(lead => {
    const term = lead.search_term_used;
    if (!termCounts.has(term)) {
      termCounts.set(term, { count: 0, first: lead.created_at, last: lead.created_at });
    }
    const existing = termCounts.get(term)!;
    existing.count++;
    existing.last = lead.created_at;
  });

  console.log('Search terms processados em ordem cronológica:\n');
  const termsArray = Array.from(termCounts.entries()).map(([term, data]) => ({
    term,
    ...data
  }));

  termsArray.forEach((item, index) => {
    console.log(`${index + 1}. "${item.term}" - ${item.count} leads`);
    console.log(`   Primeiro: ${item.first}`);
    console.log(`   Último: ${item.last}`);
    console.log('');
  });

  // 3. Verificar o último lead capturado
  console.log('\n⏰ ÚLTIMO LEAD CAPTURADO:\n');
  const lastLead = leads?.[leads.length - 1];
  if (lastLead) {
    console.log(`Search term: ${lastLead.search_term_used}`);
    console.log(`Timestamp: ${lastLead.created_at}`);
    console.log('');
  }

  // 4. Verificar se há logs de erro no período
  console.log('\n📊 RESUMO:\n');
  console.log(`Total de leads capturados: ${leads?.length || 0}`);
  console.log(`Total de search terms distintos: ${termCounts.size}`);
  console.log(`Search terms no array original: 70`);
  console.log(`Search terms NÃO processados: ${70 - termCounts.size}`);
  console.log('');

  // 5. Listar os search terms que DEVERIAM ter sido processados mas não foram
  const { data: allTerms, error: allTermsError } = await supabase
    .from('lead_search_terms')
    .select('search_terms')
    .eq('target_segment', 'marketing_digital_gestao_de_trafego_pago')
    .single();

  if (!allTermsError && allTerms) {
    const processedTerms = Array.from(termCounts.keys());
    const allSearchTerms = allTerms.search_terms as string[];
    const notProcessed = allSearchTerms.filter(term => !processedTerms.includes(term));

    console.log('\n❌ SEARCH TERMS NÃO PROCESSADOS:\n');
    console.log(`Total: ${notProcessed.length}\n`);
    notProcessed.slice(0, 20).forEach((term, index) => {
      console.log(`${index + 1}. ${term}`);
    });
    if (notProcessed.length > 20) {
      console.log(`... e mais ${notProcessed.length - 20} termos`);
    }
  }
}

analyzeExecution();
