/**
 * Instagram Automation Service - Browser Isolado
 *
 * MIGRAÇÃO PARCIAL: Funções principais migradas para browser isolado
 * - checkFollowBack() ✅ Browser isolado
 * - unfollowUser() ✅ Browser isolado
 * - engageLead() ⚠️  Ainda usa browser compartilhado (não usado em produção)
 * - Demais funções: Legacy, não são usadas pelas APIs principais
 */
import puppeteer, { Browser, Page } from 'puppeteer';
import { getOfficialLoggedUsername } from './instagram-official-session.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Path do arquivo de cookies da conta oficial
 */
const COOKIES_FILE = path.join(__dirname, '../../instagram-cookies-oficial.json');

/**
 * Cria browser isolado (não compartilhado) com cookies da conta oficial
 * Cada chamada cria uma NOVA instância que será fechada ao fim
 */
async function createIsolatedBrowser(): Promise<Browser> {
  console.log('🚀 Criando browser isolado (não compartilhado)...');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox']
  });

  const page = await browser.newPage();

  // Carregar cookies se existirem
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
    await page.setCookie(...cookies);
    console.log(`🍪 ${cookies.length} cookies carregados da conta oficial`);
  } else {
    console.log('⚠️  Arquivo de cookies não encontrado, será necessário login manual');
  }

  await page.close(); // Fechar página temporária usada para carregar cookies
  return browser;
}

/**
 * Delay humanizado para evitar detecção de bot
 */
async function humanDelay(minMs: number = 2000, maxMs: number = 5000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise(resolve => setTimeout(resolve, delay));
}

// getLoggedUsername() deletada - função auxiliar não utilizada

/**
 * Faz logout humanizado do Instagram
 */
async function performLogout(page: Page): Promise<boolean> {
  try {
    console.log('🚪 Iniciando logout...');
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 });
    await humanDelay(2000, 3000);

    // Clicar no menu de perfil (mais opções)
    const moreButton = await page.$('svg[aria-label="Mais opções"], svg[aria-label="More"]');
    if (!moreButton) {
      console.warn('⚠️  Botão "Mais opções" não encontrado');
      return false;
    }

    const clickable = await moreButton.$('xpath/..');
    if (!clickable) {
      console.warn('⚠️  Elemento clicável não encontrado');
      return false;
    }
    await clickable.click();
    await humanDelay(1500, 2500);

    // Procurar botão "Sair"
    const buttons = await page.$$('button, div[role="button"]');
    for (const button of buttons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text && (text.includes('Sair') || text.includes('Log out'))) {
        await button.click();
        console.log('✅ Logout executado');
        await humanDelay(2000, 3000);
        return true;
      }
    }

    console.warn('⚠️  Botão "Sair" não encontrado');
    return false;
  } catch (error: any) {
    console.error(`❌ Erro ao fazer logout: ${error.message}`);
    return false;
  }
}

/**
 * Faz login humanizado com credenciais do .env
 */
async function performLogin(page: Page, username: string, password: string): Promise<boolean> {
  try {
    console.log(`🔑 Iniciando login como @${username}...`);
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await humanDelay(3000, 5000);

    // Aguardar campos de login
    await page.waitForSelector('input[name="username"]', { timeout: 10000 });

    // Preencher username (digitação humanizada)
    const usernameInput = await page.$('input[name="username"]');
    if (!usernameInput) throw new Error('Campo de username não encontrado');

    await usernameInput.click();
    await humanDelay(500, 1000);

    for (const char of username) {
      await page.keyboard.type(char);
      await humanDelay(100, 200);
    }

    await humanDelay(1000, 2000);

    // Preencher senha (digitação humanizada)
    const passwordInput = await page.$('input[name="password"]');
    if (!passwordInput) throw new Error('Campo de senha não encontrado');

    await passwordInput.click();
    await humanDelay(500, 1000);

    for (const char of password) {
      await page.keyboard.type(char);
      await humanDelay(100, 200);
    }

    await humanDelay(2000, 3000);

    // Clicar em "Entrar"
    const loginButton = await page.$('button[type="submit"]');
    if (!loginButton) throw new Error('Botão de login não encontrado');

    await loginButton.click();
    console.log('🔐 Credenciais enviadas, aguardando autenticação...');

    // Aguardar redirecionamento (indica sucesso)
    await humanDelay(8000, 12000);

    // Verificar se login foi bem-sucedido
    const currentUrl = page.url();
    if (currentUrl.includes('/accounts/login')) {
      console.error('❌ Login falhou - ainda na página de login');
      return false;
    }

    // Fechar popups pós-login
    await closePopups(page);

    console.log('✅ Login realizado com sucesso');
    return true;
  } catch (error: any) {
    console.error(`❌ Erro ao fazer login: ${error.message}`);
    return false;
  }
}

// checkIfAlreadyFollowing() deletada - função auxiliar não utilizada

/**
 * Navega para perfil de usuário usando o campo de busca (mais humanizado)
 */
async function navigateToProfile(page: Page, username: string): Promise<void> {
  console.log(`🔍 Buscando perfil: @${username}`);

  try {
    // Aguardar página carregar completamente
    await humanDelay(2000, 3000);

    // 1. CLICAR NO ÍCONE DE BUSCA (mesmo método do scraping que funciona!)
    console.log(`🔍 Abrindo painel de busca...`);
    const searchPanelOpened = await page.evaluate(() => {
      // @ts-ignore - Código executado no browser context
      const doc = document;
      const icon = doc.querySelector('svg[aria-label="Pesquisar"], svg[aria-label="Search"]');
      if (!icon) {
        return false;
      }
      const clickable = icon.closest('a, button, div[role="button"]');
      if (clickable && typeof (clickable as any).click === 'function') {
        (clickable as any).click();
        return true;
      }
      return false;
    });

    if (!searchPanelOpened) {
      console.log(`⚠️  Ícone de busca não clicável, tentando atalho de teclado "/"`);
      await page.keyboard.press('/');
      await humanDelay(600, 400);
    }

    // 2. AGUARDAR E FOCAR NO CAMPO DE INPUT
    const searchInputSelector = 'input[placeholder*="Pesquis"], input[placeholder*="Search"], input[aria-label*="Pesquis"], input[aria-label*="Search"]';
    const searchInput = await page.waitForSelector(searchInputSelector, { timeout: 5000, visible: true }).catch(() => null);

    if (!searchInput) {
      console.warn(`⚠️  Campo de busca não encontrado, navegando direto para URL`);
      const url = `https://www.instagram.com/${username}/`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await humanDelay(2000, 3000);
      return;
    }

    // 3. FOCAR E LIMPAR CAMPO
    await searchInput.evaluate((element: any) => {
      if (element && typeof element.focus === 'function') {
        element.focus();
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // 4. DIGITAR USERNAME LETRA POR LETRA (humanizado como scraping)
    console.log(`⌨️  Digitando "@${username}" (simulando humano)...`);
    for (const char of username) {
      await page.keyboard.type(char);
      await humanDelay(100, 150); // 100-250ms por letra
    }

    await humanDelay(2000, 3000); // Aguardar resultados

    // Procurar e clicar no perfil correto nos resultados
    console.log(`🎯 Procurando perfil @${username} nos resultados...`);

    const profileLinkSelectors = [
      `a[href="/${username}/"]`,
      `a[href*="/${username}"]`
    ];

    for (const selector of profileLinkSelectors) {
      const profileLink = await page.$(selector);
      if (profileLink) {
        console.log(`✅ Perfil encontrado, clicando...`);
        await profileLink.click();
        await humanDelay(3000, 4000); // Aguardar página carregar
        return;
      }
    }

    // Fallback: se não encontrou nos resultados, vai direto pela URL
    console.warn(`⚠️  Perfil não encontrado nos resultados, navegando pela URL`);
    const url = `https://www.instagram.com/${username}/`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await humanDelay(2000, 3000);

  } catch (error: any) {
    console.error(`❌ Erro ao buscar perfil: ${error.message}`);
    // Fallback: navega direto pela URL
    console.log(`🔗 Tentando URL direta...`);
    const url = `https://www.instagram.com/${username}/`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await humanDelay(2000, 3000);
  }
}

/**
 * Garante que a página está logada no Instagram
 * Navega para o Instagram primeiro para ativar cookies do User Data Directory
 */
async function ensureLoggedIn(page: Page): Promise<boolean> {
  try {
    // IMPORTANTE: Navegar para Instagram para carregar cookies do User Data Directory
    const currentUrl = page.url();
    if (!currentUrl.includes('instagram.com')) {
      console.log(`🔗 [AUTOMAÇÃO] Navegando para Instagram...`);
      await page.goto('https://www.instagram.com/', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      await humanDelay(2000, 3000);
    }

    // Verificar se tem cookie de sessão
    const cookies = await page.cookies();
    const hasSession = cookies.some(cookie => cookie.name === 'sessionid' && cookie.value);

    if (hasSession) {
      console.log(`✅ [AUTOMAÇÃO] Sessão ativa detectada`);
      return true;
    }

    console.error(`❌ [AUTOMAÇÃO] Sem sessão ativa - User Data Directory não manteve login`);
    return false;
  } catch (error: any) {
    console.error(`❌ Erro ao verificar login: ${error.message}`);
    return false;
  }
}

/**
 * Fecha popups e notificações do Instagram
 */
async function closePopups(page: Page): Promise<void> {
  try {
    // Fechar popup "Ativar notificações"
    const notNowButtons = await page.$$('button');
    for (const button of notNowButtons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text && (text.includes('Agora não') || text.includes('Not Now'))) {
        await button.click();
        console.log('❌ Popup de notificação fechado');
        await humanDelay(500, 1000);
        break;
      }
    }
  } catch (error: any) {
    // Popup pode não existir, ignorar
  }
}

/**
 * Segue um usuário no Instagram
 */
export async function followUser(username: string): Promise<{
  success: boolean;
  error_message: string | null;
  already_following: boolean;
}> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`\n👥 [FOLLOW] Iniciando follow de @${username}...`);

    browser = await createIsolatedBrowser();
    page = await browser.newPage();

    if (!await ensureLoggedIn(page)) {
      throw new Error('Não está logado na conta oficial');
    }

    await navigateToProfile(page, username);
    await closePopups(page);

    // Aguardar botão de follow/following aparecer
    await page.waitForSelector('button', { timeout: 10000 });

    // Procurar botão de Follow
    const buttons = await page.$$('button');
    let alreadyFollowing = false;

    for (const button of buttons) {
      const text = await page.evaluate(el => el.textContent, button);

      if (text && (text.includes('Seguindo') || text.includes('Following'))) {
        alreadyFollowing = true;
        console.log(`✅ Já está seguindo @${username}`);
        break;
      }
    }

    if (alreadyFollowing) {
      // await page.close(); // Mantém janela aberta
      return {
        success: true,
        error_message: null,
        already_following: true
      };
    }

    // Procurar botão Follow
    let foundFollowButton = false;
    for (const button of buttons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text && (text.includes('Seguir') || text.includes('Follow'))) {
        await button.click();
        foundFollowButton = true;
        break;
      }
    }

    if (!foundFollowButton) {
      throw new Error('Botão de Follow não encontrado');
    }
    console.log(`✅ Follow executado em @${username}`);

    await humanDelay(1500, 3000);
    // await page.close(); // Mantém janela aberta

    return {
      success: true,
      error_message: null,
      already_following: false
    };

  } catch (error: any) {
    console.error(`❌ Erro ao seguir @${username}:`, error.message);

    return {
      success: false,
      error_message: error.message,
      already_following: false
    };
  } finally {
    if (browser) {
      console.log(`🚪 Fechando browser isolado...`);
      await browser.close();
    }
  }
}

/**
 * Curte o último post de um usuário
 */
export async function likeLastPost(username: string): Promise<{
  success: boolean;
  post_url: string | null;
  error_message: string | null;
  already_liked: boolean;
}> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`\n❤️  [LIKE] Curtindo último post de @${username}...`);

    browser = await createIsolatedBrowser();
    page = await browser.newPage();

    if (!await ensureLoggedIn(page)) {
      throw new Error('Não está logado na conta oficial');
    }

    await navigateToProfile(page, username);
    await closePopups(page);

    // Aguardar grid de posts carregar
    await page.waitForSelector('article a[href^="/p/"]', { timeout: 15000 });

    // Pegar URL do primeiro post (último postado)
    const firstPostLink = await page.$('article a[href^="/p/"]');
    if (!firstPostLink) {
      throw new Error('Nenhum post encontrado no perfil');
    }

    const postUrl = await page.evaluate(el => el.href, firstPostLink);
    console.log(`📍 Post encontrado: ${postUrl}`);

    // Navegar para o post
    await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await humanDelay(2000, 3000);

    // Procurar botão de like
    const likeSvg = await page.$('svg[aria-label="Curtir"], svg[aria-label="Like"]');
    const unlikeSvg = await page.$('svg[aria-label="Descurtir"], svg[aria-label="Unlike"]');

    if (unlikeSvg) {
      console.log(`✅ Post já curtido anteriormente`);
      // await page.close(); // Mantém janela aberta
      return {
        success: true,
        post_url: postUrl,
        error_message: null,
        already_liked: true
      };
    }

    if (!likeSvg) {
      throw new Error('Botão de like não encontrado');
    }

    // Clicar no like
    const likeButton = await likeSvg.$('xpath/..');
    if (!likeButton) {
      throw new Error('Elemento do botão de like não encontrado');
    }
    await likeButton.click();
    console.log(`✅ Like executado no post`);

    await humanDelay(1500, 3000);
    // await page.close(); // Mantém janela aberta

    return {
      success: true,
      post_url: postUrl,
      error_message: null,
      already_liked: false
    };

  } catch (error: any) {
    console.error(`❌ Erro ao curtir post de @${username}:`, error.message);

    if (page && !page.isClosed()) {
      // await page.close(); // Mantém janela aberta
    }

    return {
      success: false,
      post_url: null,
      error_message: error.message,
      already_liked: false
    };
  }
}

// commentOnLastPost() deletada - não usada pelas APIs principais

/**
 * Verifica se um usuário nos segue de volta
 */
export async function checkFollowBack(username: string): Promise<{
  success: boolean;
  followed_back: boolean;
  error_message: string | null;
}> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`\n🔍 [CHECK] Verificando follow back de @${username}...`);

    // Criar browser isolado (não compartilhado)
    browser = await createIsolatedBrowser();
    page = await browser.newPage();

    if (!await ensureLoggedIn(page)) {
      throw new Error('Não está logado na conta oficial');
    }

    // Verificar qual conta está logada (usa detecção do serviço oficial)
    const loggedUsername = getOfficialLoggedUsername();
    const expectedUsername = process.env.INSTAGRAM_OFFICIAL_USERNAME || 'ubs.sistemas';

    console.log(`\n🔍 Verificação de conta:`);
    console.log(`   Esperado: @${expectedUsername}`);
    console.log(`   Detectado: @${loggedUsername || 'não detectado'}`);

    // Verificar se detectou um username
    if (!loggedUsername) {
      throw new Error('Não foi possível detectar qual conta está logada. Verifique a sessão do Instagram.');
    }

    // Se for conta diferente, fazer logout e login
    if (loggedUsername !== expectedUsername) {
      console.log(`\n⚠️  Conta errada detectada! Fazendo logout de @${loggedUsername} e login com @${expectedUsername}...`);

      // Logout
      const logoutSuccess = await performLogout(page);
      if (!logoutSuccess) {
        console.warn('⚠️  Logout falhou, tentando login mesmo assim...');
      }

      // Login com credenciais do .env
      const password = process.env.INSTAGRAM_OFFICIAL_PASSWORD;
      if (!password) {
        throw new Error('INSTAGRAM_OFFICIAL_PASSWORD não configurado no .env');
      }

      const loginSuccess = await performLogin(page, expectedUsername, password);
      if (!loginSuccess) {
        throw new Error('Falha ao fazer login com as credenciais do .env');
      }

      console.log(`✅ Login realizado com sucesso como @${expectedUsername}`);
    } else {
      console.log(`✅ Já está logado na conta correta (@${expectedUsername})`);
    }

    await navigateToProfile(page, username);
    await closePopups(page);

    // Aguardar botões carregarem
    await page.waitForSelector('button', { timeout: 10000 });

    // Verificar se tem o badge "Segue você" / "Follows you"
    const pageContent = await page.content();
    const followsYou = pageContent.includes('Segue você') || pageContent.includes('Follows you');

    console.log(followsYou ? `✅ @${username} nos segue de volta!` : `⏳ @${username} ainda não nos seguiu`);

    // await page.close(); // Mantém janela aberta

    return {
      success: true,
      followed_back: followsYou,
      error_message: null
    };

  } catch (error: any) {
    console.error(`❌ Erro ao verificar follow back de @${username}:`, error.message);

    return {
      success: false,
      followed_back: false,
      error_message: error.message
    };
  } finally {
    // Fechar browser isolado
    if (browser) {
      console.log(`🚪 Fechando browser isolado...`);
      await browser.close();
    }
  }
}

/**
 * Deixa de seguir um usuário
 * Atualizado: Procura por role="menuitem" no popup
 */
export async function unfollowUser(username: string): Promise<{
  success: boolean;
  error_message: string | null;
  was_not_following: boolean;
}> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`\n🗑️  [UNFOLLOW] Aplicando unfollow em @${username}...`);

    // Criar browser isolado (não compartilhado)
    browser = await createIsolatedBrowser();
    page = await browser.newPage();

    if (!await ensureLoggedIn(page)) {
      throw new Error('Não está logado na conta oficial');
    }

    // Verificar qual conta está logada (usa detecção do serviço oficial)
    const loggedUsername = getOfficialLoggedUsername();
    const expectedUsername = process.env.INSTAGRAM_OFFICIAL_USERNAME || 'ubs.sistemas';

    console.log(`\n🔍 Verificação de conta:`);
    console.log(`   Esperado: @${expectedUsername}`);
    console.log(`   Detectado: @${loggedUsername || 'não detectado'}`);

    // Verificar se detectou um username
    if (!loggedUsername) {
      throw new Error('Não foi possível detectar qual conta está logada. Verifique a sessão do Instagram.');
    }

    // Se for conta diferente, fazer logout e login
    if (loggedUsername !== expectedUsername) {
      console.log(`\n⚠️  Conta errada detectada! Fazendo logout de @${loggedUsername} e login com @${expectedUsername}...`);

      // Logout
      const logoutSuccess = await performLogout(page);
      if (!logoutSuccess) {
        console.warn('⚠️  Logout falhou, tentando login mesmo assim...');
      }

      // Login com credenciais do .env
      const password = process.env.INSTAGRAM_OFFICIAL_PASSWORD;
      if (!password) {
        throw new Error('INSTAGRAM_OFFICIAL_PASSWORD não configurado no .env');
      }

      const loginSuccess = await performLogin(page, expectedUsername, password);
      if (!loginSuccess) {
        throw new Error('Falha ao fazer login com as credenciais do .env');
      }

      console.log(`✅ Login realizado com sucesso como @${expectedUsername}`);
    } else {
      console.log(`✅ Já está logado na conta correta (@${expectedUsername})`);
    }

    await navigateToProfile(page, username);
    await closePopups(page);

    // Aguardar botões carregarem
    await page.waitForSelector('button', { timeout: 10000 });

    // Procurar botão "Seguindo" / "Following"
    const buttons = await page.$$('button');
    let notFollowing = false;

    for (const button of buttons) {
      const text = await page.evaluate(el => el.textContent, button);

      if (text && (text.includes('Seguir') || text.includes('Follow'))) {
        notFollowing = true;
        console.log(`⚠️  Não estava seguindo @${username}`);
        break;
      }
    }

    if (notFollowing) {
      // await page.close(); // Mantém janela aberta
      return {
        success: true,
        error_message: null,
        was_not_following: true
      };
    }

    // Procurar e clicar no botão "Seguindo"
    let foundFollowingButton = false;
    for (const button of buttons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text && (text.includes('Seguindo') || text.includes('Following'))) {
        await button.click();
        foundFollowingButton = true;
        break;
      }
    }

    if (!foundFollowingButton) {
      throw new Error('Botão "Seguindo" não encontrado');
    }

    // Aguardar popup de confirmação aparecer (3 segundos fixos)
    console.log(`   ⏳ Aguardando popup de unfollow carregar...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Procurar por QUALQUER elemento clicável no popup (button, div[role="menuitem"], etc)
    console.log(`   🔍 Procurando opção "Deixar de seguir" no popup...`);

    // Usar evaluate para encontrar e clicar no elemento com texto correto
    const unfollowClicked = await page.evaluate(() => {
      // @ts-ignore
      const allElements = document.querySelectorAll('button, div[role="menuitem"], span[role="menuitem"], [role="button"]');
      console.log(`[DEBUG BROWSER] Total de elementos clicáveis: ${allElements.length}`);

      // @ts-ignore
      for (const element of allElements) {
        const text = element.textContent || '';
        console.log(`[DEBUG BROWSER] Elemento: "${text}"`);

        if (text.includes('Deixar de seguir') || text.includes('Unfollow')) {
          console.log(`[DEBUG BROWSER] ✅ Encontrado! Clicando em: "${text}"`);
          // @ts-ignore
          element.click();
          return true;
        }
      }

      return false;
    });

    if (!unfollowClicked) {
      throw new Error('Botão "Deixar de seguir" não encontrado no popup');
    }

    console.log(`   ✅ Clicou em "Deixar de seguir"`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`✅ Unfollow executado em @${username}`);

    await humanDelay(1500, 3000);
    // await page.close(); // Mantém janela aberta

    return {
      success: true,
      error_message: null,
      was_not_following: false
    };

  } catch (error: any) {
    console.error(`❌ Erro ao dar unfollow em @${username}:`, error.message);

    return {
      success: false,
      error_message: error.message,
      was_not_following: false
    };
  } finally {
    // Fechar browser isolado
    if (browser) {
      console.log(`🚪 Fechando browser isolado...`);
      await browser.close();
    }
  }
}

// engageLead() deletada - não usada pelas APIs principais
// Use processBatchEngagement() de instagram-automation-refactored.service.ts

// Funções auxiliares performFollow(), performLikeOnPage(), performCommentOnPage() deletadas - não utilizadas

// processBatchEngagement() legacy deletada - não usada pelas APIs principais
// Use processBatchEngagement() de instagram-automation-refactored.service.ts
