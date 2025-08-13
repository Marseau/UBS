#!/usr/bin/env node

/**
 * EXTRAIR TODAS AS 1.041 SESSÕES REAIS VIA SUPABASE
 * Fazer múltiplas consultas com LIMIT/OFFSET
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

/**
 * Extrair sessões do banco
 */
async function extractAllRealSessions() {
    console.log('🚀 EXTRAINDO TODAS AS SESSÕES REAIS DO SUPABASE');
    
    const query = `
        SELECT 
            COALESCE(ch.conversation_context->>'session_id', 'session_' || ch.id::text) as session_id,
            ch.tenant_id,
            t.name as tenant_name,
            t.domain as tenant_domain,
            ch.user_id,
            u.name as user_name,
            u.phone as user_phone,
            ch.conversation_context->>'outcome' as conversation_outcome,
            MAX(ch.confidence_score) as max_confidence_score,
            AVG(ch.confidence_score) as avg_confidence_score,
            EXTRACT(EPOCH FROM (MAX(ch.created_at) - MIN(ch.created_at)))/60 as duration_minutes,
            COUNT(*) as message_count,
            SUM(ch.tokens_used) as total_tokens,
            SUM(ch.api_cost_usd) as total_cost_usd,
            CASE WHEN SUM(ch.tokens_used) > 0 THEN SUM(ch.api_cost_usd) / SUM(ch.tokens_used) ELSE 0 END as cost_per_token,
            MIN(ch.created_at) as first_message_at,
            MAX(ch.created_at) as last_message_at,
            EXTRACT(EPOCH FROM (MAX(ch.created_at) - MIN(ch.created_at)))/3600 as conversation_duration_hours,
            COALESCE(ch.conversation_context->>'model', 'gpt-4') as model_used,
            'whatsapp' as message_source
        FROM conversation_history ch
        LEFT JOIN tenants t ON ch.tenant_id = t.id
        LEFT JOIN users u ON ch.user_id = u.id
        GROUP BY 
            COALESCE(ch.conversation_context->>'session_id', 'session_' || ch.id::text),
            ch.tenant_id, t.name, t.domain, ch.user_id, u.name, u.phone,
            ch.conversation_context->>'outcome', ch.conversation_context->>'model'
        ORDER BY MIN(ch.created_at) DESC
    `;
    
    const { data, error } = await supabase.rpc('execute_sql', { 
        query 
    });
    
    if (error) {
        console.error('❌ Erro na consulta:', error);
        return [];
    }
    
    console.log(`✅ Total de sessões extraídas: ${data.length}`);
    return data;
}

/**
 * Gerar CSV com todas as sessões
 */
async function generateCompleteRealCSV() {
    try {
        const allSessions = await extractAllRealSessions();
        
        if (allSessions.length === 0) {
            console.error('❌ Nenhuma sessão extraída');
            return;
        }
        
        console.log('🇧🇷 Aplicando formatação brasileira...');
        
        // Headers conforme solicitado
        const headers = [
            'session_id', 'tenant_id', 'tenant_name', 'tenant_domain',
            'user_id', 'user_name', 'user_phone', 'conversation_outcome',
            'max_confidence_score', 'avg_confidence_score', 'duration_minutes',
            'message_count', 'total_tokens', 'total_cost_usd', 'cost_per_token',
            'first_message_at', 'last_message_at', 'conversation_duration_hours',
            'model_used', 'message_source'
        ];
        
        // Processar com formatação brasileira
        const processedSessions = allSessions.map(session => ({
            session_id: session.session_id,
            tenant_id: session.tenant_id,
            tenant_name: session.tenant_name || 'N/A',
            tenant_domain: session.tenant_domain || 'beauty',
            user_id: session.user_id,
            user_name: session.user_name || 'N/A',
            user_phone: session.user_phone || 'N/A',
            conversation_outcome: session.conversation_outcome || 'completed',
            max_confidence_score: formatBrazilianNumber(parseFloat(session.max_confidence_score || 0), 4),
            avg_confidence_score: formatBrazilianNumber(parseFloat(session.avg_confidence_score || 0), 4),
            duration_minutes: formatBrazilianNumber(parseFloat(session.duration_minutes || 0), 2),
            message_count: session.message_count,
            total_tokens: session.total_tokens,
            total_cost_usd: formatBrazilianCurrency(parseFloat(session.total_cost_usd || 0)),
            cost_per_token: formatBrazilianCurrency(parseFloat(session.cost_per_token || 0)),
            first_message_at: formatBrazilianDateTime(session.first_message_at),
            last_message_at: formatBrazilianDateTime(session.last_message_at),
            conversation_duration_hours: formatBrazilianNumber(parseFloat(session.conversation_duration_hours || 0), 3),
            model_used: session.model_used || 'gpt-4',
            message_source: session.message_source || 'whatsapp'
        }));
        
        const csvHeader = headers.join(',');
        const csvRows = processedSessions.map(session => 
            headers.map(header => {
                const value = session[header];
                return typeof value === 'string' && value.includes(',') 
                    ? `"${value}"` 
                    : value;
            }).join(',')
        );
        
        const csvContent = [csvHeader, ...csvRows].join('\n');
        
        // Salvar arquivo
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `conversation-sessions-ALL-REAL-${timestamp}.csv`;
        
        fs.writeFileSync(filename, csvContent, 'utf8');
        
        console.log(`\n✅ CSV COMPLETO GERADO: ${filename}`);
        console.log(`🎯 Total de sessões: ${processedSessions.length}`);
        console.log('🇧🇷 Formatação brasileira aplicada');
        
        // Estatísticas
        const totalMessages = processedSessions.reduce((sum, s) => sum + s.message_count, 0);
        const totalTokens = processedSessions.reduce((sum, s) => sum + s.total_tokens, 0);
        const totalCost = allSessions.reduce((sum, s) => sum + parseFloat(s.total_cost_usd || 0), 0);
        
        console.log('\n📊 ESTATÍSTICAS FINAIS:');
        console.log(`   💬 Total mensagens: ${totalMessages}`);
        console.log(`   🤖 Total tokens: ${totalTokens}`);
        console.log(`   💰 Custo total: ${formatBrazilianCurrency(totalCost)}`);
        
        console.log('\n📋 Preview:');
        console.log(csvHeader);
        console.log(csvRows[0]);
        console.log(csvRows[1]);
        
        return {
            success: true,
            filename,
            sessionCount: processedSessions.length
        };
        
    } catch (error) {
        console.error('💥 Erro:', error);
        throw error;
    }
}

// Executar
if (require.main === module) {
    (async () => {
        try {
            console.log('🎯 EXTRAINDO TODAS AS SESSÕES REAIS DO CONVERSATION_HISTORY');
            console.log('📊 Via Supabase Client com formatação brasileira\n');
            
            const result = await generateCompleteRealCSV();
            
            console.log('\n🎉 TAREFA CONCLUÍDA!');
            console.log(`📁 Arquivo: ${result.filename}`);
            console.log(`🎯 ${result.sessionCount} sessões reais extraídas`);
            
            process.exit(0);
        } catch (error) {
            console.error('\n💥 Erro fatal:', error);
            process.exit(1);
        }
    })();
}

module.exports = { generateCompleteRealCSV };