#!/usr/bin/env node

/**
 * RELATÓRIO REVENUE 6 MESES POR TENANT
 * 
 * Revenue por mês nos últimos 6 meses (excluindo o atual)
 * Status: completed E confirmed
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular revenue por tenant por mês (6 meses anteriores)
 */
async function calculateTenantRevenueByMonth(tenantId, tenantName) {
    console.log(`💰 Revenue 6 meses: ${tenantName}`);
    
    try {
        const now = new Date();
        const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        
        // Buscar appointments dos últimos 6 meses (EXCLUINDO o atual)
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('final_price, quoted_price, start_time, status')
            .eq('tenant_id', tenantId)
            .gte('start_time', sixMonthsStart.toISOString())
            .lt('start_time', new Date(now.getFullYear(), now.getMonth(), 1).toISOString()) // ANTES do mês atual
            .in('status', ['completed', 'confirmed']) // Apenas completed e confirmed
            .order('start_time');
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return null;
        }
        
        if (!appointments || appointments.length === 0) {
            console.log('   📭 Nenhum appointment (completed/confirmed) encontrado');
            return { fev: 0, mar: 0, abr: 0, mai: 0, jun: 0, jul: 0, total: 0 };
        }
        
        console.log(`   📊 ${appointments.length} appointments (completed/confirmed)`);
        
        // Mapear os últimos 6 meses (excluindo atual)
        const monthlyRevenue = {
            fev: { name: 'Fev/25', revenue: 0 },
            mar: { name: 'Mar/25', revenue: 0 },
            abr: { name: 'Abr/25', revenue: 0 },
            mai: { name: 'Mai/25', revenue: 0 },
            jun: { name: 'Jun/25', revenue: 0 },
            jul: { name: 'Jul/25', revenue: 0 }
        };
        
        // Processar appointments por mês
        appointments.forEach(app => {
            const appDate = new Date(app.start_time);
            const month = appDate.getMonth() + 1; // 1-12
            const year = appDate.getFullYear();
            const price = app.final_price || app.quoted_price || 0;
            
            // Mapear para os meses corretos (2025)
            if (year === 2025) {
                switch (month) {
                    case 2: monthlyRevenue.fev.revenue += price; break;
                    case 3: monthlyRevenue.mar.revenue += price; break;
                    case 4: monthlyRevenue.abr.revenue += price; break;
                    case 5: monthlyRevenue.mai.revenue += price; break;
                    case 6: monthlyRevenue.jun.revenue += price; break;
                    case 7: monthlyRevenue.jul.revenue += price; break;
                }
            }
        });
        
        // Arredondar valores
        Object.keys(monthlyRevenue).forEach(month => {
            monthlyRevenue[month].revenue = Math.round(monthlyRevenue[month].revenue * 100) / 100;
        });
        
        // Calcular total
        const total = Object.values(monthlyRevenue).reduce((sum, month) => sum + month.revenue, 0);
        
        // Mostrar detalhes
        console.log('   📅 Revenue por mês:');
        Object.entries(monthlyRevenue).forEach(([key, data]) => {
            if (data.revenue > 0) {
                console.log(`      ${data.name}: R$ ${data.revenue.toFixed(2)}`);
            }
        });
        console.log(`   💰 Total 6 meses: R$ ${total.toFixed(2)}`);
        
        return {
            fev: monthlyRevenue.fev.revenue,
            mar: monthlyRevenue.mar.revenue,
            abr: monthlyRevenue.abr.revenue,
            mai: monthlyRevenue.mai.revenue,
            jun: monthlyRevenue.jun.revenue,
            jul: monthlyRevenue.jul.revenue,
            total: total
        };
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return null;
    }
}

/**
 * Gerar relatório completo por tenant
 */
async function generateTenantRevenueReport() {
    console.log('📊 RELATÓRIO REVENUE POR TENANT - ÚLTIMOS 6 MESES');
    console.log('Status incluídos: completed E confirmed');
    console.log('Período: Fev/25 - Jul/25 (excluindo Ago/25)');
    console.log('='.repeat(80));
    
    try {
        // Buscar todos os tenants ativos
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .order('name');
        
        if (error) throw error;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado');
            return;
        }
        
        console.log(`📊 Processando ${tenants.length} tenants ativos\\n`);
        
        const results = {};
        
        // Processar cada tenant
        for (const tenant of tenants) {
            console.log(`\\n🏢 ${tenant.name} (${tenant.id.substring(0, 8)})`);
            console.log('-'.repeat(60));
            
            const revenueData = await calculateTenantRevenueByMonth(tenant.id, tenant.name);
            
            if (revenueData) {
                results[tenant.id] = {
                    name: tenant.name,
                    revenue: revenueData
                };
            }
        }
        
        // Filtrar apenas tenants com revenue > 0
        const tenantsWithRevenue = Object.entries(results).filter(([id, data]) => data.revenue.total > 0);
        
        console.log('\\n\\n📋 TABELA CONSOLIDADA - REVENUE POR MÊS (R$)');
        console.log('='.repeat(80));
        console.log('TENANT                    | Fev/25  | Mar/25  | Abr/25  | Mai/25  | Jun/25  | Jul/25  | TOTAL   |');
        console.log('-'.repeat(80));
        
        // Ordenar por total (maior primeiro)
        tenantsWithRevenue.sort(([,a], [,b]) => b.revenue.total - a.revenue.total);
        
        let grandTotal = 0;
        
        tenantsWithRevenue.forEach(([tenantId, data]) => {
            const name = data.name.padEnd(24);
            const r = data.revenue;
            const fev = r.fev > 0 ? `R$ ${r.fev.toFixed(0)}`.padStart(7) : '   R$ 0';
            const mar = r.mar > 0 ? `R$ ${r.mar.toFixed(0)}`.padStart(7) : '   R$ 0';
            const abr = r.abr > 0 ? `R$ ${r.abr.toFixed(0)}`.padStart(7) : '   R$ 0';
            const mai = r.mai > 0 ? `R$ ${r.mai.toFixed(0)}`.padStart(7) : '   R$ 0';
            const jun = r.jun > 0 ? `R$ ${r.jun.toFixed(0)}`.padStart(7) : '   R$ 0';
            const jul = r.jul > 0 ? `R$ ${r.jul.toFixed(0)}`.padStart(7) : '   R$ 0';
            const total = `R$ ${r.total.toFixed(0)}`.padStart(7);
            
            grandTotal += r.total;
            
            console.log(`${name} | ${fev} | ${mar} | ${abr} | ${mai} | ${jun} | ${jul} | ${total} |`);
        });
        
        console.log('-'.repeat(80));
        console.log(`${'TOTAL PLATAFORMA'.padEnd(24)} |         |         |         |         |         |         | ${`R$ ${grandTotal.toFixed(0)}`.padStart(7)} |`);
        console.log('='.repeat(80));
        
        // Estatísticas resumidas
        console.log('\\n📊 ESTATÍSTICAS RESUMIDAS');
        console.log('-'.repeat(40));
        console.log(`Tenants com revenue: ${tenantsWithRevenue.length}/${tenants.length}`);
        console.log(`Revenue total plataforma: R$ ${grandTotal.toFixed(2)}`);
        console.log(`Revenue médio por tenant: R$ ${(grandTotal / tenantsWithRevenue.length).toFixed(2)}`);
        
        // Top 3 tenants
        console.log('\\n🏆 TOP 3 TENANTS POR REVENUE:');
        tenantsWithRevenue.slice(0, 3).forEach(([ , data], index) => {
            console.log(`   ${index + 1}. ${data.name}: R$ ${data.revenue.total.toFixed(2)}`);
        });
        
        // Mês com mais revenue
        const monthTotals = {
            fev: tenantsWithRevenue.reduce((sum, [, data]) => sum + data.revenue.fev, 0),
            mar: tenantsWithRevenue.reduce((sum, [, data]) => sum + data.revenue.mar, 0),
            abr: tenantsWithRevenue.reduce((sum, [, data]) => sum + data.revenue.abr, 0),
            mai: tenantsWithRevenue.reduce((sum, [, data]) => sum + data.revenue.mai, 0),
            jun: tenantsWithRevenue.reduce((sum, [, data]) => sum + data.revenue.jun, 0),
            jul: tenantsWithRevenue.reduce((sum, [, data]) => sum + data.revenue.jul, 0)
        };
        
        const bestMonth = Object.entries(monthTotals).reduce((max, [month, total]) => 
            total > max.total ? { month, total } : max, { month: '', total: 0 }
        );
        
        console.log('\\n📅 DISTRIBUIÇÃO TEMPORAL:');
        console.log(`Mês com maior revenue: ${bestMonth.month.toUpperCase()}/25 (R$ ${bestMonth.total.toFixed(2)})`);
        console.log('Revenue por mês:');
        Object.entries(monthTotals).forEach(([month, total]) => {
            if (total > 0) {
                console.log(`   ${month.toUpperCase()}/25: R$ ${total.toFixed(2)}`);
            }
        });
        
        console.log('\\n✅ RELATÓRIO CONCLUÍDO');
        return results;
        
    } catch (error) {
        console.error('💥 ERRO NO RELATÓRIO:', error);
        process.exit(1);
    }
}

// Executar relatório
if (require.main === module) {
    generateTenantRevenueReport().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateTenantRevenueByMonth };