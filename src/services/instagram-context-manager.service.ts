// @ts-nocheck - puppeteer contexts usam DOM APIs sem typings fortes
import { Browser, BrowserContext, Page } from 'puppeteer';
import { getBrowserInstance, ensureLoggedSession, getSessionPage } from './instagram-session.service';

/**
 * Sistema de gerenciamento de Browser Contexts para isolamento de requisições
 *
 * PROBLEMA RESOLVIDO:
 * - Múltiplas requisições simultâneas compartilhavam o mesmo browserInstance
 * - Páginas de uma request interferiam com outras (erros "detached frame")
 *
 * SOLUÇÃO:
 * - Cada requisição recebe seu próprio BrowserContext isolado
 * - Contexts compartilham o browser mas são completamente isolados
 * - Cookies, storage, cache separados por context
 * - Cleanup automático ao finalizar requests
 */

interface ManagedContext {
  context: BrowserContext;
  page: Page;
  createdAt: number;
  requestId: string;
}

const activeContexts = new Map<string, ManagedContext>();
let contextCounter = 0;

/**
 * Gera ID único para tracking de requisição
 */
function generateRequestId(): string {
  return `ctx_${++contextCounter}_${Date.now()}`;
}

/**
 * Cria um Browser Context isolado com página autenticada
 *
 * @returns Objeto com context, page e cleanup function
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

  // Criar context isolado
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  console.log(`🔒 Context isolado criado: ${requestId}`);

  // Copiar cookies da sessão principal para o novo context
  const sessionPage = getSessionPage();
  if (sessionPage && !sessionPage.isClosed()) {
    try {
      const cookies = await sessionPage.cookies();
      if (cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log(`   🔑 ${cookies.length} cookies aplicados ao context ${requestId}`);
      }
    } catch (error: any) {
      console.warn(`   ⚠️  Erro ao copiar cookies para context ${requestId}: ${error.message}`);
    }
  }

  // Armazenar context gerenciado
  const managedContext: ManagedContext = {
    context,
    page,
    createdAt: Date.now(),
    requestId
  };
  activeContexts.set(requestId, managedContext);

  // Função de cleanup para garantir limpeza
  const cleanup = async () => {
    await cleanupContext(requestId);
  };

  return { page, requestId, cleanup };
}

/**
 * Limpa um context específico (fecha página e context)
 */
async function cleanupContext(requestId: string): Promise<void> {
  const managed = activeContexts.get(requestId);
  if (!managed) {
    return;
  }

  try {
    // Fechar página
    if (!managed.page.isClosed()) {
      await managed.page.close().catch((err) => {
        console.warn(`   ⚠️  Erro ao fechar página do context ${requestId}: ${err.message}`);
      });
    }

    // Fechar context
    await managed.context.close().catch((err) => {
      console.warn(`   ⚠️  Erro ao fechar context ${requestId}: ${err.message}`);
    });

    const lifespan = Date.now() - managed.createdAt;
    console.log(`🗑️  Context ${requestId} limpo (vida: ${(lifespan / 1000).toFixed(1)}s)`);
  } catch (error: any) {
    console.warn(`⚠️  Erro geral ao limpar context ${requestId}: ${error.message}`);
  } finally {
    activeContexts.delete(requestId);
  }
}

/**
 * Limpa todos os contexts ativos (útil para shutdown graceful)
 */
export async function cleanupAllContexts(): Promise<void> {
  console.log(`🧹 Limpando ${activeContexts.size} contexts ativos...`);

  const cleanupPromises = Array.from(activeContexts.keys()).map(requestId =>
    cleanupContext(requestId)
  );

  await Promise.allSettled(cleanupPromises);
  activeContexts.clear();

  console.log('✅ Todos os contexts limpos');
}

/**
 * Retorna estatísticas dos contexts ativos
 */
export function getContextStats(): {
  activeCount: number;
  contexts: Array<{ requestId: string; ageSeconds: number }>;
} {
  const now = Date.now();
  const contexts = Array.from(activeContexts.values()).map(ctx => ({
    requestId: ctx.requestId,
    ageSeconds: (now - ctx.createdAt) / 1000
  }));

  return {
    activeCount: activeContexts.size,
    contexts
  };
}

/**
 * Limpa contexts antigos (older than maxAgeMs)
 */
export async function cleanupStaleContexts(maxAgeMs: number = 600000): Promise<number> {
  const now = Date.now();
  const staleIds: string[] = [];

  for (const [requestId, managed] of activeContexts.entries()) {
    if (now - managed.createdAt > maxAgeMs) {
      staleIds.push(requestId);
    }
  }

  if (staleIds.length > 0) {
    console.log(`🧹 Limpando ${staleIds.length} contexts obsoletos (>${maxAgeMs}ms)...`);
    await Promise.allSettled(staleIds.map(id => cleanupContext(id)));
  }

  return staleIds.length;
}
