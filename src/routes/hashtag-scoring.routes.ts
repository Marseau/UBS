import express from 'express';
import { hashtagLeadScorer } from '../services/hashtag-lead-scorer.service';

const router = express.Router();

/**
 * POST /api/hashtag-scoring/score-lead
 * Calcula score completo para um lead específico
 *
 * Body:
 * {
 *   "lead_id": "uuid-do-lead"
 * }
 */
router.post('/score-lead', async (req, res) => {
  try {
    const { lead_id } = req.body;

    if (!lead_id) {
      return res.status(400).json({
        success: false,
        message: 'Campo "lead_id" é obrigatório'
      });
    }

    console.log(`\n📊 [API] Calculando score para lead ${lead_id}`);

    const score = await hashtagLeadScorer.scoreLead(lead_id);

    return res.json({
      success: true,
      data: score
    });
  } catch (error: any) {
    console.error('❌ Erro em /score-lead:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-scoring/score-batch
 * Calcula score para múltiplos leads
 *
 * Body:
 * {
 *   "lead_ids": ["uuid1", "uuid2", "uuid3"]
 * }
 */
router.post('/score-batch', async (req, res) => {
  try {
    const { lead_ids } = req.body;

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Campo "lead_ids" deve ser um array não vazio'
      });
    }

    console.log(`\n📦 [API] Calculando score para ${lead_ids.length} leads`);

    const scores = await hashtagLeadScorer.scoreMultipleLeads(lead_ids);

    return res.json({
      success: true,
      data: scores,
      total: scores.length,
      summary: {
        p0_priority: scores.filter(s => s.priority === 'P0').length,
        p1_priority: scores.filter(s => s.priority === 'P1').length,
        p2_priority: scores.filter(s => s.priority === 'P2').length,
        p3_priority: scores.filter(s => s.priority === 'P3').length,
        avg_score: Math.round(scores.reduce((sum, s) => sum + s.total_score, 0) / scores.length)
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /score-batch:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-scoring/analyze-clusters
 * Análise completa de todos os clusters de negócio
 */
router.get('/analyze-clusters', async (req, res) => {
  try {
    console.log('\n🎯 [API] Analisando leads por cluster');

    const analyses = await hashtagLeadScorer.analyzeByCluster();

    return res.json({
      success: true,
      data: analyses,
      total_clusters: analyses.length
    });
  } catch (error: any) {
    console.error('❌ Erro em /analyze-clusters:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-scoring/update-lead-score
 * Atualiza o score de um lead no banco de dados
 *
 * Body:
 * {
 *   "lead_id": "uuid-do-lead"
 * }
 */
router.post('/update-lead-score', async (req, res) => {
  try {
    const { lead_id } = req.body;

    if (!lead_id) {
      return res.status(400).json({
        success: false,
        message: 'Campo "lead_id" é obrigatório'
      });
    }

    console.log(`\n💾 [API] Atualizando score do lead ${lead_id} no banco`);

    await hashtagLeadScorer.updateLeadScore(lead_id);

    return res.json({
      success: true,
      message: 'Score atualizado com sucesso'
    });
  } catch (error: any) {
    console.error('❌ Erro em /update-lead-score:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-scoring/score-all
 * ADMIN ONLY: Calcula score para TODOS os leads do banco (processo pesado)
 *
 * Body:
 * {
 *   "batch_size": 100  // opcional, default: 100
 * }
 */
router.post('/score-all', async (req, res) => {
  try {
    const { batch_size = 100 } = req.body;

    console.log('\n🚀 [API] Iniciando scoring em massa (processo longo)');

    // Executa em background para não bloquear a resposta
    hashtagLeadScorer.scoreAllLeads(batch_size).catch(error => {
      console.error('❌ Erro no scoring em massa:', error);
    });

    return res.json({
      success: true,
      message: 'Scoring em massa iniciado em background',
      batch_size
    });
  } catch (error: any) {
    console.error('❌ Erro em /score-all:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-scoring/clusters
 * Retorna definição de todos os clusters disponíveis
 */
router.get('/clusters', async (req, res) => {
  try {
    const { BUSINESS_CLUSTERS } = await import('../services/hashtag-lead-scorer.service');

    const clusters = Object.entries(BUSINESS_CLUSTERS).map(([id, data]) => ({
      id,
      name: data.name,
      hashtag_count: data.hashtags.length,
      priority_score: data.priority_score,
      avg_contact_rate: data.avg_contact_rate,
      sample_hashtags: data.hashtags.slice(0, 10)
    }));

    return res.json({
      success: true,
      data: clusters,
      total: clusters.length
    });
  } catch (error: any) {
    console.error('❌ Erro em /clusters:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
