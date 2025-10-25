import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Facebook Webhook Verification (GET)
 * Endpoint para verificação do webhook pelo Facebook Developer Console
 *
 * URL: /webhook/social-media-activity
 */
router.get('/social-media-activity', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || 'instagram_webhook_verify_token_2025';

  console.log('[Facebook Webhook Verification] GET request received');
  console.log('  - hub.mode:', mode);
  console.log('  - hub.verify_token:', token);
  console.log('  - hub.challenge:', challenge);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Facebook Webhook Verification] ✅ Token verified - returning challenge');
    res.status(200).send(challenge);
  } else {
    console.warn('[Facebook Webhook Verification] ❌ Verification failed');
    console.warn('  - Expected token:', VERIFY_TOKEN);
    console.warn('  - Received token:', token);
    res.sendStatus(403);
  }
});

/**
 * Instagram Webhook Events (POST)
 * Recebe eventos do Instagram e encaminha para N8N
 *
 * URL: /webhook/social-media-activity
 */
router.post('/social-media-activity', async (req: Request, res: Response) => {
  console.log('[Instagram Webhook] 📨 POST event received from Instagram');
  console.log('[Instagram Webhook] Payload:', JSON.stringify(req.body, null, 2));

  try {
    // Responder imediatamente ao Instagram (requisito do Facebook)
    res.sendStatus(200);

    // Encaminhar para N8N workflow (URL pública pois N8N está em servidor remoto)
    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.stratfin.tec.br/webhook/social-media-activity';

    console.log('[Instagram Webhook] 🔄 Forwarding to N8N:', N8N_WEBHOOK_URL);

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (response.ok) {
      console.log('[Instagram Webhook] ✅ Successfully forwarded to N8N');
    } else {
      console.error('[Instagram Webhook] ❌ N8N returned error:', response.status, response.statusText);
    }

  } catch (error) {
    console.error('[Instagram Webhook] ❌ Error forwarding to N8N:', error);
    // Não retornar erro para não fazer Instagram tentar reenviar
  }
});

export default router;
