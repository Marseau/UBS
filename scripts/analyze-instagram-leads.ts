import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function analyzeInstagramLeads() {
  console.log('🔍 ========== ANÁLISE INSTAGRAM LEADS ==========\n');

  // 1. Estrutura da tabela
  console.log('📊 1. ESTRUTURA DA TABELA\n');
  const { data: sample, error: sampleError } = await supabase
    .from('instagram_leads')
    .select('*')
    .limit(1);

  if (sampleError) {
    console.error('❌ Erro ao buscar amostra:', sampleError);
    return;
  }

  if (sample && sample.length > 0) {
    console.log('Colunas disponíveis:', Object.keys(sample[0]).join(', '));
    console.log();
  }

  // 2. Total de leads
  const { count: totalLeads, error: countError } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true });

  console.log(`📈 Total de leads: ${totalLeads}\n`);

  // 3. Termos que mais geraram leads (assumindo que existe campo search_term ou hashtag)
  console.log('🏆 TOP TERMOS QUE MAIS GERARAM LEADS\n');

  // Vamos tentar diferentes campos possíveis
  const possibleFields = ['search_term', 'hashtag', 'termo_busca', 'query', 'search_query'];

  for (const field of possibleFields) {
    try {
      const { data: termStats, error } = await supabase.rpc('get_lead_stats_by_term', {
        field_name: field
      });

      if (!error && termStats && termStats.length > 0) {
        console.log(`Campo encontrado: ${field}`);
        termStats.slice(0, 20).forEach((stat: any, index: number) => {
          console.log(`${index + 1}. ${stat.term}: ${stat.count} leads`);
        });
        break;
      }
    } catch (e) {
      // Tentar próximo campo
    }
  }

  // Se não encontrou função RPC, fazer query manual
  // Vamos buscar todos os leads e agrupar por termo no código
  console.log('\n📊 Buscando todos os leads para análise (paginando)...');

  let allLeads: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error: leadsError } = await supabase
      .from('instagram_leads')
      .select('username, search_term_used, search_term_id, id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (leadsError) {
      console.error('❌ Erro ao buscar leads:', leadsError);
      return;
    }

    if (!pageData || pageData.length === 0) {
      hasMore = false;
    } else {
      allLeads = allLeads.concat(pageData);
      console.log(`   📄 Página ${page + 1}: ${pageData.length} leads (total: ${allLeads.length})`);
      page++;

      // Se retornou menos que pageSize, não tem mais páginas
      if (pageData.length < pageSize) {
        hasMore = false;
      }
    }
  }

  if (allLeads.length === 0) {
    console.log('⚠️ Nenhum lead encontrado');
    return;
  }

  console.log(`\n✅ ${allLeads.length} leads carregados\n`);

  // Análise de termos
  const termLeadCount = new Map<string, number>();
  const termPostCount = new Map<string, Set<string>>();

  allLeads.forEach((lead: any) => {
    // Usar o campo correto: search_term_used
    const term = lead.search_term_used || 'sem_termo';

    const postId = lead.username; // Usar username como identificador único de "post" (perfil)

    // Contar leads por termo
    termLeadCount.set(term, (termLeadCount.get(term) || 0) + 1);

    // Contar perfis únicos por termo
    if (!termPostCount.has(term)) {
      termPostCount.set(term, new Set());
    }
    if (postId) {
      termPostCount.get(term)!.add(postId);
    }
  });

  // TOP TERMOS POR LEADS
  console.log('🏆 TOP 20 TERMOS QUE MAIS GERARAM LEADS:\n');
  const topLeadTerms = Array.from(termLeadCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  topLeadTerms.forEach(([term, count], index) => {
    console.log(`${index + 1}. ${term}: ${count} leads`);
  });

  // TOP 100 TERMOS POR POSTS
  console.log('\n\n📱 TOP 100 TERMOS QUE MAIS GERARAM POSTS:\n');
  const topPostTerms = Array.from(termPostCount.entries())
    .map(([term, postSet]) => ({ term, postCount: postSet.size }))
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, 100);

  topPostTerms.forEach(({ term, postCount }, index) => {
    console.log(`${index + 1}. ${term}: ${postCount} posts`);
  });

  // Estatísticas gerais
  console.log('\n\n📊 ESTATÍSTICAS GERAIS:\n');
  console.log(`Total de termos únicos: ${termLeadCount.size}`);
  console.log(`Média de leads por termo: ${(allLeads.length / termLeadCount.size).toFixed(2)}`);
  console.log(`Termo com mais leads: ${topLeadTerms[0]?.[0]} (${topLeadTerms[0]?.[1]} leads)`);
  console.log(`Termo com mais posts: ${topPostTerms[0]?.term} (${topPostTerms[0]?.postCount} posts)`);

  // Salvar resultados em arquivo
  const results = {
    timestamp: new Date().toISOString(),
    totalLeads: allLeads.length,
    totalTerms: termLeadCount.size,
    top20LeadTerms: topLeadTerms.map(([term, count]) => ({ term, leads: count })),
    top100PostTerms: topPostTerms
  };

  const fs = await import('fs');
  fs.writeFileSync(
    '/tmp/instagram-leads-analysis.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n✅ Análise salva em: /tmp/instagram-leads-analysis.json');
}

analyzeInstagramLeads().catch(console.error);
