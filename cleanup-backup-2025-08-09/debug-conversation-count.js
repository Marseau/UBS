/**
 * Debug script para investigar discrepância na contagem de conversas
 * Esperado: 1041 conversas | Atual: 222 conversas
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugConversationCount() {
    console.log('🔍 Investigando contagem de conversas...\n');
    
    try {
        // 1. Contar total de registros na tabela
        const { count: totalRecords } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true });
        
        console.log(`📊 Total de registros na tabela: ${totalRecords}`);
        
        // 2. Contar registros com session_id não nulo
        const { count: withSessionId } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .not('conversation_context->session_id', 'is', null);
        
        console.log(`📊 Registros com session_id não nulo: ${withSessionId}`);
        
        // 3. Buscar todos os registros com session_id e contar únicos manualmente
        const { data: allSessions, error } = await supabase
            .from('conversation_history')
            .select('conversation_context')
            .not('conversation_context->session_id', 'is', null);
            
        if (error) throw error;
        
        const uniqueSessions = new Set();
        const sessionStats = {};
        
        allSessions.forEach(row => {
            const sessionId = row.conversation_context?.session_id;
            if (sessionId) {
                uniqueSessions.add(sessionId);
                sessionStats[sessionId] = (sessionStats[sessionId] || 0) + 1;
            }
        });
        
        console.log(`📊 Sessões únicas encontradas: ${uniqueSessions.size}`);
        console.log(`📊 Total de mensagens processadas: ${allSessions.length}`);
        
        // 4. Analisar distribuição de mensagens por sessão
        const messageCounts = Object.values(sessionStats);
        const avgMessages = messageCounts.reduce((a, b) => a + b, 0) / messageCounts.length;
        const maxMessages = Math.max(...messageCounts);
        const minMessages = Math.min(...messageCounts);
        
        console.log(`\n📈 Estatísticas por sessão:`);
        console.log(`   Média de mensagens por sessão: ${avgMessages.toFixed(2)}`);
        console.log(`   Máximo de mensagens: ${maxMessages}`);
        console.log(`   Mínimo de mensagens: ${minMessages}`);
        
        // 5. Verificar se há problema com JOINs
        console.log(`\n🔍 Testando query com JOINs...`);
        
        const { data: withJoins, error: joinError } = await supabase
            .from('conversation_history')
            .select(`
                conversation_context,
                tenants!inner(name, business_name),
                users!inner(name)
            `)
            .not('conversation_context->session_id', 'is', null)
            .limit(10);
            
        if (joinError) {
            console.log(`❌ Erro com JOINs: ${joinError.message}`);
        } else {
            console.log(`✅ JOINs funcionando: ${withJoins.length} registros de amostra`);
        }
        
        // 6. Contar registros únicos usando query SQL direta
        console.log(`\n🔍 Testando query SQL direta...`);
        
        const { data: sqlResult, error: sqlError } = await supabase.rpc('exec_sql', {
            sql: `
                SELECT COUNT(DISTINCT ch.conversation_context->>'session_id') as unique_sessions
                FROM conversation_history ch
                INNER JOIN tenants t ON ch.tenant_id = t.id
                INNER JOIN users u ON ch.user_id = u.id
                WHERE ch.conversation_context->>'session_id' IS NOT NULL
            `
        });
        
        if (sqlError) {
            console.log(`❌ Erro na query SQL: ${sqlError.message}`);
        } else {
            console.log(`✅ Query SQL direta: ${sqlResult[0]?.unique_sessions} sessões únicas`);
        }
        
        // 7. Verificar se há registros órfãos (sem tenant ou user)
        const { count: orphanRecords } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .not('conversation_context->session_id', 'is', null)
            .or('tenant_id.is.null,user_id.is.null');
            
        console.log(`⚠️ Registros órfãos (sem tenant/user): ${orphanRecords}`);
        
        // 8. Amostra dos primeiros session_ids
        console.log(`\n📋 Primeiras 10 sessões únicas:`);
        const firstTenSessions = Array.from(uniqueSessions).slice(0, 10);
        firstTenSessions.forEach((sessionId, index) => {
            console.log(`   ${index + 1}. ${sessionId} (${sessionStats[sessionId]} mensagens)`);
        });
        
        return {
            totalRecords,
            withSessionId,
            uniqueSessions: uniqueSessions.size,
            orphanRecords,
            sessionStats
        };
        
    } catch (error) {
        console.error('❌ Erro no debug:', error.message);
        throw error;
    }
}

async function main() {
    try {
        console.log('🔍 DEBUG: Contagem de Conversas');
        console.log('='.repeat(40));
        
        const stats = await debugConversationCount();
        
        console.log('\n📋 RESUMO DO DEBUG');
        console.log('='.repeat(30));
        console.log(`Total de registros: ${stats.totalRecords}`);
        console.log(`Com session_id: ${stats.withSessionId}`);
        console.log(`Sessões únicas: ${stats.uniqueSessions}`);
        console.log(`Registros órfãos: ${stats.orphanRecords}`);
        console.log(`Esperado: 1041`);
        console.log(`Diferença: ${1041 - stats.uniqueSessions}`);
        
        if (stats.uniqueSessions === 1041) {
            console.log('\n✅ Contagem está correta! Problema deve estar no script de export.');
        } else {
            console.log('\n⚠️ Discrepância detectada na base de dados.');
        }
        
    } catch (error) {
        console.error('\n💥 ERRO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { debugConversationCount };