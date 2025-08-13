#!/usr/bin/env node
/**
 * EXTRAÇÃO REAL: Agendamentos por Serviço por Tenant
 * Períodos: 7, 30 e 90 dias usando start_time
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function extractAppointmentsByServiceTenant() {
    console.log('📊 EXTRAÇÃO: Agendamentos por Serviço por Tenant');
    console.log('📅 Períodos: 7, 30 e 90 dias usando start_time');
    console.log('='.repeat(60));
    
    try {
        const periods = [
            { name: '7d', days: 7 },
            { name: '30d', days: 30 },
            { name: '90d', days: 90 }
        ];
        
        const results = {};
        
        for (const period of periods) {
            console.log(`\n🔍 PERÍODO: ${period.name} (últimos ${period.days} dias)`);
            console.log('-'.repeat(50));
            
            const startDate = new Date(Date.now() - period.days * 24 * 60 * 60 * 1000);
            const endDate = new Date();
            
            console.log(`📅 Intervalo: ${startDate.toISOString().substring(0, 10)} até ${endDate.toISOString().substring(0, 10)}`);
            
            // Buscar appointments por start_time
            const { data: appointments, error } = await adminClient
                .from('appointments')
                .select(`
                    tenant_id,
                    service_name,
                    service_type,
                    status,
                    quoted_price,
                    final_price,
                    start_time,
                    created_at
                `)
                .gte('start_time', startDate.toISOString())
                .lte('start_time', endDate.toISOString())
                .in('status', ['completed', 'confirmed', 'pending', 'cancelled', 'no_show'])
                .order('tenant_id');
                
            if (error) {
                console.log('❌ Erro:', error.message);
                continue;
            }
            
            if (!appointments || appointments.length === 0) {
                console.log(`   📋 Nenhum agendamento encontrado no período ${period.name}`);
                results[period.name] = { total: 0, by_tenant: {}, by_service: {} };
                continue;
            }
            
            console.log(`   📋 Total de agendamentos: ${appointments.length}`);
            
            // Agrupar por tenant
            const byTenant = {};
            const byService = {};
            const byTenantService = {};
            
            appointments.forEach(apt => {
                const tenantId = apt.tenant_id;
                const serviceName = apt.service_name || 'Serviço não especificado';
                const serviceType = apt.service_type || 'Tipo não especificado';
                const price = apt.quoted_price || apt.final_price || 0;
                
                // Por tenant
                if (!byTenant[tenantId]) {
                    byTenant[tenantId] = {
                        total_appointments: 0,
                        total_revenue: 0,
                        by_status: {},
                        services: {}
                    };
                }
                
                byTenant[tenantId].total_appointments++;
                byTenant[tenantId].total_revenue += price;
                
                // Por status
                const status = apt.status;
                byTenant[tenantId].by_status[status] = (byTenant[tenantId].by_status[status] || 0) + 1;
                
                // Por serviço dentro do tenant
                if (!byTenant[tenantId].services[serviceName]) {
                    byTenant[tenantId].services[serviceName] = {
                        count: 0,
                        revenue: 0,
                        service_type: serviceType
                    };
                }
                byTenant[tenantId].services[serviceName].count++;
                byTenant[tenantId].services[serviceName].revenue += price;
                
                // Por serviço global
                if (!byService[serviceName]) {
                    byService[serviceName] = {
                        count: 0,
                        revenue: 0,
                        service_type: serviceType,
                        tenants: new Set()
                    };
                }
                byService[serviceName].count++;
                byService[serviceName].revenue += price;
                byService[serviceName].tenants.add(tenantId);
            });
            
            // Exibir resultados por tenant
            console.log(`\n   📈 POR TENANT (${period.name}):`);
            const tenantIds = Object.keys(byTenant).sort();
            
            tenantIds.forEach((tenantId, index) => {
                const tenant = byTenant[tenantId];
                console.log(`      ${index + 1}. Tenant ${tenantId.substring(0, 8)}...:`);
                console.log(`         Agendamentos: ${tenant.total_appointments}`);
                console.log(`         Revenue: R$ ${tenant.total_revenue.toFixed(2)}`);
                console.log(`         Status: ${Object.entries(tenant.by_status).map(([s, c]) => `${s}:${c}`).join(', ')}`);
                
                // Top 3 serviços do tenant
                const topServices = Object.entries(tenant.services)
                    .sort(([,a], [,b]) => b.count - a.count)
                    .slice(0, 3);
                
                if (topServices.length > 0) {
                    console.log(`         Top serviços:`);
                    topServices.forEach(([service, data]) => {
                        console.log(`           - ${service}: ${data.count} (R$ ${data.revenue.toFixed(2)})`);
                    });
                }
                console.log('');
            });
            
            // Exibir resultados por serviço
            console.log(`\n   🛍️ POR SERVIÇO (${period.name}):`);
            const serviceEntries = Object.entries(byService)
                .sort(([,a], [,b]) => b.count - a.count)
                .slice(0, 10); // Top 10 serviços
            
            serviceEntries.forEach(([service, data], index) => {
                console.log(`      ${index + 1}. ${service}:`);
                console.log(`         Agendamentos: ${data.count}`);
                console.log(`         Revenue: R$ ${data.revenue.toFixed(2)}`);
                console.log(`         Tenants: ${data.tenants.size}`);
                console.log(`         Tipo: ${data.service_type}`);
                console.log('');
            });
            
            // Armazenar resultados
            results[period.name] = {
                total: appointments.length,
                total_revenue: appointments.reduce((sum, apt) => sum + (apt.quoted_price || apt.final_price || 0), 0),
                tenants_count: tenantIds.length,
                services_count: Object.keys(byService).length,
                by_tenant: byTenant,
                by_service: Object.fromEntries(
                    Object.entries(byService).map(([k, v]) => [k, {
                        ...v,
                        tenants: v.tenants.size
                    }])
                )
            };
        }
        
        // Resumo final comparativo
        console.log('\n📊 RESUMO COMPARATIVO POR PERÍODO:');
        console.log('='.repeat(60));
        
        periods.forEach(period => {
            const result = results[period.name];
            if (result) {
                console.log(`\n${period.name.toUpperCase()}:`);
                console.log(`   📋 Total agendamentos: ${result.total}`);
                console.log(`   💰 Revenue total: R$ ${result.total_revenue.toFixed(2)}`);
                console.log(`   🏢 Tenants ativos: ${result.tenants_count}`);
                console.log(`   🛍️ Serviços diferentes: ${result.services_count}`);
                
                if (result.total > 0) {
                    console.log(`   📊 Ticket médio: R$ ${(result.total_revenue / result.total).toFixed(2)}`);
                }
            }
        });
        
        return results;
        
    } catch (error) {
        console.error('💥 Erro na extração:', error.message);
        throw error;
    }
}

extractAppointmentsByServiceTenant()
    .then(results => {
        console.log('\n✅ Extração concluída com sucesso!');
        console.log('📄 Dados extraídos usando start_time (data real do agendamento)');
    })
    .catch(error => {
        console.error('💥 Erro fatal:', error.message);
        process.exit(1);
    });