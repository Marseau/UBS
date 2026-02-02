/**
 * AIC Puppeteer Worker Service
 *
 * Worker que gerencia sessão WhatsApp Web via Puppeteer
 * e envia mensagens com digitação humanizada.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AICHumanizerService, TypingStep } from './aic-humanizer.service';

// Seletores do WhatsApp Web (podem mudar com atualizações)
const SELECTORS = {
  qrCanvas: 'canvas[aria-label="Scan this QR code to link a device!"]',
  qrCode: '[data-testid="qrcode"]',
  searchInput: '[data-testid="chat-list-search"]',
  chatInput: '[data-testid="conversation-compose-box-input"]',
  sendButton: '[data-testid="send"]',
  messageStatus: '[data-testid="msg-check"]',
  contactName: '[data-testid="conversation-info-header-chat-title"]',
  chatList: '[data-testid="chat-list"]',
  mainPanel: '#main',
  sidePanel: '#side',
  newChatButton: '[data-testid="chat-list-search"]',
  // Seletores de erro de número inválido
  invalidNumberPopup: '[data-testid="popup"]',
  invalidNumberText: '[data-testid="popup-contents"]',
  okButton: '[data-testid="popup-controls-ok"]'
};

// Textos que indicam número inválido (multilíngue)
const INVALID_NUMBER_TEXTS = [
  'phone number shared via url is invalid',
  'número de telefone compartilhado via url é inválido',
  'this phone number is not registered',
  'este número de telefone não está registrado',
  'número não está no whatsapp',
  'number is not on whatsapp',
  'couldn\'t find this account',
  'não foi possível encontrar esta conta'
];

// Resultado da verificação de número
type NumberValidationResult = {
  valid: boolean;
  reason: 'valid' | 'invalid_number' | 'timeout' | 'error';
  errorMessage?: string;
};

// Resultado do envio de mensagem
type SendMessageResult = {
  sent: boolean;
  numberValid: boolean;
  reason: 'valid' | 'invalid_number' | 'timeout' | 'error';
  errorMessage?: string;
};

interface SessionConfig {
  channelId: string;
  phone: string;
  campaignId: string;
  headless?: boolean;
  userDataDir?: string;
}

interface QueueMessage {
  id: string;
  campaign_id: string;
  conversation_id: string;
  phone: string;
  chat_id: string;
  message_text: string;
  message_type: string;
  include_typos: boolean;
  channel?: string;
}

// Configurações de segurança para evitar detecção
const SAFETY_CONFIG = {
  // Limites diários
  maxNewNumbersPerDay: 25,           // Máximo de números novos por dia
  maxInvalidNumbersPerDay: 10,       // Máximo de números inválidos por dia
  maxTotalMessagesPerDay: 50,        // Máximo total de mensagens por dia

  // Delays de segurança (ms)
  delayAfterInvalidNumber: 45000,    // 45s após número inválido
  delayAfterConsecutiveErrors: 120000, // 2min após erros consecutivos
  pauseAfterTooManyInvalids: 3600000,  // 1h se muitos inválidos

  // Limites de erros
  maxConsecutiveErrors: 3,           // Pausa após 3 erros seguidos
  maxInvalidBeforePause: 5,          // Pausa após 5 inválidos

  // Horários de envio OUTBOUND (dias úteis apenas)
  outboundStartHour: 9,              // Início: 9h
  outboundEndHour: 18,               // Fim: 18h
  outboundDays: [1, 2, 3, 4, 5]      // Seg-Sex (0=Dom, 6=Sáb)
};

export class AICPuppeteerWorkerService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private supabase: SupabaseClient;
  private humanizer: AICHumanizerService;
  private config: SessionConfig;
  private isRunning: boolean = false;
  private sessionId: string | null = null;

  // Contadores de segurança (resetam diariamente)
  private dailyStats = {
    date: new Date().toDateString(),
    newNumbersAttempted: 0,
    invalidNumbersFound: 0,
    totalMessagesSent: 0,
    consecutiveErrors: 0
  };

  constructor(config: SessionConfig) {
    this.config = config;
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.humanizer = new AICHumanizerService();
  }

  /**
   * Reseta contadores se mudou o dia
   */
  private resetDailyStatsIfNeeded(): void {
    const today = new Date().toDateString();
    if (this.dailyStats.date !== today) {
      console.log('[Puppeteer] 🔄 Novo dia - resetando contadores de segurança');
      this.dailyStats = {
        date: today,
        newNumbersAttempted: 0,
        invalidNumbersFound: 0,
        totalMessagesSent: 0,
        consecutiveErrors: 0
      };
    }
  }

  /**
   * Verifica se está dentro do horário de envio OUTBOUND
   * Respostas (reply) podem ser enviadas a qualquer hora
   */
  private isWithinOutboundHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb

    // Verificar dia útil
    if (!SAFETY_CONFIG.outboundDays.includes(day)) {
      return false;
    }

    // Verificar horário
    return hour >= SAFETY_CONFIG.outboundStartHour && hour < SAFETY_CONFIG.outboundEndHour;
  }

  /**
   * Verifica se pode continuar enviando (limites de segurança)
   */
  private canContinueSending(): { canSend: boolean; reason?: string; pauseMs?: number } {
    this.resetDailyStatsIfNeeded();

    // Limite de mensagens diárias
    if (this.dailyStats.totalMessagesSent >= SAFETY_CONFIG.maxTotalMessagesPerDay) {
      return {
        canSend: false,
        reason: 'daily_message_limit',
        pauseMs: this.getMsUntilTomorrow()
      };
    }

    // Limite de números novos
    if (this.dailyStats.newNumbersAttempted >= SAFETY_CONFIG.maxNewNumbersPerDay) {
      return {
        canSend: false,
        reason: 'daily_new_numbers_limit',
        pauseMs: this.getMsUntilTomorrow()
      };
    }

    // Limite de inválidos
    if (this.dailyStats.invalidNumbersFound >= SAFETY_CONFIG.maxInvalidNumbersPerDay) {
      return {
        canSend: false,
        reason: 'too_many_invalid_numbers',
        pauseMs: SAFETY_CONFIG.pauseAfterTooManyInvalids
      };
    }

    // Erros consecutivos
    if (this.dailyStats.consecutiveErrors >= SAFETY_CONFIG.maxConsecutiveErrors) {
      return {
        canSend: false,
        reason: 'consecutive_errors',
        pauseMs: SAFETY_CONFIG.delayAfterConsecutiveErrors
      };
    }

    return { canSend: true };
  }

  /**
   * Calcula ms até meia-noite
   */
  private getMsUntilTomorrow(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime() - now.getTime();
  }

  /**
   * Inicializa o browser e a sessão
   */
  async initialize(): Promise<void> {
    console.log(`[Puppeteer] Inicializando worker para canal ${this.config.channelId}`);

    // Criar/atualizar registro da sessão
    const { data: session, error } = await this.supabase
      .from('aic_puppeteer_sessions')
      .upsert({
        channel_id: this.config.channelId,
        phone: this.config.phone,
        campaign_id: this.config.campaignId,
        status: 'disconnected',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'channel_id'
      })
      .select()
      .single();

    if (error) {
      console.error('[Puppeteer] Erro ao criar sessão:', error);
      throw error;
    }

    this.sessionId = session.id;

    // Iniciar browser
    this.browser = await puppeteer.launch({
      headless: this.config.headless ?? false,
      userDataDir: this.config.userDataDir || `./whatsapp-sessions/${this.config.channelId}`,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,800'
      ]
    });

    this.page = await this.browser.newPage();

    // Configurar viewport e user agent realista
    await this.page.setViewport({ width: 1280, height: 800 });
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Navegar para WhatsApp Web
    await this.page.goto('https://web.whatsapp.com', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await this.log('initialized', { channelId: this.config.channelId });
  }

  /**
   * Aguarda conexão (QR code ou sessão existente)
   */
  async waitForConnection(timeoutMs: number = 120000): Promise<boolean> {
    if (!this.page) throw new Error('Page não inicializada');

    console.log('[Puppeteer] Aguardando conexão...');

    try {
      // Verificar se já está conectado (sessão salva)
      const isConnected = await this.checkIfConnected();
      if (isConnected) {
        await this.updateSessionStatus('connected');
        console.log('[Puppeteer] Sessão restaurada com sucesso!');
        return true;
      }

      // Aguardar QR code aparecer
      await this.updateSessionStatus('qr_pending');

      const qrElement = await this.page.waitForSelector(SELECTORS.qrCanvas, {
        timeout: 10000
      }).catch(() => null);

      if (qrElement) {
        // Extrair QR code como base64
        const qrBase64 = await this.extractQRCode();
        if (qrBase64) {
          await this.supabase
            .from('aic_puppeteer_sessions')
            .update({
              qr_code: qrBase64,
              qr_expires_at: new Date(Date.now() + 60000).toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', this.sessionId);

          await this.log('qr_generated', { hasQR: true });
          console.log('[Puppeteer] QR Code gerado - aguardando scan...');
        }
      }

      // Aguardar conexão (chat list aparecer)
      await this.page.waitForSelector(SELECTORS.sidePanel, {
        timeout: timeoutMs
      });

      await this.updateSessionStatus('connected');
      await this.log('connected', { channelId: this.config.channelId });
      console.log('[Puppeteer] Conectado com sucesso!');

      return true;
    } catch (error) {
      console.error('[Puppeteer] Erro na conexão:', error);
      await this.updateSessionStatus('error');
      await this.log('error', { error: String(error) });
      return false;
    }
  }

  /**
   * Verifica se já está conectado
   */
  private async checkIfConnected(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const sidePanel = await this.page.$(SELECTORS.sidePanel);
      return sidePanel !== null;
    } catch {
      return false;
    }
  }

  /**
   * Extrai QR code como base64
   */
  private async extractQRCode(): Promise<string | null> {
    if (!this.page) return null;

    try {
      const canvas = await this.page.$(SELECTORS.qrCanvas);
      if (!canvas) return null;

      // Executa no contexto do browser (Chromium)
      const qrBase64 = await this.page.evaluate(`
        (function() {
          const canvasEl = document.querySelector('${SELECTORS.qrCanvas}');
          return canvasEl ? canvasEl.toDataURL('image/png') : null;
        })()
      `) as string | null;

      return qrBase64;
    } catch {
      return null;
    }
  }

  /**
   * Abre um chat específico por número de telefone
   * Detecta se o número é válido no WhatsApp
   */
  async openChat(phone: string): Promise<NumberValidationResult> {
    if (!this.page) throw new Error('Page não inicializada');

    try {
      // Formatar número (remover caracteres não numéricos, manter +)
      const formattedPhone = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');

      console.log(`[Puppeteer] Abrindo chat para ${formattedPhone}...`);

      // Usar URL direta para abrir chat
      await this.page.goto(`https://web.whatsapp.com/send?phone=${formattedPhone}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Aguardar um dos dois cenários: chat abrir OU popup de erro
      const result = await Promise.race([
        // Cenário 1: Chat abre com sucesso (input aparece)
        this.page.waitForSelector(SELECTORS.chatInput, { timeout: 20000 })
          .then(() => ({ success: true, error: false })),

        // Cenário 2: Popup de número inválido aparece
        this.page.waitForSelector(SELECTORS.invalidNumberPopup, { timeout: 20000 })
          .then(() => ({ success: false, error: true })),

        // Cenário 3: Timeout
        new Promise<{ success: false; error: false; timeout: true }>(resolve =>
          setTimeout(() => resolve({ success: false, error: false, timeout: true }), 25000)
        )
      ]);

      // Cenário de sucesso - chat abriu
      if ('success' in result && result.success) {
        await this.delay(1000); // Estabilizar
        console.log(`[Puppeteer] ✅ Chat aberto com sucesso para ${formattedPhone}`);
        return { valid: true, reason: 'valid' };
      }

      // Cenário de erro - popup apareceu
      if ('error' in result && result.error) {
        // Extrair texto do erro
        const errorText = await this.extractPopupErrorText();
        console.log(`[Puppeteer] ❌ Número inválido ${formattedPhone}: ${errorText}`);

        // Fechar popup se houver botão OK
        await this.closeErrorPopup();

        return {
          valid: false,
          reason: 'invalid_number',
          errorMessage: errorText || 'Número não encontrado no WhatsApp'
        };
      }

      // Cenário de timeout
      console.log(`[Puppeteer] ⏱️ Timeout ao abrir chat ${formattedPhone}`);
      return { valid: false, reason: 'timeout', errorMessage: 'Timeout ao verificar número' };

    } catch (error) {
      console.error(`[Puppeteer] Erro ao abrir chat ${phone}:`, error);
      await this.log('error', { action: 'openChat', phone, error: String(error) });
      return { valid: false, reason: 'error', errorMessage: String(error) };
    }
  }

  /**
   * Extrai texto de erro do popup do WhatsApp
   */
  private async extractPopupErrorText(): Promise<string | null> {
    if (!this.page) return null;

    try {
      const popupText = await this.page.evaluate(`
        (function() {
          const popup = document.querySelector('[data-testid="popup-contents"]');
          return popup ? popup.textContent : null;
        })()
      `) as string | null;

      return popupText;
    } catch {
      return null;
    }
  }

  /**
   * Fecha popup de erro clicando no botão OK
   */
  private async closeErrorPopup(): Promise<void> {
    if (!this.page) return;

    try {
      const okButton = await this.page.$(SELECTORS.okButton);
      if (okButton) {
        await okButton.click();
        await this.delay(500);
      }
    } catch {
      // Ignorar erro ao fechar popup
    }
  }

  /**
   * Envia mensagem com digitação humanizada
   * Retorna resultado detalhado incluindo validação do número
   */
  async sendMessage(
    phone: string,
    text: string,
    includeTypos: boolean = true
  ): Promise<SendMessageResult> {
    if (!this.page) throw new Error('Page não inicializada');

    try {
      // Abrir chat e validar número
      const validation = await this.openChat(phone);

      // Se número inválido, retornar imediatamente
      if (!validation.valid) {
        console.log(`[Puppeteer] Número ${phone} inválido: ${validation.reason}`);
        return {
          sent: false,
          numberValid: false,
          reason: validation.reason,
          errorMessage: validation.errorMessage
        };
      }

      // Número válido - enviar mensagem humanizada
      const humanized = this.humanizer.humanize(text, includeTypos);
      console.log(`[Puppeteer] Enviando mensagem (${humanized.totalDurationMs}ms, ${humanized.typoCount} typos)`);

      // Focar no input
      const input = await this.page.$(SELECTORS.chatInput);
      if (!input) throw new Error('Input de mensagem não encontrado');

      await input.click();
      await this.delay(300);

      // Executar steps de digitação
      for (const step of humanized.steps) {
        await this.executeTypingStep(step);
      }

      // Enviar mensagem (Enter)
      await this.page.keyboard.press('Enter');
      await this.delay(1000);

      // Verificar se foi enviado (check mark aparece)
      const messageCheck = await this.page.$(SELECTORS.messageStatus);
      const messageSent = messageCheck !== null;

      await this.log('message_sent', {
        phone,
        textLength: text.length,
        typos: humanized.typoCount,
        duration: humanized.totalDurationMs,
        confirmed: messageSent
      });

      return {
        sent: true,
        numberValid: true,
        reason: 'valid'
      };
    } catch (error) {
      console.error(`[Puppeteer] Erro ao enviar mensagem:`, error);
      await this.log('error', { action: 'sendMessage', phone, error: String(error) });
      return {
        sent: false,
        numberValid: true, // Assumimos válido se chegou aqui
        reason: 'error',
        errorMessage: String(error)
      };
    }
  }

  /**
   * Executa um step de digitação
   */
  private async executeTypingStep(step: TypingStep): Promise<void> {
    if (!this.page) return;

    switch (step.action) {
      case 'type':
        if (step.value) {
          await this.page.keyboard.type(step.value, {
            delay: step.durationMs
          });
        }
        break;

      case 'backspace':
        await this.page.keyboard.press('Backspace');
        await this.delay(step.durationMs);
        break;

      case 'pause':
      case 'wait':
        await this.delay(step.durationMs);
        break;
    }
  }

  /**
   * Processa fila de mensagens
   */
  async processQueue(): Promise<void> {
    if (!this.sessionId) throw new Error('Sessão não inicializada');

    this.isRunning = true;
    console.log(`[Puppeteer] Iniciando processamento da fila para ${this.config.channelId}`);

    let msg: QueueMessage | null = null;
    while (this.isRunning) {
      msg = null;
      try {
        // === VERIFICAÇÕES DE SEGURANÇA ===

        // Verificar limites de segurança
        const safetyCheck = this.canContinueSending();
        if (!safetyCheck.canSend) {
          console.log(`[Puppeteer] ⚠️ Limite de segurança atingido: ${safetyCheck.reason}`);
          await this.log('safety_limit_reached', {
            reason: safetyCheck.reason,
            stats: this.dailyStats
          });

          // Pausar pelo tempo indicado
          const pauseTime = safetyCheck.pauseMs || 60000;
          console.log(`[Puppeteer] Pausando por ${Math.round(pauseTime / 60000)} minutos...`);
          await this.delay(pauseTime);

          // Resetar erros consecutivos após pausa
          if (safetyCheck.reason === 'consecutive_errors') {
            this.dailyStats.consecutiveErrors = 0;
          }
          continue;
        }

        // Buscar próxima mensagem da fila
        const { data: messages, error } = await this.supabase
          .rpc('dequeue_aic_message', { p_channel_id: this.config.channelId });

        if (error) {
          console.error('[Puppeteer] Erro ao buscar fila:', error);
          this.dailyStats.consecutiveErrors++;
          await this.delay(5000);
          continue;
        }

        if (!messages || messages.length === 0) {
          // Fila vazia, aguardar
          await this.delay(3000);
          continue;
        }

        msg = messages[0] as QueueMessage;

        // === CONTROLE DE HORÁRIO PARA OUTBOUND ===
        // Outbound DM: APENAS dias úteis, horário comercial (9h-18h)
        // Respostas (reply): podem ser enviadas a qualquer hora
        if (msg.message_type === 'outbound_dm') {
          if (!this.isWithinOutboundHours()) {
            console.log('[Puppeteer] 🕐 Outbound fora do horário comercial (Seg-Sex 9h-18h), reagendando...');
            // Remarcar como pending para processar depois
            await this.supabase
              .from('aic_message_queue')
              .update({ status: 'pending', updated_at: new Date().toISOString() })
              .eq('id', msg.id);
            await this.delay(60000);
            continue;
          }

          // Incrementar contador de números novos (outbound = número novo)
          this.dailyStats.newNumbersAttempted++;
        }

        console.log(`[Puppeteer] Processando mensagem ${msg.id} para ${msg.phone} (tipo: ${msg.message_type}, canal: ${msg.channel})`);
        console.log(`[Puppeteer] 📊 Stats: ${this.dailyStats.totalMessagesSent}/${SAFETY_CONFIG.maxTotalMessagesPerDay} msgs, ${this.dailyStats.invalidNumbersFound} inválidos`);

        // Skip non-WhatsApp messages - devolver para fila
        if (msg.channel && msg.channel !== 'whatsapp') {
          console.log(`[Puppeteer] ⏭️ Canal ${msg.channel} não suportado pelo Puppeteer, devolvendo para fila`);
          await this.supabase
            .from('aic_message_queue')
            .update({ status: 'pending', updated_at: new Date().toISOString() })
            .eq('id', msg.id);
          await this.delay(1000);
          continue;
        }

        // Skip messages sem phone
        if (!msg.phone) {
          console.log(`[Puppeteer] ❌ Mensagem ${msg.id} sem phone, marcando como failed`);
          await this.supabase.rpc('mark_aic_message_failed', {
            p_queue_id: msg.id,
            p_error_message: 'Phone is null - cannot send via WhatsApp'
          });
          continue;
        }

        // Enviar mensagem (inclui validação do número)
        const result = await this.sendMessage(
          msg.phone,
          msg.message_text,
          msg.include_typos
        );

        if (result.sent) {
          // ✅ SUCESSO - Mensagem enviada
          await this.supabase.rpc('mark_aic_message_sent', {
            p_queue_id: msg.id
          });

          // Atualizar contadores de sucesso
          this.dailyStats.totalMessagesSent++;
          this.dailyStats.consecutiveErrors = 0; // Reset erros

          // Atualizar lead como WhatsApp válido (se tiver campaign_id)
          if (msg.campaign_id) {
            await this.supabase.rpc('validate_lead_phone', {
              p_lead_id: msg.conversation_id,
              p_phone: msg.phone,
              p_is_valid: true,
              p_error: null
            });
          }

          // Delay normal entre mensagens
          const successDelay = this.humanizer.getDelayBetweenMessages();
          console.log(`[Puppeteer] ✅ Enviado! Aguardando ${successDelay}ms...`);
          await this.delay(successDelay);

        } else if (!result.numberValid) {
          // ❌ NÚMERO INVÁLIDO
          console.log(`[Puppeteer] ❌ Número ${msg.phone} inválido: ${result.errorMessage}`);

          // Atualizar contadores de segurança
          this.dailyStats.invalidNumbersFound++;
          this.dailyStats.consecutiveErrors++;

          await this.supabase.rpc('mark_aic_message_failed', {
            p_queue_id: msg.id,
            p_error_message: `Número inválido: ${result.errorMessage}`
          });

          // Atualizar status do número no lead
          if (msg.campaign_id) {
            await this.supabase.rpc('validate_lead_phone', {
              p_lead_id: msg.conversation_id,
              p_phone: msg.phone,
              p_is_valid: false,
              p_error: result.errorMessage || 'Número não encontrado no WhatsApp'
            });

            // Tentar próximo número do lead (se houver)
            await this.tryNextPhoneNumber(msg);
          }

          // ⚠️ DELAY DE SEGURANÇA AUMENTADO após número inválido
          console.log(`[Puppeteer] ⚠️ Delay de segurança: ${SAFETY_CONFIG.delayAfterInvalidNumber / 1000}s após número inválido`);
          await this.delay(SAFETY_CONFIG.delayAfterInvalidNumber);

        } else {
          // ⚠️ FALHA NO ENVIO (número pode ser válido)
          this.dailyStats.consecutiveErrors++;

          await this.supabase.rpc('mark_aic_message_failed', {
            p_queue_id: msg.id,
            p_error_message: result.errorMessage || 'Falha no envio via Puppeteer'
          });

          // Delay normal entre mensagens
          const failDelay = this.humanizer.getDelayBetweenMessages();
          console.log(`[Puppeteer] ⚠️ Falha no envio. Aguardando ${failDelay}ms...`);
          await this.delay(failDelay);
        }

        // Heartbeat
        await this.sendHeartbeat();

      } catch (error: any) {
        console.error('[Puppeteer] Erro no processamento:', error);
        // Marcar mensagem como failed para não travar a fila
        if (msg?.id) {
          try {
            await this.supabase.rpc('mark_aic_message_failed', {
              p_queue_id: msg.id,
              p_error_message: `Erro inesperado: ${error?.message || 'unknown'}`
            });
            console.log(`[Puppeteer] Mensagem ${msg.id} marcada como failed após erro`);
          } catch (rpcError) {
            console.error('[Puppeteer] Falha ao marcar mensagem como failed:', rpcError);
          }
        }
        await this.delay(10000);
      }
    }
  }

  /**
   * Tenta próximo número de telefone do lead quando o atual é inválido
   */
  private async tryNextPhoneNumber(msg: QueueMessage): Promise<void> {
    try {
      // Buscar lead com seus telefones
      const { data: lead, error } = await this.supabase
        .from('aic_campaign_leads')
        .select('id, phone_numbers')
        .eq('campaign_id', msg.campaign_id)
        .eq('phone', msg.phone)
        .single();

      if (error || !lead || !lead.phone_numbers) {
        console.log('[Puppeteer] Não foi possível buscar próximo número');
        return;
      }

      // Encontrar próximo número não validado ou válido
      const phones = lead.phone_numbers as Array<{
        phone: string;
        valid: boolean | null;
        validated_at: string | null;
      }>;

      const nextPhone = phones.find(p =>
        p.phone !== msg.phone && // Diferente do atual
        p.valid !== false // Não marcado como inválido
      );

      if (!nextPhone) {
        console.log(`[Puppeteer] Nenhum outro número WhatsApp disponível para lead ${lead.id}`);

        // FALLBACK: Mover para fila Instagram DM
        await this.moveLeadToInstagramDM(lead.id, msg.message_text, phones.length);
        return;
      }

      console.log(`[Puppeteer] Enfileirando próximo número: ${nextPhone.phone}`);

      // Enfileirar mensagem para o próximo número
      await this.supabase.rpc('enqueue_aic_message', {
        p_campaign_id: msg.campaign_id,
        p_conversation_id: msg.conversation_id,
        p_phone: nextPhone.phone,
        p_chat_id: msg.chat_id,
        p_message_text: msg.message_text,
        p_message_type: msg.message_type,
        p_include_typos: msg.include_typos,
        p_priority: 1 // Prioridade alta
      });

    } catch (error) {
      console.error('[Puppeteer] Erro ao tentar próximo número:', error);
    }
  }

  /**
   * Move lead para fila de Instagram DM quando todos os WhatsApp falharam
   */
  private async moveLeadToInstagramDM(
    leadId: string,
    messageText: string,
    whatsappAttempts: number
  ): Promise<void> {
    try {
      // Usar função SQL para mover
      const { data, error } = await this.supabase.rpc('move_lead_to_instagram_dm', {
        p_lead_id: leadId,
        p_message_text: messageText,
        p_reason: 'all_numbers_invalid',
        p_whatsapp_attempts: whatsappAttempts
      });

      if (error) {
        // Se erro for "não tem Instagram", logar e continuar
        if (error.message.includes('não tem Instagram')) {
          console.log(`[Puppeteer] Lead ${leadId} não tem Instagram - sem fallback disponível`);

          // Marcar lead como sem canal de contato
          await this.supabase
            .from('aic_campaign_leads')
            .update({
              dm_status: 'no_contact_channel',
              updated_at: new Date().toISOString()
            })
            .eq('id', leadId);
        } else {
          console.error('[Puppeteer] Erro ao mover para Instagram:', error);
        }
        return;
      }

      console.log(`[Puppeteer] ✅ Lead ${leadId} movido para fila Instagram DM (queue_id: ${data})`);

      await this.log('lead_moved_to_instagram', {
        lead_id: leadId,
        queue_id: data,
        reason: 'all_whatsapp_invalid',
        attempts: whatsappAttempts
      });

    } catch (error) {
      console.error('[Puppeteer] Erro ao mover lead para Instagram:', error);
    }
  }

  /**
   * Envia heartbeat para monitoramento
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.sessionId) return;

    await this.supabase
      .from('aic_puppeteer_sessions')
      .update({
        last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', this.sessionId);
  }

  /**
   * Atualiza status da sessão
   */
  private async updateSessionStatus(status: string): Promise<void> {
    if (!this.sessionId) return;

    await this.supabase
      .from('aic_puppeteer_sessions')
      .update({
        status,
        connected_at: status === 'connected' ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', this.sessionId);
  }

  /**
   * Registra log de atividade
   */
  private async log(eventType: string, eventData: Record<string, unknown>): Promise<void> {
    if (!this.sessionId) return;

    await this.supabase
      .from('aic_puppeteer_logs')
      .insert({
        session_id: this.sessionId,
        event_type: eventType,
        event_data: eventData
      });
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Para o worker
   */
  async stop(): Promise<void> {
    console.log(`[Puppeteer] Parando worker ${this.config.channelId}`);
    this.isRunning = false;

    await this.updateSessionStatus('disconnected');
    await this.log('stopped', { reason: 'manual' });

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Verifica saúde da sessão
   */
  async healthCheck(): Promise<boolean> {
    if (!this.page || !this.browser) return false;

    try {
      const connected = await this.checkIfConnected();
      await this.sendHeartbeat();
      return connected;
    } catch {
      return false;
    }
  }
}

export default AICPuppeteerWorkerService;
