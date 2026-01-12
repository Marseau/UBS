// @ts-nocheck - puppeteer contexts usam DOM APIs sem typings fortes
import { Browser, Page } from 'puppeteer';
import { getBrowserInstance, ensureLoggedSession } from './instagram-session.service';
import { applyFullStealth } from './instagram-stealth.service';
import fs from 'fs';
import path from 'path';

const COOKIES_FILE = path.join(process.cwd(), 'instagram-cookies.json');


/**
 * Sistema de gerenciamento de Páginas para requisições paralelas
 *
 * OTIMIZAÇÃO v2:
 * - 1 janela do navegador apenas
 * - Múltiplas abas (páginas) na mesma janela
 * - Cookies compartilhados automaticamente
 * - Menor overhead que BrowserContexts
 * - Footprint visual reduzido
 *
 * ANTES (v1 - Contexts):
 * - 1 browser → N contexts → N páginas
 * - Isolamento máximo, overhead médio
 *
 * AGORA (v2 - Páginas simples):
 * - 1 browser → N páginas diretas
 * - Isolamento suficiente, overhead mínimo
 */

interface ManagedPage {
  page: Page;
  createdAt: number;
  requestId: string;
}

const activePages = new Map<string, ManagedPage>();
let pageCounter = 0;

// 🆕 PÁGINA PERSISTENTE - reutilizada entre operações
let persistentPage: Page | null = null;
let persistentRequestId: string | null = null;

/**
 * Gera ID único para tracking de requisição
 */
function generateRequestId(): string {
  return `page_${++pageCounter}_${Date.now()}`;
}

/**
 * Cria ou reutiliza uma página com cookies autenticados
 *
 * 🆕 OTIMIZAÇÃO v3: PÁGINA PERSISTENTE
 * - Reutiliza a mesma página entre operações
 * - Só cria nova se a página atual estiver fechada/inválida
 * - Evita erros de "detached frame" causados por múltiplas páginas
 *
 * @returns Objeto com page, requestId e cleanup function
 */
export async function createIsolatedContext(): Promise<{
  page: Page;
  requestId: string;
  cleanup: () => Promise<void>;
}> {
  // 🔧 FIX: Capturar referência do browser ANTES de ensureLoggedSession
  // Se o browser mudar após a chamada, sabemos que foi recriado
  const browserBeforeSession = getBrowserInstance();

  // Garantir que browser principal está autenticado
  await ensureLoggedSession();

  const browser = getBrowserInstance();
  if (!browser) {
    throw new Error('Browser não inicializado.');
  }

  // 🔧 FIX DETACHED FRAME: Se o browser foi recriado, invalidar persistentPage
  // A referência antiga aponta para um browser que não existe mais
  const browserWasRecreated = browserBeforeSession !== browser;
  if (browserWasRecreated && persistentPage) {
    console.log(`🔄 Browser foi recriado - invalidando página persistente antiga`);
    // Não tentar fechar - o browser antigo já foi destruído
    if (persistentRequestId) {
      activePages.delete(persistentRequestId);
    }
    persistentPage = null;
    persistentRequestId = null;
  }

  // 🆕 VERIFICAR SE PÁGINA PERSISTENTE EXISTE E ESTÁ VÁLIDA
  if (persistentPage && !persistentPage.isClosed()) {
    try {
      // 🔧 FIX: Verificar também se o browser da página é o mesmo browser atual
      const pageBrowser = persistentPage.browser();
      if (pageBrowser !== browser) {
        throw new Error('Page belongs to a different browser instance');
      }

      // Testar se frame está válido (com timeout para evitar hang)
      await Promise.race([
        persistentPage.evaluate(() => window.location.href),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Frame validation timeout')), 5000))
      ]);

      console.log(`♻️  Reutilizando página existente: ${persistentRequestId}`);

      // Retornar página existente com cleanup que NÃO fecha a página
      return {
        page: persistentPage,
        requestId: persistentRequestId!,
        cleanup: async () => {
          // 🆕 NÃO fechar a página - apenas log
          console.log(`   ℹ️  Página ${persistentRequestId} mantida aberta para próxima operação`);
        }
      };
    } catch (frameError: any) {
      console.log(`⚠️  Página existente inválida (${frameError.message}). Criando nova...`);
      // Página está corrompida - fechar e criar nova
      try {
        await persistentPage.close();
      } catch {}
      // 🔧 FIX: Remover entrada antiga do Map para evitar dessincronização
      if (persistentRequestId) {
        activePages.delete(persistentRequestId);
      }
      persistentPage = null;
      persistentRequestId = null;
    }
  }

  const requestId = generateRequestId();

  // Criar página simples (sem context isolado)
  const page = await browser.newPage();

  console.log(`📄 Página criada: ${requestId}`);

  // 🔐 AUTENTICAR PROXY (se configurado) - ANTES de qualquer navegação
  const proxyConfig = (browser as any)._currentProxyConfig;
  if (proxyConfig?.username && proxyConfig?.password) {
    await page.authenticate({
      username: proxyConfig.username,
      password: proxyConfig.password
    });
    console.log(`   🔐 Proxy autenticado: ${proxyConfig.username}@${proxyConfig.host}`);
  }

  // 🕵️ APLICAR STEALTH COMPLETO (fingerprint evasion + challenge detection)
  await applyFullStealth(page);

  // ✅ NAVEGAR PRIMEIRO para instagram.com para aceitar cookies do domínio
  await page.goto('https://www.instagram.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  }).catch(() => {});

  // Carregar cookies do arquivo (sessionPage foi fechada após login)
  if (fs.existsSync(COOKIES_FILE)) {
    try {
      const cookiesData = fs.readFileSync(COOKIES_FILE, 'utf8');
      const cookies = JSON.parse(cookiesData);
      if (Array.isArray(cookies) && cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log(`   🔑 ${cookies.length} cookies aplicados à página ${requestId}`);
      }
    } catch (error: any) {
      console.warn(`   ⚠️  Erro ao carregar cookies para página ${requestId}: ${error.message}`);
    }
  }

  // Armazenar página gerenciada
  const managedPage: ManagedPage = {
    page,
    createdAt: Date.now(),
    requestId
  };
  activePages.set(requestId, managedPage);

  // 🆕 SALVAR COMO PÁGINA PERSISTENTE
  persistentPage = page;
  persistentRequestId = requestId;
  console.log(`   ✅ Página ${requestId} salva como persistente (será reutilizada)`);

  // Função de cleanup que NÃO fecha a página persistente
  const cleanup = async () => {
    // 🆕 NÃO fechar página persistente - apenas log
    console.log(`   ℹ️  Página ${requestId} mantida aberta para próxima operação`);
  };

  return { page, requestId, cleanup };
}

/**
 * 🆕 Cria uma página DEDICADA (não compartilhada)
 *
 * Diferente de createIsolatedContext:
 * - SEMPRE cria uma nova página
 * - NÃO usa a página persistente
 * - FECHA a página após o uso
 *
 * Ideal para scrapes de inbound que podem rodar em paralelo
 * sem interferir com scrape-users ou outras operações.
 */
export async function createDedicatedPage(): Promise<{
  page: Page;
  requestId: string;
  cleanup: () => Promise<void>;
}> {
  // Garantir que browser principal está autenticado
  await ensureLoggedSession();

  const browser = getBrowserInstance();
  if (!browser) {
    throw new Error('Browser não inicializado.');
  }

  const requestId = `dedicated_${++pageCounter}_${Date.now()}`;

  // SEMPRE criar nova página (não reutiliza)
  const page = await browser.newPage();

  console.log(`📄 [DEDICATED] Página dedicada criada: ${requestId}`);

  // 🔐 AUTENTICAR PROXY (se configurado)
  const proxyConfig = (browser as any)._currentProxyConfig;
  if (proxyConfig?.username && proxyConfig?.password) {
    await page.authenticate({
      username: proxyConfig.username,
      password: proxyConfig.password
    });
    console.log(`   🔐 Proxy autenticado: ${proxyConfig.username}@${proxyConfig.host}`);
  }

  // 🕵️ APLICAR STEALTH
  await applyFullStealth(page);

  // ✅ NAVEGAR para instagram.com
  await page.goto('https://www.instagram.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  }).catch(() => {});

  // Carregar cookies
  if (fs.existsSync(COOKIES_FILE)) {
    try {
      const cookiesData = fs.readFileSync(COOKIES_FILE, 'utf8');
      const cookies = JSON.parse(cookiesData);
      if (Array.isArray(cookies) && cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log(`   🔑 ${cookies.length} cookies aplicados à página dedicada ${requestId}`);
      }
    } catch (error: any) {
      console.warn(`   ⚠️  Erro ao carregar cookies: ${error.message}`);
    }
  }

  // Armazenar para tracking (mas NÃO como persistente)
  const managedPage: ManagedPage = {
    page,
    createdAt: Date.now(),
    requestId
  };
  activePages.set(requestId, managedPage);

  // Função de cleanup que REALMENTE fecha a página
  const cleanup = async () => {
    try {
      if (!page.isClosed()) {
        await page.close();
        console.log(`🗑️  [DEDICATED] Página ${requestId} fechada`);
      }
    } catch (err: any) {
      console.warn(`⚠️  Erro ao fechar página dedicada: ${err.message}`);
    } finally {
      activePages.delete(requestId);
    }
  };

  return { page, requestId, cleanup };
}

/**
 * Limpa uma página específica
 */
async function cleanupPage(requestId: string): Promise<void> {
  const managed = activePages.get(requestId);
  if (!managed) {
    return;
  }

  try {
    // Fechar página
    if (!managed.page.isClosed()) {
      await managed.page.close().catch((err) => {
        console.warn(`   ⚠️  Erro ao fechar página ${requestId}: ${err.message}`);
      });
    }

    const lifespan = Date.now() - managed.createdAt;
    console.log(`🗑️  Página ${requestId} limpa (vida: ${(lifespan / 1000).toFixed(1)}s)`);
  } catch (error: any) {
    console.warn(`⚠️  Erro geral ao limpar página ${requestId}: ${error.message}`);
  } finally {
    activePages.delete(requestId);
  }
}

/**
 * 🆕 Força fechamento da página persistente (para erros críticos como 429)
 */
export async function forceClosePersistentPage(): Promise<void> {
  if (persistentPage) {
    try {
      if (!persistentPage.isClosed()) {
        await persistentPage.close();
        console.log(`🗑️  Página persistente ${persistentRequestId} fechada forçadamente`);
      }
    } catch (err: any) {
      console.warn(`⚠️  Erro ao fechar página persistente: ${err.message}`);
    }
    persistentPage = null;
    persistentRequestId = null;
  }
}

/**
 * 🔧 FIX: Reseta estado da página persistente SEM tentar fechar
 * Use quando o browser já foi fechado externamente (crash, closeBrowser, etc)
 * Evita erros de "detached frame" ao tentar fechar página de browser morto
 */
export function resetPersistentPageState(): void {
  if (persistentPage) {
    console.log(`🔄 Resetando estado da página persistente ${persistentRequestId} (browser já fechado)`);
    // Remover do Map se ainda estiver lá
    if (persistentRequestId) {
      activePages.delete(persistentRequestId);
    }
    persistentPage = null;
    persistentRequestId = null;
  }
}

/**
 * Limpa todas as páginas ativas (útil para shutdown graceful)
 */
export async function cleanupAllContexts(): Promise<void> {
  console.log(`🧹 Limpando ${activePages.size} páginas ativas...`);

  // 🆕 TAMBÉM LIMPAR PÁGINA PERSISTENTE
  await forceClosePersistentPage();

  const cleanupPromises = Array.from(activePages.keys()).map(requestId =>
    cleanupPage(requestId)
  );

  await Promise.allSettled(cleanupPromises);
  activePages.clear();

  console.log('✅ Todas as páginas limpas');
}

/**
 * Retorna estatísticas das páginas ativas
 * 🔧 FIX: Agora verifica se as páginas ainda estão realmente abertas
 */
export function getContextStats(): {
  activeCount: number;
  contexts: Array<{ requestId: string; ageSeconds: number; isOpen: boolean }>;
} {
  const now = Date.now();
  const contexts = Array.from(activePages.values()).map(ctx => ({
    requestId: ctx.requestId,
    ageSeconds: (now - ctx.createdAt) / 1000,
    isOpen: !ctx.page.isClosed()
  }));

  // Contar apenas páginas realmente abertas
  const openCount = contexts.filter(c => c.isOpen).length;

  return {
    activeCount: openCount,
    contexts
  };
}

/**
 * 🔧 FIX: Sincroniza o Map com o estado real do browser
 * Remove entradas de páginas que foram fechadas externamente
 */
export async function syncContextsWithBrowser(): Promise<number> {
  const closedIds: string[] = [];

  for (const [requestId, managed] of activePages.entries()) {
    if (managed.page.isClosed()) {
      closedIds.push(requestId);
    }
  }

  if (closedIds.length > 0) {
    console.log(`🔄 Sincronizando: removendo ${closedIds.length} páginas fechadas do tracking...`);
    for (const id of closedIds) {
      activePages.delete(id);
      // Se era a página persistente, limpar referência
      if (id === persistentRequestId) {
        persistentPage = null;
        persistentRequestId = null;
      }
    }
  }

  return closedIds.length;
}

/**
 * Limpa páginas antigas (older than maxAgeMs)
 */
export async function cleanupStaleContexts(maxAgeMs: number = 600000): Promise<number> {
  const now = Date.now();
  const staleIds: string[] = [];

  for (const [requestId, managed] of activePages.entries()) {
    if (now - managed.createdAt > maxAgeMs) {
      staleIds.push(requestId);
    }
  }

  if (staleIds.length > 0) {
    console.log(`🧹 Limpando ${staleIds.length} páginas obsoletas (>${maxAgeMs}ms)...`);
    await Promise.allSettled(staleIds.map(id => cleanupPage(id)));
  }

  return staleIds.length;
}

// ============================================
// REFRESH ACCOUNT - CONTA DEDICADA ISOLADA
// ============================================

/**
 * Browser e página dedicados para a conta de refresh
 * Completamente isolados do pool de rotação
 */
let refreshBrowser: Browser | null = null;
let refreshPage: Page | null = null;
let refreshRequestId: string | null = null;

const REFRESH_COOKIES_FILE = path.join(process.cwd(), 'cookies', 'refresh', 'instagram-cookies.json');
const REFRESH_USER_DATA_DIR = path.join(process.cwd(), 'cookies', 'refresh', 'user-data');

/**
 * 🆕 Cria contexto DEDICADO para conta de REFRESH
 *
 * ISOLAMENTO TOTAL:
 * - Browser separado do pool de rotação
 * - Cookies em pasta separada (cookies/refresh/)
 * - Credenciais fixas (INSTAGRAM_REFRESH_*)
 * - Não interfere com scrape-tag ou scrape-users normal
 *
 * Ideal para:
 * - Refresh noturno de leads expirados
 * - Scrapes que não devem competir com o pool principal
 */
export async function createRefreshContext(): Promise<{
  page: Page;
  requestId: string;
  cleanup: () => Promise<void>;
}> {
  const puppeteer = await import('puppeteer');

  // Verificar se já existe browser de refresh válido
  if (refreshBrowser && refreshBrowser.isConnected()) {
    // Verificar se página está válida
    if (refreshPage && !refreshPage.isClosed()) {
      try {
        await refreshPage.evaluate(() => window.location.href);
        console.log(`♻️  [REFRESH] Reutilizando sessão existente: ${refreshRequestId}`);
        return {
          page: refreshPage,
          requestId: refreshRequestId!,
          cleanup: async () => {
            try {
              // Salvar cookies antes de fechar
              if (refreshPage && !refreshPage.isClosed()) {
                const cookies = await refreshPage.cookies();
                const cookiesDir = path.dirname(REFRESH_COOKIES_FILE);
                if (!fs.existsSync(cookiesDir)) {
                  fs.mkdirSync(cookiesDir, { recursive: true });
                }
                fs.writeFileSync(REFRESH_COOKIES_FILE, JSON.stringify(cookies, null, 2));
                console.log(`   💾 [REFRESH] ${cookies.length} cookies salvos`);
              }
            } catch (e: any) {
              console.warn(`   ⚠️  [REFRESH] Erro ao salvar cookies: ${e.message}`);
            }
            // Fechar browser
            await closeRefreshBrowser();
          }
        };
      } catch {
        console.log(`⚠️  [REFRESH] Página inválida, recriando...`);
        try { await refreshPage.close(); } catch {}
        refreshPage = null;
      }
    }
  } else {
    // Browser não existe ou desconectado - criar novo
    if (refreshBrowser) {
      try { await refreshBrowser.close(); } catch {}
    }
    refreshBrowser = null;
    refreshPage = null;
    refreshRequestId = null;
  }

  // Criar diretório de user-data se não existir
  if (!fs.existsSync(REFRESH_USER_DATA_DIR)) {
    fs.mkdirSync(REFRESH_USER_DATA_DIR, { recursive: true });
    console.log(`📁 [REFRESH] Criado diretório: ${REFRESH_USER_DATA_DIR}`);
  }

  // Criar novo browser dedicado para refresh
  if (!refreshBrowser || !refreshBrowser.isConnected()) {
    console.log(`🚀 [REFRESH] Iniciando browser dedicado para conta de refresh...`);

    refreshBrowser = await puppeteer.default.launch({
      headless: false,
      userDataDir: REFRESH_USER_DATA_DIR,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,720'
      ],
      defaultViewport: { width: 1280, height: 720 }
    });

    console.log(`✅ [REFRESH] Browser dedicado iniciado`);
  }

  // Criar página
  const pages = await refreshBrowser.pages();
  refreshPage = pages[0] || await refreshBrowser.newPage();
  refreshRequestId = `refresh_${++pageCounter}_${Date.now()}`;

  console.log(`📄 [REFRESH] Página criada: ${refreshRequestId}`);

  // Aplicar stealth
  await applyFullStealth(refreshPage);

  // Navegar para Instagram
  await refreshPage.goto('https://www.instagram.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  }).catch(() => {});

  // Carregar cookies se existirem
  if (fs.existsSync(REFRESH_COOKIES_FILE)) {
    try {
      const cookiesData = fs.readFileSync(REFRESH_COOKIES_FILE, 'utf8');
      const cookies = JSON.parse(cookiesData);
      if (Array.isArray(cookies) && cookies.length > 0) {
        await refreshPage.setCookie(...cookies);
        console.log(`   🔑 [REFRESH] ${cookies.length} cookies aplicados`);
      }
    } catch (error: any) {
      console.warn(`   ⚠️  [REFRESH] Erro ao carregar cookies: ${error.message}`);
    }
  }

  // Verificar se está logado (via cookies - igual sistema principal)
  await refreshPage.goto('https://www.instagram.com/', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  const cookies = await refreshPage.cookies();
  const hasSessionId = cookies.some(cookie => cookie.name === 'sessionid' && cookie.value);
  const hasDsUserId = cookies.some(cookie => cookie.name === 'ds_user_id' && cookie.value);
  const isLogged = hasSessionId && hasDsUserId;

  if (!isLogged) {
    console.log(`🔐 [REFRESH] Não logado - iniciando login com conta de refresh...`);

    const username = process.env.INSTAGRAM_REFRESH_USERNAME;
    const password = process.env.INSTAGRAM_REFRESH_PASSWORD;

    if (!username || !password) {
      throw new Error('[REFRESH] Credenciais INSTAGRAM_REFRESH_* não configuradas no .env');
    }

    // Navegar para login
    await refreshPage.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'networkidle2',
      timeout: 120000
    }).catch(() => {});

    // ⚠️ Instagram usa seletores dinâmicos - usar múltiplas estratégias (igual performAutoLogin)
    const usernameSelector = 'input[type="text"], input[name="username"], input[autocomplete="username"]';
    const passwordSelector = 'input[type="password"], input[name="password"], input[autocomplete="current-password"]';

    // Aguardar campos de login com timeout maior
    await refreshPage.waitForSelector(usernameSelector, { timeout: 20000 });
    await refreshPage.waitForSelector(passwordSelector, { timeout: 20000 });

    // Limpar campos antes de preencher
    await refreshPage.evaluate((userSel: string, passSel: string) => {
      const userInput = document.querySelector(userSel) as HTMLInputElement;
      const passInput = document.querySelector(passSel) as HTMLInputElement;
      if (userInput) userInput.value = '';
      if (passInput) passInput.value = '';
    }, usernameSelector, passwordSelector);

    // 🕵️ STEALTH: Digitar como humano (delay entre caracteres)
    const humanDelay = () => new Promise(r => setTimeout(r, 400 + Math.random() * 200));
    await humanDelay();

    // Digitar username caractere por caractere
    await refreshPage.click(usernameSelector);
    for (const char of username) {
      await refreshPage.keyboard.type(char);
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    }

    await humanDelay();

    // Digitar password caractere por caractere
    await refreshPage.click(passwordSelector);
    for (const char of password) {
      await refreshPage.keyboard.type(char);
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    }

    // ⚠️ Botão agora é div com texto "Log in" - usar múltiplas estratégias
    await humanDelay();
    const clicked = await refreshPage.evaluate(() => {
      // Tentar encontrar botão por texto "Log in" ou "Entrar"
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      const loginBtn = buttons.find(btn => {
        const text = btn.textContent?.trim().toLowerCase() || '';
        return text === 'log in' || text === 'entrar';
      }) as HTMLElement;

      if (loginBtn) {
        loginBtn.click();
        return true;
      }

      // Fallback: tentar button[type="submit"]
      const submitBtn = document.querySelector('button[type="submit"]') as HTMLElement;
      if (submitBtn) {
        submitBtn.click();
        return true;
      }

      return false;
    });

    if (!clicked) {
      console.log('   ⚠️  [REFRESH] Botão de login não encontrado - tentando Enter');
      await refreshPage.keyboard.press('Enter');
    }

    console.log(`   ⏳ [REFRESH] Aguardando login... (pode precisar verificação manual)`);

    // Aguardar login (até 90 segundos com polling via cookies)
    const deadline = Date.now() + 90000;
    let loggedAfterLogin = false;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
      const cookiesAfter = await refreshPage.cookies();
      const hasSession = cookiesAfter.some(c => c.name === 'sessionid' && c.value);
      const hasUserId = cookiesAfter.some(c => c.name === 'ds_user_id' && c.value);
      loggedAfterLogin = hasSession && hasUserId;
      if (loggedAfterLogin) break;
    }

    if (loggedAfterLogin) {
      console.log(`   ✅ [REFRESH] Login bem-sucedido!`);

      // Salvar cookies
      const cookies = await refreshPage.cookies();
      const cookiesDir = path.dirname(REFRESH_COOKIES_FILE);
      if (!fs.existsSync(cookiesDir)) {
        fs.mkdirSync(cookiesDir, { recursive: true });
      }
      fs.writeFileSync(REFRESH_COOKIES_FILE, JSON.stringify(cookies, null, 2));
      console.log(`   💾 [REFRESH] ${cookies.length} cookies salvos`);
    } else {
      throw new Error('[REFRESH] Falha no login - verifique credenciais ou faça login manual');
    }
  } else {
    console.log(`✅ [REFRESH] Sessão válida encontrada`);
  }

  // Cleanup function - salva cookies e fecha browser
  const cleanup = async () => {
    try {
      // Salvar cookies antes de fechar
      if (refreshPage && !refreshPage.isClosed()) {
        const cookies = await refreshPage.cookies();
        const cookiesDir = path.dirname(REFRESH_COOKIES_FILE);
        if (!fs.existsSync(cookiesDir)) {
          fs.mkdirSync(cookiesDir, { recursive: true });
        }
        fs.writeFileSync(REFRESH_COOKIES_FILE, JSON.stringify(cookies, null, 2));
        console.log(`   💾 [REFRESH] ${cookies.length} cookies salvos`);
      }
    } catch (e: any) {
      console.warn(`   ⚠️  [REFRESH] Erro ao salvar cookies: ${e.message}`);
    }

    // Fechar browser
    await closeRefreshBrowser();
  };

  return { page: refreshPage, requestId: refreshRequestId, cleanup };
}

/**
 * Fecha o browser de refresh completamente
 */
export async function closeRefreshBrowser(): Promise<void> {
  if (refreshPage && !refreshPage.isClosed()) {
    try { await refreshPage.close(); } catch {}
  }
  if (refreshBrowser && refreshBrowser.isConnected()) {
    try { await refreshBrowser.close(); } catch {}
  }
  refreshBrowser = null;
  refreshPage = null;
  refreshRequestId = null;
  console.log(`🛑 [REFRESH] Browser de refresh fechado`);
}


