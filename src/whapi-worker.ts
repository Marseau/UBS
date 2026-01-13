/**
 * Whapi Worker - Worker isolado para Whapi/Puppeteer
 *
 * Este worker roda em uma porta separada (3005) para:
 * - Isolar processos Puppeteer que consomem muita memória
 * - Garantir estabilidade do app principal se Puppeteer crashar
 * - Permitir escalar separadamente em máquinas diferentes
 *
 * Rotas expostas:
 * - /api/whapi/* - Integração com Whapi.cloud API
 * - /api/aic/puppeteer/* - Sistema de envio humanizado
 * - /health - Health check
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

// Configuração
const PORT = process.env.WHAPI_WORKER_PORT || 3005;
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[Whapi Worker] ${req.method} ${req.path}`);
  next();
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Verificar conexão com Supabase
    const { error } = await supabase.from('whapi_channels').select('id').limit(1);

    res.json({
      status: 'healthy',
      worker: 'whapi-worker',
      port: PORT,
      timestamp: new Date().toISOString(),
      supabase: error ? 'error' : 'connected'
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: String(error)
    });
  }
});

// ============================================================================
// WHAPI ROUTES
// ============================================================================

try {
  const whapiRoutes = require('./routes/whapi.routes');
  const router = 'default' in whapiRoutes ? whapiRoutes.default : whapiRoutes;
  app.use('/api/whapi', router);
  console.log('✅ Whapi routes loaded');
} catch (error) {
  console.error('❌ Failed to load Whapi routes:', error);
}

// ============================================================================
// AIC PUPPETEER ROUTES
// ============================================================================

try {
  const aicPuppeteerRoutes = require('./routes/aic-puppeteer.routes');
  const router = 'default' in aicPuppeteerRoutes ? aicPuppeteerRoutes.default : aicPuppeteerRoutes;
  app.use('/api/aic/puppeteer', router);
  console.log('✅ AIC Puppeteer routes loaded');
} catch (error) {
  console.error('❌ Failed to load AIC Puppeteer routes:', error);
}

// ============================================================================
// PARTNER API ROUTES (para quando Partner for aprovado)
// ============================================================================

app.get('/api/partner/status', async (_req: Request, res: Response) => {
  res.json({
    partner_enabled: false,
    message: 'Partner API pendente de aprovação'
  });
});

// Placeholder para criar canal via Partner API
app.post('/api/partner/channels', async (req: Request, res: Response) => {
  const { phone, campaign_id } = req.body;

  // TODO: Implementar quando Partner API for liberada
  res.status(501).json({
    success: false,
    message: 'Partner API ainda não disponível',
    phone,
    campaign_id
  });
});

// Placeholder para QR code via Partner API
app.get('/api/partner/channels/:channelId/qr', async (req: Request, res: Response) => {
  const { channelId } = req.params;

  // TODO: Implementar quando Partner API for liberada
  res.status(501).json({
    success: false,
    message: 'Partner API ainda não disponível',
    channel_id: channelId
  });
});

// ============================================================================
// CHANNEL MANAGEMENT
// ============================================================================

/**
 * GET /api/channels
 * Lista todos os canais Whapi configurados
 */
app.get('/api/channels', async (_req: Request, res: Response) => {
  try {
    const { data: channels, error } = await supabase
      .from('whapi_channels')
      .select('id, name, channel_id, phone_number, status, rate_limit_daily, rate_limit_hourly, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: channels
    });
  } catch (error) {
    console.error('[Whapi Worker] Error listing channels:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /api/channels/:id
 * Detalhes de um canal específico
 */
app.get('/api/channels/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: channel, error } = await supabase
      .from('whapi_channels')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !channel) {
      res.status(404).json({ success: false, error: 'Canal não encontrado' });
      return;
    }

    // Buscar estatísticas de uso
    const { data: stats } = await supabase
      .from('aic_message_queue')
      .select('status')
      .eq('channel_id', id);

    const statusCounts = {
      pending: 0,
      sent: 0,
      failed: 0
    };

    for (const item of stats || []) {
      if (item.status in statusCounts) {
        statusCounts[item.status as keyof typeof statusCounts]++;
      }
    }

    res.json({
      success: true,
      data: {
        ...channel,
        stats: statusCounts
      }
    });
  } catch (error) {
    console.error('[Whapi Worker] Error getting channel:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/channels/:id/test
 * Testa conexão de um canal
 */
app.post('/api/channels/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: channel, error } = await supabase
      .from('whapi_channels')
      .select('channel_id, api_token')
      .eq('id', id)
      .single();

    if (error || !channel) {
      res.status(404).json({ success: false, error: 'Canal não encontrado' });
      return;
    }

    if (!channel.api_token || channel.api_token === 'pending_configuration') {
      res.json({
        success: false,
        status: 'not_configured',
        message: 'Canal ainda não configurado com token válido'
      });
      return;
    }

    // Testar conexão via Whapi
    const { getWhapiClient } = require('./services/whapi-client.service');
    const client = getWhapiClient({ token: channel.api_token });
    const status = await client.getConnectionStatus();

    // Atualizar status no banco
    await supabase
      .from('whapi_channels')
      .update({
        status: status === 'connected' ? 'active' : 'disconnected',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    res.json({
      success: true,
      status,
      message: status === 'connected' ? 'Canal conectado' : 'Canal desconectado'
    });
  } catch (error) {
    console.error('[Whapi Worker] Error testing channel:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Whapi Worker] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not found'
  });
});

// ============================================================================
// START SERVER
// ============================================================================

async function start() {
  try {
    console.log('═══════════════════════════════════════════════════');
    console.log('       WHAPI WORKER - Isolated Puppeteer/Whapi     ');
    console.log('═══════════════════════════════════════════════════');

    app.listen(PORT, () => {
      console.log(`\n🚀 Whapi Worker running on port ${PORT}`);
      console.log(`\n📡 Endpoints disponíveis:`);
      console.log(`   - GET  /health`);
      console.log(`   - GET  /api/channels`);
      console.log(`   - GET  /api/channels/:id`);
      console.log(`   - POST /api/channels/:id/test`);
      console.log(`   - *    /api/whapi/*`);
      console.log(`   - *    /api/aic/puppeteer/*`);
      console.log(`   - *    /api/partner/* (pendente)`);
      console.log('\n═══════════════════════════════════════════════════\n');
    });
  } catch (error) {
    console.error('❌ Failed to start Whapi Worker:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  console.log('\n[Whapi Worker] Received SIGTERM, shutting down...');
  try {
    // Parar puppeteer workers se existirem
    const { puppeteerManager } = require('./services/aic-puppeteer-manager.service');
    await puppeteerManager.stopAll();
  } catch (error) {
    console.error('[Whapi Worker] Error during shutdown:', error);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n[Whapi Worker] Received SIGINT, shutting down...');
  process.exit(0);
});

// Start the worker
start();
