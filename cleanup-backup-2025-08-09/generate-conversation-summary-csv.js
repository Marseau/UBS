/**
 * GERADOR DE CSV RESUMO POR CONVERSA - conversation_history
 * Context Engineering COLEAM00 - Agrupamento por session_id
 * 
 * Funcionalidades:
 * - Agrupa mensagens por conversa (session_id)
 * - Extrai campos JSON do conversation_context
 * - Calcula métricas por conversa (mensagens, duração, custos)
 * - Tratamento adequado para CSV com campos JSON aninhados
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
 * Formata número para CSV (ponto como decimal para compatibilidade)
 */
function formatCsvNumber(number) {
    if (number === null || number === undefined || number === '') return '0.00';
    if (typeof number === 'string') return number;
    return parseFloat(number).toFixed(4);
}

/**
 * Formata data para CSV (sem vírgulas para compatibilidade)
 */
function formatCsvDateTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    const second = date.getSeconds().toString().padStart(2, '0');
    
    return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}

/**
 * Escapa aspas duplas e caracteres especiais no CSV
 */
function escapeCsvField(field) {
    if (field === null || field === undefined) return '';
    const stringField = String(field);
    
    // Se contém aspas duplas, vírgulas, quebras de linha ou tabs
    if (stringField.includes('"') || stringField.includes(',') || 
        stringField.includes('\n') || stringField.includes('\r') || 
        stringField.includes('\t')) {
        // Escapa aspas duplas duplicando-as e envolve todo o campo em aspas
        return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
}

/**
 * Extrai campos do conversation_context JSON
 */
function extractContextFields(conversationContext) {
    const defaultFields = {
        session_id: '',
        duration_minutes: 0,
        appointment_id: '',
        booking_status: '',
        customer_id: '',
        service_requested: '',
        additional_context: ''
    };

    if (!conversationContext || typeof conversationContext !== 'object') {
        return defaultFields;
    }

    // Extrair campos conhecidos
    const extracted = {
        session_id: conversationContext.session_id || '',
        duration_minutes: parseFloat(conversationContext.duration_minutes) || 0,
        appointment_id: conversationContext.appointment_id || '',
        booking_status: conversationContext.booking_status || '',
        customer_id: conversationContext.customer_id || '',
        service_requested: conversationContext.service_requested || '',
        additional_context: ''
    };

    // Capturar campos adicionais como JSON string para não perder informação
    const knownFields = ['session_id', 'duration_minutes', 'appointment_id', 'booking_status', 'customer_id', 'service_requested'];
    const additionalFields = {};
    
    Object.keys(conversationContext).forEach(key => {
        if (!knownFields.includes(key)) {
            additionalFields[key] = conversationContext[key];
        }
    });

    if (Object.keys(additionalFields).length > 0) {
        extracted.additional_context = JSON.stringify(additionalFields);
    }

    return extracted;
}

/**
 * Busca todas as conversas e agrupa por session_id
 */
async function fetchAndGroupConversations() {
    try {
        console.log('🔄 Buscando todas as mensagens da conversation_history...');
        
        let allMessages = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data: messages, error } = await supabase
                .from('conversation_history')
                .select(`
                    id,
                    tenant_id,
                    user_id,
                    content,
                    is_from_user,
                    message_type,
                    intent_detected,
                    confidence_score,
                    conversation_context,
                    created_at,
                    tokens_used,
                    api_cost_usd,
                    model_used,
                    message_source,
                    processing_cost_usd,
                    conversation_outcome,
                    tenants!inner(
                        name,
                        business_name,
                        domain
                    ),
                    users!inner(
                        name,
                        email,
                        phone
                    )
                `)
                .order('created_at', { ascending: true }) // Ordem cronológica
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) {
                throw new Error(`Erro ao buscar mensagens na página ${page}: ${error.message}`);
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

        console.log(`📊 Total de mensagens coletadas: ${allMessages.length}`);

        // Agrupar mensagens por session_id
        console.log('🔄 Agrupando mensagens por conversa (session_id)...');
        const conversationsMap = new Map();

        allMessages.forEach(message => {
            const contextFields = extractContextFields(message.conversation_context);
            const sessionId = contextFields.session_id || `fallback_${message.tenant_id}_${message.user_id}`;

            if (!conversationsMap.has(sessionId)) {
                conversationsMap.set(sessionId, {
                    session_id: sessionId,
                    tenant_name: message.tenants?.name || '',
                    tenant_business_name: message.tenants?.business_name || '',
                    tenant_domain: message.tenants?.domain || '',
                    user_name: message.users?.name || '',
                    user_email: message.users?.email || '',
                    user_phone: message.users?.phone || '',
                    
                    // Contexto da conversa (extraído do primeiro contexto)
                    duration_minutes: contextFields.duration_minutes,
                    appointment_id: contextFields.appointment_id,
                    booking_status: contextFields.booking_status,
                    customer_id: contextFields.customer_id,
                    service_requested: contextFields.service_requested,
                    additional_context: contextFields.additional_context,
                    
                    // Timestamps
                    conversation_start: message.created_at,
                    conversation_end: message.created_at,
                    
                    // Métricas agregadas
                    total_messages: 0,
                    user_messages: 0,
                    system_messages: 0,
                    total_tokens_used: 0,
                    total_api_cost_usd: 0,
                    total_processing_cost_usd: 0,
                    
                    // Conteúdo da conversa (resumo)
                    first_user_message: '',
                    last_message: '',
                    conversation_outcome: '',
                    
                    // Detecção de intenção
                    primary_intent: '',
                    avg_confidence_score: 0,
                    confidence_scores: [],
                    
                    // Modelos utilizados
                    models_used: new Set(),
                    message_sources: new Set()
                });
            }

            const conversation = conversationsMap.get(sessionId);
            
            // Atualizar métricas agregadas
            conversation.total_messages++;
            if (message.is_from_user) {
                conversation.user_messages++;
                if (!conversation.first_user_message && message.content) {
                    conversation.first_user_message = message.content.substring(0, 100); // Primeiros 100 chars
                }
            } else {
                conversation.system_messages++;
            }
            
            // Atualizar timestamps
            if (new Date(message.created_at) < new Date(conversation.conversation_start)) {
                conversation.conversation_start = message.created_at;
            }
            if (new Date(message.created_at) > new Date(conversation.conversation_end)) {
                conversation.conversation_end = message.created_at;
                conversation.last_message = message.content ? message.content.substring(0, 100) : '';
            }
            
            // Agregar custos e tokens
            conversation.total_tokens_used += parseInt(message.tokens_used) || 0;
            conversation.total_api_cost_usd += parseFloat(message.api_cost_usd) || 0;
            conversation.total_processing_cost_usd += parseFloat(message.processing_cost_usd) || 0;
            
            // Confidence scores
            if (message.confidence_score && !isNaN(parseFloat(message.confidence_score))) {
                conversation.confidence_scores.push(parseFloat(message.confidence_score));
            }
            
            // Intent detection (usar o último intent detectado)
            if (message.intent_detected) {
                conversation.primary_intent = message.intent_detected;
            }
            
            // Conversation outcome (usar o último outcome)
            if (message.conversation_outcome) {
                conversation.conversation_outcome = message.conversation_outcome;
            }
            
            // Modelos e sources utilizados
            if (message.model_used) {
                conversation.models_used.add(message.model_used);
            }
            if (message.message_source) {
                conversation.message_sources.add(message.message_source);
            }
            
            // Atualizar duração se veio do contexto atual
            if (contextFields.duration_minutes > conversation.duration_minutes) {
                conversation.duration_minutes = contextFields.duration_minutes;
            }
        });

        // Processar médias e converter Sets para strings
        const conversationsArray = Array.from(conversationsMap.values()).map(conv => {
            // Calcular média de confidence
            if (conv.confidence_scores.length > 0) {
                conv.avg_confidence_score = conv.confidence_scores.reduce((sum, score) => sum + score, 0) / conv.confidence_scores.length;
            }
            
            // Converter Sets para strings
            conv.models_used = Array.from(conv.models_used).join('; ');
            conv.message_sources = Array.from(conv.message_sources).join('; ');
            
            // Remover array de confidence_scores (não é necessário no CSV)
            delete conv.confidence_scores;
            
            return conv;
        });

        console.log(`✅ Total de conversas agrupadas: ${conversationsArray.length}`);
        return conversationsArray;

    } catch (error) {
        console.error('❌ Erro ao buscar e agrupar conversas:', error.message);
        throw error;
    }
}

/**
 * Gera CSV agrupado por conversa
 */
async function generateConversationSummaryCSV() {
    try {
        console.log('🚀 Context Engineering - Geração de CSV resumo por conversa');
        console.log('=' .repeat(70));
        
        // Buscar e agrupar conversas
        const conversations = await fetchAndGroupConversations();

        if (!conversations || conversations.length === 0) {
            console.warn('⚠️ Nenhuma conversa encontrada');
            return null;
        }

        // Cabeçalhos do CSV (campos específicos para análise)
        const headers = [
            'session_id',
            'tenant_name',
            'tenant_business_name', 
            'tenant_domain',
            'user_name',
            'user_email',
            'user_phone',
            'duration_minutes',
            'appointment_id',
            'booking_status',
            'service_requested',
            'conversation_start',
            'conversation_end',
            'total_messages',
            'user_messages',
            'system_messages',
            'first_user_message',
            'last_message',
            'conversation_outcome',
            'primary_intent',
            'avg_confidence_score',
            'total_tokens_used',
            'total_api_cost_usd',
            'total_processing_cost_usd',
            'models_used',
            'message_sources',
            'additional_context'
        ];

        // Construir linhas do CSV
        const csvLines = [headers.join(',')];

        conversations.forEach(conv => {
            const row = [
                escapeCsvField(conv.session_id),
                escapeCsvField(conv.tenant_name),
                escapeCsvField(conv.tenant_business_name),
                escapeCsvField(conv.tenant_domain),
                escapeCsvField(conv.user_name),
                escapeCsvField(conv.user_email),
                escapeCsvField(conv.user_phone),
                formatCsvNumber(conv.duration_minutes),
                escapeCsvField(conv.appointment_id),
                escapeCsvField(conv.booking_status),
                escapeCsvField(conv.service_requested),
                formatCsvDateTime(conv.conversation_start),
                formatCsvDateTime(conv.conversation_end),
                conv.total_messages || 0,
                conv.user_messages || 0,
                conv.system_messages || 0,
                escapeCsvField(conv.first_user_message),
                escapeCsvField(conv.last_message),
                escapeCsvField(conv.conversation_outcome),
                escapeCsvField(conv.primary_intent),
                formatCsvNumber(conv.avg_confidence_score),
                conv.total_tokens_used || 0,
                formatCsvNumber(conv.total_api_cost_usd),
                formatCsvNumber(conv.total_processing_cost_usd),
                escapeCsvField(conv.models_used),
                escapeCsvField(conv.message_sources),
                escapeCsvField(conv.additional_context)
            ];

            csvLines.push(row.join(','));
        });

        // Gerar nome do arquivo com timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `conversation-summary-by-conversation-${timestamp}.csv`;
        const filepath = path.join(process.cwd(), filename);

        // Escrever arquivo CSV
        fs.writeFileSync(filepath, csvLines.join('\n'), 'utf8');

        console.log(`✅ CSV de resumo por conversa gerado: ${filename}`);
        console.log(`📁 Localização: ${filepath}`);
        console.log(`📊 Total de conversas: ${conversations.length}`);
        console.log(`📈 Total de linhas: ${csvLines.length - 1} (+ 1 cabeçalho)`);

        return {
            filename,
            filepath,
            totalConversations: conversations.length,
            totalLines: csvLines.length,
            conversations
        };

    } catch (error) {
        console.error('❌ Erro na geração do CSV por conversa:', error.message);
        throw error;
    }
}

/**
 * Análise estatística das conversas
 */
function analyzeConversations(conversations) {
    console.log('\n📊 ANÁLISE ESTATÍSTICA DAS CONVERSAS');
    console.log('=' .repeat(50));

    // Estatísticas básicas
    const totalConversations = conversations.length;
    const totalDuration = conversations.reduce((sum, conv) => sum + (conv.duration_minutes || 0), 0);
    const avgDuration = totalDuration / totalConversations;
    const totalMessages = conversations.reduce((sum, conv) => sum + (conv.total_messages || 0), 0);
    const avgMessagesPerConversation = totalMessages / totalConversations;
    const totalCost = conversations.reduce((sum, conv) => sum + (parseFloat(conv.total_api_cost_usd) || 0), 0);

    console.log(`📈 Total de conversas: ${totalConversations}`);
    console.log(`⏱️ Duração total: ${formatCsvNumber(totalDuration)} minutos`);
    console.log(`📊 Duração média por conversa: ${formatCsvNumber(avgDuration)} minutos`);
    console.log(`💬 Total de mensagens: ${totalMessages}`);
    console.log(`📊 Média de mensagens por conversa: ${formatCsvNumber(avgMessagesPerConversation)}`);
    console.log(`💰 Custo total API: US$ ${formatCsvNumber(totalCost)}`);

    // Breakdown por tenant
    const tenantBreakdown = {};
    const domainBreakdown = {};
    const outcomeBreakdown = {};

    conversations.forEach(conv => {
        // Por tenant
        const tenant = conv.tenant_name || 'Sem nome';
        tenantBreakdown[tenant] = (tenantBreakdown[tenant] || 0) + 1;

        // Por domínio
        const domain = conv.tenant_domain || 'other';
        domainBreakdown[domain] = (domainBreakdown[domain] || 0) + 1;

        // Por outcome
        const outcome = conv.conversation_outcome || 'sem_outcome';
        outcomeBreakdown[outcome] = (outcomeBreakdown[outcome] || 0) + 1;
    });

    console.log('\n🏢 TOP 5 TENANTS POR CONVERSAS:');
    Object.entries(tenantBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([tenant, count]) => {
            console.log(`   ${tenant}: ${count} (${((count/totalConversations)*100).toFixed(1)}%)`);
        });

    console.log('\n🎯 BREAKDOWN POR DOMÍNIO:');
    Object.entries(domainBreakdown)
        .sort((a, b) => b[1] - a[1])
        .forEach(([domain, count]) => {
            console.log(`   ${domain}: ${count} (${((count/totalConversations)*100).toFixed(1)}%)`);
        });

    console.log('\n🎭 BREAKDOWN POR OUTCOME:');
    Object.entries(outcomeBreakdown)
        .sort((a, b) => b[1] - a[1])
        .forEach(([outcome, count]) => {
            console.log(`   ${outcome}: ${count} (${((count/totalConversations)*100).toFixed(1)}%)`);
        });

    return {
        totalConversations,
        avgDuration,
        avgMessagesPerConversation,
        totalCost,
        tenantBreakdown,
        domainBreakdown,
        outcomeBreakdown
    };
}

/**
 * Função principal
 */
async function main() {
    try {
        const result = await generateConversationSummaryCSV();
        
        if (result) {
            // Análise estatística
            const analysis = analyzeConversations(result.conversations);
            
            // Relatório final
            console.log('\n✅ GERAÇÃO COMPLETA DE CSV POR CONVERSA');
            console.log('=' .repeat(50));
            console.log(`📁 Arquivo: ${result.filename}`);
            console.log(`🔗 Conversas agrupadas por session_id`);
            console.log(`📊 Duração extraída do conversation_context`);
            console.log(`🇧🇷 Formatação brasileira aplicada`);
            console.log(`🔍 Campos JSON tratados adequadamente`);
            console.log(`📈 Análise estatística completa`);
            
            return result;
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
    generateConversationSummaryCSV,
    extractContextFields,
    formatCsvNumber,
    escapeCsvField
};