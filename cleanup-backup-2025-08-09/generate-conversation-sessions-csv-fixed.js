#!/usr/bin/env node

/**
 * Gerador de CSV - Conversation History por Sessão (Versão Corrigida)
 * Context Engineering Implementation
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

/**
 * Formatação brasileira para valores monetários
 */
function formatBrazilianCurrency(value) {
    if (!value || isNaN(value)) return 'R$ 0,00';
    
    const numValue = parseFloat(value);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 4,
        maximumFractionDigits: 4
    }).format(numValue);
}

/**
 * Formatação brasileira para números decimais
 */
function formatBrazilianNumber(value, decimals = 2) {
    if (!value || isNaN(value)) return '0,00';
    
    const numValue = parseFloat(value);
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(numValue);
}

/**
 * Formatação brasileira para data/hora
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
 * Função principal de geração do CSV
 */
async function generateConversationSessionsCSV() {
    try {
        console.log('🚀 Iniciando geração do CSV - Conversation Sessions');
        console.log('📊 Context Engineering: Applying complete analysis methodology');
        
        // Health check
        console.log('🔍 Health check - Conexões...');
        const { count, error: countError } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true });
            
        if (countError) throw countError;
        console.log(`✅ Conexão OK - ${count} registros em conversation_history`);
        
        if (count === 0) {
            console.log('⚠️  Nenhum registro encontrado em conversation_history');
            return {
                success: false,
                message: 'Nenhum dado disponível para processamento'
            };
        }
        
        // Buscar dados com joins
        console.log('⚡ Buscando dados com relacionamentos...');
        const { data: rawData, error } = await supabase
            .from('conversation_history')
            .select(`
                *,
                tenants!inner(business_name, domain),
                users!inner(name, phone)
            `);
            
        if (error) throw error;
        
        console.log(`📊 ${rawData.length} registros encontrados`);
        
        // Processar agregação por sessão
        console.log('🔄 Processando agregação por sessão...');
        const sessions = processSessionAggregation(rawData);
        
        console.log(`📈 ${sessions.length} sessões processadas`);
        
        // Formatar dados para CSV
        console.log('🎨 Aplicando formatação brasileira...');
        const formattedSessions = sessions.map(session => ({
            session_id: session.session_id || '',
            tenant_id: session.tenant_id || '',
            tenant_name: session.tenant_name || '',
            tenant_domain: session.tenant_domain || '',
            user_id: session.user_id || '',
            user_name: session.user_name || '',
            user_phone: session.user_phone || '',
            conversation_outcome: session.conversation_outcome || '',
            max_confidence_score: formatBrazilianNumber(session.max_confidence_score, 4),
            avg_confidence_score: formatBrazilianNumber(session.avg_confidence_score, 4),
            duration_minutes: formatBrazilianNumber(session.duration_minutes, 2),  
            message_count: session.message_count || 0,
            total_tokens: session.total_tokens || 0,
            total_cost_usd: formatBrazilianCurrency(session.total_cost_usd),
            cost_per_token: formatBrazilianCurrency(session.cost_per_token),
            first_message_at: formatBrazilianDateTime(session.first_message_at),
            last_message_at: formatBrazilianDateTime(session.last_message_at),
            conversation_duration_hours: formatBrazilianNumber(session.conversation_duration_hours, 3),
            model_used: session.model_used || '',
            message_source: session.message_source || ''
        }));
        
        // Gerar CSV
        console.log('📄 Gerando arquivo CSV...');
        const csvContent = generateCSVContent(formattedSessions); 
        
        // Salvar arquivo
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `conversation-sessions-${timestamp}.csv`;
        const filepath = path.join(process.cwd(), filename);
        
        fs.writeFileSync(filepath, csvContent, 'utf8');
        
        console.log('\\n🎉 CSV gerado com sucesso!');
        console.log(`📁 Arquivo: ${filename}`);
        console.log(`📍 Caminho: ${filepath}`);
        console.log(`📊 Total de sessões: ${formattedSessions.length}`);
        
        // Estatísticas
        const stats = calculateBasicStats(formattedSessions);
        console.log('\\n📈 Estatísticas Básicas:');
        console.log(`   💬 Total mensagens: ${stats.totalMessages}`);
        console.log(`   🤖 Total tokens: ${stats.totalTokens}`);
        console.log(`   💰 Custo total: ${stats.totalCost}`);
        console.log(`   ⏱️  Duração média: ${stats.avgDuration} minutos`);
        
        return {
            success: true,
            filename,
            filepath,
            sessionCount: formattedSessions.length,
            stats
        };
        
    } catch (error) {
        console.error('💥 Erro na geração do CSV:', error.message);
        throw error;
    }
}

/**
 * Processamento de agregação por sessão
 */
function processSessionAggregation(rawData) {
    const sessionMap = new Map();
    
    rawData.forEach(record => {
        const sessionId = record.conversation_context?.session_id;
        if (!sessionId) return;
        
        const key = `${sessionId}-${record.tenant_id}-${record.user_id}`;
        
        if (!sessionMap.has(key)) {
            sessionMap.set(key, {
                session_id: sessionId,
                tenant_id: record.tenant_id,
                tenant_name: record.tenants?.business_name,
                tenant_domain: record.tenants?.domain,
                user_id: record.user_id,
                user_name: record.users?.name,
                user_phone: record.users?.phone,
                messages: []
            });
        }
        
        sessionMap.get(key).messages.push(record);
    });
    
    return Array.from(sessionMap.values()).map(session => {
        const messages = session.messages;
        const confidenceScores = messages
            .map(m => parseFloat(m.confidence_score))
            .filter(s => !isNaN(s));
            
        const totalCost = messages.reduce((sum, m) => 
            sum + parseFloat(m.api_cost_usd || 0) + parseFloat(m.processing_cost_usd || 0), 0);
        const totalTokens = messages.reduce((sum, m) => sum + (m.tokens_used || 0), 0);
        
        const firstMessage = new Date(messages.reduce((earliest, m) => 
            new Date(m.created_at) < new Date(earliest) ? m.created_at : earliest, 
            messages[0].created_at));
        const lastMessage = new Date(messages.reduce((latest, m) => 
            new Date(m.created_at) > new Date(latest) ? m.created_at : latest, 
            messages[0].created_at));
            
        return {
            ...session,
            conversation_outcome: messages.find(m => m.conversation_outcome)?.conversation_outcome,
            max_confidence_score: confidenceScores.length > 0 ? Math.max(...confidenceScores) : null,
            avg_confidence_score: confidenceScores.length > 0 ? 
                confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length : null,
            duration_minutes: Math.max(...messages.map(m => m.conversation_context?.duration_minutes || 0)),
            message_count: messages.length,
            total_tokens: totalTokens,
            total_cost_usd: totalCost,
            cost_per_token: totalTokens > 0 ? totalCost / totalTokens : 0,
            first_message_at: firstMessage.toISOString(),
            last_message_at: lastMessage.toISOString(),
            conversation_duration_hours: (lastMessage - firstMessage) / (1000 * 60 * 60),
            model_used: messages[0].model_used,
            message_source: messages[0].message_source
        };
    });
}

/**
 * Gerar conteúdo CSV
 */
function generateCSVContent(sessions) {
    const headers = [
        'session_id', 'tenant_id', 'tenant_name', 'tenant_domain',
        'user_id', 'user_name', 'user_phone', 'conversation_outcome',
        'max_confidence_score', 'avg_confidence_score', 'duration_minutes',
        'message_count', 'total_tokens', 'total_cost_usd', 'cost_per_token',
        'first_message_at', 'last_message_at', 'conversation_duration_hours',
        'model_used', 'message_source'
    ];
    
    const csvHeader = headers.join(',');
    const csvRows = sessions.map(session => 
        headers.map(header => {
            const value = session[header];
            return typeof value === 'string' && value.includes(',') 
                ? `"${value}"` 
                : value;
        }).join(',')
    );
    
    return [csvHeader, ...csvRows].join('\\n');
}

/**
 * Cálculo de estatísticas básicas
 */
function calculateBasicStats(sessions) {
    const totalMessages = sessions.reduce((sum, s) => sum + parseInt(s.message_count), 0);
    const totalTokens = sessions.reduce((sum, s) => sum + parseInt(s.total_tokens), 0);
    
    // Parse cost from Brazilian format
    const totalCostBRL = sessions.reduce((sum, s) => {
        const cost = s.total_cost_usd.replace(/[R$\\s.]/g, '').replace(',', '.');
        return sum + parseFloat(cost || 0);
    }, 0);
    
    const avgDuration = sessions.reduce((sum, s) => {
        const duration = s.duration_minutes.replace(',', '.');
        return sum + parseFloat(duration || 0);
    }, 0) / sessions.length;
    
    return {
        totalMessages,
        totalTokens,
        totalCost: formatBrazilianCurrency(totalCostBRL),
        avgDuration: formatBrazilianNumber(avgDuration, 2)
    };
}

// Executar se chamado diretamente
if (require.main === module) {
    generateConversationSessionsCSV()
        .then(result => {
            console.log('\\n✅ Processo concluído com sucesso!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\\n💥 Processo falhou:', error);
            process.exit(1);
        });
}

module.exports = { 
    generateConversationSessionsCSV,
    formatBrazilianCurrency,
    formatBrazilianNumber,
    formatBrazilianDateTime
};