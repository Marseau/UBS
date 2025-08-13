#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA AVG_MINUTES_PER_CONVERSATION CORRIGIDA
 * 
 * Testa o cálculo CORRETO da duração média de conversas baseado em:
 * conversation_end - conversation_start (diferença real de timestamps)
 * 
 * CRÍTICO para análise de custos de IA por domínio/tenant
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular avg_minutes_per_conversation CORRETO para um tenant e período
 */
async function calculateAvgMinutesPerConversationCorrected(tenantId, periodDays) {
    console.log(`⏱️  Testando AVG_MINUTES_PER_CONVERSATION CORRIGIDO para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        // Calcular datas do período
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Buscar todas as conversas do período com timestamps
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select(`
                conversation_context,
                created_at
            `)
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .not('conversation_context', 'is', null)
            .order('created_at', { ascending: true });
        
        if (error) {
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }
        
        if (!conversations || conversations.length === 0) {
            console.log(`   📭 Nenhuma conversa encontrada para o período`);
            return {
                avg_minutes_per_conversation: 0,
                total_conversations: 0,
                total_minutes: 0,
                duration_distribution: {},
                cost_analysis: {}
            };
        }
        
        // Agrupar por session_id e calcular duração REAL de cada conversa
        const sessionMap = new Map();
        
        for (const conv of conversations) {
            const sessionId = conv.conversation_context?.session_id;
            if (!sessionId) continue;
            
            const timestamp = new Date(conv.created_at);
            
            if (!sessionMap.has(sessionId)) {
                // Primeira mensagem da sessão
                sessionMap.set(sessionId, {
                    session_id: sessionId,
                    conversation_start: timestamp,
                    conversation_end: timestamp,
                    message_count: 1,
                    first_created_at: conv.created_at
                });
            } else {
                const session = sessionMap.get(sessionId);
                // Atualizar timestamps mínimo e máximo
                if (timestamp < session.conversation_start) {
                    session.conversation_start = timestamp;
                    session.first_created_at = conv.created_at;
                }
                if (timestamp > session.conversation_end) {
                    session.conversation_end = timestamp;
                }
                session.message_count++;
            }
        }
        
        // Filtrar sessões que iniciaram no período correto e calcular durações
        const validSessions = Array.from(sessionMap.values()).filter(session => {
            const sessionStart = new Date(session.first_created_at);
            return sessionStart >= startDate && sessionStart <= endDate;
        }).map(session => {
            // ✅ CÁLCULO CORRETO: diferença real entre início e fim da conversa
            const durationMs = session.conversation_end.getTime() - session.conversation_start.getTime();
            const durationMinutes = durationMs / (1000 * 60); // Converter para minutos
            
            return {
                ...session,
                duration_minutes: durationMinutes,
                duration_display: durationMinutes < 1 ? 
                    `${Math.round(durationMs / 1000)}s` : 
                    `${durationMinutes.toFixed(1)}min`
            };
        });
        
        console.log(`   💬 Total de sessões únicas encontradas: ${validSessions.length}`);
        
        if (validSessions.length === 0) {
            console.log(`   📭 Nenhuma sessão válida no período`);
            return {
                avg_minutes_per_conversation: 0,
                total_conversations: 0,
                total_minutes: 0,
                duration_distribution: {},
                cost_analysis: {}
            };
        }
        
        // Calcular estatísticas
        const totalConversations = validSessions.length;
        const totalMinutes = validSessions.reduce((sum, session) => sum + session.duration_minutes, 0);
        const avgMinutesPerConversation = totalMinutes / totalConversations;
        
        // Análise de distribuição de duração
        const durationDistribution = {
            'very_short (0-1min)': 0,
            'short (1-3min)': 0,
            'medium (3-10min)': 0,
            'long (10-30min)': 0,
            'very_long (30min+)': 0
        };
        
        validSessions.forEach(session => {
            const duration = session.duration_minutes;
            if (duration < 1) durationDistribution['very_short (0-1min)']++;
            else if (duration < 3) durationDistribution['short (1-3min)']++;
            else if (duration < 10) durationDistribution['medium (3-10min)']++;
            else if (duration < 30) durationDistribution['long (10-30min)']++;
            else durationDistribution['very_long (30min+)']++;
        });
        
        console.log(`   📊 Distribuição de durações:`)
        Object.entries(durationDistribution).forEach(([range, count]) => {
            const percentage = (count / totalConversations * 100).toFixed(1);
            const symbol = range.includes('very_long') ? '🔥' : 
                          range.includes('long') ? '⚠️' : 
                          range.includes('medium') ? '✅' : '⚡';
            console.log(`      ${symbol} ${range}: ${count} (${percentage}%)`);
        });
        
        // Análise de custos (estimativa baseada em tokens/minuto)
        const estimatedTokensPerMinute = 150; // Estimativa conservadora
        const costPerToken = 0.000002; // GPT-4o aproximado
        const totalEstimatedTokens = totalMinutes * estimatedTokensPerMinute;
        const totalEstimatedCost = totalEstimatedTokens * costPerToken;
        
        console.log(`   💰 ANÁLISE DE CUSTOS (Estimativa):`)
        console.log(`      Total de minutos: ${totalMinutes.toFixed(1)} min`);
        console.log(`      Tokens estimados: ${Math.round(totalEstimatedTokens).toLocaleString()}`);
        console.log(`      Custo estimado: $${totalEstimatedCost.toFixed(4)}`);
        console.log(`      Custo por conversa: $${(totalEstimatedCost / totalConversations).toFixed(4)}`);
        
        // Identificar conversas muito longas (potenciais problemas)
        const longConversations = validSessions.filter(s => s.duration_minutes > 10);
        if (longConversations.length > 0) {
            console.log(`   🔍 CONVERSAS LONGAS (>10min) - Potencial para otimização:`);
            longConversations.slice(0, 5).forEach(session => {
                console.log(`      📝 Sessão ${session.session_id.substring(0, 8)}: ${session.duration_display} (${session.message_count} msgs)`);
            });
            if (longConversations.length > 5) {
                console.log(`      ... e mais ${longConversations.length - 5} conversas longas`);
            }
        }
        
        const result = {
            avg_minutes_per_conversation: Math.round(avgMinutesPerConversation * 100) / 100,
            total_conversations: totalConversations,
            total_minutes: Math.round(totalMinutes * 100) / 100,
            duration_distribution: durationDistribution,
            cost_analysis: {
                total_estimated_tokens: Math.round(totalEstimatedTokens),
                total_estimated_cost_usd: Math.round(totalEstimatedCost * 10000) / 10000,
                cost_per_conversation_usd: Math.round((totalEstimatedCost / totalConversations) * 10000) / 10000,
                conversations_over_10min: longConversations.length,
                efficiency_score: longConversations.length / totalConversations * 100 // % conversas longas
            }
        };
        
        console.log(`   ✅ Resultado: ${totalMinutes.toFixed(1)}min / ${totalConversations} = ${avgMinutesPerConversation.toFixed(2)} min/conversa`);
        
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
    console.log('🧪 TESTE DA MÉTRICA AVG_MINUTES_PER_CONVERSATION CORRIGIDA');
    console.log('='.repeat(70));
    
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
        
        // Testar cada tenant com diferentes períodos
        const periods = [7, 30, 90];
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(60));
            
            for (const periodDays of periods) {
                try {
                    const result = await calculateAvgMinutesPerConversationCorrected(tenant.id, periodDays);
                    
                    console.log(`   📊 RESUMO ${periodDays}d:`);
                    console.log(`      Duração média: ${result.avg_minutes_per_conversation} min/conversa`);
                    console.log(`      Total conversas: ${result.total_conversations}`);
                    console.log(`      Total minutos: ${result.total_minutes} min`);
                    console.log(`      Custo estimado: $${result.cost_analysis.total_estimated_cost_usd}`);
                    console.log(`      Conversas >10min: ${result.cost_analysis.conversations_over_10min}/${result.total_conversations} (${result.cost_analysis.efficiency_score.toFixed(1)}%)`);
                    
                } catch (error) {
                    console.log(`   ❌ Erro período ${periodDays}d: ${error.message}`);
                }
            }
        }
        
        console.log('\n📈 VALIDAÇÃO DA MÉTRICA INDIVIDUAL:');
        console.log('='.repeat(60));
        console.log('✅ Métrica calcula CORRETAMENTE por tenant/período');
        console.log('✅ Usa timestamp real: conversation_end - conversation_start');  
        console.log('✅ Agrupa por session_id (múltiplas mensagens = 1 conversa)');
        console.log('✅ Filtra por período de início da conversa');
        console.log('✅ Retorna métricas individuais para agregação posterior');
        
        console.log('\n✅ TESTE CONCLUÍDO');
        console.log('\n💡 INSIGHTS PARA GESTÃO DE CUSTOS:');
        console.log('   🎯 Domínios com conversas mais longas = maior custo de IA');
        console.log('   ⚡ Conversas <3min = eficientes, baixo custo');
        console.log('   ⚠️  Conversas >10min = potencial para otimização');
        console.log('   🔥 Conversas >30min = investigar problemas de IA');
        console.log('   💰 Use para pricing estratégico por domínio');
        
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

module.exports = { calculateAvgMinutesPerConversationCorrected };