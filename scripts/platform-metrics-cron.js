const { createClient } = require('@supabase/supabase-js');

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis de ambiente do Supabase não configuradas');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * UBS Metric Logger - Simplified for cron script
 */
class UBSLogger {
    async startRun(periodDays) {
        const { data, error } = await supabase
            .from('ubs_metric_system_runs')
            .insert({
                run_date: new Date().toISOString().split('T')[0],
                period_days: periodDays,
                run_status: 'running',
                tenants_processed: 0,
                total_tenants: 0,
                execution_time_ms: 0,
                metrics_calculated: 0,
                started_at: new Date().toISOString(),
                data_quality_score: 0,
                missing_data_count: 0
            })
            .select('id')
            .single();
            
        if (error) {
            console.warn('⚠️ [UBS LOGGER] Failed to log run start:', error.message);
            return null;
        }
        
        console.log(`🚀 [UBS LOGGER] Started run ${data.id} for platform metrics`);
        return data.id;
    }

    async completeRun(runId, metrics) {
        if (!runId) return;
        
        const { error } = await supabase
            .from('ubs_metric_system_runs')
            .update({
                run_status: 'completed',
                tenants_processed: metrics.tenants_processed || 0,
                total_tenants: metrics.total_tenants || 0,
                metrics_calculated: metrics.metrics_calculated || 1,
                execution_time_ms: metrics.execution_time_ms,
                data_quality_score: metrics.data_quality_score || 100,
                missing_data_count: metrics.missing_data_count || 0,
                completed_at: new Date().toISOString()
            })
            .eq('id', runId);

        if (error) {
            console.warn('⚠️ [UBS LOGGER] Failed to log run completion:', error.message);
        } else {
            console.log(`✅ [UBS LOGGER] Completed run ${runId} - Quality: ${metrics.data_quality_score || 100}%`);
        }
    }

    async failRun(runId, errorMessage, executionTime) {
        if (!runId) return;
        
        const { error } = await supabase
            .from('ubs_metric_system_runs')
            .update({
                run_status: 'failed',
                error_message: errorMessage,
                execution_time_ms: executionTime || 0,
                completed_at: new Date().toISOString()
            })
            .eq('id', runId);

        if (error) {
            console.warn('⚠️ [UBS LOGGER] Failed to log run failure:', error.message);
        } else {
            console.error(`❌ [UBS LOGGER] Failed run ${runId}: ${errorMessage}`);
        }
    }
}

const ubsLogger = new UBSLogger();

/**
 * Executa o cálculo de métricas da plataforma
 */
async function executePlatformMetricsCron() {
    const startTime = new Date();
    let runId = null;
    
    console.log(`🚀 [PLATFORM METRICS CRON] Iniciando cálculo às ${startTime.toISOString()}`);

    try {
        // Iniciar logging do run
        runId = await ubsLogger.startRun(30); // Assuming 30-day period
        
        // Executar função de atualização das métricas da plataforma
        const { data, error } = await supabase.rpc('update_platform_metrics');

        if (error) {
            throw new Error(`Erro na função update_platform_metrics: ${error.message}`);
        }

        const endTime = new Date();
        const duration = endTime - startTime;

        console.log(`✅ [PLATFORM METRICS CRON] Concluído com sucesso em ${duration}ms`);
        console.log(`📊 Resultado:`, JSON.stringify(data, null, 2));

        // Verificar se os dados foram salvos corretamente
        const { data: verificationData, error: verificationError } = await supabase
            .from('platform_metrics')
            .select('*')
            .eq('calculation_date', new Date().toISOString().split('T')[0])
            .single();

        if (verificationError) {
            console.warn(`⚠️ Erro na verificação: ${verificationError.message}`);
        } else {
            console.log(`✅ Dados verificados na tabela platform_metrics:`, verificationData);
        }

        // Calcular métricas de qualidade
        const dataQualityScore = verificationData ? 100 : 50; // Simple quality check
        const metricsCalculated = verificationData ? 1 : 0;

        // Finalizar logging do run
        await ubsLogger.completeRun(runId, {
            tenants_processed: data?.processed_tenants || 0,
            total_tenants: data?.total_tenants || 0,
            metrics_calculated: metricsCalculated,
            execution_time_ms: duration,
            data_quality_score: dataQualityScore,
            missing_data_count: verificationError ? 1 : 0
        });

        return {
            success: true,
            duration,
            data,
            timestamp: endTime.toISOString()
        };

    } catch (error) {
        const endTime = new Date();
        const duration = endTime - startTime;

        console.error(`❌ [PLATFORM METRICS CRON] Erro após ${duration}ms:`, error.message);
        console.error('Stack trace:', error.stack);

        // Finalizar logging do run como falha
        await ubsLogger.failRun(runId, error.message, duration);

        return {
            success: false,
            error: error.message,
            duration,
            timestamp: endTime.toISOString()
        };
    }
}

/**
 * Executa verificação de saúde das métricas da plataforma
 */
async function healthCheckPlatformMetrics() {
    console.log(`🔍 [PLATFORM METRICS] Executando verificação de saúde...`);

    try {
        // Verificar se existem dados para hoje
        const today = new Date().toISOString().split('T')[0];
        const { data: todayData, error: todayError } = await supabase
            .from('platform_metrics')
            .select('*')
            .eq('metric_date', today)
            .single();

        // Verificar se existem dados dos últimos 7 dias
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const { data: recentData, error: recentError } = await supabase
            .from('platform_metrics')
            .select('metric_date')
            .gte('metric_date', sevenDaysAgo.toISOString().split('T')[0])
            .order('metric_date', { ascending: false });

        const healthReport = {
            timestamp: new Date().toISOString(),
            today_data_available: !todayError && todayData !== null,
            today_data: todayData,
            recent_days_count: recentData ? recentData.length : 0,
            recent_days: recentData ? recentData.map(d => d.metric_date) : [],
            issues: []
        };

        // Verificar problemas
        if (todayError || !todayData) {
            healthReport.issues.push('Dados de hoje não disponíveis');
        }

        if (!recentData || recentData.length < 3) {
            healthReport.issues.push('Poucos dados recentes (menos de 3 dias)');
        }

        if (todayData && todayData.total_appointments === 0) {
            healthReport.issues.push('Total de agendamentos é zero');
        }

        if (todayData && todayData.total_tenants === 0) {
            healthReport.issues.push('Total de tenants é zero');
        }

        console.log(`📊 [PLATFORM METRICS] Relatório de saúde:`, JSON.stringify(healthReport, null, 2));

        return healthReport;

    } catch (error) {
        console.error(`❌ [PLATFORM METRICS] Erro na verificação de saúde:`, error.message);
        return {
            timestamp: new Date().toISOString(),
            error: error.message,
            healthy: false
        };
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    (async () => {
        console.log('🔄 Executando Platform Metrics Cron Job...');
        
        // Executar verificação de saúde primeiro
        await healthCheckPlatformMetrics();
        
        // Executar cálculo das métricas
        const result = await executePlatformMetricsCron();
        
        // Sair com código apropriado
        process.exit(result.success ? 0 : 1);
    })();
}

module.exports = {
    executePlatformMetricsCron,
    healthCheckPlatformMetrics
}; 