/**
 * Script direto para criar agendamento de teste no tenant que sabemos que existe
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qsdfyffuonywntnlycri.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function createDirectTestAppointment() {
  console.log('📅 Criando agendamento de teste diretamente...\n');
  
  // Usar tenant que apareceu nos logs do servidor
  const TENANT_ID = '9a349440-1409-4d65-b707-a6e5aa00c581';
  const USER_ID = '365fe811-686f-4d9f-ad53-c5d434178c1a'; // Usuario que apareceu nos logs
  
  console.log(`🎯 Usando tenant: ${TENANT_ID}`);
  console.log(`👤 Usando user: ${USER_ID}`);
  
  // Criar agendamento futuro
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(15, 30, 0, 0); // 15:30
  
  const endTime = new Date(tomorrow);
  endTime.setHours(16, 30, 0, 0); // 16:30 (1 hora depois)
  
  const appointmentId = 'test-reschedule-appointment-12345678-abcd-ef01-2345-678901234567';
  
  const appointment = {
    id: appointmentId,
    tenant_id: TENANT_ID,
    user_id: USER_ID,
    start_time: tomorrow.toISOString(),
    end_time: endTime.toISOString(),
    status: 'confirmed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  console.log(`📝 Criando agendamento:`);
  console.log(`   Data/Hora: ${new Date(appointment.start_time).toLocaleString()}`);
  console.log(`   ID: ${appointmentId}`);
  
  try {
    // 1. Tentar inserir o agendamento (apenas campos obrigatórios)
    const { data, error } = await supabase
      .from('appointments')
      .upsert(appointment)
      .select();
      
    if (error) {
      console.log('❌ Erro detalhado:', error);
      console.log('🔧 Vou tentar uma versão mais simples...');
      
      // Tentar com menos campos
      const simpleAppointment = {
        id: appointmentId,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        start_time: tomorrow.toISOString(),
        end_time: endTime.toISOString(),
        status: 'confirmed'
      };
      
      const { data: data2, error: error2 } = await supabase
        .from('appointments')
        .upsert(simpleAppointment)
        .select();
        
      if (error2) {
        console.log('❌ Ainda com erro:', error2);
      } else {
        console.log('✅ Agendamento simples criado com sucesso!');
      }
    } else {
      console.log('✅ Agendamento criado com sucesso!');
    }
    
    // 2. Verificar se foi criado
    console.log('\n🔍 Verificando agendamento criado:');
    const { data: checkData, error: checkError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId);
      
    if (checkError) {
      console.log('❌ Erro ao verificar:', checkError);
    } else if (checkData && checkData.length > 0) {
      const apt = checkData[0];
      console.log('✅ Agendamento encontrado!');
      console.log(`   ID: ${apt.id}`);
      console.log(`   Início: ${new Date(apt.start_time).toLocaleString()}`);
      console.log(`   Fim: ${new Date(apt.end_time).toLocaleString()}`);
      console.log(`   Status: ${apt.status}`);
      
      console.log('\n🧪 AGORA VOCÊ PODE TESTAR O RESCHEDULE:');
      console.log(`   Teste: "reagendar ${appointmentId}"`);
    } else {
      console.log('❌ Agendamento não encontrado após criação');
    }
    
  } catch (err) {
    console.log('❌ Erro geral:', err);
  }
}

if (require.main === module) {
  createDirectTestAppointment().catch(console.error);
}