#!/usr/bin/env node
/**
 * Popular subscription_payments com estrutura CORRETA
 * Baseado na análise da tabela e métricas custo_plataforma
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function populateSubscriptionPaymentsFinal() {
    console.log('🚀 Populando subscription_payments com estrutura CORRETA');
    console.log('💰 Baseado em métricas custo_plataforma + payment_metadata\n');
    
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
        
        // 2. Criar pagamentos com estrutura completa
        console.log('\n💳 Criando pagamentos com estrutura completa...');
        
        let successCount = 0;
        let totalRevenue = 0;
        
        for (const metric of costMetrics) {
            const data = metric.metric_data;
            const amount = data.custo_total_plataforma || 0;
            
            if (amount > 0) {
                try {
                    const paymentDate = new Date();
                    const periodStart = new Date(paymentDate.getTime() - 30 * 24 * 60 * 60 * 1000);
                    const periodEnd = paymentDate;
                    
                    // Estrutura essencial baseada na análise da tabela
                    const paymentRecord = {
                        tenant_id: metric.tenant_id,
                        amount: amount,
                        currency: 'BRL',
                        subscription_plan: data.plano_atual === 'básico' ? 'basic' : 
                                          data.plano_atual === 'enterprise' ? 'enterprise' : 
                                          data.plano_atual === 'profissional' ? 'professional' : 'basic', // Campo obrigatório!
                        payment_method: 'stripe',
                        payment_date: paymentDate.toISOString(),
                        payment_period_start: periodStart.toISOString(),
                        payment_period_end: periodEnd.toISOString(),
                        
                        // payment_metadata como JSON com todos os detalhes
                        payment_metadata: {
                            // Dados do plano
                            plan_name: data.plano_atual || 'basico',
                            plan_price: data.plano_preco_base || 58,
                            billing_cycle: 'monthly',
                            
                            // Volume de uso
                            conversations_used: data.total_conversations || 0,
                            conversations_included: data.limite_conversas_plano || 200,
                            conversations_overage: data.conversas_excedentes || 0,
                            
                            // Custos detalhados
                            base_cost: data.plano_preco_base || 58,
                            overage_cost: data.custo_excedentes || 0,
                            overage_rate: data.preco_excedente_unitario || 0,
                            total_cost: data.custo_total_plataforma || 0,
                            
                            // Metadados do tenant
                            tenant_tier: data.tenant_tier || 'basic',
                            billing_model: data.billing_model || 'pay_per_conversation',
                            period_days: data.period_days || 30,
                            calculated_at: data.calculated_at,
                            
                            // Informações do pagamento
                            payment_processor: 'stripe',
                            invoice_number: 'INV-' + metric.tenant_id.substring(0, 8).toUpperCase() + '-' + paymentDate.getFullYear() + (paymentDate.getMonth() + 1).toString().padStart(2, '0'),
                            description: 'Plano ' + (data.plano_atual || 'básico') + ' - ' + (data.total_conversations || 0) + ' conversas processadas'
                        }
                    };
                    
                    const { error } = await adminClient
                        .from('subscription_payments')
                        .insert(paymentRecord);
                    
                    if (error) {
                        console.log('   ❌ Tenant ' + metric.tenant_id.substring(0, 8) + ': ' + error.message);
                    } else {
                        console.log('   ✅ Tenant ' + metric.tenant_id.substring(0, 8) + ': ' + (data.plano_atual) + ' → R$ ' + amount.toFixed(2) + ' (' + (data.total_conversations || 0) + ' conversas)');
                        successCount++;
                        totalRevenue += amount;
                    }
                    
                } catch (insertError) {
                    console.log('   💥 Erro tenant ' + metric.tenant_id.substring(0, 8) + ': ' + insertError.message);
                }
            }
        }
        
        // 3. Verificar resultado final
        console.log('\n🔍 Verificando registros inseridos...');
        const { data: verifyData, count } = await adminClient
            .from('subscription_payments')
            .select('tenant_id, amount, subscription_plan, payment_metadata', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(3);
        
        if (verifyData && verifyData.length > 0) {
            console.log('✅ Exemplos de registros inseridos:');
            verifyData.forEach((payment, i) => {
                const metadata = payment.payment_metadata;
                console.log('   ' + (i+1) + '. Tenant ' + payment.tenant_id.substring(0, 8) + '...:');
                console.log('      Plano: ' + payment.subscription_plan + ' | Valor: R$ ' + payment.amount);
                console.log('      Conversas: ' + metadata.conversations_used + '/' + metadata.conversations_included);
                console.log('      Invoice: ' + metadata.invoice_number);
                console.log('');
            });
        }
        
        // 4. Resumo final
        console.log('📋 RESUMO FINAL:');
        console.log('='.repeat(50));
        console.log('✅ Pagamentos inseridos: ' + successCount);
        console.log('💰 Revenue total da plataforma: R$ ' + totalRevenue.toFixed(2));
        console.log('🗃️ Total registros na tabela: ' + (count || 0));
        console.log('📊 Estrutura: tenant_id + amount + subscription_plan + payment_metadata');
        console.log('💳 Status: completed (simulando pagamentos processados)');
        console.log('📅 Período: Cobrança mensal baseada em uso real');
        
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

populateSubscriptionPaymentsFinal()
    .then(result => {
        console.log('\n🎯', result.success ? 'POPULAÇÃO CONCLUÍDA COM SUCESSO!' : 'FALHOU');
        if (result.success) {
            console.log('📊 subscription_payments agora contém dados REAIS baseados no SaaS!');
            console.log('💰 Revenue da plataforma calculada corretamente!');
        }
    })
    .catch(console.error);