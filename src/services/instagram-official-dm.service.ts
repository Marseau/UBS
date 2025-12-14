/**
 * Instagram Official DM Service
 *
 * Serviço de orquestração para envio de DMs com conta oficial do cliente
 * Integra com:
 * - instagram_dm_sessions (rate limiting centralizado)
 * - instagram-automation-refactored.service (Puppeteer)
 * - instagram-dm-personalization.service (AI message generation)
 * - instagram-official-session.service (session management)
 */

import { createClient } from '@supabase/supabase-js';
import { ensureCorrectAccount, OperationType } from './instagram-official-session.service';
import { sendDirectMessageShared } from './instagram-automation-refactored.service';
import { generatePersonalizedDM } from './instagram-dm-personalization.service';

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

interface SessionRateLimitStatus {
  can_send: boolean;
  reason: string;
  hourly_remaining: number;
  daily_remaining: number;
}

interface SendDMResult {
  success: boolean;
  sent_at: string | null;
  message_text: string | null;
  session_id: string;
  rate_limit_status: SessionRateLimitStatus;
  error_message: string | null;
}

interface LeadProfile {
  username: string;
  full_name?: string;
  business_category?: string;
  segment?: string;
  bio?: string;
  has_phone: boolean;
  has_email: boolean;
}

/**
 * Verifica se uma sessão pode enviar DM (rate limits + horários)
 */
export async function checkSessionCanSend(sessionId: string): Promise<SessionRateLimitStatus> {
  try {
    const { data, error } = await supabaseAdmin.rpc('can_instagram_session_send', {
      p_session_id: sessionId
    });

    if (error) {
      console.error('❌ Erro ao verificar rate limit:', error);
      return {
        can_send: false,
        reason: 'Erro ao verificar rate limit',
        hourly_remaining: 0,
        daily_remaining: 0
      };
    }

    if (!data || data.length === 0) {
      return {
        can_send: false,
        reason: 'Sessão não encontrada',
        hourly_remaining: 0,
        daily_remaining: 0
      };
    }

    const result = data[0];
    return {
      can_send: result.can_send,
      reason: result.reason,
      hourly_remaining: result.hourly_remaining,
      daily_remaining: result.daily_remaining
    };

  } catch (error: any) {
    console.error('❌ Erro ao verificar rate limit:', error);
    return {
      can_send: false,
      reason: 'Erro ao verificar rate limit',
      hourly_remaining: 0,
      daily_remaining: 0
    };
  }
}

/**
 * Incrementa contadores de mensagem após envio bem-sucedido
 */
export async function incrementSessionMessageCount(sessionId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc('increment_instagram_session_count', {
      p_session_id: sessionId
    });

    if (error) {
      console.error('❌ Erro ao incrementar contador:', error);
      throw error;
    }

    console.log('✅ Contador incrementado');
  } catch (error: any) {
    console.error('❌ Erro ao incrementar contador:', error);
    throw error;
  }
}

/**
 * Obtém sessão Instagram associada a uma campanha
 */
export async function getSessionForCampaign(campaignId: string): Promise<{
  session_id: string | null;
  session_name: string | null;
  instagram_username: string | null;
  can_send: boolean;
  reason: string;
  hourly_remaining: number;
  daily_remaining: number;
}> {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_session_for_campaign', {
      p_campaign_id: campaignId
    });

    if (error) {
      console.error('❌ Erro ao buscar sessão da campanha:', error);
      return {
        session_id: null,
        session_name: null,
        instagram_username: null,
        can_send: false,
        reason: 'Erro ao buscar sessão',
        hourly_remaining: 0,
        daily_remaining: 0
      };
    }

    if (!data || data.length === 0) {
      return {
        session_id: null,
        session_name: null,
        instagram_username: null,
        can_send: false,
        reason: 'Campanha sem sessão Instagram configurada',
        hourly_remaining: 0,
        daily_remaining: 0
      };
    }

    const result = data[0];
    return {
      session_id: result.session_id,
      session_name: result.session_name,
      instagram_username: result.instagram_username,
      can_send: result.can_send,
      reason: result.reason,
      hourly_remaining: result.hourly_remaining,
      daily_remaining: result.daily_remaining
    };

  } catch (error: any) {
    console.error('❌ Erro ao buscar sessão da campanha:', error);
    return {
      session_id: null,
      session_name: null,
      instagram_username: null,
      can_send: false,
      reason: 'Erro ao buscar sessão',
      hourly_remaining: 0,
      daily_remaining: 0
    };
  }
}

/**
 * Carrega credenciais e cookies da sessão (descriptografa password)
 * IMPORTANTE: Cookies são armazenados como JSONB no banco
 */
export async function loadSessionData(sessionId: string): Promise<{
  username: string;
  password: string;
  cookies: any[] | null;
  user_agent: string | null;
} | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('instagram_dm_sessions')
      .select('instagram_username, instagram_password, cookies_data, user_agent')
      .eq('id', sessionId)
      .single();

    if (error) {
      console.error('❌ Erro ao carregar sessão:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    // TODO: Implementar descriptografia da senha usando credentials-vault
    // Por enquanto, assume que está em plaintext (TEMPORÁRIO!)
    const password = data.instagram_password;

    return {
      username: data.instagram_username,
      password: password,
      cookies: data.cookies_data,
      user_agent: data.user_agent
    };

  } catch (error: any) {
    console.error('❌ Erro ao carregar sessão:', error);
    return null;
  }
}

/**
 * Salva cookies da sessão após login bem-sucedido
 */
export async function saveSessionCookies(
  sessionId: string,
  cookies: any[],
  userAgent: string
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('instagram_dm_sessions')
      .update({
        cookies_data: cookies,
        user_agent: userAgent,
        last_connected_at: new Date().toISOString(),
        status: 'connected',
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) {
      console.error('❌ Erro ao salvar cookies:', error);
      throw error;
    }

    console.log('✅ Cookies salvos no banco de dados');
  } catch (error: any) {
    console.error('❌ Erro ao salvar cookies:', error);
    throw error;
  }
}

/**
 * Atualiza status da sessão
 */
export async function updateSessionStatus(
  sessionId: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  try {
    const updateData: any = {
      status: status,
      updated_at: new Date().toISOString()
    };

    if (errorMessage) {
      updateData.last_error = errorMessage;
      updateData.last_error_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from('instagram_dm_sessions')
      .update(updateData)
      .eq('id', sessionId);

    if (error) {
      console.error('❌ Erro ao atualizar status:', error);
      throw error;
    }

    console.log(`✅ Status atualizado: ${status}`);
  } catch (error: any) {
    console.error('❌ Erro ao atualizar status:', error);
    throw error;
  }
}

/**
 * Envia DM personalizado via sessão oficial
 *
 * Fluxo completo:
 * 1. Verifica rate limits da sessão
 * 2. Garante conta oficial logada
 * 3. Gera mensagem personalizada com AI
 * 4. Envia DM via Puppeteer
 * 5. Incrementa contadores
 * 6. Persiste log no banco
 */
export async function sendOfficialDM(
  sessionId: string,
  lead: LeadProfile,
  campaignId?: string
): Promise<SendDMResult> {
  console.log(`\n📨 [OFFICIAL-DM] Enviando DM para @${lead.username} via sessão ${sessionId.substring(0, 8)}...`);

  try {
    // 1. VERIFICAR RATE LIMITS
    console.log('🔍 Verificando rate limits...');
    const rateLimitStatus = await checkSessionCanSend(sessionId);

    if (!rateLimitStatus.can_send) {
      console.log(`❌ Não pode enviar: ${rateLimitStatus.reason}`);
      return {
        success: false,
        sent_at: null,
        message_text: null,
        session_id: sessionId,
        rate_limit_status: rateLimitStatus,
        error_message: rateLimitStatus.reason
      };
    }

    console.log(`✅ Rate limit OK (${rateLimitStatus.hourly_remaining}/hora, ${rateLimitStatus.daily_remaining}/dia)`);

    // 2. GARANTIR CONTA OFICIAL LOGADA
    console.log('🔐 Garantindo conta oficial...');
    await ensureCorrectAccount(OperationType.ENGAGEMENT);
    console.log('✅ Conta oficial verificada');

    // 3. GERAR MENSAGEM PERSONALIZADA COM AI
    console.log('🤖 Gerando mensagem personalizada...');
    const dmGenerated = await generatePersonalizedDM(lead);
    console.log(`✅ Mensagem gerada: "${dmGenerated.message.substring(0, 50)}..."`);

    // 4. ENVIAR DM VIA PUPPETEER
    console.log('📤 Enviando DM via Puppeteer...');
    const dmResult = await sendDirectMessageShared(lead.username, dmGenerated.message);

    if (!dmResult.success) {
      console.error(`❌ Erro ao enviar DM: ${dmResult.error_message}`);

      // Atualizar status da sessão
      await updateSessionStatus(sessionId, 'connected', dmResult.error_message || undefined);

      return {
        success: false,
        sent_at: null,
        message_text: dmGenerated.message,
        session_id: sessionId,
        rate_limit_status: rateLimitStatus,
        error_message: dmResult.error_message
      };
    }

    console.log('✅ DM enviado com sucesso!');

    // 5. INCREMENTAR CONTADORES
    console.log('📊 Incrementando contadores...');
    await incrementSessionMessageCount(sessionId);

    // 6. PERSISTIR LOG NO BANCO (instagram_dm_outreach ou similar)
    console.log('💾 Persistindo log...');
    try {
      await supabaseAdmin.from('instagram_dm_outreach').insert({
        username: lead.username,
        full_name: lead.full_name,
        business_category: lead.business_category,
        segment: lead.segment,
        message_text: dmGenerated.message,
        message_generated_by: dmGenerated.model,
        tokens_used: dmGenerated.tokens_used,
        sent_at: dmResult.sent_at,
        delivery_status: 'sent',
        campaign_id: campaignId,
        session_id: sessionId
      });
      console.log('✅ Log persistido');
    } catch (logError: any) {
      console.warn('⚠️  Erro ao persistir log (não crítico):', logError.message);
    }

    return {
      success: true,
      sent_at: dmResult.sent_at,
      message_text: dmGenerated.message,
      session_id: sessionId,
      rate_limit_status: rateLimitStatus,
      error_message: null
    };

  } catch (error: any) {
    console.error(`❌ Erro crítico ao enviar DM: ${error.message}`);

    // Atualizar status da sessão
    await updateSessionStatus(sessionId, 'connected', error.message).catch(() => {});

    return {
      success: false,
      sent_at: null,
      message_text: null,
      session_id: sessionId,
      rate_limit_status: {
        can_send: false,
        reason: 'Erro crítico',
        hourly_remaining: 0,
        daily_remaining: 0
      },
      error_message: error.message
    };
  }
}

/**
 * Reseta contadores de rate limit (chamado por cron)
 * Esta função executa a stored procedure que reseta:
 * - Contador horário quando muda a hora
 * - Contador diário à meia-noite
 */
export async function resetSessionCounters(): Promise<{
  hourly_resets: number;
  daily_resets: number;
}> {
  try {
    const { data, error } = await supabaseAdmin.rpc('reset_instagram_session_counters');

    if (error) {
      console.error('❌ Erro ao resetar contadores:', error);
      return { hourly_resets: 0, daily_resets: 0 };
    }

    if (!data || data.length === 0) {
      return { hourly_resets: 0, daily_resets: 0 };
    }

    const result = data[0];
    console.log(`✅ Contadores resetados: ${result.hourly_resets} horários, ${result.daily_resets} diários`);

    return {
      hourly_resets: result.hourly_resets,
      daily_resets: result.daily_resets
    };

  } catch (error: any) {
    console.error('❌ Erro ao resetar contadores:', error);
    return { hourly_resets: 0, daily_resets: 0 };
  }
}

/**
 * Lista todas as sessões ativas com status de rate limit
 */
export async function listActiveSessions(): Promise<Array<{
  id: string;
  session_name: string;
  instagram_username: string;
  status: string;
  messages_sent_today: number;
  daily_limit: number;
  messages_sent_this_hour: number;
  hourly_limit: number;
  can_send: boolean;
  reason: string;
}>> {
  try {
    const { data: sessions, error } = await supabaseAdmin
      .from('instagram_dm_sessions')
      .select('*')
      .in('status', ['connected', 'connecting'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao listar sessões:', error);
      return [];
    }

    if (!sessions || sessions.length === 0) {
      return [];
    }

    // Para cada sessão, verificar rate limit
    const sessionsWithStatus = await Promise.all(
      sessions.map(async (session) => {
        const rateLimitStatus = await checkSessionCanSend(session.id);

        return {
          id: session.id,
          session_name: session.session_name,
          instagram_username: session.instagram_username,
          status: session.status,
          messages_sent_today: session.messages_sent_today,
          daily_limit: session.daily_limit,
          messages_sent_this_hour: session.messages_sent_this_hour,
          hourly_limit: session.hourly_limit,
          can_send: rateLimitStatus.can_send,
          reason: rateLimitStatus.reason
        };
      })
    );

    return sessionsWithStatus;

  } catch (error: any) {
    console.error('❌ Erro ao listar sessões:', error);
    return [];
  }
}
