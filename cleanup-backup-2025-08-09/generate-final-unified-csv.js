const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Preços realísticos GPT-4 Turbo (mais usado em produção)
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

// Função principal
async function generateFinalUnifiedCSV() {
  console.log('🚀 Gerando CSV FINAL UNIFICADO com tokens realísticos...\n');

  try {
    // 1. Buscar todas as conversas
    console.log('📊 Carregando conversas...');
    
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
        tenants!inner(name, domain),
        users!inner(name, phone)
      `)
      .not('conversation_context->session_id', 'is', null)
      .order('created_at', { ascending: true });

    if (convError) {
      throw new Error(`Erro ao carregar conversas: ${convError.message}`);
    }

    console.log(`✅ ${conversations.length} mensagens carregadas`);

    // 2. Agrupar por sessão e recalcular tokens/custos
    const sessionMap = new Map();
    
    conversations.forEach((msg, globalIndex) => {
      const sessionId = msg.conversation_context?.session_id;
      if (!sessionId) return;

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          messages: [],
          tenant_name: msg.tenants?.name || 'Unknown',
          tenant_domain: msg.tenants?.domain || 'unknown',
          user_name: msg.users?.name || 'Unknown',
          user_phone: msg.users?.phone || 'Unknown',
          first_message_at: msg.created_at,
          last_message_at: msg.created_at,
          conversation_outcome: null,
          total_tokens: 0,
          total_cost: 0,
          max_confidence: 0,
          confidence_scores: []
        });
      }

      const session = sessionMap.get(sessionId);
      session.messages.push(msg);
      session.last_message_at = msg.created_at;
      
      if (msg.conversation_outcome) {
        session.conversation_outcome = msg.conversation_outcome;
      }
      
      if (msg.confidence_score && msg.confidence_score > 0) {
        session.max_confidence = Math.max(session.max_confidence, msg.confidence_score);
        session.confidence_scores.push(msg.confidence_score);
      }
    });

    // 3. Calcular tokens e custos realísticos para cada sessão
    console.log('🔢 Recalculando tokens e custos realísticos...');
    
    sessionMap.forEach((session, sessionId) => {
      session.messages.forEach((msg, msgIndex) => {
        const tokens = calculateRealisticTokens(msg.content, msg.is_from_user, msgIndex);
        const cost = calculateRealisticCost(tokens, msg.is_from_user);
        
        session.total_tokens += tokens;
        session.total_cost += cost;
      });
      
      // Calcular métricas da sessão
      session.message_count = session.messages.length;
      session.duration_minutes = session.conversation_context?.duration_minutes || 
        Math.ceil(session.messages.length * 1.5);
      session.avg_confidence = session.confidence_scores.length > 0 ? 
        session.confidence_scores.reduce((a, b) => a + b, 0) / session.confidence_scores.length : 0;
      session.conversation_duration_hours = 
        (new Date(session.last_message_at) - new Date(session.first_message_at)) / (1000 * 60 * 60);
    });

    // 4. Buscar agendamentos relacionados
    console.log('📅 Buscando agendamentos relacionados...');
    
    const sessionIds = Array.from(sessionMap.keys());
    
    const { data: appointments, error: aptError } = await supabase
      .from('appointments')
      .select(`
        appointment_data,
        quoted_price,
        final_price,
        start_time,
        status,
        service_id,
        professional_id
      `)
      .eq('appointment_data->source', 'whatsapp_conversation');

    if (aptError) {
      console.log('⚠️ Erro ao buscar agendamentos:', aptError.message);
    }

    // Buscar dados dos serviços e profissionais
    let serviceMap = new Map();
    let professionalMap = new Map();
    
    if (appointments && appointments.length > 0) {
      const serviceIds = [...new Set(appointments.map(a => a.service_id))];
      const professionalIds = [...new Set(appointments.map(a => a.professional_id))];
      
      const { data: services } = await supabase
        .from('services')
        .select('id, name, duration_minutes')
        .in('id', serviceIds);
        
      const { data: professionals } = await supabase
        .from('professionals')
        .select('id, name')
        .in('id', professionalIds);
      
      if (services) serviceMap = new Map(services.map(s => [s.id, s]));
      if (professionals) professionalMap = new Map(professionals.map(p => [p.id, p]));
    }

    // 5. Conectar agendamentos com sessões
    const appointmentMap = new Map();
    
    if (appointments) {
      appointments.forEach(apt => {
        const sessionId = apt.appointment_data?.session_id;
        if (sessionId && sessionIds.includes(sessionId)) {
          const service = serviceMap.get(apt.service_id) || { name: 'Unknown', duration_minutes: 0 };
          const professional = professionalMap.get(apt.professional_id) || { name: 'Unknown' };
          
          appointmentMap.set(sessionId, {
            has_appointment: true,
            appointment_date: apt.start_time,
            appointment_status: apt.status,
            service_name: service.name,
            service_duration: service.duration_minutes,
            professional_name: professional.name,
            quoted_price: parseFloat(apt.quoted_price || 0),
            final_price: parseFloat(apt.final_price || 0)
          });
        }
      });
    }

    console.log(`✅ ${appointmentMap.size} agendamentos conectados`);

    // 6. Preparar dados finais
    const finalData = Array.from(sessionMap.entries()).map(([sessionId, session]) => {
      const appointment = appointmentMap.get(sessionId) || {
        has_appointment: false,
        appointment_date: null,
        appointment_status: null,
        service_name: null,
        service_duration: null,
        professional_name: null,
        quoted_price: 0,
        final_price: 0
      };

      return {
        session_id: sessionId,
        tenant_name: session.tenant_name,
        tenant_domain: session.tenant_domain,
        user_name: session.user_name,
        user_phone: session.user_phone,
        conversation_outcome: session.conversation_outcome,
        max_confidence_score: session.max_confidence,
        avg_confidence_score: session.avg_confidence,
        duration_minutes: session.duration_minutes,
        message_count: session.message_count,
        total_tokens: session.total_tokens,
        total_cost_usd: session.total_cost,
        cost_per_token: session.total_tokens > 0 ? session.total_cost / session.total_tokens : 0,
        first_message_at: session.first_message_at,
        last_message_at: session.last_message_at,
        conversation_duration_hours: session.conversation_duration_hours,
        ...appointment,
        revenue_conversion_rate: appointment.has_appointment && session.total_cost > 0 ? 
          (appointment.final_price / (session.total_cost * 5.5)) : 0 // USD to BRL conversion
      };
    }).sort((a, b) => new Date(b.first_message_at) - new Date(a.first_message_at));

    console.log(`✅ ${finalData.length} conversas processadas`);

    // 7. Gerar CSV
    const csvHeader = [
      'session_id',
      'tenant_name',
      'tenant_domain',
      'user_name', 
      'user_phone',
      'conversation_outcome',
      'max_confidence_score',
      'avg_confidence_score',
      'duration_minutes',
      'message_count',
      'total_tokens',
      'total_cost_usd',
      'cost_per_token_usd',
      'first_message_at',
      'last_message_at',
      'conversation_duration_hours',
      'has_appointment',
      'appointment_date',
      'appointment_status',
      'service_name',
      'service_duration_minutes',
      'professional_name',
      'quoted_price_brl',
      'final_price_brl',
      'revenue_conversion_rate'
    ].join(',');

    const csvRows = finalData.map(conv => [
      escapeCSVValue(conv.session_id),
      escapeCSVValue(conv.tenant_name),  
      escapeCSVValue(conv.tenant_domain),
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
      escapeCSVValue(conv.has_appointment),
      escapeCSVValue(conv.appointment_date || ''),
      escapeCSVValue(conv.appointment_status || ''),
      escapeCSVValue(conv.service_name || ''),
      escapeCSVValue(conv.service_duration || ''),
      escapeCSVValue(conv.professional_name || ''),
      escapeCSVValue(conv.quoted_price || '0'),
      escapeCSVValue(conv.final_price || '0'),
      escapeCSVValue(conv.revenue_conversion_rate?.toFixed(2) || '0.00')
    ].join(','));

    const csvContent = [csvHeader, ...csvRows].join('\n');

    // 8. Salvar arquivo
    const fileName = `conversations_unified_realistic_${new Date().toISOString().split('T')[0]}.csv`;
    const filePath = path.join(__dirname, fileName);
    
    fs.writeFileSync(filePath, csvContent, 'utf8');

    // 9. Estatísticas finais
    const stats = {
      totalConversations: finalData.length,
      totalTokens: finalData.reduce((sum, c) => sum + c.total_tokens, 0),
      totalCost: finalData.reduce((sum, c) => sum + c.total_cost_usd, 0),
      conversionsToAppointments: finalData.filter(c => c.has_appointment).length,
      totalRevenue: finalData.reduce((sum, c) => sum + c.final_price, 0),
      avgTokensPerConversation: 0,
      avgCostPerConversation: 0,
      conversionRate: 0,
      revenuePerDollar: 0
    };

    stats.avgTokensPerConversation = stats.totalTokens / stats.totalConversations;
    stats.avgCostPerConversation = stats.totalCost / stats.totalConversations;
    stats.conversionRate = (stats.conversionsToAppointments / stats.totalConversations) * 100;
    stats.revenuePerDollar = stats.totalCost > 0 ? (stats.totalRevenue / (stats.totalCost * 5.5)) : 0;

    // Relatório final
    console.log('\n🎉 CSV FINAL UNIFICADO gerado com sucesso!');
    console.log(`📁 Arquivo: ${fileName}`);
    console.log(`📊 Estatísticas com valores REALÍSTICOS:`);
    console.log(`   • Total de conversas: ${stats.totalConversations.toLocaleString()}`);
    console.log(`   • Total de tokens: ${stats.totalTokens.toLocaleString()}`);
    console.log(`   • Tokens médios/conversa: ${Math.round(stats.avgTokensPerConversation)}`);
    console.log(`   • Custo total: $${stats.totalCost.toFixed(6)}`);  
    console.log(`   • Custo médio/conversa: $${stats.avgCostPerConversation.toFixed(6)}`);
    console.log(`   • Taxa de conversão: ${stats.conversionRate.toFixed(1)}%`);
    console.log(`   • Receita total: R$ ${stats.totalRevenue.toFixed(2)}`);
    console.log(`   • ROI: R$ ${stats.revenuePerDollar.toFixed(2)} por USD gasto`);

    console.log('\n👀 Preview do CSV (primeira linha):');
    console.log(csvHeader);
    console.log(csvRows[0]);

    console.log(`\n✅ Arquivo salvo em: ${filePath}`);
    console.log('🚀 CSV UNIFICADO com tokens e preços REALÍSTICOS pronto!');

    return { fileName, filePath, stats };

  } catch (error) {
    console.error('❌ Erro ao gerar CSV final:', error);
    throw error;
  }
}

if (require.main === module) {
  generateFinalUnifiedCSV();
}

module.exports = { generateFinalUnifiedCSV };