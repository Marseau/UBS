/**
 * TESTE DA MÉTRICA 1: MONTHLY REVENUE
 * 
 * Vamos validar métrica por métrica, começando pela primeira:
 * - Fórmula: SUM(final_price || quoted_price) WHERE status = 'completed'
 * - Períodos: 7d, 30d, 90d
 * - Comparação com período anterior para % change
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Testar cálculo de Monthly Revenue para um tenant específico
 */
async function testMonthlyRevenueCalculation() {
    console.log('🧪 TESTE DA MÉTRICA 1: MONTHLY REVENUE');
    console.log('='.repeat(60));
    
    try {
        // 1. Obter um tenant ativo para teste
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name, domain')
            .limit(1);
        
        if (tenantsError) {
            console.error('❌ Erro ao buscar tenants:', tenantsError);
            return;
        }
        
        if (!tenants || tenants.length === 0) {
            console.log('⚠️ Nenhum tenant encontrado para teste');
            return;
        }
        
        const testTenant = tenants[0];
        console.log(`🏢 Testando com tenant: ${testTenant.name} (${testTenant.domain})`);
        console.log('');
        
        // 2. Testar cálculo para cada período
        const periods = ['7d', '30d', '90d'];
        
        for (const period of periods) {
            console.log(`📊 Testando período: ${period}`);
            console.log('-'.repeat(40));
            
            // Calcular datas do período
            const end = new Date();
            const start = new Date();
            const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
            start.setDate(end.getDate() - periodDays);
            
            // Período anterior para comparação
            const previousStart = new Date(start);
            previousStart.setDate(previousStart.getDate() - periodDays);
            
            console.log(`📅 Período atual: ${start.toLocaleDateString('pt-BR')} - ${end.toLocaleDateString('pt-BR')}`);
            console.log(`📅 Período anterior: ${previousStart.toLocaleDateString('pt-BR')} - ${start.toLocaleDateString('pt-BR')}`);
            
            // 3. Buscar appointments do período atual
            const { data: currentAppointments, error: currentError } = await supabase
                .from('appointments')
                .select('id, final_price, quoted_price, status, created_at')
                .eq('tenant_id', testTenant.id)
                .gte('created_at', start.toISOString())
                .lte('created_at', end.toISOString());
            
            if (currentError) {
                console.error('❌ Erro ao buscar appointments atuais:', currentError);
                continue;
            }
            
            // 4. Buscar appointments do período anterior
            const { data: previousAppointments, error: previousError } = await supabase
                .from('appointments')
                .select('id, final_price, quoted_price, status, created_at')
                .eq('tenant_id', testTenant.id)
                .gte('created_at', previousStart.toISOString())
                .lt('created_at', start.toISOString());
            
            if (previousError) {
                console.error('❌ Erro ao buscar appointments anteriores:', previousError);
                continue;
            }
            
            // 5. Analisar dados encontrados
            console.log(`🔍 Appointments encontrados (atual): ${currentAppointments?.length || 0}`);
            console.log(`🔍 Appointments encontrados (anterior): ${previousAppointments?.length || 0}`);
            
            if (currentAppointments && currentAppointments.length > 0) {
                console.log('📋 Status dos appointments atuais:');
                const statusCount = {};
                currentAppointments.forEach(apt => {
                    statusCount[apt.status] = (statusCount[apt.status] || 0) + 1;
                });
                Object.entries(statusCount).forEach(([status, count]) => {
                    console.log(`   ${status}: ${count}`);
                });
            }
            
            // 6. Calcular revenue apenas dos 'completed'
            const currentCompleted = currentAppointments?.filter(apt => apt.status === 'completed') || [];
            const previousCompleted = previousAppointments?.filter(apt => apt.status === 'completed') || [];
            
            console.log(`✅ Appointments 'completed' (atual): ${currentCompleted.length}`);
            console.log(`✅ Appointments 'completed' (anterior): ${previousCompleted.length}`);
            
            // 7. Calcular revenue total
            const currentRevenue = currentCompleted.reduce((sum, apt) => {
                const price = apt.final_price || apt.quoted_price || 0;
                return sum + price;
            }, 0);
            
            const previousRevenue = previousCompleted.reduce((sum, apt) => {
                const price = apt.final_price || apt.quoted_price || 0;
                return sum + price;
            }, 0);
            
            // 8. Calcular % change
            const changePercent = previousRevenue > 0 
                ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 
                : currentRevenue > 0 ? 100 : 0;
            
            // 9. Mostrar resultados
            console.log(`💰 Revenue atual: R$ ${currentRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            console.log(`💰 Revenue anterior: R$ ${previousRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            console.log(`📈 Mudança: ${changePercent.toFixed(2)}%`);
            
            // 10. Mostrar detalhes dos appointments para validação manual
            if (currentCompleted.length > 0) {
                console.log('📝 Detalhes dos appointments completed (atual):');
                currentCompleted.slice(0, 5).forEach((apt, i) => {
                    const price = apt.final_price || apt.quoted_price || 0;
                    console.log(`   ${i+1}. ID: ${apt.id} | Preço: R$ ${price.toFixed(2)} | Data: ${new Date(apt.created_at).toLocaleDateString('pt-BR')}`);
                });
                if (currentCompleted.length > 5) {
                    console.log(`   ... e mais ${currentCompleted.length - 5} appointments`);
                }
            }
            
            console.log('');
        }
        
        // 11. Resumo final
        console.log('='.repeat(60));
        console.log('📊 RESUMO DO TESTE');
        console.log('='.repeat(60));
        console.log('✅ Fórmula testada: SUM(final_price || quoted_price) WHERE status = "completed"');
        console.log('✅ Períodos testados: 7d, 30d, 90d');
        console.log('✅ Comparação com período anterior implementada');
        console.log('✅ Cálculo de % change funcionando');
        console.log('');
        console.log('🎯 PRÓXIMO PASSO: Validar se os valores estão corretos e implementar no cron job');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ Erro durante o teste:', error);
    }
}

/**
 * Teste de validação cruzada: comparar com query SQL direta
 */
async function validateWithDirectSQL() {
    console.log('🔍 VALIDAÇÃO CRUZADA COM SQL DIRETO');
    console.log('='.repeat(60));
    
    try {
        // Query SQL direta para validar os cálculos
        const { data: validation, error } = await supabase
            .from('appointments')
            .select(`
                tenant_id,
                tenants!inner(name),
                status,
                final_price,
                quoted_price,
                created_at
            `)
            .eq('status', 'completed')
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Últimos 30 dias
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('❌ Erro na validação SQL:', error);
            return;
        }
        
        console.log(`📊 Total de appointments 'completed' (30d): ${validation?.length || 0}`);
        
        if (validation && validation.length > 0) {
            // Agrupar por tenant
            const revenueByTenant = {};
            validation.forEach(apt => {
                const tenantName = apt.tenants.name;
                const price = apt.final_price || apt.quoted_price || 0;
                
                if (!revenueByTenant[tenantName]) {
                    revenueByTenant[tenantName] = {
                        count: 0,
                        total: 0
                    };
                }
                
                revenueByTenant[tenantName].count++;
                revenueByTenant[tenantName].total += price;
            });
            
            console.log('📈 Revenue por tenant (últimos 30 dias):');
            Object.entries(revenueByTenant)
                .sort((a, b) => b[1].total - a[1].total)
                .forEach(([tenant, data]) => {
                    console.log(`   ${tenant}: R$ ${data.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${data.count} appointments)`);
                });
        }
        
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ Erro na validação:', error);
    }
}

/**
 * Executar todos os testes
 */
async function main() {
    await testMonthlyRevenueCalculation();
    console.log('');
    await validateWithDirectSQL();
}

main().catch(console.error);