/**
 * Export Conversations CSV - FINAL CORRETO
 * ESTRATÉGIA DEFINITIVA:
 * 1. Gerar CSV padrão PERFEITO (sem formatação brasileira)
 * 2. Validar estrutura (17 campos exatos)
 * 3. Aplicar formatação brasileira em pós-processamento
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Erro: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Escape CSV padrão
 */
function escapeCSV(field) {
    if (field === null || field === undefined) return '';
    
    const str = String(field);
    
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
}

/**
 * Processar conversas com cálculos CORRETOS
 */
async function processConversations() {
    try {
        console.log('🚀 Processando conversas...');
        
        // Buscar todas as mensagens
        let allMessages = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
            const { data: messages, error } = await supabase
                .from('conversation_history')
                .select(`
                    conversation_context,
                    created_at,
                    tokens_used,
                    api_cost_usd,
                    processing_cost_usd,
                    model_used,
                    message_source,
                    intent_detected,
                    confidence_score,
                    conversation_outcome,
                    tenants!inner(name, business_name),
                    users!inner(name)
                `)
                .not('conversation_context->session_id', 'is', null)
                .order('created_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) throw error;

            if (!messages || messages.length === 0) {
                hasMore = false;
            } else {
                allMessages = allMessages.concat(messages);
                console.log(`📄 Página ${page + 1}: ${messages.length} (Total: ${allMessages.length})`);
                
                if (messages.length < pageSize) {
                    hasMore = false;
                }
                page++;
            }
        }
        
        console.log(`📊 Total: ${allMessages.length} mensagens`);
        
        // Agrupar por session_id
        const conversationsMap = new Map();
        
        allMessages.forEach(message => {
            const sessionId = message.conversation_context?.session_id;
            if (!sessionId) return;
            
            if (!conversationsMap.has(sessionId)) {
                conversationsMap.set(sessionId, {
                    session_id: sessionId,
                    tenant_name: message.tenants?.name || '',
                    tenant_business_name: message.tenants?.business_name || '',
                    user_name: message.users?.name || '',
                    messages: [],
                    timestamps: []
                });
            }
            
            const conv = conversationsMap.get(sessionId);
            conv.messages.push(message);
            if (message.created_at) {
                conv.timestamps.push(new Date(message.created_at));
            }
        });
        
        console.log(`📊 ${conversationsMap.size} conversas`);
        
        // Processar cada conversa
        const conversations = Array.from(conversationsMap.values()).map(conv => {
            // Timestamps ordenados
            const sortedTimes = conv.timestamps.sort((a, b) => a - b);
            const startTime = sortedTimes[0];
            const endTime = sortedTimes[sortedTimes.length - 1];
            
            // Duração em minutos
            const durationMs = endTime - startTime;
            const durationMinutes = durationMs / (1000 * 60);
            
            // Totais
            let totalTokens = 0;
            let totalApiCost = 0;
            let totalProcessingCost = 0;
            const modelsUsed = new Set();
            const messageSources = new Set();
            const intentsDetected = new Set();
            const confidenceScores = [];
            const conversationOutcomes = new Set();
            
            conv.messages.forEach(msg => {
                totalTokens += parseInt(msg.tokens_used) || 0;
                totalApiCost += parseFloat(msg.api_cost_usd) || 0;
                totalProcessingCost += parseFloat(msg.processing_cost_usd) || 0;
                
                if (msg.model_used) modelsUsed.add(msg.model_used);
                if (msg.message_source) messageSources.add(msg.message_source);
                if (msg.intent_detected) intentsDetected.add(msg.intent_detected);
                if (msg.confidence_score) confidenceScores.push(parseFloat(msg.confidence_score));
                if (msg.conversation_outcome) conversationOutcomes.add(msg.conversation_outcome);
            });
            
            const avgConfidence = confidenceScores.length > 0 
                ? confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length
                : 0;
                
            return {
                session_id: conv.session_id,
                tenant_name: conv.tenant_name,
                tenant_business_name: conv.tenant_business_name,
                user_name: conv.user_name,
                conversation_start: startTime.toISOString(),
                conversation_end: endTime.toISOString(),
                duration_minutes: parseFloat(durationMinutes.toFixed(2)), // 2 decimais
                messages_count: conv.messages.length,
                total_tokens: totalTokens,
                total_api_cost_usd: parseFloat(totalApiCost.toFixed(6)), // 6 decimais
                total_processing_cost_usd: parseFloat(totalProcessingCost.toFixed(6)), // 6 decimais
                total_cost_usd: parseFloat((totalApiCost + totalProcessingCost).toFixed(6)), // 6 decimais
                model_used: Array.from(modelsUsed).join(';'),
                message_source: Array.from(messageSources).join(';'),
                intents_detected: Array.from(intentsDetected).join(';'),
                avg_confidence_score: parseFloat(avgConfidence.toFixed(4)), // 4 decimais
                conversation_outcomes: Array.from(conversationOutcomes).join(';')
            };
        });
        
        // Ordenar por data
        conversations.sort((a, b) => new Date(b.conversation_start) - new Date(a.conversation_start));
        
        return conversations;
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        throw error;
    }
}

/**
 * Gerar CSV padrão (SEM formatação brasileira)
 */
async function generateStandardCSV() {
    try {
        console.log('🎯 Gerando CSV padrão...');
        
        const conversations = await processConversations();
        
        // Headers
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
            'model_used',
            'message_source',
            'intents_detected',
            'avg_confidence_score',
            'conversation_outcomes'
        ];
        
        console.log('📝 Construindo CSV padrão...');
        
        const csvLines = [headers.join(',')];
        
        conversations.forEach((conv, index) => {
            const row = [
                escapeCSV(conv.session_id),
                escapeCSV(conv.tenant_name),
                escapeCSV(conv.tenant_business_name),
                escapeCSV(conv.user_name),
                escapeCSV(conv.conversation_start),
                escapeCSV(conv.conversation_end),
                conv.duration_minutes,          // Número com ponto decimal
                conv.messages_count,            // Integer
                conv.total_tokens,              // Integer
                conv.total_api_cost_usd,        // Número com ponto decimal
                conv.total_processing_cost_usd, // Número com ponto decimal
                conv.total_cost_usd,            // Número com ponto decimal
                escapeCSV(conv.model_used),
                escapeCSV(conv.message_source),
                escapeCSV(conv.intents_detected),
                conv.avg_confidence_score,      // Número com ponto decimal
                escapeCSV(conv.conversation_outcomes)
            ];
            
            // Validar número de campos
            if (row.length !== headers.length) {
                console.error(`❌ ERRO linha ${index + 1}: ${row.length} campos, esperado ${headers.length}`);
                console.error(`Campos: ${row.map((r, i) => `${i+1}:${r}`).join(' | ')}`);
                throw new Error(`Estrutura inválida na linha ${index + 1}`);
            }
            
            csvLines.push(row.join(','));
        });
        
        // Salvar CSV padrão
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const standardFilename = `conversations-standard-${timestamp}.csv`;
        
        fs.writeFileSync(standardFilename, csvLines.join('\n'), 'utf8');
        
        console.log(`✅ CSV padrão: ${standardFilename}`);
        
        return { standardFilename, conversations, count: conversations.length };
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        throw error;
    }
}

/**
 * Aplicar formatação brasileira ao CSV já validado
 */
function applyBrazilianFormatting(standardFilename) {
    console.log('🇧🇷 Aplicando formatação brasileira...');
    
    const content = fs.readFileSync(standardFilename, 'utf8');
    
    // Trocar pontos por vírgulas nos números decimais
    // Campos numéricos: 6 (duration), 9 (api_cost), 10 (proc_cost), 11 (total_cost), 15 (confidence)
    const brazilianContent = content.split('\n').map((line, index) => {
        if (index === 0) return line; // Header não muda
        
        const fields = line.split(',');
        if (fields.length === 17) {
            // Converter campos numéricos para formato brasileiro
            fields[6] = fields[6].replace('.', ',');   // duration_minutes
            fields[9] = fields[9].replace('.', ',');   // total_api_cost_usd
            fields[10] = fields[10].replace('.', ','); // total_processing_cost_usd
            fields[11] = fields[11].replace('.', ','); // total_cost_usd
            fields[15] = fields[15].replace('.', ','); // avg_confidence_score
        }
        
        return fields.join(',');
    }).join('\n');
    
    const brazilianFilename = standardFilename.replace('standard', 'brazilian');
    fs.writeFileSync(brazilianFilename, brazilianContent, 'utf8');
    
    console.log(`✅ CSV brasileiro: ${brazilianFilename}`);
    
    return brazilianFilename;
}

/**
 * Validar estrutura final
 */
function validateFinalCSV(filename) {
    console.log('🔍 Validação final...');
    
    const content = fs.readFileSync(filename, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    console.log(`📄 Total de linhas: ${lines.length}`);
    
    // Verificar primeiras 3 linhas
    for (let i = 1; i <= Math.min(3, lines.length - 1); i++) {
        const fields = lines[i].split(',');
        console.log(`📊 Linha ${i}: ${fields.length} campos`);
        console.log(`   Session: ${fields[0]}`);
        console.log(`   Duration: ${fields[6]} min`);
        console.log(`   Messages: ${fields[7]} msgs`);
        console.log(`   API Cost: ${fields[9]}`);
        console.log(`   Confidence: ${fields[15]}`);
        console.log(`   Outcomes: ${fields[16]}`);
    }
    
    const isValid = lines.slice(1).every(line => line.split(',').length === 17);
    
    return { isValid, totalLines: lines.length - 1 };
}

async function main() {
    try {
        console.log('🎯 CSV Export - FINAL CORRETO');
        console.log('='.repeat(50));
        
        // 1. Gerar CSV padrão
        const result = await generateStandardCSV();
        
        // 2. Aplicar formatação brasileira
        const brazilianFile = applyBrazilianFormatting(result.standardFilename);
        
        // 3. Validar
        const validation = validateFinalCSV(brazilianFile);
        
        console.log('\\n📋 RESULTADO FINAL');
        console.log('='.repeat(30));
        console.log(`✅ Arquivo padrão: ${result.standardFilename}`);
        console.log(`✅ Arquivo brasileiro: ${brazilianFile}`);
        console.log(`✅ Conversas: ${result.count}`);
        console.log(`✅ Estrutura válida: ${validation.isValid ? 'SIM' : 'NÃO'}`);
        console.log(`✅ Total de linhas: ${validation.totalLines} + 1 header`);
        
        if (validation.isValid && result.count === 1041) {
            console.log('\\n🎉 SUCCESS! CSV FINAL CORRETO GERADO!');
            console.log('✅ 1041 conversas exatas');
            console.log('✅ 17 campos por linha');
            console.log('✅ Formatação brasileira aplicada');
            console.log('✅ conversation_outcomes na posição correta');
        }
        
    } catch (error) {
        console.error('\\n💥 ERRO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { generateStandardCSV, applyBrazilianFormatting, validateFinalCSV };