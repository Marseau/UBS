import { createClient } from '@supabase/supabase-js';
import { BUSINESS_CLUSTERS } from './hashtag-lead-scorer.service';
import { searchTermsExpander } from './hashtag-search-terms-expander.service';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Interface para registro na tabela lead_search_terms
 */
export interface LeadSearchTermsEntry {
  target_segment: string;
  categoria_geral: string;
  area_especifica: string;
  search_terms: Array<{ termo: string; hashtag: string }>;
  terms_count: number;
  generated_by_model: string;
  generation_prompt: string;
  quality_score?: number;
}

/**
 * Resultado da população da tabela
 */
export interface PopulationResult {
  success: boolean;
  entries_created: number;
  entries_updated: number;
  entries_skipped: number;
  total_terms_added: number;
  entries: Array<{
    id: string;
    target_segment: string;
    terms_count: number;
  }>;
}

/**
 * Serviço para popular a tabela lead_search_terms com dados de hashtag intelligence
 */
export class LeadSearchTermsPopulator {
  /**
   * Popula tabela com dados dos 5 clusters identificados
   * Cada cluster vira um registro na tabela
   */
  async populateFromClusters(): Promise<PopulationResult> {
    console.log('\n🎯 Populando lead_search_terms com dados dos clusters...\n');

    const entries: LeadSearchTermsEntry[] = [];
    const result: PopulationResult = {
      success: true,
      entries_created: 0,
      entries_updated: 0,
      entries_skipped: 0,
      total_terms_added: 0,
      entries: []
    };

    // Iterar sobre cada cluster
    for (const [clusterId, clusterData] of Object.entries(BUSINESS_CLUSTERS)) {
      console.log(`📁 Processando cluster: ${clusterData.name}...`);

      // Criar array de termos no formato da tabela
      const searchTerms = clusterData.hashtags.map(hashtag => ({
        termo: hashtag,
        hashtag: hashtag
      }));

      const entry: LeadSearchTermsEntry = {
        target_segment: `cluster_${clusterId}`,
        categoria_geral: 'Hashtag Intelligence - Clusters de Negócio',
        area_especifica: `${clusterData.name} - Taxa de contato: ${Math.round(clusterData.avg_contact_rate * 100)}%`,
        search_terms: searchTerms,
        terms_count: searchTerms.length,
        generated_by_model: 'hashtag-intelligence-system-v1',
        generation_prompt: `Cluster "${clusterData.name}" identificado automaticamente via análise de 26.210 hashtags únicas de 5.794 leads. Priority score: ${clusterData.priority_score}`,
        quality_score: clusterData.priority_score
      };

      entries.push(entry);
    }

    // Inserir ou atualizar entradas no banco
    for (const entry of entries) {
      try {
        // Verificar se já existe
        const { data: existing } = await supabase
          .from('lead_search_terms')
          .select('id')
          .eq('target_segment', entry.target_segment)
          .single();

        if (existing) {
          // Atualizar existente
          const { error } = await supabase
            .from('lead_search_terms')
            .update({
              search_terms: entry.search_terms,
              terms_count: entry.terms_count,
              area_especifica: entry.area_especifica,
              quality_score: entry.quality_score,
              generated_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          if (error) throw error;

          console.log(`   ✅ Atualizado: ${entry.target_segment} (${entry.terms_count} termos)`);
          result.entries_updated++;
          result.total_terms_added += entry.terms_count;
          result.entries.push({
            id: existing.id,
            target_segment: entry.target_segment,
            terms_count: entry.terms_count
          });
        } else {
          // Criar novo
          const { data: created, error } = await supabase
            .from('lead_search_terms')
            .insert(entry)
            .select('id')
            .single();

          if (error) throw error;

          console.log(`   ✅ Criado: ${entry.target_segment} (${entry.terms_count} termos)`);
          result.entries_created++;
          result.total_terms_added += entry.terms_count;
          result.entries.push({
            id: created!.id,
            target_segment: entry.target_segment,
            terms_count: entry.terms_count
          });
        }
      } catch (error: any) {
        console.error(`   ❌ Erro em ${entry.target_segment}:`, error.message);
        result.entries_skipped++;
      }
    }

    console.log(`\n✅ Conclusão:`);
    console.log(`   Criados: ${result.entries_created}`);
    console.log(`   Atualizados: ${result.entries_updated}`);
    console.log(`   Pulados: ${result.entries_skipped}`);
    console.log(`   Total de termos: ${result.total_terms_added}`);

    return result;
  }

  /**
   * Popula com top hashtags por frequência
   * Cria entradas segmentadas por faixa de frequência
   */
  async populateFromTopHashtags(tiers: Array<{ min: number; max: number; limit: number }> = [
    { min: 100, max: 999999, limit: 30 }, // Alta frequência
    { min: 50, max: 99, limit: 40 },      // Média frequência
    { min: 20, max: 49, limit: 50 }       // Baixa frequência
  ]): Promise<PopulationResult> {
    console.log('\n📊 Populando lead_search_terms com top hashtags por frequência...\n');

    const result: PopulationResult = {
      success: true,
      entries_created: 0,
      entries_updated: 0,
      entries_skipped: 0,
      total_terms_added: 0,
      entries: []
    };

    for (const tier of tiers) {
      console.log(`📈 Tier: ${tier.min}-${tier.max} ocorrências (top ${tier.limit})...`);

      // Query para buscar hashtags nessa faixa
      const { data: hashtags } = await supabase.rpc('exec_sql', {
        sql: `
          WITH post_hashtags AS (
            SELECT
              LOWER(REPLACE(jsonb_array_elements_text(hashtags_posts)::text, '"', '')) as hashtag,
              COUNT(DISTINCT id) as frequency
            FROM instagram_leads
            WHERE hashtags_posts IS NOT NULL
            GROUP BY LOWER(REPLACE(jsonb_array_elements_text(hashtags_posts)::text, '"', ''))
            HAVING COUNT(DISTINCT id) >= ${tier.min} AND COUNT(DISTINCT id) <= ${tier.max}
            ORDER BY frequency DESC
            LIMIT ${tier.limit}
          )
          SELECT hashtag, frequency FROM post_hashtags
        `
      });

      if (!hashtags || hashtags.length === 0) {
        console.log(`   ⚠️  Nenhuma hashtag encontrada nessa faixa`);
        continue;
      }

      // Criar array de termos
      const searchTerms = hashtags.map((h: any) => ({
        termo: h.hashtag.replace(/#/g, ''),
        hashtag: h.hashtag.replace(/#/g, '')
      }));

      const tierName = tier.min >= 100 ? 'alta' : tier.min >= 50 ? 'media' : 'baixa';

      const entry: LeadSearchTermsEntry = {
        target_segment: `hashtags_frequencia_${tierName}`,
        categoria_geral: 'Hashtag Intelligence - Por Frequência',
        area_especifica: `Hashtags com ${tier.min}-${tier.max} ocorrências na base (Top ${tier.limit})`,
        search_terms: searchTerms,
        terms_count: searchTerms.length,
        generated_by_model: 'hashtag-intelligence-system-v1',
        generation_prompt: `Top ${tier.limit} hashtags com ${tier.min}-${tier.max} ocorrências. Fonte: análise de 26.210 hashtags únicas.`,
        quality_score: tier.min >= 100 ? 90 : tier.min >= 50 ? 75 : 60
      };

      try {
        // Verificar se já existe
        const { data: existing } = await supabase
          .from('lead_search_terms')
          .select('id')
          .eq('target_segment', entry.target_segment)
          .single();

        if (existing) {
          // Atualizar
          await supabase
            .from('lead_search_terms')
            .update({
              search_terms: entry.search_terms,
              terms_count: entry.terms_count,
              generated_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          console.log(`   ✅ Atualizado: ${entry.target_segment} (${entry.terms_count} termos)`);
          result.entries_updated++;
          result.total_terms_added += entry.terms_count;
          result.entries.push({
            id: existing.id,
            target_segment: entry.target_segment,
            terms_count: entry.terms_count
          });
        } else {
          // Criar
          const { data: created } = await supabase
            .from('lead_search_terms')
            .insert(entry)
            .select('id')
            .single();

          console.log(`   ✅ Criado: ${entry.target_segment} (${entry.terms_count} termos)`);
          result.entries_created++;
          result.total_terms_added += entry.terms_count;
          result.entries.push({
            id: created!.id,
            target_segment: entry.target_segment,
            terms_count: entry.terms_count
          });
        }
      } catch (error: any) {
        console.error(`   ❌ Erro:`, error.message);
        result.entries_skipped++;
      }
    }

    console.log(`\n✅ Conclusão:`);
    console.log(`   Criados: ${result.entries_created}`);
    console.log(`   Atualizados: ${result.entries_updated}`);
    console.log(`   Total de termos: ${result.total_terms_added}`);

    return result;
  }

  /**
   * Popula com hashtags premium (melhor taxa de contato)
   * Cria entrada com hashtags que têm >65% de taxa de contato
   */
  async populateFromPremiumHashtags(minContactRate: number = 65, minLeads: number = 20): Promise<PopulationResult> {
    console.log('\n💎 Populando lead_search_terms com hashtags premium...\n');

    const result: PopulationResult = {
      success: true,
      entries_created: 0,
      entries_updated: 0,
      entries_skipped: 0,
      total_terms_added: 0,
      entries: []
    };

    // Query para buscar hashtags premium
    const { data: premiumHashtags } = await supabase.rpc('exec_sql', {
      sql: `
        WITH post_hashtags AS (
          SELECT
            il.id,
            il.email,
            il.phone,
            LOWER(REPLACE(jsonb_array_elements_text(il.hashtags_posts)::text, '"', '')) as hashtag
          FROM instagram_leads il
          WHERE il.hashtags_posts IS NOT NULL
        )
        SELECT
          hashtag,
          COUNT(*) as total_leads,
          COUNT(CASE WHEN email IS NOT NULL OR phone IS NOT NULL THEN 1 END) as leads_com_contato,
          ROUND(AVG(CASE WHEN email IS NOT NULL OR phone IS NOT NULL THEN 100 ELSE 0 END), 1) as perc_com_contato
        FROM post_hashtags
        GROUP BY hashtag
        HAVING
          COUNT(*) >= ${minLeads}
          AND AVG(CASE WHEN email IS NOT NULL OR phone IS NOT NULL THEN 100 ELSE 0 END) >= ${minContactRate}
        ORDER BY perc_com_contato DESC, total_leads DESC
        LIMIT 50
      `
    });

    if (!premiumHashtags || premiumHashtags.length === 0) {
      console.log('   ⚠️  Nenhuma hashtag premium encontrada');
      return result;
    }

    console.log(`   ✅ ${premiumHashtags.length} hashtags premium encontradas`);

    // Criar array de termos
    const searchTerms = premiumHashtags.map((h: any) => ({
      termo: h.hashtag.replace(/#/g, ''),
      hashtag: h.hashtag.replace(/#/g, '')
    }));

    const entry: LeadSearchTermsEntry = {
      target_segment: 'hashtags_premium_alta_qualidade',
      categoria_geral: 'Hashtag Intelligence - Premium',
      area_especifica: `Hashtags com >${minContactRate}% de taxa de contato (mínimo ${minLeads} leads)`,
      search_terms: searchTerms,
      terms_count: searchTerms.length,
      generated_by_model: 'hashtag-intelligence-system-v1',
      generation_prompt: `Hashtags premium: >${minContactRate}% de leads com email/telefone. Ideal para priorizar scraping de alta qualidade.`,
      quality_score: 100
    };

    try {
      // Verificar se já existe
      const { data: existing } = await supabase
        .from('lead_search_terms')
        .select('id')
        .eq('target_segment', entry.target_segment)
        .single();

      if (existing) {
        // Atualizar
        await supabase
          .from('lead_search_terms')
          .update({
            search_terms: entry.search_terms,
            terms_count: entry.terms_count,
            generated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        console.log(`   ✅ Atualizado: ${entry.target_segment} (${entry.terms_count} termos)`);
        result.entries_updated++;
        result.total_terms_added += entry.terms_count;
        result.entries.push({
          id: existing.id,
          target_segment: entry.target_segment,
          terms_count: entry.terms_count
        });
      } else {
        // Criar
        const { data: created } = await supabase
          .from('lead_search_terms')
          .insert(entry)
          .select('id')
          .single();

        console.log(`   ✅ Criado: ${entry.target_segment} (${entry.terms_count} termos)`);
        result.entries_created++;
        result.total_terms_added += entry.terms_count;
        result.entries.push({
          id: created!.id,
          target_segment: entry.target_segment,
          terms_count: entry.terms_count
        });
      }
    } catch (error: any) {
      console.error(`   ❌ Erro:`, error.message);
      result.entries_skipped++;
    }

    return result;
  }

  /**
   * Popula com expansão automática de termos
   * Usa o sistema de expansão para descobrir novos termos inexplorados
   */
  async populateFromExpansion(limit: number = 100): Promise<PopulationResult> {
    console.log('\n🚀 Populando lead_search_terms com expansão automática...\n');

    const result: PopulationResult = {
      success: true,
      entries_created: 0,
      entries_updated: 0,
      entries_skipped: 0,
      total_terms_added: 0,
      entries: []
    };

    // Executar expansão completa
    const expansion = await searchTermsExpander.expandAll(false);

    console.log(`   📊 Expansão retornou ${expansion.new_terms.length} novos termos`);

    // Pegar top termos por prioridade
    const topTerms = expansion.new_terms
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);

    // Criar array de termos
    const searchTerms = topTerms.map(t => ({
      termo: t.term,
      hashtag: t.term
    }));

    const entry: LeadSearchTermsEntry = {
      target_segment: 'hashtags_expansao_automatica',
      categoria_geral: 'Hashtag Intelligence - Expansão Automática',
      area_especifica: `Top ${limit} termos descobertos via análise de co-ocorrência e frequência`,
      search_terms: searchTerms,
      terms_count: searchTerms.length,
      generated_by_model: 'hashtag-intelligence-system-v1',
      generation_prompt: `Expansão automática via 3 estratégias: frequência + clusters + co-ocorrência. Fonte: 26.210 hashtags únicas.`,
      quality_score: 85
    };

    try {
      // Verificar se já existe
      const { data: existing } = await supabase
        .from('lead_search_terms')
        .select('id')
        .eq('target_segment', entry.target_segment)
        .single();

      if (existing) {
        // Atualizar
        await supabase
          .from('lead_search_terms')
          .update({
            search_terms: entry.search_terms,
            terms_count: entry.terms_count,
            generated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        console.log(`   ✅ Atualizado: ${entry.target_segment} (${entry.terms_count} termos)`);
        result.entries_updated++;
        result.total_terms_added += entry.terms_count;
        result.entries.push({
          id: existing.id,
          target_segment: entry.target_segment,
          terms_count: entry.terms_count
        });
      } else {
        // Criar
        const { data: created } = await supabase
          .from('lead_search_terms')
          .insert(entry)
          .select('id')
          .single();

        console.log(`   ✅ Criado: ${entry.target_segment} (${entry.terms_count} termos)`);
        result.entries_created++;
        result.total_terms_added += entry.terms_count;
        result.entries.push({
          id: created!.id,
          target_segment: entry.target_segment,
          terms_count: entry.terms_count
        });
      }
    } catch (error: any) {
      console.error(`   ❌ Erro:`, error.message);
      result.entries_skipped++;
    }

    return result;
  }

  /**
   * População completa: executa todas as estratégias
   */
  async populateAll(): Promise<{
    success: boolean;
    total_entries_created: number;
    total_entries_updated: number;
    total_terms_added: number;
    results: {
      clusters: PopulationResult;
      frequency: PopulationResult;
      premium: PopulationResult;
      expansion: PopulationResult;
    };
  }> {
    console.log('\n🎯 POPULAÇÃO COMPLETA DA TABELA lead_search_terms\n');
    console.log('═'.repeat(60));

    const results = {
      clusters: await this.populateFromClusters(),
      frequency: await this.populateFromTopHashtags(),
      premium: await this.populateFromPremiumHashtags(),
      expansion: await this.populateFromExpansion()
    };

    const totalCreated =
      results.clusters.entries_created +
      results.frequency.entries_created +
      results.premium.entries_created +
      results.expansion.entries_created;

    const totalUpdated =
      results.clusters.entries_updated +
      results.frequency.entries_updated +
      results.premium.entries_updated +
      results.expansion.entries_updated;

    const totalTerms =
      results.clusters.total_terms_added +
      results.frequency.total_terms_added +
      results.premium.total_terms_added +
      results.expansion.total_terms_added;

    console.log('\n' + '═'.repeat(60));
    console.log('📊 RESULTADO FINAL:');
    console.log(`   ✅ Total de entradas criadas: ${totalCreated}`);
    console.log(`   🔄 Total de entradas atualizadas: ${totalUpdated}`);
    console.log(`   📈 Total de termos adicionados: ${totalTerms}`);
    console.log('═'.repeat(60) + '\n');

    return {
      success: true,
      total_entries_created: totalCreated,
      total_entries_updated: totalUpdated,
      total_terms_added: totalTerms,
      results
    };
  }
}

// Exportar instância singleton
export const leadSearchTermsPopulator = new LeadSearchTermsPopulator();
