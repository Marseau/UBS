#!/usr/bin/env node
/**
 * COMPARAÇÃO: Dados diretos vs tabelas tenant_metrics e platform_metrics
 * Análise campo por campo para relatório de discrepâncias
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function compareDirectVsTables() {
    console.log('📊 COMPARAÇÃO: Dados Diretos vs Tabelas Agregadas');
    console.log('='.repeat(60));
    
    try {
        const periods = [
            { name: '7d', days: 7 },
            { name: '30d', days: 30 },
            { name: '90d', days: 90 }
        ];
        
        const comparison = {};
        
        for (const period of periods) {
            console.log(`\n🔍 ANÁLISE PERÍODO: ${period.name}`);
            console.log('-'.repeat(40));
            
            const startDate = new Date(Date.now() - period.days * 24 * 60 * 60 * 1000);
            
            // 1. DADOS DIRETOS da tabela appointments
            console.log('\n1️⃣ COLETANDO DADOS DIRETOS (appointments):');
            const { data: directAppointments, error: directError } = await adminClient
                .from('appointments')
                .select('tenant_id, status, quoted_price, final_price, service_id, professional_id')
                .gte('start_time', startDate.toISOString());
                
            if (directError) {
                console.log('❌ Erro dados diretos:', directError.message);
                continue;
            }
            
            // Calcular métricas diretas
            const directMetrics = {
                total_appointments: directAppointments?.length || 0,
                total_revenue: 0,
                completed_appointments: 0,
                confirmed_appointments: 0,
                tenants_with_appointments: new Set(),
                unique_services: new Set(),
                unique_professionals: new Set(),
                by_tenant: {}
            };
            
            if (directAppointments) {
                directAppointments.forEach(apt => {
                    const price = apt.quoted_price || apt.final_price || 0;
                    directMetrics.total_revenue += price;
                    directMetrics.tenants_with_appointments.add(apt.tenant_id);
                    
                    if (apt.service_id) directMetrics.unique_services.add(apt.service_id);
                    if (apt.professional_id) directMetrics.unique_professionals.add(apt.professional_id);
                    
                    if (apt.status === 'completed') directMetrics.completed_appointments++;
                    if (apt.status === 'confirmed') directMetrics.confirmed_appointments++;
                    
                    // Por tenant
                    if (!directMetrics.by_tenant[apt.tenant_id]) {
                        directMetrics.by_tenant[apt.tenant_id] = {
                            appointments: 0,
                            revenue: 0,
                            completed: 0,
                            confirmed: 0
                        };
                    }
                    
                    directMetrics.by_tenant[apt.tenant_id].appointments++;
                    directMetrics.by_tenant[apt.tenant_id].revenue += price;
                    if (apt.status === 'completed') directMetrics.by_tenant[apt.tenant_id].completed++;
                    if (apt.status === 'confirmed') directMetrics.by_tenant[apt.tenant_id].confirmed++;
                });
            }
            
            console.log(`   📋 Total appointments: ${directMetrics.total_appointments}`);
            console.log(`   💰 Total revenue: R$ ${directMetrics.total_revenue.toFixed(2)}`);
            console.log(`   🏢 Tenants ativos: ${directMetrics.tenants_with_appointments.size}`);
            
            // 2. DADOS DAS TABELAS tenant_metrics
            console.log('\n2️⃣ COLETANDO DADOS tenant_metrics:');
            const { data: tenantMetrics, error: tenantError } = await adminClient
                .from('tenant_metrics')
                .select('tenant_id, metric_type, metric_data, period')
                .eq('period', period.name)
                .order('calculated_at', { ascending: false });
                
            if (tenantError) {
                console.log('❌ Erro tenant_metrics:', tenantError.message);
            }
            
            const aggregatedMetrics = {
                total_appointments: 0,
                total_revenue: 0,
                tenants_count: 0,
                by_metric_type: {},
                by_tenant: {}
            };
            
            if (tenantMetrics) {
                console.log(`   📊 Registros encontrados: ${tenantMetrics.length}`);
                
                // Agrupar por tipo de métrica
                tenantMetrics.forEach(metric => {
                    if (!aggregatedMetrics.by_metric_type[metric.metric_type]) {
                        aggregatedMetrics.by_metric_type[metric.metric_type] = 0;
                    }
                    aggregatedMetrics.by_metric_type[metric.metric_type]++;
                    
                    // Extrair dados específicos por tipo
                    if (metric.metric_type === 'business_dashboard' && metric.metric_data) {
                        const data = metric.metric_data;
                        if (data.monthly_revenue) {
                            aggregatedMetrics.total_revenue += (data.monthly_revenue.value || 0);
                        }
                        if (data.appointment_success_rate) {
                            aggregatedMetrics.total_appointments += (data.appointment_success_rate.total || 0);
                        }
                        
                        // Por tenant
                        aggregatedMetrics.by_tenant[metric.tenant_id] = {
                            revenue: data.monthly_revenue?.value || 0,
                            appointments: data.appointment_success_rate?.total || 0,
                            success_rate: data.appointment_success_rate?.percentage || 0
                        };
                    }
                    
                    if (metric.metric_type === 'participation' && metric.metric_data) {
                        const data = metric.metric_data;
                        if (data.appointments) {
                            // participation usa contagem total sem filtro de período
                        }
                    }
                });
                
                aggregatedMetrics.tenants_count = new Set(tenantMetrics.map(m => m.tenant_id)).size;
            }
            
            console.log(`   📊 Tipos de métricas: ${Object.keys(aggregatedMetrics.by_metric_type).join(', ')}`);
            console.log(`   💰 Revenue agregado: R$ ${aggregatedMetrics.total_revenue.toFixed(2)}`);
            console.log(`   📋 Appointments agregados: ${aggregatedMetrics.total_appointments}`);
            
            // 3. DADOS DAS TABELAS platform_metrics
            console.log('\n3️⃣ COLETANDO DADOS platform_metrics:');
            const { data: platformMetrics, error: platformError } = await adminClient
                .from('platform_metrics')
                .select('period_days, total_revenue, total_appointments, active_tenants, data_source')
                .eq('period_days', period.days)
                .order('created_at', { ascending: false })
                .limit(3);
                
            let platformData = { total_revenue: 0, total_appointments: 0, active_tenants: 0, records: 0 };
            
            if (platformError) {
                console.log('❌ Erro platform_metrics:', platformError.message);
            } else if (platformMetrics && platformMetrics.length > 0) {
                const latest = platformMetrics[0];
                platformData = {
                    total_revenue: latest.total_revenue || 0,
                    total_appointments: latest.total_appointments || 0, 
                    active_tenants: latest.active_tenants || 0,
                    records: platformMetrics.length,
                    data_source: latest.data_source
                };
                console.log(`   📊 Registros encontrados: ${platformMetrics.length}`);
                console.log(`   💰 Revenue: R$ ${platformData.total_revenue}`);
                console.log(`   📋 Appointments: ${platformData.total_appointments}`);
                console.log(`   🏢 Tenants ativos: ${platformData.active_tenants}`);
            } else {
                console.log('   ⚠️ Nenhum registro encontrado');
            }
            
            // 4. ANÁLISE DE DISCREPÂNCIAS
            console.log('\n4️⃣ ANÁLISE DE DISCREPÂNCIAS:');
            
            const directTenants = directMetrics.tenants_with_appointments.size;
            const directRevenue = directMetrics.total_revenue;
            const directAppointmentsCount = directMetrics.total_appointments;
            
            const tenantRevenue = aggregatedMetrics.total_revenue;
            const tenantAppointments = aggregatedMetrics.total_appointments;
            const tenantCount = aggregatedMetrics.tenants_count;
            
            const platformRevenue = platformData.total_revenue;
            const platformAppointments = platformData.total_appointments;
            const platformTenants = platformData.active_tenants;
            
            console.log('   📊 COMPARAÇÃO APPOINTMENTS:');
            console.log(`      Direto: ${directAppointmentsCount}`);
            console.log(`      Tenant metrics: ${tenantAppointments}`);
            console.log(`      Platform metrics: ${platformAppointments}`);
            
            const appointmentsDiff1 = Math.abs(directAppointmentsCount - tenantAppointments);
            const appointmentsDiff2 = Math.abs(directAppointmentsCount - platformAppointments);
            
            if (appointmentsDiff1 > 0) {
                console.log(`      ⚠️ Diferença direto vs tenant: ${appointmentsDiff1} appointments`);
            }
            if (appointmentsDiff2 > 0) {
                console.log(`      ⚠️ Diferença direto vs platform: ${appointmentsDiff2} appointments`);
            }
            
            console.log('\n   💰 COMPARAÇÃO REVENUE:');
            console.log(`      Direto: R$ ${directRevenue.toFixed(2)}`);
            console.log(`      Tenant metrics: R$ ${tenantRevenue.toFixed(2)}`);
            console.log(`      Platform metrics: R$ ${platformRevenue.toFixed(2)}`);
            
            const revenueDiff1 = Math.abs(directRevenue - tenantRevenue);
            const revenueDiff2 = Math.abs(directRevenue - platformRevenue);
            
            if (revenueDiff1 > 100) {
                console.log(`      ⚠️ Diferença direto vs tenant: R$ ${revenueDiff1.toFixed(2)}`);
            }
            if (revenueDiff2 > 100) {
                console.log(`      ⚠️ Diferença direto vs platform: R$ ${revenueDiff2.toFixed(2)}`);
            }
            
            console.log('\n   🏢 COMPARAÇÃO TENANTS:');
            console.log(`      Direto: ${directTenants}`);
            console.log(`      Tenant metrics: ${tenantCount}`);
            console.log(`      Platform metrics: ${platformTenants}`);
            
            // Armazenar para relatório final
            comparison[period.name] = {
                direct: {
                    appointments: directAppointmentsCount,
                    revenue: directRevenue,
                    tenants: directTenants,
                    completed: directMetrics.completed_appointments,
                    confirmed: directMetrics.confirmed_appointments
                },
                tenant_metrics: {
                    appointments: tenantAppointments,
                    revenue: tenantRevenue,
                    tenants: tenantCount,
                    metric_types: Object.keys(aggregatedMetrics.by_metric_type)
                },
                platform_metrics: {
                    appointments: platformAppointments,
                    revenue: platformRevenue,
                    tenants: platformTenants,
                    records: platformData.records,
                    data_source: platformData.data_source
                },
                discrepancies: {
                    appointments_direct_vs_tenant: appointmentsDiff1,
                    appointments_direct_vs_platform: appointmentsDiff2,
                    revenue_direct_vs_tenant: revenueDiff1,
                    revenue_direct_vs_platform: revenueDiff2
                }
            };
        }
        
        // 5. RELATÓRIO FINAL
        console.log('\n📋 RELATÓRIO FINAL DE DISCREPÂNCIAS');
        console.log('='.repeat(60));
        
        Object.entries(comparison).forEach(([period, data]) => {
            console.log(`\n${period.toUpperCase()}:`);
            console.log(`  ✅ Fonte de verdade (direto): ${data.direct.appointments} appointments, R$ ${data.direct.revenue.toFixed(2)}`);
            console.log(`  📊 Tenant metrics: ${data.tenant_metrics.appointments} appointments, R$ ${data.tenant_metrics.revenue.toFixed(2)}`);
            console.log(`  🏢 Platform metrics: ${data.platform_metrics.appointments} appointments, R$ ${data.platform_metrics.revenue.toFixed(2)}`);
            
            if (data.discrepancies.appointments_direct_vs_tenant > 0) {
                console.log(`  ⚠️ DISCREPÂNCIA tenant: ${data.discrepancies.appointments_direct_vs_tenant} appointments`);
            }
            if (data.discrepancies.appointments_direct_vs_platform > 0) {
                console.log(`  ⚠️ DISCREPÂNCIA platform: ${data.discrepancies.appointments_direct_vs_platform} appointments`);
            }
        });
        
        return comparison;
        
    } catch (error) {
        console.error('💥 Erro na comparação:', error.message);
        throw error;
    }
}

compareDirectVsTables()
    .then(results => {
        console.log('\n✅ Comparação concluída!');
        console.log('📊 Relatório de discrepâncias gerado');
    })
    .catch(error => {
        console.error('💥 Erro fatal:', error.message);
        process.exit(1);
    });