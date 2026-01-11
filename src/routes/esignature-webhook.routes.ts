/**
 * Electronic Signature Webhook Routes
 * Handles callbacks from D4Sign, Clicksign, etc.
 */

import { Router, Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/database';
import { esignatureService } from '../services/esignature.service';
import { clientJourneyService } from '../services/client-journey.service';

const router = Router();

/**
 * Webhook payload structure from D4Sign
 */
interface D4SignWebhookPayload {
  uuid: string;           // Document UUID
  type: string;           // Event type: 'signature', 'cancelled', etc.
  status: string;         // Document status
  message?: string;
  signer?: {
    email: string;
    name: string;
    cpf?: string;
    signed_at?: string;
  };
}

/**
 * POST /api/aic/esignature/webhook
 * Receives webhook callbacks from e-signature providers
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const provider = esignatureService.getProvider();
    const payload = req.body as D4SignWebhookPayload;
    const signature = req.headers['x-signature'] as string || '';

    console.log(`[ESignature Webhook] Received from ${provider.providerName}:`, JSON.stringify(payload));

    // Validate webhook signature (if secret configured)
    const webhookSecret = process.env.D4SIGN_WEBHOOK_SECRET || process.env.ESIGNATURE_WEBHOOK_SECRET;
    if (webhookSecret) {
      const isValid = provider.validateWebhookSignature(JSON.stringify(req.body), signature);
      if (!isValid) {
        console.warn('[ESignature Webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    // Find contract by esignature_document_id
    const { data: contract, error: contractError } = await supabaseAdmin
      .from('aic_contracts')
      .select('*, aic_client_journeys(*)')
      .eq('esignature_document_id', payload.uuid)
      .single();

    if (contractError || !contract) {
      console.warn(`[ESignature Webhook] Contract not found for document: ${payload.uuid}`);
      // Return 200 to prevent retries for documents we don't track
      return res.status(200).json({ received: true, status: 'document_not_found' });
    }

    // Process based on event type
    switch (payload.type) {
      case 'signature':
        await handleSignature(contract, payload);
        break;

      case 'cancelled':
        await handleCancellation(contract, payload);
        break;

      case 'expired':
        await handleExpiration(contract, payload);
        break;

      default:
        console.log(`[ESignature Webhook] Unhandled event type: ${payload.type}`);
    }

    return res.status(200).json({ received: true, status: 'processed' });

  } catch (error) {
    console.error('[ESignature Webhook] Error:', error);
    // Return 200 to prevent retries - log error for investigation
    return res.status(200).json({ received: true, status: 'error', error: (error as Error).message });
  }
});

/**
 * Handle signature event
 */
async function handleSignature(contract: Record<string, unknown>, payload: D4SignWebhookPayload): Promise<void> {
  console.log(`[ESignature Webhook] Processing signature for contract: ${contract.id}`);

  const signedAt = payload.signer?.signed_at || new Date().toISOString();

  // Update contract status
  const { error: updateError } = await supabaseAdmin
    .from('aic_contracts')
    .update({
      esignature_status: 'signed',
      esignature_signed_at: signedAt,
      status: 'signed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', contract.id);

  if (updateError) {
    console.error('[ESignature Webhook] Error updating contract:', updateError);
    return;
  }

  // Create campaign and advance journey
  const journey = contract.aic_client_journeys as Record<string, unknown> | null;
  if (journey?.id) {
    try {
      // Use linkContractAndCreateCampaign to create project + campaign with contract data
      const result = await clientJourneyService.linkContractAndCreateCampaign(
        journey.id as string,
        contract.id as string,
        {
          client_name: contract.client_name as string,
          client_email: contract.client_email as string,
          client_phone: contract.client_phone as string | undefined,
          client_document: contract.client_document as string | undefined,
          project_name: contract.project_name as string | undefined,
          campaign_whatsapp: contract.campaign_whatsapp as string | undefined,
          target_niche: contract.target_niche as string | undefined,
          service_description: contract.service_description as string | undefined,
          target_audience: contract.target_audience as string | undefined,
          contract_value: contract.contract_value as number | undefined,
          lead_value: contract.lead_value as number | undefined,
        }
      );

      if (result.success) {
        console.log(`[ESignature Webhook] Campaign created for journey ${journey.id} (signed by ${payload.signer?.email})`);
      } else {
        console.error('[ESignature Webhook] Error creating campaign:', result.message);
        // Still advance journey even if campaign creation fails
        await clientJourneyService.setStep(journey.id as string, 'contrato_assinado');
      }
    } catch (journeyError) {
      console.error('[ESignature Webhook] Error processing journey:', journeyError);
    }
  }

  // Send notification (Telegram/Email)
  await sendSignatureNotification(contract, payload);
}

/**
 * Handle document cancellation
 */
async function handleCancellation(contract: Record<string, unknown>, payload: D4SignWebhookPayload): Promise<void> {
  console.log(`[ESignature Webhook] Processing cancellation for contract: ${contract.id}`);

  await supabaseAdmin
    .from('aic_contracts')
    .update({
      esignature_status: 'cancelled',
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', contract.id);
}

/**
 * Handle document expiration
 */
async function handleExpiration(contract: Record<string, unknown>, payload: D4SignWebhookPayload): Promise<void> {
  console.log(`[ESignature Webhook] Processing expiration for contract: ${contract.id}`);

  await supabaseAdmin
    .from('aic_contracts')
    .update({
      esignature_status: 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('id', contract.id);
}

/**
 * Send notification about signed contract
 */
async function sendSignatureNotification(contract: Record<string, unknown>, payload: D4SignWebhookPayload): Promise<void> {
  try {
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    if (!telegramToken || !telegramChatId) return;

    const message = `📝 *Contrato Assinado via ${esignatureService.getProvider().providerName}*\n\n` +
      `👤 Cliente: ${contract.client_name}\n` +
      `📧 Email: ${payload.signer?.email || contract.client_email}\n` +
      `📋 Contrato: ${contract.contract_id || contract.id}\n\n` +
      `✅ Assinado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
  } catch (error) {
    console.warn('[ESignature Webhook] Error sending notification:', error);
  }
}

/**
 * GET /api/aic/esignature/status/:documentId
 * Check document signing status
 */
router.get('/status/:documentId', async (req: Request, res: Response) => {
  try {
    const documentId = req.params.documentId;
    if (!documentId) {
      return res.status(400).json({ success: false, error: 'Document ID is required' });
    }

    const provider = esignatureService.getProvider();

    const status = await provider.getDocumentStatus(documentId);

    return res.json({
      success: true,
      provider: provider.providerName,
      ...status,
    });

  } catch (error) {
    console.error('[ESignature] Status check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao verificar status do documento',
    });
  }
});

export default router;
