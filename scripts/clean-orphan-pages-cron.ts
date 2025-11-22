#!/usr/bin/env ts-node
/**
 * Script de Limpeza Automática de Páginas Órfãs do Instagram Scraper
 *
 * OBJETIVO:
 * - Prevenir vazamento de memória em execuções longas
 * - Limpar páginas em branco (about:blank) que ficam órfãs
 * - Reduzir consumo progressivo de CPU/memória
 *
 * USO:
 *
 * 1. Manual:
 *    npm run clean:orphan-pages
 *
 * 2. Via CRON (a cada 30 minutos):
 *    */30 * * * * cd /path/to/WhatsAppSalon-N8N && npm run clean:orphan-pages >> logs/orphan-cleaner.log 2>&1
 *
 * 3. Via CRON (a cada hora):
 *    0 * * * * cd /path/to/WhatsAppSalon-N8N && npm run clean:orphan-pages >> logs/orphan-cleaner.log 2>&1
 *
 * CONFIGURAÇÃO:
 * Adicione ao package.json:
 * {
 *   "scripts": {
 *     "clean:orphan-pages": "ts-node scripts/clean-orphan-pages-cron.ts"
 *   }
 * }
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import após carregar .env
import { cleanOrphanPages, monitorOrphanPages } from '../src/services/instagram-page-cleaner.service';

/**
 * Configuração do script
 */
const CONFIG = {
  // Fechar páginas em branco (about:blank)
  closeBlankPages: true,

  // Fechar páginas que não são Instagram
  closeNonInstagramPages: false,

  // Manter primeira página do browser (geralmente about:blank inicial)
  keepFirstPage: true,

  // Modo dry-run (apenas simular, não fechar)
  dryRun: process.env.ORPHAN_CLEANER_DRY_RUN === 'true' || false,

  // Log detalhado
  verbose: process.env.ORPHAN_CLEANER_VERBOSE === 'true' || true
};

/**
 * Função principal
 */
async function main() {
  const startTime = Date.now();

  console.log('\n' + '='.repeat(70));
  console.log('🧹 INSTAGRAM ORPHAN PAGE CLEANER - CRON JOB');
  console.log('='.repeat(70));
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`🔧 Modo: ${CONFIG.dryRun ? 'DRY RUN (simulação)' : 'LIMPEZA REAL'}`);
  console.log(`📋 Configuração:`);
  console.log(`   - closeBlankPages: ${CONFIG.closeBlankPages}`);
  console.log(`   - closeNonInstagramPages: ${CONFIG.closeNonInstagramPages}`);
  console.log(`   - keepFirstPage: ${CONFIG.keepFirstPage}`);
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Monitorar estado ANTES da limpeza
    console.log('📊 Estado ANTES da limpeza:');
    const statsBefore = await monitorOrphanPages();
    console.log(`   Total páginas: ${statsBefore.totalPages}`);
    console.log(`   Páginas gerenciadas: ${statsBefore.managedPages}`);
    console.log(`   Páginas não gerenciadas: ${statsBefore.unmanaged}`);
    console.log(`   Páginas em branco: ${statsBefore.blankPages}`);
    console.log(`   Páginas Instagram: ${statsBefore.instagramPages}`);
    console.log(`   Outras páginas: ${statsBefore.otherPages}\n`);

    // Verificar se há páginas para limpar
    if (statsBefore.blankPages === 0 && statsBefore.unmanaged === 0) {
      console.log('✅ Nenhuma página órfã detectada - browser limpo!');
      console.log('⏭️  Pulando limpeza.\n');
      console.log('='.repeat(70));
      console.log(`✅ Script concluído em ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
      console.log('='.repeat(70) + '\n');
      process.exit(0);
    }

    // 2. Executar limpeza
    const result = await cleanOrphanPages({
      closeBlankPages: CONFIG.closeBlankPages,
      closeNonInstagramPages: CONFIG.closeNonInstagramPages,
      keepFirstPage: CONFIG.keepFirstPage,
      dryRun: CONFIG.dryRun
    });

    // 3. Monitorar estado DEPOIS da limpeza
    console.log('\n📊 Estado DEPOIS da limpeza:');
    const statsAfter = await monitorOrphanPages();
    console.log(`   Total páginas: ${statsAfter.totalPages}`);
    console.log(`   Páginas gerenciadas: ${statsAfter.managedPages}`);
    console.log(`   Páginas não gerenciadas: ${statsAfter.unmanaged}`);
    console.log(`   Páginas em branco: ${statsAfter.blankPages}`);
    console.log(`   Páginas Instagram: ${statsAfter.instagramPages}`);
    console.log(`   Outras páginas: ${statsAfter.otherPages}\n`);

    // 4. Relatório final
    console.log('='.repeat(70));
    console.log('📋 RELATÓRIO DE LIMPEZA');
    console.log('='.repeat(70));
    console.log(`Status: ${result.success ? '✅ SUCESSO' : '❌ FALHA'}`);
    console.log(`Páginas fechadas: ${result.closedPages}`);
    console.log(`Erros: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log('\n❌ Erros encontrados:');
      result.errors.forEach((error, i) => {
        console.log(`   ${i + 1}. ${error}`);
      });
    }

    // Calcular economia
    const pagesRemoved = statsBefore.totalPages - statsAfter.totalPages;
    const unmanagedReduced = statsBefore.unmanaged - statsAfter.unmanaged;
    const blankPagesRemoved = statsBefore.blankPages - statsAfter.blankPages;

    console.log('\n💾 Economia de recursos:');
    console.log(`   Páginas removidas: ${pagesRemoved}`);
    console.log(`   Não gerenciadas reduzidas: ${unmanagedReduced}`);
    console.log(`   Páginas em branco removidas: ${blankPagesRemoved}`);

    if (pagesRemoved > 0) {
      // Estimar economia de memória (aproximadamente 50-100MB por página)
      const memoryFreedMB = pagesRemoved * 75; // Média de 75MB por página
      console.log(`   Memória liberada (estimativa): ~${memoryFreedMB}MB`);
    }

    console.log('='.repeat(70));
    console.log(`✅ Script concluído em ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log('='.repeat(70) + '\n');

    // Exit code baseado no resultado
    process.exit(result.success ? 0 : 1);

  } catch (error: any) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ ERRO FATAL');
    console.error('='.repeat(70));
    console.error(`Mensagem: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    console.error('='.repeat(70) + '\n');
    process.exit(1);
  }
}

// Executar
main();
