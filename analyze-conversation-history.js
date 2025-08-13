const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function analyzeConversationHistory() {
  console.log('🔍 ANÁLISE COMPLETA DA TABELA CONVERSATION_HISTORY');
  console.log('='.repeat(80));
  
  try {
    // 1. Estrutura da tabela
    console.log('\n📊 1. ESTRUTURA DA TABELA:');
    const { data: sample, error } = await supabase
      .from('conversation_history')
      .select('*')
      .limit(3);
    
    if (error) {
      console.log('❌ Erro:', error.message);
      return;
    }
    
    if (sample && sample[0]) {
      const fields = Object.keys(sample[0]);
      console.log(`   Total de campos: ${fields.length}`);
      console.log('   Campos disponíveis:');
      fields.forEach((field, i) => {
        const value = sample[0][field];
        const type = value === null ? 'null' : typeof value;
        let displayValue = value;
        if (type === 'object' && value) {
          displayValue = JSON.stringify(value).substring(0, 50) + '...';
        }
        console.log(`     ${i+1}. ${field} (${type}): ${displayValue}`);
      });
    }
    
    // 2. Contagem total
    const { count } = await supabase
      .from('conversation_history')
      .select('*', { count: 'exact', head: true });
      
    console.log(`\n📊 2. TOTAL DE REGISTROS: ${count}`);
    
    // 3. Análise de campos especiais
    console.log('\n🔍 3. ANÁLISE DE CAMPOS ESPECIAIS:');
    
    // conversation_outcome
    const { data: outcomes } = await supabase
      .from('conversation_history')
      .select('conversation_outcome')
      .not('conversation_outcome', 'is', null)
      .limit(100);
      
    if (outcomes) {
      const outcomeTypes = {};
      outcomes.forEach(row => {
        outcomeTypes[row.conversation_outcome] = (outcomeTypes[row.conversation_outcome] || 0) + 1;
      });
      console.log(`   conversation_outcome (${outcomes.length} registros não-nulos):`);
      Object.entries(outcomeTypes).forEach(([outcome, count]) => {
        console.log(`     - ${outcome}: ${count}`);
      });
    }
    
    // intent_detected
    const { data: intents } = await supabase
      .from('conversation_history')
      .select('intent_detected')
      .not('intent_detected', 'is', null)
      .limit(100);
      
    if (intents) {
      const intentTypes = new Set(intents.map(row => row.intent_detected));
      console.log(`   intent_detected (${intents.length} registros não-nulos):`);
      console.log(`     Tipos únicos: ${intentTypes.size}`);
      [...intentTypes].slice(0, 10).forEach(intent => {
        console.log(`     - ${intent}`);
      });
    }
    
    // confidence_score
    const { data: confidences } = await supabase
      .from('conversation_history')
      .select('confidence_score')
      .not('confidence_score', 'is', null)
      .limit(100);
      
    if (confidences && confidences.length > 0) {
      const scores = confidences.map(row => row.confidence_score);
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      console.log(`   confidence_score (${confidences.length} registros não-nulos):`);
      console.log(`     Média: ${avg.toFixed(2)}, Min: ${min}, Max: ${max}`);
    }
    
    // conversation_context
    const { data: contexts } = await supabase
      .from('conversation_history')
      .select('conversation_context')
      .not('conversation_context', 'is', null)
      .limit(10);
      
    if (contexts && contexts[0]) {
      console.log(`   conversation_context (${contexts.length} amostras):`);
      const contextKeys = new Set();
      contexts.forEach(row => {
        if (row.conversation_context && typeof row.conversation_context === 'object') {
          Object.keys(row.conversation_context).forEach(key => contextKeys.add(key));
        }
      });
      console.log(`     Chaves encontradas: [${[...contextKeys].join(', ')}]`);
    }
    
    // 4. Análise de custos
    console.log('\n💰 4. ANÁLISE DE CUSTOS (se disponível):');
    const { data: costs } = await supabase
      .from('conversation_history')
      .select('api_cost_usd, processing_cost_usd, tokens_used')
      .not('api_cost_usd', 'is', null)
      .limit(50);
      
    if (costs && costs.length > 0) {
      const totalApiCost = costs.reduce((sum, row) => sum + (row.api_cost_usd || 0), 0);
      const totalProcessingCost = costs.reduce((sum, row) => sum + (row.processing_cost_usd || 0), 0);
      const totalTokens = costs.reduce((sum, row) => sum + (row.tokens_used || 0), 0);
      
      console.log(`   Registros com custo: ${costs.length}`);
      console.log(`   API Cost total: $${totalApiCost.toFixed(4)}`);
      console.log(`   Processing Cost total: $${totalProcessingCost.toFixed(4)}`);
      console.log(`   Tokens total: ${totalTokens}`);
    } else {
      console.log('   Nenhum registro com informações de custo encontrado');
    }
    
    // 5. Distribuição por tenant
    console.log('\n🏢 5. DISTRIBUIÇÃO POR TENANT:');
    const { data: tenantDist } = await supabase
      .from('conversation_history')
      .select('tenant_id')
      .not('tenant_id', 'is', null);
      
    if (tenantDist) {
      const tenantCounts = {};
      tenantDist.forEach(row => {
        tenantCounts[row.tenant_id] = (tenantCounts[row.tenant_id] || 0) + 1;
      });
      
      const topTenants = Object.entries(tenantCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
        
      console.log(`   Total tenants: ${Object.keys(tenantCounts).length}`);
      console.log('   Top 5 tenants por volume:');
      topTenants.forEach(([tenantId, count], i) => {
        console.log(`     ${i+1}. ${tenantId}: ${count} conversas`);
      });
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ ANÁLISE CONCLUÍDA');
    
  } catch (error) {
    console.error('❌ Erro na análise:', error);
  }
}

analyzeConversationHistory().catch(console.error);