// @ts-nocheck - puppeteer contexts usam DOM APIs sem typings fortes
import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

const COOKIES_FILE = path.join(process.cwd(), 'instagram-cookies.json');
const LOGIN_TIMEOUT_MS = Number(process.env.INSTAGRAM_LOGIN_TIMEOUT_MS ?? 90000);
const LOGIN_POLL_INTERVAL_MS = Number(process.env.INSTAGRAM_LOGIN_POLL_INTERVAL_MS ?? 5000);
const HEADLESS_ENABLED = process.env.INSTAGRAM_SCRAPER_HEADLESS === 'true';

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

  console.log(`🌐 Iniciando browser Puppeteer (headless=${HEADLESS_ENABLED})...`);
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
      console.log(`🔑 Cookies carregados (${cookies.length})`);
      return true;
    }
  } catch (error: any) {
    console.warn(`⚠️  Falha ao carregar cookies: ${error.message}`);
  }

  return false;
}

async function saveCookies(page: Page): Promise<void> {
  try {
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log('💾 Cookies salvos');
  } catch (error: any) {
    console.warn(`⚠️  Falha ao salvar cookies: ${error.message}`);
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
    console.warn(`⚠️  Erro ao verificar sessão do Instagram: ${error.message}`);
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
    console.warn(`⚠️  Erro ao ler cookie ds_user: ${error.message}`);
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
    console.warn(`⚠️  Erro ao detectar usuário logado via DOM: ${error.message}`);
    return null;
  }
}

async function performAutoLogin(page: Page): Promise<boolean> {
  const username = process.env.INSTAGRAM_USERNAME;
  const password = process.env.INSTAGRAM_PASSWORD;

  if (!username || !password) {
    return false;
  }

  console.log('🔐 Tentando login automático com variáveis de ambiente...');

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
        console.log('✅ Login automático concluído');
        return true;
      }
    }

    console.warn('⚠️  Login automático não confirmou sessão');
    return false;
  } catch (error: any) {
    console.error(`❌ Falha no login automático: ${error.message}`);
    return false;
  }
}

async function waitForManualLogin(page: Page): Promise<void> {
  if (HEADLESS_ENABLED) {
    throw new Error('Modo headless ativo exige INSTAGRAM_USERNAME e INSTAGRAM_PASSWORD para login automático.');
  }

  console.log('');
  console.log('🔐 ============================================');
  console.log('🔐 LOGIN NECESSÁRIO NO INSTAGRAM');
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
      console.log('✅ Login manual detectado');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, LOGIN_POLL_INTERVAL_MS));
  }

  throw new Error('Tempo excedido para login manual no Instagram.');
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

export async function ensureLoggedSession(): Promise<void> {
  if (sessionInitialization) {
    await sessionInitialization;
    return;
  }

  sessionInitialization = (async () => {
    await ensureBrowserInstance();

    if (!browserInstance) {
      throw new Error('Não foi possível inicializar o browser do Instagram.');
    }

    if (!sessionPage || sessionPage.isClosed()) {
      const pages = await browserInstance.pages();
      sessionPage = pages[0] || await browserInstance.newPage();
      console.log('📄 Instância principal da sessão pronta');
    }

    let loggedIn = false;
    const cookiesLoaded = await loadCookies(sessionPage);

    if (cookiesLoaded) {
      console.log('🔍 Verificando sessão recuperada de cookies...');
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
      throw new Error('Não foi possível autenticar no Instagram.');
    }

    await saveCookies(sessionPage);
    loggedUsername = await detectLoggedInUsername(sessionPage);

    if (loggedUsername) {
      console.log(`👤 Usuário autenticado: @${loggedUsername}`);
    } else {
      console.log('⚠️  Não foi possível detectar o username logado.');
    }

    // ⚠️ IMPORTANTE: Fechar sessionPage após login para reduzir abas abertas
    // Os contexts isolados copiam os cookies e não precisam do sessionPage aberto
    console.log('🔒 Fechando sessionPage após login (contexts usarão cookies)');
    if (sessionPage && !sessionPage.isClosed()) {
      await sessionPage.close().catch(() => {});
    }
  })()
    .catch(async (error) => {
      console.error(`❌ Falha ao garantir sessão do Instagram: ${error.message}`);
      await cleanupOnFailure();
      throw error;
    })
    .finally(() => {
      sessionInitialization = null;
    });

  await sessionInitialization;
}

export async function createAuthenticatedPage(): Promise<Page> {
  await ensureLoggedSession();

  if (!browserInstance) {
    throw new Error('Browser não inicializado.');
  }

  const page = await browserInstance.newPage();

  if (sessionPage && !sessionPage.isClosed()) {
    try {
      const cookies = await sessionPage.cookies();
      if (cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log(`🔑 Cookies aplicados na nova página (${cookies.length})`);
      }
    } catch (error: any) {
      console.warn(`⚠️  Não foi possível copiar cookies para nova página: ${error.message}`);
    }
  }

  return page;
}

export async function closeBrowser(options: { clearCookies?: boolean } = {}): Promise<void> {
  if (browserInstance) {
    try {
      const pages = await browserInstance.pages();
      for (const page of pages) {
        if (!page.isClosed()) {
          await page.close().catch(() => {});
        }
      }
    } catch (error: any) {
      console.warn(`⚠️  Erro ao fechar páginas: ${error.message}`);
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
      console.log('🗑️  Cookies deletados');
    } catch (error: any) {
      console.warn(`⚠️  Erro ao remover cookies: ${error.message}`);
    }
  }
}

export function getSessionPage(): Page | null {
  return sessionPage;
}

export function getBrowserInstance(): Browser | null {
  return browserInstance;
}

export function getLoggedUsername(): string | null {
  return loggedUsername;
}

export function setLoggedUsername(username: string | null): void {
  loggedUsername = username;
}

export function resetSessionState(): void {
  browserInstance = null;
  sessionPage = null;
  sessionInitialization = null;
  loggedUsername = null;
  console.log('🔄 Session state resetado completamente');
}
