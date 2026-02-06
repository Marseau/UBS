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
import { createClient } from '@supabase/supabase-js';
import { campaignReportService } from '../services/campaign-report.service';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// ============================================================================
// PROGRESSO DE CAMPANHA
// ============================================================================

/**
 * GET /api/campaigns/:id/progress
 * Retorna progresso de execução da campanha com previsão de encerramento
 */
router.get('/:id/progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('v_campaign_progress')
      .select('*')
      .eq('campaign_id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ error: 'Campanha não encontrada' });
        return;
      }
      throw error;
    }

    res.json({
      success: true,
      progress: {
        campaign_id: data.campaign_id,
        campaign_name: data.campaign_name,
        status: data.status,
        status_label: data.status_label,
        // Progresso
        total_leads: data.total_leads,
        leads_contacted: data.leads_contacted,
        leads_remaining: data.leads_remaining,
        progress_pct: data.progress_pct,
        // Previsão
        avg_daily_rate: data.avg_daily_rate,
        estimated_days_remaining: data.estimated_days_remaining,
        estimated_completion_date: data.estimated_completion_date,
        days_since_start: data.days_since_start,
        // Status de outreach
        outreach_complete: data.outreach_complete,
        outreach_completed_at: data.outreach_completed_at,
        // Conversas ativas
        active_conversations: data.active_conversations,
        pending_handoffs: data.pending_handoffs,
        ready_to_close: data.ready_to_close
      }
    });
  } catch (error: any) {
    console.error('[CampaignReport] Erro ao buscar progresso:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/pending-closure
 * Lista campanhas com outreach completo aguardando encerramento
 */
router.get('/pending-closure', async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase.rpc('get_campaigns_pending_closure');

    if (error) throw error;

    res.json({
      success: true,
      count: data?.length || 0,
      campaigns: data || []
    });
  } catch (error: any) {
    console.error('[CampaignReport] Erro ao buscar campanhas pendentes:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/campaigns/check-outreach-complete
 * Verifica e marca campanhas que completaram outreach (para job)
 */
router.post('/check-outreach-complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase.rpc('check_and_mark_outreach_complete');

    if (error) throw error;

    const newlyMarked = data?.filter((c: any) => c.newly_marked) || [];

    res.json({
      success: true,
      newly_marked_count: newlyMarked.length,
      campaigns: newlyMarked
    });
  } catch (error: any) {
    console.error('[CampaignReport] Erro ao verificar outreach:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/all-progress
 * Lista progresso de todas as campanhas ativas
 */
router.get('/all-progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('v_campaign_progress')
      .select('*')
      .order('created_at', { ascending: false });

    // Filtrar por status se especificado
    if (status) {
      const statuses = (status as string).split(',');
      query = query.in('status', statuses);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      count: data?.length || 0,
      campaigns: data || []
    });
  } catch (error: any) {
    console.error('[CampaignReport] Erro ao buscar progresso:', error);
    res.status(500).json({ error: error.message });
  }
});

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
