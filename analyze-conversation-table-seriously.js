/**
 * ANÁLISE SÉRIA da tabela conversation_history
 * Vou examinar a estrutura real e entender como as conversas são armazenadas
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function analyzeConversationTableSeriously() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('🔍 ANÁLISE SÉRIA: Tabela conversation_history');
    console.log('==============================================\n');
    
    try {
        // 1. ESTRUTURA COMPLETA DA TABELA
        console.log('📋 PASSO 1: Estrutura completa da tabela');
        console.log('=========================================');
        
        const { data: sample } = await client
            .from('conversation_history')
            .select('*')
            .limit(1);
            
        if (sample && sample.length > 0) {
            const columns = Object.keys(sample[0]);
            console.log('Colunas disponíveis:');
            columns.forEach(col => console.log(`   - ${col}: ${typeof sample[0][col]} = ${JSON.stringify(sample[0][col])}`));
        }
        
        // 2. VERIFICAR SE EXISTE CONVERSATION_ID OU SIMILAR
        console.log('\n🔍 PASSO 2: Verificando campos de agrupamento de conversas');
        console.log('=========================================================');
        
        const { data: allSample } = await client
            .from('conversation_history') 
            .select('id, user_id, tenant_id, created_at, content, is_from_user, conversation_context')
            .limit(20);
            
        console.log('Sample de 20 registros para análise:');
        allSample?.forEach((record, i) => {
            console.log(`\n${i+1}. ID: ${record.id}`);
            console.log(`   user_id: ${record.user_id?.substring(0,8)}...`);
            console.log(`   tenant_id: ${record.tenant_id?.substring(0,8)}...`);
            console.log(`   created_at: ${new Date(record.created_at).toLocaleString('pt-BR')}`);
            console.log(`   is_from_user: ${record.is_from_user}`);
            console.log(`   content: ${record.content?.substring(0,50)}...`);
            console.log(`   conversation_context: ${JSON.stringify(record.conversation_context)?.substring(0,50)}...`);
        });
        
        // 3. ANÁLISE TEMPORAL POR USER_ID
        console.log('\n⏰ PASSO 3: Análise temporal por user_id (1 tenant)');
        console.log('===================================================');
        
        const { data: tenants } = await client
            .from('tenants')
            .select('id, business_name')
            .limit(1);
            
        const testTenant = tenants[0];
        console.log(`Analisando tenant: ${testTenant.business_name}`);
        
        const { data: conversations } = await client
            .from('conversation_history')
            .select('user_id, created_at, is_from_user, content')
            .eq('tenant_id', testTenant.id)
            .order('created_at', { ascending: true })
            .limit(100);
            
        // Agrupar por user_id
        const userMessages = {};
        conversations?.forEach(conv => {
            if (!userMessages[conv.user_id]) {
                userMessages[conv.user_id] = [];
            }
            userMessages[conv.user_id].push(conv);
        });
        
        console.log(`\n👥 Usuários encontrados: ${Object.keys(userMessages).length}`);
        
        // Analisar padrão de cada usuário
        Object.entries(userMessages).slice(0, 3).forEach(([userId, messages]) => {
            console.log(`\n📱 USER: ${userId.substring(0,8)}... (${messages.length} mensagens)`);
            
            // Analisar sequência temporal
            let conversationSessions = [];
            let currentSession = [messages[0]];
            
            for (let i = 1; i < messages.length; i++) {
                const timeDiff = (new Date(messages[i].created_at) - new Date(messages[i-1].created_at)) / (1000 * 60);
                
                if (timeDiff > 30) { // Gap > 30 min = nova sessão
                    conversationSessions.push(currentSession);
                    currentSession = [messages[i]];
                } else {
                    currentSession.push(messages[i]);
                }
            }
            conversationSessions.push(currentSession);
            
            console.log(`   📊 Sessões identificadas: ${conversationSessions.length}`);
            console.log(`   ⏱️  Tempo total: ${((new Date(messages[messages.length-1].created_at) - new Date(messages[0].created_at)) / (1000 * 60 * 60)).toFixed(1)}h`);
            
            conversationSessions.slice(0, 3).forEach((session, j) => {
                const duration = session.length > 1 
                    ? (new Date(session[session.length-1].created_at) - new Date(session[0].created_at)) / (1000 * 60)
                    : 1;
                console.log(`      Sessão ${j+1}: ${session.length} mensagens, ${duration.toFixed(1)} min`);
                console.log(`         ${new Date(session[0].created_at).toLocaleString('pt-BR')} até ${new Date(session[session.length-1].created_at).toLocaleString('pt-BR')}`);
            });
        });
        
        // 4. VERIFICAR SE HÁ CAMPO conversation_id ESCONDIDO
        console.log('\n🔍 PASSO 4: Verificando todos os campos possíveis');
        console.log('================================================');
        
        // Tentar diferentes possibilidades de campos
        const possibleFields = [
            'conversation_id', 'session_id', 'thread_id', 'group_id', 
            'chat_id', 'message_thread', 'conversation_thread'
        ];
        
        for (const field of possibleFields) {
            try {
                const { data: test } = await client
                    .from('conversation_history')
                    .select(field)
                    .limit(1);
                    
                if (test && test.length > 0 && test[0][field] !== undefined) {
                    console.log(`✅ Campo encontrado: ${field} = ${test[0][field]}`);
                }
            } catch (error) {
                console.log(`❌ Campo NÃO existe: ${field}`);
            }
        }
        
        // 5. CONCLUSÃO SOBRE A ESTRUTURA
        console.log('\n📋 PASSO 5: Análise da estrutura real');
        console.log('====================================');
        
        const totalMessages = await client
            .from('conversation_history')
            .select('count(*)')
            .eq('tenant_id', testTenant.id);
            
        const uniqueUsers = await client
            .from('conversation_history') 
            .select('user_id')
            .eq('tenant_id', testTenant.id);
            
        const uniqueUserIds = new Set(uniqueUsers.data?.map(u => u.user_id) || []);
        
        console.log(`📊 Total de mensagens no tenant: ${totalMessages.data?.[0]?.count || 0}`);
        console.log(`👥 Usuários únicos: ${uniqueUserIds.size}`);
        console.log(`💬 Mensagens por usuário (média): ${(totalMessages.data?.[0]?.count || 0) / uniqueUserIds.size}`);
        
        console.log('\n🎯 CONCLUSÃO:');
        console.log('=============');
        console.log('1. NÃO existe campo conversation_id direto');
        console.log('2. Cada registro = 1 mensagem individual');
        console.log('3. Para contar CONVERSAS, preciso agrupar por:');
        console.log('   - user_id + tenant_id');  
        console.log('   - Definir sessões por gap temporal (ex: 30 min)');
        console.log('4. O número correto de CONVERSAS será menor que mensagens');
        
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
        console.log('Stack:', error.stack?.split('\n').slice(0,5).join('\n'));
    }
}

analyzeConversationTableSeriously().catch(console.error);