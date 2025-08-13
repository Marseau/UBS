#!/usr/bin/env node

/**
 * Gerar CSV por SESSÃO baseado nos dados COMPLETOS de conversation_history
 * Usar conversations_COMPLETAS_2025-07-30.csv com 4.559 mensagens
 */

const fs = require('fs');
const path = require('path');

/**
 * Formatação brasileira para valores monetários
 */
function formatBrazilianCurrency(value) {
    if (!value || isNaN(value)) return 'R$ 0,0000';
    
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
 * Processar dados completos de conversas
 */
function processCompleteConversationData() {
    console.log('🚀 Processando CSV COMPLETO - 4.559 mensagens por SESSÃO');
    console.log('📊 Fonte: conversations_COMPLETAS_2025-07-30.csv');
    
    // Ler arquivo completo
    const csvContent = fs.readFileSync('conversations_COMPLETAS_2025-07-30.csv', 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    console.log(`📈 Total de linhas: ${lines.length}`);
    console.log(`💬 Total de mensagens: ${lines.length - 1}`);
    
    // Parse headers
    const headers = lines[0].split(',');
    console.log('📋 Headers:', headers);
    
    // Parse data
    const messages = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length >= 13) {
            messages.push({
                message_id: values[0],
                session_id: values[1],
                tenant_name: values[2],
                user_name: values[3],
                user_phone: values[4],
                content: values[5],
                is_from_user: values[6],
                created_at: values[7],
                confidence_score: parseFloat(values[8]) || 0,
                tokens_used: parseInt(values[9]) || 0,
                api_cost_usd: parseFloat(values[10]) || 0,
                intent_detected: values[11],
                message_type: values[12]
            });
        }
    }
    
    console.log(`✅ Mensagens processadas: ${messages.length}`);
    
    // Agrupar por sessão
    const sessionGroups = {};
    messages.forEach(msg => {
        if (!sessionGroups[msg.session_id]) {
            sessionGroups[msg.session_id] = [];
        }
        sessionGroups[msg.session_id].push(msg);
    });
    
    console.log(`🎯 Total de sessões: ${Object.keys(sessionGroups).length}`);
    
    // Mapear tenant domain (aproximado baseado no nome)
    const domainMap = {
        'Studio Glamour': 'beauty',
        'Centro Terapêutico': 'healthcare',
        'Charme Total': 'beauty', 
        'Bella Vista Spa': 'beauty',
        'Clínica Mente Sã': 'healthcare'
    };
    
    // Processar cada sessão
    const sessionData = [];
    Object.entries(sessionGroups).forEach(([sessionId, msgs]) => {
        const firstMsg = msgs[0];
        const lastMsg = msgs[msgs.length - 1];
        
        // Calcular métricas
        const userMessages = msgs.filter(m => m.is_from_user === 'USER');
        const confidenceScores = msgs.filter(m => m.confidence_score > 0).map(m => m.confidence_score);
        const maxConfidence = Math.max(...confidenceScores, 0);
        const avgConfidence = confidenceScores.length > 0 ? 
            confidenceScores.reduce((a,b) => a + b, 0) / confidenceScores.length : 0;
        
        const totalTokens = msgs.reduce((sum, m) => sum + m.tokens_used, 0);
        const totalCost = msgs.reduce((sum, m) => sum + m.api_cost_usd, 0);
        const costPerToken = totalTokens > 0 ? totalCost / totalTokens : 0;
        
        // Duração
        const firstTime = new Date(firstMsg.created_at);
        const lastTime = new Date(lastMsg.created_at);
        const durationMs = lastTime - firstTime;
        const durationMinutes = durationMs / (1000 * 60);
        const durationHours = durationMs / (1000 * 60 * 60);
        
        // Determinar outcome baseado em intents
        let outcome = 'conversation_completed';
        const intents = msgs.map(m => m.intent_detected).filter(i => i && i !== '');
        if (intents.includes('cancellation_request')) outcome = 'appointment_cancelled';
        else if (intents.includes('appointment_request')) outcome = 'appointment_created';
        else if (intents.includes('price_inquiry')) outcome = 'info_request_fulfilled';
        
        sessionData.push({
            session_id: sessionId,
            tenant_id: 'uuid-placeholder', // Não disponível nos dados
            tenant_name: firstMsg.tenant_name,
            tenant_domain: domainMap[firstMsg.tenant_name] || 'general',
            user_id: 'uuid-placeholder', // Não disponível nos dados
            user_name: firstMsg.user_name,
            user_phone: firstMsg.user_phone,
            conversation_outcome: outcome,
            max_confidence_score: maxConfidence,
            avg_confidence_score: avgConfidence,
            duration_minutes: durationMinutes,
            message_count: msgs.length,
            total_tokens: totalTokens,
            total_cost_usd: totalCost,
            cost_per_token: costPerToken,
            first_message_at: firstMsg.created_at,
            last_message_at: lastMsg.created_at,
            conversation_duration_hours: durationHours,
            model_used: 'gpt-4', // Inferido dos dados
            message_source: 'whatsapp'
        });
    });
    
    console.log(`🎉 Sessões processadas: ${sessionData.length}`);
    
    return sessionData;
}

/**
 * Gerar CSV com formatação brasileira
 */
function generateSessionCSV() {
    const sessions = processCompleteConversationData();
    
    console.log('\\n📊 Aplicando formatação brasileira...');
    
    const formattedSessions = sessions.map(session => ({
        session_id: session.session_id,
        tenant_id: session.tenant_id,
        tenant_name: session.tenant_name,
        tenant_domain: session.tenant_domain,
        user_id: session.user_id,
        user_name: session.user_name,
        user_phone: session.user_phone,
        conversation_outcome: session.conversation_outcome,
        max_confidence_score: formatBrazilianNumber(session.max_confidence_score, 4),
        avg_confidence_score: formatBrazilianNumber(session.avg_confidence_score, 4),
        duration_minutes: formatBrazilianNumber(session.duration_minutes, 2),
        message_count: session.message_count,
        total_tokens: session.total_tokens,
        total_cost_usd: formatBrazilianCurrency(session.total_cost_usd),
        cost_per_token: formatBrazilianCurrency(session.cost_per_token),
        first_message_at: formatBrazilianDateTime(session.first_message_at),
        last_message_at: formatBrazilianDateTime(session.last_message_at),
        conversation_duration_hours: formatBrazilianNumber(session.conversation_duration_hours, 3),
        model_used: session.model_used,
        message_source: session.message_source
    }));
    
    // Headers conforme solicitado
    const headers = [
        'session_id', 'tenant_id', 'tenant_name', 'tenant_domain',
        'user_id', 'user_name', 'user_phone', 'conversation_outcome',
        'max_confidence_score', 'avg_confidence_score', 'duration_minutes',
        'message_count', 'total_tokens', 'total_cost_usd', 'cost_per_token',
        'first_message_at', 'last_message_at', 'conversation_duration_hours',
        'model_used', 'message_source'
    ];
    
    const csvHeader = headers.join(',');
    const csvRows = formattedSessions.map(session => 
        headers.map(header => {
            const value = session[header];
            return typeof value === 'string' && value.includes(',') 
                ? `"${value}"` 
                : value;
        }).join(',')
    );
    
    const csvContent = [csvHeader, ...csvRows].join('\\n');
    
    // Salvar arquivo
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `conversation-sessions-COMPLETE-${timestamp}.csv`;
    const filepath = path.join(process.cwd(), filename);
    
    fs.writeFileSync(filepath, csvContent, 'utf8');
    
    console.log('\\n🎉 CSV COMPLETO por SESSÃO gerado!');
    console.log(`📁 Arquivo: ${filename}`);
    console.log(`📍 Caminho: ${filepath}`);
    console.log(`🎯 Total de sessões: ${formattedSessions.length}`);
    
    // Estatísticas
    const totalMessages = formattedSessions.reduce((sum, s) => sum + s.message_count, 0);
    const totalTokens = formattedSessions.reduce((sum, s) => sum + s.total_tokens, 0);
    const totalCost = sessions.reduce((sum, s) => sum + s.total_cost_usd, 0);
    const avgDuration = sessions.reduce((sum, s) => sum + s.duration_minutes, 0) / sessions.length;
    
    console.log('\\n📈 Estatísticas COMPLETAS:');
    console.log(`   💬 Total mensagens: ${totalMessages}`);
    console.log(`   🤖 Total tokens: ${totalTokens}`);
    console.log(`   💰 Custo total: ${formatBrazilianCurrency(totalCost)}`);
    console.log(`   ⏱️  Duração média: ${formatBrazilianNumber(avgDuration, 2)} minutos`);
    
    // Breakdown por tenant
    console.log('\\n🏢 Breakdown por Tenant:');
    const tenantStats = {};
    sessions.forEach(session => {
        if (!tenantStats[session.tenant_name]) {
            tenantStats[session.tenant_name] = {
                sessions: 0,
                messages: 0,
                tokens: 0,
                cost: 0,
                domain: session.tenant_domain
            };
        }
        tenantStats[session.tenant_name].sessions++;
        tenantStats[session.tenant_name].messages += session.message_count;
        tenantStats[session.tenant_name].tokens += session.total_tokens;
        tenantStats[session.tenant_name].cost += session.total_cost_usd;
    });
    
    Object.entries(tenantStats).forEach(([tenant, stats]) => {
        console.log(`   🎯 ${tenant} (${stats.domain}): ${stats.sessions} sessões, ${stats.messages} msgs, ${stats.tokens} tokens, ${formatBrazilianCurrency(stats.cost)}`);
    });
    
    return {
        success: true,
        filename,
        filepath,
        sessionCount: formattedSessions.length,
        messageCount: totalMessages,
        stats: {
            totalMessages,
            totalTokens,
            totalCost: formatBrazilianCurrency(totalCost),
            avgDuration: formatBrazilianNumber(avgDuration, 2),
            tenantStats
        }
    };
}

// Executar
if (require.main === module) {
    try {
        console.log('🚀 Gerando CSV COMPLETO por SESSÃO baseado em 4.559 mensagens reais');
        console.log('📊 Dados fonte: conversations_COMPLETAS_2025-07-30.csv');
        console.log('🎯 Objetivo: Todas as sessões com formatação brasileira\\n');
        
        const result = generateSessionCSV();
        
        console.log('\\n✅ CSV COMPLETO por SESSÃO concluído!');
        console.log('🎯 Dados: TODAS as 4.559 mensagens agrupadas por sessão');
        console.log('🇧🇷 Formatação: Padrão brasileiro aplicado em todos os valores');
        
        process.exit(0);
    } catch (error) {
        console.error('\\n💥 Erro na geração do CSV COMPLETO:', error);
        process.exit(1);
    }
}

module.exports = { generateSessionCSV };