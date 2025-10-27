// @ts-nocheck - Código usa window/document dentro de page.evaluate() (contexto browser)
import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Reutilizar instância de browser e sessão do scraper principal
let browserInstance: Browser | null = null;
let sessionPage: Page | null = null;
let sessionInitialization: Promise<void> | null = null;
let loggedUsername: string | null = null;

const COOKIES_FILE = path.join(process.cwd(), 'instagram-cookies.json');

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
  activity_score?: number; // Score de atividade (0-100)
  is_active?: boolean; // Se a conta está ativa
  recent_post_dates?: string[]; // ISO strings dos posts mais recentes
}

/**
 * Interface para score de atividade
 */
interface ActivityScore {
  isActive: boolean;
  score: number; // 0-100
  postsPerMonth: number;
  reasons: string[];
}

/**
 * Delay aleatório para simular comportamento humano (2-5 segundos)
 */
async function humanDelay(): Promise<void> {
  const delay = 2000 + Math.random() * 3000;
  console.log(`   ⏳ Aguardando ${(delay / 1000).toFixed(1)}s (delay humano)...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Delay maior entre ações críticas para evitar detecção de bot (3-5 segundos)
 */
async function antiDetectionDelay(): Promise<void> {
  const delay = 3000 + Math.random() * 2000;
  console.log(`   🛡️  Delay anti-detecção: ${(delay / 1000).toFixed(1)}s...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Busca usernames utilizando o endpoint interno de busca do Instagram
 */
async function fetchSearchUsernamesViaApi(page: Page, searchTerm: string, maxResults: number): Promise<string[]> {
  return page.evaluate(
    async (term, limit) => {
      try {
        const response = await fetch(
          `https://www.instagram.com/web/search/topsearch/?context=blended&query=${encodeURIComponent(term)}&include_reel=true`,
          {
            credentials: 'same-origin',
            headers: {
              'x-requested-with': 'XMLHttpRequest'
            }
          }
        );

        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }

        const json = await response.json();
        const usernames: string[] = [];

        if (Array.isArray(json?.users)) {
          for (const entry of json.users) {
            const username = entry?.user?.username;
            if (typeof username === 'string' && username.length > 0) {
              usernames.push(username);
              if (usernames.length >= limit) break;
            }
          }
        }

        return usernames;
      } catch (apiError) {
        console.error('fetchSearchUsernamesViaApi error', apiError);
        return [];
      }
    },
    searchTerm,
    maxResults
  );
}

/**
 * Fallback: extrai usernames diretamente do modal de busca
 */
async function extractUsernamesFromSearchDialog(page: Page, maxResults: number): Promise<string[]> {
  return page.evaluate((limit) => {
    const usernames: string[] = [];
    const seen = new Set<string>();
    const excludedPages = new Set(['explore', 'direct', 'reels', 'accounts', 'stories', 'nametag', 'igtv']);

    const containers = [
      document.querySelector('div[role="dialog"] ul[role="listbox"]'),
      document.querySelector('div[role="dialog"] div[role="listbox"]'),
      document.querySelector('div[role="dialog"] section[role="presentation"]'),
      document.querySelector('div[role="dialog"]')
    ].filter((el): el is Element => !!el);

    const processLinks = (elements: Element[]) => {
      for (const el of elements) {
        if (usernames.length >= limit) break;

        const link = el instanceof HTMLAnchorElement ? el : el.closest<HTMLAnchorElement>('a[href^="/"]');
        if (!link) continue;

        const href = link.getAttribute('href');
        if (!href) continue;

        const match = href.match(/^\/([a-zA-Z0-9._]+)\/?$/);
        if (!match || !match[1]) continue;

        const username = match[1];
        if (excludedPages.has(username) || seen.has(username)) continue;

        // Garantir que é um resultado com avatar + texto
        const hasAvatar = !!link.querySelector('img');
        const hasText = (link.textContent || '').trim().length > 0;
        if (!hasAvatar || !hasText) continue;

        seen.add(username);
        usernames.push(username);
      }
    };

    for (const container of containers) {
      const items = Array.from(
        container.querySelectorAll('a[href^="/"][role="link"], div[role="none"] a[href^="/"], div[role="option"] a[href^="/"]')
      );
      processLinks(items);
      if (usernames.length >= limit) break;
    }

    if (usernames.length < limit) {
      const fallback = Array.from(document.querySelectorAll('div[role="dialog"] a[href^="/"]'));
      processLinks(fallback);
    }

    return usernames.slice(0, limit);
  }, maxResults);
}

/**
 * Salva cookies da sessão
 */
async function saveCookies(page: Page): Promise<void> {
  try {
    if (page.isClosed()) return;
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log('💾 Cookies salvos com sucesso');
  } catch (error: any) {
    console.log('⚠️  Erro ao salvar cookies:', error.message);
  }
}

/**
 * Carrega cookies salvos
 */
async function loadCookies(page: Page): Promise<boolean> {
  if (fs.existsSync(COOKIES_FILE)) {
    try {
      if (page.isClosed()) return false;
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
 * Verifica se está logado
 */
async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    const currentUrl = page.url();
    if (!currentUrl.includes('instagram.com')) {
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const cookies = await page.cookies();
    const hasSession = cookies.some(cookie => cookie.name === 'sessionid' && !!cookie.value);
    return hasSession;
  } catch (error) {
    return false;
  }
}

/**
 * Detecta username atualmente logado via cookies ou DOM
 */
async function detectLoggedInUsername(page: Page): Promise<string | null> {
  try {
    const cookies = await page.cookies();
    const dsUserCookie = cookies.find(cookie => cookie.name === 'ds_user');
    if (dsUserCookie?.value) {
      return dsUserCookie.value;
    }
  } catch (error: any) {
    console.warn('⚠️  Não foi possível ler cookie ds_user:', error.message);
  }

  try {
    const usernameFromDom = await page.evaluate(() => {
      const profileIcon = document.querySelector<SVGElement>('svg[aria-label="Perfil"], svg[aria-label="Profile"]');
      const profileLink = profileIcon ? profileIcon.closest<HTMLAnchorElement>('a[href^="/"][href$="/"]') : null;
      const href = profileLink?.getAttribute('href');
      if (!href) return null;
      const parts = href.split('/').filter(Boolean);
      return parts.length > 0 ? parts[0] : null;
    });
    if (usernameFromDom) {
      return usernameFromDom;
    }
  } catch (error: any) {
    console.warn('⚠️  Não foi possível identificar username pelo DOM:', error.message);
  }

  return null;
}

/**
 * Garante sessão logada
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
        headless: false,
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
        console.log('✅ Sessão válida encontrada!');
        loggedUsername = await detectLoggedInUsername(sessionPage);
        if (loggedUsername) {
          console.log(`👤 Usuário logado detectado: @${loggedUsername}`);
        } else {
          console.log('⚠️  Não foi possível detectar o username logado.');
        }
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
      console.log('🔐 ============================================');
      console.log('');

      await sessionPage.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 120000 });

      const loginDeadline = Date.now() + 90000;
      let success = false;
      while (Date.now() < loginDeadline) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        success = await isLoggedIn(sessionPage);
        if (success) break;
      }

      if (!success) {
        throw new Error('Tempo excedido para login manual no Instagram.');
      }

      await saveCookies(sessionPage);
      console.log('✅ Login concluído e cookies salvos.');
      loggedUsername = await detectLoggedInUsername(sessionPage);
      if (loggedUsername) {
        console.log(`👤 Usuário logado detectado: @${loggedUsername}`);
      } else {
        console.log('⚠️  Não foi possível detectar o username logado, prosseguindo mesmo assim.');
      }
    }
  })()
    .catch(async (error) => {
      console.error('❌ Falha ao garantir sessão:', error.message);
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
 * Cria nova página autenticada
 */
async function createAuthenticatedPage(): Promise<Page> {
  await ensureLoggedSession();
  if (!browserInstance || !sessionPage) {
    throw new Error('Browser ou sessão não inicializada.');
  }

  const page = await browserInstance.newPage();

  try {
    if (!sessionPage.isClosed()) {
      const cookies = await sessionPage.cookies();
      if (cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log(`🔑 Cookies copiados para nova página (${cookies.length} cookies)`);
      }
    }
  } catch (error: any) {
    console.warn('⚠️  Não foi possível copiar cookies:', error.message);
  }

  return page;
}

/**
 * Faz logout do Instagram (navegando para URL de logout)
 */
async function instagramLogout(): Promise<void> {
  if (!sessionPage || sessionPage.isClosed()) {
    console.log('   ⚠️  Sessão já fechada, pulando logout');
    return;
  }

  try {
    console.log('🚪 Fazendo logout do Instagram...');
    await sessionPage.goto('https://www.instagram.com/accounts/logout/', {
      waitUntil: 'networkidle2',
      timeout: 10000
    }).catch(() => {
      console.log('   ⚠️  Timeout ao navegar para logout, continuando...');
    });

    // Aguardar logout processar
    await new Promise(resolve => setTimeout(resolve, 1500));
    console.log('✅ Logout concluído');
  } catch (error: any) {
    console.log(`   ⚠️  Erro ao fazer logout: ${error.message}`);
  }
}

/**
 * Fecha o browser
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
 * Cleanup completo: logout + fechar browser + limpar cookies
 */
async function gracefulShutdown(deleteCookies: boolean = false): Promise<void> {
  console.log('\n🛑 ======================================');
  console.log('🛑 INICIANDO SHUTDOWN DO SCRAPER');
  console.log('🛑 ======================================\n');

  let cleanupSuccess = true;

  try {
    // 1. Fazer logout do Instagram
    if (sessionPage && !sessionPage.isClosed()) {
      await instagramLogout().catch((err) => {
        console.error('❌ Erro ao fazer logout:', err.message);
        cleanupSuccess = false;
      });
    }

    // 2. Fechar todas as páginas abertas
    if (browserInstance && browserInstance.isConnected()) {
      try {
        const pages = await browserInstance.pages();
        console.log(`📄 Fechando ${pages.length} página(s) aberta(s)...`);
        for (const page of pages) {
          if (!page.isClosed()) {
            await page.close().catch(() => {});
          }
        }
        console.log('✅ Todas as páginas fechadas');
      } catch (error: any) {
        console.error('⚠️  Erro ao fechar páginas:', error.message);
      }
    }

    // 3. Fechar browser
    await closeBrowser();

    // 4. Deletar cookies se solicitado
    if (deleteCookies && fs.existsSync(COOKIES_FILE)) {
      try {
        fs.unlinkSync(COOKIES_FILE);
        console.log('🗑️  Cookies deletados');
      } catch (error: any) {
        console.error('⚠️  Erro ao deletar cookies:', error.message);
      }
    }

  } catch (error: any) {
    console.error('❌ Erro durante graceful shutdown:', error.message);
    cleanupSuccess = false;
  }

  console.log('\n🛑 ======================================');
  if (cleanupSuccess) {
    console.log('✅ SHUTDOWN CONCLUÍDO COM SUCESSO');
  } else {
    console.log('⚠️  SHUTDOWN CONCLUÍDO COM ERROS');
  }
  console.log('🛑 ======================================\n');
}

/**
 * Registrar handlers de sinal de processo para cleanup automático
 */
function setupProcessHandlers(): void {
  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) {
      console.log(`⚠️  Shutdown já em andamento, ignorando ${signal}`);
      return;
    }

    isShuttingDown = true;
    console.log(`\n⚡ Sinal recebido: ${signal}`);

    try {
      // Timeout de 10s para cleanup (evitar travar o processo)
      await Promise.race([
        gracefulShutdown(false), // Não deletar cookies em shutdown normal
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout de cleanup')), 10000)
        )
      ]);
    } catch (error: any) {
      console.error('❌ Erro no shutdown handler:', error.message);
    } finally {
      process.exit(0);
    }
  };

  // Sinais de terminação
  process.on('SIGTERM', () => handleShutdown('SIGTERM')); // pm2 stop
  process.on('SIGINT', () => handleShutdown('SIGINT'));   // Ctrl+C
  process.on('SIGUSR2', () => handleShutdown('SIGUSR2')); // pm2 reload

  // Erros não capturados
  process.on('uncaughtException', async (error) => {
    console.error('\n❌ UNCAUGHT EXCEPTION:', error);
    await handleShutdown('uncaughtException');
  });

  process.on('unhandledRejection', async (reason) => {
    console.error('\n❌ UNHANDLED REJECTION:', reason);
    await handleShutdown('unhandledRejection');
  });

  // Antes de sair normalmente
  process.on('beforeExit', async (code) => {
    if (!isShuttingDown && browserInstance) {
      console.log(`\n⚠️  Processo encerrando (code ${code}) com browser ativo`);
      await handleShutdown('beforeExit');
    }
  });

  console.log('✅ Process handlers registrados para cleanup automático');
}

// Registrar handlers na inicialização do módulo
setupProcessHandlers();

/**
 * Extrai email do texto da bio
 */
function extractEmailFromBio(bio: string | null): string | null {
  if (!bio) return null;
  const emailPattern = /\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+\b/gi;
  const match = bio.match(emailPattern);
  if (match && match.length > 0) {
    const email = match[0].toLowerCase();
    console.log(`   📧 Email encontrado na bio: ${email}`);
    return email;
  }
  return null;
}

/**
 * Converte strings do Instagram (k, mil, m) para números
 */
function parseInstagramCount(value: string | null): number {
  if (!value) return 0;
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
 * Calcula score de atividade da conta (0-100)
 */
function calculateActivityScore(profile: InstagramProfileData): ActivityScore {
  let score = 100;
  const reasons: string[] = [];
  const DAY_IN_MS = 24 * 60 * 60 * 1000;

  // 1. Sem posts = definitivamente inativa
  if (profile.posts_count === 0) {
    return {
      isActive: false,
      score: 0,
      postsPerMonth: 0,
      reasons: ['Nenhum post publicado']
    };
  }

  const now = Date.now();
  const recentDates = (profile.recent_post_dates || [])
    .map(dateString => new Date(dateString))
    .filter(date => Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  let postsPerMonth = profile.posts_count / 12;

  if (recentDates.length > 0) {
    const latest = recentDates[recentDates.length - 1];
    const earliest = recentDates[0];
    const spanDays = Math.max(30, (latest.getTime() - earliest.getTime()) / DAY_IN_MS + 1);
    const recentPostsPerMonth = recentDates.length / (spanDays / 30);
    postsPerMonth = Math.max(postsPerMonth, recentPostsPerMonth);

    const daysSinceLastPost = (now - latest.getTime()) / DAY_IN_MS;

    if (daysSinceLastPost > 120) {
      score -= 40;
      reasons.push('Sem posts recentes (>=120 dias)');
    } else if (daysSinceLastPost > 60) {
      score -= 25;
      reasons.push('Último post há mais de 60 dias');
    } else if (daysSinceLastPost > 30) {
      score -= 15;
      reasons.push('Último post há mais de 30 dias');
    } else if (daysSinceLastPost <= 14) {
      score += 10;
      reasons.push('Postou nas últimas 2 semanas');
    } else {
      score += 5;
      reasons.push('Postou no último mês');
    }

    const postsInLast90Days = recentDates.filter(date => now - date.getTime() <= 90 * DAY_IN_MS).length;
    if (postsInLast90Days === 0) {
      score -= 35;
      reasons.push('Nenhum post nos últimos 90 dias');
    } else if (postsInLast90Days >= 6) {
      score += 10;
      reasons.push('>=6 posts nos últimos 90 dias');
    } else if (postsInLast90Days <= 2) {
      score -= 10;
      reasons.push('Poucos posts nos últimos 90 dias');
    }
  } else {
    score -= 10;
    reasons.push('Posts recentes indisponíveis');
  }

  if (postsPerMonth < 1) {
    score -= 25;
    reasons.push(`Baixa frequência média: ${postsPerMonth.toFixed(1)} posts/mês`);
  } else if (postsPerMonth >= 4) {
    score += 10; // Bonus para contas muito ativas
    reasons.push(`Alta atividade: ${postsPerMonth.toFixed(1)} posts/mês`);
  }

  // 3. Proporção followers/posts suspeita (possível compra de seguidores)
  if (profile.followers_count > profile.posts_count * 100 && profile.posts_count < 50) {
    score -= 25;
    reasons.push('Muitos seguidores para poucos posts (possível compra)');
  }

  // 4. Bio vazia ou muito curta = menos profissional
  if (!profile.bio || profile.bio.length < 10) {
    score -= 10;
    reasons.push('Bio vazia ou muito curta');
  } else {
    score += 5; // Bonus para bio completa
  }

  // 5. Conta business sem contato = menos séria
  if (profile.is_business_account && !profile.email && !profile.phone) {
    score -= 15;
    reasons.push('Conta business sem contato público');
  }

  // 6. Conta verificada = mais confiável
  if (profile.is_verified) {
    score += 15;
    reasons.push('Conta verificada');
  }

  // 7. Followers muito baixos (<100) = possível conta pessoal
  if (profile.followers_count < 100) {
    score -= 20;
    reasons.push('Poucos seguidores (<100)');
  }

  // 8. Following muito maior que followers = red flag
  if (profile.following_count > profile.followers_count * 2 && profile.followers_count > 100) {
    score -= 10;
    reasons.push('Following >> Followers (comportamento suspeito)');
  }

  // Limitar score entre 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    isActive: score >= 50,
    score,
    postsPerMonth,
    reasons
  };
}

/**
 * Busca usuários do Instagram via campo de busca
 * Retorna apenas usuários com activity_score >= 50
 *
 * @param searchTerm - Termo de busca (ex: "gestor de tráfego")
 * @param maxProfiles - Máximo de perfis validados a retornar (padrão: 5)
 */
export async function scrapeInstagramUserSearchV1(
  searchTerm: string,
  maxProfiles: number = 5
): Promise<InstagramProfileData[]> {
  const page = await createAuthenticatedPage();
  try {
    console.log(`🔍 [V1] Buscando usuários para termo: "${searchTerm}"`);

    // 1. IR PARA PÁGINA INICIAL
    console.log(`🏠 [V1] Navegando para página inicial...`);
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 120000 });
    await humanDelay();

    // 2. ABRIR CAMPO DE BUSCA
    console.log(`🔍 Abrindo campo de busca...`);
    const searchPanelOpened = await page.evaluate(() => {
      const icon = document.querySelector('svg[aria-label="Pesquisar"], svg[aria-label="Search"]');
      if (!icon) return false;
      const clickable = icon.closest('a, button, div[role="button"]');
      if (clickable instanceof HTMLElement) {
        clickable.click();
        return true;
      }
      return false;
    });

    if (!searchPanelOpened) {
      console.log(`   ⚠️  Ícone de busca não encontrado, tentando atalho "/"`);
      await page.keyboard.press('/');
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    // 3. AGUARDAR CAMPO DE BUSCA APARECER
    const searchInputSelector = 'input[placeholder*="Pesquis"], input[placeholder*="Search"], input[aria-label*="Pesquis"], input[aria-label*="Search"]';
    const searchInput = await page.waitForSelector(searchInputSelector, { timeout: 8000, visible: true }).catch(() => null);

    if (!searchInput) {
      throw new Error('Campo de busca não encontrado após 8 segundos');
    }

    // 4. LIMPAR E DIGITAR TERMO (letra por letra, como humano)
    console.log(`⌨️  Digitando "${searchTerm}"...`);
    await searchInput.evaluate((element: any) => {
      if (element instanceof HTMLInputElement) {
        element.focus();
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    for (const char of searchTerm) {
      await page.keyboard.type(char);
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 150));
    }

    console.log(`⏳ Aguardando sugestões de usuários...`);
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

    // 5. COLETAR USERNAMES (API + fallback DOM)
    console.log(`📋 Obtendo usernames dos resultados de busca...`);
    let searchResultUsernames = await fetchSearchUsernamesViaApi(page, searchTerm, maxProfiles);

    if (searchResultUsernames.length === 0) {
      console.log('   ⚠️  API de busca retornou vazio, tentando extrair do modal...');
      searchResultUsernames = await extractUsernamesFromSearchDialog(page, maxProfiles);
    }

    console.log(`   ✅ ${searchResultUsernames.length} resultados encontrados`);

    if (searchResultUsernames.length === 0) {
      console.log(`   ⚠️  Nenhum resultado encontrado para "${searchTerm}"`);
      return [];
    }

    // Usar os primeiros 5 resultados (os reais)
    const usernamesToProcess = searchResultUsernames;
    console.log(`   📊 Processando ${usernamesToProcess.length} perfis reais para validação...`);

    // 7. PROCESSAR CADA PERFIL SEQUENCIALMENTE (VIA URL)
    const validatedProfiles: InstagramProfileData[] = [];
    const processedUsernames = new Set<string>();

    for (const username of usernamesToProcess) {
      if (validatedProfiles.length >= maxProfiles) {
        console.log(`\n🎯 Meta atingida: ${maxProfiles} perfis validados`);
        break;
      }

      if (processedUsernames.has(username)) {
        console.log(`   ⏭️  @${username} já processado, pulando...`);
        continue;
      }

      if (username === loggedUsername) {
        console.log(`   ⏭️  @${username} é o próprio usuário logado, pulando...`);
        processedUsernames.add(username);
        continue;
      }

      console.log(`\n   👤 Processando @${username}...`);
      processedUsernames.add(username);

      try {
        // Delay antes de navegar (simular tempo de leitura/decisão)
        const preNavigationDelay = 1500 + Math.random() * 2000; // 1.5-3.5s
        console.log(`   ⏳ Aguardando ${(preNavigationDelay / 1000).toFixed(1)}s antes de navegar...`);
        await new Promise(resolve => setTimeout(resolve, preNavigationDelay));

        // Navegar para o perfil via URL
        await page.goto(`https://www.instagram.com/${username}/`, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        // Delay após carregar página (simular leitura do perfil)
        await antiDetectionDelay();

        // Extrair dados do perfil (estratégia multi-seletor para robustez)
        const profileData = await page.evaluate(() => {
          // FULL NAME: Múltiplas estratégias de extração
          let full_name = '';
          const fullNameSelectors = [
            'header section h1',  // Novo seletor primário
            'header section h2',  // Backup
            'header div[class] h1',
            'header div[class] h2',
            'header section span[class]:not([role])',
            'main header section div span'
          ];

          for (const selector of fullNameSelectors) {
            const el = document.querySelector(selector);
            if (el && el.textContent) {
              const text = el.textContent.trim();
              // Validar que não é username (não começa com @)
              if (text && !text.startsWith('@') && text.length > 1 && text.length < 100) {
                full_name = text;
                break;
              }
            }
          }

          // BIO: Múltiplos seletores
          let bio = '';
          const bioSelectors = [
            'header section div.-vDIg span',  // Novo seletor específico
            'header section div[data-testid]',
            'header section span._ap3a',
            'header section > div > div:nth-child(2) span',
            'main header section > div > div span'
          ];

          for (const selector of bioSelectors) {
            const el = document.querySelector(selector);
            if (el && el.textContent && el.textContent.trim().length > 5) {
              bio = el.textContent.trim();
              break;
            }
          }

          // STATS: Extração robusta de seguidores/posts
          const stats: string[] = [];
          const selectors = [
            'header section ul li span',
            'header section ul li button span',
            'header section ul li a span',
            'header section ul span',
            'header ul li span',
            'header span[class*="x"]'
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const text = el.textContent?.trim();
              if (text && /\d/.test(text) && text.length < 20) {
                if (!stats.includes(text)) {
                  stats.push(text);
                }
              }
            });
            if (stats.length >= 3) break;
          }

          // PROFILE PIC
          const profilePicEl = document.querySelector('header img') as HTMLImageElement;
          const profile_pic_url = profilePicEl ? profilePicEl.src : '';

          // BUSINESS ACCOUNT & VERIFIED
          const isBusiness = document.body.innerHTML.includes('business_account') ||
                             document.body.innerHTML.includes('Category') ||
                             !!document.querySelector('header section a[href*="mailto"]') ||
                             !!document.querySelector('header section a[href*="tel:"]');
          const isVerified = !!document.querySelector('svg[aria-label="Verified"]') ||
                             !!document.querySelector('svg[aria-label="Verificado"]');

          // EMAIL: Múltiplas estratégias
          let email: string | null = null;

          // Estratégia 1: Link mailto no header
          const mailtoLink = document.querySelector('header a[href^="mailto:"]');
          if (mailtoLink) {
            const href = mailtoLink.getAttribute('href');
            if (href) {
              email = href.replace('mailto:', '').split('?')[0];
            }
          }

          // Estratégia 2: Regex no HTML (backup)
          if (!email) {
            const emailMatch = document.body.innerHTML.match(/mailto:([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
            email = emailMatch ? emailMatch[1] : null;
          }

          // Estratégia 3: Regex na bio
          if (!email && bio) {
            const bioEmailMatch = bio.match(/\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+\b/);
            email = bioEmailMatch ? bioEmailMatch[0] : null;
          }

          // PHONE: Extração de telefone
          let phone: string | null = null;

          // Estratégia 1: Link tel: no header
          const telLink = document.querySelector('header a[href^="tel:"]');
          if (telLink) {
            const href = telLink.getAttribute('href');
            if (href) {
              phone = href.replace('tel:', '').replace(/\s/g, '');
            }
          }

          // Estratégia 2: Regex no HTML
          if (!phone) {
            const phoneMatch = document.body.innerHTML.match(/tel:([+\d\s()-]+)/);
            phone = phoneMatch ? phoneMatch[1].replace(/\s/g, '') : null;
          }

          // Estratégia 3: Padrões de telefone na bio
          if (!phone && bio) {
            const phonePatterns = [
              /\+?\d{2}\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}/,  // Brasil: +55 (11) 99999-9999
              /\(?\d{2,3}\)?\s?\d{4,5}-?\d{4}/,           // Local: (11) 99999-9999
              /\+\d{1,3}\s?\d{8,14}/,                      // Internacional
              /whatsapp:?\s*\+?\d[\d\s()-]{8,}/i          // WhatsApp na bio
            ];

            for (const pattern of phonePatterns) {
              const match = bio.match(pattern);
              if (match) {
                phone = match[0].replace(/\D+/g, '');  // Apenas dígitos
                break;
              }
            }
          }

          // WEBSITE
          const websiteEl = document.querySelector('header section a[href^="http"]');
          const website = websiteEl ? websiteEl.getAttribute('href') : null;

          // RECENT POSTS
          const timeElements = Array.from(document.querySelectorAll('article time[datetime]'));
          const recent_post_dates = timeElements
            .slice(0, 12)
            .map(el => el.getAttribute('datetime'))
            .filter((value): value is string => !!value);

          return {
            full_name,
            bio,
            stats,
            profile_pic_url,
            is_business_account: isBusiness,
            is_verified: isVerified,
            email,
            phone,
            website,
            recent_post_dates
          };
        });

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
          phone: profileData.phone,
          website: profileData.website,
          business_category: null,
          recent_post_dates: profileData.recent_post_dates
        };

        // Extrair email da bio se não tiver email público
        if (!completeProfile.email && completeProfile.bio) {
          const emailFromBio = extractEmailFromBio(completeProfile.bio);
          if (emailFromBio) {
            completeProfile.email = emailFromBio;
          }
        }

        // CALCULAR ACTIVITY SCORE
        const activityScore = calculateActivityScore(completeProfile);
        completeProfile.activity_score = activityScore.score;
        completeProfile.is_active = activityScore.isActive;

        console.log(`   📊 Activity Score: ${activityScore.score}/100 (${activityScore.isActive ? 'ATIVA ✅' : 'INATIVA ❌'})`);
        console.log(`   📈 ${activityScore.postsPerMonth.toFixed(1)} posts/mês`);
        if (activityScore.reasons.length > 0) {
          console.log(`   💡 Razões: ${activityScore.reasons.join(', ')}`);
        }

        // VALIDAR: Apenas adicionar se score >= 50
        if (activityScore.isActive) {
          validatedProfiles.push(completeProfile);
          console.log(`   ✅ Perfil validado e adicionado (${validatedProfiles.length}/${maxProfiles})`);
        } else {
          console.log(`   ❌ Perfil rejeitado por baixo activity score`);
        }

        // Delay após análise (simular tempo de decisão)
        const postAnalysisDelay = 1000 + Math.random() * 2000; // 1-3s
        console.log(`   ⏱️  Pausa de ${(postAnalysisDelay / 1000).toFixed(1)}s após análise...`);
        await new Promise(resolve => setTimeout(resolve, postAnalysisDelay));

      } catch (profileError: any) {
        console.log(`   ⚠️  Erro ao processar @${username}: ${profileError.message}`);

        // Delay mesmo em caso de erro (para não parecer bot)
        const errorDelay = 2000 + Math.random() * 1500; // 2-3.5s
        await new Promise(resolve => setTimeout(resolve, errorDelay));
        continue;
      }

      // Delay extra entre perfis (simular navegação humana)
      if (validatedProfiles.length < maxProfiles && processedUsernames.size < usernamesToProcess.length) {
        const betweenProfilesDelay = 2000 + Math.random() * 3000; // 2-5s
        console.log(`   🕐 Intervalo de ${(betweenProfilesDelay / 1000).toFixed(1)}s antes do próximo perfil...`);
        await new Promise(resolve => setTimeout(resolve, betweenProfilesDelay));
      }
    }

    console.log(`\n✅ Busca concluída: ${validatedProfiles.length} perfis validados de ${processedUsernames.size} processados`);

    if (validatedProfiles.length > 0) {
      const usernames = validatedProfiles.map(p => `@${p.username} (${p.activity_score}/100)`).join(', ');
      console.log(`👥 Perfis validados: ${usernames}`);
    }

    return validatedProfiles;

  } catch (error: any) {
    console.error(`❌ Erro na busca de usuários "${searchTerm}":`, error.message);
    throw error;
  } finally {
    if (!page.isClosed()) {
      await page.close().catch(() => {});
    }
  }
}
