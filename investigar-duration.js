/**
 * INVESTIGAR POR QUE ALGUNS REGISTROS TÊM duration_minutes E OUTROS NÃO
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function investigarDurationMinutes() {
    console.log('🔍 POR QUE NEM TODOS TÊM duration_minutes?');
    console.log('='.repeat(60));
    
    // 1. Amostra geral
    const { data: amostra } = await supabase
        .from('conversation_history')
        .select('role, is_from_user, conversation_context, created_at, content')
        .not('conversation_context', 'is', null)
        .limit(100);
    
    let comDuration = [];
    let semDuration = [];
    
    amostra?.forEach(msg => {
        if (msg.conversation_context && typeof msg.conversation_context.duration_minutes === 'number') {
            comDuration.push(msg);
        } else {
            semDuration.push(msg);
        }
    });
    
    console.log(`📊 ESTATÍSTICAS (amostra 100 registros):`);
    console.log(`   COM duration_minutes: ${comDuration.length}`);
    console.log(`   SEM duration_minutes: ${semDuration.length}`);
    
    // 2. Analisar exemplos
    if (comDuration.length > 0) {
        console.log('\n✅ EXEMPLO COM duration_minutes:');
        const exemplo = comDuration[0];
        console.log(`   Role: ${exemplo.role}, From User: ${exemplo.is_from_user}`);
        console.log(`   Content: ${exemplo.content?.substring(0, 50)}...`);
        console.log(`   Context:`, JSON.stringify(exemplo.conversation_context));
        console.log(`   Created: ${exemplo.created_at}`);
    }
    
    if (semDuration.length > 0) {
        console.log('\n❌ EXEMPLO SEM duration_minutes:');
        const exemplo = semDuration[0];
        console.log(`   Role: ${exemplo.role}, From User: ${exemplo.is_from_user}`);
        console.log(`   Content: ${exemplo.content?.substring(0, 50)}...`);
        console.log(`   Context:`, JSON.stringify(exemplo.conversation_context));
        console.log(`   Created: ${exemplo.created_at}`);
    }
    
    // 3. Análise por role/tipo
    const statsPorTipo = {
        comDuration: { user: 0, assistant: 0, system: 0 },
        semDuration: { user: 0, assistant: 0, system: 0 }
    };
    
    amostra?.forEach(msg => {
        const hasDuration = msg.conversation_context && typeof msg.conversation_context.duration_minutes === 'number';
        const tipo = msg.is_from_user ? 'user' : (msg.role || 'assistant');
        
        if (hasDuration) {
            statsPorTipo.comDuration[tipo] = (statsPorTipo.comDuration[tipo] || 0) + 1;
        } else {
            statsPorTipo.semDuration[tipo] = (statsPorTipo.semDuration[tipo] || 0) + 1;
        }
    });
    
    console.log('\n📈 ANÁLISE POR TIPO DE MENSAGEM:');
    console.log('COM duration_minutes:', statsPorTipo.comDuration);
    console.log('SEM duration_minutes:', statsPorTipo.semDuration);
    
    // 4. Análise por session_id - talvez só primeira/última mensagem da sessão
    const sessionAnalysis = new Map();
    
    amostra?.forEach(msg => {
        const sessionId = msg.conversation_context?.session_id;
        if (sessionId) {
            if (!sessionAnalysis.has(sessionId)) {
                sessionAnalysis.set(sessionId, []);
            }
            sessionAnalysis.get(sessionId).push({
                hasDuration: typeof msg.conversation_context.duration_minutes === 'number',
                created_at: msg.created_at,
                role: msg.role,
                is_from_user: msg.is_from_user
            });
        }
    });
    
    console.log('\n🎯 ANÁLISE POR SESSÃO (5 primeiras):');
    let sessionCount = 0;
    for (const [sessionId, mensagens] of sessionAnalysis.entries()) {
        if (sessionCount >= 5) break;
        
        mensagens.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const comDurationNaSessao = mensagens.filter(m => m.hasDuration).length;
        
        console.log(`${sessionCount + 1}. Sessão ${sessionId.substring(0, 8)}:`);
        console.log(`   Total mensagens: ${mensagens.length}`);
        console.log(`   Com duration: ${comDurationNaSessao}`);
        console.log(`   Mensagens:`);
        mensagens.forEach((msg, i) => {
            const tipo = msg.is_from_user ? 'USER' : 'ASSISTANT';
            const duration = msg.hasDuration ? '✅' : '❌';
            console.log(`     ${i + 1}. ${tipo} ${duration} (${msg.created_at})`);
        });
        console.log('   ---');
        sessionCount++;
    }
    
    // 5. Hipóteses
    console.log('\n💡 HIPÓTESES POSSÍVEIS:');
    console.log('1. duration_minutes só existe na ÚLTIMA mensagem da sessão');
    console.log('2. duration_minutes só existe em mensagens do ASSISTENTE');
    console.log('3. duration_minutes foi adicionado em determinada data (nova versão)');
    console.log('4. duration_minutes só existe quando response_to é null');
    
    // 6. Testar hipótese: duration_minutes vs response_to
    const comDurationEResponseTo = comDuration.filter(m => m.conversation_context.response_to).length;
    const semDurationEResponseTo = semDuration.filter(m => m.conversation_context.response_to).length;
    
    console.log('\n🔍 TESTE: duration_minutes vs response_to');
    console.log(`COM duration E response_to: ${comDurationEResponseTo}`);
    console.log(`SEM duration E response_to: ${semDurationEResponseTo}`);
    
    if (comDurationEResponseTo === 0) {
        console.log('💡 DESCOBERTA: Mensagens com duration_minutes NÃO têm response_to!');
        console.log('   Isso sugere que duration_minutes está em mensagens de INÍCIO de conversa');
    }
}

investigarDurationMinutes().catch(console.error);