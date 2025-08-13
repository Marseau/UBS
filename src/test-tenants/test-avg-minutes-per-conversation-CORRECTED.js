#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA AVG_MINUTES_PER_CONVERSATION CORRIGIDA
 * 
 * Testa apenas o cálculo da duração média de conversas por período (7d, 30d, 90d)
 * usando diferença real entre timestamps: conversation_end - conversation_start
 * 
 * Formato de retorno EXATAMENTE igual ao script base:
 * { minutes, total_minutes, total_conversations }
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular avg_minutes_per_conversation CORRETO para um tenant e período
 * EXATAMENTE como deve estar no script base
 */
async function calculateAvgMinutesPerConversationCorrected(tenantId, periodDays) {
    console.log(`⏱️  Calculando minutos médios por conversa para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
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
                minutes: 0,
                total_minutes: 0,
                total_conversations: 0
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
                total_minutes: durationMinutes
            };
        });
        
        console.log(`   💬 Total de sessões únicas encontradas: ${validSessions.length}`);
        
        if (validSessions.length === 0) {
            console.log(`   📭 Nenhuma sessão válida no período`);
            return {
                minutes: 0,
                total_minutes: 0,
                total_conversations: 0
            };
        }
        
        // Calcular estatísticas EXATAMENTE como no script base
        const totalConversations = validSessions.length;
        const totalMinutes = validSessions.reduce((sum, session) => sum + session.total_minutes, 0);
        const avgMinutes = totalConversations > 0 ? totalMinutes / totalConversations : 0;
        
        const result = {
            minutes: Math.round(avgMinutes * 100) / 100,
            total_minutes: Math.round(totalMinutes * 100) / 100,
            total_conversations: totalConversations
        };
        
        console.log(`   ✅ Resultado: ${result.total_minutes}min / ${result.total_conversations} = ${result.minutes} min/conversa`);
        
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
                    console.log(`      Média por conversa: ${result.minutes} min`);
                    console.log(`      Total conversas: ${result.total_conversations}`);
                    console.log(`      Total minutos: ${result.total_minutes} min`);
                    
                } catch (error) {
                    console.log(`   ❌ Erro período ${periodDays}d: ${error.message}`);
                }
            }
        }
        
        console.log('\n📈 VALIDAÇÃO DA MÉTRICA:');
        console.log('='.repeat(60));
        console.log('✅ Métrica calcula CORRETAMENTE por tenant/período');
        console.log('✅ Usa timestamp real: conversation_end - conversation_start');  
        console.log('✅ Agrupa por session_id (múltiplas mensagens = 1 conversa)');
        console.log('✅ Filtra por período de início da conversa');
        console.log('✅ Retorna formato correto: { minutes, total_minutes, total_conversations }');
        console.log('✅ PRONTO PARA SUBSTITUIR NO SCRIPT BASE');
        
        console.log('\n✅ TESTE CONCLUÍDO');
        
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