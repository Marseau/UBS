/**
 * AIC Puppeteer Routes
 *
 * Rotas para gerenciamento do sistema de envio humanizado via Puppeteer
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { puppeteerManager } from '../services/aic-puppeteer-manager.service';
import { AICHumanizerService } from '../services/aic-humanizer.service';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/aic/puppeteer/status
 * Retorna status de todas as sessões Puppeteer
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = await puppeteerManager.getStatus();
    const stats = await puppeteerManager.getStats();

    res.json({
      success: true,
      data: {
        sessions: status,
        stats
      }
    });
  } catch (error) {
    console.error('Erro ao buscar status:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/aic/puppeteer/start
 * Inicia todos os workers Puppeteer
 */
router.post('/start', async (_req: Request, res: Response): Promise<void> => {
  try {
    await puppeteerManager.startAll();
    res.json({ success: true, message: 'Workers iniciados' });
  } catch (error) {
    console.error('Erro ao iniciar workers:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/aic/puppeteer/stop
 * Para todos os workers Puppeteer
 */
router.post('/stop', async (_req: Request, res: Response): Promise<void> => {
  try {
    await puppeteerManager.stopAll();
    res.json({ success: true, message: 'Workers parados' });
  } catch (error) {
    console.error('Erro ao parar workers:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/aic/puppeteer/start/:channelId
 * Inicia worker para um canal específico
 */
router.post('/start/:channelId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { channelId } = req.params;

    // Buscar campanha
    const { data: campaign, error } = await supabase
      .from('aic_campaigns')
      .select('id, name, whapi_channel_id, whapi_phone, status')
      .eq('whapi_channel_id', channelId)
      .single();

    if (error || !campaign) {
      res.status(404).json({
        success: false,
        error: 'Campanha não encontrada para este canal'
      });
      return;
    }

    const started = await puppeteerManager.startWorker(campaign);

    res.json({
      success: started,
      message: started ? 'Worker iniciado' : 'Falha ao iniciar worker'
    });
  } catch (error) {
    console.error('Erro ao iniciar worker:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/aic/puppeteer/stop/:channelId
 * Para worker de um canal específico
 */
router.post('/stop/:channelId', async (req: Request, res: Response): Promise<void> => {
  try {
    const channelId = req.params.channelId as string;
    await puppeteerManager.stopWorker(channelId);
    res.json({ success: true, message: 'Worker parado' });
  } catch (error) {
    console.error('Erro ao parar worker:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /api/aic/puppeteer/queue
 * Retorna estatísticas da fila de mensagens
 */
router.get('/queue', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data: queueStats } = await supabase
      .from('aic_message_queue')
      .select('status, campaign_id')
      .order('created_at', { ascending: false });

    const stats: {
      pending: number;
      processing: number;
      sent: number;
      failed: number;
      cancelled: number;
      byCampaign: Record<string, number>;
    } = {
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      byCampaign: {}
    };

    for (const item of queueStats || []) {
      const status = item.status as 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
      if (status in stats && typeof stats[status] === 'number') {
        (stats[status] as number)++;
      }
      if (item.campaign_id) {
        stats.byCampaign[item.campaign_id] =
          (stats.byCampaign[item.campaign_id] || 0) + 1;
      }
    }

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Erro ao buscar fila:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/aic/puppeteer/enqueue
 * Enfileira uma mensagem para envio
 */
router.post('/enqueue', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      campaign_id,
      conversation_id,
      phone,
      chat_id,
      message_text,
      priority = 5,
      scheduled_for = null
    } = req.body;

    // Validar campos obrigatórios
    if (!phone || !chat_id || !message_text) {
      res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: phone, chat_id, message_text'
      });
      return;
    }

    // Enfileirar
    const { data, error } = await supabase.rpc('enqueue_aic_message', {
      p_campaign_id: campaign_id || null,
      p_conversation_id: conversation_id || null,
      p_phone: phone,
      p_chat_id: chat_id,
      p_message_text: message_text,
      p_priority: priority,
      p_scheduled_for: scheduled_for
    });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: { queue_id: data }
    });
  } catch (error) {
    console.error('Erro ao enfileirar:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /api/aic/puppeteer/sessions/:channelId/qr
 * Retorna QR code de uma sessão pendente
 */
router.get('/sessions/:channelId/qr', async (req: Request, res: Response): Promise<void> => {
  try {
    const { channelId } = req.params;

    const { data: session, error } = await supabase
      .from('aic_puppeteer_sessions')
      .select('qr_code, qr_expires_at, status')
      .eq('channel_id', channelId)
      .single();

    if (error || !session) {
      res.status(404).json({
        success: false,
        error: 'Sessão não encontrada'
      });
      return;
    }

    if (session.status !== 'qr_pending') {
      res.json({
        success: true,
        data: {
          status: session.status,
          qr_code: null,
          message: session.status === 'connected'
            ? 'Sessão já conectada'
            : 'QR Code não disponível'
        }
      });
      return;
    }

    res.json({
      success: true,
      data: {
        status: session.status,
        qr_code: session.qr_code,
        expires_at: session.qr_expires_at
      }
    });
  } catch (error) {
    console.error('Erro ao buscar QR:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /api/aic/puppeteer/logs/:channelId
 * Retorna logs de uma sessão
 */
router.get('/logs/:channelId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { channelId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    // Buscar sessão
    const { data: session } = await supabase
      .from('aic_puppeteer_sessions')
      .select('id')
      .eq('channel_id', channelId)
      .single();

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Sessão não encontrada'
      });
      return;
    }

    // Buscar logs
    const { data: logs, error } = await supabase
      .from('aic_puppeteer_logs')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Erro ao buscar logs:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /api/aic/puppeteer/config
 * Retorna configurações de humanização
 */
router.get('/config', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data: config, error } = await supabase
      .from('aic_humanizer_config')
      .select('*')
      .single();

    if (error) throw error;

    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Erro ao buscar config:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * PUT /api/aic/puppeteer/config
 * Atualiza configurações de humanização
 */
router.put('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const updates = req.body;

    const { data, error } = await supabase
      .from('aic_humanizer_config')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Erro ao atualizar config:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/aic/puppeteer/test-humanize
 * Testa a humanização de uma mensagem (preview)
 */
router.post('/test-humanize', async (req: Request, res: Response): Promise<void> => {
  try {
    const { text, include_typos = true } = req.body;

    if (!text) {
      res.status(400).json({
        success: false,
        error: 'Campo text é obrigatório'
      });
      return;
    }

    const humanizer = new AICHumanizerService();
    const result = humanizer.humanize(text, include_typos);

    // Simular a digitação para preview
    let preview = '';
    for (const step of result.steps) {
      if (step.action === 'type' && step.value) {
        preview += step.value;
      } else if (step.action === 'backspace') {
        preview = preview.slice(0, -1);
      }
    }

    res.json({
      success: true,
      data: {
        original: text,
        preview,
        totalDurationMs: result.totalDurationMs,
        typoCount: result.typoCount,
        stepsCount: result.steps.length,
        estimatedSeconds: Math.round(result.totalDurationMs / 1000)
      }
    });
  } catch (error) {
    console.error('Erro ao humanizar:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;
