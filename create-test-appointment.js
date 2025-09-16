#!/usr/bin/env node

/**
 * Script simples para criar um agendamento de teste para amanhã às 10h
 * Para validar integração Google Calendar
 */

const { supabaseAdmin } = require('./src/config/database');

async function createTestAppointment() {
  console.log('🧪 Criando agendamento de teste para amanhã às 10h...');

  try {
    // 1. Buscar tenant de teste
    const tenantId = '7e2ad055-c4e5-4f55-b597-5cc6bba60b55';

    // 2. Buscar um serviço ativo
    const { data: services, error: serviceError } = await supabaseAdmin
      .from('services')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .limit(1);

    if (serviceError || !services || services.length === 0) {
      console.error('❌ Nenhum serviço encontrado:', serviceError);
      return;
    }

    const service = services[0];
    console.log(`✅ Serviço encontrado: ${service.name} (${service.id})`);

    // 3. Buscar um profissional com Google Calendar
    const { data: professionals, error: profError } = await supabaseAdmin
      .from('professionals')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .not('google_calendar_credentials', 'is', null)
      .limit(1);

    if (profError || !professionals || professionals.length === 0) {
      console.error('❌ Nenhum profissional com Google Calendar encontrado:', profError);
      return;
    }

    const professional = professionals[0];
    console.log(`✅ Profissional encontrado: ${professional.name} (${professional.id})`);

    // 4. Buscar um usuário de teste (sem tenant_id - tabela users é global)
    const { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, name')
      .limit(1);

    if (userError || !users || users.length === 0) {
      console.error('❌ Nenhum usuário encontrado:', userError);
      return;
    }

    const user = users[0];
    console.log(`✅ Usuário encontrado: ${user.name} (${user.id})`);

    // 5. Calcular data/hora para amanhã às 10h
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const endTime = new Date(tomorrow.getTime() + 60 * 60 * 1000); // +1 hora

    console.log(`📅 Agendamento para: ${tomorrow.toLocaleDateString('pt-BR')} às ${tomorrow.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`);

    // 6. Criar agendamento
    const appointmentData = {
      tenant_id: tenantId,
      user_id: user.id,
      professional_id: professional.id,
      service_id: service.id,
      start_time: tomorrow.toISOString(),
      end_time: endTime.toISOString(),
      status: 'confirmed',
      appointment_data: {
        service_name: service.name,
        professional_name: professional.name,
        user_name: user.name,
        test_appointment: true
      }
    };

    const { data: appointment, error: createError } = await supabaseAdmin
      .from('appointments')
      .insert(appointmentData)
      .select()
      .single();

    if (createError) {
      console.error('❌ Erro ao criar agendamento:', createError);
      return;
    }

    console.log('✅ Agendamento criado com sucesso!');
    console.log(`📋 ID: ${appointment.id}`);
    console.log(`👤 Cliente: ${user.name}`);
    console.log(`💼 Profissional: ${professional.name}`);
    console.log(`🎯 Serviço: ${service.name}`);
    console.log(`⏰ Data/Hora: ${tomorrow.toLocaleDateString('pt-BR')} às ${tomorrow.toLocaleTimeString('pt-BR')}`);

    console.log('\n🔄 Agora teste criar outro agendamento no mesmo horário para validar conflito Google Calendar');

  } catch (error) {
    console.error('💥 Erro inesperado:', error);
  }
}

// Executar
if (require.main === module) {
  createTestAppointment()
    .then(() => {
      console.log('\n🎉 Script concluído!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Script falhou:', error);
      process.exit(1);
    });
}

module.exports = { createTestAppointment };