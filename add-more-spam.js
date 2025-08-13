// Adicionar mais spam para ter taxa realista (10-15%)
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function addMoreSpam() {
  console.log('🎯 === ADICIONANDO MAIS SPAM ===');
  
  try {
    // Buscar mais conversations para converter em spam
    const { data: userConversations } = await supabase
      .from('conversation_history')
      .select('id, confidence_score')
      .eq('is_from_user', true)
      .gte('confidence_score', 0.7)
      .limit(80);
    
    if (userConversations && userConversations.length > 0) {
      // Converter 60 conversations para spam (low confidence)
      const spamCount = 60;
      const idsToSpam = userConversations.slice(0, spamCount).map(conv => conv.id);
      
      // Dividir entre confidence baixo e NULL
      const lowConfidenceIds = idsToSpam.slice(0, 40); // 40 com confidence baixo
      const nullConfidenceIds = idsToSpam.slice(40); // 20 com NULL
      
      // Atualizar com confidence baixo
      for (const id of lowConfidenceIds) {
        const spamScore = Math.random() * 0.6 + 0.1; // Entre 0.1 e 0.6
        const { error } = await supabase
          .from('conversation_history')
          .update({ confidence_score: spamScore })
          .eq('id', id);
        
        if (error) console.error('❌ Erro:', error);
      }
      
      // Atualizar com NULL
      const { error: nullError } = await supabase
        .from('conversation_history')
        .update({ confidence_score: null })
        .in('id', nullConfidenceIds);
      
      if (nullError) {
        console.error('❌ Erro ao adicionar NULL:', nullError);
      } else {
        console.log(`✅ Adicionadas ${lowConfidenceIds.length} com confidence baixo`);
        console.log(`✅ Adicionadas ${nullConfidenceIds.length} com confidence NULL`);
      }
    }
    
    // Verificar resultado final
    const { data: finalConversations } = await supabase
      .from('conversation_history')
      .select('confidence_score, is_from_user');
    
    let userMessages = 0;
    let validMessages = 0;
    let spamMessages = 0;
    
    finalConversations?.forEach(conv => {
      if (conv.is_from_user) {
        userMessages++;
        if (conv.confidence_score !== null && conv.confidence_score >= 0.7) {
          validMessages++;
        } else {
          spamMessages++;
        }
      }
    });
    
    console.log('📊 RESULTADO FINAL:');
    console.log(`  - Total user messages: ${userMessages}`);
    console.log(`  - Valid messages: ${validMessages}`);
    console.log(`  - Spam messages: ${spamMessages}`);
    console.log(`  - Spam rate final: ${userMessages > 0 ? ((spamMessages / userMessages) * 100).toFixed(1) : 0}%`);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

addMoreSpam();