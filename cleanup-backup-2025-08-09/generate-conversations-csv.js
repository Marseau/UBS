/**
 * Gerador de CSV da tabela conversation_history AGRUPADO POR CONVERSA
 * Context Engineering - Relatório por session_id (1041 conversas)
 * 
 * Funcionalidades:
 * - Agrupa mensagens por session_id (conversa)
 * - Calcula minutos de duração por conversa
 * - Substitui IDs por nomes (tenant_id -> tenant_name, user_id -> user_name)
 * - Formatação brasileira para decimais (vírgula)
 * - Remove JSONs aninhados, cria colunas específicas
 * - 1041 registros (conversas) ao invés de 4560 mensagens
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Formata número para padrão brasileiro (vírgula como decimal)
 */
function formatBrazilianNumber(number) {
    if (number === null || number === undefined) return '';
    if (typeof number === 'string') return number;
    return number.toString().replace('.', ',');
}

/**
 * Formata data para ISO string
 */
function formatDate(date) {
    if (!date) return '';
    return new Date(date).toISOString();
}

/**
 * Escapa aspas duplas no CSV
 */
function escapeCsvField(field) {
    if (field === null || field === undefined) return '';
    const stringField = String(field);
    if (stringField.includes('"')) {
        return `"${stringField.replace(/"/g, '""')}"`;
    }
    if (stringField.includes(',') || stringField.includes('\n') || stringField.includes('\r')) {
        return `"${stringField}"`;
    }
    return stringField;
}

/**
 * Gera CSV de conversas agrupadas por session_id
 */
async function generateConversationsCSV() {
    try {
        console.log('🔄 Iniciando geração do CSV por conversa (session_id)...');
        
        // Query direta para buscar todas as mensagens
        let allMessages = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data: messages, error } = await supabase
                .from('conversation_history')
                .select(`
                    conversation_context,
                    tenant_id,
                    user_id,
                    created_at,
                    tokens_used,
                    api_cost_usd,
                    processing_cost_usd,
                    model_used,
                    message_source,
                    intent_detected,
                    confidence_score,
                    conversation_outcome,
                    tenants!inner(
                        name,
                        business_name
                    ),
                    users!inner(
                        name
                    )
                `)
                .order('created_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) {
                throw new Error(`Erro ao buscar dados na página ${page}: ${error.message}`);
            }

            if (!messages || messages.length === 0) {
                hasMore = false;
            } else {
                allMessages = allMessages.concat(messages);
                console.log(`📄 Página ${page + 1} processada: ${messages.length} mensagens (Total: ${allMessages.length})`);
                
                if (messages.length < pageSize) {
                    hasMore = false;
                }
                page++;
            }
        }

        console.log(`📊 Total de mensagens carregadas: ${allMessages.length}`);

        // Agrupar mensagens por session_id
        const conversationsMap = new Map();

        for (const message of allMessages) {
            const sessionId = message.conversation_context?.session_id;
            if (!sessionId) continue;

            if (!conversationsMap.has(sessionId)) {
                conversationsMap.set(sessionId, {
                    session_id: sessionId,
                    tenant_name: message.tenants?.name || '',
                    tenant_business_name: message.tenants?.business_name || '',
                    user_name: message.users?.name || '',
                    messages: [],
                    total_tokens: 0,
                    total_api_cost: 0,
                    total_processing_cost: 0,
                    models_used: new Set(),
                    message_sources: new Set(),
                    intents_detected: new Set(),
                    confidence_scores: [],
                    conversation_outcomes: [],
                    created_at_start: message.created_at,
                    created_at_end: message.created_at
                });
            }

            const conv = conversationsMap.get(sessionId);
            conv.messages.push(message);
            conv.total_tokens += message.tokens_used || 0;
            conv.total_api_cost += parseFloat(message.api_cost_usd || 0);
            conv.total_processing_cost += parseFloat(message.processing_cost_usd || 0);
            
            if (message.model_used) conv.models_used.add(message.model_used);
            if (message.message_source) conv.message_sources.add(message.message_source);
            if (message.intent_detected) conv.intents_detected.add(message.intent_detected);
            if (message.confidence_score) conv.confidence_scores.push(parseFloat(message.confidence_score));
            if (message.conversation_outcome) conv.conversation_outcomes.push(message.conversation_outcome);

            // Atualizar timestamps de início e fim
            if (new Date(message.created_at) < new Date(conv.created_at_start)) {
                conv.created_at_start = message.created_at;
            }
            if (new Date(message.created_at) > new Date(conv.created_at_end)) {
                conv.created_at_end = message.created_at;
            }
        }

        console.log(`📊 Total de conversas agrupadas: ${conversationsMap.size}`);

        // Converter Map para Array e calcular métricas finais
        const conversationsList = Array.from(conversationsMap.values()).map(conv => {
            const durationMs = new Date(conv.created_at_end) - new Date(conv.created_at_start);
            const durationMinutes = Math.round((durationMs / (1000 * 60)) * 100) / 100; // 2 casas decimais

            return {
                session_id: conv.session_id,
                tenant_name: conv.tenant_name,
                tenant_business_name: conv.tenant_business_name,
                user_name: conv.user_name,
                conversation_start: conv.created_at_start,
                conversation_end: conv.created_at_end,
                duration_minutes: durationMinutes,
                messages_count: conv.messages.length,
                total_tokens: conv.total_tokens,
                total_api_cost_usd: conv.total_api_cost,
                total_processing_cost_usd: conv.total_processing_cost,
                total_cost_usd: conv.total_api_cost + conv.total_processing_cost,
                models_used: Array.from(conv.models_used).join(';'),
                message_sources: Array.from(conv.message_sources).join(';'),
                intents_detected: Array.from(conv.intents_detected).join(';'),
                avg_confidence_score: conv.confidence_scores.length > 0 
                    ? conv.confidence_scores.reduce((a, b) => a + b, 0) / conv.confidence_scores.length 
                    : 0,
                conversation_outcomes: Array.from(new Set(conv.conversation_outcomes)).join(';'),
                final_outcome: conv.conversation_outcomes[conv.conversation_outcomes.length - 1] || ''
            };
        });

        // Ordenar por data de início (mais recente primeiro)
        conversationsList.sort((a, b) => new Date(b.conversation_start) - new Date(a.conversation_start));

        // Cabeçalho do CSV
        const headers = [
            'session_id',
            'tenant_name',
            'tenant_business_name', 
            'user_name',
            'conversation_start',
            'conversation_end',
            'duration_minutes',
            'messages_count',
            'total_tokens',
            'total_api_cost_usd',
            'total_processing_cost_usd',
            'total_cost_usd',
            'models_used',
            'message_sources',
            'intents_detected',
            'avg_confidence_score',
            'conversation_outcomes',
            'final_outcome'
        ];

        // Construir linhas do CSV
        const csvLines = [headers.join(',')];

        for (const conv of conversationsList) {
            const row = [
                escapeCsvField(conv.session_id),
                escapeCsvField(conv.tenant_name),
                escapeCsvField(conv.tenant_business_name),
                escapeCsvField(conv.user_name),
                formatDate(conv.conversation_start),
                formatDate(conv.conversation_end),
                formatBrazilianNumber(conv.duration_minutes),
                conv.messages_count,
                conv.total_tokens,
                formatBrazilianNumber(conv.total_api_cost_usd),
                formatBrazilianNumber(conv.total_processing_cost_usd),
                formatBrazilianNumber(conv.total_cost_usd),
                escapeCsvField(conv.models_used),
                escapeCsvField(conv.message_sources),
                escapeCsvField(conv.intents_detected),
                formatBrazilianNumber(conv.avg_confidence_score),
                escapeCsvField(conv.conversation_outcomes),
                escapeCsvField(conv.final_outcome)
            ];

            csvLines.push(row.join(','));
        }

        // Gerar nome do arquivo com timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `conversations-by-session-${timestamp}.csv`;
        const filepath = path.join(process.cwd(), filename);

        // Escrever arquivo CSV
        fs.writeFileSync(filepath, csvLines.join('\n'), 'utf8');

        console.log(`✅ CSV gerado com sucesso: ${filename}`);
        console.log(`📁 Localização: ${filepath}`);
        console.log(`📈 Total de conversas: ${conversationsList.length}`);
        console.log(`📊 Total de linhas: ${csvLines.length - 1} (+ 1 cabeçalho)`);

        return {
            filename,
            filepath,
            totalConversations: conversationsList.length,
            totalLines: csvLines.length,
            conversationsList
        };

    } catch (error) {
        console.error('❌ Erro na geração do CSV:', error.message);
        throw error;
    }
}

/**
 * Validação do CSV de conversas
 */
async function validateConversationsCSV(csvInfo) {
    try {
        console.log('\n🔍 Iniciando validação do CSV de conversas...');

        // Contar conversas únicas na base
        const { data: uniqueData, error: uniqueError } = await supabase
            .from('conversation_history')
            .select('conversation_context')
            .not('conversation_context->session_id', 'is', null);

        if (uniqueError) {
            throw new Error(`Erro ao contar conversas únicas: ${uniqueError.message}`);
        }

        const uniqueSessions = new Set();
        uniqueData.forEach(row => {
            if (row.conversation_context?.session_id) {
                uniqueSessions.add(row.conversation_context.session_id);
            }
        });

        const actualUniqueConversations = uniqueSessions.size;

        console.log(`📊 Conversas únicas na base: ${actualUniqueConversations}`);
        console.log(`📊 Conversas no CSV: ${csvInfo.totalConversations}`);

        // Ler CSV e validar amostragem
        const csvContent = fs.readFileSync(csvInfo.filepath, 'utf8');
        const csvLines = csvContent.split('\n').filter(line => line.trim());
        const csvDataLines = csvLines.slice(1); // Remove header

        // Validação de amostragem - primeiras 3 conversas
        console.log('\n🧪 Validação por amostragem (3 conversas mais recentes)...');
        
        for (let i = 0; i < Math.min(3, csvDataLines.length); i++) {
            const csvRow = csvDataLines[i].split(',');
            const sessionId = csvRow[0];
            const durationMinutes = csvRow[6];
            const messagesCount = csvRow[7];
            
            console.log(`   Conversa ${i + 1}: ${sessionId} - ${durationMinutes} min - ${messagesCount} mensagens`);
        }

        const validation = {
            recordCountMatch: actualUniqueConversations === csvInfo.totalConversations,
            hasHeader: csvLines[0].includes('session_id,tenant_name'),
            hasData: csvDataLines.length > 0,
            validFormat: csvLines.every(line => line.split(',').length >= 18),
            expectedCount: 1041,
            actualCount: csvInfo.totalConversations,
            isCorrectFormat: csvInfo.totalConversations === 1041
        };

        return {
            ...validation,
            csvInfo,
            summary: {
                expectedConversations: 1041,
                actualConversations: csvInfo.totalConversations,
                csvRecords: csvDataLines.length,
                headerPresent: validation.hasHeader,
                formatValid: validation.validFormat,
                dataIntegrity: validation.recordCountMatch && validation.isCorrectFormat
            }
        };

    } catch (error) {
        console.error('❌ Erro na validação:', error.message);
        throw error;
    }
}

/**
 * Função principal
 */
async function main() {
    try {
        console.log('🚀 Context Engineering - CSV de Conversas por Session_ID');
        console.log('=' .repeat(60));

        // Gerar CSV
        const csvInfo = await generateConversationsCSV();

        // Validar CSV
        const validation = await validateConversationsCSV(csvInfo);

        // Relatório final
        console.log('\n📋 RELATÓRIO DE VALIDAÇÃO - CONVERSAS');
        console.log('=' .repeat(50));
        console.log(`✅ Arquivo gerado: ${validation.csvInfo.filename}`);
        console.log(`✅ Conversas esperadas: ${validation.summary.expectedConversations}`);
        console.log(`✅ Conversas no CSV: ${validation.summary.actualConversations}`);
        console.log(`✅ Formato correto (1041): ${validation.summary.actualConversations === 1041 ? 'SIM' : 'NÃO'}`);
        console.log(`✅ Cabeçalho presente: ${validation.summary.headerPresent ? 'SIM' : 'NÃO'}`);
        console.log(`✅ Formato válido: ${validation.summary.formatValid ? 'SIM' : 'NÃO'}`);
        console.log(`✅ Integridade dos dados: ${validation.summary.dataIntegrity ? 'SIM' : 'NÃO'}`);

        if (validation.summary.dataIntegrity && validation.summary.actualConversations === 1041) {
            console.log('\n🎉 CSV de CONVERSAS gerado e validado com SUCESSO!');
            console.log('📈 1041 conversas únicas exportadas corretamente.');
            console.log('⏱️ Coluna de minutos por conversa incluída.');
            console.log('🚫 JSON aninhado removido e substituído por colunas específicas.');
        } else {
            console.log('\n⚠️ CSV gerado mas com inconsistências detectadas.');
            console.log('🔧 Verifique os logs acima para detalhes.');
        }

    } catch (error) {
        console.error('\n💥 ERRO CRÍTICO:', error.message);
        process.exit(1);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = {
    generateConversationsCSV,
    validateConversationsCSV,
    formatBrazilianNumber,
    escapeCsvField
};