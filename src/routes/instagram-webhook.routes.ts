import { Router, Request, Response } from 'express';
import { InstagramInteractionsService } from '../services/instagram-interactions.service';

const router = Router();

/**
 * Webhook Verification (GET)
 * Instagram envia um desafio para verificar o webhook
 */
router.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || 'instagram_webhook_verify_token_2025';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Instagram Webhook] ✅ Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.warn('[Instagram Webhook] ❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

/**
 * Webhook de Interações (POST)
 * Recebe notificações de comments, mentions, messages
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    console.log('[Instagram Webhook] 📨 Webhook received');

    // Responder imediatamente (Instagram espera resposta rápida)
    res.sendStatus(200);

    // Processar webhook em background
    await InstagramInteractionsService.processWebhook(req.body);

  } catch (error) {
    console.error('[Instagram Webhook] Error processing webhook:', error);
    // Já respondemos 200, então não podemos enviar outro status
  }
});

/**
 * Endpoint manual para buscar leads que devem ser seguidos
 * Usado pelo workflow N8N
 */
router.get('/leads-to-follow', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const leads = await InstagramInteractionsService.getLeadsToFollow(limit);

    res.json({
      success: true,
      count: leads.length,
      leads,
    });

  } catch (error) {
    console.error('[Instagram Webhook] Error fetching leads to follow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leads',
    });
  }
});

export default router;
