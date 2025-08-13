/**
 * VALIDAÇÃO CORRETA DE CONVERSAS
 * Testar diferentes métodos de contagem
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function testarMetodosContagem() {
    console.log('🧪 TESTANDO MÉTODOS DE CONTAGEM DE CONVERSAS:');
    console.log('='.repeat(60));

    const tenantId = '33b8c488-5aa9-4891-b335-701d10296681'; // Bella Vista
    
    // Método 1: Contar mensagens totais
    const { count: totalMensagens } = await supabase
        .from('conversation_history')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
    
    console.log('📱 Total mensagens:', totalMensagens);

    // Método 2: Buscar todos os conversation_context
    const { data: allContexts } = await supabase
        .from('conversation_history')
        .select('conversation_context')
        .eq('tenant_id', tenantId);
    
    console.log('📱 Mensagens com context:', allContexts?.length || 0);

    // Método 3: Extrair session_ids únicos
    const sessionIds = new Set();
    allContexts?.forEach(row => {
        const sessionId = row.conversation_context?.session_id;
        if (sessionId) {
            sessionIds.add(sessionId);
        }
    });
    
    console.log('🔄 Sessions únicas (método 3):', sessionIds.size);

    // Método 4: Query PostgreSQL com JSON
    const { data: sessionQuery, error } = await supabase.rpc('get_unique_sessions', {
        tenant_uuid: tenantId
    });
    
    if (error) {
        console.log('❌ Query RPC falhou:', error.message);
        
        // Método 5: Query SQL direta se RPC não existir
        console.log('🔍 Testando query SQL alternativa...');
        
        const { data: directQuery } = await supabase
            .from('conversation_history')
            .select('conversation_context->>session_id as session_id')
            .eq('tenant_id', tenantId)
            .not('conversation_context->>session_id', 'is', null);
        
        if (directQuery) {
            const uniqueSessions = new Set(directQuery.map(r => r.session_id));
            console.log('🔄 Sessions únicas (query direta):', uniqueSessions.size);
        }
    } else {
        console.log('🔄 Sessions únicas (RPC):', sessionQuery?.length || 0);
    }

    // Método 6: Analisar amostra de dados
    console.log('\\n📋 AMOSTRA DE DADOS:');
    const { data: amostra } = await supabase
        .from('conversation_history')
        .select('conversation_context, created_at, is_from_user')
        .eq('tenant_id', tenantId)
        .limit(5);
    
    amostra?.forEach((msg, i) => {
        console.log(`${i+1}. Session: ${msg.conversation_context?.session_id?.substring(0, 8) || 'NULL'}, User: ${msg.is_from_user}, Date: ${msg.created_at?.substring(0, 10)}`);
    });

    // Método 7: Verificar se existem mensagens sem session_id
    const { count: semSessionId } = await supabase
        .from('conversation_history')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('conversation_context->>session_id', null);
    
    console.log('⚠️ Mensagens sem session_id:', semSessionId || 0);

    // Método 8: Contar por user_id como proxy
    const { data: uniqueUsers } = await supabase
        .from('conversation_history')
        .select('user_id')
        .eq('tenant_id', tenantId);
    
    const userIds = new Set(uniqueUsers?.map(u => u.user_id).filter(Boolean));
    console.log('👥 Users únicos:', userIds.size);

    return {
        totalMensagens,
        sessionsUnicas: sessionIds.size,
        usersUnicos: userIds.size,
        semSessionId: semSessionId || 0
    };
}

async function compararTodosTenants() {
    console.log('\\n🏢 COMPARANDO TODOS OS TENANTS:');
    console.log('='.repeat(60));

    const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('status', 'active');

    for (const tenant of tenants.slice(0, 3)) { // Primeiros 3 para teste
        console.log(`\\n📊 ${tenant.name}:`);
        const stats = await testarMetodosContagem();
        console.log(`   Mensagens: ${stats.totalMensagens}, Sessions: ${stats.sessionsUnicas}, Users: ${stats.usersUnicos}`);
    }
}

testarMetodosContagem()
    .then(() => compararTodosTenants())
    .catch(console.error);