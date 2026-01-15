/**
 * Google Maps Scraper Routes
 * API para raspagem de empresas no Google Maps
 * Worker: ubs-google (porta 3007)
 */

import { Router, Request, Response } from 'express';
import {
  scrapeGoogleMaps,
  getPendingLeadsForEnrichment,
  updateLeadStatus,
  getScrapingStats,
  getScrapeLogs,
  clearScrapeLogs,
  GoogleMapsScraperConfig
} from '../services/google-maps-scraper.service';

const router = Router();

/**
 * POST /api/google-maps/scrape
 * Raspagem do Google Maps com extração de Instagram
 * Body: { termo, cidade, estado?, localizacao?, max_resultados? }
 * Busca: "Localização, Termo" (ex: "Av Faria Lima, Empresa")
 */
router.post('/scrape', async (req: Request, res: Response) => {
  try {
    const {
      termo,
      cidade,
      estado,
      localizacao,
      max_resultados = 50
    } = req.body;

    if (!termo || !cidade) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros obrigatórios: termo, cidade'
      });
    }

    const searchQuery = localizacao ? `${localizacao}, ${termo}` : `${cidade}, ${termo}`;
    console.log(`[Google Maps] Scraping: "${searchQuery}"`);

    const config: GoogleMapsScraperConfig = {
      termo,
      cidade,
      estado,
      localizacao,
      max_resultados
    };

    const result = await scrapeGoogleMaps(config);

    return res.status(200).json({
      success: result.success,
      search_query: localizacao ? `${localizacao}, ${termo}` : `${cidade}, ${termo}`,
      termo,
      cidade,
      estado,
      localizacao,
      total_scraped: result.total_scraped,
      with_website: result.with_website,
      with_instagram: result.with_instagram,
      saved: result.saved,
      duplicates: result.duplicates,
      errors: result.errors,
      leads: result.leads
    });
  } catch (error: any) {
    console.error('[Google Maps] Erro no scraping:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro no scraping'
    });
  }
});


/**
 * GET /api/google-maps/pending
 * Lista leads pendentes para enriquecimento no Instagram
 * Query: { limit?: number, theme?: string, city?: string }
 */
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const theme = req.query.theme as string;
    const city = req.query.city as string;

    const leads = await getPendingLeadsForEnrichment(limit, theme, city);

    return res.status(200).json({
      success: true,
      total: leads.length,
      leads
    });
  } catch (error: any) {
    console.error('[Google Maps] Erro ao buscar pendentes:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar leads pendentes'
    });
  }
});

/**
 * PATCH /api/google-maps/lead/:id/status
 * Atualiza status de um lead
 * Body: { status: 'pending' | 'enriched' | 'no_instagram' | 'error', instagram_lead_id?: string }
 */
router.patch('/lead/:id/status', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status, instagram_lead_id, error_message } = req.body;

    if (!id || !status) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros obrigatórios: id, status'
      });
    }

    const validStatuses = ['pending', 'enriched', 'no_instagram', 'error'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status inválido. Valores permitidos: ${validStatuses.join(', ')}`
      });
    }

    await updateLeadStatus(
      id,
      status,
      instagram_lead_id || undefined,
      error_message || undefined
    );

    return res.status(200).json({
      success: true,
      lead_id: id,
      new_status: status
    });
  } catch (error: any) {
    console.error('[Google Maps] Erro ao atualizar status:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao atualizar status'
    });
  }
});

/**
 * GET /api/google-maps/stats
 * Estatísticas de scraping
 * Query: { days?: number }
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const stats = await getScrapingStats(days);

    return res.status(200).json({
      success: true,
      period_days: days,
      stats
    });
  } catch (error: any) {
    console.error('[Google Maps] Erro ao buscar stats:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar estatísticas'
    });
  }
});

/**
 * GET /api/google-maps/health
 * Health check do worker
 */
router.get('/health', (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    service: 'ubs-google',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/google-maps/logs
 * Retorna logs do último scraping
 * Query: { level?: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' }
 */
router.get('/logs', (req: Request, res: Response) => {
  try {
    const level = req.query.level as string;
    let logs = getScrapeLogs();

    // Filtrar por level se especificado
    if (level) {
      logs = logs.filter(l => l.level === level.toUpperCase());
    }

    return res.status(200).json({
      success: true,
      total: logs.length,
      logs
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/google-maps/logs
 * Limpa logs
 */
router.delete('/logs', (_req: Request, res: Response) => {
  try {
    clearScrapeLogs();
    return res.status(200).json({
      success: true,
      message: 'Logs limpos'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
