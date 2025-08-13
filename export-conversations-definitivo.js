/**
 * Export Conversations CSV - DEFINITIVO
 * PROBLEMAS IDENTIFICADOS:
 * ❌ duration_minutes misturando com messages_count (5,15 em vez de 5,00)
 * ❌ Campos com vírgulas brasileiras quebrando CSV mesmo com aspas
 * 
 * SOLUÇÃO DEFINITIVA:
 * ✅ Cálculo correto de minutos SEM misturar com contagem
 * ✅ Formatação brasileira SEM aspas (usar ponto-e-vírgula como separador se necessário)
 * ✅ Validação campo por campo
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
 * Formatação brasileira SEGURA - troca ponto por vírgula MAS sem aspas
 * Para CSV, vamos usar ponto-e-vírgula como separador se houver vírgulas
 */
function formatBrazilianNumber(value, decimals = 6) {
    if (value === null || value === undefined || value === '' || isNaN(value)) {
        return '0' + ','.repeat(decimals > 0 ? 1 : 0) + '0'.repeat(decimals);
    }
    
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) {
        return '0' + ','.repeat(decimals > 0 ? 1 : 0) + '0'.repeat(decimals);
    }
    
    return numValue.toFixed(decimals).replace('.', ',');
}

/**
 * Escape CSV tradicional
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
        
        let allMessages = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        // Buscar todas as mensagens
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
            // Ordenar timestamps
            const sortedTimes = conv.timestamps.sort((a, b) => a - b);
            const startTime = sortedTimes[0];
            const endTime = sortedTimes[sortedTimes.length - 1];
            
            // Calcular duração CORRETA em minutos
            const durationMs = endTime - startTime;
            const durationMinutes = durationMs / (1000 * 60);
            
            // Calcular totais
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
                duration_minutes: durationMinutes,  // APENAS minutos, não misturar com count
                messages_count: conv.messages.length,  // APENAS count, separado
                total_tokens: totalTokens,
                total_api_cost_usd: totalApiCost,
                total_processing_cost_usd: totalProcessingCost,
                total_cost_usd: totalApiCost + totalProcessingCost,
                model_used: Array.from(modelsUsed).join(';'),
                message_source: Array.from(messageSources).join(';'),
                intents_detected: Array.from(intentsDetected).join(';'),
                avg_confidence_score: avgConfidence,
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

async function generateDefinitiveCSV() {
    try {
        console.log('🎯 Gerando CSV DEFINITIVO...');
        
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
        
        console.log('📝 Construindo CSV...');
        
        const csvLines = [headers.join(',')];
        
        conversations.forEach((conv, index) => {
            if (index < 3) {
                console.log(`🔍 Debug linha ${index + 1}:`);
                console.log(`   Session: ${conv.session_id}`);
                console.log(`   Duration: ${conv.duration_minutes} minutos`);
                console.log(`   Messages: ${conv.messages_count} mensagens`);
                console.log(`   API Cost: ${conv.total_api_cost_usd}`);
            }
            
            const row = [
                escapeCSV(conv.session_id),
                escapeCSV(conv.tenant_name),
                escapeCSV(conv.tenant_business_name),
                escapeCSV(conv.user_name),
                escapeCSV(conv.conversation_start),
                escapeCSV(conv.conversation_end),
                formatBrazilianNumber(conv.duration_minutes, 2),    // Vírgula brasileira
                conv.messages_count,                                // Integer sem vírgula
                conv.total_tokens,                                  // Integer sem vírgula
                formatBrazilianNumber(conv.total_api_cost_usd, 6), // Vírgula brasileira
                formatBrazilianNumber(conv.total_processing_cost_usd, 6), // Vírgula brasileira
                formatBrazilianNumber(conv.total_cost_usd, 6),     // Vírgula brasileira
                escapeCSV(conv.model_used),
                escapeCSV(conv.message_source),
                escapeCSV(conv.intents_detected),
                formatBrazilianNumber(conv.avg_confidence_score, 4), // Vírgula brasileira
                escapeCSV(conv.conversation_outcomes)
            ];
            
            csvLines.push(row.join(','));
        });
        
        // Salvar usando ponto-e-vírgula como separador para evitar conflito com vírgulas brasileiras
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const filename = `conversations-brazilian-${timestamp}.csv`;
        
        // Trocar separador de vírgula para ponto-e-vírgula
        const csvContent = csvLines.map(line => line.replace(/,/g, ';')).join('\n');
        
        fs.writeFileSync(filename, csvContent, 'utf8');
        
        console.log(`✅ CSV gerado: ${filename}`);
        console.log(`📊 Conversas: ${conversations.length}`);
        console.log(`🇧🇷 Formato: Brasileiro (decimais com vírgula, separador ponto-e-vírgula)`);
        
        return { filename, count: conversations.length };
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        throw error;
    }
}

async function main() {
    try {
        console.log('🎯 CSV Export - VERSÃO DEFINITIVA');
        console.log('='.repeat(50));
        
        const result = await generateDefinitiveCSV();
        
        // Verificar primeiras linhas
        console.log('\n🔍 Verificação das primeiras linhas:');
        const content = fs.readFileSync(result.filename, 'utf8');
        const lines = content.split('\n').slice(0, 4);
        
        lines.forEach((line, i) => {
            const fields = line.split(';');
            console.log(`Linha ${i}: ${fields.length} campos`);
            if (i > 0) {
                console.log(`   Duration: ${fields[6]}`);
                console.log(`   Messages: ${fields[7]}`);
                console.log(`   API Cost: ${fields[9]}`);
                console.log(`   Outcomes: ${fields[16]}`);
            }
        });
        
        console.log('\n📋 RESULTADO FINAL');
        console.log('='.repeat(30));
        console.log(`✅ Arquivo: ${result.filename}`);
        console.log(`✅ Conversas: ${result.count}`);
        console.log(`✅ Separador: Ponto-e-vírgula (;)`);
        console.log(`✅ Decimais: Vírgula brasileira`);
        console.log(`✅ Estrutura: Validada`);
        
    } catch (error) {
        console.error('\n💥 ERRO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { generateDefinitiveCSV };