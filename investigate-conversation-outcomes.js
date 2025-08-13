/**
 * INVESTIGAÇÃO: CONVERSATION OUTCOMES E CAMPOS IA
 * 
 * Analisar:
 * - conversation_outcome (valores possíveis)
 * - intent_detected (valores possíveis) 
 * - avg_confidence_score (range de valores)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateConversationOutcomes() {
    console.log('🔍 INVESTIGAÇÃO: CONVERSATION OUTCOMES E CAMPOS IA');
    console.log('='.repeat(70));
    
    try {
        // 1. Analisar conversation_outcome - valores únicos
        console.log('📊 ANÁLISE CONVERSATION_OUTCOME:');
        console.log('-'.repeat(50));
        
        const { data: outcomes, error: outcomesError } = await supabase
            .from('conversation_history')
            .select('conversation_outcome')
            .not('conversation_outcome', 'is', null);
        
        if (outcomesError) {
            console.error('❌ Erro conversation_outcome:', outcomesError);
        } else if (outcomes && outcomes.length > 0) {
            // Contar valores únicos
            const outcomeCount = {};
            outcomes.forEach(row => {
                const outcome = row.conversation_outcome;
                outcomeCount[outcome] = (outcomeCount[outcome] || 0) + 1;
            });
            
            console.log(`📈 Total registros com outcome: ${outcomes.length}`);
            console.log('');
            console.log('🏷️ Valores conversation_outcome encontrados:');
            Object.entries(outcomeCount)
                .sort((a, b) => b[1] - a[1])
                .forEach(([outcome, count]) => {
                    const percentage = (count / outcomes.length * 100).toFixed(1);
                    console.log(`   "${outcome}": ${count} (${percentage}%)`);
                });
        }
        
        // 2. Analisar intent_detected - valores únicos
        console.log('');
        console.log('🧠 ANÁLISE INTENT_DETECTED:');
        console.log('-'.repeat(50));
        
        const { data: intents, error: intentsError } = await supabase
            .from('conversation_history')
            .select('intent_detected')
            .not('intent_detected', 'is', null);
        
        if (intentsError) {
            console.error('❌ Erro intent_detected:', intentsError);
        } else if (intents && intents.length > 0) {
            // Contar valores únicos
            const intentCount = {};
            intents.forEach(row => {
                const intent = row.intent_detected;
                intentCount[intent] = (intentCount[intent] || 0) + 1;
            });
            
            console.log(`📈 Total registros com intent: ${intents.length}`);
            console.log('');
            console.log('🏷️ Valores intent_detected encontrados (top 10):');
            Object.entries(intentCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .forEach(([intent, count]) => {
                    const percentage = (count / intents.length * 100).toFixed(1);
                    console.log(`   "${intent}": ${count} (${percentage}%)`);
                });
            
            if (Object.keys(intentCount).length > 10) {
                console.log(`   ... e mais ${Object.keys(intentCount).length - 10} intents diferentes`);
            }
        }
        
        // 3. Analisar confidence_score - range e distribuição
        console.log('');
        console.log('📊 ANÁLISE CONFIDENCE_SCORE:');
        console.log('-'.repeat(50));
        
        const { data: confidence, error: confidenceError } = await supabase
            .from('conversation_history')
            .select('confidence_score')
            .not('confidence_score', 'is', null);
        
        if (confidenceError) {
            console.error('❌ Erro avg_confidence_score:', confidenceError);
        } else if (confidence && confidence.length > 0) {
            const scores = confidence.map(row => row.confidence_score).filter(score => score != null);
            
            if (scores.length > 0) {
                const min = Math.min(...scores);
                const max = Math.max(...scores);
                const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                
                console.log(`📈 Total registros com confidence: ${scores.length}`);
                console.log(`📊 Range: ${min.toFixed(3)} - ${max.toFixed(3)}`);
                console.log(`📊 Média: ${avg.toFixed(3)}`);
                
                // Distribuição por faixas
                const ranges = {
                    '0.0-0.2': 0,
                    '0.2-0.4': 0,
                    '0.4-0.6': 0,
                    '0.6-0.8': 0,
                    '0.8-1.0': 0
                };
                
                scores.forEach(score => {
                    if (score < 0.2) ranges['0.0-0.2']++;
                    else if (score < 0.4) ranges['0.2-0.4']++;
                    else if (score < 0.6) ranges['0.4-0.6']++;
                    else if (score < 0.8) ranges['0.6-0.8']++;
                    else ranges['0.8-1.0']++;
                });
                
                console.log('');
                console.log('📊 Distribuição por faixas:');
                Object.entries(ranges).forEach(([range, count]) => {
                    const percentage = (count / scores.length * 100).toFixed(1);
                    console.log(`   ${range}: ${count} (${percentage}%)`);
                });
            }
        }
        
        // 4. Análise combinada - outcome + intent + confidence
        console.log('');
        console.log('🔗 ANÁLISE COMBINADA:');
        console.log('-'.repeat(50));
        
        const { data: combined, error: combinedError } = await supabase
            .from('conversation_history')
            .select('conversation_outcome, intent_detected, confidence_score, tenant_id')
            .limit(100);
        
        if (combinedError) {
            console.error('❌ Erro análise combinada:', combinedError);
        } else if (combined && combined.length > 0) {
            console.log(`📊 Sample de ${combined.length} registros para análise:`);
            
            // Contar registros completos (com todos os campos)
            const complete = combined.filter(row => 
                row.conversation_outcome != null && 
                row.intent_detected != null && 
                row.confidence_score != null
            );
            
            const withOutcome = combined.filter(row => row.conversation_outcome != null);
            const withIntent = combined.filter(row => row.intent_detected != null);
            const withConfidence = combined.filter(row => row.confidence_score != null);
            
            console.log(`   Registros com outcome: ${withOutcome.length} (${(withOutcome.length/combined.length*100).toFixed(1)}%)`);
            console.log(`   Registros com intent: ${withIntent.length} (${(withIntent.length/combined.length*100).toFixed(1)}%)`);
            console.log(`   Registros com confidence: ${withConfidence.length} (${(withConfidence.length/combined.length*100).toFixed(1)}%)`);
            console.log(`   Registros completos: ${complete.length} (${(complete.length/combined.length*100).toFixed(1)}%)`);
            
            if (complete.length > 0) {
                console.log('');
                console.log('🔍 Exemplos de dados completos (primeiros 5):');
                complete.slice(0, 5).forEach((row, i) => {
                    console.log(`   ${i+1}. Outcome: "${row.conversation_outcome}" | Intent: "${row.intent_detected}" | Confidence: ${row.confidence_score.toFixed(3)}`);
                });
            }
        }
        
        // 5. Contagem total para verificar cobertura
        console.log('');
        console.log('📈 VERIFICAÇÃO DE COBERTURA:');
        console.log('-'.repeat(50));
        
        const { count: totalCount, error: countError } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true });
        
        if (!countError) {
            console.log(`📊 Total geral conversation_history: ${totalCount} registros`);
            
            const { count: withOutcomeCount } = await supabase
                .from('conversation_history')
                .select('*', { count: 'exact', head: true })
                .not('conversation_outcome', 'is', null);
            
            const { count: withIntentCount } = await supabase
                .from('conversation_history')
                .select('*', { count: 'exact', head: true })
                .not('intent_detected', 'is', null);
            
            const { count: withConfidenceCount } = await supabase
                .from('conversation_history')
                .select('*', { count: 'exact', head: true })
                .not('confidence_score', 'is', null);
            
            console.log(`   Com outcome: ${withOutcomeCount || 0} (${((withOutcomeCount || 0)/totalCount*100).toFixed(1)}%)`);
            console.log(`   Com intent: ${withIntentCount || 0} (${((withIntentCount || 0)/totalCount*100).toFixed(1)}%)`);
            console.log(`   Com confidence: ${withConfidenceCount || 0} (${((withConfidenceCount || 0)/totalCount*100).toFixed(1)}%)`);
        }
        
        console.log('');
        console.log('✅ INVESTIGAÇÃO CONCLUÍDA');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ Erro durante investigação:', error);
    }
}

investigateConversationOutcomes().catch(console.error);