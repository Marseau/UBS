/**
 * HASHTAG SYNC SERVICE
 *
 * Orquestra sincronização completa:
 * PostgreSQL → Parquet → OpenAI Vector Store
 *
 * Executado via Cron (1x/dia às 3AM)
 */

import { hashtagParquetExportService } from './hashtag-parquet-export.service';
import { hashtagVectorStoreService } from './hashtag-vector-store.service';

export class HashtagSyncService {
  /**
   * Sincronização completa
   * PostgreSQL → Parquet → Vector Store
   */
  async syncComplete(): Promise<{
    success: boolean;
    parquetExport?: {
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
    console.log('\n🔄 ========================================');
    console.log('🔄 INICIANDO SINCRONIZAÇÃO COMPLETA');
    console.log('🔄 PostgreSQL → Parquet → Vector Store');
    console.log('🔄 ========================================\n');

    const startTime = Date.now();

    try {
      // ============================================
      // ETAPA 1: Export PostgreSQL → Parquet
      // ============================================
      console.log('📊 ETAPA 1/3: Export PostgreSQL → Parquet');

      const parquetResult = await hashtagParquetExportService.exportAllHashtags();

      console.log(`\n✅ Etapa 1 concluída!`);
      console.log(`   - ${parquetResult.totalRecords.toLocaleString()} hashtags exportadas`);
      console.log(`   - ${parquetResult.fileSizeKB.toLocaleString()} KB em disco\n`);

      // ============================================
      // ETAPA 2: Inicializar Vector Store
      // ============================================
      console.log('🔷 ETAPA 2/3: Inicializar Vector Store');

      const vectorStoreId = await hashtagVectorStoreService.initialize();

      console.log(`\n✅ Etapa 2 concluída!`);
      console.log(`   - Vector Store ID: ${vectorStoreId}\n`);

      // ============================================
      // ETAPA 3: Upload Parquet → Vector Store
      // ============================================
      console.log('📤 ETAPA 3/3: Upload Parquet → Vector Store');

      // Cleanup arquivos antigos primeiro
      await hashtagVectorStoreService.cleanupOldFiles();

      // Upload novo arquivo
      await hashtagVectorStoreService.uploadParquetFile(parquetResult.filePath);

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

      return {
        success: true,
        parquetExport: parquetResult,
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
    parquet: {
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
    // Status do Parquet
    const parquetStats = await hashtagParquetExportService.getStats();

    // Status do Vector Store
    const vectorInfo = await hashtagVectorStoreService.getInfo();

    return {
      parquet: {
        exists: parquetStats.exists,
        sizeKB: parquetStats.sizeKB,
        rowCount: parquetStats.rowCount,
        ageHours: parquetStats.ageHours,
        needsUpdate: parquetStats.ageHours > 24 || !parquetStats.exists
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
    if (!status.parquet.needsUpdate && status.vectorStore.exists) {
      console.log('ℹ️  Sincronização não necessária (dados atualizados)');
      return {
        synced: false,
        reason: 'Dados já atualizados (< 24h)'
      };
    }

    console.log('⚠️  Sincronização necessária!');

    if (!status.parquet.exists) {
      console.log('   - Arquivo Parquet não existe');
    } else if (status.parquet.ageHours > 24) {
      console.log(`   - Arquivo Parquet desatualizado (${status.parquet.ageHours}h)`);
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
