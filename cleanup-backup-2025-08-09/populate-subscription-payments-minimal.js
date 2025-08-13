#!/usr/bin/env node
/**
 * Popular tabela subscription_payments com estrutura mínima
 * Baseado nas métricas custo_plataforma
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function populateSubscriptionPaymentsMinimal() {
    console.log('🚀 Populando subscription_payments com estrutura mínima');
    console.log('💰 Baseado em métricas custo_plataforma\n');
    
    try {
        // 1. Buscar métricas custo_plataforma mensais (30d)
        const { data: costMetrics } = await adminClient
            .from('tenant_metrics')
            .select('tenant_id, metric_data')
            .eq('metric_type', 'custo_plataforma')
            .eq('period', '30d');
        
        if (!costMetrics || costMetrics.length === 0) {
            throw new Error('Nenhuma métrica custo_plataforma encontrada');
        }
        
        console.log(`📊 Encontradas ${costMetrics.length} métricas mensais`);
        
        // 2. Tentar com estrutura ultra-mínima
        console.log('\n💳 Criando pagamentos com estrutura mínima...');
        
        let successCount = 0;
        let totalRevenue = 0;
        
        for (const metric of costMetrics) {
            const data = metric.metric_data;
            const amount = data.custo_total_plataforma || 0;
            
            if (amount > 0) {
                try {
                    // Estrutura mínima com campos obrigatórios
                    const paymentRecord = {
                        tenant_id: metric.tenant_id,
                        amount: amount,
                        payment_date: new Date().toISOString()
                    };
                    
                    const { error } = await adminClient
                        .from('subscription_payments')
                        .insert(paymentRecord);
                    
                    if (error) {
                        console.log(`   ❌ Tenant ${metric.tenant_id.substring(0, 8)}: ${error.message}`);
                    } else {
                        console.log(`   ✅ Tenant ${metric.tenant_id.substring(0, 8)}: R$ ${amount.toFixed(2)}`);
                        successCount++;
                        totalRevenue += amount;
                    }
                    
                } catch (insertError) {
                    console.log(`   💥 Erro tenant ${metric.tenant_id.substring(0, 8)}: ${insertError.message}`);
                }
            }
        }
        
        // 3. Verificar resultado
        const { count } = await adminClient
            .from('subscription_payments')
            .select('*', { count: 'exact', head: true });
        
        console.log('\n📋 RESUMO:');
        console.log('='.repeat(40));
        console.log(`✅ Inserções bem-sucedidas: ${successCount}`);
        console.log(`💰 Revenue total: R$ ${totalRevenue.toFixed(2)}`);
        console.log(`🗃️ Total registros na tabela: ${count || 0}`);
        
        return {
            success: successCount > 0,
            inserted: successCount,
            totalRevenue,
            tableRecords: count || 0
        };
        
    } catch (error) {
        console.error('💥 Erro:', error.message);
        throw error;
    }
}

populateSubscriptionPaymentsMinimal()
    .then(result => {
        console.log('\n🎯', result.success ? 'SUCESSO!' : 'FALHOU');
        if (result.success) {
            console.log('📊 subscription_payments populada com dados baseados em custo_plataforma!');
        }
    })
    .catch(console.error);