import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { dynamicClustering } from '../services/dynamic-clustering.service';
import { behavioralAnalyzer } from '../services/behavioral-analyzer.service';
import { trendDetector } from '../services/trend-detector.service';
import { leadSearchTermsPopulator } from '../services/lead-search-terms-populator.service';
import { personaGenerator } from '../services/persona-generator.service';
import { authenticateAdminSimple, rateLimiter } from '../middleware/admin-auth.middleware';

const router = Router();

// Rate limiter global para todos os endpoints deste router
router.use(rateLimiter(500, 15 * 60 * 1000)); // 500 requests por 15 min

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * GET /api/dynamic-intelligence/clusters
 * Retorna todos os clusters dinâmicos ativos com insights
 */
router.get('/clusters', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('v_clusters_with_insights')
      .select('*')
      .order('priority_score', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      clusters: data,
      total: data?.length || 0
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar clusters:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dynamic-intelligence/cluster/:id
 * Retorna detalhes completos de um cluster específico
 */
router.get('/cluster/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Buscar cluster
    const { data: cluster, error: clusterError } = await supabase
      .from('hashtag_clusters_dynamic')
      .select('*')
      .eq('id', id)
      .single();

    if (clusterError) throw clusterError;

    // Buscar insights comportamentais
    const { data: insights, error: insightsError } = await supabase
      .from('cluster_behavioral_insights')
      .select('*')
      .eq('cluster_id', id)
      .single();

    if (insightsError && insightsError.code !== 'PGRST116') {
      throw insightsError;
    }

    // Buscar métricas de performance
    const { data: metrics, error: metricsError } = await supabase
      .from('cluster_performance_metrics')
      .select('*')
      .eq('cluster_id', id)
      .order('calculated_at', { ascending: false })
      .limit(3);

    if (metricsError) throw metricsError;

    res.json({
      success: true,
      cluster: cluster,
      insights: insights || null,
      performance_history: metrics || []
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar cluster:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dynamic-intelligence/trends
 * Retorna tendências emergentes detectadas
 */
router.get('/trends', async (req: Request, res: Response) => {
  try {
    const period = req.query.period as string || '30d';
    const limit = parseInt(req.query.limit as string) || 50;

    const { data, error } = await supabase
      .from('v_emerging_trends')
      .select('*')
      .limit(limit);

    if (error) throw error;

    res.json({
      success: true,
      trends: data,
      total: data?.length || 0,
      period: period
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar tendências:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dynamic-intelligence/opportunity-ranking
 * Retorna ranking de clusters por score de oportunidade
 */
router.get('/opportunity-ranking', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        SELECT
          hcd.cluster_name,
          hcd.cluster_key,
          hcd.priority_score,
          hcd.total_leads,
          hcd.conversion_rate,
          cbi.opportunity_score,
          cbi.pain_intensity,
          cbi.audience_awareness_level,
          cbi.trend_direction,
          cbi.trend_velocity
        FROM hashtag_clusters_dynamic hcd
        LEFT JOIN cluster_behavioral_insights cbi ON cbi.cluster_id = hcd.id
        WHERE hcd.is_active = true
        ORDER BY cbi.opportunity_score DESC NULLS LAST, hcd.priority_score DESC
        LIMIT 10
      `
    });

    if (error) throw error;

    res.json({
      success: true,
      ranking: data
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar ranking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dynamic-intelligence/market-gaps
 * Retorna oportunidades de mercado não atendidas
 */
router.get('/market-gaps', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('cluster_behavioral_insights')
      .select(`
        market_gaps,
        underserved_niches,
        opportunity_score,
        cluster_id,
        hashtag_clusters_dynamic!inner (
          cluster_name,
          cluster_key
        )
      `)
      .not('market_gaps', 'eq', '[]')
      .order('opportunity_score', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      gaps: data
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar gaps de mercado:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/dynamic-intelligence/execute-clustering
 * Executa pipeline completo de clustering
 * 🔒 Requer autenticação admin
 */
router.post('/execute-clustering', authenticateAdminSimple, async (_req: Request, res: Response) => {
  try {
    console.log('\n🚀 Executando clustering via API...\n');

    await dynamicClustering.executeClustering();

    res.json({
      success: true,
      message: 'Clustering executado com sucesso'
    });

  } catch (error: any) {
    console.error('❌ Erro ao executar clustering:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/dynamic-intelligence/analyze-behavior
 * Executa análise comportamental de todos os clusters
 * 🔒 Requer autenticação admin
 */
router.post('/analyze-behavior', authenticateAdminSimple, async (_req: Request, res: Response) => {
  try {
    console.log('\n🧠 Executando análise comportamental via API...\n');

    await behavioralAnalyzer.analyzeAllClusters();

    res.json({
      success: true,
      message: 'Análise comportamental executada com sucesso'
    });

  } catch (error: any) {
    console.error('❌ Erro ao analisar comportamento:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/dynamic-intelligence/detect-trends
 * Executa detecção de tendências
 * 🔒 Requer autenticação admin
 */
router.post('/detect-trends', authenticateAdminSimple, async (_req: Request, res: Response) => {
  try {
    console.log('\n📈 Executando detecção de tendências via API...\n');

    await trendDetector.executeTrendDetection();

    res.json({
      success: true,
      message: 'Detecção de tendências executada com sucesso'
    });

  } catch (error: any) {
    console.error('❌ Erro ao detectar tendências:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/dynamic-intelligence/update-opportunity-scores
 * Atualiza scores de oportunidade para todos os clusters
 * 🔒 Requer autenticação admin
 */
router.post('/update-opportunity-scores', authenticateAdminSimple, async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.rpc('update_all_cluster_opportunity_scores');

    if (error) throw error;

    res.json({
      success: true,
      clusters_updated: data
    });

  } catch (error: any) {
    console.error('❌ Erro ao atualizar scores:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/dynamic-intelligence/recalculate-metrics
 * Recalcula métricas dos clusters existentes SEM chamar GPT-4 (GRATUITO)
 */
router.post('/recalculate-metrics', async (_req: Request, res: Response) => {
  try {
    console.log('\n📊 Recalculando métricas (SEM GPT-4)...\n');

    const result = await dynamicClustering.recalculateAllMetrics();

    // Registrar execução
    await supabase.rpc('execute_sql', {
      query_text: `
        CREATE TABLE IF NOT EXISTS dynamic_intelligence_execution_log (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          execution_number INTEGER DEFAULT 0,
          status TEXT NOT NULL,
          duration_ms INTEGER DEFAULT 0,
          error_message TEXT,
          execution_type TEXT DEFAULT 'full_pipeline',
          executed_at TIMESTAMP DEFAULT NOW()
        )
      `
    });

    await supabase.rpc('execute_sql', {
      query_text: `
        INSERT INTO dynamic_intelligence_execution_log
        (status, execution_type, executed_at)
        VALUES ('success', 'metrics_only', NOW())
      `
    });

    res.json({
      success: true,
      message: 'Métricas recalculadas com sucesso (SEM GPT-4)',
      clusters_updated: result.updated,
      errors: result.errors
    });

  } catch (error: any) {
    console.error('❌ Erro ao recalcular métricas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dynamic-intelligence/last-execution
 * Retorna data da última execução do pipeline
 */
router.get('/last-execution', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        SELECT
          execution_type,
          status,
          executed_at,
          duration_ms
        FROM dynamic_intelligence_execution_log
        ORDER BY executed_at DESC
        LIMIT 5
      `
    });

    if (error) {
      // Tabela pode não existir ainda
      res.json({
        success: true,
        last_full_pipeline: null,
        last_metrics_only: null,
        history: []
      });
      return;
    }

    const fullPipeline = data?.find((e: any) => e.execution_type === 'full_pipeline' || !e.execution_type);
    const metricsOnly = data?.find((e: any) => e.execution_type === 'metrics_only');

    res.json({
      success: true,
      last_full_pipeline: fullPipeline?.executed_at || null,
      last_metrics_only: metricsOnly?.executed_at || null,
      history: data || []
    });

  } catch (error: any) {
    res.json({
      success: true,
      last_full_pipeline: null,
      last_metrics_only: null,
      history: []
    });
  }
});

/**
 * POST /api/dynamic-intelligence/populate-search-terms
 * Popula lead_search_terms com clusters dinâmicos (GPT-4)
 * Cria termos de busca baseados nos clusters inteligentes
 */
router.post('/populate-search-terms', async (_req: Request, res: Response) => {
  try {
    console.log('\n🔍 Populando search terms a partir dos clusters dinâmicos...\n');

    const result = await leadSearchTermsPopulator.populateFromDynamicClusters();

    // Registrar execução
    await supabase.rpc('execute_sql', {
      query_text: `
        INSERT INTO dynamic_intelligence_execution_log
        (status, execution_type, executed_at)
        VALUES ('success', 'search_terms_population', NOW())
      `
    });

    res.json({
      success: true,
      message: 'Search terms populados com sucesso a partir dos clusters GPT-4',
      terms_created: result.entries_created,
      terms_updated: result.entries_updated,
      errors: result.entries_skipped,
      total_processed: result.total_terms_added
    });

  } catch (error: any) {
    console.error('❌ Erro ao popular search terms:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/dynamic-intelligence/execute-full-pipeline
 * Executa pipeline completo: clustering + análise + tendências + scores
 */
router.post('/execute-full-pipeline', async (_req: Request, res: Response) => {
  try {
    console.log('\n🚀 EXECUTANDO PIPELINE COMPLETO DE INTELIGÊNCIA\n');
    console.log('════════════════════════════════════════════════════════════\n');

    // 1. Clustering
    console.log('📊 Etapa 1/4: Dynamic Clustering...');
    await dynamicClustering.executeClustering();

    // 2. Análise Comportamental
    console.log('\n🧠 Etapa 2/4: Behavioral Analysis...');
    await behavioralAnalyzer.analyzeAllClusters();

    // 3. Detecção de Tendências
    console.log('\n📈 Etapa 3/4: Trend Detection...');
    await trendDetector.executeTrendDetection();

    // 4. Atualizar Scores de Oportunidade
    console.log('\n🎯 Etapa 4/4: Update Opportunity Scores...');
    const { data: updatedCount } = await supabase.rpc('update_all_cluster_opportunity_scores');

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('\n🎉 PIPELINE COMPLETO EXECUTADO COM SUCESSO!\n');
    console.log(`✅ Sistema Dynamic Intelligence 2.0 atualizado`);
    console.log(`   • Clusters: gerados e persistidos`);
    console.log(`   • Análise comportamental: concluída`);
    console.log(`   • Tendências: detectadas`);
    console.log(`   • Opportunity scores: atualizados (${updatedCount} clusters)\n`);

    res.json({
      success: true,
      message: 'Pipeline completo executado com sucesso',
      clusters_updated: updatedCount
    });

  } catch (error: any) {
    console.error('\n❌ ERRO NO PIPELINE COMPLETO:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINTS DE PERSONAS DINÂMICAS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/dynamic-intelligence/personas
 * Lista todas as personas dinâmicas ativas
 */
router.get('/personas', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('v_personas_dashboard')
      .select('*');

    if (error) throw error;

    res.json({
      success: true,
      personas: data || [],
      total: data?.length || 0
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar personas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dynamic-intelligence/persona/:id
 * Detalhes completos de uma persona específica
 */
router.get('/persona/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: persona, error } = await supabase
      .from('dynamic_personas')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    // Buscar leads associados
    const { count: leadsCount } = await supabase
      .from('lead_persona_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('persona_id', id);

    res.json({
      success: true,
      persona: persona,
      assigned_leads: leadsCount || 0
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar persona:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/dynamic-intelligence/generate-personas
 * Gera personas dinâmicas via GPT baseado nos clusters
 */
router.post('/generate-personas', async (_req: Request, res: Response) => {
  try {
    console.log('\n🎭 Gerando personas via API...\n');

    const result = await personaGenerator.generatePersonas();

    // Registrar execução
    await supabase.rpc('execute_sql', {
      query_text: `
        INSERT INTO dynamic_intelligence_execution_log
        (status, execution_type, executed_at)
        VALUES ('success', 'persona_generation', NOW())
      `
    });

    res.json({
      success: result.success,
      message: 'Personas geradas com sucesso',
      personas_created: result.personas_created,
      personas_updated: result.personas_updated,
      leads_assigned: result.leads_assigned,
      errors: result.errors
    });

  } catch (error: any) {
    console.error('❌ Erro ao gerar personas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/dynamic-intelligence/recalculate-persona-metrics
 * Recalcula métricas das personas SEM gerar novas (GRATUITO)
 */
router.post('/recalculate-persona-metrics', async (_req: Request, res: Response) => {
  try {
    console.log('\n📊 Recalculando métricas de personas...\n');

    const result = await personaGenerator.recalculateMetricsOnly();

    res.json({
      success: true,
      message: 'Métricas de personas recalculadas',
      personas_updated: result.updated
    });

  } catch (error: any) {
    console.error('❌ Erro ao recalcular métricas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dynamic-intelligence/persona-stats
 * Estatísticas gerais das personas
 */
router.get('/persona-stats', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        SELECT
          COUNT(*) as total_personas,
          SUM(total_leads) as total_leads_assigned,
          AVG(avg_conversion_rate) as avg_conversion,
          AVG(monetization_potential) as avg_monetization,
          MAX(monetization_potential) as max_monetization,
          MIN(monetization_potential) as min_monetization
        FROM dynamic_personas
        WHERE is_active = true
      `
    });

    if (error) throw error;

    res.json({
      success: true,
      stats: data?.[0] || {}
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
