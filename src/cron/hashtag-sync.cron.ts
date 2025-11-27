/**
 * HASHTAG SYNC CRON JOB
 *
 * Executa sincronização diária automática:
 * PostgreSQL → CSV → OpenAI Vector Store
 *
 * Agendamento: 3AM todos os dias
 */

import cron from 'node-cron';
import { hashtagSyncService } from '../services/hashtag-sync.service';

/**
 * Cron job para sincronização diária de hashtags
 * Executa às 3AM todos os dias
 */
export const startHashtagSyncCron = () => {
  console.log('📅 [CRON] Inicializando Hashtag Sync Cron Job...');
  console.log('📅 [CRON] Agendamento: 3AM diariamente');

  // Executa às 3AM todos os dias
  // Formato: segundo minuto hora dia mês dia-da-semana
  // '0 3 * * *' = 3:00 AM todos os dias
  const cronExpression = '0 3 * * *';

  cron.schedule(cronExpression, async () => {
    console.log('\n⏰ ========================================');
    console.log('⏰ CRON JOB EXECUTADO - Hashtag Sync');
    console.log(`⏰ Horário: ${new Date().toISOString()}`);
    console.log('⏰ ========================================\n');

    try {
      const result = await hashtagSyncService.syncComplete();

      if (result.success) {
        console.log('✅ ========================================');
        console.log('✅ CRON JOB CONCLUÍDO COM SUCESSO');
        console.log('✅ ========================================');
        console.log(`📊 Hashtags exportadas: ${result.csvExport?.totalRecords.toLocaleString()}`);
        console.log(`💾 Tamanho arquivo: ${result.csvExport?.fileSizeKB.toLocaleString()} KB`);
        console.log(`🔷 Vector Store: ${result.vectorStoreUpload?.vectorStoreId}`);
        console.log(`📈 Status: ${result.vectorStoreUpload?.status}\n`);
      } else {
        console.error('❌ ========================================');
        console.error('❌ CRON JOB FALHOU');
        console.error('❌ ========================================');
        console.error(`❌ Erro: ${result.error}\n`);
      }
    } catch (error: any) {
      console.error('❌ ========================================');
      console.error('❌ ERRO CRÍTICO NO CRON JOB');
      console.error('❌ ========================================');
      console.error(error);
    }
  });

  console.log('✅ [CRON] Hashtag Sync Cron Job ativo!\n');
};

/**
 * Execução manual para testes (útil para desenvolvimento)
 */
export const runHashtagSyncManually = async () => {
  console.log('\n🔧 [MANUAL] Executando sincronização manual...\n');

  try {
    const result = await hashtagSyncService.syncComplete();

    if (result.success) {
      console.log('✅ Sincronização manual concluída com sucesso!');
      return result;
    } else {
      console.error('❌ Sincronização manual falhou:', result.error);
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('❌ Erro crítico na sincronização manual:', error);
    throw error;
  }
};
