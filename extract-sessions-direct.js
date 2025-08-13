#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente Supabase não encontradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function extractSessionData() {
  console.log('🔍 Extraindo dados por sessão da conversation_history...');
  
  const { data, error } = await supabase
    .from('conversation_history')
    .select(`
      *,
      tenants(name, business_domain),
      users(name, phone)
    `)
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('❌ Erro:', error);
    return;
  }
  
  console.log(`📊 Total de mensagens extraídas: ${data.length}`);
  
  // Agrupar por session_id
  const sessions = {};
  data.forEach(msg => {
    const sessionId = msg.conversation_context?.session_id || `no_session_${msg.id}`;
    if (!sessions[sessionId]) {
      sessions[sessionId] = [];
    }
    sessions[sessionId].push(msg);
  });
  
  console.log(`🎯 Total de sessões: ${Object.keys(sessions).length}`);
  
  // Processar dados por sessão
  const sessionData = Object.entries(sessions).map(([sessionId, messages]) => {
    const firstMsg = messages[messages.length - 1]; // oldest first
    const lastMsg = messages[0]; // newest first
    
    const confidenceScores = messages.filter(m => m.confidence_score > 0);
    const maxConfidence = Math.max(...confidenceScores.map(m => m.confidence_score), 0);
    const avgConfidence = confidenceScores.length > 0 ? 
      confidenceScores.reduce((sum, m) => sum + m.confidence_score, 0) / confidenceScores.length : 0;
    
    const totalTokens = messages.reduce((sum, m) => sum + (m.tokens_used || 0), 0);
    const totalCost = messages.reduce((sum, m) => sum + (m.api_cost_usd || 0), 0);
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
      tenant_domain: firstMsg.tenants?.business_domain || 'general',
      user_id: firstMsg.user_id,
      user_name: firstMsg.users?.name || 'N/A',
      user_phone: firstMsg.users?.phone || 'N/A',
      conversation_outcome: firstMsg.conversation_context?.outcome || 'completed',
      max_confidence_score: maxConfidence.toFixed(4).replace('.', ','),
      avg_confidence_score: avgConfidence.toFixed(4).replace('.', ','),
      duration_minutes: durationMinutes.toFixed(2).replace('.', ','),
      message_count: messages.length,
      total_tokens: totalTokens,
      total_cost_usd: `R$ ${totalCost.toFixed(4).replace('.', ',')}`,
      cost_per_token: `R$ ${costPerToken.toFixed(6).replace('.', ',')}`,
      first_message_at: new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'America/Sao_Paulo'
      }).format(firstTime),
      last_message_at: new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'America/Sao_Paulo'
      }).format(lastTime),
      conversation_duration_hours: durationHours.toFixed(3).replace('.', ','),
      model_used: firstMsg.conversation_context?.model || 'gpt-4',
      message_source: 'whatsapp'
    };
  });
  
  // Gerar CSV
  const headers = [
    'session_id', 'tenant_id', 'tenant_name', 'tenant_domain',
    'user_id', 'user_name', 'user_phone', 'conversation_outcome', 
    'max_confidence_score', 'avg_confidence_score', 'duration_minutes',
    'message_count', 'total_tokens', 'total_cost_usd', 'cost_per_token',
    'first_message_at', 'last_message_at', 'conversation_duration_hours',
    'model_used', 'message_source'
  ];
  
  const csvRows = sessionData.map(session => 
    headers.map(header => {
      const value = session[header];
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
    }).join(',')
  );
  
  const csvContent = [headers.join(','), ...csvRows].join('\n');
  
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const filename = `conversation-sessions-database-${timestamp}.csv`;
  
  fs.writeFileSync(filename, csvContent, 'utf8');
  
  console.log(`✅ CSV gerado: ${filename}`);  
  console.log(`📊 Total de sessões: ${sessionData.length}`);
  console.log(`💬 Total de mensagens processadas: ${data.length}`);
}

extractSessionData().catch(console.error);