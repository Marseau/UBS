// @ts-nocheck - puppeteer contexts usam DOM APIs sem typings fortes
import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

// ARQUIVO DE COOKIES SEPARADO PARA CONTA OFICIAL (@ubs.sistemas)
// NÃO CONFUNDIR COM instagram-cookies.json (scraping)
const COOKIES_FILE = path.join(process.cwd(), 'instagram-official-cookies.json');
const LOGIN_TIMEOUT_MS = Number(process.env.INSTAGRAM_LOGIN_TIMEOUT_MS ?? 90000);
const LOGIN_POLL_INTERVAL_MS = Number(process.env.INSTAGRAM_LOGIN_POLL_INTERVAL_MS ?? 5000);
const HEADLESS_ENABLED = process.env.INSTAGRAM_OFFICIAL_HEADLESS === 'true';

const DEFAULT_BROWSER_ARGS = ['--start-maximized'];
const ENV_BROWSER_ARGS = (process.env.INSTAGRAM_BROWSER_ARGS || '')
  .split(',')
  .map(arg => arg.trim())
  .filter(Boolean);

let browserInstance: Browser | null = null;
let sessionPage: Page | null = null;
let sessionInitialization: Promise<void> | null = null;
let loggedUsername: string | null = null;

async function humanDelay(base = 1000, variance = 1000): Promise<void> {
  const delay = base + Math.random() * variance;
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function ensureBrowserInstance(): Promise<void> {
  if (browserInstance && browserInstance.isConnected()) {
    return;
  }

  const headlessOption: boolean | 'new' = HEADLESS_ENABLED ? 'new' : false;
  const args = ENV_BROWSER_ARGS.length > 0 ? ENV_BROWSER_ARGS : DEFAULT_BROWSER_ARGS;

  console.log(`🌐 [OFICIAL] Iniciando browser Puppeteer (headless=${HEADLESS_ENABLED})...`);
  browserInstance = await puppeteer.launch({
    headless: headlessOption,
    defaultViewport: null,
    args
  });
}

async function loadCookies(page: Page): Promise<boolean> {
  if (!fs.existsSync(COOKIES_FILE)) {
    return false;
  }

  try {
    const data = fs.readFileSync(COOKIES_FILE, 'utf8');
    const cookies = JSON.parse(data);
    if (Array.isArray(cookies) && cookies.length > 0) {
      await page.setCookie(...cookies);
      console.log(`🔑 [OFICIAL] Cookies carregados (${cookies.length})`);
      return true;
    }
  } catch (error: any) {
    console.warn(`⚠️  [OFICIAL] Falha ao carregar cookies: ${error.message}`);
  }

  return false;
}

async function saveCookies(page: Page): Promise<void> {
  try {
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log('💾 [OFICIAL] Cookies salvos');
  } catch (error: any) {
    console.warn(`⚠️  [OFICIAL] Falha ao salvar cookies: ${error.message}`);
  }
}

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    if (page.isClosed()) {
      return false;
    }

    const currentUrl = page.url();
    if (!currentUrl.includes('instagram.com')) {
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
      await humanDelay(800, 400);
    }

    const cookies = await page.cookies();
    return cookies.some(cookie => cookie.name === 'sessionid' && cookie.value);
  } catch (error: any) {
    console.warn(`⚠️  [OFICIAL] Erro ao verificar sessão do Instagram: ${error.message}`);
    return false;
  }
}

async function detectLoggedInUsername(page: Page): Promise<string | null> {
  try {
    const cookies = await page.cookies();
    const dsUserCookie = cookies.find(cookie => cookie.name === 'ds_user');
    if (dsUserCookie?.value) {
      return dsUserCookie.value;
    }
  } catch (error: any) {
    console.warn(`⚠️  [OFICIAL] Erro ao ler cookie ds_user: ${error.message}`);
  }

  try {
    return await page.evaluate(() => {
      const profileIcon = document.querySelector<SVGElement>('svg[aria-label="Perfil"], svg[aria-label="Profile"]');
      const profileLink = profileIcon ? profileIcon.closest<HTMLAnchorElement>('a[href^="/"][href$="/"]') : null;
      const href = profileLink?.getAttribute('href');
      if (href) {
        const parts = href.split('/').filter(Boolean);
        if (parts.length === 1) {
          return parts[0];
        }
      }

      const navLinks = Array.from(document.querySelectorAll('nav a[href^="/"][href$="/"]'));
      for (const link of navLinks) {
        const linkHref = link.getAttribute('href');
        if (!linkHref) continue;
        const parts = linkHref.split('/').filter(Boolean);
        if (parts.length === 1) {
          return parts[0];
        }
      }

      return null;
    });
  } catch (error: any) {
    console.warn(`⚠️  [OFICIAL] Erro ao detectar usuário logado via DOM: ${error.message}`);
    return null;
  }
}

async function performAutoLogin(page: Page): Promise<boolean> {
  // USA CREDENCIAIS DA CONTA OFICIAL (não do scraping!)
  const username = process.env.INSTAGRAM_OFFICIAL_USERNAME;
  const password = process.env.INSTAGRAM_OFFICIAL_PASSWORD;

  if (!username || !password) {
    return false;
  }

  console.log('🔐 [OFICIAL] Tentando login automático com variáveis de ambiente...');

  try {
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'networkidle2',
      timeout: 120000
    }).catch(() => {});

    await page.waitForSelector('input[name="username"]', { timeout: 20000 });
    await page.waitForSelector('input[name="password"]', { timeout: 20000 });

    await page.evaluate(() => {
      const userInput = document.querySelector<HTMLInputElement>('input[name="username"]');
      const passInput = document.querySelector<HTMLInputElement>('input[name="password"]');
      if (userInput) userInput.value = '';
      if (passInput) passInput.value = '';
    });

    await humanDelay(400, 200);
    await page.type('input[name="username"]', username, { delay: 80 });
    await page.type('input[name="password"]', password, { delay: 80 });

    const submitSelector = 'button[type="submit"]';
    await page.click(submitSelector).catch(() => {});

    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      await humanDelay(1500, 1200);
      if (await isLoggedIn(page)) {
        console.log('✅ [OFICIAL] Login automático concluído');
        return true;
      }
    }

    console.warn('⚠️  [OFICIAL] Login automático não confirmou sessão');
    return false;
  } catch (error: any) {
    console.error(`❌ [OFICIAL] Falha no login automático: ${error.message}`);
    return false;
  }
}

async function waitForManualLogin(page: Page): Promise<void> {
  if (HEADLESS_ENABLED) {
    throw new Error('[OFICIAL] Modo headless ativo exige INSTAGRAM_OFFICIAL_USERNAME e INSTAGRAM_OFFICIAL_PASSWORD para login automático.');
  }

  console.log('');
  console.log('🔐 ============================================');
  console.log('🔐 LOGIN CONTA OFICIAL NECESSÁRIO');
  console.log('🔐 ============================================');
  console.log('🔐 O browser visível foi aberto.');
  console.log('🔐 Você tem até 90 segundos para efetuar o login manualmente.');
  console.log('🔐 Após logar, aguarde o processo continuar sozinho.');
  console.log('🔐 ============================================');
  console.log('');

  await page.goto('https://www.instagram.com/', {
    waitUntil: 'networkidle2',
    timeout: 120000
  }).catch(() => {});

  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isLoggedIn(page)) {
      console.log('✅ [OFICIAL] Login manual detectado');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, LOGIN_POLL_INTERVAL_MS));
  }

  throw new Error('[OFICIAL] Tempo excedido para login manual no Instagram.');
}

async function cleanupOnFailure(): Promise<void> {
  if (sessionPage && !sessionPage.isClosed()) {
    await sessionPage.close().catch(() => {});
  }
  sessionPage = null;

  if (browserInstance) {
    await browserInstance.close().catch(() => {});
  }
  browserInstance = null;
  loggedUsername = null;
}

export async function ensureOfficialLoggedSession(): Promise<void> {
  if (sessionInitialization) {
    await sessionInitialization;
    return;
  }

  sessionInitialization = (async () => {
    await ensureBrowserInstance();

    if (!browserInstance) {
      throw new Error('[OFICIAL] Não foi possível inicializar o browser do Instagram.');
    }

    if (!sessionPage || sessionPage.isClosed()) {
      const pages = await browserInstance.pages();
      sessionPage = pages[0] || await browserInstance.newPage();
      console.log('📄 [OFICIAL] Instância principal da sessão pronta');
    }

    let loggedIn = false;
    const cookiesLoaded = await loadCookies(sessionPage);

    if (cookiesLoaded) {
      console.log('🔍 [OFICIAL] Verificando sessão recuperada de cookies...');
      loggedIn = await isLoggedIn(sessionPage);
    }

    if (!loggedIn) {
      loggedIn = await performAutoLogin(sessionPage);
    }

    if (!loggedIn) {
      await waitForManualLogin(sessionPage);
      loggedIn = await isLoggedIn(sessionPage);
    }

    if (!loggedIn) {
      throw new Error('[OFICIAL] Não foi possível autenticar no Instagram.');
    }

    await saveCookies(sessionPage);
    loggedUsername = await detectLoggedInUsername(sessionPage);

    // VALIDAÇÃO CRÍTICA: Verificar se o usuário logado é o CORRETO
    const expectedUsername = process.env.INSTAGRAM_OFFICIAL_USERNAME;

    if (loggedUsername) {
      console.log(`👤 [OFICIAL] Usuário autenticado: @${loggedUsername}`);

      // Se não é o usuário esperado, ERRO CRÍTICO
      if (expectedUsername && loggedUsername !== expectedUsername) {
        console.error(`❌ [OFICIAL] ERRO CRÍTICO: Usuário logado (@${loggedUsername}) NÃO é o esperado (@${expectedUsername})`);
        console.error(`🔄 [OFICIAL] Fazendo logout e limpando cookies...`);

        // Fazer logout
        await sessionPage.goto('https://www.instagram.com/accounts/logout/', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await humanDelay(2000, 1000);

        // Deletar arquivo de cookies
        if (fs.existsSync(COOKIES_FILE)) {
          fs.unlinkSync(COOKIES_FILE);
          console.log(`🗑️  [OFICIAL] Cookies deletados`);
        }

        // Limpar cookies da sessão
        const client = await sessionPage.target().createCDPSession();
        await client.send('Network.clearBrowserCookies');
        await client.send('Network.clearBrowserCache');

        throw new Error(`Usuário errado logado (@${loggedUsername}). Faça login manual com @${expectedUsername} e tente novamente.`);
      }
    } else {
      console.log('⚠️  [OFICIAL] Não foi possível detectar o username logado.');
    }

    // ⚠️ IMPORTANTE: Fechar sessionPage após login para reduzir abas abertas
    // Os contexts isolados copiam os cookies e não precisam do sessionPage aberto
    console.log('🔒 [OFICIAL] Fechando sessionPage após login (contexts usarão cookies)');
    if (sessionPage && !sessionPage.isClosed()) {
      await sessionPage.close().catch(() => {});
    }
  })()
    .catch(async (error) => {
      console.error(`❌ [OFICIAL] Falha ao garantir sessão do Instagram: ${error.message}`);
      await cleanupOnFailure();
      throw error;
    })
    .finally(() => {
      sessionInitialization = null;
    });

  await sessionInitialization;
}

export async function createOfficialAuthenticatedPage(): Promise<Page> {
  await ensureOfficialLoggedSession();

  if (!browserInstance) {
    throw new Error('[OFICIAL] Browser não inicializado.');
  }

  const page = await browserInstance.newPage();

  if (sessionPage && !sessionPage.isClosed()) {
    try {
      const cookies = await sessionPage.cookies();
      if (cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log(`🔑 [OFICIAL] Cookies aplicados na nova página (${cookies.length})`);
      }
    } catch (error: any) {
      console.warn(`⚠️  [OFICIAL] Não foi possível copiar cookies para nova página: ${error.message}`);
    }
  }

  return page;
}

export async function ensureLoggedIn(page: Page): Promise<boolean> {
  return await isLoggedIn(page);
}

export async function closeOfficialBrowser(options: { clearCookies?: boolean } = {}): Promise<void> {
  if (browserInstance) {
    try {
      const pages = await browserInstance.pages();
      for (const page of pages) {
        if (!page.isClosed()) {
          await page.close().catch(() => {});
        }
      }
    } catch (error: any) {
      console.warn(`⚠️  [OFICIAL] Erro ao fechar páginas: ${error.message}`);
    }

    await browserInstance.close().catch(() => {});
  }

  browserInstance = null;
  sessionPage = null;
  sessionInitialization = null;
  loggedUsername = null;

  if (options.clearCookies && fs.existsSync(COOKIES_FILE)) {
    try {
      fs.unlinkSync(COOKIES_FILE);
      console.log('🗑️  [OFICIAL] Cookies deletados');
    } catch (error: any) {
      console.warn(`⚠️  [OFICIAL] Erro ao remover cookies: ${error.message}`);
    }
  }
}

export function getOfficialSessionPage(): Page | null {
  return sessionPage;
}

export function getOfficialBrowserInstance(): Browser | null {
  return browserInstance;
}

export function getOfficialLoggedUsername(): string | null {
  return loggedUsername;
}

export function setOfficialLoggedUsername(username: string | null): void {
  loggedUsername = username;
}

export function resetOfficialSessionState(): void {
  browserInstance = null;
  sessionPage = null;
  sessionInitialization = null;
  loggedUsername = null;
  console.log('🔄 [OFICIAL] Session state resetado completamente');
}
