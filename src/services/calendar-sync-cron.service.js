/**
 * CALENDAR SYNC CRON SERVICE
 * 
 * Executa sincronização automática periódica do Google Calendar
 */

const cron = require('node-cron');
const { CalendarSyncBidirectionalService } = require('./calendar-sync-bidirectional.service');
const { supabaseAdmin } = require('../config/database');

class CalendarSyncCronService {
    constructor() {
        this.syncService = new CalendarSyncBidirectionalService();
        this.isRunning = false;
        this.lastRun = null;
        this.cronJob = null;
    }

    /**
     * INICIAR sincronização automática
     */
    start() {
        if (this.cronJob) {
            console.log('⚠️ Calendar sync cron já está rodando');
            return;
        }

        // Executar a cada 15 minutos
        this.cronJob = cron.schedule('*/15 * * * *', async () => {
            await this.runSync();
        }, {
            scheduled: false,
            timezone: 'America/Sao_Paulo'
        });

        this.cronJob.start();
        console.log('🔄 Calendar sync cron iniciado (executa a cada 15 minutos)');
    }

    /**
     * PARAR sincronização automática
     */
    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            console.log('⏹️ Calendar sync cron parado');
        }
    }

    /**
     * EXECUTAR sincronização para todos os profissionais
     */
    async runSync() {
        if (this.isRunning) {
            console.log('⏳ Sincronização já em andamento, pulando...');
            return;
        }

        this.isRunning = true;
        this.lastRun = new Date();

        try {
            console.log('🔄 Iniciando sincronização automática do Google Calendar...');

            // Buscar todos os profissionais com Google Calendar configurado
            const { data: professionals, error } = await supabaseAdmin
                .from('professionals')
                .select(`
                    id,
                    tenant_id, 
                    name,
                    google_calendar_credentials
                `)
                .not('google_calendar_credentials', 'is', null);

            if (error) {
                console.error('❌ Erro ao buscar profissionais:', error);
                return;
            }

            if (!professionals || professionals.length === 0) {
                console.log('📋 Nenhum profissional com Google Calendar configurado');
                return;
            }

            console.log(`👥 Sincronizando ${professionals.length} profissionais...`);

            let totalImported = 0;
            let totalUpdated = 0;
            let errors = 0;

            // Processar cada profissional
            for (const professional of professionals) {
                try {
                    console.log(`🔄 Sincronizando: ${professional.name} (${professional.id})`);

                    const result = await this.syncService.fullSync(
                        professional.tenant_id, 
                        professional.id
                    );

                    if (result.success) {
                        totalImported += result.summary?.imported || 0;
                        totalUpdated += result.summary?.updated || 0;
                        
                        console.log(`✅ ${professional.name}: ${result.summary?.imported || 0} importados, ${result.summary?.updated || 0} atualizados`);
                    } else {
                        console.error(`❌ ${professional.name}: ${result.error}`);
                        errors++;
                    }

                    // Pequena pausa entre profissionais para não sobrecarregar a API
                    await this.sleep(1000);

                } catch (profError) {
                    console.error(`❌ Erro ao sincronizar ${professional.name}:`, profError);
                    errors++;
                }
            }

            // Log final
            console.log(`🎉 Sincronização automática concluída:`);
            console.log(`   Profissionais processados: ${professionals.length}`);
            console.log(`   Eventos importados: ${totalImported}`);
            console.log(`   Appointments atualizados: ${totalUpdated}`);
            console.log(`   Erros: ${errors}`);

            // Salvar estatísticas no banco (opcional)
            await this.saveSyncStats({
                professionals_processed: professionals.length,
                events_imported: totalImported,
                appointments_updated: totalUpdated,
                errors: errors,
                executed_at: this.lastRun
            });

        } catch (error) {
            console.error('❌ Erro na sincronização automática:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * EXECUTAR sincronização manual (on-demand)
     */
    async runManualSync() {
        console.log('🔄 Executando sincronização manual...');
        await this.runSync();
        return {
            success: true,
            last_run: this.lastRun,
            message: 'Sincronização manual executada'
        };
    }

    /**
     * STATUS do serviço
     */
    getStatus() {
        return {
            is_running: this.isRunning,
            cron_active: !!this.cronJob,
            last_run: this.lastRun,
            next_run: this.cronJob ? 'A cada 15 minutos' : null
        };
    }

    /**
     * UTILITÁRIOS
     */
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async saveSyncStats(stats) {
        try {
            // Salvar estatísticas na tabela de logs (se existir)
            await supabaseAdmin
                .from('calendar_sync_logs')
                .insert({
                    sync_type: 'automatic',
                    ...stats
                });
        } catch (error) {
            // Ignorar erro se tabela não existir
            console.log('📊 Stats não salvos (tabela calendar_sync_logs não existe)');
        }
    }
}

// Instância singleton
const calendarSyncCron = new CalendarSyncCronService();

module.exports = { 
    CalendarSyncCronService,
    calendarSyncCron
};