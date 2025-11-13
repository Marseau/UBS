import express from 'express';
import { hashtagSuggester } from '../services/hashtag-cooccurrence-suggester.service';

const router = express.Router();

/**
 * POST /api/hashtag-suggestions/from-hashtags
 * Sugere novos termos de scraping baseado em lista de hashtags
 *
 * Body:
 * {
 *   "hashtags": ["empreendedorismo", "marketingdigital", "vendas"],
 *   "min_cooccurrence": 10,    // opcional, default: 10
 *   "max_suggestions": 20       // opcional, default: 20
 * }
 */
router.post('/from-hashtags', async (req, res) => {
  try {
    const {
      hashtags,
      min_cooccurrence = 10,
      max_suggestions = 20
    } = req.body;

    if (!hashtags || !Array.isArray(hashtags) || hashtags.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Campo "hashtags" deve ser um array não vazio'
      });
    }

    console.log(`\n🔍 [API] Sugestões para ${hashtags.length} hashtags`);

    const analysis = await hashtagSuggester.suggestFromHashtags(
      hashtags,
      min_cooccurrence,
      max_suggestions
    );

    return res.json({
      success: true,
      data: analysis
    });
  } catch (error: any) {
    console.error('❌ Erro em /from-hashtags:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-suggestions/from-lead
 * Sugere novos termos baseado nas hashtags de um lead específico
 *
 * Body:
 * {
 *   "lead_id": "uuid-do-lead",
 *   "auto_add": false  // opcional, se true adiciona automaticamente termos de alta confiança
 * }
 */
router.post('/from-lead', async (req, res) => {
  try {
    const { lead_id, auto_add = false } = req.body;

    if (!lead_id) {
      return res.status(400).json({
        success: false,
        message: 'Campo "lead_id" é obrigatório'
      });
    }

    console.log(`\n📌 [API] Sugestões para lead ${lead_id}`);

    const analysis = await hashtagSuggester.suggestFromLead(lead_id, auto_add);

    return res.json({
      success: true,
      data: analysis
    });
  } catch (error: any) {
    console.error('❌ Erro em /from-lead:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-suggestions/from-batch
 * Sugere novos termos baseado em múltiplos leads (ex: todos os leads de uma tag)
 *
 * Body:
 * {
 *   "lead_ids": ["uuid1", "uuid2", "uuid3"],
 *   "consolidate": true  // opcional, se true consolida todas as sugestões em uma análise
 * }
 */
router.post('/from-batch', async (req, res) => {
  try {
    const { lead_ids, consolidate = true } = req.body;

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Campo "lead_ids" deve ser um array não vazio'
      });
    }

    console.log(`\n📦 [API] Sugestões para ${lead_ids.length} leads`);

    const analyses = await hashtagSuggester.suggestFromMultipleLeads(
      lead_ids,
      consolidate
    );

    return res.json({
      success: true,
      data: consolidate ? analyses[0] : analyses,
      leads_analyzed: lead_ids.length
    });
  } catch (error: any) {
    console.error('❌ Erro em /from-batch:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-suggestions/top-opportunities
 * Retorna as melhores oportunidades de expansão baseadas em toda a base de dados
 * (hashtags frequentes que ainda não foram scrapeadas)
 */
router.get('/top-opportunities', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    console.log(`\n🔥 [API] Buscando top ${limit} oportunidades de expansão`);

    // Query para encontrar hashtags inexploradas com maior potencial
    // Será implementada diretamente no Supabase

    res.json({
      success: true,
      message: 'Funcionalidade em desenvolvimento',
      hint: 'Use QUERY 7 do dashboard SQL: hashtag-analytics-dashboard.sql'
    });
  } catch (error: any) {
    console.error('❌ Erro em /top-opportunities:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
