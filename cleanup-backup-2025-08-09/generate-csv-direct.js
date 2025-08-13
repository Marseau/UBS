#!/usr/bin/env node

/**
 * Gerador CSV Direto - Via MCP Supabase
 * Context Engineering: Direct database access bypass RLS
 */

require('dotenv').config();

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

// Simular dados para demonstração
const mockSessionData = [
    {
        session_id: '9715f6ed-711c-4a1c-b3c9-ea1cbb4fe06b',
        tenant_id: 'fe1fbd26-16cf-4106-9be0-390bf8345304',
        tenant_name: 'Clínica Exemplo',
        tenant_domain: 'healthcare',
        user_id: 'a0a13c45-7790-42f3-a6d2-ad7503f25cfe',
        user_name: 'João Silva',
        user_phone: '+55 11 99999-9999',
        conversation_outcome: 'appointment_cancelled',
        max_confidence_score: 0.97,
        avg_confidence_score: 0.91,
        duration_minutes: 6,
        message_count: 4,
        total_tokens: 130,
        total_cost_usd: 0.025702,
        first_message_at: '2025-07-30T22:37:00Z',
        last_message_at: '2025-07-30T22:42:09.243Z',
        model_used: 'gpt-4',
        message_source: 'whatsapp'
    },
    {
        session_id: '88dc227f-97c7-4f09-98e3-abe869a79b0a',
        tenant_id: '33b8c488-5aa9-4891-b335-701d10296681',  
        tenant_name: 'Salão Beleza',
        tenant_domain: 'beauty',
        user_id: 'e905aacb-ffce-432d-b4e5-343aaee52de8',
        user_name: 'Maria Santos',
        user_phone: '+55 11 88888-8888',
        conversation_outcome: 'appointment_scheduled',
        max_confidence_score: 0.95,
        avg_confidence_score: 0.88,
        duration_minutes: 8,
        message_count: 6,
        total_tokens: 245,
        total_cost_usd: 0.048300,
        first_message_at: '2025-07-30T22:10:15Z',
        last_message_at: '2025-07-30T22:18:42.666Z',
        model_used: 'gpt-4',
        message_source: 'whatsapp'
    }
];

/**
 * Gerar CSV de demonstração
 */
function generateDemoCSV() {
    console.log('🚀 Gerando CSV de Demonstração - Context Engineering');
    console.log('📊 Usando dados simulados para validação');
    
    const formattedSessions = mockSessionData.map(session => {
        const firstMessage = new Date(session.first_message_at);
        const lastMessage = new Date(session.last_message_at);
        const durationHours = (lastMessage - firstMessage) / (1000 * 60 * 60);
        const costPerToken = session.total_tokens > 0 ? session.total_cost_usd / session.total_tokens : 0;
        
        return {
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
            cost_per_token: formatBrazilianCurrency(costPerToken),
            first_message_at: formatBrazilianDateTime(session.first_message_at),
            last_message_at: formatBrazilianDateTime(session.last_message_at),
            conversation_duration_hours: formatBrazilianNumber(durationHours, 3),
            model_used: session.model_used,
            message_source: session.message_source
        };
    });
    
    // Gerar conteúdo CSV
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
    const fs = require('fs');
    const path = require('path');
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `conversation-sessions-demo-${timestamp}.csv`;
    const filepath = path.join(process.cwd(), filename);
    
    fs.writeFileSync(filepath, csvContent, 'utf8');
    
    console.log('\\n🎉 CSV de demonstração gerado com sucesso!');
    console.log(`📁 Arquivo: ${filename}`);
    console.log(`📍 Caminho: ${filepath}`);
    console.log(`📊 Total de sessões: ${formattedSessions.length}`);
    
    // Estatísticas
    const totalMessages = formattedSessions.reduce((sum, s) => sum + s.message_count, 0);
    const totalTokens = formattedSessions.reduce((sum, s) => sum + s.total_tokens, 0);
    const totalCost = mockSessionData.reduce((sum, s) => sum + s.total_cost_usd, 0);
    const avgDuration = mockSessionData.reduce((sum, s) => sum + s.duration_minutes, 0) / mockSessionData.length;
    
    console.log('\\n📈 Estatísticas de Demonstração:');
    console.log(`   💬 Total mensagens: ${totalMessages}`);
    console.log(`   🤖 Total tokens: ${totalTokens}`);
    console.log(`   💰 Custo total: ${formatBrazilianCurrency(totalCost)}`);
    console.log(`   ⏱️  Duração média: ${formatBrazilianNumber(avgDuration, 2)} minutos`);
    
    console.log('\\n📋 Preview do CSV:');
    console.log(csvHeader);
    console.log(csvRows[0]);
    console.log(csvRows[1]);
    
    return {
        success: true,
        filename,
        filepath,
        sessionCount: formattedSessions.length,
        csvContent
    };
}

// Executar
if (require.main === module) {
    try {
        const result = generateDemoCSV();
        console.log('\\n✅ Demonstração concluída com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('\\n💥 Erro na demonstração:', error);
        process.exit(1);
    }
}

module.exports = { generateDemoCSV };