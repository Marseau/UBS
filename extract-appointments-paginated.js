#!/usr/bin/env node
/**
 * EXTRAÇÃO PAGINADA: Todos os appointments sem limite do Supabase
 * Para obter valores reais completos
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function getAllAppointmentsPaginated(startDate) {
    console.log(`🔄 Buscando TODOS os appointments desde ${startDate.toISOString().substring(0, 10)}`);
    
    let allAppointments = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
        console.log(`   📄 Página ${page + 1} (registros ${page * pageSize + 1}-${(page + 1) * pageSize})`);
        
        const { data: pageData, error } = await adminClient
            .from('appointments')
            .select('tenant_id, status, quoted_price, final_price, service_id, professional_id, start_time, created_at')
            .gte('start_time', startDate.toISOString())
            .order('start_time')
            .range(page * pageSize, (page + 1) * pageSize - 1);
            
        if (error) {
            console.log(`❌ Erro na página ${page + 1}:`, error.message);
            break;
        }
        
        if (!pageData || pageData.length === 0) {
            hasMore = false;
            break;
        }
        
        allAppointments = allAppointments.concat(pageData);
        console.log(`   ✅ ${pageData.length} registros coletados (total: ${allAppointments.length})`);
        
        // Se retornou menos que pageSize, chegamos ao fim
        if (pageData.length < pageSize) {
            hasMore = false;
        }
        
        page++;
        
        // Pequena pausa para não sobrecarregar
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`🎯 TOTAL COLETADO: ${allAppointments.length} appointments`);
    return allAppointments;
}

async function extractRealAppointmentsData() {
    console.log('📊 EXTRAÇÃO REAL COM PAGINAÇÃO');
    console.log('📅 Todos os períodos usando start_time sem limites');
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
            
            // Buscar TODOS os appointments paginados
            const allAppointments = await getAllAppointmentsPaginated(startDate);
            
            if (allAppointments.length === 0) {
                console.log(`   📋 Nenhum agendamento encontrado no período ${period.name}`);
                results[period.name] = {
                    total_appointments: 0,
                    total_revenue: 0,
                    tenants_count: 0,
                    by_status: {},
                    by_tenant: {}
                };
                continue;
            }
            
            // Calcular métricas
            const metrics = {
                total_appointments: allAppointments.length,
                total_revenue: 0,
                tenants_with_appointments: new Set(),
                by_status: {},
                by_tenant: {}
            };
            
            allAppointments.forEach(apt => {
                const price = apt.quoted_price || apt.final_price || 0;
                const tenantId = apt.tenant_id;
                const status = apt.status;
                
                metrics.total_revenue += price;
                metrics.tenants_with_appointments.add(tenantId);
                
                // Por status
                metrics.by_status[status] = (metrics.by_status[status] || 0) + 1;
                
                // Por tenant
                if (!metrics.by_tenant[tenantId]) {
                    metrics.by_tenant[tenantId] = {
                        appointments: 0,
                        revenue: 0,
                        by_status: {}
                    };
                }
                
                metrics.by_tenant[tenantId].appointments++;
                metrics.by_tenant[tenantId].revenue += price;
                metrics.by_tenant[tenantId].by_status[status] = (metrics.by_tenant[tenantId].by_status[status] || 0) + 1;
            });
            
            // Exibir resultados
            console.log(`\n   📊 RESULTADOS REAIS ${period.name.toUpperCase()}:`);
            console.log(`      📋 Total appointments: ${metrics.total_appointments}`);
            console.log(`      💰 Total revenue: R$ ${metrics.total_revenue.toFixed(2)}`);
            console.log(`      🏢 Tenants ativos: ${metrics.tenants_with_appointments.size}`);
            
            if (metrics.total_appointments > 0) {
                console.log(`      📊 Ticket médio: R$ ${(metrics.total_revenue / metrics.total_appointments).toFixed(2)}`);
            }
            
            // Breakdown por status
            console.log(`      📊 Por status:`);
            Object.entries(metrics.by_status).forEach(([status, count]) => {
                const percentage = ((count / metrics.total_appointments) * 100).toFixed(1);
                console.log(`         ${status}: ${count} (${percentage}%)`);
            });
            
            // Top 5 tenants
            const topTenants = Object.entries(metrics.by_tenant)
                .sort(([,a], [,b]) => b.revenue - a.revenue)
                .slice(0, 5);
                
            console.log(`\n      🏆 TOP 5 TENANTS (${period.name}):`);
            topTenants.forEach(([tenantId, data], i) => {
                console.log(`         ${i+1}. ${tenantId.substring(0,8)}...: ${data.appointments} appointments, R$ ${data.revenue.toFixed(2)}`);
            });
            
            // Armazenar resultados
            results[period.name] = {
                total_appointments: metrics.total_appointments,
                total_revenue: metrics.total_revenue,
                tenants_count: metrics.tenants_with_appointments.size,
                by_status: metrics.by_status,
                top_tenants: topTenants.slice(0, 3).map(([id, data]) => ({
                    tenant_id: id.substring(0, 8) + '...',
                    appointments: data.appointments,
                    revenue: data.revenue
                }))
            };
        }
        
        // Resumo comparativo final
        console.log('\n📊 RESUMO COMPARATIVO REAL (SEM LIMITES):');
        console.log('='.repeat(60));
        
        Object.entries(results).forEach(([period, data]) => {
            console.log(`\n${period.toUpperCase()}:`);
            console.log(`   📋 Appointments: ${data.total_appointments}`);
            console.log(`   💰 Revenue: R$ ${data.total_revenue.toFixed(2)}`);
            console.log(`   🏢 Tenants: ${data.tenants_count}`);
            
            if (data.total_appointments > 0) {
                console.log(`   📊 Ticket médio: R$ ${(data.total_revenue / data.total_appointments).toFixed(2)}`);
            }
        });
        
        return results;
        
    } catch (error) {
        console.error('💥 Erro na extração:', error.message);
        throw error;
    }
}

extractRealAppointmentsData()
    .then(results => {
        console.log('\n✅ Extração paginada concluída!');
        console.log('📊 Valores REAIS obtidos sem limitação do Supabase');
        
        // Exportar para uso no script de comparação
        global.realAppointmentsData = results;
    })
    .catch(error => {
        console.error('💥 Erro fatal:', error.message);
        process.exit(1);
    });