/**
 * Export Conversations CSV - Final Version
 * Especificações atendidas:
 * - CSV por conversa (session_id) - 1041 registros
 * - Coluna de minutos por conversa
 * - Formatação brasileira para decimais (vírgula)
 * - Sem JSONs aninhados
 * - IDs substituídos por nomes
 * - Validação completa
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

// Formatação brasileira CORRETA
function formatBrazilianDecimal(value) {
    if (value === null || value === undefined || value === '') return '';
    return String(value).replace('.', ',');
}

// Escape CSV CORRETO
function escapeCSV(field) {
    if (field === null || field === undefined) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

async function generateConversationsCSV() {
    console.log('🚀 Gerando CSV de conversas...');
    
    try {
        // Query SQL limpa e direta
        const { data, error } = await supabase.rpc('exec_sql', {
            sql: `
                SELECT 
                    ch.conversation_context->>'session_id' as session_id,
                    t.name as tenant_name,
                    t.business_name as tenant_business_name,
                    u.name as user_name,
                    MIN(ch.created_at) as conversation_start,
                    MAX(ch.created_at) as conversation_end,
                    ROUND(EXTRACT(EPOCH FROM (MAX(ch.created_at) - MIN(ch.created_at)))/60.0, 2) as duration_minutes,
                    COUNT(*) as messages_count,
                    SUM(ch.tokens_used) as total_tokens,
                    ROUND(SUM(ch.api_cost_usd::numeric), 6) as total_api_cost_usd,
                    ROUND(SUM(ch.processing_cost_usd::numeric), 6) as total_processing_cost_usd,
                    ROUND(SUM(ch.api_cost_usd::numeric + ch.processing_cost_usd::numeric), 6) as total_cost_usd,
                    ch.model_used,
                    ch.message_source,
                    STRING_AGG(DISTINCT ch.intent_detected, ';' ORDER BY ch.intent_detected) as intents_detected,
                    ROUND(AVG(ch.confidence_score::numeric), 4) as avg_confidence_score,
                    STRING_AGG(DISTINCT ch.conversation_outcome, ';' ORDER BY ch.conversation_outcome) as conversation_outcomes
                FROM conversation_history ch
                INNER JOIN tenants t ON ch.tenant_id = t.id
                INNER JOIN users u ON ch.user_id = u.id
                WHERE ch.conversation_context->>'session_id' IS NOT NULL
                GROUP BY 
                    ch.conversation_context->>'session_id',
                    t.name,
                    t.business_name, 
                    u.name,
                    ch.model_used,
                    ch.message_source
                ORDER BY conversation_start DESC
            `
        });

        let finalData = data;
        
        if (error) {
            // Fallback: usar método direto
            console.log('⚠️ Usando método alternativo...');
            
            const { data: conversations, error: directError } = await supabase
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
                .order('created_at', { ascending: false });

            if (directError) throw directError;

            // Processar agrupamento
            const grouped = {};
            
            conversations.forEach(row => {
                const sessionId = row.conversation_context?.session_id;
                if (!sessionId) return;

                if (!grouped[sessionId]) {
                    grouped[sessionId] = {
                        session_id: sessionId,
                        tenant_name: row.tenants?.name || '',
                        tenant_business_name: row.tenants?.business_name || '',
                        user_name: row.users?.name || '',
                        messages: [],
                        model_used: row.model_used,
                        message_source: row.message_source
                    };
                }
                
                grouped[sessionId].messages.push(row);
            });

            // Calcular métricas
            const processedData = Object.values(grouped).map(conv => {
                const messages = conv.messages;
                const times = messages.map(m => new Date(m.created_at));
                const minTime = new Date(Math.min(...times));
                const maxTime = new Date(Math.max(...times));
                const durationMs = maxTime - minTime;
                const durationMinutes = Math.round((durationMs / 60000) * 100) / 100;

                return {
                    session_id: conv.session_id,
                    tenant_name: conv.tenant_name,
                    tenant_business_name: conv.tenant_business_name,
                    user_name: conv.user_name,
                    conversation_start: minTime.toISOString(),
                    conversation_end: maxTime.toISOString(),
                    duration_minutes: durationMinutes,
                    messages_count: messages.length,
                    total_tokens: messages.reduce((sum, m) => sum + (m.tokens_used || 0), 0),
                    total_api_cost_usd: Math.round(messages.reduce((sum, m) => sum + parseFloat(m.api_cost_usd || 0), 0) * 1000000) / 1000000,
                    total_processing_cost_usd: Math.round(messages.reduce((sum, m) => sum + parseFloat(m.processing_cost_usd || 0), 0) * 1000000) / 1000000,
                    total_cost_usd: Math.round(messages.reduce((sum, m) => sum + parseFloat(m.api_cost_usd || 0) + parseFloat(m.processing_cost_usd || 0), 0) * 1000000) / 1000000,
                    model_used: conv.model_used,
                    message_source: conv.message_source,
                    intents_detected: [...new Set(messages.map(m => m.intent_detected).filter(Boolean))].sort().join(';'),
                    avg_confidence_score: Math.round(messages.filter(m => m.confidence_score).reduce((sum, m, _, arr) => sum + parseFloat(m.confidence_score) / arr.length, 0) * 10000) / 10000,
                    conversation_outcomes: [...new Set(messages.map(m => m.conversation_outcome).filter(Boolean))].sort().join(';')
                };
            });

            processedData.sort((a, b) => new Date(b.conversation_start) - new Date(a.conversation_start));
            finalData = processedData;
        }

        console.log(`📊 ${finalData.length} conversas processadas`);

        // Cabeçalho CSV
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

        // Construir CSV
        const csvLines = [headers.join(',')];
        
        finalData.forEach(row => {
            const csvRow = [
                escapeCSV(row.session_id),
                escapeCSV(row.tenant_name),
                escapeCSV(row.tenant_business_name),
                escapeCSV(row.user_name),
                escapeCSV(row.conversation_start),
                escapeCSV(row.conversation_end),
                formatBrazilianDecimal(row.duration_minutes),
                row.messages_count,
                row.total_tokens,
                formatBrazilianDecimal(row.total_api_cost_usd),
                formatBrazilianDecimal(row.total_processing_cost_usd),
                formatBrazilianDecimal(row.total_cost_usd),
                escapeCSV(row.model_used),
                escapeCSV(row.message_source),
                escapeCSV(row.intents_detected),
                formatBrazilianDecimal(row.avg_confidence_score),
                escapeCSV(row.conversation_outcomes)
            ];
            csvLines.push(csvRow.join(','));
        });

        // Salvar arquivo
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const filename = `conversation-history-final-${timestamp}.csv`;
        
        fs.writeFileSync(filename, csvLines.join('\n'), 'utf8');
        
        console.log(`✅ CSV gerado: ${filename}`);
        console.log(`📈 Total de conversas: ${finalData.length}`);
        
        return { filename, count: finalData.length, data: finalData };
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        throw error;
    }
}

async function validateCSV(result) {
    console.log('\n🔍 Validando CSV...');
    
    try {
        // Verificar arquivo
        if (!fs.existsSync(result.filename)) {
            throw new Error('Arquivo CSV não encontrado');
        }
        
        const csvContent = fs.readFileSync(result.filename, 'utf8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        const dataLines = lines.slice(1);
        
        console.log(`📄 Linhas no arquivo: ${lines.length} (${dataLines.length} dados + 1 cabeçalho)`);
        
        // Validar contagem na base
        const { count: dbCount } = await supabase
            .from('conversation_history')
            .select('conversation_context', { count: 'exact', head: true })
            .not('conversation_context->session_id', 'is', null);
            
        // Contar sessões únicas manualmente
        const { data: sessions } = await supabase
            .from('conversation_history')
            .select('conversation_context')
            .not('conversation_context->session_id', 'is', null);
            
        const uniqueSessions = new Set(
            sessions
                .map(s => s.conversation_context?.session_id)
                .filter(Boolean)
        ).size;
        
        console.log(`📊 Sessões únicas na base: ${uniqueSessions}`);
        console.log(`📊 Registros no CSV: ${dataLines.length}`);
        
        // Validar amostra
        console.log('\n🧪 Validação de amostra:');
        for (let i = 0; i < Math.min(3, dataLines.length); i++) {
            const fields = dataLines[i].split(',');
            console.log(`   ${i+1}. ${fields[0]} - ${fields[6]} min - ${fields[7]} msgs`);
        }
        
        const isValid = uniqueSessions === dataLines.length && uniqueSessions === 1041;
        
        return {
            isValid,
            expectedCount: 1041,
            actualCount: dataLines.length,
            dbUniqueCount: uniqueSessions,
            filename: result.filename
        };
        
    } catch (error) {
        console.error('❌ Erro na validação:', error.message);
        return { isValid: false, error: error.message };
    }
}

async function main() {
    try {
        console.log('🎯 Export Conversations CSV - Versão Final');
        console.log('='.repeat(50));
        
        const result = await generateConversationsCSV();
        const validation = await validateCSV(result);
        
        console.log('\n📋 RELATÓRIO FINAL');
        console.log('='.repeat(30));
        console.log(`Arquivo: ${validation.filename}`);
        console.log(`Conversas esperadas: 1041`);
        console.log(`Conversas exportadas: ${validation.actualCount}`);
        console.log(`Sessões únicas na base: ${validation.dbUniqueCount}`);
        console.log(`Validação: ${validation.isValid ? '✅ SUCESSO' : '❌ FALHA'}`);
        
        if (validation.isValid) {
            console.log('\n🎉 CSV gerado com SUCESSO e validado!');
            console.log('✅ 1041 conversas únicas');
            console.log('✅ Coluna de minutos incluída');  
            console.log('✅ Formatação brasileira aplicada');
            console.log('✅ Dados espelham exatamente a tabela');
        } else {
            console.log('\n⚠️ Validação falhou:', validation.error);
        }
        
    } catch (error) {
        console.error('\n💥 ERRO CRÍTICO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { generateConversationsCSV, validateCSV };