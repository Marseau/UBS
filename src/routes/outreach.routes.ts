/**
 * OUTREACH API ROUTES
 *
 * Endpoints para o sistema unificado de outreach multi-canal.
 * Usado pelo N8N e dashboard para gerenciar campanhas de DM/WhatsApp.
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  personalizedDMService,
  generatePersonalizedDM,
  LeadProfile,
  CampaignContext
} from '../services/personalized-dm.service';
import {
  outreachAgentService,
  ProcessMessageResult,
  RateLimitStatus,
  ClassificationResult
} from '../services/outreach-agent.service';
import {
  whatsappSessionManager,
  WhatsAppSession,
  SessionStatus
} from '../services/whatsapp-session-manager.service';
import {
  responseQueueWorker,
  enqueueResponse,
  getQueueStatus,
  cleanupOldQueueItems
} from '../services/response-queue-worker.service';
import {
  credentialsVault
} from '../services/credentials-vault.service';

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// FILA DE OUTREACH
// ============================================================================

/**
 * POST /api/outreach/queue/populate
 * Popula a fila de outreach com leads qualificados de uma campanha
 */
router.post('/queue/populate', async (req, res) => {
  try {
    const { campaign_id, limit = 100, min_fit_score = 50 } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id é obrigatório'
      });
    }

    console.log(`\n📥 [OUTREACH] Populando fila para campanha ${campaign_id}`);
    console.log(`   Limite: ${limit} | Fit Score Mínimo: ${min_fit_score}`);

    const { data, error } = await supabase.rpc('populate_outreach_queue', {
      p_campaign_id: campaign_id,
      p_limit: limit,
      p_min_fit_score: min_fit_score
    });

    if (error) {
      console.error('❌ Erro ao popular fila:', error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    const result = data?.[0] || { leads_added: 0, channel_instagram: 0, channel_whatsapp: 0 };

    console.log(`✅ Fila populada com sucesso!`);
    console.log(`   Total: ${result.leads_added} leads`);
    console.log(`   Instagram: ${result.channel_instagram}`);
    console.log(`   WhatsApp: ${result.channel_whatsapp}`);

    return res.json({
      success: true,
      data: {
        leads_added: result.leads_added,
        by_channel: {
          instagram_dm: result.channel_instagram,
          whatsapp: result.channel_whatsapp
        }
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /queue/populate:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/outreach/queue/next
 * Busca próximo item da fila para processar
 * Usado pelo N8N para pegar o próximo lead
 */
router.get('/queue/next', async (req, res) => {
  try {
    const { channel, campaign_id } = req.query;

    const item = await personalizedDMService.getNextOutreachItem(
      channel as 'instagram_dm' | 'whatsapp' | undefined,
      campaign_id as string | undefined
    );

    if (!item) {
      return res.json({
        success: true,
        has_item: false,
        message: 'Nenhum item pendente na fila'
      });
    }

    return res.json({
      success: true,
      has_item: true,
      data: item
    });
  } catch (error: any) {
    console.error('❌ Erro em /queue/next:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/outreach/queue/stats
 * Estatísticas da fila de outreach
 */
router.get('/queue/stats', async (req, res) => {
  try {
    const { campaign_id } = req.query;

    let query = supabase
      .from('campaign_outreach_queue')
      .select('status, channel', { count: 'exact' });

    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Agregar por status e canal
    const stats = {
      total: data?.length || 0,
      by_status: {} as Record<string, number>,
      by_channel: {} as Record<string, number>
    };

    data?.forEach(item => {
      stats.by_status[item.status] = (stats.by_status[item.status] || 0) + 1;
      stats.by_channel[item.channel] = (stats.by_channel[item.channel] || 0) + 1;
    });

    return res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('❌ Erro em /queue/stats:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// GERAÇÃO DE MENSAGEM
// ============================================================================

/**
 * POST /api/outreach/generate-dm
 * Gera mensagem personalizada para um lead específico
 */
router.post('/generate-dm', async (req, res) => {
  try {
    const {
      queue_id,           // ID do item na fila (se vier da fila)
      lead,               // Dados do lead (se não vier da fila)
      campaign,           // Dados da campanha (se não vier da fila)
      channel = 'instagram_dm',
      template_id,
      custom_instructions,
      max_length = 500,
      tone = 'professional'
    } = req.body;

    let leadProfile: LeadProfile;
    let campaignContext: CampaignContext;

    // Se veio queue_id, buscar dados da fila
    if (queue_id) {
      console.log(`\n🎯 [OUTREACH] Gerando DM para item da fila: ${queue_id}`);

      const { data: queueItem, error } = await supabase
        .from('v_pending_outreach')
        .select('*')
        .eq('id', queue_id)
        .single();

      if (error || !queueItem) {
        return res.status(404).json({
          success: false,
          message: 'Item não encontrado na fila'
        });
      }

      leadProfile = {
        id: queueItem.lead_id,
        username: queueItem.lead_username,
        full_name: queueItem.lead_full_name,
        bio: queueItem.lead_bio,
        business_category: queueItem.lead_business_category,
        segment: queueItem.lead_segment,
        hashtags_bio: queueItem.lead_hashtags_bio,
        hashtags_posts: queueItem.lead_hashtags_posts,
        has_phone: !!queueItem.lead_phone,
        has_email: !!queueItem.lead_email
      };

      campaignContext = {
        id: queueItem.campaign_id,
        campaign_name: queueItem.campaign_name,
        nicho_principal: queueItem.nicho_principal,
        nicho_secundario: queueItem.nicho_secundario,
        keywords: queueItem.campaign_keywords || [],
        service_description: queueItem.service_description,
        target_audience: queueItem.target_audience,
        client_name: queueItem.client_name,
        project_name: queueItem.project_name,
        preferred_channel: 'auto'
      };
    } else {
      // Usar dados passados diretamente
      if (!lead || !campaign) {
        return res.status(400).json({
          success: false,
          message: 'Forneça queue_id ou (lead + campaign)'
        });
      }

      leadProfile = lead;
      campaignContext = campaign;
    }

    // Gerar mensagem personalizada
    const generatedDM = await generatePersonalizedDM({
      lead: leadProfile,
      campaign: campaignContext,
      channel: channel as 'instagram_dm' | 'whatsapp',
      template_id,
      custom_instructions,
      max_length,
      tone
    });

    return res.json({
      success: true,
      data: {
        message_text: generatedDM.message_text,
        message_generated_by: generatedDM.message_generated_by,
        personalization_data: generatedDM.personalization_data,
        tokens_used: generatedDM.tokens_used,
        estimated_cost: generatedDM.estimated_cost,
        confidence_score: generatedDM.confidence_score
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /generate-dm:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/send-dm
 * Endpoint completo: busca próximo da fila, gera DM, marca como enviado
 * Usado pelo N8N para processar outreach de forma simplificada
 */
router.post('/send-dm', async (req, res) => {
  try {
    const {
      channel,
      campaign_id,
      custom_instructions,
      max_length = 500,
      tone = 'professional',
      dry_run = false  // Se true, só gera mensagem sem marcar como enviado
    } = req.body;

    console.log(`\n🚀 [OUTREACH] Processando próximo DM`);
    console.log(`   Canal: ${channel || 'auto'}`);
    console.log(`   Campanha: ${campaign_id || 'qualquer'}`);
    console.log(`   Dry Run: ${dry_run}`);

    // 1. Buscar próximo item da fila
    const queueItem = await personalizedDMService.getNextOutreachItem(
      channel as 'instagram_dm' | 'whatsapp' | undefined,
      campaign_id
    );

    if (!queueItem) {
      return res.json({
        success: true,
        has_item: false,
        message: 'Nenhum item pendente na fila'
      });
    }

    // 2. Montar perfil do lead
    const leadProfile: LeadProfile = {
      id: queueItem.lead_id,
      username: queueItem.lead_username,
      full_name: queueItem.lead_full_name,
      bio: queueItem.lead_bio,
      business_category: queueItem.lead_business_category,
      segment: queueItem.lead_segment,
      hashtags_bio: queueItem.lead_hashtags_bio,
      hashtags_posts: queueItem.lead_hashtags_posts,
      has_phone: !!queueItem.lead_phone,
      has_email: !!queueItem.lead_email
    };

    // 3. Montar contexto da campanha
    const campaignContext: CampaignContext = {
      id: queueItem.campaign_id,
      campaign_name: queueItem.campaign_name,
      nicho_principal: queueItem.nicho_principal,
      nicho_secundario: queueItem.nicho_secundario,
      keywords: queueItem.campaign_keywords || [],
      service_description: queueItem.service_description,
      target_audience: queueItem.target_audience,
      client_name: queueItem.client_name,
      project_name: queueItem.project_name,
      preferred_channel: 'auto'
    };

    // 4. Gerar mensagem personalizada
    const generatedDM = await generatePersonalizedDM({
      lead: leadProfile,
      campaign: campaignContext,
      channel: queueItem.channel,
      custom_instructions,
      max_length,
      tone
    });

    // 5. Salvar mensagem no histórico
    await personalizedDMService.saveOutreachMessage(
      queueItem.id,
      queueItem.campaign_id,
      queueItem.lead_id,
      queueItem.channel,
      generatedDM
    );

    // 6. Se não for dry run, marcar como pronto para envio
    //    (o envio real será feito pelo Puppeteer no próximo step)
    if (!dry_run) {
      // Atualizar com a mensagem gerada (status ainda é 'processing')
      await supabase
        .from('campaign_outreach_queue')
        .update({
          message_text: generatedDM.message_text,
          message_generated_by: generatedDM.message_generated_by,
          generation_prompt: generatedDM.generation_prompt,
          personalization_data: generatedDM.personalization_data
        })
        .eq('id', queueItem.id);
    }

    return res.json({
      success: true,
      has_item: true,
      data: {
        queue_id: queueItem.id,
        lead_id: queueItem.lead_id,
        username: queueItem.lead_username,
        full_name: queueItem.lead_full_name,
        channel: queueItem.channel,
        phone: queueItem.lead_phone,
        campaign_name: queueItem.campaign_name,
        message_text: generatedDM.message_text,
        message_generated_by: generatedDM.message_generated_by,
        confidence_score: generatedDM.confidence_score,
        personalization_data: generatedDM.personalization_data
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /send-dm:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/mark-sent
 * Marca um item como enviado com sucesso
 */
router.post('/mark-sent', async (req, res) => {
  try {
    const { queue_id, delivery_status = 'sent' } = req.body;

    if (!queue_id) {
      return res.status(400).json({
        success: false,
        message: 'queue_id é obrigatório'
      });
    }

    await supabase
      .from('campaign_outreach_queue')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        delivery_status,
        updated_at: new Date().toISOString()
      })
      .eq('id', queue_id);

    console.log(`✅ [OUTREACH] Item ${queue_id} marcado como enviado`);

    return res.json({
      success: true,
      message: 'Item marcado como enviado'
    });
  } catch (error: any) {
    console.error('❌ Erro em /mark-sent:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/mark-failed
 * Marca um item como falha
 */
router.post('/mark-failed', async (req, res) => {
  try {
    const { queue_id, error_message, retry = true } = req.body;

    if (!queue_id) {
      return res.status(400).json({
        success: false,
        message: 'queue_id é obrigatório'
      });
    }

    // Buscar item atual para ver tentativas
    const { data: item } = await supabase
      .from('campaign_outreach_queue')
      .select('attempt_count, max_attempts')
      .eq('id', queue_id)
      .single();

    const attemptCount = (item?.attempt_count || 0) + 1;
    const maxAttempts = item?.max_attempts || 3;

    // Se ainda pode retry e foi solicitado
    const newStatus = retry && attemptCount < maxAttempts ? 'pending' : 'failed';

    await supabase
      .from('campaign_outreach_queue')
      .update({
        status: newStatus,
        error_message,
        attempt_count: attemptCount,
        last_attempt_at: new Date().toISOString(),
        next_retry_at: newStatus === 'pending'
          ? new Date(Date.now() + 30 * 60 * 1000).toISOString()  // 30 min
          : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', queue_id);

    console.log(`❌ [OUTREACH] Item ${queue_id} marcado como ${newStatus} (tentativa ${attemptCount}/${maxAttempts})`);

    return res.json({
      success: true,
      message: `Item marcado como ${newStatus}`,
      will_retry: newStatus === 'pending',
      attempt_count: attemptCount
    });
  } catch (error: any) {
    console.error('❌ Erro em /mark-failed:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/mark-replied
 * Marca um item quando o lead responde
 */
router.post('/mark-replied', async (req, res) => {
  try {
    const { queue_id, response_text } = req.body;

    if (!queue_id) {
      return res.status(400).json({
        success: false,
        message: 'queue_id é obrigatório'
      });
    }

    await supabase
      .from('campaign_outreach_queue')
      .update({
        status: 'replied',
        replied_at: new Date().toISOString(),
        response_text,
        updated_at: new Date().toISOString()
      })
      .eq('id', queue_id);

    console.log(`💬 [OUTREACH] Item ${queue_id} - Lead respondeu!`);

    return res.json({
      success: true,
      message: 'Item marcado como respondido'
    });
  } catch (error: any) {
    console.error('❌ Erro em /mark-replied:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// CAMPANHAS
// ============================================================================

/**
 * GET /api/outreach/campaigns
 * Lista campanhas com estatísticas de outreach
 */
router.get('/campaigns', async (req, res) => {
  try {
    const { data: campaigns, error } = await supabase
      .from('cluster_campaigns')
      .select(`
        *,
        cluster_projects (
          client_name,
          project_name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Buscar estatísticas de outreach para cada campanha
    const campaignsWithStats = await Promise.all(
      (campaigns || []).map(async (campaign) => {
        const { data: stats } = await supabase
          .from('campaign_outreach_queue')
          .select('status')
          .eq('campaign_id', campaign.id);

        const outreachStats = {
          total: stats?.length || 0,
          pending: stats?.filter(s => s.status === 'pending').length || 0,
          sent: stats?.filter(s => s.status === 'sent').length || 0,
          replied: stats?.filter(s => s.status === 'replied').length || 0,
          failed: stats?.filter(s => s.status === 'failed').length || 0
        };

        return {
          ...campaign,
          outreach_stats: outreachStats
        };
      })
    );

    return res.json({
      success: true,
      data: campaignsWithStats
    });
  } catch (error: any) {
    console.error('❌ Erro em /campaigns:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * GET /api/outreach/templates
 * Lista templates de mensagem disponíveis
 */
router.get('/templates', async (req, res) => {
  try {
    const { channel, industry, category } = req.query;

    let query = supabase
      .from('outreach_templates')
      .select('*')
      .eq('active', true)
      .order('times_used', { ascending: false });

    if (channel) {
      query = query.or(`channel.eq.${channel},channel.eq.both`);
    }

    if (industry) {
      query = query.eq('industry', industry);
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.json({
      success: true,
      data: data || []
    });
  } catch (error: any) {
    console.error('❌ Erro em /templates:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/templates
 * Criar novo template
 */
router.post('/templates', async (req, res) => {
  try {
    const {
      name,
      description,
      channel,
      category,
      industry,
      template_text,
      ai_instructions,
      tone,
      max_length
    } = req.body;

    if (!name || !channel || !template_text) {
      return res.status(400).json({
        success: false,
        message: 'name, channel e template_text são obrigatórios'
      });
    }

    const { data, error } = await supabase
      .from('outreach_templates')
      .insert({
        name,
        description,
        channel,
        category,
        industry,
        template_text,
        ai_instructions,
        tone,
        max_length
      })
      .select()
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('❌ Erro ao criar template:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// AGENTE IA - ENDPOINTS
// ============================================================================

/**
 * POST /api/outreach/rate-limit/check
 * Verifica se pode enviar mensagem (rate limit + horário comercial)
 */
router.post('/rate-limit/check', async (req, res) => {
  try {
    const { campaign_id, hourly_limit = 15, daily_limit = 120 } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id é obrigatório'
      });
    }

    const status = await outreachAgentService.checkRateLimit(campaign_id, hourly_limit, daily_limit);

    return res.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    console.error('❌ Erro em /rate-limit/check:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/rate-limit/increment
 * Incrementa contador de mensagens enviadas
 */
router.post('/rate-limit/increment', async (req, res) => {
  try {
    const { campaign_id } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id é obrigatório'
      });
    }

    await outreachAgentService.incrementRateLimit(campaign_id);

    return res.json({
      success: true,
      message: 'Rate limit incrementado'
    });
  } catch (error: any) {
    console.error('❌ Erro em /rate-limit/increment:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/classify-response
 * Classifica resposta do lead para determinar interesse
 */
router.post('/classify-response', async (req, res) => {
  try {
    const { campaign_id, lead_message, conversation_id } = req.body;

    if (!campaign_id || !lead_message) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id e lead_message são obrigatórios'
      });
    }

    // Carregar contexto do negócio da campanha
    const businessContext = await outreachAgentService.getCampaignBusinessContext(campaign_id);
    if (!businessContext) {
      return res.status(404).json({
        success: false,
        message: 'Contexto de negócio não encontrado para esta campanha'
      });
    }

    // Carregar histórico se tiver conversation_id
    let history: any[] = [];
    if (conversation_id) {
      history = await outreachAgentService.getConversationHistory(conversation_id);
    }

    // Classificar
    const classification = await outreachAgentService.classifyResponse(
      lead_message,
      history,
      businessContext
    );

    return res.json({
      success: true,
      data: classification
    });
  } catch (error: any) {
    console.error('❌ Erro em /classify-response:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/auto-reply
 * Gera e processa resposta automática para mensagem do lead
 * Este é o endpoint principal para o N8N chamar quando receber uma resposta
 */
router.post('/auto-reply', async (req, res) => {
  try {
    const {
      campaign_id,
      lead_id,
      lead_username,
      lead_full_name,
      lead_bio,
      lead_phone,
      incoming_message
    } = req.body;

    if (!campaign_id || !lead_id || !incoming_message) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id, lead_id e incoming_message são obrigatórios'
      });
    }

    console.log(`\n🤖 [AUTO-REPLY] Processando resposta do lead @${lead_username}`);

    const result = await outreachAgentService.processLeadMessage(
      campaign_id,
      lead_id,
      {
        username: lead_username,
        full_name: lead_full_name,
        bio: lead_bio,
        phone: lead_phone
      },
      incoming_message
    );

    return res.json({
      success: result.success,
      data: {
        action: result.action,
        response_message: result.response_message,
        should_send_response: result.should_send_response,
        conversation_id: result.conversation_id,
        classification: result.classification
      },
      error: result.error_message
    });
  } catch (error: any) {
    console.error('❌ Erro em /auto-reply:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/handoff
 * Executa handoff de uma conversa para atendimento humano
 */
router.post('/handoff', async (req, res) => {
  try {
    const { conversation_id, reason, notes, notify_channels = ['email', 'whatsapp'] } = req.body;

    if (!conversation_id || !reason) {
      return res.status(400).json({
        success: false,
        message: 'conversation_id e reason são obrigatórios'
      });
    }

    console.log(`\n🔄 [HANDOFF] Executando handoff`);
    console.log(`   Conversa: ${conversation_id}`);
    console.log(`   Motivo: ${reason}`);

    const result = await outreachAgentService.executeHandoff(conversation_id, reason, notes);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao executar handoff'
      });
    }

    // Buscar dados da conversa para notificação
    const { data: conversation } = await supabase
      .from('outreach_conversations')
      .select(`
        *,
        instagram_leads (
          username,
          full_name,
          phone_normalized,
          bio
        )
      `)
      .eq('id', conversation_id)
      .single();

    // Buscar últimas mensagens para contexto
    const history = await outreachAgentService.getConversationHistory(conversation_id, 10);

    return res.json({
      success: true,
      data: {
        handoff_id: result.handoff_id,
        conversation,
        recent_messages: history,
        notify_channels
      },
      message: 'Handoff executado com sucesso'
    });
  } catch (error: any) {
    console.error('❌ Erro em /handoff:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/outreach/handoffs/pending
 * Lista handoffs pendentes para atendimento
 */
router.get('/handoffs/pending', async (req, res) => {
  try {
    const { project_id } = req.query;

    let query = supabase
      .from('outreach_conversations')
      .select(`
        *,
        instagram_leads (
          username,
          full_name,
          phone_normalized,
          bio,
          business_category
        )
      `)
      .in('status', ['handoff_pending', 'interested'])
      .order('handoff_at', { ascending: false });

    if (project_id) {
      query = query.eq('project_id', project_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    });
  } catch (error: any) {
    console.error('❌ Erro em /handoffs/pending:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/handoff/complete
 * Marca handoff como completado (humano assumiu)
 */
router.post('/handoff/complete', async (req, res) => {
  try {
    const { conversation_id, user_id, notes } = req.body;

    if (!conversation_id) {
      return res.status(400).json({
        success: false,
        message: 'conversation_id é obrigatório'
      });
    }

    await supabase
      .from('outreach_conversations')
      .update({
        status: 'human_handling',
        handoff_to_user_id: user_id,
        handoff_notes: notes
      })
      .eq('id', conversation_id);

    // Adicionar mensagem de sistema
    await outreachAgentService.saveMessage(
      conversation_id,
      'outbound',
      'system',
      `[HANDOFF COMPLETO] Atendente humano assumiu a conversa`
    );

    return res.json({
      success: true,
      message: 'Handoff completado'
    });
  } catch (error: any) {
    console.error('❌ Erro em /handoff/complete:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/outreach/conversation/:id
 * Busca conversa com histórico completo
 */
router.get('/conversation/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: conversation, error } = await supabase
      .from('outreach_conversations')
      .select(`
        *,
        instagram_leads (
          username,
          full_name,
          phone_normalized,
          bio,
          business_category,
          external_url
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    const messages = await outreachAgentService.getConversationHistory(id, 50);

    return res.json({
      success: true,
      data: {
        ...conversation,
        messages
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /conversation/:id:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/blacklist/add
 * Adiciona lead à blacklist
 */
router.post('/blacklist/add', async (req, res) => {
  try {
    const {
      campaign_id,
      lead_id,
      phone,
      instagram_username,
      reason,
      reason_details
    } = req.body;

    if (!campaign_id || !reason) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id e reason são obrigatórios'
      });
    }

    await outreachAgentService.addToBlacklist(
      campaign_id,
      reason,
      phone,
      instagram_username,
      lead_id,
      reason_details
    );

    return res.json({
      success: true,
      message: 'Lead adicionado à blacklist'
    });
  } catch (error: any) {
    console.error('❌ Erro em /blacklist/add:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/blacklist/check
 * Verifica se lead está na blacklist
 */
router.post('/blacklist/check', async (req, res) => {
  try {
    const { campaign_id, phone, instagram_username } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id é obrigatório'
      });
    }

    const isBlacklisted = await outreachAgentService.isBlacklisted(
      campaign_id,
      phone,
      instagram_username
    );

    return res.json({
      success: true,
      is_blacklisted: isBlacklisted
    });
  } catch (error: any) {
    console.error('❌ Erro em /blacklist/check:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/outreach/business-context/:campaign_id
 * Busca contexto de negócio da campanha
 */
router.get('/business-context/:campaign_id', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const context = await outreachAgentService.getCampaignBusinessContext(campaign_id);

    if (!context) {
      return res.status(404).json({
        success: false,
        message: 'Contexto de negócio não encontrado para esta campanha'
      });
    }

    return res.json({
      success: true,
      data: context
    });
  } catch (error: any) {
    console.error('❌ Erro em /business-context:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/business-context
 * Atualiza contexto de negócio/outreach da CAMPANHA (cluster_campaigns)
 * O contexto agora é armazenado diretamente na tabela de campanhas
 */
router.post('/business-context', async (req, res) => {
  try {
    const {
      campaign_id,
      business_name,
      business_type,
      value_proposition,
      main_products_services,
      differentials,
      communication_tone,
      brand_personality,
      first_contact_script,
      follow_up_script,
      closing_phrases,
      prohibited_phrases,
      active_offers,
      agent_name,
      max_ai_responses_before_handoff,
      interest_keywords,
      rejection_keywords,
      outreach_hourly_limit,
      outreach_daily_limit,
      outreach_enabled
    } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id é obrigatório'
      });
    }

    // Atualizar campos de outreach na campanha
    const { data, error } = await supabase
      .from('cluster_campaigns')
      .update({
        business_name,
        business_type,
        value_proposition,
        main_products_services,
        differentials,
        communication_tone: communication_tone || 'profissional_amigavel',
        brand_personality,
        first_contact_script,
        follow_up_script,
        closing_phrases,
        prohibited_phrases,
        active_offers,
        agent_name: agent_name || 'Assistente',
        max_ai_responses_before_handoff: max_ai_responses_before_handoff || 5,
        interest_keywords: interest_keywords || ['interessado', 'quero', 'quanto custa', 'preço'],
        rejection_keywords: rejection_keywords || ['não quero', 'não tenho interesse', 'pare'],
        outreach_hourly_limit: outreach_hourly_limit || 15,
        outreach_daily_limit: outreach_daily_limit || 120,
        outreach_enabled: outreach_enabled !== undefined ? outreach_enabled : false
      })
      .eq('id', campaign_id)
      .select()
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('❌ Erro ao salvar business context:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/send-whatsapp
 * Endpoint completo para enviar mensagem via WhatsApp com rate limiting
 * Usado pelo N8N Sender workflow
 */
router.post('/send-whatsapp', async (req, res) => {
  try {
    const {
      campaign_id,
      dry_run = false
    } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id é obrigatório'
      });
    }

    console.log(`\n📤 [SEND-WHATSAPP] Processando envio`);
    console.log(`   Campanha: ${campaign_id}`);
    console.log(`   Dry Run: ${dry_run}`);

    // 1. Verificar rate limit e horário comercial
    const rateStatus = await outreachAgentService.checkRateLimit(campaign_id);

    if (!rateStatus.can_send) {
      return res.json({
        success: true,
        can_send: false,
        reason: rateStatus.reason,
        rate_status: rateStatus,
        message: `Não é possível enviar agora: ${rateStatus.reason}`,
        next_available: rateStatus.next_available_slot
      });
    }

    // 2. Buscar próximo item da fila
    const queueItem = await personalizedDMService.getNextOutreachItem(
      'whatsapp',
      campaign_id
    );

    if (!queueItem) {
      return res.json({
        success: true,
        can_send: true,
        has_item: false,
        message: 'Nenhum item pendente na fila',
        rate_status: rateStatus
      });
    }

    // 3. Verificar blacklist
    const isBlacklisted = await outreachAgentService.isBlacklisted(
      campaign_id,
      queueItem.lead_phone,
      queueItem.lead_username
    );

    if (isBlacklisted) {
      // Marcar como bloqueado e buscar próximo
      await supabase
        .from('campaign_outreach_queue')
        .update({ status: 'blocked', error_message: 'Lead na blacklist' })
        .eq('id', queueItem.id);

      return res.json({
        success: true,
        can_send: true,
        has_item: false,
        message: 'Lead na blacklist, busque próximo',
        skipped_lead: queueItem.lead_username
      });
    }

    // 4. Gerar mensagem personalizada
    const leadProfile: LeadProfile = {
      id: queueItem.lead_id,
      username: queueItem.lead_username,
      full_name: queueItem.lead_full_name,
      bio: queueItem.lead_bio,
      business_category: queueItem.lead_business_category,
      segment: queueItem.lead_segment,
      hashtags_bio: queueItem.lead_hashtags_bio,
      hashtags_posts: queueItem.lead_hashtags_posts,
      has_phone: !!queueItem.lead_phone,
      has_email: !!queueItem.lead_email
    };

    const campaignContext: CampaignContext = {
      id: queueItem.campaign_id,
      campaign_name: queueItem.campaign_name,
      nicho_principal: queueItem.nicho_principal,
      nicho_secundario: queueItem.nicho_secundario,
      keywords: queueItem.campaign_keywords || [],
      service_description: queueItem.service_description,
      target_audience: queueItem.target_audience,
      client_name: queueItem.client_name,
      project_name: queueItem.project_name,
      preferred_channel: 'auto'
    };

    const generatedDM = await generatePersonalizedDM({
      lead: leadProfile,
      campaign: campaignContext,
      channel: 'whatsapp',
      tone: 'professional'
    });

    // 5. Criar conversa se não existir
    const conversation = await outreachAgentService.getOrCreateConversation(
      campaign_id,
      queueItem.lead_id,
      {
        username: queueItem.lead_username,
        full_name: queueItem.lead_full_name,
        bio: queueItem.lead_bio,
        phone: queueItem.lead_phone
      }
    );

    // 6. Se não for dry run, salvar mensagem e incrementar rate limit
    if (!dry_run) {
      await personalizedDMService.saveOutreachMessage(
        queueItem.id,
        queueItem.campaign_id,
        queueItem.lead_id,
        'whatsapp',
        generatedDM
      );

      // Salvar na conversa
      await outreachAgentService.saveMessage(
        conversation.id,
        'outbound',
        'ai',
        generatedDM.message_text,
        { detected_intent: 'first_contact' }
      );

      // Incrementar rate limit
      await outreachAgentService.incrementRateLimit(campaign_id);

      // Atualizar fila com mensagem gerada
      await supabase
        .from('campaign_outreach_queue')
        .update({
          message_text: generatedDM.message_text,
          message_generated_by: generatedDM.message_generated_by,
          personalization_data: generatedDM.personalization_data
        })
        .eq('id', queueItem.id);
    }

    return res.json({
      success: true,
      can_send: true,
      has_item: true,
      data: {
        queue_id: queueItem.id,
        lead_id: queueItem.lead_id,
        conversation_id: conversation.id,
        username: queueItem.lead_username,
        full_name: queueItem.lead_full_name,
        phone: queueItem.lead_phone,
        campaign_name: queueItem.campaign_name,
        message_text: generatedDM.message_text,
        confidence_score: generatedDM.confidence_score
      },
      rate_status: {
        hourly_remaining: rateStatus.hourly_remaining - 1,
        daily_remaining: rateStatus.daily_remaining - 1
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /send-whatsapp:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// WHATSAPP SESSION MANAGEMENT
// ============================================================================

/**
 * GET /api/outreach/whatsapp-sessions
 * Lista todas as sessões WhatsApp ativas
 */
router.get('/whatsapp-sessions', async (req, res) => {
  try {
    const sessions = await whatsappSessionManager.listActiveSessions();

    return res.json({
      success: true,
      data: sessions,
      count: sessions.length,
      max_sessions: whatsappSessionManager.CONFIG.MAX_SESSIONS
    });
  } catch (error: any) {
    console.error('❌ Erro em /whatsapp-sessions:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/outreach/whatsapp-sessions/:session_id
 * Busca status de uma sessão específica
 */
router.get('/whatsapp-sessions/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;

    const status = await whatsappSessionManager.getSessionStatus(session_id);

    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Sessão não encontrada'
      });
    }

    return res.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    console.error('❌ Erro em /whatsapp-sessions/:id:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/outreach/whatsapp-sessions/campaign/:campaign_id
 * Busca sessão de uma campanha específica
 */
router.get('/whatsapp-sessions/campaign/:campaign_id', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const session = await whatsappSessionManager.getSessionByCampaign(campaign_id);

    if (!session) {
      return res.json({
        success: true,
        has_session: false,
        message: 'Nenhuma sessão configurada para esta campanha'
      });
    }

    const status = await whatsappSessionManager.getSessionStatus(session.id);

    return res.json({
      success: true,
      has_session: true,
      data: status
    });
  } catch (error: any) {
    console.error('❌ Erro em /whatsapp-sessions/campaign/:id:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/whatsapp-sessions/create
 * Cria nova sessão WhatsApp para uma campanha
 */
router.post('/whatsapp-sessions/create', async (req, res) => {
  try {
    const { campaign_id, session_name } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id é obrigatório'
      });
    }

    // Verificar se campanha existe
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name')
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    const name = session_name || `WhatsApp - ${campaign.campaign_name}`;

    console.log(`\n📱 [WHATSAPP] Criando sessão para campanha ${campaign_id}`);

    const session = await whatsappSessionManager.createSession(campaign_id, name);

    return res.json({
      success: true,
      data: {
        session_id: session.id,
        campaign_id: session.campaignId,
        session_name: session.sessionName,
        status: session.status
      },
      message: 'Sessão criada. Use /whatsapp-sessions/start-qr para gerar QR Code.'
    });
  } catch (error: any) {
    console.error('❌ Erro ao criar sessão:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/whatsapp-sessions/start-qr
 * Inicia browser e gera QR Code para autenticação
 */
router.post('/whatsapp-sessions/start-qr', async (req, res) => {
  try {
    const { session_id, campaign_id } = req.body;

    let targetSessionId = session_id;

    // Se veio campaign_id, buscar sessão
    if (!targetSessionId && campaign_id) {
      const session = await whatsappSessionManager.getSessionByCampaign(campaign_id);
      if (session) {
        targetSessionId = session.id;
      } else {
        // Criar sessão automaticamente
        const { data: campaign } = await supabase
          .from('cluster_campaigns')
          .select('campaign_name')
          .eq('id', campaign_id)
          .single();

        const newSession = await whatsappSessionManager.createSession(
          campaign_id,
          `WhatsApp - ${campaign?.campaign_name || campaign_id}`
        );
        targetSessionId = newSession.id;
      }
    }

    if (!targetSessionId) {
      return res.status(400).json({
        success: false,
        message: 'session_id ou campaign_id é obrigatório'
      });
    }

    console.log(`\n🔄 [WHATSAPP] Gerando QR Code para sessão ${targetSessionId}`);

    const { qrCode, expiresAt } = await whatsappSessionManager.startSessionAndGetQR(targetSessionId);

    // Se já estava conectado, qrCode será vazio
    if (!qrCode) {
      return res.json({
        success: true,
        already_connected: true,
        message: 'Sessão já está conectada'
      });
    }

    return res.json({
      success: true,
      data: {
        session_id: targetSessionId,
        qr_code: qrCode,
        expires_at: expiresAt,
        expires_in_seconds: Math.floor((expiresAt.getTime() - Date.now()) / 1000)
      },
      message: 'QR Code gerado. Cliente deve escanear para conectar.'
    });
  } catch (error: any) {
    console.error('❌ Erro ao gerar QR Code:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/whatsapp-sessions/send-message
 * Envia mensagem via sessão WhatsApp
 */
router.post('/whatsapp-sessions/send-message', async (req, res) => {
  try {
    const { session_id, campaign_id, phone_number, message_text } = req.body;

    let targetSessionId = session_id;

    // Se veio campaign_id, buscar sessão
    if (!targetSessionId && campaign_id) {
      const session = await whatsappSessionManager.getSessionByCampaign(campaign_id);
      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Nenhuma sessão encontrada para esta campanha'
        });
      }
      targetSessionId = session.id;
    }

    if (!targetSessionId || !phone_number || !message_text) {
      return res.status(400).json({
        success: false,
        message: 'session_id (ou campaign_id), phone_number e message_text são obrigatórios'
      });
    }

    console.log(`\n📤 [WHATSAPP] Enviando mensagem via sessão ${targetSessionId}`);

    const result = await whatsappSessionManager.sendMessage(
      targetSessionId,
      phone_number,
      message_text
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Erro ao enviar mensagem'
      });
    }

    return res.json({
      success: true,
      data: {
        message_id: result.messageId,
        sent_at: result.sentAt
      }
    });
  } catch (error: any) {
    console.error('❌ Erro ao enviar mensagem:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/whatsapp-sessions/close
 * Fecha uma sessão WhatsApp
 */
router.post('/whatsapp-sessions/close', async (req, res) => {
  try {
    const { session_id, campaign_id } = req.body;

    let targetSessionId = session_id;

    // Se veio campaign_id, buscar sessão
    if (!targetSessionId && campaign_id) {
      const session = await whatsappSessionManager.getSessionByCampaign(campaign_id);
      if (session) {
        targetSessionId = session.id;
      }
    }

    if (!targetSessionId) {
      return res.status(400).json({
        success: false,
        message: 'session_id ou campaign_id é obrigatório'
      });
    }

    console.log(`\n🔌 [WHATSAPP] Fechando sessão ${targetSessionId}`);

    await whatsappSessionManager.closeSession(targetSessionId);

    return res.json({
      success: true,
      message: 'Sessão fechada com sucesso'
    });
  } catch (error: any) {
    console.error('❌ Erro ao fechar sessão:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/whatsapp-sessions/close-all
 * Fecha todas as sessões WhatsApp (admin)
 */
router.post('/whatsapp-sessions/close-all', async (req, res) => {
  try {
    console.log(`\n🔌 [WHATSAPP] Fechando todas as sessões`);

    await whatsappSessionManager.closeAllSessions();

    return res.json({
      success: true,
      message: 'Todas as sessões foram fechadas'
    });
  } catch (error: any) {
    console.error('❌ Erro ao fechar sessões:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/whatsapp-sessions/start-heartbeat
 * Inicia heartbeat para manter sessões vivas
 */
router.post('/whatsapp-sessions/start-heartbeat', async (req, res) => {
  try {
    whatsappSessionManager.startHeartbeat();

    return res.json({
      success: true,
      message: 'Heartbeat iniciado'
    });
  } catch (error: any) {
    console.error('❌ Erro ao iniciar heartbeat:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// UNIFIED OUTREACH SENDER (Instagram DM + WhatsApp)
// ============================================================================

/**
 * POST /api/outreach/unified/send
 * Endpoint unificado para envio de mensagens (Instagram DM ou WhatsApp)
 * Detecta automaticamente o canal e processa de forma unificada.
 *
 * Usado pelo N8N Unified Outreach Workflow
 */
router.post('/unified/send', async (req, res) => {
  try {
    const {
      campaign_id,
      channel,  // 'instagram_dm' | 'whatsapp' | 'auto'
      dry_run = false
    } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id é obrigatório'
      });
    }

    const effectiveChannel = channel || 'auto';

    console.log(`\n🚀 [UNIFIED SENDER] Processando envio`);
    console.log(`   Campanha: ${campaign_id}`);
    console.log(`   Canal: ${effectiveChannel}`);
    console.log(`   Dry Run: ${dry_run}`);

    // 1. Verificar rate limit e horário comercial
    const rateStatus = await outreachAgentService.checkRateLimit(campaign_id);

    if (!rateStatus.can_send) {
      return res.json({
        success: true,
        can_send: false,
        reason: rateStatus.reason,
        rate_status: rateStatus,
        message: `Não é possível enviar agora: ${rateStatus.reason}`,
        next_available: rateStatus.next_available_slot
      });
    }

    // 2. Buscar próximo item da fila
    const queueItem = await personalizedDMService.getNextOutreachItem(
      effectiveChannel === 'auto' ? undefined : effectiveChannel as 'instagram_dm' | 'whatsapp',
      campaign_id
    );

    if (!queueItem) {
      return res.json({
        success: true,
        can_send: true,
        has_item: false,
        message: 'Nenhum item pendente na fila',
        rate_status: rateStatus
      });
    }

    const targetChannel = queueItem.channel; // Canal real do lead

    // 3. Verificar blacklist
    const isBlacklisted = await outreachAgentService.isBlacklisted(
      campaign_id,
      queueItem.lead_phone,
      queueItem.lead_username
    );

    if (isBlacklisted) {
      await supabase
        .from('campaign_outreach_queue')
        .update({ status: 'blocked', error_message: 'Lead na blacklist' })
        .eq('id', queueItem.id);

      return res.json({
        success: true,
        can_send: true,
        has_item: false,
        message: 'Lead na blacklist, busque próximo',
        skipped_lead: queueItem.lead_username
      });
    }

    // 4. Verificar sessão WhatsApp se for canal WhatsApp
    let whatsappSession: WhatsAppSession | null = null;
    if (targetChannel === 'whatsapp') {
      whatsappSession = await whatsappSessionManager.getSessionByCampaign(campaign_id);

      if (!whatsappSession) {
        return res.json({
          success: true,
          can_send: true,
          has_item: true,
          channel: 'whatsapp',
          session_required: true,
          message: 'Sessão WhatsApp não configurada para esta campanha',
          setup_url: `/api/outreach/whatsapp-sessions/create`
        });
      }

      const sessionStatus = await whatsappSessionManager.getSessionStatus(whatsappSession.id);

      if (!sessionStatus?.isConnected) {
        return res.json({
          success: true,
          can_send: true,
          has_item: true,
          channel: 'whatsapp',
          session_status: sessionStatus?.status,
          qr_required: true,
          message: 'Sessão WhatsApp desconectada. Gere novo QR Code.',
          qr_url: `/api/outreach/whatsapp-sessions/start-qr`
        });
      }

      if (!sessionStatus.canSend) {
        return res.json({
          success: true,
          can_send: false,
          channel: 'whatsapp',
          reason: 'Rate limit da sessão WhatsApp atingido',
          session_status: sessionStatus
        });
      }
    }

    // 5. Gerar mensagem personalizada
    const leadProfile: LeadProfile = {
      id: queueItem.lead_id,
      username: queueItem.lead_username,
      full_name: queueItem.lead_full_name,
      bio: queueItem.lead_bio,
      business_category: queueItem.lead_business_category,
      segment: queueItem.lead_segment,
      hashtags_bio: queueItem.lead_hashtags_bio,
      hashtags_posts: queueItem.lead_hashtags_posts,
      has_phone: !!queueItem.lead_phone,
      has_email: !!queueItem.lead_email
    };

    const campaignContext: CampaignContext = {
      id: queueItem.campaign_id,
      campaign_name: queueItem.campaign_name,
      nicho_principal: queueItem.nicho_principal,
      nicho_secundario: queueItem.nicho_secundario,
      keywords: queueItem.campaign_keywords || [],
      service_description: queueItem.service_description,
      target_audience: queueItem.target_audience,
      client_name: queueItem.client_name,
      project_name: queueItem.project_name,
      preferred_channel: 'auto'
    };

    const generatedDM = await generatePersonalizedDM({
      lead: leadProfile,
      campaign: campaignContext,
      channel: targetChannel,
      tone: 'professional'
    });

    // 6. Criar/obter conversa
    const conversation = await outreachAgentService.getOrCreateConversation(
      campaign_id,
      queueItem.lead_id,
      {
        username: queueItem.lead_username,
        full_name: queueItem.lead_full_name,
        bio: queueItem.lead_bio,
        phone: queueItem.lead_phone
      }
    );

    // 7. Preparar resposta base
    const responseData = {
      queue_id: queueItem.id,
      lead_id: queueItem.lead_id,
      conversation_id: conversation.id,
      username: queueItem.lead_username,
      full_name: queueItem.lead_full_name,
      phone: queueItem.lead_phone,
      channel: targetChannel,
      campaign_name: queueItem.campaign_name,
      message_text: generatedDM.message_text,
      confidence_score: generatedDM.confidence_score
    };

    // 8. Se não for dry run, salvar e preparar para envio
    if (!dry_run) {
      // Salvar mensagem
      await personalizedDMService.saveOutreachMessage(
        queueItem.id,
        queueItem.campaign_id,
        queueItem.lead_id,
        targetChannel,
        generatedDM
      );

      // Salvar na conversa
      await outreachAgentService.saveMessage(
        conversation.id,
        'outbound',
        'ai',
        generatedDM.message_text,
        { detected_intent: 'first_contact' }
      );

      // Atualizar fila
      await supabase
        .from('campaign_outreach_queue')
        .update({
          message_text: generatedDM.message_text,
          message_generated_by: generatedDM.message_generated_by,
          personalization_data: generatedDM.personalization_data
        })
        .eq('id', queueItem.id);
    }

    // 9. Retornar dados para o N8N processar o envio real
    return res.json({
      success: true,
      can_send: true,
      has_item: true,
      channel: targetChannel,
      data: responseData,
      // Dados específicos por canal para o N8N usar
      send_via: {
        channel: targetChannel,
        ...(targetChannel === 'whatsapp' && {
          session_id: whatsappSession?.id,
          phone: queueItem.lead_phone
        }),
        ...(targetChannel === 'instagram_dm' && {
          instagram_username: queueItem.lead_username
        })
      },
      rate_status: {
        hourly_remaining: rateStatus.hourly_remaining - 1,
        daily_remaining: rateStatus.daily_remaining - 1
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /unified/send:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/unified/confirm-sent
 * Confirma envio de mensagem (chamado pelo N8N após envio real)
 */
router.post('/unified/confirm-sent', async (req, res) => {
  try {
    const { queue_id, channel, delivery_status = 'sent', external_message_id } = req.body;

    if (!queue_id) {
      return res.status(400).json({
        success: false,
        message: 'queue_id é obrigatório'
      });
    }

    // Buscar campaign_id para incrementar rate limit
    const { data: queueItem } = await supabase
      .from('campaign_outreach_queue')
      .select('campaign_id')
      .eq('id', queue_id)
      .single();

    // Marcar como enviado na fila
    await supabase
      .from('campaign_outreach_queue')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        delivery_status,
        external_message_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', queue_id);

    // Incrementar rate limit da campanha
    if (queueItem?.campaign_id) {
      await outreachAgentService.incrementRateLimit(queueItem.campaign_id);
    }

    console.log(`✅ [UNIFIED] Envio confirmado: ${queue_id} via ${channel}`);

    return res.json({
      success: true,
      message: 'Envio confirmado'
    });
  } catch (error: any) {
    console.error('❌ Erro em /unified/confirm-sent:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/unified/handle-response
 * Processa resposta recebida de qualquer canal
 */
router.post('/unified/handle-response', async (req, res) => {
  try {
    const {
      campaign_id,
      lead_id,
      lead_username,
      lead_full_name,
      lead_bio,
      lead_phone,
      incoming_message,
      channel  // 'instagram_dm' | 'whatsapp'
    } = req.body;

    if (!campaign_id || !incoming_message) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id e incoming_message são obrigatórios'
      });
    }

    console.log(`\n📩 [UNIFIED] Resposta recebida via ${channel || 'unknown'}`);
    console.log(`   Lead: @${lead_username}`);

    // Usar o serviço existente de processamento
    const result = await outreachAgentService.processLeadMessage(
      campaign_id,
      lead_id,
      {
        username: lead_username,
        full_name: lead_full_name,
        bio: lead_bio,
        phone: lead_phone
      },
      incoming_message
    );

    return res.json({
      success: result.success,
      data: {
        action: result.action,
        response_message: result.response_message,
        should_send_response: result.should_send_response,
        conversation_id: result.conversation_id,
        classification: result.classification,
        channel
      },
      // Dados para N8N enviar resposta
      send_response_via: result.should_send_response ? {
        channel,
        message_text: result.response_message,
        ...(channel === 'whatsapp' && { phone: lead_phone }),
        ...(channel === 'instagram_dm' && { username: lead_username })
      } : null,
      error: result.error_message
    });
  } catch (error: any) {
    console.error('❌ Erro em /unified/handle-response:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// RESPONSE QUEUE MANAGEMENT
// ============================================================================

/**
 * GET /api/outreach/response-queue/status
 * Retorna status da fila de respostas
 */
router.get('/response-queue/status', async (req, res) => {
  try {
    const { campaign_id } = req.query;

    const status = await getQueueStatus(campaign_id as string);
    const workerStats = responseQueueWorker.getStats();

    return res.json({
      success: true,
      data: {
        queue: status,
        worker: {
          isRunning: workerStats.isRunning,
          activeWorkers: workerStats.activeWorkers,
          processed: workerStats.processed,
          successful: workerStats.successful,
          failed: workerStats.failed,
          retried: workerStats.retried,
          startedAt: workerStats.startedAt,
          lastProcessedAt: workerStats.lastProcessedAt
        }
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /response-queue/status:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/response-queue/enqueue
 * Adiciona item à fila de respostas
 */
router.post('/response-queue/enqueue', async (req, res) => {
  try {
    const {
      campaign_id,
      lead_id,
      channel,
      message_type = 'text',
      message_content,
      recipient_identifier,
      account_id,
      priority = 5,
      scheduled_for,
      metadata = {}
    } = req.body;

    if (!campaign_id || !lead_id || !channel || !message_content || !recipient_identifier) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id, lead_id, channel, message_content e recipient_identifier são obrigatórios'
      });
    }

    const result = await enqueueResponse({
      campaignId: campaign_id,
      leadId: lead_id,
      channel,
      messageType: message_type,
      messageContent: message_content,
      recipientIdentifier: recipient_identifier,
      accountId: account_id,
      priority,
      scheduledFor: scheduled_for ? new Date(scheduled_for) : undefined,
      metadata
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error
      });
    }

    return res.json({
      success: true,
      data: {
        queue_id: result.queueId
      },
      message: 'Item adicionado à fila'
    });
  } catch (error: any) {
    console.error('❌ Erro em /response-queue/enqueue:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/response-queue/worker/start
 * Inicia o worker de processamento da fila
 */
router.post('/response-queue/worker/start', async (req, res) => {
  try {
    await responseQueueWorker.start();

    return res.json({
      success: true,
      message: 'Worker iniciado'
    });
  } catch (error: any) {
    console.error('❌ Erro ao iniciar worker:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/response-queue/worker/stop
 * Para o worker de processamento da fila
 */
router.post('/response-queue/worker/stop', async (req, res) => {
  try {
    await responseQueueWorker.stop();

    return res.json({
      success: true,
      message: 'Worker parado'
    });
  } catch (error: any) {
    console.error('❌ Erro ao parar worker:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/response-queue/cleanup
 * Limpa itens antigos da fila (completed/failed)
 */
router.post('/response-queue/cleanup', async (req, res) => {
  try {
    const { days_old = 30 } = req.body;

    const deletedCount = await cleanupOldQueueItems(days_old);

    return res.json({
      success: true,
      data: {
        deleted_count: deletedCount
      },
      message: `${deletedCount} itens antigos removidos`
    });
  } catch (error: any) {
    console.error('❌ Erro em /response-queue/cleanup:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// INSTAGRAM ACCOUNTS MANAGEMENT (Secure Credentials)
// ============================================================================

/**
 * GET /api/outreach/instagram-accounts
 * Lista contas Instagram cadastradas (sem credenciais)
 */
router.get('/instagram-accounts', async (req, res) => {
  try {
    const { campaign_id, status } = req.query;

    let query = supabase
      .from('instagram_accounts')
      .select(`
        id,
        campaign_id,
        account_name,
        instagram_username,
        status,
        daily_follow_count,
        daily_unfollow_count,
        daily_dm_count,
        hourly_follow_count,
        last_action_at,
        last_login_at,
        session_expires_at,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false });

    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    });
  } catch (error: any) {
    console.error('❌ Erro em /instagram-accounts:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/outreach/instagram-accounts
 * Cadastra nova conta Instagram (credenciais encriptadas)
 */
router.post('/instagram-accounts', async (req, res) => {
  try {
    const {
      campaign_id,
      account_name,
      instagram_username,
      password,
      created_by = 'api'
    } = req.body;

    if (!campaign_id || !instagram_username || !password) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id, instagram_username e password são obrigatórios'
      });
    }

    // Verificar se campanha existe
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name')
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    // Verificar se já existe conta com mesmo username para esta campanha
    const { data: existing } = await supabase
      .from('instagram_accounts')
      .select('id')
      .eq('campaign_id', campaign_id)
      .eq('instagram_username', instagram_username)
      .single();

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Já existe uma conta com este username para esta campanha'
      });
    }

    // Criar conta com credenciais encriptadas
    const accountId = await credentialsVault.createInstagramAccount(
      campaign_id,
      account_name || `Instagram - ${instagram_username}`,
      instagram_username,
      password,
      created_by
    );

    if (!accountId) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao criar conta Instagram'
      });
    }

    console.log(`✅ [INSTAGRAM] Conta cadastrada: @${instagram_username} para campanha ${campaign_id}`);

    return res.json({
      success: true,
      data: {
        account_id: accountId,
        instagram_username
      },
      message: 'Conta Instagram cadastrada com sucesso'
    });
  } catch (error: any) {
    console.error('❌ Erro ao cadastrar conta Instagram:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/outreach/instagram-accounts/:account_id/password
 * Atualiza senha de conta Instagram
 */
router.put('/instagram-accounts/:account_id/password', async (req, res) => {
  try {
    const { account_id } = req.params;
    const { password, updated_by = 'api' } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'password é obrigatório'
      });
    }

    const success = await credentialsVault.updateInstagramPassword(
      account_id,
      password,
      updated_by
    );

    if (!success) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao atualizar senha'
      });
    }

    console.log(`✅ [INSTAGRAM] Senha atualizada para conta ${account_id}`);

    return res.json({
      success: true,
      message: 'Senha atualizada com sucesso'
    });
  } catch (error: any) {
    console.error('❌ Erro ao atualizar senha:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/outreach/instagram-accounts/:account_id/status
 * Atualiza status de conta Instagram
 */
router.put('/instagram-accounts/:account_id/status', async (req, res) => {
  try {
    const { account_id } = req.params;
    const { status, notes } = req.body;

    if (!status || !['active', 'inactive', 'suspended', 'rate_limited'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status inválido. Use: active, inactive, suspended ou rate_limited'
      });
    }

    const { error } = await supabase
      .from('instagram_accounts')
      .update({
        status,
        notes: notes || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', account_id);

    if (error) throw error;

    console.log(`✅ [INSTAGRAM] Status atualizado para ${status}: conta ${account_id}`);

    return res.json({
      success: true,
      message: `Status atualizado para ${status}`
    });
  } catch (error: any) {
    console.error('❌ Erro ao atualizar status:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/outreach/instagram-accounts/:account_id/rate-limit
 * Verifica rate limit de conta Instagram
 */
router.get('/instagram-accounts/:account_id/rate-limit', async (req, res) => {
  try {
    const { account_id } = req.params;

    const rateLimit = await credentialsVault.checkRateLimit(account_id);

    return res.json({
      success: true,
      data: rateLimit
    });
  } catch (error: any) {
    console.error('❌ Erro ao verificar rate limit:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/outreach/instagram-accounts/:account_id
 * Remove conta Instagram (soft delete - marca como inactive)
 */
router.delete('/instagram-accounts/:account_id', async (req, res) => {
  try {
    const { account_id } = req.params;
    const { hard_delete = false } = req.query;

    if (hard_delete === 'true') {
      // Hard delete - remove completamente
      const { error } = await supabase
        .from('instagram_accounts')
        .delete()
        .eq('id', account_id);

      if (error) throw error;

      console.log(`🗑️ [INSTAGRAM] Conta removida permanentemente: ${account_id}`);
    } else {
      // Soft delete - marca como inactive
      const { error } = await supabase
        .from('instagram_accounts')
        .update({
          status: 'inactive',
          updated_at: new Date().toISOString()
        })
        .eq('id', account_id);

      if (error) throw error;

      console.log(`🗑️ [INSTAGRAM] Conta desativada: ${account_id}`);
    }

    return res.json({
      success: true,
      message: hard_delete === 'true' ? 'Conta removida permanentemente' : 'Conta desativada'
    });
  } catch (error: any) {
    console.error('❌ Erro ao remover conta:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/outreach/instagram-accounts/:account_id/access-log
 * Retorna log de acessos às credenciais (auditoria)
 */
router.get('/instagram-accounts/:account_id/access-log', async (req, res) => {
  try {
    const { account_id } = req.params;
    const { limit = 50 } = req.query;

    const { data, error } = await supabase
      .from('credentials_access_log')
      .select('*')
      .eq('account_id', account_id)
      .order('accessed_at', { ascending: false })
      .limit(parseInt(limit as string));

    if (error) throw error;

    return res.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    });
  } catch (error: any) {
    console.error('❌ Erro ao buscar log de acessos:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
