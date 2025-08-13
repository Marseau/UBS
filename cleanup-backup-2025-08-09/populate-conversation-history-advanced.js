const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Cache para dados do banco
let TENANTS_DATA = [];
let USERS_DATA = [];
let SERVICES_DATA = [];
let PROFESSIONALS_DATA = [];

// Configurações do script
const CONFIG = {
  DAYS_BACK: 90,                    // Histórico de 90 dias
  CONVERSATIONS_PER_DAY: 15,        // Conversas por dia
  SUCCESS_RATE: 0.75,               // 75% das conversas geram agendamento
  REALISTIC_HOURS: [8, 9, 10, 11, 14, 15, 16, 17, 18, 19], // Horários comerciais
  MIN_MESSAGES_PER_CONVERSATION: 3,
  MAX_MESSAGES_PER_CONVERSATION: 12
};

// Todos os outcomes possíveis baseados no constraint do banco
const VALID_OUTCOMES = [
  'appointment_created',
  'info_request_fulfilled', 
  'business_hours_inquiry',
  'price_inquiry',
  'location_inquiry',
  'booking_abandoned',
  'timeout_abandoned',
  'wrong_number',
  'spam_detected',
  'test_message',
  'appointment_rescheduled',
  'appointment_cancelled',
  'appointment_confirmed',
  'appointment_inquiry',
  'appointment_modified',
  'appointment_noshow_followup'
];

// Templates expandidos por domínio e outcome
const CONVERSATION_TEMPLATES = {
  beauty: {
    appointment_created: [
      {
        messages: [
          { user: 'Oi! Quero agendar corte de cabelo', intent: 'booking_request', confidence: 0.94 },
          { bot: 'Olá! Temos horários disponíveis. Que dia prefere?' },
          { user: 'Quinta à tarde pode ser?', intent: 'date_preference', confidence: 0.87 },
          { bot: 'Perfeito! Quinta às 15h com {professional}. Confirma?' },
          { user: 'Confirmo!', intent: 'confirmation', confidence: 0.95 },
          { bot: 'Agendado! {service} quinta às 15h. Te lembro um dia antes!' }
        ]
      },
      {
        messages: [
          { user: 'Gostaria de fazer uma limpeza de pele', intent: 'booking_request', confidence: 0.91 },
          { bot: 'Claro! Nossa {service} custa R$ {price}. Quando seria ideal?' },
          { user: 'Sexta de manhã estou livre', intent: 'date_preference', confidence: 0.88 },
          { bot: 'Tenho sexta às 9h disponível com {professional}' },
          { user: 'Perfeito, pode agendar', intent: 'confirmation', confidence: 0.93 },
          { bot: 'Pronto! {service} sexta 9h. Duração: {duration}min' }
        ]
      }
    ],
    price_inquiry: [
      {
        messages: [
          { user: 'Quanto custa uma manicure?', intent: 'price_inquiry', confidence: 0.96 },
          { bot: 'Nossa {service} custa R$ {price} e demora {duration} minutos' },
          { user: 'Inclui esmaltação?', intent: 'service_details', confidence: 0.84 },
          { bot: 'Sim! Inclui cutícula + esmaltação + hidratação' },
          { user: 'Obrigada pela informação', intent: 'gratitude', confidence: 0.89 }
        ]
      }
    ],
    appointment_cancelled: [
      {
        messages: [
          { user: 'Preciso cancelar meu agendamento de amanhã', intent: 'cancellation_request', confidence: 0.97 },
          { bot: 'Localizei: {service} às {time}h com {professional}. Confirma cancelamento?' },
          { user: 'Sim, surgiu imprevisto', intent: 'confirmation', confidence: 0.91 },
          { bot: 'Cancelado! Quando puder reagendar, é só avisar' }
        ]
      }
    ],
    booking_abandoned: [
      {
        messages: [
          { user: 'Quero agendar um procedimento', intent: 'booking_request', confidence: 0.89 },
          { bot: 'Ótimo! Qual procedimento te interessa?' },
          { user: 'Coloração', intent: 'service_selection', confidence: 0.85 },
          { bot: 'Nossa {service} custa R$ {price}. Que dia prefere?' },
          { user: 'Deixa eu ver minha agenda e te falo', intent: 'postpone', confidence: 0.78 }
        ]
      }
    ]
  },
  healthcare: {
    appointment_created: [
      {
        messages: [
          { user: 'Preciso agendar consulta com psicólogo', intent: 'booking_request', confidence: 0.93 },
          { bot: 'Claro! É sua primeira consulta conosco?' },
          { user: 'Sim, primeira vez', intent: 'first_time', confidence: 0.86 },
          { bot: 'Tenho disponível terça às 16h com {professional}' },
          { user: 'Pode ser!', intent: 'confirmation', confidence: 0.94 },
          { bot: 'Agendado! Consulta terça 16h. Chegue 10min antes' }
        ]
      }
    ],
    info_request_fulfilled: [
      {
        messages: [
          { user: 'Vocês atendem pelo plano de saúde?', intent: 'insurance_inquiry', confidence: 0.92 },
          { bot: 'Atendemos vários planos. Qual o seu?' },
          { user: 'Unimed', intent: 'insurance_provider', confidence: 0.88 },
          { bot: 'Sim! Atendemos Unimed. Precisa agendar?' },
          { user: 'Vou pensar, obrigado', intent: 'postpone', confidence: 0.84 }
        ]
      }
    ]
  }
};

// Função para gerar UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Função para gerar data realística nos últimos 90 dias
function generateRealisticDate(daysBack = null) {
  const now = new Date();
  const daysBackToUse = daysBack || Math.floor(Math.random() * CONFIG.DAYS_BACK);
  const date = new Date(now.getTime() - (daysBackToUse * 24 * 60 * 60 * 1000));
  
  // Ajustar para horário comercial
  const hour = CONFIG.REALISTIC_HOURS[Math.floor(Math.random() * CONFIG.REALISTIC_HOURS.length)];
  const minute = Math.floor(Math.random() * 60);
  
  date.setHours(hour, minute, 0, 0);
  return date;
}

// Função para gerar timestamp sequencial dentro de uma conversa
function generateSequentialTimestamp(baseDate, messageIndex, isFromUser) {
  const base = new Date(baseDate);
  
  // Usuário responde mais rápido (30s a 2min), bot demora mais (1min a 4min)
  const minInterval = isFromUser ? 30 : 60;
  const maxInterval = isFromUser ? 120 : 240;
  const intervalSeconds = minInterval + Math.random() * (maxInterval - minInterval);
  
  base.setTime(base.getTime() + (messageIndex * intervalSeconds * 1000));
  return base.toISOString();
}

// Carregar dados do banco
async function loadDatabaseData() {
  console.log('📊 Carregando dados existentes do banco...');

  // Carregar tenants
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, domain')
    .eq('status', 'active')
    .limit(10);
  
  TENANTS_DATA = tenants || [];
  console.log(`   ✅ ${TENANTS_DATA.length} tenants carregados`);

  // Carregar usuários
  const { data: users } = await supabase
    .from('users')
    .select('id, phone, name')
    .limit(50);
  
  USERS_DATA = users || [];
  console.log(`   ✅ ${USERS_DATA.length} usuários carregados`);

  // Carregar serviços por tenant
  for (const tenant of TENANTS_DATA) {
    const { data: services } = await supabase
      .from('services')
      .select('id, name, base_price, duration_minutes, tenant_id')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true);
    
    if (services) {
      SERVICES_DATA.push(...services.map(s => ({ ...s, tenant_name: tenant.name })));
    }
  }
  console.log(`   ✅ ${SERVICES_DATA.length} serviços carregados`);

  // Carregar profissionais por tenant
  for (const tenant of TENANTS_DATA) {
    const { data: professionals } = await supabase
      .from('professionals')
      .select('id, name, tenant_id')
      .eq('tenant_id', tenant.id);
    
    if (professionals) {
      PROFESSIONALS_DATA.push(...professionals.map(p => ({ ...p, tenant_name: tenant.name })));
    }
  }
  console.log(`   ✅ ${PROFESSIONALS_DATA.length} profissionais carregados`);
}

// Função para processar template com dados reais
function processTemplate(template, tenant, service, professional) {
  return template.messages.map(msg => {
    if (msg.bot) {
      let content = msg.bot
        .replace('{service}', service?.name || 'Serviço')
        .replace('{professional}', professional?.name || 'Profissional')
        .replace('{price}', service?.base_price || '50.00')
        .replace('{duration}', service?.duration_minutes || '60')
        .replace('{time}', Math.floor(Math.random() * 12) + 8); // 8h às 19h
      
      return { ...msg, bot: content };
    }
    return msg;
  });
}

// Função para criar agendamento real baseado na conversa
async function createRealAppointment(conversationData, tenant, service, professional, user) {
  try {
    // Gerar data futura para o agendamento (próximos 30 dias)
    const appointmentDate = new Date();
    appointmentDate.setDate(appointmentDate.getDate() + Math.floor(Math.random() * 30) + 1);
    appointmentDate.setHours(CONFIG.REALISTIC_HOURS[Math.floor(Math.random() * CONFIG.REALISTIC_HOURS.length)], 0, 0, 0);

    // Calcular end_time baseado na duração do serviço
    const endTime = new Date(appointmentDate);
    endTime.setMinutes(endTime.getMinutes() + (service.duration_minutes || 60));

    const appointmentData = {
      id: generateUUID(),
      tenant_id: tenant.id,
      user_id: user.id,
      service_id: service.id,
      professional_id: professional.id,
      start_time: appointmentDate.toISOString(),
      end_time: endTime.toISOString(),
      timezone: 'America/Sao_Paulo',
      status: 'confirmed',
      quoted_price: service.base_price,
      final_price: service.base_price,
      currency: 'BRL',
      customer_notes: `Agendamento via WhatsApp - Session: ${conversationData.sessionId.substring(0, 8)}`,
      appointment_data: {
        source: 'whatsapp_conversation',
        session_id: conversationData.sessionId,
        conversation_date: conversationData.conversationDate,
        service_price: service.base_price,
        estimated_duration: service.duration_minutes
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('appointments')
      .insert(appointmentData);

    if (error) {
      console.error(`❌ Erro ao criar agendamento:`, error.message);
      return null;
    }

    return appointmentData;
  } catch (error) {
    console.error(`❌ Erro ao criar agendamento:`, error);
    return null;
  }
}

// Função principal para gerar histórico
async function generateConversationHistory() {
  console.log('🚀 Iniciando geração de histórico avançado de conversas...\n');

  await loadDatabaseData();

  if (TENANTS_DATA.length === 0 || USERS_DATA.length === 0) {
    throw new Error('❌ Dados insuficientes no banco. Verifique se há tenants e usuários cadastrados.');
  }

  console.log(`📈 Configuração:`);
  console.log(`   • Período: ${CONFIG.DAYS_BACK} dias atrás até hoje`);
  console.log(`   • ~${CONFIG.CONVERSATIONS_PER_DAY} conversas por dia`);
  console.log(`   • Taxa de sucesso: ${CONFIG.SUCCESS_RATE * 100}%`);
  console.log(`   • Agendamentos reais: SIM\n`);

  // Limpar dados antigos
  console.log('🧹 Limpando dados antigos...');
  await supabase.from('conversation_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  let totalConversations = 0;
  let totalMessages = 0;
  let totalAppointments = 0;
  const outcomeStats = {};

  // Gerar conversas para cada dia dos últimos 90 dias
  for (let dayBack = CONFIG.DAYS_BACK; dayBack >= 0; dayBack--) {
    const conversationsToday = Math.floor(CONFIG.CONVERSATIONS_PER_DAY * (0.7 + Math.random() * 0.6)); // Variação de 70% a 130%
    
    console.log(`📅 Dia ${CONFIG.DAYS_BACK - dayBack + 1}/${CONFIG.DAYS_BACK + 1}: ${conversationsToday} conversas`);

    for (let i = 0; i < conversationsToday; i++) {
      const tenant = TENANTS_DATA[Math.floor(Math.random() * TENANTS_DATA.length)];
      const user = USERS_DATA[Math.floor(Math.random() * USERS_DATA.length)];
      
      // Buscar serviços e profissionais específicos do tenant
      const tenantServices = SERVICES_DATA.filter(s => s.tenant_id === tenant.id);
      const tenantProfessionals = PROFESSIONALS_DATA.filter(p => p.tenant_id === tenant.id);

      if (tenantServices.length === 0 || tenantProfessionals.length === 0) {
        continue; // Pular se não há dados suficientes
      }

      const service = tenantServices[Math.floor(Math.random() * tenantServices.length)];
      const professional = tenantProfessionals[Math.floor(Math.random() * tenantProfessionals.length)];

      // Determinar outcome baseado na taxa de sucesso
      let outcome;
      const domain = tenant.domain || 'beauty';
      const templates = CONVERSATION_TEMPLATES[domain] || CONVERSATION_TEMPLATES.beauty;
      
      if (Math.random() < CONFIG.SUCCESS_RATE) {
        outcome = 'appointment_created';
      } else {
        const nonSuccessOutcomes = VALID_OUTCOMES.filter(o => o !== 'appointment_created');
        outcome = nonSuccessOutcomes[Math.floor(Math.random() * nonSuccessOutcomes.length)];
      }

      // Buscar template apropriado
      const outcomeTemplates = templates[outcome] || templates.appointment_created || [];
      if (outcomeTemplates.length === 0) continue;

      const template = outcomeTemplates[Math.floor(Math.random() * outcomeTemplates.length)];
      const processedTemplate = processTemplate(template, tenant, service, professional);

      // Gerar conversa
      const sessionId = generateUUID();
      const conversationDate = generateRealisticDate(dayBack);
      const conversationMessages = [];

      for (let msgIndex = 0; msgIndex < processedTemplate.length; msgIndex++) {
        const msgTemplate = processedTemplate[msgIndex];
        const messageId = generateUUID();
        const isFromUser = !!msgTemplate.user;
        const timestamp = generateSequentialTimestamp(conversationDate, msgIndex, isFromUser);

        const conversationContext = {
          session_id: sessionId,
          duration_minutes: Math.ceil((msgIndex + 1) * 1.8)
        };

        if (msgIndex > 0 && !isFromUser) {
          // Bot respondendo ao usuário anterior
          const previousUserMessage = conversationMessages.filter(m => m.is_from_user).pop();
          if (previousUserMessage) {
            conversationContext.response_to = previousUserMessage.id;
          }
        }

        const message = {
          id: messageId,
          tenant_id: tenant.id,
          user_id: user.id,
          content: msgTemplate.user || msgTemplate.bot,
          is_from_user: isFromUser,
          message_type: 'text',
          intent_detected: msgTemplate.intent || null,
          confidence_score: msgTemplate.confidence || null,
          conversation_context: conversationContext,
          created_at: timestamp,
          tokens_used: Math.floor(Math.random() * 80) + 20,
          api_cost_usd: (Math.random() * 0.02).toFixed(4),
          model_used: 'gpt-4',
          message_source: 'whatsapp',
          processing_cost_usd: (Math.random() * 0.002).toFixed(6),
          conversation_outcome: msgIndex === processedTemplate.length - 1 ? outcome : null
        };

        conversationMessages.push(message);
      }

      // Inserir mensagens
      const { error: insertError } = await supabase
        .from('conversation_history')
        .insert(conversationMessages);

      if (insertError) {
        console.error(`❌ Erro ao inserir conversa:`, insertError.message);
        continue;
      }

      // Criar agendamento real se foi bem-sucedida
      if (outcome === 'appointment_created') {
        const appointment = await createRealAppointment(
          { sessionId, conversationDate },
          tenant,
          service,
          professional,
          user
        );
        
        if (appointment) {
          totalAppointments++;
        }
      }

      totalConversations++;
      totalMessages += conversationMessages.length;
      outcomeStats[outcome] = (outcomeStats[outcome] || 0) + 1;

      // Pequena pausa para não sobrecarregar
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  // Relatório final
  console.log('\n🎉 Geração de histórico concluída!');
  console.log(`📊 Estatísticas finais:`);
  console.log(`   • ${totalConversations} conversas geradas`);
  console.log(`   • ${totalMessages} mensagens inseridas`);
  console.log(`   • ${totalAppointments} agendamentos reais criados`);
  console.log(`   • Período: ${CONFIG.DAYS_BACK} dias de histórico`);

  console.log('\n📈 Distribuição de outcomes:');
  Object.entries(outcomeStats)
    .sort(([,a], [,b]) => b - a)
    .forEach(([outcome, count]) => {
      const percentage = ((count / totalConversations) * 100).toFixed(1);
      console.log(`   • ${outcome}: ${count} (${percentage}%)`);
    });

  return {
    totalConversations,
    totalMessages,
    totalAppointments,
    outcomeStats
  };
}

// Função para validar dados gerados
async function validateGeneratedData() {
  console.log('\n🔍 Validando dados gerados...');

  // Verificar distribuição temporal
  const { data: temporalData } = await supabase
    .from('conversation_history')
    .select('created_at')
    .order('created_at', { ascending: true });

  if (temporalData && temporalData.length > 0) {
    const oldest = new Date(temporalData[0].created_at);
    const newest = new Date(temporalData[temporalData.length - 1].created_at);
    const daysDiff = Math.ceil((newest - oldest) / (1000 * 60 * 60 * 24));
    
    console.log(`   ✅ Distribuição temporal: ${daysDiff} dias`);
    console.log(`   ✅ Período: ${oldest.toLocaleDateString('pt-BR')} a ${newest.toLocaleDateString('pt-BR')}`);
  }

  // Verificar agendamentos criados
  const { data: appointments, count: appointmentCount } = await supabase
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .not('appointment_data->session_id', 'is', null);

  console.log(`   ✅ Agendamentos criados: ${appointmentCount || 0}`);

  // Verificar integridade de sessions
  const { data: sessionStats } = await supabase
    .from('conversation_history')
    .select('conversation_context')
    .not('conversation_context->session_id', 'is', null);

  const uniqueSessions = new Set(
    sessionStats?.map(s => s.conversation_context?.session_id).filter(Boolean) || []
  );

  console.log(`   ✅ Sessões únicas: ${uniqueSessions.size}`);
  console.log('   ✅ Integridade validada com sucesso!');
}

// Executar script
async function main() {
  try {
    const stats = await generateConversationHistory();
    await validateGeneratedData();
    
    console.log('\n🚀 Script executado com sucesso!');
    console.log('🧪 Agora você pode testar:');
    console.log('   • Dashboard com dados históricos reais');
    console.log('   • APIs de conversation_history com filtros temporais'); 
    console.log('   • Sistema de agendamentos integrado');
    console.log('   • Analytics com 90 dias de dados');

  } catch (error) {
    console.error('❌ Erro durante execução:', error);
    process.exit(1);
  }
}

// Verificar se foi chamado diretamente
if (require.main === module) {
  main();
}

module.exports = {
  generateConversationHistory,
  validateGeneratedData,
  CONFIG,
  VALID_OUTCOMES
};