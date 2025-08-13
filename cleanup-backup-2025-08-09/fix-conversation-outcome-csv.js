#!/usr/bin/env node

/**
 * CORRIGIR CSV - conversation_outcome com dados corretos
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis Supabase não encontradas');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Formatação brasileira
 */
function formatBrazilianCurrency(value) {
    if (!value || isNaN(value)) return 'R$ 0,0000';
    const numValue = parseFloat(value);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL',
        minimumFractionDigits: 4, maximumFractionDigits: 4
    }).format(numValue);
}

function formatBrazilianNumber(value, decimals = 2) {
    if (!value || isNaN(value)) return '0,00';
    const numValue = parseFloat(value);
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals
    }).format(numValue);
}

function formatBrazilianDateTime(isoString) {
    if (!isoString) return '';
    return new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'America/Sao_Paulo'
    }).format(new Date(isoString));
}

async function extractAllMessagesPaginated() {
    console.log('🚀 EXTRAINDO TODAS AS 4.560 MENSAGENS (CORRIGINDO CONVERSATION_OUTCOME)');
    
    let allMessages = [];
    let start = 0;
    const batchSize = 1000;
    let hasMore = true;
    let batchCount = 1;
    
    while (hasMore) {
        console.log(`📦 Lote ${batchCount}: extraindo mensagens ${start}-${start + batchSize - 1}`);
        
        const { data: messages, error } = await supabase
            .from('conversation_history')
            .select(`
                *,
                tenants(name, domain),
                users(name, phone)
            `)
            .range(start, start + batchSize - 1)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error(`❌ Erro no lote ${batchCount}:`, error);
            break;
        }
        
        if (messages.length === 0) {
            hasMore = false;
            break;
        }
        
        console.log(`   ✅ ${messages.length} mensagens extraídas`);
        allMessages.push(...messages);
        
        if (messages.length < batchSize) {
            hasMore = false;
        }
        
        start += batchSize;
        batchCount++;
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n📊 TOTAL DE MENSAGENS EXTRAÍDAS: ${allMessages.length}`);
    return allMessages;
}

function processMessagesIntoSessions(messages) {
    console.log('🔄 AGRUPANDO MENSAGENS POR SESSÃO (CORRIGINDO OUTCOME)...');
    
    const sessions = {};
    messages.forEach(msg => {
        const sessionId = msg.conversation_context?.session_id || `session_${msg.id}`;
        if (!sessions[sessionId]) {
            sessions[sessionId] = [];
        }
        sessions[sessionId].push(msg);
    });
    
    console.log(`🎯 TOTAL DE SESSÕES IDENTIFICADAS: ${Object.keys(sessions).length}`);
    
    const sessionData = Object.entries(sessions).map(([sessionId, msgs]) => {
        const firstMsg = msgs[msgs.length - 1]; // oldest
        const lastMsg = msgs[0]; // newest
        
        // CORREÇÃO: Pegar conversation_outcome da última mensagem que tem valor
        const messageWithOutcome = msgs.find(m => m.conversation_outcome) || lastMsg;
        const correctOutcome = messageWithOutcome.conversation_outcome || 'completed';
        
        const confidenceScores = msgs.filter(m => m.confidence_score > 0);
        const maxConfidence = Math.max(...confidenceScores.map(m => m.confidence_score), 0);
        const avgConfidence = confidenceScores.length > 0 ? 
            confidenceScores.reduce((sum, m) => sum + m.confidence_score, 0) / confidenceScores.length : 0;
        
        const totalTokens = msgs.reduce((sum, m) => sum + (m.tokens_used || 0), 0);
        const totalCost = msgs.reduce((sum, m) => sum + (m.api_cost_usd || 0), 0);
        const costPerToken = totalTokens > 0 ? totalCost / totalTokens : 0;
        
        const firstTime = new Date(firstMsg.created_at);
        const lastTime = new Date(lastMsg.created_at);
        const durationMs = lastTime - firstTime;
        const durationMinutes = durationMs / (1000 * 60);
        const durationHours = durationMs / (1000 * 60 * 60);
        
        return {
            session_id: sessionId,
            tenant_id: firstMsg.tenant_id,
            tenant_name: firstMsg.tenants?.name || 'N/A',
            tenant_domain: firstMsg.tenants?.domain || 'beauty',
            user_id: firstMsg.user_id,
            user_name: firstMsg.users?.name || 'N/A',
            user_phone: firstMsg.users?.phone || 'N/A',
            conversation_outcome: correctOutcome, // CORRIGIDO!
            max_confidence_score: formatBrazilianNumber(maxConfidence, 4),
            avg_confidence_score: formatBrazilianNumber(avgConfidence, 4),
            duration_minutes: formatBrazilianNumber(durationMinutes, 2),
            message_count: msgs.length,
            total_tokens: totalTokens,
            total_cost_usd: formatBrazilianCurrency(totalCost),
            cost_per_token: formatBrazilianCurrency(costPerToken),
            first_message_at: formatBrazilianDateTime(firstMsg.created_at),
            last_message_at: formatBrazilianDateTime(lastMsg.created_at),
            conversation_duration_hours: formatBrazilianNumber(durationHours, 3),
            model_used: firstMsg.conversation_context?.model || 'gpt-4',
            message_source: 'whatsapp'
        };
    });
    
    return sessionData;
}

function generateCorrectedCSV(sessionData) {
    console.log('📄 GERANDO CSV CORRIGIDO...');
    
    const headers = [
        'session_id', 'tenant_id', 'tenant_name', 'tenant_domain',
        'user_id', 'user_name', 'user_phone', 'conversation_outcome',
        'max_confidence_score', 'avg_confidence_score', 'duration_minutes',
        'message_count', 'total_tokens', 'total_cost_usd', 'cost_per_token',
        'first_message_at', 'last_message_at', 'conversation_duration_hours',
        'model_used', 'message_source'
    ];
    
    const csvHeader = headers.join(',');
    const csvRows = sessionData.map(session => 
        headers.map(header => {
            const value = session[header];
            return typeof value === 'string' && value.includes(',') 
                ? `"${value}"` 
                : value;
        }).join(',')
    );
    
    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `conversation-sessions-CORRECTED-${timestamp}.csv`;
    
    fs.writeFileSync(filename, csvContent, 'utf8');
    
    console.log(`\n✅ CSV CORRIGIDO GERADO: ${filename}`);
    return { filename, sessionCount: sessionData.length };
}

async function fixConversationOutcome() {
    try {
        console.log('🔧 CORRIGINDO COLUNA CONVERSATION_OUTCOME');
        
        const allMessages = await extractAllMessagesPaginated();
        const sessionData = processMessagesIntoSessions(allMessages);
        const result = generateCorrectedCSV(sessionData);
        
        // Mostrar exemplos corrigidos
        console.log('\n📋 PRIMEIRAS 5 SESSÕES CORRIGIDAS:');
        sessionData.slice(0, 5).forEach((session, i) => {
            console.log(`${i+1}. ${session.session_id} → ${session.conversation_outcome}`);
        });
        
        return result;
        
    } catch (error) {
        console.error('💥 Erro:', error);
        throw error;
    }
}

if (require.main === module) {
    (async () => {
        try {
            const result = await fixConversationOutcome();
            
            console.log('\n🎉 CORREÇÃO CONCLUÍDA!');
            console.log(`📁 Arquivo corrigido: ${result.filename}`);
            console.log('✅ Coluna conversation_outcome agora tem dados corretos do banco');
            
        } catch (error) {
            console.error('\n💥 Falha na correção:', error);
        }
    })();
}