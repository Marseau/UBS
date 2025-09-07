/**
 * Script para encontrar um tenant completo com serviços e profissionais
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qsdfyffuonywntnlycri.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function findCompleteTenant() {
  console.log('🔍 Buscando tenant completo com serviços e profissionais...\n');
  
  // 1. Buscar todos os tenants primeiro para debug
  console.log('🔧 Debugando: buscando todos os tenants...');
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, business_name, phone, domain, status')
    .limit(10);
    
  if (tenantsError) {
    console.log('❌ Erro ao buscar tenants:', tenantsError);
    return;
  }
    
  if (!tenants || tenants.length === 0) {
    console.log('❌ Nenhum tenant encontrado');
    return;
  }
  
  console.log(`📋 ${tenants.length} tenants encontrados. Verificando completude...\n`);
  
  // 2. Para cada tenant, verificar se tem serviços e profissionais
  for (const tenant of tenants) {
    console.log(`🏢 ${tenant.business_name} (${tenant.domain})`);
    console.log(`   ID: ${tenant.id}`);
    console.log(`   Phone: ${tenant.phone}`);
    
    // Verificar serviços
    const { data: services } = await supabase
      .from('services')
      .select('id, name, duration_minutes, price')
      .eq('tenant_id', tenant.id);
      
    // Verificar profissionais  
    const { data: professionals } = await supabase
      .from('professionals')
      .select('id, full_name, email')
      .eq('tenant_id', tenant.id);
      
    // Verificar agendamentos existentes
    const { data: appointments } = await supabase
      .from('appointments')
      .select('id, start_time, status')
      .eq('tenant_id', tenant.id)
      .limit(5);
    
    console.log(`   📋 Serviços: ${services?.length || 0}`);
    console.log(`   👨‍⚕️ Profissionais: ${professionals?.length || 0}`);
    console.log(`   📅 Agendamentos: ${appointments?.length || 0}`);
    
    if (services && services.length > 0 && professionals && professionals.length > 0) {
      console.log('   ✅ TENANT COMPLETO ENCONTRADO!\n');
      
      console.log('📋 DETALHES DOS SERVIÇOS:');
      services.forEach((s, i) => {
        console.log(`   ${i+1}. ${s.name} - ${s.duration_minutes}min - R$ ${s.price}`);
      });
      
      console.log('\n👨‍⚕️ DETALHES DOS PROFISSIONAIS:');
      professionals.forEach((p, i) => {
        console.log(`   ${i+1}. ${p.full_name} - ${p.email}`);
      });
      
      if (appointments && appointments.length > 0) {
        console.log('\n📅 AGENDAMENTOS EXISTENTES:');
        appointments.forEach((a, i) => {
          console.log(`   ${i+1}. ${a.id} - ${new Date(a.start_time).toLocaleString()} (${a.status})`);
        });
      }
      
      console.log('\n🎯 USAR ESTE TENANT PARA TODOS OS TESTES:');
      console.log(`const TENANT_ID = '${tenant.id}';`);
      console.log(`const SERVICE_ID = '${services[0].id}';`);
      console.log(`const PROFESSIONAL_ID = '${professionals[0].id}';`);
      console.log(`const TENANT_PHONE = '${tenant.phone}';`);
      
      return {
        tenantId: tenant.id,
        businessName: tenant.business_name,
        phone: tenant.phone,
        serviceId: services[0].id,
        serviceName: services[0].name,
        duration: services[0].duration_minutes,
        professionalId: professionals[0].id,
        professionalName: professionals[0].full_name,
        existingAppointments: appointments || []
      };
    } else {
      console.log('   ❌ Incompleto (falta serviços ou profissionais)\n');
    }
  }
  
  console.log('❌ Nenhum tenant completo encontrado nos primeiros 10 resultados');
}

if (require.main === module) {
  findCompleteTenant().catch(console.error);
}

module.exports = { findCompleteTenant };