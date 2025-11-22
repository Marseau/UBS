import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

interface HashtagData {
  hashtag: string;
  frequency: number;
  leads: string[];
}

interface Cluster {
  cluster_key: string;
  cluster_name: string;
  cluster_description: string;
  hashtags: string[];
  algorithm_used: string;
  data_points_analyzed: number;
  cohesion_score: number;
  priority_score: number;
}

/**
 * Serviço de Clustering Dinâmico de Hashtags
 *
 * Sistema inteligente que:
 * 1. Analisa 52.495+ ocorrências de hashtags
 * 2. Agrupa semanticamente via GPT-4
 * 3. Calcula métricas de qualidade
 * 4. Persiste clusters no banco
 */
export class DynamicClusteringService {

  /**
   * Busca todos os dados de hashtags do banco
   */
  async fetchHashtagData(): Promise<HashtagData[]> {
    console.log('\n📊 Buscando dados de hashtags...\n');

    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH hashtag_occurrences AS (
          SELECT
            hashtag,
            id as lead_id
          FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
          WHERE hashtags_bio IS NOT NULL
          UNION ALL
          SELECT
            hashtag,
            id as lead_id
          FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
          WHERE hashtags_posts IS NOT NULL
        )
        SELECT
          hashtag,
          COUNT(*) as frequency,
          json_agg(DISTINCT lead_id) as leads
        FROM hashtag_occurrences
        GROUP BY hashtag
        HAVING COUNT(*) >= 3
        ORDER BY COUNT(*) DESC
      `
    });

    if (error) {
      console.error('❌ Erro ao buscar hashtags:', error);
      throw error;
    }

    console.log(`✅ ${data.length} hashtags únicas encontradas\n`);
    return data;
  }

  /**
   * Clustering semântico usando GPT-4
   * Agrupa hashtags por similaridade de significado/contexto
   */
  async performSemanticClustering(hashtags: HashtagData[]): Promise<Cluster[]> {
    console.log('\n🤖 Executando clustering semântico via GPT-4...\n');

    // Pegar top 200 hashtags mais frequentes para análise
    const topHashtags = hashtags
      .slice(0, 200)
      .map(h => `${h.hashtag} (${h.frequency}x)`)
      .join(', ');

    const prompt = `Você é um especialista em análise de dados e segmentação de mercado.

Analise estas 200 hashtags mais populares do Instagram e agrupe-as em 5-8 clusters semanticamente coerentes:

${topHashtags}

Para cada cluster identificado, retorne um objeto JSON com:
{
  "clusters": [
    {
      "cluster_key": "identificador_snake_case",
      "cluster_name": "Nome Descritivo do Cluster",
      "cluster_description": "Descrição detalhada do perfil, comportamento e dores deste público",
      "hashtags": ["hashtag1", "hashtag2", ...],
      "priority_score": 0-100
    }
  ]
}

REGRAS:
1. Agrupe por TEMÁTICA e PÚBLICO-ALVO, não apenas por palavras similares
2. Identifique dores, aspirações e comportamentos de cada grupo
3. Priorize clusters com maior potencial comercial (score mais alto)
4. Cada hashtag deve pertencer a apenas 1 cluster
5. Retorne APENAS o JSON, sem explicações`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'Você é um analista de dados especializado em segmentação de mercado e clustering.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      const responseText = completion.choices[0]?.message.content || '{}';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);

      let parsed: any;
      try {
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
      } catch (parseError) {
        console.error('❌ Erro ao parsear resposta GPT-4:', parseError);
        console.error('   Resposta recebida:', responseText);
        throw new Error('Falha ao processar resposta do GPT-4: JSON inválido');
      }

      // Validar estrutura esperada
      if (!parsed.clusters || !Array.isArray(parsed.clusters)) {
        console.error('❌ Resposta GPT-4 sem campo "clusters" ou formato inválido');
        throw new Error('Resposta do GPT-4 não contém clusters válidos');
      }

      const clusters: Cluster[] = parsed.clusters.map((c: any) => ({
        cluster_key: c.cluster_key,
        cluster_name: c.cluster_name,
        cluster_description: c.cluster_description,
        hashtags: c.hashtags,
        algorithm_used: 'gpt4-semantic',
        data_points_analyzed: hashtags.length,
        cohesion_score: 0.85, // Placeholder - será calculado posteriormente
        priority_score: c.priority_score
      }));

      console.log(`✅ ${clusters.length} clusters identificados:\n`);
      clusters.forEach(c => {
        console.log(`   📁 ${c.cluster_name} (${c.hashtags.length} hashtags, score: ${c.priority_score})`);
      });

      return clusters;

    } catch (error) {
      console.error('❌ Erro no clustering GPT-4:', error);
      throw error;
    }
  }

  /**
   * Recalcula métricas de TODOS os clusters existentes SEM chamar GPT-4
   * Útil para atualizar dados sem custo de API
   */
  async recalculateAllMetrics(): Promise<{ updated: number; errors: number }> {
    console.log('\n📊 Recalculando métricas de todos os clusters (SEM GPT-4)...\n');

    // Buscar todos os clusters ativos
    const { data: clusters, error: clustersError } = await supabase
      .from('hashtag_clusters_dynamic')
      .select('*')
      .eq('is_active', true);

    if (clustersError || !clusters) {
      console.error('❌ Erro ao buscar clusters:', clustersError);
      throw clustersError;
    }

    console.log(`   ${clusters.length} clusters ativos encontrados\n`);

    // Buscar dados de hashtags
    const hashtagData = await this.fetchHashtagData();

    let updated = 0;
    let errors = 0;

    for (const cluster of clusters) {
      try {
        const metrics = await this.calculateClusterMetrics(
          {
            cluster_key: cluster.cluster_key,
            cluster_name: cluster.cluster_name,
            cluster_description: cluster.cluster_description,
            hashtags: cluster.hashtags,
            algorithm_used: cluster.algorithm_used,
            data_points_analyzed: cluster.data_points_analyzed,
            cohesion_score: cluster.cohesion_score,
            priority_score: cluster.priority_score
          },
          hashtagData
        );

        // Atualizar no banco
        const { error: updateError } = await supabase
          .from('hashtag_clusters_dynamic')
          .update({
            total_leads: metrics.total_leads,
            conversion_rate: metrics.conversion_rate,
            avg_contact_rate: metrics.avg_contact_rate,
            updated_at: new Date().toISOString()
          })
          .eq('id', cluster.id);

        if (updateError) {
          console.error(`   ❌ Erro ao atualizar ${cluster.cluster_name}:`, updateError);
          errors++;
        } else {
          console.log(`   ✅ ${cluster.cluster_name}: ${metrics.total_leads} leads, ${metrics.conversion_rate}% contato`);
          updated++;
        }
      } catch (err) {
        console.error(`   ❌ Erro ao processar ${cluster.cluster_name}:`, err);
        errors++;
      }
    }

    console.log(`\n✅ Recálculo concluído: ${updated} atualizados, ${errors} erros\n`);
    return { updated, errors };
  }

  /**
   * Calcula métricas de performance para cada cluster
   */
  async calculateClusterMetrics(cluster: Cluster, allHashtagData: HashtagData[]) {
    // Buscar dados de leads para este cluster
    const clusterHashtags = cluster.hashtags;
    const relevantData = allHashtagData.filter(h => clusterHashtags.includes(h.hashtag));

    // Leads únicos neste cluster
    const uniqueLeads = new Set<string>();
    relevantData.forEach(h => {
      h.leads.forEach((leadId: string) => uniqueLeads.add(leadId));
    });

    // Calcular taxa de conversão baseada em dados reais
    const { data: conversionData } = await supabase
      .from('instagram_leads')
      .select('id, email, phone, additional_emails, additional_phones')
      .in('id', Array.from(uniqueLeads));

    const totalLeads = conversionData?.length || 0;
    // Lead tem contato se tem email OU phone OU additional_emails não vazio OU additional_phones não vazio
    const contactableLeads = conversionData?.filter(l =>
      l.email ||
      l.phone ||
      (l.additional_emails && Array.isArray(l.additional_emails) && l.additional_emails.length > 0) ||
      (l.additional_phones && Array.isArray(l.additional_phones) && l.additional_phones.length > 0)
    ).length || 0;
    const conversionRate = totalLeads > 0 ? (contactableLeads / totalLeads) * 100 : 0;
    const avgContactRate = totalLeads > 0 ? contactableLeads / totalLeads : 0;

    return {
      total_leads: totalLeads,
      conversion_rate: parseFloat(conversionRate.toFixed(2)),
      avg_contact_rate: parseFloat(avgContactRate.toFixed(3))
    };
  }

  /**
   * Normaliza texto para comparação (remove acentos, lowercase, remove espaços extras)
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9]/g, '') // Remove caracteres especiais
      .trim();
  }

  /**
   * Calcula similaridade entre dois arrays de hashtags (Jaccard Index)
   */
  private calculateHashtagSimilarity(hashtags1: string[], hashtags2: string[]): number {
    const set1 = new Set(hashtags1.map(h => h.toLowerCase()));
    const set2 = new Set(hashtags2.map(h => h.toLowerCase()));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Encontra cluster similar existente baseado em nome e hashtags
   */
  async findSimilarCluster(newCluster: Cluster): Promise<{ id: string; name: string; similarity: number } | null> {
    const { data: existingClusters } = await supabase
      .from('hashtag_clusters_dynamic')
      .select('id, cluster_key, cluster_name, hashtags')
      .eq('is_active', true);

    if (!existingClusters || existingClusters.length === 0) {
      return null;
    }

    const newNameNormalized = this.normalizeText(newCluster.cluster_name);

    for (const existing of existingClusters) {
      // 1. Verificar similaridade de nome
      const existingNameNormalized = this.normalizeText(existing.cluster_name);
      const nameMatch = newNameNormalized === existingNameNormalized ||
                        newNameNormalized.includes(existingNameNormalized) ||
                        existingNameNormalized.includes(newNameNormalized);

      // 2. Verificar similaridade de hashtags
      const hashtagSimilarity = this.calculateHashtagSimilarity(
        newCluster.hashtags,
        existing.hashtags || []
      );

      // Se nome similar OU >50% hashtags iguais = duplicata
      if (nameMatch || hashtagSimilarity > 0.5) {
        console.log(`   🔍 Cluster similar encontrado: "${existing.cluster_name}" (similaridade: ${(hashtagSimilarity * 100).toFixed(1)}%)`);
        return {
          id: existing.id,
          name: existing.cluster_name,
          similarity: hashtagSimilarity
        };
      }
    }

    return null;
  }

  /**
   * Persiste clusters no banco de dados (com detecção de duplicatas)
   */
  async persistClusters(clusters: Cluster[], allHashtagData: HashtagData[]): Promise<void> {
    console.log('\n💾 Persistindo clusters no banco...\n');
    console.log('   🛡️  Detecção anti-duplicatas ATIVA\n');

    for (const cluster of clusters) {
      try {
        // Calcular métricas
        const metrics = await this.calculateClusterMetrics(cluster, allHashtagData);

        // Preparar dados para inserção
        const clusterData = {
          cluster_key: cluster.cluster_key,
          cluster_name: cluster.cluster_name,
          cluster_description: cluster.cluster_description,
          hashtags: cluster.hashtags,
          cohesion_score: cluster.cohesion_score,
          separation_score: 0.75, // Placeholder
          silhouette_score: 0.65, // Placeholder
          total_leads: metrics.total_leads,
          conversion_rate: metrics.conversion_rate,
          avg_contact_rate: metrics.avg_contact_rate,
          priority_score: cluster.priority_score,
          algorithm_used: cluster.algorithm_used,
          data_points_analyzed: cluster.data_points_analyzed,
          is_active: true,
          is_validated: false
        };

        // 1. Verificar match exato por cluster_key
        const { data: exactMatch } = await supabase
          .from('hashtag_clusters_dynamic')
          .select('id')
          .eq('cluster_key', cluster.cluster_key)
          .single();

        if (exactMatch) {
          // Atualizar existente (match exato)
          const { error } = await supabase
            .from('hashtag_clusters_dynamic')
            .update(clusterData)
            .eq('id', exactMatch.id);

          if (error) throw error;
          console.log(`   ✅ Atualizado (match exato): ${cluster.cluster_name}`);
        } else {
          // 2. Verificar se há cluster similar (anti-duplicata)
          const similarCluster = await this.findSimilarCluster(cluster);

          if (similarCluster) {
            // Atualizar cluster similar existente
            const { error } = await supabase
              .from('hashtag_clusters_dynamic')
              .update(clusterData)
              .eq('id', similarCluster.id);

            if (error) throw error;
            console.log(`   🔄 Mesclado com "${similarCluster.name}": ${cluster.cluster_name}`);
          } else {
            // Criar novo (não há duplicata)
            const { error } = await supabase
              .from('hashtag_clusters_dynamic')
              .insert(clusterData);

            if (error) throw error;
            console.log(`   ✅ Criado (novo): ${cluster.cluster_name}`);
          }
        }

      } catch (error) {
        console.error(`   ❌ Erro ao persistir ${cluster.cluster_name}:`, error);
      }
    }

    console.log('\n✅ Clusters persistidos com sucesso!\n');
  }

  /**
   * Execução completa do pipeline de clustering
   */
  async executeClustering(): Promise<void> {
    console.log('\n🚀 INICIANDO DYNAMIC CLUSTERING PIPELINE\n');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      // 1. Buscar dados
      const hashtagData = await this.fetchHashtagData();

      // 2. Executar clustering
      const clusters = await this.performSemanticClustering(hashtagData);

      // 3. Persistir resultados
      await this.persistClusters(clusters, hashtagData);

      console.log('════════════════════════════════════════════════════════════');
      console.log('\n🎉 CLUSTERING CONCLUÍDO COM SUCESSO!\n');
      console.log(`📊 Resumo:`);
      console.log(`   • ${hashtagData.length} hashtags analisadas`);
      console.log(`   • ${clusters.length} clusters gerados`);
      console.log(`   • Algoritmo: GPT-4 Semantic Clustering`);
      console.log(`   • Sistema: 100% dinâmico e auto-evolutivo\n`);

    } catch (error) {
      console.error('\n❌ ERRO NO CLUSTERING PIPELINE:', error);
      throw error;
    }
  }
}

// Exportar instância singleton
export const dynamicClustering = new DynamicClusteringService();
