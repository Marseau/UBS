#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA TOTAL_COST_USD (CORRIGIDA)
 * 
 * Testa o cálculo do custo USD TOTAL por período
 * SEM divisão por conversa - apenas soma total
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular total_cost_usd para um tenant e período
 */
async function calculateTotalCostUSD(tenantId, periodDays) {
    console.log(`💰 TOTAL_COST_USD para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select(`
                conversation_context,
                api_cost_usd,
                processing_cost_usd,
                created_at
            `)
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .not('conversation_context', 'is', null);

        if (error) {
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }

        if (!conversations || conversations.length === 0) {
            console.log(`   📭 Nenhuma conversa encontrada`);
            return {
                total_cost_usd: 0,
                api_cost_usd: 0,
                processing_cost_usd: 0,
                total_conversations: 0
            };
        }

        // Agregar por session_id
        const sessionMap = new Map();
        
        for (const conv of conversations) {
            const sessionId = conv.conversation_context?.session_id;
            const apiCost = conv.api_cost_usd || 0;
            const processingCost = conv.processing_cost_usd || 0;
            const totalCost = apiCost + processingCost;
            
            if (!sessionId) continue;
            
            if (!sessionMap.has(sessionId)) {
                sessionMap.set(sessionId, {
                    session_id: sessionId,
                    conversation_start: conv.created_at,
                    total_cost_usd: totalCost
                });
            } else {
                const session = sessionMap.get(sessionId);
                // Usar data de início da conversa
                if (new Date(conv.created_at) < new Date(session.conversation_start)) {
                    session.conversation_start = conv.created_at;
                }
                // Somar custos
                session.total_cost_usd += totalCost;
            }
        }
        
        // Filtrar sessões que iniciaram no período
        const validSessions = Array.from(sessionMap.values()).filter(session => {
            const sessionStart = new Date(session.conversation_start);
            return sessionStart >= startDate && sessionStart <= endDate;
        });
        
        const totalConversations = validSessions.length;
        const totalCostUSD = validSessions.reduce((sum, session) => sum + session.total_cost_usd, 0);
        
        // Calcular totais por tipo de custo
        let totalApiCost = 0;
        let totalProcessingCost = 0;
        
        for (const conv of conversations) {
            const sessionId = conv.conversation_context?.session_id;
            if (!sessionId) continue;
            
            // Verificar se a sessão está nas válidas
            const session = validSessions.find(s => s.session_id === sessionId);
            if (session) {
                totalApiCost += conv.api_cost_usd || 0;
                totalProcessingCost += conv.processing_cost_usd || 0;
            }
        }
        
        console.log(`   💬 Conversas válidas: ${totalConversations}`);
        console.log(`   💰 TOTAIS POR TIPO:`);
        console.log(`      API cost total: $${totalApiCost.toFixed(4)}`);
        console.log(`      Processing cost total: $${totalProcessingCost.toFixed(4)}`);
        console.log(`      CUSTO TOTAL: $${totalCostUSD.toFixed(4)}`);
        
        const result = {
            total_cost_usd: Math.round(totalCostUSD * 10000) / 10000,
            api_cost_usd: Math.round(totalApiCost * 10000) / 10000,
            processing_cost_usd: Math.round(totalProcessingCost * 10000) / 10000,
            total_conversations: totalConversations
        };
        
        console.log(`   ✅ Resultado TOTAL: $${result.total_cost_usd} (${result.total_conversations} conversas)`);
        
        return result;
        
    } catch (error) {
        console.error(`   💥 Erro no cálculo: ${error instanceof Error ? error.message : error}`);
        throw error;
    }
}

/**
 * Testar múltiplos tenants e períodos
 */
async function runTests() {
    console.log('🧪 TESTE DA MÉTRICA TOTAL_COST_USD (SEM DIVISÃO)');
    console.log('='.repeat(60));
    
    try {
        // Buscar tenants ativos para teste
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active');
        
        if (error) {
            throw new Error(`Erro ao buscar tenants: ${error.message}`);
        }
        
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }
        
        console.log(`📊 Testando com ${tenants.length} tenants:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        console.log('');
        
        // Testar cada tenant com os 3 períodos
        const periods = [7, 30, 90];
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(60));
            
            for (const periodDays of periods) {
                try {
                    const result = await calculateTotalCostUSD(tenant.id, periodDays);
                    
                    console.log(`   📊 RESUMO ${periodDays}d:`);
                    console.log(`      CUSTO TOTAL: $${result.total_cost_usd}`);
                    console.log(`      API cost: $${result.api_cost_usd}`);
                    console.log(`      Processing cost: $${result.processing_cost_usd}`);
                    console.log(`      Conversas: ${result.total_conversations}`);
                    
                } catch (error) {
                    console.log(`   ❌ Erro período ${periodDays}d: ${error.message}`);
                }
            }
        }
        
        console.log('\n📈 VALIDAÇÃO DA MÉTRICA CORRIGIDA:');
        console.log('='.repeat(60));
        console.log('✅ Métrica agora calcula TOTAL de custos USD');
        console.log('✅ SEM divisão por conversa - apenas somatória');  
        console.log('✅ Soma api_cost_usd + processing_cost_usd');
        console.log('✅ Agrupa por session_id para evitar duplicação');
        console.log('✅ Filtra por período de início da conversa');
        console.log('✅ Retorna: { total_cost_usd, api_cost_usd, processing_cost_usd, total_conversations }');
        
        console.log('\n✅ TESTE CONCLUÍDO');
        console.log('\n💡 DIFERENÇA DA VERSÃO ANTERIOR:');
        console.log('   ❌ ANTES: Calculava custo médio POR conversa');
        console.log('   ✅ AGORA: Calcula custo TOTAL do período');
        console.log('   📊 Útil para análise de gasto total por tenant');
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar teste
if (require.main === module) {
    runTests().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateTotalCostUSD };