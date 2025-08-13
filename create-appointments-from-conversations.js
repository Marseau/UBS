const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configurações
const CONFIG = {
  REALISTIC_HOURS: [8, 9, 10, 11, 14, 15, 16, 17, 18, 19],
  APPOINTMENT_SUCCESS_RATE: 0.85, // 85% das conversas com outcome 'appointment_created' viram agendamentos reais
  FUTURE_DAYS_RANGE: 30 // Agendamentos nos próximos 30 dias
};

// Cache para dados do banco
let SERVICES_DATA = [];
let PROFESSIONALS_DATA = [];
let TENANTS_DATA = [];

// Função para gerar UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Função para gerar data futura realística para o agendamento
function generateFutureAppointmentDate() {
  const now = new Date();
  const daysAhead = Math.floor(Math.random() * CONFIG.FUTURE_DAYS_RANGE) + 1; // 1 a 30 dias
  const appointmentDate = new Date(now.getTime() + (daysAhead * 24 * 60 * 60 * 1000));
  
  // Definir horário comercial
  const hour = CONFIG.REALISTIC_HOURS[Math.floor(Math.random() * CONFIG.REALISTIC_HOURS.length)];
  const minute = Math.random() < 0.5 ? 0 : 30; // Horários em ponto ou meio
  
  appointmentDate.setHours(hour, minute, 0, 0);
  return appointmentDate;
}

// Carregar dados necessários do banco
async function loadBankData() {
  console.log('📊 Carregando dados do banco para criar agendamentos...');

  // Carregar tenants
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, domain');
  
  TENANTS_DATA = tenants || [];
  console.log(`   ✅ ${TENANTS_DATA.length} tenants carregados`);

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

// Criar agendamento real baseado na conversa
async function createAppointmentFromConversation(conversation, service, professional) {
  try {
    const appointmentDate = generateFutureAppointmentDate();
    const endTime = new Date(appointmentDate);
    endTime.setMinutes(endTime.getMinutes() + (service.duration_minutes || 60));

    const appointmentData = {
      id: generateUUID(),
      tenant_id: conversation.tenant_id,
      user_id: conversation.user_id,
      service_id: service.id,
      professional_id: professional.id,
      start_time: appointmentDate.toISOString(),
      end_time: endTime.toISOString(),
      timezone: 'America/Sao_Paulo',
      status: 'confirmed',
      quoted_price: service.base_price,
      final_price: service.base_price,
      currency: 'BRL',
      customer_notes: `Agendamento criado via conversa WhatsApp`,
      appointment_data: {
        source: 'whatsapp_conversation',
        session_id: conversation.session_id,
        conversation_date: conversation.conversation_start,
        service_name: service.name,
        professional_name: professional.name,
        estimated_duration: service.duration_minutes,
        automated_creation: true
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('appointments')
      .insert(appointmentData)
      .select();

    if (error) {
      console.error(`❌ Erro ao criar agendamento:`, error.message);
      return null;
    }

    return data[0];
  } catch (error) {
    console.error(`❌ Erro ao criar agendamento:`, error);
    return null;
  }
}

// Função principal para criar agendamentos baseados nas conversas
async function createAppointmentsFromConversations() {
  console.log('🚀 Criando agendamentos reais baseados nas conversas...\n');

  await loadBankData();

  if (SERVICES_DATA.length === 0 || PROFESSIONALS_DATA.length === 0) {
    throw new Error('❌ Dados insuficientes. Verifique se há serviços e profissionais cadastrados.');
  }

  // Buscar conversas que resultaram em agendamentos
  console.log('🔍 Buscando conversas com outcome "appointment_created"...');
  
  const { data: successfulConversations, error } = await supabase
    .from('conversation_history')
    .select(`
      id,
      tenant_id,
      user_id,
      conversation_context,
      created_at,
      conversation_outcome
    `)
    .eq('conversation_outcome', 'appointment_created')
    .not('conversation_context->session_id', 'is', null);

  if (error) {
    throw new Error(`Erro ao buscar conversas: ${error.message}`);
  }

  if (!successfulConversations || successfulConversations.length === 0) {
    console.log('⚠️ Nenhuma conversa com outcome "appointment_created" encontrada.');
    return;
  }

  console.log(`✅ Encontradas ${successfulConversations.length} conversas bem-sucedidas`);

  // Agrupar por session_id para evitar agendamentos duplicados
  const conversationsBySession = new Map();
  successfulConversations.forEach(conv => {
    const sessionId = conv.conversation_context?.session_id;
    if (sessionId && !conversationsBySession.has(sessionId)) {
      conversationsBySession.set(sessionId, {
        ...conv,
        session_id: sessionId,
        conversation_start: conv.created_at
      });
    }
  });

  console.log(`📅 ${conversationsBySession.size} sessões únicas para criar agendamentos`);

  let createdAppointments = 0;
  let skippedAppointments = 0;
  const appointmentsByTenant = {};

  // Criar agendamentos para cada conversa bem-sucedida
  for (const [sessionId, conversation] of conversationsBySession) {
    // Aplicar taxa de sucesso (nem toda conversa vira agendamento real)
    if (Math.random() > CONFIG.APPOINTMENT_SUCCESS_RATE) {
      skippedAppointments++;
      continue;
    }

    // Buscar serviços e profissionais do tenant
    const tenantServices = SERVICES_DATA.filter(s => s.tenant_id === conversation.tenant_id);
    const tenantProfessionals = PROFESSIONALS_DATA.filter(p => p.tenant_id === conversation.tenant_id);

    if (tenantServices.length === 0 || tenantProfessionals.length === 0) {
      console.log(`⚠️ Tenant ${conversation.tenant_id} sem serviços/profissionais disponíveis`);
      skippedAppointments++;
      continue;
    }

    // Selecionar serviço e profissional aleatório
    const service = tenantServices[Math.floor(Math.random() * tenantServices.length)];
    const professional = tenantProfessionals[Math.floor(Math.random() * tenantProfessionals.length)];

    // Criar agendamento
    const appointment = await createAppointmentFromConversation(conversation, service, professional);

    if (appointment) {
      createdAppointments++;
      
      // Estatísticas por tenant
      const tenantName = service.tenant_name;
      appointmentsByTenant[tenantName] = (appointmentsByTenant[tenantName] || 0) + 1;

      if (createdAppointments % 10 === 0) {
        process.stdout.write('.');
      }
    } else {
      skippedAppointments++;
    }

    // Pequena pausa para não sobrecarregar
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Relatório final
  console.log('\n\n🎉 Criação de agendamentos concluída!');
  console.log(`📊 Estatísticas:`);
  console.log(`   • ${createdAppointments} agendamentos criados`);
  console.log(`   • ${skippedAppointments} conversas não convertidas`);
  console.log(`   • Taxa de conversão: ${((createdAppointments / conversationsBySession.size) * 100).toFixed(1)}%`);

  console.log('\n📈 Agendamentos por tenant:');
  Object.entries(appointmentsByTenant)
    .sort(([,a], [,b]) => b - a)
    .forEach(([tenant, count]) => {
      console.log(`   • ${tenant}: ${count} agendamentos`);
    });

  return {
    createdAppointments,
    skippedAppointments,
    totalConversations: conversationsBySession.size,
    appointmentsByTenant
  };
}

// Função para validar agendamentos criados
async function validateCreatedAppointments() {
  console.log('\n🔍 Validando agendamentos criados...');

  // Contar agendamentos criados via conversa
  const { data: appointments, count } = await supabase
    .from('appointments')
    .select('*', { count: 'exact' })
    .not('appointment_data->session_id', 'is', null);

  console.log(`   ✅ Total de agendamentos via conversa: ${count || 0}`);

  if (appointments && appointments.length > 0) {
    // Verificar distribuição temporal
    const futureAppointments = appointments.filter(apt => new Date(apt.start_time) > new Date());
    const pastAppointments = appointments.filter(apt => new Date(apt.start_time) <= new Date());

    console.log(`   ✅ Agendamentos futuros: ${futureAppointments.length}`);
    console.log(`   ✅ Agendamentos passados: ${pastAppointments.length}`);

    // Mostrar próximos agendamentos
    const nextAppointments = futureAppointments
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .slice(0, 3);

    if (nextAppointments.length > 0) {
      console.log('\n📅 Próximos agendamentos:');
      nextAppointments.forEach((apt, index) => {
        const date = new Date(apt.start_time).toLocaleString('pt-BR');
        console.log(`   ${index + 1}. ${date} - ${apt.appointment_data?.service_name || 'Serviço'}`);
      });
    }

    // Verificar integridade com conversas
    const sessionIds = [...new Set(appointments.map(apt => apt.appointment_data?.session_id).filter(Boolean))];
    console.log(`   ✅ Sessões de conversa vinculadas: ${sessionIds.length}`);
  }
}

// Executar script
async function main() {
  try {
    const stats = await createAppointmentsFromConversations();
    await validateCreatedAppointments();
    
    console.log('\n✅ Script executado com sucesso!');
    console.log('🧪 Agora você tem:');
    console.log('   • Histórico completo de conversas (90 dias)');
    console.log('   • Agendamentos reais baseados nas conversas');
    console.log('   • Integração completa conversation → appointment');
    console.log('   • Dados prontos para testar todo o sistema');

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
  createAppointmentsFromConversations,
  validateCreatedAppointments
};