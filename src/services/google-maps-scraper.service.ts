// @ts-nocheck - Código usa window/document dentro de page.evaluate() (contexto browser)
/**
 * Google Maps Scraper Service
 *
 * Scrapes business data from Google Maps and extracts Instagram from websites.
 * ONLY persists leads that have Instagram username.
 *
 * Flow:
 * 1. Search Google Maps by theme + city
 * 2. Extract: name, address, phone, website
 * 3. Visit website → extract Instagram
 * 4. Only persist if Instagram found
 *
 * @author AIC Team
 * @version 2.0.0
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

// OpenAI client para Layer 3 (extração inteligente de Instagram)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Diretório para persistir sessão do browser (inclui login Instagram)
const GOOGLE_MAPS_USER_DATA_DIR = path.join(process.cwd(), 'cookies', 'google-maps', 'user-data');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://qsdfyffuonywmtnlycri.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// PID do processo Chrome para kill específico (não é mais singleton)
let browserPid: number | null = null;

// Chrome for Testing path
const CHROME_EXECUTABLE_PATH = '/Users/marseau/.cache/puppeteer/chrome/mac_arm-139.0.7258.68/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

// Types
export interface GoogleLead {
  place_id?: string;
  name: string;
  full_address?: string;      // Endereço completo do Google Maps
  city?: string;
  state?: string;
  phone_whatsapp?: string;    // Só se for celular brasileiro (WhatsApp)
  website?: string;
  instagram_username: string; // Required - only persist if we have this
  rating?: number;
  reviews_count?: number;
  search_query?: string;
  search_theme?: string;
  search_city?: string;
}

export interface ScrapeOptions {
  termo: string;           // Ex: "Empresa", "Restaurante", "Salão de beleza"
  cidade: string;          // Ex: "São Paulo" (usado como fallback se não tiver localização)
  estado?: string;         // Ex: "SP"
  localizacao?: string;    // Ex: "Av Faria Lima" - busca será: "Av Faria Lima, Empresa"
  bairro?: string;         // Ex: "Pinheiros" - para referência no log
  max_resultados?: number; // Ex: 50
  saveToDb?: boolean;
  // Coordenadas (alternativo a localizacao) - usa URL: /maps/search/{termo}/@{lat},{lng},{zoom}z
  lat?: number;            // Latitude (ex: -23.5631)
  lng?: number;            // Longitude (ex: -46.6544)
  zoom?: number;           // Zoom (default: 17 = ~700m diâmetro)
  gridPointId?: number;    // ID do ponto no grid (para tracking)
}

export type GoogleMapsScraperConfig = ScrapeOptions;

export interface ScrapeResult {
  success: boolean;
  leads: GoogleLead[];
  total_scraped: number;
  with_website: number;
  with_instagram: number;
  saved: number;
  duplicates: number;
  errors: string[];
}

/**
 * Create new browser instance (não é singleton - cria novo a cada scrape)
 * Sessão persistida via userDataDir
 */
async function createBrowser(): Promise<Browser> {
  console.log('🚀 [GOOGLE-MAPS] Iniciando Chrome for Testing...');

  const executablePath = fs.existsSync(CHROME_EXECUTABLE_PATH)
    ? CHROME_EXECUTABLE_PATH
    : undefined;

  if (executablePath) {
    console.log('   ✅ Usando Chrome for Testing');
  } else {
    console.log('   ⚠️ Chrome for Testing não encontrado, usando Chromium padrão');
  }

  // Criar diretório se não existir
  if (!fs.existsSync(GOOGLE_MAPS_USER_DATA_DIR)) {
    fs.mkdirSync(GOOGLE_MAPS_USER_DATA_DIR, { recursive: true });
    console.log(`   📁 Criado diretório: ${GOOGLE_MAPS_USER_DATA_DIR}`);
  }

  const browser = await puppeteer.launch({
    headless: false, // Visível para debug
    executablePath,
    userDataDir: GOOGLE_MAPS_USER_DATA_DIR, // Persistir sessão (inclui login Instagram)
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-infobars',
      '--disable-notifications',
      '--disable-extensions',
      '--window-size=1920,1080',
      '--lang=pt-BR',
      '--disable-blink-features=AutomationControlled',
      // Desabilitar bloqueios de conteúdo (ERR_BLOCKED_BY_CLIENT)
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process,BlockInsecurePrivateNetworkRequests,SafeBrowsingEnhancedProtection',
      '--allow-running-insecure-content',
      '--disable-client-side-phishing-detection',
      '--safebrowsing-disable-download-protection',
      '--no-default-browser-check',
      // Mais flags para evitar bloqueios
      '--ignore-certificate-errors',
      '--ignore-ssl-errors',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--disable-features=TranslateUI',
      '--metrics-recording-only',
      '--no-first-run',
      '--password-store=basic',
      '--use-mock-keychain',
      // === FLAGS ANTI-CRASH ===
      '--disable-renderer-backgrounding',           // Evita suspensão do renderer
      '--disable-backgrounding-occluded-windows',   // Evita pausar janelas ocultas
      '--disable-hang-monitor',                     // Desativa monitor de travamento
      '--disable-ipc-flooding-protection',          // Evita limite de IPC
      '--disable-popup-blocking',                   // Evita bloqueio de popups
      '--disable-prompt-on-repost',                 // Evita prompt de reenvio
      '--enable-features=NetworkService,NetworkServiceInProcess',  // Mantém network no processo
      '--force-color-profile=srgb',                 // Perfil de cor simples
      '--js-flags=--max-old-space-size=512',        // Limita memória JS a 512MB
    ],
    defaultViewport: { width: 1920, height: 1080 },
    ignoreDefaultArgs: ['--enable-automation'],
    timeout: 60000, // Timeout de 60s para lançar browser
  });

  // Capturar PID do processo Chrome para kill específico
  const proc = browser.process();
  browserPid = proc?.pid || null;
  if (browserPid) {
    console.log(`   📌 Browser PID: ${browserPid}`);
  }

  return browser;
}

/**
 * Close browser instance (helper para uso externo se necessário)
 */
export async function closeBrowser(browser: Browser | null): Promise<void> {
  if (browser) {
    try {
      await browser.close();
      console.log('🧹 [GOOGLE-MAPS] Browser fechado');
    } catch (e) {
      console.log('🧹 [GOOGLE-MAPS] Browser já estava fechado');
    }
  }
}

/**
 * Kill specific Chrome process by PID (for crash recovery)
 * Only kills OUR browser instance, not other concurrent Puppeteer processes
 */
async function killBrowserProcess(): Promise<void> {
  return new Promise((resolve) => {
    if (!browserPid) {
      console.log('   ℹ️  Nenhum PID de browser registrado');
      resolve();
      return;
    }

    console.log(`💀 [GOOGLE-MAPS] Matando processo Chrome PID ${browserPid}...`);

    // Kill apenas o processo específico e seus filhos
    exec(`kill -9 ${browserPid} 2>/dev/null; pkill -9 -P ${browserPid} 2>/dev/null`, (error) => {
      if (error) {
        console.log(`   ℹ️  Processo ${browserPid} já encerrado ou não encontrado`);
      } else {
        console.log(`   ✅ Processo ${browserPid} terminado`);
      }

      browserPid = null;

      // Aguardar um pouco para o sistema liberar recursos
      setTimeout(() => {
        resolve();
      }, 1000);
    });
  });
}

/**
 * Force close browser with timeout and process kill
 * Handles cases where browser.close() hangs due to crash
 */
async function forceCloseBrowser(browser: Browser | null): Promise<void> {
  if (!browser) return;

  // Tentar fechar normalmente com timeout de 3 segundos
  const closePromise = new Promise<void>(async (resolve) => {
    try {
      await browser.close();
      resolve();
    } catch (e) {
      resolve(); // Ignorar erros
    }
  });

  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.log('   ⏱️  Timeout ao fechar browser, forçando kill...');
      resolve();
    }, 3000);
  });

  await Promise.race([closePromise, timeoutPromise]);

  // Matar apenas o processo específico deste browser
  await killBrowserProcess();
}

// ============================================
// LOGGING ESTRUTURADO
// ============================================

interface ScrapeLog {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  action: string;
  details?: any;
}

const scrapeLogs: ScrapeLog[] = [];

function log(level: ScrapeLog['level'], action: string, details?: any): void {
  const entry: ScrapeLog = {
    timestamp: new Date().toISOString(),
    level,
    action,
    details
  };
  scrapeLogs.push(entry);

  const emoji = {
    INFO: 'ℹ️',
    WARN: '⚠️',
    ERROR: '❌',
    SUCCESS: '✅'
  }[level];

  console.log(`${emoji} [${entry.timestamp.split('T')[1].split('.')[0]}] ${action}`, details ? JSON.stringify(details) : '');
}

export function getScrapeLogs(): ScrapeLog[] {
  return [...scrapeLogs];
}

export function clearScrapeLogs(): void {
  scrapeLogs.length = 0;
}

// ============================================
// DETECÇÃO DE PROBLEMAS
// ============================================

interface DetectionResult {
  ok: boolean;
  issue?: 'BAN' | 'CAPTCHA' | 'PAGE_ERROR' | 'BROWSER_HUNG' | 'RATE_LIMIT' | 'NO_RESULTS';
  message?: string;
}

/**
 * Detecta ban, captcha, ou página de erro do Google
 */
async function detectGoogleIssues(page: Page): Promise<DetectionResult> {
  try {
    const pageContent = await page.content();
    const pageUrl = page.url();

    // Detectar CAPTCHA
    if (
      pageContent.includes('recaptcha') ||
      pageContent.includes('g-recaptcha') ||
      pageContent.includes('captcha-form') ||
      pageContent.includes('unusual traffic')
    ) {
      log('ERROR', 'CAPTCHA detectado', { url: pageUrl });
      return { ok: false, issue: 'CAPTCHA', message: 'Google solicitou verificação CAPTCHA' };
    }

    // Detectar ban/bloqueio
    if (
      pageContent.includes('blocked') ||
      pageContent.includes('sorry/index') ||
      pageContent.includes('ipv4.google.com/sorry') ||
      pageContent.includes('Our systems have detected unusual traffic')
    ) {
      log('ERROR', 'BAN detectado', { url: pageUrl });
      return { ok: false, issue: 'BAN', message: 'IP bloqueado pelo Google' };
    }

    // Detectar rate limit (mais específico para evitar falsos positivos)
    if (
      pageContent.includes('Too Many Requests') ||
      pageContent.includes('rate limit exceeded') ||
      pageContent.includes('HTTP 429') ||
      pageContent.includes('Error 429')
    ) {
      log('ERROR', 'Rate limit detectado', { url: pageUrl });
      return { ok: false, issue: 'RATE_LIMIT', message: 'Limite de requisições atingido' };
    }

    // Detectar página de erro (mais específico)
    if (
      pageContent.includes('Error 404') ||
      pageContent.includes('HTTP 404') ||
      pageContent.includes('Page not found') ||
      pageContent.includes('This page isn\'t available') ||
      pageContent.includes('página não está disponível')
    ) {
      log('ERROR', 'Página não encontrada', { url: pageUrl });
      return { ok: false, issue: 'PAGE_ERROR', message: 'Página não disponível' };
    }

    // Detectar sem resultados
    if (
      pageContent.includes('Nenhum resultado encontrado') ||
      pageContent.includes('No results found') ||
      pageContent.includes('didn\'t match any')
    ) {
      log('WARN', 'Nenhum resultado encontrado', { url: pageUrl });
      return { ok: false, issue: 'NO_RESULTS', message: 'Busca não retornou resultados' };
    }

    return { ok: true };

  } catch (error: any) {
    log('ERROR', 'Erro ao verificar página', { error: error.message });
    return { ok: false, issue: 'PAGE_ERROR', message: error.message };
  }
}

/**
 * Verifica se o browser está responsivo
 */
async function checkBrowserHealth(page: Page, timeoutMs: number = 10000): Promise<DetectionResult> {
  try {
    // Tenta executar um comando simples com timeout
    const startTime = Date.now();

    await Promise.race([
      page.evaluate(() => document.readyState),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Browser timeout')), timeoutMs)
      )
    ]);

    const elapsed = Date.now() - startTime;

    if (elapsed > 5000) {
      log('WARN', 'Browser lento', { responseTime: `${elapsed}ms` });
    }

    return { ok: true };

  } catch (error: any) {
    log('ERROR', 'Browser travado/não responsivo', { error: error.message });
    return { ok: false, issue: 'BROWSER_HUNG', message: 'Browser não está respondendo' };
  }
}

/**
 * Verifica saúde geral antes de continuar scraping
 */
async function healthCheck(page: Page): Promise<DetectionResult> {
  // Primeiro verifica se browser está responsivo
  const browserHealth = await checkBrowserHealth(page);
  if (!browserHealth.ok) return browserHealth;

  // Depois verifica problemas do Google
  const googleIssues = await detectGoogleIssues(page);
  if (!googleIssues.ok) return googleIssues;

  return { ok: true };
}

// ============================================
// HUMANIZAÇÃO
// ============================================

/**
 * Delay randomizado humanizado
 */
function humanDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  console.log(`   ⏳ Aguardando ${(delay/1000).toFixed(1)}s...`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Movimento de mouse humanizado para um elemento
 */
async function humanMouseMove(page: Page, element: any): Promise<void> {
  const box = await element.boundingBox();
  if (!box) return;

  // Posição aleatória dentro do elemento
  const x = box.x + box.width * (0.3 + Math.random() * 0.4);
  const y = box.y + box.height * (0.3 + Math.random() * 0.4);

  // Move o mouse com passos
  await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });

  // Pequena pausa antes do clique
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
}

/**
 * Clique humanizado com movimento de mouse
 */
async function humanClick(page: Page, element: any): Promise<void> {
  await humanMouseMove(page, element);
  await element.click();
}

/**
 * Scroll humanizado (não uniforme) com movimento de mouse
 */
async function humanScroll(page: Page, selector: string): Promise<void> {
  // Movimento de mouse aleatório antes do scroll (simula humano)
  const viewport = page.viewport();
  if (viewport) {
    const randomX = Math.floor(Math.random() * viewport.width * 0.6) + viewport.width * 0.2;
    const randomY = Math.floor(Math.random() * viewport.height * 0.6) + viewport.height * 0.2;
    await page.mouse.move(randomX, randomY, { steps: Math.floor(Math.random() * 10) + 5 });
    await humanDelay(100, 300);
  }

  // Scroll com variação (reduzido para evitar stress)
  await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (element) {
      // Scroll menor e mais lento (20-40% da altura visível)
      const scrollAmount = element.clientHeight * (0.2 + Math.random() * 0.2);
      element.scrollBy({
        top: scrollAmount,
        behavior: 'smooth'
      });
    }
  }, selector);

  // Pausa maior após scroll para carregar conteúdo
  await humanDelay(2000, 4000);
}

/**
 * Verifica se lead já existe no banco (por nome + cidade)
 */
async function checkDuplicateByName(name: string, city: string): Promise<boolean> {
  const { data } = await supabase
    .from('google_leads')
    .select('id')
    .ilike('name', name)
    .ilike('city', city)
    .limit(1);

  return (data && data.length > 0);
}

/**
 * Validate and format phone as WhatsApp (Brazilian mobile only)
 * Brazilian mobile: starts with 9 after DDD, total 11 digits (DDD + 9 + 8 digits)
 * Examples: (11) 99999-9999, 11999999999, +55 11 99999-9999
 */
function extractWhatsAppNumber(phone: string): string | null {
  if (!phone) return null;

  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');

  // Remove country code if present (55)
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.substring(2);
  }

  // Must be 11 digits: DDD (2) + 9 (1) + number (8)
  if (digits.length !== 11) {
    return null;
  }

  // Must start with valid DDD (11-99) and mobile prefix (9)
  const ddd = digits.substring(0, 2);
  const mobilePrefix = digits.charAt(2);

  // Valid DDDs are 11-99 (excluding some invalid ones)
  const dddNum = parseInt(ddd);
  if (dddNum < 11 || dddNum > 99) {
    return null;
  }

  // Mobile numbers in Brazil start with 9
  if (mobilePrefix !== '9') {
    return null;
  }

  // Format as WhatsApp number with country code: 5511999999999
  return `55${digits}`;
}

/**
 * Extract Instagram username from URL or text
 */
function extractInstagramUsername(text: string): string | null {
  if (!text) return null;

  // Patterns to match Instagram
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]{1,30})\/?/i,
    /(?:https?:\/\/)?(?:www\.)?instagr\.am\/([a-zA-Z0-9._]{1,30})\/?/i,
    /@([a-zA-Z0-9._]{1,30})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const username = match[1].toLowerCase().replace(/[^a-z0-9._]/g, '');

      // Filter out common false positives (Instagram pages + CSS keywords)
      const blacklist = [
        // Instagram pages
        'p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'about', 'help', 'privacy', 'terms', 'api', 'press', 'jobs', 'blog', 'tv', 'direct', 'lite', 'shop', 'nametag',
        // CSS @ keywords (capturados por regex @username)
        'font', 'font-face', 'media', 'import', 'charset', 'keyframes', 'supports', 'page', 'namespace', 'document', 'viewport', 'counter', 'layer', 'property', 'container', 'scope', 'starting-style',
        // HTML/JS common terms
        'type', 'href', 'src', 'alt', 'title', 'class', 'style', 'script', 'link', 'meta', 'div', 'span', 'img', 'input', 'button', 'form', 'table', 'body', 'head', 'html',
        // Generic words
        'instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'linkedin', 'whatsapp', 'email', 'contact', 'home', 'login', 'signup', 'register', 'admin', 'user', 'null', 'undefined', 'none', 'auto',
        // Plataformas de criação de sites (falsos positivos - captura o Instagram da plataforma, não da empresa)
        'wix', 'wixsite', 'squarespace', 'wordpress', 'weebly', 'godaddy', 'hostinger', 'shopify', 'webflow', 'carrd', 'notion', 'canva', 'google', 'microsoft', 'apple', 'amazon'
      ];

      // Filter out email domains (when @ captures email instead of Instagram)
      const emailDomains = ['gmail', 'hotmail', 'outlook', 'yahoo', 'icloud', 'live', 'msn', 'aol', 'uol', 'bol', 'terra', 'globo', 'ig', 'oi', 'email', 'mail', 'protonmail', 'zoho'];

      // Filter out URL shortener domains (bit.ly -> @bitly é falso positivo)
      const urlShortenerDomains = ['bitly', 'bit', 'tinyurl', 'goo', 'ow', 'buff', 'shorturl', 'cutt', 'linktr', 'linktree', 'rb', 'is'];

      // Filter out numeric-only strings (phone numbers, IDs)
      const isNumericOnly = /^\d+$/.test(username);

      // Filter out strings that are mostly numbers (>80% digits = likely phone/ID)
      const digitCount = (username.match(/\d/g) || []).length;
      const isMostlyNumeric = username.length > 5 && (digitCount / username.length) > 0.8;

      // Filter out invalid Instagram username patterns
      const startsWithDot = username.startsWith('.');
      const endsWithDot = username.endsWith('.');
      const hasConsecutiveDots = username.includes('..');
      const onlyDotsAndNumbers = /^[.\d]+$/.test(username);
      const tooShortAlpha = username.replace(/[^a-z]/g, '').length < 2; // Precisa de pelo menos 2 letras

      if (username.length >= 3 && username.length <= 30 &&  // Mínimo 3 chars
          !blacklist.includes(username) &&
          !emailDomains.includes(username.replace('.com', '').replace('.br', '')) &&
          !urlShortenerDomains.includes(username) &&
          !isNumericOnly &&
          !isMostlyNumeric &&
          !startsWithDot &&
          !endsWithDot &&
          !hasConsecutiveDots &&
          !onlyDotsAndNumbers &&
          !tooShortAlpha) {
        return username;
      }
    }
  }

  return null;
}

/**
 * Verificar e fazer login no Instagram se necessário
 * Usa credenciais do INSTAGRAM_GOOGLE_INPUT (mesma conta do scrape-input-users)
 */
async function ensureInstagramLogin(page: Page): Promise<boolean> {
  try {
    // Navegar para Instagram para verificar login
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verificar se está logado
    const cookies = await page.cookies();
    const hasSessionId = cookies.some(c => c.name === 'sessionid' && c.value);
    const hasDsUserId = cookies.some(c => c.name === 'ds_user_id' && c.value);

    if (hasSessionId && hasDsUserId) {
      console.log(`   ✅ Instagram já logado`);
      return true;
    }

    // Fazer login automático
    console.log(`   🔐 Instagram não logado - iniciando login automático...`);

    const igUsername = process.env.INSTAGRAM_GOOGLE_INPUT_USERNAME || process.env.INSTAGRAM_REFRESH_USERNAME;
    const igPassword = process.env.INSTAGRAM_GOOGLE_INPUT_PASSWORD || process.env.INSTAGRAM_REFRESH_PASSWORD;

    if (!igUsername || !igPassword) {
      console.log(`   ❌ Credenciais Instagram não configuradas`);
      return false;
    }

    // Esperar campos de login
    await page.waitForSelector('input[name="username"]', { timeout: 10000 }).catch(() => null);

    const usernameInput = await page.$('input[name="username"]');
    const passwordInput = await page.$('input[name="password"]');

    if (!usernameInput || !passwordInput) {
      console.log(`   ⚠️ Campos de login não encontrados`);
      return false;
    }

    // Preencher credenciais
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.type(igUsername, { delay: 50 + Math.random() * 50 });
    await new Promise(resolve => setTimeout(resolve, 500));

    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(igPassword, { delay: 50 + Math.random() * 50 });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Clicar em login
    const loginButton = await page.$('button[type="submit"]');
    if (loginButton) {
      await loginButton.click();
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Verificar se login funcionou
    const newCookies = await page.cookies();
    const loggedIn = newCookies.some(c => c.name === 'sessionid' && c.value);

    if (loggedIn) {
      console.log(`   ✅ Login Instagram bem-sucedido`);
      return true;
    } else {
      console.log(`   ❌ Login Instagram falhou`);
      return false;
    }
  } catch (error: any) {
    console.log(`   ⚠️ Erro ao verificar/fazer login Instagram: ${error.message}`);
    return false;
  }
}

// Flag para controlar se já tentou login nesta sessão
let instagramLoginAttempted = false;

// ============================================
// EXTRAÇÃO DE INSTAGRAM - 3 CAMADAS
// ============================================

/**
 * Blacklist de domínios que não são sites próprios do negócio
 */
const BLACKLIST_DOMAINS = [
  // Delivery/Reservas
  'ifood.com', 'rappi.com', 'ubereats.com', 'aiqfome.com', 'deliverymuch.com', 'getninjas.com',
  // Redes sociais (não são site próprio)
  'facebook.com', 'twitter.com', 'tiktok.com', 'youtube.com', 'linkedin.com', 'pinterest.com',
  // WhatsApp
  'wa.me', 'api.whatsapp.com', 'whatsapp.com',
  // Big Tech (são a empresa, não site de negócio local)
  'google.com', 'google.com.br', 'apple.com', 'microsoft.com', 'amazon.com', 'amazon.com.br',
  // Outros
  'tripadvisor.com', 'yelp.com', 'foursquare.com', 'booking.com', 'airbnb.com'
];

/**
 * Domínios que redirecionam para Instagram (resolver na Layer 1)
 */
const INSTAGRAM_DIRECT_DOMAINS = ['instagram.com', 'instagr.am'];

/**
 * Domínios de agregadores de links (tratar na Layer 2 com fetch)
 */
const LINK_AGGREGATOR_DOMAINS = ['linktr.ee', 'linktree.com', 'bio.link', 'beacons.ai', 'tap.bio', 'linkr.bio', 'hoo.be', 'solo.to'];

/**
 * URL Shorteners (seguir redirect via fetch)
 */
const URL_SHORTENERS = ['bit.ly', 'bitly.com', 't.co', 'goo.gl', 'tinyurl.com', 'ow.ly', 'is.gd', 'buff.ly', 'shorturl.at', 'rb.gy', 'cutt.ly'];

/**
 * LAYER 1: Extração direta da URL (sem requisição HTTP)
 * - Instagram direto no campo website
 * - Detecta padrões conhecidos
 * Tempo: ~0ms
 */
function extractInstagramLayer1(websiteUrl: string): { username: string | null; skipOtherLayers: boolean; reason: string } {
  if (!websiteUrl) {
    return { username: null, skipOtherLayers: false, reason: 'URL vazia' };
  }

  const urlLower = websiteUrl.toLowerCase();

  // Verificar blacklist - não processar
  for (const domain of BLACKLIST_DOMAINS) {
    if (urlLower.includes(domain)) {
      return { username: null, skipOtherLayers: true, reason: `Blacklist: ${domain}` };
    }
  }

  // Instagram direto na URL
  for (const domain of INSTAGRAM_DIRECT_DOMAINS) {
    if (urlLower.includes(domain)) {
      const username = extractInstagramUsername(websiteUrl);
      if (username) {
        return { username, skipOtherLayers: true, reason: 'Instagram direto na URL' };
      }
      // URL do Instagram mas sem username válido (ex: só instagram.com)
      return { username: null, skipOtherLayers: true, reason: 'Instagram URL sem username válido' };
    }
  }

  // Detectar Instagram embutido em texto (ex: "reserve instagram.com/restaurantex")
  const instagramMatch = websiteUrl.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/i);
  if (instagramMatch) {
    const username = extractInstagramUsername(instagramMatch[0]);
    if (username) {
      return { username, skipOtherLayers: true, reason: 'Instagram encontrado no texto da URL' };
    }
  }

  return { username: null, skipOtherLayers: false, reason: 'Não é Instagram direto' };
}

/**
 * LAYER 2: HTTP Fetch simples (sem Puppeteer)
 * - Faz GET no website
 * - Parseia HTML estático buscando links do Instagram
 * - Retorna também o HTML limpo para uso na Layer 2.5
 * Tempo: ~1-5s
 */
async function extractInstagramLayer2(websiteUrl: string): Promise<{ username: string | null; reason: string; htmlText?: string }> {
  // Helper para fazer fetch com retry
  async function doFetch(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  try {
    // Garantir que URL tem protocolo
    let url = websiteUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    console.log(`   🌐 [L2] Fetch: ${url}`);

    let response: Response;
    try {
      response = await doFetch(url);
    } catch (firstErr: any) {
      // Se HTTPS falhou, tentar HTTP
      if (url.startsWith('https://')) {
        const httpUrl = url.replace('https://', 'http://');
        console.log(`   🔄 [L2] Retry HTTP: ${httpUrl}`);
        try {
          response = await doFetch(httpUrl);
        } catch (secondErr: any) {
          throw firstErr; // Retorna erro original
        }
      } else {
        throw firstErr;
      }
    }

    // Verificar se redirecionou para Instagram
    const finalUrl = response.url;
    if (finalUrl.includes('instagram.com') || finalUrl.includes('instagr.am')) {
      const username = extractInstagramUsername(finalUrl);
      if (username) {
        return { username, reason: 'Redirect para Instagram' };
      }
    }

    // Ler HTML (limitar a 500KB para não travar)
    const html = await response.text();
    const limitedHtml = html.substring(0, 500000);

    // Extrair texto limpo do HTML para L2.5 (remover tags, scripts, styles)
    const cleanText = limitedHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // Remove styles
      .replace(/<[^>]+>/g, ' ')                          // Remove tags HTML
      .replace(/\s+/g, ' ')                              // Normaliza espaços
      .substring(0, 8000)                                // Limita para GPT (tokens)
      .trim();

    // APENAS buscar links <a href> explícitos para Instagram
    // NÃO buscar @mentions soltos (captura CSS/comentários de código)
    const linkPattern = /href=["'](?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]{3,30})\/?["']/gi;

    const foundUsernames: string[] = [];
    let match;

    while ((match = linkPattern.exec(limitedHtml)) !== null) {
      const potentialUsername = match[1]?.toLowerCase();
      if (potentialUsername) {
        const validated = extractInstagramUsername(`instagram.com/${potentialUsername}`);
        if (validated && !foundUsernames.includes(validated)) {
          foundUsernames.push(validated);
        }
      }
    }

    if (foundUsernames.length > 0) {
      return { username: foundUsernames[0], reason: `Link encontrado no HTML` };
    }

    // Retorna HTML limpo para L2.5 usar com GPT
    return { username: null, reason: 'Não encontrado no HTML', htmlText: cleanText };

  } catch (error: any) {
    const errorMsg = error.name === 'AbortError' ? 'Timeout' : error.message;
    console.log(`   ⚠️ [L2] Erro: ${errorMsg}`);
    return { username: null, reason: `Erro: ${errorMsg}` };
  }
}

/**
 * LAYER 2.5: GPT analisa o conteúdo do website
 * - Recebe o texto limpo do website (extraído na L2)
 * - Pede ao GPT para encontrar o Instagram MENCIONADO no texto
 * - Só retorna se encontrar evidência clara no texto
 * Tempo: ~1-2s
 */
async function extractInstagramLayer2_5(
  businessName: string,
  websiteText: string
): Promise<{ username: string | null; reason: string }> {
  try {
    console.log(`   🔍 [L2.5] GPT analisando website de "${businessName}"...`);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 50,
      messages: [
        {
          role: 'system',
          content: `Você extrai usernames do Instagram APENAS se estiverem EXPLICITAMENTE mencionados no texto fornecido.

REGRAS RIGOROSAS:
- Procure por padrões como: @username, instagram.com/username, "siga no instagram: username", "instagram: @username"
- Retorne APENAS o username (sem @, sem URL, sem explicação)
- Se encontrar MÚLTIPLOS usernames, retorne o que parece ser o principal/oficial da empresa
- Se NÃO encontrar nenhuma menção EXPLÍCITA ao Instagram no texto, retorne EXATAMENTE: null
- NÃO INVENTE, NÃO CHUTE, NÃO ADIVINHE
- Username válido: 1-30 caracteres, apenas letras minúsculas, números, pontos e underscores`
        },
        {
          role: 'user',
          content: `Empresa: ${businessName}

Conteúdo do website:
${websiteText}

Qual o username do Instagram mencionado neste texto? (responda APENAS o username ou "null" se não encontrar)`
        }
      ]
    });

    const response = completion.choices[0]?.message?.content?.trim().toLowerCase() || '';

    // Validar resposta
    if (!response || response === 'null' || response === 'none' || response === 'não encontrado' || response.length < 2 || response.includes(' ')) {
      console.log(`   ⚠️ [L2.5] Não encontrou Instagram no website`);
      return { username: null, reason: 'Instagram não mencionado no website' };
    }

    // Limpar resposta
    const username = response.replace(/^@/, '').replace(/[^a-z0-9._]/g, '').substring(0, 30);

    // Validação final
    if (username.length < 2 || !/^[a-z0-9._]+$/.test(username)) {
      console.log(`   ⚠️ [L2.5] Username inválido: ${response}`);
      return { username: null, reason: 'Username inválido no texto' };
    }

    console.log(`   ✅ [L2.5] Encontrado no website: @${username}`);
    return { username, reason: 'Encontrado no conteúdo do website via GPT' };

  } catch (error: any) {
    console.log(`   ⚠️ [L2.5] Erro: ${error.message}`);
    return { username: null, reason: `Erro: ${error.message}` };
  }
}

/**
 * LAYER 3: OpenAI direto (chute conservador)
 * - Pergunta diretamente ao OpenAI: "Qual o username no Instagram de {empresa}?"
 * - MUITO CONSERVADOR: Só retorna se tiver ALTA CONFIANÇA
 * - Usado apenas quando não tem website ou L2.5 falhou
 * Tempo: ~1-2s
 */
async function extractInstagramLayer3OpenAI(
  businessName: string
): Promise<{ username: string | null; reason: string }> {
  try {
    console.log(`   🤖 [L3] Perguntando ao OpenAI: "${businessName}"`);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 30,
      messages: [
        {
          role: 'system',
          content: `Você retorna usernames do Instagram de empresas APENAS quando tem CERTEZA ABSOLUTA.

REGRAS MUITO RIGOROSAS:
- Retorne APENAS o username (sem @, sem URL, sem explicação)
- Só retorne se você CONHECER esta empresa específica e seu Instagram VERIFICADO
- Se a empresa for pequena, local, ou desconhecida, retorne "null"
- Se você tiver QUALQUER DÚVIDA, retorne "null"
- NÃO INVENTE baseado no nome da empresa (ex: "RealPonto" NÃO significa que o Instagram é "realponto")
- NÃO CHUTE, NÃO ADIVINHE, NÃO ASSUMA
- É MELHOR retornar "null" do que retornar um username que não existe
- Username válido: 1-30 caracteres, apenas letras minúsculas, números, pontos e underscores`
        },
        {
          role: 'user',
          content: `Qual o username VERIFICADO no Instagram de "${businessName}"? Responda APENAS se tiver CERTEZA ABSOLUTA, caso contrário responda "null".`
        }
      ]
    });

    const response = completion.choices[0]?.message?.content?.trim().toLowerCase() || '';

    // Validar resposta
    if (!response || response === 'null' || response === 'none' || response === 'desconhecido' || response.length < 2 || response.includes(' ')) {
      console.log(`   ⚠️ [L3] OpenAI não tem certeza`);
      return { username: null, reason: 'OpenAI não tem certeza sobre esta empresa' };
    }

    // Limpar resposta
    const username = response.replace(/^@/, '').replace(/[^a-z0-9._]/g, '').substring(0, 30);

    // Validação final
    if (username.length < 2 || !/^[a-z0-9._]+$/.test(username)) {
      console.log(`   ⚠️ [L3] Username inválido: ${response}`);
      return { username: null, reason: 'Username inválido' };
    }

    console.log(`   ✅ [L3] OpenAI (alta confiança): @${username}`);
    return { username, reason: 'OpenAI tem alta confiança nesta empresa' };

  } catch (error: any) {
    console.log(`   ⚠️ [L3] Erro: ${error.message}`);
    return { username: null, reason: `Erro: ${error.message}` };
  }
}

/**
 * ORQUESTRADOR: Tenta as 4 camadas em ordem
 * Layer 1 (URL direta) → Layer 2 (HTTP Fetch) → Layer 2.5 (GPT + website) → Layer 3 (GPT conservador)
 *
 * Se não tiver website, pula direto para Layer 3.
 *
 * @param businessName - Nome da empresa (obrigatório)
 * @param websiteUrl - URL do website (opcional)
 */
async function extractInstagramSmart(
  businessName: string,
  websiteUrl?: string
): Promise<{ username: string | null; layer: number; reason: string; timeMs: number }> {
  const startTime = Date.now();

  // Variável para armazenar o HTML do website (se disponível)
  let websiteHtmlText: string | undefined;

  // Se tem website, tenta L1, L2 e L2.5
  if (websiteUrl) {
    // ========== LAYER 1: URL direta (~0ms) ==========
    console.log(`   ⚡ [L1] Verificando URL direta...`);
    const layer1 = extractInstagramLayer1(websiteUrl);

    if (layer1.username) {
      return {
        username: layer1.username,
        layer: 1,
        reason: layer1.reason,
        timeMs: Date.now() - startTime
      };
    }

    if (layer1.skipOtherLayers) {
      // Blacklist - nem tenta outras layers
      return {
        username: null,
        layer: 1,
        reason: layer1.reason,
        timeMs: Date.now() - startTime
      };
    }

    // ========== LAYER 2: HTTP Fetch (~1-5s) ==========
    const layer2 = await extractInstagramLayer2(websiteUrl);

    if (layer2.username) {
      return {
        username: layer2.username,
        layer: 2,
        reason: layer2.reason,
        timeMs: Date.now() - startTime
      };
    }

    // Guardar HTML para L2.5
    websiteHtmlText = layer2.htmlText;

    // ========== LAYER 2.5: GPT analisa website (~1-2s) ==========
    if (websiteHtmlText && websiteHtmlText.length > 50) {
      const layer2_5 = await extractInstagramLayer2_5(businessName, websiteHtmlText);

      if (layer2_5.username) {
        return {
          username: layer2_5.username,
          layer: 2.5,
          reason: layer2_5.reason,
          timeMs: Date.now() - startTime
        };
      }
    }
  }

  // ========== LAYER 3: Puppeteer scrape (~5-10s) ==========
  // Só chega aqui se: L1, L2, L2.5 falharam E tem website
  if (websiteUrl) {
    console.log(`   🔄 [L2.5] Não encontrou, tentando L4 (Puppeteer)...`);
    const layer3 = await extractInstagramLayer4Puppeteer(websiteUrl);

    if (layer3.username) {
      return {
        username: layer3.username,
        layer: 3,
        reason: layer3.reason,
        timeMs: Date.now() - startTime
      };
    }
  }

  // Nenhuma layer encontrou
  return {
    username: null,
    layer: 3,
    reason: websiteUrl ? 'Puppeteer não encontrou Instagram no site' : 'Sem website para buscar Instagram',
    timeMs: Date.now() - startTime
  };
}

/**
 * LAYER 4: Puppeteer scrape (último recurso)
 * - Abre browser, renderiza JS, scrolla até footer
 * - Busca links Instagram no DOM renderizado
 * - Usado quando L1, L2, L3 falharam
 * Tempo: ~5-10s
 */
async function extractInstagramLayer4Puppeteer(
  websiteUrl: string
): Promise<{ username: string | null; reason: string }> {
  if (!websiteUrl) {
    return { username: null, reason: 'URL vazia' };
  }

  // Garantir protocolo
  let url = websiteUrl;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  console.log(`   🌐 [L4] Puppeteer scrape: ${url}`);

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Criar browser dedicado para L4
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors'
      ]
    });
    page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Timeout para navegação
    await page.setDefaultTimeout(30000);

    // Navegar - esperar página carregar completamente
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    } catch (navErr: any) {
      // Se falhar, tentar com protocolo alternativo
      const altUrl = url.startsWith('https://')
        ? url.replace('https://', 'http://')
        : url.replace('http://', 'https://');
      console.log(`   ⚠️ [L4] Erro com ${url}, tentando ${altUrl}...`);
      try {
        await page.goto(altUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      } catch (altErr: any) {
        console.log(`   ❌ [L4] Falhou em ambos protocolos`);
        throw altErr;
      }
    }

    // Aguardar JS renderizar
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Scroll até footer
    await page.evaluate(async () => {
      const scrollStep = window.innerHeight;
      for (let i = 0; i < 5; i++) {
        window.scrollBy(0, scrollStep);
        await new Promise(r => setTimeout(r, 200));
      }
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Aguardar conteúdo dinâmico
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Extrair links Instagram do DOM
    const instagramData = await page.evaluate(() => {
      const results: string[] = [];

      // Links diretos
      document.querySelectorAll('a[href*="instagram.com"], a[href*="instagr.am"]').forEach(link => {
        const href = link.getAttribute('href');
        if (href) results.push(href);
      });

      // Links com texto/aria "instagram"
      document.querySelectorAll('a').forEach(link => {
        const text = (link.textContent || '').toLowerCase();
        const ariaLabel = (link.getAttribute('aria-label') || '').toLowerCase();
        const href = link.getAttribute('href') || '';
        if ((text.includes('instagram') || ariaLabel.includes('instagram')) && href) {
          results.push(href);
        }
      });

      // Texto com instagram.com/username
      const bodyText = document.body?.innerText || '';
      const mentions = bodyText.match(/instagram\.com\/[a-zA-Z0-9._]+/gi) || [];
      results.push(...mentions);

      // Ícones sociais
      document.querySelectorAll('[class*="instagram"], [id*="instagram"], a[title*="instagram" i]').forEach(el => {
        const href = el.getAttribute('href') || (el as HTMLAnchorElement).closest('a')?.getAttribute('href');
        if (href) results.push(href);
      });

      return results;
    });

    // Validar usernames encontrados
    for (const data of instagramData) {
      const username = extractInstagramUsername(data);
      if (username) {
        console.log(`   ✅ [L4] Instagram encontrado: @${username}`);
        return { username, reason: 'Puppeteer scrape' };
      }
    }

    console.log(`   ❌ [L4] Nenhum Instagram no DOM`);
    return { username: null, reason: 'Não encontrado no DOM renderizado' };

  } catch (error: any) {
    console.log(`   ⚠️ [L4] Erro: ${error.message}`);
    return { username: null, reason: `Erro: ${error.message}` };
  } finally {
    // Fechar browser L4
    if (page) try { await page.close(); } catch (e) {}
    if (browser) try { await browser.close(); } catch (e) {}
  }
}

// ============================================
// FUNÇÃO LEGADA (mantida para compatibilidade)
// ============================================

/**
 * Extract Instagram from a website by visiting it (LEGADO - usar extractInstagramSmart)
 * Scrolla até o rodapé para encontrar links de redes sociais
 * @deprecated Use extractInstagramSmart para melhor performance
 */
async function extractInstagramFromWebsite(page: Page, websiteUrl: string): Promise<string | null> {
  try {
    // Blacklist de plataformas de delivery/reserva (não são o site do negócio)
    const blacklistDomains = ['ifood.com', 'rappi.com', 'ubereats.com', 'aiqfome.com', 'deliverymuch.com', 'zé delivery', 'getninjas.com'];
    const urlLower = websiteUrl.toLowerCase();
    for (const domain of blacklistDomains) {
      if (urlLower.includes(domain)) {
        console.log(`   ⚠️ Website é plataforma de delivery (${domain}) - ignorando`);
        return null;
      }
    }

    // URL Shorteners - precisamos seguir o redirect
    const urlShorteners = ['bit.ly', 'bitly.com', 't.co', 'goo.gl', 'tinyurl.com', 'ow.ly', 'is.gd', 'buff.ly', 'shorturl.at', 'rb.gy', 'cutt.ly', 'linktr.ee'];
    const isShortener = urlShorteners.some(shortener => urlLower.includes(shortener));

    if (isShortener) {
      console.log(`   🔗 URL encurtada detectada, seguindo redirect...`);
      try {
        await page.goto(websiteUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 2000));

        const finalUrl = page.url();
        console.log(`   🔄 URL final: ${finalUrl}`);

        // Se redirect levou ao Instagram
        if (finalUrl.includes('instagram.com') || finalUrl.includes('instagr.am')) {
          const usernameFromRedirect = extractInstagramUsername(finalUrl);
          if (usernameFromRedirect) {
            console.log(`   ✅ Instagram encontrado (via shortener): @${usernameFromRedirect}`);
            return usernameFromRedirect;
          }
        }

        // Se não foi para Instagram, continuar buscando no site final
        websiteUrl = finalUrl;
        console.log(`   🌐 Buscando Instagram no site: ${finalUrl}`);
      } catch (err: any) {
        console.log(`   ⚠️ Erro ao seguir shortener: ${err.message}`);
        return null;
      }
    }

    // Se o texto contém "instagram.com" em algum lugar (ex: "reserva instagram.com/xxx")
    // Extrair só a parte do Instagram
    const instagramMatch = websiteUrl.match(/(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)(\/[^\s]*)?/i);
    if (instagramMatch) {
      const extractedInstagramUrl = instagramMatch[0].startsWith('http') ? instagramMatch[0] : 'https://' + instagramMatch[0];
      console.log(`   🔍 Instagram extraído do texto: ${extractedInstagramUrl}`);
      // Usar a URL extraída
      websiteUrl = extractedInstagramUrl;
    }

    // Se a URL é do Instagram
    if (websiteUrl.includes('instagram.com') || websiteUrl.includes('instagr.am')) {
      // Tentar extrair username direto da URL primeiro
      const usernameFromUrl = extractInstagramUsername(websiteUrl);
      if (usernameFromUrl) {
        console.log(`   ✅ Instagram encontrado (URL direta): @${usernameFromUrl}`);
        return usernameFromUrl;
      }

      // Se URL não tem username (só instagram.com), precisamos estar logados para redirect funcionar
      console.log(`   🌐 URL Instagram sem path, verificando login...`);

      // Garantir login Instagram (só tenta uma vez por sessão)
      if (!instagramLoginAttempted) {
        instagramLoginAttempted = true;
        const loggedIn = await ensureInstagramLogin(page);
        if (!loggedIn) {
          console.log(`   ❌ Não foi possível logar no Instagram`);
          return null;
        }
      }

      // Agora visitar a URL para pegar redirect
      console.log(`   🌐 Visitando para pegar redirect...`);
      await page.goto(websiteUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Pegar URL final após redirect
      const finalUrl = page.url();
      console.log(`   🔄 URL final: ${finalUrl}`);

      const usernameFromRedirect = extractInstagramUsername(finalUrl);
      if (usernameFromRedirect) {
        console.log(`   ✅ Instagram encontrado (após redirect): @${usernameFromRedirect}`);
        return usernameFromRedirect;
      }

      console.log(`   ❌ Não conseguiu extrair username do Instagram`);
      return null;
    }

    console.log(`   🌐 Visitando: ${websiteUrl}`);

    // Configurar página para ignorar erros de certificado
    await page.setBypassCSP(true);

    // Navigate to website
    try {
      await page.goto(websiteUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });
    } catch (navErr: any) {
      // Ignorar erros de navegação - tentar continuar
      if (navErr.message.includes('ERR_') || navErr.message.includes('net::')) {
        console.log(`   ⚠️ Navegação com erro, tentando continuar...`);
      } else {
        throw navErr;
      }
    }

    // Verificar se caiu em página de aviso HTTPS e clicar em "Ir para o site"
    try {
      const pageContent = await page.content();
      if (pageContent.includes('não pode fazer uma conexão segura') ||
          pageContent.includes('ERR_SSL') ||
          pageContent.includes('NET::ERR_CERT') ||
          pageContent.includes('Your connection is not private')) {
        console.log(`   🔓 Página de aviso SSL detectada, tentando prosseguir...`);

        // Clicar no botão via evaluate (funciona com texto em pt-BR)
        await page.evaluate(() => {
          // Procurar botões/links com texto de prosseguir
          const buttons = Array.from(document.querySelectorAll('button, a'));
          for (const btn of buttons) {
            const text = btn.textContent?.toLowerCase() || '';
            if (text.includes('ir para o site') || text.includes('proceed') || text.includes('continuar') || text.includes('avançado')) {
              (btn as HTMLElement).click();
              break;
            }
          }
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (e) {
      // Ignorar erros ao verificar página de aviso
    }

    // Aguardar JavaScript renderizar (3s)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Scroll até o rodapé para carregar conteúdo dinâmico (Instagram geralmente está no footer)
    await page.evaluate(async () => {
      // Scroll em etapas até o final
      const scrollStep = window.innerHeight;
      const maxScrolls = 5;
      for (let i = 0; i < maxScrolls; i++) {
        window.scrollBy(0, scrollStep);
        await new Promise(r => setTimeout(r, 300));
      }
      // Ir direto ao final
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Aguardar mais um pouco após scroll para conteúdo dinâmico
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Extract all links and text that might contain Instagram
    const instagramData = await page.evaluate(() => {
      const results: string[] = [];

      // Get all anchor tags with instagram in href
      const links = document.querySelectorAll('a[href*="instagram.com"], a[href*="instagr.am"]');
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href) results.push(href);
      });

      // Buscar links que contenham texto "Instagram" (mesmo sem href direto)
      const allLinks = document.querySelectorAll('a');
      allLinks.forEach(link => {
        const text = link.textContent?.toLowerCase() || '';
        const ariaLabel = link.getAttribute('aria-label')?.toLowerCase() || '';
        const title = link.getAttribute('title')?.toLowerCase() || '';
        const href = link.getAttribute('href') || '';

        if ((text.includes('instagram') || ariaLabel.includes('instagram') || title.includes('instagram')) && href) {
          results.push(href);
        }
      });

      // Get all text that mentions instagram
      const bodyText = document.body?.innerText || '';
      const instagramMentions = bodyText.match(/instagram\.com\/[a-zA-Z0-9._]+/gi) || [];
      results.push(...instagramMentions);

      // Buscar @username patterns no texto (comum em footers)
      const atMentions = bodyText.match(/@([a-zA-Z0-9._]{3,30})/gi) || [];
      results.push(...atMentions);

      // Check meta tags (some sites put social links in meta)
      const metaTags = document.querySelectorAll('meta[property*="instagram"], meta[name*="instagram"]');
      metaTags.forEach(meta => {
        const content = meta.getAttribute('content');
        if (content) results.push(content);
      });

      // Check for common Instagram icon links
      const socialIcons = document.querySelectorAll('a[aria-label*="instagram" i], a[title*="instagram" i], a.instagram, a.ig, [class*="instagram"], [id*="instagram"]');
      socialIcons.forEach(icon => {
        const href = icon.getAttribute('href') || icon.closest('a')?.getAttribute('href');
        if (href) results.push(href);
      });

      // Buscar SVGs e imagens de Instagram dentro de links
      const svgLinks = document.querySelectorAll('a svg, a img');
      svgLinks.forEach(el => {
        const parent = el.closest('a');
        if (parent) {
          const href = parent.getAttribute('href') || '';
          // Se o link aponta para instagram
          if (href.includes('instagram') || href.includes('instagr.am')) {
            results.push(href);
          }
          // Ou se a classe/id do SVG/img sugere instagram
          const classes = (el.className?.toString() || '') + ' ' + (el.getAttribute('alt') || '');
          if (classes.toLowerCase().includes('instagram') || classes.toLowerCase().includes('insta')) {
            results.push(href);
          }
        }
      });

      // Buscar em iframes (alguns sites colocam widget do Instagram)
      const iframes = document.querySelectorAll('iframe[src*="instagram"]');
      iframes.forEach(iframe => {
        const src = iframe.getAttribute('src');
        if (src) results.push(src);
      });

      return results;
    });

    // Find valid Instagram username
    for (const data of instagramData) {
      const username = extractInstagramUsername(data);
      if (username) {
        console.log(`   ✅ Instagram encontrado: @${username}`);
        return username;
      }
    }

    console.log(`   ❌ Nenhum Instagram encontrado no site`);
    return null;

  } catch (error: any) {
    console.log(`   ⚠️ Erro ao acessar website: ${error.message}`);
    return null;
  }
}

/**
 * Parse address components
 */
function parseAddress(fullAddress: string): { city?: string; state?: string } {
  if (!fullAddress) return {};

  const parts = fullAddress.split(',').map(p => p.trim());

  for (const part of parts) {
    const stateMatch = part.match(/([A-Za-zÀ-ÿ\s]+)\s*-\s*([A-Z]{2})/);
    if (stateMatch && stateMatch[1] && stateMatch[2]) {
      return {
        city: stateMatch[1].trim(),
        state: stateMatch[2]
      };
    }
  }

  return {};
}

/**
 * Digitação humanizada - simula digitação real com velocidade variável
 */
async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await humanDelay(300, 600);

  for (const char of text) {
    await page.keyboard.type(char, { delay: 50 + Math.random() * 150 }); // 50-200ms por caractere

    // Pausa ocasional (simula pensamento)
    if (Math.random() < 0.1) {
      await humanDelay(200, 500);
    }
  }

  console.log(`   ⌨️ Digitado: "${text}"`);
}

/**
 * Scroll até carregar quantidade alvo de resultados
 * Delay de 2-5s entre scrolls para dar tempo de carregar
 */
async function scrollUntilTarget(page: Page, targetCount: number, maxScrolls: number = 50): Promise<number> {
  const resultsSelector = 'div[role="feed"]';
  let lastCount = 0;
  let stagnantScrolls = 0;

  for (let i = 0; i < maxScrolls; i++) {
    // Contar resultados atuais
    const currentCount = await page.$$eval('div.Nv2PK', items => items.length);
    console.log(`📜 [SCROLL ${i + 1}] ${currentCount}/${targetCount} resultados`);

    // Se já temos suficiente, parar
    if (currentCount >= targetCount) {
      console.log(`✅ Alvo atingido: ${currentCount} resultados`);
      return currentCount;
    }

    // Scroll humanizado
    await humanScroll(page, resultsSelector);

    // Delay de 2-5s para carregar mais resultados
    await humanDelay(2000, 5000);

    // Verificar se chegou ao fim da lista
    const endReached = await page.evaluate(() => {
      const endMessage = document.querySelector('span.HlvSq');
      return endMessage !== null;
    });

    if (endReached) {
      const finalCount = await page.$$eval('div.Nv2PK', items => items.length);
      console.log(`🏁 Fim da lista após ${i + 1} scrolls (${finalCount} total)`);
      return finalCount;
    }

    // Verificar se parou de carregar novos resultados
    const newCount = await page.$$eval('div.Nv2PK', items => items.length);
    if (newCount === lastCount) {
      stagnantScrolls++;
      if (stagnantScrolls >= 3) {
        console.log(`⚠️ Sem novos resultados após 3 scrolls, parando (${newCount} total)`);
        return newCount;
      }
    } else {
      stagnantScrolls = 0;
    }
    lastCount = newCount;
  }

  const finalCount = await page.$$eval('div.Nv2PK', items => items.length);
  console.log(`⚠️ Limite de scrolls atingido (${finalCount} resultados)`);
  return finalCount;
}

/**
 * Scrape business details by clicking on listing (humanizado)
 */
async function scrapeBusinessDetails(page: Page, listingElement: any): Promise<{
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviews_count?: number;
} | null> {
  try {
    // Clique humanizado com movimento de mouse
    await humanClick(page, listingElement);

    // Delay humanizado para carregar detalhes (2s a 4s)
    await humanDelay(2000, 4000);

    const data = await page.evaluate(() => {
      const getName = () => {
        const el = document.querySelector('h1.DUwDvf');
        return el?.textContent?.trim() || null;
      };

      const getAddress = () => {
        const el = document.querySelector('button[data-item-id="address"]');
        return el?.textContent?.trim() || null;
      };

      const getPhone = () => {
        const el = document.querySelector('button[data-item-id^="phone"]');
        const text = el?.textContent?.trim() || '';
        const match = text.match(/[\d\s()\-+]+/);
        return match ? match[0].trim() : null;
      };

      const getWebsite = () => {
        const el = document.querySelector('a[data-item-id="authority"]');
        return el?.getAttribute('href') || null;
      };

      const getRating = () => {
        const el = document.querySelector('div.F7nice span[aria-hidden="true"]');
        const text = el?.textContent?.trim() || '';
        const num = parseFloat(text.replace(',', '.'));
        return isNaN(num) ? null : num;
      };

      const getReviewsCount = () => {
        const el = document.querySelector('div.F7nice span[aria-label*="avaliações"], div.F7nice span[aria-label*="reviews"]');
        const label = el?.getAttribute('aria-label') || '';
        const match = label.match(/(\d+)/);
        return match ? parseInt(match[1]) : null;
      };

      return {
        name: getName(),
        address: getAddress(),
        phone: getPhone(),
        website: getWebsite(),
        rating: getRating(),
        reviews_count: getReviewsCount()
      };
    });

    if (!data.name) return null;

    return data;

  } catch (error: any) {
    console.error(`❌ [GOOGLE-MAPS] Erro ao extrair detalhes:`, error.message);
    return null;
  }
}

/**
 * Main scrape function
 * Only persists leads WITH Instagram
 */
export async function scrapeGoogleMaps(options: ScrapeOptions): Promise<ScrapeResult> {
  const {
    termo,
    cidade,
    estado = '',
    localizacao = '',
    bairro = '',
    max_resultados = 50,
    saveToDb = true,
    lat,
    lng,
    zoom = 17,
    gridPointId
  } = options;

  // Flag para modo coordenadas
  const useCoords = lat !== undefined && lng !== undefined;

  // Nota: controle de duplicados fica no workflow (IF + Telegram)
  // scraped_keywords é apenas histórico/log

  const result: ScrapeResult = {
    success: false,
    leads: [],
    total_scraped: 0,
    with_website: 0,
    with_instagram: 0,
    saved: 0,
    duplicates: 0,
    errors: []
  };

  // Montar query/URL de busca
  let searchQuery: string;
  let searchUrl: string | null = null;

  if (useCoords) {
    // Modo coordenadas: URL direta com lat/lng
    searchQuery = `${termo}@${lat},${lng}`;
    searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(termo)}/@${lat},${lng},${zoom}z`;
  } else if (localizacao) {
    // Formato: "Av Faria Lima, Empresa"
    searchQuery = `${localizacao}, ${termo}`;
  } else {
    // Sem localização específica: "São Paulo, Restaurante"
    searchQuery = cidade;
    if (estado) searchQuery += ` ${estado}`;
    searchQuery += `, ${termo}`;
  }

  // Limpar logs anteriores
  clearScrapeLogs();

  log('INFO', 'Iniciando scraping', { query: searchQuery, max_resultados, useCoords, bairro });
  console.log(`\n🔍 [GOOGLE-MAPS] Buscando: "${termo}"`);
  if (useCoords) {
    console.log(`📍 Coordenadas: ${lat}, ${lng} (zoom ${zoom})`);
    console.log(`📍 Bairro: ${bairro || 'N/A'}`);
    console.log(`🔗 URL: ${searchUrl}`);
  } else {
    console.log(`📍 Busca: ${searchQuery}`);
  }
  console.log(`📊 Max: ${max_resultados} resultados`);
  console.log(`📋 Lógica: Só persiste leads COM Instagram\n`);

  let browser: Browser | null = null;
  let page: Page | null = null;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  try {
    // === INICIALIZAÇÃO COM RETRY (evita crash no início) ===
    const MAX_INIT_RETRIES = 3;
    let initSuccess = false;

    for (let initAttempt = 1; initAttempt <= MAX_INIT_RETRIES && !initSuccess; initAttempt++) {
      try {
        if (initAttempt > 1) {
          console.log(`\n🔄 Tentativa ${initAttempt}/${MAX_INIT_RETRIES} de inicialização...`);
          await humanDelay(3000, 5000);
        }

        browser = await createBrowser();
        page = await browser.newPage();

        // Set user agent
        await page.setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        await page.setExtraHTTPHeaders({
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        });

        // Navegação: URL direta (coordenadas) ou busca digitada (texto)
        if (useCoords && searchUrl) {
          // Modo coordenadas: navegar diretamente para URL com lat/lng
          console.log(`🌐 Navegando para URL de coordenadas...`);
          await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
          await humanDelay(2000, 3000);

          // Aguardar resultados carregarem
          await page.waitForSelector('div[role="feed"]', { timeout: 30000 });
          await humanDelay(2000, 4000);

          // ⚠️ IMPORTANTE: Desabilitar "Buscar nesta área" para manter coordenadas fixas
          try {
            // Checkbox "Update results when map moves" - seletor específico do Google Maps
            const checkboxDisabled = await page.evaluate(() => {
              // Seletor 1: Checkbox com aria-label contendo "update" ou "atualizar"
              const checkbox = document.querySelector('input[type="checkbox"][aria-checked="true"]') ||
                               document.querySelector('button[aria-checked="true"][role="checkbox"]') ||
                               document.querySelector('[data-value="Search as I move the map"]') ||
                               document.querySelector('[aria-label*="update results"]') ||
                               document.querySelector('[aria-label*="atualizar resultados"]');

              if (checkbox) {
                (checkbox as HTMLElement).click();
                return true;
              }

              // Seletor 2: Buscar por texto visível
              const labels = document.querySelectorAll('label, span, div');
              for (const label of labels) {
                const text = (label as HTMLElement).innerText?.toLowerCase() || '';
                if (text.includes('search as i move') || text.includes('buscar quando mover') ||
                    text.includes('atualizar quando mover') || text.includes('update results')) {
                  const clickable = label.closest('button') || label.querySelector('input') || label;
                  if (clickable) {
                    (clickable as HTMLElement).click();
                    return true;
                  }
                }
              }

              return false;
            });

            if (checkboxDisabled) {
              console.log(`🔒 Checkbox "Buscar quando mover" desativado`);
            } else {
              console.log(`⚠️ Checkbox não encontrado (pode já estar desativado)`);
            }
          } catch (lockErr) {
            console.log(`⚠️ Não foi possível desativar checkbox (pode continuar)`);
          }
        } else {
          // Modo texto: ir para Maps e digitar busca
          console.log(`🌐 Navegando para Google Maps...`);
          await page.goto('https://www.google.com/maps', { waitUntil: 'networkidle2', timeout: 60000 });
          await humanDelay(2000, 3000);

          // Digitar busca humanizada no campo de pesquisa
          console.log(`⌨️ Digitando busca humanizada...`);
          const searchBoxSelector = 'input[name="q"]';
          await page.waitForSelector(searchBoxSelector, { timeout: 10000 });
          await humanType(page, searchBoxSelector, searchQuery);

          // Delay antes de pressionar Enter (como um humano faria)
          await humanDelay(500, 1000);

          // Pressionar Enter para buscar
          await page.keyboard.press('Enter');
          console.log(`🔍 Buscando...`);

          // Aguardar resultados carregarem
          await page.waitForSelector('div[role="feed"]', { timeout: 30000 });

          // Delay humanizado após resultados carregarem (2s a 4s)
          await humanDelay(2000, 4000);
        }

        initSuccess = true;
        console.log(`✅ Inicialização bem-sucedida`);

      } catch (initErr: any) {
        console.error(`❌ Erro na inicialização (tentativa ${initAttempt}): ${initErr.message}`);

        // Fechar browser se existir
        if (browser) {
          await forceCloseBrowser(browser);
          browser = null;
          page = null;
        }

        if (initAttempt >= MAX_INIT_RETRIES) {
          throw new Error(`Falha após ${MAX_INIT_RETRIES} tentativas de inicialização: ${initErr.message}`);
        }
      }
    }

    // ✅ HEALTH CHECK após carregar página
    log('INFO', 'Verificando saúde da página');
    const initialHealth = await healthCheck(page);
    if (!initialHealth.ok) {
      log('ERROR', 'Falha no health check inicial', { issue: initialHealth.issue, message: initialHealth.message });
      result.errors.push(`Health check falhou: ${initialHealth.message}`);

      // Se for ban/captcha, abortar
      if (initialHealth.issue === 'BAN' || initialHealth.issue === 'CAPTCHA') {
        throw new Error(`Scraping abortado: ${initialHealth.message}`);
      }

      // Se não tiver resultados, retornar vazio
      if (initialHealth.issue === 'NO_RESULTS') {
        result.success = true;
        return result;
      }
    }
    log('SUCCESS', 'Health check OK');

    // Accept cookies if dialog appears
    try {
      const acceptButton = await page.$('button[aria-label*="Aceitar"], button[aria-label*="Accept"]');
      if (acceptButton) {
        await humanClick(page, acceptButton);
        await humanDelay(800, 1500);
      }
    } catch (e) {}

    // ========================================
    // LOOP: Scroll + Captura até atingir meta de SALVOS
    // ========================================
    console.log(`🎯 Meta: ${max_resultados} leads SALVOS (com Instagram)\n`);

    let processedIndex = 0;  // Índice do próximo item a processar
    let stagnantScrolls = 0; // Scrolls sem novos resultados (para detectar travamento)
    let listEnded = false;   // Flag de fim da lista
    let totalScrolls = 0;    // Total de scrolls realizados (para recovery)
    let restartCount = 0;    // Contador de reinícios completos
    const MAX_RESTARTS = 2;  // Só 2 tentativas (Google trava após X scrolls)
    const MAX_PROCESSED = 80; // Limite de leads processados (independente de salvos)
    let scrollsWithoutNewSaves = 0; // Scrolls sem novos leads SALVOS (mais confiável que DOM count)
    let lastSavedCount = 0;  // Para rastrear progresso real
    const MAX_SCROLLS_WITHOUT_SAVES = 15; // Se 15 scrolls sem salvar nada, parar

    while (result.saved < max_resultados && !listEnded) {
      // Pegar listings atuais - com proteção contra frame detached
      let currentListings;
      try {
        currentListings = await page.$$('div.Nv2PK');
      } catch (listErr: any) {
        // Se a page principal estiver corrompida, precisamos fazer recovery
        const isFrameError =
          listErr.message.includes('detached') ||
          listErr.message.includes('closed') ||
          listErr.message.includes('Target') ||
          listErr.message.includes('Protocol') ||
          listErr.message.includes('Frame');

        if (isFrameError) {
          console.log(`   🔄 Page corrompida (${listErr.message.substring(0, 40)}...) - recriando browser...`);

          // Forçar fechamento e matar processos
          await forceCloseBrowser(browser);
          await humanDelay(2000, 3000);

          // Recriar browser
          console.log('   🚀 Recriando browser...');
          browser = await createBrowser();
          page = await browser.newPage();
          await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

          // Navegar de volta para Google Maps
          const searchQuery = localizacao ? `${localizacao}, ${termo}` : `${cidade}, ${termo}`;
          console.log(`   🔄 Navegando de volta: "${searchQuery}"`);
          await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, {
            waitUntil: 'networkidle2',
            timeout: 60000
          });
          await humanDelay(3000, 5000);

          // Scrollar até carregar items suficientes (baseado em processedIndex, não scrolls)
          if (processedIndex > 0) {
            console.log(`   📜 Restaurando posição (carregando ${processedIndex} items)...`);
            let loadedItems = 0;
            let scrollCount = 0;
            const MAX_SCROLL_RECOVERY = 50;

            while (loadedItems < processedIndex && scrollCount < MAX_SCROLL_RECOVERY) {
              await humanScroll(page, 'div[role="feed"]');
              scrollCount++;
              await humanDelay(2000, 3500);

              // Contar items carregados no DOM
              loadedItems = await page.$$eval('div.Nv2PK', items => items.length);

              if (scrollCount % 5 === 0) {
                console.log(`      ... ${loadedItems}/${processedIndex} items (${scrollCount} scrolls)`);
              }
            }
            console.log(`   ✅ Posição restaurada (${loadedItems} items com ${scrollCount} scrolls)`);
          }

          // Resetar só stagnant (DOM), NÃO resetar scrollsWithoutNewSaves (progresso real)
          stagnantScrolls = 0;
          // scrollsWithoutNewSaves mantido - não foi restart completo

          console.log(`   📊 Progresso: ${result.saved}/${max_resultados} salvos - continuando do item ${processedIndex + 1}`);
          continue; // Tentar novamente
        }
        throw listErr; // Se não for erro de frame, propagar
      }

      // Se não há mais itens para processar, scrollar
      if (processedIndex >= currentListings.length) {
        console.log(`📜 [SCROLL] Carregando mais... (processedIndex=${processedIndex}, listingsDOM=${currentListings.length}, salvos=${result.saved}/${max_resultados})`);

        // Scrollar
        await humanScroll(page, 'div[role="feed"]');
        totalScrolls++;
        await humanDelay(8000, 12000); // 8-12s para evitar stress no Google Maps

        // Verificar fim da lista
        listEnded = await page.evaluate(() => {
          const endMessage = document.querySelector('span.HlvSq');
          return endMessage !== null;
        });

        if (listEnded) {
          // Verificar se lista está genuinamente esgotada
          // Se poucos resultados processados (<20) e já chegou ao fim, não vale reiniciar
          const MIN_RESULTS_TO_RESTART = 20;

          if (result.total_scraped < MIN_RESULTS_TO_RESTART) {
            console.log(`🏁 Lista esgotada para "${termo}" nesta localização (${result.total_scraped} resultados, ${result.saved} salvos)`);
            console.log(`   ℹ️  Poucos resultados (<${MIN_RESULTS_TO_RESTART}) - não há mais empresas para este termo/local`);
            (result as any).list_exhausted = true;
            break;
          }

          // Lista terminou mas tinha bastante resultado - tentar reiniciar
          // Se já processou 80+ leads, não vale reiniciar - área já foi bem coberta
          if (result.total_scraped >= MAX_PROCESSED) {
            console.log(`🛑 Já processou ${result.total_scraped} leads - encerrando sem reiniciar`);
            break;
          }

          restartCount++;
          console.log(`🔄 Fim da lista detectado - reinício ${restartCount}/${MAX_RESTARTS} (${result.saved}/${max_resultados} salvos)`);

          if (restartCount >= MAX_RESTARTS) {
            console.log(`🏁 Máximo de ${MAX_RESTARTS} reinícios atingido, encerrando`);
            break;
          }

          // Fechar browser completamente
          console.log(`   🔒 Fechando browser...`);
          await forceCloseBrowser(browser);

          // Esperar bastante antes de reabrir (evitar rate limit)
          const waitTime = 30000; // 30s
          console.log(`   ⏳ Aguardando 30s antes de reabrir...`);
          await humanDelay(waitTime, waitTime + 5000);

          // Reabrir browser
          console.log(`   🚀 Reabrindo browser...`);
          browser = await createBrowser();
          page = await browser.newPage();
          await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

          const searchQuery = localizacao ? `${localizacao}, ${termo}` : `${cidade}, ${termo}`;
          console.log(`   🔍 Navegando para busca: "${searchQuery}"`);
          await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, {
            waitUntil: 'networkidle2',
            timeout: 60000
          });
          await humanDelay(5000, 8000);

          // Scrollar até carregar items suficientes (baseado em processedIndex, não scrolls)
          if (processedIndex > 0) {
            console.log(`   📜 Restaurando posição (carregando ${processedIndex} items)...`);
            let loadedItems = 0;
            let scrollCount = 0;
            const MAX_SCROLL_RECOVERY = 50;

            while (loadedItems < processedIndex && scrollCount < MAX_SCROLL_RECOVERY) {
              await humanScroll(page, 'div[role="feed"]');
              scrollCount++;
              await humanDelay(8000, 12000); // Mais tempo entre scrolls de recovery

              // Contar items carregados no DOM
              loadedItems = await page.$$eval('div.Nv2PK', items => items.length);

              if (scrollCount % 5 === 0) {
                console.log(`      ... ${loadedItems}/${processedIndex} items (${scrollCount} scrolls)`);
              }
            }
            console.log(`   ✅ Posição restaurada (${loadedItems} items com ${scrollCount} scrolls)`);
          }

          // Resetar flags de erro após restart completo - dar nova chance
          stagnantScrolls = 0;
          scrollsWithoutNewSaves = 0; // Reset após restart completo
          lastSavedCount = result.saved;
          listEnded = false;

          console.log(`   📊 Progresso: ${result.saved}/${max_resultados} salvos - continuando do item ${processedIndex + 1}`);

          // Continuar do loop principal
          continue;
        }

        // Verificar se carregou novos no DOM
        const newListings = await page.$$('div.Nv2PK');

        // Verificar progresso REAL (leads salvos, não apenas DOM)
        if (result.saved === lastSavedCount) {
          scrollsWithoutNewSaves++;
        } else {
          scrollsWithoutNewSaves = 0;
          lastSavedCount = result.saved;
        }

        // Se muitos scrolls sem salvar nada, parar (independente do DOM)
        if (scrollsWithoutNewSaves >= MAX_SCROLLS_WITHOUT_SAVES) {
          console.log(`🛑 ${scrollsWithoutNewSaves} scrolls sem novos leads salvos - encerrando`);
          console.log(`   📊 Total: ${result.total_scraped} processados, ${result.saved} salvos`);
          break;
        }

        if (newListings.length === currentListings.length) {
          stagnantScrolls++;
          console.log(`   ⏳ Scroll sem novos resultados DOM (${stagnantScrolls}x) | Sem salvos: ${scrollsWithoutNewSaves}/${MAX_SCROLLS_WITHOUT_SAVES}`);

          // Após muitos scrolls sem resultado, reiniciar browser
          if (stagnantScrolls >= 10) {
            // Se já processou 80+ leads, não vale reiniciar - área já foi bem coberta
            if (result.total_scraped >= MAX_PROCESSED) {
              console.log(`🛑 Já processou ${result.total_scraped} leads - encerrando sem reiniciar`);
              break;
            }

            restartCount++;
            console.log(`🔄 ${stagnantScrolls} scrolls sem novos resultados - reinício ${restartCount}/${MAX_RESTARTS}`);

            if (restartCount >= MAX_RESTARTS) {
              console.log(`🏁 Máximo de ${MAX_RESTARTS} reinícios atingido, encerrando`);
              break;
            }

            // Fechar browser completamente
            console.log(`   🔒 Fechando browser...`);
            await forceCloseBrowser(browser);

            // Esperar progressivamente mais a cada reinício
            const waitTime = 30000; // 30s (reduzido de 2min - menos stress no Google com Layer 2)
            console.log(`   ⏳ Aguardando 30s antes de reabrir...`);
            await humanDelay(waitTime, waitTime + 5000);

            // Reabrir browser
            console.log(`   🚀 Reabrindo browser...`);
            browser = await createBrowser();
            page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            const searchQuery = localizacao ? `${localizacao}, ${termo}` : `${cidade}, ${termo}`;
            console.log(`   🔍 Navegando para busca: "${searchQuery}"`);
            await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, {
              waitUntil: 'networkidle2',
              timeout: 60000
            });
            await humanDelay(5000, 8000);

            // Scrollar de volta à posição anterior
            if (totalScrolls > 0) {
              console.log(`   📜 Voltando à posição anterior (${totalScrolls} scrolls)...`);
              for (let i = 0; i < totalScrolls; i++) {
                await humanScroll(page, 'div[role="feed"]');
                await humanDelay(3000, 5000);
                if ((i + 1) % 5 === 0) {
                  console.log(`      ... ${i + 1}/${totalScrolls} scrolls restaurados`);
                }
              }
              console.log(`   ✅ Posição restaurada`);
            }

            // Resetar flags de erro após restart completo - dar nova chance
            stagnantScrolls = 0;
            scrollsWithoutNewSaves = 0; // Reset após restart completo
            lastSavedCount = result.saved;

            console.log(`   📊 Progresso: ${result.saved}/${max_resultados} salvos - continuando do item ${processedIndex + 1}`);
          }
        } else {
          stagnantScrolls = 0;
          // NÃO resetar scrollsWithoutNewSaves aqui - apenas DOM mudou, não houve restart
        }
        continue;
      }

      // ✅ HEALTH CHECK periódico (a cada 10 itens)
      if (processedIndex > 0 && processedIndex % 10 === 0) {
        const periodicHealth = await healthCheck(page);
        if (!periodicHealth.ok && (periodicHealth.issue === 'BAN' || periodicHealth.issue === 'CAPTCHA')) {
          log('ERROR', 'Abortando por problema crítico');
          break;
        }
      }

      // Verificar erros consecutivos
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        log('ERROR', 'Muitos erros consecutivos, abortando');
        break;
      }

      // Processar item atual
      const itemNumber = processedIndex + 1;
      console.log(`\n📍 [${itemNumber}] Processando... (${result.saved}/${max_resultados} salvos)`);

      try {
        // Get business details (com clique humanizado)
        const business = await scrapeBusinessDetails(page, currentListings[processedIndex]);
        result.total_scraped++;
        processedIndex++;

        if (!business || !business.name) {
          console.log(`   ⏭️ Sem dados, pulando`);
          await page.keyboard.press('Escape');
          await humanDelay(500, 1000);
          continue;
        }

        console.log(`   📌 ${business.name}`);

        // Parse address para verificar duplicado e criar lead
        const { city: parsedCity, state: parsedState } = parseAddress(business.address || '');
        const checkCity = parsedCity || cidade;

        // ✅ VERIFICAR DUPLICADO ANTES de visitar website
        const isDuplicate = await checkDuplicateByName(business.name, checkCity);
        if (isDuplicate) {
          console.log(`   ⏭️ Já existe no banco, pulando`);
          result.duplicates++;
          await page.keyboard.press('Escape');
          await humanDelay(500, 1000);
          continue;
        }

        // Website é opcional - podemos buscar Instagram só pelo nome
        if (business.website) {
          result.with_website++;
          console.log(`   🔗 Website: ${business.website}`);
        } else {
          console.log(`   ℹ️ Sem website - tentando só pelo nome`);
        }

        // Go back to list
        await page.keyboard.press('Escape');
        await humanDelay(500, 1000);

        // ========================================
        // EXTRAÇÃO DE INSTAGRAM (4 Layers)
        // L1: URL direta | L2: HTTP Fetch | L2.5: GPT + website | L3: GPT conservador
        // ========================================
        const extractionResult = await extractInstagramSmart(
          business.name,
          business.website  // opcional
        );

        const instagram = extractionResult.username;
        const extractionLayer = extractionResult.layer;
        const extractionTime = extractionResult.timeMs;

        if (!instagram) {
          console.log(`   ❌ Sem Instagram (L1+L2+L2.5+L3 falharam) - ${extractionResult.reason}`);
          continue;
        }

        console.log(`   ✅ Instagram: @${instagram} [L${extractionLayer}] (${extractionTime}ms)`);

        result.with_instagram++;

        // Validate phone as WhatsApp (only Brazilian mobile)
        const whatsappNumber = extractWhatsAppNumber(business.phone || '');
        if (whatsappNumber) {
          console.log(`   📱 WhatsApp válido: ${whatsappNumber}`);
        } else if (business.phone) {
          console.log(`   📞 Telefone fixo (não é WhatsApp): ${business.phone}`);
        }

        // Create lead (only if we have Instagram)
        const lead: GoogleLead = {
          name: business.name,
          instagram_username: instagram,
          phone_whatsapp: whatsappNumber || undefined, // Só se for celular
          full_address: business.address,              // Endereço completo
          city: parsedCity || cidade,
          state: parsedState || estado,
          website: business.website,
          rating: business.rating,
          reviews_count: business.reviews_count,
          search_query: searchQuery,
          search_theme: termo,
          search_city: cidade
        };

        result.leads.push(lead);

        // Save to database (já verificamos duplicado por nome antes)
        if (saveToDb) {
          const { error } = await supabase
            .from('google_leads')
            .insert({
              ...lead,
              status: 'pending'
            });

          if (error) {
            // Pode ser duplicado por instagram_username (unique constraint)
            if (error.message.includes('duplicate') || error.message.includes('unique')) {
              log('WARN', 'Instagram duplicado', { instagram });
              console.log(`   ⚠️ Instagram @${instagram} já existe`);
              result.duplicates++;
            } else {
              log('ERROR', 'Erro ao salvar no banco', { name: business.name, error: error.message });
              console.error(`   ❌ Erro ao salvar:`, error.message);
              result.errors.push(`${business.name}: ${error.message}`);
            }
          } else {
            log('SUCCESS', 'Lead salvo', { instagram, name: business.name });
            console.log(`   💾 Salvo: @${instagram}`);
            result.saved++;
          }
        }

        // Reset contador de erros após sucesso
        consecutiveErrors = 0;

      } catch (err: any) {
        consecutiveErrors++;
        processedIndex++; // Avançar mesmo com erro para não ficar em loop
        log('ERROR', `Erro no item (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`, { error: err.message });
        console.error(`   ❌ Erro: ${err.message}`);
        result.errors.push(err.message);

        // Detectar erros que exigem recriar browser (crash, detached, closed, etc)
        const needsRecovery =
          err.message.includes('detached') ||
          err.message.includes('Detached') ||
          err.message.includes('crashed') ||
          err.message.includes('Crashed') ||
          err.message.includes('closed') ||
          err.message.includes('Target closed') ||
          err.message.includes('Session closed') ||
          err.message.includes('Protocol error') ||
          err.message.includes('Connection closed') ||
          err.message.includes('SIGSEGV') ||
          err.message.includes('SIGKILL') ||
          err.message.includes('SIGTERM') ||
          err.message.includes('not attached') ||
          err.message.includes('Browser') ||
          err.message.includes('browser') ||
          err.message.includes('Execution context') ||
          err.message.includes('page has been closed');

        if (needsRecovery) {
          console.log(`   🔄 Browser crashou (${err.message.substring(0, 50)}...) - forçando kill e recriando...`);

          // Forçar fechamento e matar processos órfãos
          await forceCloseBrowser(browser);

          // Aguardar recursos liberados
          await humanDelay(2000, 3000);

          // Recriar browser
          console.log('   🚀 Recriando browser...');
          browser = await createBrowser();
          page = await browser.newPage();
          await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

          // Navegar de volta para Google Maps com a mesma busca
          const searchQuery = localizacao ? `${localizacao}, ${termo}` : `${cidade}, ${termo}`;
          console.log(`   🔄 Navegando de volta para Google Maps: "${searchQuery}"`);
          await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, {
            waitUntil: 'networkidle2',
            timeout: 60000
          });
          await humanDelay(3000, 5000);

          // Scrollar de volta à mesma posição
          if (totalScrolls > 0) {
            console.log(`   📜 Voltando à posição anterior (${totalScrolls} scrolls)...`);
            for (let i = 0; i < totalScrolls; i++) {
              await humanScroll(page, 'div[role="feed"]');
              await humanDelay(2000, 3500); // Tempo para carregar cada scroll
              if ((i + 1) % 5 === 0) {
                console.log(`      ... ${i + 1}/${totalScrolls} scrolls`);
              }
            }
            console.log(`   ✅ Posição restaurada`);
          }

          // Resetar contadores após restart completo - dar nova chance
          stagnantScrolls = 0;
          scrollsWithoutNewSaves = 0;
          lastSavedCount = result.saved;

          console.log(`   ✅ Browser recriado - continuando do item ${processedIndex + 1}`);
          continue;
        }

        // Try to recover (para erros não-fatais)
        try {
          await page.keyboard.press('Escape');
        } catch (e) {}

        // Delay extra após erro
        await humanDelay(1000, 2000);
      }
    }

    // Mensagem final
    if (result.saved >= max_resultados) {
      console.log(`\n🎉 META ATINGIDA: ${result.saved} leads salvos!`);
    } else if (result.total_scraped >= MAX_PROCESSED) {
      console.log(`\n🛑 LIMITE DE PROCESSADOS: ${result.total_scraped} leads analisados (${result.saved} salvos)`);
    } else {
      console.log(`\n⚠️ Fim da lista: ${result.saved}/${max_resultados} leads salvos`);
    }

    result.success = true;

  } catch (error: any) {
    console.error(`\n❌ [GOOGLE-MAPS] Erro fatal:`, error.message);
    result.errors.push(error.message);
  } finally {
    // Fechar page e browser
    if (page) {
      try { await page.close(); } catch (e) {}
    }
    if (browser) {
      try { await browser.close(); } catch (e) {}
      console.log('🔒 Browser fechado');
    }
  }

  // Summary
  const summary = {
    total_scraped: result.total_scraped,
    with_website: result.with_website,
    with_instagram: result.with_instagram,
    saved: result.saved,
    duplicates: result.duplicates,
    errors: result.errors.length
  };

  log('INFO', 'Scraping finalizado', summary);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 RESUMO DO SCRAPING`);
  console.log(`${'='.repeat(50)}`);
  console.log(`   Total processados: ${result.total_scraped}`);
  console.log(`   Com website: ${result.with_website}`);
  console.log(`   Com Instagram: ${result.with_instagram}`);
  console.log(`   Salvos no banco: ${result.saved}`);
  console.log(`   Duplicados: ${result.duplicates}`);
  console.log(`   Erros: ${result.errors.length}`);
  console.log(`${'='.repeat(50)}\n`);

  // Registrar keyword como processada no grid point (se aplicável)
  if (gridPointId && useCoords) {
    try {
      // Buscar scraped_keywords atual
      const { data: point } = await supabase
        .from('scraping_grid_points')
        .select('scraped_keywords')
        .eq('id', gridPointId)
        .single();

      const scrapedKeywords = point?.scraped_keywords || [];

      // Adicionar nova entrada
      scrapedKeywords.push({
        keyword: termo,
        scraped_at: new Date().toISOString(),
        results: result.total_scraped,
        instagram: result.with_instagram,
        saved: result.saved
      });

      // Atualizar no banco
      await supabase
        .from('scraping_grid_points')
        .update({
          scraped_keywords: scrapedKeywords,
          updated_at: new Date().toISOString()
        })
        .eq('id', gridPointId);

      console.log(`✅ Keyword "${termo}" registrada no grid point #${gridPointId}`);
    } catch (err: any) {
      console.error(`⚠️ Erro ao registrar keyword no grid point: ${err.message}`);
    }
  }

  // Anexar logs ao resultado
  (result as any).logs = getScrapeLogs();

  return result;
}

// Alias for backwards compatibility
export const scrapeGoogleMapsDetailed = scrapeGoogleMaps;

/**
 * Get pending leads for Instagram enrichment
 */
export async function getPendingLeadsForEnrichment(
  limit: number = 50,
  theme?: string,
  city?: string
): Promise<GoogleLead[]> {
  let query = supabase
    .from('google_leads')
    .select('*')
    .eq('status', 'pending')
    .order('captured_at', { ascending: true })
    .limit(limit);

  if (theme) query = query.eq('search_theme', theme);
  if (city) query = query.eq('search_city', city);

  const { data, error } = await query;

  if (error) {
    console.error('❌ [GOOGLE-MAPS] Erro ao buscar leads:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Update lead status
 */
export async function updateLeadStatus(
  id: string,
  status: string,
  instagramLeadId?: string,
  errorMessage?: string
): Promise<boolean> {
  const update: any = { status };

  if (instagramLeadId) {
    update.instagram_lead_id = instagramLeadId;
    update.enriched_at = new Date().toISOString();
  }

  if (errorMessage) {
    update.error_message = errorMessage;
  }

  const { error } = await supabase
    .from('google_leads')
    .update(update)
    .eq('id', id);

  if (error) {
    console.error('❌ [GOOGLE-MAPS] Erro ao atualizar:', error.message);
    return false;
  }

  return true;
}

/**
 * Get scraping stats
 */
export async function getScrapingStats(days: number = 7): Promise<any> {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - days);

  const { data, error } = await supabase
    .from('google_leads')
    .select('status, search_theme, search_city, instagram_username')
    .gte('captured_at', daysAgo.toISOString())
    .order('captured_at', { ascending: false });

  if (error) {
    return { error: error.message };
  }

  const stats = {
    total: data?.length || 0,
    by_status: {} as Record<string, number>,
    by_theme: {} as Record<string, number>,
    by_city: {} as Record<string, number>
  };

  for (const lead of data || []) {
    stats.by_status[lead.status] = (stats.by_status[lead.status] || 0) + 1;
    if (lead.search_theme) {
      stats.by_theme[lead.search_theme] = (stats.by_theme[lead.search_theme] || 0) + 1;
    }
    if (lead.search_city) {
      stats.by_city[lead.search_city] = (stats.by_city[lead.search_city] || 0) + 1;
    }
  }

  return stats;
}

/**
 * Scrape um ponto do grid pelo ID
 * Busca o ponto na tabela scraping_grid_points e executa scrape para cada keyword
 */
export async function scrapeGridPoint(pointId: number): Promise<{
  point: any;
  results: { keyword: string; result: ScrapeResult }[];
  totals: { scraped: number; instagram: number; saved: number };
}> {
  // Buscar ponto
  const { data: point, error } = await supabase
    .from('scraping_grid_points')
    .select('*')
    .eq('id', pointId)
    .single();

  if (error || !point) {
    throw new Error(`Ponto ${pointId} não encontrado`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 SCRAPING GRID POINT #${pointId}`);
  console.log(`📍 ${point.bairro} (${point.regiao})`);
  console.log(`📍 ${point.lat}, ${point.lng}`);
  console.log(`🏷️ Keywords: ${point.keywords.join(', ')}`);
  console.log(`${'='.repeat(60)}\n`);

  // Marcar como em progresso
  await supabase
    .from('scraping_grid_points')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', pointId);

  const results: { keyword: string; result: ScrapeResult }[] = [];
  const totals = { scraped: 0, instagram: 0, saved: 0 };

  // Executar scrape para cada keyword
  for (const keyword of point.keywords) {
    console.log(`\n🔍 Keyword: "${keyword}"`);

    const result = await scrapeGoogleMaps({
      termo: keyword,
      cidade: point.cidade,
      estado: point.estado,
      lat: parseFloat(point.lat),
      lng: parseFloat(point.lng),
      zoom: 17,
      max_resultados: 50,
      saveToDb: true,
      gridPointId: pointId
    });

    results.push({ keyword, result });
    totals.scraped += result.total_scraped;
    totals.instagram += result.with_instagram;
    totals.saved += result.saved;

    // Pausa entre keywords
    if (point.keywords.indexOf(keyword) < point.keywords.length - 1) {
      console.log(`⏳ Aguardando 30s antes da próxima keyword...`);
      await humanDelay(25000, 35000);
    }
  }

  // Atualizar totais do ponto
  await supabase
    .from('scraping_grid_points')
    .update({
      status: 'completed',
      total_results: totals.scraped,
      total_with_instagram: totals.instagram,
      last_scraped: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', pointId);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ PONTO #${pointId} CONCLUÍDO`);
  console.log(`   Total processados: ${totals.scraped}`);
  console.log(`   Total com Instagram: ${totals.instagram}`);
  console.log(`   Total salvos: ${totals.saved}`);
  console.log(`${'='.repeat(60)}\n`);

  return { point, results, totals };
}

export default {
  scrapeGoogleMaps,
  scrapeGoogleMapsDetailed,
  scrapeGridPoint,
  getPendingLeadsForEnrichment,
  updateLeadStatus,
  getScrapingStats,
  getScrapeLogs,
  clearScrapeLogs,
  closeBrowser
};
