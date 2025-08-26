#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';

async function validateMetrics() {
  console.log('🔍 VALIDANDO MÉTRICAS NO BANCO DE DADOS');
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Buscar as últimas mensagens de teste
    const { data, error } = await supabase
      .from('conversation_history')
      .select('is_from_user, tokens_used, api_cost_usd, confidence_score, content, created_at')
      .ilike('content', '%Teste métricas%')
      .order('created_at', { ascending: false })
      .limit(6);
    
    if (error) {
      console.error('❌ Erro na consulta:', error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log('⚠️ Nenhuma mensagem de teste encontrada');
      return;
    }
    
    console.log('\n📊 RESULTADOS:');
    console.log('======================================');
    
    data.forEach((row, i) => {
      console.log(`${i + 1}. ${row.is_from_user ? '👤 USUÁRIO' : '🤖 IA'}`);
      console.log(`   Content: ${row.content.substring(0, 60)}...`);
      console.log(`   Tokens: ${row.tokens_used || 'NULL'}`);
      console.log(`   Cost: ${row.api_cost_usd || 'NULL'}`);
      console.log(`   Confidence: ${row.confidence_score || 'NULL'}`);
      console.log(`   Created: ${new Date(row.created_at).toLocaleString()}`);
      console.log('   ---');
    });
    
    // Análise
    const userMessages = data.filter(row => row.is_from_user);
    const aiMessages = data.filter(row => !row.is_from_user);
    
    console.log('\n🧪 ANÁLISE:');
    console.log('======================================');
    
    const userWithMetrics = userMessages.filter(row => row.tokens_used != null || row.api_cost_usd != null);
    const aiWithMetrics = aiMessages.filter(row => row.tokens_used != null || row.api_cost_usd != null);
    
    console.log(`👤 Mensagens do usuário: ${userMessages.length}`);
    console.log(`   - Com métricas LLM: ${userWithMetrics.length} ${userWithMetrics.length > 0 ? '❌ PROBLEMA!' : '✅'}`);
    
    console.log(`🤖 Mensagens da IA: ${aiMessages.length}`);
    console.log(`   - Com métricas LLM: ${aiWithMetrics.length} ${aiWithMetrics.length === aiMessages.length ? '✅' : '❌ PROBLEMA!'}`);
    
    if (userWithMetrics.length > 0) {
      console.log('\n❌ PROBLEMA CONFIRMADO!');
      console.log('Métricas LLM estão sendo aplicadas em mensagens do usuário.');
      console.log('Mensagens do usuário com métricas:');
      userWithMetrics.forEach(msg => {
        console.log(`- "${msg.content.substring(0, 40)}..." (tokens: ${msg.tokens_used})`);
      });
    } else {
      console.log('\n✅ CORREÇÃO FUNCIONANDO!');
      console.log('Métricas LLM aplicadas APENAS nas respostas da IA.');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

validateMetrics();