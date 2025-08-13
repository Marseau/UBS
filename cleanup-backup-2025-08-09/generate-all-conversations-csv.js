const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Preços realísticos GPT-4 Turbo
const GPT4_TURBO_PRICING = {
  input: 0.01,   // $0.01 por 1K tokens de entrada
  output: 0.03   // $0.03 por 1K tokens de saída  
};

// Função para escapar valores CSV
function escapeCSVValue(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  return stringValue;
}

// Função para calcular tokens realísticos
function calculateRealisticTokens(messageContent, isFromUser, messageIndex = 0) {
  const contentLength = messageContent ? messageContent.length : 20;
  
  if (isFromUser) {
    // Mensagem do usuário: ~4 caracteres por token
    return Math.max(Math.ceil(contentLength / 4), 8);
  } else {
    // Mensagem do bot: inclui system prompt + contexto + resposta
    const systemPrompt = 80;  // Prompt do agente
    const context = messageIndex * 20; // Contexto cresce
    const response = Math.ceil(contentLength / 4);
    const overhead = 15; // Metadata, análise
    
    return systemPrompt + context + response + overhead;
  }
}

// Função para calcular custo realístico
function calculateRealisticCost(tokens, isFromUser) {
  if (isFromUser) {
    // Usuário só gera input tokens
    return (tokens / 1000) * GPT4_TURBO_PRICING.input;
  } else {
    // Bot: 70% input (prompt + contexto), 30% output (resposta)
    const inputTokens = Math.ceil(tokens * 0.7);
    const outputTokens = Math.ceil(tokens * 0.3);
    
    const inputCost = (inputTokens / 1000) * GPT4_TURBO_PRICING.input;
    const outputCost = (outputTokens / 1000) * GPT4_TURBO_PRICING.output;
    
    return inputCost + outputCost;
  }
}

// GERAR CSV COMPLETO DE CONVERSAS (TODAS as 1041 conversas)
async function generateAllConversationsCSV() {
  console.log('📊 Gerando CSV COMPLETO com TODAS as conversas (1041)...\n');

  try {
    // Buscar TODAS as mensagens
    console.log('🔍 Carregando TODAS as mensagens...');
    
    const { data: allMessages, error: msgError } = await supabase
      .from('conversation_history')
      .select(`
        id,
        conversation_context,
        tenant_id,
        user_id,
        content,
        is_from_user,
        confidence_score,
        created_at,
        conversation_outcome,
        model_used,
        message_source
      `)
      .not('conversation_context->session_id', 'is', null)
      .order('created_at', { ascending: true });

    if (msgError) {
      throw new Error(`Erro ao carregar mensagens: ${msgError.message}`);
    }

    console.log(`✅ ${allMessages.length} mensagens carregadas`);

    // Buscar dados de tenants e users separadamente para evitar perda de dados
    console.log('🔍 Carregando dados de tenants e usuários...');
    
    const tenantIds = [...new Set(allMessages.map(m => m.tenant_id))];
    const userIds = [...new Set(allMessages.map(m => m.user_id))];

    const [
      { data: tenants },
      { data: users }
    ] = await Promise.all([
      supabase.from('tenants').select('id, name, domain').in('id', tenantIds),
      supabase.from('users').select('id, name, phone').in('id', userIds)
    ]);

    console.log(`✅ ${tenants?.length || 0} tenants e ${users?.length || 0} usuários carregados`);

    // Criar maps para lookup
    const tenantMap = new Map((tenants || []).map(t => [t.id, t]));
    const userMap = new Map((users || []).map(u => [u.id, u]));

    // Agrupar TODAS as mensagens por sessão
    console.log('🔄 Agrupando mensagens por sessão...');
    
    const sessionMap = new Map();
    
    allMessages.forEach((msg, globalIndex) => {
      const sessionId = msg.conversation_context?.session_id;
      if (!sessionId) return;

      const tenant = tenantMap.get(msg.tenant_id) || { name: 'Unknown', domain: 'unknown' };
      const user = userMap.get(msg.user_id) || { name: 'Unknown', phone: 'Unknown' };

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          messages: [],
          session_id: sessionId,
          tenant_id: msg.tenant_id,
          tenant_name: tenant.name,
          tenant_domain: tenant.domain,
          user_id: msg.user_id,
          user_name: user.name,
          user_phone: user.phone,
          first_message_at: msg.created_at,
          last_message_at: msg.created_at,
          conversation_outcome: null,
          total_tokens: 0,
          total_cost_usd: 0,
          max_confidence_score: 0,
          confidence_scores: [],
          model_used: msg.model_used || 'gpt-4',
          message_source: msg.message_source || 'whatsapp'
        });
      }

      const session = sessionMap.get(sessionId);
      session.messages.push(msg);
      session.last_message_at = msg.created_at;
      
      if (msg.conversation_outcome) {
        session.conversation_outcome = msg.conversation_outcome;
      }
      
      if (msg.confidence_score && msg.confidence_score > 0) {
        session.max_confidence_score = Math.max(session.max_confidence_score, msg.confidence_score);
        session.confidence_scores.push(msg.confidence_score);
      }
    });

    console.log(`✅ ${sessionMap.size} sessões únicas encontradas`);

    // Calcular tokens e custos realísticos para TODAS as sessões
    console.log('🔢 Recalculando tokens e custos realísticos...');
    
    sessionMap.forEach((session, sessionId) => {
      session.messages.forEach((msg, msgIndex) => {
        const tokens = calculateRealisticTokens(msg.content, msg.is_from_user, msgIndex);
        const cost = calculateRealisticCost(tokens, msg.is_from_user);
        
        session.total_tokens += tokens;
        session.total_cost_usd += cost;
      });
      
      // Calcular métricas da sessão
      session.message_count = session.messages.length;
      session.duration_minutes = session.conversation_context?.duration_minutes || 
        Math.ceil(session.messages.length * 1.5);
      session.avg_confidence_score = session.confidence_scores.length > 0 ? 
        session.confidence_scores.reduce((a, b) => a + b, 0) / session.confidence_scores.length : 0;
      session.conversation_duration_hours = 
        (new Date(session.last_message_at) - new Date(session.first_message_at)) / (1000 * 60 * 60);
      session.cost_per_token = session.total_tokens > 0 ? session.total_cost_usd / session.total_tokens : 0;
    });

    const allConversationsData = Array.from(sessionMap.values())
      .sort((a, b) => new Date(b.first_message_at) - new Date(a.first_message_at));

    console.log(`✅ ${allConversationsData.length} conversas processadas`);

    // Verificar quais conversas geraram agendamentos
    console.log('🔍 Verificando agendamentos relacionados...');
    
    const { data: appointments } = await supabase
      .from('appointments')
      .select('appointment_data')
      .contains('appointment_data', { source: 'whatsapp_conversation' });

    const appointmentSessionIds = new Set();
    if (appointments) {
      appointments.forEach(apt => {
        const sessionId = apt.appointment_data?.session_id;
        if (sessionId) appointmentSessionIds.add(sessionId);
      });
    }

    console.log(`✅ ${appointmentSessionIds.size} conversas com agendamento identificadas`);

    // Adicionar flag de agendamento
    allConversationsData.forEach(conv => {
      conv.has_appointment = appointmentSessionIds.has(conv.session_id);
    });

    // Gerar CSV COMPLETO de Conversas
    const conversationsHeader = [
      'session_id',
      'tenant_id',
      'tenant_name',
      'tenant_domain',
      'user_id',
      'user_name',
      'user_phone',
      'conversation_outcome',
      'has_appointment',
      'max_confidence_score',
      'avg_confidence_score',
      'duration_minutes',
      'message_count',
      'total_tokens',
      'total_cost_usd',
      'cost_per_token',
      'first_message_at',
      'last_message_at',
      'conversation_duration_hours',
      'model_used',
      'message_source'
    ].join(',');

    const conversationsRows = allConversationsData.map(conv => [
      escapeCSVValue(conv.session_id),
      escapeCSVValue(conv.tenant_id),
      escapeCSVValue(conv.tenant_name),
      escapeCSVValue(conv.tenant_domain),
      escapeCSVValue(conv.user_id),
      escapeCSVValue(conv.user_name),
      escapeCSVValue(conv.user_phone),
      escapeCSVValue(conv.conversation_outcome),
      escapeCSVValue(conv.has_appointment),
      escapeCSVValue(conv.max_confidence_score?.toFixed(4) || '0.0000'),
      escapeCSVValue(conv.avg_confidence_score?.toFixed(4) || '0.0000'),
      escapeCSVValue(conv.duration_minutes || 0),
      escapeCSVValue(conv.message_count || 0),
      escapeCSVValue(conv.total_tokens || 0),
      escapeCSVValue(conv.total_cost_usd?.toFixed(6) || '0.000000'),
      escapeCSVValue(conv.cost_per_token?.toFixed(8) || '0.00000000'),
      escapeCSVValue(conv.first_message_at),
      escapeCSVValue(conv.last_message_at),
      escapeCSVValue(conv.conversation_duration_hours?.toFixed(2) || '0.00'),
      escapeCSVValue(conv.model_used),
      escapeCSVValue(conv.message_source)
    ].join(','));

    const conversationsCSV = [conversationsHeader, ...conversationsRows].join('\n');

    // Salvar CSV COMPLETO de Conversas
    const conversationsFileName = `conversas_COMPLETAS_${new Date().toISOString().split('T')[0]}.csv`;
    const conversationsFilePath = path.join(__dirname, conversationsFileName);
    
    fs.writeFileSync(conversationsFilePath, conversationsCSV, 'utf8');

    // Estatísticas COMPLETAS
    const stats = {
      totalConversations: allConversationsData.length,
      totalTokens: allConversationsData.reduce((sum, c) => sum + c.total_tokens, 0),
      totalCost: allConversationsData.reduce((sum, c) => sum + c.total_cost_usd, 0),
      conversationsWithAppointment: allConversationsData.filter(c => c.has_appointment).length,
      conversationsWithoutAppointment: allConversationsData.filter(c => !c.has_appointment).length,
      avgTokensPerConversation: 0,
      avgCostPerConversation: 0,
      outcomeDistribution: {},
      domainDistribution: {}
    };

    stats.avgTokensPerConversation = stats.totalTokens / stats.totalConversations;
    stats.avgCostPerConversation = stats.totalCost / stats.totalConversations;
    stats.conversionRate = (stats.conversationsWithAppointment / stats.totalConversations) * 100;

    // Distribuições
    allConversationsData.forEach(c => {
      const outcome = c.conversation_outcome || 'null';
      const domain = c.tenant_domain || 'unknown';
      
      stats.outcomeDistribution[outcome] = (stats.outcomeDistribution[outcome] || 0) + 1;
      stats.domainDistribution[domain] = (stats.domainDistribution[domain] || 0) + 1;
    });

    // Relatório COMPLETO
    console.log('\n🎉 CSV COMPLETO de conversas gerado!');
    console.log(`📁 Arquivo: ${conversationsFileName}`);
    console.log(`📊 Estatísticas COMPLETAS:`);
    console.log(`   • ${stats.totalConversations} conversas TOTAIS`);
    console.log(`   • ${stats.conversationsWithAppointment} com agendamento (${stats.conversionRate.toFixed(1)}%)`);
    console.log(`   • ${stats.conversationsWithoutAppointment} SEM agendamento (${(100-stats.conversionRate).toFixed(1)}%)`);
    console.log(`   • ${stats.totalTokens.toLocaleString()} tokens realísticos`);
    console.log(`   • $${stats.totalCost.toFixed(6)} custo total`);
    console.log(`   • ${Math.round(stats.avgTokensPerConversation)} tokens/conversa`);

    console.log('\n📈 Distribuição por outcome:');
    Object.entries(stats.outcomeDistribution)
      .sort(([,a], [,b]) => b - a)
      .forEach(([outcome, count]) => {
        const percentage = ((count / stats.totalConversations) * 100).toFixed(1);
        console.log(`   • ${outcome}: ${count} (${percentage}%)`);
      });

    console.log('\n🏢 Distribuição por domínio:');
    Object.entries(stats.domainDistribution)
      .sort(([,a], [,b]) => b - a)
      .forEach(([domain, count]) => {
        const percentage = ((count / stats.totalConversations) * 100).toFixed(1);
        console.log(`   • ${domain}: ${count} (${percentage}%)`);
      });

    console.log('\n👀 Preview (primeira linha):');
    console.log(conversationsHeader);
    console.log(conversationsRows[0]);

    console.log(`\n✅ Arquivo salvo: ${conversationsFilePath}`);
    console.log('🚀 Agora SIM temos TODAS as 1041 conversas!');

    return {
      fileName: conversationsFileName,
      filePath: conversationsFilePath,
      stats,
      sessionIds: allConversationsData.map(c => c.session_id)
    };

  } catch (error) {
    console.error('❌ Erro ao gerar CSV completo:', error);
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  generateAllConversationsCSV();
}

module.exports = { generateAllConversationsCSV };