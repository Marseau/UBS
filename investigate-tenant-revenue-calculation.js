#!/usr/bin/env node
/**
 * INVESTIGAÇÃO COMPLETA DA RECEITA DOS TENANTS
 * Verificar se R$ 87,237 está correto e descobrir memória de cálculo
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function investigateTenantsRevenueCalculation() {
    console.log('🔍 INVESTIGAÇÃO COMPLETA DA RECEITA DOS TENANTS');
    console.log('📊 Verificando se R$ 87,237 está correto e descobrindo memória de cálculo');
    console.log('='.repeat(80));
    
    try {
        // 1. FONTE DE VERDADE: Appointments completed/confirmed (dados brutos)
        console.log('\n1️⃣ FONTE DE VERDADE: Appointments com status completed/confirmed');
        console.log('   (Esta é a fonte real de receita dos tenants - negócios deles)');
        
        const { data: appointments } = await adminClient
            .from('appointments')
            .select('tenant_id, status, quoted_price, final_price, created_at')
            .in('status', ['completed', 'confirmed'])
            .order('created_at', { ascending: false });
        
        if (!appointments) {
            console.log('❌ Erro ao buscar appointments');
            return;
        }
        
        console.log(`   📋 Total appointments completed/confirmed: ${appointments.length}`);
        
        // Agrupar por tenant
        const revenueByTenant = {};
        let totalRealRevenue = 0;
        
        appointments.forEach(apt => {
            const revenue = apt.quoted_price || apt.final_price || 0;
            if (!revenueByTenant[apt.tenant_id]) {
                revenueByTenant[apt.tenant_id] = 0;
            }
            revenueByTenant[apt.tenant_id] += revenue;
            totalRealRevenue += revenue;
        });
        
        console.log('\n   💰 RECEITA REAL por tenant (appointments completed/confirmed):');
        Object.entries(revenueByTenant).forEach(([tenantId, revenue]) => {
            console.log(`      ${tenantId.substring(0, 8)}...: R$ ${revenue.toFixed(2)}`);
        });
        console.log(`\n   🎯 TOTAL RECEITA REAL DOS TENANTS: R$ ${totalRealRevenue.toFixed(2)}`);
        
        // 2. DADOS AGREGADOS: tenant_metrics.revenue_per_customer
        console.log('\n2️⃣ DADOS AGREGADOS: tenant_metrics.revenue_per_customer');
        console.log('   (Como a receita é calculada e agregada no sistema)');
        
        const { data: tenantMetrics } = await adminClient
            .from('tenant_metrics')
            .select('tenant_id, period, metric_data, calculated_at')
            .eq('metric_type', 'revenue_per_customer')
            .order('calculated_at', { ascending: false });
        
        if (tenantMetrics) {
            const periods = ['7d', '30d', '90d'];
            
            periods.forEach(period => {
                const periodMetrics = tenantMetrics.filter(m => m.period === period);
                let aggregatedRevenue = 0;
                
                console.log(`\n   📈 Período ${period} (${periodMetrics.length} tenants):`);
                
                periodMetrics.forEach(metric => {
                    const data = metric.metric_data;
                    const revenue = data.total_revenue || 0;
                    aggregatedRevenue += revenue;
                    console.log(`      ${metric.tenant_id.substring(0, 8)}...: R$ ${revenue.toFixed(2)} (${data.total_appointments || 0} appointments)`);
                });
                
                console.log(`   💰 TOTAL AGREGADO ${period}: R$ ${aggregatedRevenue.toFixed(2)}`);
                
                // Comparar com dados reais
                if (period === '7d') {
                    const diff = Math.abs(aggregatedRevenue - totalRealRevenue);
                    console.log(`   🔍 Diferença vs dados reais: R$ ${diff.toFixed(2)}`);
                    if (diff > 1000) {
                        console.log('   ⚠️  GRANDE DISCREPÂNCIA DETECTADA!');
                    }
                }
            });
        }
        
        // 3. PLATFORM_METRICS: Valores mostrados no dashboard
        console.log('\n3️⃣ PLATFORM_METRICS: Valores que aparecem no dashboard da plataforma');
        
        const { data: platformMetrics } = await adminClient
            .from('platform_metrics')
            .select('period_days, total_revenue, created_at, data_source')
            .eq('data_source', 'tenant_aggregation')
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (platformMetrics) {
            console.log('   📊 Platform metrics (últimos registros):');
            platformMetrics.forEach(pm => {
                const date = pm.created_at.substring(0, 10);
                console.log(`      ${pm.period_days}d: R$ ${pm.total_revenue} (${date})`);
            });
        }
        
        // 4. ANÁLISE DE DISCREPÂNCIAS
        console.log('\n4️⃣ ANÁLISE DE DISCREPÂNCIAS');
        console.log('   Comparando valores reportados vs dados reais');
        
        const reportedValue = 87237.14; // Valor que aparece no sistema
        const realValue = totalRealRevenue;
        const discrepancy = Math.abs(reportedValue - realValue);
        
        console.log(`   📊 Valor reportado no sistema: R$ ${reportedValue.toFixed(2)}`);
        console.log(`   📊 Valor real (appointments): R$ ${realValue.toFixed(2)}`);
        console.log(`   🔍 Discrepância: R$ ${discrepancy.toFixed(2)}`);
        
        if (discrepancy > 1000) {
            console.log('   🚨 PROBLEMA IDENTIFICADO: Grande discrepância detectada!');
            
            // Possíveis causas
            console.log('\n   🔍 POSSÍVEIS CAUSAS:');
            console.log('      1. Dados mock/fictícios em tenant_metrics');
            console.log('      2. Agregação incorreta de períodos');
            console.log('      3. Duplicação de dados');
            console.log('      4. Erro na lógica de cálculo');
            
        } else {
            console.log('   ✅ VALORES CONSISTENTES: Diferença aceitável');
        }
        
        // 5. MEMÓRIA DE CÁLCULO DETALHADA
        console.log('\n5️⃣ MEMÓRIA DE CÁLCULO DETALHADA');
        console.log('   Como a receita dos tenants DEVERIA ser calculada:');
        console.log('');
        console.log('   🔢 FÓRMULA CORRETA:');
        console.log('      Receita_Tenant = SUM(appointments.quoted_price OR appointments.final_price)');
        console.log('      WHERE appointments.status IN (\'completed\', \'confirmed\')');
        console.log('      AND appointments.tenant_id = tenant_id');
        console.log('      AND appointments.created_at >= period_start_date');
        console.log('');
        console.log('   📋 CAMPOS UTILIZADOS:');
        console.log('      - appointments.quoted_price (prioritário)');
        console.log('      - appointments.final_price (fallback se quoted_price é null)');
        console.log('      - Apenas status: completed, confirmed');
        console.log('');
        console.log('   ⏰ PERÍODO:');
        console.log('      - 7d: últimos 7 dias');
        console.log('      - 30d: últimos 30 dias');
        console.log('      - 90d: últimos 90 dias');
        
        return {
            realRevenue: totalRealRevenue,
            reportedRevenue: reportedValue,
            discrepancy: discrepancy,
            tenantsWithRevenue: Object.keys(revenueByTenant).length,
            totalAppointments: appointments.length,
            isAccurate: discrepancy < 1000
        };
        
    } catch (error) {
        console.error('💥 Erro na investigação:', error.message);
        throw error;
    }
}

investigateTenantsRevenueCalculation()
    .then(result => {
        console.log('\n🎯 CONCLUSÃO DA INVESTIGAÇÃO:');
        console.log('='.repeat(50));
        if (result.isAccurate) {
            console.log('✅ RECEITA DOS TENANTS ESTÁ CORRETA');
        } else {
            console.log('❌ RECEITA DOS TENANTS ESTÁ INCORRETA');
            console.log('🔧 CORREÇÃO NECESSÁRIA na lógica de agregação');
        }
        console.log(`📊 Diferença encontrada: R$ ${result.discrepancy.toFixed(2)}`);
    })
    .catch(error => {
        console.error('💥 Erro fatal:', error.message);
        process.exit(1);
    });