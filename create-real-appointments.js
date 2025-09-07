/**
 * Script simplificado para criar agendamentos reais usando a estrutura correta
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qsdfyffuonywntnlycri.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function createRealAppointments() {
  console.log('🏥 Criando agendamentos reais para teste RESCHEDULE...\n');
  
  // Usar tenant real existente que já foi identificado antes
  const tenantId = 'f1a991bf-ed03-4542-97f0-b3f50865fcff'; // Teste Demo Clinic
  
  // 1. Primeiro, vamos ver se existem services e professionals
  console.log('🔍 Buscando serviços e profissionais existentes...');
  
  const { data: services } = await supabase
    .from('services')
    .select('id, name, duration_minutes')
    .eq('tenant_id', tenantId)
    .limit(1);
    
  const { data: professionals } = await supabase
    .from('professionals')
    .select('id, full_name')
    .eq('tenant_id', tenantId)
    .limit(1);
    
  const { data: users } = await supabase
    .from('global_users')
    .select('id, name, phone')
    .eq('phone', '5511999881234')
    .limit(1);
  
  if (!services || services.length === 0) {
    console.log('❌ Nenhum serviço encontrado para o tenant');
    return;
  }
  
  if (!professionals || professionals.length === 0) {
    console.log('❌ Nenhum profissional encontrado para o tenant');
    return;
  }
  
  if (!users || users.length === 0) {
    console.log('❌ Usuário não encontrado');
    return;
  }
  
  const service = services[0];
  const professional = professionals[0];
  const user = users[0];
  
  console.log(`✅ Encontrados:`);
  console.log(`  📋 Serviço: ${service.name} (${service.duration_minutes}min)`);
  console.log(`  👨‍⚕️ Profissional: ${professional.full_name}`);
  console.log(`  👤 Usuário: ${user.name} (${user.phone})`);
  
  // 2. Criar agendamentos de teste
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0);
  
  const endTime = new Date(tomorrow);
  endTime.setMinutes(endTime.getMinutes() + (service.duration_minutes || 60));
  
  const appointments = [
    {
      id: 'aaaaaaaa-bbbb-cccc-dddd-111111111111',
      tenant_id: tenantId,
      user_id: user.id,
      service_id: service.id,
      professional_id: professional.id,
      start_time: tomorrow.toISOString(),
      end_time: endTime.toISOString(),
      status: 'confirmed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];
  
  // 3. Inserir agendamentos
  for (const appointment of appointments) {
    console.log(`\n📅 Criando agendamento para: ${new Date(appointment.start_time).toLocaleString()}`);
    
    const { data, error } = await supabase
      .from('appointments')
      .upsert(appointment)
      .select();
    
    if (error) {
      console.error('❌ Erro:', error);
    } else {
      console.log(`✅ Agendamento criado: ${appointment.id}`);
    }
  }
  
  // 4. Verificar agendamentos criados
  console.log('\n🔍 Verificando agendamentos criados:');
  const { data: checkData } = await supabase
    .from('appointments')
    .select(`
      id,
      start_time,
      end_time,
      status,
      services!inner(name),
      professionals!inner(full_name)
    `)
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .order('start_time', { ascending: true });
    
  if (checkData && checkData.length > 0) {
    console.log(`\n🎯 ${checkData.length} agendamento(s) encontrado(s):`);
    checkData.forEach((apt, index) => {
      console.log(`${index + 1}. ${apt.services.name} - ${new Date(apt.start_time).toLocaleString()}`);
      console.log(`   ID: ${apt.id}`);
      console.log(`   Profissional: ${apt.professionals.full_name}`);
      console.log(`   Status: ${apt.status}`);
    });
    
    console.log('\n🧪 AGORA VOCÊ PODE TESTAR:');
    checkData.forEach((apt, index) => {
      console.log(`${index + 1}. reagendar ${apt.id}`);
    });
  }
}

if (require.main === module) {
  createRealAppointments().catch(console.error);
}