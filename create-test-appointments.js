/**
 * Script para criar agendamentos de teste para validar o sistema RESCHEDULE
 */

const { createClient } = require('@supabase/supabase-js');

// Usar as mesmas credenciais do app
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qsdfyffuonywntnlycri.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function createTestAppointments() {
  console.log('🏥 Criando agendamentos de teste...\n');
  
  // Tenant ID do teste (Bella Vista)
  const tenantId = '33b8c488-5aa9-4891-b335-701d10296681';
  const testUserId = 'f1234567-1234-1234-1234-123456789abc'; // User fictício
  
  // Data futura para os agendamentos
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0); // 14:00
  
  const dayAfter = new Date();
  dayAfter.setDate(dayAfter.getDate() + 2);
  dayAfter.setHours(10, 30, 0, 0); // 10:30
  
  // Agendamentos para criar
  const appointments = [
    {
      id: '11111111-2222-3333-4444-555555555555',
      tenant_id: tenantId,
      user_id: testUserId,
      service_name: 'Consulta Médica',
      professional_name: 'Dr. João Silva',
      start_time: tomorrow.toISOString(),
      end_time: new Date(tomorrow.getTime() + 60*60*1000).toISOString(), // +1 hora
      status: 'confirmed',
      booking_type: 'whatsapp',
      customer_name: 'Cliente Teste',
      customer_phone: '5511999881234',
      customer_email: 'teste@cliente.com',
      created_at: new Date().toISOString()
    },
    {
      id: '22222222-3333-4444-5555-666666666666',
      tenant_id: tenantId,
      user_id: testUserId,
      service_name: 'Exame de Rotina',
      professional_name: 'Dra. Maria Santos',
      start_time: dayAfter.toISOString(),
      end_time: new Date(dayAfter.getTime() + 30*60*1000).toISOString(), // +30 min
      status: 'confirmed',
      booking_type: 'whatsapp',
      customer_name: 'Cliente Teste',
      customer_phone: '5511999881234',
      customer_email: 'teste@cliente.com',
      created_at: new Date().toISOString()
    }
  ];
  
  // Criar user se não existir
  console.log('👤 Criando/verificando usuário de teste...');
  const { data: userData, error: userError } = await supabase
    .from('global_users')
    .upsert({
      id: testUserId,
      name: 'Cliente Teste Reschedule',
      phone: '5511999881234',
      email: 'teste@cliente.com',
      created_at: new Date().toISOString()
    })
    .select();
    
  if (userError) {
    console.error('❌ Erro ao criar usuário:', userError);
  } else {
    console.log('✅ Usuário criado/atualizado');
  }
  
  // Criar user_tenants relation se não existir
  console.log('🔗 Criando relação user-tenant...');
  const { data: relationData, error: relationError } = await supabase
    .from('user_tenants')
    .upsert({
      user_id: testUserId,
      tenant_id: tenantId,
      created_at: new Date().toISOString()
    })
    .select();
    
  if (relationError) {
    console.error('❌ Erro ao criar relação user-tenant:', relationError);
  } else {
    console.log('✅ Relação user-tenant criada/atualizada');
  }
  
  // Inserir agendamentos
  for (const appointment of appointments) {
    console.log(`\n📅 Criando agendamento: ${appointment.service_name} - ${new Date(appointment.start_time).toLocaleString()}`);
    
    const { data, error } = await supabase
      .from('appointments')
      .upsert(appointment)
      .select();
    
    if (error) {
      console.error('❌ Erro ao criar agendamento:', error);
    } else {
      console.log(`✅ Agendamento criado: ID ${appointment.id}`);
    }
  }
  
  // Verificar agendamentos criados
  console.log('\n📋 Verificando agendamentos criados:');
  const { data: checkData, error: checkError } = await supabase
    .from('appointments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', '5511999881234')
    .order('start_time', { ascending: true });
    
  if (checkError) {
    console.error('❌ Erro ao verificar agendamentos:', checkError);
  } else {
    console.log(`\n🎯 Total de agendamentos encontrados: ${checkData.length}`);
    checkData.forEach((apt, index) => {
      console.log(`${index + 1}. ${apt.service_name} - ${new Date(apt.start_time).toLocaleString()} (ID: ${apt.id})`);
    });
  }
  
  console.log('\n🎉 Agendamentos de teste criados com sucesso!');
  console.log('🔧 Agora você pode testar o sistema RESCHEDULE com IDs reais:');
  console.log('   - 11111111-2222-3333-4444-555555555555');
  console.log('   - 22222222-3333-4444-5555-666666666666');
}

// Executar se chamado diretamente
if (require.main === module) {
  createTestAppointments().catch(console.error);
}

module.exports = { createTestAppointments };