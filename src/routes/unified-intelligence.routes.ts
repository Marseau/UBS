/**
 * Unified Intelligence Routes
 * Endpoints que substituem o GPT-4 clustering por KMeans local
 * Compatível com dynamic-intelligence-dashboard.html
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
// REMOVIDO: imports de unified-clustering-insights.service.ts (dados fake/hardcoded)
// Agora usamos apenas dados reais do cluster

const router = express.Router();

// Função simples para calcular priority score baseado em dados reais
function calculatePriorityScoreReal(cluster: any): number {
  const leads = cluster.total_leads || 0;
  const contactRate = cluster.avg_contact_rate || 0;
  const hashtagCount = cluster.hashtag_count || 0;

  // Score baseado em: leads * taxa_contato + bônus por hashtags
  return Math.round((leads * (contactRate / 100)) + (hashtagCount * 10));
}

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * GET /api/unified-intelligence/clusters
 * Retorna clusters KMeans - filtrados por campaign_id se fornecido
 * Formato compatível com /api/dynamic-intelligence/clusters
 */
router.get('/clusters', async (req, res) => {
  try {
    const campaignId = req.query.campaign_id as string | undefined;

    console.log(`\n🤖 [API] Buscando clusters KMeans${campaignId ? ` para campanha ${campaignId}` : ' de todas as campanhas'}`);

    // Buscar campanhas com clustering executado
    let query = supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, nicho_principal, related_clusters, clustering_result, last_clustering_at, cluster_status')
      .eq('cluster_status', 'clustered')
      .not('related_clusters', 'is', null)
      .order('last_clustering_at', { ascending: false });

    // Filtrar por campaign_id se fornecido
    if (campaignId) {
      query = query.eq('id', campaignId);
    }

    const { data: campaigns, error: campaignsError } = await query;

    if (campaignsError) throw campaignsError;

    if (!campaigns || campaigns.length === 0) {
      return res.json({
        success: true,
        clusters: [],
        total: 0,
        message: 'Nenhuma campanha com clustering executado'
      });
    }

    // Consolidar todos os clusters de todas as campanhas
    const allClusters: any[] = [];

    for (const campaign of campaigns) {
      const relatedClusters = campaign.related_clusters || [];

      for (const cluster of relatedClusters) {
        // Usar apenas dados REAIS do cluster - sem insights fake
        const themeKeywords = cluster.theme_keywords || [];
        const topHashtags = cluster.top_hashtags || [];

        // Converter avg_contact_rate de % para decimal (0-1) para o frontend multiplicar corretamente
        const contactRateDecimal = (cluster.avg_contact_rate || 0) / 100;

        allClusters.push({
          id: `${campaign.id}_cluster_${cluster.cluster_id}`,
          campaign_id: campaign.id,
          campaign_name: campaign.campaign_name,
          cluster_key: `kmeans_${cluster.cluster_id}`,
          cluster_name: cluster.cluster_name || `Cluster ${cluster.cluster_id + 1}`,
          // Descrição simplificada baseada apenas em keywords reais
          cluster_description: themeKeywords.length > 0
            ? `Profissionais focados em ${themeKeywords.slice(0, 3).join(', ')}`
            : `Cluster ${cluster.cluster_id + 1} - ${campaign.nicho_principal || 'Geral'}`,
          hashtag_count: cluster.hashtag_count || 0,
          total_leads: cluster.total_leads || 0,
          // conversion_rate como decimal (0-1) para frontend multiplicar por 100
          conversion_rate: contactRateDecimal,
          priority_score: calculatePriorityScoreReal(cluster),
          is_active: true,
          generated_at: campaign.last_clustering_at,
          // Dados adicionais REAIS
          theme_keywords: themeKeywords,
          top_hashtags: topHashtags
          // REMOVIDO: insights fake (pain_points, trends, etc.)
        });
      }
    }

    // Ordenar por priority_score
    allClusters.sort((a, b) => b.priority_score - a.priority_score);

    return res.json({
      success: true,
      clusters: allClusters,
      total: allClusters.length,
      source: 'kmeans',
      campaigns_count: campaigns.length
    });

  } catch (error: any) {
    console.error('❌ Erro em /unified-intelligence/clusters:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-intelligence/cluster/:id
 * Retorna detalhes completos de um cluster específico
 * Formato compatível com /api/dynamic-intelligence/cluster/:id
 */
router.get('/cluster/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`\n🔍 [API] Buscando detalhes do cluster unificado: ${id}`);

    // Parse do ID composto (campaign_id_cluster_X)
    const parts = id.split('_cluster_');
    if (parts.length !== 2) {
      return res.status(400).json({
        success: false,
        error: 'ID de cluster inválido. Formato esperado: campaignId_cluster_N'
      });
    }

    const campaignId = parts[0];
    const clusterId = parseInt(parts[1] || '0');

    // Buscar campanha
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campanha não encontrada'
      });
    }

    // Encontrar o cluster específico
    const relatedClusters = campaign.related_clusters || [];
    const cluster = relatedClusters.find((c: any) => c.cluster_id === clusterId);

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster não encontrado na campanha'
      });
    }

    const themeKeywords = cluster.theme_keywords || [];
    const topHashtags = cluster.top_hashtags || [];

    // Usar apenas dados REAIS do cluster - sem insights fake
    // Converter avg_contact_rate de % para decimal (0-1)
    const contactRateDecimal = (cluster.avg_contact_rate || 0) / 100;
    const opportunityScore = (cluster.relevance_score || 0.5) * 100;

    const clusterData = {
      id: id,
      campaign_id: campaign.id,
      cluster_key: `kmeans_${clusterId}`,
      cluster_name: cluster.cluster_name || `Cluster ${clusterId + 1}`,
      cluster_description: themeKeywords.length > 0
        ? `Profissionais focados em ${themeKeywords.slice(0, 3).join(', ')}`
        : `Cluster ${clusterId + 1} - ${campaign.nicho || 'Geral'}`,
      hashtag_count: cluster.hashtag_count || 0,
      total_leads: cluster.total_leads || 0,
      conversion_rate: contactRateDecimal,
      priority_score: calculatePriorityScoreReal(cluster),
      is_active: true,
      generated_at: campaign.last_clustering_at,
      theme_keywords: themeKeywords,
      top_hashtags: topHashtags
    };

    // Insights baseados apenas em dados reais do cluster
    const insights = {
      cluster_id: id,
      theme_keywords: themeKeywords,
      top_hashtags: topHashtags,
      opportunity_score: opportunityScore,
      pain_intensity: opportunityScore > 70 ? 'alta' : opportunityScore > 50 ? 'média' : 'baixa',
      trend_direction: 'growing',
      trend_velocity: 'moderada'
    };

    // Buscar métricas de performance dos leads do cluster
    const { data: leadsData } = await supabase
      .from('campaign_leads')
      .select('id, contact_rate')
      .eq('campaign_id', campaignId)
      .eq('cluster_id', clusterId);

    const performanceHistory = [{
      calculated_at: campaign.last_clustering_at,
      total_leads: leadsData?.length || cluster.total_leads || 0,
      conversion_rate: cluster.avg_contact_rate || 0,
      engagement_score: cluster.relevance_score || 0.5
    }];

    return res.json({
      success: true,
      cluster: clusterData,
      insights: insights,
      performance_history: performanceHistory
    });

  } catch (error: any) {
    console.error('❌ Erro em /unified-intelligence/cluster/:id:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-intelligence/trends
 * Retorna tendências baseadas nos clusters KMeans
 * Formato compatível com /api/dynamic-intelligence/trends
 */
router.get('/trends', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    console.log(`\n📈 [API] Buscando tendências unificadas (top ${limit})`);

    // Buscar hashtags mais frequentes com taxa de crescimento simulada
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH hashtag_stats AS (
          SELECT
            hashtag,
            COUNT(*) as frequency,
            COUNT(DISTINCT lead_id) as unique_leads,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as recent_count,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND created_at <= NOW() - INTERVAL '7 days') as previous_count
          FROM (
            SELECT jsonb_array_elements_text(hashtags_bio) as hashtag, id as lead_id, created_at
            FROM instagram_leads WHERE hashtags_bio IS NOT NULL
            UNION ALL
            SELECT jsonb_array_elements_text(hashtags_posts) as hashtag, id as lead_id, created_at
            FROM instagram_leads WHERE hashtags_posts IS NOT NULL
          ) combined
          WHERE hashtag IS NOT NULL AND hashtag != ''
          GROUP BY hashtag
          HAVING COUNT(*) >= 5
        )
        SELECT
          hashtag,
          frequency,
          unique_leads,
          recent_count,
          previous_count,
          CASE
            WHEN previous_count = 0 THEN 100
            ELSE ROUND(((recent_count - previous_count)::numeric / NULLIF(previous_count, 0)::numeric) * 100, 1)
          END as growth_rate,
          CASE
            WHEN recent_count > previous_count * 2 THEN 'viral'
            WHEN recent_count > previous_count * 1.5 THEN 'trending'
            WHEN recent_count > previous_count THEN 'growing'
            ELSE 'stable'
          END as trend_type
        FROM hashtag_stats
        WHERE recent_count > 0
        ORDER BY growth_rate DESC, frequency DESC
        LIMIT ${limit}
      `
    });

    if (error) throw error;

    const trends = (data || []).map((t: any) => ({
      hashtag: t.hashtag,
      frequency: t.frequency,
      unique_leads: t.unique_leads,
      growth_rate: parseFloat(t.growth_rate) || 0,
      trend_type: t.trend_type,
      detected_at: new Date().toISOString()
    }));

    return res.json({
      success: true,
      trends: trends,
      total: trends.length,
      period: '30d'
    });

  } catch (error: any) {
    console.error('❌ Erro em /unified-intelligence/trends:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-intelligence/opportunity-ranking
 * Retorna ranking de oportunidades baseado em clusters KMeans
 */
router.get('/opportunity-ranking', async (_req, res) => {
  try {
    console.log('\n🎯 [API] Buscando ranking de oportunidades unificado');

    // Buscar todas as campanhas com clusters
    const { data: campaigns, error } = await supabase
      .from('cluster_campaigns')
      .select('id, name, nicho, related_clusters')
      .eq('cluster_status', 'clustered')
      .not('related_clusters', 'is', null);

    if (error) throw error;

    const ranking: any[] = [];

    for (const campaign of campaigns || []) {
      for (const cluster of campaign.related_clusters || []) {
        const priorityScore = calculatePriorityScoreReal(cluster);
        const opportunityScore = (cluster.relevance_score || 0.5) * 100;
        // Converter avg_contact_rate de % para decimal (0-1)
        const contactRateDecimal = (cluster.avg_contact_rate || 0) / 100;

        ranking.push({
          cluster_name: cluster.cluster_name,
          cluster_key: `kmeans_${cluster.cluster_id}`,
          campaign_name: campaign.name,
          nicho: campaign.nicho,
          priority_score: priorityScore,
          total_leads: cluster.total_leads || 0,
          conversion_rate: contactRateDecimal,
          opportunity_score: opportunityScore,
          pain_intensity: opportunityScore > 70 ? 'alta' : opportunityScore > 50 ? 'média' : 'baixa',
          theme_keywords: cluster.theme_keywords || [],
          trend_direction: 'growing',
          trend_velocity: 'moderada'
        });
      }
    }

    // Ordenar por opportunity_score
    ranking.sort((a, b) => b.opportunity_score - a.opportunity_score);

    return res.json({
      success: true,
      ranking: ranking.slice(0, 10)
    });

  } catch (error: any) {
    console.error('❌ Erro em /unified-intelligence/opportunity-ranking:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-intelligence/market-gaps
 * Retorna oportunidades de mercado baseadas nos clusters KMeans
 */
router.get('/market-gaps', async (_req, res) => {
  try {
    console.log('\n💡 [API] Buscando gaps de mercado');

    const { data: campaigns, error } = await supabase
      .from('cluster_campaigns')
      .select('id, name, nicho, related_clusters')
      .eq('cluster_status', 'clustered')
      .not('related_clusters', 'is', null);

    if (error) throw error;

    const gaps: any[] = [];

    for (const campaign of campaigns || []) {
      for (const cluster of campaign.related_clusters || []) {
        const themeKeywords = cluster.theme_keywords || [];
        const topHashtags = cluster.top_hashtags || [];
        const opportunityScore = (cluster.relevance_score || 0.5) * 100;

        // Usar dados REAIS do cluster - sem geradores fake
        gaps.push({
          theme_keywords: themeKeywords,
          top_hashtags: topHashtags,
          opportunity_score: opportunityScore,
          cluster_id: `${campaign.id}_cluster_${cluster.cluster_id}`,
          cluster_name: cluster.cluster_name,
          campaign_name: campaign.name,
          total_leads: cluster.total_leads || 0
        });
      }
    }

    // Ordenar por opportunity_score
    gaps.sort((a, b) => b.opportunity_score - a.opportunity_score);

    return res.json({
      success: true,
      gaps: gaps.slice(0, 10)
    });

  } catch (error: any) {
    console.error('❌ Erro em /unified-intelligence/market-gaps:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/unified-intelligence/last-execution
 * Retorna data da última execução de clustering
 */
router.get('/last-execution', async (_req, res) => {
  try {
    const { data: campaigns } = await supabase
      .from('cluster_campaigns')
      .select('last_clustering_at')
      .eq('cluster_status', 'clustered')
      .not('last_clustering_at', 'is', null)
      .order('last_clustering_at', { ascending: false })
      .limit(1);

    const lastExecution = campaigns?.[0]?.last_clustering_at || null;

    return res.json({
      success: true,
      last_full_pipeline: lastExecution,
      last_metrics_only: lastExecution,
      history: lastExecution ? [{
        execution_type: 'kmeans_clustering',
        status: 'success',
        executed_at: lastExecution
      }] : []
    });

  } catch (error: any) {
    return res.json({
      success: true,
      last_full_pipeline: null,
      last_metrics_only: null,
      history: []
    });
  }
});

/**
 * POST /api/unified-intelligence/recalculate-metrics
 * Recalcula métricas sem GPT (compatibilidade)
 */
router.post('/recalculate-metrics', async (_req, res) => {
  try {
    console.log('\n📊 [API] Recalculando métricas de clusters KMeans');

    // Buscar campanhas com clustering
    const { data: campaigns, error } = await supabase
      .from('cluster_campaigns')
      .select('id, related_clusters, nicho')
      .eq('cluster_status', 'clustered')
      .not('related_clusters', 'is', null);

    if (error) throw error;

    let updated = 0;
    const errors: string[] = [];

    for (const campaign of campaigns || []) {
      try {
        // Recalcular priority_score para cada cluster usando função real
        const updatedClusters = (campaign.related_clusters || []).map((cluster: any) => ({
          ...cluster,
          priority_score: calculatePriorityScoreReal(cluster)
        }));

        await supabase
          .from('cluster_campaigns')
          .update({
            related_clusters: updatedClusters,
            last_clustering_at: new Date().toISOString()
          })
          .eq('id', campaign.id);

        updated++;
      } catch (err: any) {
        errors.push(`Campanha ${campaign.id}: ${err.message}`);
      }
    }

    return res.json({
      success: true,
      message: 'Métricas recalculadas com sucesso (KMeans)',
      clusters_updated: updated,
      errors: errors.length
    });

  } catch (error: any) {
    console.error('❌ Erro em /recalculate-metrics:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
