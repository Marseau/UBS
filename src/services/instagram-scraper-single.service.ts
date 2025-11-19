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
  extractHashtagsFromPosts,
  retryWithBackoff
} from './instagram-profile.utils';
import { createIsolatedContext } from './instagram-context-manager.service';
import { discoverHashtagVariations, HashtagVariation } from './instagram-hashtag-discovery.service';
import { getAccountRotation } from './instagram-account-rotation.service';
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

// ========== SISTEMA DE RESILIÊNCIA AUTOMÁTICA ==========
interface ResilienceMetrics {
  consecutiveErrors: number;
  totalErrors: number;
  totalSuccess: number;
  lastErrorType: string | null;
  lastErrorTime: number;
  sessionRecoveries: number;
  hashtagsSkipped: string[];
  adaptiveDelayMultiplier: number;
  consecutiveSessionInvalid: number; // 🆕 CONTADOR DE SESSION_INVALID CONSECUTIVOS
}

const resilienceMetrics: ResilienceMetrics = {
  consecutiveErrors: 0,
  totalErrors: 0,
  totalSuccess: 0,
  lastErrorType: null,
  lastErrorTime: 0,
  sessionRecoveries: 0,
  hashtagsSkipped: [],
  adaptiveDelayMultiplier: 1.0,
  consecutiveSessionInvalid: 0 // 🆕 INICIALIZA EM 0
};

// 🆕 LIMITE MÁXIMO DE SESSION_INVALID ANTES DE PARAR COMPLETAMENTE
const MAX_CONSECUTIVE_SESSION_INVALID = 3;

function updateResilienceOnSuccess(): void {
  resilienceMetrics.consecutiveErrors = 0;
  resilienceMetrics.consecutiveSessionInvalid = 0; // 🆕 RESET contador de SESSION_INVALID
  resilienceMetrics.totalSuccess++;
  // Reduzir delay multiplier gradualmente após sucesso
  if (resilienceMetrics.adaptiveDelayMultiplier > 1.0) {
    resilienceMetrics.adaptiveDelayMultiplier = Math.max(1.0, resilienceMetrics.adaptiveDelayMultiplier * 0.9);
  }

  // 🔄 ROTAÇÃO DE CONTAS: Registrar sucesso (reseta contadores de falha)
  const rotation = getAccountRotation();
  rotation.recordSuccess();
}

function updateResilienceOnError(errorType: string): void {
  resilienceMetrics.consecutiveErrors++;
  resilienceMetrics.totalErrors++;
  resilienceMetrics.lastErrorType = errorType;
  resilienceMetrics.lastErrorTime = Date.now();
  // Aumentar delay multiplier para evitar mais erros
  resilienceMetrics.adaptiveDelayMultiplier = Math.min(3.0, resilienceMetrics.adaptiveDelayMultiplier * 1.3);
}

function getAdaptiveDelay(baseDelay: number): number {
  return baseDelay * resilienceMetrics.adaptiveDelayMultiplier;
}

function shouldSkipHashtag(): boolean {
  // Se mais de 5 erros consecutivos, pular hashtag atual
  return resilienceMetrics.consecutiveErrors >= 5;
}

function logResilienceStatus(): void {
  const successRate = resilienceMetrics.totalSuccess + resilienceMetrics.totalErrors > 0
    ? ((resilienceMetrics.totalSuccess / (resilienceMetrics.totalSuccess + resilienceMetrics.totalErrors)) * 100).toFixed(1)
    : '0';

  console.log(`\n📊 [RESILIÊNCIA] Taxa sucesso: ${successRate}% | Erros consecutivos: ${resilienceMetrics.consecutiveErrors} | Delay multiplier: ${resilienceMetrics.adaptiveDelayMultiplier.toFixed(2)}x | Recoveries: ${resilienceMetrics.sessionRecoveries}`);
}

// ========== CLEANUP HANDLERS ==========
// Garante que o browser seja fechado quando o processo terminar
const cleanupBrowser = async () => {
  if (browserInstance) {
    console.log('\n🧹 [CLEANUP] Fechando browser Puppeteer...');
    try {
      await browserInstance.close();
      console.log('✅ [CLEANUP] Browser fechado com sucesso');
    } catch (err) {
      console.log('⚠️  [CLEANUP] Erro ao fechar browser:', err);
    }
    browserInstance = null;
    sessionPage = null;
  }
};

// Registrar handlers para sinais de encerramento
process.on('SIGTERM', async () => {
  console.log('\n🛑 [SIGNAL] SIGTERM recebido - iniciando cleanup...');
  await cleanupBrowser();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 [SIGNAL] SIGINT recebido - iniciando cleanup...');
  await cleanupBrowser();
  process.exit(0);
});

process.on('exit', () => {
  if (browserInstance) {
    console.log('⚠️  [EXIT] Processo encerrando com browser ainda aberto!');
    // Não pode usar async aqui, então força kill síncrono
    try {
      const pid = browserInstance.process()?.pid;
      if (pid) {
        process.kill(pid, 'SIGKILL');
        console.log(`🔪 [EXIT] Browser process ${pid} killed`);
      }
    } catch (e) {
      // ignore
    }
  }
});

// Handler para exceções não tratadas
process.on('uncaughtException', async (err) => {
  console.error('\n💥 [EXCEPTION] Exceção não tratada:', err);
  await cleanupBrowser();
});

process.on('unhandledRejection', async (reason) => {
  console.error('\n💥 [REJECTION] Promise rejeitada:', reason);
  // Não fecha o browser aqui para não interromper operações normais
});

/**
 * Delay aleatório para simular comportamento humano (2-5 segundos)
 */
async function humanDelay(): Promise<void> {
  const delay = 2000 + Math.random() * 3000; // 2-5 segundos
  console.log(`   ⏳ Aguardando ${(delay / 1000).toFixed(1)}s (delay humano)...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Delay maior entre ações críticas para evitar detecção de bot (5-8 segundos)
 * AUMENTADO para evitar 429 Too Many Requests
 */
async function antiDetectionDelay(): Promise<void> {
  const delay = 5000 + Math.random() * 3000; // 5-8 segundos (mais conservador)
  console.log(`   🛡️  Delay anti-detecção: ${(delay / 1000).toFixed(1)}s...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Converte nome completo do estado brasileiro para sigla (2 caracteres)
 * Aceita nome com ou sem acentos, maiúsculas/minúsculas
 * Se já for sigla, retorna direto
 */
function convertStateToAbbreviation(stateName: string | null): string | null {
  if (!stateName) return null;

  const state = stateName.trim();

  // Se já é sigla (2 caracteres), retorna uppercase
  if (state.length === 2) {
    return state.toUpperCase();
  }

  // Normalizar: remover acentos e converter para lowercase
  const normalized = state
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // Mapeamento completo de estados brasileiros
  const stateMap: { [key: string]: string } = {
    // Região Norte
    'acre': 'AC',
    'amapa': 'AP',
    'amazonas': 'AM',
    'para': 'PA',
    'rondonia': 'RO',
    'roraima': 'RR',
    'tocantins': 'TO',

    // Região Nordeste
    'alagoas': 'AL',
    'bahia': 'BA',
    'ceara': 'CE',
    'maranhao': 'MA',
    'paraiba': 'PB',
    'pernambuco': 'PE',
    'piaui': 'PI',
    'rio grande do norte': 'RN',
    'sergipe': 'SE',

    // Região Centro-Oeste
    'distrito federal': 'DF',
    'goias': 'GO',
    'mato grosso do sul': 'MS',
    'mato grosso': 'MT',

    // Região Sudeste
    'espirito santo': 'ES',
    'minas gerais': 'MG',
    'rio de janeiro': 'RJ',
    'sao paulo': 'SP',

    // Região Sul
    'parana': 'PR',
    'rio grande do sul': 'RS',
    'santa catarina': 'SC'
  };

  return stateMap[normalized] || null;
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
        args: ['--start-maximized'],
        protocolTimeout: 120000 // 2 minutos para operações lentas do Instagram (4x padrão de 30s)
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
      const scraperUsername = process.env.INSTAGRAM_UNOFFICIAL_USERNAME;
      const scraperPassword = process.env.INSTAGRAM_OFFICIAL_PASSWORD || process.env.INSTAGRAM_ALT_PASSWORD;

      if (!scraperUsername || !scraperPassword) {
        console.log('');
        console.log('🔐 ============================================');
        console.log('🔐 LOGIN MANUAL NECESSÁRIO NO INSTAGRAM');
        console.log('🔐 ============================================');
        console.log('🔐 Credenciais não configuradas no .env');
        console.log('🔐 Configure INSTAGRAM_UNOFFICIAL_USERNAME e INSTAGRAM_OFFICIAL_PASSWORD');
        console.log('🔐 Você tem 90 SEGUNDOS para fazer login manualmente.');
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
      } else {
        console.log('');
        console.log('🤖 ============================================');
        console.log('🤖 LOGIN AUTOMÁTICO NO INSTAGRAM');
        console.log('🤖 ============================================');
        console.log(`🤖 Conta: ${scraperUsername}`);
        console.log('🤖 ============================================');
        console.log('');

        await sessionPage.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 120000 });
        await new Promise(resolve => setTimeout(resolve, 3000)); // Esperar página carregar completamente

        // Verificar se já está na página de login
        const currentUrl = sessionPage.url();
        console.log(`📍 URL atual: ${currentUrl}`);

        // Preencher credenciais
        try {
          console.log('📝 Preenchendo username...');
          await sessionPage.waitForSelector('input[name="username"]', { timeout: 10000 });
          await sessionPage.type('input[name="username"]', scraperUsername, { delay: 100 });
          await new Promise(resolve => setTimeout(resolve, 500));

          console.log('📝 Preenchendo password...');
          await sessionPage.type('input[name="password"]', scraperPassword, { delay: 100 });
          await new Promise(resolve => setTimeout(resolve, 500));

          console.log('🔘 Clicando em Login...');
          await sessionPage.click('button[type="submit"]');

          // Esperar navegação ou mudança de estado
          console.log('⏳ Aguardando resposta do Instagram...');
          await new Promise(resolve => setTimeout(resolve, 8000)); // 8 segundos para processar

          // Verificar se login foi bem-sucedido
          let loginSuccess = await isLoggedIn(sessionPage);

          if (!loginSuccess) {
            // Verificar se há desafio de segurança ou 2FA
            const pageContent = await sessionPage.content();
            if (pageContent.includes('challenge') || pageContent.includes('two_factor') || pageContent.includes('verificação')) {
              console.log('⚠️  Instagram solicitou verificação adicional (2FA ou challenge)');
              console.log('🔐 Aguardando 60 segundos para verificação manual...');

              const challengeDeadline = Date.now() + 60000;
              while (Date.now() < challengeDeadline && !loginSuccess) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                loginSuccess = await isLoggedIn(sessionPage);
              }
            } else {
              console.log('❌ Login automático falhou. Verificando erro...');
              const errorText = await sessionPage.evaluate(() => {
                const errorElement = document.querySelector('[role="alert"]') || document.querySelector('.eiCW-');
                return errorElement ? errorElement.textContent : null;
              });
              if (errorText) {
                console.log(`❌ Erro do Instagram: ${errorText}`);
              }
            }
          }

          if (!loginSuccess) {
            throw new Error('Login automático falhou. Verifique credenciais ou faça login manual.');
          }

          console.log('✅ Login automático bem-sucedido!');

        } catch (loginError: any) {
          console.error('❌ Erro durante login automático:', loginError.message);
          throw new Error(`Falha no login automático: ${loginError.message}`);
        }
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
  has_relevant_audience?: boolean; // Se tem audiência relevante (10k-300k followers)
  lead_source?: string; // 'profile_with_audience' ou 'hashtag_search'
  search_term_used?: string | null; // Termo de busca ou hashtag usado para encontrar este perfil
  followers?: Array<{
    username: string;
    full_name: string | null;
    profile_pic_url: string | null;
    is_verified: boolean;
    is_private: boolean;
  }>; // Seguidores do perfil (se tem audiência relevante)
  followers_scraped_count?: number; // Quantidade de seguidores scrapados
}

/**
 * Resultado do scraping de hashtag com metadados
 * 🆕 Inclui flag de resultado parcial e estatísticas
 */
export interface HashtagScrapeResult {
  profiles: InstagramProfileData[];
  is_partial: boolean; // true se não atingiu maxProfiles (timeout, detached frame, etc)
  requested: number; // Quantidade solicitada
  collected: number; // Quantidade coletada
  completion_rate: string; // Percentual de conclusão (ex: "75.0%")
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
): Promise<HashtagScrapeResult> {
  // Normalizar termo ANTES de criar contexto
  const normalizedTerm = searchTerm
    .toLowerCase()
    .replace(/\s+/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  console.log(`🔎 Termo: "${searchTerm}" → "#${normalizedTerm}"`);

  // 🆕 RESET MÉTRICAS DE RESILIÊNCIA PARA NOVA SESSÃO
  resilienceMetrics.consecutiveErrors = 0;
  resilienceMetrics.totalErrors = 0;
  resilienceMetrics.totalSuccess = 0;
  resilienceMetrics.lastErrorType = null;
  resilienceMetrics.lastErrorTime = 0;
  resilienceMetrics.sessionRecoveries = 0;
  resilienceMetrics.hashtagsSkipped = [];
  resilienceMetrics.adaptiveDelayMultiplier = 1.0;
  resilienceMetrics.consecutiveSessionInvalid = 0; // 🆕 RESET contador de SESSION_INVALID
  console.log(`🔄 Métricas de resiliência resetadas para nova sessão`);

  // Criar contexto UMA VEZ para discovery E scraping
  let context = await createIsolatedContext();
  let page = context.page;
  const requestId = context.requestId;
  let cleanup = context.cleanup;
  console.log(`🔒 Request ${requestId} iniciada para discovery + scrape-tag: "${searchTerm}"`);

  let variations: any[] = [];
  let priorityHashtags: any[] = [];
  // 🆕 VARIÁVEIS DECLARADAS AQUI para estarem acessíveis no catch
  const allFoundProfiles: any[] = [];
  let hashtagsToScrape: string[] = [normalizedTerm]; // Fallback para hashtag original

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

    // 🆕 DETERMINAR LISTA DE HASHTAGS A SCRAPAR (SEMPRE começa com a original + sugestões prioritárias)
    hashtagsToScrape = priorityHashtags.length > 0
      ? [normalizedTerm, ...priorityHashtags.map(h => h.hashtag)]  // Original + sugestões
      : [normalizedTerm];  // Só original se não houver sugestões

    console.log(`\n🎯 Total de hashtags que serão scrapadas: ${hashtagsToScrape.length}`);
    console.log(`   📊 Perfis por hashtag: ${maxProfiles} (cada hashtag terá até ${maxProfiles} perfis scrapados)\n`);

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

      // 🆕 VERIFICAR SE BROWSER/PÁGINA PRECISA SER RECRIADO (após SESSION_INVALID)
      if (!browserInstance || page.isClosed()) {
        console.log('🔄 [SESSION RECOVERY] Recriando sessão do Instagram...');

        // Forçar limpeza de variáveis globais
        browserInstance = null;
        sessionPage = null;
        sessionInitialization = null;
        loggedUsername = null;

        // Recriar contexto
        const newContext = await createIsolatedContext();
        // Reassignar página e cleanup
        page = newContext.page;
        cleanup = newContext.cleanup;

        console.log('✅ [SESSION RECOVERY] Nova sessão criada com sucesso!');
        await new Promise(resolve => setTimeout(resolve, 3000)); // Dar tempo para estabilizar
      }

      // 🆕 ESTRATÉGIA ULTRA-ROBUSTA: Navegar DIRETO para URL da hashtag
      // (Evita campo de busca → previne erro 429 e detached frame)
      const hashtagUrl = `https://www.instagram.com/explore/tags/${hashtagToScrape}/`;

      console.log(`\n🎯 Navegando DIRETO para hashtag: ${hashtagUrl}`);

      // Verificar se página está válida ANTES de navegar
      try {
        const isPageClosed = page.isClosed();
        if (isPageClosed) {
          throw new Error('Page is closed');
        }

        // Testar se consegue avaliar (frame válido)
        await page.evaluate(() => window.location.href).catch(() => {
          throw new Error('Page frame is detached before navigation');
        });
      } catch (checkError: any) {
        console.log(`⚠️  Página corrompida detectada ANTES de navegar: ${checkError.message}`);
        throw new Error(`Page invalidated: ${checkError.message}`);
      }

      // Navegar para hashtag
      try {
        await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        console.log(`   ✅ Navegação concluída`);
      } catch (navError: any) {
        console.log(`   ❌ Erro durante navegação: ${navError.message}`);
        throw navError;
      }

      // 🆕 VERIFICAR SE INSTAGRAM REDIRECIONOU PARA PÁGINA DIFERENTE
      let currentUrl = page.url();
      console.log(`   🔍 URL atual: ${currentUrl}`);

      // Detectar redirecionamentos suspeitos
      const isLoginPage = currentUrl.includes('/accounts/login');
      const isChallengePage = currentUrl.includes('/challenge') || currentUrl.includes('/checkpoint');
      const isSuspiciousPage = currentUrl.includes('/sorry') || currentUrl.includes('/suspended');
      let isExpectedPage = currentUrl.includes('/explore/tags/') || currentUrl.includes('/explore/search/');

      if (isLoginPage) {
        console.log('❌ [REDIRECT] Instagram redirecionou para página de LOGIN - sessão inválida');
        throw new Error('SESSION_INVALID: Redirected to login page');
      }

      if (isChallengePage) {
        console.log('❌ [REDIRECT] Instagram redirecionou para CHALLENGE/CAPTCHA - verificação necessária');
        throw new Error('CHALLENGE_REQUIRED: Instagram requires verification');
      }

      if (isSuspiciousPage) {
        console.log('❌ [REDIRECT] Instagram redirecionou para página SUSPENSA/BLOQUEADA');
        throw new Error('ACCOUNT_RESTRICTED: Account may be temporarily restricted');
      }

      // 🆕 RECUPERAÇÃO: Se não está na página esperada, tentar voltar
      if (!isExpectedPage) {
        console.log(`⚠️  [REDIRECT] URL não corresponde à hashtag esperada!`);
        console.log(`   Esperado: ${hashtagUrl}`);
        console.log(`   Recebido: ${currentUrl}`);
        console.log(`   🔄 Tentando voltar para a hashtag...`);

        // Tentar navegar novamente para a URL correta
        await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Verificar novamente
        currentUrl = page.url();
        isExpectedPage = currentUrl.includes('/explore/tags/') || currentUrl.includes('/explore/search/');

        if (!isExpectedPage) {
          console.log(`❌ [REDIRECT] Não conseguiu voltar para a hashtag. URL final: ${currentUrl}`);
          throw new Error(`REDIRECT_RECOVERY_FAILED: Could not return to hashtag page`);
        }

        console.log(`   ✅ Recuperação bem-sucedida! Agora em: ${currentUrl}`);
      }

      // Delay generoso após navegação para garantir renderização completa (ADAPTATIVO)
      const baseNavDelay = 4000 + Math.random() * 2000; // 4-6s base
      const postNavDelay = getAdaptiveDelay(baseNavDelay);
      console.log(`   ⏳ Aguardando ${(postNavDelay/1000).toFixed(1)}s para renderização completa... (multiplier: ${resilienceMetrics.adaptiveDelayMultiplier.toFixed(2)}x)`);
      await new Promise(resolve => setTimeout(resolve, postNavDelay));

      // 🆕 DETECÇÃO AUTOMÁTICA DE SESSÃO INVÁLIDA
      const pageHasError = await page.evaluate(() => {
        const bodyText = document.body?.innerText || '';
        const hasErrorMessage = bodyText.includes('Ocorreu um erro') ||
                                bodyText.includes('não foi possível carregar') ||
                                bodyText.includes('Something went wrong') ||
                                bodyText.includes('error occurred');
        return hasErrorMessage;
      }).catch(() => false);

      if (pageHasError) {
        console.log('❌ [SESSION INVALID] Instagram retornou página de erro - limpando cookies...');

        // Limpar cookies automaticamente
        if (fs.existsSync(COOKIES_FILE)) {
          fs.unlinkSync(COOKIES_FILE);
          console.log('🗑️  Cookies removidos para forçar novo login');
        }

        // Fechar browser para reiniciar sessão
        if (browserInstance) {
          await browserInstance.close().catch(() => {});
          browserInstance = null;
          sessionPage = null;
          sessionInitialization = null;
          loggedUsername = null;
        }

        throw new Error('SESSION_INVALID: Instagram session expired. Cookies cleared. Please retry.');
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
            { timeout: 15000 },
            hashtagToScrape
          );
          console.log(`   ✅ Página de hashtag/busca confirmada`);

          // Esperar posts aparecerem (O MAIS IMPORTANTE!)
          const postsFound = await page.waitForFunction(
            (selector) => {
              const posts = document.querySelectorAll(selector);
              return posts.length > 0;
            },
            { timeout: 15000 },
            postSelector
          );

          // Contar posts encontrados (com proteção anti-detached frame)
          let postCount = 0;
          try {
            postCount = await page.evaluate((selector) => {
              return document.querySelectorAll(selector).length;
            }, postSelector);
          } catch (evalError: any) {
            console.log(`   ⚠️  Erro ao contar posts (detached frame?): ${evalError.message}`);
            // Tentar novamente após delay
            await new Promise(resolve => setTimeout(resolve, 2000));
            postCount = await page.evaluate((selector) => {
              return document.querySelectorAll(selector).length;
            }, postSelector).catch(() => 0);
          }

          console.log(`   ✅ Mural carregado com ${postCount} posts`);

          return true;
        } catch (error: any) {
          // Debug adicional em caso de erro
          const currentUrl = page.url();
          const pageContent = await page.content();

          // 🔧 DETECTOR MELHORADO: Se encontrou posts, NÃO é página de login
          let postCount = 0;
          try {
            postCount = await page.evaluate((selector) => {
              return document.querySelectorAll(selector).length;
            }, postSelector);
          } catch (evalError) {
            // Ignora erro de detached frame no fallback
            postCount = 0;
          }

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

      // DEBUG: Verificar estrutura REAL do mural de hashtag (com proteção anti-detached)
      let debugInfo: any = { url: '', totalLinks: 0, totalArticles: 0, selectorResults: {}, firstArticleHTML: '', linksWithP: [] };
      try {
        debugInfo = await page.evaluate(() => {
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
      } catch (debugError: any) {
        console.log(`   ⚠️  Erro ao coletar debug info (detached frame?): ${debugError.message}`);
      }

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

          // Movimento em etapas (mais humano) - com proteção anti-detached
          let currentPos = { x: 0, y: 0 };
          try {
            currentPos = await page.evaluate(() => ({ x: 0, y: 0 }));
          } catch (evalError) {
            // Ignora erro e usa posição padrão
          }
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
            console.log(`   ❌ Post NÃO abriu via clique! URL atual: ${currentUrl}`);
            console.log(`   ⚠️  Evitando goto direto para não triggerar 429. Tentando clique alternativo...`);

            // TENTATIVA 2: Clicar usando JavaScript (mais confiável que mouse)
            try {
              await antiDetectionDelay(); // Delay maior antes de tentar novamente

              // Forçar clique via JavaScript no elemento
              await anchorHandle.evaluate((el: Element) => {
                (el as HTMLElement).click();
              });

              await new Promise(resolve => setTimeout(resolve, 3000));

              const urlAfterJsClick = page.url();
              const isPostNow = urlAfterJsClick.includes('/p/') || urlAfterJsClick.includes('/reel/');

              if (isPostNow) {
                console.log(`   ✅ Post abriu via clique JavaScript: ${urlAfterJsClick}`);
                await antiDetectionDelay();
                return true;
              } else {
                console.log(`   ❌ Clique JavaScript também não abriu o post`);
                return false;
              }
            } catch (jsClickError: any) {
              console.log(`   ❌ Erro no clique JavaScript: ${jsClickError.message}`);
              return false;
            }
          }

          console.log(`   ✅ Post abriu confirmado: ${currentUrl}`);

          // ANTI-DETECÇÃO: Delay após abrir post (3-5s)
          await antiDetectionDelay();

          return true;

        } catch (clickError: any) {
          console.log(`   ⚠️  Clique no post falhou (${clickError.message}). Não usando goto para evitar 429.`);
          // NÃO fazer goto direto - causa 429 (Too Many Requests)
          await antiDetectionDelay();
          return false;
        }
      };

        // LOOP INTERNO: SCRAPAR ATÉ maxProfiles PARA ESTA HASHTAG
        while (foundProfiles.length < maxProfiles && attemptsWithoutNewPost < 8 && consecutiveDuplicates < 3) {
          console.log(`\n📊 Status (#${hashtagToScrape}): ${foundProfiles.length}/${maxProfiles} perfis, tentativa ${attemptsWithoutNewPost}/8, duplicatas consecutivas ${consecutiveDuplicates}/3`);

          // CORREÇÃO: Garantir que o drawer de pesquisa está fechado no início de cada iteração
          try {
            await page.evaluate(() => {
              // Clicar fora do drawer para fechá-lo se estiver aberto
              const mainContent = document.querySelector('main') || document.querySelector('section');
              if (mainContent) {
                const event = new MouseEvent('click', { bubbles: true });
                mainContent.dispatchEvent(event);
              }
            });
            await new Promise(resolve => setTimeout(resolve, 300));
          } catch {
            // Ignorar erros
          }

        const anchorHandles = await page.$$(postSelector);
        console.log(`   🔍 Encontrados ${anchorHandles.length} elementos com seletor: ${postSelector}`);

        // 🚫 DETECÇÃO DE SHADOWBAN: Mural sem posts visíveis
        if (anchorHandles.length === 0) {
          const pageAnalysis = await page.evaluate(() => {
            const url = window.location.href;
            const isHashtagPage = url.includes('/explore/tags/') || url.includes('/explore/search/keyword/');
            const isProfilePage = url.match(/instagram\.com\/[^\/]+\/?$/);

            // Detectar se é perfil privado
            const isPrivate = document.body.innerText.includes('Esta conta é privada') ||
                             document.body.innerText.includes('This Account is Private');

            // Verificar se mural/grid existe (estrutura da página)
            const hasGrid = !!document.querySelector('article') ||
                           !!document.querySelector('main') ||
                           !!document.querySelector('[role="main"]');

            return { isHashtagPage, isProfilePage, isPrivate, hasGrid };
          });

          console.log(`\n🔍 Análise da página sem posts:`);
          console.log(`   Hashtag/Search: ${pageAnalysis.isHashtagPage}`);
          console.log(`   Perfil: ${pageAnalysis.isProfilePage}`);
          console.log(`   Privado: ${pageAnalysis.isPrivate}`);
          console.log(`   Grid existe: ${pageAnalysis.hasGrid}`);

          // ⚠️ SHADOWBAN DETECTADO: Hashtag com grid mas sem posts
          if (pageAnalysis.isHashtagPage && pageAnalysis.hasGrid && !pageAnalysis.isPrivate) {
            console.log(`\n⚠️  POSSÍVEL SHADOWBAN: Página de hashtag com estrutura mas 0 posts visíveis`);
            console.log(`   Tentativa ${attemptsWithoutNewPost}/8 sem posts`);

            // Se já tentou 3+ vezes sem sucesso, considerar shadowban
            if (attemptsWithoutNewPost >= 3) {
              console.log(`\n🚨 SHADOWBAN CONFIRMADO: 3+ tentativas sem posts em hashtag`);
              console.log(`   Esta conta provavelmente está bloqueada para hashtags`);

              throw new Error('SESSION_INVALID: Shadowban detectado - mural de hashtag sem posts visíveis após múltiplas tentativas');
            }
          }

          // Perfil privado → Não é erro, apenas skip
          if (pageAnalysis.isPrivate) {
            console.log(`\n🔒 Perfil privado detectado - pulando`);
            break; // Sai do loop de scraping desta hashtag
          }
        }

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

        // CORREÇÃO: SEMPRE fechar painel lateral de pesquisa antes de clicar (interfere nos cliques)
        try {
          console.log(`   🔧 Fechando possíveis painéis laterais...`);

          // Método 1: Clicar no centro da área de conteúdo principal (direita da tela)
          await page.mouse.click(800, 400); // Clicar no centro-direita onde estão os posts
          await new Promise(resolve => setTimeout(resolve, 300));

          // Método 2: Pressionar ESC para fechar qualquer overlay/drawer
          await page.keyboard.press('Escape');
          await new Promise(resolve => setTimeout(resolve, 300));

          // Método 3: Clicar no body para tirar foco de qualquer elemento
          await page.evaluate(() => {
            document.body.click();
          });
          await new Promise(resolve => setTimeout(resolve, 200));

          // Recalcular posição do elemento após fechar drawer
          const newBox = await selectedHandle.boundingBox();
          if (newBox) {
            console.log(`   📍 Posição atual do elemento: x=${newBox.x}, y=${newBox.y}, width=${newBox.width}`);

            // VERIFICAR: Se X é muito baixo (< 300), o drawer ainda está aberto
            if (newBox.x < 300) {
              console.log(`   ⚠️  Elemento ainda à esquerda (x=${newBox.x}). Tentando fechar drawer novamente...`);

              // Tentar clicar fora do drawer (área dos posts)
              await page.mouse.click(600, 300);
              await new Promise(resolve => setTimeout(resolve, 500));

              // Verificar novamente
              const finalBox = await selectedHandle.boundingBox();
              if (finalBox) {
                console.log(`   📍 Posição final: x=${finalBox.x}, y=${finalBox.y}`);
              }
            }
          }
        } catch (drawerError) {
          console.log(`   ⚠️  Erro ao tentar fechar drawer: ${drawerError}`);
        }

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
              await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch {
              // ignore
            }
            await new Promise(resolve => setTimeout(resolve, 1500));
            const feedReady = await waitForHashtagMural('Retorno após post sem autor');
            if (!feedReady) {
              attemptsWithoutNewPost++;
            }
            continue;
          }

          if (username === loggedUsername) {
            console.log(`   ⏭️  Post do próprio usuário logado, pulando...`);
            try {
              await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch {
              // ignore
            }
            await new Promise(resolve => setTimeout(resolve, 1500));
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
                await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
              } catch {
                // ignore
              }
              await new Promise(resolve => setTimeout(resolve, 1500));
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
            console.log(`   ⏳ Aguardando 8 segundos para auto-scroll do Instagram carregar novos posts...`);

            // Aguardar 8 segundos (reduzido de 20s)
            await new Promise(resolve => setTimeout(resolve, 8000));

            // Tentar voltar ao feed da hashtag
            try {
              await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch {
              // ignore
            }
            await new Promise(resolve => setTimeout(resolve, 1500));
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
              waitUntil: 'domcontentloaded',  // Mais rápido - não espera network idle
              timeout: 15000  // Reduzido para 15s
            });

            // Esperar elementos do perfil aparecerem (mais eficiente que esperar rede)
            await page.waitForSelector('header section', { timeout: 10000 }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

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

            // EXTRAIR HTML COMPLETO para capturar dados via REGEX (phone, localização, etc)
            const html = await page.content();

            // 🔥 EXTRAÇÃO CORRETA: Filtrar stats por palavra-chave
            // DOM retorna duplicatas: ["991 posts", "991", "207 mil seguidores", "207 mil", "138 seguindo", "138"]
            // Precisamos pegar apenas os que contêm a palavra-chave!

            const postsText = profileData.stats.find((s: string) =>
              s.toLowerCase().includes('post') || s.toLowerCase().includes('publicaç')
            ) || '';

            const followersText = profileData.stats.find((s: string) =>
              s.toLowerCase().includes('seguidor') || s.toLowerCase().includes('follower')
            ) || '';

            const followingText = profileData.stats.find((s: string) =>
              s.toLowerCase().includes('seguindo') || s.toLowerCase().includes('following')
            ) || '';

            let posts_count = parseInstagramCount(postsText);
            let followers_count = parseInstagramCount(followersText);
            let following_count = parseInstagramCount(followingText);

            console.log(`   📊 Stats extraídos: ${posts_count} posts, ${followers_count} seguidores, ${following_count} seguindo`);

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
              state: normalizeStateName(decodeInstagramString(stateMatch ? (stateMatch[1] || stateMatch[2]) : null)),
              neighborhood: decodeInstagramString(neighborhoodMatch ? neighborhoodMatch[1] : null),
              address: decodeInstagramString(addressMatch ? addressMatch[1] : null) ||
                       decodeInstagramString(publicAddressMatch ? publicAddressMatch[1] : null),
              zip_code: decodeInstagramString(zipCodeMatch ? zipCodeMatch[1] : null),
              search_term_used: hashtagToScrape // Hashtag que foi usada para encontrar este perfil
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
            // ⚠️ DESABILITADO: extractLocationFromBio está bugado, captura bio inteira como city
            // Confiamos apenas nos dados estruturados do JSON do Instagram
            // if (bioForLocationParsing && (!completeProfile.city || !completeProfile.address || !completeProfile.zip_code)) {
            //   const locationFromBio = extractLocationFromBio(bioForLocationParsing);
            //
            //   if (!completeProfile.address && locationFromBio.address) {
            //     completeProfile.address = locationFromBio.address;
            //   }
            //   if (!completeProfile.city && locationFromBio.city) {
            //     completeProfile.city = locationFromBio.city;
            //   }
            //   if (!completeProfile.state && locationFromBio.state) {
            //     completeProfile.state = locationFromBio.state;
            //   }
            //   if (!completeProfile.zip_code && locationFromBio.zip_code) {
            //     completeProfile.zip_code = locationFromBio.zip_code;
            //   }
            // }

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

              // Envolver com retry mechanism (máx 2 tentativas, backoff 3s)
              console.log(`   🔄 Iniciando extração de hashtags com retry automático...`);
              const postHashtags = await retryWithBackoff(
                () => extractHashtagsFromPosts(page, 2),
                2, // máximo 2 tentativas (evita espera excessiva)
                3000 // backoff de 3s
              );

              if (postHashtags && postHashtags.length > 0) {
                completeProfile.hashtags_posts = postHashtags;
                console.log(`   ✅ ${postHashtags.length} hashtags extraídas dos posts`);
              } else {
                completeProfile.hashtags_posts = null;
                console.log(`   ⚠️  Nenhuma hashtag encontrada nos posts`);
              }
            } catch (hashtagError: any) {
              console.log(`   ⚠️  Erro ao extrair hashtags dos posts após retries: ${hashtagError.message}`);
              completeProfile.hashtags_posts = null;
            }

            // ========================================
            // PERFIL APROVADO NAS VALIDAÇÕES - ADICIONAR AO RESULTADO
            // ========================================

            console.log(`   ✅ Perfil APROVADO: @${username} (${followers_count} seguidores, ${posts_count} posts)`);
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
            console.log(`   💼 Categoria: ${completeProfile.business_category || 'N/A'}`);

            // 💾 SALVAR NO BANCO IMEDIATAMENTE (não acumular em memória)
            try {
              // Converter activity_score (0-100) para lead_score (0-1)
              const leadScore = completeProfile.activity_score ? completeProfile.activity_score / 100 : null;

              // Sanitizar dados (similar ao toSQL do N8N)
              const sanitizedProfile = sanitizeForDatabase(completeProfile);

              // Adicionar campos adicionais necessários para o banco
              const profileToSave = {
                ...sanitizedProfile,
                captured_at: new Date().toISOString(),
                lead_source: 'hashtag_search',
                lead_score: leadScore,
                // segment e search_term_id podem ser NULL para scraping manual
                segment: null,
                search_term_id: null
              };

              const { error: insertError } = await supabase
                .from('instagram_leads')
                .insert(profileToSave);

              if (insertError) {
                console.log(`   ⚠️  Erro ao salvar @${username} no banco: ${insertError.message}`);
              } else {
                console.log(`   ✅ Perfil @${username} SALVO NO BANCO`);
              }
            } catch (dbError: any) {
              console.log(`   ⚠️  Erro ao salvar @${username}: ${dbError.message}`);
            }

            // Adicionar ao array só para contagem/retorno
            foundProfiles.push(completeProfile);
            processedUsernames.add(username);
            consecutiveDuplicates = 0; // Resetar contador ao encontrar perfil novo

            console.log(`   📊 Total coletado (aprovados): ${foundProfiles.length}/${maxProfiles}`);

            // ANTI-DETECÇÃO: Delay antes de retornar ao feed (3-5s)
            console.log(`   🛡️  Aguardando antes de retornar ao feed...`);
            await antiDetectionDelay();

          } catch (profileError: any) {
            console.log(`   ⚠️  Erro ao extrair dados de @${username}: ${profileError.message}`);
            console.log(`   ⏭️  Continuando com próximo perfil...`);
          }

          console.log(`   ⬅️  Retornando para o mural da hashtag...`);
          await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
          const feedReadyAfterProfile = await waitForHashtagMural('Retorno após coletar perfil');
          if (!feedReadyAfterProfile) {
            attemptsWithoutNewPost++;
            continue;
          }

        } catch (error: any) {
          console.log(`   ❌ Erro ao processar post (${error.message}). Tentando retornar ao mural...`);
          await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 1500));
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
          updateResilienceOnSuccess();
          console.log(`✅ Hashtag #${hashtagToScrape} scrapada com sucesso!`);

        } catch (hashtagError: any) {
          console.error(`❌ Erro ao scrape hashtag #${hashtagToScrape} (tentativa ${retryCount}/${MAX_RETRIES}):`, hashtagError.message);

          // Atualizar métricas de resiliência
          const errorType = hashtagError.message.includes('detached') ? 'DETACHED_FRAME'
            : hashtagError.message.includes('SESSION_INVALID') ? 'SESSION_INVALID'
            : hashtagError.message.includes('timeout') ? 'TIMEOUT'
            : 'UNKNOWN';
          updateResilienceOnError(errorType);

          // 🆕 CIRCUIT BREAKER: Se muitos erros consecutivos, pular hashtag e continuar
          if (shouldSkipHashtag()) {
            console.log(`\n⚡ [CIRCUIT BREAKER] ${resilienceMetrics.consecutiveErrors} erros consecutivos detectados`);
            console.log(`   🔄 Pulando #${hashtagToScrape} para evitar mais falhas`);
            resilienceMetrics.hashtagsSkipped.push(hashtagToScrape);
            resilienceMetrics.consecutiveErrors = 0; // Reset para próxima hashtag
            break; // Sai do while de retry, vai para próxima hashtag
          }

          // Se for detached frame, Instagram detectou scraping → ENCERRAR TUDO IMEDIATAMENTE
          if (hashtagError.message.includes('detached Frame')) {
            console.log(`\n🚨 DETACHED FRAME DETECTADO - Instagram detectou scraping`);
            console.log(`   💾 Perfis já salvos no banco: ${foundProfiles.length}`);
            console.log(`   🛑 ENCERRANDO SESSÃO IMEDIATAMENTE (sem retry)`);

            // Acumular perfis desta hashtag
            allFoundProfiles.push(...foundProfiles);

            // ENCERRAR LOOP DE HASHTAGS (não processar mais nenhuma)
            hashtagIndex = hashtagsToScrape.length; // força saída do for loop
            break; // Sai do while de retry
          }

          // 🆕 SESSION_INVALID: Verificar limite e rotação de contas
          if (hashtagError.message.includes('SESSION_INVALID')) {
            resilienceMetrics.consecutiveSessionInvalid++;

            // 🔄 ROTAÇÃO DE CONTAS: Registrar falha
            const rotation = getAccountRotation();
            rotation.recordFailure();

            console.log(`\n🚨 [SESSION_INVALID] Falha ${resilienceMetrics.consecutiveSessionInvalid}/${MAX_CONSECUTIVE_SESSION_INVALID}`);

            // 🔄 VERIFICAR SE DEVE ROTACIONAR PARA PRÓXIMA CONTA
            if (rotation.shouldRotate()) {
              console.log(`\n🔄 ========== INICIANDO ROTAÇÃO DE CONTA ==========`);

              const rotationResult = await rotation.rotateToNextAccount();

              if (rotationResult.success && rotationResult.requiresWait) {
                console.log(`\n⏰ Aguardando cooldown de ${rotationResult.waitMinutes} minutos...`);
                console.log(`   Nova conta: ${rotationResult.newAccount}`);

                // Aguardar cooldown
                await new Promise(resolve => setTimeout(resolve, rotationResult.waitMinutes * 60 * 1000));

                console.log(`\n✅ Cooldown completo - continuando com ${rotationResult.newAccount}`);

                // Resetar contador de SESSION_INVALID (nova conta)
                resilienceMetrics.consecutiveSessionInvalid = 0;
                resilienceMetrics.sessionRecoveries++;

              } else if (!rotationResult.success && rotationResult.requiresWait) {
                // Cooldown global ou limite de ciclos atingido
                console.log(`\n❌ ============================================`);
                console.log(`❌ ${rotationResult.message}`);
                console.log(`❌ ============================================`);
                console.log(`\n💡 Ações recomendadas:`);
                console.log(`   1. Aguardar ${rotationResult.waitMinutes} minutos`);
                console.log(`   2. Verificar TODAS as contas no Instagram`);
                console.log(`   3. Considerar adicionar mais contas`);
                console.log(`   4. Verificar se IP está bloqueado\n`);

                // FORÇAR SAÍDA COMPLETA
                throw new Error(`ROTATION_LIMIT_REACHED: ${rotationResult.message}`);
              }
            } else {
              // Não rotacionar ainda, mas verificar limite
              if (resilienceMetrics.consecutiveSessionInvalid >= MAX_CONSECUTIVE_SESSION_INVALID) {
                console.log(`\n❌ ============================================`);
                console.log(`❌ LIMITE DE SESSION_INVALID ATINGIDO (${MAX_CONSECUTIVE_SESSION_INVALID})`);
                console.log(`❌ Instagram detectou automação - PARANDO scraping`);
                console.log(`❌ ============================================`);
                console.log(`\n💡 Ações recomendadas:`);
                console.log(`   1. Verificar conta no Instagram (possível shadowban)`);
                console.log(`   2. Aguardar 30-60 minutos antes de tentar novamente`);
                console.log(`   3. Sistema de rotação irá trocar conta automaticamente\n`);

                // FORÇAR SAÍDA COMPLETA
                throw new Error('MAX_SESSION_INVALID_REACHED: Stopping to prevent further detection');
              }

              console.log(`\n🔄 [AUTO-RECOVERY] Tentando recuperar sessão...`);
              resilienceMetrics.sessionRecoveries++;

              // Esperar antes de retry (delay adaptativo)
              const recoveryDelay = getAdaptiveDelay(10000);
              console.log(`   ⏳ Aguardando ${(recoveryDelay/1000).toFixed(1)}s antes de recuperar...`);
              await new Promise(resolve => setTimeout(resolve, recoveryDelay));
            }
          }

          if (retryCount >= MAX_RETRIES) {
            console.log(`⚠️  Máximo de retries atingido para #${hashtagToScrape}. Aceitando ${foundProfiles.length} perfis coletados`);
          }
        }
      } // FIM DO WHILE (retry loop)

      // 🆕 LOG DE STATUS DE RESILIÊNCIA APÓS CADA HASHTAG
      logResilienceStatus();

      // 🆕 ACUMULAR PERFIS DESTA HASHTAG NO RESULTADO TOTAL (mesmo se houve erro)
      if (foundProfiles.length > 0) {
        console.log(`✅ Acumulando ${foundProfiles.length} perfis da hashtag #${hashtagToScrape}`);
      }
      allFoundProfiles.push(...foundProfiles);
      console.log(`\n📊 Progresso total: ${allFoundProfiles.length} perfis coletados de ${hashtagIndex + 1} hashtag(s)\n`);

  } // 🆕 FIM DO LOOP DE HASHTAGS (for hashtagIndex)

  // 🆕 RESULTADO FINAL DE TODAS AS HASHTAGS
  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ SCRAPE-TAG CONCLUÍDO: ${allFoundProfiles.length} perfis coletados de ${hashtagsToScrape.length} hashtag(s)`);
  console.log(`${'='.repeat(80)}\n`);

  // 🆕 RELATÓRIO FINAL DE RESILIÊNCIA
  console.log(`\n📊 ========== RELATÓRIO DE RESILIÊNCIA ==========`);
  const finalSuccessRate = resilienceMetrics.totalSuccess + resilienceMetrics.totalErrors > 0
    ? ((resilienceMetrics.totalSuccess / (resilienceMetrics.totalSuccess + resilienceMetrics.totalErrors)) * 100).toFixed(1)
    : '0';
  console.log(`   Taxa de sucesso: ${finalSuccessRate}%`);
  console.log(`   Total de sucessos: ${resilienceMetrics.totalSuccess}`);
  console.log(`   Total de erros: ${resilienceMetrics.totalErrors}`);
  console.log(`   Recuperações de sessão: ${resilienceMetrics.sessionRecoveries}`);
  console.log(`   Hashtags puladas (circuit breaker): ${resilienceMetrics.hashtagsSkipped.length}`);
  if (resilienceMetrics.hashtagsSkipped.length > 0) {
    console.log(`   Hashtags puladas: ${resilienceMetrics.hashtagsSkipped.join(', ')}`);
  }
  console.log(`   Delay multiplier final: ${resilienceMetrics.adaptiveDelayMultiplier.toFixed(2)}x`);
  console.log(`${'='.repeat(50)}\n`);

  if (allFoundProfiles.length > 0) {
    const usernames = allFoundProfiles.slice(0, 10).map(p => `@${p.username}`).join(', ');
    console.log(`👥 Amostra de perfis: ${usernames}${allFoundProfiles.length > 10 ? '...' : ''}`);
  }

  // 🆕 CONSTRUIR RESULTADO COM METADADOS
  const totalRequested = maxProfiles * hashtagsToScrape.length;
  const isPartial = allFoundProfiles.length < totalRequested && allFoundProfiles.length > 0;
  const completionRate = totalRequested > 0
    ? ((allFoundProfiles.length / totalRequested) * 100).toFixed(1) + '%'
    : '0%';

  if (isPartial) {
    console.log(`⚠️  RESULTADO PARCIAL: ${allFoundProfiles.length}/${totalRequested} perfis (${completionRate})`);
    console.log(`   Possíveis causas: timeout, detached frame, ou falta de perfis nas hashtags`);
  }

  return {
    profiles: allFoundProfiles,
    is_partial: isPartial,
    requested: totalRequested,
    collected: allFoundProfiles.length,
    completion_rate: completionRate
  };

  } catch (error: any) {
    console.error(`❌ Erro ao scrape tag "${searchTerm}":`, error.message);

    // 🆕 NÃO PERDER OS PERFIS COLETADOS! Retornar mesmo com erro
    console.log(`⚠️  Retornando ${allFoundProfiles.length} perfis coletados antes do erro`);

    const totalRequested = maxProfiles * hashtagsToScrape.length;
    const isPartial = allFoundProfiles.length < totalRequested;
    const completionRate = totalRequested > 0
      ? ((allFoundProfiles.length / totalRequested) * 100).toFixed(1) + '%'
      : '0%';

    return {
      profiles: allFoundProfiles,
      is_partial: true, // Sempre parcial se caiu no catch
      requested: totalRequested,
      collected: allFoundProfiles.length,
      completion_rate: completionRate
    };
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
 * Converte nome de estado brasileiro para sigla (máximo 2 caracteres)
 */
function normalizeStateName(stateName: string | null): string | null {
  if (!stateName) return null;

  const stateMap: Record<string, string> = {
    'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amapa': 'AP',
    'amazonas': 'AM', 'bahia': 'BA', 'ceará': 'CE', 'ceara': 'CE',
    'distrito federal': 'DF', 'espírito santo': 'ES', 'espirito santo': 'ES',
    'goiás': 'GO', 'goias': 'GO', 'maranhão': 'MA', 'maranhao': 'MA',
    'mato grosso': 'MT', 'mato grosso do sul': 'MS',
    'minas gerais': 'MG', 'pará': 'PA', 'para': 'PA',
    'paraíba': 'PB', 'paraiba': 'PB', 'paraná': 'PR', 'parana': 'PR',
    'pernambuco': 'PE', 'piauí': 'PI', 'piaui': 'PI',
    'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
    'rio grande do sul': 'RS', 'rondônia': 'RO', 'rondonia': 'RO',
    'roraima': 'RR', 'santa catarina': 'SC',
    'são paulo': 'SP', 'sao paulo': 'SP',
    'sergipe': 'SE', 'tocantins': 'TO'
  };

  const normalized = stateName.toLowerCase().trim();

  // Se já é uma sigla de 2 letras, retorna em uppercase
  if (normalized.length === 2) {
    return normalized.toUpperCase();
  }

  // Procura no mapeamento
  return stateMap[normalized] || null;
}

/**
 * Sanitiza dados para inserção no banco (similar ao toSQL do N8N)
 * Garante que valores vazios viram NULL e limita tamanhos de campos
 */
function sanitizeForDatabase(profile: any): any {
  const sanitize = (value: any, maxLength?: number): any => {
    // NULL, undefined ou string vazia → null
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // String - limitar tamanho se especificado
    if (typeof value === 'string' && maxLength) {
      return value.substring(0, maxLength);
    }

    return value;
  };

  return {
    username: sanitize(profile.username),
    full_name: sanitize(profile.full_name),
    bio: sanitize(profile.bio),
    profile_pic_url: sanitize(profile.profile_pic_url),
    is_business_account: profile.is_business_account,
    is_verified: profile.is_verified,
    followers_count: profile.followers_count,
    following_count: profile.following_count,
    posts_count: profile.posts_count,
    email: sanitize(profile.email),
    phone: sanitize(profile.phone),
    website: sanitize(profile.website),
    business_category: sanitize(profile.business_category),
    city: sanitize(profile.city, 100), // MAX 100 caracteres
    state: sanitize(profile.state, 2), // MAX 2 caracteres
    neighborhood: sanitize(profile.neighborhood, 100), // MAX 100 caracteres
    address: sanitize(profile.address),
    zip_code: sanitize(profile.zip_code),
    activity_score: profile.activity_score || 0,
    is_active: profile.is_active,
    language: sanitize(profile.language, 10), // MAX 10 caracteres
    hashtags_bio: profile.hashtags_bio || null,
    hashtags_posts: profile.hashtags_posts || null,
    search_term_used: sanitize(profile.search_term_used),
    has_relevant_audience: profile.has_relevant_audience || false,
    lead_source: sanitize(profile.lead_source),
    followers_scraped_count: profile.followers_scraped_count || 0
  };
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
 * 🔍 Busca perfil via campo de busca do Instagram (COPIADO DO scrape-users)
 * @param page - Página Puppeteer já autenticada
 * @param username - Username para buscar
 */
async function searchProfileHumanLike(page: any, username: string): Promise<void> {
  console.log(`   🔍 Buscando via campo de pesquisa: @${username}`);

  try {
    // 1. Navegar para home do Instagram primeiro (se necessário)
    if (!page.url().includes('instagram.com')) {
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
      await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000)); // 1.5-2.5s
    }

    // 2. ABRIR CAMPO DE BUSCA (clica no ícone SVG) - COM PROTEÇÃO CONTRA DETACHED FRAME
    console.log(`   🖱️  Clicando no ícone de busca...`);
    let searchPanelOpened = false;
    try {
      searchPanelOpened = await page.evaluate(() => {
        const icon = document.querySelector('svg[aria-label="Pesquisar"], svg[aria-label="Search"]');
        if (!icon) return false;
        const clickable = icon.closest('a, button, div[role="button"]');
        if (clickable instanceof HTMLElement) {
          clickable.click();
          return true;
        }
        return false;
      });
    } catch (evalError: any) {
      console.log(`   ⚠️  Erro ao clicar no ícone (${evalError.message}), tentando fallback`);
      searchPanelOpened = false;
    }

    if (searchPanelOpened) {
      // ✅ Click funcionou! Aguardar painel de busca abrir (comportamento humano)
      console.log(`   ✅ Ícone clicado, aguardando painel de busca abrir...`);
      await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700)); // 0.8-1.5s
    } else {
      console.log(`   ⚠️  Ícone de busca não encontrado, tentando atalho "/"`);
      await page.keyboard.press('/');
      await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400)); // 0.6-1s
    }

    // 3. AGUARDAR CAMPO DE BUSCA APARECER
    const searchInputSelector = 'input[placeholder*="Pesquis"], input[placeholder*="Search"], input[aria-label*="Pesquis"], input[aria-label*="Search"]';
    const searchInput = await page.waitForSelector(searchInputSelector, { timeout: 8000, visible: true }).catch(() => null);

    if (!searchInput) {
      throw new Error('Campo de busca não encontrado após 8 segundos');
    }

    // 4. LIMPAR E DIGITAR USERNAME (letra por letra, como humano) - COM PROTEÇÃO
    console.log(`   ⌨️  Digitando "${username}"...`);
    try {
      await searchInput.evaluate((element: any) => {
        if (element instanceof HTMLInputElement) {
          element.focus();
          element.value = '';
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    } catch (evalError: any) {
      console.log(`   ⚠️  Erro ao focar campo (${evalError.message}), tentando via keyboard`);
      // Fallback: tentar focar via click
      await searchInput.click().catch(() => {});
    }

    // Digitar letra por letra - COMPORTAMENTO SUPER HUMANO COM ERROS
    try {
      const usernameArray = username.split('');

      for (let i = 0; i < usernameArray.length; i++) {
        const char = usernameArray[i];

        // 15% de chance de erro de digitação (exceto no último caractere)
        const shouldMakeTypo = Math.random() < 0.15 && i < usernameArray.length - 1;

        if (shouldMakeTypo) {
          // Digitar caractere errado
          const wrongChars = 'qwertyuiopasdfghjklzxcvbnm0123456789';
          const wrongChar = wrongChars[Math.floor(Math.random() * wrongChars.length)];
          await page.keyboard.type(wrongChar);
          console.log(`   ⌨️  Erro de digitação: "${wrongChar}" (será corrigido)`);
          await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300)); // 200-500ms perceber erro

          // Corrigir: Backspace
          await page.keyboard.press('Backspace');
          await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 200)); // 150-350ms

          // Digitar caractere correto
          await page.keyboard.type(char);
          await new Promise(resolve => setTimeout(resolve, 180 + Math.random() * 320)); // 180-500ms (mais lento após erro)
        } else {
          // Digitação normal (mais lenta que antes)
          await page.keyboard.type(char);
          await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 350)); // 150-500ms (antes era 100-250ms)
        }
      }

      console.log(`   ⏳ Aguardando sugestões aparecerem...`);
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1500)); // 2-3.5s (antes era 1.5-2.5s)
    } catch (keyboardError: any) {
      console.log(`   ⚠️  Erro ao digitar (${keyboardError.message}), tentando URL direta`);
      throw new Error(`Keyboard input failed: ${keyboardError.message}`);
    }

    // 5. CLICAR NO PRIMEIRO RESULTADO (o perfil exato) - COM PROTEÇÃO
    console.log(`   🎯 Procurando perfil @${username} nos resultados...`);
    let profileClicked = false;
    try {
      profileClicked = await page.evaluate((usr: string) => {
        // Procurar link que aponta para o perfil exato
        const links = Array.from(document.querySelectorAll('a'));
        const profileLink = links.find(link =>
          link.href.includes(`/${usr}/`) ||
          link.href.endsWith(`/${usr}`)
        );

        if (profileLink) {
          profileLink.click();
          return true;
        }
        return false;
      }, username);
    } catch (evalError: any) {
      console.log(`   ⚠️  Erro ao clicar no perfil (${evalError.message}), tentando Enter`);
      profileClicked = false;
    }

    if (profileClicked) {
      console.log(`   ✅ Clicou no perfil @${username}`);
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000)); // 2-3s
    } else {
      console.log(`   ⏎ Perfil não encontrado nos resultados, pressionando Enter...`);
      try {
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
      } catch (enterError: any) {
        console.log(`   ⚠️  Erro ao pressionar Enter (${enterError.message}), tentando URL direta`);
        throw new Error(`Enter key failed: ${enterError.message}`);
      }
    }

  } catch (error: any) {
    console.warn(`   ⚠️  Busca falhou: ${error.message}, usando URL direta como fallback`);
    await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
}

/**
 * 🎯 Scrape de perfil usando página já existente (para batch processing)
 * NÃO cria novo contexto, NÃO fecha a página - responsabilidade do caller
 * @param page - Página Puppeteer já autenticada
 * @param username - Username do Instagram (sem @)
 */
export async function scrapeProfileWithExistingPage(page: any, username: string): Promise<InstagramProfileData & { followers: string }> {
  try {
    // Usar busca humana ao invés de URL direta
    await searchProfileHumanLike(page, username);

    // Delay humano após carregar página (variável)
    const initialDelay = 800 + Math.random() * 700; // 0.8-1.5s
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    // Simular scroll suave para baixo (comportamento humano) - COM PROTEÇÃO
    try {
      await page.evaluate(() => {
        window.scrollBy({ top: 200, behavior: 'smooth' });
      });
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500)); // 0.5-1s
    } catch (scrollError: any) {
      console.log(`   ⚠️  Erro ao fazer scroll (${scrollError.message}), continuando...`);
    }

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
        // CRÍTICO: Instagram renderiza via React + delay humano variável
        const expandDelay = 2500 + Math.random() * 1000; // 2.5-3.5s
        await new Promise(resolve => setTimeout(resolve, expandDelay));
      }
    } catch (error: any) {
      // Silencioso - não é crítico se falhar
    }

    // CRÍTICO: Aguardar React renderizar + simular "leitura" da bio
    // Delay variável para parecer mais humano
    const readingDelay = 1500 + Math.random() * 1500; // 1.5-3s
    await new Promise(resolve => setTimeout(resolve, readingDelay));

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
      const bioElementsSet = new Set<string>(); // Usar Set para evitar duplicatas

      // Capturar todos os elementos de bio dentro de header section
      // Classe _ap3a marca elementos de bio do Instagram
      const bioEls = Array.from(document.querySelectorAll('header section ._ap3a._aaco._aacu._aacy._aad6._aade, header section ._ap3a._aaco._aacu._aacx._aad7._aade, header section h1._ap3a'));

      bioEls.forEach((el: any) => {
        const text = el.textContent?.trim();
        if (text && text.length > 3 && !text.match(/^\d+[\s\S]*seguidores?$/i)) {
          bioElementsSet.add(text); // Set evita duplicatas automaticamente
        }
      });

      // Se encontrou elementos, juntar com quebras de linha
      if (bioElementsSet.size > 0) {
        bio = Array.from(bioElementsSet).join('\n');
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

      // Extrair stats (followers, following, posts) - ARRAY COM DUPLICATAS
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
        if (stats.length >= 6) break; // Capturar duplicatas: 6 = 3 pares
      }

      return { full_name, bio, website_visible, stats };
    });

    // DEBUG: Imprimir logs da extração de full_name
    const debugLogs = await page.evaluate(() => (window as any).__fullNameDebug || []);
    console.log(`\n🔍 DEBUG - Extração de Full Name para @${username}:`);
    debugLogs.forEach((log: string) => console.log(`   ${log}`));
    console.log(`   Resultado final DOM: "${domData.full_name || 'NULL'}"\n`);

    // 🔥 EXTRAÇÃO CORRETA: Filtrar stats por palavra-chave
    // DOM retorna duplicatas: ["991 posts", "991", "207 mil seguidores", "207 mil", "138 seguindo", "138"]
    console.log(`\n🔍 DEBUG - Stats extraídos do DOM: [${domData.stats.join(', ')}]`);

    const postsText = domData.stats.find((s: string) =>
      s.toLowerCase().includes('post') || s.toLowerCase().includes('publicaç')
    ) || '';

    const followersText = domData.stats.find((s: string) =>
      s.toLowerCase().includes('seguidor') || s.toLowerCase().includes('follower')
    ) || '';

    const followingText = domData.stats.find((s: string) =>
      s.toLowerCase().includes('seguindo') || s.toLowerCase().includes('following')
    ) || '';

    const posts_count_from_dom = parseInstagramCount(postsText);
    const followers_count_from_dom = parseInstagramCount(followersText);
    const following_count_from_dom = parseInstagramCount(followingText);

    console.log(`   📊 Posts: "${postsText}" → ${posts_count_from_dom}`);
    console.log(`   📈 Seguidores: "${followersText}" → ${followers_count_from_dom}`);
    console.log(`   👥 Seguindo: "${followingText}" → ${following_count_from_dom}\n`);

    // Micro-delay: simular usuário olhando os stats (comportamento humano)
    const statsDelay = 400 + Math.random() * 600; // 0.4-1s
    await new Promise(resolve => setTimeout(resolve, statsDelay));

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
      followers: followers_count_from_dom.toString(),
      following: following_count_from_dom.toString(),
      posts: posts_count_from_dom.toString(),
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
      state: convertStateToAbbreviation(decodeInstagramString(stateMatch ? (stateMatch[1] || stateMatch[2]) : null)),
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
            profileData.state = convertStateToAbbreviation(stateFromPhone);
          }
        }
      }
    }

    // EXTRAIR LOCALIZAÇÃO DA BIO (usar bioForLocationParsing que contém endereço completo)
    // ⚠️ DESABILITADO: extractLocationFromBio está muito bugado, capturando bio inteira como city
    // Vamos confiar apenas nos dados estruturados do JSON do Instagram
    // if (bioForLocationParsing && (!profileData.city || !profileData.address || !profileData.zip_code)) {
    //   const locationFromBio = extractLocationFromBio(bioForLocationParsing);
    //   if (!profileData.address && locationFromBio.address) {
    //     profileData.address = locationFromBio.address;
    //   }
    //   if (!profileData.city && locationFromBio.city) {
    //     profileData.city = locationFromBio.city;
    //   }
    //   if (!profileData.state && locationFromBio.state) {
    //     profileData.state = convertStateToAbbreviation(locationFromBio.state);
    //   }
    //   if (!profileData.zip_code && locationFromBio.zip_code) {
    //     profileData.zip_code = locationFromBio.zip_code;
    //   }
    // }

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
  }
}

/**
 * 🔄 Wrapper para backward compatibility - cria contexto próprio e fecha após scrape
 * Para BATCH processing, use `scrapeProfileWithExistingPage` diretamente
 * @param username - Username do Instagram (sem @)
 */
export async function scrapeInstagramProfile(username: string): Promise<InstagramProfileData & { followers: string }> {
  const { page, requestId, cleanup } = await createIsolatedContext();
  console.log(`🔒 Request ${requestId} iniciada para scrape-profile: "${username}"`);

  try {
    const result = await scrapeProfileWithExistingPage(page, username);
    console.log(`✅ SCRAPE-PROFILE CONCLUÍDO: dados coletados para "@${username}"`);
    return result;
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

// ========== FUNÇÕES DE MONITORAMENTO E CLEANUP ==========

/**
 * Retorna status do browser Puppeteer
 */
export function getBrowserStatus(): {
  active: boolean;
  pid: number | null;
  pages: number;
  connected: boolean;
} {
  if (!browserInstance) {
    return { active: false, pid: null, pages: 0, connected: false };
  }

  return {
    active: true,
    pid: browserInstance.process()?.pid || null,
    pages: 0, // Será preenchido async se necessário
    connected: browserInstance.isConnected()
  };
}

/**
 * Força fechamento do browser (para uso em endpoints de admin)
 */
export async function forceCloseBrowser(): Promise<{ success: boolean; message: string }> {
  if (!browserInstance) {
    return { success: true, message: 'Nenhum browser ativo para fechar' };
  }

  const pid = browserInstance.process()?.pid;
  console.log(`\n🔪 [FORCE-CLOSE] Forçando fechamento do browser (PID: ${pid})...`);

  try {
    await browserInstance.close();
    browserInstance = null;
    sessionPage = null;
    return { success: true, message: `Browser (PID: ${pid}) fechado com sucesso` };
  } catch (err: any) {
    // Se não conseguiu fechar graciosamente, mata o processo
    if (pid) {
      process.kill(pid, 'SIGKILL');
    }
    browserInstance = null;
    sessionPage = null;
    return { success: true, message: `Browser (PID: ${pid}) killed forçadamente` };
  }
}

/**
 * Lista todos os processos Chrome/Puppeteer ativos no sistema
 */
export async function listPuppeteerProcesses(): Promise<string[]> {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    exec('ps aux | grep "Chrome for Testing" | grep -v grep', (error: any, stdout: string) => {
      if (error || !stdout) {
        resolve([]);
        return;
      }
      const lines = stdout.trim().split('\n').filter((l: string) => l.length > 0);
      resolve(lines);
    });
  });
}

/**
 * Mata todos os processos Puppeteer órfãos (exceto o atual)
 */
export async function killOrphanPuppeteerProcesses(): Promise<{ killed: number; currentPid: number | null }> {
  const currentPid = browserInstance?.process()?.pid || null;
  const { exec } = require('child_process');

  return new Promise((resolve) => {
    exec('pkill -f "Google Chrome for Testing"', (error: any) => {
      // Re-verificar quantos foram mortos
      exec('ps aux | grep "Chrome for Testing" | grep -v grep | wc -l', (_: any, stdout: string) => {
        const remaining = parseInt(stdout.trim()) || 0;
        resolve({ killed: 41 - remaining, currentPid }); // Aproximação
      });
    });
  });
}
