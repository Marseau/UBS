/**
 * MEETING REMINDERS SERVICE
 *
 * Serviço para enviar lembretes automáticos de reuniões agendadas
 * aos leads via WhatsApp.
 *
 * Lembretes enviados:
 * - 24 horas antes da reunião
 * - 1 hora antes da reunião
 *
 * Executado via cron job a cada hora
 */

import { createClient } from '@supabase/supabase-js';
import { getWhapiClient } from './whapi-client.service';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// TIPOS
// ============================================================================

interface MeetingReminder {
  conversation_id: string;
  campaign_id: string;
  lead_phone: string;
  lead_name: string;
  scheduled_meeting_at: string;
  meet_link?: string;
  campaign_name: string;
  business_name: string;
}

// ============================================================================
// FUNÇÕES DE LEMBRETES
// ============================================================================

/**
 * Processa todos os lembretes pendentes
 * Executado via cron a cada hora
 */
export async function processReminders(): Promise<{
  sent_24h: number;
  sent_1h: number;
  errors: number;
}> {
  console.log('\n📅 [REMINDERS] Processando lembretes de reunião...');

  const results = {
    sent_24h: 0,
    sent_1h: 0,
    errors: 0
  };

  try {
    // 1. Processar lembretes de 24 horas
    const reminders24h = await get24HourReminders();
    console.log(`   Encontrados ${reminders24h.length} lembretes de 24h`);

    for (const reminder of reminders24h) {
      const sent = await send24HourReminder(reminder);
      if (sent) {
        results.sent_24h++;
      } else {
        results.errors++;
      }
    }

    // 2. Processar lembretes de 1 hora
    const reminders1h = await get1HourReminders();
    console.log(`   Encontrados ${reminders1h.length} lembretes de 1h`);

    for (const reminder of reminders1h) {
      const sent = await send1HourReminder(reminder);
      if (sent) {
        results.sent_1h++;
      } else {
        results.errors++;
      }
    }

    console.log(`✅ [REMINDERS] Processamento concluído:`);
    console.log(`   - 24h: ${results.sent_24h} enviados`);
    console.log(`   - 1h: ${results.sent_1h} enviados`);
    console.log(`   - Erros: ${results.errors}`);

    return results;
  } catch (error: any) {
    console.error('❌ [REMINDERS] Erro ao processar lembretes:', error.message);
    return results;
  }
}

// ============================================================================
// BUSCA DE REUNIÕES
// ============================================================================

/**
 * Busca reuniões que precisam de lembrete de 24 horas
 */
async function get24HourReminders(): Promise<MeetingReminder[]> {
  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('outreach_conversations')
    .select(`
      id,
      campaign_id,
      whatsapp_phone,
      scheduled_meeting_at,
      meet_link,
      last_reminder_sent_at,
      cluster_campaigns!inner (
        campaign_name,
        business_name
      ),
      instagram_leads!inner (
        full_name,
        username
      )
    `)
    .eq('has_scheduled_meeting', true)
    .in('meeting_status', ['pending', 'confirmed'])
    .gte('scheduled_meeting_at', in24Hours.toISOString())
    .lt('scheduled_meeting_at', in25Hours.toISOString())
    .or('last_reminder_sent_at.is.null,last_reminder_sent_at.lt.' + in24Hours.toISOString());

  if (error) {
    console.error('[REMINDERS] Erro ao buscar lembretes 24h:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    conversation_id: row.id,
    campaign_id: row.campaign_id,
    lead_phone: row.whatsapp_phone,
    lead_name: row.instagram_leads?.full_name || row.instagram_leads?.username || 'Lead',
    scheduled_meeting_at: row.scheduled_meeting_at,
    meet_link: row.meet_link,
    campaign_name: row.cluster_campaigns?.campaign_name || 'Consultoria',
    business_name: row.cluster_campaigns?.business_name || 'Empresa'
  }));
}

/**
 * Busca reuniões que precisam de lembrete de 1 hora
 */
async function get1HourReminders(): Promise<MeetingReminder[]> {
  const now = new Date();
  const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);
  const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('outreach_conversations')
    .select(`
      id,
      campaign_id,
      whatsapp_phone,
      scheduled_meeting_at,
      meet_link,
      last_reminder_sent_at,
      cluster_campaigns!inner (
        campaign_name,
        business_name
      ),
      instagram_leads!inner (
        full_name,
        username
      )
    `)
    .eq('has_scheduled_meeting', true)
    .in('meeting_status', ['pending', 'confirmed'])
    .gte('scheduled_meeting_at', in1Hour.toISOString())
    .lt('scheduled_meeting_at', in2Hours.toISOString());

  if (error) {
    console.error('[REMINDERS] Erro ao buscar lembretes 1h:', error);
    return [];
  }

  // Filtrar apenas reuniões que ainda não receberam lembrete de 1h
  return (data || [])
    .filter((row: any) => {
      if (!row.last_reminder_sent_at) return true;

      const lastReminder = new Date(row.last_reminder_sent_at);
      const meeting = new Date(row.scheduled_meeting_at);

      // Só enviar se último lembrete foi há mais de 22h (ou seja, foi o de 24h)
      const hoursSinceLastReminder = (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60);
      return hoursSinceLastReminder >= 22;
    })
    .map((row: any) => ({
      conversation_id: row.id,
      campaign_id: row.campaign_id,
      lead_phone: row.whatsapp_phone,
      lead_name: row.instagram_leads?.full_name || row.instagram_leads?.username || 'Lead',
      scheduled_meeting_at: row.scheduled_meeting_at,
      meet_link: row.meet_link,
      campaign_name: row.cluster_campaigns?.campaign_name || 'Consultoria',
      business_name: row.cluster_campaigns?.business_name || 'Empresa'
    }));
}

// ============================================================================
// ENVIO DE LEMBRETES
// ============================================================================

/**
 * Envia lembrete de 24 horas
 */
async function send24HourReminder(reminder: MeetingReminder): Promise<boolean> {
  try {
    const meetingDate = new Date(reminder.scheduled_meeting_at);
    const formatted = meetingDate.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    const message = `Oi ${reminder.lead_name}! 👋

Lembrete: Amanhã você tem consultoria com ${reminder.business_name}!

📅 ${formatted}
⏱️ Duração: 15 minutos
${reminder.meet_link ? `🔗 Link: ${reminder.meet_link}\n` : ''}
✅ Confirma presença? Responda SIM para confirmar! 😊`;

    const whapiClient = getWhapiClient();
    const result = await whapiClient.sendText({
      to: reminder.lead_phone,
      body: message
    });

    if (result.sent) {
      // Atualizar timestamp do último lembrete
      await supabase
        .from('outreach_conversations')
        .update({
          last_reminder_sent_at: new Date().toISOString()
        })
        .eq('id', reminder.conversation_id);

      console.log(`✅ [REMINDER 24h] Enviado para ${reminder.lead_phone}`);
      return true;
    } else {
      console.error(`❌ [REMINDER 24h] Falha: ${result.error}`);
      return false;
    }
  } catch (error: any) {
    console.error(`❌ [REMINDER 24h] Erro:`, error.message);
    return false;
  }
}

/**
 * Envia lembrete de 1 hora
 */
async function send1HourReminder(reminder: MeetingReminder): Promise<boolean> {
  try {
    const meetingDate = new Date(reminder.scheduled_meeting_at);
    const hour = meetingDate.getHours().toString().padStart(2, '0');
    const minute = meetingDate.getMinutes().toString().padStart(2, '0');

    const message = `⏰ LEMBRETE: Sua consultoria é DAQUI 1 HORA!

🕐 Horário: ${hour}:${minute}
${reminder.meet_link ? `🔗 Link da reunião:\n${reminder.meet_link}\n\n` : ''}Prepare suas dúvidas! Nos vemos em breve! 😊`;

    const whapiClient = getWhapiClient();
    const result = await whapiClient.sendText({
      to: reminder.lead_phone,
      body: message
    });

    if (result.sent) {
      // Atualizar timestamp do último lembrete
      await supabase
        .from('outreach_conversations')
        .update({
          last_reminder_sent_at: new Date().toISOString()
        })
        .eq('id', reminder.conversation_id);

      console.log(`✅ [REMINDER 1h] Enviado para ${reminder.lead_phone}`);
      return true;
    } else {
      console.error(`❌ [REMINDER 1h] Falha: ${result.error}`);
      return false;
    }
  } catch (error: any) {
    console.error(`❌ [REMINDER 1h] Erro:`, error.message);
    return false;
  }
}

// ============================================================================
// GERENCIAMENTO DE REUNIÕES
// ============================================================================

/**
 * Marca reunião como completada
 */
export async function markMeetingCompleted(conversationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('outreach_conversations')
      .update({
        meeting_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    if (error) {
      console.error('[REMINDERS] Erro ao marcar reunião como concluída:', error);
      return false;
    }

    console.log(`✅ [REMINDERS] Reunião ${conversationId} marcada como concluída`);
    return true;
  } catch (error: any) {
    console.error('[REMINDERS] Erro:', error.message);
    return false;
  }
}

/**
 * Marca reunião como no-show (lead não compareceu)
 */
export async function markMeetingNoShow(conversationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('outreach_conversations')
      .update({
        meeting_status: 'no_show',
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    if (error) {
      console.error('[REMINDERS] Erro ao marcar no-show:', error);
      return false;
    }

    console.log(`⚠️ [REMINDERS] Reunião ${conversationId} marcada como no-show`);
    return true;
  } catch (error: any) {
    console.error('[REMINDERS] Erro:', error.message);
    return false;
  }
}

/**
 * Cancela reunião
 */
export async function cancelMeeting(
  conversationId: string,
  reason?: string
): Promise<boolean> {
  try {
    const { data: conversation } = await supabase
      .from('outreach_conversations')
      .select('whatsapp_phone, scheduled_meeting_at')
      .eq('id', conversationId)
      .single();

    if (!conversation) {
      return false;
    }

    // Enviar mensagem de cancelamento ao lead
    if (conversation.whatsapp_phone) {
      const whapiClient = getWhapiClient();
      await whapiClient.sendText({
        to: conversation.whatsapp_phone,
        body: `Infelizmente precisamos cancelar nossa consultoria agendada. ${reason || 'Entraremos em contato em breve para reagendar.'} Desculpe o transtorno!`
      });
    }

    // Atualizar status
    const { error } = await supabase
      .from('outreach_conversations')
      .update({
        meeting_status: 'cancelled',
        has_scheduled_meeting: false,
        meeting_notes: reason || 'Cancelado',
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    if (error) {
      console.error('[REMINDERS] Erro ao cancelar reunião:', error);
      return false;
    }

    console.log(`🚫 [REMINDERS] Reunião ${conversationId} cancelada`);
    return true;
  } catch (error: any) {
    console.error('[REMINDERS] Erro:', error.message);
    return false;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const meetingRemindersService = {
  processReminders,
  markMeetingCompleted,
  markMeetingNoShow,
  cancelMeeting
};

export default meetingRemindersService;
