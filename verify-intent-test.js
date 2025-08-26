#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyIntentDetection() {
  console.log('🔍 Verificando persistência do campo intent_detected...');
  
  try {
    // Buscar mensagens recentes do último teste
    const { data, error } = await supabase
      .from('conversation_history')
      .select('id, content, is_from_user, intent_detected, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('❌ Erro ao consultar banco:', error);
      return;
    }
    
    console.log(`📊 Encontradas ${data.length} mensagens recentes:`);
    
    data.forEach((row, index) => {
      const userType = row.is_from_user ? 'USER' : 'AI';
      const content = row.content.substring(0, 50) + (row.content.length > 50 ? '...' : '');
      const intent = row.intent_detected || 'null';
      
      console.log(`${index + 1}. ${userType}: "${content}" | Intent: ${intent}`);
    });
    
    const withIntent = data.filter(row => row.intent_detected).length;
    const withoutIntent = data.length - withIntent;
    
    console.log(`\n📈 Estatísticas:`);
    console.log(`  - Com intent_detected: ${withIntent}`);
    console.log(`  - Sem intent_detected: ${withoutIntent}`);
    
    if (withIntent > 0) {
      console.log('\n✅ Campo intent_detected está sendo persistido corretamente!');
    } else {
      console.log('\n❌ Campo intent_detected não encontrado nos dados recentes.');
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

verifyIntentDetection();