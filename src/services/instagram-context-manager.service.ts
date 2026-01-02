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

// 🆕 PÁGINA PERSISTENTE - reutilizada entre operações
let persistentPage: Page | null = null;
let persistentRequestId: string | null = null;

/**
 * Gera ID único para tracking de requisição
 */
function generateRequestId(): string {
  return `page_${++pageCounter}_${Date.now()}`;
}

/**
 * Cria ou reutiliza uma página com cookies autenticados
 *
 * 🆕 OTIMIZAÇÃO v3: PÁGINA PERSISTENTE
 * - Reutiliza a mesma página entre operações
 * - Só cria nova se a página atual estiver fechada/inválida
 * - Evita erros de "detached frame" causados por múltiplas páginas
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

  // 🆕 VERIFICAR SE PÁGINA PERSISTENTE EXISTE E ESTÁ VÁLIDA
  if (persistentPage && !persistentPage.isClosed()) {
    try {
      // Testar se frame está válido
      await persistentPage.evaluate(() => window.location.href);

      console.log(`♻️  Reutilizando página existente: ${persistentRequestId}`);

      // Retornar página existente com cleanup que NÃO fecha a página
      return {
        page: persistentPage,
        requestId: persistentRequestId!,
        cleanup: async () => {
          // 🆕 NÃO fechar a página - apenas log
          console.log(`   ℹ️  Página ${persistentRequestId} mantida aberta para próxima operação`);
        }
      };
    } catch (frameError: any) {
      console.log(`⚠️  Página existente inválida (${frameError.message}). Criando nova...`);
      // Página está corrompida - fechar e criar nova
      try {
        await persistentPage.close();
      } catch {}
      // 🔧 FIX: Remover entrada antiga do Map para evitar dessincronização
      if (persistentRequestId) {
        activePages.delete(persistentRequestId);
      }
      persistentPage = null;
      persistentRequestId = null;
    }
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

  // 🆕 SALVAR COMO PÁGINA PERSISTENTE
  persistentPage = page;
  persistentRequestId = requestId;
  console.log(`   ✅ Página ${requestId} salva como persistente (será reutilizada)`);

  // Função de cleanup que NÃO fecha a página persistente
  const cleanup = async () => {
    // 🆕 NÃO fechar página persistente - apenas log
    console.log(`   ℹ️  Página ${requestId} mantida aberta para próxima operação`);
  };

  return { page, requestId, cleanup };
}

/**
 * 🆕 Cria uma página DEDICADA (não compartilhada)
 *
 * Diferente de createIsolatedContext:
 * - SEMPRE cria uma nova página
 * - NÃO usa a página persistente
 * - FECHA a página após o uso
 *
 * Ideal para scrapes de inbound que podem rodar em paralelo
 * sem interferir com scrape-users ou outras operações.
 */
export async function createDedicatedPage(): Promise<{
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

  const requestId = `dedicated_${++pageCounter}_${Date.now()}`;

  // SEMPRE criar nova página (não reutiliza)
  const page = await browser.newPage();

  console.log(`📄 [DEDICATED] Página dedicada criada: ${requestId}`);

  // 🔐 AUTENTICAR PROXY (se configurado)
  const proxyConfig = (browser as any)._currentProxyConfig;
  if (proxyConfig?.username && proxyConfig?.password) {
    await page.authenticate({
      username: proxyConfig.username,
      password: proxyConfig.password
    });
    console.log(`   🔐 Proxy autenticado: ${proxyConfig.username}@${proxyConfig.host}`);
  }

  // 🕵️ APLICAR STEALTH
  await applyFullStealth(page);

  // ✅ NAVEGAR para instagram.com
  await page.goto('https://www.instagram.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  }).catch(() => {});

  // Carregar cookies
  if (fs.existsSync(COOKIES_FILE)) {
    try {
      const cookiesData = fs.readFileSync(COOKIES_FILE, 'utf8');
      const cookies = JSON.parse(cookiesData);
      if (Array.isArray(cookies) && cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log(`   🔑 ${cookies.length} cookies aplicados à página dedicada ${requestId}`);
      }
    } catch (error: any) {
      console.warn(`   ⚠️  Erro ao carregar cookies: ${error.message}`);
    }
  }

  // Armazenar para tracking (mas NÃO como persistente)
  const managedPage: ManagedPage = {
    page,
    createdAt: Date.now(),
    requestId
  };
  activePages.set(requestId, managedPage);

  // Função de cleanup que REALMENTE fecha a página
  const cleanup = async () => {
    try {
      if (!page.isClosed()) {
        await page.close();
        console.log(`🗑️  [DEDICATED] Página ${requestId} fechada`);
      }
    } catch (err: any) {
      console.warn(`⚠️  Erro ao fechar página dedicada: ${err.message}`);
    } finally {
      activePages.delete(requestId);
    }
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
 * 🆕 Força fechamento da página persistente (para erros críticos como 429)
 */
export async function forceClosePersistentPage(): Promise<void> {
  if (persistentPage) {
    try {
      if (!persistentPage.isClosed()) {
        await persistentPage.close();
        console.log(`🗑️  Página persistente ${persistentRequestId} fechada forçadamente`);
      }
    } catch (err: any) {
      console.warn(`⚠️  Erro ao fechar página persistente: ${err.message}`);
    }
    persistentPage = null;
    persistentRequestId = null;
  }
}

/**
 * Limpa todas as páginas ativas (útil para shutdown graceful)
 */
export async function cleanupAllContexts(): Promise<void> {
  console.log(`🧹 Limpando ${activePages.size} páginas ativas...`);

  // 🆕 TAMBÉM LIMPAR PÁGINA PERSISTENTE
  await forceClosePersistentPage();

  const cleanupPromises = Array.from(activePages.keys()).map(requestId =>
    cleanupPage(requestId)
  );

  await Promise.allSettled(cleanupPromises);
  activePages.clear();

  console.log('✅ Todas as páginas limpas');
}

/**
 * Retorna estatísticas das páginas ativas
 * 🔧 FIX: Agora verifica se as páginas ainda estão realmente abertas
 */
export function getContextStats(): {
  activeCount: number;
  contexts: Array<{ requestId: string; ageSeconds: number; isOpen: boolean }>;
} {
  const now = Date.now();
  const contexts = Array.from(activePages.values()).map(ctx => ({
    requestId: ctx.requestId,
    ageSeconds: (now - ctx.createdAt) / 1000,
    isOpen: !ctx.page.isClosed()
  }));

  // Contar apenas páginas realmente abertas
  const openCount = contexts.filter(c => c.isOpen).length;

  return {
    activeCount: openCount,
    contexts
  };
}

/**
 * 🔧 FIX: Sincroniza o Map com o estado real do browser
 * Remove entradas de páginas que foram fechadas externamente
 */
export async function syncContextsWithBrowser(): Promise<number> {
  const closedIds: string[] = [];

  for (const [requestId, managed] of activePages.entries()) {
    if (managed.page.isClosed()) {
      closedIds.push(requestId);
    }
  }

  if (closedIds.length > 0) {
    console.log(`🔄 Sincronizando: removendo ${closedIds.length} páginas fechadas do tracking...`);
    for (const id of closedIds) {
      activePages.delete(id);
      // Se era a página persistente, limpar referência
      if (id === persistentRequestId) {
        persistentPage = null;
        persistentRequestId = null;
      }
    }
  }

  return closedIds.length;
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


