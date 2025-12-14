/**
 * Instagram DM Webhook - AI Agent Integration
 *
 * Webhook para receber DMs do Instagram e processar via N8N AI Agent
 * Detecta leads orgânicos (não prospectados) e registra na campanha
 *
 * Baseado no modelo do WhatsApp webhook
 */

import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const router = express.Router();

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.ubs.app.br/webhook';
const N8N_WORKFLOW_ID = 'msXwN1pEc23RuZmu'; // AIC Instagram AI Agent v7 (3-Layer Memory)
const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || 'instagram_dm_verify_2025';

// =====================================================
// WEBHOOK VERIFICATION (GET)
// =====================================================

router.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Instagram DM Webhook] ✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    console.warn('[Instagram DM Webhook] ❌ Verification failed');
    res.sendStatus(403);
  }
});

// =====================================================
// WEBHOOK HANDLER (POST)
// =====================================================

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    console.log('[Instagram DM Webhook] 📨 Received webhook');

    // Responder imediatamente (Instagram/Meta espera resposta rápida)
    res.sendStatus(200);

    // Processar em background
    await processInstagramWebhook(req.body);

  } catch (error) {
    console.error('[Instagram DM Webhook] Error:', error);
    // Já respondemos 200, então não podemos enviar outro status
  }
});

// =====================================================
// PROCESSAMENTO DO WEBHOOK
// =====================================================

async function processInstagramWebhook(body: any): Promise<void> {
  if (!body.entry || !Array.isArray(body.entry)) {
    console.warn('[Instagram DM Webhook] Invalid payload - no entries');
    return;
  }

  for (const entry of body.entry) {
    // Processar mensagens diretas
    if (entry.messaging && Array.isArray(entry.messaging)) {
      for (const message of entry.messaging) {
        await processDirectMessage(message);
      }
    }
  }
}

// =====================================================
// PROCESSAR MENSAGEM DIRETA
// =====================================================

async function processDirectMessage(message: any): Promise<void> {
  try {
    const senderId = message.sender?.id;
    const recipientId = message.recipient?.id;
    const messageText = message.message?.text;
    const timestamp = message.timestamp;

    if (!senderId || !messageText) {
      console.warn('[Instagram DM Webhook] Missing sender or message text');
      return;
    }

    console.log(`[Instagram DM Webhook] 📩 DM from user ${senderId}: "${messageText}"`);

    // 1. Buscar username via Graph API
    const username = await fetchInstagramUsername(senderId);
    if (!username) {
      console.error('[Instagram DM Webhook] Could not fetch username for ID:', senderId);
      return;
    }

    // 2. Detectar campanha (baseado no recipient_id - conta Instagram vinculada)
    const campaign = await detectCampaignByInstagramAccount(recipientId);
    if (!campaign) {
      console.warn('[Instagram DM Webhook] No campaign found for Instagram account:', recipientId);
      return;
    }

    console.log(`[Instagram DM Webhook] 📊 Campaign: ${campaign.campaign_name} (${campaign.id})`);

    // 3. Verificar se é lead orgânico (não prospectado)
    const isOrganic = await checkIfOrganicLead(campaign.id, username);

    // 4. Registrar ou atualizar lead
    const lead = await registerLead({
      campaign_id: campaign.id,
      instagram_username: username,
      instagram_user_id: senderId,
      source: isOrganic ? 'instagram_dm_inbound' : 'instagram_dm_reply',
      message_text: messageText
    });

    if (isOrganic) {
      console.log(`[Instagram DM Webhook] 🆕 ORGANIC LEAD detected: @${username}`);
    } else {
      console.log(`[Instagram DM Webhook] 🔄 Existing lead reply: @${username}`);
    }

    // 5. Enviar para N8N workflow (AI Agent)
    await sendToN8NWorkflow({
      platform: 'instagram',
      campaign_id: campaign.id,
      lead_id: lead.id,
      username: username,
      user_id: senderId,
      message_text: messageText,
      timestamp: timestamp,
      is_organic: isOrganic
    });

    console.log(`[Instagram DM Webhook] ✅ Processed DM from @${username}`);

  } catch (error) {
    console.error('[Instagram DM Webhook] Error processing message:', error);
  }
}

// =====================================================
// HELPER: Buscar username do Instagram
// =====================================================

async function fetchInstagramUsername(userId: string): Promise<string | null> {
  try {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (!accessToken) {
      console.error('[Instagram DM Webhook] INSTAGRAM_ACCESS_TOKEN not configured');
      return null;
    }

    const response = await axios.get(
      `https://graph.instagram.com/${userId}?fields=username&access_token=${accessToken}`
    );

    return response.data.username || null;
  } catch (error: any) {
    console.error('[Instagram DM Webhook] Error fetching username:', error.message);
    return null;
  }
}

// =====================================================
// HELPER: Detectar campanha por conta Instagram
// =====================================================

async function detectCampaignByInstagramAccount(recipientId: string): Promise<any> {
  try {
    // Buscar campanha vinculada ao Instagram account ID
    const { data, error } = await supabase
      .from('instagram_accounts')
      .select(`
        instagram_user_id,
        campaigns:cluster_campaigns(*)
      `)
      .eq('instagram_user_id', recipientId)
      .single();

    if (error || !data) {
      console.warn('[Instagram DM Webhook] No campaign found for account:', recipientId);
      return null;
    }

    return data.campaigns;
  } catch (error) {
    console.error('[Instagram DM Webhook] Error detecting campaign:', error);
    return null;
  }
}

// =====================================================
// HELPER: Verificar se é lead orgânico
// =====================================================

async function checkIfOrganicLead(campaignId: string, username: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('aic_campaign_leads')
      .select('id, dm_status, source')
      .eq('campaign_id', campaignId)
      .eq('instagram_username', username)
      .maybeSingle();

    if (error) {
      console.error('[Instagram DM Webhook] Error checking lead:', error);
      return true; // Assumir orgânico em caso de erro
    }

    // Se não existe = orgânico
    // Se existe mas nunca foi contactado = orgânico
    return !data || data.dm_status === 'not_contacted';

  } catch (error) {
    console.error('[Instagram DM Webhook] Error in checkIfOrganicLead:', error);
    return true;
  }
}

// =====================================================
// HELPER: Registrar lead
// =====================================================

async function registerLead(params: {
  campaign_id: string;
  instagram_username: string;
  instagram_user_id: string;
  source: string;
  message_text: string;
}): Promise<any> {
  try {
    const { data, error } = await supabase.rpc('register_instagram_dm_lead', {
      p_campaign_id: params.campaign_id,
      p_username: params.instagram_username,
      p_user_id: params.instagram_user_id,
      p_source: params.source,
      p_message_text: params.message_text
    });

    if (error) {
      console.error('[Instagram DM Webhook] Error registering lead:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[Instagram DM Webhook] Error in registerLead:', error);
    throw error;
  }
}

// =====================================================
// HELPER: Enviar para N8N workflow
// =====================================================

async function sendToN8NWorkflow(payload: {
  platform: string;
  campaign_id: string;
  lead_id: string;
  username: string;
  user_id: string;
  message_text: string;
  timestamp: number;
  is_organic: boolean;
}): Promise<void> {
  try {
    const webhookUrl = `${N8N_WEBHOOK_URL}/${N8N_WORKFLOW_ID}`;

    console.log(`[Instagram DM Webhook] 🚀 Sending to N8N: ${webhookUrl}`);

    await axios.post(webhookUrl, {
      ...payload,
      webhook_source: 'instagram_dm',
      processed_at: new Date().toISOString()
    }, {
      timeout: 5000 // 5s timeout
    });

    console.log('[Instagram DM Webhook] ✅ Sent to N8N workflow');

  } catch (error: any) {
    console.error('[Instagram DM Webhook] Error sending to N8N:', error.message);
    // Não lançar erro - apenas logar
  }
}

// =====================================================
// EXPORT
// =====================================================

export default router;
