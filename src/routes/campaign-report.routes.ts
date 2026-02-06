/**
 * Campaign Report Routes
 *
 * Rotas para relatórios e encerramento de campanhas:
 * - GET /api/campaigns/:id/report - Dados do relatório
 * - GET /api/campaigns/:id/report/pdf - Download PDF
 * - POST /api/campaigns/:id/close - Encerra campanha
 * - GET /api/campaigns/:id/metrics - Métricas em tempo real
 * - GET /api/campaigns/:id/metrics/daily - Métricas diárias para gráficos
 */

import { Router, Request, Response } from 'express';
import { campaignReportService } from '../services/campaign-report.service';

const router = Router();

// ============================================================================
// MÉTRICAS EM TEMPO REAL
// ============================================================================

/**
 * GET /api/campaigns/:id/metrics
 * Retorna métricas consolidadas da campanha em tempo real
 */
router.get('/:id/metrics', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const metrics = await campaignReportService.getCampaignMetrics(id);

    if (!metrics) {
      res.status(404).json({ error: 'Campanha não encontrada' });
      return;
    }

    res.json({
      success: true,
      metrics
    });
  } catch (error: any) {
    console.error('[CampaignReport] Erro ao buscar métricas:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:id/metrics/daily
 * Retorna métricas diárias para gráficos de evolução
 */
router.get('/:id/metrics/daily', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const dailyMetrics = await campaignReportService.getDailyMetrics(id);

    res.json({
      success: true,
      campaign_id: id,
      daily_metrics: dailyMetrics
    });
  } catch (error: any) {
    console.error('[CampaignReport] Erro ao buscar métricas diárias:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// RELATÓRIO
// ============================================================================

/**
 * GET /api/campaigns/:id/report
 * Retorna dados completos do relatório (métricas + histórico)
 */
router.get('/:id/report', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const report = await campaignReportService.generateReport(id);

    if (!report) {
      res.status(404).json({ error: 'Campanha não encontrada' });
      return;
    }

    res.json({
      success: true,
      report
    });
  } catch (error: any) {
    console.error('[CampaignReport] Erro ao gerar relatório:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:id/report/pdf
 * Gera e retorna PDF do relatório
 */
router.get('/:id/report/pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { download } = req.query;

    const result = await campaignReportService.generatePDF(id);

    if (!result.success || !result.pdfBuffer) {
      res.status(400).json({ error: result.error || 'Erro ao gerar PDF' });
      return;
    }

    // Buscar nome da campanha para o filename
    const metrics = await campaignReportService.getCampaignMetrics(id);
    const campaignName = metrics?.campaign_name || 'campanha';
    const safeFileName = campaignName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const fileName = `relatorio-${safeFileName}-${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      download === 'true' ? `attachment; filename="${fileName}"` : `inline; filename="${fileName}"`
    );
    res.setHeader('Content-Length', result.pdfBuffer.length);

    res.send(result.pdfBuffer);
  } catch (error: any) {
    console.error('[CampaignReport] Erro ao gerar PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/campaigns/:id/report/generate
 * Gera relatório e salva no Storage
 */
router.post('/:id/report/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await campaignReportService.generateAndSaveFinalReport(id);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      pdf_url: result.pdfUrl,
      metrics: result.metrics
    });
  } catch (error: any) {
    console.error('[CampaignReport] Erro ao gerar e salvar relatório:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ENCERRAMENTO DE CAMPANHA
// ============================================================================

/**
 * POST /api/campaigns/:id/close
 * Encerra uma campanha e gera relatório final
 */
router.post('/:id/close', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { end_reason, generate_report } = req.body;

    // 1. Encerrar campanha
    const closeResult = await campaignReportService.closeCampaign(id, end_reason || 'completed');

    if (!closeResult.success) {
      res.status(400).json({ error: closeResult.error });
      return;
    }

    let pdfUrl: string | undefined;

    // 2. Gerar relatório se solicitado
    if (generate_report !== false) {
      const reportResult = await campaignReportService.generateAndSaveFinalReport(id);
      pdfUrl = reportResult.pdfUrl;
    }

    res.json({
      success: true,
      message: 'Campanha encerrada com sucesso',
      metrics: closeResult.metrics,
      pdf_url: pdfUrl
    });
  } catch (error: any) {
    console.error('[CampaignReport] Erro ao encerrar campanha:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/campaigns/:id/reopen
 * Reabre uma campanha encerrada (volta para status 'paused')
 */
router.post('/:id/reopen', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Atualizar status da campanha
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { data, error } = await supabase
      .from('cluster_campaigns')
      .update({
        status: 'paused',
        ended_at: null,
        end_reason: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'completed')
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(400).json({ error: 'Campanha não encontrada ou não está encerrada' });
        return;
      }
      throw error;
    }

    res.json({
      success: true,
      message: 'Campanha reaberta com sucesso',
      campaign: {
        id: data.id,
        name: data.campaign_name,
        status: data.status
      }
    });
  } catch (error: any) {
    console.error('[CampaignReport] Erro ao reabrir campanha:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
