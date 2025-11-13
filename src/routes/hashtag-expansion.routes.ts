import express from 'express';
import { searchTermsExpander } from '../services/hashtag-search-terms-expander.service';

const router = express.Router();

/**
 * POST /api/hashtag-expansion/expand-from-frequency
 * Expande termos baseado em hashtags mais frequentes
 *
 * Body:
 * {
 *   "min_frequency": 20,  // opcional, default: 20
 *   "limit": 50           // opcional, default: 50
 * }
 */
router.post('/expand-from-frequency', async (req, res) => {
  try {
    const { min_frequency = 20, limit = 50 } = req.body;

    console.log(`\n📊 [API] Expandindo termos por frequência`);

    const terms = await searchTermsExpander.expandFromFrequency(min_frequency, limit);

    return res.json({
      success: true,
      data: terms,
      total: terms.length,
      new_terms: terms.filter(t => !t.already_exists).length
    });
  } catch (error: any) {
    console.error('❌ Erro em /expand-from-frequency:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-expansion/expand-from-clusters
 * Expande termos baseado em clusters de negócio
 */
router.post('/expand-from-clusters', async (req, res) => {
  try {
    console.log('\n🎯 [API] Expandindo termos por clusters');

    const terms = await searchTermsExpander.expandFromClusters();

    return res.json({
      success: true,
      data: terms,
      total: terms.length
    });
  } catch (error: any) {
    console.error('❌ Erro em /expand-from-clusters:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-expansion/expand-from-cooccurrence
 * Expande termos baseado em co-ocorrência com termos já scrapeados
 *
 * Body:
 * {
 *   "min_cooccurrence": 15  // opcional, default: 15
 * }
 */
router.post('/expand-from-cooccurrence', async (req, res) => {
  try {
    const { min_cooccurrence = 15 } = req.body;

    console.log('\n🔗 [API] Expandindo termos por co-ocorrência');

    const terms = await searchTermsExpander.expandFromCooccurrence(min_cooccurrence);

    return res.json({
      success: true,
      data: terms,
      total: terms.length
    });
  } catch (error: any) {
    console.error('❌ Erro em /expand-from-cooccurrence:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-expansion/expand-all
 * Executa expansão completa: frequência + clusters + co-ocorrência
 *
 * Body:
 * {
 *   "auto_add": false  // opcional, se true adiciona automaticamente ao banco
 * }
 */
router.post('/expand-all', async (req, res) => {
  try {
    const { auto_add = false } = req.body;

    console.log('\n🚀 [API] Expansão completa de termos');

    const result = await searchTermsExpander.expandAll(auto_add);

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Erro em /expand-all:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-expansion/export-for-n8n
 * Exporta lista de termos priorizados para scraping no N8N
 *
 * Query params:
 * - limit: número máximo de termos (default: 50)
 */
router.get('/export-for-n8n', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    console.log(`\n📤 [API] Exportando ${limit} termos para N8N`);

    const terms = await searchTermsExpander.exportForN8N(limit);

    return res.json({
      success: true,
      data: terms,
      total: terms.length,
      format: 'array_of_strings',
      usage: 'Use este array no N8N loop para scraping sequencial'
    });
  } catch (error: any) {
    console.error('❌ Erro em /export-for-n8n:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-expansion/generate-report
 * Gera relatório completo de expansão em markdown
 */
router.get('/generate-report', async (req, res) => {
  try {
    console.log('\n📄 [API] Gerando relatório de expansão');

    const report = await searchTermsExpander.generateExpansionReport();

    return res.json({
      success: true,
      data: {
        report_markdown: report,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /generate-report:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
