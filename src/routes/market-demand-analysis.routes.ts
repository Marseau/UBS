/**
 * Market Demand Analysis Routes - D2P Framework
 *
 * API 100% DINAMICA para análise de demandas de mercado
 * Metodologia: KEYWORDS → LEADS → WORKAROUNDS → DECISÕES → SCORE → PRODUTO
 *
 * Sem mercados hardcoded - qualquer mercado pode ser analisado via keywords
 */

import express from 'express';
import {
  analyzeMarket,
  getMarketAnalysis,
  listMarketAnalyses,
  deleteMarketAnalysis
} from '../services/market-demand-analysis.service';

const router = express.Router();

/**
 * GET /api/market-demand/analyses
 * Lista todas as análises realizadas (ordenadas por score)
 */
router.get('/analyses', async (_req, res) => {
  try {
    const analyses = await listMarketAnalyses();
    res.json({ success: true, analyses });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/market-demand/analysis/:slug
 * Busca análise de um mercado específico
 */
router.get('/analysis/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const analysis = await getMarketAnalysis(slug);

    if (!analysis) {
      res.status(404).json({
        success: false,
        error: 'Análise não encontrada para este mercado'
      });
      return;
    }

    res.json({ success: true, analysis });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/market-demand/analyze
 * Executa análise completa de um mercado (100% DINAMICO via embedding)
 * Body: { name: string }
 *
 * Pipeline automatico:
 * 1. Gera embedding do nome do mercado
 * 2. Busca leads similares via pgvector
 * 3. Extrai keywords automaticamente das bios
 * 4. Analisa workarounds e sinais de dor
 * 5. GPT traduz em decisoes e define produto
 *
 * Exemplo:
 * { "name": "Confeitarias" }
 */
router.post('/analyze', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        error: 'name é obrigatório'
      });
      return;
    }

    console.log(`[D2P API] Iniciando análise via embedding: ${name}`);

    const analysis = await analyzeMarket(name);

    res.json({ success: true, analysis });
  } catch (error: any) {
    console.error('[D2P API] Erro na análise:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/market-demand/analysis/:slug
 * Remove uma análise de mercado
 */
router.delete('/analysis/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    await deleteMarketAnalysis(slug);
    res.json({ success: true, message: 'Análise removida' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
