const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findTenantWithData() {
  console.log('🔍 Procurando tenant com dados...\n');
  
  try {
    // Get all tenants
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, business_name, domain')
      .order('created_at', { ascending: false });
    
    console.log(`📊 Verificando ${tenants.length} tenants...\n`);
    
    for (let i = 0; i < tenants.length; i++) {
      const tenant = tenants[i];
      console.log(`${i + 1}. Verificando: ${tenant.business_name}`);
      
      // Check appointments for this tenant
      const { data: appointments, count: appointmentCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant.id);
      
      // Check users for this tenant
      const { data: userTenants, count: userCount } = await supabase
        .from('user_tenants')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant.id);
      
      // Check services for this tenant
      const { data: services, count: serviceCount } = await supabase
        .from('services')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant.id);
      
      console.log(`   📅 Agendamentos: ${appointmentCount || 0}`);
      console.log(`   👥 Usuários: ${userCount || 0}`);
      console.log(`   ⚙️ Serviços: ${serviceCount || 0}`);
      
      if (appointmentCount > 0 || userCount > 0 || serviceCount > 0) {
        console.log(`   ✅ TENANT COM DADOS ENCONTRADO!`);
        console.log(`   📋 ID: ${tenant.id}`);
        console.log(`   🏢 Nome: ${tenant.business_name}`);
        console.log(`   🌐 Domínio: ${tenant.domain}`);
        
        // Show sample appointments
        if (appointmentCount > 0) {
          console.log(`   \n   📅 Agendamentos de exemplo:`);
          const { data: sampleAppointments } = await supabase
            .from('appointments')
            .select(`
              id, start_time, status, final_price,
              users (name, phone),
              services (name)
            `)
            .eq('tenant_id', tenant.id)
            .limit(3);
          
          sampleAppointments?.forEach((apt, idx) => {
            console.log(`   ${idx + 1}. ${apt.start_time} - ${apt.users?.name} - ${apt.services?.name} - R$ ${apt.final_price} - ${apt.status}`);
          });
        }
        
        return tenant;
      }
      console.log(`   ❌ Sem dados\n`);
    }
    
    console.log('❌ Nenhum tenant com dados encontrado');
    
  } catch (error) {
    console.log('❌ Erro:', error.message);
  }
}

findTenantWithData();