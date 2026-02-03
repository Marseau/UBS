/**
 * DEMAND SEARCH ROUTES
 *
 * APIs para busca semântica de demandas de mercado.
 *
 * Endpoints:
 * - POST /api/demand/search - Busca leads por demanda (texto livre)
 * - POST /api/demand/analyze - Análise agregada de demanda
 * - GET /api/demand/predefined - Lista demandas pré-definidas
 * - GET /api/demand/predefined/:key - Busca por demanda pré-definida
 */

import express from 'express';
import {
  demandSearchService,
  DemandSearchOptions,
  DEMAND_QUERIES,
} from '../services/demand-search.service';

const router = express.Router();

/**
 * POST /api/demand/search
 * Busca leads por demanda usando texto em linguagem natural
 *
 * Body:
 * - query: string - Texto da demanda (ex: "quero emagrecer", "preciso de mais clientes")
 * - limit?: number - Máximo de resultados (default: 50)
 * - minSimilarity?: number - Similaridade mínima 0-1 (default: 0.3)
 * - businessCategory?: string - Filtrar por categoria
 * - requireWhatsapp?: boolean - Apenas leads com WhatsApp
 * - campaignId?: string - Filtrar por campanha
 */
router.post('/search', async (req, res) => {
  try {
    const { query, ...options } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return res.status(400).json({
        error: 'Query inválida',
        message: 'Informe uma query de busca com pelo menos 3 caracteres',
      });
    }

    const results = await demandSearchService.searchByDemand(query, options as DemandSearchOptions);

    return res.json({
      success: true,
      query,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error('[DEMAND SEARCH] Erro na busca:', error);
    return res.status(500).json({
      error: 'Erro na busca',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/demand/analyze
 * Análise agregada de demanda com insights
 *
 * Body:
 * - query: string - Texto da demanda
 * - options?: DemandSearchOptions
 */
router.post('/analyze', async (req, res) => {
  try {
    const { query, ...options } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return res.status(400).json({
        error: 'Query inválida',
        message: 'Informe uma query de busca com pelo menos 3 caracteres',
      });
    }

    const analysis = await demandSearchService.analyzeDemand(query, options as DemandSearchOptions);

    return res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('[DEMAND SEARCH] Erro na análise:', error);
    return res.status(500).json({
      error: 'Erro na análise',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/demand/predefined
 * Lista todas as demandas pré-definidas disponíveis
 */
router.get('/predefined', (_req, res) => {
  const predefined = Object.entries(DEMAND_QUERIES).map(([key, query]) => ({
    key,
    query,
    description: getDescription(key),
  }));

  return res.json({
    success: true,
    predefined,
  });
});

/**
 * GET /api/demand/predefined/:key
 * Busca leads por uma demanda pré-definida
 */
router.get('/predefined/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { limit, minSimilarity, businessCategory, requireWhatsapp } = req.query;

    if (!(key in DEMAND_QUERIES)) {
      return res.status(404).json({
        error: 'Demanda não encontrada',
        message: `Demanda "${key}" não existe. Use GET /api/demand/predefined para ver opções.`,
        available: Object.keys(DEMAND_QUERIES),
      });
    }

    const options: DemandSearchOptions = {};
    if (limit) options.limit = parseInt(limit as string, 10);
    if (minSimilarity) options.minSimilarity = parseFloat(minSimilarity as string);
    if (businessCategory) options.businessCategory = businessCategory as string;
    if (requireWhatsapp) options.requireWhatsapp = requireWhatsapp === 'true';

    const results = await demandSearchService.searchPredefinedDemand(
      key as keyof typeof DEMAND_QUERIES,
      options
    );

    return res.json({
      success: true,
      demand: key,
      query: DEMAND_QUERIES[key as keyof typeof DEMAND_QUERIES],
      total: results.length,
      results,
    });
  } catch (error) {
    console.error('[DEMAND SEARCH] Erro na busca pré-definida:', error);
    return res.status(500).json({
      error: 'Erro na busca',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/demand/categories
 * Lista categorias de negócio disponíveis com contagem de leads
 */
router.get('/categories', async (_req, res) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase.rpc('get_business_categories_stats');

    if (error) {
      // Fallback: query simples
      const { data: fallbackData } = await supabase
        .from('instagram_leads')
        .select('business_category')
        .not('business_category', 'is', null)
        .limit(10000);

      const counts = new Map<string, number>();
      (fallbackData || []).forEach((row: any) => {
        const cat = row.business_category || 'outros';
        counts.set(cat, (counts.get(cat) || 0) + 1);
      });

      const categories = Array.from(counts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      return res.json({ success: true, categories });
    }

    return res.json({ success: true, categories: data });
  } catch (error) {
    console.error('[DEMAND SEARCH] Erro ao buscar categorias:', error);
    return res.status(500).json({
      error: 'Erro ao buscar categorias',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

function getDescription(key: string): string {
  const descriptions: Record<string, string> = {
    emagrecimento: 'Pessoas interessadas em perder peso e dieta',
    ansiedade: 'Pessoas com interesse em saúde mental e bem-estar',
    dor: 'Pessoas buscando tratamento para dores',
    vendas: 'Pessoas interessadas em aumentar vendas e faturamento',
    marketing: 'Pessoas interessadas em marketing digital',
    produtividade: 'Pessoas buscando melhorar produtividade',
    autoestima: 'Pessoas interessadas em autoestima e confiança',
    cabelo: 'Pessoas com interesse em tratamentos capilares',
    hipertrofia: 'Pessoas interessadas em ganho de massa muscular',
    performance: 'Pessoas buscando melhorar performance atlética',
  };
  return descriptions[key] || 'Demanda customizada';
}

export default router;
