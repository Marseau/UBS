// @ts-nocheck - Este arquivo contém código que roda no contexto do browser (DOM APIs)
/**
 * 🕵️ INSTAGRAM STEALTH SERVICE
 * Sistema anti-detecção profissional para scraping invisível
 */

import { Page } from 'puppeteer';
import path from 'path';
import os from 'os';

// ========== CONFIGURAÇÕES DE STEALTH ==========

/**
 * Args seguros do Puppeteer (SEM flags suspeitas)
 * ❌ REMOVIDOS: --disable-gpu, --disable-web-security, --disable-features=IsolateOrigins, --disable-accelerated-2d-canvas
 * ✅ APENAS flags que navegadores reais usam
 */
export const STEALTH_BROWSER_ARGS = [
  '--start-maximized',
  '--no-sandbox', // Necessário para alguns ambientes (Docker)
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage', // Evita problemas de memória compartilhada
  '--disable-blink-features=AutomationControlled', // CRÍTICO: remove navigator.webdriver
  '--exclude-switches=enable-automation', // Remove banner de automação
  '--disable-infobars', // Remove "Chrome is being controlled"
  '--window-size=1920,1080', // Tamanho realista
  '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

/**
 * Diretório para sessões persistentes (userDataDir)
 * Cada conta terá seu próprio diretório para manter fingerprint consistente
 */
export function getUserDataDir(accountUsername: string): string {
  const baseDir = path.join(os.homedir(), '.instagram-sessions');
  const sanitizedUsername = accountUsername.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(baseDir, sanitizedUsername);
}

/**
 * 🎭 EVASÃO DE FINGERPRINTS
 * Mascara WebGL, Canvas, WebRTC e hardwareConcurrency
 */
export async function applyStealthScripts(page: Page): Promise<void> {
  console.log('🕵️  Aplicando scripts anti-detecção...');

  await page.evaluateOnNewDocument(() => {
    // ========== 1. REMOVE navigator.webdriver ==========
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });

    // ========== 2. WEBGL FINGERPRINT ==========
    // Mascara gl.getParameter() para parecer Mac real
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter: any) {
      // UNMASKED_VENDOR_WEBGL
      if (parameter === 37445) {
        return 'Apple Inc.';
      }
      // UNMASKED_RENDERER_WEBGL
      if (parameter === 37446) {
        return 'Apple M2'; // Mac M2 real
      }
      return getParameter.call(this, parameter);
    };

    // ========== 3. CANVAS FINGERPRINT ==========
    // Adiciona ruído mínimo ao canvas para evitar hashing
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type?: string) {
      const context = this.getContext('2d');
      if (context) {
        // Adiciona pixel transparente com ruído mínimo
        const imageData = context.getImageData(0, 0, this.width, this.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] += Math.floor(Math.random() * 2); // Ruído < 2
        }
        context.putImageData(imageData, 0, 0);
      }
      return originalToDataURL.call(this, type);
    };

    // ========== 4. WEBRTC IP LEAK ==========
    // Desabilita WebRTC para evitar leak de IP local
    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;
    if (originalGetUserMedia) {
      navigator.mediaDevices.getUserMedia = function() {
        return Promise.reject(new Error('Permission denied'));
      };
    }

    // Remove RTCPeerConnection (bloqueia leak de IP)
    // @ts-ignore
    window.RTCPeerConnection = undefined;
    // @ts-ignore
    window.webkitRTCPeerConnection = undefined;

    // ========== 5. HARDWARE CONCURRENCY ==========
    // Mac M2 tem 8-10 cores, não 1 (headless padrão)
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8
    });

    // ========== 6. CHROME APP/RUNTIME ==========
    // Remove indicadores de automação
    // @ts-ignore
    window.chrome = {
      runtime: {}
    };

    // ========== 7. PERMISSIONS ==========
    // Simula permissões realistas
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = function(parameters: any) {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: 'denied' } as PermissionStatus);
        }
        return originalQuery.call(window.navigator.permissions, parameters);
      };
    }

    // ========== 8. PLUGINS ==========
    // Simula plugins realistas (Chrome não tem plugins)
    Object.defineProperty(navigator, 'plugins', {
      get: () => []
    });

    console.log('✅ Scripts anti-detecção aplicados');
  });
}

/**
 * 🎲 DELAYS HUMANIZADOS
 * Randomização realista de delays
 */
export function humanDelay(min = 500, max = 3000): number {
  // Distribuição não-linear (mais natural)
  const random = Math.random();
  const skewed = Math.pow(random, 1.5); // Favorece valores menores
  return Math.floor(min + skewed * (max - min));
}

/**
 * ⏱️ Aguardar com delay humanizado
 */
export async function waitHuman(min = 500, max = 3000): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, humanDelay(min, max)));
}

/**
 * 🖱️ MOVIMENTO DE MOUSE HUMANO
 * Simula movimento realista com curva Bezier
 */
export async function moveMouseHuman(
  page: Page,
  targetX: number,
  targetY: number
): Promise<void> {
  const start = { x: 0, y: 0 };
  const steps = Math.floor(Math.random() * 20) + 10; // 10-30 steps

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Curva Bezier para movimento natural
    const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    const x = start.x + (targetX - start.x) * easeT;
    const y = start.y + (targetY - start.y) * easeT;

    await page.mouse.move(x, y);
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10 + 5));
  }
}

/**
 * ⌨️ DIGITAÇÃO HUMANIZADA
 * Simula velocidade de digitação realista
 */
export async function typeHuman(
  page: Page,
  selector: string,
  text: string
): Promise<void> {
  await page.click(selector);
  await waitHuman(100, 300);

  for (const char of text) {
    await page.keyboard.type(char);
    // Velocidade variável: 50-200ms por caractere
    await new Promise(resolve => setTimeout(resolve, humanDelay(50, 200)));
  }
}

/**
 * 📜 SCROLL HUMANIZADO
 * Simula scroll realista com variações
 */
export async function scrollHuman(
  page: Page,
  distance: number
): Promise<void> {
  const steps = Math.floor(Math.random() * 5) + 3; // 3-8 steps
  const stepDistance = distance / steps;

  for (let i = 0; i < steps; i++) {
    await page.evaluate((dist) => {
      window.scrollBy({
        top: dist + (Math.random() * 20 - 10), // Variação de ±10px
        behavior: 'smooth'
      });
    }, stepDistance);

    await waitHuman(100, 300);
  }
}

/**
 * 🚨 DETECÇÃO DE CHALLENGES DE SEGURANÇA
 * Detecta páginas de verificação do Instagram
 */
export async function detectInstagramChallenge(page: Page): Promise<{
  hasChallenge: boolean;
  type: string | null;
  message: string | null;
}> {
  try {
    const url = page.url();
    const html = await page.content();

    // Challenge 1: "Confirm it's you"
    if (url.includes('/challenge/') || html.includes('Confirm it\'s you')) {
      return {
        hasChallenge: true,
        type: 'CONFIRM_IDENTITY',
        message: 'Instagram solicitou confirmação de identidade'
      };
    }

    // Challenge 2: "Suspicious login attempt"
    if (html.includes('Suspicious') || html.includes('unusual')) {
      return {
        hasChallenge: true,
        type: 'SUSPICIOUS_LOGIN',
        message: 'Instagram detectou login suspeito'
      };
    }

    // Challenge 3: "This was me" button
    const hasThisWasMeButton = await page.evaluate(() => {
      return document.body.textContent?.includes('This was me') ||
             document.body.textContent?.includes('Era eu');
    });

    if (hasThisWasMeButton) {
      return {
        hasChallenge: true,
        type: 'THIS_WAS_ME',
        message: 'Instagram requer confirmação "This was me"'
      };
    }

    // Challenge 4: SMS/Email verification
    if (url.includes('/accounts/login/two_factor') || html.includes('security code')) {
      return {
        hasChallenge: true,
        type: 'TWO_FACTOR',
        message: 'Instagram solicitou código de verificação'
      };
    }

    // Challenge 5: Página em branco (anti-bot)
    // ⚠️ IMPORTANTE: Só considerar BLANK_PAGE se já navegou para o Instagram
    const bodyText = await page.evaluate(() => document.body.textContent?.trim());
    const isInstagramUrl = url.includes('instagram.com');
    if (isInstagramUrl && (!bodyText || bodyText.length < 100)) {
      return {
        hasChallenge: true,
        type: 'BLANK_PAGE',
        message: 'Página em branco detectada (possível anti-bot)'
      };
    }

    // Challenge 6: Rate limit page
    if (html.includes('Try again later') || html.includes('Tente novamente')) {
      return {
        hasChallenge: true,
        type: 'RATE_LIMIT',
        message: 'Instagram bloqueou temporariamente'
      };
    }

    return {
      hasChallenge: false,
      type: null,
      message: null
    };

  } catch (error: any) {
    console.warn(`⚠️  Erro ao detectar challenge: ${error.message}`);
    return {
      hasChallenge: false,
      type: null,
      message: null
    };
  }
}

/**
 * 🎯 APLICAR TODAS AS MEDIDAS DE STEALTH
 * Função principal que aplica tudo
 */
export async function applyFullStealth(page: Page): Promise<void> {
  console.log('\n🕵️  ========== APLICANDO STEALTH COMPLETO ==========');

  // 1. Scripts anti-detecção
  await applyStealthScripts(page);

  // 2. Verificar challenges
  const challenge = await detectInstagramChallenge(page);
  if (challenge.hasChallenge) {
    console.log(`🚨 CHALLENGE DETECTADO: ${challenge.type}`);
    console.log(`   Mensagem: ${challenge.message}`);
  }

  console.log('========================================\n');
}
