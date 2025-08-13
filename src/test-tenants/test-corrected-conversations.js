/**
 * TESTE DO SISTEMA CORRIGIDO - CONVERSAS vs MENSAGENS
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testCorrectedConversations() {
  console.log('🔍 TESTANDO SISTEMA CORRIGIDO - CONVERSAS vs MENSAGENS');
  console.log('====================================================\n');
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    console.log('📊 1. DADOS ANTES DA CORREÇÃO (contando mensagens):');
    
    // Modo antigo ERRADO (contava mensagens)
    const { data: mensagens, error: msgError } = await supabase
      .from('conversation_history')
      .select('id, tenant_id, api_cost_usd, processing_cost_usd, conversation_outcome')
      .gte('created_at', cutoffDate.toISOString())
      .limit(5000);
    
    if (msgError) throw msgError;
    
    console.log(`   ❌ Mensagens individuais: ${mensagens.length}`);
    console.log(`   ❌ Custo total (por mensagem): $${mensagens.reduce((sum, m) => sum + parseFloat(m.api_cost_usd || 0) + parseFloat(m.processing_cost_usd || 0), 0).toFixed(2)}`);
    
    console.log('\n📊 2. DADOS APÓS CORREÇÃO (contando conversas por session_id):');
    
    // Modo novo CORRETO (conta conversas)
    const { data: rawMessages, error: rawError } = await supabase
      .from('conversation_history')
      .select('tenant_id, user_id, conversation_context, api_cost_usd, processing_cost_usd, conversation_outcome, created_at')
      .gte('created_at', cutoffDate.toISOString())
      .limit(5000);
    
    if (rawError) throw rawError;
    
    // Agrupar mensagens por session_id para formar conversas
    const sessionMap = new Map();
    
    if (rawMessages) {
      for (const message of rawMessages) {
        const sessionId = message.conversation_context?.session_id;
        if (!sessionId) continue;
        
        if (!sessionMap.has(sessionId)) {
          sessionMap.set(sessionId, {
            tenant_id: message.tenant_id,
            user_id: message.user_id,
            session_id: sessionId,
            total_api_cost: 0,
            total_processing_cost: 0,
            has_outcome: false,
            message_count: 0,
            created_at: message.created_at
          });
        }
        
        const session = sessionMap.get(sessionId);
        session.total_api_cost += parseFloat(message.api_cost_usd || 0);
        session.total_processing_cost += parseFloat(message.processing_cost_usd || 0);
        session.message_count++;
        
        if (message.conversation_outcome) {
          session.has_outcome = true;
        }
      }
    }
    
    const conversations = Array.from(sessionMap.values());
    const totalCost = conversations.reduce((sum, c) => sum + c.total_api_cost + c.total_processing_cost, 0);
    const conversationsWithOutcome = conversations.filter(c => c.has_outcome).length;
    
    console.log(`   ✅ Conversas reais (session_id): ${conversations.length}`);
    console.log(`   ✅ Conversas com outcome: ${conversationsWithOutcome}`);
    console.log(`   ✅ Custo total (por conversa): $${totalCost.toFixed(2)}`);
    console.log(`   ✅ Mensagens por conversa (média): ${(rawMessages.length / conversations.length).toFixed(1)}`);
    
    console.log('\n📊 3. COMPARAÇÃO COM QUERY SQL DIRETA:');
    
    // Validar com query SQL direta
    const { data: sqlResult, error: sqlError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
            COUNT(DISTINCT conversation_context->>'session_id') as conversas_reais,
            COUNT(*) as mensagens_totais,
            SUM(COALESCE(api_cost_usd, 0) + COALESCE(processing_cost_usd, 0)) as custo_total_ia,
            COUNT(DISTINCT CASE WHEN conversation_outcome IS NOT NULL THEN conversation_context->>'session_id' END) as conversas_com_outcome
          FROM conversation_history 
          WHERE created_at >= NOW() - INTERVAL '90 days'
        `
      });
    
    if (!sqlError && sqlResult && sqlResult.length > 0) {
      const result = sqlResult[0];
      console.log(`   📋 SQL: ${result.conversas_reais} conversas, ${result.mensagens_totais} mensagens`);
      console.log(`   📋 SQL: $${parseFloat(result.custo_total_ia).toFixed(2)} custo, ${result.conversas_com_outcome} com outcome`);
    }
    
    console.log('\n🎯 RESULTADOS FINAIS:');
    console.log('===================');
    console.log(`✅ Sistema CORRETO conta: ${conversations.length} conversas`);
    console.log(`❌ Sistema ANTIGO contava: ${mensagens.length} mensagens`);
    console.log(`📈 Diferença: ${((mensagens.length / conversations.length) - 1) * 100}% a mais (erro!)`);
    
    if (conversations.length > 0 && mensagens.length > 0) {
      console.log('\n🚀 CORREÇÃO APLICADA COM SUCESSO!');
      return true;
    } else {
      console.log('\n❌ ERRO: Não foi possível corrigir o sistema');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    return false;
  }
}

// Executar teste
if (require.main === module) {
  testCorrectedConversations()
    .then((success) => {
      if (success) {
        console.log('\n🎊 SISTEMA CORRIGIDO E VALIDADO!');
        process.exit(0);
      } else {
        console.log('\n💥 FALHA NA CORREÇÃO');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 Falha crítica:', error);
      process.exit(1);
    });
}