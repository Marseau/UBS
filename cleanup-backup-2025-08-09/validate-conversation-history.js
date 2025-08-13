/**
 * INVESTIGAÇÃO COMPLETA DA TABELA CONVERSATION_HISTORY
 * 
 * Este script analisa a estrutura real da tabela conversation_history
 * e identifica TODAS as métricas que podem ser extraídas dela
 * 
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-08-04
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function investigateConversationHistory() {
    console.log('🔍 INVESTIGAÇÃO COMPLETA DA TABELA CONVERSATION_HISTORY');
    console.log('='.repeat(70));
    
    const report = {
        tableStructure: null,
        sampleData: [],
        fieldsAnalysis: {},
        conversationOutcomes: {},
        messageAnalysis: {},
        metricsIdentified: [],
        recommendations: []
    };

    try {
        // 1. ESTRUTURA DA TABELA
        console.log('\n📋 1. ESTRUTURA DA TABELA');
        console.log('-'.repeat(50));
        
        const { data: structure, error: structError } = await supabase
            .rpc('exec_sql', { 
                sql: `SELECT column_name, data_type, is_nullable, column_default 
                      FROM information_schema.columns 
                      WHERE table_name = 'conversation_history' 
                      ORDER BY ordinal_position;`
            });

        if (structError) throw structError;
        
        report.tableStructure = structure;
        console.table(structure);

        // 2. AMOSTRA DE DADOS REAIS
        console.log('\n📊 2. AMOSTRA DE DADOS REAIS');
        console.log('-'.repeat(50));
        
        const { data: samples, error: sampleError } = await supabase
            .from('conversation_history')
            .select('*')
            .limit(10);

        if (sampleError) throw sampleError;
        
        report.sampleData = samples;
        console.log(`Total de registros analisados: ${samples.length}`);

        // 3. ANÁLISE DETALHADA DOS CAMPOS
        console.log('\n🔍 3. ANÁLISE DETALHADA DOS CAMPOS');
        console.log('-'.repeat(50));
        
        if (samples.length > 0) {
            const firstSample = samples[0];
            
            Object.keys(firstSample).forEach(field => {
                console.log(`\n📋 Campo: ${field}`);
                console.log(`   Tipo: ${typeof firstSample[field]}`);
                console.log(`   Valor exemplo: ${JSON.stringify(firstSample[field])}`);
                
                // Análise específica por campo
                if (field === 'conversation_outcome') {
                    // VERIFICAR ENUM DE CONVERSATION_OUTCOME
                    const outcomes = samples.map(s => s.conversation_outcome).filter(o => o);
                    const uniqueOutcomes = [...new Set(outcomes)];
                    console.log(`   Valores únicos encontrados: ${uniqueOutcomes.join(', ')}`);
                    report.conversationOutcomes = {
                        field: 'conversation_outcome',
                        values: uniqueOutcomes,
                        count: outcomes.length
                    };
                }
                
                report.fieldsAnalysis[field] = {
                    type: typeof firstSample[field],
                    example: firstSample[field],
                    hasData: firstSample[field] !== null
                };
            });
        }

        // 4. INVESTIGAR CONVERSATION_OUTCOME ESPECÍFICAMENTE
        console.log('\n🎯 4. INVESTIGAÇÃO DO CAMPO CONVERSATION_OUTCOME');
        console.log('-'.repeat(50));
        
        const { data: outcomeData, error: outcomeError } = await supabase
            .from('conversation_history')
            .select('conversation_outcome, tenant_id, created_at')
            .not('conversation_outcome', 'is', null)
            .limit(100);

        if (outcomeError) {
            console.log(`❌ Erro ao buscar conversation_outcome: ${outcomeError.message}`);
        } else {
            const outcomes = outcomeData.map(d => d.conversation_outcome);
            const uniqueOutcomes = [...new Set(outcomes)];
            const outcomeCounts = {};
            
            outcomes.forEach(outcome => {
                outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
            });
            
            console.log(`📊 Total de registros com conversation_outcome: ${outcomes.length}`);
            console.log(`📋 Valores únicos (${uniqueOutcomes.length}): ${uniqueOutcomes.join(', ')}`);
            console.log(`📈 Distribuição:`);
            Object.entries(outcomeCounts).forEach(([outcome, count]) => {
                console.log(`   ${outcome}: ${count} registros`);
            });
            
            report.conversationOutcomes = {
                totalRecords: outcomes.length,
                uniqueValues: uniqueOutcomes,
                distribution: outcomeCounts
            };
        }

        // 5. INVESTIGAR CAMPOS DE MENSAGEM E TEMPO
        console.log('\n💬 5. INVESTIGAÇÃO DE CAMPOS DE MENSAGEM E TEMPO');
        console.log('-'.repeat(50));
        
        // Verificar se existe campo message_id ou similar
        const messageFields = structure.filter(col => 
            col.column_name.includes('message') || 
            col.column_name.includes('duration') ||
            col.column_name.includes('time') ||
            col.column_name.includes('minute')
        );
        
        console.log('📋 Campos relacionados a mensagens/tempo encontrados:');
        messageFields.forEach(field => {
            console.log(`   - ${field.column_name} (${field.data_type})`);
        });

        // Analisar valores desses campos
        if (samples.length > 0) {
            messageFields.forEach(field => {
                const fieldName = field.column_name;
                const values = samples.map(s => s[fieldName]).filter(v => v !== null);
                console.log(`\n📊 Campo ${fieldName}:`);
                console.log(`   Valores não-nulos: ${values.length}/${samples.length}`);
                if (values.length > 0) {
                    console.log(`   Exemplos: ${values.slice(0, 3).join(', ')}`);
                    if (typeof values[0] === 'number') {
                        const avg = values.reduce((a, b) => a + b, 0) / values.length;
                        console.log(`   Média: ${avg.toFixed(2)}`);
                    }
                }
            });
        }

        // 6. IDENTIFICAR TODAS AS MÉTRICAS POSSÍVEIS
        console.log('\n📊 6. MÉTRICAS IDENTIFICADAS QUE PODEM SER EXTRAÍDAS');
        console.log('-'.repeat(50));
        
        const possibleMetrics = [];
        
        // Métricas de Conversation Outcome
        if (report.conversationOutcomes.uniqueValues?.length > 0) {
            report.conversationOutcomes.uniqueValues.forEach(outcome => {
                possibleMetrics.push({
                    name: `${outcome.toLowerCase()}_conversations_count`,
                    description: `Contagem de conversas com outcome '${outcome}'`,
                    field: 'conversation_outcome',
                    calculation: `COUNT(*) WHERE conversation_outcome = '${outcome}'`,
                    category: 'conversation_outcomes'
                });
            });
        }

        // Métricas de Tempo
        const timeFields = messageFields.filter(f => 
            f.column_name.includes('duration') || 
            f.column_name.includes('minute') ||
            f.column_name.includes('time')
        );
        
        timeFields.forEach(field => {
            possibleMetrics.push({
                name: `avg_${field.column_name}`,
                description: `Média de ${field.column_name}`,
                field: field.column_name,
                calculation: `AVG(${field.column_name})`,
                category: 'time_metrics'
            });
            
            possibleMetrics.push({
                name: `total_${field.column_name}`,
                description: `Soma total de ${field.column_name}`,
                field: field.column_name,
                calculation: `SUM(${field.column_name})`,
                category: 'time_metrics'
            });
        });

        // Métricas de Contagem
        possibleMetrics.push({
            name: 'total_conversations',
            description: 'Total de conversas',
            field: 'id',
            calculation: 'COUNT(*)',
            category: 'basic_counts'
        });

        possibleMetrics.push({
            name: 'unique_sessions',
            description: 'Sessões únicas',
            field: 'session_id',
            calculation: 'COUNT(DISTINCT session_id)',
            category: 'basic_counts'
        });

        // Métricas por Tenant
        possibleMetrics.push({
            name: 'conversations_per_tenant',
            description: 'Conversas por tenant',
            field: 'tenant_id',
            calculation: 'COUNT(*) GROUP BY tenant_id',
            category: 'tenant_metrics'
        });

        // Métricas Temporais
        possibleMetrics.push({
            name: 'conversations_by_date',
            description: 'Conversas por data',
            field: 'created_at',
            calculation: 'COUNT(*) GROUP BY DATE(created_at)',
            category: 'temporal_metrics'
        });

        possibleMetrics.push({
            name: 'conversations_last_7d',
            description: 'Conversas nos últimos 7 dias',
            field: 'created_at',
            calculation: "COUNT(*) WHERE created_at >= NOW() - INTERVAL '7 days'",
            category: 'temporal_metrics'
        });

        possibleMetrics.push({
            name: 'conversations_last_30d',
            description: 'Conversas nos últimos 30 dias',
            field: 'created_at',
            calculation: "COUNT(*) WHERE created_at >= NOW() - INTERVAL '30 days'",
            category: 'temporal_metrics'
        });

        report.metricsIdentified = possibleMetrics;
        
        possibleMetrics.forEach((metric, index) => {
            console.log(`${index + 1}. ${metric.name}`);
            console.log(`   Descrição: ${metric.description}`);
            console.log(`   Campo: ${metric.field}`);
            console.log(`   Cálculo: ${metric.calculation}`);
            console.log(`   Categoria: ${metric.category}`);
            console.log('');
        });

        // 7. RECOMENDAÇÕES
        console.log('\n💡 7. RECOMENDAÇÕES PARA IMPLEMENTAÇÃO');
        console.log('-'.repeat(50));
        
        const recommendations = [
            'Implementar métricas baseadas no campo conversation_outcome real encontrado',
            'Utilizar campos de tempo reais encontrados na tabela',
            'Agrupar métricas por tenant_id para análises por cliente',
            'Implementar filtros temporais baseados no campo created_at',
            'Criar métricas de distribuição de outcomes',
            'Implementar métricas de sessão usando session_id se disponível'
        ];
        
        recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. ${rec}`);
        });
        
        report.recommendations = recommendations;

        console.log('\n🎯 INVESTIGAÇÃO CONCLUÍDA!');
        return report;

    } catch (error) {
        console.error('❌ Erro na investigação:', error);
        return { error: error.message };
    }
}

// Executar investigação
if (require.main === module) {
    investigateConversationHistory()
        .then(report => {
            console.log('\n📋 Relatório gerado com sucesso!');
            
            // Salvar relatório em arquivo JSON para referência
            const fs = require('fs');
            fs.writeFileSync('conversation_history_investigation_report.json', JSON.stringify(report, null, 2));
            console.log('💾 Relatório salvo em: conversation_history_investigation_report.json');
            
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { investigateConversationHistory };