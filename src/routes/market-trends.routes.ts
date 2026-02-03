/**
 * MARKET TRENDS ROUTES
 *
 * APIs para descoberta de demandas de mercado.
 *
 * Endpoints:
 * - GET /api/market/trends - Descobrir tendências de demanda
 * - GET /api/market/trends/:niche - Tendências por nicho específico
 * - GET /api/market/signals - Lista categorias de sinais monitorados
 */

import express from 'express';
import { marketTrendsService } from '../services/market-trends.service';

const DEMAND_SIGNALS = marketTrendsService.DEMAND_SIGNALS;

const router = express.Router();

/**
 * GET /api/market/trends
 * Descobre as principais demandas do mercado
 *
 * Query params:
 * - daysBack: número de dias para análise (default: 45)
 * - minCount: contagem mínima para aparecer (default: 50)
 * - niche: filtrar por nicho específico (opcional)
 */
router.get('/trends', async (req, res) => {
  try {
    const daysBack = parseInt(req.query.daysBack as string) || 45;
    const minCount = parseInt(req.query.minCount as string) || 50;
    const niche = req.query.niche as string | undefined;

    const result = await marketTrendsService.discoverMarketTrends({
      daysBack,
      minCount,
      businessCategory: niche,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[MARKET TRENDS] Erro:', error);
    return res.status(500).json({
      error: 'Erro ao analisar tendências',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/market/trends/:niche
 * Tendências de um nicho específico
 */
router.get('/trends/:niche', async (req, res) => {
  try {
    const { niche } = req.params;

    const result = await marketTrendsService.analyzeNicheDemands(niche);

    return res.json({
      success: true,
      niche,
      ...result,
    });
  } catch (error) {
    console.error('[MARKET TRENDS] Erro:', error);
    return res.status(500).json({
      error: 'Erro ao analisar nicho',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/market/signals
 * Lista todas as categorias de sinais de demanda monitorados
 */
router.get('/signals', (_req, res) => {
  const signals = Object.entries(DEMAND_SIGNALS).map(([category, config]: [string, { keywords: string[]; description: string }]) => ({
    category,
    description: config.description,
    keywords_count: config.keywords.length,
    sample_keywords: config.keywords.slice(0, 5),
  }));

  return res.json({
    success: true,
    total_categories: signals.length,
    signals,
  });
});

/**
 * GET /api/market/compare
 * Compara tendências entre períodos
 */
router.get('/compare', async (req, res) => {
  try {
    const currentDays = parseInt(req.query.currentDays as string) || 15;
    const previousDays = parseInt(req.query.previousDays as string) || 30;

    const result = await marketTrendsService.compareTrendPeriods(currentDays, previousDays);

    // Identificar tendências em alta
    const rising = result.changes.filter(c => c.direction === 'up').map(c => c.category);
    const declining = result.changes.filter(c => c.direction === 'down').map(c => c.category);

    return res.json({
      success: true,
      period: {
        current: `últimos ${currentDays} dias`,
        previous: `últimos ${previousDays} dias`,
      },
      rising_demands: rising,
      declining_demands: declining,
      changes: result.changes,
      current_trends: result.current.trends,
    });
  } catch (error) {
    console.error('[MARKET TRENDS] Erro na comparação:', error);
    return res.status(500).json({
      error: 'Erro ao comparar períodos',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
