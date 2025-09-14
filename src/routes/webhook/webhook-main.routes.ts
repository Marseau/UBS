/**
 * WhatsApp Webhook Main Router - REFATORADO
 * Mantém interface externa idêntica (/webhook/whatsapp)
 * Delega processamento para orquestrador modular
 */

import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { WebhookFlowOrchestratorService } from '../../services/webhook-flow-orchestrator.service.refactored';
import { demoTokenValidator } from '../../utils/demo-token-validator';
import { VALID_CONVERSATION_OUTCOMES } from '../../types/billing-cron.types';

const router = express.Router();

// Configuração
const config = {
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET || ''
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '20')
  }
};

// Logger simples
const logger = {
  info: (...args: any[]) => console.log('[WEBHOOK]', ...args),
  warn: (...args: any[]) => console.warn('[WEBHOOK]', ...args),
  error: (...args: any[]) => console.error('[WEBHOOK]', ...args)
};

// Rate limiting
const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  keyGenerator: (req) => {
    try {
      const body = (req as any).body || {};
      const entry = Array.isArray(body.entry) ? body.entry[0] : undefined;
      const change = entry && Array.isArray(entry.changes) ? entry.changes[0] : undefined;
      const value = change?.value || {};
      const msg = Array.isArray(value.messages) ? value.messages[0] : undefined;
      const from = msg?.from || req.ip;
      return `whatsapp:${from}`;
    } catch {
      return `whatsapp:${req.ip}`;
    }
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip });
    res.status(200).json({ status: 'rate_limited' });
  }
});

// Validação de assinatura WhatsApp
function validateWhatsAppSignature(req: express.Request, res: express.Response, next: express.NextFunction): void {
  // Bypass para demo tokens válidos
  if ((req as any).demoMode) {
    logger.info('Bypassing signature validation for demo token');
    next();
    return;
  }

  if (!config.whatsapp.webhookSecret) {
    next();
    return;
  }

  const sigHeader = req.headers['x-hub-signature-256'] as string | undefined;
  if (!sigHeader?.startsWith('sha256=')) {
    logger.warn('Missing/invalid signature header');
    res.status(401).json({ error: 'Missing/invalid signature' });
    return;
  }

  const payload = req.body as Buffer;
  if (!Buffer.isBuffer(payload)) {
    logger.error('Signature validation requires raw Buffer body');
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  const expected = crypto.createHmac('sha256', config.whatsapp.webhookSecret)
    .update(payload)
    .digest('hex');
  const provided = sigHeader.slice('sha256='.length);

  const isValid = provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (isValid) {
    next();
  } else {
    res.status(401).json({ error: 'Invalid signature' });
  }
}

// Middleware para verificar demo token
function checkDemoToken(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const demoToken = req.headers['x-demo-token'] as string;

  if (demoToken) {
    try {
      const validation = demoTokenValidator.validateToken(demoToken);

      if (validation || demoToken === process.env.DEMO_MODE_TOKEN) {
        (req as any).demoMode = validation || { source: 'env_token' };
        logger.info('Demo mode activated with valid token');
      } else {
        logger.warn('Invalid demo token provided');
        res.status(401).json({ error: 'Invalid demo token' });
        return;
      }
    } catch (error) {
      logger.error('Demo token validation error:', error);
      res.status(401).json({ error: 'Token validation failed' });
      return;
    }
  }

  next();
}

// Instância do orquestrador
const orchestrator = new WebhookFlowOrchestratorService();

/**
 * GET /webhook/whatsapp - Verificação de webhook (WhatsApp)
 */
router.get('/', (req: express.Request, res: express.Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    logger.warn('Webhook verification failed', { mode, token });
    res.status(403).json({ error: 'Forbidden' });
  }
});

/**
 * POST /webhook/whatsapp - Processar mensagens do WhatsApp
 * Interface EXTERNA mantida 100% idêntica
 */
router.post(
  '/',
  checkDemoToken,
  rateLimiter,
  validateWhatsAppSignature,
  async (req: express.Request, res: express.Response) => {
    try {
      // Parse do corpo da requisição (pode ser Buffer ou JSON)
      let body: any;
      if (Buffer.isBuffer(req.body)) {
        body = JSON.parse(req.body.toString('utf8'));
      } else {
        body = req.body;
      }

      const isDemo = !!(req as any).demoMode;

      // Extrair dados da mensagem do formato WhatsApp
      const entry = Array.isArray(body.entry) ? body.entry[0] : body.entry;
      const changes = Array.isArray(entry?.changes) ? entry.changes[0] : entry?.changes;
      const value = changes?.value;

      if (!value?.messages || !Array.isArray(value.messages) || value.messages.length === 0) {
        // Não é uma mensagem, pode ser status update
        return res.status(200).json({ status: 'received' });
      }

      const message = value.messages[0];
      const contact = value.contacts?.[0];

      // Dados necessários para processamento
      const messageText = message.text?.body ||
                         message.interactive?.button_reply?.title ||
                         message.interactive?.list_reply?.title ||
                         'Mídia não suportada';

      const userPhone = message.from;
      const whatsappNumber = value.metadata?.phone_number_id ||
                           value.metadata?.display_phone_number;

      if (!userPhone || !whatsappNumber) {
        logger.error('Missing required fields', { userPhone, whatsappNumber });
        return res.status(400).json({ error: 'Missing required fields' });
      }

      logger.info('Processing message', {
        from: userPhone,
        to: whatsappNumber,
        text: messageText.substring(0, 50) + '...',
        isDemo
      });

      // Delegar para orquestrador
      const result = await orchestrator.orchestrateWebhookFlow({
        messageText,
        userPhone,
        tenantId: '', // Será resolvido internamente pelo orquestrador
        whatsappNumber,
        isDemo
      });

      if (!result.success) {
        logger.error('Orchestrator failed', { error: result.error });
        return res.status(500).json({
          error: 'Processing failed',
          details: result.error
        });
      }

      // Resposta de sucesso
      logger.info('Message processed successfully', {
        intent: result.intent,
        outcome: result.conversationOutcome
      });

      return res.status(200).json({
        status: 'success',
        response: result.aiResponse,
        intent: result.intent,
        outcome: result.conversationOutcome
      });

    } catch (error) {
      logger.error('Webhook processing error:', error);

      return res.status(500).json({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;