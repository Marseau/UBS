#!/usr/bin/env node
/**
 * Popular tabela subscription_payments baseada nas métricas custo_plataforma
 * Simula o histórico de pagamentos dos tenants para a plataforma
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function populateSubscriptionPayments() {
    console.log('🚀 Populando subscription_payments baseado em custo_plataforma');
    console.log('💰 Criando histórico de pagamentos dos tenants para a plataforma\n');
    
    try {
        // 1. Buscar todas as métricas custo_plataforma
        console.log('📊 Buscando todas as métricas custo_plataforma...');
        const { data: costMetrics, error: costError } = await adminClient
            .from('tenant_metrics')
            .select('tenant_id, period, metric_data, calculated_at')
            .eq('metric_type', 'custo_plataforma')
            .order('calculated_at', { ascending: false });
        
        if (costError || !costMetrics) {
            throw new Error(`Erro ao buscar custo_plataforma: ${costError?.message}`);
        }
        
        console.log(`✅ Encontradas ${costMetrics.length} métricas de custo da plataforma`);
        
        // 2. Limpar dados anteriores
        console.log('\n🧹 Limpando dados anteriores de subscription_payments...');
        const { error: deleteError } = await adminClient
            .from('subscription_payments')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        
        if (deleteError) {
            console.log('⚠️ Aviso ao limpar dados:', deleteError.message);
        } else {
            console.log('✅ Dados anteriores limpos');
        }
        
        // 3. Agrupar por tenant e período para criar pagamentos
        console.log('\n💳 Criando registros de pagamentos...');
        const paymentRecords = [];
        
        // Agrupar métricas por tenant
        const metricsByTenant = {};
        costMetrics.forEach(metric => {
            if (!metricsByTenant[metric.tenant_id]) {
                metricsByTenant[metric.tenant_id] = [];
            }
            metricsByTenant[metric.tenant_id].push(metric);
        });
        
        let totalPayments = 0;
        let totalRevenue = 0;
        
        // Para cada tenant, criar pagamentos baseados nas métricas
        for (const [tenantId, metrics] of Object.entries(metricsByTenant)) {
            // Pegar apenas métrica mensal (30d) para simular cobrança mensal
            const monthlyMetric = metrics.find(m => m.period === '30d');
            
            if (monthlyMetric && monthlyMetric.metric_data) {
                const data = monthlyMetric.metric_data;
                const amount = data.custo_total_plataforma || 0;
                
                if (amount > 0) {
                    // Criar pagamento para o tenant
                    const paymentRecord = {
                        tenant_id: tenantId,
                        amount: amount,
                        currency: 'BRL',
                        status: 'completed',
                        plan_type: data.plano_atual || 'basico',
                        billing_period: 'monthly',
                        conversations_count: data.total_conversations || 0,
                        conversations_included: data.limite_conversas_plano || 200,
                        overage_conversations: data.conversas_excedentes || 0,
                        overage_amount: data.custo_excedentes || 0,
                        base_amount: data.plano_preco_base || 58,
                        payment_date: new Date().toISOString(),
                        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 dias
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        payment_method: 'credit_card',
                        subscription_id: `sub_${tenantId.substring(0, 8)}`,
                        invoice_url: `https://platform.ubs.com/invoices/${tenantId}`,
                        description: `Plano ${data.plano_atual} - ${data.total_conversations} conversas`
                    };
                    
                    paymentRecords.push(paymentRecord);
                    totalRevenue += amount;
                    totalPayments++;
                    
                    console.log(`   💰 Tenant ${tenantId.substring(0, 8)}... → ${data.plano_atual} → R$ ${amount.toFixed(2)} (${data.total_conversations} conversas)`);
                }
            }
        }
        
        // 4. Inserir todos os pagamentos
        if (paymentRecords.length > 0) {
            console.log(`\n💾 Inserindo ${paymentRecords.length} registros de pagamentos...`);
            
            const { data: insertedData, error: insertError } = await adminClient
                .from('subscription_payments')
                .insert(paymentRecords)
                .select();
            
            if (insertError) {
                throw new Error(`Erro ao inserir pagamentos: ${insertError.message}`);
            }
            
            console.log(`✅ ${insertedData.length} pagamentos inseridos com sucesso`);
        }
        
        // 5. Verificar dados inseridos
        console.log('\n🔍 Verificando dados inseridos...');
        const { data: verifyData, count: totalCount } = await adminClient
            .from('subscription_payments')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(5);
        
        if (verifyData && verifyData.length > 0) {
            console.log(`✅ Verificação: ${totalCount} registros na tabela subscription_payments`);
            console.log('\n📊 Exemplos inseridos:');
            verifyData.forEach((payment, i) => {
                console.log(`   ${i+1}. Tenant ${payment.tenant_id.substring(0, 8)}...:`);
                console.log(`      Plano: ${payment.plan_type} | Valor: R$ ${payment.amount}`);
                console.log(`      Conversas: ${payment.conversations_count}/${payment.conversations_included}`);
                console.log(`      Excedentes: ${payment.overage_conversations} (R$ ${payment.overage_amount})`);
                console.log('');
            });
        }
        
        // 6. Resumo final
        console.log('📋 RESUMO DA POPULAÇÃO:');
        console.log('='.repeat(50));
        console.log(`✅ Pagamentos criados: ${totalPayments}`);
        console.log(`💰 Revenue total da plataforma: R$ ${totalRevenue.toFixed(2)}`);
        console.log(`📊 Tenants com pagamentos: ${paymentRecords.length}`);
        console.log(`🗃️ Registros em subscription_payments: ${totalCount}`);
        console.log(`📅 Período: Baseado em métricas mensais (30d)`);
        console.log(`💳 Status: completed (simulando pagamentos processados)`);
        
        return {
            success: true,
            totalPayments,
            totalRevenue,
            tenantsWithPayments: paymentRecords.length,
            recordsInTable: totalCount
        };
        
    } catch (error) {
        console.error('💥 Erro na população:', error.message);
        throw error;
    }
}

populateSubscriptionPayments()
    .then(result => {
        console.log('\n🎯 POPULAÇÃO', result.success ? 'CONCLUÍDA COM SUCESSO!' : 'FALHOU');
        console.log('📊 Agora subscription_payments contém dados reais baseados em custo_plataforma!');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Erro fatal:', error.message);
        process.exit(1);
    });