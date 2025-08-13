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

// 1. GERAR CSV DE CONVERSAS
async function generateConversationsCSV() {
  console.log('📊 Gerando CSV de CONVERSAS com dados realísticos...\n');

  try {
    // Buscar todas as conversas
    console.log('🔍 Carregando conversas...');
    
    const { data: conversations, error: convError } = await supabase
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
        message_source,
        tenants!inner(name, domain),
        users!inner(name, phone)
      `)
      .not('conversation_context->session_id', 'is', null)
      .order('created_at', { ascending: true });

    if (convError) {
      throw new Error(`Erro ao carregar conversas: ${convError.message}`);
    }

    console.log(`✅ ${conversations.length} mensagens carregadas`);

    // Agrupar por sessão e recalcular tokens/custos
    const sessionMap = new Map();
    
    conversations.forEach((msg, globalIndex) => {
      const sessionId = msg.conversation_context?.session_id;
      if (!sessionId) return;

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          messages: [],
          session_id: sessionId,
          tenant_id: msg.tenant_id,
          tenant_name: msg.tenants?.name || 'Unknown',
          tenant_domain: msg.tenants?.domain || 'unknown',
          user_id: msg.user_id,
          user_name: msg.users?.name || 'Unknown',
          user_phone: msg.users?.phone || 'Unknown',
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

    // Calcular tokens e custos realísticos para cada sessão
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

    const conversationsData = Array.from(sessionMap.values())
      .sort((a, b) => new Date(b.first_message_at) - new Date(a.first_message_at));

    console.log(`✅ ${conversationsData.length} conversas processadas`);

    // Gerar CSV de Conversas
    const conversationsHeader = [
      'session_id',
      'tenant_id',
      'tenant_name',
      'tenant_domain',
      'user_id',
      'user_name',
      'user_phone',
      'conversation_outcome',
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

    const conversationsRows = conversationsData.map(conv => [
      escapeCSVValue(conv.session_id),
      escapeCSVValue(conv.tenant_id),
      escapeCSVValue(conv.tenant_name),
      escapeCSVValue(conv.tenant_domain),
      escapeCSVValue(conv.user_id),
      escapeCSVValue(conv.user_name),
      escapeCSVValue(conv.user_phone),
      escapeCSVValue(conv.conversation_outcome),
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

    // Salvar CSV de Conversas
    const conversationsFileName = `conversas_${new Date().toISOString().split('T')[0]}.csv`;
    const conversationsFilePath = path.join(__dirname, conversationsFileName);
    
    fs.writeFileSync(conversationsFilePath, conversationsCSV, 'utf8');

    // Estatísticas das conversas
    const conversationsStats = {
      totalConversations: conversationsData.length,
      totalTokens: conversationsData.reduce((sum, c) => sum + c.total_tokens, 0),
      totalCost: conversationsData.reduce((sum, c) => sum + c.total_cost_usd, 0),
      avgTokensPerConversation: 0,
      avgCostPerConversation: 0,
      outcomeDistribution: {}
    };

    conversationsStats.avgTokensPerConversation = conversationsStats.totalTokens / conversationsStats.totalConversations;
    conversationsStats.avgCostPerConversation = conversationsStats.totalCost / conversationsStats.totalConversations;

    // Distribuição de outcomes
    conversationsData.forEach(c => {
      const outcome = c.conversation_outcome || 'null';
      conversationsStats.outcomeDistribution[outcome] = (conversationsStats.outcomeDistribution[outcome] || 0) + 1;
    });

    console.log('\n📊 CONVERSAS CSV gerado!');
    console.log(`📁 Arquivo: ${conversationsFileName}`);
    console.log(`   • ${conversationsStats.totalConversations} conversas`);
    console.log(`   • ${conversationsStats.totalTokens.toLocaleString()} tokens`);
    console.log(`   • $${conversationsStats.totalCost.toFixed(6)} custo total`);
    console.log(`   • ${Math.round(conversationsStats.avgTokensPerConversation)} tokens/conversa`);

    return {
      fileName: conversationsFileName,
      filePath: conversationsFilePath,
      stats: conversationsStats,
      sessionIds: conversationsData.map(c => c.session_id)
    };

  } catch (error) {
    console.error('❌ Erro ao gerar CSV de conversas:', error);
    throw error;
  }
}

// 2. GERAR CSV DE AGENDAMENTOS
async function generateAppointmentsCSV(conversationSessionIds) {
  console.log('\n📅 Gerando CSV de AGENDAMENTOS...\n');

  try {
    // Buscar agendamentos relacionados às conversas
    console.log('🔍 Carregando agendamentos...');
    
    const { data: appointments, error: aptError } = await supabase
      .from('appointments')
      .select(`
        id,
        tenant_id,
        user_id,
        service_id,
        professional_id,
        start_time,
        end_time,
        timezone,
        status,
        quoted_price,
        final_price,
        currency,
        customer_notes,
        internal_notes,
        appointment_data,
        created_at,
        updated_at,
        cancelled_at,
        cancellation_reason
      `)
      .contains('appointment_data', { source: 'whatsapp_conversation' });

    if (aptError) {
      throw new Error(`Erro ao carregar agendamentos: ${aptError.message}`);
    }

    if (!appointments || appointments.length === 0) {
      console.log('⚠️ Nenhum agendamento encontrado');
      return null;
    }

    console.log(`✅ ${appointments.length} agendamentos carregados`);

    // Buscar dados relacionados (tenants, users, services, professionals)
    const tenantIds = [...new Set(appointments.map(a => a.tenant_id))];
    const userIds = [...new Set(appointments.map(a => a.user_id))];
    const serviceIds = [...new Set(appointments.map(a => a.service_id))];
    const professionalIds = [...new Set(appointments.map(a => a.professional_id))];

    console.log('🔍 Carregando dados relacionados...');

    const [
      { data: tenants },
      { data: users },
      { data: services },
      { data: professionals }
    ] = await Promise.all([
      supabase.from('tenants').select('id, name, domain').in('id', tenantIds),
      supabase.from('users').select('id, name, phone').in('id', userIds),
      supabase.from('services').select('id, name, duration_minutes, base_price').in('id', serviceIds),
      supabase.from('professionals').select('id, name').in('id', professionalIds)
    ]);

    // Criar maps para lookup rápido
    const tenantMap = new Map((tenants || []).map(t => [t.id, t]));
    const userMap = new Map((users || []).map(u => [u.id, u]));
    const serviceMap = new Map((services || []).map(s => [s.id, s]));
    const professionalMap = new Map((professionals || []).map(p => [p.id, p]));

    console.log('🔄 Processando agendamentos...');

    // Processar agendamentos
    const appointmentsData = appointments.map(apt => {
      const tenant = tenantMap.get(apt.tenant_id) || { name: 'Unknown', domain: 'unknown' };
      const user = userMap.get(apt.user_id) || { name: 'Unknown', phone: 'Unknown' };
      const service = serviceMap.get(apt.service_id) || { name: 'Unknown', duration_minutes: 0, base_price: 0 };
      const professional = professionalMap.get(apt.professional_id) || { name: 'Unknown' };

      const sessionId = apt.appointment_data?.session_id || null;
      const hasConversation = conversationSessionIds.includes(sessionId);

      return {
        appointment_id: apt.id,
        session_id: sessionId,
        has_conversation: hasConversation,
        tenant_id: apt.tenant_id,
        tenant_name: tenant.name,
        tenant_domain: tenant.domain,
        user_id: apt.user_id,
        user_name: user.name,
        user_phone: user.phone,
        service_id: apt.service_id,
        service_name: service.name,
        service_duration_minutes: service.duration_minutes,
        service_base_price: service.base_price,
        professional_id: apt.professional_id,
        professional_name: professional.name,
        appointment_date: apt.start_time,
        appointment_end: apt.end_time,
        timezone: apt.timezone,
        status: apt.status,
        quoted_price: parseFloat(apt.quoted_price || 0),
        final_price: parseFloat(apt.final_price || 0),
        currency: apt.currency,
        price_difference: parseFloat(apt.final_price || 0) - parseFloat(apt.quoted_price || 0),
        customer_notes: apt.customer_notes,
        internal_notes: apt.internal_notes,
        created_at: apt.created_at,
        updated_at: apt.updated_at,
        cancelled_at: apt.cancelled_at,
        cancellation_reason: apt.cancellation_reason,
        appointment_source: apt.appointment_data?.source || 'unknown',
        conversation_date: apt.appointment_data?.conversation_date || null
      };
    }).sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date));

    console.log(`✅ ${appointmentsData.length} agendamentos processados`);

    // Gerar CSV de Agendamentos
    const appointmentsHeader = [
      'appointment_id',
      'session_id',
      'has_conversation',
      'tenant_name',
      'tenant_domain',
      'user_name',
      'user_phone',
      'service_name',
      'service_duration_minutes',
      'professional_name',
      'appointment_date',
      'appointment_end',
      'timezone',
      'status',
      'quoted_price',
      'final_price',
      'currency',
      'price_difference',
      'customer_notes',
      'internal_notes',
      'created_at',
      'updated_at',
      'cancelled_at',
      'cancellation_reason',
      'appointment_source',
      'conversation_date'
    ].join(',');

    const appointmentsRows = appointmentsData.map(apt => [
      escapeCSVValue(apt.appointment_id),
      escapeCSVValue(apt.session_id || ''),
      escapeCSVValue(apt.has_conversation),
      escapeCSVValue(apt.tenant_name),
      escapeCSVValue(apt.tenant_domain),
      escapeCSVValue(apt.user_name),
      escapeCSVValue(apt.user_phone),
      escapeCSVValue(apt.service_name),
      escapeCSVValue(apt.service_duration_minutes || 0),
      escapeCSVValue(apt.professional_name),
      escapeCSVValue(apt.appointment_date),
      escapeCSVValue(apt.appointment_end),
      escapeCSVValue(apt.timezone),
      escapeCSVValue(apt.status),
      escapeCSVValue(apt.quoted_price || 0),
      escapeCSVValue(apt.final_price || 0),
      escapeCSVValue(apt.currency),
      escapeCSVValue(apt.price_difference || 0),
      escapeCSVValue(apt.customer_notes || ''),
      escapeCSVValue(apt.internal_notes || ''),
      escapeCSVValue(apt.created_at),
      escapeCSVValue(apt.updated_at),
      escapeCSVValue(apt.cancelled_at || ''),
      escapeCSVValue(apt.cancellation_reason || ''),
      escapeCSVValue(apt.appointment_source),
      escapeCSVValue(apt.conversation_date || '')
    ].join(','));

    const appointmentsCSV = [appointmentsHeader, ...appointmentsRows].join('\n');

    // Salvar CSV de Agendamentos
    const appointmentsFileName = `agendamentos_${new Date().toISOString().split('T')[0]}.csv`;
    const appointmentsFilePath = path.join(__dirname, appointmentsFileName);
    
    fs.writeFileSync(appointmentsFilePath, appointmentsCSV, 'utf8');

    // Estatísticas dos agendamentos
    const appointmentsStats = {
      totalAppointments: appointmentsData.length,
      appointmentsWithConversation: appointmentsData.filter(a => a.has_conversation).length,
      totalRevenue: appointmentsData.reduce((sum, a) => sum + a.final_price, 0),
      avgAppointmentValue: 0,
      statusDistribution: {},
      serviceDistribution: {}
    };

    appointmentsStats.avgAppointmentValue = appointmentsStats.totalRevenue / appointmentsStats.totalAppointments;
    appointmentsStats.conversionRate = (appointmentsStats.appointmentsWithConversation / appointmentsStats.totalAppointments) * 100;

    // Distribuições
    appointmentsData.forEach(a => {
      const status = a.status || 'unknown';
      const service = a.service_name || 'unknown';
      
      appointmentsStats.statusDistribution[status] = (appointmentsStats.statusDistribution[status] || 0) + 1;
      appointmentsStats.serviceDistribution[service] = (appointmentsStats.serviceDistribution[service] || 0) + 1;
    });

    console.log('\n📅 AGENDAMENTOS CSV gerado!');
    console.log(`📁 Arquivo: ${appointmentsFileName}`);
    console.log(`   • ${appointmentsStats.totalAppointments} agendamentos`);
    console.log(`   • ${appointmentsStats.appointmentsWithConversation} com conversa`);
    console.log(`   • R$ ${appointmentsStats.totalRevenue.toFixed(2)} receita total`);
    console.log(`   • R$ ${appointmentsStats.avgAppointmentValue.toFixed(2)} valor médio`);

    return {
      fileName: appointmentsFileName,
      filePath: appointmentsFilePath,
      stats: appointmentsStats
    };

  } catch (error) {
    console.error('❌ Erro ao gerar CSV de agendamentos:', error);
    throw error;
  }
}

// FUNÇÃO PRINCIPAL
async function generateSeparatedCSVs() {
  console.log('🚀 Gerando CSVs SEPARADOS: Conversas + Agendamentos\n');

  try {
    // 1. Gerar CSV de Conversas
    const conversationsResult = await generateConversationsCSV();
    
    // 2. Gerar CSV de Agendamentos
    const appointmentsResult = await generateAppointmentsCSV(conversationsResult.sessionIds);

    // 3. Relatório final
    console.log('\n🎉 CSVs SEPARADOS gerados com sucesso!');
    console.log('\n📊 RESUMO FINAL:');
    
    console.log('\n📝 CONVERSAS:');
    console.log(`   📁 Arquivo: ${conversationsResult.fileName}`);
    console.log(`   📊 ${conversationsResult.stats.totalConversations} conversas`);
    console.log(`   🎯 ${conversationsResult.stats.totalTokens.toLocaleString()} tokens (realísticos)`);
    console.log(`   💰 $${conversationsResult.stats.totalCost.toFixed(6)} custo total`);
    
    if (appointmentsResult) {
      console.log('\n📅 AGENDAMENTOS:');
      console.log(`   📁 Arquivo: ${appointmentsResult.fileName}`);
      console.log(`   📊 ${appointmentsResult.stats.totalAppointments} agendamentos`);
      console.log(`   🔗 ${appointmentsResult.stats.appointmentsWithConversation} com conversa`);
      console.log(`   💰 R$ ${appointmentsResult.stats.totalRevenue.toFixed(2)} receita total`);
      
      console.log('\n🔗 RELACIONAMENTO:');
      console.log(`   📋 Campo "session_id" conecta os dois CSVs`);
      console.log(`   📊 Análise cruzada possível via session_id`);
    }

    console.log('\n✅ Dados prontos para análise separada ou cruzada!');

    return {
      conversations: conversationsResult,
      appointments: appointmentsResult
    };

  } catch (error) {
    console.error('❌ Erro fatal:', error);
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  generateSeparatedCSVs();
}

module.exports = { generateSeparatedCSVs, generateConversationsCSV, generateAppointmentsCSV };