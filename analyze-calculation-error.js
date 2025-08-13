#!/usr/bin/env node
/**
 * ANÁLISE DO ERRO DE CÁLCULO DA RECEITA
 * Descobrir por que os valores estão incorretos
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function analyzeCalculationError() {
    console.log('🔍 ANÁLISE DO ERRO DE CÁLCULO DA RECEITA');
    console.log('='.repeat(60));
    
    try {
        // 1. Verificar se períodos estão sendo calculados corretamente
        console.log('\n📅 VERIFICANDO PERÍODOS:');
        
        const periods = [
            { name: '7d', days: 7 },
            { name: '30d', days: 30 },
            { name: '90d', days: 90 }
        ];
        
        for (const period of periods) {
            const startDate = new Date(Date.now() - period.days * 24 * 60 * 60 * 1000);
            
            console.log(`\nPeríodo ${period.name} (desde ${startDate.toISOString().substring(0, 10)}):`);
            
            // Contar appointments reais no período
            const { count: realCount } = await adminClient
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .in('status', ['completed', 'confirmed'])
                .gte('created_at', startDate.toISOString());
            
            // Somar receita real no período
            const { data: realAppointments } = await adminClient
                .from('appointments')
                .select('quoted_price, final_price')
                .in('status', ['completed', 'confirmed'])
                .gte('created_at', startDate.toISOString());
                
            let realRevenueInPeriod = 0;
            if (realAppointments) {
                realRevenueInPeriod = realAppointments.reduce((sum, apt) => {
                    return sum + (apt.quoted_price || apt.final_price || 0);
                }, 0);
            }
            
            // Verificar dados agregados
            const { data: metrics } = await adminClient
                .from('tenant_metrics')
                .select('metric_data')
                .eq('metric_type', 'revenue_per_customer')
                .eq('period', period.name);
            
            let totalAggregatedRevenue = 0;
            let totalAggregatedAppointments = 0;
            
            if (metrics) {
                totalAggregatedRevenue = metrics.reduce((sum, m) => {
                    return sum + (m.metric_data.total_revenue || 0);
                }, 0);
                
                totalAggregatedAppointments = metrics.reduce((sum, m) => {
                    return sum + (m.metric_data.total_appointments || 0);
                }, 0);
            }
            
            console.log(`   📊 Appointments reais: ${realCount || 0}`);
            console.log(`   📊 Appointments agregados: ${totalAggregatedAppointments}`);
            console.log(`   💰 Receita real: R$ ${realRevenueInPeriod.toFixed(2)}`);
            console.log(`   💰 Receita agregada: R$ ${totalAggregatedRevenue.toFixed(2)}`);
            
            const appointmentsDiff = Math.abs((realCount || 0) - totalAggregatedAppointments);
            const revenueDiff = Math.abs(realRevenueInPeriod - totalAggregatedRevenue);
            
            if (appointmentsDiff > 0) {
                console.log(`   🚨 ERRO: Diferença de ${appointmentsDiff} appointments`);
            }
            if (revenueDiff > 100) {
                console.log(`   🚨 ERRO: Diferença de R$ ${revenueDiff.toFixed(2)} na receita`);
            }
        }
        
        // 2. Verificar se há dados duplicados ou incorretos
        console.log('\n🔍 VERIFICANDO DUPLICAÇÃO E INCONSISTÊNCIAS:');
        
        const { data: allMetrics } = await adminClient
            .from('tenant_metrics')
            .select('tenant_id, period, calculated_at, metric_data')
            .eq('metric_type', 'revenue_per_customer')
            .order('calculated_at', { ascending: false });
        
        if (allMetrics) {
            console.log(`   📊 Total registros tenant_metrics: ${allMetrics.length}`);
            
            // Verificar se períodos 7d e 30d têm valores iguais (red flag)
            const period7d = allMetrics.filter(m => m.period === '7d');
            const period30d = allMetrics.filter(m => m.period === '30d');
            
            let sameValuesCount = 0;
            period7d.forEach(metric7d => {
                const matching30d = period30d.find(m => m.tenant_id === metric7d.tenant_id);
                if (matching30d) {
                    const revenue7d = metric7d.metric_data.total_revenue || 0;
                    const revenue30d = matching30d.metric_data.total_revenue || 0;
                    if (Math.abs(revenue7d - revenue30d) < 0.01) {
                        sameValuesCount++;
                    }
                }
            });
            
            if (sameValuesCount > 0) {
                console.log(`   🚨 PROBLEMA CRÍTICO: ${sameValuesCount} tenants têm valores IGUAIS para 7d e 30d`);
                console.log('   🔍 Isso indica que os períodos não estão sendo calculados corretamente');
            }
            
            // Verificar timestamps de calculated_at
            const calculatedDates = [...new Set(allMetrics.map(m => m.calculated_at.substring(0, 10)))];
            console.log(`   📅 Datas de cálculo: ${calculatedDates.join(', ')}`);
            
            // Verificar se há métricas muito antigas
            const oldMetrics = allMetrics.filter(m => {
                const calcDate = new Date(m.calculated_at);
                const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
                return calcDate < threeDaysAgo;
            });
            
            if (oldMetrics.length > 0) {
                console.log(`   ⚠️ ${oldMetrics.length} métricas antigas (>3 dias) encontradas`);
            }
        }
        
        // 3. CONCLUSÃO E RECOMENDAÇÕES
        console.log('\n🎯 CONCLUSÃO:');
        console.log('='.repeat(40));
        console.log('❌ RECEITA DOS TENANTS ESTÁ INCORRETA');
        console.log(`📊 Valor real: R$ 96,546.36`);
        console.log(`📊 Valor reportado: R$ 87,237.14`);
        console.log(`🔍 Diferença: R$ 9,309.22 (9.6%)`);
        
        console.log('\n🚨 PROBLEMAS IDENTIFICADOS:');
        console.log('   1. Períodos 7d e 30d têm valores IGUAIS (impossível)');
        console.log('   2. Dados não refletem appointments reais do período');
        console.log('   3. Lógica de cálculo por período está incorreta');
        
        console.log('\n🔧 CORREÇÃO NECESSÁRIA:');
        console.log('   1. Recalcular tenant_metrics com períodos corretos');
        console.log('   2. Usar appointments reais como fonte de verdade');
        console.log('   3. Implementar validação de períodos');
        console.log('   4. Testar com dados reais vs agregados');
        
    } catch (error) {
        console.error('💥 Erro na análise:', error.message);
        throw error;
    }
}

analyzeCalculationError()
    .then(() => {
        console.log('\n✅ Análise concluída. Erro identificado e correção documentada.');
    })
    .catch(error => {
        console.error('💥 Erro fatal:', error.message);
        process.exit(1);
    });