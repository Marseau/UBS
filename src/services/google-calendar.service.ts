/**
 * GOOGLE CALENDAR SERVICE
 *
 * Serviço para integração com Google Calendar API para agendamento de reuniões
 * com leads quentes antes de transferir para o cliente.
 *
 * Funcionalidades:
 * 1. Buscar slots disponíveis
 * 2. Criar eventos de reunião
 * 3. Enviar convites
 * 4. Gerenciar lembretes
 */

import { google, calendar_v3, Auth } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, getCampaignOAuthCredentials } from './google-oauth.service';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// TIPOS
// ============================================================================

export interface TimeSlot {
  start: Date;
  end: Date;
  formatted: string;
}

export interface ScheduleResult {
  success: boolean;
  eventId?: string;
  meetLink?: string;
  error?: string;
}

export interface CalendarConfig {
  campaignId: string;
  calendarId?: string;
  workingHours?: {
    start: number; // 9 = 9 AM
    end: number;   // 18 = 6 PM
  };
  workingDays?: number[]; // [1,2,3,4,5] = seg-sex
  slotDuration?: number; // minutos
  bufferBetweenMeetings?: number; // minutos
}

// ============================================================================
// GOOGLE CALENDAR SERVICE
// ============================================================================

export class GoogleCalendarService {
  private calendar: calendar_v3.Calendar | null = null;
  private config: CalendarConfig;
  private oauthClient: Auth.OAuth2Client | null = null;

  constructor(config: CalendarConfig) {
    this.config = {
      calendarId: 'primary',
      workingHours: { start: 9, end: 18 },
      workingDays: [1, 2, 3, 4, 5], // seg-sex
      slotDuration: 15,
      bufferBetweenMeetings: 5,
      ...config
    };
  }

  /**
   * Inicializa autenticação OAuth da campanha
   * Deve ser chamado antes de usar o serviço
   */
  private async initAuth(): Promise<void> {
    if (this.calendar) return; // Já inicializado

    // Buscar credenciais OAuth da campanha
    const credentials = await getCampaignOAuthCredentials(this.config.campaignId);

    if (!credentials || credentials.oauth_status !== 'active') {
      throw new Error(
        `Google Calendar não configurado para campanha ${this.config.campaignId}. ` +
        `Configure OAuth primeiro.`
      );
    }

    // Obter access token válido (faz refresh se necessário)
    const accessToken = await getValidAccessToken(this.config.campaignId);

    if (!accessToken) {
      throw new Error('Não foi possível obter access token válido');
    }

    // Criar OAuth2 client
    this.oauthClient = new google.auth.OAuth2(
      credentials.google_client_id,
      credentials.decrypted.client_secret,
      process.env.GOOGLE_OAUTH_REDIRECT_URI
    );

    // Configurar tokens
    this.oauthClient.setCredentials({
      access_token: accessToken,
      refresh_token: credentials.decrypted.refresh_token
    });

    // Inicializar calendar API
    this.calendar = google.calendar({ version: 'v3', auth: this.oauthClient });

    console.log(`✅ [Google Calendar] Autenticação inicializada para campanha ${this.config.campaignId}`);
  }

  /**
   * Garante que autenticação está inicializada
   */
  private async ensureAuth(): Promise<calendar_v3.Calendar> {
    await this.initAuth();
    if (!this.calendar) {
      throw new Error('Falha ao inicializar Google Calendar API');
    }
    return this.calendar;
  }

  // ==========================================================================
  // SLOTS DISPONÍVEIS
  // ==========================================================================

  /**
   * Busca slots disponíveis para os próximos N dias
   */
  async getAvailableSlots(daysAhead: number = 7): Promise<TimeSlot[]> {
    const slots: TimeSlot[] = [];
    const today = new Date();

    for (let i = 0; i < daysAhead; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);

      // Pular finais de semana (se configurado)
      const dayOfWeek = date.getDay();
      if (!this.config.workingDays?.includes(dayOfWeek === 0 ? 7 : dayOfWeek)) {
        continue;
      }

      const daySlots = await this.getAvailableSlotsForDay(date);
      slots.push(...daySlots);

      // Limitar retorno a 20 slots para não sobrecarregar
      if (slots.length >= 20) break;
    }

    return slots.slice(0, 20);
  }

  /**
   * Busca slots disponíveis para um dia específico
   */
  private async getAvailableSlotsForDay(date: Date): Promise<TimeSlot[]> {
    const workStart = this.config.workingHours!.start;
    const workEnd = this.config.workingHours!.end;
    const slotDuration = this.config.slotDuration!;
    const buffer = this.config.bufferBetweenMeetings!;

    // Definir início e fim do dia de trabalho
    const dayStart = new Date(date);
    dayStart.setHours(workStart, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(workEnd, 0, 0, 0);

    try {
      // Buscar eventos existentes para este dia
      const calendar = await this.ensureAuth();
      const response = await calendar.events.list({
        calendarId: this.config.calendarId,
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const busySlots = response.data.items || [];

      // Calcular slots livres
      return this.calculateFreeSlots(dayStart, dayEnd, busySlots, slotDuration, buffer);
    } catch (error: any) {
      console.error('[Google Calendar] Erro ao buscar slots:', error.message);

      // Se falhar, retornar slots padrão (9h, 14h, 16h)
      return this.getDefaultSlots(date);
    }
  }

  /**
   * Calcula slots livres baseado em eventos existentes
   */
  private calculateFreeSlots(
    dayStart: Date,
    dayEnd: Date,
    busySlots: calendar_v3.Schema$Event[],
    slotDuration: number,
    buffer: number
  ): TimeSlot[] {
    const freeSlots: TimeSlot[] = [];
    let currentTime = new Date(dayStart);

    while (currentTime < dayEnd) {
      const slotEnd = new Date(currentTime.getTime() + slotDuration * 60000);

      // Verificar se este slot está livre
      const isBusy = busySlots.some(event => {
        if (!event.start?.dateTime || !event.end?.dateTime) return false;

        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);

        // Adicionar buffer antes e depois do evento
        const bufferedStart = new Date(eventStart.getTime() - buffer * 60000);
        const bufferedEnd = new Date(eventEnd.getTime() + buffer * 60000);

        // Verificar sobreposição
        return currentTime < bufferedEnd && slotEnd > bufferedStart;
      });

      if (!isBusy && slotEnd <= dayEnd) {
        freeSlots.push({
          start: new Date(currentTime),
          end: new Date(slotEnd),
          formatted: this.formatSlot(currentTime)
        });
      }

      // Avançar para próximo slot
      currentTime = new Date(currentTime.getTime() + (slotDuration + buffer) * 60000);
    }

    return freeSlots;
  }

  /**
   * Retorna slots padrão quando API falha
   */
  private getDefaultSlots(date: Date): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const defaultTimes = [9, 14, 16]; // 9h, 14h, 16h

    defaultTimes.forEach(hour => {
      const start = new Date(date);
      start.setHours(hour, 0, 0, 0);

      const end = new Date(start);
      end.setMinutes(end.getMinutes() + this.config.slotDuration!);

      slots.push({
        start,
        end,
        formatted: this.formatSlot(start)
      });
    });

    return slots;
  }

  /**
   * Formata slot para exibição ao lead
   */
  private formatSlot(date: Date): string {
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const dayName = days[date.getDay()];
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${dayName}, ${day}/${month} às ${hours}:${minutes}`;
  }

  // ==========================================================================
  // AGENDAMENTO
  // ==========================================================================

  /**
   * Agenda reunião com o lead
   */
  async scheduleAppointment(
    leadData: {
      name: string;
      phone: string;
      email?: string;
      username: string;
    },
    slot: TimeSlot,
    context: {
      campaignName: string;
      interestScore: number;
      questions: string[];
      signals: string[];
    }
  ): Promise<ScheduleResult> {
    try {
      const eventBody: calendar_v3.Schema$Event = {
        summary: `Consultoria - ${leadData.name}`,
        description: this.buildEventDescription(leadData, context),
        start: {
          dateTime: slot.start.toISOString(),
          timeZone: 'America/Sao_Paulo'
        },
        end: {
          dateTime: slot.end.toISOString(),
          timeZone: 'America/Sao_Paulo'
        },
        attendees: leadData.email ? [{ email: leadData.email }] : undefined,
        conferenceData: {
          createRequest: {
            requestId: `lead-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 1440 }, // 24h antes
            { method: 'popup', minutes: 60 }    // 1h antes
          ]
        }
      };

      const calendar = await this.ensureAuth();
      const response = await calendar.events.insert({
        calendarId: this.config.calendarId,
        conferenceDataVersion: 1,
        requestBody: eventBody
      });

      return {
        success: true,
        eventId: response.data.id || undefined,
        meetLink: response.data.hangoutLink ||
                 response.data.conferenceData?.entryPoints?.[0]?.uri ||
                 undefined
      };
    } catch (error: any) {
      console.error('[Google Calendar] Erro ao agendar:', error.message);

      // Fallback: criar reunião sem Google Calendar
      return this.createFallbackMeeting(leadData, slot);
    }
  }

  /**
   * Cria descrição do evento
   */
  private buildEventDescription(
    leadData: any,
    context: any
  ): string {
    return `
🔥 LEAD QUENTE - ${context.campaignName}

👤 LEAD:
Nome: ${leadData.name}
Instagram: @${leadData.username}
Telefone: ${leadData.phone}
Email: ${leadData.email || 'Não fornecido'}

🎯 SCORE DE INTERESSE: ${(context.interestScore * 100).toFixed(0)}%

💬 SINAIS DE INTERESSE:
${context.signals.slice(0, 5).map((s: string) => `• ${s}`).join('\n')}

❓ PERGUNTAS DO LEAD:
${context.questions.slice(0, 3).map((q: string) => `• "${q}"`).join('\n')}

⚡ OBJETIVO:
Esclarecer dúvidas do lead e apresentar proposta personalizada.
Duração: ${this.config.slotDuration} minutos.

📌 PREPARAÇÃO:
1. Revisar perfil do Instagram: instagram.com/${leadData.username}
2. Ter proposta comercial em mãos
3. Preparar respostas para perguntas acima
4. Entrar no link da reunião 5min antes

🤖 Agendado automaticamente via AIC Platform
    `.trim();
  }

  /**
   * Cria reunião fallback quando Google Calendar falha
   */
  private createFallbackMeeting(
    leadData: any,
    slot: TimeSlot
  ): ScheduleResult {
    // Criar link de WhatsApp call como fallback
    const cleanPhone = leadData.phone.replace(/\D/g, '');
    const meetLink = `https://wa.me/${cleanPhone}`;

    return {
      success: true,
      eventId: `fallback-${Date.now()}`,
      meetLink
    };
  }

  // ==========================================================================
  // CANCELAMENTO
  // ==========================================================================

  /**
   * Cancela reunião agendada
   */
  async cancelAppointment(eventId: string, reason?: string): Promise<boolean> {
    try {
      const calendar = await this.ensureAuth();
      await calendar.events.delete({
        calendarId: this.config.calendarId,
        eventId: eventId,
        sendUpdates: 'all'
      });

      console.log(`[Google Calendar] Evento ${eventId} cancelado: ${reason || 'Sem motivo'}`);
      return true;
    } catch (error: any) {
      console.error('[Google Calendar] Erro ao cancelar evento:', error.message);
      return false;
    }
  }

  // ==========================================================================
  // ATUALIZAÇÃO
  // ==========================================================================

  /**
   * Atualiza reunião agendada
   */
  async updateAppointment(
    eventId: string,
    updates: Partial<calendar_v3.Schema$Event>
  ): Promise<boolean> {
    try {
      const calendar = await this.ensureAuth();
      await calendar.events.patch({
        calendarId: this.config.calendarId,
        eventId: eventId,
        requestBody: updates,
        sendUpdates: 'all'
      });

      console.log(`[Google Calendar] Evento ${eventId} atualizado`);
      return true;
    } catch (error: any) {
      console.error('[Google Calendar] Erro ao atualizar evento:', error.message);
      return false;
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Cria instância do Google Calendar Service para uma campanha
 * Busca configurações da tabela campaign_google_calendar
 */
export async function createCalendarService(campaignId: string): Promise<GoogleCalendarService> {
  // Buscar configurações OAuth e de agendamento da campanha
  const { data: calendarConfig } = await supabase
    .from('campaign_google_calendar')
    .select(`
      google_calendar_id,
      working_hours_start,
      working_hours_end,
      working_days,
      slot_duration_minutes,
      buffer_between_meetings_minutes,
      oauth_status
    `)
    .eq('campaign_id', campaignId)
    .single();

  // Validar se configuração existe e OAuth está ativo
  if (!calendarConfig) {
    console.warn(`[Google Calendar] Configuração não encontrada para campanha ${campaignId}. Usando padrões.`);
  }

  if (calendarConfig && calendarConfig.oauth_status !== 'active') {
    console.warn(`[Google Calendar] OAuth não está ativo para campanha ${campaignId}. Status: ${calendarConfig.oauth_status}`);
  }

  const config: CalendarConfig = {
    campaignId,
    calendarId: calendarConfig?.google_calendar_id || 'primary',
    workingHours: {
      start: calendarConfig?.working_hours_start || 9,
      end: calendarConfig?.working_hours_end || 18
    },
    workingDays: calendarConfig?.working_days || [1, 2, 3, 4, 5],
    slotDuration: calendarConfig?.slot_duration_minutes || 15,
    bufferBetweenMeetings: calendarConfig?.buffer_between_meetings_minutes || 5
  };

  return new GoogleCalendarService(config);
}

export default GoogleCalendarService;
