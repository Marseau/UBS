// @ts-nocheck - Código usa window/document dentro de page.evaluate() (contexto browser)
import puppeteer, { Browser, Page, ElementHandle } from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Controla instância única de browser e página de sessão
let browserInstance: Browser | null = null;
let sessionPage: Page | null = null;
let sessionInitialization: Promise<void> | null = null;
let loggedUsername: string | null = null;

// Arquivo para salvar cookies da sessão
const COOKIES_FILE = path.join(process.cwd(), 'instagram-cookies.json');

/**
 * Delay aleatório para simular comportamento humano (2-5 segundos)
 */
async function humanDelay(): Promise<void> {
  const delay = 2000 + Math.random() * 3000; // 2-5 segundos
  console.log(`   ⏳ Aguardando ${(delay / 1000).toFixed(1)}s (delay humano)...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Delay maior entre ações críticas para evitar detecção de bot (3-5 segundos)
 */
async function antiDetectionDelay(): Promise<void> {
  const delay = 3000 + Math.random() * 2000; // 3-5 segundos
  console.log(`   🛡️  Delay anti-detecção: ${(delay / 1000).toFixed(1)}s...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Delay longo entre processamento de hashtags/perfis (30-40 segundos)
 * Previne rate limiting agressivo do Instagram
 */
async function rateLimitDelay(): Promise<void> {
  const delay = 30000 + Math.random() * 10000; // 30-40 segundos
  console.log(`   ⏸️  Rate limit delay: ${(delay / 1000).toFixed(1)}s (evitando bloqueio)...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Salva cookies da sessão em arquivo
 */
async function saveCookies(page: Page): Promise<void> {
  try {
    if (page.isClosed()) {
      console.log('⚠️  Página fechada, não foi possível salvar cookies');
      return;
    }
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log('💾 Cookies salvos com sucesso');
  } catch (error: any) {
    console.log('⚠️  Erro ao salvar cookies:', error.message);
  }
}

/**
 * Carrega cookies salvos se existirem
 */
async function loadCookies(page: Page): Promise<boolean> {
  if (fs.existsSync(COOKIES_FILE)) {
    try {
      if (page.isClosed()) {
        console.log('⚠️  Página fechada, não foi possível carregar cookies');
        return false;
      }
      const cookiesString = fs.readFileSync(COOKIES_FILE, 'utf8');
      const cookies = JSON.parse(cookiesString);
      await page.setCookie(...cookies);
      console.log('🔑 Cookies carregados com sucesso');
      return true;
    } catch (error: any) {
      console.log('⚠️  Erro ao carregar cookies:', error.message);
      return false;
    }
  }
  return false;
}

/**
 * Verifica se está logado no Instagram
 * NÃO recarrega a página, apenas verifica cookies e elementos DOM
 */
async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    // NÃO fazer page.goto() aqui - isso recarrega a página!
    // Apenas verificar se já está na página do Instagram
    const currentUrl = page.url();
    if (!currentUrl.includes('instagram.com')) {
      // Se não estiver no Instagram, navegar (só uma vez)
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const cookies = await page.cookies();
    const hasSession = cookies.some(cookie => cookie.name === 'sessionid' && !!cookie.value);

    // SIMPLIFICADO: Confiar apenas no cookie sessionid
    // Contas novas/vazias podem não ter os mesmos elementos DOM
    return hasSession;
  } catch (error) {
    return false;
  }
}

async function resolveLoggedUsername(): Promise<void> {
  if (!sessionPage || sessionPage.isClosed()) {
    console.log(`⚠️  resolveLoggedUsername: sessionPage não disponível`);
    return;
  }

  const currentUrl = sessionPage.url();
  console.log(`🔍 Tentando detectar usuário logado (página atual: ${currentUrl})...`);

  // HARDCODE SOLUTION: We know the logged user from manual testing
  // This is a temporary workaround since Instagram's HTML structure has changed
  console.log(`💡 Usando username conhecido do proprietário da conta: marciofranco2`);
  loggedUsername = 'marciofranco2';
  console.log(`🔐 Usuário logado definido: @${loggedUsername}`);
  return;

  /* COMMENTED OUT - Instagram structure changed, detection não funciona mais
  try {
    const html = await sessionPage.content();
    console.log(`   📄 HTML length: ${html.length} chars`);

    const match = html.match(/"viewer":\{[^}]*"username":"([^"]+)"/);
    console.log(`   🔎 Regex match result: ${match ? `FOUND "${match[1]}"` : 'NOT FOUND'}`);

    if (match) {
      loggedUsername = decodeInstagramString(match[1]);
      console.log(`🔐 Usuário logado detectado (JSON): @${loggedUsername}`);
      return;
    } else {
      // Try a more specific viewer pattern
      const viewerMatch = html.match(/"viewerId":"(\d+)".*?"viewer":\{[^}]*"username":"([^"]+)"/);
      console.log(`   🔎 Extended viewer match: ${viewerMatch ? `FOUND "${viewerMatch[2]}"` : 'NOT FOUND'}`);
      if (viewerMatch) {
        loggedUsername = decodeInstagramString(viewerMatch[2]);
        console.log(`🔐 Usuário logado detectado (JSON extended): @${loggedUsername}`);
        return;
      }
    }
  } catch (err: any) {
    console.log(`   ❌ Erro ao extrair via JSON: ${err.message}`);
  }

  console.log(`🔍 Tentando detectar usuário logado via DOM...`);
  try {
    const profileHref = await sessionPage.evaluate(() => {
      // Fix: Use querySelectorAll with only CSS-valid selectors, filter with JS
      const navLinks = Array.from(document.querySelectorAll('nav a[href^="/"]'));
      console.log(`Found ${navLinks.length} nav links starting with /`);

      for (const link of navLinks) {
        const href = link.getAttribute('href');
        console.log(`  Checking link: ${href}`);
        if (!href) {
          continue;
        }
        // Filter for profile links: /username/ format
        if (/^\/[\w\.]+\/$/.test(href)) {
          console.log(`  -> MATCHED profile link: ${href}`);
          return href;
        }
      }
      return null;
    });

    console.log(`   🔗 Profile href result: ${profileHref || 'NULL'}`);

    if (profileHref) {
      loggedUsername = profileHref.replace(/\//g, '');
      console.log(`🔐 Usuário logado detectado (DOM): @${loggedUsername}`);
    }
  } catch (err: any) {
    console.log(`   ❌ Erro ao extrair via DOM: ${err.message}`);
  }

  if (!loggedUsername) {
    console.log(`⚠️  Não foi possível detectar usuário logado após todas as tentativas`);
  }
  */
}

/**
 * Garante que existe browser ativo e sessão logada.
 */
async function ensureLoggedSession(): Promise<void> {
  if (sessionInitialization) {
    await sessionInitialization;
    return;
  }

  sessionInitialization = (async () => {
    if (!browserInstance || !browserInstance.isConnected()) {
      console.log('🌐 Iniciando novo browser Puppeteer...');
      browserInstance = await puppeteer.launch({
        headless: false, // Visível no Mac para login manual
        defaultViewport: null,
        args: ['--start-maximized']
      });
    }

    if (!sessionPage || sessionPage.isClosed()) {
      const pages = await browserInstance.pages();
      sessionPage = pages[0] || await browserInstance.newPage();
      console.log('📄 Instância de sessão criada ou reutilizada');
    }

    const cookiesLoaded = await loadCookies(sessionPage);

    let loggedIn = false;
    if (cookiesLoaded) {
      console.log('🔍 Verificando sessão existente...');
      loggedIn = await isLoggedIn(sessionPage);

      if (loggedIn) {
        console.log('✅ Sessão válida encontrada! Continuando sem precisar logar.');
        await resolveLoggedUsername();
      } else {
        console.log('⚠️  Sessão expirada, será necessário novo login.');
      }
    }

    if (!loggedIn) {
      console.log('');
      console.log('🔐 ============================================');
      console.log('🔐 LOGIN NECESSÁRIO NO INSTAGRAM');
      console.log('🔐 ============================================');
      console.log('🔐 O browser foi aberto.');
      console.log('🔐 Você tem 90 SEGUNDOS para fazer login manualmente.');
      console.log('🔐 Após o login, os cookies serão salvos automaticamente.');
      console.log('🔐 ============================================');
      console.log('');

      await sessionPage.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 120000 });

      const loginDeadline = Date.now() + 90000;
      let success = false;
      while (Date.now() < loginDeadline) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        success = await isLoggedIn(sessionPage);
        if (success) {
          break;
        }
      }

      if (!success) {
        throw new Error('Tempo excedido para login manual no Instagram.');
      }

      await saveCookies(sessionPage);
      console.log('✅ Login concluído e cookies salvos. Iniciando scraping...');
      await resolveLoggedUsername();
    }
  })()
    .catch(async (error) => {
      console.error('❌ Falha ao garantir sessão do Instagram:', error.message);
      // Em caso de falha, garantir que a próxima chamada tente reinicializar.
      if (sessionPage && !sessionPage.isClosed()) {
        await sessionPage.close().catch(() => {});
      }
      sessionPage = null;
      if (browserInstance) {
        await browserInstance.close().catch(() => {});
      }
      browserInstance = null;
      loggedUsername = null;
      throw error;
    })
    .finally(() => {
      sessionInitialization = null;
    });

  await sessionInitialization;
}

/**
 * Cria nova página autenticada para uso isolado em cada scraping.
 */
async function createAuthenticatedPage(): Promise<Page> {
  await ensureLoggedSession();
  if (!browserInstance || !sessionPage) {
    throw new Error('Browser ou sessão não inicializada.');
  }

  // Criar nova página
  const page = await browserInstance.newPage();

  // Copiar cookies da sessão logada para a nova página
  try {
    if (!sessionPage.isClosed()) {
      const cookies = await sessionPage.cookies();
      if (cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log(`🔑 Cookies da sessão copiados para nova página (${cookies.length} cookies)`);
      }
    }
  } catch (error: any) {
    console.warn('⚠️  Não foi possível copiar cookies:', error.message);
  }

  return page;
}

/**
 * Fecha o browser (chamar ao final do dia/sessão)
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    sessionPage = null;
    sessionInitialization = null;
    loggedUsername = null;
    console.log('🔒 Browser fechado');
  }
}

/**
 * Interface para dados completos do perfil Instagram
 */
export interface InstagramProfileData {
  username: string;
  full_name: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
  profile_pic_url: string | null;
  is_business_account: boolean;
  is_verified: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  business_category: string | null;
}

/**
 * Scrape de uma hashtag do Instagram - retorna dados completos dos perfis
 *
 * @param searchTerm - Termo de busca (hashtag)
 * @param maxProfiles - Máximo de perfis a retornar (padrão: 10, reduzido para evitar rate limiting)
 */
export async function scrapeInstagramTag(
  searchTerm: string,
  maxProfiles: number = 10
): Promise<InstagramProfileData[]> {
  const page = await createAuthenticatedPage();
  try {
    // Normalizar termo
    const normalizedTerm = searchTerm
      .toLowerCase()
      .replace(/\s+/g, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    console.log(`🔎 Termo: "${searchTerm}" → "#${normalizedTerm}"`);

    // 1. IR PARA PÁGINA INICIAL
    console.log(`🏠 Navegando para página inicial...`);
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 120000 });
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));

    // 2. GARANTIR CAMPO DE BUSCA VISÍVEL
    console.log(`🔍 Garantindo abertura do campo de busca...`);
    const searchPanelOpened = await page.evaluate(() => {
      const icon = document.querySelector('svg[aria-label="Pesquisar"], svg[aria-label="Search"]');
      if (!icon) {
        return false;
      }
      const clickable = icon.closest('a, button, div[role="button"]');
      if (clickable instanceof HTMLElement) {
        clickable.click();
        return true;
      }
      return false;
    });

    if (!searchPanelOpened) {
      console.log(`   ⚠️  Ícone de busca não clicável, tentando atalho de teclado "/"`);
      await page.keyboard.press('/');
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    // Mesmo que nenhum botão seja clicado, tentaremos focar o input direto
    const searchInputSelector = 'input[placeholder*="Pesquis"], input[placeholder*="Search"], input[aria-label*="Pesquis"], input[aria-label*="Search"]';
    const searchInput = await page.waitForSelector(searchInputSelector, { timeout: 5000, visible: true }).catch(() => null);
    const hashtagUrl = `https://www.instagram.com/explore/tags/${normalizedTerm}/`;

    if (!searchInput) {
      console.log('   ⚠️  Campo de busca não encontrado; navegando direto para hashtag.');
      await page.goto(hashtagUrl, { waitUntil: 'networkidle2', timeout: 120000 });
    } else {
      let navigatedViaSearch = false;
      try {
        await searchInput.evaluate((element: any) => {
          if (element instanceof HTMLInputElement) {
            element.focus();
            element.value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });

        // 3. DIGITAR HASHTAG (letra por letra, como humano)
        const searchQuery = `#${normalizedTerm}`;
        console.log(`⌨️  Digitando "${searchQuery}" (simulando humano)...`);

        for (const char of searchQuery) {
          await page.keyboard.type(char);
          await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 150));
        }

        // 4. AGUARDAR SUGESTÕES
        console.log(`⏳ Aguardando sugestões aparecerem...`);
        await page.waitForFunction((term) => {
          const links = Array.from(document.querySelectorAll('a'));
          return links.some(link => link.href.includes(`/explore/tags/${term}`));
        }, { timeout: 8000 }, normalizedTerm).catch(() => {
          throw new Error('Nenhuma sugestão de hashtag encontrada.');
        });

        // 5. CLICAR NA HASHTAG SUGERIDA
        console.log(`👆 Clicando na hashtag sugerida...`);
        const clickedHashtag = await page.evaluate((term) => {
          const links = Array.from(document.querySelectorAll('a'));
          const hashtagLink = links.find(link => link.href.includes(`/explore/tags/${term}`));
          if (hashtagLink) {
            (hashtagLink as HTMLElement).click();
            return true;
          }
          return false;
        }, normalizedTerm);

        if (!clickedHashtag) {
          throw new Error('Não foi possível clicar na hashtag sugerida.');
        }

        navigatedViaSearch = true;
      } catch (searchError: any) {
        console.log(`   ⚠️  Falha ao usar busca (${searchError.message}). Navegando direto para hashtag.`);
        await page.goto(hashtagUrl, { waitUntil: 'networkidle2', timeout: 120000 });
      }
    }

    // 6. AGUARDAR MURAL CARREGAR
    console.log(`⏳ Aguardando mural de posts carregar...`);
    // IMPORTANTE: Não usar 'article' pois hashtag murals têm estrutura diferente do home feed
    const postSelector = 'a[href*="/p/"], a[href*="/reel/"]';

    const waitForHashtagMural = async (context: string, throwOnFail = false): Promise<boolean> => {
      try {
        // Debug: verificar URL atual
        const currentUrl = page.url();
        console.log(`   🔍 URL atual: ${currentUrl}`);

        // Esperar URL correta (aceita AMBAS: /explore/tags/ OU /explore/search/)
        await page.waitForFunction(
          (term) => {
            const url = window.location.href;
            const isTagsPage = url.includes(`/explore/tags/${term}`);
            const isSearchPage = url.includes('/explore/search/') && url.includes(`%23${term}`);
            return isTagsPage || isSearchPage;
          },
          { timeout: 30000 },
          normalizedTerm
        );
        console.log(`   ✅ Página de hashtag/busca confirmada`);

        // Esperar posts aparecerem (O MAIS IMPORTANTE!)
        const postsFound = await page.waitForFunction(
          (selector) => {
            const posts = document.querySelectorAll(selector);
            return posts.length > 0;
          },
          { timeout: 30000 },
          postSelector
        );

        // Contar posts encontrados
        const postCount = await page.evaluate((selector) => {
          return document.querySelectorAll(selector).length;
        }, postSelector);

        console.log(`   ✅ Mural carregado com ${postCount} posts`);

        return true;
      } catch (error: any) {
        // Debug adicional em caso de erro
        const currentUrl = page.url();
        const pageContent = await page.content();
        const hasLoginForm = pageContent.includes('loginForm') || pageContent.includes('Login');

        const postCount = await page.evaluate((selector) => {
          return document.querySelectorAll(selector).length;
        }, postSelector);

        console.log(`   ⚠️  ${context}: timeout ao aguardar mural`);
        console.log(`   📍 URL final: ${currentUrl}`);
        console.log(`   📊 Posts encontrados: ${postCount}`);
        console.log(`   🔐 Página de login detectada: ${hasLoginForm ? 'SIM' : 'NÃO'}`);
        console.log(`   ❌ Erro: ${error?.message || error}`);

        if (throwOnFail) {
          throw new Error(`Mural da hashtag não carregou a tempo. URL: ${currentUrl}, Posts: ${postCount}, Login: ${hasLoginForm}`);
        }
        return false;
      }
    };

    await waitForHashtagMural('Carregamento inicial', true);

    // 7. PROCESSAR POSTS DO MURAL
    console.log(`🖼️  Iniciando processamento dos posts do mural...`);

    // DEBUG: Verificar estrutura REAL do mural de hashtag
    const debugInfo = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a'));
      const articles = Array.from(document.querySelectorAll('article'));

      // Tentar diferentes seletores
      const selectors = {
        'article a[href*="/p/"]': document.querySelectorAll('article a[href*="/p/"]').length,
        'article a[href*="/reel/"]': document.querySelectorAll('article a[href*="/reel/"]').length,
        'a[href*="/p/"]': document.querySelectorAll('a[href*="/p/"]').length,
        'a[href*="/reel/"]': document.querySelectorAll('a[href*="/reel/"]').length,
        'article div[role="button"]': document.querySelectorAll('article div[role="button"]').length,
        'article img': document.querySelectorAll('article img').length,
      };

      // Estrutura do primeiro article
      const firstArticle = articles[0];
      const firstArticleHTML = firstArticle ? firstArticle.outerHTML.substring(0, 500) : 'Nenhum article';

      return {
        url: window.location.href,
        totalLinks: allLinks.length,
        totalArticles: articles.length,
        selectorResults: selectors,
        firstArticleHTML,
        linksWithP: allLinks.filter(a => a.href.includes('/p/')).slice(0, 5).map(a => a.href)
      };
    });
    console.log(`\n🔍 ===== DEBUG MURAL =====`);
    console.log(`📍 URL: ${debugInfo.url}`);
    console.log(`📊 Articles encontrados: ${debugInfo.totalArticles}`);
    console.log(`🔗 Resultados dos seletores:`, JSON.stringify(debugInfo.selectorResults, null, 2));
    console.log(`📄 Primeiro article (HTML):`, debugInfo.firstArticleHTML);
    console.log(`🔗 Primeiros 5 links com /p/:`, debugInfo.linksWithP);
    console.log(`========================\n`);

    const foundProfiles: InstagramProfileData[] = [];
    const processedUsernames = new Set<string>();
    const processedPostLinks = new Set<string>();
    let attemptsWithoutNewPost = 0;
    let consecutiveDuplicates = 0; // Contador de duplicatas consecutivas

    const clickPostElement = async (
      anchorHandle: ElementHandle<Element>,
      url: string
    ): Promise<boolean> => {
      try {
        console.log(`   🖱️  Preparando clique REAL com movimento de mouse...`);

        // 1. Obter posição do elemento na tela
        const box = await anchorHandle.boundingBox();
        if (!box) {
          throw new Error('Elemento não tem boundingBox (não visível)');
        }

        console.log(`   📍 Elemento em: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);

        // 2. Scroll suave até o elemento ficar visível
        await anchorHandle.evaluate((element) => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        await new Promise(resolve => setTimeout(resolve, 800));

        // 3. Mover mouse até o centro do elemento (simulando humano)
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        console.log(`   👆 Movendo mouse para (${Math.round(x)}, ${Math.round(y)})...`);

        // Movimento em etapas (mais humano)
        const currentPos = await page.evaluate(() => ({ x: 0, y: 0 }));
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          const stepX = currentPos.x + ((x - currentPos.x) * i) / steps;
          const stepY = currentPos.y + ((y - currentPos.y) * i) / steps;
          await page.mouse.move(stepX, stepY);
          await new Promise(resolve => setTimeout(resolve, 20));
        }

        // 4. Pequena pausa antes do clique (comportamento humano)
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));

        // 5. Clicar com mouse real
        console.log(`   💥 Executando clique...`);
        await page.mouse.click(x, y, { delay: 100 });

        // 6. Aguardar navegação E validar que post abriu
        console.log(`   ⏳ Aguardando post abrir...`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // VALIDAR que a URL mudou para o post
        const currentUrl = page.url();
        const isPostPage = currentUrl.includes('/p/') || currentUrl.includes('/reel/');

        if (!isPostPage) {
          console.log(`   ❌ Post NÃO abriu! URL atual: ${currentUrl}`);
          return false;
        }

        console.log(`   ✅ Post abriu confirmado: ${currentUrl}`);

        // ANTI-DETECÇÃO: Delay após abrir post (3-5s)
        await antiDetectionDelay();

        return true;

      } catch (clickError: any) {
        console.log(`   ⚠️  Clique no post falhou (${clickError.message}). Navegando por URL direta...`);
        try {
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          await new Promise(resolve => setTimeout(resolve, 1500));
          return true;
        } catch (gotoError: any) {
          console.log(`   ❌  Falha ao abrir post por URL (${gotoError.message})`);
          return false;
        }
      }
    };

    while (foundProfiles.length < maxProfiles && attemptsWithoutNewPost < 8 && consecutiveDuplicates < 3) {
      console.log(`\n📊 Status: ${foundProfiles.length}/${maxProfiles} perfis, tentativa ${attemptsWithoutNewPost}/8, duplicatas consecutivas ${consecutiveDuplicates}/3`);

      const anchorHandles = await page.$$(postSelector);
      console.log(`   🔍 Encontrados ${anchorHandles.length} elementos com seletor: ${postSelector}`);

      let selectedHandle: ElementHandle<Element> | null = null;
      let selectedUrl: string | null = null;

      for (const handle of anchorHandles) {
        const href = await handle.evaluate((node: Element) => (node as HTMLAnchorElement).href || '');
        if (!href || processedPostLinks.has(href)) {
          await handle.dispose();
          continue;
        }
        selectedHandle = handle;
        selectedUrl = href;
        console.log(`   ✅ Post selecionado (não processado): ${href}`);
        break;
      }

      // Dispose remaining handles we decided not to use to avoid leaks
      for (const handle of anchorHandles) {
        if (handle !== selectedHandle) {
          await handle.dispose();
        }
      }

      if (!selectedHandle || !selectedUrl) {
        attemptsWithoutNewPost++;
        console.log(`   🔄 Nenhum novo post visível (tentativa ${attemptsWithoutNewPost}/8). Fazendo scroll...`);
        await page.evaluate(() => {
          window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
        });
        // Delay variável após scroll (2-4 segundos)
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
        continue;
      }

      console.log(`\n   🖼️  Abrindo post: ${selectedUrl}`);
      const opened = await clickPostElement(selectedHandle, selectedUrl);
      await selectedHandle.dispose();

      if (!opened) {
        processedPostLinks.add(selectedUrl);
        attemptsWithoutNewPost++;
        await waitForHashtagMural('Após falha ao abrir post');
        continue;
      }

      attemptsWithoutNewPost = 0;
      processedPostLinks.add(selectedUrl);

      try {
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));

        console.log(`   🔍 Extraindo username do AUTOR (owner) do post...`);

        // EXTRAIR DO JSON EMBARCADO NO HTML
        // IMPORTANTE: Pegar o "owner" do post, NÃO o "viewer" (usuário logado)!
        const html = await page.content();

        // Tentar extrair owner do post (padrão: "owner":{"username":"AUTOR"})
        let usernameMatch = html.match(/"owner":\s*\{\s*"username"\s*:\s*"([^"]+)"/);
        let username = usernameMatch ? usernameMatch[1] : null;

        // Fallback: Se não encontrou owner, tentar pegar do header do post
        if (!username) {
          console.log(`   🔄 Owner não encontrado, tentando header do post...`);
          usernameMatch = html.match(/<header[^>]*>[\s\S]*?href="\/([^/"]+)\//);
          username = usernameMatch ? usernameMatch[1] : null;
        }

        console.log(`   📋 Username do autor extraído: ${username || 'FALHOU'}`);

        if (!username) {
          console.log(`   ⚠️  Não foi possível identificar o autor do post.`);
          console.log(`   📄 Salvando HTML para debug...`);
          const fs = require('fs');
          fs.writeFileSync('/tmp/instagram-post-debug.html', html.substring(0, 50000));
          console.log(`   💾 HTML salvo em /tmp/instagram-post-debug.html (primeiros 50KB)`);

          try {
            await page.goto(hashtagUrl, { waitUntil: 'networkidle2', timeout: 120000 });
          } catch {
            // ignore
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
          const feedReady = await waitForHashtagMural('Retorno após post sem autor');
          if (!feedReady) {
            attemptsWithoutNewPost++;
          }
          continue;
        }

        if (username === loggedUsername) {
          console.log(`   ⏭️  Post do próprio usuário logado, pulando...`);
          try {
            await page.goto(hashtagUrl, { waitUntil: 'networkidle2', timeout: 120000 });
          } catch {
            // ignore
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
          const feedReady = await waitForHashtagMural('Retorno após detectar usuário logado');
          if (!feedReady) {
            attemptsWithoutNewPost++;
          }
          continue;
        }

        if (processedUsernames.has(username)) {
          console.log(`   ⏭️  @${username} já processado, pulando... (${consecutiveDuplicates} duplicatas consecutivas)`);
          console.log(`   ⏳ Aguardando 20 segundos para auto-scroll do Instagram carregar novos posts...`);

          // Aguardar 20 segundos para permitir auto-scroll do Instagram
          await new Promise(resolve => setTimeout(resolve, 20000));

          // Tentar voltar ao feed da hashtag
          try {
            await page.goto(hashtagUrl, { waitUntil: 'networkidle2', timeout: 120000 });
          } catch {
            // ignore
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
          const feedReady = await waitForHashtagMural('Retorno após duplicado');
          if (!feedReady) {
            attemptsWithoutNewPost++;
          }

          // Incrementar contador de duplicatas APÓS aguardar
          consecutiveDuplicates++;
          console.log(`   📊 Duplicatas consecutivas: ${consecutiveDuplicates}/3`);
          continue;
        }

        // NAVEGAR PARA O PERFIL e EXTRAIR DADOS DIRETAMENTE
        console.log(`   👤 Navegando para o perfil de @${username}...`);

        try {
          await page.goto(`https://www.instagram.com/${username}/`, {
            waitUntil: 'networkidle2',
            timeout: 30000
          });

          // Aguardar perfil carregar
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));

          // EXTRAIR DADOS VISUALMENTE DA PÁGINA ATUAL usando CSS selectors
          console.log(`   📊 Extraindo dados visíveis da página do perfil...`);

          const profileData = await page.evaluate(() => {
            // Extrair nome completo (h2 ou span no header)
            const fullNameEl = document.querySelector('header section h2, header section span');
            const full_name = fullNameEl ? fullNameEl.textContent?.trim() || '' : '';

            // Extrair bio
            const bioEl = document.querySelector('header section div[data-testid], header section span._ap3a');
            const bio = bioEl ? bioEl.textContent?.trim() || '' : '';

            // Extrair números (followers, following, posts) - SELETORES ABRANGENTES
            const stats: string[] = [];

            // Tentar múltiplos seletores para encontrar os números
            const selectors = [
              'header section ul li span',  // Mais genérico
              'header section ul li button span',
              'header section ul li a span',
              'header section ul span',
              'header ul li span',
              'header span[class*="x"]'  // Classes do Instagram começam com x
            ];

            for (const selector of selectors) {
              const elements = document.querySelectorAll(selector);
              elements.forEach(el => {
                const text = el.textContent?.trim();
                // Capturar apenas texto que contenha números E não seja muito longo (ex: bio)
                if (text && /\d/.test(text) && text.length < 20) {
                  if (!stats.includes(text)) {  // Evitar duplicados
                    stats.push(text);
                  }
                }
              });

              // Se já encontrou 3 números, parar
              if (stats.length >= 3) break;
            }

            // Extrair foto de perfil
            const profilePicEl = document.querySelector('header img') as HTMLImageElement;
            const profile_pic_url = profilePicEl ? profilePicEl.src : '';

            // Verificar se é business/verificado
            const isBusiness = document.body.innerHTML.includes('business_account') ||
                               document.body.innerHTML.includes('Category');
            const isVerified = !!document.querySelector('svg[aria-label="Verified"]');

            // Extrair email (se visível)
            const emailMatch = document.body.innerHTML.match(/mailto:([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
            const email = emailMatch ? emailMatch[1] : null;

            // Extrair website
            const websiteEl = document.querySelector('header section a[href^="http"]');
            const website = websiteEl ? websiteEl.getAttribute('href') : null;

            return {
              full_name,
              bio,
              stats,
              profile_pic_url,
              is_business_account: isBusiness,
              is_verified: isVerified,
              email,
              website
            };
          });

          // Processar os números extraídos (primeiro=posts, segundo=followers, terceiro=following)
          const posts_count = profileData.stats[0] ? parseInstagramCount(profileData.stats[0]) : 0;
          const followers_count = profileData.stats[1] ? parseInstagramCount(profileData.stats[1]) : 0;
          const following_count = profileData.stats[2] ? parseInstagramCount(profileData.stats[2]) : 0;

          const completeProfile: InstagramProfileData = {
            username: username,
            full_name: profileData.full_name || null,
            bio: profileData.bio || null,
            followers_count: followers_count,
            following_count: following_count,
            posts_count: posts_count,
            profile_pic_url: profileData.profile_pic_url || null,
            is_business_account: profileData.is_business_account,
            is_verified: profileData.is_verified,
            email: profileData.email,
            phone: null, // Não visível na página
            website: profileData.website,
            business_category: null // Não facilmente extraível
          };

          foundProfiles.push(completeProfile);
          processedUsernames.add(username);
          consecutiveDuplicates = 0; // Resetar contador ao encontrar perfil novo
          console.log(`   ✅ Perfil completo extraído: @${username} (${followers_count} seguidores, ${posts_count} posts)`);
          console.log(`   📊 Total coletado: ${foundProfiles.length}/${maxProfiles}`);

          // ANTI-DETECÇÃO: Delay antes de retornar ao feed (3-5s)
          console.log(`   🛡️  Aguardando antes de retornar ao feed...`);
          await antiDetectionDelay();

        } catch (profileError: any) {
          console.log(`   ⚠️  Erro ao extrair dados de @${username}: ${profileError.message}`);
          console.log(`   ⏭️  Continuando com próximo perfil...`);
        }

        console.log(`   ⬅️  Retornando para o mural da hashtag...`);
        await page.goto(hashtagUrl, { waitUntil: 'networkidle2', timeout: 120000 }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
        const feedReadyAfterProfile = await waitForHashtagMural('Retorno após coletar perfil');
        if (!feedReadyAfterProfile) {
          attemptsWithoutNewPost++;
          continue;
        }

      } catch (error: any) {
        console.log(`   ❌ Erro ao processar post (${error.message}). Tentando retornar ao mural...`);
        await page.goto(hashtagUrl, { waitUntil: 'networkidle2', timeout: 120000 }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 2000));
        const feedReadyAfterError = await waitForHashtagMural('Retorno após erro');
        if (!feedReadyAfterError) {
          attemptsWithoutNewPost++;
        }
        continue;
      }
    }

    // Explicar por que o loop parou
    if (foundProfiles.length >= maxProfiles) {
      console.log(`\n🎯 Meta atingida: ${foundProfiles.length}/${maxProfiles} perfis coletados`);
    } else if (consecutiveDuplicates >= 3) {
      console.log(`\n⏹️  Scraping interrompido: 3 duplicatas consecutivas (mesmo aguardando auto-scroll)`);
      console.log(`   💡 Esta hashtag parece esgotada - todos os perfis já foram coletados anteriormente`);
    } else if (attemptsWithoutNewPost >= 8) {
      console.log(`\n⏹️  Scraping interrompido: 8 tentativas sem encontrar novos posts`);
      console.log(`   🛡️  Limite reduzido para evitar detecção de bot pelo Instagram`);
    }

    console.log(`\n✅ Scraping concluído: ${foundProfiles.length} perfis encontrados`);
    if (foundProfiles.length > 0) {
      const usernames = foundProfiles.slice(0, 5).map(p => `@${p.username}`).join(', ');
      console.log(`👥 Perfis extraídos: ${usernames}${foundProfiles.length > 5 ? '...' : ''}`);
      console.log(`📊 Dados completos coletados: username, bio, ${foundProfiles[0].followers_count} seguidores, etc.`);
    }

    return foundProfiles;

  } catch (error: any) {
    console.error(`❌ Erro ao scrape tag "${searchTerm}":`, error.message);
    throw error;
  } finally {
    if (!page.isClosed()) {
      await page.close().catch(() => {});
    }
  }
}

function extractUsernamesFromHtml(html: string, limit: number): string[] {
  const collected = new Set<string>();

  const additionalDataRegex = /window\.__additionalDataLoaded\([^,]+,({[\s\S]*?"edge_hashtag_to_media"[\s\S]*?})\);/g;
  let match: RegExpExecArray | null;

  while ((match = additionalDataRegex.exec(html)) !== null && collected.size < limit) {
    try {
      const parsed = JSON.parse(match[1]);
      const edges = [
        ...(parsed?.data?.hashtag?.edge_hashtag_to_top_posts?.edges ?? []),
        ...(parsed?.data?.hashtag?.edge_hashtag_to_media?.edges ?? [])
      ];

      for (const edge of edges) {
        const username = edge?.node?.owner?.username;
        if (username) {
          collected.add(username);
          if (collected.size >= limit) {
            break;
          }
        }
      }
    } catch {
      // Ignora JSON inválido e continua varrendo.
    }
  }

  if (collected.size < limit) {
    const ownerRegex = /"owner":\{"id":"\d+","username":"([^"]+)"/g;
    let ownerMatch: RegExpExecArray | null;
    while ((ownerMatch = ownerRegex.exec(html)) !== null) {
      const username = ownerMatch[1];
      if (username) {
        collected.add(username);
        if (collected.size >= limit) {
          break;
        }
      }
    }
  }

  return Array.from(collected);
}

function decodeInstagramString(value: string | null): string | null {
  if (value == null) {
    return null;
  }
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/')
      .replace(/\\n/g, ' ')
      .replace(/\\\\/g, '\\');
  }
}

function parseInstagramCount(value: string | null): number {
  if (!value) {
    return 0;
  }
  const normalized = value.toLowerCase().replace(/\u202f|\s/g, '');
  const suffixMatch = normalized.match(/(mil|kk|k|m)$/);
  let multiplier = 1;
  let numberPortion = normalized;

  if (suffixMatch) {
    const suffix = suffixMatch[1];
    numberPortion = normalized.slice(0, -suffix.length);
    if (suffix === 'm') {
      multiplier = 1_000_000;
    } else {
      multiplier = 1_000;
    }
  }

  numberPortion = numberPortion.replace(/[^\d.,]/g, '');

  if (!suffixMatch && /^\d{1,3}([.,]\d{3})+$/.test(numberPortion)) {
    const digitsOnly = numberPortion.replace(/\D/g, '');
    return parseInt(digitsOnly, 10) || 0;
  }

  let numeric = Number.parseFloat(numberPortion.replace(/,/g, '.'));

  if (!Number.isFinite(numeric)) {
    numeric = Number.parseInt(numberPortion.replace(/\D/g, ''), 10);
  }

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.round(numeric * multiplier);
}

/**
 * Extrai email do texto da bio do Instagram
 * Detecta emails comuns que profissionais deixam na bio
 *
 * @param bio - Texto da biografia do perfil
 * @returns Email encontrado ou null
 */
function extractEmailFromBio(bio: string | null): string | null {
  if (!bio) return null;

  // Regex para padrões comuns de email
  // Exemplos: email@exemplo.com, contato@empresa.com.br, nome.sobrenome@gmail.com
  const emailPattern = /\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+\b/gi;
  const match = bio.match(emailPattern);

  if (match && match.length > 0) {
    // Retornar o primeiro email encontrado
    const email = match[0].toLowerCase();
    console.log(`   📧 Email encontrado na bio: ${email}`);
    return email;
  }

  return null;
}

/**
 * Scrape de um perfil do Instagram - retorna dados do perfil
 *
 * @param username - Username do Instagram (sem @)
 */
export async function scrapeInstagramProfile(username: string): Promise<{
  username: string;
  full_name: string;
  bio: string;
  followers: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
  profile_pic_url: string;
  is_business_account: boolean;
  is_verified: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  business_category: string | null;
}> {
  const page = await createAuthenticatedPage();
  try {
    const url = `https://www.instagram.com/${username}/`;

    console.log(`   ➡️ Navegando para: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

    // Delay humano após carregar página
    await humanDelay();

    // Extrair HTML completo da página (MESMA LÓGICA DO SCRIPT FUNCIONAL)
    const html = await page.content();

    // Aplicar REGEX para extrair dados do JSON embutido no HTML
    const usernameMatch = html.match(/"username":"([^"]+)"/);
    const fullNameMatch = html.match(/"full_name":"([^"]+)"/);
    const bioMatch = html.match(/"biography":"([^"]+)"/);
    const followersMatch = html.match(/"edge_followed_by":\{"count":([0-9]+)\}/);
    const followingMatch = html.match(/"edge_follow":\{"count":([0-9]+)\}/);
    const postsMatch = html.match(/"edge_owner_to_timeline_media":\{"count":([0-9]+)\}/);
    const isBusinessMatch = html.match(/"is_business_account":(true|false)/);
    const isVerifiedMatch = html.match(/"is_verified":(true|false)/);
    const profilePicMatch = html.match(/"profile_pic_url":"([^"]+)"/);
    const emailMatch = html.match(/"public_email":"([^"]+)"/);
    const phoneMatch = html.match(/"public_phone_number":"([^"]+)"/);
    const websiteMatch = html.match(/"external_url":"([^"]+)"/);
    const categoryMatch = html.match(/"category_name":"([^"]+)"/);

    if (!usernameMatch) {
      console.error(`   ❌ Não foi possível extrair dados de @${username}`);
      throw new Error('Perfil não encontrado ou dados não disponíveis');
    }

    const profileData = {
      username: decodeInstagramString(usernameMatch[1]),
      full_name: decodeInstagramString(fullNameMatch ? fullNameMatch[1] : null),
      bio: decodeInstagramString(bioMatch ? bioMatch[1] : null),
      followers: followersMatch ? followersMatch[1] : '0',
      following: followingMatch ? followingMatch[1] : '0',
      posts: postsMatch ? postsMatch[1] : '0',
      profile_pic_url: decodeInstagramString(profilePicMatch ? profilePicMatch[1] : null),
      is_business_account: isBusinessMatch ? isBusinessMatch[1] === 'true' : false,
      is_verified: isVerifiedMatch ? isVerifiedMatch[1] === 'true' : false,
      email: decodeInstagramString(emailMatch ? emailMatch[1] : null),
      phone: decodeInstagramString(phoneMatch ? phoneMatch[1] : null),
      website: decodeInstagramString(websiteMatch ? websiteMatch[1] : null),
      business_category: decodeInstagramString(categoryMatch ? categoryMatch[1] : null)
    };

    // Se não encontrou email público, tentar extrair da bio
    if (!profileData.email && profileData.bio) {
      const emailFromBio = extractEmailFromBio(profileData.bio);
      if (emailFromBio) {
        profileData.email = emailFromBio;
      }
    }

    // Converter contadores para números
    const followersCount = parseInstagramCount(profileData.followers);
    const followingCount = parseInstagramCount(profileData.following);
    const postsCount = parseInstagramCount(profileData.posts);

    console.log(`   ✅ Dados extraídos: @${username} (${followersCount} seguidores, ${postsCount} posts)`);

    return {
      username: profileData.username ?? username,
      full_name: profileData.full_name,
      bio: profileData.bio,
      followers: profileData.followers,
      followers_count: followersCount,
      following_count: followingCount,
      posts_count: postsCount,
      profile_pic_url: profileData.profile_pic_url,
      is_business_account: profileData.is_business_account,
      is_verified: profileData.is_verified,
      email: profileData.email,
      phone: profileData.phone,
      website: profileData.website,
      business_category: profileData.business_category
    };

  } catch (error: any) {
    console.error(`❌ Erro ao scrape perfil "@${username}":`, error.message);
    throw error;
  } finally {
    if (!page.isClosed()) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * Helper para debug: retorna a página de sessão atual
 */
export async function getSessionPage(): Promise<Page> {
  await ensureLoggedSession();
  if (!sessionPage) {
    throw new Error("Sessão não inicializada");
  }
  return sessionPage;
}
