/**
 * Debug completo para verificar TODAS as conversas da base
 * Processamento paginado para contornar limite do Supabase
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getAllConversationSessions() {
    console.log('🔍 Buscando TODAS as conversas da base com paginação...\n');
    
    try {
        let allSessions = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
            const { data: sessions, error } = await supabase
                .from('conversation_history')
                .select('conversation_context')
                .not('conversation_context->session_id', 'is', null)
                .range(page * pageSize, (page + 1) * pageSize - 1);
                
            if (error) throw error;
            
            if (!sessions || sessions.length === 0) {
                hasMore = false;
            } else {
                allSessions = allSessions.concat(sessions);
                console.log(`📄 Página ${page + 1}: ${sessions.length} registros (Total: ${allSessions.length})`);
                
                if (sessions.length < pageSize) {
                    hasMore = false;
                }
                page++;
            }
        }
        
        console.log(`\n📊 Total de registros processados: ${allSessions.length}`);
        
        // Contar sessões únicas
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
        
        // Estatísticas detalhadas
        const messageCounts = Object.values(sessionStats);
        const avgMessages = messageCounts.reduce((a, b) => a + b, 0) / messageCounts.length;
        const maxMessages = Math.max(...messageCounts);
        const minMessages = Math.min(...messageCounts);
        
        console.log(`\n📈 Estatísticas completas:`);
        console.log(`   Total de mensagens: ${allSessions.length}`);
        console.log(`   Conversas únicas: ${uniqueSessions.size}`);
        console.log(`   Média de mensagens por conversa: ${avgMessages.toFixed(2)}`);
        console.log(`   Máximo de mensagens: ${maxMessages}`);
        console.log(`   Mínimo de mensagens: ${minMessages}`);
        
        // Distribuição de tamanhos de conversa
        const distribution = {};
        messageCounts.forEach(count => {
            distribution[count] = (distribution[count] || 0) + 1;
        });
        
        console.log(`\n📊 Distribuição de tamanhos de conversa:`);
        Object.keys(distribution)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .forEach(size => {
                console.log(`   ${size} mensagens: ${distribution[size]} conversas`);
            });
        
        return {
            totalMessages: allSessions.length,
            uniqueConversations: uniqueSessions.size,
            sessionStats,
            uniqueSessionIds: Array.from(uniqueSessions)
        };
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        throw error;
    }
}

async function analyzeDiscrepancy() {
    console.log('\n🔍 Analisando discrepância com expectativa de 1041...\n');
    
    try {
        // Verificar se há outros campos que possam identificar conversas
        const { data: sample, error } = await supabase
            .from('conversation_history')
            .select('*')
            .limit(5);
            
        if (error) throw error;
        
        console.log('📋 Amostra dos campos disponíveis:');
        if (sample.length > 0) {
            const fields = Object.keys(sample[0]);
            console.log(`   Campos: ${fields.join(', ')}`);
            
            // Verificar se há outros identificadores de conversa
            const firstRecord = sample[0];
            console.log('\n📄 Primeiro registro de amostra:');
            console.log(`   ID: ${firstRecord.id}`);
            console.log(`   Tenant ID: ${firstRecord.tenant_id}`);
            console.log(`   User ID: ${firstRecord.user_id}`);
            console.log(`   Session ID: ${firstRecord.conversation_context?.session_id}`);
            console.log(`   Created At: ${firstRecord.created_at}`);
        }
        
        // Verificar se há registros sem session_id que deveriam ter
        const { count: withoutSessionId } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .is('conversation_context->session_id', null);
            
        console.log(`\n⚠️ Registros SEM session_id: ${withoutSessionId}`);
        
        if (withoutSessionId > 0) {
            console.log('💡 Pode haver conversas sem session_id que precisam ser incluídas!');
        }
        
    } catch (error) {
        console.error('❌ Erro na análise:', error.message);
    }
}

async function main() {
    try {
        console.log('🔍 DEBUG COMPLETO: Contagem de Conversas');
        console.log('='.repeat(50));
        
        const results = await getAllConversationSessions();
        await analyzeDiscrepancy();
        
        console.log('\n📋 CONCLUSÃO DO DEBUG');
        console.log('='.repeat(30));
        console.log(`Total de mensagens na base: ${results.totalMessages}`);
        console.log(`Conversas únicas com session_id: ${results.uniqueConversations}`);
        console.log(`Expectativa original: 1041`);
        console.log(`Diferença: ${1041 - results.uniqueConversations}`);
        
        if (results.uniqueConversations < 1041) {
            console.log('\n💡 POSSÍVEIS CAUSAS:');
            console.log('   1. Expectativa de 1041 pode estar incorreta');
            console.log('   2. Há conversas sem session_id que precisam ser incluídas');
            console.log('   3. Dados foram limpos/removidos da base');
            console.log('   4. Critério de contagem original era diferente');
        }
        
        console.log(`\n✅ Contagem real na base: ${results.uniqueConversations} conversas`);
        console.log('📝 Esta é a contagem correta para o CSV!');
        
    } catch (error) {
        console.error('\n💥 ERRO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { getAllConversationSessions };