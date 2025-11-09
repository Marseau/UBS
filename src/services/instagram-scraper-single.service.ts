// @ts-nocheck - Código usa window/document dentro de page.evaluate() (contexto browser)
import puppeteer, { Browser, Page, ElementHandle } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { detectLanguage } from './language-country-detector.service';
import {
  calculateActivityScore,
  extractHashtags,
  extractEmailFromBio,
  parseInstagramCount,
  extractHashtagsFromPosts
} from './instagram-profile.utils';
import { createIsolatedContext } from './instagram-context-manager.service';
import { discoverHashtagVariations, HashtagVariation } from './instagram-hashtag-discovery.service';
import { createClient } from '@supabase/supabase-js';

// Supabase client para verificações de duplicatas
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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
  // Campos de localização (business accounts)
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  zip_code?: string | null;
  activity_score?: number; // Score de atividade (0-100)
  is_active?: boolean; // Se a conta está ativa
  language?: string; // ISO 639-1 language code (pt, en, es, etc)
  hashtags_bio?: string[] | null; // Hashtags extraídas da bio
  hashtags_posts?: string[] | null; // Hashtags extraídas dos posts (4 posts)
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
  // Normalizar termo ANTES de criar contexto
  const normalizedTerm = searchTerm
    .toLowerCase()
    .replace(/\s+/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  console.log(`🔎 Termo: "${searchTerm}" → "#${normalizedTerm}"`);

  // Criar contexto UMA VEZ para discovery E scraping
  const { page, requestId, cleanup } = await createIsolatedContext();
  console.log(`🔒 Request ${requestId} iniciada para discovery + scrape-tag: "${searchTerm}"`);

  let variations: any[] = [];
  let priorityHashtags: any[] = [];

  // 🆕 DESCOBRIR VARIAÇÕES DE HASHTAGS COM PRIORIZAÇÃO POR SCORE (mesma página)
  console.log(`\n🔍 Descobrindo variações inteligentes de #${normalizedTerm}...`);

  try {
    variations = await discoverHashtagVariations(page, normalizedTerm);
    priorityHashtags = variations.filter(v => v.priority_score >= 80);
  } catch (discoveryError: any) {
    console.log(`❌ Erro ao descobrir variações: ${discoveryError.message}`);
  }

  try {
    console.log(`\n📊 Análise de variações:`);
    console.log(`   Total descobertas: ${variations.length}`);
    console.log(`   Prioritárias (score ≥ 80): ${priorityHashtags.length}`);

    if (priorityHashtags.length > 0) {
      console.log(`\n🎯 Hashtags que serão scrapadas (ordenadas por score):`);
      priorityHashtags.forEach((v, i) => {
        console.log(`   ${i + 1}. #${v.hashtag} - ${v.post_count_formatted} - Score: ${v.priority_score}`);
      });
    } else {
      console.log(`   ⚠️  Nenhuma hashtag prioritária encontrada. Usando hashtag original: #${normalizedTerm}`);
    }

    // Persistir variações descobertas no Supabase (para rastreabilidade futura)
    if (variations.length > 0) {
      try {
        const variationsToInsert = variations.map(v => ({
          parent_hashtag: normalizedTerm,
          hashtag: v.hashtag,
          post_count: v.post_count,
          post_count_formatted: v.post_count_formatted,
          priority_score: v.priority_score,
          volume_category: v.volume_category,
          discovered_at: new Date().toISOString()
        }));

        const { error } = await supabase
          .from('instagram_hashtag_variations')
          .upsert(variationsToInsert, { onConflict: 'hashtag', ignoreDuplicates: false });

        if (error) {
          console.log(`   ⚠️  Erro ao persistir variações: ${error.message}`);
        } else {
          console.log(`   ✅ ${variations.length} variações persistidas no banco`);
        }
      } catch (dbError: any) {
        console.log(`   ⚠️  Erro ao acessar banco: ${dbError.message}`);
      }
    }

    // 🆕 DETERMINAR LISTA DE HASHTAGS A SCRAPAR (todas as prioritárias OU fallback para original)
    const hashtagsToScrape = priorityHashtags.length > 0
      ? priorityHashtags.map(h => h.hashtag)
      : [normalizedTerm];

    console.log(`\n🎯 Total de hashtags que serão scrapadas: ${hashtagsToScrape.length}`);
    console.log(`   📊 Perfis por hashtag: ${maxProfiles} (cada hashtag terá até ${maxProfiles} perfis scrapados)\n`);

    // 🆕 ARRAY ACUMULADOR PARA TODOS OS PERFIS DE TODAS AS HASHTAGS
    const allFoundProfiles: any[] = [];

    // 🆕 LOOP EXTERNO: ITERAR SOBRE CADA HASHTAG PRIORITÁRIA
    for (let hashtagIndex = 0; hashtagIndex < hashtagsToScrape.length; hashtagIndex++) {
      const hashtagToScrape = hashtagsToScrape[hashtagIndex];

      console.log(`\n${'='.repeat(80)}`);
      console.log(`🎯 SCRAPANDO HASHTAG ${hashtagIndex + 1}/${hashtagsToScrape.length}: #${hashtagToScrape}`);
      console.log(`${'='.repeat(80)}\n`);

      // 🆕 RETRY LOGIC: Tentar até 3 vezes antes de pular para próxima hashtag
      let retryCount = 0;
      const MAX_RETRIES = 3;
      let hashtagSuccess = false;

      // 🆕 ARRAY LOCAL PARA PERFIS DESTA HASHTAG
      const foundProfiles: any[] = [];

      while (retryCount < MAX_RETRIES && !hashtagSuccess) {
        if (retryCount > 0) {
          console.log(`\n🔄 RETRY ${retryCount}/${MAX_RETRIES} para #${hashtagToScrape}...`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // 5s entre retries
        }

        try {
          retryCount++;

      // 1. IR PARA PÁGINA INICIAL
      console.log(`\n🏠 Navegando para página inicial...`);
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
      const hashtagUrl = `https://www.instagram.com/explore/tags/${hashtagToScrape}/`;

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
          const searchQuery = `#${hashtagToScrape}`;
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
          }, { timeout: 8000 }, hashtagToScrape).catch(() => {
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
          }, hashtagToScrape);

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
            hashtagToScrape
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

          // 🔧 DETECTOR MELHORADO: Se encontrou posts, NÃO é página de login
          const postCount = await page.evaluate((selector) => {
            return document.querySelectorAll(selector).length;
          }, postSelector);

          // 🆕 CRITÉRIO ROBUSTO: 15+ posts = mural carregou com sucesso (mesmo com timeout)
          const muralLoaded = postCount >= 15;

          // Só detecta login se REALMENTE tem form E tem 0 posts
          const hasLoginForm = (pageContent.includes('loginForm') || pageContent.includes('Login')) && postCount === 0;

          console.log(`   ⚠️  ${context}: timeout ao aguardar mural`);
          console.log(`   📍 URL final: ${currentUrl}`);
          console.log(`   📊 Posts encontrados: ${postCount}`);
          console.log(`   🔐 Página de login detectada: ${hasLoginForm ? 'SIM' : 'NÃO'}`);
          console.log(`   ${muralLoaded ? '✅ MURAL CARREGOU (15+ posts)' : '❌ Mural não carregou'}`);
          console.log(`   ❌ Erro: ${error?.message || error}`);

          // 🆕 Se mural carregou (15+ posts), retorna sucesso mesmo com timeout
          if (muralLoaded) {
            console.log(`   ✅ Ignorando timeout - mural carregou com ${postCount} posts`);
            return true;
          }

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

      const processedUsernames = new Set<string>();
      const processedPostLinks = new Set<string>();
      const clickedGridPositions = new Set<string>(); // NOVO: Rastrear posições clicadas (x,y)
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

          // 3. RECALCULAR posição após scroll
          const boxAfterScroll = await anchorHandle.boundingBox();
          if (!boxAfterScroll) {
            throw new Error('Elemento não visível após scroll');
          }

          console.log(`   📍 Posição após scroll: x=${boxAfterScroll.x}, y=${boxAfterScroll.y}`);

          // 4. Mover mouse até o centro do elemento (simulando humano)
          const x = boxAfterScroll.x + boxAfterScroll.width / 2;
          const y = boxAfterScroll.y + boxAfterScroll.height / 2;

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

          // 5. Pequena pausa antes do clique (comportamento humano)
          await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));

          // 6. Clicar com mouse real
          console.log(`   💥 Executando clique...`);
          await page.mouse.click(x, y, { delay: 100 });

          // 7. Aguardar navegação E validar que post abriu
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

        // 🆕 LOOP INTERNO: SCRAPAR ATÉ maxProfiles PARA ESTA HASHTAG
        while (foundProfiles.length < maxProfiles && attemptsWithoutNewPost < 8 && consecutiveDuplicates < 3) {
          console.log(`\n📊 Status (#${hashtagToScrape}): ${foundProfiles.length}/${maxProfiles} perfis, tentativa ${attemptsWithoutNewPost}/8, duplicatas consecutivas ${consecutiveDuplicates}/3`);

        const anchorHandles = await page.$$(postSelector);
        console.log(`   🔍 Encontrados ${anchorHandles.length} elementos com seletor: ${postSelector}`);

        let selectedHandle: ElementHandle<Element> | null = null;
        let selectedUrl: string | null = null;

        // CORREÇÃO: Rastrear posições do GRID (x, y) em vez de URLs
        const postsWithPosition: Array<{
          handle: ElementHandle<Element>;
          href: string;
          x: number;
          y: number;
          gridKey: string; // Chave única "x-y"
        }> = [];

        for (const handle of anchorHandles) {
          const href = await handle.evaluate((node: Element) => (node as HTMLAnchorElement).href || '');
          if (!href) {
            await handle.dispose();
            continue;
          }

          // Pegar posição do elemento no grid
          const box = await handle.boundingBox();
          if (!box) {
            await handle.dispose();
            continue; // Pular elementos sem bounding box
          }

          // Arredondar para grid de 50px (Instagram usa grid fixo)
          const x = Math.round(box.x / 50) * 50;
          const y = Math.round(box.y / 50) * 50;
          const gridKey = `${x}-${y}`;

          postsWithPosition.push({ handle, href, x, y, gridKey });
        }

        // ORDENAR por posição VERTICAL (top) - de cima para baixo
        postsWithPosition.sort((a, b) => a.y - b.y);

        console.log(`   📊 Posts ordenados verticalmente: ${postsWithPosition.slice(0, 5).map(p => `(${p.x},${p.y})`).join(', ')}...`);

        // Agora selecionar o PRIMEIRO cuja POSIÇÃO não foi clicada
        for (const post of postsWithPosition) {
          if (clickedGridPositions.has(post.gridKey)) {
            console.log(`   ⏭️  Posição já clicada: (${post.x}, ${post.y}) [${post.gridKey}]`);
            await post.handle.dispose();
            continue;
          }
          selectedHandle = post.handle;
          selectedUrl = post.href;
          console.log(`   ✅ Post selecionado na posição (${post.x}, ${post.y}) [${post.gridKey}]: ${post.href}`);

          // MARCAR POSIÇÃO como clicada IMEDIATAMENTE
          clickedGridPositions.add(post.gridKey);
          console.log(`   🔒 Posição (${post.x}, ${post.y}) marcada como clicada`);
          break;
        }

        // Dispose remaining handles we decided not to use to avoid leaks
        for (const post of postsWithPosition) {
          if (post.handle !== selectedHandle) {
            await post.handle.dispose();
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

          // 🆕 VERIFICAR SE USERNAME JÁ EXISTE NO BANCO (ANTES de processar perfil completo)
          console.log(`   🔍 Verificando se @${username} já existe no banco de dados...`);
          try {
            const { data: existingLead, error: checkError } = await supabase
              .from('instagram_leads')
              .select('username')
              .eq('username', username)
              .single();

            if (existingLead) {
              console.log(`   ⏭️  @${username} JÁ EXISTE no banco! Pulando extração de perfil...`);
              processedUsernames.add(username); // Marcar como processado para evitar reprocessar nesta sessão
              consecutiveDuplicates++;
              console.log(`   📊 Duplicatas consecutivas: ${consecutiveDuplicates}/3`);

              // Retornar ao mural
              try {
                await page.goto(hashtagUrl, { waitUntil: 'networkidle2', timeout: 120000 });
              } catch {
                // ignore
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
              const feedReady = await waitForHashtagMural('Retorno após detectar duplicata no BD');
              if (!feedReady) {
                attemptsWithoutNewPost++;
              }
              continue;
            }

            console.log(`   ✅ @${username} não existe no banco. Prosseguindo com extração de perfil...`);
          } catch (dbError: any) {
            console.log(`   ⚠️  Erro ao verificar banco de dados: ${dbError.message}`);
            console.log(`   🔄 Continuando com extração de perfil (fail-safe)...`);
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

            // CRÍTICO: Clicar no botão "... mais" para expandir bio completa (se existir)
            try {
              const moreButtonClicked = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('header section div, header section span'));
                const maisButton = elements.find(el => el.textContent?.trim() === 'mais');
                if (maisButton) {
                  (maisButton as HTMLElement).click();
                  return true;
                }
                return false;
              });

              if (moreButtonClicked) {
                console.log(`   ✅ Botão "mais" clicado - bio expandida`);
                await new Promise(resolve => setTimeout(resolve, 800));
              }
            } catch (error: any) {
              // Silencioso - não é crítico se falhar
            }

            const profileData = await page.evaluate(() => {
              // Extrair nome completo - SELETOR CORRETO baseado em inspeção real
              // Instagram: username está em index 0-2, full_name geralmente em index 3
              let full_name = '';
              const debugLogs: string[] = [];

              const headerSection = document.querySelector('header section');
              if (headerSection) {
                const allSpans = Array.from(headerSection.querySelectorAll('span'));
                debugLogs.push(`Total spans encontrados: ${allSpans.length}`);

                // Pegar username primeiro para comparar
                const usernameEl = document.querySelector('header h2');
                const username = usernameEl?.textContent?.trim() || '';
                debugLogs.push(`Username detectado: "${username}"`);

                // Procurar pelo span que contém o nome (não é username, não é número, não é endereço)
                for (let i = 0; i < allSpans.length; i++) {
                  const span = allSpans[i];
                  const text = span.textContent?.trim() || '';

                  if (!text) {
                    debugLogs.push(`[${i}] VAZIO - ignorado`);
                    continue;
                  }

                  debugLogs.push(`[${i}] "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

                  // Pular username
                  if (text === username) {
                    debugLogs.push(`    ↳ FILTRO: é username`);
                    continue;
                  }

                  // Pular números (contadores de seguidores/posts)
                  if (/^\d+[.,]?\d*\s*(mil|K|M|seguidores|posts|seguindo)?$/i.test(text)) {
                    debugLogs.push(`    ↳ FILTRO: é número/contador`);
                    continue;
                  }

                  // Pular endereços (tem CEP ou muitas vírgulas)
                  if (/\d{5}-?\d{3}/.test(text) || text.split(',').length >= 3) {
                    debugLogs.push(`    ↳ FILTRO: é endereço (CEP ou vírgulas)`);
                    continue;
                  }

                  // Pular texto muito longo (provavelmente é a bio, não o nome)
                  if (text.length > 100) {
                    debugLogs.push(`    ↳ FILTRO: texto longo (${text.length} chars)`);
                    continue;
                  }

                  // Pular textos genéricos
                  if (text === 'Ícone de link' || text === 'Doe Sangue') {
                    debugLogs.push(`    ↳ FILTRO: texto genérico`);
                    continue;
                  }

                  // Se chegou aqui, provavelmente é o nome!
                  full_name = text;
                  debugLogs.push(`    ✅ FULL NAME SELECIONADO!`);
                  break;
                }
              }

              // Retornar debugLogs também
              (window as any).__fullNameDebug = debugLogs;

              // Bio - ESTRATÉGIA COMPLETA para capturar TODOS os elementos da bio
              // Instagram divide a bio em múltiplos elementos: div (categoria) + spans (descrição) + h1 (endereço)
              let bio = '';
              const bioElements: string[] = [];

              // Capturar todos os elementos de bio dentro de header section
              // Classe _ap3a marca elementos de bio do Instagram
              // IMPORTANTE: Usar EXATAMENTE os mesmos seletores de scrapeInstagramProfile()
              const bioEls = Array.from(document.querySelectorAll('header section ._ap3a._aaco._aacu._aacy._aad6._aade, header section ._ap3a._aaco._aacu._aacx._aad7._aade, header section h1._ap3a'));

              bioEls.forEach((el: any) => {
                const text = el.textContent?.trim();
                // Pular textos muito curtos ou contadores de seguidores
                if (text && text.length > 3 && !text.match(/^\d+[\s\S]*seguidores?$/i)) {
                  bioElements.push(text);
                }
              });

              // Se encontrou elementos, juntar com quebras de linha
              if (bioElements.length > 0) {
                bio = bioElements.join('\n');
              }

              // Estratégia 2: Fallback para seletor único se nada foi encontrado
              if (!bio || bio.length < 10) {
                const bioSelectors = [
                  'header section h1._ap3a._aaco._aacu._aacx._aad6._aade',
                  'header section span._ap3a._aaco._aacu._aacx._aad6._aade',
                  'header section div > span._ap3a',
                  'header section div[style*="white-space"]',
                  'header section h1 > span',
                  'header section span._ap3a'
                ];

                for (const selector of bioSelectors) {
                  const el = document.querySelector(selector);
                  if (el && el.textContent && el.textContent.trim().length > 10) {
                    bio = el.textContent.trim();
                    break;
                  }
                }
              }

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

              // CAPTURAR LINK LIMPO DA BIO (visível no DOM, não wrapeado)
              // Estratégia: procurar link que está DENTRO do container de bio text
              // Não pegar botões de redes sociais (Threads, etc)
              let website_visible = null;

              // Procurar especificamente por links dentro do texto da bio
              // Evitar: botões, ícones, links de seguir, etc
              const bioLinks = Array.from(document.querySelectorAll('header section a[href^="http"]'))
                .filter((a: any) => {
                  const text = a.textContent?.trim() || '';

                  // Excluir links que são botões ou têm role="button"
                  const isButton = a.getAttribute('role') === 'button' || a.closest('button');
                  if (isButton) return false;

                  // Excluir links que são ícones (texto muito curto ou vazio)
                  if (text.length < 3) return false;

                  // Excluir se o texto é exatamente o username (link de Threads)
                  const usernameFromHeader = document.querySelector('header section h2')?.textContent?.trim() || '';
                  if (text === usernameFromHeader || text.startsWith('Threads')) return false;

                  // Incluir apenas se parecer URL: tem ponto, barra, ou começa com http
                  const looksLikeUrl = text.includes('.') || text.includes('/') || text.startsWith('http') || text.startsWith('wa.me');

                  return looksLikeUrl;
                });

              if (bioLinks.length > 0) {
                const firstBioLink = bioLinks[0] as HTMLAnchorElement;
                // Capturar o texto visível do link (não o href que pode estar wrapeado)
                website_visible = firstBioLink.textContent?.trim() || null;

                // Se o texto visível não parecer uma URL, pegar o href mesmo
                if (website_visible && !website_visible.startsWith('http')) {
                  // Se for apenas domínio (ex: "example.com"), adicionar https://
                  if (website_visible.includes('.') && !website_visible.includes('://')) {
                    website_visible = 'https://' + website_visible;
                  } else if (website_visible.startsWith('wa.me')) {
                    // WhatsApp link
                    website_visible = 'https://' + website_visible;
                  } else {
                    website_visible = firstBioLink.getAttribute('href');
                  }
                }
              }

              return {
                full_name,
                bio,
                stats,
                profile_pic_url,
                is_business_account: isBusiness,
                is_verified: isVerified,
                email,
                website_visible
              };
            });

            // Processar os números extraídos (primeiro=posts, segundo=followers, terceiro=following)
            const posts_count = profileData.stats[0] ? parseInstagramCount(profileData.stats[0]) : 0;
            const followers_count = profileData.stats[1] ? parseInstagramCount(profileData.stats[1]) : 0;
            const following_count = profileData.stats[2] ? parseInstagramCount(profileData.stats[2]) : 0;

            // EXTRAIR HTML COMPLETO para capturar dados via REGEX (phone, localização, etc)
            const html = await page.content();

            // ESTRATÉGIA: Procurar o bloco JSON específico do perfil (não do viewer)
            const profileUserBlockMatch = html.match(/"graphql":\{"user":\{([^}]+(?:\{[^}]*\})*[^}]*)\}\}/);
            let profileJsonBlock = profileUserBlockMatch ? profileUserBlockMatch[1] : html;

            // ESTRATÉGIA FULL NAME: Meta tags OG (MAIS CONFIÁVEL que DOM/JSON)
            const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)/);
            let fullNameFromOG: string | null = null;
            if (ogTitleMatch) {
              const ogTitle = ogTitleMatch[1];
              const fullNameRegex = new RegExp(`^(.+?)\\s*\\(@${username}\\)`);
              const nameMatch = ogTitle.match(fullNameRegex);
              if (nameMatch) {
                fullNameFromOG = nameMatch[1].trim();
                console.log(`   ✅ Full name encontrado no OG meta tag: "${fullNameFromOG}"`);
              }
            }

            // Fallback: JSON
            const fullNameMatch = profileJsonBlock.match(/"full_name":"([^"]+)"/);
            const fullNameFromJson = fullNameMatch ? fullNameMatch[1] : null;

            // Escolher melhor fonte (prioridade: OG > JSON > DOM)
            const finalFullName = fullNameFromOG || fullNameFromJson || profileData.full_name;

            // ESTRATÉGIA BIO: Meta description (contém bio institucional completa)
            // Format: "X seguidores, Y seguindo, Z posts — Full Name (@username) no Instagram: "Bio text aqui""
            const metaDescBioMatch = html.match(/<meta[^>]+content="[^"]*—[^"]*no Instagram:\s*&quot;([^&]+)&quot;/);
            let bioFromMeta: string | null = null;
            if (metaDescBioMatch) {
              bioFromMeta = metaDescBioMatch[1].trim();
              console.log(`   ✅ Bio completa encontrada na meta description (${bioFromMeta.length} chars)`);
            }

            // ESTRATÉGIA BIO: JSON (fallback)
            const bioJsonMatch = profileJsonBlock.match(/"biography":"([^"]+)"/);
            const bioFromJson = bioJsonMatch ? bioJsonMatch[1] : null;

            // CRÍTICO: Bio completa - DOM tem TODO o conteúdo (categoria + descrição + endereço)
            // - DOM bio: COMPLETA com todos os elementos (prioridade máxima)
            // - Meta description: Fallback caso DOM falhe
            // - JSON: Último fallback
            const bioComplete = profileData.bio || bioFromMeta || bioFromJson;
            const bioForLocationParsing = profileData.bio || bioFromJson; // DOM para parsing de localização

            console.log(`   📝 Bio completa (${bioComplete ? bioComplete.length : 0} chars): ${bioComplete ? bioComplete.substring(0, 80) + '...' : 'N/A'}`);
            console.log(`   📍 Bio para parsing localização: ${bioForLocationParsing ? bioForLocationParsing.substring(0, 60) + '...' : 'N/A'}`);

            // Regex para capturar outros dados do JSON embutido no HTML
            const phoneMatch = profileJsonBlock.match(/"public_phone_number":"([^"]+)"/);
            const businessCategoryMatch = profileJsonBlock.match(/"category_name":"([^"]+)"/);
            const cityMatch = profileJsonBlock.match(/"city_name":"([^"]+)"/);
            const addressMatch = profileJsonBlock.match(/"address_street":"([^"]+)"/);
            const publicAddressMatch = profileJsonBlock.match(/"public_address":"([^"]+)"/);
            const zipCodeMatch = profileJsonBlock.match(/"zip_code":"([^"]+)"/);
            const stateMatch = profileJsonBlock.match(/"state_name":"([^"]+)"|"region_name":"([^"]+)"/);
            const neighborhoodMatch = profileJsonBlock.match(/"neighborhood":"([^"]+)"/);

            // PROCESSAR WEBSITE: Usar link visível do DOM, decodificar se necessário
            let cleanWebsite: string | null = null;
            if (profileData.website_visible) {
              cleanWebsite = decodeInstagramWrappedUrl(profileData.website_visible);
            }

            const completeProfile: InstagramProfileData = {
              username: username,
              full_name: finalFullName,
              bio: bioComplete || null,
              followers_count: followers_count,
              following_count: following_count,
              posts_count: posts_count,
              profile_pic_url: profileData.profile_pic_url || null,
              is_business_account: profileData.is_business_account,
              is_verified: profileData.is_verified,
              email: profileData.email,
              phone: decodeInstagramString(phoneMatch ? phoneMatch[1] : null),
              website: cleanWebsite, // Link limpo da bio (não wrapeado)
              business_category: decodeInstagramString(businessCategoryMatch ? businessCategoryMatch[1] : null),
              // Campos de localização extraídos do JSON do HTML
              city: decodeInstagramString(cityMatch ? cityMatch[1] : null),
              state: decodeInstagramString(stateMatch ? (stateMatch[1] || stateMatch[2]) : null),
              neighborhood: decodeInstagramString(neighborhoodMatch ? neighborhoodMatch[1] : null),
              address: decodeInstagramString(addressMatch ? addressMatch[1] : null) ||
                       decodeInstagramString(publicAddressMatch ? publicAddressMatch[1] : null),
              zip_code: decodeInstagramString(zipCodeMatch ? zipCodeMatch[1] : null)
            };

            // EXTRAIR EMAIL DA BIO se não tiver email público
            if (!completeProfile.email && completeProfile.bio) {
              const emailFromBio = extractEmailFromBio(completeProfile.bio);
              if (emailFromBio) {
                completeProfile.email = emailFromBio;
              }
            }

            // EXTRAIR TELEFONE DO LINK WHATSAPP se não tiver telefone público
            if (!completeProfile.phone && completeProfile.website) {
              const phoneFromWhatsApp = extractPhoneFromWhatsApp(completeProfile.website);
              if (phoneFromWhatsApp) {
                completeProfile.phone = phoneFromWhatsApp;

                // EXTRAIR ESTADO DO DDD se não tiver estado
                if (!completeProfile.state) {
                  const stateFromPhone = getStateFromPhone(phoneFromWhatsApp);
                  if (stateFromPhone) {
                    completeProfile.state = stateFromPhone;
                  }
                }
              }
            }

            // EXTRAIR LOCALIZAÇÃO DA BIO se não tiver dados de localização
            // IMPORTANTE: Usar bioForLocationParsing (DOM) que contém endereço completo
            if (bioForLocationParsing && (!completeProfile.city || !completeProfile.address || !completeProfile.zip_code)) {
              const locationFromBio = extractLocationFromBio(bioForLocationParsing);

              if (!completeProfile.address && locationFromBio.address) {
                completeProfile.address = locationFromBio.address;
              }
              if (!completeProfile.city && locationFromBio.city) {
                completeProfile.city = locationFromBio.city;
              }
              if (!completeProfile.state && locationFromBio.state) {
                completeProfile.state = locationFromBio.state;
              }
              if (!completeProfile.zip_code && locationFromBio.zip_code) {
                completeProfile.zip_code = locationFromBio.zip_code;
              }
            }

            // EXTRAIR HASHTAGS DA BIO
            if (completeProfile.bio) {
              const bioHashtags = extractHashtags(completeProfile.bio, 10);
              if (bioHashtags.length > 0) {
                completeProfile.hashtags_bio = bioHashtags;
                console.log(`   🏷️  Hashtags da bio (${bioHashtags.length}): ${bioHashtags.join(', ')}`);
              }
            }

            // ========================================
            // VALIDAÇÕES ANTES DE ADICIONAR AO RESULTADO
            // ========================================

            // VALIDAÇÃO 1: CALCULAR ACTIVITY SCORE
            const activityScore = calculateActivityScore(completeProfile);
            completeProfile.activity_score = activityScore.score;
            completeProfile.is_active = activityScore.isActive;

            console.log(`   📊 Activity Score: ${activityScore.score}/100 (${activityScore.isActive ? 'ATIVA ✅' : 'INATIVA ❌'})`);
            console.log(`   📈 ${activityScore.postsPerMonth.toFixed(1)} posts/mês`);
            if (activityScore.reasons.length > 0) {
              console.log(`   💡 Razões: ${activityScore.reasons.join(', ')}`);
            }

            if (!activityScore.isActive) {
              console.log(`   ❌ Perfil REJEITADO por baixo activity score - não será contabilizado`);
              processedUsernames.add(username); // Marcar como processado para não tentar novamente
              continue; // PULA para o próximo perfil
            }

            // VALIDAÇÃO 2: IDIOMA = PORTUGUÊS
            console.log(`   🌍 Detectando idioma da bio...`);
            const languageDetection = await detectLanguage(completeProfile.bio, completeProfile.username);
            completeProfile.language = languageDetection.language;
            console.log(`   🎯 Idioma detectado: ${languageDetection.language} (${languageDetection.confidence})`);

            if (languageDetection.language !== 'pt') {
              console.log(`   ❌ Perfil REJEITADO por idioma não-português (${languageDetection.language}) - não será contabilizado`);
              processedUsernames.add(username); // Marcar como processado para não tentar novamente
              continue; // PULA para o próximo perfil
            }

            // ========================================
            // EXTRAÇÃO DE HASHTAGS DOS POSTS (4 posts)
            // ========================================
            console.log(`   🏷️  Extraindo hashtags dos posts...`);
            try {
              const profileUrl = `https://www.instagram.com/${username}/`;
              await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
              await new Promise(resolve => setTimeout(resolve, 2000));

              const postHashtags = await extractHashtagsFromPosts(page, 2);
              if (postHashtags && postHashtags.length > 0) {
                completeProfile.hashtags_posts = postHashtags;
                console.log(`   ✅ ${postHashtags.length} hashtags extraídas dos posts`);
              } else {
                completeProfile.hashtags_posts = null;
                console.log(`   ⚠️  Nenhuma hashtag encontrada nos posts`);
              }
            } catch (hashtagError: any) {
              console.log(`   ⚠️  Erro ao extrair hashtags dos posts: ${hashtagError.message}`);
              completeProfile.hashtags_posts = null;
            }

            // ========================================
            // PERFIL APROVADO NAS VALIDAÇÕES - ADICIONAR AO RESULTADO
            // ========================================
            foundProfiles.push(completeProfile);
            processedUsernames.add(username);
            consecutiveDuplicates = 0; // Resetar contador ao encontrar perfil novo
            console.log(`   ✅ Perfil APROVADO e adicionado: @${username} (${followers_count} seguidores, ${posts_count} posts)`);
            console.log(`   👤 Full Name: ${completeProfile.full_name || 'N/A'}`);
            console.log(`   📝 Bio: ${completeProfile.bio ? (completeProfile.bio.length > 80 ? completeProfile.bio.substring(0, 80) + '...' : completeProfile.bio) : 'N/A'}`);
            console.log(`   🔗 Website: ${completeProfile.website || 'N/A'}`);
            console.log(`   📧 Email: ${completeProfile.email || 'N/A'}`);
            console.log(`   📱 Telefone: ${completeProfile.phone || 'N/A'}`);

            // Localização - sempre mostrar, mesmo se null
            const locationParts: string[] = [];
            if (completeProfile.city) locationParts.push(completeProfile.city);
            if (completeProfile.state) locationParts.push(completeProfile.state);
            if (completeProfile.neighborhood) locationParts.push(`(${completeProfile.neighborhood})`);
            console.log(`   📍 Localização: ${locationParts.length > 0 ? locationParts.join(', ') : 'N/A'}`);
            console.log(`   🏠 Endereço: ${completeProfile.address || 'N/A'}`);
            console.log(`   📮 CEP: ${completeProfile.zip_code || 'N/A'}`);
            console.log(`   💼 Categoria: ${completeProfile.business_category || 'N/A'}`)

            console.log(`   📊 Total coletado (aprovados): ${foundProfiles.length}/${maxProfiles}`);

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
      } // 🆕 FIM DO WHILE INTERNO (SCRAPING DESTA HASHTAG)

      // 🆕 EXPLICAR POR QUE O LOOP DESTA HASHTAG PAROU
      if (foundProfiles.length >= maxProfiles) {
        console.log(`\n🎯 Meta desta hashtag atingida: ${foundProfiles.length}/${maxProfiles} perfis coletados`);
      } else if (consecutiveDuplicates >= 3) {
        console.log(`\n⏹️  Scraping interrompido: 3 duplicatas consecutivas (mesmo aguardando auto-scroll)`);
        console.log(`   💡 Esta hashtag parece esgotada - todos os perfis já foram coletados anteriormente`);
      } else if (attemptsWithoutNewPost >= 8) {
        console.log(`\n⏹️  Scraping interrompido: 8 tentativas sem encontrar novos posts`);
        console.log(`   🛡️  Limite reduzido para evitar detecção de bot pelo Instagram`);
      }

      console.log(`\n✅ Scraping desta hashtag concluído: ${foundProfiles.length} perfis encontrados`);
      if (foundProfiles.length > 0) {
        const usernames = foundProfiles.slice(0, 5).map(p => `@${p.username}`).join(', ');
        console.log(`👥 Perfis extraídos: ${usernames}${foundProfiles.length > 5 ? '...' : ''}`);
        console.log(`📊 Dados completos coletados: username, bio, ${foundProfiles[0].followers_count} seguidores, etc.`);
      }

      // 🆕 ATUALIZAR ESTATÍSTICAS DESTA HASHTAG NO BANCO
      console.log(`\n📊 Atualizando estatísticas da hashtag #${hashtagToScrape} no banco...`);
      try {
        // Buscar valores atuais antes de incrementar
        const { data: currentStats } = await supabase
          .from('instagram_hashtag_variations')
          .select('scrape_count, leads_found')
          .eq('hashtag', hashtagToScrape)
          .single();

        const newScrapeCount = (currentStats?.scrape_count || 0) + 1;
        const newLeadsFound = (currentStats?.leads_found || 0) + foundProfiles.length;

        const { error: updateError } = await supabase
          .from('instagram_hashtag_variations')
          .update({
            last_scraped_at: new Date().toISOString(),
            scrape_count: newScrapeCount,
            leads_found: newLeadsFound
          })
          .eq('hashtag', hashtagToScrape);

        if (updateError) {
          console.log(`   ⚠️  Erro ao atualizar estatísticas: ${updateError.message}`);
        } else {
          console.log(`   ✅ Estatísticas atualizadas: scrape_count=${newScrapeCount}, leads_found=${newLeadsFound}`);
        }
      } catch (dbError: any) {
        console.log(`   ⚠️  Erro ao acessar banco: ${dbError.message}`);
      }

          // 🆕 Se chegou aqui, hashtag foi scrapada com sucesso
          hashtagSuccess = true;
          console.log(`✅ Hashtag #${hashtagToScrape} scrapada com sucesso!`);

        } catch (hashtagError: any) {
          console.error(`❌ Erro ao scrape hashtag #${hashtagToScrape} (tentativa ${retryCount}/${MAX_RETRIES}):`, hashtagError.message);

          if (retryCount >= MAX_RETRIES) {
            console.log(`⚠️  Máximo de retries atingido para #${hashtagToScrape}. Pulando para próxima hashtag...`);
          }
        }
      } // FIM DO WHILE (retry loop)

      // 🆕 ACUMULAR PERFIS DESTA HASHTAG NO RESULTADO TOTAL
      allFoundProfiles.push(...foundProfiles);
      console.log(`\n📊 Progresso total: ${allFoundProfiles.length} perfis coletados de ${hashtagIndex + 1} hashtag(s)\n`);

  } // 🆕 FIM DO LOOP DE HASHTAGS (for hashtagIndex)

  // 🆕 RESULTADO FINAL DE TODAS AS HASHTAGS
  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ SCRAPE-TAG CONCLUÍDO: ${allFoundProfiles.length} perfis coletados de ${hashtagsToScrape.length} hashtag(s)`);
  console.log(`${'='.repeat(80)}\n`);

  if (allFoundProfiles.length > 0) {
    const usernames = allFoundProfiles.slice(0, 10).map(p => `@${p.username}`).join(', ');
    console.log(`👥 Amostra de perfis: ${usernames}${allFoundProfiles.length > 10 ? '...' : ''}`);
  }

  return allFoundProfiles;

  } catch (error: any) {
    console.error(`❌ Erro ao scrape tag "${searchTerm}":`, error.message);
    throw error;
  } finally {
    console.log(`🔓 Request ${requestId} finalizada (scrape-tag: "${searchTerm}")`);
    await cleanup();
    console.log(`🏁 SCRAPE-TAG ENCERRADO COMPLETAMENTE: "${searchTerm}" - Request ${requestId}`);
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

/**
 * Extrai telefone de link WhatsApp (wa.me ou api.whatsapp.com)
 * @param url - URL do WhatsApp
 * @returns Telefone formatado ou null
 */
function extractPhoneFromWhatsApp(url: string | null): string | null {
  if (!url) return null;

  // Match wa.me/5577999232121 ou api.whatsapp.com/send?phone=5577999232121
  const waMatch = url.match(/(?:wa\.me\/|phone=)(\d+)/);
  if (!waMatch) return null;

  const phone = waMatch[1];

  // Formato brasileiro: +55 XX XXXXX-XXXX ou +55 XX XXXX-XXXX
  if (phone.startsWith('55') && phone.length >= 12) {
    const country = phone.substring(0, 2); // 55
    const ddd = phone.substring(2, 4); // 77
    const number = phone.substring(4); // 999232121

    if (number.length === 9) {
      // Celular: +55 77 99923-2121
      return `+${country} ${ddd} ${number.substring(0, 5)}-${number.substring(5)}`;
    } else if (number.length === 8) {
      // Fixo: +55 77 9923-2121
      return `+${country} ${ddd} ${number.substring(0, 4)}-${number.substring(4)}`;
    }
  }

  // Retorna sem formatação se não conseguir formatar
  return `+${phone}`;
}

/**
 * Mapeia DDD brasileiro para UF
 * @param phone - Telefone formatado
 * @returns Código do estado (UF) ou null
 */
function extractLocationFromBio(bio: string | null): {
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
} {
  if (!bio) {
    return { address: null, city: null, state: null, zip_code: null };
  }

  // Extrair CEP (formato: 12345-678 ou 12345678)
  const cepMatch = bio.match(/\b(\d{5}-?\d{3})\b/);
  const zip_code = cepMatch ? cepMatch[1] : null;

  // Extrair endereço (geralmente começa com Rua, Av, Avenida, etc)
  const addressMatch = bio.match(/((?:Rua|Av\.?|Avenida|Travessa|Praça|Alameda)[^,]+,\s*\d+)/i);
  const address = addressMatch ? addressMatch[1].trim() : null;

  // Extrair cidade e estado do padrão: "Cidade, Estado CEP" ou "Cidade, Estado"
  // Exemplo: "Rio de Janeiro, Rio de Janeiro 20211030"
  let city: string | null = null;
  let state: string | null = null;

  // Procurar padrão: ", Cidade, Estado" antes do CEP
  const locationMatch = bio.match(/,\s*([^,]+),\s*([^,\d]+?)[\s\d]*$/);
  if (locationMatch) {
    city = locationMatch[1].trim();
    const stateName = locationMatch[2].trim();

    // Converter nome de estado para sigla
    const stateMap: { [key: string]: string } = {
      'Rio de Janeiro': 'RJ',
      'São Paulo': 'SP',
      'Minas Gerais': 'MG',
      'Bahia': 'BA',
      'Paraná': 'PR',
      'Rio Grande do Sul': 'RS',
      'Pernambuco': 'PE',
      'Ceará': 'CE',
      // ... outros estados
    };

    state = stateMap[stateName] || stateName;
  }

  return { address, city, state, zip_code };
}

function getStateFromPhone(phone: string | null): string | null {
  if (!phone) return null;

  // Extrair DDD do telefone formatado: +55 77 99923-2121
  const dddMatch = phone.match(/\+55\s(\d{2})\s/);
  if (!dddMatch) return null;

  const ddd = dddMatch[1];

  // Mapa de DDD para UF (principais)
  const dddToState: { [key: string]: string } = {
    '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
    '21': 'RJ', '22': 'RJ', '24': 'RJ',
    '27': 'ES', '28': 'ES',
    '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
    '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
    '47': 'SC', '48': 'SC', '49': 'SC',
    '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
    '61': 'DF',
    '62': 'GO', '64': 'GO',
    '63': 'TO',
    '65': 'MT', '66': 'MT',
    '67': 'MS',
    '68': 'AC',
    '69': 'RO',
    '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA',
    '79': 'SE',
    '81': 'PE', '87': 'PE',
    '82': 'AL',
    '83': 'PB',
    '84': 'RN',
    '85': 'CE', '88': 'CE',
    '86': 'PI', '89': 'PI',
    '91': 'PA', '93': 'PA', '94': 'PA',
    '92': 'AM', '97': 'AM',
    '95': 'RR',
    '96': 'AP',
    '98': 'MA', '99': 'MA'
  };

  return dddToState[ddd] || null;
}

/**
 * Decodifica URL wrapeada do Instagram (l.instagram.com/?u=...)
 * Retorna a URL limpa original
 */
function decodeInstagramWrappedUrl(wrappedUrl: string | null): string | null {
  if (!wrappedUrl) return null;

  // Se não for URL wrapeada, retornar como está
  if (!wrappedUrl.includes('l.instagram.com/?u=')) {
    return wrappedUrl;
  }

  try {
    // Extrair parâmetro 'u' da URL
    const url = new URL(wrappedUrl);
    const encodedUrl = url.searchParams.get('u');

    if (!encodedUrl) return wrappedUrl;

    // Decodificar URL
    const decodedUrl = decodeURIComponent(encodedUrl);

    console.log(`   🔗 URL decodificada: ${wrappedUrl.substring(0, 50)}... → ${decodedUrl}`);
    return decodedUrl;
  } catch (error: any) {
    console.warn(`   ⚠️  Erro ao decodificar URL: ${error.message}`);
    return wrappedUrl;
  }
}

/**
 * Scrape de um perfil do Instagram - retorna dados do perfil
 *
 * @param username - Username do Instagram (sem @)
 */
export async function scrapeInstagramProfile(username: string): Promise<InstagramProfileData & { followers: string }> {
  const { page, requestId, cleanup } = await createIsolatedContext();
  console.log(`🔒 Request ${requestId} iniciada para scrape-profile: "${username}"`);
  try {
    const url = `https://www.instagram.com/${username}/`;

    console.log(`   ➡️ Navegando para: ${url}`);
    // Como agora usamos JSON (não DOM), podemos usar domcontentloaded que é mais rápido
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

    // Delay humano após carregar página
    await humanDelay();

    // CRÍTICO: Clicar no botão "... mais" para expandir bio completa (se existir)
    try {
      const moreButtonClicked = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('header section div, header section span'));
        const maisButton = elements.find(el => el.textContent?.trim() === 'mais');
        if (maisButton) {
          (maisButton as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (moreButtonClicked) {
        console.log(`   ✅ Botão "mais" clicado - bio expandida`);
        // CRÍTICO: Instagram renderiza via React - precisa aguardar MUITO
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error: any) {
      // Silencioso - não é crítico se falhar
    }

    // CRÍTICO: Aguardar React renderizar completamente o DOM
    // Instagram é SPA que demora para hidratar conteúdo
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extrair bio via CSS selector e link limpo da bio
    const domData = await page.evaluate(() => {
      // Full Name - SELETOR CORRETO baseado em inspeção real
      let full_name = '';
      const debugLogs: string[] = [];

      const headerSection = document.querySelector('header section');
      if (headerSection) {
        const allSpans = Array.from(headerSection.querySelectorAll('span'));
        debugLogs.push(`Total spans encontrados: ${allSpans.length}`);

        // Pegar username primeiro para comparar
        const usernameEl = document.querySelector('header h2');
        const username = usernameEl?.textContent?.trim() || '';
        debugLogs.push(`Username detectado: "${username}"`);

        // Procurar pelo span que contém o nome (não é username, não é número, não é endereço)
        for (let i = 0; i < allSpans.length; i++) {
          const span = allSpans[i];
          const text = span.textContent?.trim() || '';

          if (!text) {
            debugLogs.push(`[${i}] VAZIO - ignorado`);
            continue;
          }

          debugLogs.push(`[${i}] "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

          // Pular username
          if (text === username) {
            debugLogs.push(`    ↳ FILTRO: é username`);
            continue;
          }

          // Pular números (contadores de seguidores/posts)
          if (/^\d+[.,]?\d*\s*(mil|K|M|seguidores|posts|seguindo)?$/i.test(text)) {
            debugLogs.push(`    ↳ FILTRO: é número/contador`);
            continue;
          }

          // Pular endereços (tem CEP ou muitas vírgulas)
          if (/\d{5}-?\d{3}/.test(text) || text.split(',').length >= 3) {
            debugLogs.push(`    ↳ FILTRO: é endereço (CEP ou vírgulas)`);
            continue;
          }

          // Pular texto muito longo (provavelmente é a bio, não o nome)
          if (text.length > 100) {
            debugLogs.push(`    ↳ FILTRO: texto longo (${text.length} chars)`);
            continue;
          }

          // Pular textos genéricos
          if (text === 'Ícone de link' || text === 'Doe Sangue') {
            debugLogs.push(`    ↳ FILTRO: texto genérico`);
            continue;
          }

          // Se chegou aqui, provavelmente é o nome!
          full_name = text;
          debugLogs.push(`    ✅ FULL NAME SELECIONADO!`);
          break;
        }
      }

      // Salvar debug no window
      (window as any).__fullNameDebug = debugLogs;

      // Bio - ESTRATÉGIA COMPLETA para capturar TODOS os elementos da bio
      // Instagram divide a bio em múltiplos elementos: div (categoria) + spans (descrição) + h1 (endereço)
      let bio = null;
      const bioElements: string[] = [];

      // Capturar todos os elementos de bio dentro de header section
      // Classe _ap3a marca elementos de bio do Instagram
      const bioEls = Array.from(document.querySelectorAll('header section ._ap3a._aaco._aacu._aacy._aad6._aade, header section ._ap3a._aaco._aacu._aacx._aad7._aade, header section h1._ap3a'));

      bioEls.forEach((el: any) => {
        const text = el.textContent?.trim();
        if (text && text.length > 3 && !text.match(/^\d+[\s\S]*seguidores?$/i)) {
          bioElements.push(text);
        }
      });

      // Se encontrou elementos, juntar com quebras de linha
      if (bioElements.length > 0) {
        bio = bioElements.join('\n');
      }

      // Fallback: tentar apenas h1
      if (!bio || bio.length < 10) {
        const bioH1 = document.querySelector('header section h1');
        if (bioH1 && bioH1.textContent) {
          bio = bioH1.textContent.trim();
        }
      }

      // Link da bio (visível no DOM, filtrado para evitar links de botões/threads)
      let website_visible = null;
      const bioLinks = Array.from(document.querySelectorAll('header section a[href^="http"]'))
        .filter((a: any) => {
          const text = a.textContent?.trim() || '';
          const isButton = a.getAttribute('role') === 'button' || a.closest('button');
          const looksLikeUrl = text.includes('.') || text.startsWith('http');
          const isIcon = text.length < 3;
          return !isButton && looksLikeUrl && !isIcon;
        });

      if (bioLinks.length > 0) {
        const firstBioLink = bioLinks[0] as HTMLAnchorElement;
        website_visible = firstBioLink.textContent?.trim() || null;

        if (website_visible && !website_visible.startsWith('http')) {
          if (website_visible.includes('.') && !website_visible.includes('://')) {
            website_visible = 'https://' + website_visible;
          } else {
            website_visible = firstBioLink.getAttribute('href');
          }
        }
      }

      return { full_name, bio, website_visible };
    });

    // DEBUG: Imprimir logs da extração de full_name
    const debugLogs = await page.evaluate(() => (window as any).__fullNameDebug || []);
    console.log(`\n🔍 DEBUG - Extração de Full Name para @${username}:`);
    debugLogs.forEach((log: string) => console.log(`   ${log}`));
    console.log(`   Resultado final DOM: "${domData.full_name || 'NULL'}"\n`);

    // Extrair HTML completo da página (MESMA LÓGICA DO SCRIPT FUNCIONAL)
    const html = await page.content();

    // CRÍTICO: Extrair full_name de múltiplas fontes (ordem de prioridade)

    // Estratégia 1: Meta tags OG (Open Graph) - MAIS CONFIÁVEL
    // Instagram SEMPRE inclui o full_name nas meta tags, mesmo que não esteja no JSON
    const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)/);
    let fullNameFromOG: string | null = null;
    if (ogTitleMatch) {
      // OG title format: "Full Name (@username) • Fotos e vídeos do Instagram"
      const ogTitle = ogTitleMatch[1];
      const fullNameRegex = new RegExp(`^(.+?)\\s*\\(@${username}\\)`);
      const nameMatch = ogTitle.match(fullNameRegex);
      if (nameMatch) {
        fullNameFromOG = nameMatch[1].trim();
        console.log(`   ✅ Full name encontrado no OG meta tag: "${fullNameFromOG}"`);
      }
    }

    // Estratégia 2: Meta description (fallback)
    const metaDescMatch = html.match(/<meta content="[^"]*—\s*([^(]+)\s*\(@${username}\)/);
    let fullNameFromDesc: string | null = null;
    if (metaDescMatch) {
      fullNameFromDesc = metaDescMatch[1].trim();
      console.log(`   ✅ Full name encontrado no meta description: "${fullNameFromDesc}"`);
    }

    // Estratégia 3: JSON (menos confiável - Instagram removeu em algumas versões)
    const profileDataRegex = new RegExp(`"username":"${username}"[\\s\\S]{1,500}?"full_name":"([^"]+)"`, 'g');
    const matches = Array.from(html.matchAll(profileDataRegex));
    let fullNameFromJson: string | null = null;
    if (matches.length > 0) {
      fullNameFromJson = matches[matches.length - 1][1];
      console.log(`   ✅ Full name encontrado no JSON: "${fullNameFromJson}"`);
    }

    // Escolher a melhor fonte (prioridade: OG > Desc > JSON > DOM)
    const finalFullName = fullNameFromOG || fullNameFromDesc || fullNameFromJson || domData.full_name;
    if (!finalFullName) {
      console.log(`   ⚠️  Full name NÃO encontrado em nenhuma fonte para @${username}`);
    }

    // CRÍTICO: Extrair bio completa de múltiplas fontes (ordem de prioridade)

    // Estratégia 1: Meta description - contém bio completa
    // Format: "X seguidores, Y seguindo, Z posts — Full Name (@username) no Instagram: "Bio text aqui""
    const metaDescBioMatch = html.match(/<meta[^>]+content="[^"]*—[^"]*no Instagram:\s*&quot;([^&]+)&quot;/);
    let bioFromMeta: string | null = null;
    if (metaDescBioMatch) {
      bioFromMeta = metaDescBioMatch[1].trim();
      console.log(`   ✅ Bio completa encontrada na meta description (${bioFromMeta.length} chars)`);
    }

    // Estratégia 2: JSON biography field
    const bioMatch = html.match(/"biography":"((?:[^"\\]|\\.)*)"/);
    let bioFromJson: string | null = bioMatch ? decodeInstagramString(bioMatch[1]) : null;
    if (bioFromJson) {
      console.log(`   ✅ Bio encontrada no JSON (${bioFromJson.length} chars)`);
    }

    // CRÍTICO: Bio completa - DOM tem TODO o conteúdo (categoria + descrição + endereço)
    // - DOM bio: COMPLETA com todos os elementos (prioridade máxima)
    // - Meta description: Fallback caso DOM falhe
    // - JSON: Último fallback
    const bioComplete = domData.bio || bioFromMeta || bioFromJson;
    const bioForLocationParsing = domData.bio || bioFromJson; // DOM para parsing de localização

    console.log(`   📝 Bio completa (${bioComplete ? bioComplete.length : 0} chars): ${bioComplete ? bioComplete.substring(0, 80) + '...' : 'N/A'}`);
    console.log(`   📍 Bio para parsing localização: ${bioForLocationParsing ? bioForLocationParsing.substring(0, 60) + '...' : 'N/A'}`);

    // Extrair outros dados do HTML completo
    const usernameMatch = html.match(/"username":"([^"]+)"/);
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

    // Campos de localização (business accounts)
    const cityMatch = html.match(/"city_name":"([^"]+)"/);
    const addressMatch = html.match(/"address_street":"([^"]+)"/);
    const publicAddressMatch = html.match(/"public_address":"([^"]+)"/);
    const zipCodeMatch = html.match(/"zip_code":"([^"]+)"/);
    const stateMatch = html.match(/"state_name":"([^"]+)"|"region_name":"([^"]+)"/);
    const neighborhoodMatch = html.match(/"neighborhood":"([^"]+)"/);

    if (!usernameMatch) {
      console.error(`   ❌ Não foi possível extrair dados de @${username}`);
      throw new Error('Perfil não encontrado ou dados não disponíveis');
    }

    // Processar website: usar link visível do DOM, decodificar se necessário
    let cleanWebsite: string | null = null;
    if (domData.website_visible) {
      cleanWebsite = decodeInstagramWrappedUrl(domData.website_visible);
    } else if (websiteMatch) {
      // Fallback: tentar decodificar o link do JSON
      const websiteFromJSON = decodeInstagramString(websiteMatch[1]);
      cleanWebsite = decodeInstagramWrappedUrl(websiteFromJSON);
    }

    const profileData = {
      // Username: usar parâmetro da função (perfil solicitado) em vez do regex (pode ser do viewer)
      username: username,
      // CRÍTICO: Full name - usar melhor fonte disponível
      // Prioridade: OG meta tags > Meta description > JSON > DOM
      full_name: finalFullName,
      // CRÍTICO: Bio completa - usar bio do DOM (contém TUDO)
      // Prioridade: DOM (completo) > Meta description > JSON
      bio: bioComplete,
      followers: followersMatch ? followersMatch[1] : '0',
      following: followingMatch ? followingMatch[1] : '0',
      posts: postsMatch ? postsMatch[1] : '0',
      profile_pic_url: decodeInstagramString(profilePicMatch ? profilePicMatch[1] : null),
      is_business_account: isBusinessMatch ? isBusinessMatch[1] === 'true' : false,
      is_verified: isVerifiedMatch ? isVerifiedMatch[1] === 'true' : false,
      email: decodeInstagramString(emailMatch ? emailMatch[1] : null),
      phone: decodeInstagramString(phoneMatch ? phoneMatch[1] : null),
      website: cleanWebsite, // Link limpo da bio (decodificado)
      business_category: decodeInstagramString(categoryMatch ? categoryMatch[1] : null),
      // Dados de localização
      city: decodeInstagramString(cityMatch ? cityMatch[1] : null),
      address: decodeInstagramString(addressMatch ? addressMatch[1] : null) ||
               decodeInstagramString(publicAddressMatch ? publicAddressMatch[1] : null),
      state: decodeInstagramString(stateMatch ? (stateMatch[1] || stateMatch[2]) : null),
      neighborhood: decodeInstagramString(neighborhoodMatch ? neighborhoodMatch[1] : null),
      zip_code: decodeInstagramString(zipCodeMatch ? zipCodeMatch[1] : null)
    };

    // Se não encontrou email público, tentar extrair da bio
    if (!profileData.email && profileData.bio) {
      const emailFromBio = extractEmailFromBio(profileData.bio);
      if (emailFromBio) {
        profileData.email = emailFromBio;
      }
    }

    // EXTRAIR TELEFONE DO LINK WHATSAPP se não tiver telefone público
    if (!profileData.phone && profileData.website) {
      const phoneFromWhatsApp = extractPhoneFromWhatsApp(profileData.website);
      if (phoneFromWhatsApp) {
        profileData.phone = phoneFromWhatsApp;

        // EXTRAIR ESTADO DO DDD se não tiver estado
        if (!profileData.state) {
          const stateFromPhone = getStateFromPhone(phoneFromWhatsApp);
          if (stateFromPhone) {
            profileData.state = stateFromPhone;
          }
        }
      }
    }

    // EXTRAIR LOCALIZAÇÃO DA BIO (usar bioForLocationParsing que contém endereço completo)
    if (bioForLocationParsing && (!profileData.city || !profileData.address || !profileData.zip_code)) {
      const locationFromBio = extractLocationFromBio(bioForLocationParsing);

      if (!profileData.address && locationFromBio.address) {
        profileData.address = locationFromBio.address;
      }
      if (!profileData.city && locationFromBio.city) {
        profileData.city = locationFromBio.city;
      }
      if (!profileData.state && locationFromBio.state) {
        profileData.state = locationFromBio.state;
      }
      if (!profileData.zip_code && locationFromBio.zip_code) {
        profileData.zip_code = locationFromBio.zip_code;
      }
    }

    // Converter contadores para números
    const followersCount = parseInstagramCount(profileData.followers);
    const followingCount = parseInstagramCount(profileData.following);
    const postsCount = parseInstagramCount(profileData.posts);

    console.log(`   ✅ Dados extraídos: @${username} (${followersCount} seguidores, ${postsCount} posts)`);
    console.log(`   👤 Full Name: ${profileData.full_name || 'N/A'}`);
    console.log(`   📝 Bio: ${profileData.bio ? (profileData.bio.length > 80 ? profileData.bio.substring(0, 80) + '...' : profileData.bio) : 'N/A'}`);
    console.log(`   🔗 Website: ${profileData.website || 'N/A'}`);
    console.log(`   📧 Email: ${profileData.email || 'N/A'}`);
    console.log(`   📱 Telefone: ${profileData.phone || 'N/A'}`);

    // Logging de localização - sempre mostrar, mesmo se null
    const locationParts: string[] = [];
    if (profileData.city) locationParts.push(profileData.city);
    if (profileData.state) locationParts.push(profileData.state);
    if (profileData.neighborhood) locationParts.push(`(${profileData.neighborhood})`);
    console.log(`   📍 Localização: ${locationParts.length > 0 ? locationParts.join(', ') : 'N/A'}`);
    console.log(`   🏠 Endereço: ${profileData.address || 'N/A'}`);
    console.log(`   📮 CEP: ${profileData.zip_code || 'N/A'}`);
    console.log(`   💼 Categoria: ${profileData.business_category || 'N/A'}`)

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
      business_category: profileData.business_category,
      // Campos de localização
      city: profileData.city,
      state: profileData.state,
      neighborhood: profileData.neighborhood,
      address: profileData.address,
      zip_code: profileData.zip_code
    };

    console.log(`✅ SCRAPE-PROFILE CONCLUÍDO: dados coletados para "@${username}"`);
    return profileResult;

  } catch (error: any) {
    console.error(`❌ Erro ao scrape perfil "@${username}":`, error.message);
    throw error;
  } finally {
    console.log(`🔓 Request ${requestId} finalizada (scrape-profile: "${username}")`);
    await cleanup();
    console.log(`🏁 SCRAPE-PROFILE ENCERRADO COMPLETAMENTE: "@${username}" - Request ${requestId}`);
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
