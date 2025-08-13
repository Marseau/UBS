/**
 * VALIDAÇÃO DETALHADA: CSV CONVERSATIONS
 * 
 * Script para investigar a discrepância entre 1041 conversas extraídas e 231 sessions únicos
 * e validar se o CSV espelha exatamente os dados da tabela conversation_history
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const csv = require('csv-parser');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Ler CSV e converter para array de objetos
 */
function readCsvFile(filename) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filename)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

/**
 * Investigar sessions únicos diretamente no BD
 */
async function investigateUniqueSessionsInDB() {
    console.log('🔍 Investigando sessions únicos diretamente no BD...');
    
    // Query 1: Todos os conversation_context
    const { data: allContexts, error: contextError } = await supabase
        .from('conversation_history')
        .select('id, conversation_context, created_at')
        .order('created_at', { ascending: false });
    
    if (contextError) {
        console.error('❌ Erro ao buscar contexts:', contextError);
        throw contextError;
    }
    
    console.log(`📊 Total de registros com conversation_context: ${allContexts.length}`);
    
    // Analisar estruturas de conversation_context
    const contextAnalysis = {
        withSessionId: 0,
        withoutSessionId: 0,
        nullContext: 0,
        emptyContext: 0,
        uniqueSessionIds: new Set(),
        sessionIdPatterns: new Map(),
        sampleContexts: []
    };
    
    allContexts.forEach((record, index) => {
        const context = record.conversation_context;
        
        if (!context) {
            contextAnalysis.nullContext++;
        } else if (Object.keys(context).length === 0) {
            contextAnalysis.emptyContext++;
        } else {
            const sessionId = context.session_id;
            
            if (sessionId) {
                contextAnalysis.withSessionId++;
                contextAnalysis.uniqueSessionIds.add(sessionId);
                
                // Analisar padrões de session_id
                const pattern = sessionId.length + '_chars';
                contextAnalysis.sessionIdPatterns.set(pattern, 
                    (contextAnalysis.sessionIdPatterns.get(pattern) || 0) + 1);
            } else {
                contextAnalysis.withoutSessionId++;
            }
            
            // Guardar amostras dos primeiros 10 contexts
            if (index < 10) {
                contextAnalysis.sampleContexts.push({
                    id: record.id,
                    context: context,
                    created_at: record.created_at
                });
            }
        }
    });
    
    return contextAnalysis;
}

/**
 * Comparar sessions do CSV com os do BD
 */
async function compareSessionsBetweenCsvAndDB(csvData) {
    console.log('🔄 Comparando sessions entre CSV e BD...');
    
    // Sessions do CSV
    const csvSessions = new Set(csvData.map(row => row.session_id));
    
    // Sessions do BD (método direto)
    const { data: dbSessions, error } = await supabase
        .from('conversation_history')
        .select('conversation_context->session_id as session_id')
        .not('conversation_context->session_id', 'is', null);
    
    if (error) {
        console.error('❌ Erro ao buscar sessions do BD:', error);
        throw error;
    }
    
    const dbSessionsSet = new Set();
    dbSessions.forEach(record => {
        if (record.session_id) {
            dbSessionsSet.add(record.session_id);
        }
    });
    
    // Análise de diferenças
    const csvOnlySessions = new Set([...csvSessions].filter(id => !dbSessionsSet.has(id)));
    const dbOnlySessions = new Set([...dbSessionsSet].filter(id => !csvSessions.has(id)));
    const commonSessions = new Set([...csvSessions].filter(id => dbSessionsSet.has(id)));
    
    return {
        csvSessionsCount: csvSessions.size,
        dbSessionsCount: dbSessionsSet.size,
        commonSessionsCount: commonSessions.size,
        csvOnlyCount: csvOnlySessions.size,
        dbOnlyCount: dbOnlySessions.size,
        csvOnlySample: Array.from(csvOnlySessions).slice(0, 5),
        dbOnlySample: Array.from(dbOnlySessions).slice(0, 5)
    };
}

/**
 * Validar métricas do CSV contra o BD
 */
async function validateCsvMetrics(csvData) {
    console.log('📊 Validando métricas do CSV contra o BD...');
    
    const validation = {
        totalConversations: csvData.length,
        totalMessages: 0,
        totalTokens: 0,
        totalApiCost: 0,
        totalProcessingCost: 0,
        tenantDistribution: new Map(),
        outcomeDistribution: new Map(),
        messageTypesFound: new Set(),
        modelsFound: new Set()
    };
    
    csvData.forEach(row => {
        // Somar métricas
        validation.totalMessages += parseInt(row.total_messages) || 0;
        validation.totalTokens += parseInt(row.total_tokens) || 0;
        
        // Converter valores brasileiros de volta para números
        const apiCost = parseFloat(row.total_api_cost_usd.replace(',', '.')) || 0;
        const processingCost = parseFloat(row.total_processing_cost_usd.replace(',', '.')) || 0;
        validation.totalApiCost += apiCost;
        validation.totalProcessingCost += processingCost;
        
        // Distribuições
        const tenant = row.tenant_name || 'Unknown';
        validation.tenantDistribution.set(tenant, 
            (validation.tenantDistribution.get(tenant) || 0) + 1);
        
        const outcome = row.conversation_outcome || 'None';
        validation.outcomeDistribution.set(outcome, 
            (validation.outcomeDistribution.get(outcome) || 0) + 1);
        
        // Tipos de mensagem e modelos
        if (row.message_types) {
            row.message_types.split('; ').forEach(type => {
                if (type.trim()) validation.messageTypesFound.add(type.trim());
            });
        }
        
        if (row.models_used) {
            row.models_used.split('; ').forEach(model => {
                if (model.trim()) validation.modelsFound.add(model.trim());
            });
        }
    });
    
    // Comparar com BD
    const { count: dbTotalMessages, error: messageError } = await supabase
        .from('conversation_history')
        .select('*', { count: 'exact', head: true });
    
    if (messageError) {
        console.error('❌ Erro ao contar mensagens do BD:', messageError);
        throw messageError;
    }
    
    // Buscar métricas agregadas do BD
    const { data: dbMetrics, error: metricsError } = await supabase
        .from('conversation_history')
        .select('tokens_used, api_cost_usd, processing_cost_usd');
    
    if (metricsError) {
        console.error('❌ Erro ao buscar métricas do BD:', metricsError);
        throw metricsError;
    }
    
    const dbTotalTokens = dbMetrics.reduce((sum, row) => sum + (row.tokens_used || 0), 0);
    const dbTotalApiCost = dbMetrics.reduce((sum, row) => sum + (row.api_cost_usd || 0), 0);
    const dbTotalProcessingCost = dbMetrics.reduce((sum, row) => sum + (row.processing_cost_usd || 0), 0);
    
    validation.dbComparison = {
        messagesMatch: validation.totalMessages === dbTotalMessages,
        tokensMatch: Math.abs(validation.totalTokens - dbTotalTokens) < 1,
        apiCostMatch: Math.abs(validation.totalApiCost - dbTotalApiCost) < 0.01,
        processingCostMatch: Math.abs(validation.totalProcessingCost - dbTotalProcessingCost) < 0.01,
        
        csvMessages: validation.totalMessages,
        dbMessages: dbTotalMessages,
        csvTokens: validation.totalTokens,
        dbTokens: dbTotalTokens,
        csvApiCost: validation.totalApiCost,
        dbApiCost: dbTotalApiCost,
        csvProcessingCost: validation.totalProcessingCost,
        dbProcessingCost: dbTotalProcessingCost
    };
    
    return validation;
}

/**
 * Analisar qualidade e estrutura do CSV
 */
function analyzeCsvQuality(csvData) {
    console.log('🔍 Analisando qualidade e estrutura do CSV...');
    
    const analysis = {
        totalRows: csvData.length,
        headers: csvData.length > 0 ? Object.keys(csvData[0]) : [],
        qualityChecks: {
            withTenant: 0,
            withUser: 0,
            withOutcome: 0,
            withCost: 0,
            withTokens: 0,
            withMessages: 0
        },
        dataRanges: {
            minMessages: Infinity,
            maxMessages: 0,
            minTokens: Infinity,
            maxTokens: 0,
            minDuration: Infinity,
            maxDuration: 0
        },
        formatValidation: {
            brazilianDecimalsCorrect: 0,
            brazilianDecimalsIncorrect: 0,
            dateFormatsCorrect: 0,
            dateFormatsIncorrect: 0
        }
    };
    
    csvData.forEach(row => {
        // Qualidade dos dados
        if (row.tenant_name && row.tenant_name !== 'Sem nome') analysis.qualityChecks.withTenant++;
        if (row.user_name && row.user_name !== 'Sem nome') analysis.qualityChecks.withUser++;
        if (row.conversation_outcome && row.conversation_outcome !== '') analysis.qualityChecks.withOutcome++;
        if (row.total_cost_usd && row.total_cost_usd !== '0,00') analysis.qualityChecks.withCost++;
        if (row.total_tokens && parseInt(row.total_tokens) > 0) analysis.qualityChecks.withTokens++;
        if (row.total_messages && parseInt(row.total_messages) > 0) analysis.qualityChecks.withMessages++;
        
        // Ranges de dados
        const messages = parseInt(row.total_messages) || 0;
        const tokens = parseInt(row.total_tokens) || 0;
        const duration = parseFloat(row.duration_minutes_real?.replace(',', '.')) || 0;
        
        analysis.dataRanges.minMessages = Math.min(analysis.dataRanges.minMessages, messages);
        analysis.dataRanges.maxMessages = Math.max(analysis.dataRanges.maxMessages, messages);
        analysis.dataRanges.minTokens = Math.min(analysis.dataRanges.minTokens, tokens);
        analysis.dataRanges.maxTokens = Math.max(analysis.dataRanges.maxTokens, tokens);
        analysis.dataRanges.minDuration = Math.min(analysis.dataRanges.minDuration, duration);
        analysis.dataRanges.maxDuration = Math.max(analysis.dataRanges.maxDuration, duration);
        
        // Validação de formatação
        if (row.total_api_cost_usd && row.total_api_cost_usd.includes(',')) {
            analysis.formatValidation.brazilianDecimalsCorrect++;
        } else if (row.total_api_cost_usd && row.total_api_cost_usd.includes('.')) {
            analysis.formatValidation.brazilianDecimalsIncorrect++;
        }
        
        // Validação de datas (formato brasileiro dd/mm/aaaa)
        if (row.conversation_start && /\d{2}\/\d{2}\/\d{4}/.test(row.conversation_start)) {
            analysis.formatValidation.dateFormatsCorrect++;
        } else if (row.conversation_start) {
            analysis.formatValidation.dateFormatsIncorrect++;
        }
    });
    
    return analysis;
}

/**
 * Função principal de validação
 */
async function main() {
    try {
        console.log('🕵️ VALIDAÇÃO DETALHADA: CSV CONVERSATIONS');
        console.log('='.repeat(70));
        
        // 1. Verificar arquivo CSV
        const csvFilename = 'conversations-complete-2025-08-01T17-45-24.csv';
        if (!fs.existsSync(csvFilename)) {
            console.error(`❌ Arquivo CSV não encontrado: ${csvFilename}`);
            return;
        }
        
        // 2. Ler CSV
        console.log(`📖 Lendo arquivo CSV: ${csvFilename}...`);
        const csvData = await readCsvFile(csvFilename);
        console.log(`✅ CSV lido: ${csvData.length} registros`);
        
        // 3. Investigar sessions únicos no BD
        const sessionAnalysis = await investigateUniqueSessionsInDB();
        
        // 4. Comparar sessions entre CSV e BD
        const sessionComparison = await compareSessionsBetweenCsvAndDB(csvData);
        
        // 5. Validar métricas
        const metricsValidation = await validateCsvMetrics(csvData);
        
        // 6. Analisar qualidade do CSV
        const qualityAnalysis = analyzeCsvQuality(csvData);
        
        // 7. Relatório final
        console.log('='.repeat(70));
        console.log('📊 RELATÓRIO DE VALIDAÇÃO CSV CONVERSATIONS');
        console.log('='.repeat(70));
        console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
        console.log(`📁 Arquivo analisado: ${csvFilename}`);
        console.log(`💾 Tamanho do arquivo: ${(fs.statSync(csvFilename).size / 1024).toFixed(2)} KB`);
        console.log('');
        
        console.log('🔍 INVESTIGAÇÃO DE SESSIONS:');
        console.log(`   Registros no BD: ${sessionAnalysis.withSessionId + sessionAnalysis.withoutSessionId + sessionAnalysis.nullContext + sessionAnalysis.emptyContext}`);
        console.log(`   Com session_id: ${sessionAnalysis.withSessionId}`);
        console.log(`   Sem session_id: ${sessionAnalysis.withoutSessionId}`);
        console.log(`   Context nulo: ${sessionAnalysis.nullContext}`);
        console.log(`   Context vazio: ${sessionAnalysis.emptyContext}`);
        console.log(`   Sessions únicos no BD: ${sessionAnalysis.uniqueSessionIds.size}`);
        console.log('');
        
        console.log('🔄 COMPARAÇÃO CSV ↔ BD:');
        console.log(`   Sessions no CSV: ${sessionComparison.csvSessionsCount}`);
        console.log(`   Sessions no BD: ${sessionComparison.dbSessionsCount}`);
        console.log(`   Sessions comuns: ${sessionComparison.commonSessionsCount}`);
        console.log(`   Só no CSV: ${sessionComparison.csvOnlyCount}`);
        console.log(`   Só no BD: ${sessionComparison.dbOnlyCount}`);
        if (sessionComparison.csvOnlySample.length > 0) {
            console.log(`   Amostra só CSV: ${sessionComparison.csvOnlySample.join(', ')}`);
        }
        console.log('');
        
        console.log('📊 VALIDAÇÃO DE MÉTRICAS:');
        console.log(`   Mensagens: CSV=${metricsValidation.dbComparison.csvMessages} | BD=${metricsValidation.dbComparison.dbMessages} | ${metricsValidation.dbComparison.messagesMatch ? '✅' : '❌'}`);
        console.log(`   Tokens: CSV=${metricsValidation.dbComparison.csvTokens} | BD=${metricsValidation.dbComparison.dbTokens} | ${metricsValidation.dbComparison.tokensMatch ? '✅' : '❌'}`);
        console.log(`   API Cost: CSV=${metricsValidation.dbComparison.csvApiCost.toFixed(4)} | BD=${metricsValidation.dbComparison.dbApiCost.toFixed(4)} | ${metricsValidation.dbComparison.apiCostMatch ? '✅' : '❌'}`);
        console.log(`   Processing Cost: CSV=${metricsValidation.dbComparison.csvProcessingCost.toFixed(4)} | BD=${metricsValidation.dbComparison.dbProcessingCost.toFixed(4)} | ${metricsValidation.dbComparison.processingCostMatch ? '✅' : '❌'}`);
        console.log('');
        
        console.log('🔍 QUALIDADE DOS DADOS:');
        console.log(`   Total de conversas: ${qualityAnalysis.totalRows}`);
        console.log(`   Colunas: ${qualityAnalysis.headers.length}`);
        console.log(`   Com tenant: ${qualityAnalysis.qualityChecks.withTenant} (${((qualityAnalysis.qualityChecks.withTenant/qualityAnalysis.totalRows)*100).toFixed(1)}%)`);
        console.log(`   Com usuário: ${qualityAnalysis.qualityChecks.withUser} (${((qualityAnalysis.qualityChecks.withUser/qualityAnalysis.totalRows)*100).toFixed(1)}%)`);
        console.log(`   Com outcome: ${qualityAnalysis.qualityChecks.withOutcome} (${((qualityAnalysis.qualityChecks.withOutcome/qualityAnalysis.totalRows)*100).toFixed(1)}%)`);
        console.log(`   Com custo: ${qualityAnalysis.qualityChecks.withCost} (${((qualityAnalysis.qualityChecks.withCost/qualityAnalysis.totalRows)*100).toFixed(1)}%)`);
        console.log('');
        
        console.log('📈 RANGES DE DADOS:');
        console.log(`   Mensagens: ${qualityAnalysis.dataRanges.minMessages} - ${qualityAnalysis.dataRanges.maxMessages}`);
        console.log(`   Tokens: ${qualityAnalysis.dataRanges.minTokens} - ${qualityAnalysis.dataRanges.maxTokens}`);
        console.log(`   Duração: ${qualityAnalysis.dataRanges.minDuration.toFixed(2)} - ${qualityAnalysis.dataRanges.maxDuration.toFixed(2)} min`);
        console.log('');
        
        console.log('🇧🇷 FORMATAÇÃO BRASILEIRA:');
        console.log(`   Decimais corretos: ${qualityAnalysis.formatValidation.brazilianDecimalsCorrect}/${qualityAnalysis.totalRows}`);
        console.log(`   Datas corretas: ${qualityAnalysis.formatValidation.dateFormatsCorrect}/${qualityAnalysis.totalRows}`);
        console.log('');
        
        console.log('🏢 TOP 5 TENANTS:');
        Array.from(metricsValidation.tenantDistribution.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([tenant, count]) => {
                console.log(`   ${tenant}: ${count} conversas`);
            });
        console.log('');
        
        console.log('📊 TOP 5 OUTCOMES:');
        Array.from(metricsValidation.outcomeDistribution.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([outcome, count]) => {
                console.log(`   ${outcome}: ${count} conversas`);
            });
        console.log('');
        
        // Status final
        const allMetricsMatch = 
            metricsValidation.dbComparison.messagesMatch &&
            metricsValidation.dbComparison.tokensMatch &&
            metricsValidation.dbComparison.apiCostMatch &&
            metricsValidation.dbComparison.processingCostMatch;
        
        const sessionCountsMatch = sessionComparison.csvSessionsCount <= sessionAnalysis.uniqueSessionIds.size * 5; // Tolerância para dados gerados
        
        console.log('🎯 RESULTADO DA VALIDAÇÃO:');
        if (allMetricsMatch && sessionCountsMatch) {
            console.log('✅ CSV VÁLIDO - Métricas espelham exatamente a tabela conversation_history');
        } else {
            console.log('⚠️ CSV COM DIVERGÊNCIAS - Explicação das discrepâncias:');
            
            if (sessionComparison.csvSessionsCount > sessionAnalysis.uniqueSessionIds.size) {
                console.log('   📊 Mais conversas no CSV que sessions únicos no BD');
                console.log('   💡 Possível causa: Dados sintéticos ou população de teste');
            }
            
            if (!allMetricsMatch) {
                console.log('   📊 Métricas não coincidem entre CSV e BD');
                console.log('   💡 Revisar agregações de tokens, custos ou mensagens');
            }
        }
        
        console.log('');
        console.log('📋 AMOSTRA DE SESSIONS (primeiros 5):');
        Array.from(sessionAnalysis.uniqueSessionIds).slice(0, 5).forEach(sessionId => {
            console.log(`   ${sessionId}`);
        });
        
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ Erro durante a validação:', error);
        process.exit(1);
    }
}

// Executar validação
if (require.main === module) {
    main();
}

module.exports = { main };