#!/usr/bin/env node
/**
 * EXTRAÇÃO REAL: Agendamentos por Tenant com dados reais
 * Períodos: 7, 30 e 90 dias usando start_time
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function extractAppointmentsReal() {
    console.log('📊 EXTRAÇÃO REAL: Agendamentos por Tenant');
    console.log('📅 Períodos: 7, 30 e 90 dias usando start_time');
    console.log('='.repeat(60));
    
    try {
        const periods = [
            { name: '7d', days: 7 },
            { name: '30d', days: 30 },
            { name: '90d', days: 90 }
        ];
        
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
                    service_id,
                    professional_id,
                    status,
                    quoted_price,
                    final_price,
                    start_time,
                    created_at,
                    appointment_data
                `)
                .gte('start_time', startDate.toISOString())
                .lte('start_time', endDate.toISOString())
                .order('tenant_id');
                
            if (error) {
                console.log('❌ Erro:', error.message);
                continue;
            }
            
            if (!appointments || appointments.length === 0) {
                console.log(`   📋 Nenhum agendamento encontrado no período ${period.name}`);
                continue;
            }
            
            console.log(`   📋 Total de agendamentos: ${appointments.length}`);
            
            // Agrupar por tenant
            const byTenant = {};
            let totalRevenue = 0;
            
            appointments.forEach(apt => {
                const tenantId = apt.tenant_id;
                const price = apt.quoted_price || apt.final_price || 0;
                totalRevenue += price;
                
                if (!byTenant[tenantId]) {
                    byTenant[tenantId] = {
                        total_appointments: 0,
                        total_revenue: 0,
                        by_status: {},
                        services: new Set(),
                        professionals: new Set()
                    };
                }
                
                byTenant[tenantId].total_appointments++;
                byTenant[tenantId].total_revenue += price;
                
                // Por status
                const status = apt.status;
                byTenant[tenantId].by_status[status] = (byTenant[tenantId].by_status[status] || 0) + 1;
                
                // Serviços únicos
                if (apt.service_id) {
                    byTenant[tenantId].services.add(apt.service_id);
                }
                
                // Profissionais únicos
                if (apt.professional_id) {
                    byTenant[tenantId].professionals.add(apt.professional_id);
                }
            });
            
            // Exibir resultados por tenant
            console.log(`\n   📈 RESULTADOS POR TENANT (${period.name}):`);
            const tenantIds = Object.keys(byTenant).sort();
            
            tenantIds.forEach((tenantId, index) => {
                const tenant = byTenant[tenantId];
                console.log(`      ${index + 1}. Tenant ${tenantId.substring(0, 8)}...:`);
                console.log(`         📋 Agendamentos: ${tenant.total_appointments}`);
                console.log(`         💰 Revenue: R$ ${tenant.total_revenue.toFixed(2)}`);
                
                if (tenant.total_appointments > 0) {
                    console.log(`         📊 Ticket médio: R$ ${(tenant.total_revenue / tenant.total_appointments).toFixed(2)}`);
                }
                
                console.log(`         📊 Status: ${Object.entries(tenant.by_status).map(([s, c]) => `${s}:${c}`).join(', ')}`);
                console.log(`         🛍️ Serviços únicos: ${tenant.services.size}`);
                console.log(`         👨‍💼 Profissionais únicos: ${tenant.professionals.size}`);
                console.log('');
            });
            
            // Resumo do período
            console.log(`\n   📊 RESUMO ${period.name.toUpperCase()}:`);
            console.log(`      📋 Total agendamentos: ${appointments.length}`);
            console.log(`      💰 Revenue total: R$ ${totalRevenue.toFixed(2)}`);
            console.log(`      🏢 Tenants ativos: ${tenantIds.length}`);
            
            if (appointments.length > 0) {
                console.log(`      📊 Ticket médio geral: R$ ${(totalRevenue / appointments.length).toFixed(2)}`);
            }
            
            // Status breakdown
            const statusCount = {};
            appointments.forEach(apt => {
                statusCount[apt.status] = (statusCount[apt.status] || 0) + 1;
            });
            
            console.log(`      📊 Breakdown por status:`);
            Object.entries(statusCount).forEach(([status, count]) => {
                const percentage = ((count / appointments.length) * 100).toFixed(1);
                console.log(`         ${status}: ${count} (${percentage}%)`);
            });
        }
        
    } catch (error) {
        console.error('💥 Erro na extração:', error.message);
        throw error;
    }
}

extractAppointmentsReal()
    .then(() => {
        console.log('\n✅ Extração concluída com sucesso!');
        console.log('📄 Dados extraídos usando start_time (data real do agendamento)');
    })
    .catch(error => {
        console.error('💥 Erro fatal:', error.message);
        process.exit(1);
    });