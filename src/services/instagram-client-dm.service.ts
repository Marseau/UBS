/**
 * INSTAGRAM CLIENT DM SERVICE
 *
 * Serviço para envio de DMs usando as contas Instagram dos clientes.
 * Integrado com o credentials-vault para segurança de credenciais.
 *
 * Características:
 * - Usa credenciais criptografadas do vault
 * - Rate limiting por conta
 * - Gerenciamento de sessão por conta
 * - Stealth mode para evitar detecção
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { credentialsVault, RateLimitStatus } from './credentials-vault.service';
import { createClient } from '@supabase/supabase-js';

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const CONFIG = {
  // Timeouts
  LOGIN_TIMEOUT_MS: 90000,
  PAGE_LOAD_TIMEOUT_MS: 60000,
  DM_SEND_TIMEOUT_MS: 30000,

  // Delays (para parecer humano)
  TYPING_DELAY_MIN_MS: 50,
  TYPING_DELAY_MAX_MS: 150,
  ACTION_DELAY_MIN_MS: 1000,
  ACTION_DELAY_MAX_MS: 3000,
  BETWEEN_DM_DELAY_MIN_MS: 30000, // 30 segundos
  BETWEEN_DM_DELAY_MAX_MS: 120000, // 2 minutos

  // Browser
  HEADLESS: process.env.INSTAGRAM_CLIENT_HEADLESS !== 'false',
  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

  // Pasta para cookies de sessão por conta
  SESSION_DIR: process.env.INSTAGRAM_CLIENT_SESSION_DIR || './instagram-client-sessions'
};

// ============================================================================
// TIPOS
// ============================================================================

interface ClientSession {
  accountId: string;
  browser: Browser;
  page: Page;
  username: string;
  lastActionAt: Date;
  isLoggedIn: boolean;
}

interface SendDMResult {
  success: boolean;
  messageId?: string;
  error?: string;
  rateLimitHit?: boolean;
}

// ============================================================================
// CACHE DE SESSÕES ATIVAS
// ============================================================================

const activeSessions: Map<string, ClientSession> = new Map();

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Delay com variação aleatória (simula comportamento humano)
 */
async function humanDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Digita texto com delay variável (simula digitação humana)
 */
async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await humanDelay(200, 500);

  for (const char of text) {
    await page.keyboard.type(char, {
      delay: Math.floor(Math.random() * (CONFIG.TYPING_DELAY_MAX_MS - CONFIG.TYPING_DELAY_MIN_MS)) + CONFIG.TYPING_DELAY_MIN_MS
    });
  }
}

/**
 * Aplica scripts de stealth para evitar detecção
 */
async function applyStealthScripts(page: Page): Promise<void> {
  // Sobrescrever navigator.webdriver
  await page.evaluateOnNewDocument(`
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
  `);

  // Sobrescrever navigator.plugins
  await page.evaluateOnNewDocument(`
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });
  `);

  // Sobrescrever navigator.languages
  await page.evaluateOnNewDocument(`
    Object.defineProperty(navigator, 'languages', {
      get: () => ['pt-BR', 'pt', 'en-US', 'en']
    });
  `);
}

// ============================================================================
// GERENCIAMENTO DE SESSÃO
// ============================================================================

/**
 * Obtém ou cria uma sessão para a conta do cliente
 */
async function getOrCreateSession(accountId: string): Promise<ClientSession | null> {
  // Verificar se já existe sessão ativa
  const existingSession = activeSessions.get(accountId);
  if (existingSession && existingSession.isLoggedIn) {
    existingSession.lastActionAt = new Date();
    return existingSession;
  }

  console.log(`\n🔐 [CLIENT-DM] Criando sessão para conta ${accountId}`);

  try {
    // Obter credenciais do vault
    const credentialsResult = await credentialsVault.getInstagramCredentials(
      accountId,
      'instagram-client-dm-service',
      'Creating session for DM sending'
    );

    if (!credentialsResult.success || !credentialsResult.credentials) {
      console.error(`   ❌ Falha ao obter credenciais: ${credentialsResult.error}`);
      return null;
    }

    const { username, password } = credentialsResult.credentials;

    // Lançar browser
    const browser = await puppeteer.launch({
      headless: CONFIG.HEADLESS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        `--user-agent=${CONFIG.USER_AGENT}`
      ]
    });

    // Criar página
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(CONFIG.USER_AGENT);

    // Aplicar stealth
    await applyStealthScripts(page);

    // Tentar carregar sessão salva do banco
    const sessionResult = await credentialsVault.getSessionData(accountId);
    let needsLogin = true;

    if (sessionResult.success && sessionResult.sessionData) {
      console.log(`   📂 Carregando sessão salva...`);
      try {
        const cookies = JSON.parse(sessionResult.sessionData);
        await page.setCookie(...cookies);

        // Verificar se sessão ainda é válida
        await page.goto('https://www.instagram.com/', {
          waitUntil: 'networkidle2',
          timeout: CONFIG.PAGE_LOAD_TIMEOUT_MS
        });

        await humanDelay(2000, 3000);

        const isLoggedIn = !page.url().includes('/accounts/login');
        if (isLoggedIn) {
          console.log(`   ✅ Sessão restaurada com sucesso!`);
          needsLogin = false;
        }
      } catch {
        console.log(`   ⚠️  Sessão expirada ou inválida, fazendo login...`);
      }
    }

    // Fazer login se necessário
    if (needsLogin) {
      const loginSuccess = await performLogin(page, username, password);
      if (!loginSuccess) {
        await browser.close();
        await credentialsVault.updateAccountStatus(accountId, 'login_failed', 'Failed to login');
        return null;
      }

      // Salvar cookies da sessão
      const cookies = await page.cookies();
      const sessionExpires = new Date();
      sessionExpires.setDate(sessionExpires.getDate() + 7); // 7 dias

      await credentialsVault.storeSessionData(
        accountId,
        JSON.stringify(cookies),
        sessionExpires
      );
    }

    // Criar objeto de sessão
    const session: ClientSession = {
      accountId,
      browser,
      page,
      username,
      lastActionAt: new Date(),
      isLoggedIn: true
    };

    // Armazenar na cache
    activeSessions.set(accountId, session);

    console.log(`   ✅ Sessão criada com sucesso para @${username}`);

    return session;

  } catch (error) {
    console.error(`   ❌ Erro ao criar sessão:`, error);
    return null;
  }
}

/**
 * Realiza login no Instagram
 */
async function performLogin(page: Page, username: string, password: string): Promise<boolean> {
  console.log(`   🔑 Fazendo login como @${username}...`);

  try {
    // Navegar para página de login
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'networkidle2',
      timeout: CONFIG.PAGE_LOAD_TIMEOUT_MS
    });

    await humanDelay(2000, 4000);

    // Aceitar cookies se aparecer
    try {
      const acceptButton = await page.$('button[class*="accept"]');
      if (acceptButton) {
        await acceptButton.click();
        await humanDelay(1000, 2000);
      }
    } catch {
      // Ignorar se não encontrar
    }

    // Preencher username
    await humanType(page, 'input[name="username"]', username);
    await humanDelay(500, 1000);

    // Preencher password
    await humanType(page, 'input[name="password"]', password);
    await humanDelay(500, 1000);

    // Clicar em login
    await page.click('button[type="submit"]');
    await humanDelay(5000, 8000);

    // Verificar se login foi bem sucedido
    const currentUrl = page.url();

    if (currentUrl.includes('challenge') || currentUrl.includes('verify')) {
      console.log(`   ⚠️  Verificação de segurança necessária!`);
      return false;
    }

    if (currentUrl.includes('/accounts/login')) {
      console.log(`   ❌ Login falhou - credenciais inválidas`);
      return false;
    }

    // Dispensar notificações se aparecer
    try {
      const notNowButton = await page.$('button:has-text("Agora não"), button:has-text("Not Now")');
      if (notNowButton) {
        await notNowButton.click();
        await humanDelay(1000, 2000);
      }
    } catch {
      // Ignorar
    }

    console.log(`   ✅ Login realizado com sucesso!`);
    return true;

  } catch (error) {
    console.error(`   ❌ Erro no login:`, error);
    return false;
  }
}

/**
 * Fecha uma sessão
 */
async function closeSession(accountId: string): Promise<void> {
  const session = activeSessions.get(accountId);
  if (session) {
    try {
      await session.browser.close();
    } catch {
      // Ignorar erros ao fechar
    }
    activeSessions.delete(accountId);
    console.log(`[CLIENT-DM] Sessão fechada para conta ${accountId}`);
  }
}

/**
 * Fecha todas as sessões
 */
async function closeAllSessions(): Promise<void> {
  for (const [accountId] of activeSessions) {
    await closeSession(accountId);
  }
}

// ============================================================================
// ENVIO DE DM
// ============================================================================

/**
 * Envia DM para um usuário
 */
async function sendDM(
  accountId: string,
  recipientUsername: string,
  message: string
): Promise<SendDMResult> {
  console.log(`\n📤 [CLIENT-DM] Enviando DM`);
  console.log(`   Para: @${recipientUsername}`);
  console.log(`   Conta: ${accountId}`);

  try {
    // Verificar rate limit
    const rateLimit: RateLimitStatus = await credentialsVault.checkRateLimit(accountId);

    if (!rateLimit.canDm) {
      console.log(`   ⚠️  Rate limit atingido: ${rateLimit.reason}`);
      return {
        success: false,
        error: rateLimit.reason,
        rateLimitHit: true
      };
    }

    if (!rateLimit.isWithinHours) {
      console.log(`   ⚠️  Fora do horário permitido`);
      return {
        success: false,
        error: 'Outside allowed hours',
        rateLimitHit: true
      };
    }

    // Obter sessão
    const session = await getOrCreateSession(accountId);
    if (!session) {
      return {
        success: false,
        error: 'Failed to create session'
      };
    }

    const { page } = session;

    // Navegar para DM do usuário
    const dmUrl = `https://www.instagram.com/direct/t/${recipientUsername}/`;
    console.log(`   📱 Abrindo conversa...`);

    try {
      // Primeiro, ir para a página do perfil para iniciar conversa
      await page.goto(`https://www.instagram.com/${recipientUsername}/`, {
        waitUntil: 'networkidle2',
        timeout: CONFIG.PAGE_LOAD_TIMEOUT_MS
      });

      await humanDelay(2000, 4000);

      // Verificar se perfil existe
      if (page.url().includes('404') || page.url().includes('sorry')) {
        return {
          success: false,
          error: 'Profile not found'
        };
      }

      // Clicar em "Enviar mensagem" ou ícone de mensagem
      const messageButton = await page.$('div[role="button"]:has-text("Enviar mensagem"), div[role="button"]:has-text("Message")');
      if (!messageButton) {
        // Tentar encontrar o botão de três pontos e depois mensagem
        const menuButton = await page.$('[aria-label="Opções"], [aria-label="Options"]');
        if (menuButton) {
          await menuButton.click();
          await humanDelay(1000, 2000);

          const sendMessageOption = await page.$('button:has-text("Enviar mensagem"), button:has-text("Send message")');
          if (sendMessageOption) {
            await sendMessageOption.click();
          }
        }
      } else {
        await messageButton.click();
      }

      await humanDelay(3000, 5000);

      // Esperar área de texto aparecer
      await page.waitForSelector('textarea[placeholder*="mensagem"], textarea[placeholder*="Message"]', {
        timeout: CONFIG.DM_SEND_TIMEOUT_MS
      });

      // Digitar mensagem
      console.log(`   ✍️  Digitando mensagem...`);
      await humanType(page, 'textarea[placeholder*="mensagem"], textarea[placeholder*="Message"]', message);

      await humanDelay(1000, 2000);

      // Enviar mensagem
      await page.keyboard.press('Enter');

      await humanDelay(3000, 5000);

      // Incrementar contador de ação
      await credentialsVault.incrementAction(accountId, 'dm');

      // Atualizar última ação
      session.lastActionAt = new Date();

      // Gerar ID da mensagem
      const messageId = `ig_dm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`   ✅ Mensagem enviada com sucesso!`);

      // Registrar no banco
      await supabase.from('instagram_dm_logs').insert({
        account_id: accountId,
        recipient_username: recipientUsername,
        message_preview: message.substring(0, 100),
        status: 'sent',
        sent_at: new Date().toISOString()
      });

      return {
        success: true,
        messageId
      };

    } catch (error: any) {
      console.error(`   ❌ Erro ao enviar DM:`, error.message);

      // Verificar se é erro de rate limit do Instagram
      const pageContent = await page.content().catch(() => '');
      if (pageContent.includes('rate limit') || pageContent.includes('tente novamente')) {
        await credentialsVault.updateAccountStatus(accountId, 'rate_limited', 'Instagram rate limit detected');
        return {
          success: false,
          error: 'Instagram rate limit detected',
          rateLimitHit: true
        };
      }

      // Registrar erro
      await supabase.from('instagram_dm_logs').insert({
        account_id: accountId,
        recipient_username: recipientUsername,
        message_preview: message.substring(0, 100),
        status: 'failed',
        error_message: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }

  } catch (error: any) {
    console.error(`   ❌ Erro geral:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Verifica se pode enviar DM (rate limit + horário)
 */
async function canSendDM(accountId: string): Promise<{ canSend: boolean; reason?: string }> {
  const rateLimit = await credentialsVault.checkRateLimit(accountId);

  if (!rateLimit.canDm) {
    return { canSend: false, reason: rateLimit.reason };
  }

  if (!rateLimit.isWithinHours) {
    return { canSend: false, reason: 'Outside allowed hours' };
  }

  return { canSend: true };
}

// ============================================================================
// EXPORT
// ============================================================================

export const instagramClientDMService = {
  sendDM,
  canSendDM,
  getOrCreateSession,
  closeSession,
  closeAllSessions
};

export default instagramClientDMService;
