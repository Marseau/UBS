#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testPlatformAggregation() {
    console.log('🧪 TESTE DE AGREGAÇÃO PLATFORM_METRICS');
    console.log('=====================================');
    
    try {
        const targetDate = new Date().toISOString().split('T')[0];
        const targetPeriod = '30d';
        
        console.log(`📅 Data: ${targetDate}`);
        console.log(`📊 Período: ${targetPeriod}`);
        console.log('');
        
        // 1. Verificar dados disponíveis na tenant_metrics
        console.log('🔍 1. VERIFICANDO DADOS TENANT_METRICS');
        console.log('--------------------------------------');
        
        const { data: allTenantMetrics, error: allError } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, metric_type, period, metric_data')
            .eq('period', targetPeriod);
        
        if (allError) {
            console.error('❌ Erro ao buscar tenant_metrics:', allError.message);
            return;
        }
        
        console.log(`📊 Total registros: ${allTenantMetrics?.length || 0}`);
        
        // Agrupar por tipo de métrica
        const metricsByType = {};
        const tenantIds = new Set();
        
        allTenantMetrics?.forEach(metric => {
            if (!metricsByType[metric.metric_type]) {
                metricsByType[metric.metric_type] = [];
            }
            metricsByType[metric.metric_type].push(metric);
            tenantIds.add(metric.tenant_id);
        });
        
        console.log(`🏢 Tenants únicos: ${tenantIds.size}`);
        console.log('📋 Tipos de métricas disponíveis:');
        Object.keys(metricsByType).forEach(type => {
            console.log(`   ${type}: ${metricsByType[type].length} registros`);
        });
        console.log('');
        
        // 2. CALCULAR PLATFORM MRR (do custo_plataforma)
        console.log('🔍 2. CALCULANDO PLATFORM MRR');
        console.log('-----------------------------');
        
        const custoMetrics = metricsByType['custo_plataforma'] || [];
        let platformMRR = 0;
        let mrrDetails = [];
        
        custoMetrics.forEach(metric => {
            const custo = metric.metric_data?.custo_total_plataforma || 0;
            platformMRR += parseFloat(custo);
            mrrDetails.push({
                tenant_id: metric.tenant_id.substring(0, 8),
                custo: custo
            });
        });
        
        console.log(`💰 Platform MRR Total: R$ ${platformMRR.toFixed(2)}`);
        console.log(`📊 Tenants contribuindo: ${custoMetrics.length}`);
        if (mrrDetails.length > 0) {
            console.log('📋 Detalhamento:');
            mrrDetails.forEach(detail => {
                console.log(`   ${detail.tenant_id}: R$ ${detail.custo}`);
            });
        }
        console.log('');
        
        // 3. CALCULAR RECEITA TOTAL (do comprehensive)
        console.log('🔍 3. CALCULANDO RECEITA TOTAL');
        console.log('------------------------------');
        
        const comprehensiveMetrics = metricsByType['comprehensive'] || [];
        let totalRevenue = 0;
        let totalAppointments = 0;
        let activeTenants = 0;
        let revenueDetails = [];
        
        comprehensiveMetrics.forEach(metric => {
            const revenue = metric.metric_data?.monthly_revenue_brl || 0;
            const appointments = metric.metric_data?.total_appointments || 0;
            
            totalRevenue += parseFloat(revenue);
            totalAppointments += parseInt(appointments);
            
            if (appointments > 0) {
                activeTenants++;
            }
            
            revenueDetails.push({
                tenant_id: metric.tenant_id.substring(0, 8),
                revenue: revenue,
                appointments: appointments,
                active: appointments > 0
            });
        });
        
        console.log(`💵 Receita Total: R$ ${totalRevenue.toFixed(2)}`);
        console.log(`📅 Total Agendamentos: ${totalAppointments}`);
        console.log(`🏢 Tenants Ativos: ${activeTenants} de ${comprehensiveMetrics.length}`);
        console.log('📋 Detalhamento:');
        revenueDetails
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10)
            .forEach(detail => {
                const status = detail.active ? '✅' : '⚪';
                console.log(`   ${status} ${detail.tenant_id}: R$ ${detail.revenue} (${detail.appointments} agend.)`);
            });
        console.log('');
        
        // 4. VALIDAÇÃO CRUZADA (revenue_tenant)
        console.log('🔍 4. VALIDAÇÃO CRUZADA');
        console.log('-----------------------');
        
        const revenueValidation = metricsByType['revenue_tenant'] || [];
        let validationTotal = 0;
        
        revenueValidation.forEach(metric => {
            const revenue = metric.metric_data?.total_revenue || 0;
            validationTotal += parseFloat(revenue);
        });
        
        console.log(`💵 Receita (comprehensive): R$ ${totalRevenue.toFixed(2)}`);
        console.log(`💵 Receita (revenue_tenant): R$ ${validationTotal.toFixed(2)}`);
        
        const difference = Math.abs(totalRevenue - validationTotal);
        const percentDiff = totalRevenue > 0 ? (difference / totalRevenue) * 100 : 0;
        
        console.log(`📊 Diferença: R$ ${difference.toFixed(2)} (${percentDiff.toFixed(1)}%)`);
        
        if (percentDiff < 5) {
            console.log('✅ Validação APROVADA (< 5% diferença)');
        } else {
            console.log('⚠️ Validação ATENÇÃO (> 5% diferença)');
        }
        console.log('');
        
        // 5. MÉTRICAS CALCULADAS
        console.log('🔍 5. MÉTRICAS CALCULADAS');
        console.log('-------------------------');
        
        const revenuePlatformRatio = platformMRR > 0 ? totalRevenue / platformMRR : 0;
        const avgRevenuePerTenant = activeTenants > 0 ? totalRevenue / activeTenants : 0;
        const avgAppointmentsPerTenant = activeTenants > 0 ? totalAppointments / activeTenants : 0;
        
        console.log(`📊 Ratio Receita/Plataforma: ${revenuePlatformRatio.toFixed(2)}x`);
        console.log(`💰 Receita Média por Tenant: R$ ${avgRevenuePerTenant.toFixed(2)}`);
        console.log(`📅 Agendamentos Médios por Tenant: ${avgAppointmentsPerTenant.toFixed(1)}`);
        console.log('');
        
        // 6. RESULTADO FINAL AGREGADO
        console.log('🎯 6. RESULTADO FINAL AGREGADO');
        console.log('==============================');
        
        const aggregatedResult = {
            calculation_date: targetDate,
            period: targetPeriod,
            tenants_processed: comprehensiveMetrics.length,
            total_tenants: tenantIds.size,
            active_tenants: activeTenants,
            platform_mrr: parseFloat(platformMRR.toFixed(2)),
            total_revenue: parseFloat(totalRevenue.toFixed(2)),
            total_revenue_validation: parseFloat(validationTotal.toFixed(2)),
            total_appointments: totalAppointments,
            revenue_platform_ratio: parseFloat(revenuePlatformRatio.toFixed(4)),
            avg_revenue_per_tenant: parseFloat(avgRevenuePerTenant.toFixed(2)),
            avg_appointments_per_tenant: parseFloat(avgAppointmentsPerTenant.toFixed(2)),
            data_quality_score: percentDiff < 5 ? 95.0 : 85.0,
            calculation_method: 'tenant_aggregation'
        };
        
        console.log(JSON.stringify(aggregatedResult, null, 2));
        console.log('');
        
        // 7. SIMULAR INSERÇÃO NA PLATFORM_METRICS (estrutura atual)
        console.log('🔍 7. SIMULANDO INSERÇÃO');
        console.log('------------------------');
        
        // Usar estrutura atual simplificada
        const platformMetricsData = {
            metric_name: 'platform_aggregation',
            metric_value: platformMRR,
            calculation_date: targetDate,
            additional_metrics: aggregatedResult
        };
        
        const { data: insertResult, error: insertError } = await supabase
            .from('platform_metrics')
            .insert([platformMetricsData])
            .select();
        
        if (insertError) {
            console.error('❌ Erro ao inserir:', insertError.message);
        } else {
            console.log('✅ Dados inseridos com sucesso!');
            console.log(`📊 ID: ${insertResult?.[0]?.id}`);
        }
        
        console.log('');
        console.log('🎉 TESTE DE AGREGAÇÃO CONCLUÍDO!');
        console.log('');
        console.log('📊 RESUMO DOS RESULTADOS:');
        console.log(`   💰 Platform MRR: R$ ${platformMRR.toFixed(2)}`);
        console.log(`   💵 Receita Total: R$ ${totalRevenue.toFixed(2)}`);
        console.log(`   🏢 Tenants Ativos: ${activeTenants}`);
        console.log(`   📅 Total Agendamentos: ${totalAppointments}`);
        console.log(`   📊 Ratio Receita/Plataforma: ${revenuePlatformRatio.toFixed(2)}x`);
        console.log(`   ✅ Qualidade dos Dados: ${percentDiff < 5 ? '95%' : '85%'}`);
        console.log('');
        
    } catch (error) {
        console.error('💥 Erro no teste:', error);
    }
}

// Executar
testPlatformAggregation();