/**
 * AIC Calendar Routes
 * Endpoints para AI Agent usar como tools de agendamento
 */

import { Router, Request, Response } from 'express';
import { createCalendarService } from '../services/google-calendar.service';
import { supabase } from '../config/database';

const router = Router();

/**
 * POST /api/aic/calendar/slots
 * Tool: buscar_horarios - Busca slots disponíveis no Google Calendar
 */
router.post('/slots', async (req: Request, res: Response) => {
  try {
    const { campaign_id, days_ahead = 7 } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id é obrigatório'
      });
    }

    const calendarService = await createCalendarService(campaign_id);
    const slots = await calendarService.getAvailableSlots(days_ahead);

    // Formatar para o AI Agent apresentar ao lead
    const formattedSlots = slots.slice(0, 5).map((slot, index) => ({
      numero: index + 1,
      horario: slot.formatted,
      start: slot.start.toISOString(),
      end: slot.end.toISOString()
    }));

    return res.json({
      success: true,
      total_slots: slots.length,
      slots: formattedSlots,
      message_para_lead: formattedSlots.length > 0
        ? `Tenho estes horários disponíveis:\n${formattedSlots.map(s => `${s.numero}️⃣ ${s.horario}`).join('\n')}\n\nQual prefere?`
        : 'No momento não tenho horários disponíveis. Posso entrar em contato quando abrir uma vaga?'
    });

  } catch (error: any) {
    console.error('[AIC Calendar] Erro ao buscar slots:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar horários disponíveis',
      error: error.message
    });
  }
});

/**
 * POST /api/aic/calendar/schedule
 * Tool: agendar_reuniao - Agenda reunião e registra entrega do lead
 */
router.post('/schedule', async (req: Request, res: Response) => {
  try {
    const {
      campaign_id,
      slot_number,
      slot_start,
      slot_end,
      lead_name,
      lead_phone,
      lead_email,
      lead_instagram,
      lead_whatsapp,
      interest_score = 0.7,
      signals = [],
      questions = [],
      delivered_to = 'Representante AIC'
    } = req.body;

    if (!campaign_id || !lead_phone) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id e lead_phone são obrigatórios'
      });
    }

    // 1. Buscar nome da campanha
    const { data: campaign } = await supabase
      .from('cluster_campaigns')
      .select('campaign_name')
      .eq('id', campaign_id)
      .single();

    const campaignName = campaign?.campaign_name || 'AIC';

    // 2. Criar slot object
    let slot;
    if (slot_start && slot_end) {
      slot = {
        start: new Date(slot_start),
        end: new Date(slot_end),
        formatted: new Date(slot_start).toLocaleString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      };
    } else {
      // Se não passou slot específico, buscar próximo disponível
      const calendarService = await createCalendarService(campaign_id);
      const availableSlots = await calendarService.getAvailableSlots(7);

      if (availableSlots.length === 0) {
        return res.json({
          success: false,
          message: 'Não há horários disponíveis no momento',
          action: 'ask_later'
        });
      }

      // Usar slot_number se fornecido, senão usar primeiro disponível
      const slotIndex = slot_number ? Math.min(slot_number - 1, availableSlots.length - 1) : 0;
      slot = availableSlots[slotIndex];
    }

    // 3. Agendar no Google Calendar
    const calendarService = await createCalendarService(campaign_id);
    const scheduleResult = await calendarService.scheduleAppointment(
      {
        name: lead_name || 'Lead',
        phone: lead_phone,
        email: lead_email,
        username: lead_instagram || ''
      },
      slot,
      {
        campaignName,
        interestScore: interest_score,
        questions: questions,
        signals: signals
      }
    );

    if (!scheduleResult.success) {
      return res.json({
        success: false,
        message: 'Não consegui agendar a reunião. Posso tentar outro horário?',
        error: scheduleResult.error
      });
    }

    // 4. REGISTRAR ENTREGA DO LEAD (base do faturamento variável)
    const { data: delivery, error: deliveryError } = await supabase
      .from('aic_lead_deliveries')
      .insert({
        campaign_id,
        lead_whatsapp: lead_whatsapp || lead_phone,
        lead_name,
        lead_email,
        lead_instagram,
        delivered_to,
        delivery_value: 10.00, // R$10 por lead entregue
        status: 'reuniao_agendada',
        meeting_scheduled_at: slot.start.toISOString(),
        notes: `Reunião agendada via AI Agent. Event ID: ${scheduleResult.eventId}`
      })
      .select()
      .single();

    if (deliveryError) {
      console.error('[AIC Calendar] Erro ao registrar entrega:', deliveryError);
      // Não falhar a operação, apenas logar
    }

    // 5. Atualizar conversa com info de agendamento
    const cleanPhone = lead_phone.replace(/\D/g, '');
    await supabase
      .from('aic_conversations')
      .update({
        last_topic: 'scheduling_confirmed',
        meeting_scheduled_at: slot.start.toISOString(),
        google_event_id: scheduleResult.eventId,
        updated_at: new Date().toISOString()
      })
      .eq('phone', cleanPhone);

    // 6. Log no Telegram (opcional)
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const telegramMsg = `🔥 *LEAD QUENTE AGENDADO*\n\n` +
        `👤 ${lead_name || 'Lead'}\n` +
        `📱 ${lead_phone}\n` +
        `📸 @${lead_instagram || 'N/A'}\n` +
        `🏢 ${campaignName}\n` +
        `📅 ${slot.formatted}\n` +
        `💰 R$10,00 faturado\n` +
        `🔗 ${scheduleResult.meetLink || 'WhatsApp Call'}`;

      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: telegramMsg,
          parse_mode: 'Markdown'
        })
      }).catch(() => {});
    }

    return res.json({
      success: true,
      message_para_lead: `Perfeito! Agendei sua consultoria para ${slot.formatted}. ` +
        (scheduleResult.meetLink
          ? `Vou te enviar o link da reunião: ${scheduleResult.meetLink}`
          : `Te ligo nesse horário pelo WhatsApp.`) +
        ` Pode confirmar?`,
      meeting: {
        event_id: scheduleResult.eventId,
        meet_link: scheduleResult.meetLink,
        scheduled_at: slot.start.toISOString(),
        formatted: slot.formatted
      },
      delivery_id: delivery?.id,
      delivery_value: 10.00
    });

  } catch (error: any) {
    console.error('[AIC Calendar] Erro ao agendar:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao agendar reunião',
      error: error.message
    });
  }
});

/**
 * POST /api/aic/calendar/cancel
 * Cancela reunião agendada
 */
router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const { campaign_id, event_id, delivery_id, reason } = req.body;

    if (!campaign_id || !event_id) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id e event_id são obrigatórios'
      });
    }

    // Cancelar no Google Calendar
    const calendarService = await createCalendarService(campaign_id);
    await calendarService.cancelAppointment(event_id, reason);

    // Atualizar status da entrega
    if (delivery_id) {
      await supabase
        .from('aic_lead_deliveries')
        .update({
          status: 'perdido',
          notes: `Reunião cancelada: ${reason || 'Sem motivo'}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', delivery_id);
    }

    return res.json({
      success: true,
      message: 'Reunião cancelada'
    });

  } catch (error: any) {
    console.error('[AIC Calendar] Erro ao cancelar:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao cancelar reunião',
      error: error.message
    });
  }
});

export default router;
