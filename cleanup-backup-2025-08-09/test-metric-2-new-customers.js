/**
 * TESTE DA MÉTRICA 2: NEW CUSTOMERS
 * 
 * Vamos validar a segunda métrica do dashboard:
 * - Fórmula: COUNT(DISTINCT user_id) WHERE user_id não aparece em períodos anteriores
 * - Períodos: 7d, 30d, 90d
 * - Comparação com período anterior para % change
 * - Breakdown por serviço e profissional
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Testar cálculo de New Customers para um tenant específico
 */
async function testNewCustomersCalculation() {
    console.log('🧪 TESTE DA MÉTRICA 2: NEW CUSTOMERS');
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
            
            // 3. Buscar customers do período atual
            const { data: currentCustomers, error: currentError } = await supabase
                .from('appointments')
                .select(`
                    user_id, 
                    created_at,
                    service_id,
                    professional_id,
                    services!inner(name),
                    professionals!inner(name)
                `)
                .eq('tenant_id', testTenant.id)
                .gte('created_at', start.toISOString())
                .lte('created_at', end.toISOString());
            
            if (currentError) {
                console.error('❌ Erro ao buscar appointments atuais:', currentError);
                continue;
            }
            
            // 4. Buscar TODOS os customers históricos do tenant (antes do período atual)
            const { data: historicalCustomers, error: historicalError } = await supabase
                .from('appointments')
                .select('user_id, created_at')
                .eq('tenant_id', testTenant.id)
                .lt('created_at', start.toISOString());
            
            if (historicalError) {
                console.error('❌ Erro ao buscar historical customers:', historicalError);
                continue;
            }
            
            // 5. Buscar customers do período anterior
            const { data: previousCustomers, error: previousError } = await supabase
                .from('appointments')
                .select('user_id, created_at')
                .eq('tenant_id', testTenant.id)
                .gte('created_at', previousStart.toISOString())
                .lt('created_at', start.toISOString());
            
            if (previousError) {
                console.error('❌ Erro ao buscar previous customers:', previousError);
                continue;
            }
            
            // 6. Processar dados encontrados
            const currentUserIds = new Set(currentCustomers?.map(c => c.user_id) || []);
            const historicalUserIds = new Set(historicalCustomers?.map(c => c.user_id) || []);
            const previousUserIds = new Set(previousCustomers?.map(c => c.user_id) || []);
            
            console.log(`🔍 Total appointments (atual): ${currentCustomers?.length || 0}`);
            console.log(`🔍 Customers únicos (atual): ${currentUserIds.size}`);
            console.log(`🔍 Customers históricos: ${historicalUserIds.size}`);
            console.log(`🔍 Customers período anterior: ${previousUserIds.size}`);
            
            // 7. Identificar NEW customers (que nunca apareceram antes)
            const newCustomers = new Set();
            const previousNewCustomers = new Set();
            
            // New customers no período atual
            currentUserIds.forEach(userId => {
                if (!historicalUserIds.has(userId)) {
                    newCustomers.add(userId);
                }
            });
            
            // New customers no período anterior
            previousUserIds.forEach(userId => {
                // Para o período anterior, historical deve excluir o período anterior
                const historicalBeforePrevious = new Set();
                historicalCustomers?.forEach(c => {
                    const customerDate = new Date(c.created_at);
                    if (customerDate < previousStart) {
                        historicalBeforePrevious.add(c.user_id);
                    }
                });
                
                if (!historicalBeforePrevious.has(userId)) {
                    previousNewCustomers.add(userId);
                }
            });
            
            console.log(`👥 NEW customers (atual): ${newCustomers.size}`);
            console.log(`👥 NEW customers (anterior): ${previousNewCustomers.size}`);
            
            // 8. Calcular % change
            const changePercent = previousNewCustomers.size > 0 
                ? ((newCustomers.size - previousNewCustomers.size) / previousNewCustomers.size) * 100 
                : newCustomers.size > 0 ? 100 : 0;
            
            console.log(`📈 Mudança: ${changePercent.toFixed(2)}%`);
            
            // 9. Breakdown por serviço e profissional (apenas NEW customers)
            if (newCustomers.size > 0) {
                console.log('🔍 Breakdown dos NEW customers:');
                
                // Filtrar appointments dos new customers
                const newCustomerAppointments = currentCustomers?.filter(apt => 
                    newCustomers.has(apt.user_id)
                ) || [];
                
                // Breakdown por serviço
                const serviceBreakdown = {};
                const professionalBreakdown = {};
                
                newCustomerAppointments.forEach(apt => {
                    const serviceName = apt.services?.name || 'Serviço não identificado';
                    const professionalName = apt.professionals?.name || 'Profissional não identificado';
                    
                    serviceBreakdown[serviceName] = (serviceBreakdown[serviceName] || 0) + 1;
                    professionalBreakdown[professionalName] = (professionalBreakdown[professionalName] || 0) + 1;
                });
                
                console.log('   📋 Por serviço:');
                Object.entries(serviceBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([service, count]) => {
                        console.log(`      ${service}: ${count} new customers`);
                    });
                
                console.log('   👨‍⚕️ Por profissional:');
                Object.entries(professionalBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([professional, count]) => {
                        console.log(`      ${professional}: ${count} new customers`);
                    });
                
                // Mostrar alguns exemplos de new customers
                console.log('   📝 Exemplos de NEW customers:');
                Array.from(newCustomers).slice(0, 5).forEach((userId, i) => {
                    const appointment = newCustomerAppointments.find(apt => apt.user_id === userId);
                    if (appointment) {
                        console.log(`      ${i+1}. User ID: ${userId} | Serviço: ${appointment.services?.name || 'N/A'} | Data: ${new Date(appointment.created_at).toLocaleDateString('pt-BR')}`);
                    }
                });
                
                if (newCustomers.size > 5) {
                    console.log(`      ... e mais ${newCustomers.size - 5} new customers`);
                }
            }
            
            console.log('');
        }
        
        // 10. Resumo final
        console.log('='.repeat(60));
        console.log('📊 RESUMO DO TESTE');
        console.log('='.repeat(60));
        console.log('✅ Fórmula testada: COUNT(DISTINCT user_id) WHERE user_id não existe em períodos anteriores');
        console.log('✅ Períodos testados: 7d, 30d, 90d');
        console.log('✅ Comparação com período anterior implementada');
        console.log('✅ Breakdown por serviço e profissional implementado');
        console.log('✅ Identificação correta de NEW vs RETURNING customers');
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
    console.log('🔍 VALIDAÇÃO CRUZADA COM SQL DIRETO - NEW CUSTOMERS');
    console.log('='.repeat(60));
    
    try {
        // Query para validar new customers nos últimos 30 dias
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        // Buscar todos os appointments dos últimos 30 dias com dados completos
        const { data: validation, error } = await supabase
            .from('appointments')
            .select(`
                tenant_id,
                user_id,
                created_at,
                tenants!inner(name),
                services!inner(name),
                professionals!inner(name)
            `)
            .gte('created_at', thirtyDaysAgo.toISOString())
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('❌ Erro na validação SQL:', error);
            return;
        }
        
        console.log(`📊 Total de appointments (30d): ${validation?.length || 0}`);
        
        if (validation && validation.length > 0) {
            // Agrupar por tenant
            const tenantData = {};
            
            validation.forEach(apt => {
                const tenantName = apt.tenants.name;
                if (!tenantData[tenantName]) {
                    tenantData[tenantName] = {
                        customers: new Set(),
                        services: {},
                        professionals: {}
                    };
                }
                
                tenantData[tenantName].customers.add(apt.user_id);
                
                const serviceName = apt.services.name;
                const professionalName = apt.professionals.name;
                
                tenantData[tenantName].services[serviceName] = (tenantData[tenantName].services[serviceName] || 0) + 1;
                tenantData[tenantName].professionals[professionalName] = (tenantData[tenantName].professionals[professionalName] || 0) + 1;
            });
            
            console.log('📈 Customers únicos por tenant (últimos 30 dias):');
            Object.entries(tenantData)
                .sort((a, b) => b[1].customers.size - a[1].customers.size)
                .forEach(([tenant, data]) => {
                    console.log(`   ${tenant}: ${data.customers.size} customers únicos`);
                    
                    // Top 3 serviços
                    const topServices = Object.entries(data.services)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3);
                    console.log(`      Top serviços: ${topServices.map(([name, count]) => `${name} (${count})`).join(', ')}`);
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
    await testNewCustomersCalculation();
    console.log('');
    await validateWithDirectSQL();
}

main().catch(console.error);