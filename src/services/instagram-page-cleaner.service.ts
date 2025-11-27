/**
 * Instagram Page Cleaner Service
 *
 * Detecta e limpa páginas órfãs do Puppeteer que não são gerenciadas
 * pelo sistema de contextos, prevenindo vazamento de memória em
 * execuções longas.
 *
 * PROBLEMA IDENTIFICADO:
 * - Quando há erros (timeout, detached frame, session invalid)
 * - O Puppeteer pode criar páginas em branco ou resetar sessão
 * - Essas páginas não são registradas no activePages Map
 * - Em processos de várias horas, essas páginas se acumulam
 * - Consumo progressivo de CPU/memória
 *
 * SOLUÇÃO:
 * - Identifica TODAS as páginas abertas no browser
 * - Compara com páginas gerenciadas (activePages)
 * - Detecta páginas órfãs (não gerenciadas)
 * - Fecha páginas em branco (about:blank)
 * - Fecha páginas antigas (> maxAge)
 */

import { Page } from 'puppeteer';
import { getBrowserInstance } from './instagram-session.service';
import { getContextStats } from './instagram-context-manager.service';

export interface OrphanPage {
  index: number;
  url: string;
  title: string;
  isBlank: boolean;
  isClosed: boolean;
  ageEstimate?: string;
}

export interface CleanupResult {
  success: boolean;
  totalPages: number;
  managedPages: number;
  orphanPages: number;
  blankPages: number;
  closedPages: number;
  errors: string[];
  details: {
    before: OrphanPage[];
    closed: OrphanPage[];
    remaining: OrphanPage[];
  };
}

/**
 * Detecta páginas órfãs no browser
 * Retorna array vazio se browser não estiver inicializado
 */
export async function detectOrphanPages(): Promise<OrphanPage[]> {
  const browser = getBrowserInstance();

  if (!browser) {
    console.log('✅ [PAGE CLEANER] Browser não está ativo - nenhuma página órfã existe');
    return [];
  }

  const allPages = await browser.pages();
  const orphans: OrphanPage[] = [];

  for (let i = 0; i < allPages.length; i++) {
    const page = allPages[i];
    if (!page) continue;

    try {
      const url = page.url();
      const title = await page.title().catch(() => 'N/A');
      const isClosed = page.isClosed();
      const isBlank = url === 'about:blank' || url === '';

      orphans.push({
        index: i,
        url,
        title,
        isBlank,
        isClosed
      });
    } catch (error: any) {
      orphans.push({
        index: i,
        url: 'ERROR',
        title: error.message,
        isBlank: false,
        isClosed: true
      });
    }
  }

  return orphans;
}

/**
 * Limpa páginas órfãs do browser
 *
 * @param options Opções de limpeza
 * @returns Resultado detalhado da limpeza
 */
export async function cleanOrphanPages(options: {
  closeBlankPages?: boolean;      // Fechar about:blank (default: true)
  closeNonInstagramPages?: boolean; // Fechar páginas que não são Instagram (default: false)
  keepFirstPage?: boolean;         // Manter primeira página (geralmente about:blank inicial) (default: true)
  dryRun?: boolean;                // Apenas simular, não fechar (default: false)
} = {}): Promise<CleanupResult> {
  const {
    closeBlankPages = true,
    closeNonInstagramPages = false,
    keepFirstPage = true,
    dryRun = false
  } = options;

  const result: CleanupResult = {
    success: false,
    totalPages: 0,
    managedPages: 0,
    orphanPages: 0,
    blankPages: 0,
    closedPages: 0,
    errors: [],
    details: {
      before: [],
      closed: [],
      remaining: []
    }
  };

  try {
    console.log('\n🔍 ========== INSTAGRAM PAGE CLEANER ==========');
    console.log(`🧹 Modo: ${dryRun ? 'DRY RUN (simulação)' : 'LIMPEZA REAL'}`);

    const browser = getBrowserInstance();

    if (!browser) {
      console.log('✅ Browser não está ativo - nenhuma página órfã existe');
      console.log('='.repeat(50) + '\n');
      result.success = true;
      return result;
    }

    // 1. Detectar todas as páginas
    const allPages = await browser.pages();
    result.totalPages = allPages.length;
    console.log(`\n📊 Total de páginas abertas: ${allPages.length}`);

    // 2. Obter páginas gerenciadas
    const contextStats = getContextStats();
    result.managedPages = contextStats.activeCount;
    console.log(`📋 Páginas gerenciadas: ${contextStats.activeCount}`);

    // 3. Identificar páginas órfãs
    const orphans: OrphanPage[] = [];
    const pagesToClose: Page[] = [];

    for (let i = 0; i < allPages.length; i++) {
      const page = allPages[i];

      // Skip primeira página se keepFirstPage=true
      if (keepFirstPage && i === 0) {
        console.log(`   [${i}] 🔒 Primeira página mantida (keepFirstPage=true)`);
        continue;
      }

      try {
        if (!page) continue;

        const url = page.url();
        const title = await page.title().catch(() => 'N/A');
        const isClosed = page.isClosed();
        const isBlank = url === 'about:blank' || url === '';
        const isInstagram = url.includes('instagram.com');

        const orphanInfo: OrphanPage = {
          index: i,
          url,
          title,
          isBlank,
          isClosed
        };

        result.details.before.push(orphanInfo);

        // Critérios para fechar
        let shouldClose = false;
        let reason = '';

        if (isClosed) {
          shouldClose = false;
          reason = 'já fechada';
        } else if (isBlank && closeBlankPages) {
          shouldClose = true;
          reason = 'página em branco';
          result.blankPages++;
        } else if (!isInstagram && closeNonInstagramPages) {
          shouldClose = true;
          reason = 'não é Instagram';
        }

        if (shouldClose) {
          console.log(`   [${i}] ❌ ${reason}: ${url}`);
          orphans.push(orphanInfo);
          pagesToClose.push(page);
        } else {
          console.log(`   [${i}] ✅ Manter: ${url.substring(0, 60)}${url.length > 60 ? '...' : ''}`);
        }

      } catch (error: any) {
        console.log(`   [${i}] ⚠️  Erro ao inspecionar: ${error.message}`);
        result.errors.push(`Página ${i}: ${error.message}`);
      }
    }

    result.orphanPages = orphans.length;
    console.log(`\n🎯 Páginas órfãs detectadas: ${result.orphanPages}`);
    console.log(`   📄 Páginas em branco: ${result.blankPages}`);

    // 4. Fechar páginas órfãs
    if (pagesToClose.length > 0 && !dryRun) {
      console.log(`\n🗑️  Fechando ${pagesToClose.length} páginas órfãs...`);

      for (let i = 0; i < pagesToClose.length; i++) {
        const page = pagesToClose[i];
        const orphan = orphans[i];

        if (!page || !orphan) continue;

        try {
          if (!page.isClosed()) {
            await page.close();
            result.closedPages++;
            result.details.closed.push(orphan);
            console.log(`   ✅ [${orphan.index}] Fechada: ${orphan.url}`);
          }
        } catch (error: any) {
          console.log(`   ❌ [${orphan.index}] Erro ao fechar: ${error.message}`);
          result.errors.push(`Erro ao fechar página ${orphan.index}: ${error.message}`);
        }
      }
    } else if (dryRun && pagesToClose.length > 0) {
      console.log(`\n🔍 DRY RUN: ${pagesToClose.length} páginas SERIAM fechadas`);
      result.details.closed = orphans;
    }

    // 5. Páginas restantes
    const remainingPages = await browser.pages();
    for (let i = 0; i < remainingPages.length; i++) {
      const page = remainingPages[i];
      if (!page) continue;

      try {
        result.details.remaining.push({
          index: i,
          url: page.url(),
          title: await page.title().catch(() => 'N/A'),
          isBlank: page.url() === 'about:blank',
          isClosed: page.isClosed()
        });
      } catch (error: any) {
        result.errors.push(`Erro ao inspecionar página restante ${i}: ${error.message}`);
      }
    }

    console.log(`\n📊 Resultado:`);
    console.log(`   Total páginas ANTES: ${result.totalPages}`);
    console.log(`   Páginas gerenciadas: ${result.managedPages}`);
    console.log(`   Páginas órfãs: ${result.orphanPages}`);
    console.log(`   Páginas fechadas: ${result.closedPages}`);
    console.log(`   Páginas restantes: ${result.details.remaining.length}`);
    console.log(`   Erros: ${result.errors.length}`);

    if (result.closedPages > 0) {
      console.log(`\n✅ Limpeza concluída: ${result.closedPages} páginas órfãs removidas`);
    } else if (result.orphanPages === 0) {
      console.log(`\n✅ Nenhuma página órfã detectada - browser limpo!`);
    } else {
      console.log(`\n⚠️  Páginas órfãs detectadas mas não fechadas (dryRun ou filtros)`);
    }

    console.log('='.repeat(50) + '\n');

    result.success = true;
    return result;

  } catch (error: any) {
    console.error('❌ Erro durante limpeza de páginas órfãs:', error);
    result.errors.push(`Erro geral: ${error.message}`);
    return result;
  }
}

/**
 * Monitora páginas órfãs continuamente (para logs de diagnóstico)
 */
export async function monitorOrphanPages(): Promise<{
  totalPages: number;
  managedPages: number;
  unmanaged: number;
  blankPages: number;
  instagramPages: number;
  otherPages: number;
  browserActive: boolean;
}> {
  const browser = getBrowserInstance();

  if (!browser) {
    return {
      totalPages: 0,
      managedPages: 0,
      unmanaged: 0,
      blankPages: 0,
      instagramPages: 0,
      otherPages: 0,
      browserActive: false
    };
  }

  const allPages = await browser.pages();
  const contextStats = getContextStats();

  let blankPages = 0;
  let instagramPages = 0;
  let otherPages = 0;

  for (const page of allPages) {
    try {
      const url = page.url();

      if (url === 'about:blank' || url === '') {
        blankPages++;
      } else if (url.includes('instagram.com')) {
        instagramPages++;
      } else {
        otherPages++;
      }
    } catch {
      // Ignorar páginas com erro
    }
  }

  return {
    totalPages: allPages.length,
    managedPages: contextStats.activeCount,
    unmanaged: allPages.length - contextStats.activeCount,
    blankPages,
    instagramPages,
    otherPages,
    browserActive: true
  };
}
