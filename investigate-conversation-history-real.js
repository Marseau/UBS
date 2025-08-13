/**
 * INVESTIGAÇÃO REAL DA TABELA CONVERSATION_HISTORY
 * Usando apenas queries diretas do Supabase
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function investigateConversationHistoryReal() {
    console.log('🔍 INVESTIGAÇÃO REAL DA TABELA CONVERSATION_HISTORY');
    console.log('='.repeat(70));
    
    try {
        // 1. BUSCAR DADOS REAIS PARA ANÁLISE
        console.log('\n📊 1. BUSCANDO DADOS REAIS');
        console.log('-'.repeat(50));
        
        const { data: samples, error: sampleError } = await supabase
            .from('conversation_history')
            .select('*')
            .limit(20);

        if (sampleError) throw sampleError;
        
        console.log(`Total de registros encontrados: ${samples.length}`);

        if (samples.length === 0) {
            console.log('❌ Nenhum registro encontrado na tabela');
            return;
        }

        // 2. ANALISAR ESTRUTURA DOS DADOS
        console.log('\n📋 2. ESTRUTURA DOS CAMPOS ENCONTRADOS');
        console.log('-'.repeat(50));
        
        const firstRecord = samples[0];
        const allFields = Object.keys(firstRecord);
        
        console.log(`Campos encontrados (${allFields.length}):`);
        allFields.forEach((field, index) => {
            const value = firstRecord[field];
            const type = typeof value;
            console.log(`${index + 1}. ${field} (${type}): ${JSON.stringify(value)}`);
        });

        // 3. VERIFICAR CAMPO CONVERSATION_OUTCOME
        console.log('\n🎯 3. ANÁLISE DO CAMPO CONVERSATION_OUTCOME');
        console.log('-'.repeat(50));
        
        if (allFields.includes('conversation_outcome')) {
            console.log('✅ Campo conversation_outcome ENCONTRADO!');
            
            // Analisar todos os valores únicos
            const outcomes = samples.map(s => s.conversation_outcome).filter(o => o !== null);
            const uniqueOutcomes = [...new Set(outcomes)];
            const outcomeCounts = {};
            
            outcomes.forEach(outcome => {
                outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
            });
            
            console.log(`📊 Registros com conversation_outcome: ${outcomes.length}/${samples.length}`);
            console.log(`📋 Valores únicos encontrados (${uniqueOutcomes.length}):`);
            uniqueOutcomes.forEach((outcome, index) => {
                console.log(`   ${index + 1}. "${outcome}" (${outcomeCounts[outcome]} occorrências)`);
            });
            
            // Buscar TODOS os valores possíveis na tabela
            const { data: allOutcomes, error: outcomeError } = await supabase
                .from('conversation_history')
                .select('conversation_outcome')
                .not('conversation_outcome', 'is', null);
                
            if (!outcomeError && allOutcomes.length > 0) {
                const allUniqueOutcomes = [...new Set(allOutcomes.map(o => o.conversation_outcome))];
                const allOutcomeCounts = {};
                
                allOutcomes.forEach(o => {
                    const outcome = o.conversation_outcome;
                    allOutcomeCounts[outcome] = (allOutcomeCounts[outcome] || 0) + 1;
                });
                
                console.log(`\n📈 TODOS OS VALORES DE CONVERSATION_OUTCOME NA TABELA:`);
                console.log(`Total de registros: ${allOutcomes.length}`);
                console.log(`Valores únicos: ${allUniqueOutcomes.length}`);
                
                allUniqueOutcomes.sort().forEach((outcome, index) => {
                    const count = allOutcomeCounts[outcome];
                    const percentage = ((count / allOutcomes.length) * 100).toFixed(1);
                    console.log(`   ${index + 1}. "${outcome}": ${count} registros (${percentage}%)`);
                });
            }
        } else {
            console.log('❌ Campo conversation_outcome NÃO ENCONTRADO!');
        }

        // 4. VERIFICAR CAMPOS DE MENSAGEM E TEMPO
        console.log('\n💬 4. ANÁLISE DE CAMPOS DE MENSAGEM E TEMPO');
        console.log('-'.repeat(50));
        
        const messageTimeFields = allFields.filter(field => 
            field.includes('message') || 
            field.includes('duration') || 
            field.includes('time') || 
            field.includes('minute') ||
            field.includes('phone') ||
            field.includes('cost') ||
            field.includes('confidence')
        );
        
        if (messageTimeFields.length > 0) {
            console.log(`✅ Campos relacionados encontrados (${messageTimeFields.length}):`);
            messageTimeFields.forEach((field, index) => {
                const values = samples.map(s => s[field]).filter(v => v !== null && v !== undefined);
                const nonNullCount = values.length;
                const example = values.length > 0 ? values[0] : 'N/A';
                
                console.log(`   ${index + 1}. ${field}:`);
                console.log(`      Registros com dados: ${nonNullCount}/${samples.length}`);
                console.log(`      Exemplo: ${JSON.stringify(example)}`);
                
                if (typeof example === 'number' && values.length > 1) {
                    const avg = values.reduce((a, b) => a + b, 0) / values.length;
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    console.log(`      Estatísticas: min=${min}, max=${max}, avg=${avg.toFixed(2)}`);
                }
            });
        } else {
            console.log('❌ Nenhum campo relacionado a mensagem/tempo encontrado');
        }

        // 5. VERIFICAR CAMPO SESSION_ID
        console.log('\n🔗 5. ANÁLISE DE SESSÕES');
        console.log('-'.repeat(50));
        
        if (allFields.includes('session_id')) {
            console.log('✅ Campo session_id ENCONTRADO!');
            
            const sessionIds = samples.map(s => s.session_id).filter(s => s);
            const uniqueSessions = [...new Set(sessionIds)];
            
            console.log(`📊 Total de registros com session_id: ${sessionIds.length}/${samples.length}`);
            console.log(`📋 Sessões únicas na amostra: ${uniqueSessions.length}`);
            console.log(`📈 Registros por sessão: ${(sessionIds.length / uniqueSessions.length).toFixed(1)} em média`);
            
            if (uniqueSessions.length > 0) {
                console.log(`   Exemplo de session_id: ${uniqueSessions[0]}`);
            }
        } else {
            console.log('❌ Campo session_id não encontrado');
        }

        // 6. ANALISAR CONVERSATION_CONTEXT
        console.log('\n🔍 6. ANÁLISE DO CONVERSATION_CONTEXT');
        console.log('-'.repeat(50));
        
        if (allFields.includes('conversation_context')) {
            console.log('✅ Campo conversation_context ENCONTRADO!');
            
            samples.slice(0, 5).forEach((sample, index) => {
                console.log(`\n📋 Registro ${index + 1}:`);
                try {
                    const context = typeof sample.conversation_context === 'string' 
                        ? JSON.parse(sample.conversation_context) 
                        : sample.conversation_context;
                    
                    if (context && typeof context === 'object') {
                        const contextKeys = Object.keys(context);
                        console.log(`   Chaves do JSON (${contextKeys.length}): ${contextKeys.join(', ')}`);
                        
                        contextKeys.forEach(key => {
                            console.log(`   ${key}: ${JSON.stringify(context[key])}`);
                        });
                    } else {
                        console.log(`   Valor: ${JSON.stringify(context)}`);
                    }
                } catch (error) {
                    console.log(`   ❌ Erro ao fazer parse: ${error.message}`);
                    console.log(`   Valor bruto: ${JSON.stringify(sample.conversation_context)}`);
                }
            });
        }

        // 7. IDENTIFICAR MÉTRICAS POSSÍVEIS
        console.log('\n📊 7. MÉTRICAS QUE PODEM SER EXTRAÍDAS');
        console.log('-'.repeat(50));
        
        const possibleMetrics = [];
        
        // Baseado nos campos encontrados
        if (allFields.includes('conversation_outcome')) {
            const { data: outcomeData } = await supabase
                .from('conversation_history')
                .select('conversation_outcome')
                .not('conversation_outcome', 'is', null);
                
            if (outcomeData) {
                const uniqueOutcomes = [...new Set(outcomeData.map(o => o.conversation_outcome))];
                uniqueOutcomes.forEach(outcome => {
                    possibleMetrics.push({
                        name: `${outcome.toLowerCase().replace(/\s+/g, '_')}_conversations`,
                        description: `Contagem de conversas com outcome '${outcome}'`,
                        calculation: `COUNT(*) WHERE conversation_outcome = '${outcome}'`,
                        viable: true
                    });
                });
            }
        }
        
        // Métricas básicas sempre possíveis
        possibleMetrics.push(
            {
                name: 'total_conversations',
                description: 'Total de conversas',
                calculation: 'COUNT(*)',
                viable: true
            },
            {
                name: 'conversations_last_7d',
                description: 'Conversas dos últimos 7 dias',
                calculation: "COUNT(*) WHERE created_at >= NOW() - INTERVAL '7 days'",
                viable: allFields.includes('created_at')
            },
            {
                name: 'conversations_last_30d',
                description: 'Conversas dos últimos 30 dias',
                calculation: "COUNT(*) WHERE created_at >= NOW() - INTERVAL '30 days'",
                viable: allFields.includes('created_at')
            }
        );
        
        if (allFields.includes('session_id')) {
            possibleMetrics.push({
                name: 'unique_sessions',
                description: 'Número de sessões únicas',
                calculation: 'COUNT(DISTINCT session_id)',
                viable: true
            });
        }
        
        // Métricas baseadas em campos encontrados
        messageTimeFields.forEach(field => {
            if (typeof samples.find(s => s[field])?.[field] === 'number') {
                possibleMetrics.push({
                    name: `avg_${field}`,
                    description: `Média de ${field}`,
                    calculation: `AVG(${field})`,
                    viable: true
                });
                
                possibleMetrics.push({
                    name: `total_${field}`,
                    description: `Soma total de ${field}`,
                    calculation: `SUM(${field})`,
                    viable: true
                });
            }
        });
        
        console.log(`\n📊 TOTAL DE MÉTRICAS IDENTIFICADAS: ${possibleMetrics.length}`);
        possibleMetrics.forEach((metric, index) => {
            const status = metric.viable ? '✅' : '❌';
            console.log(`${index + 1}. ${status} ${metric.name}`);
            console.log(`   ${metric.description}`);
            console.log(`   SQL: ${metric.calculation}`);
            console.log('');
        });

        console.log('\n🎯 INVESTIGAÇÃO CONCLUÍDA COM SUCESSO!');
        
        return {
            success: true,
            fieldsFound: allFields,
            sampleCount: samples.length,
            metricsIdentified: possibleMetrics.length,
            viableMetrics: possibleMetrics.filter(m => m.viable).length
        };

    } catch (error) {
        console.error('❌ Erro na investigação:', error);
        return { success: false, error: error.message };
    }
}

// Executar investigação
if (require.main === module) {
    investigateConversationHistoryReal()
        .then(result => {
            if (result.success) {
                console.log(`\n✅ Investigação concluída: ${result.viableMetrics}/${result.metricsIdentified} métricas viáveis identificadas`);
            }
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { investigateConversationHistoryReal };