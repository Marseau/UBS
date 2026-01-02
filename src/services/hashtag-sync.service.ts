/**
 * HASHTAG SYNC SERVICE
 *
 * Orquestra sincronização completa:
 * PostgreSQL → CSV → OpenAI Vector Store
 *
 * Executado via Cron (1x/dia às 3AM)
 *
 * PROTEÇÃO: Lock de execução para evitar duplicatas se múltiplas
 * instâncias ou chamadas simultâneas ocorrerem.
 */

import * as fs from 'fs';
import * as path from 'path';
import { hashtagCsvExportService } from './hashtag-csv-export.service';
import { hashtagVectorStoreService } from './hashtag-vector-store.service';

export class HashtagSyncService {
  private readonly lockFilePath = path.join(process.cwd(), 'data', '.hashtag-sync.lock');
  private readonly lockTimeoutMs = 30 * 60 * 1000; // 30 minutos máximo

  /**
   * Adquire lock de execução
   * Retorna true se conseguiu o lock, false se já está em execução
   */
  private acquireLock(): boolean {
    try {
      // Verificar se lock existe e não está expirado
      if (fs.existsSync(this.lockFilePath)) {
        const lockContent = fs.readFileSync(this.lockFilePath, 'utf-8');
        const lockTime = parseInt(lockContent, 10);
        const elapsed = Date.now() - lockTime;

        if (elapsed < this.lockTimeoutMs) {
          console.log(`⚠️  Lock ativo há ${Math.round(elapsed / 1000)}s - sincronização já em andamento`);
          return false;
        }

        // Lock expirado - remover e continuar
        console.log(`🔓 Lock expirado (${Math.round(elapsed / 1000)}s) - removendo...`);
        fs.unlinkSync(this.lockFilePath);
      }

      // Garantir diretório data existe
      const dataDir = path.dirname(this.lockFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Criar lock
      fs.writeFileSync(this.lockFilePath, Date.now().toString());
      console.log('🔒 Lock adquirido com sucesso');
      return true;
    } catch (error) {
      console.error('❌ Erro ao adquirir lock:', error);
      return false;
    }
  }

  /**
   * Libera lock de execução
   */
  private releaseLock(): void {
    try {
      if (fs.existsSync(this.lockFilePath)) {
        fs.unlinkSync(this.lockFilePath);
        console.log('🔓 Lock liberado');
      }
    } catch (error) {
      console.error('❌ Erro ao liberar lock:', error);
    }
  }
  /**
   * Sincronização completa
   * PostgreSQL → CSV → Vector Store
   *
   * PROTEÇÃO: Usa lock para evitar execuções simultâneas
   */
  async syncComplete(): Promise<{
    success: boolean;
    skipped?: boolean;
    csvExport?: {
      filePath: string;
      totalRecords: number;
      fileSizeKB: number;
    };
    vectorStoreUpload?: {
      vectorStoreId: string;
      status: string;
    };
    error?: string;
  }> {
    // Tentar adquirir lock
    if (!this.acquireLock()) {
      console.log('⏭️  Sincronização ignorada - já em execução por outro processo');
      return {
        success: false,
        skipped: true,
        error: 'Sincronização já em execução por outro processo'
      };
    }

    console.log('\n🔄 ========================================');
    console.log('🔄 INICIANDO SINCRONIZAÇÃO COMPLETA');
    console.log('🔄 PostgreSQL → CSV → Vector Store');
    console.log('🔄 ========================================\n');

    const startTime = Date.now();

    try {
      // ============================================
      // ETAPA 1: Export PostgreSQL → CSV
      // ============================================
      console.log('📊 ETAPA 1/3: Export PostgreSQL → CSV');

      const csvResult = await hashtagCsvExportService.exportAllHashtags();

      console.log(`\n✅ Etapa 1 concluída!`);
      console.log(`   - ${csvResult.totalRecords.toLocaleString()} hashtags exportadas`);
      console.log(`   - ${csvResult.fileSizeKB.toLocaleString()} KB em disco\n`);

      // ============================================
      // ETAPA 2: Inicializar Vector Store
      // ============================================
      console.log('🔷 ETAPA 2/3: Inicializar Vector Store');

      const vectorStoreId = await hashtagVectorStoreService.initialize();

      console.log(`\n✅ Etapa 2 concluída!`);
      console.log(`   - Vector Store ID: ${vectorStoreId}\n`);

      // ============================================
      // ETAPA 3: Upload CSV → Vector Store
      // ============================================
      console.log('📤 ETAPA 3/3: Upload CSV → Vector Store');

      // Cleanup arquivos antigos primeiro
      await hashtagVectorStoreService.cleanupOldFiles();

      // Upload novo arquivo
      await hashtagVectorStoreService.uploadCsvFile(csvResult.filePath);

      const vectorInfo = await hashtagVectorStoreService.getInfo();

      console.log(`\n✅ Etapa 3 concluída!`);
      console.log(`   - Vector Store: ${vectorInfo?.name}`);
      console.log(`   - Arquivos: ${vectorInfo?.fileCount}`);
      console.log(`   - Status: ${vectorInfo?.status}\n`);

      // ============================================
      // FINALIZAÇÃO
      // ============================================
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('🎉 ========================================');
      console.log('🎉 SINCRONIZAÇÃO CONCLUÍDA COM SUCESSO!');
      console.log(`🎉 Tempo total: ${duration}s`);
      console.log('🎉 ========================================\n');

      // Liberar lock antes de retornar
      this.releaseLock();

      return {
        success: true,
        csvExport: csvResult,
        vectorStoreUpload: {
          vectorStoreId,
          status: vectorInfo?.status || 'unknown'
        }
      };
    } catch (error: any) {
      console.error('\n❌ ========================================');
      console.error('❌ ERRO NA SINCRONIZAÇÃO');
      console.error('❌ ========================================');
      console.error(error);

      // Liberar lock mesmo em caso de erro
      this.releaseLock();

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verifica status da sincronização
   */
  async getStatus(): Promise<{
    csv: {
      exists: boolean;
      sizeKB: number;
      rowCount: number;
      ageHours: number;
      needsUpdate: boolean;
    };
    vectorStore: {
      exists: boolean;
      id?: string;
      name?: string;
      fileCount?: number;
      status?: string;
    };
  }> {
    // Status do CSV
    const csvStats = await hashtagCsvExportService.getStats();

    // Status do Vector Store
    const vectorInfo = await hashtagVectorStoreService.getInfo();

    return {
      csv: {
        exists: csvStats.exists,
        sizeKB: csvStats.sizeKB,
        rowCount: csvStats.rowCount,
        ageHours: csvStats.ageHours,
        needsUpdate: csvStats.ageHours > 24 || !csvStats.exists
      },
      vectorStore: {
        exists: vectorInfo !== null,
        id: vectorInfo?.id,
        name: vectorInfo?.name,
        fileCount: vectorInfo?.fileCount,
        status: vectorInfo?.status
      }
    };
  }

  /**
   * Sincronização incremental (apenas se necessário)
   */
  async syncIfNeeded(): Promise<{ synced: boolean; reason: string }> {
    const status = await this.getStatus();

    // Verificar se precisa atualizar
    if (!status.csv.needsUpdate && status.vectorStore.exists) {
      console.log('ℹ️  Sincronização não necessária (dados atualizados)');
      return {
        synced: false,
        reason: 'Dados já atualizados (< 24h)'
      };
    }

    console.log('⚠️  Sincronização necessária!');

    if (!status.csv.exists) {
      console.log('   - Arquivo CSV não existe');
    } else if (status.csv.ageHours > 24) {
      console.log(`   - Arquivo CSV desatualizado (${status.csv.ageHours}h)`);
    }

    if (!status.vectorStore.exists) {
      console.log('   - Vector Store não existe');
    }

    await this.syncComplete();

    return {
      synced: true,
      reason: 'Dados desatualizados ou ausentes'
    };
  }
}

export const hashtagSyncService = new HashtagSyncService();
