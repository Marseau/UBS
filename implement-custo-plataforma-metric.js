#!/usr/bin/env node
/**
 * Implementar métrica custo_plataforma baseada no volume de conversas por tenant
 * Regra SaaS: R$ 0.10 por conversa processada
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function implementCustoPlataformaMetric() {
    console.log('🚀 Implementando métrica custo_plataforma baseada em volume de conversas');
    console.log('💰 Regra SaaS: R$ 0.10 por conversa processada\n');
    
    const periods = [
        { name: '7d', days: 7 },
        { name: '30d', days: 30 },
        { name: '90d', days: 90 }
    ];
    
    // Buscar todos os tenants ativos
    const { data: tenants } = await adminClient
        .from('tenant_metrics')
        .select('tenant_id')
        .limit(50);
    
    if (!tenants) {
        console.log('❌ Erro ao buscar tenants');
        return;
    }
    
    const uniqueTenants = [...new Set(tenants.map(t => t.tenant_id))];
    console.log('📊 Processando', uniqueTenants.length, 'tenants únicos\n');
    
    let totalProcessed = 0;
    let totalErrors = 0;
    
    for (const period of periods) {
        console.log('⏱️ Período:', period.name);
        const startDate = new Date(Date.now() - period.days * 24 * 60 * 60 * 1000);
        
        for (const tenantId of uniqueTenants) {
            try {
                // 1. Contar conversas do tenant no período
                const { count: conversationCount } = await adminClient
                    .from('conversation_sessions')
                    .select('*', { count: 'exact', head: true })
                    .eq('tenant_id', tenantId)
                    .gte('created_at', startDate.toISOString());
                
                // 2. Calcular custo da plataforma
                const costPerConversation = 0.10; // R$ 0.10 por conversa
                const totalPlatformCost = (conversationCount || 0) * costPerConversation;
                
                // 3. Dados adicionais para a métrica
                const custoPlataformaData = {
                    period_days: period.days,
                    calculated_at: new Date().toISOString(),
                    total_conversations: conversationCount || 0,
                    cost_per_conversation: costPerConversation,
                    total_platform_cost: totalPlatformCost,
                    billing_model: 'pay_per_conversation',
                    tenant_tier: totalPlatformCost > 50 ? 'premium' : totalPlatformCost > 20 ? 'standard' : 'basic'
                };
                
                // 4. Inserir métrica custo_plataforma
                const { error: insertError } = await adminClient
                    .from('tenant_metrics')
                    .insert({
                        tenant_id: tenantId,
                        metric_type: 'custo_plataforma',
                        period: period.name,
                        metric_data: custoPlataformaData,
                        calculated_at: new Date().toISOString(),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                
                if (insertError) {
                    console.log('   ❌ Erro tenant', tenantId.substring(0, 8), ':', insertError.message);
                    totalErrors++;
                } else {
                    console.log('   ✅ Tenant', tenantId.substring(0, 8), '...:', conversationCount, 'conversas →', 'R$' + totalPlatformCost.toFixed(2));
                    totalProcessed++;
                }
                
            } catch (error) {
                console.log('   💥 Erro processando tenant', tenantId.substring(0, 8), ':', error.message);
                totalErrors++;
            }
        }
        
        console.log('   📈 Período', period.name, 'concluído\n');
    }
    
    console.log('📋 RESUMO DA IMPLEMENTAÇÃO:');
    console.log('='.repeat(50));
    console.log('✅ Métricas processadas:', totalProcessed);
    console.log('❌ Erros encontrados:', totalErrors);
    console.log('📊 Tenants processados:', uniqueTenants.length);
    console.log('⏱️ Períodos implementados: 7d, 30d, 90d');
    console.log('💰 Modelo de cobrança: R$ 0.10 por conversa');
    
    // Verificar se as métricas foram criadas
    console.log('\n🔍 Verificando métricas criadas...');
    const { data: createdMetrics, count } = await adminClient
        .from('tenant_metrics')
        .select('tenant_id, period, metric_data', { count: 'exact' })
        .eq('metric_type', 'custo_plataforma')
        .order('created_at', { ascending: false })
        .limit(10);
    
    if (createdMetrics && createdMetrics.length > 0) {
        console.log('✅ Total métricas custo_plataforma criadas:', count);
        console.log('📊 Exemplos:');
        createdMetrics.slice(0, 5).forEach((metric, i) => {
            const data = metric.metric_data;
            console.log('   ' + (i+1) + '. Tenant', metric.tenant_id.substring(0, 8) + '... (' + metric.period + '):', 
                       data.total_conversations, 'conversas →', 'R$' + data.total_platform_cost.toFixed(2));
        });
    } else {
        console.log('❌ Nenhuma métrica custo_plataforma encontrada após implementação');
    }
    
    return {
        success: totalErrors === 0,
        processed: totalProcessed,
        errors: totalErrors,
        tenantsCount: uniqueTenants.length,
        metricsCreated: count || 0
    };
}

implementCustoPlataformaMetric()
    .then(result => {
        console.log('\n🎯 IMPLEMENTAÇÃO', result.success ? 'CONCLUÍDA COM SUCESSO!' : 'CONCLUÍDA COM PROBLEMAS');
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Erro fatal na implementação:', error.message);
        process.exit(1);
    });