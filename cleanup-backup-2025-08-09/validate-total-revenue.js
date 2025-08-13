/**
 * VALIDAÇÃO TOTAL REVENUE
 * Soma revenue de TODOS os tenants para 7, 30 e 90 dias
 * Status: completed + confirmed
 */

require('dotenv').config();
const { getAdminClient } = require('./dist/config/database.js');

async function validateTotalRevenue() {
    console.log('💰 VALIDAÇÃO TOTAL REVENUE - TODOS OS TENANTS');
    console.log('Status considerados: completed + confirmed');
    console.log('=' .repeat(70));

    try {
        const supabase = getAdminClient();
        
        const periods = [
            { name: '7 DIAS', days: 7 },
            { name: '30 DIAS', days: 30 },
            { name: '90 DIAS', days: 90 }
        ];

        for (const period of periods) {
            console.log(`\n📅 PERÍODO: ${period.name}`);
            console.log('-'.repeat(50));
            
            // Calcular data de início
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - period.days);
            
            console.log(`📊 De: ${startDate.toISOString().split('T')[0]} até: ${endDate.toISOString().split('T')[0]}`);
            
            // Buscar TODOS os appointments do período com status completed ou confirmed
            const { data: appointments, error } = await supabase
                .from('appointments')
                .select('id, tenant_id, status, quoted_price, final_price, start_time')
                .gte('start_time', startDate.toISOString())
                .lte('start_time', endDate.toISOString())
                .in('status', ['completed', 'confirmed']);

            if (error) {
                throw new Error(`Erro: ${error.message}`);
            }

            console.log(`📋 Appointments encontrados: ${appointments?.length || 0}`);
            
            if (appointments && appointments.length > 0) {
                // Calcular revenue total
                let totalRevenue = 0;
                let appointmentsWithPrice = 0;
                let appointmentsWithoutPrice = 0;
                
                const statusCount = {};
                const revenueByTenant = {};
                
                appointments.forEach(apt => {
                    // Contar status
                    statusCount[apt.status] = (statusCount[apt.status] || 0) + 1;
                    
                    // Calcular preço
                    const price = apt.quoted_price || apt.final_price || 0;
                    
                    if (price > 0) {
                        appointmentsWithPrice++;
                        totalRevenue += price;
                        
                        // Agrupar por tenant
                        if (!revenueByTenant[apt.tenant_id]) {
                            revenueByTenant[apt.tenant_id] = { count: 0, revenue: 0 };
                        }
                        revenueByTenant[apt.tenant_id].count++;
                        revenueByTenant[apt.tenant_id].revenue += price;
                    } else {
                        appointmentsWithoutPrice++;
                    }
                });
                
                // Resultados
                console.log(`\n📈 RESULTADOS ${period.name}:`);
                console.log(`   💰 REVENUE TOTAL: R$ ${totalRevenue.toFixed(2)}`);
                console.log(`   ✅ Com preço: ${appointmentsWithPrice}`);
                console.log(`   ❌ Sem preço: ${appointmentsWithoutPrice}`);
                
                console.log(`\n📊 Status Distribution:`);
                Object.entries(statusCount).forEach(([status, count]) => {
                    console.log(`   ${status}: ${count}`);
                });
                
                console.log(`\n🏢 Revenue por Tenant (Top 5):`);
                const topTenants = Object.entries(revenueByTenant)
                    .map(([tenantId, data]) => ({ tenantId, ...data }))
                    .sort((a, b) => b.revenue - a.revenue)
                    .slice(0, 5);
                
                topTenants.forEach((tenant, index) => {
                    console.log(`   ${index + 1}. ${tenant.tenantId.substring(0, 8)}...: ${tenant.count} appointments = R$ ${tenant.revenue.toFixed(2)}`);
                });
                
            } else {
                console.log(`💰 REVENUE TOTAL: R$ 0.00`);
                console.log('❌ Nenhum appointment encontrado com status completed/confirmed');
            }
        }
        
        console.log('\n✅ VALIDAÇÃO CONCLUÍDA');
        console.log('📝 Esta é a validação real do revenue da plataforma');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    }
}

validateTotalRevenue();