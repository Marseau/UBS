// @ts-nocheck - puppeteer contexts usam DOM APIs sem typings fortes
import { Browser, Page } from 'puppeteer';
import { getBrowserInstance, ensureLoggedSession } from './instagram-session.service';
import { applyFullStealth } from './instagram-stealth.service';
import fs from 'fs';
import path from 'path';

const COOKIES_FILE = path.join(process.cwd(), 'instagram-cookies.json');

/**
 * Sistema de gerenciamento de Páginas para requisições paralelas
 *
 * OTIMIZAÇÃO v2:
 * - 1 janela do navegador apenas
 * - Múltiplas abas (páginas) na mesma janela
 * - Cookies compartilhados automaticamente
 * - Menor overhead que BrowserContexts
 * - Footprint visual reduzido
 *
 * ANTES (v1 - Contexts):
 * - 1 browser → N contexts → N páginas
 * - Isolamento máximo, overhead médio
 *
 * AGORA (v2 - Páginas simples):
 * - 1 browser → N páginas diretas
 * - Isolamento suficiente, overhead mínimo
 */

interface ManagedPage {
  page: Page;
  createdAt: number;
  requestId: string;
}

const activePages = new Map<string, ManagedPage>();
let pageCounter = 0;

/**
 * Gera ID único para tracking de requisição
 */
function generateRequestId(): string {
  return `page_${++pageCounter}_${Date.now()}`;
}

/**
 * Cria uma página simples com cookies autenticados
 *
 * OTIMIZAÇÃO: Usa páginas diretas sem BrowserContexts para reduzir overhead
 *
 * @returns Objeto com page, requestId e cleanup function
 */
export async function createIsolatedContext(): Promise<{
  page: Page;
  requestId: string;
  cleanup: () => Promise<void>;
}> {
  // Garantir que browser principal está autenticado
  await ensureLoggedSession();

  const browser = getBrowserInstance();
  if (!browser) {
    throw new Error('Browser não inicializado.');
  }

  const requestId = generateRequestId();

  // Criar página simples (sem context isolado)
  const page = await browser.newPage();

  console.log(`📄 Página criada: ${requestId}`);

  // 🔐 AUTENTICAR PROXY (se configurado) - ANTES de qualquer navegação
  const proxyConfig = (browser as any)._currentProxyConfig;
  if (proxyConfig?.username && proxyConfig?.password) {
    await page.authenticate({
      username: proxyConfig.username,
      password: proxyConfig.password
    });
    console.log(`   🔐 Proxy autenticado: ${proxyConfig.username}@${proxyConfig.host}`);
  }

  // 🕵️ APLICAR STEALTH COMPLETO (fingerprint evasion + challenge detection)
  await applyFullStealth(page);

  // ✅ NAVEGAR PRIMEIRO para instagram.com para aceitar cookies do domínio
  await page.goto('https://www.instagram.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  }).catch(() => {});

  // Carregar cookies do arquivo (sessionPage foi fechada após login)
  if (fs.existsSync(COOKIES_FILE)) {
    try {
      const cookiesData = fs.readFileSync(COOKIES_FILE, 'utf8');
      const cookies = JSON.parse(cookiesData);
      if (Array.isArray(cookies) && cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log(`   🔑 ${cookies.length} cookies aplicados à página ${requestId}`);
      }
    } catch (error: any) {
      console.warn(`   ⚠️  Erro ao carregar cookies para página ${requestId}: ${error.message}`);
    }
  }

  // Armazenar página gerenciada
  const managedPage: ManagedPage = {
    page,
    createdAt: Date.now(),
    requestId
  };
  activePages.set(requestId, managedPage);

  // Função de cleanup para garantir limpeza
  const cleanup = async () => {
    await cleanupPage(requestId);
  };

  return { page, requestId, cleanup };
}

/**
 * Limpa uma página específica
 */
async function cleanupPage(requestId: string): Promise<void> {
  const managed = activePages.get(requestId);
  if (!managed) {
    return;
  }

  try {
    // Fechar página
    if (!managed.page.isClosed()) {
      await managed.page.close().catch((err) => {
        console.warn(`   ⚠️  Erro ao fechar página ${requestId}: ${err.message}`);
      });
    }

    const lifespan = Date.now() - managed.createdAt;
    console.log(`🗑️  Página ${requestId} limpa (vida: ${(lifespan / 1000).toFixed(1)}s)`);
  } catch (error: any) {
    console.warn(`⚠️  Erro geral ao limpar página ${requestId}: ${error.message}`);
  } finally {
    activePages.delete(requestId);
  }
}

/**
 * Limpa todas as páginas ativas (útil para shutdown graceful)
 */
export async function cleanupAllContexts(): Promise<void> {
  console.log(`🧹 Limpando ${activePages.size} páginas ativas...`);

  const cleanupPromises = Array.from(activePages.keys()).map(requestId =>
    cleanupPage(requestId)
  );

  await Promise.allSettled(cleanupPromises);
  activePages.clear();

  console.log('✅ Todas as páginas limpas');
}

/**
 * Retorna estatísticas das páginas ativas
 */
export function getContextStats(): {
  activeCount: number;
  contexts: Array<{ requestId: string; ageSeconds: number }>;
} {
  const now = Date.now();
  const contexts = Array.from(activePages.values()).map(ctx => ({
    requestId: ctx.requestId,
    ageSeconds: (now - ctx.createdAt) / 1000
  }));

  return {
    activeCount: activePages.size,
    contexts
  };
}

/**
 * Limpa páginas antigas (older than maxAgeMs)
 */
export async function cleanupStaleContexts(maxAgeMs: number = 600000): Promise<number> {
  const now = Date.now();
  const staleIds: string[] = [];

  for (const [requestId, managed] of activePages.entries()) {
    if (now - managed.createdAt > maxAgeMs) {
      staleIds.push(requestId);
    }
  }

  if (staleIds.length > 0) {
    console.log(`🧹 Limpando ${staleIds.length} páginas obsoletas (>${maxAgeMs}ms)...`);
    await Promise.allSettled(staleIds.map(id => cleanupPage(id)));
  }

  return staleIds.length;
}
