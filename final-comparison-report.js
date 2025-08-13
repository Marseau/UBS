#!/usr/bin/env node
/**
 * RELATÓRIO FINAL DE COMPARAÇÃO
 * Dados REAIS (paginados) vs Tabelas Agregadas
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function generateFinalComparisonReport() {
    console.log('📊 RELATÓRIO FINAL DE COMPARAÇÃO');
    console.log('🎯 DADOS REAIS vs TABELAS AGREGADAS');
    console.log('='.repeat(70));
    
    try {
        // Dados REAIS obtidos pela extração paginada
        const realData = {
            '7d': { appointments: 819, revenue: 87237.14, tenants: 10 },
            '30d': { appointments: 819, revenue: 87237.14, tenants: 10 },
            '90d': { appointments: 1129, revenue: 111145.39, tenants: 10 }
        };
        
        const comparison = {};
        
        for (const [period, real] of Object.entries(realData)) {
            const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
            
            console.log(`\n🔍 ANÁLISE PERÍODO: ${period.toUpperCase()}`);
            console.log('-'.repeat(50));
            
            // 1. DADOS REAIS (fonte da verdade)
            console.log(`\n1️⃣ DADOS REAIS (${period}):`);
            console.log(`   📋 Appointments: ${real.appointments}`);
            console.log(`   💰 Revenue: R$ ${real.revenue.toFixed(2)}`);
            console.log(`   🏢 Tenants: ${real.tenants}`);
            console.log(`   📊 Ticket médio: R$ ${(real.revenue / real.appointments).toFixed(2)}`);
            
            // 2. TENANT_METRICS
            console.log(`\n2️⃣ TENANT_METRICS (${period}):`);
            const { data: tenantMetrics, error: tenantError } = await adminClient
                .from('tenant_metrics')
                .select('tenant_id, metric_type, metric_data, period')
                .eq('period', period)
                .order('calculated_at', { ascending: false });
                
            let tenantData = { appointments: 0, revenue: 0, tenants: 0, types: [] };
            
            if (tenantError) {
                console.log('   ❌ Erro:', tenantError.message);
            } else if (tenantMetrics) {
                const types = [...new Set(tenantMetrics.map(m => m.metric_type))];
                const tenantIds = [...new Set(tenantMetrics.map(m => m.tenant_id))];
                
                // Buscar métricas business_dashboard especificamente
                const businessMetrics = tenantMetrics.filter(m => m.metric_type === 'business_dashboard');
                
                if (businessMetrics.length > 0) {
                    businessMetrics.forEach(m => {
                        if (m.metric_data) {
                            tenantData.revenue += (m.metric_data.monthly_revenue?.value || 0);
                            tenantData.appointments += (m.metric_data.appointment_success_rate?.total || 0);
                        }
                    });
                }
                
                tenantData.tenants = tenantIds.length;
                tenantData.types = types;
                
                console.log(`   📊 Registros: ${tenantMetrics.length}`);
                console.log(`   📊 Tipos: ${types.join(', ')}`);
                console.log(`   📋 Appointments: ${tenantData.appointments}`);
                console.log(`   💰 Revenue: R$ ${tenantData.revenue.toFixed(2)}`);
                console.log(`   🏢 Tenants: ${tenantData.tenants}`);
                
                if (types.includes('business_dashboard')) {
                    console.log(`   ✅ business_dashboard: ${businessMetrics.length} registros`);
                } else {
                    console.log(`   ❌ business_dashboard: AUSENTE`);
                }
            }
            
            // 3. PLATFORM_METRICS
            console.log(`\n3️⃣ PLATFORM_METRICS (${period}):`);
            const { data: platformMetrics, error: platformError } = await adminClient
                .from('platform_metrics')
                .select('period_days, total_revenue, total_appointments, active_tenants, data_source, created_at')
                .eq('period_days', periodDays)
                .order('created_at', { ascending: false })
                .limit(3);
                
            let platformData = { appointments: 0, revenue: 0, tenants: 0, records: 0, source: 'N/A' };
            
            if (platformError) {
                console.log('   ❌ Erro:', platformError.message);
            } else if (platformMetrics && platformMetrics.length > 0) {
                const latest = platformMetrics[0];
                platformData = {
                    appointments: latest.total_appointments || 0,
                    revenue: latest.total_revenue || 0,
                    tenants: latest.active_tenants || 0,
                    records: platformMetrics.length,
                    source: latest.data_source || 'N/A'
                };
                
                console.log(`   📊 Registros: ${platformData.records}`);
                console.log(`   📋 Appointments: ${platformData.appointments}`);
                console.log(`   💰 Revenue: R$ ${platformData.revenue.toFixed(2)}`);
                console.log(`   🏢 Tenants: ${platformData.tenants}`);
                console.log(`   📊 Fonte: ${platformData.source}`);
            } else {
                console.log('   ⚠️ Nenhum registro encontrado');
            }
            
            // 4. ANÁLISE DE DISCREPÂNCIAS
            console.log(`\n4️⃣ ANÁLISE DE DISCREPÂNCIAS (${period}):`);
            
            const appointmentsDiffTenant = Math.abs(real.appointments - tenantData.appointments);
            const appointmentsDiffPlatform = Math.abs(real.appointments - platformData.appointments);
            const revenueDiffTenant = Math.abs(real.revenue - tenantData.revenue);
            const revenueDiffPlatform = Math.abs(real.revenue - platformData.revenue);
            
            // Appointments
            console.log(`   📋 APPOINTMENTS:`);
            console.log(`      Real: ${real.appointments}`);
            console.log(`      Tenant: ${tenantData.appointments} (diff: ${appointmentsDiffTenant})`);
            console.log(`      Platform: ${platformData.appointments} (diff: ${appointmentsDiffPlatform})`);
            
            if (appointmentsDiffTenant === 0) {
                console.log(`      ✅ Tenant: CORRETO`);
            } else if (appointmentsDiffTenant > 0) {
                console.log(`      ❌ Tenant: DISCREPÂNCIA de ${appointmentsDiffTenant} appointments`);
            }
            
            if (appointmentsDiffPlatform === 0) {
                console.log(`      ✅ Platform: CORRETO`);
            } else if (appointmentsDiffPlatform > 0) {
                const percentage = ((appointmentsDiffPlatform / real.appointments) * 100).toFixed(1);
                console.log(`      ❌ Platform: DISCREPÂNCIA de ${appointmentsDiffPlatform} appointments (${percentage}%)`);
            }
            
            // Revenue
            console.log(`   💰 REVENUE:`);
            console.log(`      Real: R$ ${real.revenue.toFixed(2)}`);
            console.log(`      Tenant: R$ ${tenantData.revenue.toFixed(2)} (diff: R$ ${revenueDiffTenant.toFixed(2)})`);
            console.log(`      Platform: R$ ${platformData.revenue.toFixed(2)} (diff: R$ ${revenueDiffPlatform.toFixed(2)})`);
            
            if (revenueDiffTenant < 100) {
                console.log(`      ✅ Tenant: CORRETO`);
            } else {
                const percentage = ((revenueDiffTenant / real.revenue) * 100).toFixed(1);
                console.log(`      ❌ Tenant: DISCREPÂNCIA de R$ ${revenueDiffTenant.toFixed(2)} (${percentage}%)`);
            }
            
            if (revenueDiffPlatform < 100) {
                console.log(`      ✅ Platform: CORRETO`);
            } else {
                const percentage = ((revenueDiffPlatform / real.revenue) * 100).toFixed(1);
                console.log(`      ❌ Platform: DISCREPÂNCIA de R$ ${revenueDiffPlatform.toFixed(2)} (${percentage}%)`);
            }
            
            // Armazenar para resumo
            comparison[period] = {
                real: real,
                tenant: tenantData,
                platform: platformData,
                discrepancies: {
                    appointments_tenant: appointmentsDiffTenant,
                    appointments_platform: appointmentsDiffPlatform,
                    revenue_tenant: revenueDiffTenant,
                    revenue_platform: revenueDiffPlatform
                }
            };
        }
        
        // 5. RESUMO EXECUTIVO FINAL
        console.log('\n📋 RESUMO EXECUTIVO FINAL');
        console.log('='.repeat(70));
        
        console.log('\n🎯 DADOS REAIS (FONTE DA VERDADE):');
        Object.entries(realData).forEach(([period, data]) => {
            console.log(`   ${period.toUpperCase()}: ${data.appointments} appointments, R$ ${data.revenue.toFixed(2)}`);
        });
        
        console.log('\n❌ DISCREPÂNCIAS CRÍTICAS IDENTIFICADAS:');
        
        let hasCriticalIssues = false;
        
        Object.entries(comparison).forEach(([period, data]) => {
            if (data.discrepancies.appointments_tenant > 0) {
                console.log(`   ${period.toUpperCase()} Tenant Metrics: -${data.discrepancies.appointments_tenant} appointments, -R$ ${data.discrepancies.revenue_tenant.toFixed(2)}`);
                hasCriticalIssues = true;
            }
            
            if (data.discrepancies.appointments_platform > 0) {
                const pct = ((data.discrepancies.appointments_platform / data.real.appointments) * 100).toFixed(1);
                console.log(`   ${period.toUpperCase()} Platform Metrics: +${data.discrepancies.appointments_platform} appointments (+${pct}%), +R$ ${data.discrepancies.revenue_platform.toFixed(2)}`);
                hasCriticalIssues = true;
            }
        });
        
        if (!hasCriticalIssues) {
            console.log('   ✅ NENHUMA DISCREPÂNCIA CRÍTICA ENCONTRADA');
        }
        
        console.log('\n🔧 AÇÕES REQUERIDAS:');
        
        // Tenant metrics issues
        const tenantIssues = Object.values(comparison).some(c => c.discrepancies.appointments_tenant > 0);
        if (tenantIssues) {
            console.log('   ❌ TENANT_METRICS: Implementar cálculo de business_dashboard');
            console.log('   ❌ TENANT_METRICS: Configurar cron job para usar start_time');
        }
        
        // Platform metrics issues  
        const platformIssues = Object.values(comparison).some(c => c.discrepancies.appointments_platform > 0);
        if (platformIssues) {
            console.log('   ❌ PLATFORM_METRICS: Corrigir agregação para usar start_time consistentemente');
        }
        
        if (!tenantIssues && !platformIssues) {
            console.log('   ✅ SISTEMA FUNCIONANDO CORRETAMENTE');
        }
        
        return comparison;
        
    } catch (error) {
        console.error('💥 Erro no relatório:', error.message);
        throw error;
    }
}

generateFinalComparisonReport()
    .then(results => {
        console.log('\n✅ RELATÓRIO FINAL CONCLUÍDO!');
        console.log('📊 Análise completa com dados REAIS vs tabelas agregadas');
    })
    .catch(error => {
        console.error('💥 Erro fatal:', error.message);
        process.exit(1);
    });