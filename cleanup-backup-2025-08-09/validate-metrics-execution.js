/**
 * SCRIPT DE VALIDAÇÃO - Verifica se as métricas foram calculadas corretamente
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function validateMetricsExecution() {
    console.log('🔍 VALIDANDO EXECUÇÃO DAS MÉTRICAS');
    console.log('='.repeat(60));
    
    try {
        // 1. Verificar quantos registros foram criados hoje
        const { data: todaysMetrics, error: countError } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, period, metric_data, calculated_at')
            .gte('calculated_at', new Date().toISOString().split('T')[0])
            .eq('metric_type', 'comprehensive')
            .order('tenant_id, period');

        if (countError) throw countError;

        console.log(`📊 Total de registros criados hoje: ${todaysMetrics.length}`);
        
        // 2. Agrupar por tenant e período
        const byTenant = {};
        todaysMetrics.forEach(record => {
            if (!byTenant[record.tenant_id]) {
                byTenant[record.tenant_id] = {};
            }
            byTenant[record.tenant_id][record.period] = record.metric_data;
        });

        console.log(`🏢 Tenants processados: ${Object.keys(byTenant).length}`);
        
        // 3. Verificar métricas por tenant
        let totalMetricsCalculated = 0;
        Object.keys(byTenant).forEach(tenantId => {
            const periods = Object.keys(byTenant[tenantId]);
            console.log(`\n📋 Tenant ${tenantId}:`);
            console.log(`   Períodos: ${periods.join(', ')}`);
            
            periods.forEach(period => {
                const metrics = byTenant[tenantId][period];
                const metricKeys = Object.keys(metrics).filter(key => 
                    !['period', 'tenant_id', 'tenant_name', 'calculated_at'].includes(key)
                );
                
                console.log(`   ${period}: ${metricKeys.length} métricas`);
                totalMetricsCalculated += metricKeys.length;
                
                // Mostrar algumas métricas para validação
                if (period === '30d') {
                    console.log(`     ✅ completed_conversations: ${metrics.completed_conversations || 0}`);
                    console.log(`     ✅ monthly_revenue_brl: R$ ${(metrics.monthly_revenue_brl || 0).toFixed(2)}`);
                    console.log(`     ✅ appointment_success_rate: ${(metrics.appointment_success_rate || 0).toFixed(1)}%`);
                    console.log(`     ✅ unique_customers_count: ${metrics.unique_customers_count || 0}`);
                    
                    // Verificar métricas de 6 meses (só no período 30d)
                    if (metrics.six_months_conversations) {
                        const monthsCount = Object.keys(metrics.six_months_conversations).length;
                        console.log(`     ✅ six_months_conversations: ${monthsCount} meses de dados`);
                    }
                }
            });
        });

        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMO DA VALIDAÇÃO');
        console.log('='.repeat(60));
        console.log(`✅ Registros salvos: ${todaysMetrics.length}`);
        console.log(`✅ Tenants processados: ${Object.keys(byTenant).length}`);
        console.log(`✅ Total de métricas calculadas: ${totalMetricsCalculated}`);
        console.log(`✅ Média de métricas por registro: ${(totalMetricsCalculated / todaysMetrics.length).toFixed(1)}`);
        
        // 4. Verificar se há métricas com valor zero suspeito
        let suspiciousZeros = 0;
        Object.keys(byTenant).forEach(tenantId => {
            Object.keys(byTenant[tenantId]).forEach(period => {
                const metrics = byTenant[tenantId][period];
                
                // Verificar métricas que normalmente não deveriam ser zero
                if (metrics.completed_conversations === 0 && metrics.abandoned_conversations === 0 && 
                    metrics.cancelled_conversations === 0 && metrics.failed_conversations === 0) {
                    console.log(`⚠️  Tenant ${tenantId} (${period}): Todas as conversation outcomes são 0`);
                    suspiciousZeros++;
                }
                
                if (metrics.services_count === 0) {
                    console.log(`⚠️  Tenant ${tenantId} (${period}): services_count = 0`);
                    suspiciousZeros++;
                }
            });
        });

        if (suspiciousZeros === 0) {
            console.log('✅ Nenhuma métrica suspeita encontrada');
        } else {
            console.log(`⚠️  ${suspiciousZeros} métricas suspeitas encontradas`);
        }

        console.log('\n🎯 VALIDAÇÃO CONCLUÍDA COM SUCESSO!');
        return {
            success: true,
            records_saved: todaysMetrics.length,
            tenants_processed: Object.keys(byTenant).length,
            total_metrics: totalMetricsCalculated,
            suspicious_zeros: suspiciousZeros
        };
        
    } catch (error) {
        console.error('❌ Erro na validação:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Executar validação
if (require.main === module) {
    validateMetricsExecution()
        .then(result => {
            console.log('\n📋 Resultado:', result);
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { validateMetricsExecution };