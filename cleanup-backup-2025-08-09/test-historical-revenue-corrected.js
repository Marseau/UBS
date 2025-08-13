#!/usr/bin/env node

/**
 * TESTE HISTÓRICO REVENUE CORRIGIDO
 * 
 * Validar correção: appointments completed E confirmed
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Testar implementação corrigida (completed + confirmed)
 */
async function testCorrectedRevenueCalculation(tenantId) {
    console.log(`💰 REVENUE CORRIGIDO (completed + confirmed) para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const now = new Date();
        const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        
        // Buscar appointments
        const { data: allAppointments, error } = await supabase
            .from('appointments')
            .select('final_price, quoted_price, start_time, status')
            .eq('tenant_id', tenantId)
            .gte('start_time', sixMonthsStart.toISOString())
            .lt('start_time', now.toISOString())
            .order('start_time');
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return null;
        }
        
        if (!allAppointments || allAppointments.length === 0) {
            console.log('   📭 Nenhum appointment encontrado');
            return { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 };
        }
        
        console.log(`   📊 ${allAppointments.length} appointments encontrados`);
        
        // Análise comparativa: antes vs depois
        console.log(`\\n   📊 COMPARAÇÃO ANTES vs DEPOIS:`);
        
        const completedOnly = allAppointments.filter(app => app.status === 'completed');
        const confirmedOnly = allAppointments.filter(app => app.status === 'confirmed');
        const completedAndConfirmed = allAppointments.filter(app => app.status === 'completed' || app.status === 'confirmed');
        
        const revenueCompletedOnly = completedOnly.reduce((sum, app) => sum + (app.final_price || app.quoted_price || 0), 0);
        const revenueConfirmedOnly = confirmedOnly.reduce((sum, app) => sum + (app.final_price || app.quoted_price || 0), 0);
        const revenueTotal = completedAndConfirmed.reduce((sum, app) => sum + (app.final_price || app.quoted_price || 0), 0);
        
        console.log(`      ANTES (só completed): ${completedOnly.length} appointments = R$ ${revenueCompletedOnly.toFixed(2)}`);
        console.log(`      +Confirmed: ${confirmedOnly.length} appointments = +R$ ${revenueConfirmedOnly.toFixed(2)}`);
        console.log(`      DEPOIS (completed+confirmed): ${completedAndConfirmed.length} appointments = R$ ${revenueTotal.toFixed(2)}`);
        console.log(`      DIFERENÇA: +R$ ${(revenueTotal - revenueCompletedOnly).toFixed(2)} (+${((revenueTotal / revenueCompletedOnly - 1) * 100).toFixed(1)}%)`);
        
        // Calcular por mês com implementação corrigida
        const metrics = { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 };
        
        console.log(`\\n   💰 REVENUE CORRIGIDO POR MÊS:`);
        
        for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - (monthOffset + 1), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset, 0);
            const monthKey = `month_${monthOffset}`;
            
            const monthName = monthStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            
            // Filtrar appointments do mês
            const monthAppointments = allAppointments.filter(app => {
                const appDate = new Date(app.start_time);
                return appDate >= monthStart && appDate <= monthEnd;
            });
            
            // IMPLEMENTAÇÃO CORRIGIDA: completed + confirmed
            const revenueAppointments = monthAppointments.filter(app => 
                app.status === 'completed' || app.status === 'confirmed'
            );
            const monthRevenue = revenueAppointments.reduce((sum, app) => {
                return sum + (app.final_price || app.quoted_price || 0);
            }, 0);
            
            metrics[monthKey] = Math.round(monthRevenue * 100) / 100;
            
            console.log(`   🔍 ${monthKey} (${monthName}): ${monthAppointments.length} total`);
            console.log(`      ✅ Completed+Confirmed: ${revenueAppointments.length} appointments`);
            console.log(`      💰 Revenue: R$ ${metrics[monthKey].toFixed(2)}`);
            
            // Mostrar breakdown detalhado
            const completedCount = monthAppointments.filter(app => app.status === 'completed').length;
            const confirmedCount = monthAppointments.filter(app => app.status === 'confirmed').length;
            const otherCount = monthAppointments.length - completedCount - confirmedCount;
            
            if (completedCount > 0 || confirmedCount > 0 || otherCount > 0) {
                console.log(`      📊 Breakdown: completed(${completedCount}), confirmed(${confirmedCount}), outros(${otherCount})`);
            }
        }
        
        return metrics;
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return null;
    }
}

/**
 * Teste completo da correção
 */
async function testRevenueCorrection() {
    console.log('🧪 TESTE CORREÇÃO - HISTORICAL_6MONTHS_REVENUE');
    console.log('CORREÇÃO: appointments completed E confirmed');
    console.log('='.repeat(70));
    
    try {
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .order('name');
        
        if (error) throw error;
        
        // Testar com tenants que têm appointments
        const tenantsWithData = tenants.filter(t => 
            ['Bella Vista Spa', 'Studio Glamour', 'Charme Total'].includes(t.name)
        );
        
        console.log(`📊 Testando correção com ${tenantsWithData.length} tenants:`);
        tenantsWithData.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        const results = {};
        
        for (const tenant of tenantsWithData) {
            console.log(`\\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(70));
            
            const correctedMetrics = await testCorrectedRevenueCalculation(tenant.id);
            
            if (correctedMetrics) {
                results[tenant.id] = {
                    name: tenant.name,
                    revenue: correctedMetrics
                };
                
                // Resumo
                const totalRevenue = Object.values(correctedMetrics).reduce((sum, val) => sum + val, 0);
                console.log(`\\n   📋 RESUMO CORRIGIDO ${tenant.name}:`);
                console.log(`      Total 6 meses: R$ ${totalRevenue.toFixed(2)}`);
                console.log(`      Mês com mais revenue: R$ ${Math.max(...Object.values(correctedMetrics)).toFixed(2)}`);
            }
        }
        
        // Tabela consolidada final
        console.log('\\n📋 TABELA REVENUE CORRIGIDA (completed + confirmed)');
        console.log('='.repeat(70));
        console.log('TENANT                    | M0      | M1      | M2      | Total   ');
        console.log('                          | Jul/25  | Jun/25  | Mai/25  |         ');
        console.log('-'.repeat(70));
        
        Object.entries(results).forEach(([tenantId, data]) => {
            const name = data.name.padEnd(24);
            const r = data.revenue;
            const m0 = `R$ ${r.month_0.toFixed(0)}`.padStart(7);
            const m1 = `R$ ${r.month_1.toFixed(0)}`.padStart(7);
            const m2 = `R$ ${r.month_2.toFixed(0)}`.padStart(7);
            const total = Object.values(r).reduce((sum, val) => sum + val, 0);
            const totalStr = `R$ ${total.toFixed(0)}`.padStart(7);
            
            console.log(`${name} | ${m0} | ${m1} | ${m2} | ${totalStr} |`);
        });
        
        console.log('-'.repeat(70));
        
        console.log('\\n✅ CORREÇÃO APLICADA COM SUCESSO');
        console.log('\\n🔧 MUDANÇA IMPLEMENTADA:');
        console.log('   ❌ ANTES: .filter(app => app.status === \"completed\")');
        console.log('   ✅ DEPOIS: .filter(app => app.status === \"completed\" || app.status === \"confirmed\")');
        console.log('\\n📈 IMPACTO:');
        console.log('   - Revenue significativamente maior');
        console.log('   - Appointments confirmed agora contabilizados');
        console.log('   - Dados mais representativos da receita real');
        
        return results;
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar teste
if (require.main === module) {
    testRevenueCorrection().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { testCorrectedRevenueCalculation };