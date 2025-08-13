const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getAllOutcomes() {
  console.log('🔍 BUSCA COMPLETA - TODOS OS CONVERSATION_OUTCOME');
  console.log('='.repeat(60));
  
  // Buscar TODOS os registros, não apenas uma amostra
  const { data: allOutcomes, error } = await supabase
    .from('conversation_history')
    .select('conversation_outcome');
  
  if (error) {
    console.error('❌ Erro:', error);
    return;
  }
  
  if (allOutcomes) {
    console.log(`📊 Total registros analisados: ${allOutcomes.length}`);
    
    // Contar TODOS os valores únicos
    const outcomeCount = {};
    const nullCount = allOutcomes.filter(row => row.conversation_outcome === null).length;
    
    allOutcomes.forEach(row => {
      if (row.conversation_outcome !== null) {
        const outcome = row.conversation_outcome;
        outcomeCount[outcome] = (outcomeCount[outcome] || 0) + 1;
      }
    });
    
    console.log(`📊 Registros com outcome: ${allOutcomes.length - nullCount}`);
    console.log(`📊 Registros NULL: ${nullCount}`);
    console.log('');
    
    console.log('🏷️ TODOS OS CONVERSATION_OUTCOME ENCONTRADOS:');
    Object.entries(outcomeCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([outcome, count], index) => {
        const percentage = (count / (allOutcomes.length - nullCount) * 100).toFixed(1);
        console.log(`   ${index + 1}. "${outcome}": ${count} (${percentage}%)`);
      });
    
    console.log('');
    console.log(`✅ TOTAL DE ENUMS DIFERENTES: ${Object.keys(outcomeCount).length}`);
    
    if (Object.keys(outcomeCount).length < 16) {
      console.log('');
      console.log('⚠️ ATENÇÃO: Encontrados apenas ' + Object.keys(outcomeCount).length + ' ENUMs, mas deveriam ser 16.');
      console.log('   Possíveis razões:');
      console.log('   - Alguns ENUMs não têm dados ainda');
      console.log('   - Dados de teste não cobrem todos os cenários');
      console.log('   - Preciso verificar definição do ENUM no schema');
    }
  }
}

getAllOutcomes().catch(console.error);