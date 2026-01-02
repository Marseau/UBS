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
// Com auto-registro de instagram_user_id se não encontrado
// =====================================================

async function detectCampaignByInstagramAccount(recipientId: string): Promise<any> {
  try {
    // 1. Primeiro, tentar buscar por instagram_user_id (caso já esteja configurado)
    const { data: dataById, error: errorById } = await supabase
      .from('instagram_accounts')
      .select(`
        id,
        instagram_username,
        instagram_user_id,
        campaign_id,
        campaigns:cluster_campaigns(*)
      `)
      .eq('instagram_user_id', recipientId)
      .single();

    if (!errorById && dataById) {
      console.log(`[Instagram DM Webhook] ✅ Found account by user_id: @${dataById.instagram_username}`);
      return dataById.campaigns;
    }

    // 2. Se não encontrou por user_id, listar contas sem user_id configurado
    // (provavelmente é a conta que está recebendo o DM)
    const { data: accountsWithoutUserId, error: errorNoId } = await supabase
      .from('instagram_accounts')
      .select(`
        id,
        instagram_username,
        instagram_user_id,
        campaign_id,
        campaigns:cluster_campaigns(*)
      `)
      .is('instagram_user_id', null)
      .not('status', 'in', '("disabled","permanently_blocked")');

    if (errorNoId || !accountsWithoutUserId || accountsWithoutUserId.length === 0) {
      console.warn('[Instagram DM Webhook] No accounts without user_id found');
      return null;
    }

    // 3. Se tem apenas uma conta sem user_id, associar automaticamente
    if (accountsWithoutUserId.length === 1) {
      const account = accountsWithoutUserId[0];

      // TypeScript safety check
      if (!account) {
        console.warn('[Instagram DM Webhook] Account not found in array');
        return null;
      }

      // Auto-registrar o instagram_user_id
      const { error: updateError } = await supabase
        .from('instagram_accounts')
        .update({
          instagram_user_id: recipientId,
          updated_at: new Date().toISOString()
        })
        .eq('id', account.id);

      if (updateError) {
        console.error('[Instagram DM Webhook] Error auto-registering user_id:', updateError);
      } else {
        console.log(`[Instagram DM Webhook] ✅ AUTO-REGISTERED instagram_user_id for @${account.instagram_username}: ${recipientId}`);
      }

      return account.campaigns;
    }

    // 4. Se tem múltiplas contas sem user_id, não conseguimos determinar qual é
    console.warn(`[Instagram DM Webhook] Multiple accounts (${accountsWithoutUserId.length}) without user_id. Cannot auto-register.`);
    console.warn('[Instagram DM Webhook] Accounts without user_id:', accountsWithoutUserId.map(a => a.instagram_username).join(', '));

    return null;
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
