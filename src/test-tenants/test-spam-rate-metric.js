#!/usr/bin/env node

/**
 * TESTE DA MÉTRICA SPAM_RATE
 * 
 * Testa o cálculo da taxa de spam/números errados para análise
 * da qualidade do número WhatsApp do tenant
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular spam_rate para um tenant e período
 */
async function calculateSpamRate(tenantId, periodDays) {
    console.log(`🚫 Testando SPAM_RATE para tenant ${tenantId.substring(0, 8)} (${periodDays}d)`);
    
    try {
        // Calcular datas do período
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        
        console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Definir ENUMs conforme implementação atual
        const SPAM_OUTCOMES = [
            'wrong_number',    // Número errado - pessoa não é do negócio
            'spam_detected'    // Detectado como spam automaticamente
        ];
        
        // Buscar todas as conversas do período com outcomes
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select(`
                conversation_outcome,
                conversation_context,
                created_at
            `)
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .not('conversation_context', 'is', null)
            .not('conversation_outcome', 'is', null);
        
        if (error) {
            console.error(`   ❌ Erro na query: ${error.message}`);
            throw error;
        }
        
        if (!conversations || conversations.length === 0) {
            console.log(`   📭 Nenhuma conversa encontrada para o período`);
            return {
                spam_percentage: 0,
                spam_conversations: 0,
                total_conversations: 0,
                outcomes_distribution: {}
            };
        }
        
        // Agrupar por session_id usando data de início da conversa
        const sessionMap = new Map();
        
        for (const conv of conversations) {
            const sessionId = conv.conversation_context?.session_id;
            if (!sessionId) continue;
            
            if (!sessionMap.has(sessionId)) {
                // Primeira mensagem da sessão
                sessionMap.set(sessionId, {
                    session_id: sessionId,
                    conversation_start: conv.created_at,
                    final_outcome: conv.conversation_outcome
                });
            } else {
                const session = sessionMap.get(sessionId);
                // Usar data de início da conversa (primeira mensagem)
                if (new Date(conv.created_at) < new Date(session.conversation_start)) {
                    session.conversation_start = conv.created_at;
                }
                // Atualizar outcome final (última mensagem com outcome)
                if (conv.conversation_outcome) {
                    session.final_outcome = conv.conversation_outcome;
                }
            }
        }
        
        // Filtrar sessões que iniciaram no período correto
        const validSessions = Array.from(sessionMap.values()).filter(session => {
            const sessionStart = new Date(session.conversation_start);
            return sessionStart >= startDate && sessionStart <= endDate;
        });
        
        console.log(`   💬 Total de sessões únicas encontradas: ${validSessions.length}`);
        
        // Contar conversas spam
        const spamSessions = validSessions.filter(session =>
            SPAM_OUTCOMES.includes(session.final_outcome)
        );
        
        const totalSessions = validSessions.length;
        const spamCount = spamSessions.length;
        const spamPercentage = totalSessions > 0 ? (spamCount / totalSessions) * 100 : 0;
        
        // Análise detalhada dos outcomes
        const outcomesDistribution = {};
        validSessions.forEach(session => {
            const outcome = session.final_outcome;
            outcomesDistribution[outcome] = (outcomesDistribution[outcome] || 0) + 1;
        });
        
        console.log(`   📊 Distribuição de outcomes:`)
        Object.entries(outcomesDistribution)
            .sort((a, b) => b[1] - a[1])
            .forEach(([outcome, count]) => {
                const isSpam = SPAM_OUTCOMES.includes(outcome);
                const symbol = isSpam ? '🚫' : '⚪';
                const percentage = (count / totalSessions * 100).toFixed(1);
                console.log(`      ${symbol} ${outcome}: ${count} (${percentage}%)`);
            });
        
        // Detalhar especificamente outcomes de spam
        if (spamSessions.length > 0) {
            console.log(`   🚫 Breakdown outcomes de spam:`);
            const spamBreakdown = {};
            spamSessions.forEach(session => {
                const outcome = session.final_outcome;
                spamBreakdown[outcome] = (spamBreakdown[outcome] || 0) + 1;
            });
            
            Object.entries(spamBreakdown).forEach(([outcome, count]) => {
                console.log(`      📝 ${outcome}: ${count} sessões`);
            });
        }
        
        // Análise de qualidade do número WhatsApp
        console.log(`   📈 ANÁLISE DE QUALIDADE DO WHATSAPP:`);
        if (spamPercentage === 0) {
            console.log(`      ✅ EXCELENTE: 0% de spam - número muito bem protegido`);
        } else if (spamPercentage < 5) {
            console.log(`      ✅ BOM: ${spamPercentage.toFixed(1)}% de spam - nível aceitável`);
        } else if (spamPercentage < 15) {
            console.log(`      ⚠️  MÉDIO: ${spamPercentage.toFixed(1)}% de spam - monitorar`);
        } else if (spamPercentage < 30) {
            console.log(`      ❌ RUIM: ${spamPercentage.toFixed(1)}% de spam - número comprometido`);
        } else {
            console.log(`      🔥 CRÍTICO: ${spamPercentage.toFixed(1)}% de spam - número queimado`);
        }
        
        const result = {
            spam_percentage: Math.round(spamPercentage * 100) / 100,
            spam_conversations: spamCount,
            total_conversations: totalSessions,
            outcomes_distribution: outcomesDistribution,
            quality_score: spamPercentage < 5 ? 'EXCELENTE' : 
                          spamPercentage < 15 ? 'BOM' : 
                          spamPercentage < 30 ? 'MÉDIO' : 'RUIM'
        };
        
        console.log(`   ✅ Resultado: ${spamCount}/${totalSessions} = ${spamPercentage.toFixed(2)}% de spam`);
        
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
    console.log('🧪 TESTE DA MÉTRICA SPAM_RATE');
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
        
        // Testar cada tenant com diferentes períodos
        const periods = [7, 30, 90];
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(60));
            
            for (const periodDays of periods) {
                try {
                    const result = await calculateSpamRate(tenant.id, periodDays);
                    
                    console.log(`   📊 RESUMO ${periodDays}d:`);
                    console.log(`      Conversas spam: ${result.spam_conversations}/${result.total_conversations}`);
                    console.log(`      Taxa spam: ${result.spam_percentage}%`);
                    console.log(`      Qualidade WhatsApp: ${result.quality_score}`);
                    
                } catch (error) {
                    console.log(`   ❌ Erro período ${periodDays}d: ${error.message}`);
                }
            }
        }
        
        console.log('\n✅ TESTE CONCLUÍDO');
        console.log('\n📋 OUTCOMES DE SPAM TESTADOS:');
        console.log('   🚫 wrong_number - Número errado, pessoa não é do negócio');
        console.log('   🚫 spam_detected - Detectado como spam automaticamente');
        console.log('\n📈 ESCALA DE QUALIDADE:');
        console.log('   ✅ 0-5%: EXCELENTE - Número bem protegido');
        console.log('   ✅ 5-15%: BOM - Nível aceitável de spam');
        console.log('   ⚠️  15-30%: MÉDIO - Monitorar situação');
        console.log('   ❌ >30%: RUIM - Número comprometido');
        
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

module.exports = { calculateSpamRate };