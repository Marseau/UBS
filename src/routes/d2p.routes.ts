/**
 * D2P Unified Routes - Decision-to-Product Framework
 *
 * API for BERTopic + pgvector market analysis with versioning
 *
 * Endpoints:
 *   POST /api/d2p/analyze          - New analysis
 *   GET  /api/d2p/markets          - List analyzed markets
 *   GET  /api/d2p/market/:slug     - Get latest analysis
 *   GET  /api/d2p/market/:slug/history - Analysis history
 *   GET  /api/d2p/version/:id      - Specific version
 *   GET  /api/d2p/compare          - Compare two versions
 *   DELETE /api/d2p/market/:slug   - Delete market analyses
 */

import * as express from 'express';
import { Request, Response } from 'express';
import {
  analyzeMarket,
  getLatestAnalysis,
  getAnalysisByVersion,
  getAnalysisHistory,
  compareVersions,
  listAnalyzedMarkets,
  deleteMarketAnalyses,
  reanalyzeMarket
} from '../services/d2p-unified.service';

const router = express.Router();

/**
 * POST /api/d2p/analyze
 * Run new market analysis using batch vector similarity + BERTopic
 *
 * Body: {
 *   market_name: string,
 *   min_similarity?: number (default 0.65) - fixed threshold for semantic match
 *   min_leads?: number (default 100)
 * }
 */
router.post('/analyze', async (req: Request, res: Response): Promise<void> => {
  try {
    const { market_name, min_similarity, min_leads, max_results } = req.body;

    if (!market_name) {
      res.status(400).json({
        success: false,
        error: 'market_name is required'
      });
      return;
    }

    console.log(`[D2P API] Starting analysis: ${market_name} (threshold: ${min_similarity ?? 0.7})`);

    const analysis = await analyzeMarket(market_name, {
      minSimilarity: min_similarity,
      minLeads: min_leads,
      maxResults: max_results
    });

    res.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    console.error('[D2P API] Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/d2p/markets
 * List all analyzed markets with summary info
 */
router.get('/markets', async (_req: Request, res: Response): Promise<void> => {
  try {
    const markets = await listAnalyzedMarkets();
    res.json({
      success: true,
      count: markets.length,
      markets
    });
  } catch (error: any) {
    console.error('[D2P API] List markets error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/d2p/market/:slug
 * Get latest analysis for a market
 */
router.get('/market/:slug', async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = req.params.slug;
    if (!slug) {
      res.status(400).json({ success: false, error: 'slug is required' });
      return;
    }

    const analysis = await getLatestAnalysis(slug);

    if (!analysis) {
      res.status(404).json({
        success: false,
        error: `No analysis found for market: ${slug}`
      });
      return;
    }

    res.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    console.error('[D2P API] Get market error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/d2p/market/:slug/history
 * Get analysis history for a market
 *
 * Query params:
 *   limit: number (default 10)
 */
router.get('/market/:slug/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = req.params.slug;
    if (!slug) {
      res.status(400).json({ success: false, error: 'slug is required' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 10;

    const history = await getAnalysisHistory(slug, limit);

    if (history.length === 0) {
      res.status(404).json({
        success: false,
        error: `No analysis history found for market: ${slug}`
      });
      return;
    }

    res.json({
      success: true,
      market_slug: slug,
      total_versions: history.length,
      history
    });
  } catch (error: any) {
    console.error('[D2P API] Get history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/d2p/market/:slug/reanalyze
 * Re-run analysis for an existing market (creates new version)
 *
 * Body: {
 *   min_similarity?: number (default 0.65)
 *   min_leads?: number (default 100)
 * }
 */
router.post('/market/:slug/reanalyze', async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = req.params.slug;
    if (!slug) {
      res.status(400).json({ success: false, error: 'slug is required' });
      return;
    }

    const { min_similarity, min_leads } = req.body;

    console.log(`[D2P API] Re-analyzing market: ${slug} (threshold: ${min_similarity ?? 0.7})`);

    const analysis = await reanalyzeMarket(slug, {
      minSimilarity: min_similarity,
      minLeads: min_leads
    });

    res.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    console.error('[D2P API] Reanalyze error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/d2p/version/:id
 * Get specific analysis version by version_id
 */
router.get('/version/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: 'id is required' });
      return;
    }

    const analysis = await getAnalysisByVersion(id);

    if (!analysis) {
      res.status(404).json({
        success: false,
        error: `Version not found: ${id}`
      });
      return;
    }

    res.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    console.error('[D2P API] Get version error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/d2p/compare
 * Compare two analysis versions
 *
 * Query params:
 *   v1: version_id (older version)
 *   v2: version_id (newer version)
 */
router.get('/compare', async (req: Request, res: Response): Promise<void> => {
  try {
    const v1 = req.query.v1 as string | undefined;
    const v2 = req.query.v2 as string | undefined;

    if (!v1 || !v2) {
      res.status(400).json({
        success: false,
        error: 'Both v1 and v2 query parameters are required'
      });
      return;
    }

    const comparison = await compareVersions(v1, v2);

    if (!comparison) {
      res.status(404).json({
        success: false,
        error: 'One or both versions not found'
      });
      return;
    }

    res.json({
      success: true,
      comparison
    });
  } catch (error: any) {
    console.error('[D2P API] Compare error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/d2p/market/:slug
 * Delete all analyses for a market
 */
router.delete('/market/:slug', async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = req.params.slug;
    if (!slug) {
      res.status(400).json({ success: false, error: 'slug is required' });
      return;
    }

    await deleteMarketAnalyses(slug);

    res.json({
      success: true,
      message: `All analyses deleted for market: ${slug}`
    });
  } catch (error: any) {
    console.error('[D2P API] Delete error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/d2p/health
 * Health check endpoint
 */
router.get('/health', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    service: 'd2p-unified',
    version: '1.0.0',
    engine: 'BERTopic + pgvector',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/d2p/embedding-status
 * Returns current embedding_d2p generation progress
 */
router.get('/embedding-status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { getEmbeddingStatus } = await import('../services/d2p-unified.service');
    const status = await getEmbeddingStatus();
    res.json({ success: true, ...status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
