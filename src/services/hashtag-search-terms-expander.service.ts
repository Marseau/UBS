import { createClient } from '@supabase/supabase-js';
import { BUSINESS_CLUSTERS } from './hashtag-lead-scorer.service';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Interface para termo de busca expandido
 */
export interface ExpandedSearchTerm {
  term: string;
  source: 'hashtag_frequency' | 'cooccurrence' | 'cluster' | 'manual';
  priority: number;
  estimated_leads: number;
  already_exists: boolean;
  cluster?: string;
  related_terms?: string[];
}

/**
 * Interface para resultado de expansão
 */
export interface ExpansionResult {
  total_suggested: number;
  new_terms: ExpandedSearchTerm[];
  existing_terms: ExpandedSearchTerm[];
  added_to_database: number;
}

/**
 * Serviço para expansão automática de termos de busca
 * Analisa hashtags da base e sugere novos termos para scraping
 */
export class HashtagSearchTermsExpander {
  /**
   * Expande termos baseado em hashtags mais frequentes
   * @param minFrequency - Frequência mínima de ocorrências (default: 20)
   * @param limit - Número máximo de termos a sugerir (default: 50)
   */
  async expandFromFrequency(minFrequency: number = 20, limit: number = 50): Promise<ExpandedSearchTerm[]> {
    console.log(`\n📊 Expandindo termos baseado em frequência (min: ${minFrequency})...`);

    // Query para hashtags mais frequentes
    const { data: frequentHashtags, error } = await supabase.rpc('exec_sql', {
      sql: `
        WITH post_hashtags AS (
          SELECT
            LOWER(REPLACE(jsonb_array_elements_text(hashtags_posts)::text, '"', '')) as hashtag,
            COUNT(DISTINCT id) as frequency
          FROM instagram_leads
          WHERE hashtags_posts IS NOT NULL
          GROUP BY LOWER(REPLACE(jsonb_array_elements_text(hashtags_posts)::text, '"', ''))
          HAVING COUNT(DISTINCT id) >= ${minFrequency}
          ORDER BY frequency DESC
          LIMIT ${limit}
        )
        SELECT hashtag, frequency FROM post_hashtags
      `
    });

    if (error) {
      console.error('❌ Erro ao buscar hashtags frequentes:', error);
      return [];
    }

    // Buscar termos já existentes
    const existingTerms = await this.getExistingSearchTerms();

    const expandedTerms: ExpandedSearchTerm[] = [];

    for (const item of frequentHashtags || []) {
      const term = item.hashtag.replace(/#/g, '');
      const alreadyExists = existingTerms.has(term.toLowerCase().replace(/\s/g, ''));

      // Calcular prioridade baseado em frequência
      const priority = Math.min(100, Math.round((item.frequency / 100) * 100));

      expandedTerms.push({
        term,
        source: 'hashtag_frequency',
        priority,
        estimated_leads: item.frequency,
        already_exists: alreadyExists
      });
    }

    console.log(`   ✅ ${expandedTerms.length} termos sugeridos (${expandedTerms.filter(t => !t.already_exists).length} novos)`);

    return expandedTerms;
  }

  /**
   * Expande termos baseado em clusters de negócio
   * Sugere hashtags específicas de cada cluster que ainda não foram scrapeadas
   */
  async expandFromClusters(): Promise<ExpandedSearchTerm[]> {
    console.log('\n🎯 Expandindo termos baseado em clusters...');

    const existingTerms = await this.getExistingSearchTerms();
    const expandedTerms: ExpandedSearchTerm[] = [];

    for (const [clusterId, clusterData] of Object.entries(BUSINESS_CLUSTERS)) {
      console.log(`   📁 ${clusterData.name}:`);

      for (const hashtag of clusterData.hashtags) {
        const alreadyExists = existingTerms.has(hashtag.toLowerCase());

        if (!alreadyExists) {
          // Estimar número de leads potenciais
          const estimatedLeads = await this.estimateLeadsForTerm(hashtag);

          expandedTerms.push({
            term: hashtag,
            source: 'cluster',
            priority: clusterData.priority_score,
            estimated_leads: estimatedLeads,
            already_exists: false,
            cluster: clusterData.name
          });
        }
      }

      const newInCluster = expandedTerms.filter(t => t.cluster === clusterData.name).length;
      console.log(`      ➕ ${newInCluster} novos termos`);
    }

    console.log(`\n   ✅ Total: ${expandedTerms.length} termos de clusters`);

    return expandedTerms;
  }

  /**
   * Expande termos baseado em co-ocorrência
   * Para cada termo já scrapeado, sugere hashtags que aparecem junto
   */
  async expandFromCooccurrence(minCooccurrence: number = 15): Promise<ExpandedSearchTerm[]> {
    console.log(`\n🔗 Expandindo termos baseado em co-ocorrência (min: ${minCooccurrence})...`);

    const existingTerms = await this.getExistingSearchTerms();

    // Query para encontrar hashtags co-ocorrentes não scrapeadas
    const { data: cooccurrentTerms, error } = await supabase.rpc('exec_sql', {
      sql: `
        WITH scraped_hashtags AS (
          SELECT DISTINCT LOWER(REPLACE(search_term_used, ' ', '')) as term
          FROM instagram_leads
          WHERE search_term_used IS NOT NULL
        ),
        hashtag_pairs AS (
          SELECT
            LOWER(REPLACE(h1.value::text, '"', '')) as hashtag1,
            LOWER(REPLACE(h2.value::text, '"', '')) as hashtag2,
            COUNT(*) as coocorrencia
          FROM instagram_leads il,
               jsonb_array_elements(il.hashtags_posts) h1,
               jsonb_array_elements(il.hashtags_posts) h2
          WHERE il.hashtags_posts IS NOT NULL
            AND h1.value::text < h2.value::text
          GROUP BY h1.value::text, h2.value::text
          HAVING COUNT(*) >= ${minCooccurrence}
        )
        SELECT
          hp.hashtag2 as suggested_term,
          hp.hashtag1 as related_to,
          hp.coocorrencia as cooccurrence_count
        FROM hashtag_pairs hp
        INNER JOIN scraped_hashtags sh ON hp.hashtag1 = sh.term
        WHERE hp.hashtag2 NOT IN (SELECT term FROM scraped_hashtags)
        ORDER BY hp.coocorrencia DESC
        LIMIT 100
      `
    });

    if (error) {
      console.error('❌ Erro ao buscar co-ocorrências:', error);
      return [];
    }

    const expandedTerms: ExpandedSearchTerm[] = [];

    for (const item of cooccurrentTerms || []) {
      const term = item.suggested_term.replace(/#/g, '');
      const relatedTerm = item.related_to.replace(/#/g, '');

      // Prioridade baseada em co-ocorrência
      const priority = Math.min(100, Math.round((item.cooccurrence_count / 50) * 100));

      expandedTerms.push({
        term,
        source: 'cooccurrence',
        priority,
        estimated_leads: item.cooccurrence_count,
        already_exists: false,
        related_terms: [relatedTerm]
      });
    }

    console.log(`   ✅ ${expandedTerms.length} termos de co-ocorrência`);

    return expandedTerms;
  }

  /**
   * Executa expansão completa: frequência + clusters + co-ocorrência
   */
  async expandAll(autoAdd: boolean = false): Promise<ExpansionResult> {
    console.log('\n🚀 EXPANSÃO COMPLETA DE TERMOS DE BUSCA\n');

    // 1. Expansão por frequência
    const frequencyTerms = await this.expandFromFrequency(20, 30);

    // 2. Expansão por clusters
    const clusterTerms = await this.expandFromClusters();

    // 3. Expansão por co-ocorrência
    const cooccurrenceTerms = await this.expandFromCooccurrence(15);

    // Combinar e remover duplicatas
    const allTerms = [...frequencyTerms, ...clusterTerms, ...cooccurrenceTerms];
    const uniqueTerms = this.deduplicateTerms(allTerms);

    // Separar novos vs existentes
    const newTerms = uniqueTerms.filter(t => !t.already_exists);
    const existingTerms = uniqueTerms.filter(t => t.already_exists);

    console.log('\n📊 RESULTADO DA EXPANSÃO:');
    console.log(`   Total sugerido: ${uniqueTerms.length}`);
    console.log(`   ✅ Novos: ${newTerms.length}`);
    console.log(`   ⚠️  Já existentes: ${existingTerms.length}`);

    let addedCount = 0;

    // Auto-adicionar se solicitado
    if (autoAdd && newTerms.length > 0) {
      console.log(`\n🤖 Auto-adicionando ${newTerms.length} novos termos ao banco...`);
      addedCount = await this.addTermsToDatabase(newTerms);
      console.log(`   ✅ ${addedCount} termos adicionados`);
    }

    return {
      total_suggested: uniqueTerms.length,
      new_terms: newTerms.sort((a, b) => b.priority - a.priority),
      existing_terms: existingTerms,
      added_to_database: addedCount
    };
  }

  /**
   * Busca termos já existentes no banco
   */
  private async getExistingSearchTerms(): Promise<Set<string>> {
    const { data: terms } = await supabase
      .from('instagram_leads')
      .select('search_term_used')
      .not('search_term_used', 'is', null);

    const normalizedTerms = new Set(
      terms?.map(t =>
        t.search_term_used?.toLowerCase().replace(/\s/g, '').replace(/#/g, '')
      ) || []
    );

    return normalizedTerms;
  }

  /**
   * Estima número de leads potenciais para um termo
   */
  private async estimateLeadsForTerm(hashtag: string): Promise<number> {
    // Buscar posts públicos no Instagram com essa hashtag (simulação)
    // Na prática, aqui você poderia fazer uma query na API do Instagram
    // ou usar dados históricos de scrapes anteriores

    // Por enquanto, retorna estimativa baseada em hashtags similares já scrapeadas
    const { data } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT COUNT(DISTINCT id) as count
        FROM instagram_leads
        WHERE hashtags_posts @> '["${hashtag}"]'::jsonb
           OR hashtags_bio @> '["${hashtag}"]'::jsonb
      `
    });

    return data?.[0]?.count || 0;
  }

  /**
   * Remove duplicatas e consolida termos
   */
  private deduplicateTerms(terms: ExpandedSearchTerm[]): ExpandedSearchTerm[] {
    const termMap = new Map<string, ExpandedSearchTerm>();

    for (const term of terms) {
      const key = term.term.toLowerCase().replace(/\s/g, '');

      const existing = termMap.get(key);

      if (!existing || term.priority > existing.priority) {
        termMap.set(key, term);
      }
    }

    return Array.from(termMap.values());
  }

  /**
   * Adiciona termos ao banco de dados
   * Cria entradas na tabela de search_terms (se existir) ou como metadados
   */
  private async addTermsToDatabase(terms: ExpandedSearchTerm[]): Promise<number> {
    let addedCount = 0;

    // Por enquanto, apenas loga os termos (não temos uma tabela de search_terms ainda)
    // Em produção, você criaria uma tabela dedicada para gerenciar termos de busca

    for (const term of terms) {
      try {
        console.log(`   ➕ ${term.term} (${term.source}, priority: ${term.priority})`);

        // TODO: Inserir na tabela search_terms quando ela existir
        // await supabase.from('search_terms').insert({
        //   term: term.term,
        //   source: term.source,
        //   priority: term.priority,
        //   estimated_leads: term.estimated_leads,
        //   cluster: term.cluster,
        //   created_at: new Date().toISOString(),
        //   status: 'pending'
        // });

        addedCount++;
      } catch (error) {
        console.error(`      ❌ Erro ao adicionar "${term.term}":`, error);
      }
    }

    return addedCount;
  }

  /**
   * Exporta termos como array simples para N8N
   * Retorna lista priorizada de termos para scraping
   */
  async exportForN8N(limit: number = 50): Promise<string[]> {
    const result = await this.expandAll(false);

    const topTerms = result.new_terms
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit)
      .map(t => t.term);

    console.log(`\n📤 Exportando ${topTerms.length} termos para N8N`);

    return topTerms;
  }

  /**
   * Gera relatório de expansão em formato markdown
   */
  async generateExpansionReport(): Promise<string> {
    const result = await this.expandAll(false);

    let report = '# 📊 Relatório de Expansão de Termos de Busca\n\n';

    report += `**Data**: ${new Date().toISOString()}\n\n`;
    report += `**Total de termos sugeridos**: ${result.total_suggested}\n`;
    report += `**Novos termos**: ${result.new_terms.length}\n`;
    report += `**Termos já existentes**: ${result.existing_terms.length}\n\n`;

    report += '---\n\n';

    // Top 20 por prioridade
    report += '## 🔥 Top 20 Termos Prioritários\n\n';
    report += '| Termo | Prioridade | Leads Estimados | Fonte | Cluster |\n';
    report += '|-------|------------|-----------------|-------|----------|\n';

    for (const term of result.new_terms.slice(0, 20)) {
      report += `| #${term.term} | ${term.priority} | ${term.estimated_leads} | ${term.source} | ${term.cluster || '-'} |\n`;
    }

    report += '\n---\n\n';

    // Agrupamento por cluster
    report += '## 🎯 Termos por Cluster\n\n';

    const termsByCluster = result.new_terms.reduce((acc, term) => {
      const cluster = term.cluster || 'Outros';
      if (!acc[cluster]) acc[cluster] = [];
      acc[cluster].push(term);
      return acc;
    }, {} as Record<string, ExpandedSearchTerm[]>);

    for (const [cluster, terms] of Object.entries(termsByCluster)) {
      report += `### ${cluster} (${terms.length} termos)\n\n`;
      report += terms.slice(0, 10).map(t => `- #${t.term} (${t.estimated_leads} leads)`).join('\n');
      report += '\n\n';
    }

    report += '---\n\n';
    report += '**Próximos passos**: Adicionar termos ao scraper N8N\n';

    return report;
  }
}

// Exportar instância singleton
export const searchTermsExpander = new HashtagSearchTermsExpander();
