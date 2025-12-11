/**
 * Rotas de Warmup WhatsApp
 *
 * Endpoints para controle do sistema de aquecimento de linhas WhatsApp
 * - Agendar envios para uma campanha
 * - Iniciar/parar scheduler
 * - Estatísticas de envio
 * - Teste de mensagens
 */

import { Router, Request, Response } from 'express';
import { getWarmupService } from '../services/whatsapp-warmup.service';

const router = Router();

// ============================================================================
// AGENDAMENTO
// ============================================================================

/**
 * POST /api/warmup/schedule/:campaignId
 * Agenda envios de warmup para uma campanha
 *
 * Query params:
 * - limit: número máximo de leads a agendar (default: 100)
 */
router.post('/schedule/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    if (!campaignId) {
      res.status(400).json({
        success: false,
        error: 'campaignId é obrigatório'
      });
      return;
    }

    console.log(`📅 [Warmup Route] Agendando warmup para campanha ${campaignId}, limite: ${limit}`);

    const warmupService = getWarmupService();
    const scheduledCount = await warmupService.scheduleWarmupForCampaign(campaignId, limit);

    res.json({
      success: true,
      campaign_id: campaignId,
      scheduled_count: scheduledCount,
      message: `${scheduledCount} envios agendados para warmup`
    });
  } catch (error: any) {
    console.error('[Warmup Route] Erro ao agendar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// CONTROLE DO SCHEDULER
// ============================================================================

/**
 * POST /api/warmup/start
 * Inicia o scheduler de processamento
 *
 * Body:
 * - intervalMinutes: intervalo entre processamentos (default: 5)
 */
router.post('/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const { intervalMinutes } = req.body;
    const interval = parseInt(intervalMinutes) || 5;

    console.log(`🚀 [Warmup Route] Iniciando scheduler com intervalo de ${interval} minutos`);

    const warmupService = getWarmupService();
    warmupService.startScheduler(interval);

    res.json({
      success: true,
      message: `Scheduler iniciado com intervalo de ${interval} minutos`,
      interval_minutes: interval
    });
  } catch (error: any) {
    console.error('[Warmup Route] Erro ao iniciar scheduler:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/warmup/stop
 * Para o scheduler de processamento
 */
router.post('/stop', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('⏹️ [Warmup Route] Parando scheduler');

    const warmupService = getWarmupService();
    warmupService.stopScheduler();

    res.json({
      success: true,
      message: 'Scheduler parado'
    });
  } catch (error: any) {
    console.error('[Warmup Route] Erro ao parar scheduler:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/warmup/process
 * Força processamento imediato dos pendentes
 */
router.post('/process', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('⚡ [Warmup Route] Forçando processamento');

    const warmupService = getWarmupService();
    const results = await warmupService.processPendingSchedules();

    res.json({
      success: true,
      sent: results.sent,
      failed: results.failed,
      message: `Processamento concluído: ${results.sent} enviados, ${results.failed} falhas`
    });
  } catch (error: any) {
    console.error('[Warmup Route] Erro ao processar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ESTATÍSTICAS
// ============================================================================

/**
 * GET /api/warmup/stats
 * Obtém estatísticas gerais do warmup
 *
 * Query params:
 * - campaignId: filtrar por campanha (opcional)
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.query.campaignId as string | undefined;

    const warmupService = getWarmupService();
    const stats = await warmupService.getStats(campaignId);

    res.json({
      success: true,
      ...stats,
      campaign_id: campaignId || 'all'
    });
  } catch (error: any) {
    console.error('[Warmup Route] Erro ao obter stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/warmup/config
 * Retorna configuração atual do warmup
 */
router.get('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const config = {
      dms_per_hour: parseInt(process.env.WARMUP_WEEK1_DMS_PER_HOUR || '2'),
      business_hours: {
        start: parseInt(process.env.WARMUP_BUSINESS_HOURS_START || '8'),
        end: parseInt(process.env.WARMUP_BUSINESS_HOURS_END || '18')
      },
      business_days: (process.env.WARMUP_BUSINESS_DAYS || '1,2,3,4,5').split(',').map(d => parseInt(d)),
      test_mode: process.env.NODE_ENV !== 'production',
      test_lines: (process.env.WHAPI_TEST_LINES || '').split(',').filter(l => l)
    };

    const warmupService = getWarmupService();

    res.json({
      success: true,
      config,
      status: {
        is_business_hours: warmupService.isBusinessHours(),
        is_business_day: warmupService.isBusinessDay(),
        can_send_now: warmupService.canSendNow()
      }
    });
  } catch (error: any) {
    console.error('[Warmup Route] Erro ao obter config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// TESTE
// ============================================================================

/**
 * POST /api/warmup/test
 * Envia mensagem de teste
 *
 * Body:
 * - phone: número do destinatário
 * - message: mensagem a enviar (opcional)
 */
router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, message } = req.body;

    if (!phone) {
      res.status(400).json({
        success: false,
        error: 'Campo obrigatório: phone'
      });
      return;
    }

    console.log(`🧪 [Warmup Route] Enviando teste para ${phone}`);

    const warmupService = getWarmupService();
    const result = await warmupService.sendTestMessage(phone, message);

    if (result.success) {
      res.json({
        success: true,
        phone,
        message: 'Mensagem de teste enviada'
      });
    } else {
      res.status(400).json({
        success: false,
        phone,
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('[Warmup Route] Erro no teste:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/warmup/test-lines
 * Envia mensagem de teste para todas as linhas configuradas
 *
 * Body:
 * - message: mensagem a enviar (opcional)
 */
router.post('/test-lines', async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body;
    const testLines = (process.env.WHAPI_TEST_LINES || '').split(',').filter(l => l);

    if (testLines.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Nenhuma linha de teste configurada em WHAPI_TEST_LINES'
      });
      return;
    }

    console.log(`🧪 [Warmup Route] Enviando teste para ${testLines.length} linhas`);

    const warmupService = getWarmupService();
    const results: Array<{ phone: string; success: boolean; error?: string }> = [];

    for (const phone of testLines) {
      const result = await warmupService.sendTestMessage(phone, message);
      results.push({
        phone,
        success: result.success,
        error: result.error
      });

      // Delay entre envios
      await new Promise(r => setTimeout(r, 2000));
    }

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: successCount > 0,
      total: testLines.length,
      sent: successCount,
      failed: testLines.length - successCount,
      results
    });
  } catch (error: any) {
    console.error('[Warmup Route] Erro no teste de linhas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
