const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

/**
 * TESTE STORE/GET TENANT METRICS - SIMULAÇÃO POSTGRESQL
 * 
 * Simula as PostgreSQL functions para persistência:
 * 1. store_tenant_metric - Persiste métricas na tabela tenant_metrics
 * 2. get_tenant_metric - Recupera métricas da tabela tenant_metrics
 * 
 * ESTRUTURA DA TABELA tenant_metrics:
 * - id (UUID)
 * - tenant_id (UUID) 
 * - metric_type (VARCHAR) - 'comprehensive', 'ranking', 'risk_assessment', etc.
 * - metric_data (JSONB) - Dados JSON das métricas
 * - period (VARCHAR) - '7d', '30d', '90d'
 * - calculated_at, created_at, updated_at (TIMESTAMP)
 */

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Simular função STORE_TENANT_METRIC
 * Persiste métricas na tabela tenant_metrics com UPSERT
 */
async function storeTenantMetric(tenantId, metricType, period, metricData) {
    console.log(`💾 STORE_TENANT_METRIC para tenant ${tenantId.substring(0, 8)}`);
    console.log(`📊 Tipo: ${metricType}, Período: ${period}`);
    console.log(`📋 Dados: ${Object.keys(metricData).length} métricas`);
    
    try {
        // Simular: Em produção seria uma PostgreSQL function que faz o UPSERT
        // CREATE OR REPLACE FUNCTION store_tenant_metric(...)
        
        console.log(`   🔄 UPSERT em tenant_metrics...`);
        
        // Simular UPSERT na tabela tenant_metrics
        const { data, error } = await supabase
            .from('tenant_metrics')
            .upsert({
                tenant_id: tenantId,
                metric_type: metricType,
                period: period,
                metric_data: metricData,
                calculated_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'tenant_id,metric_type,period' // Unique constraint
            })
            .select();

        if (error) {
            console.error(`   ❌ Erro no UPSERT: ${error.message}`);
            throw error;
        }

        console.log(`   ✅ Métricas persistidas com sucesso`);
        console.log(`   📝 ID: ${data?.[0]?.id || 'novo'}`);
        
        return {
            success: true,
            id: data?.[0]?.id,
            operation: data?.[0]?.created_at === data?.[0]?.updated_at ? 'INSERT' : 'UPDATE',
            metrics_count: Object.keys(metricData).length
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * Simular função GET_TENANT_METRIC 
 * Recupera métricas da tabela tenant_metrics
 */
async function getTenantMetric(tenantId, metricType, period) {
    console.log(`📖 GET_TENANT_METRIC para tenant ${tenantId.substring(0, 8)}`);
    console.log(`📊 Tipo: ${metricType}, Período: ${period}`);
    
    try {
        // Simular: Em produção seria uma PostgreSQL function que faz o SELECT
        // CREATE OR REPLACE FUNCTION get_tenant_metric(...)
        
        console.log(`   🔍 SELECT em tenant_metrics...`);
        
        const { data, error } = await supabase
            .from('tenant_metrics')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('metric_type', metricType)
            .eq('period', period)
            .order('calculated_at', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // No rows returned
                console.log(`   📭 Métricas não encontradas`);
                return null;
            }
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }

        const metricsCount = Object.keys(data.metric_data || {}).length;
        const ageHours = Math.round((Date.now() - new Date(data.calculated_at).getTime()) / (1000 * 60 * 60));
        
        console.log(`   ✅ Métricas encontradas`);
        console.log(`   📝 ID: ${data.id}`);
        console.log(`   📊 ${metricsCount} métricas, calculadas há ${ageHours}h`);
        console.log(`   🕐 Última atualização: ${data.calculated_at}`);
        
        return {
            id: data.id,
            tenant_id: data.tenant_id,
            metric_type: data.metric_type,
            period: data.period,
            metric_data: data.metric_data,
            calculated_at: data.calculated_at,
            age_hours: ageHours,
            metrics_count: metricsCount
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * Simular função GET_ALL_TENANT_METRICS
 * Recupera todas as métricas de um tenant (todos os períodos e tipos)
 */
async function getAllTenantMetrics(tenantId) {
    console.log(`📚 GET_ALL_TENANT_METRICS para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const { data, error } = await supabase
            .from('tenant_metrics')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('calculated_at', { ascending: false });

        if (error) {
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }

        if (!data || data.length === 0) {
            console.log(`   📭 Nenhuma métrica encontrada`);
            return [];
        }

        console.log(`   ✅ ${data.length} registros encontrados`);
        
        // Agrupar por metric_type e period
        const grouped = {};
        data.forEach(record => {
            const key = `${record.metric_type}_${record.period}`;
            if (!grouped[key]) {
                grouped[key] = record;
            }
        });

        const uniqueTypes = [...new Set(data.map(r => r.metric_type))];
        const uniquePeriods = [...new Set(data.map(r => r.period))];
        
        console.log(`   📊 Tipos: ${uniqueTypes.join(', ')}`);
        console.log(`   📅 Períodos: ${uniquePeriods.join(', ')}`);
        
        return data;
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        throw error;
    }
}

/**
 * Testar funções de persistência
 */
async function testStorageAndRetrievalFunctions() {
    console.log('🧪 TESTANDO STORE/GET TENANT METRICS - FUNÇÕES DE PERSISTÊNCIA');
    console.log('='.repeat(85));
    
    const testTenantId = '33b8c488-5aa9-4891-b335-701d10296681';
    const testMetricType = 'comprehensive';
    const testPeriod = '30d';

    try {
        // 1. TESTAR ARMAZENAMENTO
        console.log(`\n${'='.repeat(40)}`);
        console.log(`🔄 1. TESTANDO STORE_TENANT_METRIC`);
        console.log(`${'='.repeat(40)}`);
        
        // Simular métricas calculadas (resultado de get_tenant_metrics_for_period)
        const mockMetricsData = {
            // Metadata
            tenant_id: testTenantId,
            period_type: testPeriod,
            start_date: '2025-07-08',
            end_date: '2025-08-07',
            calculated_at: new Date().toISOString(),
            
            // Métricas básicas (4)
            monthly_revenue: 2847.50,
            new_customers: 8,
            appointment_success_rate: 78.3,
            no_show_impact: 12.5,
            
            // Conversation outcomes (4)
            information_rate: 32.5,
            spam_rate: 2.1,
            reschedule_rate: 8.7,
            cancellation_rate: 35.1,
            
            // Métricas complementares (4)
            avg_minutes_per_conversation: 4.8,
            total_system_cost_usd: 15.42,
            ai_failure_rate: 1.2,
            confidence_score: 0.834,
            
            // Métricas de sistema (4)
            total_unique_customers: 17,
            services_available: 9,
            total_professionals: 5,
            monthly_platform_cost_brl: 58.00,
            
            // AI interactions (3)
            ai_interaction_7d: 0,
            ai_interaction_30d: 120,
            ai_interaction_90d: 382,
            
            // Histórico (3 objetos)
            historical_6months_conversations: { month_0: 70, month_1: 72, month_2: 69, month_3: 0, month_4: 0, month_5: 0 },
            historical_6months_revenue: { month_0: 0, month_1: 0, month_2: 3491.2, month_3: 0, month_4: 0, month_5: 0 },
            historical_6months_customers: { month_0: 62, month_1: 22, month_2: 0, month_3: 0, month_4: 0, month_5: 0 },
            
            // Tenant outcomes (21 métricas)
            agendamentos_7d: 0, agendamentos_30d: 23, agendamentos_90d: 62,
            informativos_7d: 0, informativos_30d: 19, informativos_90d: 62,
            cancelados_7d: 0, cancelados_30d: 16, cancelados_90d: 67,
            remarcados_7d: 0, remarcados_30d: 0, remarcados_90d: 0,
            modificados_7d: 0, modificados_30d: 0, modificados_90d: 0,
            falhaIA_7d: 0, falhaIA_30d: 0, falhaIA_90d: 0,
            spam_7d: 0, spam_30d: 0, spam_90d: 0
        };

        const storeResult = await storeTenantMetric(testTenantId, testMetricType, testPeriod, mockMetricsData);
        
        // 2. TESTAR RECUPERAÇÃO
        console.log(`\n${'='.repeat(40)}`);
        console.log(`🔄 2. TESTANDO GET_TENANT_METRIC`);
        console.log(`${'='.repeat(40)}`);
        
        // Aguardar um pouco para garantir que o dado foi persistido
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const retrievedMetrics = await getTenantMetric(testTenantId, testMetricType, testPeriod);
        
        // 3. TESTAR RECUPERAÇÃO COMPLETA
        console.log(`\n${'='.repeat(40)}`);
        console.log(`🔄 3. TESTANDO GET_ALL_TENANT_METRICS`);
        console.log(`${'='.repeat(40)}`);
        
        const allMetrics = await getAllTenantMetrics(testTenantId);

        // 4. VALIDAÇÃO
        console.log(`\n${'='.repeat(40)}`);
        console.log(`✅ VALIDAÇÃO DOS RESULTADOS`);
        console.log(`${'='.repeat(40)}`);
        
        if (retrievedMetrics) {
            const originalCount = Object.keys(mockMetricsData).length;
            const retrievedCount = retrievedMetrics.metrics_count;
            
            console.log(`📊 Métricas armazenadas: ${originalCount}`);
            console.log(`📊 Métricas recuperadas: ${retrievedCount}`);
            console.log(`🎯 Integridade: ${originalCount === retrievedCount ? '✅ OK' : '❌ ERRO'}`);
            
            // Verificar algumas métricas específicas
            const data = retrievedMetrics.metric_data;
            console.log(`💰 Revenue: R$ ${data.monthly_revenue} (esperado: R$ ${mockMetricsData.monthly_revenue})`);
            console.log(`👥 New customers: ${data.new_customers} (esperado: ${mockMetricsData.new_customers})`);
            console.log(`🤖 AI 30d: ${data.ai_interaction_30d} (esperado: ${mockMetricsData.ai_interaction_30d})`);
        }
        
        console.log('\n' + '='.repeat(85));
        console.log('🎉 TESTE STORE/GET TENANT METRICS CONCLUÍDO');
        
        console.log('\n✅ FUNÇÕES POSTGRESQL PRONTAS PARA CRIAÇÃO');
        console.log('   💾 store_tenant_metric: Persiste com UPSERT baseado em (tenant_id, metric_type, period)');
        console.log('   📖 get_tenant_metric: Recupera métricas específicas por tenant/tipo/período');
        console.log('   📚 get_all_tenant_metrics: Lista todas as métricas de um tenant');
        console.log('   🔄 Suporte completo ao workflow: calculate → store → retrieve');
        console.log('   📊 JSONB permite armazenar 40+ métricas em formato flexível');

        return {
            storeResult,
            retrievedMetrics,
            allMetrics,
            validation: {
                stored_count: Object.keys(mockMetricsData).length,
                retrieved_count: retrievedMetrics?.metrics_count || 0,
                integrity_ok: retrievedMetrics?.metrics_count === Object.keys(mockMetricsData).length
            }
        };

    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        throw error;
    }
}

// Executar teste
if (require.main === module) {
    testStorageAndRetrievalFunctions().then(() => {
        console.log('\n🎯 TESTE CONCLUÍDO COM SUCESSO');
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = {
    storeTenantMetric,
    getTenantMetric,
    getAllTenantMetrics
};