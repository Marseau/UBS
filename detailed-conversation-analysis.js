const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function detailedConversationAnalysis() {
  console.log('📊 ANÁLISE DETALHADA - CONVERSATION_HISTORY TABLE');
  console.log('='.repeat(80));
  
  try {
    // 1. Buscar amostra maior para capturar todos os campos possíveis
    console.log('\n🔍 1. MAPEAMENTO COMPLETO DE CAMPOS:');
    const { data: largeSample, error } = await supabase
      .from('conversation_history')
      .select('*')
      .limit(100);
    
    if (error) {
      console.log('❌ Erro:', error.message);
      return;
    }
    
    // Coletar todos os campos únicos
    const allFields = new Set();
    const fieldExamples = {};
    const fieldTypes = {};
    const fieldNullCounts = {};
    
    largeSample?.forEach(record => {
      Object.entries(record).forEach(([field, value]) => {
        allFields.add(field);
        if (value !== null && !fieldExamples[field]) {
          fieldExamples[field] = value;
          fieldTypes[field] = typeof value;
        }
        if (value === null) {
          fieldNullCounts[field] = (fieldNullCounts[field] || 0) + 1;
        }
      });
    });
    
    console.log(`   Total campos únicos encontrados: ${allFields.size}`);
    console.log('   Detalhamento por campo:');
    
    [...allFields].sort().forEach((field, i) => {
      const type = fieldTypes[field] || 'null';
      const nullCount = fieldNullCounts[field] || 0;
      const nullPercentage = ((nullCount / largeSample.length) * 100).toFixed(1);
      let example = fieldExamples[field];
      
      // Formatação especial para objetos
      if (type === 'object' && example) {
        if (field === 'conversation_context') {
          example = `{${Object.keys(example).join(', ')}}`;
        } else {
          example = JSON.stringify(example).substring(0, 50) + '...';
        }
      } else if (type === 'string' && example && example.length > 30) {
        example = example.substring(0, 30) + '...';
      }
      
      console.log(`     ${String(i+1).padStart(2)}. ${field.padEnd(25)} (${type.padEnd(8)}) ${nullPercentage}% null - Ex: ${example}`);
    });
    
    // 2. Análise específica de conversation_outcome
    console.log('\n🎯 2. ANÁLISE DETALHADA DE CONVERSATION_OUTCOME:');
    const { data: allOutcomes } = await supabase
      .from('conversation_history')
      .select('conversation_outcome');
    
    if (allOutcomes) {
      const outcomeStats = {};
      let nullCount = 0;
      
      allOutcomes.forEach(row => {
        if (row.conversation_outcome === null) {
          nullCount++;
        } else {
          outcomeStats[row.conversation_outcome] = (outcomeStats[row.conversation_outcome] || 0) + 1;
        }
      });
      
      console.log(`   Total registros: ${allOutcomes.length}`);
      console.log(`   Registros com outcome: ${allOutcomes.length - nullCount}`);
      console.log(`   Registros NULL: ${nullCount} (${((nullCount/allOutcomes.length)*100).toFixed(1)}%)`);
      console.log('   Outcomes encontrados:');
      
      Object.entries(outcomeStats)
        .sort((a, b) => b[1] - a[1])
        .forEach(([outcome, count], i) => {
          const percentage = ((count / (allOutcomes.length - nullCount)) * 100).toFixed(1);
          console.log(`     ${i+1}. ${outcome}: ${count} (${percentage}%)`);
        });
    }
    
    // 3. Análise de conversation_context
    console.log('\n🧠 3. ANÁLISE DETALHADA DE CONVERSATION_CONTEXT:');
    const { data: contexts } = await supabase
      .from('conversation_history')
      .select('conversation_context, created_at')
      .not('conversation_context', 'is', null)
      .limit(50);
    
    if (contexts && contexts.length > 0) {
      const contextKeysCount = {};
      const sessionIds = new Set();
      let totalDuration = 0;
      let durationCount = 0;
      
      contexts.forEach(row => {
        if (row.conversation_context && typeof row.conversation_context === 'object') {
          Object.keys(row.conversation_context).forEach(key => {
            contextKeysCount[key] = (contextKeysCount[key] || 0) + 1;
          });
          
          // Análise específica de session_id
          if (row.conversation_context.session_id) {
            sessionIds.add(row.conversation_context.session_id);
          }
          
          // Análise de duration_minutes
          if (row.conversation_context.duration_minutes) {
            totalDuration += row.conversation_context.duration_minutes;
            durationCount++;
          }
        }
      });
      
      console.log(`   Registros analisados: ${contexts.length}`);
      console.log('   Chaves encontradas no context:');
      Object.entries(contextKeysCount)
        .sort((a, b) => b[1] - a[1])
        .forEach(([key, count], i) => {
          const percentage = ((count / contexts.length) * 100).toFixed(1);
          console.log(`     ${i+1}. ${key}: ${count} registros (${percentage}%)`);
        });
      
      console.log(`   Session IDs únicos: ${sessionIds.size}`);
      if (durationCount > 0) {
        console.log(`   Duração média: ${(totalDuration / durationCount).toFixed(2)} minutos`);
      }
    }
    
    // 4. Análise de confiança da IA
    console.log('\n🤖 4. ANÁLISE DE EFICIÊNCIA DA IA:');
    const { data: aiData } = await supabase
      .from('conversation_history')
      .select('intent_detected, confidence_score, model_used')
      .not('intent_detected', 'is', null);
    
    if (aiData && aiData.length > 0) {
      // Análise de confidence_score
      const scores = aiData
        .filter(row => row.confidence_score !== null)
        .map(row => row.confidence_score);
      
      if (scores.length > 0) {
        const avgConfidence = scores.reduce((a, b) => a + b, 0) / scores.length;
        const minConfidence = Math.min(...scores);
        const maxConfidence = Math.max(...scores);
        const highConfidence = scores.filter(s => s >= 0.9).length;
        const lowConfidence = scores.filter(s => s < 0.7).length;
        
        console.log(`   Registros com confidence_score: ${scores.length}`);
        console.log(`   Confiança média: ${avgConfidence.toFixed(3)}`);
        console.log(`   Confiança min/max: ${minConfidence}/${maxConfidence}`);
        console.log(`   Alta confiança (≥0.9): ${highConfidence} (${((highConfidence/scores.length)*100).toFixed(1)}%)`);
        console.log(`   Baixa confiança (<0.7): ${lowConfidence} (${((lowConfidence/scores.length)*100).toFixed(1)}%)`);
      }
      
      // Análise de intents
      const intentCounts = {};
      aiData.forEach(row => {
        if (row.intent_detected) {
          intentCounts[row.intent_detected] = (intentCounts[row.intent_detected] || 0) + 1;
        }
      });
      
      console.log('   Top 10 intents detectados:');
      Object.entries(intentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([intent, count], i) => {
          const percentage = ((count / aiData.length) * 100).toFixed(1);
          console.log(`     ${i+1}. ${intent}: ${count} (${percentage}%)`);
        });
      
      // Análise de modelos
      const modelCounts = {};
      aiData.forEach(row => {
        if (row.model_used) {
          modelCounts[row.model_used] = (modelCounts[row.model_used] || 0) + 1;
        }
      });
      
      console.log('   Modelos utilizados:');
      Object.entries(modelCounts).forEach(([model, count]) => {
        const percentage = ((count / aiData.length) * 100).toFixed(1);
        console.log(`     - ${model}: ${count} (${percentage}%)`);
      });
    }
    
    // 5. Análise de custos e tokens
    console.log('\n💰 5. ANÁLISE FINANCEIRA E DE UTILIZAÇÃO:');
    const { data: costData } = await supabase
      .from('conversation_history')
      .select('api_cost_usd, processing_cost_usd, tokens_used, model_used')
      .not('api_cost_usd', 'is', null);
    
    if (costData && costData.length > 0) {
      const totalApiCost = costData.reduce((sum, row) => sum + (row.api_cost_usd || 0), 0);
      const totalProcessingCost = costData.reduce((sum, row) => sum + (row.processing_cost_usd || 0), 0);
      const totalTokens = costData.reduce((sum, row) => sum + (row.tokens_used || 0), 0);
      const avgTokensPerMessage = totalTokens / costData.length;
      const avgCostPerMessage = (totalApiCost + totalProcessingCost) / costData.length;
      
      console.log(`   Registros com dados de custo: ${costData.length}`);
      console.log(`   Custo total API: $${totalApiCost.toFixed(4)}`);
      console.log(`   Custo total processamento: $${totalProcessingCost.toFixed(4)}`);
      console.log(`   Custo total combinado: $${(totalApiCost + totalProcessingCost).toFixed(4)}`);
      console.log(`   Total de tokens: ${totalTokens.toLocaleString()}`);
      console.log(`   Média tokens/mensagem: ${avgTokensPerMessage.toFixed(1)}`);
      console.log(`   Custo médio/mensagem: $${avgCostPerMessage.toFixed(6)}`);
      
      // Extrapolação para toda a tabela
      const totalRecords = allOutcomes.length;
      const estimatedTotalCost = avgCostPerMessage * totalRecords;
      console.log(`   Custo estimado total (${totalRecords} registros): $${estimatedTotalCost.toFixed(4)}`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ ANÁLISE DETALHADA CONCLUÍDA');
    
  } catch (error) {
    console.error('❌ Erro na análise:', error);
  }
}

detailedConversationAnalysis().catch(console.error);