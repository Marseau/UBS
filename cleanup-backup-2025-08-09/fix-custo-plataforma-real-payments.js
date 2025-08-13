#!/usr/bin/env node
/**
 * CORRIGIR MÉTRICA CUSTO_PLATAFORMA - USAR DADOS REAIS DA SUBSCRIPTION_PAYMENTS
 * 
 * A métrica estava usando estimativas. Agora vai usar os valores REAIS pagos pelos tenants
 * para os períodos de 7d, 30d e 90d
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * CALCULAR CUSTO REAL BASEADO EM SUBSCRIPTION_PAYMENTS
 */
async function calculateRealPlatformCostForTenant(tenantId, days) {
    console.log(`   📊 Calculando custo real para tenant ${tenantId.substring(0, 8)} (${days}d)`);
    
    try {
        // Data limite baseada no período
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));
        
        // Buscar pagamentos reais do tenant no período
        const { data: payments, error } = await adminClient
            .from('subscription_payments')
            .select('amount, subscription_plan, payment_date, payment_metadata')
            .eq('tenant_id', tenantId)
            .gte('payment_date', startDate.toISOString().split('T')[0])
            .lte('payment_date', endDate.toISOString().split('T')[0])
            .neq('subscription_plan', 'free'); // Excluir trial gratuito
        
        if (error) {
            console.log(`     ❌ Erro ao buscar pagamentos: ${error.message}`);
            return {
                custo_total_plataforma: 0,
                total_payments: 0,
                payment_details: [],
                calculation_method: 'no_payments_found'
            };
        }
        
        if (!payments || payments.length === 0) {
            console.log(`     📭 Nenhum pagamento encontrado no período`);
            return {
                custo_total_plataforma: 0,
                total_payments: 0,
                payment_details: [],
                calculation_method: 'no_payments_in_period'
            };
        }
        
        // Somar valores reais pagos
        const totalAmount = payments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);
        
        const paymentDetails = payments.map(p => ({
            amount: parseFloat(p.amount || 0),
            plan: p.subscription_plan,
            date: p.payment_date,
            conversations_used: p.payment_metadata?.conversations_used || 0
        }));
        
        console.log(`     ✅ R$ ${totalAmount.toFixed(2)} em ${payments.length} pagamentos`);
        
        return {
            custo_total_plataforma: totalAmount,
            total_payments: payments.length,
            payment_details: paymentDetails,
            period_days: days,
            period_start: startDate.toISOString().split('T')[0],
            period_end: endDate.toISOString().split('T')[0],
            calculation_method: 'real_subscription_payments'
        };
        
    } catch (error) {
        console.log(`     💥 Erro no cálculo: ${error.message}`);
        return {
            custo_total_plataforma: 0,
            total_payments: 0,
            payment_details: [],
            calculation_method: 'calculation_error',
            error: error.message
        };
    }
}

/**
 * PROCESSAR TODOS OS TENANTS PARA UM PERÍODO
 */
async function processAllTenantsForPeriod(days) {
    console.log(`\n🔄 Processando custo_plataforma para período de ${days} dias`);
    console.log('=' .repeat(70));
    
    try {
        // 1. Buscar todos os tenants ativos
        const { data: tenants, error: tenantsError } = await adminClient
            .from('tenants')
            .select('id, business_name, subscription_plan, created_at')
            .neq('status', 'suspended')
            .order('business_name');
        
        if (tenantsError) {
            throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
        }
        
        console.log(`📋 Encontrados ${tenants.length} tenants ativos`);
        
        // 2. Processar cada tenant
        const results = [];
        let totalPlatformRevenue = 0;
        
        for (const tenant of tenants) {
            console.log(`\n👤 Processando: ${tenant.business_name}`);
            
            const costData = await calculateRealPlatformCostForTenant(tenant.id, days);
            totalPlatformRevenue += costData.custo_total_plataforma;
            
            // 3. Salvar/atualizar métrica na tabela tenant_metrics
            const metricData = {
                tenant_id: tenant.id,
                metric_type: 'custo_plataforma',
                period: `${days}d`,
                metric_data: costData,
                calculated_at: new Date().toISOString()
            };
            
            // Deletar métrica existente do período
            await adminClient
                .from('tenant_metrics')
                .delete()
                .eq('tenant_id', tenant.id)
                .eq('metric_type', 'custo_plataforma')
                .eq('period', `${days}d`);
            
            // Inserir nova métrica
            const { error: insertError } = await adminClient
                .from('tenant_metrics')
                .insert(metricData);
            
            if (insertError) {
                console.log(`     ❌ Erro ao salvar métrica: ${insertError.message}`);
            } else {
                console.log(`     💾 Métrica salva: R$ ${costData.custo_total_plataforma.toFixed(2)}`);
            }
            
            results.push({
                tenant_name: tenant.business_name,
                tenant_id: tenant.id,
                ...costData
            });
        }
        
        // 4. Resumo do período
        console.log(`\n📊 RESUMO DO PERÍODO ${days}d:`);
        console.log(`   💰 Revenue Total da Plataforma: R$ ${totalPlatformRevenue.toFixed(2)}`);
        console.log(`   🏢 Tenants com Pagamentos: ${results.filter(r => r.custo_total_plataforma > 0).length}`);
        console.log(`   📋 Total de Tenants: ${results.length}`);
        
        return {
            period_days: days,
            total_platform_revenue: totalPlatformRevenue,
            tenants_processed: results.length,
            tenants_with_payments: results.filter(r => r.custo_total_plataforma > 0).length,
            tenant_details: results
        };
        
    } catch (error) {
        console.error(`❌ Erro no processamento do período ${days}d:`, error);
        throw error;
    }
}

/**
 * EXECUTAR CORREÇÃO COMPLETA
 */
async function executeCompleteCorrection() {
    const startTime = Date.now();
    console.log('🚀 CORREÇÃO MÉTRICA CUSTO_PLATAFORMA - DADOS REAIS');
    console.log('🎯 Fonte: subscription_payments (pagamentos efetivos)');
    console.log('📅 Períodos: 7d, 30d, 90d');
    console.log('='.repeat(80));
    
    const periods = [7, 30, 90];
    const allResults = {};
    
    try {
        // Processar cada período
        for (const days of periods) {
            const periodResult = await processAllTenantsForPeriod(days);
            allResults[`${days}d`] = periodResult;
        }
        
        // Relatório final
        console.log('\n' + '='.repeat(80));
        console.log('📋 RELATÓRIO FINAL - CUSTO PLATAFORMA CORRIGIDO');
        console.log('='.repeat(80));
        
        for (const [period, result] of Object.entries(allResults)) {
            console.log(`\n📊 PERÍODO ${period}:`);
            console.log(`   💰 Revenue: R$ ${result.total_platform_revenue.toFixed(2)}`);
            console.log(`   🏢 Tenants: ${result.tenants_with_payments}/${result.tenants_processed}`);
            
            // Top 5 tenants por revenue
            const topTenants = result.tenant_details
                .filter(t => t.custo_total_plataforma > 0)
                .sort((a, b) => b.custo_total_plataforma - a.custo_total_plataforma)
                .slice(0, 5);
            
            if (topTenants.length > 0) {
                console.log(`   🏆 Top ${topTenants.length} tenants:`);
                topTenants.forEach((tenant, i) => {
                    console.log(`      ${i+1}. ${tenant.tenant_name}: R$ ${tenant.custo_total_plataforma.toFixed(2)} (${tenant.total_payments} pagamentos)`);
                });
            }
        }
        
        const executionTime = Date.now() - startTime;
        console.log(`\n⏱️ Tempo total: ${executionTime}ms`);
        console.log('✅ CORREÇÃO CONCLUÍDA COM SUCESSO');
        console.log('='.repeat(80));
        
        return allResults;
        
    } catch (error) {
        console.error('\n❌ ERRO NA CORREÇÃO:', error);
        throw error;
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    executeCompleteCorrection()
        .then(() => {
            console.log('\n🎉 Script executado com sucesso!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Falha na execução:', error);
            process.exit(1);
        });
}

module.exports = { executeCompleteCorrection, processAllTenantsForPeriod };