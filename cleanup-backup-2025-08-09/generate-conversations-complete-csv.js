/**
 * SCRIPT DE EXTRAÇÃO COMPLETA: CONVERSATION_HISTORY → CSV POR CONVERSA
 * 
 * Seguindo princípios de Context Engineering:
 * - Context is King: Todos os campos e relacionamentos incluídos
 * - Validation Loops: Validação rigorosa dos dados extraídos
 * - Information Dense: Substituição de IDs por nomes legíveis
 * - Progressive Success: Extração → Agregação → Formatação → Validação → CSV
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Formatar número decimal no padrão brasileiro (vírgula)
 */
function formatBrazilianDecimal(value) {
    if (!value || isNaN(value)) return '0,00';
    return parseFloat(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6
    });
}

/**
 * Formatar data/hora no padrão brasileiro
 */
function formatBrazilianDateTime(isoString) {
    if (!isoString) return '';
    return new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'America/Sao_Paulo'
    }).format(new Date(isoString));
}

/**
 * Escapar campo CSV
 */
function escapeCsvField(field) {
    if (field === null || field === undefined) return '';
    const str = String(field);
    if (str.includes('\"') || str.includes(',') || str.includes('\\n') || str.includes('\\r')) {
        return '\"' + str.replace(/\"/g, '\"\"') + '\"';
    }
    return str;
}

/**
 * Extrair todos os dados da conversation_history em lotes
 */
async function extractAllConversationHistory() {
    console.log('🔍 Extraindo TODOS os dados da conversation_history...');
    
    // Obter contagem total
    const { count: totalCount, error: countError } = await supabase
        .from('conversation_history')
        .select('*', { count: 'exact', head: true });
    
    if (countError) {
        console.error('❌ Erro ao contar conversation_history:', countError);
        throw countError;
    }
    
    console.log(`📊 Total de registros na tabela: ${totalCount}`);
    
    let allMessages = [];
    const batchSize = 1000;
    let offset = 0;
    
    while (offset < totalCount) {
        console.log(`📥 Buscando lote ${Math.floor(offset/batchSize) + 1}/${Math.ceil(totalCount/batchSize)} (offset: ${offset})...`);
        
        const { data, error } = await supabase
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
                tenants:tenant_id (
                    name,
                    domain,
                    business_name,
                    slug
                ),
                users:user_id (
                    name,
                    email,
                    phone
                )
            `)
            .range(offset, offset + batchSize - 1)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('❌ Erro ao extrair lote:', error);
            throw error;
        }
        
        allMessages = allMessages.concat(data || []);
        console.log(`✅ Lote capturado: ${data?.length || 0} registros`);
        
        offset += batchSize;
        
        if (!data || data.length < batchSize) {
            break;
        }
    }
    
    console.log(`✅ Total extraído: ${allMessages.length}/${totalCount} mensagens`);
    
    if (allMessages.length !== totalCount) {
        console.warn(`⚠️ ATENÇÃO: Esperado ${totalCount}, mas obtido ${allMessages.length}`);
    }
    
    return allMessages;
}

/**
 * Agrupar mensagens por conversas (session_id)
 */
function groupMessagesByConversation(messages) {
    console.log('🔄 Agrupando mensagens por conversas (session_id)...');
    
    const conversationMap = new Map();
    let messagesWithoutSession = 0;
    
    messages.forEach(message => {
        const conversationContext = message.conversation_context || {};
        const sessionId = conversationContext.session_id;
        
        if (!sessionId) {
            messagesWithoutSession++;
            return;
        }
        
        if (!conversationMap.has(sessionId)) {
            conversationMap.set(sessionId, {
                session_id: sessionId,
                tenant_id: message.tenant_id,
                user_id: message.user_id,
                tenant_name: message.tenants?.name || 'Sem nome',
                tenant_domain: message.tenants?.domain || 'other',
                tenant_business_name: message.tenants?.business_name || '',
                tenant_slug: message.tenants?.slug || '',
                user_name: message.users?.name || 'Sem nome',
                user_email: message.users?.email || 'Sem email',
                user_phone: message.users?.phone || 'Sem telefone',
                
                // Métricas da conversa
                total_messages: 0,
                user_messages: 0,
                assistant_messages: 0,
                system_messages: 0,
                
                // Timestamps
                conversation_start: message.created_at,
                conversation_end: message.created_at,
                
                // Custos e tokens
                total_tokens: 0,
                total_api_cost_usd: 0,
                total_processing_cost_usd: 0,
                
                // Análise de conteúdo
                intents_detected: new Set(),
                message_types: new Set(),
                models_used: new Set(),
                message_sources: new Set(),
                
                // Scores e outcomes
                avg_confidence_score: 0,
                confidence_scores: [],
                conversation_outcome: null,
                
                // Duração estimada do JSONB
                duration_minutes_jsonb: conversationContext.duration_minutes || 0,
                
                // Lista de mensagens para análise detalhada
                messages: []
            });
        }
        
        const conversation = conversationMap.get(sessionId);
        conversation.messages.push(message);
        conversation.total_messages++;
        
        // Contar tipos de mensagens
        if (message.is_from_user === true) {
            conversation.user_messages++;
        } else if (message.is_from_user === false) {
            conversation.assistant_messages++;
        } else {
            conversation.system_messages++;
        }
        
        // Atualizar timestamps
        const messageDate = new Date(message.created_at);
        if (messageDate < new Date(conversation.conversation_start)) {
            conversation.conversation_start = message.created_at;
        }
        if (messageDate > new Date(conversation.conversation_end)) {
            conversation.conversation_end = message.created_at;
        }
        
        // Acumular custos e tokens
        conversation.total_tokens += message.tokens_used || 0;
        conversation.total_api_cost_usd += message.api_cost_usd || 0;
        conversation.total_processing_cost_usd += message.processing_cost_usd || 0;
        
        // Coletar análises
        if (message.intent_detected) {
            conversation.intents_detected.add(message.intent_detected);
        }
        if (message.message_type) {
            conversation.message_types.add(message.message_type);
        }
        if (message.model_used) {
            conversation.models_used.add(message.model_used);
        }
        if (message.message_source) {
            conversation.message_sources.add(message.message_source);
        }
        
        // Scores de confiança
        if (message.confidence_score) {
            conversation.confidence_scores.push(message.confidence_score);
        }
        
        // Outcome da conversa (pegar o último não-nulo)
        if (message.conversation_outcome) {
            conversation.conversation_outcome = message.conversation_outcome;
        }
    });
    
    console.log(`✅ Agrupados em ${conversationMap.size} conversas únicas`);
    console.log(`⚠️ ${messagesWithoutSession} mensagens sem session_id ignoradas`);
    
    return Array.from(conversationMap.values());
}

/**
 * Processar conversas para formato CSV final
 */
function processConversationsForCsv(conversations) {
    console.log('🔄 Processando conversas para formato CSV...');
    
    const processedConversations = conversations.map(conv => {
        // Calcular duração real em minutos
        const realDurationMs = new Date(conv.conversation_end) - new Date(conv.conversation_start);
        const realDurationMinutes = realDurationMs / (1000 * 60);
        
        // Calcular média de confiança
        const avgConfidence = conv.confidence_scores.length > 0 ? 
            conv.confidence_scores.reduce((sum, score) => sum + score, 0) / conv.confidence_scores.length : 0;
        
        // Custo total
        const totalCostUsd = conv.total_api_cost_usd + conv.total_processing_cost_usd;
        
        // Primeiro e último conteúdo
        const sortedMessages = conv.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const firstMessage = sortedMessages[0]?.content?.substring(0, 100) || '';
        const lastMessage = sortedMessages[sortedMessages.length - 1]?.content?.substring(0, 100) || '';
        
        return {
            // Identificadores únicos
            session_id: conv.session_id,
            
            // Tenant (nomes ao invés de IDs)
            tenant_name: conv.tenant_name,
            tenant_domain: conv.tenant_domain,
            tenant_business_name: conv.tenant_business_name,
            tenant_slug: conv.tenant_slug,
            
            // Usuário (nomes ao invés de IDs)
            user_name: conv.user_name,
            user_email: conv.user_email,
            user_phone: conv.user_phone,
            
            // Métricas de mensagens
            total_messages: conv.total_messages,
            user_messages: conv.user_messages,
            assistant_messages: conv.assistant_messages,
            system_messages: conv.system_messages,
            
            // Timestamps formatados
            conversation_start: formatBrazilianDateTime(conv.conversation_start),
            conversation_end: formatBrazilianDateTime(conv.conversation_end),
            
            // Durações (padrão brasileiro com vírgula)
            duration_minutes_real: formatBrazilianDecimal(realDurationMinutes),
            duration_minutes_jsonb: formatBrazilianDecimal(conv.duration_minutes_jsonb),
            duration_difference: formatBrazilianDecimal(realDurationMinutes - conv.duration_minutes_jsonb),
            
            // Custos e tokens (padrão brasileiro)
            total_tokens: conv.total_tokens,
            total_api_cost_usd: formatBrazilianDecimal(conv.total_api_cost_usd),
            total_processing_cost_usd: formatBrazilianDecimal(conv.total_processing_cost_usd),
            total_cost_usd: formatBrazilianDecimal(totalCostUsd),
            
            // Análises de conteúdo
            intents_detected: Array.from(conv.intents_detected).join('; '),
            message_types: Array.from(conv.message_types).join('; '),
            models_used: Array.from(conv.models_used).join('; '),
            message_sources: Array.from(conv.message_sources).join('; '),
            
            // Scores e outcome
            avg_confidence_score: formatBrazilianDecimal(avgConfidence),
            min_confidence_score: conv.confidence_scores.length > 0 ? 
                formatBrazilianDecimal(Math.min(...conv.confidence_scores)) : '0,00',
            max_confidence_score: conv.confidence_scores.length > 0 ? 
                formatBrazilianDecimal(Math.max(...conv.confidence_scores)) : '0,00',
            conversation_outcome: conv.conversation_outcome || '',
            
            // Amostras de conteúdo
            first_message_preview: firstMessage,
            last_message_preview: lastMessage,
            
            // IDs originais para debug/rastreabilidade
            original_tenant_id: conv.tenant_id,
            original_user_id: conv.user_id
        };
    });
    
    console.log(`✅ Processadas ${processedConversations.length} conversas`);
    return processedConversations;
}

/**
 * Gerar CSV com cabeçalhos
 */
function generateCsv(data) {
    console.log('📝 Gerando arquivo CSV...');
    
    if (!data || data.length === 0) {
        console.warn('⚠️ Nenhum dado para gerar CSV');
        return '';
    }

    // Cabeçalhos do CSV
    const headers = [
        'session_id',
        'tenant_name',
        'tenant_domain',
        'tenant_business_name',
        'tenant_slug',
        'user_name',
        'user_email',
        'user_phone',
        'total_messages',
        'user_messages',
        'assistant_messages',
        'system_messages',
        'conversation_start',
        'conversation_end',
        'duration_minutes_real',
        'duration_minutes_jsonb',
        'duration_difference',
        'total_tokens',
        'total_api_cost_usd',
        'total_processing_cost_usd',
        'total_cost_usd',
        'intents_detected',
        'message_types',
        'models_used',
        'message_sources',
        'avg_confidence_score',
        'min_confidence_score',
        'max_confidence_score',
        'conversation_outcome',
        'first_message_preview',
        'last_message_preview',
        'original_tenant_id',
        'original_user_id'
    ];

    // Gerar linhas CSV
    const csvLines = [headers.join(',')];
    
    data.forEach(row => {
        const csvRow = headers.map(header => escapeCsvField(row[header]));
        csvLines.push(csvRow.join(','));
    });

    console.log(`✅ CSV gerado com ${csvLines.length - 1} linhas de dados + 1 cabeçalho`);
    return csvLines.join('\n');
}

/**
 * Validar dados extraídos contra a tabela original
 */
async function validateExtractedData(conversations, originalMessageCount) {
    console.log('🔍 Validando dados extraídos contra tabela original...');
    
    // Validação básica de contagens
    const totalMessagesInConversations = conversations.reduce((sum, conv) => sum + conv.total_messages, 0);
    const uniqueSessionIds = new Set(conversations.map(conv => conv.session_id));
    
    // Validação contra conversation_history diretamente
    const { data: sessionValidation, error } = await supabase
        .from('conversation_history')
        .select('conversation_context')
        .not('conversation_context->session_id', 'is', null);
    
    if (error) {
        console.error('❌ Erro na validação:', error);
        throw error;
    }
    
    const uniqueSessionsInDB = new Set();
    sessionValidation?.forEach(record => {
        const sessionId = record.conversation_context?.session_id;
        if (sessionId) uniqueSessionsInDB.add(sessionId);
    });
    
    const validationReport = {
        originalMessageCount,
        extractedMessageCount: totalMessagesInConversations,
        conversationsCount: conversations.length,
        uniqueSessionsInDB: uniqueSessionsInDB.size,
        uniqueSessionsExtracted: uniqueSessionIds.size,
        
        // Análises específicas
        conversationsWithTenant: conversations.filter(c => c.tenant_name !== 'Sem nome').length,
        conversationsWithUser: conversations.filter(c => c.user_name !== 'Sem nome').length,
        conversationsWithOutcome: conversations.filter(c => c.conversation_outcome).length,
        conversationsWithCost: conversations.filter(c => c.total_cost_usd !== '0,00').length,
        
        // Distribuições
        tenantDistribution: {},
        outcomeDistribution: {},
        domainDistribution: {}
    };
    
    // Calcular distribuições
    conversations.forEach(conv => {
        // Por tenant
        const tenant = conv.tenant_name || 'Sem nome';
        validationReport.tenantDistribution[tenant] = (validationReport.tenantDistribution[tenant] || 0) + 1;
        
        // Por outcome
        const outcome = conv.conversation_outcome || 'Sem outcome';
        validationReport.outcomeDistribution[outcome] = (validationReport.outcomeDistribution[outcome] || 0) + 1;
        
        // Por domínio
        const domain = conv.tenant_domain || 'Sem domínio';
        validationReport.domainDistribution[domain] = (validationReport.domainDistribution[domain] || 0) + 1;
    });
    
    return validationReport;
}

/**
 * Função principal
 */
async function main() {
    try {
        console.log('🚀 EXTRAÇÃO COMPLETA: CONVERSATION_HISTORY → CSV POR CONVERSA');
        console.log('='.repeat(70));
        
        // 1. Extrair todas as mensagens
        const allMessages = await extractAllConversationHistory();
        
        if (!allMessages || allMessages.length === 0) {
            console.log('⚠️ Nenhuma mensagem encontrada na conversation_history');
            return;
        }
        
        // 2. Agrupar mensagens por conversas
        const conversations = groupMessagesByConversation(allMessages);
        
        // 3. Processar conversas para CSV
        const processedConversations = processConversationsForCsv(conversations);
        
        // 4. Validar dados extraídos
        const validationReport = await validateExtractedData(processedConversations, allMessages.length);
        
        // 5. Gerar CSV
        const csvContent = generateCsv(processedConversations);
        
        // 6. Salvar arquivo
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `conversations-complete-${timestamp}.csv`;
        const filepath = path.join(__dirname, filename);
        
        fs.writeFileSync(filepath, csvContent, 'utf8');
        
        // 7. Relatório final
        console.log('='.repeat(70));
        console.log('📊 RELATÓRIO DE EXTRAÇÃO CONVERSATION_HISTORY → CSV');
        console.log('='.repeat(70));
        console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
        console.log(`📁 Arquivo: ${filename}`);
        console.log(`💾 Tamanho: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`);
        console.log('');
        
        console.log('📈 ESTATÍSTICAS DE EXTRAÇÃO:');
        console.log(`   Mensagens originais no BD: ${validationReport.originalMessageCount}`);
        console.log(`   Mensagens extraídas: ${validationReport.extractedMessageCount}`);
        console.log(`   Diferença: ${validationReport.originalMessageCount - validationReport.extractedMessageCount} (${validationReport.originalMessageCount === validationReport.extractedMessageCount ? '✅ OK' : '⚠️ ATENÇÃO'})`);
        console.log(`   Conversas extraídas: ${validationReport.conversationsCount}`);
        console.log(`   Sessions únicos no BD: ${validationReport.uniqueSessionsInDB}`);
        console.log(`   Sessions extraídos: ${validationReport.uniqueSessionsExtracted}`);
        console.log(`   Cobertura: ${((validationReport.uniqueSessionsExtracted/validationReport.uniqueSessionsInDB)*100).toFixed(1)}%`);
        console.log('');
        
        console.log('🔍 QUALIDADE DOS DADOS:');
        console.log(`   Com tenant: ${validationReport.conversationsWithTenant} (${((validationReport.conversationsWithTenant/validationReport.conversationsCount)*100).toFixed(1)}%)`);
        console.log(`   Com usuário: ${validationReport.conversationsWithUser} (${((validationReport.conversationsWithUser/validationReport.conversationsCount)*100).toFixed(1)}%)`);
        console.log(`   Com outcome: ${validationReport.conversationsWithOutcome} (${((validationReport.conversationsWithOutcome/validationReport.conversationsCount)*100).toFixed(1)}%)`);
        console.log(`   Com custo: ${validationReport.conversationsWithCost} (${((validationReport.conversationsWithCost/validationReport.conversationsCount)*100).toFixed(1)}%)`);
        console.log('');
        
        console.log('🏢 DISTRIBUIÇÃO POR TENANT:');
        Object.entries(validationReport.tenantDistribution)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([tenant, count]) => {
                console.log(`   ${tenant}: ${count} (${((count/validationReport.conversationsCount)*100).toFixed(1)}%)`);
            });
        console.log('');
        
        console.log('📊 DISTRIBUIÇÃO POR OUTCOME:');
        Object.entries(validationReport.outcomeDistribution)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([outcome, count]) => {
                console.log(`   ${outcome}: ${count} (${((count/validationReport.conversationsCount)*100).toFixed(1)}%)`);
            });
        console.log('');
        
        console.log('🏢 DISTRIBUIÇÃO POR DOMÍNIO:');
        Object.entries(validationReport.domainDistribution)
            .sort((a, b) => b[1] - a[1])
            .forEach(([domain, count]) => {
                console.log(`   ${domain}: ${count} (${((count/validationReport.conversationsCount)*100).toFixed(1)}%)`);
            });
        console.log('');
        
        // Status final
        const isValid = 
            validationReport.originalMessageCount === validationReport.extractedMessageCount &&
            validationReport.uniqueSessionsInDB === validationReport.uniqueSessionsExtracted;
        
        console.log(isValid ? 
            '✅ CSV VÁLIDO - Dados espelham exatamente a tabela conversation_history' :
            '⚠️ CSV COM DIVERGÊNCIAS - Revisar inconsistências identificadas'
        );
        
        console.log('');
        console.log('🔗 RECURSOS DO CSV:');
        console.log('   ✅ IDs substituídos por nomes (tenant_name, user_name)');
        console.log('   ✅ Formatação brasileira (vírgula como decimal)');
        console.log('   ✅ Agregação por conversa (session_id)');
        console.log('   ✅ Métricas completas (tokens, custos, durações)');
        console.log('   ✅ Análise de conteúdo (intents, models, outcomes)');
        console.log('   ✅ Validação rigorosa contra BD original');
        
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ Erro durante a extração:', error);
        process.exit(1);
    }
}

// Executar script
if (require.main === module) {
    main();
}

module.exports = { main };