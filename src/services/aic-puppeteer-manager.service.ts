/**
 * AIC Puppeteer Manager Service
 *
 * Gerencia múltiplos workers Puppeteer, um por canal/campanha.
 * Responsável por:
 * - Iniciar/parar workers
 * - Monitorar saúde das sessões
 * - Enviar alertas via Telegram
 * - Reconectar automaticamente
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AICPuppeteerWorkerService } from './aic-puppeteer-worker.service';

interface Campaign {
  id: string;
  name: string;
  whapi_channel_id: string;
  whapi_phone: string;
  status: string;
}

interface SessionStatus {
  id: string;
  channel_id: string;
  status: string;
  last_heartbeat: string;
  messages_sent_today: number;
  daily_limit: number;
}

export class AICPuppeteerManagerService {
  private supabase: SupabaseClient;
  private workers: Map<string, AICPuppeteerWorkerService> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private telegramBotToken: string;
  private telegramChatId: string;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.telegramChatId = process.env.TELEGRAM_ALERT_CHAT_ID || '7466924351';
  }

  /**
   * Inicia todos os workers para campanhas ativas
   */
  async startAll(): Promise<void> {
    console.log('[Manager] Iniciando todos os workers...');

    // Buscar campanhas ativas
    const { data: campaigns, error } = await this.supabase
      .from('aic_campaigns')
      .select('id, name, whapi_channel_id, whapi_phone, status')
      .eq('status', 'active');

    if (error) {
      console.error('[Manager] Erro ao buscar campanhas:', error);
      return;
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('[Manager] Nenhuma campanha ativa encontrada');
      return;
    }

    // Iniciar worker para cada campanha
    for (const campaign of campaigns) {
      await this.startWorker(campaign);
    }

    // Iniciar monitoramento
    this.startMonitoring();

    await this.sendTelegramAlert(
      `🚀 *AIC Puppeteer Manager*\n\nIniciado com ${campaigns.length} workers ativos.`
    );
  }

  /**
   * Inicia um worker específico
   */
  async startWorker(campaign: Campaign): Promise<boolean> {
    try {
      console.log(`[Manager] Iniciando worker para ${campaign.name} (${campaign.whapi_channel_id})`);

      // Verificar se já existe
      if (this.workers.has(campaign.whapi_channel_id)) {
        console.log(`[Manager] Worker já existe para ${campaign.whapi_channel_id}`);
        return true;
      }

      const worker = new AICPuppeteerWorkerService({
        channelId: campaign.whapi_channel_id,
        phone: campaign.whapi_phone,
        campaignId: campaign.id,
        headless: process.env.PUPPETEER_HEADLESS === 'true'
      });

      // Inicializar
      await worker.initialize();

      // Aguardar conexão
      const connected = await worker.waitForConnection(120000);

      if (connected) {
        this.workers.set(campaign.whapi_channel_id, worker);

        // Iniciar processamento da fila em background
        worker.processQueue().catch(err => {
          console.error(`[Manager] Erro no worker ${campaign.whapi_channel_id}:`, err);
        });

        await this.sendTelegramAlert(
          `✅ *Worker Conectado*\n\nCampanha: ${campaign.name}\nCanal: ${campaign.whapi_channel_id}`
        );

        return true;
      } else {
        await this.sendTelegramAlert(
          `⚠️ *Falha na Conexão*\n\nCampanha: ${campaign.name}\nCanal: ${campaign.whapi_channel_id}\n\nVerifique o QR Code!`
        );
        return false;
      }
    } catch (error) {
      console.error(`[Manager] Erro ao iniciar worker ${campaign.whapi_channel_id}:`, error);
      await this.sendTelegramAlert(
        `❌ *Erro no Worker*\n\nCampanha: ${campaign.name}\nErro: ${error}`
      );
      return false;
    }
  }

  /**
   * Para um worker específico
   */
  async stopWorker(channelId: string): Promise<void> {
    const worker = this.workers.get(channelId);
    if (worker) {
      await worker.stop();
      this.workers.delete(channelId);
      console.log(`[Manager] Worker ${channelId} parado`);
    }
  }

  /**
   * Para todos os workers
   */
  async stopAll(): Promise<void> {
    console.log('[Manager] Parando todos os workers...');

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    for (const [channelId, worker] of this.workers) {
      await worker.stop();
      console.log(`[Manager] Worker ${channelId} parado`);
    }

    this.workers.clear();

    await this.sendTelegramAlert('🛑 *AIC Puppeteer Manager*\n\nTodos os workers foram parados.');
  }

  /**
   * Inicia monitoramento de saúde
   */
  private startMonitoring(): void {
    // Verificar a cada 30 segundos
    this.monitorInterval = setInterval(async () => {
      await this.checkHealth();
    }, 30000);

    console.log('[Manager] Monitoramento iniciado');
  }

  /**
   * Verifica saúde de todos os workers
   */
  private async checkHealth(): Promise<void> {
    // Buscar status das sessões no banco
    const { data: sessions, error } = await this.supabase
      .from('aic_puppeteer_sessions')
      .select('*')
      .in('status', ['connected', 'qr_pending']);

    if (error) {
      console.error('[Manager] Erro ao buscar sessões:', error);
      return;
    }

    const now = Date.now();
    const heartbeatTimeout = 60000; // 1 minuto sem heartbeat = problema

    for (const session of sessions || []) {
      const lastHeartbeat = session.last_heartbeat
        ? new Date(session.last_heartbeat).getTime()
        : 0;

      const timeSinceHeartbeat = now - lastHeartbeat;

      // Verificar timeout de heartbeat
      if (timeSinceHeartbeat > heartbeatTimeout && session.status === 'connected') {
        console.warn(`[Manager] Worker ${session.channel_id} sem heartbeat há ${timeSinceHeartbeat}ms`);

        await this.sendTelegramAlert(
          `⚠️ *Worker Sem Resposta*\n\nCanal: ${session.channel_id}\nÚltimo heartbeat: ${Math.round(timeSinceHeartbeat / 1000)}s atrás\n\nTentando reconectar...`
        );

        // Tentar reconectar
        await this.reconnectWorker(session.channel_id);
      }

      // Verificar limite diário
      if (session.messages_sent_today >= session.daily_limit * 0.9) {
        await this.sendTelegramAlert(
          `⚠️ *Limite Diário Próximo*\n\nCanal: ${session.channel_id}\nEnviadas: ${session.messages_sent_today}/${session.daily_limit}`
        );
      }
    }
  }

  /**
   * Tenta reconectar um worker
   */
  private async reconnectWorker(channelId: string): Promise<void> {
    console.log(`[Manager] Tentando reconectar worker ${channelId}`);

    // Parar worker existente
    await this.stopWorker(channelId);

    // Buscar dados da campanha
    const { data: campaign } = await this.supabase
      .from('aic_campaigns')
      .select('id, name, whapi_channel_id, whapi_phone, status')
      .eq('whapi_channel_id', channelId)
      .single();

    if (campaign && campaign.status === 'active') {
      // Aguardar um pouco antes de reconectar
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Tentar iniciar novamente
      await this.startWorker(campaign);
    }
  }

  /**
   * Envia alerta via Telegram
   */
  private async sendTelegramAlert(message: string): Promise<void> {
    if (!this.telegramBotToken || !this.telegramChatId) {
      console.log('[Manager] Telegram não configurado, pulando alerta');
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.telegramChatId,
          text: message,
          parse_mode: 'Markdown'
        })
      });
    } catch (error) {
      console.error('[Manager] Erro ao enviar alerta Telegram:', error);
    }
  }

  /**
   * Retorna status de todos os workers
   */
  async getStatus(): Promise<SessionStatus[]> {
    const { data: sessions } = await this.supabase
      .from('aic_puppeteer_sessions')
      .select('id, channel_id, status, last_heartbeat, messages_sent_today, daily_limit')
      .order('created_at', { ascending: false });

    return sessions || [];
  }

  /**
   * Retorna estatísticas
   */
  async getStats(): Promise<{
    activeWorkers: number;
    totalMessagesSentToday: number;
    queuePending: number;
  }> {
    const [sessionsResult, queueResult] = await Promise.all([
      this.supabase
        .from('aic_puppeteer_sessions')
        .select('messages_sent_today')
        .eq('status', 'connected'),
      this.supabase
        .from('aic_message_queue')
        .select('id', { count: 'exact' })
        .eq('status', 'pending')
    ]);

    const totalMessagesSentToday = (sessionsResult.data || [])
      .reduce((sum, s) => sum + (s.messages_sent_today || 0), 0);

    return {
      activeWorkers: this.workers.size,
      totalMessagesSentToday,
      queuePending: queueResult.count || 0
    };
  }
}

// Singleton
export const puppeteerManager = new AICPuppeteerManagerService();

export default AICPuppeteerManagerService;
