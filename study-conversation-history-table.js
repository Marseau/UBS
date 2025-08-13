/**
 * STUDY CONVERSATION_HISTORY TABLE
 * Estudar estrutura da tabela e campo conversation_context
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function studyConversationHistoryTable() {
  console.log('🔍 ESTUDANDO TABELA CONVERSATION_HISTORY');
  console.log('='.repeat(60));

  try {
    // 1. ESTRUTURA DA TABELA
    console.log('\n📊 1. PRIMEIROS REGISTROS DA TABELA:');
    const { data: sampleRecords, error } = await supabase
      .from('conversation_history')
      .select('*')
      .limit(5)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('❌ Erro:', error);
      return;
    }

    sampleRecords?.forEach((record, i) => {
      console.log(`\n📝 REGISTRO ${i + 1}:`);
      Object.entries(record).forEach(([key, value]) => {
        if (key === 'conversation_context' && value) {
          console.log(`   ${key}: ${JSON.stringify(value, null, 4)}`);
        } else {
          console.log(`   ${key}: ${value}`);
        }
      });
      console.log('   ' + '='.repeat(50));
    });

    // 2. ANÁLISE DO CONVERSATION_CONTEXT
    console.log('\n🔍 2. ANÁLISE DETALHADA DO CONVERSATION_CONTEXT:');
    
    const { data: contextRecords } = await supabase
      .from('conversation_history')
      .select('conversation_context, phone_number, tenant_id, conversation_outcome')
      .not('conversation_context', 'is', null)
      .limit(10);

    console.log(`\n✅ Encontrados ${contextRecords?.length || 0} registros com conversation_context`);

    contextRecords?.forEach((record, i) => {
      console.log(`\n📱 CONTEXT RECORD ${i + 1}:`);
      console.log(`   Phone: ${record.phone_number}`);
      console.log(`   Tenant: ${record.tenant_id}`);
      console.log(`   Outcome: ${record.conversation_outcome}`);
      
      if (record.conversation_context) {
        console.log(`   Context Keys: [${Object.keys(record.conversation_context).join(', ')}]`);
        
        // Campos importantes no context
        const ctx = record.conversation_context;
        if (ctx.session_id) console.log(`   Session ID: ${ctx.session_id}`);
        if (ctx.conversation_id) console.log(`   Conversation ID: ${ctx.conversation_id}`);
        if (ctx.message_count) console.log(`   Message Count: ${ctx.message_count}`);
        if (ctx.conversation_started) console.log(`   Started: ${ctx.conversation_started}`);
        if (ctx.conversation_ended) console.log(`   Ended: ${ctx.conversation_ended}`);
        if (ctx.is_conversation_start) console.log(`   Is Start: ${ctx.is_conversation_start}`);
        if (ctx.is_conversation_end) console.log(`   Is End: ${ctx.is_conversation_end}`);
      }
    });

    // 3. PADRÕES DE CONVERSAÇÃO
    console.log('\n📊 3. PADRÕES DE CONVERSAÇÃO:');
    
    // Contar por phone_number
    const { data: phonePatterns } = await supabase
      .from('conversation_history')
      .select('phone_number, conversation_outcome, conversation_context')
      .eq('tenant_id', contextRecords?.[0]?.tenant_id || '')
      .not('conversation_outcome', 'is', null)
      .limit(20);

    if (phonePatterns && phonePatterns.length > 0) {
      const phoneGroups = {};
      phonePatterns.forEach(record => {
        const phone = record.phone_number;
        if (!phoneGroups[phone]) {
          phoneGroups[phone] = [];
        }
        phoneGroups[phone].push(record);
      });

      console.log(`\n📱 AGRUPAMENTO POR TELEFONE:`);
      Object.entries(phoneGroups).slice(0, 3).forEach(([phone, records]) => {
        console.log(`\n   📞 ${phone}: ${records.length} registros`);
        records.forEach((record, i) => {
          const ctx = record.conversation_context;
          console.log(`      ${i + 1}. Outcome: ${record.conversation_outcome} | Session: ${ctx?.session_id || 'N/A'}`);
        });
      });
    }

    // 4. SESSION_ID ANALYSIS
    console.log('\n🔍 4. ANÁLISE DE SESSION_ID:');
    
    const { data: sessionRecords } = await supabase
      .from('conversation_history')
      .select('conversation_context, conversation_outcome, created_at')
      .not('conversation_context', 'is', null)
      .limit(20);

    const sessionGroups = {};
    sessionRecords?.forEach(record => {
      const sessionId = record.conversation_context?.session_id;
      if (sessionId) {
        if (!sessionGroups[sessionId]) {
          sessionGroups[sessionId] = [];
        }
        sessionGroups[sessionId].push(record);
      }
    });

    console.log(`\n🎯 SESSIONS ENCONTRADAS: ${Object.keys(sessionGroups).length}`);
    Object.entries(sessionGroups).slice(0, 3).forEach(([sessionId, records]) => {
      console.log(`\n   🎯 Session: ${sessionId}`);
      console.log(`   📊 Registros: ${records.length}`);
      console.log(`   🎯 Outcomes: [${records.map(r => r.conversation_outcome).join(', ')}]`);
    });

    // 5. HIPÓTESES DE CONTAGEM
    console.log('\n💡 5. HIPÓTESES PARA CONTAGEM DE CONVERSAS:');
    console.log('\n   A) 1 CONVERSATION_OUTCOME = 1 CONVERSA');
    const { data: outcomeCount } = await supabase
      .from('conversation_history')
      .select('conversation_outcome')
      .not('conversation_outcome', 'is', null)
      .eq('tenant_id', contextRecords?.[0]?.tenant_id || '');
    console.log(`      Total: ${outcomeCount?.length || 0} conversas`);

    console.log('\n   B) 1 SESSION_ID = 1 CONVERSA');
    const uniqueSessions = new Set();
    sessionRecords?.forEach(record => {
      const sessionId = record.conversation_context?.session_id;
      if (sessionId) uniqueSessions.add(sessionId);
    });
    console.log(`      Total: ${uniqueSessions.size} conversas únicas`);

    console.log('\n   C) 1 PHONE_NUMBER + PERÍODO = 1 CONVERSA');
    const uniquePhones = new Set();
    phonePatterns?.forEach(record => {
      if (record.phone_number) uniquePhones.add(record.phone_number);
    });
    console.log(`      Total: ${uniquePhones.size} conversas por telefone`);

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🔍 ESTUDO DA TABELA CONCLUÍDO');
}

studyConversationHistoryTable();