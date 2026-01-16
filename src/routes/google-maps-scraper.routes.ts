/**
 * Google Maps Scraper Routes
 * API para raspagem de empresas no Google Maps
 * Worker: ubs-google (porta 3007)
 */

import { Router, Request, Response } from 'express';
import {
  scrapeGoogleMaps,
  scrapeGridPoint,
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

/**
 * POST /api/google-maps/scrape-coords
 * Raspagem do Google Maps usando coordenadas (lat/lng)
 * Usa a função scrapeGoogleMaps com parâmetros lat/lng
 * Body: { keyword, lat, lng, zoom?, cidade?, estado?, max_resultados?, gridPointId? }
 */
router.post('/scrape-coords', async (req: Request, res: Response) => {
  try {
    const {
      keyword,
      lat,
      lng,
      zoom = 17,
      cidade = 'São Paulo',
      estado = 'SP',
      max_resultados = 50,
      gridPointId
    } = req.body;

    if (!keyword || lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros obrigatórios: keyword, lat, lng'
      });
    }

    console.log(`[Google Maps] Scraping por coordenadas: "${keyword}" @ ${lat},${lng}`);

    // Usa a função original com parâmetros de coordenadas
    const config: GoogleMapsScraperConfig = {
      termo: keyword,
      cidade,
      estado,
      max_resultados: parseInt(max_resultados as any) || 50,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      zoom: parseInt(zoom as any) || 17,
      gridPointId: gridPointId ? parseInt(gridPointId) : undefined
    };

    const result = await scrapeGoogleMaps(config);

    return res.status(200).json({
      success: result.success,
      keyword,
      lat: config.lat,
      lng: config.lng,
      zoom: config.zoom,
      total_scraped: result.total_scraped,
      with_website: result.with_website,
      with_instagram: result.with_instagram,
      saved: result.saved,
      duplicates: result.duplicates,
      errors: result.errors,
      leads: result.leads
    });
  } catch (error: any) {
    console.error('[Google Maps] Erro no scraping por coordenadas:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro no scraping por coordenadas'
    });
  }
});

/**
 * POST /api/google-maps/scrape-grid-point/:id
 * Raspagem de um ponto do grid com todas suas keywords
 * Params: id (grid point id)
 */
router.post('/scrape-grid-point/:id', async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id || '';
    const gridPointId = parseInt(idParam);

    if (!gridPointId || isNaN(gridPointId)) {
      return res.status(400).json({
        success: false,
        error: 'ID do grid point inválido'
      });
    }

    console.log(`[Google Maps] Iniciando scrape do grid point ${gridPointId}`);

    const { point, results, totals } = await scrapeGridPoint(gridPointId);

    // Agregar dados das keywords
    const keywordsData = results.map(r => ({
      keyword: r.keyword,
      total_scraped: r.result.total_scraped,
      with_instagram: r.result.with_instagram,
      saved: r.result.saved
    }));

    return res.status(200).json({
      success: true,
      grid_point_id: gridPointId,
      point: {
        regiao: point.regiao,
        bairro: point.bairro,
        lat: point.lat,
        lng: point.lng,
        keywords: point.keywords
      },
      keywords_processed: results.length,
      total_scraped: totals.scraped,
      total_with_instagram: totals.instagram,
      total_saved: totals.saved,
      results_by_keyword: keywordsData
    });
  } catch (error: any) {
    console.error('[Google Maps] Erro ao processar grid point:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao processar grid point'
    });
  }
});

export default router;
