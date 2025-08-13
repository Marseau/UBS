const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Dados reais do banco
const TENANTS = [
  { id: '33b8c488-5aa9-4891-b335-701d10296681', name: 'Bella Vista Spa', domain: 'beauty' },
  { id: 'fe1fbd26-16cf-4106-9be0-390bf8345304', name: 'Studio Glamour', domain: 'beauty' },
  { id: '5bd592ee-8247-4a62-862e-7491fa499103', name: 'Charme Total', domain: 'beauty' },
  { id: 'fe2fa876-05da-49b5-b266-8141bcd090fa', name: 'Clínica Mente Sã', domain: 'healthcare' },
  { id: 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8', name: 'Centro Terapêutico', domain: 'healthcare' }
];

const USERS = [
  { id: 'e905aacb-ffce-432d-b4e5-343aaee52de8', phone: '+551190000000', name: 'João Silva' },
  { id: '6b40d22a-cb85-44c0-b26f-0d35efd4621e', phone: '+551190000001', name: 'Maria Santos' },
  { id: '0db7d8f2-2b18-484b-8be2-36da3f5f423e', phone: '+551190000002', name: 'Pedro Oliveira' },
  { id: 'b44f42fc-8bc4-4cac-8c64-f552423ea290', phone: '+551190000003', name: 'Ana Souza' },
  { id: 'a0a13c45-7790-42f3-a6d2-ad7503f25cfe', phone: '+551190000004', name: 'Carlos Rodrigues' }
];

// Templates de conversas por domínio
const CONVERSATION_TEMPLATES = {
  beauty: [
    {
      type: 'booking_request',
      outcome: 'appointment_created',
      messages: [
        { user: 'Oi! Gostaria de agendar uma limpeza de pele', intent: 'booking_request', confidence: 0.95 },
        { bot: 'Olá! Claro, temos horários disponíveis. Que dia seria melhor para você?' },
        { user: 'Sexta-feira de manhã pode ser?', intent: 'date_preference', confidence: 0.88 },
        { bot: 'Perfeito! Tenho disponível sexta às 9h ou 10h30. Qual prefere?' },
        { user: 'Às 9h está ótimo!', intent: 'confirmation', confidence: 0.92 },
        { bot: 'Agendado! Limpeza de pele na sexta às 9h. Confirmo por WhatsApp na véspera!' }
      ]
    },
    {
      type: 'service_inquiry',
      outcome: 'info_request_fulfilled',
      messages: [
        { user: 'Vocês fazem extensão de cílios?', intent: 'info_request', confidence: 0.91 },
        { bot: 'Sim! Temos extensão fio a fio e volume russo. Quer saber mais?' },
        { user: 'Qual a diferença entre elas?', intent: 'service_details', confidence: 0.87 },
        { bot: 'Fio a fio: mais natural, 1 fio por cílio. Volume russo: mais dramático, múltiplos fios' },
        { user: 'Quanto custa cada uma?', intent: 'price_inquiry', confidence: 0.94 },
        { bot: 'Fio a fio R$ 80, Volume russo R$ 120. Duração: 3-4 semanas. Quer agendar?' }
      ]
    },
    {
      type: 'cancellation',
      outcome: 'appointment_cancelled',
      messages: [
        { user: 'Preciso cancelar meu agendamento de amanhã', intent: 'cancellation_request', confidence: 0.96 },
        { bot: 'Claro! Localizei seu agendamento: Corte de cabelo às 14h. Confirma o cancelamento?' },
        { user: 'Sim, confirmo. Surgiu um imprevisto', intent: 'confirmation', confidence: 0.89 },
        { bot: 'Cancelado com sucesso! Quando puder reagendar, é só me avisar.' }
      ]
    }
  ],
  healthcare: [
    {
      type: 'therapy_booking',
      outcome: 'appointment_created',
      messages: [
        { user: 'Gostaria de agendar uma consulta com psicólogo', intent: 'booking_request', confidence: 0.93 },
        { bot: 'Olá! Será sua primeira consulta conosco?' },
        { user: 'Sim, primeira vez. Estou passando por um momento difícil', intent: 'first_time', confidence: 0.85 },
        { bot: 'Entendo. Vamos te ajudar. Prefere presencial ou online?' },
        { user: 'Presencial, por favor', intent: 'modality_preference', confidence: 0.91 },
        { bot: 'Perfeito! Tenho vaga na terça às 16h com Dr. Silva. Confirma?' },
        { user: 'Confirmo, obrigado', intent: 'confirmation', confidence: 0.94 },
        { bot: 'Agendado! Terça às 16h. Chegue 10min antes. Qualquer dúvida, me chame!' }
      ]
    },
    {
      type: 'emergency_inquiry',
      outcome: 'appointment_created',
      messages: [
        { user: 'Estou tendo uma crise de ansiedade, vocês atendem urgência?', intent: 'emergency_request', confidence: 0.97 },
        { bot: '⚠️ Situação identificada como urgente. Vou te conectar com nosso plantão.' },
        { user: 'Por favor, preciso de ajuda', intent: 'help_request', confidence: 0.88 },
        { bot: 'Dr. Costa está disponível agora. Pode atender em 15min? Endereço: Rua X, 123' },
        { user: 'Sim, já estou indo', intent: 'confirmation', confidence: 0.92 },
        { bot: 'Chegando, toque o interfone. Plantão 24h. Você não está sozinho(a)!' }
      ]
    }
  ]
};

// Função para gerar UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Função para gerar timestamp realístico
function generateRealisticTimestamp(baseDate, messageIndex) {
  const base = new Date(baseDate);
  // Cada mensagem com intervalo de 30s a 3min
  const intervalMs = (30 + Math.random() * 150) * 1000; // 30s a 3min
  base.setTime(base.getTime() + (messageIndex * intervalMs));
  return base.toISOString();
}

// Função para popular conversas
async function populateConversationHistory() {
  console.log('🚀 Iniciando população da tabela conversation_history...\n');

  try {
    // Limpar dados existentes (opcional)
    console.log('🧹 Limpando dados antigos...');
    const { error: deleteError } = await supabase
      .from('conversation_history')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.log('⚠️ Aviso ao limpar dados:', deleteError.message);
    }

    let totalMessages = 0;
    let totalConversations = 0;

    // Gerar conversas para cada tenant
    for (const tenant of TENANTS) {
      console.log(`\n📱 Gerando conversas para: ${tenant.name} (${tenant.domain})`);
      
      const templates = CONVERSATION_TEMPLATES[tenant.domain] || CONVERSATION_TEMPLATES.beauty;
      const conversationsPerTenant = 8; // 8 conversas por tenant

      for (let i = 0; i < conversationsPerTenant; i++) {
        const template = templates[Math.floor(Math.random() * templates.length)];
        const user = USERS[Math.floor(Math.random() * USERS.length)];
        const sessionId = generateUUID();
        
        // Data base da conversa (últimos 30 dias)
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() - Math.floor(Math.random() * 30));
        baseDate.setHours(8 + Math.floor(Math.random() * 12)); // 8h às 20h
        baseDate.setMinutes(Math.floor(Math.random() * 60));

        console.log(`  💬 Conversa ${i + 1}: ${template.type} - ${user.name}`);

        const conversationMessages = [];
        let previousMessageId = null;

        // Gerar mensagens da conversa
        for (let msgIndex = 0; msgIndex < template.messages.length; msgIndex++) {
          const msgTemplate = template.messages[msgIndex];
          const messageId = generateUUID();
          const timestamp = generateRealisticTimestamp(baseDate, msgIndex);

          const conversationContext = {
            session_id: sessionId,
            duration_minutes: Math.ceil((msgIndex + 1) * 1.5) // Duração crescente
          };

          if (previousMessageId && !msgTemplate.user) {
            conversationContext.response_to = previousMessageId;
          }

          const message = {
            id: messageId,
            tenant_id: tenant.id,
            user_id: user.id,
            content: msgTemplate.user || msgTemplate.bot,
            is_from_user: !!msgTemplate.user,
            message_type: 'text',
            intent_detected: msgTemplate.intent || null,
            confidence_score: msgTemplate.confidence || null,
            conversation_context: conversationContext,
            created_at: timestamp,
            tokens_used: Math.floor(Math.random() * 50) + 10,
            api_cost_usd: (Math.random() * 0.01).toFixed(4),
            model_used: 'gpt-4',
            message_source: 'whatsapp',
            processing_cost_usd: (Math.random() * 0.001).toFixed(6),
            conversation_outcome: msgIndex === template.messages.length - 1 ? template.outcome : null
          };

          conversationMessages.push(message);
          previousMessageId = messageId;
        }

        // Inserir mensagens da conversa
        const { error: insertError } = await supabase
          .from('conversation_history')
          .insert(conversationMessages);

        if (insertError) {
          console.error(`❌ Erro ao inserir conversa ${i + 1}:`, insertError);
          continue;
        }

        totalMessages += conversationMessages.length;
        totalConversations++;

        // Pequena pausa para não sobrecarregar
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('\n🎉 População concluída com sucesso!');
    console.log(`📊 Estatísticas:`);
    console.log(`   • ${totalConversations} conversas criadas`);
    console.log(`   • ${totalMessages} mensagens inseridas`);
    console.log(`   • ${TENANTS.length} tenants populados`);
    console.log(`   • ${USERS.length} usuários utilizados`);

    // Verificar dados inseridos
    console.log('\n🔍 Verificando dados inseridos...');
    const { data: stats, error: statsError } = await supabase
      .rpc('get_conversation_stats_by_tenant');

    if (!statsError && stats) {
      stats.forEach(stat => {
        const tenant = TENANTS.find(t => t.id === stat.tenant_id);
        console.log(`   • ${tenant?.name || 'Desconhecido'}: ${stat.count} mensagens`);
      });
    } else {
      // Fallback: contar manualmente
      for (const tenant of TENANTS) {
        const { data: count } = await supabase
          .from('conversation_history')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id);
        
        console.log(`   • ${tenant.name}: ${count || 0} mensagens`);
      }
    }

    // Mostrar exemplo de sessão
    console.log('\n💡 Exemplo de conversa criada:');
    const { data: sampleConversation } = await supabase
      .from('conversation_history')
      .select('*')
      .limit(1);

    if (sampleConversation && sampleConversation.length > 0) {
      const sample = sampleConversation[0];
      const sessionId = sample.conversation_context?.session_id;
      
      if (sessionId) {
        const { data: fullConversation } = await supabase
          .from('conversation_history')
          .select('content, is_from_user, intent_detected, created_at')
          .eq('conversation_context->session_id', sessionId)
          .order('created_at', { ascending: true });

        if (fullConversation) {
          fullConversation.forEach((msg, index) => {
            const role = msg.is_from_user ? '👤 Usuário' : '🤖 Bot';
            const intent = msg.intent_detected ? ` [${msg.intent_detected}]` : '';
            console.log(`   ${index + 1}. ${role}${intent}: ${msg.content}`);
          });
        }
      }
    }

    console.log('\n✅ Script executado com sucesso!');
    console.log('🧪 Agora você pode testar as APIs de conversation_history');

  } catch (error) {
    console.error('❌ Erro durante a população:', error);
    throw error;
  }
}

// Função para testar APIs após população
async function testConversationAPIs() {
  console.log('\n🧪 Testando APIs de conversation_history...\n');

  try {
    // Teste 1: Buscar conversas por tenant
    console.log('1️⃣ Teste: Buscar conversas por tenant');
    const testTenant = TENANTS[0];
    const { data: tenantMessages, error: tenantError } = await supabase
      .from('conversation_history')
      .select('*')
      .eq('tenant_id', testTenant.id)
      .limit(5);

    if (tenantError) {
      console.error('❌ Erro:', tenantError);
    } else {
      console.log(`✅ Encontradas ${tenantMessages.length} mensagens para ${testTenant.name}`);
    }

    // Teste 2: Buscar por session_id
    if (tenantMessages && tenantMessages.length > 0) {
      const sessionId = tenantMessages[0].conversation_context?.session_id;
      if (sessionId) {
        console.log('\n2️⃣ Teste: Buscar conversa completa por session_id');
        const { data: sessionMessages, error: sessionError } = await supabase
          .from('conversation_history')
          .select('*')
          .eq('conversation_context->session_id', sessionId)
          .order('created_at', { ascending: true });

        if (sessionError) {
          console.error('❌ Erro:', sessionError);
        } else {
          console.log(`✅ Conversa completa com ${sessionMessages.length} mensagens`);
          sessionMessages.forEach((msg, i) => {
            const role = msg.is_from_user ? '👤' : '🤖';
            console.log(`   ${i + 1}. ${role} ${msg.content.substring(0, 50)}...`);
          });
        }
      }
    }

    // Teste 3: Estatísticas gerais
    console.log('\n3️⃣ Teste: Estatísticas gerais');
    const { data: totalStats, error: totalError } = await supabase
      .from('conversation_history')
      .select('id')
      .limit(1000);

    if (totalError) {
      console.error('❌ Erro:', totalError);
    } else {
      console.log(`✅ Total de mensagens na base: ${totalStats.length}`);
    }

    // Teste 4: Buscar por intent
    console.log('\n4️⃣ Teste: Buscar por intent');
    const { data: bookingMessages, error: bookingError } = await supabase
      .from('conversation_history')
      .select('*')
      .eq('intent_detected', 'booking_request')
      .limit(3);

    if (bookingError) {
      console.error('❌ Erro:', bookingError);
    } else {
      console.log(`✅ Encontradas ${bookingMessages.length} mensagens com intent 'booking_request'`);
    }

    console.log('\n🎉 Testes das APIs concluídos!');

  } catch (error) {
    console.error('❌ Erro durante os testes:', error);
  }
}

// Executar script
async function main() {
  try {
    await populateConversationHistory();
    await testConversationAPIs();
  } catch (error) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  }
}

// Verificar se foi chamado diretamente
if (require.main === module) {
  main();
}

module.exports = {
  populateConversationHistory,
  testConversationAPIs,
  TENANTS,
  USERS,
  CONVERSATION_TEMPLATES
};