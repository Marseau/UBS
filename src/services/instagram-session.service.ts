// @ts-nocheck - puppeteer contexts usam DOM APIs sem typings fortes
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { getAccountRotation } from './instagram-account-rotation.service';

// 🥷 STEALTH MODE: Esconde que é Puppeteer do Instagram
puppeteer.use(StealthPlugin());

// 🔄 ROTAÇÃO DE CONTAS: Arquivo de cookies agora é dinâmico baseado na conta ativa
function getCookiesFile(): string {
  const rotation = getAccountRotation();
  const currentAccount = rotation.getCurrentAccount();
  return currentAccount.cookiesFile;
}
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
  }, puppeteer);
}

async function loadCookies(page: Page): Promise<boolean> {
  const cookiesFile = getCookiesFile();
  if (!fs.existsSync(cookiesFile)) {
    return false;
  }

  try {
    const data = fs.readFileSync(cookiesFile, 'utf8');
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
    const cookiesFile = getCookiesFile();
    fs.writeFileSync(cookiesFile, JSON.stringify(cookies, null, 2));
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
  // Estratégia 1: Ler cookie ds_user (mais rápido)
  try {
    const cookies = await page.cookies();
    const dsUserCookie = cookies.find(cookie => cookie.name === 'ds_user');
    if (dsUserCookie?.value) {
      console.log(`   ✅ Username detectado via cookie ds_user: ${dsUserCookie.value}`);
      return dsUserCookie.value;
    }
  } catch (error: any) {
    console.warn(`⚠️  Erro ao ler cookie ds_user: ${error.message}`);
  }

  // Estratégia 2: Garantir que estamos na página do Instagram e tentar ler do DOM
  try {
    const currentUrl = page.url();
    if (!currentUrl.includes('instagram.com')) {
      console.log('   🌐 Navegando para Instagram para detectar username...');
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await humanDelay(1500, 800);
    }

    const usernameFromDOM = await page.evaluate(() => {
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

    if (usernameFromDOM) {
      console.log(`   ✅ Username detectado via DOM: ${usernameFromDOM}`);
      return usernameFromDOM;
    }
  } catch (error: any) {
    console.warn(`⚠️  Erro ao detectar usuário logado via DOM: ${error.message}`);
  }

  // Estratégia 3: Tentar extrair do HTML da página (fallback final)
  try {
    const html = await page.content();
    const usernameMatch = html.match(/"username":"([^"]+)"/);
    if (usernameMatch && usernameMatch[1]) {
      // Validar que não é um username genérico ou de outro perfil
      const username = usernameMatch[1];
      if (username && !username.includes('instagram') && username.length > 2) {
        console.log(`   ✅ Username detectado via JSON no HTML: ${username}`);
        return username;
      }
    }
  } catch (error: any) {
    console.warn(`⚠️  Erro ao extrair username do HTML: ${error.message}`);
  }

  return null;
}

async function performAutoLogin(page: Page): Promise<boolean> {
  // 🔄 ROTAÇÃO DE CONTAS: Usar credenciais da conta ativa
  const rotation = getAccountRotation();
  const currentAccount = rotation.getCurrentAccount();
  const username = currentAccount.username;
  const password = currentAccount.password;

  if (!username || !password) {
    console.log('⚠️  Credenciais não encontradas no sistema de rotação');
    return false;
  }

  console.log(`🤖 Tentando login automático com conta: ${username}`);

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
      // ⚠️ TEMPORÁRIO: Permitir continuar mesmo sem detectar username
      // Usar username da conta ativa do sistema de rotação
      const rotation = getAccountRotation();
      const currentAccount = rotation.getCurrentAccount();
      loggedUsername = currentAccount.username;

      console.warn('⚠️  Não foi possível detectar username do DOM/cookies');
      console.warn(`   Usando username da rotação: ${loggedUsername}`);
      console.warn('   O scraping continuará normalmente');
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

  if (options.clearCookies) {
    try {
      // Limpar cookies de TODAS as contas configuradas
      const cookiesDir = path.join(process.cwd(), 'cookies');
      const cookieFiles = [
        path.join(cookiesDir, 'instagram-cookies-account1.json'),
        path.join(cookiesDir, 'instagram-cookies-account2.json')
      ];

      for (const cookieFile of cookieFiles) {
        if (fs.existsSync(cookieFile)) {
          fs.unlinkSync(cookieFile);
          console.log(`🗑️  Cookies deletados: ${path.basename(cookieFile)}`);
        }
      }
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
