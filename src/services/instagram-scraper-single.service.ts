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
import { createIsolatedContext, createDedicatedPage, forceClosePersistentPage } from './instagram-context-manager.service';
import { discoverHashtagVariations, HashtagVariation } from './instagram-hashtag-discovery.service';
import { getAccountRotation } from './instagram-account-rotation.service';
import {
  detectInstagramChallenge,
  waitHuman,
  scrollHuman,
  moveMouseHuman
} from './instagram-stealth.service';
import { proxyRotationService } from './proxy-rotation.service';
import {
  extractWhatsAppForPersistence,
  isWaMessageLink,
  extractWhatsAppFromMessageLink,
  isValidBrazilNumber
} from '../utils/whatsapp-extractor.util';
import { createClient } from '@supabase/supabase-js';

// Supabase client para verificações de duplicatas
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// 🚨 Erro customizado para cooldown global
class GlobalCooldownError extends Error {
  constructor(message: string, public waitMinutes: number) {
    super(message);
    this.name = 'GlobalCooldownError';
  }
}

// Controla instância única de browser e página de sessão
let browserInstance: Browser | null = null;
let sessionPage: Page | null = null;
let sessionInitialization: Promise<void> | null = null;
let loggedUsername: string | null = null;
let currentProxyConfig: { host: string; port: number; username?: string; password?: string } | null = null;
let proxyFallbackActive = false; // Quando proxy falha, usa IP direto temporariamente

// Métricas de performance para comparação
interface PerformanceMetrics {
  withProxy: { success: number; blocked: number; avgTime: number };
  withoutProxy: { success: number; blocked: number; avgTime: number };
}
const performanceMetrics: PerformanceMetrics = {
  withProxy: { success: 0, blocked: 0, avgTime: 0 },
  withoutProxy: { success: 0, blocked: 0, avgTime: 0 }
};

// Arquivo para salvar cookies da sessão
const COOKIES_FILE = path.join(process.cwd(), 'instagram-cookies.json');

// ========== ERRO CUSTOMIZADO PARA RATE LIMITING ==========
class RateLimitError extends Error {
  constructor(message: string = 'Instagram bloqueou por rate limiting (429)') {
    super(message);
    this.name = 'RateLimitError';
  }
}

// ========== CONFIGURAÇÕES ANTI-DETECÇÃO ==========
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

const VIEWPORT_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1680, height: 1050 }
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomViewport(): { width: number; height: number } {
  return VIEWPORT_SIZES[Math.floor(Math.random() * VIEWPORT_SIZES.length)];
}

// ========== NAVEGAÇÃO COM DETECÇÃO DE RATE LIMITING ==========
/**
 * Navega para URL detectando erro 429 e páginas de erro do Chrome
 * @throws RateLimitError se Instagram bloqueou (429)
 */
async function navigateWithRateLimitDetection(
  page: Page,
  url: string,
  options: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'; timeout?: number } = {}
): Promise<void> {

  const { waitUntil = 'domcontentloaded', timeout = 30000 } = options;

  console.log(`   🔍 Navegando para: ${url.substring(0, 80)}...`);

  const response = await page.goto(url, { waitUntil, timeout });

  // 🚨 DETECÇÃO 1: Erro 429 (Too Many Requests)
  if (response && response.status() === 429) {
    console.log(`\n🚨 ========================================`);
    console.log(`🚨 ERRO 429: Instagram bloqueou por rate limiting!`);
    console.log(`🚨 ========================================`);
    console.log(`⏸️  Conta atual será pausada`);
    console.log(`🔄 Sistema irá rotacionar para próxima conta\n`);
    throw new RateLimitError();
  }

  // 🚨 DETECÇÃO 2: Página de erro do Chrome
  const currentUrl = page.url();
  if (currentUrl.includes('chrome-error://')) {
    console.log(`\n⚠️  ========================================`);
    console.log(`⚠️  PÁGINA DE ERRO: ${currentUrl}`);
    console.log(`⚠️  Possível bloqueio ou erro de rede`);
    console.log(`⚠️  ========================================\n`);
    throw new RateLimitError('Navegação resultou em página de erro (possível bloqueio)');
  }

  // 🚨 DETECÇÃO 3: Response status 5xx (erro do servidor)
  if (response && response.status() >= 500) {
    console.log(`\n⚠️  Erro ${response.status()}: Problema no servidor do Instagram`);
    throw new Error(`Instagram retornou erro ${response.status()}`);
  }

  // 🕵️ DETECÇÃO 4: Challenges de segurança do Instagram
  const challenge = await detectInstagramChallenge(page);
  if (challenge.hasChallenge) {
    console.log(`\n🚨 ========================================`);
    console.log(`🚨 CHALLENGE DETECTADO: ${challenge.type}`);
    console.log(`🚨 Mensagem: ${challenge.message}`);
    console.log(`🚨 ========================================`);
    console.log(`⚠️  Instagram solicitou verificação de segurança`);
    console.log(`🔄 Tratando como rate limit para rotação de conta\n`);
    throw new RateLimitError(`Challenge de segurança detectado: ${challenge.type}`);
  }

  // 🚨 DETECÇÃO 5: Página de erro do Instagram
  const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');

  // 🔄 "Service Unavailable" = erro temporário do servidor → sinalizar para retry com browser restart
  const isServiceUnavailable =
    bodyText.includes('Service Unavailable') ||
    bodyText.includes('Serviço Indisponível');

  if (isServiceUnavailable) {
    console.log(`\n⚠️  ========================================`);
    console.log(`⚠️  "SERVICE UNAVAILABLE" DETECTADO`);
    console.log(`⚠️  Erro temporário do servidor Instagram`);
    console.log(`⚠️  Requer restart do browser (tratado no loop principal)`);
    console.log(`⚠️  ========================================`);

    // Lançar erro especial que será tratado no loop principal com browser restart
    throw new Error('SERVICE_UNAVAILABLE');
  }

  // 🚨 Outros erros ("Something went wrong", etc.) = rotacionar imediatamente
  const hasSomethingWentWrong =
    bodyText.includes('Something went wrong') ||
    bodyText.includes('Ocorreu um erro') ||
    bodyText.includes('não foi possível carregar') ||
    bodyText.includes('error occurred') ||
    bodyText.includes("couldn't load this page") ||
    bodyText.includes('Try again');

  if (hasSomethingWentWrong) {
    console.log(`\n🚨 ========================================`);
    console.log(`🚨 ERRO "SOMETHING WENT WRONG" DETECTADO!`);
    console.log(`🚨 Instagram retornou página de erro (HTTP 200)`);
    console.log(`🚨 ========================================`);
    console.log(`⏸️  Tratando como rate limit para rotação de conta`);
    console.log(`🔄 Sistema irá fazer IP cooling (30min) e rotacionar\n`);

    // 🔧 CRÍTICO: Registrar falha ANTES de lançar erro para ativar IP cooling de 30min
    try {
      const accountRotation = getAccountRotation();
      await accountRotation.recordFailure('SOMETHING_WENT_WRONG', 'Instagram retornou página de erro');
      console.log(`   ✅ Falha registrada - IP cooling de 30min ativado`);
    } catch (recordError: any) {
      console.log(`   ⚠️  Erro ao registrar falha: ${recordError.message}`);
    }

    throw new RateLimitError('Instagram retornou "Something went wrong"');
  }

  console.log(`   ✅ Navegação bem-sucedida (${response?.status() || 'unknown'})`);
}

/**
 * Faz logout do Instagram e limpa sessão/cookies
 */
async function logoutAndClearSession(page: Page): Promise<void> {
  console.log(`\n🚪 ========== LOGOUT E LIMPEZA ==========`);

  try {
    // 1. Navegar para Instagram
    console.log(`   📍 Navegando para Instagram...`);
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

    // 2. Tentar fazer logout via UI (se possível)
    console.log(`   🔓 Tentando logout via interface...`);
    try {
      // Clicar no menu de perfil (canto superior direito)
      await page.click('svg[aria-label="Settings"]').catch(() => {});
      await waitHuman(1000, 2000); // 1-2s humanizado

      // Clicar em "Log out"
      await page.click('button:has-text("Log out"), a:has-text("Log out")').catch(() => {});
      await waitHuman(2000, 3000); // 2-3s humanizado
    } catch (logoutError) {
      console.log(`   ⚠️  Logout via UI falhou (normal se sessão inválida)`);
    }

    // 3. Limpar cookies do navegador
    console.log(`   🧹 Limpando cookies do navegador...`);
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');

    // 4. Deletar arquivo de cookies local
    console.log(`   🗑️  Deletando arquivo de cookies...`);
    const accountRotation = getAccountRotation();
    const currentAccount = accountRotation.getCurrentAccount();
    if (fs.existsSync(currentAccount.cookiesFile)) {
      fs.unlinkSync(currentAccount.cookiesFile);
      console.log(`   ✅ Arquivo deletado: ${path.basename(currentAccount.cookiesFile)}`);
    }

    // 5. Resetar variáveis de sessão
    loggedUsername = null;
    sessionPage = null;

    console.log(`   ✅ Logout e limpeza concluídos`);

  } catch (error: any) {
    console.log(`   ⚠️  Erro durante logout: ${error.message}`);
    console.log(`   ℹ️  Continuando com rotação de conta...`);
  }

  console.log(`========================================\n`);
}

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

// ========== SISTEMA DE DELAYS INTELIGENTE PARA SCROLL ==========
/**
 * Configuração de delays adaptativos baseados em profundidade do scroll
 */
interface ScrollDelayConfig {
  baseDelays: { maxScroll: number; delay: number }[];
  duplicateMultipliers: { threshold: number; multiplier: number }[];
  humanVariation: number; // Percentual de variação (ex: 0.2 = ±20%)
}

const INSTAGRAM_SCROLL_CONFIG: ScrollDelayConfig = {
  baseDelays: [
    { maxScroll: 2000, delay: 6500 },    // 0-2000px: 6.5s base (±20% = 5.2-7.8s)
    { maxScroll: 5000, delay: 12000 },   // 2000-5000px: 12s
    { maxScroll: 10000, delay: 18000 },  // 5000-10000px: 18s
    { maxScroll: Infinity, delay: 25000 } // 10000px+: 25s
  ],
  duplicateMultipliers: [
    { threshold: 6, multiplier: 1.5 },   // 6+ duplicatas: +50%
    { threshold: 3, multiplier: 1.25 },  // 3+ duplicatas: +25%
    { threshold: 0, multiplier: 1.0 }    // Normal: 100%
  ],
  humanVariation: 0.2 // ±20%
};

/**
 * Calcula scroll multiplier baseado em duplicatas E clicks acumulados no mural
 * Quanto mais duplicatas/clicks, mais agressivo o scroll para buscar conteúdo novo
 *
 * DUPLICATAS (base) - VALORES CONSERVADORES:
 * - 0-2 dups: 0.5x - scroll suave (metade da tela)
 * - 3-5 dups: 1.5x - scroll moderado (1.5 telas)
 * - 6+ dups: 2.5x - scroll agressivo (2.5 telas)
 *
 * CLICKS NO MURAL (boost adicional):
 * - 12+ clicks: +10% (1.1x boost)
 * - 18+ clicks: +20% (1.2x boost)
 * - 24+ clicks: +30% (1.3x boost)
 * - 32+ clicks: +40% (1.4x boost)
 *
 * CAP MÁXIMO: 3.5x (evitar virtual scrolling do Instagram)
 * IMPORTANTE: totalHashtagFeedClicks NUNCA reseta (acumulativo)
 */
function calculateScrollMultiplier(
  consecutiveDuplicates: number,
  totalHashtagFeedClicks: number = 0
): number {
  // 1. Base por duplicatas (VALORES MAIS CONSERVADORES)
  let baseMultiplier = 0.5; // Suave - metade da tela
  if (consecutiveDuplicates >= 6) {
    baseMultiplier = 1.5; // Moderado (antes era 2.5)
  } else if (consecutiveDuplicates >= 3) {
    baseMultiplier = 1.5; // Moderado
  }

  // 2. Boost adicional por clicks acumulados no mural (REDUZIDO)
  let clickBoost = 1.0; // Sem boost inicial

  if (totalHashtagFeedClicks >= 32) {
    clickBoost = 1.4; // +40% (reduzido de +50%)
  } else if (totalHashtagFeedClicks >= 24) {
    clickBoost = 1.3; // +30% (reduzido de +35%)
  } else if (totalHashtagFeedClicks >= 18) {
    clickBoost = 1.2; // +20% (mantido)
  } else if (totalHashtagFeedClicks >= 12) {
    clickBoost = 1.1; // +10% (mantido)
  }

  // 3. Combinar multiplicadores
  const finalMultiplier = baseMultiplier * clickBoost;

  // 4. Cap máximo REDUZIDO para evitar virtual scrolling
  const cappedMultiplier = Math.min(finalMultiplier, 2.5);

  console.log(`   📊 Scroll multiplier: ${cappedMultiplier.toFixed(2)}x (dups: ${consecutiveDuplicates}, clicks mural: ${totalHashtagFeedClicks}, base: ${baseMultiplier}x, boost: ${clickBoost}x)`);

  return cappedMultiplier;
}

/**
 * Calcula delay inteligente baseado na profundidade do scroll e duplicatas
 */
async function calculateIntelligentDelay(
  page: Page,
  consecutiveDuplicates: number,
  config: ScrollDelayConfig = INSTAGRAM_SCROLL_CONFIG
): Promise<number> {
  // 1. Obter posição atual do scroll
  const scrollY = await page.evaluate(() => window.scrollY);

  // 2. Encontrar delay base pela profundidade
  const baseConfig = config.baseDelays.find(d => scrollY < d.maxScroll);
  const baseDelay = baseConfig?.delay || 20000;

  // 3. Aplicar multiplicador por duplicatas
  const multiplierConfig = config.duplicateMultipliers.find(
    m => consecutiveDuplicates >= m.threshold
  );
  const multiplier = multiplierConfig?.multiplier || 1.0;

  // 4. Adicionar variação humana (±20%)
  const variation = 1 + (Math.random() * 2 - 1) * config.humanVariation;

  // 5. Calcular delay final
  const finalDelay = Math.round(baseDelay * multiplier * variation);

  console.log(`⏱️ Delay calculado: ${finalDelay}ms (scroll: ${scrollY}px, dups: ${consecutiveDuplicates}, base: ${baseDelay}ms, mult: ${multiplier}x, var: ${variation.toFixed(2)}x)`);

  return finalDelay;
}

/**
 * Faz scroll e aguarda posts carregarem de forma inteligente
 * @returns { success: boolean, postsLoaded: number }
 */
async function scrollAndWaitIntelligently(
  page: Page,
  consecutiveDuplicates: number,
  scrollMultiplier: number = 1.5
): Promise<{ success: boolean; postsLoaded: number }> {

  const initialCount = await page.$$('a[href*="/p/"], a[href*="/reel/"]').then(handles => handles.length);

  // 1. Fazer scroll GRADUAL/INCREMENTAL (força Instagram a carregar posts)
  const totalScrollDistance = await page.evaluate(() => window.innerHeight) * scrollMultiplier;
  const incrementSize = 300; // Scroll de 300px por vez (natural)
  const numIncrements = Math.ceil(totalScrollDistance / incrementSize);

  console.log(`   📜 Scroll gradual: ${numIncrements} incrementos de ${incrementSize}px (total: ${totalScrollDistance.toFixed(0)}px)`);

  for (let i = 0; i < numIncrements; i++) {
    // 🕵️ STEALTH: Usa scrollHuman() com curva Bezier natural
    await scrollHuman(page, incrementSize);

    // Pausa entre scrolls para Instagram carregar (humanizado)
    await waitHuman(400, 600); // 400-600ms com distribuição não-linear
  }

  // 1.5. AGUARDAR scroll final ser processado pelo navegador
  await waitHuman(800, 1200); // 800-1200ms humanizado

  // 2. Calcular delay inteligente
  const delay = await calculateIntelligentDelay(page, consecutiveDuplicates);

  // 3. Aguardar com monitoramento progressivo
  const startTime = Date.now();
  let lastCount = initialCount;
  let stableChecks = 0;
  const checkInterval = 1000; // Checar a cada 1s
  const maxStableChecks = 3; // 3 segundos sem mudança = estável

  while (Date.now() - startTime < delay) {
    await new Promise(resolve => setTimeout(resolve, checkInterval));

    const currentCount = await page.$$('a[href*="/p/"], a[href*="/reel/"]').then(handles => handles.length);
    const newPosts = currentCount - initialCount;

    // Critério de saída antecipada: 8+ posts novos (aumentado de 3 para dar mais tempo ao mural)
    if (newPosts >= 8) {
      const elapsed = Date.now() - startTime;
      console.log(`✅ ${newPosts} posts carregados em ${(elapsed/1000).toFixed(1)}s (saída antecipada)`);
      return { success: true, postsLoaded: newPosts };
    }

    // Detectar estabilização (count não muda por 3 segundos seguidos)
    if (currentCount === lastCount) {
      stableChecks++;
      if (stableChecks >= maxStableChecks && newPosts > 0) {
        console.log(`⏹️ Carregamento estabilizado (${newPosts} posts)`);
        return { success: true, postsLoaded: newPosts };
      }
    } else {
      stableChecks = 0;
      lastCount = currentCount;
    }
  }

  // Timeout atingido
  const finalCount = await page.$$('a[href*="/p/"], a[href*="/reel/"]').then(handles => handles.length);
  const finalNew = finalCount - initialCount;

  if (finalNew === 0) {
    console.log(`⚠️ Nenhum post novo após ${delay}ms - possível fim do mural`);
    return { success: false, postsLoaded: 0 };
  } else {
    console.log(`⏱️ Timeout (${delay}ms) - ${finalNew} posts carregados`);
    return { success: true, postsLoaded: finalNew };
  }
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

// 🕵️ REMOVIDO: humanDelay() e antiDetectionDelay() locais
// Agora usa waitHuman() do instagram-stealth.service.ts (mais sofisticado com distribuição não-linear)

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
 * 🆕 Detecta e trata a tela "Continue as [username]" do Instagram
 * Esta tela aparece quando o Instagram tem uma sessão parcial e pede confirmação
 * @returns true se detectou e clicou no botão, false se tela não estava presente
 */
async function handleContinueAsScreen(page: Page): Promise<boolean> {
  try {
    console.log('🔍 Verificando tela "Continue as"...');

    // Aguardar um pouco para a página carregar
    await waitHuman(1500, 2500);

    // Verificar se existe o botão "Continue as [username]"
    // O seletor pode variar, então tentamos múltiplos
    const continueButtonSelectors = [
      'button[type="button"]:has-text("Continue as")',
      'button:has-text("Continue as")',
      'button:has-text("Continuar como")',
      'div[role="button"]:has-text("Continue as")',
      'div[role="button"]:has-text("Continuar como")'
    ];

    // Verificar via evaluate para maior compatibilidade
    const buttonFound = await page.evaluate(() => {
      // Procurar por botões com texto "Continue as" ou "Continuar como"
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('continue as') || text.includes('continuar como')) {
          return true;
        }
      }
      return false;
    });

    if (!buttonFound) {
      console.log('   ℹ️  Tela "Continue as" não detectada');
      return false;
    }

    console.log('   🎯 Tela "Continue as" DETECTADA!');
    console.log('   🖱️  Clicando para continuar com a sessão...');

    // Clicar no botão via evaluate
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('continue as') || text.includes('continuar como')) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      console.log('   ✅ Botão clicado! Aguardando navegação...');
      await waitHuman(3000, 5000); // Esperar a transição

      // Verificar se saiu da tela de "Continue as"
      const stillOnContinueScreen = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('continue as') || text.includes('continuar como')) {
            return true;
          }
        }
        return false;
      });

      if (!stillOnContinueScreen) {
        console.log('   ✅ Transição bem-sucedida! Sessão retomada.');
        return true;
      } else {
        console.log('   ⚠️  Ainda na tela "Continue as", tentando novamente...');
        // Tentar clicar novamente com selector direto
        try {
          await page.click('button');
          await waitHuman(2000, 3000);
        } catch (e) {
          // Ignorar erro
        }
        return true;
      }
    }

    return false;
  } catch (error: any) {
    console.log(`   ⚠️  Erro ao tratar tela "Continue as": ${error.message}`);
    return false;
  }
}

/**
 * Verifica se está logado no Instagram
 * NÃO recarrega a página, apenas verifica cookies e elementos DOM
 * 🆕 Também detecta e trata a tela "Continue as [username]"
 */
async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    // NÃO fazer page.goto() aqui - isso recarrega a página!
    // Apenas verificar se já está na página do Instagram
    const currentUrl = page.url();
    if (!currentUrl.includes('instagram.com')) {
      // Se não estiver no Instagram, navegar (só uma vez)
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 });
      await waitHuman(1300, 2000);
    }

    // 🆕 Verificar e tratar tela "Continue as [username]"
    // Esta tela aparece quando o Instagram tem sessão parcial
    const handledContinue = await handleContinueAsScreen(page);
    if (handledContinue) {
      console.log('   ✅ Tela "Continue as" tratada com sucesso');
      // Aguardar um pouco mais após clicar
      await waitHuman(2000, 3000);
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

  // 🔄 ROTAÇÃO DE CONTAS: Usar Instagram username da conta ativa
  const rotation = getAccountRotation();
  const currentAccount = rotation.getCurrentAccount();
  const expectedInstagramUsername = currentAccount.instagramUsername || currentAccount.username.split('@')[0];
  console.log(`💡 Usando username da conta ativa: ${expectedInstagramUsername}`);
  loggedUsername = expectedInstagramUsername;
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
 * 🆕 VERIFICA COOLDOWNS ANTES DE INICIAR - aguarda se necessário
 */
async function ensureLoggedSession(): Promise<void> {
  if (sessionInitialization) {
    await sessionInitialization;
    return;
  }

  sessionInitialization = (async () => {
    // 🆕 VERIFICAR COOLDOWNS ANTES DE INICIAR BROWSER
    // Se a conta atual estiver bloqueada, encontrar a melhor e aguardar se necessário
    const rotation = InstagramAccountRotationService.getInstance();
    const currentAccount = rotation.getCurrentAccount();

    console.log(`\n🔍 ========== VERIFICAÇÃO PRÉ-INICIALIZAÇÃO ==========`);
    console.log(`   Conta configurada: @${currentAccount.instagramUsername}`);
    console.log(`   Bloqueada: ${currentAccount.isBlocked ? '❌ SIM' : '✅ NÃO'}`);

    if (currentAccount.isBlocked) {
      console.log(`\n⚠️  Conta atual está bloqueada - verificando melhor opção...`);

      // Tentar rotacionar para conta mais fria
      let rotationResult = await rotation.rotateToNextAccount();

      // Se precisa aguardar, aguarda UMA VEZ o tempo máximo
      if (rotationResult.requiresWait && rotationResult.waitMinutes) {
        console.log(`\n⏰ ========================================`);
        console.log(`⏰ 🚨 AGUARDANDO ${rotationResult.waitMinutes}min ANTES DE INICIAR`);
        console.log(`⏰ Motivo: ${rotationResult.message}`);
        console.log(`⏰ ========================================\n`);

        const waitMs = rotationResult.waitMinutes * 60 * 1000;
        await new Promise(resolve => setTimeout(resolve, waitMs));

        console.log(`✅ Período de espera concluído - executando rotação...`);
        rotationResult = await rotation.rotateToNextAccount();
      }

      if (rotationResult.success && !rotationResult.requiresWait) {
        console.log(`✅ Rotacionado para: @${rotationResult.newAccount}`);
      } else {
        console.log(`⚠️  Não foi possível rotacionar, tentando com conta atual mesmo assim...`);
      }
    } else {
      console.log(`   ✅ Conta disponível - iniciando normalmente`);
    }
    console.log(`====================================================\n`);

    if (!browserInstance || !browserInstance.isConnected()) {
      console.log('🌐 Iniciando novo browser Puppeteer...');

      // 🔒 CONFIGURAÇÕES ANTI-DETECÇÃO
      const viewport = getRandomViewport();
      const userAgent = getRandomUserAgent();

      console.log(`   🎭 User-Agent: ${userAgent.substring(0, 50)}...`);
      console.log(`   📐 Viewport: ${viewport.width}x${viewport.height}`);

      // 🌐 CONFIGURAR PROXY (se habilitado e não em fallback)
      let proxyServer: string | undefined;
      currentProxyConfig = null; // Reset proxy config

      // 🔍 DEBUG - Verificar estado do proxy
      const proxyEnabled = proxyRotationService.isEnabled();
      const totalProxies = proxyRotationService.getTotalProxies();
      console.log(`   🔍 DEBUG - Proxy enabled: ${proxyEnabled}, Total proxies: ${totalProxies}, Fallback: ${proxyFallbackActive}`);
      console.log(`   🔍 DEBUG - ENABLE_PROXY_ROTATION env: ${process.env.ENABLE_PROXY_ROTATION}`);

      const shouldUseProxy = proxyRotationService.isEnabled() && !proxyFallbackActive;

      if (shouldUseProxy) {
        const proxyConfig = proxyRotationService.getNextProxy();
        if (proxyConfig) {
          proxyServer = proxyRotationService.formatProxyForPuppeteer(proxyConfig);
          currentProxyConfig = {
            host: proxyConfig.host,
            port: proxyConfig.port,
            username: proxyConfig.username,
            password: proxyConfig.password
          };
          console.log(`   🌐 Proxy: ${proxyConfig.host}:${proxyConfig.port} (${proxyConfig.protocol})`);
          console.log(`   🔍 DEBUG - Proxy URL formatada: ${proxyServer}`);
        } else {
          console.warn(`   ⚠️  Proxy habilitado mas nenhum proxy disponível - usando IP direto`);
        }
      } else if (proxyFallbackActive) {
        console.log(`   🔄 FALLBACK ATIVO - usando IP direto (proxy falhou)`);
      } else {
        console.log(`   🚫 Proxy desabilitado - usando IP direto`);
      }

      const launchArgs = [
        '--disable-blink-features=AutomationControlled', // 🔥 Remove flag "navigator.webdriver"
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        `--user-agent=${userAgent}`, // 🎭 User-Agent randomizado
        `--window-size=${viewport.width},${viewport.height}` // 📐 Tamanho randomizado
      ];

      // Adicionar proxy server se configurado
      if (proxyServer) {
        launchArgs.push(`--proxy-server=${proxyServer}`);
      }

      browserInstance = await puppeteer.launch({
        headless: false, // Visível no Mac para login manual
        defaultViewport: viewport,
        args: launchArgs,
        protocolTimeout: 120000 // 2 minutos para operações lentas do Instagram (4x padrão de 30s)
      });

      console.log('   ✅ Browser lançado com proteções anti-detecção');
    }

    if (!sessionPage || sessionPage.isClosed()) {
      const pages = await browserInstance.pages();
      sessionPage = pages[0] || await browserInstance.newPage();

      // 🔐 AUTENTICAR PROXY (se tiver username/password)
      if (currentProxyConfig?.username && currentProxyConfig?.password) {
        await sessionPage.authenticate({
          username: currentProxyConfig.username,
          password: currentProxyConfig.password
        });
        console.log(`   🔐 Proxy autenticado: ${currentProxyConfig.username}@${currentProxyConfig.host}`);
      }

      // 🔒 MASCARAR SINAIS DE AUTOMAÇÃO
      await sessionPage.evaluateOnNewDocument(() => {
        // Remove navigator.webdriver flag
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });

        // Adiciona plugins fake
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        // Adiciona languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en', 'pt-BR', 'pt'],
        });

        // Chrome runtime
        // @ts-ignore
        window.chrome = {
          runtime: {},
        };

        // Permissions
        const originalQuery = window.navigator.permissions.query;
        // @ts-ignore
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      });

      console.log('📄 Instância de sessão criada com proteções anti-detecção');
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
      // 🔄 ROTAÇÃO DE CONTAS: Usar credenciais da conta ativa (NÃO do .env direto!)
      const rotation = getAccountRotation();
      const currentAccount = rotation.getCurrentAccount();
      const scraperUsername = currentAccount.username;
      const scraperPassword = currentAccount.password;

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
          await waitHuman(4500, 6000);
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

        try {
          await sessionPage.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 120000 });
        } catch (proxyErr: any) {
          // Se erro de proxy (407/403/timeout), ativar fallback para IP direto
          const isProxyError = proxyErr?.message?.includes('ERR_NO_SUPPORTED_PROXIES') ||
                              proxyErr?.message?.includes('ERR_PROXY_CONNECTION_FAILED') ||
                              proxyErr?.message?.includes('407') ||
                              proxyErr?.message?.includes('403');

          if (isProxyError && !proxyFallbackActive) {
            console.log(`\n⚠️  ========================================`);
            console.log(`⚠️  PROXY FALHOU: ${proxyErr.message}`);
            console.log(`⚠️  Ativando FALLBACK para IP direto`);
            console.log(`⚠️  ========================================\n`);

            // Registrar falha do proxy
            if (currentProxyConfig) {
              proxyRotationService.recordProxyFailure(currentProxyConfig);
            }

            // Fechar browser e resetar
            try {
              await browserInstance?.close().catch(() => {});
            } catch {}
            browserInstance = null;
            sessionPage = null;
            sessionInitialization = null;

            // Ativar fallback e tentar novamente
            proxyFallbackActive = true;
            return await ensureLoggedSession();
          }

          throw proxyErr;
        }
        await waitHuman(2700, 3500); // Esperar página carregar completamente (randomizado)

        // 🆕 Verificar e tratar tela "Continue as [username]" antes de tentar login
        const handledContinueScreen = await handleContinueAsScreen(sessionPage);
        if (handledContinueScreen) {
          console.log('✅ Sessão retomada via "Continue as" - verificando login...');
          const alreadyLoggedIn = await isLoggedIn(sessionPage);
          if (alreadyLoggedIn) {
            console.log('✅ Login confirmado após "Continue as"!');
            await saveCookies(sessionPage);
            await resolveLoggedUsername();
            return; // Sair do fluxo de login, sessão já está OK
          }
        }

        // Verificar se já está na página de login
        const currentUrl = sessionPage.url();
        console.log(`📍 URL atual: ${currentUrl}`);

        // Preencher credenciais
        try {
          console.log('📝 Preenchendo username...');
          await sessionPage.waitForSelector('input[name="username"]', { timeout: 10000 });
          await sessionPage.type('input[name="username"]', scraperUsername, { delay: 100 });
          await waitHuman(400, 700);

          console.log('📝 Preenchendo password...');
          await sessionPage.type('input[name="password"]', scraperPassword, { delay: 100 });
          await waitHuman(400, 700);

          console.log('🔘 Clicando em Login...');
          await sessionPage.click('button[type="submit"]');

          // Esperar navegação ou mudança de estado
          console.log('⏳ Aguardando resposta do Instagram...');
          await waitHuman(7000, 9000); // 7-9 segundos para processar (randomizado)

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
                await waitHuman(4500, 6000);
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
  // 🔧 FIX: Usar createIsolatedContext() para garantir página persistente única
  // Isso evita múltiplas páginas abertas causando logs intercalados
  console.log('🔄 createAuthenticatedPage() redirecionando para createIsolatedContext()...');

  // Fechar página persistente anterior para garantir página limpa
  await forceClosePersistentPage();

  const context = await createIsolatedContext();
  return context.page;
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
 * Detecta erro de sessão e faz troca automática de conta
 * @returns true se conseguiu recuperar com nova conta, false se não foi possível
 */
async function handleSessionError(page: Page, errorType: string): Promise<boolean> {
  console.log(`\n🚨 ========== ERRO DE SESSÃO DETECTADO ==========`);
  console.log(`   Tipo: ${errorType}`);
  console.log(`   URL atual: ${page.url()}`);
  console.log(`===============================================\n`);

  // 🔄 Registrar falha no sistema de rotação
  const rotation = getAccountRotation();

  // 🎯 SINCRONIZAR ESTADO: Detectar qual conta está REALMENTE logada
  console.log(`\n🔍 ========== SINCRONIZANDO ESTADO DE ROTAÇÃO ==========`);
  console.log(`   📊 Estado diz: currentAccountIndex = ${rotation.state.currentAccountIndex}`);
  console.log(`   📊 Conta no estado: ${rotation.getCurrentAccount().username}`);

  // 🎯 EXTRAIR loggedUsername da mensagem de erro se disponível
  let actualLoggedUser = loggedUsername;
  const loggedUserMatch = errorType.match(/\[LoggedUser: ([^\]]+)\]/);
  if (!actualLoggedUser && loggedUserMatch) {
    actualLoggedUser = loggedUserMatch[1];
    console.log(`   🔍 LoggedUser extraído da mensagem de erro: ${actualLoggedUser}`);
  }

  console.log(`   🔍 Conta REAL logada: ${actualLoggedUser || 'DESCONHECIDA'}`);

  // Se temos actualLoggedUser, sincronizar o índice
  if (actualLoggedUser) {
    // 🎯 FIX: Usar método correto para buscar por Instagram username
    const actualAccountIndex = rotation.findAccountByInstagramUsername(actualLoggedUser);

    if (actualAccountIndex !== -1) {
      const foundAccount = rotation['accounts'][actualAccountIndex];
      console.log(`   ✅ Conta identificada: ${foundAccount.username} (@${foundAccount.instagramUsername || 'N/A'})`);

      if (actualAccountIndex !== rotation['state'].currentAccountIndex) {
        console.log(`   ⚠️  DESSINCRONIA DETECTADA!`);
        console.log(`   🔄 Corrigindo: index ${rotation['state'].currentAccountIndex} → ${actualAccountIndex}`);
        // 🎯 FIX: Usar setAccount para garantir persistência do estado
        await rotation.setAccount(actualAccountIndex);
        console.log(`   ✅ Sincronização completa - conta correta identificada e SALVA!`);
      } else {
        console.log(`   ✅ Estado sincronizado corretamente`);
      }
    } else {
      console.log(`   ⚠️  Username Instagram "${actualLoggedUser}" não mapeado em nenhuma conta`);
      console.log(`   ℹ️  Configure INSTAGRAM_UNOFFICIAL_USERNAME_HANDLE ou INSTAGRAM_UNOFFICIAL2_USERNAME_HANDLE no .env`);
    }
  } else {
    console.log(`   ⚠️  Não foi possível determinar usuário logado - usando conta do estado`);
  }
  console.log(`=======================================================\n`);

  // 🔧 FIX: Registrar falha SEM forçar count=3 - respeitar lógica de 3 falhas consecutivas
  const currentUrl = page.url();
  const isCriticalError = currentUrl === 'about:blank' || currentUrl === '' || currentUrl === 'data:,' || errorType === 'SESSION_INVALID';

  // Registrar falha (incrementa +1, não força 3)
  await rotation.recordFailure(errorType, isCriticalError ? 'Erro crítico detectado' : undefined);
  const currentAccount = rotation.getCurrentAccount();
  console.log(`   📊 Falha registrada: ${currentAccount.username} (failureCount: ${currentAccount.failureCount}/3)`);

  // 🔍 Verificar se deve rotacionar (após 3 falhas consecutivas)
  const shouldRotate = rotation.shouldRotate();

  if (!shouldRotate) {
    console.log(`⚠️  Falha registrada mas ainda não atingiu limite para rotação (${currentAccount.failureCount}/3)`);
    return false;
  }

  console.log(`🔄 Iniciando rotação de conta (3 falhas atingidas)...`);

  // 🚪 Logout explícito antes de limpar e rotacionar
  try {
    if (sessionPage && !sessionPage.isClosed()) {
      await logoutAndClearSession(sessionPage);
    } else {
      await logoutAndClearSession(page);
    }
  } catch (logoutErr: any) {
    console.log(`⚠️  Erro ao tentar logout antes da rotação: ${logoutErr.message}`);
  }

  // 📤 Fechar browser e sessão atual
  try {
    console.log(`🔒 Fechando browser e sessão atual...`);

    // 1. Fechar sessionPage
    if (sessionPage && !sessionPage.isClosed()) {
      await sessionPage.close().catch(() => {});
    }
    sessionPage = null;

    // 2. Fechar browser com verificação robusta
    if (browserInstance) {
      const pid = browserInstance.process()?.pid;
      console.log(`   🔍 Browser PID: ${pid || 'unknown'}`);

      try {
        // Primeiro: fechar TODAS as páginas abertas (inclui popups)
        const allPages = await browserInstance.pages();
        console.log(`   📄 Fechando ${allPages.length} página(s)...`);
        for (const page of allPages) {
          if (!page.isClosed()) {
            await page.close().catch(() => {});
          }
        }

        // Segundo: fechar browser com timeout
        await Promise.race([
          browserInstance.close(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        console.log(`   ✅ Browser fechado normalmente`);
      } catch (closeErr: any) {
        console.log(`   ⚠️  Erro ao fechar browser: ${closeErr.message}`);
        // Se não fechou, tentar matar o processo
        if (pid) {
          try {
            process.kill(pid, 'SIGKILL');
            console.log(`   💀 Processo ${pid} killed forçadamente`);
          } catch (killErr) {
            console.log(`   ❌ Não foi possível matar processo ${pid}`);
          }
        }
      }
    }
    browserInstance = null;
    sessionInitialization = null;
    loggedUsername = null;

    console.log(`✅ Browser fechado`);

    // 🗑️ LIMPAR COOKIES DA CONTA BLOQUEADA (arquivo específico da conta)
    const currentAccount = rotation.getCurrentAccount();
    const cookieFilesToDelete = [COOKIES_FILE, currentAccount.cookiesFile];

    for (const cookieFile of cookieFilesToDelete) {
      if (fs.existsSync(cookieFile)) {
        fs.unlinkSync(cookieFile);
        console.log(`🗑️  Cookies deletados: ${path.basename(cookieFile)}`);
      }
    }
  } catch (closeError: any) {
    console.log(`⚠️  Erro ao fechar browser: ${closeError.message}`);
  }

  // 🔄 Verificar se precisa aguardar antes de rotacionar
  let rotationResult = await rotation.rotateToNextAccount();

  // 🚨 Se precisa aguardar (IP cooling ou conta quente), aguarda UMA VEZ o tempo máximo
  if (rotationResult.requiresWait && rotationResult.waitMinutes) {
    console.log(`\n⏰ ========================================`);
    console.log(`⏰ 🚨 AGUARDANDO ${rotationResult.waitMinutes}min ANTES DE ROTACIONAR`);
    console.log(`⏰ Motivo: ${rotationResult.message}`);
    console.log(`⏰ ========================================`);
    console.log(`\n💡 AGUARDANDO dentro da request HTTP:`);
    console.log(`   - Timeout HTTP ajustado no N8N para suportar cooldowns longos`);
    console.log(`   - Após o wait, rotação será executada automaticamente\n`);

    const waitMs = rotationResult.waitMinutes * 60 * 1000;
    await new Promise(resolve => setTimeout(resolve, waitMs));

    console.log(`✅ Período de espera concluído - executando rotação...`);

    // Agora rotacionar (deve funcionar pois aguardamos o tempo máximo)
    rotationResult = await rotation.rotateToNextAccount();
  }

  if (!rotationResult.success) {
    console.log(`\n❌ ========================================`);
    console.log(`❌ NÃO FOI POSSÍVEL ROTACIONAR CONTA`);
    console.log(`❌ ${rotationResult.message}`);
    console.log(`❌ ========================================\n`);
    return false;
  }

  // Verificação de segurança (não deveria acontecer após aguardar tempo máximo)
  if (rotationResult.requiresWait) {
    console.log(`\n❌ ========================================`);
    console.log(`❌ ERRO INESPERADO: ainda requer wait após aguardar tempo máximo`);
    console.log(`❌ ${rotationResult.message}`);
    console.log(`❌ ========================================\n`);
    return false;
  }

  console.log(`\n✅ ========================================`);
  console.log(`✅ ROTAÇÃO BEM-SUCEDIDA`);
  console.log(`✅ Nova conta: ${rotationResult.newAccount}`);
  console.log(`✅ ========================================\n`);

  // 🔐 Inicializar nova sessão com nova conta
  try {
    console.log(`🔐 Iniciando nova sessão com conta ${rotationResult.newAccount}...`);

    // ✅ RESET COMPLETO da sessão antes de logar com nova conta
    const { resetSessionForRotation } = await import('./instagram-session.service');
    await resetSessionForRotation();

    await ensureLoggedSession();
    console.log(`✅ Nova sessão iniciada com sucesso!`);
    return true;
  } catch (sessionError: any) {
    console.log(`❌ Erro ao inicializar nova sessão: ${sessionError.message}`);
    return false;
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
  maxProfiles: number = 10,
  accountProfile?: string
): Promise<HashtagScrapeResult> {
  // Normalizar termo ANTES de criar contexto
  const normalizedTerm = searchTerm
    .toLowerCase()
    .replace(/\s+/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  console.log(`🔎 Termo: "${searchTerm}" → "#${normalizedTerm}"`);

  // 🎯 SETAR CONTA MANUALMENTE se accountProfile fornecido
  if (accountProfile && accountProfile !== 'default') {
    const rotation = getAccountRotation();
    const success = await rotation.setAccount(accountProfile);
    if (!success) {
      console.log(`⚠️  Conta "${accountProfile}" não encontrada - usando rotação automática`);
    }
  }

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

  // 🆕 CRÍTICO: Verificar conta disponível ANTES de criar contexto
  const rotation = getAccountRotation();
  let accountCheck = await rotation.ensureAvailableAccount();

  // 🔧 FIX: Se IP cooling ativo, AGUARDAR ao invés de jogar erro
  if (!accountCheck.success && accountCheck.reason?.includes('Aguarde')) {
    const waitMatch = accountCheck.reason.match(/Aguarde (\d+)min/);
    if (waitMatch) {
      const waitMinutes = parseInt(waitMatch[1]);
      console.log(`\n⏰ ========================================`);
      console.log(`⏰ 🧊 IP COOLING ATIVO - AGUARDANDO ${waitMinutes}min`);
      console.log(`⏰ Motivo: ${accountCheck.reason}`);
      console.log(`⏰ ========================================\n`);

      // Aguardar o tempo necessário
      await new Promise(resolve => setTimeout(resolve, waitMinutes * 60 * 1000));

      console.log(`✅ Período de IP cooling concluído - verificando conta novamente...`);

      // Verificar novamente após espera
      accountCheck = await rotation.ensureAvailableAccount();
    }
  }

  // Se ainda falhou após esperar, aí sim joga erro
  if (!accountCheck.success) {
    throw new Error(`ACCOUNT_UNAVAILABLE: ${accountCheck.reason}`);
  }

  if (accountCheck.rotated) {
    console.log(`🔄 Rotacionado para @${accountCheck.account} antes de iniciar`);
  }

  // Criar contexto UMA VEZ para discovery E scraping
  let context = await createIsolatedContext();
  let page = context.page;
  const requestId = context.requestId;
  let cleanup = context.cleanup;
  console.log(`🔒 Request ${requestId} iniciada para discovery + scrape-tag: "${searchTerm}"`);

  let variations: any[] = [];
  let priorityHashtags: any[] = [];
  const allFoundProfiles: any[] = [];
  let hashtagsToScrape: string[] = [normalizedTerm];

  // 🆕 DESCOBRIR VARIAÇÕES DE HASHTAGS COM PRIORIZAÇÃO POR SCORE (mesma página)
  console.log(`\n🔍 Descobrindo variações inteligentes de #${normalizedTerm}...`);

  try {
    variations = await discoverHashtagVariations(page, normalizedTerm);
    // 🔧 Opção B: Incluir hashtags com score alto OU volume decente (> 50K)
    // Score serve para ordenar prioridade, não para excluir hashtags relevantes
    priorityHashtags = variations
      .filter(v => (v.priority_score >= 80) || (v.post_count > 50_000))
      .sort((a, b) => b.priority_score - a.priority_score);  // Ordena por score (maior primeiro)
  } catch (discoveryError: any) {
    console.log(`❌ Erro ao descobrir variações: ${discoveryError.message}`);
  }

  try {
    console.log(`\n📊 Análise de variações:`);
    console.log(`   Total descobertas: ${variations.length}`);
    console.log(`   Prioritárias (score ≥ 80 OU > 50K posts): ${priorityHashtags.length}`);

    // Mostrar lista completa que será scrapada (inclui original + prioritárias sem duplicata)
    const filteredPriority = priorityHashtags.filter(h => h.hashtag !== normalizedTerm);
    console.log(`\n🎯 Hashtags que serão scrapadas:`);
    console.log(`   1. #${normalizedTerm} (original)`);
    if (filteredPriority.length > 0) {
      filteredPriority.forEach((v, i) => {
        console.log(`   ${i + 2}. #${v.hashtag} - ${v.post_count_formatted} - Score: ${v.priority_score}`);
      });
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
    // 🔧 FIX: Filtrar normalizedTerm das sugestões para evitar duplicatas
    hashtagsToScrape = priorityHashtags.length > 0
      ? [normalizedTerm, ...priorityHashtags
          .filter(h => h.hashtag !== normalizedTerm)  // Remover duplicata da original
          .map(h => h.hashtag)]
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
          await waitHuman(4500, 6000); // 4.5-6s entre retries (randomizado)
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

        // 🔧 FIX: Fechar página anterior ANTES de criar nova
        try {
          await cleanup();
          console.log('   🧹 Página anterior fechada');
        } catch {}

        // Recriar contexto
        const newContext = await createIsolatedContext();
        // Reassignar página e cleanup
        page = newContext.page;
        cleanup = newContext.cleanup;

        console.log('✅ [SESSION RECOVERY] Nova sessão criada com sucesso!');

        // ⚠️  NÃO RESETAR failureCount aqui - apenas recriamos o browser
        // O failureCount só deve ser resetado após SUCESSO REAL no scraping
        console.log('⚠️  [SESSION RECOVERY] Mantendo contadores de falha preservados');

        await waitHuman(2700, 3500); // Dar tempo para estabilizar (randomizado)
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

      // Navegar para hashtag COM DETECÇÃO DE 429
      try {
        await navigateWithRateLimitDetection(page, hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        console.log(`   ✅ Navegação concluída`);
      } catch (navError: any) {
        // Se for RateLimitError, propagar imediatamente (não fazer retry!)
        if (navError instanceof RateLimitError) {
          console.log(`\n🚨 ========================================`);
          console.log(`🚨 BLOQUEIO DETECTADO NA NAVEGAÇÃO INICIAL!`);
          console.log(`🚨 Interrompendo scraping IMEDIATAMENTE`);
          console.log(`🚨 ========================================\n`);
          throw navError; // Vai para catch principal que faz logout/rotação
        }
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
        // 🔄 Usar sistema de rotação
        try {
          const recovered = await handleSessionError(page, 'SESSION_INVALID: Redirected to login page');
          if (recovered) {
            // 🔧 FIX: Fechar página anterior ANTES de criar nova
            try { await cleanup(); } catch {}
            const newContext = await createIsolatedContext();
            page = newContext.page;
            cleanup = newContext.cleanup;
            continue; // Retry com nova conta
          }
          // Não conseguiu rotacionar - sair do loop
          throw new Error('SESSION_INVALID: Could not recover from login redirect');
        } catch (err: any) {
          // GlobalCooldownError sempre propaga
          if (err.name === 'GlobalCooldownError') throw err;
          // Outros erros também propagam
          throw err;
        }
      }

      if (isChallengePage) {
        console.log('❌ [REDIRECT] Instagram redirecionou para CHALLENGE/CAPTCHA - verificação necessária');
        // 🔄 Usar sistema de rotação
        try {
          const recovered = await handleSessionError(page, 'CHALLENGE_REQUIRED: Instagram requires verification');
          if (recovered) {
            // 🔧 FIX: Fechar página anterior ANTES de criar nova
            try { await cleanup(); } catch {}
            const newContext = await createIsolatedContext();
            page = newContext.page;
            cleanup = newContext.cleanup;
            continue; // Retry com nova conta
          }
          // Não conseguiu rotacionar - sair do loop
          throw new Error('CHALLENGE_REQUIRED: Could not recover from challenge');
        } catch (err: any) {
          // GlobalCooldownError sempre propaga
          if (err.name === 'GlobalCooldownError') throw err;
          // Outros erros também propagam
          throw err;
        }
      }

      if (isSuspiciousPage) {
        console.log('❌ [REDIRECT] Instagram redirecionou para página SUSPENSA/BLOQUEADA');
        // 🔄 Usar sistema de rotação
        try {
          const recovered = await handleSessionError(page, 'ACCOUNT_RESTRICTED: Account may be temporarily restricted');
          if (recovered) {
            // 🔧 FIX: Fechar página anterior ANTES de criar nova
            try { await cleanup(); } catch {}
            const newContext = await createIsolatedContext();
            page = newContext.page;
            cleanup = newContext.cleanup;
            continue; // Retry com nova conta
          }
          // Não conseguiu rotacionar - sair do loop
          throw new Error('ACCOUNT_RESTRICTED: Could not recover from restriction');
        } catch (err: any) {
          // GlobalCooldownError sempre propaga
          if (err.name === 'GlobalCooldownError') throw err;
          // Outros erros também propagam
          throw err;
        }
      }

      // 🆕 RECUPERAÇÃO: Se não está na página esperada, tentar voltar
      if (!isExpectedPage) {
        console.log(`⚠️  [REDIRECT] URL não corresponde à hashtag esperada!`);
        console.log(`   Esperado: ${hashtagUrl}`);
        console.log(`   Recebido: ${currentUrl}`);
        console.log(`   🔄 Tentando voltar para a hashtag...`);

        // Tentar navegar novamente para a URL correta
        await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await waitHuman(2700, 3500);

        // Verificar novamente
        currentUrl = page.url();
        isExpectedPage = currentUrl.includes('/explore/tags/') || currentUrl.includes('/explore/search/');

        // 🚨 CRÍTICO: Se caiu em login page durante recuperação, chamar handleSessionError
        if (currentUrl.includes('/accounts/login')) {
          console.log(`❌ [REDIRECT] Recuperação falhou - caiu em LOGIN page`);
          console.log(`   🔄 Chamando handleSessionError para limpar sessão e rotacionar...`);

          try {
            const recovered = await handleSessionError(page, 'SESSION_INVALID: Login page after recovery attempt');
            if (recovered) {
              // 🔧 FIX: Fechar página anterior ANTES de criar nova
              try { await cleanup(); } catch {}
              const newContext = await createIsolatedContext();
              page = newContext.page;
              cleanup = newContext.cleanup;
              continue; // Retry com nova conta
            }
            // Não conseguiu rotacionar - sair do loop
            throw new Error('SESSION_INVALID: Could not recover from login redirect after recovery');
          } catch (err: any) {
            // GlobalCooldownError sempre propaga
            if (err.name === 'GlobalCooldownError') throw err;
            // Outros erros também propagam
            throw err;
          }
        }

        if (!isExpectedPage) {
          console.log(`❌ [REDIRECT] Não conseguiu voltar para a hashtag. URL final: ${currentUrl}`);
          throw new Error(`REDIRECT_RECOVERY_FAILED: Could not return to hashtag page`);
        }

        console.log(`   ✅ Recuperação bem-sucedida! Agora em: ${currentUrl}`);
      }

      // Delay otimizado após navegação (ADAPTATIVO)
      const baseNavDelay = 2000 + Math.random() * 1000; // 2-3s base (reduzido de 4-6s)
      const postNavDelay = getAdaptiveDelay(baseNavDelay);
      console.log(`   ⏳ Aguardando ${(postNavDelay/1000).toFixed(1)}s para renderização completa... (multiplier: ${resilienceMetrics.adaptiveDelayMultiplier.toFixed(2)}x)`);
      await new Promise(resolve => setTimeout(resolve, postNavDelay));

      // 🆕 DETECÇÃO AUTOMÁTICA DE ERROS NA PÁGINA
      const pageBodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');

      // 🔄 "Service Unavailable" = erro temporário → FECHAR BROWSER E REABRIR (até 3x)
      const isServiceUnavailable =
        pageBodyText.includes('Service Unavailable') ||
        pageBodyText.includes('Serviço Indisponível');

      if (isServiceUnavailable) {
        console.log('⚠️  [SERVICE UNAVAILABLE] Erro temporário do servidor Instagram');

        // Tentar até 3 vezes com browser restart completo
        let browserRestartSuccess = false;
        for (let restartAttempt = 1; restartAttempt <= 3; restartAttempt++) {
          console.log(`\n🔄 Browser restart ${restartAttempt}/3...`);
          console.log(`   🛑 Fechando browser atual...`);

          // Fechar browser completamente
          try { await cleanup(); } catch {}

          console.log(`   ⏳ Aguardando 10s antes de reabrir...`);
          await new Promise(resolve => setTimeout(resolve, 10000));

          // Reabrir browser com novo contexto
          console.log(`   🚀 Reabrindo browser...`);
          const newContext = await createIsolatedContext();
          page = newContext.page;
          cleanup = newContext.cleanup;

          // Navegar novamente para a hashtag
          console.log(`   📍 Navegando para #${hashtagToScrape}...`);
          const hashtagUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(hashtagToScrape)}/`;
          await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Verificar se resolveu
          const newBodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
          if (!newBodyText.includes('Service Unavailable') && !newBodyText.includes('Serviço Indisponível')) {
            console.log(`   ✅ Instagram OK após browser restart ${restartAttempt}!`);
            browserRestartSuccess = true;
            break;
          }
          console.log(`   ❌ Ainda "Service Unavailable" após browser restart ${restartAttempt}`);
        }

        if (browserRestartSuccess) {
          continue; // Tentar novamente o scraping com browser novo
        }

        // Após 3 browser restarts sem sucesso, aí sim rotaciona para outra conta
        console.log('\n🚨 "Service Unavailable" persistiu após 3 browser restarts');
        console.log('🔄 Rotacionando para outra conta...');
      }

      // 🚨 Outros erros ("Something went wrong", etc.) = rotacionar imediatamente
      const hasOtherError =
        pageBodyText.includes('Ocorreu um erro') ||
        pageBodyText.includes('não foi possível carregar') ||
        pageBodyText.includes('Something went wrong') ||
        pageBodyText.includes('error occurred');

      if (isServiceUnavailable || hasOtherError) {
        console.log('❌ [SESSION INVALID] Instagram retornou página de erro');

        // 🔄 USAR SISTEMA DE ROTAÇÃO EXISTENTE (handleSessionError)
        // Esta função JÁ FAZ: logout, cleanup, cooldown, rotação, e login na nova conta
        const recovered = await handleSessionError(page, 'SESSION_INVALID');

        if (recovered) {
          console.log('✅ [RECOVERY] Rotação bem-sucedida! Continuando com nova conta...');
          // 🔧 FIX: Fechar página anterior ANTES de criar nova
          try { await cleanup(); } catch {}
          // Recriar contexto com nova conta
          const newContext = await createIsolatedContext();
          page = newContext.page;
          cleanup = newContext.cleanup;
          // Tentar novamente esta hashtag (continue vai para próximo retry)
          continue;
        } else {
          // Não conseguiu rotacionar (ambas as contas falharam ou em cooldown)
          console.log('❌ [RECOVERY] Não foi possível rotacionar para nova conta');
          throw new Error('SESSION_INVALID: Could not recover - no available accounts');
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
            // Tentar novamente após delay randomizado
            await waitHuman(1800, 2500);
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

          // 🆕 DETECTAR "No results" - hashtag sem posts (NÃO é erro!)
          const hasNoResults = pageContent.includes('No results') ||
                              pageContent.includes('Nenhum resultado') ||
                              pageContent.includes("couldn't find anything") ||
                              pageContent.includes('não encontramos nada') ||
                              pageContent.includes("We couldn't find anything");

          // Só detecta login se REALMENTE tem form E tem 0 posts E NÃO é "No results"
          const hasLoginForm = (pageContent.includes('loginForm') || pageContent.includes('type="password"')) && postCount === 0 && !hasNoResults;

          console.log(`   ⚠️  ${context}: timeout ao aguardar mural`);
          console.log(`   📍 URL final: ${currentUrl}`);
          console.log(`   📊 Posts encontrados: ${postCount}`);
          console.log(`   📭 No Results: ${hasNoResults ? 'SIM' : 'NÃO'}`);
          console.log(`   🔐 Página de login detectada: ${hasLoginForm ? 'SIM' : 'NÃO'}`);
          console.log(`   ${muralLoaded ? '✅ MURAL CARREGOU (15+ posts)' : '❌ Mural não carregou'}`);
          console.log(`   ❌ Erro: ${error?.message || error}`);

          // 🚨 FIX: Detectar chrome-error como 429/bloqueio
          if (currentUrl.includes('chrome-error://') || currentUrl.includes('chromewebdata')) {
            console.log(`\n🚨 ========================================`);
            console.log(`🚨 ERRO 429 DETECTADO VIA CHROME-ERROR!`);
            console.log(`🚨 URL: ${currentUrl}`);
            console.log(`🚨 Instagram bloqueou a navegação`);
            console.log(`🚨 ========================================\n`);
            throw new RateLimitError('Navegação bloqueada (chrome-error detectado durante timeout)');
          }

          // 🆕 Se mural carregou (15+ posts), retorna sucesso mesmo com timeout
          if (muralLoaded) {
            console.log(`   ✅ Ignorando timeout - mural carregou com ${postCount} posts`);
            return true;
          }

          // 🆕 HASHTAG SEM RESULTADOS - Não é erro, lançar erro especial para pular
          if (hasNoResults) {
            console.log(`\n📭 HASHTAG SEM RESULTADOS: Esta hashtag não tem posts`);
            console.log(`   ℹ️  Isso é normal - hashtag inexistente ou sem conteúdo`);
            throw new Error('NO_RESULTS: Hashtag sem resultados');
          }

          if (throwOnFail) {
            throw new Error(`Mural da hashtag não carregou a tempo. URL: ${currentUrl}, Posts: ${postCount}, Login: ${hasLoginForm}`);
          }
          return false;
        }
      };

      await waitForHashtagMural('Carregamento inicial', true);

      // ⏳ Aguardar lazy loading inicial randomizado (waitForHashtagMural já esperou posts aparecerem)
      console.log(`⏳ Aguardando 1.8-2.5s para lazy loading inicial (randomizado)...`);
      await waitHuman(1800, 2500);

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
      const attemptedPositionsInCycle = new Set<string>(); // 🆕 Rastrear posições tentadas no ciclo atual (reseta quando perfil aprovado)
      let attemptsWithoutNewPost = 0;
      let consecutiveDuplicates = 0; // Contador de duplicatas consecutivas
      let languageRejections = 0; // 🆕 Contador de rejeições por idioma não-português (não precisa ser consecutivo)
      let totalHashtagFeedClicks = 0; // 🆕 Contador de clicks no MURAL (NUNCA reseta, acumulativo)

      // 🎯 Sistema de 6 posts por coluna
      let currentColumn: number | null = null; // Coluna sendo processada no momento
      let postsTriedInCurrentColumn = 0; // Quantos posts já tentou na coluna atual
      const MAX_POSTS_PER_COLUMN = 6; // Tentar até 6 posts por coluna antes de mudar

      // 💾 SCROLL POSITION SAVE/RESTORE: Evita Instagram resetar para topo após page.goto()
      let lastSavedScrollPosition = 0;

      // 🔄 FUNÇÃO HELPER: Restaurar scroll após page.goto() (evita Instagram resetar para topo)
      const restoreScrollPosition = async (): Promise<void> => {
        if (lastSavedScrollPosition > 0) {
          console.log(`   🔄 Restaurando scroll para posição ${lastSavedScrollPosition}px...`);
          try {
            await page.evaluate((scrollY) => {
              window.scrollTo(0, scrollY);
            }, lastSavedScrollPosition);
            await waitHuman(900, 1300); // Aguardar scroll completar e Instagram renderizar (randomizado)
            console.log(`   ✅ Scroll restaurado`);
          } catch (scrollError: any) {
            console.log(`   ⚠️  Erro ao restaurar scroll: ${scrollError.message}`);
          }
        }
      };

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

          // 2. Scroll otimizado até o elemento ficar visível
          await anchorHandle.evaluate((element) => {
            element.scrollIntoView({ behavior: 'auto', block: 'center' }); // 'auto' é instantâneo
          });
          await waitHuman(250, 400); // Randomizado para parecer humano

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

          // 🕵️ STEALTH: Movimento de mouse com curva Bezier (mais humano que linear)
          await moveMouseHuman(page, x, y);

          // 🕵️ Pequena pausa antes do clique (comportamento humano)
          await waitHuman(300, 500);

          // 6. Clicar com mouse real
          console.log(`   💥 Executando clique...`);

          // 🆕 INCREMENTAR contador de clicks no MURAL (não em perfis de usuários)
          totalHashtagFeedClicks++;
          console.log(`   📊 Total clicks no mural: ${totalHashtagFeedClicks}`);

          await page.mouse.click(x, y, { delay: 100 });

          // 7. Aguardar navegação E validar que post abriu
          console.log(`   ⏳ Aguardando post abrir...`);
          await waitHuman(2000, 3000); // 🕵️ Delay humanizado

          // VALIDAR que a URL mudou para o post
          const currentUrl = page.url();
          const isPostPage = currentUrl.includes('/p/') || currentUrl.includes('/reel/');

          if (!isPostPage) {
            console.log(`   ❌ Post NÃO abriu via clique! URL atual: ${currentUrl}`);
            console.log(`   ⚠️  Evitando goto direto para não triggerar 429. Tentando clique alternativo...`);

            // TENTATIVA 2: Clicar usando JavaScript (mais confiável que mouse)
            try {
              await waitHuman(5000, 8000); // 🕵️ Delay anti-detecção humanizado

              // Forçar clique via JavaScript no elemento
              await anchorHandle.evaluate((el: Element) => {
                (el as HTMLElement).click();
              });

              await waitHuman(2700, 3500);

              const urlAfterJsClick = page.url();
              const isPostNow = urlAfterJsClick.includes('/p/') || urlAfterJsClick.includes('/reel/');

              if (isPostNow) {
                console.log(`   ✅ Post abriu via clique JavaScript: ${urlAfterJsClick}`);
                await waitHuman(5000, 8000); // 🕵️ Delay anti-detecção humanizado
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

          // 🕵️ ANTI-DETECÇÃO: Delay humanizado após abrir post (5-8s)
          await waitHuman(5000, 8000);

          return true;

        } catch (clickError: any) {
          console.log(`   ⚠️  Clique no post falhou (${clickError.message}). Não usando goto para evitar 429.`);
          // NÃO fazer goto direto - causa 429 (Too Many Requests)
          await waitHuman(3000, 5000); // Anti-detecção: 3-5s
          return false;
        }
      };

        // LOOP INTERNO: SCRAPAR ATÉ maxProfiles PARA ESTA HASHTAG
        // Duplicata = mesmo username 2x na MESMA sessão (raro com lógica sequencial)
        while (foundProfiles.length < maxProfiles && attemptsWithoutNewPost < 5 && consecutiveDuplicates < 8 && languageRejections < 5 && totalHashtagFeedClicks < 50) {
          console.log(`\n📊 Status (#${hashtagToScrape}): ${foundProfiles.length}/${maxProfiles} perfis, tentativa ${attemptsWithoutNewPost}/5, duplicatas: ${consecutiveDuplicates}, idioma: ${languageRejections}/5, clicks: ${totalHashtagFeedClicks}/50`);
          console.log(`   🔒 Posições já clicadas (${clickedGridPositions.size}): ${Array.from(clickedGridPositions).join(', ')}`);

          // 💾 SALVAR SCROLL POSITION NO INÍCIO DE CADA ITERAÇÃO (reflete scroll atual após scroll down)
          lastSavedScrollPosition = await page.evaluate(() => {
            const bodyScroll = document.documentElement.scrollTop || document.body.scrollTop;
            if (bodyScroll === 0) {
              const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]');
              if (mainContainer && mainContainer.scrollTop > 0) {
                return mainContainer.scrollTop;
              }
            }
            return bodyScroll;
          });
          console.log(`   💾 Scroll atual no início da iteração: ${lastSavedScrollPosition}px`);

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
            await waitHuman(250, 400);
          } catch {
            // Ignorar erros
          }

        const anchorHandles = await page.$$(postSelector);
        console.log(`   🔍 Encontrados ${anchorHandles.length} elementos com seletor: ${postSelector}`);

        // 🚫 DETECÇÃO DE PÁGINA SEM POSTS
        if (anchorHandles.length === 0) {
          // 🚨 FIX: Verificar chrome-error ANTES de analisar página
          const currentPageUrl = page.url();
          if (currentPageUrl.includes('chrome-error://') || currentPageUrl.includes('chromewebdata')) {
            console.log(`\n🚨 ========================================`);
            console.log(`🚨 ERRO 429 DETECTADO VIA CHROME-ERROR!`);
            console.log(`🚨 URL: ${currentPageUrl}`);
            console.log(`🚨 Instagram bloqueou a navegação`);
            console.log(`🚨 ========================================\n`);
            throw new RateLimitError('Página chrome-error detectada no loop de scraping');
          }

          const pageAnalysis = await page.evaluate(() => {
            const url = window.location.href;
            const bodyText = document.body.innerText;
            const isHashtagPage = url.includes('/explore/tags/') || url.includes('/explore/search/keyword/');
            const isProfilePage = url.match(/instagram\.com\/[^\/]+\/?$/);

            // Detectar se é perfil privado
            const isPrivate = bodyText.includes('Esta conta é privada') ||
                             bodyText.includes('This Account is Private');

            // 🆕 Detectar "No results" - hashtag sem posts (NÃO é shadowban!)
            const hasNoResults = bodyText.includes('No results') ||
                                bodyText.includes('Nenhum resultado') ||
                                bodyText.includes("couldn't find anything") ||
                                bodyText.includes('não encontramos nada');

            // Verificar se mural/grid existe (estrutura da página)
            const hasGrid = !!document.querySelector('article') ||
                           !!document.querySelector('main') ||
                           !!document.querySelector('[role="main"]');

            return { isHashtagPage, isProfilePage, isPrivate, hasGrid, hasNoResults };
          });

          console.log(`\n🔍 Análise da página sem posts:`);
          console.log(`   Hashtag/Search: ${pageAnalysis.isHashtagPage}`);
          console.log(`   Perfil: ${pageAnalysis.isProfilePage}`);
          console.log(`   Privado: ${pageAnalysis.isPrivate}`);
          console.log(`   Grid existe: ${pageAnalysis.hasGrid}`);
          console.log(`   No Results: ${pageAnalysis.hasNoResults}`);

          // 🆕 HASHTAG SEM RESULTADOS - Não é erro, apenas pular para próxima
          if (pageAnalysis.hasNoResults) {
            console.log(`\n📭 HASHTAG SEM RESULTADOS: Esta hashtag não tem posts`);
            console.log(`   ℹ️  Isso é normal - hashtag inexistente ou sem conteúdo`);
            console.log(`   ➡️  Pulando para próxima hashtag...\n`);
            break; // Sai do loop desta hashtag e vai para próxima
          }

          // ⚠️ SHADOWBAN DETECTADO: Hashtag com grid mas sem posts E sem mensagem "No results"
          if (pageAnalysis.isHashtagPage && pageAnalysis.hasGrid && !pageAnalysis.isPrivate && !pageAnalysis.hasNoResults) {
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
        let selectedGridKey: string | null = null; // 🆕 Para marcar depois se não for duplicata
        let selectedPosition: { x: number; y: number } | null = null;

        // CORREÇÃO: Rastrear posições do GRID (x, y) em vez de URLs
        const postsWithPosition: Array<{
          handle: ElementHandle<Element>;
          href: string;
          x: number;
          y: number;
          gridKey: string; // Chave única "x-y"
        }> = [];

        // Pegar altura da viewport para filtrar apenas posts visíveis
        const viewportHeight = await page.evaluate(() => window.innerHeight);

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

          // 🎯 FILTRO CRÍTICO: Skip APENAS posts com Y negativo (virtual scrolling do Instagram)
          // Posts com Y < -200 estão ACIMA da viewport → Instagram REMOVEU do DOM após scroll grande
          // Posts com Y > viewport estão ABAIXO → estão NO DOM, apenas precisam scroll para ficarem visíveis
          // Margem de -200px para permitir posts ligeiramente acima sem erro
          if (y < -200) {
            console.log(`   ⏭️  Post removido por virtual scrolling: Y=${y} - SKIP`);
            await handle.dispose();
            continue;
          }

          postsWithPosition.push({ handle, href, x, y, gridKey });
        }

        // ✅ LÓGICA SIMPLES E NATURAL: Ordenar de cima para baixo (como humano lê)
        // Ordenar apenas por posição VERTICAL (Y) - primeiro, segundo, terceiro...
        postsWithPosition.sort((a, b) => a.y - b.y);

        console.log(`   📊 Posts ordenados sequencialmente (cima→baixo): ${postsWithPosition.slice(0, 5).map(p => `(${p.x},${p.y})`).join(', ')}...`);

        // 🎯 SEQUENCIAL: Clicar no PRIMEIRO post não-clicado (ordem natural)
        for (const post of postsWithPosition) {
          // ✅ CORREÇÃO: Verificar por URL do post (não muda após scroll), não por posição (muda após scroll)
          if (processedPostLinks.has(post.href)) {
            console.log(`   ⏭️  Post já processado: ${post.href}`);
            await post.handle.dispose();
            continue;
          }

          // ✅ ENCONTROU O PRÓXIMO NÃO-CLICADO!
          selectedHandle = post.handle;
          selectedUrl = post.href;
          selectedGridKey = post.gridKey;
          selectedPosition = { x: post.x, y: post.y };

          console.log(`   ✅ Próximo post sequencial: (${post.x}, ${post.y}) [${post.gridKey}]: ${post.href}`);
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
          console.log(`   🔄 Nenhum novo post visível (tentativa ${attemptsWithoutNewPost}/8)`);

          // 🎯 SCROLL INTELIGENTE: Só faz scroll se tiver 2+ duplicatas OU 8+ clicks
          if (consecutiveDuplicates >= 2 || totalHashtagFeedClicks >= 8) {
            console.log(`   📜 Scroll necessário (dups: ${consecutiveDuplicates}, clicks: ${totalHashtagFeedClicks})...`);

            // 🆕 LIMPAR lista de tentativas antes do scroll (novos posts podem aparecer nas mesmas posições)
            attemptedPositionsInCycle.clear();
            console.log(`   🔄 Lista de posições tentadas limpa antes do scroll`);

            // 🔧 CRITICAL FIX: Resetar controle de colunas após scroll
            // Sem isso, sistema fica travado esperando completar 6 posts da coluna anterior
            currentColumn = null;
            postsTriedInCurrentColumn = 0;
            console.log(`   🔄 Controle de colunas resetado (permitir nova seleção)`);

            // 🆕 SCROLL AGRESSIVO se muitas duplicatas + clicks acumulados (ampliar mais o mural)
            const scrollMultiplier = calculateScrollMultiplier(consecutiveDuplicates, totalHashtagFeedClicks);

            // 🎯 USAR FUNÇÃO INTELIGENTE DE SCROLL (com delays adaptativos por profundidade)
            const scrollResult = await scrollAndWaitIntelligently(page, consecutiveDuplicates, scrollMultiplier);

            // 💾 ATUALIZAR lastSavedScrollPosition após scroll
            lastSavedScrollPosition = await page.evaluate(() => {
              const bodyScroll = document.documentElement.scrollTop || document.body.scrollTop;
              if (bodyScroll === 0) {
                const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]');
                if (mainContainer && mainContainer.scrollTop > 0) {
                  return mainContainer.scrollTop;
                }
              }
              return bodyScroll;
            });
            console.log(`   💾 Nova posição salva após scroll: ${lastSavedScrollPosition}px`);
            continue;
          }
        }

        console.log(`\n   🖼️  Abrindo post: ${selectedUrl} (Y=${selectedPosition?.y})`);

        // CORREÇÃO: SEMPRE fechar painel lateral de pesquisa antes de clicar (interfere nos cliques)
        try {
          console.log(`   🔧 Fechando possíveis painéis laterais...`);

          // Método 1: Clicar no centro da área de conteúdo principal (direita da tela)
          await page.mouse.click(800, 400); // Clicar no centro-direita onde estão os posts
          await waitHuman(250, 400);

          // Método 2: Pressionar ESC para fechar qualquer overlay/drawer
          await page.keyboard.press('Escape');
          await waitHuman(250, 400);

          // Método 3: Clicar no body para tirar foco de qualquer elemento
          await page.evaluate(() => {
            document.body.click();
          });
          await waitHuman(150, 300);

          // Recalcular posição do elemento após fechar drawer
          const newBox = await selectedHandle.boundingBox();
          if (newBox) {
            console.log(`   📍 Posição atual do elemento: x=${newBox.x}, y=${newBox.y}, width=${newBox.width}`);

            // VERIFICAR: Se X é muito baixo (< 300), o drawer ainda está aberto
            if (newBox.x < 300) {
              console.log(`   ⚠️  Elemento ainda à esquerda (x=${newBox.x}). Tentando fechar drawer novamente...`);

              // Tentar clicar fora do drawer (área dos posts)
              await page.mouse.click(600, 300);
              await waitHuman(400, 700);

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
          await waitHuman(2000, 3000);

          console.log(`   🔍 Extraindo username do AUTOR (owner) do post...`);

          // EXTRAIR DO JSON EMBARCADO NO HTML
          // IMPORTANTE: Pegar o "owner" do post, NÃO o "viewer" (usuário logado)!
          // 🔧 TIMEOUT DE SEGURANÇA: Se page.content() travar (detached frame), abortar após 10s
          const html = await Promise.race([
            page.content(),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout ao extrair HTML do post (10s)')), 10000)
            )
          ]);

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
              await restoreScrollPosition(); // 🔄 Restaurar scroll
            } catch {
              // ignore
            }
            await waitHuman(1300, 1800);

            // 🎯 SCROLL INTELIGENTE: Só faz scroll se tiver 2+ duplicatas OU 8+ clicks
            if (consecutiveDuplicates >= 2 || totalHashtagFeedClicks >= 8) {
              console.log(`   📜 Scroll necessário (dups: ${consecutiveDuplicates}, clicks: ${totalHashtagFeedClicks})...`);
              const scrollMultiplier = calculateScrollMultiplier(consecutiveDuplicates, totalHashtagFeedClicks);
              await scrollAndWaitIntelligently(page, consecutiveDuplicates, scrollMultiplier);
              lastSavedScrollPosition = await page.evaluate(() => {
                const bodyScroll = document.documentElement.scrollTop || document.body.scrollTop;
                if (bodyScroll === 0) {
                  const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]');
                  if (mainContainer && mainContainer.scrollTop > 0) return mainContainer.scrollTop;
                }
                return bodyScroll;
              });
            }

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
              await restoreScrollPosition(); // 🔄 Restaurar scroll
            } catch {
              // ignore
            }
            await waitHuman(1300, 1800);

            // 🎯 SCROLL INTELIGENTE: Só faz scroll se tiver 2+ duplicatas OU 8+ clicks
            if (consecutiveDuplicates >= 2 || totalHashtagFeedClicks >= 8) {
              console.log(`   📜 Scroll necessário (dups: ${consecutiveDuplicates}, clicks: ${totalHashtagFeedClicks})...`);
              const scrollMultiplier = calculateScrollMultiplier(consecutiveDuplicates, totalHashtagFeedClicks);
              await scrollAndWaitIntelligently(page, consecutiveDuplicates, scrollMultiplier);
              lastSavedScrollPosition = await page.evaluate(() => {
                const bodyScroll = document.documentElement.scrollTop || document.body.scrollTop;
                if (bodyScroll === 0) {
                  const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]');
                  if (mainContainer && mainContainer.scrollTop > 0) return mainContainer.scrollTop;
                }
                return bodyScroll;
              });
            }

            const feedReady = await waitForHashtagMural('Retorno após detectar usuário logado');
            if (!feedReady) {
              attemptsWithoutNewPost++;
            }
            continue;
          }

          // 🎯 VERIFICAR MEMÓRIA PRIMEIRO (detectar duplicatas de sessão)
          if (processedUsernames.has(username)) {
            console.log(`   ⏭️  @${username} já processado na memória, pulando...`);
            consecutiveDuplicates++;
            console.log(`   📊 Duplicatas consecutivas: ${consecutiveDuplicates}/8`);

            // 🔒 MARCAR POSIÇÃO como clicada
            if (selectedGridKey && selectedPosition) {
              clickedGridPositions.add(selectedGridKey);
              console.log(`   🔒 Posição (${selectedPosition.x}, ${selectedPosition.y}) marcada como clicada (duplicata memória)`);
            }

            // ⏭️  LÓGICA SEQUENCIAL: Apenas volta ao mural e pega PRÓXIMO post (sem scroll!)
            console.log(`   ⬅️  Voltando ao mural para clicar no PRÓXIMO post sequencial...`);
            try {
              await navigateWithRateLimitDetection(page, hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
              await restoreScrollPosition(); // 🔄 Restaurar scroll
              console.log(`   ✅ Voltou ao mural da hashtag`);
            } catch (navError: any) {
              // Se for RateLimitError, propagar para catch principal
              if (navError instanceof RateLimitError) {
                throw navError;
              }
              console.log(`   ⚠️  Erro ao retornar ao mural: ${navError.message}`);
            }
            console.log(`   ⏳ Aguardando 13-18s para mural carregar completamente (randomizado)...`);
            await waitHuman(13000, 18000);

            // 🔄 RE-APLICAR scroll (Instagram reseta durante a espera)
            if (lastSavedScrollPosition > 0) {
              console.log(`   🔄 Re-aplicando scroll para ${lastSavedScrollPosition}px (Instagram resetou durante espera)...`);
              try {
                await page.evaluate((scrollY) => {
                  window.scrollTo(0, scrollY);
                }, lastSavedScrollPosition);
                await waitHuman(2500, 4000);
                console.log(`   ✅ Scroll re-aplicado`);
              } catch (err: any) {
                console.log(`   ⚠️  Erro ao re-aplicar scroll: ${err.message}`);
              }
            }

            // 🎯 SCROLL INTELIGENTE: Só faz scroll se tiver 2+ duplicatas OU 8+ clicks
            if (consecutiveDuplicates >= 2 || totalHashtagFeedClicks >= 8) {
              console.log(`   📜 Scroll necessário (dups: ${consecutiveDuplicates}, clicks: ${totalHashtagFeedClicks})...`);
              const scrollMultiplier = calculateScrollMultiplier(consecutiveDuplicates, totalHashtagFeedClicks);
              const scrollResult = await scrollAndWaitIntelligently(page, consecutiveDuplicates, scrollMultiplier);

              // 💾 ATUALIZAR lastSavedScrollPosition após scroll
              lastSavedScrollPosition = await page.evaluate(() => {
                const bodyScroll = document.documentElement.scrollTop || document.body.scrollTop;
                if (bodyScroll === 0) {
                  const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]');
                  if (mainContainer && mainContainer.scrollTop > 0) {
                    return mainContainer.scrollTop;
                  }
                }
                return bodyScroll;
              });
              console.log(`   💾 Nova posição: ${lastSavedScrollPosition}px`);
            } else {
              console.log(`   ⏭️  Sem necessidade de scroll (dups: ${consecutiveDuplicates}, clicks: ${totalHashtagFeedClicks})`);
            }

            const feedReady = await waitForHashtagMural('Retorno após duplicata');
            if (!feedReady) {
              // 🚨 DETECTAR ERRO DE SESSÃO (about:blank, timeout, etc.)
              const currentUrl = page.url();
              const isSessionError = currentUrl === 'about:blank' || currentUrl === '' || currentUrl === 'data:,';

              if (isSessionError) {
                console.log(`🚨 ERRO DE SESSÃO DETECTADO: URL=${currentUrl}`);
                const recovered = await handleSessionError(page, `URL inválida após duplicata memória: ${currentUrl}`);

                if (recovered) {
                  // Nova sessão iniciada - recriar página e continuar
                  console.log(`✅ Sessão recuperada - recriando página...`);
                  try {
                    // ✅ Fechar page antiga para evitar múltiplas pages ativas
                    await page.close().catch(() => {});
                    page = await createAuthenticatedPage();
                    await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await waitHuman(2700, 3500);
                    continue;
                  } catch (recreateError: any) {
                    console.log(`❌ Erro ao recriar página: ${recreateError.message}`);
                    break;
                  }
                } else {
                  console.log(`❌ Não foi possível recuperar sessão - encerrando scraping`);
                  break;
                }
              }

              attemptsWithoutNewPost++;
            }
            continue;
          }

          // 🆕 VERIFICAR SE USERNAME JÁ EXISTE NO BANCO (DEPOIS de verificar memória)
          // Se existir, vamos ATUALIZAR ao invés de pular!
          console.log(`   🔍 Verificando se @${username} já existe no banco de dados...`);
          let existingLeadData: { id: string; hashtags_posts: string[] | null; contact_status: string | null; search_term_id: string | null; search_term_used: string | null; captured_at: string | null; is_qualified: boolean | null; qualification_notes: string | null; contacted_at: string | null; } | null = null;
          try {
            const { data: existingLead, error: checkError } = await supabase
              .from('instagram_leads')
              .select('id, hashtags_posts, contact_status, search_term_id, search_term_used, captured_at, is_qualified, qualification_notes, contacted_at')
              .eq('username', username)
              .single();

            if (existingLead) {
              existingLeadData = existingLead;
              console.log(`   🔄 @${username} JÁ EXISTE no banco! Vamos ATUALIZAR o perfil...`);
              console.log(`   📊 Hashtags existentes: ${existingLead.hashtags_posts?.length || 0}`);
              // Continua para extração e fará UPDATE ao invés de INSERT
            } else {
              console.log(`   ✅ @${username} não existe no banco. Prosseguindo com extração de perfil...`);
            }
          } catch (dbError: any) {
            console.log(`   ⚠️  Erro ao verificar banco de dados: ${dbError.message}`);
            console.log(`   🔄 Continuando com extração de perfil (fail-safe)...`);
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
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500)); // Otimizado: 1-1.5s (era 1.5-2.5s)

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
                await waitHuman(700, 1000);
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

            // REMOVIDO FALLBACK JSON: O JSON pode conter full_name do viewer (conta logada)
            // em vez do perfil visitado. Usar APENAS OG meta tag que é específica do perfil.
            // Se OG não encontrar, persistir null em vez de arriscar pegar nome errado.
            const finalFullName = fullNameFromOG || null;

            if (!finalFullName) {
              console.log(`   ⚠️  Full name não encontrado na OG tag - persistindo null (evita pegar nome da conta logada)`);
            }

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

            // ========================================
            // VALIDAÇÃO 1: IDIOMA PORTUGUÊS (PRIMEIRA - OBRIGATÓRIA)
            // Se não for PT, rejeita imediatamente sem processar o resto
            // ========================================
            console.log(`   🌍 Detectando idioma da bio...`);
            const languageDetection = await detectLanguage(completeProfile.bio, completeProfile.username);
            completeProfile.language = languageDetection.language;
            console.log(`   🎯 Idioma detectado: ${languageDetection.language} (${languageDetection.confidence})`);

            if (languageDetection.language !== 'pt') {
              languageRejections++; // 🆕 Incrementar contador de rejeições por idioma
              console.log(`   ❌ Perfil REJEITADO por idioma não-português (${languageDetection.language}) - rejeições: ${languageRejections}/5`);
              processedUsernames.add(username); // Marcar como processado para não tentar novamente

              // 🔧 RESETAR controle de colunas após rejeição
              currentColumn = null;
              postsTriedInCurrentColumn = 0;
              console.log(`   🔄 Controle de colunas resetado após rejeição`);

              // 🔧 VOLTAR para o mural da hashtag ANTES de continuar
              console.log(`   ⬅️  Retornando ao mural após rejeição de idioma (preservando scroll)...`);
              try {
                await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await restoreScrollPosition(); // 🔄 Restaurar scroll
                console.log(`   ✅ Voltou ao mural da hashtag`);
              } catch (navError: any) {
                console.log(`   ⚠️  Erro ao retornar ao mural: ${navError.message}`);
              }

              // ⏱️ DELAY ADAPTATIVO baseado na profundidade do scroll
              let loadWaitTime = 5000; // Base: 5s
              if (lastSavedScrollPosition > 10000) {
                loadWaitTime = 25000; // 25s para posições muito avançadas
              } else if (lastSavedScrollPosition > 5000) {
                loadWaitTime = 18000; // 18s para posições avançadas
              } else if (lastSavedScrollPosition > 2000) {
                loadWaitTime = 12000; // 12s para posições médias
              } else if (lastSavedScrollPosition > 0) {
                loadWaitTime = 8000; // 8s para posições iniciais
              }

              console.log(`   ⏳ Aguardando ${loadWaitTime/1000}s para mural carregar (scroll: ${lastSavedScrollPosition}px)...`);
              await waitHuman(loadWaitTime * 0.9, loadWaitTime * 1.1); // Randomizar ±10%

              // 🔄 RE-APLICAR scroll (Instagram reseta durante os 10s)
              if (lastSavedScrollPosition > 0) {
                console.log(`   🔄 Re-aplicando scroll para ${lastSavedScrollPosition}px (Instagram resetou durante espera)...`);
                try {
                  await page.evaluate((scrollY) => {
                    window.scrollTo(0, scrollY);
                  }, lastSavedScrollPosition);
                  await waitHuman(1800, 2500);
                  console.log(`   ✅ Scroll re-aplicado`);
                } catch (err: any) {
                  console.log(`   ⚠️  Erro ao re-aplicar scroll: ${err.message}`);
                }
              }

              // 🎯 SCROLL INTELIGENTE: Só faz scroll se tiver 2+ duplicatas OU 8+ clicks
              if (consecutiveDuplicates >= 2 || totalHashtagFeedClicks >= 8) {
                console.log(`   📜 Scroll necessário (dups: ${consecutiveDuplicates}, clicks: ${totalHashtagFeedClicks})...`);
                const scrollMultiplier = calculateScrollMultiplier(consecutiveDuplicates, totalHashtagFeedClicks);
                await scrollAndWaitIntelligently(page, consecutiveDuplicates, scrollMultiplier);
                lastSavedScrollPosition = await page.evaluate(() => {
                  const bodyScroll = document.documentElement.scrollTop || document.body.scrollTop;
                  if (bodyScroll === 0) {
                    const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]');
                    if (mainContainer && mainContainer.scrollTop > 0) return mainContainer.scrollTop;
                  }
                  return bodyScroll;
                });
              }

              const feedReady = await waitForHashtagMural('Retorno após rejeição de idioma');
              if (!feedReady) {
                attemptsWithoutNewPost++;
              }

              continue; // PULA para o próximo perfil
            }

            // ========================================
            // CÁLCULO DO ACTIVITY SCORE (após validação de idioma passar)
            // ========================================
            console.log(`   🔍 [DEBUG] recent_post_dates no perfil: ${completeProfile.recent_post_dates?.length || 0} datas`);
            const activityScore = calculateActivityScore(completeProfile);
            completeProfile.activity_score = activityScore.score;
            completeProfile.is_active = activityScore.isActive;

            console.log(`   📊 Activity Score: ${activityScore.score}/100 (${activityScore.isActive ? 'ATIVA ✅' : 'INATIVA ❌'})`);
            console.log(`   📈 ${activityScore.postsPerMonth.toFixed(1)} posts/mês`);
            if (activityScore.reasons.length > 0) {
              console.log(`   💡 Razões: ${activityScore.reasons.join(', ')}`);
            }

            // ========================================
            // VALIDAÇÃO 2: WEBSITE/BIO >= 100 → PULA ACTIVITY SCORE
            // ========================================
            const bioLength = completeProfile.bio?.length || 0;
            const hasWebsite = !!completeProfile.website;
            const autoApprove = hasWebsite || bioLength >= 100;

            if (autoApprove) {
              const reasons = [];
              if (hasWebsite) reasons.push('tem website');
              if (bioLength >= 100) reasons.push(`bio >= 100 (${bioLength} chars)`);

              console.log(`   ✅ APROVAÇÃO AUTOMÁTICA: ${reasons.join(' e ')}`);
              console.log(`   ⏭️  Pulando validação de activity score...`);

              // Pular para extração de hashtags (activity score não será validado)
            }
            // ========================================
            // VALIDAÇÕES NORMAIS (apenas se NÃO aprovado automaticamente)
            // ========================================
            else if (!activityScore.isActive) {
              console.log(`   ❌ Perfil REJEITADO por baixo activity score - não será contabilizado`);
              processedUsernames.add(username); // Marcar como processado para não tentar novamente

              // 🔧 RESETAR controle de colunas após rejeição
              currentColumn = null;
              postsTriedInCurrentColumn = 0;
              console.log(`   🔄 Controle de colunas resetado após rejeição`);

              // 🔧 VOLTAR para o mural da hashtag ANTES de continuar
              console.log(`   ⬅️  Retornando ao mural após rejeição (preservando scroll)...`);
              try {
                await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await restoreScrollPosition(); // 🔄 Restaurar scroll
                console.log(`   ✅ Voltou ao mural da hashtag`);
              } catch (navError: any) {
                console.log(`   ⚠️  Erro ao retornar ao mural: ${navError.message}`);
              }

              // ⏱️ DELAY ADAPTATIVO baseado na profundidade do scroll
              let loadWaitTime = 5000; // Base: 5s
              if (lastSavedScrollPosition > 10000) {
                loadWaitTime = 25000; // 25s para posições muito avançadas
              } else if (lastSavedScrollPosition > 5000) {
                loadWaitTime = 18000; // 18s para posições avançadas
              } else if (lastSavedScrollPosition > 2000) {
                loadWaitTime = 12000; // 12s para posições médias
              } else if (lastSavedScrollPosition > 0) {
                loadWaitTime = 8000; // 8s para posições iniciais
              }

              console.log(`   ⏳ Aguardando ${loadWaitTime/1000}s para mural carregar (scroll: ${lastSavedScrollPosition}px)...`);
              await waitHuman(loadWaitTime * 0.9, loadWaitTime * 1.1); // Randomizar ±10%

              // 🔄 RE-APLICAR scroll (Instagram reseta durante os 10s)
              if (lastSavedScrollPosition > 0) {
                console.log(`   🔄 Re-aplicando scroll para ${lastSavedScrollPosition}px (Instagram resetou durante espera)...`);
                try {
                  await page.evaluate((scrollY) => {
                    window.scrollTo(0, scrollY);
                  }, lastSavedScrollPosition);
                  await waitHuman(1800, 2500);
                  console.log(`   ✅ Scroll re-aplicado`);
                } catch (err: any) {
                  console.log(`   ⚠️  Erro ao re-aplicar scroll: ${err.message}`);
                }
              }

              // 🎯 SCROLL INTELIGENTE: Só faz scroll se tiver 2+ duplicatas OU 8+ clicks
              if (consecutiveDuplicates >= 2 || totalHashtagFeedClicks >= 8) {
                console.log(`   📜 Scroll necessário (dups: ${consecutiveDuplicates}, clicks: ${totalHashtagFeedClicks})...`);
                const scrollMultiplier = calculateScrollMultiplier(consecutiveDuplicates, totalHashtagFeedClicks);
                await scrollAndWaitIntelligently(page, consecutiveDuplicates, scrollMultiplier);
                lastSavedScrollPosition = await page.evaluate(() => {
                  const bodyScroll = document.documentElement.scrollTop || document.body.scrollTop;
                  if (bodyScroll === 0) {
                    const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]');
                    if (mainContainer && mainContainer.scrollTop > 0) return mainContainer.scrollTop;
                  }
                  return bodyScroll;
                });
              }

              const feedReady = await waitForHashtagMural('Retorno após rejeição de activity score');
              if (!feedReady) {
                attemptsWithoutNewPost++;
              }

              continue; // PULA para o próximo perfil
            }

            // ========================================
            // EXTRAÇÃO DE HASHTAGS DOS POSTS (4 posts)
            // ========================================
            console.log(`   🏷️  Extraindo hashtags dos posts...`);
            try {
              // ✅ JÁ ESTAMOS NO PERFIL - não precisa fazer goto() novamente!
              // Isso evita adicionar entrada extra no histórico que quebra o goBack()

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

              // 📱 EXTRAIR WHATSAPP: website wa.me e bio
              const waExtraction = extractWhatsAppForPersistence(
                sanitizedProfile.website,
                sanitizedProfile.bio,
                sanitizedProfile.phone
              );

              // 📱 EXTRAIR WHATSAPP de wa.me/message (requer navegação)
              if (!waExtraction.whatsapp_number && isWaMessageLink(sanitizedProfile.website)) {
                console.log(`   📱 [WA-MESSAGE] Detectado link wa.me/message, extraindo via navegação...`);
                const messageNumber = await extractWhatsAppFromMessageLink(page, sanitizedProfile.website);
                if (messageNumber && isValidBrazilNumber(messageNumber)) {
                  waExtraction.whatsapp_number = messageNumber;
                  waExtraction.whatsapp_source = 'website_wa_me';
                  waExtraction.whatsapp_verified.push({
                    number: messageNumber,
                    source: 'website_wa_me',
                    extracted_at: new Date().toISOString()
                  });
                  console.log(`   ✅ [WA-MESSAGE] Número extraído: ${messageNumber}`);
                }
              }

              if (existingLeadData) {
                // 🔄 UPDATE: Perfil já existe - atualizar dados dinâmicos, preservar históricos
                console.log(`   🔄 Atualizando perfil existente @${username}...`);

                // MERGE hashtags_posts: combinar existentes + novas sem duplicatas
                const existingHashtags = existingLeadData.hashtags_posts || [];
                const newHashtags = sanitizedProfile.hashtags_posts || [];
                const mergedHashtags = [...new Set([...existingHashtags, ...newHashtags])];
                console.log(`   🏷️  Hashtags: ${existingHashtags.length} existentes + ${newHashtags.length} novas = ${mergedHashtags.length} únicas`);

                // Campos a ATUALIZAR (dados dinâmicos)
                const updateData = {
                  full_name: sanitizedProfile.full_name,
                  bio: sanitizedProfile.bio,
                  website: sanitizedProfile.website,
                  email: sanitizedProfile.email,
                  phone: sanitizedProfile.phone,
                  followers_count: sanitizedProfile.followers_count,
                  following_count: sanitizedProfile.following_count,
                  posts_count: sanitizedProfile.posts_count,
                  profile_pic_url: sanitizedProfile.profile_pic_url,
                  is_verified: sanitizedProfile.is_verified,
                  is_business_account: sanitizedProfile.is_business_account,
                  business_category: sanitizedProfile.business_category,
                  city: sanitizedProfile.city,
                  state: sanitizedProfile.state,
                  neighborhood: sanitizedProfile.neighborhood,
                  address: sanitizedProfile.address,
                  zip_code: sanitizedProfile.zip_code,
                  activity_score: sanitizedProfile.activity_score,
                  is_active: sanitizedProfile.is_active,
                  language: sanitizedProfile.language,
                  hashtags_bio: sanitizedProfile.hashtags_bio,
                  hashtags_posts: mergedHashtags.length > 0 ? mergedHashtags : null,
                  lead_score: leadScore,
                  updated_at: new Date().toISOString(),
                  // RESETAR flags de enriquecimento para reprocessar COMPLETO
                  url_enriched: false,
                  dado_enriquecido: false,
                  hashtags_extracted: false,
                  hashtags_ready_for_embedding: false,
                  // 📱 WhatsApp extraído no scrape
                  ...(waExtraction.whatsapp_number && {
                    whatsapp_number: waExtraction.whatsapp_number,
                    whatsapp_source: waExtraction.whatsapp_source,
                    whatsapp_verified: waExtraction.whatsapp_verified
                  })
                  // NÃO ATUALIZA: search_term_id, search_term_used, captured_at,
                  //              contact_status, is_qualified, qualification_notes, contacted_at
                };

                const { error: updateError } = await supabase
                  .from('instagram_leads')
                  .update(updateData)
                  .eq('id', existingLeadData.id);

                if (updateError) {
                  console.log(`   ⚠️  Erro ao atualizar @${username}: ${updateError.message}`);
                } else {
                  console.log(`   ✅ Perfil @${username} ATUALIZADO NO BANCO`);
                  // 🗑️ Deletar embedding antigo para reprocessar
                  await supabase.from('lead_embeddings').delete().eq('lead_id', existingLeadData.id);
                  // Embedding será feito pelo workflow n8n após enriquecimento completo
                }
              } else {
                // 🆕 UPSERT: Inserir novo perfil OU atualizar se já existir (race condition)
                const profileToSave = {
                  ...sanitizedProfile,
                  captured_at: new Date().toISOString(),
                  lead_source: 'hashtag_search',
                  lead_score: leadScore,
                  // segment e search_term_id podem ser NULL para scraping manual
                  segment: null,
                  search_term_id: null,
                  // Flags de enriquecimento - novo lead precisa ser processado
                  dado_enriquecido: false,
                  url_enriched: false,
                  hashtags_extracted: false,
                  hashtags_ready_for_embedding: false,
                  // 📱 WhatsApp extraído no scrape
                  ...(waExtraction.whatsapp_number && {
                    whatsapp_number: waExtraction.whatsapp_number,
                    whatsapp_source: waExtraction.whatsapp_source,
                    whatsapp_verified: waExtraction.whatsapp_verified
                  })
                };
                // phones_normalized será preenchido pelo trigger trg_normalize_instagram_lead()

                // 🔧 FIX: Usar UPSERT para evitar race condition (duplicate key)
                // Se outro processo inseriu entre o check e o insert, atualiza ao invés de falhar
                const { data: upsertedLead, error: upsertError } = await supabase
                  .from('instagram_leads')
                  .upsert(profileToSave, {
                    onConflict: 'username',
                    ignoreDuplicates: false  // false = atualizar em caso de conflito
                  })
                  .select('id')
                  .single();

                if (upsertError) {
                  console.log(`   ⚠️  Erro ao salvar @${username} no banco: ${upsertError.message}`);
                } else {
                  console.log(`   ✅ Perfil @${username} SALVO NO BANCO (upsert)`);
                  // Embedding será feito pelo workflow n8n após enriquecimento completo
                }
              }

              // 🆕 MARCAR POSIÇÃO como clicada SOMENTE quando perfil é APROVADO
              if (selectedGridKey && selectedPosition) {
                clickedGridPositions.add(selectedGridKey);
                console.log(`   🔒 Posição (${selectedPosition.x}, ${selectedPosition.y}) marcada como clicada`);
              }

              // 🆕 NÃO limpar attemptedPositionsInCycle aqui!
              // Queremos continuar na próxima coluna, não voltar pro início
              // A limpeza acontece apenas no scroll (quando esgotou posições visíveis)
            } catch (dbError: any) {
              console.log(`   ⚠️  Erro ao salvar @${username}: ${dbError.message}`);
            }

            // Adicionar ao array só para contagem/retorno
            foundProfiles.push(completeProfile);
            processedUsernames.add(username);
            // ⚠️  NÃO resetar consecutiveDuplicates - precisa manter para detectar quando mural esgotou

            console.log(`   📊 Total coletado (aprovados): ${foundProfiles.length}/${maxProfiles}`);

            // ANTI-DETECÇÃO: Delay antes de retornar ao feed (3-5s)
            console.log(`   🛡️  Aguardando antes de retornar ao feed...`);
            await waitHuman(3000, 5000); // Anti-detecção: 3-5s

          } catch (profileError: any) {
            console.log(`   ⚠️  Erro ao extrair dados de @${username}: ${profileError.message}`);
            console.log(`   ⏭️  Continuando com próximo perfil...`);
          }

          console.log(`   ⬅️  Retornando para o mural da hashtag...`);
          // 🎯 LÓGICA SEQUENCIAL: Voltar para hashtag (Instagram SPA mantém scroll)
          try {
            await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await restoreScrollPosition(); // 🔄 Restaurar scroll
            console.log(`   ✅ Voltou ao mural da hashtag`);
          } catch (navError: any) {
            console.log(`   ⚠️  Erro ao retornar ao mural: ${navError.message}`);
          }
          await waitHuman(1500, 2500);

          // 🎯 SCROLL INTELIGENTE: Só faz scroll se tiver 2+ duplicatas OU 8+ clicks
          if (consecutiveDuplicates >= 2 || totalHashtagFeedClicks >= 8) {
            console.log(`   📜 Scroll necessário (dups: ${consecutiveDuplicates}, clicks: ${totalHashtagFeedClicks})...`);
            const scrollMultiplier = calculateScrollMultiplier(consecutiveDuplicates, totalHashtagFeedClicks);
            await scrollAndWaitIntelligently(page, consecutiveDuplicates, scrollMultiplier);
            lastSavedScrollPosition = await page.evaluate(() => {
              const bodyScroll = document.documentElement.scrollTop || document.body.scrollTop;
              if (bodyScroll === 0) {
                const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]');
                if (mainContainer && mainContainer.scrollTop > 0) {
                  return mainContainer.scrollTop;
                }
              }
              return bodyScroll;
            });
          }

          const feedReadyAfterProfile = await waitForHashtagMural('Retorno após coletar perfil');
          if (!feedReadyAfterProfile) {
            // 🚨 DETECTAR ERRO DE SESSÃO (about:blank, timeout, etc.)
            const currentUrl = page.url();
            const isSessionError = currentUrl === 'about:blank' || currentUrl === '' || currentUrl === 'data:,';

            if (isSessionError) {
              console.log(`🚨 ERRO DE SESSÃO DETECTADO: URL=${currentUrl}`);
              const recovered = await handleSessionError(page, `URL inválida após coletar perfil: ${currentUrl}`);

              if (recovered) {
                // Nova sessão iniciada - recriar página e continuar
                console.log(`✅ Sessão recuperada - recriando página...`);
                try {
                  // ✅ Fechar page antiga para evitar múltiplas pages ativas
                  await page.close().catch(() => {});
                  page = await createAuthenticatedPage();
                  await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                  await waitHuman(2700, 3500);
                  continue;
                } catch (recreateError: any) {
                  console.log(`❌ Erro ao recriar página: ${recreateError.message}`);
                  break;
                }
              } else {
                console.log(`❌ Não foi possível recuperar sessão - encerrando scraping`);
                break;
              }
            }

            attemptsWithoutNewPost++;
            continue;
          }

        } catch (error: any) {
          console.log(`   ❌ Erro ao processar post (${error.message}). Tentando retornar ao mural...`);
          // 🎯 LÓGICA SEQUENCIAL: Voltar para hashtag (Instagram SPA mantém scroll)
          try {
            await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await restoreScrollPosition(); // 🔄 Restaurar scroll
            console.log(`   ✅ Voltou ao mural da hashtag após erro`);
          } catch (navError: any) {
            console.log(`   ⚠️  Erro ao retornar ao mural: ${navError.message}`);
          }
          await waitHuman(1300, 1800);

          // 🎯 SCROLL INTELIGENTE: Só faz scroll se tiver 2+ duplicatas OU 8+ clicks
          if (consecutiveDuplicates >= 2 || totalHashtagFeedClicks >= 8) {
            console.log(`   📜 Scroll necessário (dups: ${consecutiveDuplicates}, clicks: ${totalHashtagFeedClicks})...`);
            const scrollMultiplier = calculateScrollMultiplier(consecutiveDuplicates, totalHashtagFeedClicks);
            await scrollAndWaitIntelligently(page, consecutiveDuplicates, scrollMultiplier);
            lastSavedScrollPosition = await page.evaluate(() => {
              const bodyScroll = document.documentElement.scrollTop || document.body.scrollTop;
              if (bodyScroll === 0) {
                const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]');
                if (mainContainer && mainContainer.scrollTop > 0) {
                  return mainContainer.scrollTop;
                }
              }
              return bodyScroll;
            });
          }

          const feedReadyAfterError = await waitForHashtagMural('Retorno após erro');
          if (!feedReadyAfterError) {
            // 🚨 DETECTAR ERRO DE SESSÃO (about:blank, timeout, etc.)
            const currentUrl = page.url();
            const isSessionError = currentUrl === 'about:blank' || currentUrl === '' || currentUrl === 'data:,';

            if (isSessionError) {
              console.log(`🚨 ERRO DE SESSÃO DETECTADO: URL=${currentUrl}`);
              const recovered = await handleSessionError(page, `URL inválida após erro: ${currentUrl}`);

              if (recovered) {
                // Nova sessão iniciada - recriar página e continuar
                console.log(`✅ Sessão recuperada - recriando página...`);
                try {
                  // ✅ Fechar page antiga para evitar múltiplas pages ativas
                  await page.close().catch(() => {});
                  page = await createAuthenticatedPage();
                  await page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                  await waitHuman(2700, 3500);
                  continue;
                } catch (recreateError: any) {
                  console.log(`❌ Erro ao recriar página: ${recreateError.message}`);
                  break;
                }
              } else {
                console.log(`❌ Não foi possível recuperar sessão - encerrando scraping`);
                break;
              }
            }

            attemptsWithoutNewPost++;
          }
          continue;
        }
      } // 🆕 FIM DO WHILE INTERNO (SCRAPING DESTA HASHTAG)

      // 🆕 EXPLICAR POR QUE O LOOP DESTA HASHTAG PAROU
      if (foundProfiles.length >= maxProfiles) {
        console.log(`\n🎯 Meta desta hashtag atingida: ${foundProfiles.length}/${maxProfiles} perfis coletados`);
      } else if (totalHashtagFeedClicks >= 50) {
        console.log(`\n⏹️  Scraping interrompido: Limite de 50 clicks no mural atingido`);
        console.log(`   🛡️  Proteção contra loops infinitos em hashtags com muitos posts não-PT`);
        console.log(`   📊 Total de clicks executados: ${totalHashtagFeedClicks}`);
      } else if (consecutiveDuplicates >= 5) {
        console.log(`\n⏹️  Scraping interrompido: 5 duplicatas consecutivas (mesmo aguardando auto-scroll)`);
        console.log(`   💡 Esta hashtag parece esgotada - todos os perfis já foram coletados anteriormente`);
      } else if (languageRejections >= 5) {
        console.log(`\n⏹️  Scraping interrompido: 5 perfis rejeitados por idioma não-português`);
        console.log(`   🌍 Esta hashtag tem predominância de conteúdo estrangeiro - pulando para próxima`);
      } else if (attemptsWithoutNewPost >= 5) {
        console.log(`\n⏹️  Scraping interrompido: 5 tentativas sem encontrar novos posts`);
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
          // 🆕 NO_RESULTS: Hashtag sem posts - NÃO é erro, apenas pular para próxima
          if (hashtagError.message.includes('NO_RESULTS')) {
            console.log(`\n📭 ============================================`);
            console.log(`📭 HASHTAG SEM RESULTADOS - PULANDO`);
            console.log(`📭 ============================================`);
            console.log(`   ℹ️  #${hashtagToScrape} não tem posts (hashtag inexistente ou vazia)`);
            console.log(`   ➡️  Continuando para próxima hashtag...\n`);
            hashtagSuccess = true; // Marca como "sucesso" para não fazer retry
            break; // Sai do while de retry, vai para próxima hashtag
          }

          console.error(`❌ Erro ao scrape hashtag #${hashtagToScrape} (tentativa ${retryCount}/${MAX_RETRIES}):`, hashtagError.message);

          // Atualizar métricas de resiliência
          const errorType = hashtagError.message.includes('detached') ? 'DETACHED_FRAME'
            : hashtagError.message.includes('SESSION_INVALID') ? 'SESSION_INVALID'
            : hashtagError.message.includes('timeout') ? 'TIMEOUT'
            : 'UNKNOWN';
          updateResilienceOnError(errorType);

          // 🚨 RATE LIMIT (429): PARAR TUDO IMEDIATAMENTE, NÃO FAZER RETRY!
          if (hashtagError instanceof RateLimitError) {
            console.log(`\n🚨 ============================================`);
            console.log(`🚨 ERRO 429 (RATE LIMIT) - NÃO FAZER RETRY!`);
            console.log(`🚨 ============================================`);
            console.log(`   💾 Perfis já salvos: ${foundProfiles.length}`);
            console.log(`   🛑 ENCERRANDO IMEDIATAMENTE (vai fazer logout/rotação)`);

            // Acumular perfis desta hashtag
            allFoundProfiles.push(...foundProfiles);

            // PROPAGAR ERRO PARA CATCH PRINCIPAL (faz logout e rotação)
            throw hashtagError;
          }

          // 🆕 CIRCUIT BREAKER: Se muitos erros consecutivos, pular hashtag e continuar
          if (shouldSkipHashtag()) {
            console.log(`\n⚡ [CIRCUIT BREAKER] ${resilienceMetrics.consecutiveErrors} erros consecutivos detectados`);
            console.log(`   🔄 Pulando #${hashtagToScrape} para evitar mais falhas`);
            resilienceMetrics.hashtagsSkipped.push(hashtagToScrape);
            resilienceMetrics.consecutiveErrors = 0; // Reset para próxima hashtag
            break; // Sai do while de retry, vai para próxima hashtag
          }

          // Se for detached frame, Instagram detectou scraping → ROTACIONAR CONTA
          if (hashtagError.message.includes('detached Frame')) {
            console.log(`\n🚨 DETACHED FRAME DETECTADO - Instagram detectou scraping`);
            console.log(`   💾 Perfis já coletados: ${foundProfiles.length}`);
            console.log(`   🔄 Chamando handleSessionError() para rotação de conta...`);

            // Acumular perfis desta hashtag
            allFoundProfiles.push(...foundProfiles);

            // 🔄 ROTACIONAR CONTA (limpa cookies, registra falha, troca conta)
            try {
              const recovered = await handleSessionError(page, 'DETACHED_FRAME: Instagram detected automation');

              if (recovered) {
                console.log(`✅ Rotação bem-sucedida! Nova conta logada.`);
                // 🔧 FIX: Fechar página anterior ANTES de criar nova
                try { await cleanup(); } catch {}
                // Recriar contexto com nova conta
                const newContext = await createIsolatedContext();
                page = newContext.page;
                cleanup = newContext.cleanup;
                // Resetar contadores e tentar novamente a MESMA hashtag com a nova conta
                resilienceMetrics.consecutiveErrors = 0;
                retryCount = 0;
                continue;
              } else {
                // Rotação não necessária ainda (failureCount < 3) - continuar retry
                const rotation = getAccountRotation();
                const currentAccount = rotation.getCurrentAccount();
                console.log(`⚠️ Falha ${currentAccount.failureCount}/3 registrada para @${currentAccount.instagramUsername || currentAccount.username}`);
                console.log(`   Continuando retry (tentativa ${retryCount + 1}/${MAX_RETRIES}) com a mesma conta`);
                // ✅ NÃO fazer break - deixar o retry loop continuar naturalmente
                // O retryCount++ acontece no final do catch block
              }
            } catch (rotationError: any) {
              // Se for GlobalCooldownError, propagar imediatamente
              if (rotationError.name === 'GlobalCooldownError') {
                throw rotationError;
              }
              // Outros erros de rotação - encerrar
              console.log(`❌ Erro durante rotação: ${rotationError.message}`);
              hashtagIndex = hashtagsToScrape.length;
              break;
            }
          }

          // 🆕 SESSION_INVALID: Chamar handleSessionError() que faz logout + cleanup + rotação + login
          if (hashtagError.message.includes('SESSION_INVALID')) {
            resilienceMetrics.consecutiveSessionInvalid++;

            console.log(`\n🚨 [SESSION_INVALID] Falha ${resilienceMetrics.consecutiveSessionInvalid}/${MAX_CONSECUTIVE_SESSION_INVALID}`);

            // 🚫 BLOQUEIO: Se atingiu limite de SESSION_INVALID consecutivos, PARAR IMEDIATAMENTE
            if (resilienceMetrics.consecutiveSessionInvalid >= MAX_CONSECUTIVE_SESSION_INVALID) {
              console.log(`\n🛑 ============================================`);
              console.log(`🛑 LIMITE DE SESSION_INVALID ATINGIDO (${MAX_CONSECUTIVE_SESSION_INVALID})`);
              console.log(`🛑 Instagram está bloqueando repetidamente`);
              console.log(`🛑 PARANDO EXECUÇÃO PARA EVITAR BAN`);
              console.log(`🛑 ============================================`);
              console.log(`\n💡 Ações recomendadas:`);
              console.log(`   1. Aguardar 4-8 horas antes de tentar novamente`);
              console.log(`   2. Verificar todas as contas manualmente no Instagram`);
              console.log(`   3. Verificar se IP está bloqueado (considere usar proxy)`);
              console.log(`   4. Reduzir drasticamente a frequência de scraping\n`);

              // FORÇAR ENCERRAMENTO
              throw new Error(`SESSION_INVALID_LIMIT_REACHED: ${MAX_CONSECUTIVE_SESSION_INVALID} falhas consecutivas - execução bloqueada`);
            }

            console.log(`🔄 Delegando para handleSessionError() - fará logout, cleanup, rotação e login na nova conta...`);

            // 🎯 Chamar função que faz TUDO corretamente:
            // - Logout do browser atual
            // - Fechar browser e páginas
            // - Limpar cookies
            // - Rotacionar para próxima conta
            // - Aguardar cooldown
            // - Login na nova conta
            const recovered = await handleSessionError(page, hashtagError.message);

            if (recovered) {
              console.log(`✅ Recuperação bem-sucedida! Nova conta logada e pronta.`);
              resilienceMetrics.consecutiveSessionInvalid = 0;
              resilienceMetrics.sessionRecoveries++;
              // Continue no retry loop (vai tentar novamente com nova conta)
            } else {
              console.log(`❌ Não foi possível recuperar sessão (todas as contas falharam ou em cooldown).`);
              throw new Error(`SESSION_INVALID: Todas as contas falharam ou em cooldown`);
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

  // ✅ REGISTRAR SUCESSO DO PROXY (otimiza rotação)
  if (proxyRotationService.isEnabled() && currentProxyConfig) {
    proxyRotationService.recordProxySuccess(currentProxyConfig);
    console.log(`✅ Proxy ${currentProxyConfig.host}:${currentProxyConfig.port} - sucesso registrado`);
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

    // 🚨 TRATAMENTO ESPECÍFICO 1: SESSION_INVALID
    if (error.message?.includes('SESSION_INVALID')) {
      console.log(`\n🚨 ========================================`);
      console.log(`🚨 SESSION_INVALID DETECTADO!`);
      console.log(`🚨 Instagram detectou sessão inválida`);
      console.log(`🚨 ========================================\n`);

      // ❌ REGISTRAR FALHA DO PROXY (otimiza rotação)
      if (proxyRotationService.isEnabled() && currentProxyConfig) {
        proxyRotationService.recordProxyFailure(currentProxyConfig);
        console.log(`❌ Proxy ${currentProxyConfig.host}:${currentProxyConfig.port} - falha registrada (SESSION_INVALID)`);
      }

      const accountRotation = getAccountRotation();

      // 🔍 PASSO 1: Detectar qual conta está REALMENTE logada
      let actualLoggedUsername: string | null = null;
      try {
        const html = await page.content();
        const usernameMatch = html.match(/"username":"([^"]+)"/);
        if (usernameMatch && usernameMatch[1]) {
          actualLoggedUsername = usernameMatch[1];
          console.log(`   🔍 Conta detectada na sessão real: ${actualLoggedUsername}`);
        }
      } catch (detectError: any) {
        console.log(`   ⚠️  Não foi possível detectar username da sessão: ${detectError.message}`);
      }

      // 🔄 PASSO 2: Sincronizar rotation state com conta REAL
      if (actualLoggedUsername) {
        const actualAccountIndex = accountRotation.accounts.findIndex(
          acc => acc.username.includes(actualLoggedUsername!)
        );

        if (actualAccountIndex !== -1 && actualAccountIndex !== accountRotation.state.currentAccountIndex) {
          console.log(`   🔄 CORREÇÃO: Rotation state dessincronizado!`);
          console.log(`      State dizia: index ${accountRotation.state.currentAccountIndex} (${accountRotation.accounts[accountRotation.state.currentAccountIndex]?.username})`);
          console.log(`      Sessão real: index ${actualAccountIndex} (${accountRotation.accounts[actualAccountIndex].username})`);
          accountRotation.state.currentAccountIndex = actualAccountIndex;
          console.log(`   ✅ currentAccountIndex corrigido para ${actualAccountIndex}`);
        }
      }

      // 🔧 FIX: NÃO registrar falha aqui - handleSessionError() já faz isso
      // Isso mantém consistência com o handler de 429
      console.log(`   ℹ️  Falha será registrada em handleSessionError()`);

      // 🧹 PASSO 4: Fechar CONTEXTO LOCAL (não global!)
      console.log(`\n🧹 ========== FECHANDO CONTEXTO LOCAL ==========`);
      try {
        if (cleanup) {
          await cleanup();
          console.log(`   ✅ Contexto local (page/browser) fechado`);
        }
      } catch (cleanupError: any) {
        console.log(`   ⚠️  Erro ao fechar contexto: ${cleanupError.message}`);
      }

      // 🗑️ PASSO 5: Deletar cookies da conta com sessão inválida
      const invalidAccount = accountRotation.getCurrentAccount();
      if (fs.existsSync(invalidAccount.cookiesFile)) {
        fs.unlinkSync(invalidAccount.cookiesFile);
        console.log(`   🗑️  Cookies deletados: ${path.basename(invalidAccount.cookiesFile)}`);
      }

      // Resetar variáveis de sessão globais
      loggedUsername = null;
      sessionPage = null;
      browserInstance = null;
      console.log(`   ✅ Variáveis de sessão resetadas`);
      console.log(`========================================\n`);

      // 🔄 PASSO 6: Rotacionar e fazer login na nova conta
      const recovered = await handleSessionError(page, 'SESSION_INVALID');

      if (!recovered) {
        console.log(`\n❌ ========================================`);
        console.log(`❌ NÃO FOI POSSÍVEL RECUPERAR SESSÃO`);
        console.log(`❌ Cooldown muito longo ou sem contas disponíveis`);
        console.log(`❌ ========================================\n`);
        throw new Error('SESSION_INVALID: Não foi possível rotacionar para outra conta');
      }

      console.log(`\n✅ ========================================`);
      console.log(`✅ SESSÃO RECUPERADA COM NOVA CONTA`);
      console.log(`✅ Retry automático será feito pelo sistema`);
      console.log(`✅ ========================================\n`);

      // 🔄 Lançar erro especial para trigger retry automático
      throw new Error('RETRY_IMMEDIATELY: Conta rotacionada e pronta, retry automático');
    }

    // 🚨 TRATAMENTO ESPECÍFICO 2: RATE LIMIT (429)
    else if (error instanceof RateLimitError) {
      console.log(`\n🚨 ========================================`);
      console.log(`🚨 ERRO 429 (RATE LIMIT) DETECTADO!`);
      console.log(`🚨 ========================================\n`);

      // ❌ REGISTRAR FALHA DO PROXY (otimiza rotação)
      if (proxyRotationService.isEnabled() && currentProxyConfig) {
        proxyRotationService.recordProxyFailure(currentProxyConfig);
        console.log(`❌ Proxy ${currentProxyConfig.host}:${currentProxyConfig.port} - falha registrada (RATE_LIMIT 429)`);
      }

      const accountRotation = getAccountRotation();

      // 🔍 PASSO 1: Detectar qual conta está REALMENTE logada
      let actualLoggedUsername: string | null = null;
      try {
        const html = await page.content();
        const usernameMatch = html.match(/"username":"([^"]+)"/);
        if (usernameMatch && usernameMatch[1]) {
          actualLoggedUsername = usernameMatch[1];
          console.log(`   🔍 Conta detectada na sessão real: ${actualLoggedUsername}`);
        }
      } catch (detectError: any) {
        console.log(`   ⚠️  Não foi possível detectar username da sessão: ${detectError.message}`);
      }

      // 🔄 PASSO 2: Sincronizar rotation state com conta REAL
      if (actualLoggedUsername) {
        const actualAccountIndex = accountRotation.accounts.findIndex(
          acc => acc.username.includes(actualLoggedUsername!)
        );

        if (actualAccountIndex !== -1 && actualAccountIndex !== accountRotation.state.currentAccountIndex) {
          console.log(`   🔄 CORREÇÃO: Rotation state dessincronizado!`);
          console.log(`      State dizia: index ${accountRotation.state.currentAccountIndex} (${accountRotation.accounts[accountRotation.state.currentAccountIndex]?.username})`);
          console.log(`      Sessão real: index ${actualAccountIndex} (${accountRotation.accounts[actualAccountIndex].username})`);
          accountRotation.state.currentAccountIndex = actualAccountIndex;
          console.log(`   ✅ currentAccountIndex corrigido para ${actualAccountIndex}`);
        }
      }

      // 🔧 FIX v3: Primeiro registrar falha e verificar se atingiu 3 tentativas
      // IP cooling só acontece APÓS confirmar erro com 3 falhas
      const recovered = await handleSessionError(page, 'RATE_LIMIT_429');
      const currentAccount = accountRotation.getCurrentAccount();

      if (!recovered) {
        // Ainda não atingiu 3 falhas - fazer RETRY com mesma conta (sem IP cooling)
        console.log(`\n🔄 ========================================`);
        console.log(`🔄 RETRY: Falha ${currentAccount.failureCount}/3 registrada`);
        console.log(`🔄 Tentando novamente com mesma conta...`);
        console.log(`🔄 ========================================\n`);

        throw new Error('RETRY_IMMEDIATELY: Tentativa de retry após 429');
      }

      // ✅ Atingiu 3 falhas - handleSessionError() JÁ FEZ:
      // - Logout da conta bloqueada
      // - Fechou browser e sessão
      // - Deletou cookies da conta bloqueada
      // - Rotacionou para próxima conta disponível
      // - Inicializou nova sessão
      console.log(`\n🚨 ========================================`);
      console.log(`🚨 3 FALHAS CONFIRMADAS - ERRO 429 VALIDADO`);
      console.log(`🚨 Cleanup e rotação JÁ executados por handleSessionError()`);
      console.log(`🚨 ========================================\n`);

      // Resetar variáveis locais (handleSessionError já atualizou as globais)
      loggedUsername = null;

      // 🧊 IP cooling (30 min) - só após confirmar erro com 3 falhas
      const ipCoolingMinutes = accountRotation.getIpCoolingRemaining();
      if (ipCoolingMinutes > 0) {
        console.log(`\n⏰ 🧊 IP COOLING: Aguardando ${ipCoolingMinutes}min...`);
        await new Promise(resolve => setTimeout(resolve, ipCoolingMinutes * 60 * 1000));
        console.log(`✅ IP cooling concluído!`);
      }

      console.log(`\n✅ ========================================`);
      console.log(`✅ CONTA ROTACIONADA - RETRY COM NOVA CONTA`);
      console.log(`✅ ========================================\n`);

      throw new Error('RETRY_IMMEDIATELY: Conta rotacionada após 3 falhas');
    }

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
export async function scrapeProfileWithExistingPage(page: any, username: string, skipNavigation: boolean = false): Promise<InstagramProfileData & { followers: string }> {
  try {
    // Usar busca humana ao invés de URL direta (apenas se não pular navegação)
    if (!skipNavigation) {
      await searchProfileHumanLike(page, username);
    } else {
      console.log(`   ⏩ Navegação pulada - página já está no perfil`);
    }

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
      const usernameFromHeader = document.querySelector('header section h2')?.textContent?.trim() || '';
      const bioLinks = Array.from(document.querySelectorAll('header section a[href^="http"]'))
        .filter((a: any) => {
          const text = a.textContent?.trim() || '';
          const isButton = a.getAttribute('role') === 'button' || a.closest('button');
          const looksLikeUrl = text.includes('.') || text.startsWith('http');
          const isIcon = text.length < 3;
          // Filtrar links de Threads (texto começa com "Threads" ou é igual ao username)
          const isThreadsLink = text.startsWith('Threads') || text === usernameFromHeader || text.toLowerCase().includes('threads');
          return !isButton && looksLikeUrl && !isIcon && !isThreadsLink;
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
 * 🆕 Scrape de perfil usando PÁGINA DEDICADA (isolada)
 *
 * Diferente de scrapeInstagramProfile:
 * - SEMPRE cria uma nova página (não reutiliza a persistente)
 * - Não interfere com scrape-users ou outras operações em andamento
 * - FECHA a página após o uso
 *
 * Ideal para scrapes vindos do inbound (DM reply, webhooks)
 * que podem rodar em paralelo com outras operações.
 *
 * @param username - Username do Instagram (sem @)
 * @returns Dados do perfil
 */
export async function scrapeInstagramProfileDedicated(username: string): Promise<InstagramProfileData & { followers: string }> {
  // Usa página dedicada que NÃO interfere com outras operações
  const { page, requestId, cleanup } = await createDedicatedPage();
  console.log(`🔒 [DEDICATED] Request ${requestId} iniciada para scrape-profile-dedicated: "@${username}"`);

  try {
    const result = await scrapeProfileWithExistingPage(page, username);
    console.log(`✅ [DEDICATED] SCRAPE-PROFILE CONCLUÍDO: dados coletados para "@${username}"`);
    return result;
  } catch (error: any) {
    console.error(`❌ [DEDICATED] Erro ao scrape perfil "@${username}":`, error.message);
    throw error;
  } finally {
    console.log(`🔓 [DEDICATED] Request ${requestId} finalizada (scrape-profile-dedicated: "@${username}")`);
    await cleanup(); // Cleanup SEMPRE fecha a página dedicada
    console.log(`🏁 [DEDICATED] SCRAPE-PROFILE ENCERRADO COMPLETAMENTE: "@${username}" - Request ${requestId}`);
  }
}

/**
 * 🔄 Scrape de perfil navegando direto para URL (sem busca)
 * Usa sessão compartilhada (como scrapeInstagramFollowers)
 * @param username - Username do Instagram (sem @)
 */
export async function scrapeInstagramProfileByUrl(username: string): Promise<InstagramProfileData & { followers: string }> {
  // Importar createAuthenticatedPage do session service
  const { createAuthenticatedPage } = await import('./instagram-session.service');

  console.log(`🔒 Iniciando scrape-profile-url para "@${username}"`);

  const page = await createAuthenticatedPage();

  try {
    // Navegar direto para URL do perfil
    console.log(`   🌐 Navegando direto para https://www.instagram.com/${username}/`);
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Delay humano após carregar
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));

    // Agora usar a função de scrape com skipNavigation=true
    const result = await scrapeProfileWithExistingPage(page, username, true);
    console.log(`✅ SCRAPE-PROFILE-URL CONCLUÍDO: dados coletados para "@${username}"`);
    return result;
  } catch (error: any) {
    console.error(`❌ Erro ao scrape perfil "@${username}" por URL:`, error.message);
    throw error;
  } finally {
    // Fechar apenas esta página, não o browser todo
    try {
      await page.close();
      console.log(`🏁 SCRAPE-PROFILE-URL ENCERRADO: "@${username}"`);
    } catch (closeError) {
      // Ignorar erro ao fechar
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
 * Lista processos Chrome/Puppeteer para análise manual
 *
 * ⚠️ IMPORTANTE: NÃO mata processos automaticamente!
 * O kill automático foi desativado pois há múltiplos services usando Puppeteer
 * (scraper, session, DM worker, url-scraper, etc.) e é arriscado matar processos
 * que podem estar ativos em outro contexto.
 *
 * Use esta função para DIAGNÓSTICO e depois decida manualmente quais matar.
 */
export async function killOrphanPuppeteerProcesses(): Promise<{
  killed: number;
  currentPid: number | null;
  orphanPids: number[];
  preserved: number[];
  errors: string[];
}> {
  const { exec } = require('child_process');
  const currentPid = browserInstance?.process()?.pid || null;

  console.log(`\n🔍 ========== DIAGNÓSTICO PROCESSOS CHROME ==========`);
  console.log(`   ⚠️  MODO SEGURO: Apenas lista, NÃO mata processos`);
  console.log(`   🔍 Browser local conhecido: ${currentPid || 'NENHUM'}`);

  return new Promise((resolve) => {
    exec('pgrep -f "Chrome for Testing"', async (error: any, stdout: string) => {
      if (error || !stdout.trim()) {
        console.log(`   ✅ Nenhum processo Chrome for Testing encontrado`);
        console.log(`==========================================\n`);
        resolve({
          killed: 0,
          currentPid,
          orphanPids: [],
          preserved: [],
          errors: []
        });
        return;
      }

      const allPids = stdout.trim().split('\n')
        .map(pid => parseInt(pid.trim()))
        .filter(pid => !isNaN(pid));

      console.log(`   📊 Total processos Chrome: ${allPids.length}`);
      console.log(`   📋 PIDs encontrados: ${allPids.join(', ')}`);
      console.log(`\n   ℹ️  Para matar manualmente, use: kill -9 <PID>`);
      console.log(`   ℹ️  Ou aguarde análise diária para decidir quais são órfãos`);
      console.log(`==========================================\n`);

      resolve({
        killed: 0,  // Não mata nada automaticamente
        currentPid,
        orphanPids: allPids,  // Lista todos para análise
        preserved: currentPid ? [currentPid] : [],
        errors: []
      });
    });
  });
}

/**
 * 🔥 SCRAPE INSTAGRAM EXPLORE
 * Navega direto para a aba Explorar e coleta perfis válidos (com bio/contato)
 * Baseado na scrapeInstagramTag mas sem termo de busca
 *
 * @param maxProfiles - Número máximo de perfis válidos a coletar
 * @param accountProfile - Conta específica a usar (opcional)
 * @returns Lista de perfis coletados do Explorar
 */
export async function scrapeInstagramExplore(
  maxProfiles: number = 10,
  accountProfile?: string
): Promise<HashtagScrapeResult> {
  const SEARCH_TERM_MARKER = 'explorar_instagram'; // Identificador no banco

  console.log(`\n🔥 ========== SCRAPE-EXPLORE INICIADO ==========`);
  console.log(`🔥 Alvo: Página Explorar do Instagram`);
  console.log(`🔥 Perfis válidos desejados: ${maxProfiles}`);

  // 🎯 SETAR CONTA MANUALMENTE se accountProfile fornecido
  if (accountProfile && accountProfile !== 'default') {
    const rotation = getAccountRotation();
    const success = await rotation.setAccount(accountProfile);
    if (!success) {
      console.log(`⚠️  Conta "${accountProfile}" não encontrada - usando rotação automática`);
    }
  }

  // 🆕 RESET MÉTRICAS DE RESILIÊNCIA PARA NOVA SESSÃO
  resilienceMetrics.consecutiveErrors = 0;
  resilienceMetrics.totalErrors = 0;
  resilienceMetrics.totalSuccess = 0;
  resilienceMetrics.lastErrorType = null;
  resilienceMetrics.lastErrorTime = 0;
  resilienceMetrics.sessionRecoveries = 0;
  resilienceMetrics.hashtagsSkipped = [];
  resilienceMetrics.adaptiveDelayMultiplier = 1.0;
  resilienceMetrics.consecutiveSessionInvalid = 0;
  console.log(`🔄 Métricas de resiliência resetadas para nova sessão`);

  // Criar contexto
  let context = await createIsolatedContext();
  let page = context.page;
  const requestId = context.requestId;
  let cleanup = context.cleanup;
  console.log(`🔒 Request ${requestId} iniciada para scrape-explore`);

  const allFoundProfiles: any[] = [];

  try {
    // 🆕 NAVEGAR DIRETO PARA O EXPLORAR
    const exploreUrl = 'https://www.instagram.com/explore/';
    console.log(`\n🎯 Navegando para: ${exploreUrl}`);

    // Verificar se página está válida ANTES de navegar
    try {
      const isPageClosed = page.isClosed();
      if (isPageClosed) {
        throw new Error('Page is closed');
      }
      await page.evaluate(() => window.location.href).catch(() => {
        throw new Error('Page frame is detached before navigation');
      });
    } catch (checkError: any) {
      console.log(`⚠️  Página corrompida detectada ANTES de navegar: ${checkError.message}`);
      throw new Error(`Page invalidated: ${checkError.message}`);
    }

    // Navegar para Explorar COM DETECÇÃO DE 429
    try {
      await navigateWithRateLimitDetection(page, exploreUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      console.log(`   ✅ Navegação para Explorar concluída`);
    } catch (navError: any) {
      if (navError instanceof RateLimitError) {
        console.log(`\n🚨 BLOQUEIO DETECTADO NA NAVEGAÇÃO!`);
        throw navError;
      }
      console.log(`   ❌ Erro durante navegação: ${navError.message}`);
      throw navError;
    }

    // 🆕 VERIFICAR SE INSTAGRAM REDIRECIONOU
    let currentUrl = page.url();
    console.log(`   🔍 URL atual: ${currentUrl}`);

    const isLoginPage = currentUrl.includes('/accounts/login');
    const isChallengePage = currentUrl.includes('/challenge') || currentUrl.includes('/checkpoint');
    const isExplorePage = currentUrl.includes('/explore');

    if (isLoginPage) {
      console.log('❌ Instagram redirecionou para página de LOGIN - sessão inválida');
      throw new Error('SESSION_INVALID: Redirected to login page');
    }

    if (isChallengePage) {
      console.log('❌ Instagram redirecionou para CHALLENGE - verificação necessária');
      throw new Error('CHALLENGE_REQUIRED: Instagram requires verification');
    }

    if (!isExplorePage) {
      console.log(`⚠️  URL não é o Explorar! Recebido: ${currentUrl}`);
      // Tentar navegar novamente
      await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await waitHuman(2700, 3500);
    }

    // Delay após navegação
    const baseNavDelay = 2000 + Math.random() * 1000;
    const postNavDelay = getAdaptiveDelay(baseNavDelay);
    console.log(`   ⏳ Aguardando ${(postNavDelay/1000).toFixed(1)}s para renderização...`);
    await new Promise(resolve => setTimeout(resolve, postNavDelay));

    // 6. AGUARDAR MURAL CARREGAR
    console.log(`⏳ Aguardando mural do Explorar carregar...`);
    const postSelector = 'a[href*="/p/"], a[href*="/reel/"]';

    // Esperar posts aparecerem
    try {
      await page.waitForFunction(
        (selector) => {
          const posts = document.querySelectorAll(selector);
          return posts.length > 0;
        },
        { timeout: 20000 },
        postSelector
      );

      const postCount = await page.evaluate((selector) => {
        return document.querySelectorAll(selector).length;
      }, postSelector);

      console.log(`   ✅ Mural carregado com ${postCount} posts`);
    } catch (waitError: any) {
      console.log(`   ❌ Timeout ao aguardar mural do Explorar: ${waitError.message}`);
      throw new Error('Mural do Explorar não carregou');
    }

    // ⏳ Aguardar lazy loading inicial
    console.log(`⏳ Aguardando 1.8-2.5s para lazy loading...`);
    await waitHuman(1800, 2500);

    // 7. PROCESSAR POSTS DO MURAL (mesmo código do scrapeInstagramTag)
    console.log(`🖼️  Iniciando processamento dos posts do Explorar...`);

    const processedUsernames = new Set<string>();
    const processedPostLinks = new Set<string>();
    let attemptsWithoutNewPost = 0;
    let consecutiveDuplicates = 0;
    let totalFeedClicks = 0;

    // 💾 SCROLL POSITION
    let lastSavedScrollPosition = 0;

    // FUNÇÃO HELPER: clickPostElement (copiada de scrapeInstagramTag)
    const clickPostElement = async (
      anchorHandle: ElementHandle<Element>,
      url: string
    ): Promise<boolean> => {
      try {
        console.log(`   🖱️  Preparando clique...`);

        const box = await anchorHandle.boundingBox();
        if (!box) {
          throw new Error('Elemento não tem boundingBox');
        }

        await anchorHandle.evaluate((element) => {
          element.scrollIntoView({ behavior: 'auto', block: 'center' });
        });
        await waitHuman(250, 400);

        const boxAfterScroll = await anchorHandle.boundingBox();
        if (!boxAfterScroll) {
          throw new Error('Elemento não visível após scroll');
        }

        const x = boxAfterScroll.x + boxAfterScroll.width / 2;
        const y = boxAfterScroll.y + boxAfterScroll.height / 2;

        await moveMouseHuman(page, x, y);
        await waitHuman(300, 500);

        totalFeedClicks++;
        console.log(`   📊 Total clicks no mural: ${totalFeedClicks}`);

        await page.mouse.click(x, y, { delay: 100 });
        await waitHuman(2000, 3000);

        const currentUrl = page.url();
        const isPostPage = currentUrl.includes('/p/') || currentUrl.includes('/reel/');

        if (!isPostPage) {
          console.log(`   ❌ Post NÃO abriu! URL: ${currentUrl}`);
          return false;
        }

        console.log(`   ✅ Post abriu: ${currentUrl}`);
        await waitHuman(5000, 8000);
        return true;

      } catch (clickError: any) {
        console.log(`   ⚠️  Clique falhou: ${clickError.message}`);
        await waitHuman(3000, 5000);
        return false;
      }
    };

    // LOOP PRINCIPAL: SCRAPAR ATÉ maxProfiles
    while (allFoundProfiles.length < maxProfiles && attemptsWithoutNewPost < 8 && consecutiveDuplicates < 8 && totalFeedClicks < 50) {
      console.log(`\n📊 Status (Explorar): ${allFoundProfiles.length}/${maxProfiles} perfis, tentativa ${attemptsWithoutNewPost}/8, clicks: ${totalFeedClicks}/50`);

      // Salvar scroll position
      lastSavedScrollPosition = await page.evaluate(() => {
        return document.documentElement.scrollTop || document.body.scrollTop;
      });

      const anchorHandles = await page.$$(postSelector);
      console.log(`   🔍 Encontrados ${anchorHandles.length} posts no mural`);

      if (anchorHandles.length === 0) {
        // 🚨 FIX: Verificar chrome-error ANTES de tentar scroll
        const currentPageUrl = page.url();
        if (currentPageUrl.includes('chrome-error://') || currentPageUrl.includes('chromewebdata')) {
          console.log(`\n🚨 ========================================`);
          console.log(`🚨 ERRO 429 DETECTADO VIA CHROME-ERROR!`);
          console.log(`🚨 URL: ${currentPageUrl}`);
          console.log(`🚨 Instagram bloqueou a navegação`);
          console.log(`🚨 ========================================\n`);
          throw new RateLimitError('Página chrome-error detectada no loop de explore');
        }

        attemptsWithoutNewPost++;
        console.log(`   ⚠️  Nenhum post encontrado. Tentando scroll...`);
        await scrollHuman(page, 600 + Math.random() * 400);
        await waitHuman(2000, 3000);
        continue;
      }

      // Pegar posts com posição
      const postsWithPosition: Array<{
        handle: ElementHandle<Element>;
        href: string;
        y: number;
      }> = [];

      for (const handle of anchorHandles) {
        const href = await handle.evaluate((node: Element) => (node as HTMLAnchorElement).href || '');
        if (!href) {
          await handle.dispose();
          continue;
        }

        const box = await handle.boundingBox();
        if (!box || box.y < -200) {
          await handle.dispose();
          continue;
        }

        postsWithPosition.push({ handle, href, y: box.y });
      }

      // Ordenar de cima para baixo
      postsWithPosition.sort((a, b) => a.y - b.y);

      // Selecionar próximo post não-processado
      let selectedHandle: ElementHandle<Element> | null = null;
      let selectedUrl: string | null = null;

      for (const post of postsWithPosition) {
        if (processedPostLinks.has(post.href)) {
          await post.handle.dispose();
          continue;
        }

        selectedHandle = post.handle;
        selectedUrl = post.href;
        console.log(`   ✅ Próximo post: ${post.href}`);
        break;
      }

      // Dispose remaining handles
      for (const post of postsWithPosition) {
        if (post.handle !== selectedHandle) {
          await post.handle.dispose();
        }
      }

      if (!selectedHandle || !selectedUrl) {
        attemptsWithoutNewPost++;
        console.log(`   🔄 Nenhum novo post (tentativa ${attemptsWithoutNewPost}/8)`);

        if (consecutiveDuplicates >= 2 || totalFeedClicks >= 8) {
          console.log(`   📜 Fazendo scroll...`);
          await scrollHuman(page, 600 + Math.random() * 400);
          await waitHuman(2000, 3000);
        }
        continue;
      }

      // Abrir post
      const opened = await clickPostElement(selectedHandle, selectedUrl);
      await selectedHandle.dispose();

      if (!opened) {
        processedPostLinks.add(selectedUrl);
        attemptsWithoutNewPost++;
        continue;
      }

      attemptsWithoutNewPost = 0;
      processedPostLinks.add(selectedUrl);

      // EXTRAIR USERNAME DO POST
      try {
        await waitHuman(1500, 2500);

        const ownerUsername = await page.evaluate(() => {
          // Estratégia 1: header do post
          const headerLink = document.querySelector('header a[href^="/"][role="link"]') as HTMLAnchorElement;
          if (headerLink) {
            const href = headerLink.getAttribute('href') || '';
            const match = href.match(/^\/([^\/]+)\/?$/);
            if (match) return match[1];
          }

          // Estratégia 2: link com username
          const usernameLinks = document.querySelectorAll('a[href^="/"]');
          for (const link of usernameLinks) {
            const href = link.getAttribute('href') || '';
            if (href.match(/^\/[a-zA-Z0-9._]+\/?$/) && !href.includes('/p/') && !href.includes('/explore')) {
              return href.replace(/\//g, '');
            }
          }

          // Estratégia 3: JSON no HTML
          const html = document.body.innerHTML;
          const ownerMatch = html.match(/"owner":\s*\{[^}]*"username":\s*"([^"]+)"/);
          if (ownerMatch) return ownerMatch[1];

          return null;
        });

        if (!ownerUsername) {
          console.log(`   ❌ Não conseguiu extrair username do post`);
          // Voltar para o Explorar
          await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await waitHuman(2000, 3000);
          continue;
        }

        console.log(`   👤 Username do post: @${ownerUsername}`);

        // Filtrar perfis do próprio Instagram
        const instagramOfficialAccounts = ['reels', 'instagram', 'explore', 'shop', 'creators', 'music'];
        if (instagramOfficialAccounts.includes(ownerUsername.toLowerCase())) {
          console.log(`   ⏭️  Perfil oficial do Instagram - IGNORADO: @${ownerUsername}`);
          await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await waitHuman(2000, 3000);
          continue;
        }

        // Verificar duplicata
        if (processedUsernames.has(ownerUsername)) {
          console.log(`   ⏭️  Username já processado: @${ownerUsername}`);
          consecutiveDuplicates++;
          // Voltar para o Explorar
          await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await waitHuman(2000, 3000);
          continue;
        }

        processedUsernames.add(ownerUsername);
        consecutiveDuplicates = 0;

        // NAVEGAR PARA O PERFIL
        const profileUrl = `https://www.instagram.com/${ownerUsername}/`;
        console.log(`   🔗 Navegando para perfil: ${profileUrl}`);

        await navigateWithRateLimitDetection(page, profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await waitHuman(3000, 5000);

        // EXTRAIR DADOS DO PERFIL (skipNavigation=true porque já navegamos acima)
        const profileData = await scrapeProfileWithExistingPage(page, ownerUsername, true);

        // Filtrar websites inválidos (da conta logada) ANTES de validar contato
        const invalidWebsitesEarly = ['gourmetsousvide.com.br', 'instagram.com'];
        if (profileData.website && invalidWebsitesEarly.some(inv => profileData.website?.toLowerCase().includes(inv))) {
          console.log(`   ⚠️  Website da conta logada detectado - ignorando: ${profileData.website}`);
          profileData.website = null;
        }

        // VALIDAÇÃO: Tem bio ou contato?
        const hasBio = profileData.bio && profileData.bio.trim().length > 10;
        const hasContact = profileData.phone || profileData.email || profileData.website;

        if (!hasBio && !hasContact) {
          console.log(`   ❌ Perfil sem bio/contato - DESCARTADO`);
          // Voltar para o Explorar
          await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await waitHuman(2000, 3000);
          continue;
        }

        // ========================================
        // VALIDAÇÃO 1: IDIOMA PORTUGUÊS (OBRIGATÓRIA)
        // ========================================
        console.log(`   🌍 Validando idioma...`);
        const languageDetection = await detectLanguage(profileData.bio || '', ownerUsername);
        console.log(`   🎯 Idioma detectado: ${languageDetection.language} (${languageDetection.confidence})`);

        if (languageDetection.language !== 'pt') {
          console.log(`   ❌ Perfil REJEITADO - idioma não-português: ${languageDetection.language}`);
          await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await waitHuman(2000, 3000);
          continue;
        }

        console.log(`   ✅ Idioma: Português (${languageDetection.confidence})`);

        // ========================================
        // VALIDAÇÃO 2: WEBSITE OU BIO >= 100 → APROVAÇÃO AUTOMÁTICA
        // ========================================
        const bioLength = profileData.bio?.length || 0;

        // Filtrar websites inválidos (da conta logada ou genéricos)
        const invalidWebsites = [
          'gourmetsousvide.com.br',
          'instagram.com',
          'linktr.ee/gourmetsousvide'
        ];
        const websiteIsValid = profileData.website &&
          !invalidWebsites.some(invalid => profileData.website?.toLowerCase().includes(invalid));

        if (profileData.website && !websiteIsValid) {
          console.log(`   ⚠️  Website inválido (conta logada): ${profileData.website}`);
          profileData.website = null; // Limpar website inválido
        }

        const hasWebsite = !!profileData.website && websiteIsValid;
        const autoApprove = hasWebsite || bioLength >= 100;

        // ========================================
        // VALIDAÇÃO 3: ACTIVITY SCORE (se não aprovado automaticamente)
        // ========================================
        const activityScore = calculateActivityScore(profileData);
        profileData.activity_score = activityScore.score;
        profileData.is_active = activityScore.isActive;

        console.log(`   📊 Activity Score: ${activityScore.score}/100 (${activityScore.isActive ? 'ATIVA ✅' : 'INATIVA ❌'})`);

        if (autoApprove) {
          const reasons = [];
          if (hasWebsite) reasons.push('tem website');
          if (bioLength >= 100) reasons.push(`bio >= 100 (${bioLength} chars)`);
          console.log(`   ✅ APROVAÇÃO AUTOMÁTICA: ${reasons.join(' e ')}`);
        } else if (!activityScore.isActive) {
          console.log(`   ❌ Perfil REJEITADO por baixo activity score - não será contabilizado`);
          await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await waitHuman(2000, 3000);
          continue;
        }

        console.log(`   ✅ Perfil VÁLIDO: @${ownerUsername}`);
        console.log(`      Bio: ${hasBio ? 'SIM' : 'NÃO'} (${bioLength} chars)`);
        console.log(`      Website: ${hasWebsite ? profileData.website : 'NÃO'}`);
        console.log(`      Contato: ${hasContact ? 'SIM' : 'NÃO'}`);

        // ========================================
        // EXTRAIR HASHTAGS DOS 2 ÚLTIMOS POSTS
        // ========================================
        console.log(`   🏷️  Extraindo hashtags dos últimos 2 posts...`);
        let postHashtags: string[] = [];
        try {
          const { extractHashtagsFromPosts } = await import('../services/instagram-profile.utils');

          // Já estamos na página do perfil, extrair hashtags
          postHashtags = await extractHashtagsFromPosts(page, 2);

          if (postHashtags && postHashtags.length > 0) {
            console.log(`   ✅ ${postHashtags.length} hashtags extraídas: ${postHashtags.slice(0, 5).join(', ')}${postHashtags.length > 5 ? '...' : ''}`);
          } else {
            console.log(`   ⚠️  Nenhuma hashtag encontrada nos posts`);
          }
        } catch (hashtagError: any) {
          console.log(`   ⚠️  Erro ao extrair hashtags: ${hashtagError.message}`);
        }

        // PERSISTIR NO BANCO
        console.log(`   💾 Salvando no banco de dados...`);
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(
            process.env.SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || ''
          );

          // Verificar se já existe - buscar hashtags_posts para merge
          const { data: existing } = await supabase
            .from('instagram_leads')
            .select('id, hashtags_posts')
            .eq('username', ownerUsername)
            .single();

          // 📱 EXTRAIR WHATSAPP: website wa.me e bio
          const waExtraction = extractWhatsAppForPersistence(
            profileData.website,
            profileData.bio,
            profileData.phone
          );

          // 📱 EXTRAIR WHATSAPP de wa.me/message (requer navegação)
          if (!waExtraction.whatsapp_number && isWaMessageLink(profileData.website)) {
            console.log(`   📱 [WA-MESSAGE] Detectado link wa.me/message, extraindo via navegação...`);
            const messageNumber = await extractWhatsAppFromMessageLink(page, profileData.website);
            if (messageNumber && isValidBrazilNumber(messageNumber)) {
              waExtraction.whatsapp_number = messageNumber;
              waExtraction.whatsapp_source = 'website_wa_me';
              waExtraction.whatsapp_verified.push({
                number: messageNumber,
                source: 'website_wa_me',
                extracted_at: new Date().toISOString()
              });
              console.log(`   ✅ [WA-MESSAGE] Número extraído: ${messageNumber}`);
            }
          }

          if (existing) {
            // 🔄 UPDATE com merge de hashtags
            const existingHashtags = existing.hashtags_posts || [];
            const newHashtags = postHashtags || [];
            const mergedHashtags = [...new Set([...existingHashtags, ...newHashtags])];
            console.log(`   🔄 @${ownerUsername} já existe - atualizando perfil (${existingHashtags.length} + ${newHashtags.length} = ${mergedHashtags.length} hashtags)`);

            // Calcular lead_score (activity_score 0-100 → lead_score 0-1)
            const leadScore = profileData.activity_score ? profileData.activity_score / 100 : null;

            await supabase
              .from('instagram_leads')
              .update({
                full_name: profileData.full_name,
                bio: profileData.bio,
                website: profileData.website,
                email: profileData.email,
                phone: profileData.phone,
                followers_count: profileData.followers_count,
                following_count: profileData.following_count,
                posts_count: profileData.posts_count,
                profile_pic_url: profileData.profile_pic_url,
                is_verified: profileData.is_verified,
                is_business_account: profileData.is_business_account,
                business_category: profileData.business_category,
                city: profileData.city,
                state: profileData.state,
                neighborhood: profileData.neighborhood,
                address: profileData.address,
                zip_code: profileData.zip_code,
                activity_score: profileData.activity_score,
                is_active: profileData.is_active,
                language: languageDetection.language,  // ADICIONADO - estava faltando!
                lead_score: leadScore,
                hashtags_bio: profileData.hashtags_bio || null,
                hashtags_posts: mergedHashtags.length > 0 ? mergedHashtags : null,
                updated_at: new Date().toISOString(), // SCRAPING = única operação que atualiza updated_at
                // RESETAR flags de enriquecimento para reprocessar COMPLETO
                url_enriched: false,
                dado_enriquecido: false,
                hashtags_extracted: false,
                hashtags_ready_for_embedding: false,
                // 📱 WhatsApp extraído no scrape
                ...(waExtraction.whatsapp_number && {
                  whatsapp_number: waExtraction.whatsapp_number,
                  whatsapp_source: waExtraction.whatsapp_source,
                  whatsapp_verified: waExtraction.whatsapp_verified
                })
                // NÃO ATUALIZA: search_term_used, captured_at, contact_status, etc.
              })
              .eq('id', existing.id);
            // 🗑️ Deletar embedding antigo para reprocessar
            await supabase.from('lead_embeddings').delete().eq('lead_id', existing.id);
            console.log(`   ✅ @${ownerUsername} ATUALIZADO`);
          } else {
            // 🔧 FIX: Usar UPSERT para evitar race condition (duplicate key)
            // Calcular lead_score para INSERT
            const insertLeadScore = profileData.activity_score ? profileData.activity_score / 100 : null;

            const { error: upsertError } = await supabase
              .from('instagram_leads')
              .upsert({
                username: ownerUsername,
                full_name: profileData.full_name,
                bio: profileData.bio,
                website: profileData.website,
                followers_count: profileData.followers_count,
                following_count: profileData.following_count,
                posts_count: profileData.posts_count,
                profile_pic_url: profileData.profile_pic_url,
                is_verified: profileData.is_verified,
                is_business_account: profileData.is_business_account,
                email: profileData.email,
                phone: profileData.phone,
                business_category: profileData.business_category,
                city: profileData.city,
                state: profileData.state,
                neighborhood: profileData.neighborhood,
                address: profileData.address,
                zip_code: profileData.zip_code,
                activity_score: profileData.activity_score,
                is_active: profileData.is_active,
                language: languageDetection.language,
                lead_score: insertLeadScore,
                hashtags_bio: profileData.hashtags_bio || null,
                hashtags_posts: postHashtags && postHashtags.length > 0 ? postHashtags : null,
                search_term_used: SEARCH_TERM_MARKER,
                lead_source: 'explore',
                captured_at: new Date().toISOString(),
                // Flags de enriquecimento - novo lead precisa ser processado
                dado_enriquecido: false,
                url_enriched: false,
                hashtags_extracted: false,
                hashtags_ready_for_embedding: false,
                // 📱 WhatsApp extraído no scrape
                ...(waExtraction.whatsapp_number && {
                  whatsapp_number: waExtraction.whatsapp_number,
                  whatsapp_source: waExtraction.whatsapp_source,
                  whatsapp_verified: waExtraction.whatsapp_verified
                })
              }, {
                onConflict: 'username',
                ignoreDuplicates: false  // false = atualizar em caso de conflito
              });

            if (upsertError) {
              console.log(`   ❌ Erro ao salvar: ${upsertError.message}`);
            } else {
              console.log(`   ✅ @${ownerUsername} salvo no banco (upsert) com search_term_used='${SEARCH_TERM_MARKER}'`);
            }
          }
        } catch (dbError: any) {
          console.log(`   ❌ Erro no banco: ${dbError.message}`);
        }

        // Adicionar ao resultado com marcador de origem
        allFoundProfiles.push({
          ...profileData,
          hashtags_posts: postHashtags,
          search_term_used: SEARCH_TERM_MARKER,
          source: 'explore',
          collected_at: new Date().toISOString()
        });

        console.log(`   📊 Total coletados: ${allFoundProfiles.length}/${maxProfiles}`);

        // Voltar para o Explorar
        await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await waitHuman(2000, 3000);

        // Restaurar scroll
        if (lastSavedScrollPosition > 0) {
          await page.evaluate((scrollY) => {
            window.scrollTo(0, scrollY);
          }, lastSavedScrollPosition);
          await waitHuman(500, 800);
        }

      } catch (profileError: any) {
        console.log(`   ❌ Erro ao processar perfil: ${profileError.message}`);
        // Tentar voltar para o Explorar
        await page.goto(exploreUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await waitHuman(2000, 3000);
      }
    }

    // RESULTADO FINAL
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ SCRAPE-EXPLORE FINALIZADO`);
    console.log(`   📊 Perfis válidos coletados: ${allFoundProfiles.length}/${maxProfiles}`);
    console.log(`   🖱️  Total clicks no mural: ${totalFeedClicks}`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      profiles: allFoundProfiles,
      is_partial: allFoundProfiles.length < maxProfiles,
      requested: maxProfiles,
      collected: allFoundProfiles.length,
      completion_rate: `${((allFoundProfiles.length / maxProfiles) * 100).toFixed(1)}%`
    };

  } catch (error: any) {
    console.log(`\n❌ ERRO NO SCRAPE-EXPLORE: ${error.message}`);

    // Retornar perfis coletados mesmo com erro
    return {
      profiles: allFoundProfiles,
      is_partial: true,
      requested: maxProfiles,
      collected: allFoundProfiles.length,
      completion_rate: `${((allFoundProfiles.length / maxProfiles) * 100).toFixed(1)}%`
    };

  } finally {
    console.log(`🔓 Request ${requestId} finalizada (scrape-explore)`);
    await cleanup();
    console.log(`🏁 SCRAPE-EXPLORE ENCERRADO - Request ${requestId}`);
  }
}
