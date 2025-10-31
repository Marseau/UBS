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

/**
 * Tipos de operação que determinam qual conta usar
 */
export enum OperationType {
  ENGAGEMENT = 'engagement',   // Follow, Like, Comment → Conta Oficial (@ubs.sistemas)
  SCRAPING = 'scraping'         // Lead scraping, Enriquecimento → Conta Não-Oficial
}

/**
 * Retorna o username esperado baseado no tipo de operação
 */
export function getExpectedUsername(operationType: OperationType): string {
  if (operationType === OperationType.ENGAGEMENT) {
    // Operações de engajamento usam conta oficial
    return process.env.INSTAGRAM_OFFICIAL_USERNAME || 'ubs.sistemas';
  } else {
    // Operações de scraping usam conta não-oficial
    const unofficialUsername = process.env.INSTAGRAM_UNOFFICIAL_USERNAME || 'francomarcio887@gmail.com';
    // Se for email, extrair username
    return unofficialUsername.includes('@') ? unofficialUsername.split('@')[0] : unofficialUsername;
  }
}

/**
 * Verifica se a conta logada está correta para o tipo de operação
 * Se não estiver, faz switch automático
 */
export async function ensureCorrectAccount(operationType: OperationType): Promise<string> {
  const expectedUsername = getExpectedUsername(operationType);
  const currentUsername = getOfficialLoggedUsername();

  console.log(`\n🔍 [ACCOUNT-CHECK] Operação: ${operationType}`);
  console.log(`   Conta esperada: @${expectedUsername}`);
  console.log(`   Conta atual: ${currentUsername ? '@' + currentUsername : 'não detectada'}`);

  // Se já está na conta correta, retorna
  if (currentUsername && currentUsername.toLowerCase().includes(expectedUsername.toLowerCase().split('@')[0])) {
    console.log(`   ✅ Conta correta já logada!\n`);
    return currentUsername;
  }

  // Precisa trocar de conta
  console.log(`   🔄 Precisa trocar de conta...\n`);

  if (operationType === OperationType.ENGAGEMENT) {
    // Trocar para conta oficial (ubs.sistemas)
    return await switchToOfficialAccount();
  } else {
    // Trocar para conta não-oficial (francomarcio887)
    return await switchToAlternativeAccount();
  }
}

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
  // Método 1: Cookie ds_user (mais confiável)
  try {
    const cookies = await page.cookies();
    console.log(`🔍 [OFICIAL] Total de cookies: ${cookies.length}`);

    const dsUserCookie = cookies.find(cookie => cookie.name === 'ds_user');
    if (dsUserCookie?.value) {
      console.log(`👤 [OFICIAL] Username detectado via cookie ds_user: @${dsUserCookie.value}`);
      return dsUserCookie.value;
    } else {
      console.warn(`⚠️  [OFICIAL] Cookie ds_user NÃO encontrado`);
    }
  } catch (error: any) {
    console.warn(`⚠️  [OFICIAL] Erro ao ler cookie ds_user: ${error.message}`);
  }

  // Método 2: Procurar username próximo ao botão "Switch" (top-right corner)
  try {
    console.log(`🔍 [OFICIAL] Tentando detectar via botão Switch (Método 2)...`);

    const { username, debug } = await page.evaluate(() => {
      const debugInfo: string[] = [];
      const usernameRegex = /^[a-zA-Z0-9._]{1,30}$/;

      // Procurar botão "Switch" ou "Mudar"
      const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], span'));
      debugInfo.push(`Total de elementos verificados: ${allButtons.length}`);

      for (const element of allButtons) {
        const text = element.textContent?.trim() || '';

        // Se encontrou botão "Switch" ou "Mudar"
        if (text === 'Switch' || text === 'Mudar' || text.includes('Switch') || text.includes('Mudar')) {
          debugInfo.push(`✓ Botão Switch encontrado: "${text}"`);

          // Procurar username no elemento pai ou irmãos
          let container = element.parentElement;

          // Tentar até 5 níveis acima
          for (let i = 0; i < 5 && container; i++) {
            // Procurar em todos os elementos de texto dentro do container
            const allTextElements = Array.from(container.querySelectorAll('span, div, a'));

            for (const textEl of allTextElements) {
              const candidateText = textEl.textContent?.trim() || '';

              // Ignorar o próprio botão Switch
              if (candidateText === 'Switch' || candidateText === 'Mudar') continue;

              // Verificar se é um username válido
              if (usernameRegex.test(candidateText)) {
                debugInfo.push(`✓ Username encontrado próximo ao Switch: "${candidateText}"`);
                return { username: candidateText, debug: debugInfo };
              }
            }

            container = container.parentElement;
          }

          debugInfo.push(`⚠️ Botão Switch encontrado mas nenhum username válido próximo`);
        }
      }

      debugInfo.push(`⚠️ Botão Switch não encontrado na página`);
      return { username: null, debug: debugInfo };
    });

    console.log(`🔍 [OFICIAL] Debug Método 2:\n   ${debug.join('\n   ')}`);

    if (username) {
      console.log(`👤 [OFICIAL] Username detectado próximo ao botão Switch: @${username}`);
      return username;
    } else {
      console.warn(`⚠️  [OFICIAL] Método 2 não encontrou username via botão Switch`);
    }
  } catch (error: any) {
    console.warn(`⚠️  [OFICIAL] Erro ao detectar via botão Switch: ${error.message}`);
  }

  // Método 3: JSON embutido do Instagram (viewer object)
  try {
    const username = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const script of scripts) {
        const content = script.textContent || '';

        // Procurar por "viewer":{"username":"..."}
        if (content.includes('"viewer"') && content.includes('"username"')) {
          const viewerMatch = content.match(/"viewer":\s*\{[^}]*"username":"([^"]+)"/);
          if (viewerMatch && viewerMatch[1]) {
            return viewerMatch[1];
          }
        }
      }
      return null;
    });

    if (username) {
      console.log(`👤 [OFICIAL] Username detectado via JSON viewer: @${username}`);
      return username;
    }
  } catch (error: any) {
    console.warn(`⚠️  [OFICIAL] Erro ao detectar via JSON: ${error.message}`);
  }

  console.warn('⚠️  [OFICIAL] Nenhum método conseguiu detectar o username');
  return null;
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

    // Garantir que estamos na home do Instagram
    console.log('🔄 [OFICIAL] Navegando para Instagram home...');
    await sessionPage.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await humanDelay(1000, 500);

    // Detectar e lidar com popup "Salvar informações de login?"
    console.log('🔍 [OFICIAL] Verificando popup de salvar login...');
    await humanDelay(2000, 1000);

    // Procurar botão "Agora não" ou "Not Now" via evaluate
    const popupHandled = await sessionPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const button of buttons) {
        const text = button.textContent?.trim() || '';
        if (text.includes('Agora não') || text.includes('Not Now') || text.includes('Not now')) {
          button.click();
          return true;
        }
      }
      return false;
    });

    if (popupHandled) {
      console.log('📱 [OFICIAL] Popup "Salvar informações" detectado e clicado!');
      await humanDelay(3000, 1500);
    } else {
      console.log('ℹ️  [OFICIAL] Popup de salvar login não encontrado (já foi processado ou não apareceu)');
    }

    // Aguardar navegação lateral carregar completamente
    console.log('⏳ [OFICIAL] Aguardando navegação lateral carregar...');
    await sessionPage.waitForSelector('nav', { timeout: 30000 }).catch(() => {
      console.warn('⚠️  [OFICIAL] Timeout aguardando <nav>, tentando mesmo assim...');
    });

    await humanDelay(2000, 1000);

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

/**
 * Faz logout da conta atualmente logada no Instagram
 */
export async function logoutInstagramAccount(): Promise<void> {
  try {
    console.log('🚪 [OFICIAL] Iniciando logout do Instagram...');

    await ensureBrowserInstance();
    if (!browserInstance) throw new Error('Browser não disponível');

    // Criar nova página para logout
    const page = await browserInstance.newPage();

    try {
      // Carregar cookies atuais
      await loadCookies(page);

      // Navegar para Instagram
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 });
      await humanDelay(2000, 1000);

      // Procurar e clicar no botão "More" (Mais) na sidebar
      await page.evaluate(() => {
        const moreButtons = Array.from(document.querySelectorAll('span, div'));
        for (const btn of moreButtons) {
          const text = btn.textContent?.trim() || '';
          if (text === 'More' || text === 'Mais') {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      await humanDelay(2000, 1000);

      // Procurar e clicar em "Log out" (Sair)
      const logoutClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span'));
        for (const btn of buttons) {
          const text = btn.textContent?.trim() || '';
          if (text.includes('Log out') || text.includes('Sair')) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (logoutClicked) {
        console.log('✅ [OFICIAL] Botão de logout clicado com sucesso');
        await humanDelay(3000, 1500);
      } else {
        console.warn('⚠️  [OFICIAL] Botão de logout não encontrado');
      }

      // Deletar arquivo de cookies
      if (fs.existsSync(COOKIES_FILE)) {
        fs.unlinkSync(COOKIES_FILE);
        console.log('🗑️  [OFICIAL] Arquivo de cookies deletado');
      }

      // Resetar estado
      loggedUsername = null;
      console.log('✅ [OFICIAL] Logout concluído com sucesso');

    } finally {
      await page.close();
    }

  } catch (error: any) {
    console.error(`❌ [OFICIAL] Erro ao fazer logout: ${error.message}`);
    throw error;
  }
}

/**
 * Troca de conta: faz logout da conta atual e login com credenciais alternativas
 */
export async function switchToAlternativeAccount(): Promise<string> {
  try {
    console.log('\n🔄 [OFICIAL] Iniciando troca de conta...');

    // Fazer logout da conta atual
    await logoutInstagramAccount();

    // Resetar estado da sessão
    resetOfficialSessionState();

    // Fazer login com credenciais alternativas
    const altEmail = process.env.INSTAGRAM_ALT_EMAIL;
    const altPassword = process.env.INSTAGRAM_ALT_PASSWORD;

    if (!altEmail || !altPassword) {
      throw new Error('Credenciais alternativas não configuradas no .env');
    }

    console.log(`🔐 [OFICIAL] Fazendo login com conta alternativa: ${altEmail}`);

    await ensureBrowserInstance();
    if (!browserInstance) throw new Error('Browser não disponível');

    // Criar nova página para login
    const page = await browserInstance.newPage();

    try {
      // TENTAR usar sessão salva primeiro (se Instagram salvou as credenciais)
      console.log('🔍 [OFICIAL] Tentando acessar com sessão salva...');
      await page.goto('https://www.instagram.com/', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      await humanDelay(3000, 1500);

      // Verificar se já está logado ou se tem seletor de contas
      const currentUrl = page.url();
      const isLoggedIn = currentUrl.includes('instagram.com') && !currentUrl.includes('/accounts/login');

      if (isLoggedIn) {
        console.log('✅ [OFICIAL] Instagram detectou sessão salva! Verificando qual conta...');

        // Aguardar navegação carregar
        await humanDelay(2000, 1000);

        // Tentar detectar username
        sessionPage = page;
        const detectedUsername = await detectLoggedInUsername(page);

        if (detectedUsername) {
          // Verificar se é a conta correta (extrair username do email alternativo)
          const expectedUsername = altEmail.split('@')[0]; // "francomarcio887"

          if (detectedUsername === expectedUsername || detectedUsername.includes('marcio')) {
            loggedUsername = detectedUsername;
            console.log(`✅ [OFICIAL] Já estava logado com conta correta: @${detectedUsername}\n`);
            return detectedUsername;
          } else {
            console.log(`⚠️  [OFICIAL] Logado com conta errada (@${detectedUsername}), forçando novo login...`);
          }
        }
      }

      // Se não estava logado ou está com conta errada, fazer login manual
      console.log('🔐 [OFICIAL] Fazendo login manual com formulário...');

      // Navegar para página de login
      await page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      await humanDelay(3000, 1500);

      // Preencher email
      await page.type('input[name="username"]', altEmail, { delay: 100 });
      await humanDelay(500, 300);

      // Preencher senha
      await page.type('input[name="password"]', altPassword, { delay: 100 });
      await humanDelay(1000, 500);

      // Clicar no botão de login
      await page.click('button[type="submit"]');
      console.log('✅ [OFICIAL] Credenciais enviadas');

      // Aguardar navegação após login
      await humanDelay(5000, 2000);

      // Salvar cookies
      const cookies = await page.cookies();
      fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
      console.log('💾 [OFICIAL] Cookies da conta alternativa salvos');

      // Navegar para home
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 });

      // IMPORTANTE: Aguardar tempo suficiente para o popup aparecer
      console.log('⏳ [OFICIAL] Aguardando popup de salvar login aparecer...');
      await humanDelay(5000, 2000);

      // SEMPRE clicar em "Salvar informações" para manter os cookies
      console.log('🔍 [OFICIAL] Procurando botão "Salvar informações"...');

      const popupHandled = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const button of buttons) {
          const text = button.textContent?.trim() || '';
          // Procurar pelo botão "Salvar informações" (azul)
          if (text.includes('Salvar informações') || text.includes('Save Info') || text.includes('Save information')) {
            button.click();
            return true;
          }
        }
        return false;
      });

      if (popupHandled) {
        console.log('✅ [OFICIAL] Clicou em "Salvar informações" - cookies serão mantidos!');
        await humanDelay(3000, 1500);
      } else {
        console.log('ℹ️  [OFICIAL] Botão "Salvar informações" não encontrado (já foi processado ou não apareceu)');
      }

      // Aguardar navegação lateral carregar completamente
      console.log('⏳ [OFICIAL] Aguardando navegação lateral carregar...');
      await page.waitForSelector('nav', { timeout: 30000 }).catch(() => {
        console.warn('⚠️  [OFICIAL] Timeout aguardando <nav>, tentando mesmo assim...');
      });

      await humanDelay(2000, 1000);

      // Detectar username
      sessionPage = page;
      const detectedUsername = await detectLoggedInUsername(page);

      if (!detectedUsername) {
        throw new Error('Não foi possível detectar o username da conta alternativa após login');
      }

      loggedUsername = detectedUsername;
      console.log(`✅ [OFICIAL] Login com conta alternativa concluído: @${detectedUsername}\n`);

      return detectedUsername;

    } catch (error: any) {
      await page.close();
      throw error;
    }

  } catch (error: any) {
    console.error(`❌ [OFICIAL] Erro ao trocar de conta: ${error.message}`);
    throw error;
  }
}

/**
 * Troca de conta: volta para conta oficial (ubs.sistemas)
 */
export async function switchToOfficialAccount(): Promise<string> {
  try {
    console.log('\n🔄 [OFICIAL] Voltando para conta oficial (@ubs.sistemas)...');

    // Fazer logout da conta atual
    await logoutInstagramAccount();

    // Resetar estado da sessão
    resetOfficialSessionState();

    // Fazer login com credenciais oficiais
    const officialUsername = process.env.INSTAGRAM_OFFICIAL_USERNAME;
    const officialPassword = process.env.INSTAGRAM_OFFICIAL_PASSWORD;

    if (!officialUsername || !officialPassword) {
      throw new Error('Credenciais oficiais não configuradas no .env');
    }

    console.log(`🔐 [OFICIAL] Fazendo login com conta oficial: ${officialUsername}`);

    await ensureBrowserInstance();
    if (!browserInstance) throw new Error('Browser não disponível');

    // Criar nova página para login
    const page = await browserInstance.newPage();

    try {
      // TENTAR usar sessão salva primeiro (se Instagram salvou as credenciais)
      console.log('🔍 [OFICIAL] Tentando acessar com sessão salva...');
      await page.goto('https://www.instagram.com/', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      await humanDelay(3000, 1500);

      // Verificar se já está logado ou se tem seletor de contas
      const currentUrl = page.url();
      const isLoggedIn = currentUrl.includes('instagram.com') && !currentUrl.includes('/accounts/login');

      if (isLoggedIn) {
        console.log('✅ [OFICIAL] Instagram detectou sessão salva! Verificando qual conta...');

        // Aguardar navegação carregar
        await humanDelay(2000, 1000);

        // Tentar detectar username
        sessionPage = page;
        const detectedUsername = await detectLoggedInUsername(page);

        if (detectedUsername) {
          // Verificar se é a conta correta
          if (detectedUsername === officialUsername || detectedUsername.includes('ubs')) {
            loggedUsername = detectedUsername;
            console.log(`✅ [OFICIAL] Já estava logado com conta oficial: @${detectedUsername}\n`);
            return detectedUsername;
          } else {
            console.log(`⚠️  [OFICIAL] Logado com conta errada (@${detectedUsername}), forçando novo login...`);
          }
        }
      }

      // Se não estava logado ou está com conta errada, fazer login manual
      console.log('🔐 [OFICIAL] Fazendo login manual com formulário...');

      // Navegar para página de login
      await page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      await humanDelay(3000, 1500);

      // Preencher username
      await page.type('input[name="username"]', officialUsername, { delay: 100 });
      await humanDelay(500, 300);

      // Preencher senha
      await page.type('input[name="password"]', officialPassword, { delay: 100 });
      await humanDelay(1000, 500);

      // Clicar no botão de login
      await page.click('button[type="submit"]');
      console.log('✅ [OFICIAL] Credenciais enviadas');

      // Aguardar navegação após login
      await humanDelay(5000, 2000);

      // Salvar cookies
      const cookies = await page.cookies();
      fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
      console.log('💾 [OFICIAL] Cookies da conta oficial salvos');

      // Navegar para home
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 });

      // IMPORTANTE: Aguardar tempo suficiente para o popup aparecer
      console.log('⏳ [OFICIAL] Aguardando popup de salvar login aparecer...');
      await humanDelay(5000, 2000);

      // SEMPRE clicar em "Salvar informações" para manter os cookies
      console.log('🔍 [OFICIAL] Procurando botão "Salvar informações"...');

      const popupHandled = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const button of buttons) {
          const text = button.textContent?.trim() || '';
          // Procurar pelo botão "Salvar informações" (azul)
          if (text.includes('Salvar informações') || text.includes('Save Info') || text.includes('Save information')) {
            button.click();
            return true;
          }
        }
        return false;
      });

      if (popupHandled) {
        console.log('✅ [OFICIAL] Clicou em "Salvar informações" - cookies serão mantidos!');
        await humanDelay(3000, 1500);
      } else {
        console.log('ℹ️  [OFICIAL] Botão "Salvar informações" não encontrado (já foi processado ou não apareceu)');
      }

      // Aguardar navegação lateral carregar completamente
      console.log('⏳ [OFICIAL] Aguardando navegação lateral carregar...');
      await page.waitForSelector('nav', { timeout: 30000 }).catch(() => {
        console.warn('⚠️  [OFICIAL] Timeout aguardando <nav>, tentando mesmo assim...');
      });

      await humanDelay(2000, 1000);

      // Detectar username
      sessionPage = page;
      const detectedUsername = await detectLoggedInUsername(page);

      if (!detectedUsername) {
        throw new Error('Não foi possível detectar o username da conta oficial após login');
      }

      loggedUsername = detectedUsername;
      console.log(`✅ [OFICIAL] Login com conta oficial concluído: @${detectedUsername}\n`);

      return detectedUsername;

    } catch (error: any) {
      await page.close();
      throw error;
    }

  } catch (error: any) {
    console.error(`❌ [OFICIAL] Erro ao voltar para conta oficial: ${error.message}`);
    throw error;
  }
}
