#!/usr/bin/env node

/**
 * TESTE: No-Show Impact Metric
 * 
 * Valida métrica 5 do dashboard tenant
 * Foco: Impacto financeiro das faltas (no-show)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Calcular datas de início e fim para cada período
 */
function calculatePeriodDates(period) {
    const end = new Date();
    const start = new Date();
    
    switch (period) {
        case '7d':
            start.setDate(end.getDate() - 7);
            break;
        case '30d':
            start.setDate(end.getDate() - 30);
            break;
        case '90d':
            start.setDate(end.getDate() - 90);
            break;
    }
    
    return { start, end };
}

/**
 * MÉTRICA 5: No-Show Impact
 * Fórmula: 
 * - lost_revenue = SUM(final_price || quoted_price) WHERE status = 'no_show'
 * - no_show_count = COUNT(*) WHERE status = 'no_show'  
 * - impact_percentage = (lost_revenue / total_potential_revenue) * 100
 */
async function calculateNoShowImpact(tenantId, period) {
    console.log(`\n💸 CALCULANDO NO-SHOW IMPACT`);
    console.log(`   Tenant: ${tenantId}`);
    console.log(`   Período: ${period}`);
    console.log('─'.repeat(50));
    
    const { start: currentStart, end: currentEnd } = calculatePeriodDates(period);
    
    // Buscar TODOS os appointments do período (usando start_time)
    const { data: allAppointments, error: allError } = await supabase
        .from('appointments')
        .select(`
            id,
            status,
            final_price,
            quoted_price,
            start_time,
            services(name),
            users(name)
        `)
        .eq('tenant_id', tenantId)
        .gte('start_time', currentStart.toISOString())
        .lte('start_time', currentEnd.toISOString());

    if (allError) {
        console.error('❌ Erro ao buscar appointments:', allError);
        return null;
    }

    if (!allAppointments || allAppointments.length === 0) {
        console.log('⚠️ Nenhum appointment encontrado para este período');
        return {
            lost_revenue: 0,
            no_show_count: 0,
            impact_percentage: 0,
            total_appointments: 0,
            total_potential_revenue: 0,
            breakdown: {
                completed: { count: 0, revenue: 0 },
                confirmed: { count: 0, revenue: 0 },
                no_show: { count: 0, revenue: 0 },
                cancelled: { count: 0, revenue: 0 },
                other: { count: 0, revenue: 0 }
            }
        };
    }

    console.log(`📊 Total appointments encontrados: ${allAppointments.length}`);

    // Agrupar por status e calcular valores
    const breakdown = {
        completed: { count: 0, revenue: 0 },
        confirmed: { count: 0, revenue: 0 },
        no_show: { count: 0, revenue: 0 },
        cancelled: { count: 0, revenue: 0 },
        other: { count: 0, revenue: 0 }
    };

    let totalPotentialRevenue = 0; // Receita que poderia ter sido gerada (excluindo cancelados)
    let totalAppointments = allAppointments.length;

    for (const appointment of allAppointments) {
        const price = appointment.final_price || appointment.quoted_price || 0;
        const status = appointment.status;
        
        // Classificar por status
        if (status === 'completed') {
            breakdown.completed.count++;
            breakdown.completed.revenue += price;
            totalPotentialRevenue += price;
        } else if (status === 'confirmed') {
            breakdown.confirmed.count++;
            breakdown.confirmed.revenue += price;
            totalPotentialRevenue += price;
        } else if (status === 'no_show') {
            breakdown.no_show.count++;
            breakdown.no_show.revenue += price;
            totalPotentialRevenue += price; // No-show também conta como receita potencial perdida
        } else if (status === 'cancelled') {
            breakdown.cancelled.count++;
            breakdown.cancelled.revenue += price;
            // Cancelados NÃO contam como receita potencial (decisão do cliente)
        } else {
            breakdown.other.count++;
            breakdown.other.revenue += price;
            totalPotentialRevenue += price;
        }
    }

    // Calcular métricas principais
    const lostRevenue = breakdown.no_show.revenue;
    const noShowCount = breakdown.no_show.count;
    const impactPercentage = totalPotentialRevenue > 0 
        ? (lostRevenue / totalPotentialRevenue) * 100 
        : 0;

    return {
        lost_revenue: Math.round(lostRevenue * 100) / 100,
        no_show_count: noShowCount,
        impact_percentage: Math.round(impactPercentage * 100) / 100,
        total_appointments: totalAppointments,
        total_potential_revenue: Math.round(totalPotentialRevenue * 100) / 100,
        breakdown: {
            completed: {
                count: breakdown.completed.count,
                revenue: Math.round(breakdown.completed.revenue * 100) / 100
            },
            confirmed: {
                count: breakdown.confirmed.count,
                revenue: Math.round(breakdown.confirmed.revenue * 100) / 100
            },
            no_show: {
                count: breakdown.no_show.count,
                revenue: Math.round(breakdown.no_show.revenue * 100) / 100
            },
            cancelled: {
                count: breakdown.cancelled.count,
                revenue: Math.round(breakdown.cancelled.revenue * 100) / 100
            },
            other: {
                count: breakdown.other.count,
                revenue: Math.round(breakdown.other.revenue * 100) / 100
            }
        }
    };
}

/**
 * Formato transparente para exibição
 */
function displayTransparentResults(results, period, tenantId) {
    console.log(`\n💸 RESULTADOS TRANSPARENTES - NO-SHOW IMPACT`);
    console.log(`   Tenant: ${tenantId} | Período: ${period}`);
    console.log('═'.repeat(70));
    
    console.log(`\n📊 MÉTRICAS PRINCIPAIS:`);
    console.log(`   Total Appointments: ${results.total_appointments}`);
    console.log(`   No-Show Count: ${results.no_show_count}`);
    console.log(`   Lost Revenue: R$ ${results.lost_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`   Total Potential Revenue: R$ ${results.total_potential_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`   Impact Percentage: ${results.impact_percentage}%`);
    
    console.log(`\n📈 BREAKDOWN POR STATUS:`);
    
    console.log(`   ✅ COMPLETED:`);
    console.log(`      Count: ${results.breakdown.completed.count}`);
    console.log(`      Revenue: R$ ${results.breakdown.completed.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    
    console.log(`   ⏳ CONFIRMED:`);
    console.log(`      Count: ${results.breakdown.confirmed.count}`);
    console.log(`      Revenue: R$ ${results.breakdown.confirmed.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    
    console.log(`   ❌ NO-SHOW:`);
    console.log(`      Count: ${results.breakdown.no_show.count}`);
    console.log(`      Lost Revenue: R$ ${results.breakdown.no_show.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    
    console.log(`   🚫 CANCELLED:`);
    console.log(`      Count: ${results.breakdown.cancelled.count}`);
    console.log(`      Revenue (not lost): R$ ${results.breakdown.cancelled.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    
    if (results.breakdown.other.count > 0) {
        console.log(`   📋 OTHER STATUS:`);
        console.log(`      Count: ${results.breakdown.other.count}`);
        console.log(`      Revenue: R$ ${results.breakdown.other.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    }
    
    // Explicação do cálculo
    console.log(`\n🧮 CÁLCULO DO IMPACTO:`);
    console.log(`   Receita Perdida (No-Show): R$ ${results.lost_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`   Receita Potencial Total: R$ ${results.total_potential_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`   Impacto: (${results.lost_revenue} ÷ ${results.total_potential_revenue}) × 100 = ${results.impact_percentage}%`);
    
    console.log(`\n💡 INSIGHT:`);
    if (results.impact_percentage > 15) {
        console.log(`   🚨 ALTO IMPACTO: ${results.impact_percentage}% da receita potencial perdida por no-shows`);
    } else if (results.impact_percentage > 5) {
        console.log(`   ⚠️ IMPACTO MODERADO: ${results.impact_percentage}% da receita potencial perdida`);
    } else {
        console.log(`   ✅ BAIXO IMPACTO: Apenas ${results.impact_percentage}% de perda por no-shows`);
    }
}

/**
 * Testar a métrica para alguns tenants
 */
async function testNoShowImpact() {
    console.log('🚀 INICIANDO TESTE: NO-SHOW IMPACT METRIC');
    console.log('='.repeat(60));
    
    try {
        // Buscar tenants ativos
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .limit(3);
        
        if (error) {
            console.error('❌ Erro ao buscar tenants:', error);
            return;
        }
        
        const periods = ['7d', '30d', '90d'];
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TESTANDO TENANT: ${tenant.name} (${tenant.id})`);
            console.log('─'.repeat(60));
            
            for (const period of periods) {
                const results = await calculateNoShowImpact(tenant.id, period);
                
                if (results) {
                    displayTransparentResults(results, period, tenant.id);
                    console.log('\n' + '─'.repeat(60));
                }
            }
        }
        
        console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

// Executar o teste
if (require.main === module) {
    testNoShowImpact().catch(console.error);
}

module.exports = {
    calculateNoShowImpact,
    displayTransparentResults
};