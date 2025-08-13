#!/usr/bin/env node
/**
 * Implementar métrica custo_plataforma com regras CORRETAS do SaaS
 * Baseado na landing page: Planos por volume de conversas
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// REGRAS REAIS DO SAAS (baseadas na landing page)
const PLANOS_SAAS = {
    basico: {
        nome: 'Básico',
        preco_mensal: 58.00,
        limite_conversas: 200,
        preco_excedente: 0.00 // Não especificado na landing
    },
    profissional: {
        nome: 'Profissional', 
        preco_mensal: 116.00,
        limite_conversas: 400,
        preco_excedente: 0.00 // Não especificado na landing
    },
    enterprise: {
        nome: 'Enterprise',
        preco_mensal: 290.00,
        limite_conversas: 1250,
        preco_excedente: 0.25 // R$ 0,25 por conversa adicional
    }
};

function calcularCustoPlataforma(numeroConversas) {
    // Determinar plano baseado no volume de conversas
    let plano, custoTotal;
    
    if (numeroConversas <= PLANOS_SAAS.basico.limite_conversas) {
        plano = PLANOS_SAAS.basico;
        custoTotal = plano.preco_mensal;
    } else if (numeroConversas <= PLANOS_SAAS.profissional.limite_conversas) {
        plano = PLANOS_SAAS.profissional;
        custoTotal = plano.preco_mensal;
    } else if (numeroConversas <= PLANOS_SAAS.enterprise.limite_conversas) {
        plano = PLANOS_SAAS.enterprise;
        custoTotal = plano.preco_mensal;
    } else {
        // Excede Enterprise - cobra excedentes
        plano = PLANOS_SAAS.enterprise;
        const excedente = numeroConversas - plano.limite_conversas;
        custoTotal = plano.preco_mensal + (excedente * plano.preco_excedente);
    }
    
    return {
        plano_nome: plano.nome.toLowerCase(),
        plano_preco_base: plano.preco_mensal,
        limite_conversas: plano.limite_conversas,
        conversas_excedentes: Math.max(0, numeroConversas - plano.limite_conversas),
        preco_excedente_unitario: plano.preco_excedente,
        custo_total: custoTotal
    };
}

async function implementCustoPlataformaCorrect() {
    console.log('🚀 Implementando métrica custo_plataforma com REGRAS CORRETAS do SaaS');
    console.log('💰 Baseado na landing page: Planos por volume de conversas\n');
    
    // Mostrar regras do SaaS
    console.log('📋 REGRAS DO SAAS:');
    Object.entries(PLANOS_SAAS).forEach(([key, plano]) => {
        console.log(`   ${plano.nome}: R$ ${plano.preco_mensal}/mês - até ${plano.limite_conversas} conversas`);
        if (plano.preco_excedente > 0) {
            console.log(`      Excedente: R$ ${plano.preco_excedente}/conversa adicional`);
        }
    });
    console.log('');
    
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
    
    // Primeiro, limpar métricas custo_plataforma anteriores (com valores incorretos)
    console.log('🧹 Limpando métricas custo_plataforma anteriores...');
    const { error: deleteError } = await adminClient
        .from('tenant_metrics')
        .delete()
        .eq('metric_type', 'custo_plataforma');
    
    if (deleteError) {
        console.log('⚠️ Aviso ao limpar métricas anteriores:', deleteError.message);
    } else {
        console.log('✅ Métricas anteriores limpas\n');
    }
    
    let totalProcessed = 0;
    let totalErrors = 0;
    
    for (const period of periods) {
        console.log('⏱️ Período:', period.name);
        const startDate = new Date(Date.now() - period.days * 24 * 60 * 60 * 1000);
        
        for (const tenantId of uniqueTenants) {
            try {
                // 1. Contar conversas REAIS do tenant no período
                const { count: conversationCount } = await adminClient
                    .from('conversation_sessions')
                    .select('*', { count: 'exact', head: true })
                    .eq('tenant_id', tenantId)
                    .gte('created_at', startDate.toISOString());
                
                const numeroConversas = conversationCount || 0;
                
                // 2. Calcular custo da plataforma baseado nas regras REAIS
                const custoCalculado = calcularCustoPlataforma(numeroConversas);
                
                // 3. Dados da métrica custo_plataforma
                const custoPlataformaData = {
                    period_days: period.days,
                    calculated_at: new Date().toISOString(),
                    
                    // Volume de conversas
                    total_conversations: numeroConversas,
                    
                    // Plano e custo
                    plano_atual: custoCalculado.plano_nome,
                    plano_preco_base: custoCalculado.plano_preco_base,
                    limite_conversas_plano: custoCalculado.limite_conversas,
                    
                    // Excedentes
                    conversas_excedentes: custoCalculado.conversas_excedentes,
                    preco_excedente_unitario: custoCalculado.preco_excedente_unitario,
                    custo_excedentes: custoCalculado.conversas_excedentes * custoCalculado.preco_excedente_unitario,
                    
                    // Custo total (é o que a plataforma recebe deste tenant)
                    custo_total_plataforma: custoCalculado.custo_total,
                    
                    // Metadados
                    billing_model: 'conversation_based',
                    currency: 'BRL'
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
                    console.log('   ✅ Tenant', tenantId.substring(0, 8), '...:', 
                               numeroConversas, 'conversas →', 
                               custoCalculado.plano_nome, '→', 
                               'R$' + custoCalculado.custo_total.toFixed(2));
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
    console.log('💰 Modelo: Baseado em volume de conversas (regras da landing page)');
    
    // Verificar se as métricas foram criadas e mostrar exemplos
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
                       data.total_conversations, 'conversas →', 
                       data.plano_atual, '→',
                       'R$' + data.custo_total_plataforma.toFixed(2));
        });
        
        // Calcular total de revenue da plataforma por período
        console.log('\n💰 REVENUE DA PLATAFORMA POR PERÍODO:');
        const periodTotals = {};
        createdMetrics.forEach(metric => {
            if (!periodTotals[metric.period]) periodTotals[metric.period] = 0;
            periodTotals[metric.period] += metric.metric_data.custo_total_plataforma;
        });
        
        Object.entries(periodTotals).forEach(([period, total]) => {
            console.log('   ' + period + ': R$' + total.toFixed(2));
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

implementCustoPlataformaCorrect()
    .then(result => {
        console.log('\n🎯 IMPLEMENTAÇÃO', result.success ? 'CONCLUÍDA COM SUCESSO!' : 'CONCLUÍDA COM PROBLEMAS');
        console.log('📊 Agora o custo_plataforma reflete as regras REAIS do SaaS!');
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Erro fatal na implementação:', error.message);
        process.exit(1);
    });