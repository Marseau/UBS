#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA NO_SHOW_IMPACT CORRIGIDA
 * 
 * Testa o cálculo correto da taxa de no-show baseado em:
 * impact_percentage = (no_show_count / total_appointments) * 100
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular no_show_impact CORRETO para um tenant e período
 */
async function calculateNoShowImpactCorrected(tenantId, periodDays) {
    console.log(`💸 Testando NO_SHOW_IMPACT CORRIGIDO para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        // Calcular datas do período
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Buscar TODOS os appointments do período (usando start_time)
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select(`
                id,
                status,
                final_price,
                quoted_price,
                start_time
            `)
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate.toISOString())
            .lte('start_time', endDate.toISOString());
        
        if (error) {
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }
        
        if (!appointments || appointments.length === 0) {
            console.log(`   📭 Nenhum appointment encontrado para o período`);
            return {
                lost_revenue: 0,
                no_show_count: 0,
                impact_percentage: 0,
                total_appointments: 0,
                total_potential_revenue: 0
            };
        }
        
        // Agrupar por status e calcular valores
        let noShowRevenue = 0;
        let noShowCount = 0;
        let totalPotentialRevenue = 0; // Excluindo cancelados
        let totalAppointments = appointments.length;
        
        // Análise detalhada dos status
        const statusDistribution = {};
        
        for (const appointment of appointments) {
            const price = appointment.final_price || appointment.quoted_price || 0;
            const status = appointment.status;
            
            // Contar distribuição de status
            statusDistribution[status] = (statusDistribution[status] || 0) + 1;
            
            if (status === 'no_show') {
                noShowRevenue += price;
                noShowCount++;
                totalPotentialRevenue += price;
            } else if (status !== 'cancelled') {
                // Tudo exceto cancelados conta como receita potencial
                totalPotentialRevenue += price;
            }
        }
        
        // ✅ CÁLCULO CORRETO: Taxa de no-show = no-shows / total appointments
        const impactPercentageCorrected = totalAppointments > 0 
            ? (noShowCount / totalAppointments) * 100 
            : 0;
        
        // 📊 CÁLCULO ATUAL (ERRADO): Baseado em revenue
        const impactPercentageOriginal = totalPotentialRevenue > 0 
            ? (noShowRevenue / totalPotentialRevenue) * 100 
            : 0;
        
        console.log(`   📊 Distribuição de status:`)
        Object.entries(statusDistribution)
            .sort((a, b) => b[1] - a[1])
            .forEach(([status, count]) => {
                const percentage = (count / totalAppointments * 100).toFixed(1);
                const symbol = status === 'no_show' ? '❌' : 
                             status === 'cancelled' ? '🚫' : 
                             status === 'completed' ? '✅' : '⚪';
                console.log(`      ${symbol} ${status}: ${count} (${percentage}%)`);
            });
        
        console.log(`   💰 Revenue perdido com no-shows: R$ ${noShowRevenue.toFixed(2)}`);
        console.log(`   📈 Taxa CORRETA: ${noShowCount}/${totalAppointments} = ${impactPercentageCorrected.toFixed(2)}% de no-show`);
        console.log(`   ⚠️  Taxa ERRADA (atual): ${impactPercentageOriginal.toFixed(2)}% (baseada em revenue)`);
        
        const result = {
            lost_revenue: Math.round(noShowRevenue * 100) / 100,
            no_show_count: noShowCount,
            impact_percentage: Math.round(impactPercentageCorrected * 100) / 100, // ✅ CORRIGIDO
            total_appointments: totalAppointments,
            total_potential_revenue: Math.round(totalPotentialRevenue * 100) / 100,
            // Métricas adicionais para comparação
            original_wrong_percentage: Math.round(impactPercentageOriginal * 100) / 100,
            status_distribution: statusDistribution
        };
        
        return result;
        
    } catch (error) {
        console.error(`   💥 Erro no cálculo: ${error instanceof Error ? error.message : error}`);
        throw error;
    }
}

/**
 * Testar múltiplos tenants e períodos
 */
async function runTests() {
    console.log('🧪 TESTE DA MÉTRICA NO_SHOW_IMPACT CORRIGIDA');
    console.log('='.repeat(70));
    
    try {
        // Buscar tenants ativos para teste
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active');
        
        if (error) {
            throw new Error(`Erro ao buscar tenants: ${error.message}`);
        }
        
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }
        
        console.log(`📊 Testando com ${tenants.length} tenants:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        console.log('');
        
        // Testar cada tenant com diferentes períodos
        const periods = [7, 30, 90];
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(60));
            
            for (const periodDays of periods) {
                try {
                    const result = await calculateNoShowImpactCorrected(tenant.id, periodDays);
                    
                    console.log(`   📊 RESUMO ${periodDays}d:`);
                    console.log(`      No-shows: ${result.no_show_count}/${result.total_appointments}`);
                    console.log(`      Taxa CORRETA: ${result.impact_percentage}%`);
                    console.log(`      Revenue perdido: R$ ${result.lost_revenue}`);
                    console.log(`      Taxa anterior (errada): ${result.original_wrong_percentage}%`);
                    
                } catch (error) {
                    console.log(`   ❌ Erro período ${periodDays}d: ${error.message}`);
                }
            }
        }
        
        console.log('\n✅ TESTE CONCLUÍDO');
        console.log('\n📋 RESUMO DA CORREÇÃO:');
        console.log('   ❌ Fórmula ERRADA: (noShowRevenue / totalPotentialRevenue) * 100');
        console.log('   ✅ Fórmula CORRETA: (noShowCount / totalAppointments) * 100');
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar teste
if (require.main === module) {
    runTests().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateNoShowImpactCorrected };