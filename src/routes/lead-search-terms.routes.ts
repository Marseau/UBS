import express from 'express';
import { leadSearchTermsPopulator } from '../services/lead-search-terms-populator.service';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * POST /api/lead-search-terms/populate-from-clusters
 * Popula tabela com dados dos 5 clusters
 */
router.post('/populate-from-clusters', async (req, res) => {
  try {
    console.log('\n🎯 [API] Populando tabela com clusters');

    const result = await leadSearchTermsPopulator.populateFromClusters();

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Erro em /populate-from-clusters:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/lead-search-terms/populate-from-frequency
 * Popula com hashtags por faixa de frequência
 *
 * Body (opcional):
 * {
 *   "tiers": [
 *     { "min": 100, "max": 999999, "limit": 30 },
 *     { "min": 50, "max": 99, "limit": 40 }
 *   ]
 * }
 */
router.post('/populate-from-frequency', async (req, res) => {
  try {
    const { tiers } = req.body;

    console.log('\n📊 [API] Populando tabela por frequência');

    const result = await leadSearchTermsPopulator.populateFromTopHashtags(tiers);

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Erro em /populate-from-frequency:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/lead-search-terms/populate-from-premium
 * Popula com hashtags premium (melhor taxa de contato)
 *
 * Body (opcional):
 * {
 *   "min_contact_rate": 65,
 *   "min_leads": 20
 * }
 */
router.post('/populate-from-premium', async (req, res) => {
  try {
    const {
      min_contact_rate = 65,
      min_leads = 20
    } = req.body;

    console.log('\n💎 [API] Populando tabela com hashtags premium');

    const result = await leadSearchTermsPopulator.populateFromPremiumHashtags(
      min_contact_rate,
      min_leads
    );

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Erro em /populate-from-premium:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/lead-search-terms/populate-from-expansion
 * Popula com expansão automática (novos termos descobertos)
 *
 * Body (opcional):
 * {
 *   "limit": 100
 * }
 */
router.post('/populate-from-expansion', async (req, res) => {
  try {
    const { limit = 100 } = req.body;

    console.log('\n🚀 [API] Populando tabela com expansão automática');

    const result = await leadSearchTermsPopulator.populateFromExpansion(limit);

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Erro em /populate-from-expansion:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/lead-search-terms/populate-all
 * População completa: executa todas as 4 estratégias
 */
router.post('/populate-all', async (req, res) => {
  try {
    console.log('\n🎯 [API] População completa da tabela');

    const result = await leadSearchTermsPopulator.populateAll();

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Erro em /populate-all:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/lead-search-terms/list
 * Lista todos os registros da tabela
 *
 * Query params:
 * - limit: número máximo de registros (default: 50)
 * - order_by: campo para ordenação (default: 'generated_at')
 */
router.get('/list', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const orderBy = (req.query.order_by as string) || 'generated_at';

    console.log(`\n📋 [API] Listando registros (limit: ${limit})`);

    const { data, error } = await supabase
      .from('lead_search_terms')
      .select('*')
      .order(orderBy, { ascending: false })
      .limit(limit);

    if (error) throw error;

    return res.json({
      success: true,
      data: data || [],
      total: data?.length || 0
    });
  } catch (error: any) {
    console.error('❌ Erro em /list:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/lead-search-terms/:id
 * Busca registro específico por ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`\n🔍 [API] Buscando registro ${id}`);

    const { data, error } = await supabase
      .from('lead_search_terms')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Registro não encontrado'
      });
    }

    return res.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('❌ Erro em /:id:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/lead-search-terms/stats/summary
 * Estatísticas resumidas da tabela
 */
router.get('/stats/summary', async (req, res) => {
  try {
    console.log('\n📊 [API] Gerando estatísticas resumidas');

    const { data: entries } = await supabase
      .from('lead_search_terms')
      .select('*');

    if (!entries) {
      return res.json({
        success: true,
        data: {
          total_entries: 0,
          total_terms: 0,
          avg_terms_per_entry: 0,
          total_leads_generated: 0
        }
      });
    }

    const totalTerms = entries.reduce((sum, e) => sum + (e.terms_count || 0), 0);
    const totalLeadsGenerated = entries.reduce((sum, e) => sum + (e.leads_generated || 0), 0);

    return res.json({
      success: true,
      data: {
        total_entries: entries.length,
        total_terms: totalTerms,
        avg_terms_per_entry: Math.round(totalTerms / entries.length),
        total_leads_generated: totalLeadsGenerated,
        entries_by_model: entries.reduce((acc: any, e) => {
          const model = e.generated_by_model || 'unknown';
          acc[model] = (acc[model] || 0) + 1;
          return acc;
        }, {})
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /stats/summary:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/lead-search-terms/:id
 * Remove registro por ID
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`\n🗑️  [API] Removendo registro ${id}`);

    const { error } = await supabase
      .from('lead_search_terms')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.json({
      success: true,
      message: 'Registro removido com sucesso'
    });
  } catch (error: any) {
    console.error('❌ Erro em DELETE /:id:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
