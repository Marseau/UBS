#!/usr/bin/env node

/**
 * TRACE REVENUE VALUE R$ 394.294,41
 * Script para rastrear a origem exata deste valor
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function traceRevenueValue() {
    console.log('🔍 RASTREANDO ORIGEM DO VALOR R$ 394.294,41');
    console.log('=' .repeat(60));
    
    try {
        // 1. Verificar se existe na tabela platform_daily_aggregates
        console.log('\n📊 1. Verificando platform_daily_aggregates...');
        const { data: aggregates, error: aggError } = await supabase
            .from('platform_daily_aggregates')
            .select('*')
            .order('aggregate_date', { ascending: false })
            .limit(10);
            
        if (aggError) {
            console.error('❌ Erro ao buscar aggregates:', aggError);
        } else {
            console.log(`📈 Encontrados ${aggregates.length} registros em platform_daily_aggregates:`);
            aggregates.forEach((agg, i) => {
                const revenue = parseFloat(agg.total_revenue || 0);
                console.log(`   ${i+1}. ${agg.aggregate_date} - R$ ${revenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})} (${agg.calculation_period_days} dias)`);
                
                // Verificar se este valor é o que estamos procurando
                if (Math.abs(revenue - 394294.41) < 1) {
                    console.log('   🎯 ENCONTRADO! Este é o valor que está sendo mostrado!');
                }
            });
        }
        
        // 2. Verificar tenant_platform_metrics
        console.log('\n📊 2. Verificando tenant_platform_metrics...');
        const { data: metrics, error: metricsError } = await supabase
            .from('tenant_platform_metrics')
            .select('*')
            .order('calculated_at', { ascending: false })
            .limit(10);
            
        if (metricsError) {
            console.error('❌ Erro ao buscar metrics:', metricsError);
        } else {
            console.log(`📈 Encontrados ${metrics.length} registros em tenant_platform_metrics:`);
            metrics.forEach((metric, i) => {
                const platformRevenue = parseFloat(metric.platform_total_revenue || 0);
                const tenantRevenue = parseFloat(metric.revenue_participation_value || 0);
                console.log(`   ${i+1}. Tenant: ${metric.tenant_id.slice(-8)} - Platform: R$ ${platformRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}, Tenant: R$ ${tenantRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
                
                // Verificar se este valor é o que estamos procurando
                if (Math.abs(platformRevenue - 394294.41) < 1) {
                    console.log('   🎯 ENCONTRADO EM PLATFORM_TOTAL_REVENUE! Este é o valor que está sendo mostrado!');
                }
            });
        }
        
        // 3. Testar a função get_platform_metrics diretamente
        console.log('\n🔧 3. Testando função get_platform_metrics...');
        const { data: platformFunc, error: funcError } = await supabase
            .rpc('get_platform_metrics', { p_period_days: 30 });
            
        if (funcError) {
            console.error('❌ Erro ao chamar get_platform_metrics:', funcError);
        } else {
            console.log('✅ Resultado da função get_platform_metrics:');
            if (platformFunc && platformFunc[0]) {
                const result = platformFunc[0];
                const revenue = parseFloat(result.total_revenue || 0);
                console.log(`   - Total Revenue: R$ ${revenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
                console.log(`   - Total Appointments: ${result.total_appointments}`);
                console.log(`   - Total Customers: ${result.total_customers}`);
                console.log(`   - Total AI Interactions: ${result.total_ai_interactions}`);
                console.log(`   - Calculation Date: ${result.calculation_date}`);
                
                if (Math.abs(revenue - 394294.41) < 1) {
                    console.log('   🎯 ESTE É O VALOR QUE ESTÁ SENDO RETORNADO PELA FUNÇÃO!');
                }
            }
        }
        
        // 4. Verificar dados brutos das tabelas fonte
        console.log('\n💰 4. Verificando subscription_payments (fonte dos dados de receita)...');
        const { data: payments, error: paymentsError } = await supabase
            .from('subscription_payments')
            .select('*')
            .eq('payment_status', 'completed')
            .order('payment_date', { ascending: false })
            .limit(20);
            
        if (paymentsError) {
            console.error('❌ Erro ao buscar payments:', paymentsError);
        } else {
            console.log(`💳 Encontrados ${payments.length} pagamentos recentes:`);
            let totalPayments = 0;
            payments.forEach((payment, i) => {
                const amount = parseFloat(payment.amount || 0);
                totalPayments += amount;
                console.log(`   ${i+1}. ${payment.payment_date} - R$ ${amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})} (${payment.tenant_id?.slice(-8)})`);
            });
            console.log(`   💰 TOTAL dos 20 mais recentes: R$ ${totalPayments.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
        }
        
        // 5. Buscar EXATAMENTE o valor 394294.41
        console.log('\n🎯 5. Busca direta pelo valor 394294.41...');
        
        // Buscar em platform_daily_aggregates
        const { data: exactAgg, error: exactAggError } = await supabase
            .from('platform_daily_aggregates')
            .select('*')
            .gte('total_revenue', 394290)
            .lte('total_revenue', 394300);
            
        if (exactAgg && exactAgg.length > 0) {
            console.log('✅ Valor encontrado em platform_daily_aggregates:');
            exactAgg.forEach(row => {
                console.log(`   - Data: ${row.aggregate_date}, Valor: R$ ${parseFloat(row.total_revenue).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
            });
        }
        
        // Buscar em tenant_platform_metrics
        const { data: exactMetrics, error: exactMetricsError } = await supabase
            .from('tenant_platform_metrics')
            .select('*')
            .gte('platform_total_revenue', 394290)
            .lte('platform_total_revenue', 394300);
            
        if (exactMetrics && exactMetrics.length > 0) {
            console.log('✅ Valor encontrado em tenant_platform_metrics:');
            exactMetrics.forEach(row => {
                console.log(`   - Tenant: ${row.tenant_id.slice(-8)}, Data: ${row.metric_date}, Valor: R$ ${parseFloat(row.platform_total_revenue).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
            });
        }
        
        console.log('\n🔍 RASTREAMENTO CONCLUÍDO');
        
    } catch (error) {
        console.error('❌ Erro durante rastreamento:', error);
    }
}

traceRevenueValue();