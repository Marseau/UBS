import { Router, Request, Response } from 'express';
import { EditorialContentService } from '../services/editorial-content.service';

const router = Router();

/**
 * GET /api/editorial-content/latest
 * Retorna o conteúdo editorial mais recente (última semana)
 */
router.get('/latest', async (req: Request, res: Response) => {
  try {
    const content = await EditorialContentService.getLatestContent();

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum conteúdo editorial disponível',
      });
    }

    return res.json({
      success: true,
      data: content,
    });
  } catch (error: any) {
    console.error('❌ Error fetching latest editorial content:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar conteúdo editorial',
      details: error.message,
    });
  }
});

/**
 * GET /api/editorial-content/stats
 * Retorna estatísticas totais do conteúdo editorial
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await EditorialContentService.getStatistics();

    return res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('❌ Error fetching editorial content stats:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar estatísticas',
      details: error.message,
    });
  }
});

/**
 * GET /api/editorial-content/week/:weekNumber/:year
 * Retorna conteúdo de uma semana específica
 */
router.get('/week/:weekNumber/:year', async (req: Request, res: Response) => {
  try {
    const weekNumber = parseInt(req.params.weekNumber || '0');
    const year = parseInt(req.params.year || '0');

    if (isNaN(weekNumber) || isNaN(year)) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros inválidos',
      });
    }

    const content = await EditorialContentService.getContentByWeek(weekNumber, year);

    if (!content) {
      return res.status(404).json({
        success: false,
        message: `Conteúdo não encontrado para semana ${weekNumber}/${year}`,
      });
    }

    return res.json({
      success: true,
      data: content,
    });
  } catch (error: any) {
    console.error('❌ Error fetching editorial content by week:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar conteúdo da semana',
      details: error.message,
    });
  }
});

/**
 * GET /api/editorial-content/weeks
 * Lista todas as semanas disponíveis
 */
router.get('/weeks', async (_req: Request, res: Response) => {
  try {
    const weeks = await EditorialContentService.listAllWeeks();

    return res.json({
      success: true,
      data: weeks,
    });
  } catch (error: any) {
    console.error('❌ Error listing weeks:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao listar semanas',
      details: error.message,
    });
  }
});

/**
 * GET /api/editorial-content/all
 * Retorna TODO o conteúdo editorial de todas as semanas (completo)
 */
router.get('/all', async (_req: Request, res: Response) => {
  try {
    const allContent = await EditorialContentService.getAllContent();

    return res.json({
      success: true,
      data: allContent,
    });
  } catch (error: any) {
    console.error('❌ Error fetching all editorial content:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar todo o conteúdo editorial',
      details: error.message,
    });
  }
});

export default router;
