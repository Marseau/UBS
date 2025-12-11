/**
 * WhatsApp Warmup Service
 *
 * Serviço de aquecimento de linhas WhatsApp via Whapi.cloud
 * Implementa rate limiting inteligente para evitar bloqueios:
 * - Semana 1: 2 DMs/hora
 * - Apenas horário comercial (8h-18h)
 * - Apenas dias úteis (seg-sex)
 * - Horário variável dentro da hora
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getWhapiClient, WhapiClientService } from './whapi-client.service';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface WarmupConfig {
  dmsPerHour: number;
  businessHoursStart: number;
  businessHoursEnd: number;
  businessDays: number[];  // 0=domingo, 1=segunda... 6=sábado
  testMode: boolean;
  testLines: string[];
}

export interface WarmupScheduleItem {
  id: string;
  campaign_id: string;
  lead_id: string;
  phone: string;
  dm_script: string;
  persona_name?: string;
  scheduled_at: Date;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  sent_at?: Date;
  error?: string;
}

export interface WarmupStats {
  total_scheduled: number;
  total_sent: number;
  total_failed: number;
  total_pending: number;
  sent_today: number;
  sent_this_hour: number;
  next_scheduled?: Date;
  is_business_hours: boolean;
  is_business_day: boolean;
}

// ============================================================================
// WHATSAPP WARMUP SERVICE
// ============================================================================

class WhatsAppWarmupService {
  private supabase: SupabaseClient;
  private whapiClient: WhapiClientService;
  private config: WarmupConfig;
  private isRunning: boolean = false;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    this.whapiClient = getWhapiClient({
      token: process.env.WHAPI_TOKEN || '',
      baseUrl: process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud',
      channelId: process.env.WHAPI_CHANNEL_ID
    });

    // Carregar configuração do .env
    this.config = {
      dmsPerHour: parseInt(process.env.WARMUP_WEEK1_DMS_PER_HOUR || '2'),
      businessHoursStart: parseInt(process.env.WARMUP_BUSINESS_HOURS_START || '8'),
      businessHoursEnd: parseInt(process.env.WARMUP_BUSINESS_HOURS_END || '18'),
      businessDays: (process.env.WARMUP_BUSINESS_DAYS || '1,2,3,4,5').split(',').map(d => parseInt(d)),
      testMode: process.env.NODE_ENV !== 'production',
      testLines: (process.env.WHAPI_TEST_LINES || '').split(',').filter(l => l)
    };

    console.log('📱 [Warmup] Serviço inicializado:', {
      dmsPerHour: this.config.dmsPerHour,
      businessHours: `${this.config.businessHoursStart}h-${this.config.businessHoursEnd}h`,
      businessDays: this.config.businessDays,
      testMode: this.config.testMode,
      testLines: this.config.testLines.length
    });
  }

  // ==========================================================================
  // VERIFICAÇÕES DE HORÁRIO
  // ==========================================================================

  /**
   * Verifica se é horário comercial
   */
  isBusinessHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    return hour >= this.config.businessHoursStart && hour < this.config.businessHoursEnd;
  }

  /**
   * Verifica se é dia útil
   */
  isBusinessDay(): boolean {
    const now = new Date();
    const dayOfWeek = now.getDay();
    return this.config.businessDays.includes(dayOfWeek);
  }

  /**
   * Verifica se pode enviar agora
   */
  canSendNow(): boolean {
    return this.isBusinessHours() && this.isBusinessDay();
  }

  /**
   * Calcula próximo horário de envio dentro da hora atual
   * Retorna um minuto aleatório entre 0-59
   */
  getRandomMinuteInHour(): number {
    return Math.floor(Math.random() * 60);
  }

  /**
   * Calcula próximo slot disponível para envio
   */
  getNextAvailableSlot(): Date {
    const now = new Date();
    let slot = new Date(now);

    // Se não é horário comercial, avança para o próximo dia útil às 8h
    if (!this.isBusinessHours()) {
      if (now.getHours() >= this.config.businessHoursEnd) {
        slot.setDate(slot.getDate() + 1);
      }
      slot.setHours(this.config.businessHoursStart, this.getRandomMinuteInHour(), 0, 0);
    }

    // Se não é dia útil, avança para a próxima segunda
    while (!this.config.businessDays.includes(slot.getDay())) {
      slot.setDate(slot.getDate() + 1);
    }

    // Adiciona minuto aleatório
    if (slot.getMinutes() === 0) {
      slot.setMinutes(this.getRandomMinuteInHour());
    }

    return slot;
  }

  // ==========================================================================
  // GERENCIAMENTO DE FILA
  // ==========================================================================

  /**
   * Agenda envios de uma campanha para warmup
   */
  async scheduleWarmupForCampaign(campaignId: string, limit: number = 100): Promise<number> {
    console.log(`\n📅 [Warmup] Agendando envios para campanha ${campaignId}`);

    // Buscar leads da fila de outreach que têm WhatsApp
    const { data: queueItems, error: queueError } = await this.supabase
      .from('campaign_outreach_queue')
      .select(`
        id,
        campaign_id,
        lead_id,
        channel,
        status,
        instagram_leads!inner (
          id,
          phone,
          full_name,
          username,
          subcluster_id
        )
      `)
      .eq('campaign_id', campaignId)
      .eq('channel', 'whatsapp')
      .eq('status', 'pending')
      .not('instagram_leads.phone', 'is', null)
      .limit(limit);

    if (queueError) {
      console.error('❌ Erro ao buscar fila:', queueError);
      throw queueError;
    }

    if (!queueItems || queueItems.length === 0) {
      console.log('⚠️ Nenhum lead com WhatsApp na fila');
      return 0;
    }

    // Buscar subclusters com DMs geradas
    const { data: subclusters, error: subError } = await this.supabase
      .from('cluster_subclusters')
      .select('id, cluster_name, dm_scripts, persona')
      .eq('campaign_id', campaignId)
      .not('dm_scripts', 'is', null);

    if (subError) {
      console.error('❌ Erro ao buscar subclusters:', subError);
      throw subError;
    }

    // Mapear subclusters por ID
    const subclusterMap = new Map();
    subclusters?.forEach(sc => subclusterMap.set(sc.id, sc));

    // Calcular slots de envio
    let currentSlot = this.getNextAvailableSlot();
    let scheduledCount = 0;
    const scheduleItems: any[] = [];

    for (const item of queueItems) {
      const lead = (item as any).instagram_leads;
      if (!lead || !lead.phone) continue;

      // Buscar DM do subcluster
      const subcluster = subclusterMap.get(lead.subcluster_id);
      let dmScript = '';
      let personaName = '';

      if (subcluster?.dm_scripts?.scripts?.length > 0) {
        // Pegar um script aleatório do subcluster
        const scripts = subcluster.dm_scripts.scripts;
        const randomScript = scripts[Math.floor(Math.random() * scripts.length)];

        // Personalizar com nome do lead
        dmScript = randomScript.abertura || '';
        dmScript = dmScript.replace(/\[NOME\]/gi, lead.full_name || lead.username || 'Olá');

        if (subcluster.persona?.nome) {
          personaName = subcluster.persona.nome;
        }
      } else {
        // DM genérica se não houver script específico
        dmScript = `Olá ${lead.full_name || lead.username || ''}! Vi seu perfil e achei muito interessante. Gostaria de conhecer mais sobre seu trabalho.`;
      }

      // Criar item de schedule
      scheduleItems.push({
        campaign_id: campaignId,
        queue_item_id: item.id,
        lead_id: lead.id,
        phone: this.normalizePhone(lead.phone),
        dm_script: dmScript,
        persona_name: personaName,
        scheduled_at: currentSlot.toISOString(),
        status: 'pending'
      });

      scheduledCount++;

      // Avançar slot baseado no rate limit (2 DMs/hora = 30 min entre envios)
      const minutesPerDM = Math.floor(60 / this.config.dmsPerHour);
      currentSlot = new Date(currentSlot.getTime() + minutesPerDM * 60 * 1000);

      // Se passou do horário comercial, pula para o próximo dia útil
      if (currentSlot.getHours() >= this.config.businessHoursEnd) {
        currentSlot.setDate(currentSlot.getDate() + 1);
        currentSlot.setHours(this.config.businessHoursStart, this.getRandomMinuteInHour(), 0, 0);

        // Pular fins de semana
        while (!this.config.businessDays.includes(currentSlot.getDay())) {
          currentSlot.setDate(currentSlot.getDate() + 1);
        }
      }
    }

    // Inserir schedules no banco
    if (scheduleItems.length > 0) {
      const { error: insertError } = await this.supabase
        .from('warmup_schedule')
        .insert(scheduleItems);

      if (insertError) {
        console.error('❌ Erro ao inserir schedules:', insertError);
        throw insertError;
      }
    }

    console.log(`✅ ${scheduledCount} envios agendados`);
    console.log(`   Primeiro envio: ${scheduleItems[0]?.scheduled_at}`);
    console.log(`   Último envio: ${scheduleItems[scheduleItems.length - 1]?.scheduled_at}`);

    return scheduledCount;
  }

  /**
   * Normaliza número de telefone para formato WhatsApp
   */
  private normalizePhone(phone: string): string {
    let clean = phone.replace(/\D/g, '');

    // Adicionar 55 se não tiver código do país
    if (!clean.startsWith('55') && clean.length <= 11) {
      clean = '55' + clean;
    }

    return clean;
  }

  // ==========================================================================
  // PROCESSAMENTO DE ENVIOS
  // ==========================================================================

  /**
   * Processa envios pendentes que já estão no horário
   */
  async processPendingSchedules(): Promise<{ sent: number; failed: number }> {
    const results = { sent: 0, failed: 0 };

    if (!this.canSendNow()) {
      console.log('⏸️ [Warmup] Fora do horário comercial, aguardando...');
      return results;
    }

    const now = new Date();

    // Buscar schedules pendentes que já deveriam ter sido enviados
    const { data: pendingItems, error } = await this.supabase
      .from('warmup_schedule')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5); // Processar no máximo 5 por vez

    if (error) {
      console.error('❌ Erro ao buscar schedules:', error);
      return results;
    }

    if (!pendingItems || pendingItems.length === 0) {
      return results;
    }

    console.log(`\n📤 [Warmup] Processando ${pendingItems.length} envios pendentes`);

    for (const item of pendingItems) {
      try {
        // Em modo de teste, verificar se o número é de teste
        if (this.config.testMode && !this.config.testLines.includes(item.phone)) {
          console.log(`⚠️ [Warmup] Número ${item.phone} não está na lista de teste, pulando...`);

          await this.supabase
            .from('warmup_schedule')
            .update({
              status: 'skipped',
              error: 'Número não está na lista de teste'
            })
            .eq('id', item.id);

          continue;
        }

        // Enviar mensagem via Whapi
        console.log(`📱 [Warmup] Enviando para ${item.phone}...`);

        const result = await this.whapiClient.sendText({
          to: item.phone,
          body: item.dm_script
        });

        if (result.sent) {
          results.sent++;

          await this.supabase
            .from('warmup_schedule')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              message_id: result.message_id
            })
            .eq('id', item.id);

          // Atualizar status na fila de outreach
          await this.supabase
            .from('campaign_outreach_queue')
            .update({ status: 'sent' })
            .eq('id', item.queue_item_id);

          console.log(`✅ Enviado para ${item.phone}`);
        } else {
          results.failed++;

          await this.supabase
            .from('warmup_schedule')
            .update({
              status: 'failed',
              error: result.error || 'Erro desconhecido'
            })
            .eq('id', item.id);

          console.log(`❌ Falha ao enviar para ${item.phone}: ${result.error}`);
        }

        // Rate limiting entre envios (mínimo 5 segundos)
        await this.delay(5000);

      } catch (err: any) {
        results.failed++;
        console.error(`❌ Erro ao processar ${item.phone}:`, err.message);

        await this.supabase
          .from('warmup_schedule')
          .update({
            status: 'failed',
            error: err.message
          })
          .eq('id', item.id);
      }
    }

    return results;
  }

  /**
   * Inicia o scheduler de warmup
   */
  startScheduler(intervalMinutes: number = 5): void {
    if (this.isRunning) {
      console.log('⚠️ [Warmup] Scheduler já está rodando');
      return;
    }

    console.log(`🚀 [Warmup] Iniciando scheduler (intervalo: ${intervalMinutes}min)`);
    this.isRunning = true;

    // Processar imediatamente
    this.processPendingSchedules().then(results => {
      if (results.sent > 0 || results.failed > 0) {
        console.log(`📊 [Warmup] Resultado: ${results.sent} enviados, ${results.failed} falhas`);
      }
    });

    // Configurar intervalo
    this.schedulerInterval = setInterval(async () => {
      const results = await this.processPendingSchedules();
      if (results.sent > 0 || results.failed > 0) {
        console.log(`📊 [Warmup] Resultado: ${results.sent} enviados, ${results.failed} falhas`);
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Para o scheduler de warmup
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    this.isRunning = false;
    console.log('⏹️ [Warmup] Scheduler parado');
  }

  // ==========================================================================
  // ESTATÍSTICAS
  // ==========================================================================

  /**
   * Obtém estatísticas do warmup
   */
  async getStats(campaignId?: string): Promise<WarmupStats> {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);

    let baseQuery = this.supabase.from('warmup_schedule').select('*', { count: 'exact' });

    if (campaignId) {
      baseQuery = baseQuery.eq('campaign_id', campaignId);
    }

    // Total scheduled
    const { count: totalScheduled } = await baseQuery;

    // Por status
    const { count: totalSent } = await this.supabase
      .from('warmup_schedule')
      .select('*', { count: 'exact' })
      .eq('status', 'sent')
      .match(campaignId ? { campaign_id: campaignId } : {});

    const { count: totalFailed } = await this.supabase
      .from('warmup_schedule')
      .select('*', { count: 'exact' })
      .eq('status', 'failed')
      .match(campaignId ? { campaign_id: campaignId } : {});

    const { count: totalPending } = await this.supabase
      .from('warmup_schedule')
      .select('*', { count: 'exact' })
      .eq('status', 'pending')
      .match(campaignId ? { campaign_id: campaignId } : {});

    // Enviados hoje
    const { count: sentToday } = await this.supabase
      .from('warmup_schedule')
      .select('*', { count: 'exact' })
      .eq('status', 'sent')
      .gte('sent_at', todayStart.toISOString())
      .match(campaignId ? { campaign_id: campaignId } : {});

    // Enviados nesta hora
    const { count: sentThisHour } = await this.supabase
      .from('warmup_schedule')
      .select('*', { count: 'exact' })
      .eq('status', 'sent')
      .gte('sent_at', hourStart.toISOString())
      .match(campaignId ? { campaign_id: campaignId } : {});

    // Próximo agendado
    const { data: nextItem } = await this.supabase
      .from('warmup_schedule')
      .select('scheduled_at')
      .eq('status', 'pending')
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .single();

    return {
      total_scheduled: totalScheduled || 0,
      total_sent: totalSent || 0,
      total_failed: totalFailed || 0,
      total_pending: totalPending || 0,
      sent_today: sentToday || 0,
      sent_this_hour: sentThisHour || 0,
      next_scheduled: nextItem?.scheduled_at ? new Date(nextItem.scheduled_at) : undefined,
      is_business_hours: this.isBusinessHours(),
      is_business_day: this.isBusinessDay()
    };
  }

  /**
   * Envia DM de teste para verificar configuração
   */
  async sendTestMessage(phone: string, message?: string): Promise<{ success: boolean; error?: string }> {
    const testMessage = message || `🧪 Teste de warmup WhatsApp - ${new Date().toLocaleString('pt-BR')}`;

    try {
      const result = await this.whapiClient.sendText({
        to: this.normalizePhone(phone),
        body: testMessage
      });

      if (result.sent) {
        console.log(`✅ [Warmup] Teste enviado para ${phone}`);
        return { success: true };
      } else {
        console.log(`❌ [Warmup] Falha no teste para ${phone}: ${result.error}`);
        return { success: false, error: result.error };
      }
    } catch (err: any) {
      console.error(`❌ [Warmup] Erro no teste:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ==========================================================================
  // UTILITÁRIOS
  // ==========================================================================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// SINGLETON E EXPORTS
// ============================================================================

let warmupServiceInstance: WhatsAppWarmupService | null = null;

export function getWarmupService(): WhatsAppWarmupService {
  if (!warmupServiceInstance) {
    warmupServiceInstance = new WhatsAppWarmupService();
  }
  return warmupServiceInstance;
}

export { WhatsAppWarmupService };
export default WhatsAppWarmupService;
