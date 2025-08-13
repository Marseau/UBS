const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configuração rápida (somente conversas)
const CONFIG = {
  DAYS_BACK: 90,
  CONVERSATIONS_PER_DAY: 12,
  REALISTIC_HOURS: [8, 9, 10, 11, 14, 15, 16, 17, 18, 19]
};

const VALID_OUTCOMES = [
  'appointment_created',
  'info_request_fulfilled', 
  'business_hours_inquiry',
  'price_inquiry',
  'location_inquiry',
  'booking_abandoned',
  'appointment_cancelled'
];

// Dados pré-carregados do banco
const TENANTS_DATA = [
  { id: '33b8c488-5aa9-4891-b335-701d10296681', name: 'Bella Vista Spa', domain: 'beauty' },
  { id: 'fe1fbd26-16cf-4106-9be0-390bf8345304', name: 'Studio Glamour', domain: 'beauty' },
  { id: '5bd592ee-8247-4a62-862e-7491fa499103', name: 'Charme Total', domain: 'beauty' },
  { id: 'fe2fa876-05da-49b5-b266-8141bcd090fa', name: 'Clínica Mente Sã', domain: 'healthcare' },
  { id: 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8', name: 'Centro Terapêutico', domain: 'healthcare' }
];

const USERS_DATA = [
  { id: 'e905aacb-ffce-432d-b4e5-343aaee52de8', phone: '+551190000000', name: 'João Silva' },
  { id: '6b40d22a-cb85-44c0-b26f-0d35efd4621e', phone: '+551190000001', name: 'Maria Santos' },
  { id: '0db7d8f2-2b18-484b-8be2-36da3f5f423e', phone: '+551190000002', name: 'Pedro Oliveira' },
  { id: 'b44f42fc-8bc4-4cac-8c64-f552423ea290', phone: '+551190000003', name: 'Ana Souza' },
  { id: 'a0a13c45-7790-42f3-a6d2-ad7503f25cfe', phone: '+551190000004', name: 'Carlos Rodrigues' }
];

// Templates simplificados
const TEMPLATES = {
  beauty: [
    {
      outcome: 'appointment_created',
      messages: [
        { user: 'Oi! Quero agendar corte de cabelo', intent: 'booking_request', confidence: 0.94 },
        { bot: 'Olá! Que dia seria ideal para você?' },
        { user: 'Quinta à tarde', intent: 'date_preference', confidence: 0.87 },
        { bot: 'Perfeito! Quinta às 15h. Confirma?' },
        { user: 'Confirmo!', intent: 'confirmation', confidence: 0.95 },
        { bot: 'Agendado com sucesso!' }
      ]
    },
    {
      outcome: 'price_inquiry',
      messages: [
        { user: 'Quanto custa limpeza de pele?', intent: 'price_inquiry', confidence: 0.96 },
        { bot: 'Nossa limpeza custa R$ 80 e demora 90 minutos' },
        { user: 'Obrigada pela informação', intent: 'gratitude', confidence: 0.89 }
      ]
    },
    {
      outcome: 'appointment_cancelled',
      messages: [
        { user: 'Preciso cancelar meu agendamento', intent: 'cancellation_request', confidence: 0.97 },
        { bot: 'Claro! Confirma o cancelamento?' },
        { user: 'Sim, confirmo', intent: 'confirmation', confidence: 0.91 },
        { bot: 'Cancelado com sucesso!' }
      ]
    }
  ],
  healthcare: [
    {
      outcome: 'appointment_created',
      messages: [
        { user: 'Preciso agendar consulta', intent: 'booking_request', confidence: 0.93 },
        { bot: 'Claro! Que dia prefere?' },
        { user: 'Terça de manhã', intent: 'date_preference', confidence: 0.88 },
        { bot: 'Terça às 10h está disponível' },
        { user: 'Perfeito!', intent: 'confirmation', confidence: 0.94 },
        { bot: 'Agendado! Terça às 10h' }
      ]
    },
    {
      outcome: 'info_request_fulfilled',
      messages: [
        { user: 'Vocês atendem convênio?', intent: 'insurance_inquiry', confidence: 0.92 },
        { bot: 'Sim, atendemos vários planos' },
        { user: 'Obrigado', intent: 'gratitude', confidence: 0.84 }
      ]
    }
  ]
};

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateRealisticDate(daysBack) {
  const now = new Date();
  const date = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
  const hour = CONFIG.REALISTIC_HOURS[Math.floor(Math.random() * CONFIG.REALISTIC_HOURS.length)];
  const minute = Math.floor(Math.random() * 60);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function generateSequentialTimestamp(baseDate, messageIndex) {
  const base = new Date(baseDate);
  const intervalSeconds = 60 + Math.random() * 120; // 1-3 minutos
  base.setTime(base.getTime() + (messageIndex * intervalSeconds * 1000));
  return base.toISOString();
}

async function generateConversationHistory() {
  console.log('🚀 Iniciando geração rápida de histórico de conversas (90 dias)...\n');

  console.log('🧹 Limpando dados antigos...');
  await supabase.from('conversation_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  let totalConversations = 0;
  let totalMessages = 0;
  const outcomeStats = {};

  console.log('📅 Gerando conversas distribuídas ao longo de 90 dias...');

  // Gerar em lotes para otimizar
  const conversationBatch = [];

  for (let dayBack = CONFIG.DAYS_BACK; dayBack >= 0; dayBack--) {
    const conversationsToday = Math.floor(CONFIG.CONVERSATIONS_PER_DAY * (0.8 + Math.random() * 0.4));
    
    for (let i = 0; i < conversationsToday; i++) {
      const tenant = TENANTS_DATA[Math.floor(Math.random() * TENANTS_DATA.length)];
      const user = USERS_DATA[Math.floor(Math.random() * USERS_DATA.length)];
      const domain = tenant.domain || 'beauty';
      const templates = TEMPLATES[domain];
      const template = templates[Math.floor(Math.random() * templates.length)];
      
      const sessionId = generateUUID();
      const conversationDate = generateRealisticDate(dayBack);
      
      for (let msgIndex = 0; msgIndex < template.messages.length; msgIndex++) {
        const msgTemplate = template.messages[msgIndex];
        const messageId = generateUUID();
        const timestamp = generateSequentialTimestamp(conversationDate, msgIndex);

        const message = {
          id: messageId,
          tenant_id: tenant.id,
          user_id: user.id,
          content: msgTemplate.user || msgTemplate.bot,
          is_from_user: !!msgTemplate.user,
          message_type: 'text',
          intent_detected: msgTemplate.intent || null,
          confidence_score: msgTemplate.confidence || null,
          conversation_context: {
            session_id: sessionId,
            duration_minutes: Math.ceil((msgIndex + 1) * 1.5)
          },
          created_at: timestamp,
          tokens_used: Math.floor(Math.random() * 50) + 15,
          api_cost_usd: (Math.random() * 0.01).toFixed(4),
          model_used: 'gpt-4',
          message_source: 'whatsapp',
          processing_cost_usd: (Math.random() * 0.001).toFixed(6),
          conversation_outcome: msgIndex === template.messages.length - 1 ? template.outcome : null
        };

        conversationBatch.push(message);
        totalMessages++;
      }

      totalConversations++;
      outcomeStats[template.outcome] = (outcomeStats[template.outcome] || 0) + 1;

      // Inserir em lotes de 100 mensagens
      if (conversationBatch.length >= 100) {
        const { error } = await supabase
          .from('conversation_history')
          .insert(conversationBatch);

        if (error) {
          console.error('❌ Erro ao inserir lote:', error.message);
        }

        conversationBatch.length = 0; // Limpar array
        process.stdout.write('.');
      }
    }
  }

  // Inserir último lote
  if (conversationBatch.length > 0) {
    const { error } = await supabase
      .from('conversation_history')
      .insert(conversationBatch);

    if (error) {
      console.error('❌ Erro ao inserir último lote:', error.message);
    }
  }

  console.log('\n\n🎉 Geração concluída!');
  console.log(`📊 Estatísticas:`);
  console.log(`   • ${totalConversations} conversas geradas`);
  console.log(`   • ${totalMessages} mensagens inseridas`);
  console.log(`   • ${CONFIG.DAYS_BACK} dias de histórico`);

  console.log('\n📈 Distribuição de outcomes:');
  Object.entries(outcomeStats)
    .sort(([,a], [,b]) => b - a)
    .forEach(([outcome, count]) => {
      const percentage = ((count / totalConversations) * 100).toFixed(1);
      console.log(`   • ${outcome}: ${count} (${percentage}%)`);
    });

  return { totalConversations, totalMessages, outcomeStats };
}

async function validateData() {
  console.log('\n🔍 Validando dados gerados...');

  const { data: temporalData } = await supabase
    .from('conversation_history')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1000);

  if (temporalData && temporalData.length > 0) {
    const oldest = new Date(temporalData[0].created_at);
    const newest = new Date(temporalData[temporalData.length - 1].created_at);
    const daysDiff = Math.ceil((newest - oldest) / (1000 * 60 * 60 * 24));
    
    console.log(`   ✅ Período: ${oldest.toLocaleDateString('pt-BR')} a ${newest.toLocaleDateString('pt-BR')}`);
    console.log(`   ✅ Distribuição: ${daysDiff} dias`);
  }

  // Exemplo de conversa
  const { data: sampleConversation } = await supabase
    .from('conversation_history')
    .select('content, is_from_user, intent_detected, created_at')
    .limit(1);

  if (sampleConversation && sampleConversation.length > 0) {
    const sessionId = sampleConversation[0].conversation_context?.session_id;
    
    if (sessionId) {
      const { data: fullConversation } = await supabase
        .from('conversation_history')
        .select('content, is_from_user, intent_detected')
        .eq('conversation_context->session_id', sessionId)
        .order('created_at', { ascending: true });

      if (fullConversation) {
        console.log('\n💡 Exemplo de conversa:');
        fullConversation.forEach((msg, index) => {
          const role = msg.is_from_user ? '👤' : '🤖';
          const intent = msg.intent_detected ? ` [${msg.intent_detected}]` : '';
          console.log(`   ${index + 1}. ${role}${intent}: ${msg.content}`);
        });
      }
    }
  }
}

async function main() {
  try {
    await generateConversationHistory();
    await validateData();
    
    console.log('\n✅ Script concluído com sucesso!');
    console.log('🧪 Dados prontos para testar o sistema completo');
    
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateConversationHistory, validateData };