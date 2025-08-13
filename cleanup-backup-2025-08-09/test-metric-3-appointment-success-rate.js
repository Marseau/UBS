/**
 * TESTE DA MÉTRICA 3: APPOINTMENT SUCCESS RATE
 * 
 * Vamos validar a terceira métrica do dashboard:
 * - Fórmula: (appointments WHERE status = 'completed') / (total appointments) * 100
 * - Períodos: 7d, 30d, 90d
 * - Success = 'completed', Insucesso = 'cancelled', 'no_show', etc.
 * - Análise por tenant e período
 * - Breakdown por serviço e profissional
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Testar cálculo de Appointment Success Rate para TODOS os tenants
 */
async function testAppointmentSuccessRate() {
    console.log('🧪 TESTE DA MÉTRICA 3: APPOINTMENT SUCCESS RATE');
    console.log('='.repeat(70));
    
    try {
        // 1. Obter todos os tenants ativos
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name, domain')
            .order('name');
        
        if (tenantsError) {
            console.error('❌ Erro ao buscar tenants:', tenantsError);
            return;
        }
        
        if (!tenants || tenants.length === 0) {
            console.log('⚠️ Nenhum tenant encontrado para teste');
            return;
        }
        
        console.log(`🏢 Analisando ${tenants.length} tenants encontrados`);
        console.log('');
        
        // 2. Testar cálculo para cada período
        const periods = ['7d', '30d', '90d'];
        
        for (const period of periods) {
            console.log(`📊 ANÁLISE PERÍODO: ${period}`);
            console.log('='.repeat(70));
            
            // Calcular datas do período
            const end = new Date();
            const start = new Date();
            const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
            start.setDate(end.getDate() - periodDays);
            
            console.log(`📅 Período: ${start.toLocaleDateString('pt-BR')} - ${end.toLocaleDateString('pt-BR')}`);
            console.log('');
            
            // Cabeçalho da tabela
            console.log('TENANT'.padEnd(25) + 'TOTAL'.padEnd(8) + 'COMPLETED'.padEnd(12) + 'SUCCESS%'.padEnd(10) + 'TOP SERVIÇO'.padEnd(20) + 'TOP PROFISSIONAL');
            console.log('-'.repeat(90));
            
            let totalAppointments = 0;
            let totalCompleted = 0;
            const globalServiceBreakdown = {};
            const globalProfessionalBreakdown = {};
            
            // 3. Analisar cada tenant
            for (const tenant of tenants) {
                // Buscar appointments do tenant no período
                const { data: appointments, error: appointmentsError } = await supabase
                    .from('appointments')
                    .select(`
                        id,
                        status,
                        created_at,
                        service_id,
                        professional_id,
                        services(name),
                        professionals(name)
                    `)
                    .eq('tenant_id', tenant.id)
                    .gte('created_at', start.toISOString())
                    .lte('created_at', end.toISOString());
                
                if (appointmentsError) {
                    console.error(`❌ Erro ao buscar appointments para ${tenant.name}:`, appointmentsError);
                    continue;
                }
                
                if (!appointments || appointments.length === 0) {
                    // Tenant sem atividade no período
                    console.log(`${tenant.name.substring(0, 24).padEnd(25)}${'0'.padEnd(8)}${'0'.padEnd(12)}${'N/A'.padEnd(10)}${'Sem dados'.padEnd(20)}${'Sem dados'}`);
                    continue;
                }
                
                // 4. Calcular métricas do tenant
                const total = appointments.length;
                const completed = appointments.filter(apt => apt.status === 'completed').length;
                const successRate = total > 0 ? (completed / total) * 100 : 0;
                
                totalAppointments += total;
                totalCompleted += completed;
                
                // 5. Breakdown por serviço (apenas completed)
                const serviceBreakdown = {};
                const professionalBreakdown = {};
                const completedAppointments = appointments.filter(apt => apt.status === 'completed');
                
                completedAppointments.forEach(apt => {
                    const serviceName = apt.services?.name || 'N/A';
                    const professionalName = apt.professionals?.name || 'N/A';
                    
                    serviceBreakdown[serviceName] = (serviceBreakdown[serviceName] || 0) + 1;
                    professionalBreakdown[professionalName] = (professionalBreakdown[professionalName] || 0) + 1;
                    
                    // Global breakdown
                    globalServiceBreakdown[serviceName] = (globalServiceBreakdown[serviceName] || 0) + 1;
                    globalProfessionalBreakdown[professionalName] = (globalProfessionalBreakdown[professionalName] || 0) + 1;
                });
                
                // Top serviço e profissional do tenant
                const topService = Object.entries(serviceBreakdown)
                    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
                const topProfessional = Object.entries(professionalBreakdown)
                    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
                
                // 6. Exibir linha do tenant
                console.log(
                    `${tenant.name.substring(0, 24).padEnd(25)}` +
                    `${total.toString().padEnd(8)}` +
                    `${completed.toString().padEnd(12)}` +
                    `${successRate.toFixed(1)}%`.padEnd(10) +
                    `${topService.substring(0, 19).padEnd(20)}` +
                    `${topProfessional.substring(0, 19)}`
                );
            }
            
            // 7. Resumo do período
            console.log('-'.repeat(90));
            const globalSuccessRate = totalAppointments > 0 ? (totalCompleted / totalAppointments) * 100 : 0;
            console.log(
                `${'TOTAL PLATAFORMA'.padEnd(25)}` +
                `${totalAppointments.toString().padEnd(8)}` +
                `${totalCompleted.toString().padEnd(12)}` +
                `${globalSuccessRate.toFixed(1)}%`.padEnd(10) +
                `${'AGREGADO'.padEnd(20)}` +
                `${'AGREGADO'}`
            );
            
            // 8. Top 5 serviços e profissionais globais
            console.log('');
            console.log('📋 TOP 5 SERVIÇOS (appointments completed):');
            Object.entries(globalServiceBreakdown)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .forEach(([service, count], index) => {
                    const percentage = totalCompleted > 0 ? (count / totalCompleted * 100).toFixed(1) : 0;
                    console.log(`   ${index + 1}. ${service}: ${count} completed (${percentage}%)`);
                });
            
            console.log('');
            console.log('👨‍⚕️ TOP 5 PROFISSIONAIS (appointments completed):');
            Object.entries(globalProfessionalBreakdown)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .forEach(([professional, count], index) => {
                    const percentage = totalCompleted > 0 ? (count / totalCompleted * 100).toFixed(1) : 0;
                    console.log(`   ${index + 1}. ${professional}: ${count} completed (${percentage}%)`);
                });
            
            console.log('');
            console.log('📊 ANÁLISE DE STATUS:');
            
            // Analisar distribuição de status globalmente
            const { data: statusAnalysis, error: statusError } = await supabase
                .from('appointments')
                .select('status')
                .gte('created_at', start.toISOString())
                .lte('created_at', end.toISOString());
            
            if (!statusError && statusAnalysis) {
                const statusCount = {};
                statusAnalysis.forEach(apt => {
                    statusCount[apt.status] = (statusCount[apt.status] || 0) + 1;
                });
                
                Object.entries(statusCount)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([status, count]) => {
                        const percentage = statusAnalysis.length > 0 ? (count / statusAnalysis.length * 100).toFixed(1) : 0;
                        console.log(`   ${status}: ${count} appointments (${percentage}%)`);
                    });
            }
            
            console.log('');
            console.log('='.repeat(70));
            console.log('');
        }
        
        // 9. Resumo final
        console.log('📊 RESUMO DO TESTE - APPOINTMENT SUCCESS RATE');
        console.log('='.repeat(70));
        console.log('✅ Fórmula testada: (completed / total) * 100');
        console.log('✅ Períodos testados: 7d, 30d, 90d');
        console.log('✅ Análise por tenant implementada');
        console.log('✅ Breakdown por serviço e profissional implementado');
        console.log('✅ Análise de distribuição de status implementada');
        console.log('');
        console.log('🎯 PRÓXIMO PASSO: Validar se as taxas estão corretas e implementar no cron job');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ Erro durante o teste:', error);
    }
}

/**
 * Análise detalhada de um tenant específico
 */
async function detailedTenantAnalysis(tenantName = 'Bella Vista Spa') {
    console.log(`🔍 ANÁLISE DETALHADA: ${tenantName}`);
    console.log('='.repeat(60));
    
    try {
        // Buscar o tenant
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id, name, domain')
            .ilike('name', `%${tenantName}%`)
            .limit(1);
        
        if (tenantError || !tenant || tenant.length === 0) {
            console.log('❌ Tenant não encontrado');
            return;
        }
        
        const targetTenant = tenant[0];
        console.log(`🏢 Tenant: ${targetTenant.name} (${targetTenant.domain})`);
        
        // Análise nos últimos 30 dias
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select(`
                id,
                status,
                created_at,
                final_price,
                quoted_price,
                services(name),
                professionals(name)
            `)
            .eq('tenant_id', targetTenant.id)
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('❌ Erro:', error);
            return;
        }
        
        console.log(`📊 Total appointments (30d): ${appointments?.length || 0}`);
        
        if (appointments && appointments.length > 0) {
            // Status breakdown
            const statusBreakdown = {};
            let totalRevenue = 0;
            let completedRevenue = 0;
            
            appointments.forEach(apt => {
                statusBreakdown[apt.status] = (statusBreakdown[apt.status] || 0) + 1;
                
                const price = apt.final_price || apt.quoted_price || 0;
                totalRevenue += price;
                if (apt.status === 'completed') {
                    completedRevenue += price;
                }
            });
            
            console.log('');
            console.log('📋 Breakdown por status:');
            Object.entries(statusBreakdown).forEach(([status, count]) => {
                const percentage = (count / appointments.length * 100).toFixed(1);
                console.log(`   ${status}: ${count} appointments (${percentage}%)`);
            });
            
            const completed = statusBreakdown['completed'] || 0;
            const successRate = (completed / appointments.length * 100).toFixed(1);
            
            console.log('');
            console.log(`✅ Success Rate: ${successRate}%`);
            console.log(`💰 Revenue total: R$ ${totalRevenue.toFixed(2)}`);
            console.log(`💰 Revenue completed: R$ ${completedRevenue.toFixed(2)}`);
            console.log(`📉 Revenue potencial perdido: R$ ${(totalRevenue - completedRevenue).toFixed(2)}`);
        }
        
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ Erro na análise detalhada:', error);
    }
}

/**
 * Executar todos os testes
 */
async function main() {
    await testAppointmentSuccessRate();
    console.log('');
    await detailedTenantAnalysis();
}

main().catch(console.error);