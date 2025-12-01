/**
 * WHATSAPP SESSION MANAGER SERVICE
 *
 * Gerencia múltiplas sessões WhatsApp Web via Puppeteer.
 * Cada campanha tem sua própria sessão (1:1).
 *
 * Funcionalidades:
 * - Criar/destruir sessões por campanha
 * - Gerar QR Code para cliente escanear
 * - Manter sessões conectadas (heartbeat)
 * - Enviar mensagens de texto
 * - Receber mensagens (polling)
 * - Rate limiting por sessão
 *
 * Limites:
 * - Máximo 5 sessões simultâneas
 * - 15 mensagens/hora por sessão
 * - 120 mensagens/dia por sessão
 * - Horário comercial: 8-12h, 14-18h (Seg-Sex)
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

const CONFIG = {
  MAX_SESSIONS: 5,
  QR_CODE_TIMEOUT_MS: 60000,  // QR expira em 60s
  QR_CHECK_INTERVAL_MS: 2000,  // Verifica QR a cada 2s
  SESSION_CHECK_INTERVAL_MS: 30000,  // Heartbeat a cada 30s
  MESSAGE_CHECK_INTERVAL_MS: 5000,  // Verifica novas msgs a cada 5s
  WHATSAPP_WEB_URL: 'https://web.whatsapp.com',
  SESSIONS_DIR: path.join(process.cwd(), 'whatsapp-sessions'),
  SCREENSHOTS_DIR: path.join(process.cwd(), 'screenshots', 'whatsapp'),
  HEADLESS: process.env.WHATSAPP_HEADLESS === 'true',
  DEFAULT_HOURLY_LIMIT: 15,
  DEFAULT_DAILY_LIMIT: 120
};

// ============================================================================
// TIPOS
// ============================================================================

export interface WhatsAppSession {
  id: string;
  campaignId: string;
  sessionName: string;
  status: 'disconnected' | 'qr_pending' | 'connecting' | 'connected' | 'expired' | 'banned';
  phoneNumber?: string;
  browser?: Browser;
  page?: Page;
  qrCodeData?: string;
  qrCodeExpiresAt?: Date;
  lastActivity?: Date;
  messagesSentToday: number;
  messagesSentThisHour: number;
  hourlyLimit: number;
  dailyLimit: number;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  sentAt?: Date;
}

export interface IncomingMessage {
  from: string;
  body: string;
  timestamp: Date;
  isGroup: boolean;
  chatId: string;
}

export interface SessionStatus {
  sessionId: string;
  campaignId: string;
  status: string;
  phoneNumber?: string;
  isConnected: boolean;
  canSend: boolean;
  hourlyCount: number;
  hourlyLimit: number;
  hourlyRemaining: number;
  dailyCount: number;
  dailyLimit: number;
  dailyRemaining: number;
  lastActivity?: Date;
}

// ============================================================================
// ESTADO GLOBAL
// ============================================================================

const activeSessions: Map<string, WhatsAppSession> = new Map();
let heartbeatInterval: NodeJS.Timeout | null = null;

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Garante que os diretórios necessários existem
 */
function ensureDirectories(): void {
  if (!fs.existsSync(CONFIG.SESSIONS_DIR)) {
    fs.mkdirSync(CONFIG.SESSIONS_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG.SCREENSHOTS_DIR)) {
    fs.mkdirSync(CONFIG.SCREENSHOTS_DIR, { recursive: true });
  }
}

/**
 * Gera args do browser para stealth mode
 */
function getBrowserArgs(): string[] {
  return [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--window-size=1280,800',
    '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
}

/**
 * Aplica scripts de stealth na página
 */
async function applyStealthScripts(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(`
    // Remove webdriver flag
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });

    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });

    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['pt-BR', 'pt', 'en-US', 'en']
    });

    // Mock platform
    Object.defineProperty(navigator, 'platform', {
      get: () => 'MacIntel'
    });
  `);
}

/**
 * Delay humanizado
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Delay com variação aleatória
 */
function humanDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return delay(ms);
}

// ============================================================================
// GERENCIAMENTO DE SESSÕES
// ============================================================================

/**
 * Cria uma nova sessão WhatsApp para uma campanha
 */
export async function createSession(campaignId: string, sessionName: string): Promise<WhatsAppSession> {
  console.log(`\n📱 [WA SESSION] Criando sessão para campanha ${campaignId}`);

  // Verificar limite de sessões
  if (activeSessions.size >= CONFIG.MAX_SESSIONS) {
    throw new Error(`Limite máximo de ${CONFIG.MAX_SESSIONS} sessões atingido`);
  }

  // Verificar se já existe sessão para esta campanha
  const existingSession = Array.from(activeSessions.values()).find(s => s.campaignId === campaignId);
  if (existingSession) {
    console.log(`   Sessão já existe: ${existingSession.id}`);
    return existingSession;
  }

  ensureDirectories();

  // Criar registro no banco
  const { data: dbSession, error: dbError } = await supabase
    .from('whatsapp_sessions')
    .upsert({
      campaign_id: campaignId,
      session_name: sessionName,
      status: 'disconnected',
      hourly_limit: CONFIG.DEFAULT_HOURLY_LIMIT,
      daily_limit: CONFIG.DEFAULT_DAILY_LIMIT,
      is_active: true
    }, {
      onConflict: 'campaign_id'
    })
    .select()
    .single();

  if (dbError) {
    throw new Error(`Erro ao criar sessão no banco: ${dbError.message}`);
  }

  // Criar sessão em memória
  const session: WhatsAppSession = {
    id: dbSession.id,
    campaignId,
    sessionName,
    status: 'disconnected',
    messagesSentToday: dbSession.messages_sent_today || 0,
    messagesSentThisHour: dbSession.messages_sent_this_hour || 0,
    hourlyLimit: dbSession.hourly_limit,
    dailyLimit: dbSession.daily_limit
  };

  activeSessions.set(session.id, session);

  console.log(`   ✅ Sessão criada: ${session.id}`);

  return session;
}

/**
 * Inicia o browser e gera QR Code para uma sessão
 */
export async function startSessionAndGetQR(sessionId: string): Promise<{ qrCode: string; expiresAt: Date }> {
  console.log(`\n🔄 [WA SESSION] Iniciando browser e gerando QR Code`);

  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error('Sessão não encontrada');
  }

  // Fechar browser existente se houver
  if (session.browser) {
    await session.browser.close().catch(() => {});
  }

  const userDataDir = path.join(CONFIG.SESSIONS_DIR, session.campaignId);

  // Iniciar browser
  const browser = await puppeteer.launch({
    headless: CONFIG.HEADLESS,
    args: getBrowserArgs(),
    userDataDir,
    defaultViewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();
  await applyStealthScripts(page);

  session.browser = browser;
  session.page = page;
  session.status = 'qr_pending';

  // Atualizar status no banco
  await supabase
    .from('whatsapp_sessions')
    .update({ status: 'qr_pending' })
    .eq('id', sessionId);

  // Navegar para WhatsApp Web
  console.log(`   Navegando para WhatsApp Web...`);
  await page.goto(CONFIG.WHATSAPP_WEB_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  // Aguardar QR Code aparecer
  console.log(`   Aguardando QR Code...`);

  try {
    // Verificar se já está logado
    const isLoggedIn = await checkIfLoggedIn(page);
    if (isLoggedIn) {
      console.log(`   ✅ Já estava logado!`);
      session.status = 'connected';
      session.phoneNumber = await extractPhoneNumber(page);

      await supabase.rpc('update_whatsapp_session_status', {
        p_session_id: sessionId,
        p_status: 'connected',
        p_phone_number: session.phoneNumber
      });

      return { qrCode: '', expiresAt: new Date() };
    }

    // Esperar pelo QR Code
    await page.waitForSelector('canvas[aria-label="Scan me!"], canvas[aria-label="Scan this QR code to link a device!"]', { timeout: 30000 });

    // Extrair QR Code como base64
    const qrCodeData = await page.evaluate(`
      (() => {
        const canvas = document.querySelector('canvas[aria-label="Scan me!"], canvas[aria-label="Scan this QR code to link a device!"]');
        return canvas ? canvas.toDataURL('image/png') : null;
      })()
    `) as string | null;

    if (!qrCodeData) {
      throw new Error('Não foi possível extrair QR Code');
    }

    const expiresAt = new Date(Date.now() + CONFIG.QR_CODE_TIMEOUT_MS);

    session.qrCodeData = qrCodeData;
    session.qrCodeExpiresAt = expiresAt;

    // Salvar no banco
    await supabase
      .from('whatsapp_sessions')
      .update({
        qr_code_data: qrCodeData,
        qr_code_generated_at: new Date().toISOString(),
        qr_code_expires_at: expiresAt.toISOString(),
        status: 'qr_pending'
      })
      .eq('id', sessionId);

    console.log(`   ✅ QR Code gerado, expira em ${CONFIG.QR_CODE_TIMEOUT_MS / 1000}s`);

    // Iniciar monitoramento de conexão em background
    monitorConnection(sessionId);

    return { qrCode: qrCodeData, expiresAt };

  } catch (error: any) {
    console.error(`   ❌ Erro ao gerar QR Code:`, error.message);
    session.status = 'disconnected';
    await supabase.rpc('update_whatsapp_session_status', {
      p_session_id: sessionId,
      p_status: 'disconnected',
      p_error_message: error.message
    });
    throw error;
  }
}

/**
 * Verifica se está logado no WhatsApp Web
 */
async function checkIfLoggedIn(page: Page): Promise<boolean> {
  try {
    // Verificar se o elemento principal do chat existe
    const chatElement = await page.$('div[data-testid="chat-list"]');
    return !!chatElement;
  } catch {
    return false;
  }
}

/**
 * Extrai o número de telefone conectado
 */
async function extractPhoneNumber(page: Page): Promise<string | undefined> {
  try {
    // Clicar no menu do perfil
    await page.click('div[data-testid="menu-bar-user-avatar"]');
    await humanDelay(500, 1000);

    // Buscar número no perfil
    const phoneElement = await page.$('span[data-testid="status-info-drawer-phone"]');
    if (phoneElement) {
      const phone = await phoneElement.evaluate(el => el.textContent);
      return phone?.replace(/\D/g, '') || undefined;
    }

    // Fechar menu
    await page.keyboard.press('Escape');
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Monitora conexão após QR Code ser escaneado
 */
async function monitorConnection(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session || !session.page) return;

  const checkConnection = async () => {
    try {
      if (!session.page || session.status === 'connected') return;

      const isLoggedIn = await checkIfLoggedIn(session.page);

      if (isLoggedIn) {
        console.log(`\n✅ [WA SESSION] Sessão ${sessionId} conectada!`);

        session.status = 'connected';
        session.phoneNumber = await extractPhoneNumber(session.page);
        session.lastActivity = new Date();

        await supabase.rpc('update_whatsapp_session_status', {
          p_session_id: sessionId,
          p_status: 'connected',
          p_phone_number: session.phoneNumber
        });

        // Iniciar monitoramento de mensagens
        startMessageMonitoring(sessionId);
        return;
      }

      // Verificar se QR expirou
      if (session.qrCodeExpiresAt && new Date() > session.qrCodeExpiresAt) {
        console.log(`\n⏰ [WA SESSION] QR Code expirado para sessão ${sessionId}`);
        session.status = 'expired';
        await supabase.rpc('update_whatsapp_session_status', {
          p_session_id: sessionId,
          p_status: 'expired'
        });
        return;
      }

      // Continuar verificando
      setTimeout(checkConnection, CONFIG.QR_CHECK_INTERVAL_MS);

    } catch (error: any) {
      console.error(`❌ [WA SESSION] Erro no monitoramento:`, error.message);
    }
  };

  // Iniciar verificação
  setTimeout(checkConnection, CONFIG.QR_CHECK_INTERVAL_MS);
}

/**
 * Inicia monitoramento de mensagens recebidas
 */
async function startMessageMonitoring(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session || !session.page) return;

  console.log(`\n👂 [WA SESSION] Iniciando monitoramento de mensagens para ${sessionId}`);

  // TODO: Implementar interceptação de mensagens
  // Por enquanto, usar polling do DOM
}

// ============================================================================
// ENVIO DE MENSAGENS
// ============================================================================

/**
 * Envia mensagem de texto para um número
 */
export async function sendMessage(
  sessionId: string,
  phoneNumber: string,
  messageText: string
): Promise<SendMessageResult> {
  console.log(`\n📤 [WA SESSION] Enviando mensagem`);
  console.log(`   Sessão: ${sessionId}`);
  console.log(`   Para: ${phoneNumber}`);
  console.log(`   Mensagem: "${messageText.substring(0, 50)}..."`);

  const session = activeSessions.get(sessionId);
  if (!session) {
    return { success: false, error: 'Sessão não encontrada' };
  }

  if (!session.page) {
    return { success: false, error: 'Browser não inicializado' };
  }

  if (session.status !== 'connected') {
    return { success: false, error: `Sessão não conectada (status: ${session.status})` };
  }

  // Verificar rate limits via RPC
  const { data: canSendResult } = await supabase.rpc('can_whatsapp_session_send', {
    p_session_id: sessionId
  });

  if (!canSendResult?.can_send) {
    return {
      success: false,
      error: `Rate limit: ${canSendResult?.reason || 'unknown'}`
    };
  }

  try {
    const page = session.page;

    // Formatar número (remover caracteres especiais, adicionar código do país)
    const formattedPhone = formatPhoneNumber(phoneNumber);

    // Navegar para o chat via URL direta
    const chatUrl = `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(messageText)}`;

    console.log(`   Navegando para chat...`);
    await page.goto(chatUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Aguardar campo de mensagem carregar
    await humanDelay(2000, 3000);

    // Verificar se número é válido (se apareceu erro)
    const invalidNumber = await page.$('div[data-testid="popup-confirm-title"]');
    if (invalidNumber) {
      const errorText = await invalidNumber.evaluate(el => el.textContent);
      if (errorText?.includes('inválido') || errorText?.includes('invalid')) {
        return { success: false, error: 'Número inválido ou não tem WhatsApp' };
      }
    }

    // Aguardar botão de envio
    const sendButtonSelector = 'button[data-testid="compose-btn-send"], span[data-testid="send"]';
    await page.waitForSelector(sendButtonSelector, { timeout: 15000 });

    // Clicar em enviar
    await page.click(sendButtonSelector);

    console.log(`   Mensagem enviada, aguardando confirmação...`);
    await humanDelay(1500, 2500);

    // Verificar se mensagem foi enviada (check mark)
    const sentConfirmation = await page.$('span[data-testid="msg-check"], span[data-testid="msg-dblcheck"]');

    if (!sentConfirmation) {
      // Tirar screenshot para debug
      const screenshotPath = path.join(CONFIG.SCREENSHOTS_DIR, `send-error-${Date.now()}.png`) as `${string}.png`;
      await page.screenshot({ path: screenshotPath });
      return { success: false, error: 'Não foi possível confirmar envio' };
    }

    // Incrementar contadores
    await supabase.rpc('increment_whatsapp_message_count', {
      p_session_id: sessionId
    });

    // Atualizar sessão em memória
    session.messagesSentThisHour++;
    session.messagesSentToday++;
    session.lastActivity = new Date();

    // Registrar no log
    await supabase.from('whatsapp_message_log').insert({
      session_id: sessionId,
      campaign_id: session.campaignId,
      direction: 'outbound',
      to_phone: formattedPhone,
      message_text: messageText,
      status: 'sent',
      sent_at: new Date().toISOString()
    });

    console.log(`   ✅ Mensagem enviada com sucesso!`);

    return {
      success: true,
      sentAt: new Date(),
      messageId: `wa_${Date.now()}`
    };

  } catch (error: any) {
    console.error(`   ❌ Erro ao enviar:`, error.message);

    // Tirar screenshot para debug
    if (session.page) {
      const screenshotPath = path.join(CONFIG.SCREENSHOTS_DIR, `send-error-${Date.now()}.png`) as `${string}.png`;
      await session.page.screenshot({ path: screenshotPath }).catch(() => {});
    }

    return { success: false, error: error.message };
  }
}

/**
 * Formata número de telefone para WhatsApp
 */
function formatPhoneNumber(phone: string): string {
  // Remover tudo que não for número
  let cleaned = phone.replace(/\D/g, '');

  // Se começar com 0, remover
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // Se não tiver código do país, adicionar 55 (Brasil)
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = '55' + cleaned;
  }

  return cleaned;
}

// ============================================================================
// GERENCIAMENTO DO CICLO DE VIDA
// ============================================================================

/**
 * Obtém status de uma sessão
 */
export async function getSessionStatus(sessionId: string): Promise<SessionStatus | null> {
  const session = activeSessions.get(sessionId);

  if (!session) {
    // Buscar do banco
    const { data } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!data) return null;

    return {
      sessionId: data.id,
      campaignId: data.campaign_id,
      status: data.status,
      phoneNumber: data.phone_number,
      isConnected: data.status === 'connected',
      canSend: false,
      hourlyCount: data.messages_sent_this_hour,
      hourlyLimit: data.hourly_limit,
      hourlyRemaining: data.hourly_limit - data.messages_sent_this_hour,
      dailyCount: data.messages_sent_today,
      dailyLimit: data.daily_limit,
      dailyRemaining: data.daily_limit - data.messages_sent_today,
      lastActivity: data.last_activity_at
    };
  }

  // Verificar se pode enviar
  const { data: canSendResult } = await supabase.rpc('can_whatsapp_session_send', {
    p_session_id: sessionId
  });

  return {
    sessionId: session.id,
    campaignId: session.campaignId,
    status: session.status,
    phoneNumber: session.phoneNumber,
    isConnected: session.status === 'connected',
    canSend: canSendResult?.can_send || false,
    hourlyCount: session.messagesSentThisHour,
    hourlyLimit: session.hourlyLimit,
    hourlyRemaining: session.hourlyLimit - session.messagesSentThisHour,
    dailyCount: session.messagesSentToday,
    dailyLimit: session.dailyLimit,
    dailyRemaining: session.dailyLimit - session.messagesSentToday,
    lastActivity: session.lastActivity
  };
}

/**
 * Obtém sessão por campaign_id
 */
export async function getSessionByCampaign(campaignId: string): Promise<WhatsAppSession | null> {
  // Primeiro verifica em memória
  const memorySession = Array.from(activeSessions.values()).find(s => s.campaignId === campaignId);
  if (memorySession) return memorySession;

  // Buscar do banco
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('campaign_id', campaignId)
    .single();

  if (!data) return null;

  // Criar sessão em memória (sem browser)
  const session: WhatsAppSession = {
    id: data.id,
    campaignId: data.campaign_id,
    sessionName: data.session_name,
    status: data.status,
    phoneNumber: data.phone_number,
    messagesSentToday: data.messages_sent_today || 0,
    messagesSentThisHour: data.messages_sent_this_hour || 0,
    hourlyLimit: data.hourly_limit,
    dailyLimit: data.daily_limit,
    lastActivity: data.last_activity_at
  };

  activeSessions.set(session.id, session);

  return session;
}

/**
 * Lista todas as sessões ativas
 */
export async function listActiveSessions(): Promise<SessionStatus[]> {
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (!sessions) return [];

  return sessions.map(s => ({
    sessionId: s.id,
    campaignId: s.campaign_id,
    status: s.status,
    phoneNumber: s.phone_number,
    isConnected: s.status === 'connected',
    canSend: false,  // Será verificado individualmente
    hourlyCount: s.messages_sent_this_hour,
    hourlyLimit: s.hourly_limit,
    hourlyRemaining: s.hourly_limit - s.messages_sent_this_hour,
    dailyCount: s.messages_sent_today,
    dailyLimit: s.daily_limit,
    dailyRemaining: s.daily_limit - s.messages_sent_today,
    lastActivity: s.last_activity_at
  }));
}

/**
 * Fecha uma sessão
 */
export async function closeSession(sessionId: string): Promise<void> {
  console.log(`\n🔌 [WA SESSION] Fechando sessão ${sessionId}`);

  const session = activeSessions.get(sessionId);

  if (session?.browser) {
    await session.browser.close().catch(() => {});
  }

  activeSessions.delete(sessionId);

  await supabase.rpc('update_whatsapp_session_status', {
    p_session_id: sessionId,
    p_status: 'disconnected'
  });

  console.log(`   ✅ Sessão fechada`);
}

/**
 * Fecha todas as sessões
 */
export async function closeAllSessions(): Promise<void> {
  console.log(`\n🔌 [WA SESSION] Fechando todas as sessões...`);

  for (const [sessionId, session] of activeSessions) {
    if (session.browser) {
      await session.browser.close().catch(() => {});
    }
    await supabase.rpc('update_whatsapp_session_status', {
      p_session_id: sessionId,
      p_status: 'disconnected'
    });
  }

  activeSessions.clear();

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  console.log(`   ✅ Todas as sessões fechadas`);
}

/**
 * Inicia heartbeat para manter sessões vivas
 */
export function startHeartbeat(): void {
  if (heartbeatInterval) return;

  console.log(`\n💓 [WA SESSION] Iniciando heartbeat`);

  heartbeatInterval = setInterval(async () => {
    for (const [sessionId, session] of activeSessions) {
      if (session.status === 'connected' && session.page) {
        try {
          // Verificar se ainda está conectado
          const isLoggedIn = await checkIfLoggedIn(session.page);

          if (!isLoggedIn) {
            console.log(`⚠️ [WA SESSION] Sessão ${sessionId} desconectou`);
            session.status = 'disconnected';
            await supabase.rpc('update_whatsapp_session_status', {
              p_session_id: sessionId,
              p_status: 'disconnected'
            });
          }
        } catch (error) {
          // Browser pode ter crashado
          console.error(`❌ [WA SESSION] Erro no heartbeat:`, error);
        }
      }
    }

    // Resetar contadores se necessário
    await supabase.rpc('reset_whatsapp_rate_counters');

  }, CONFIG.SESSION_CHECK_INTERVAL_MS);
}

// ============================================================================
// EXPORT
// ============================================================================

export const whatsappSessionManager = {
  // Gerenciamento de sessões
  createSession,
  startSessionAndGetQR,
  getSessionStatus,
  getSessionByCampaign,
  listActiveSessions,
  closeSession,
  closeAllSessions,

  // Mensagens
  sendMessage,

  // Lifecycle
  startHeartbeat,

  // Config
  CONFIG
};

export default whatsappSessionManager;
