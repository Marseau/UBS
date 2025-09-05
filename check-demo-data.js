require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDemoData() {
  const tenantId = '22198a7f-2cdb-4a02-9b46-7001dfd9aec3';
  
  console.log('=== VERIFICANDO TENANT ===');
  const { data: tenant } = await supabase
    .from('tenants')
    .select('business_name, domain, account_type, phone')
    .eq('id', tenantId)
    .single();
  
  console.log(tenant);
  
  console.log('\n=== SERVIÇOS CRIADOS ===');
  const { data: services } = await supabase
    .from('services')
    .select('name, duration_minutes, base_price')
    .eq('tenant_id', tenantId);
  
  services?.forEach(s => {
    console.log(`• ${s.name} - ${s.duration_minutes}min - R$ ${(s.base_price/100).toFixed(2)}`);
  });
  
  console.log('\n=== PROFISSIONAIS CRIADOS ===');
  const { data: profs } = await supabase
    .from('professionals')
    .select('name, google_calendar_id, status')
    .eq('tenant_id', tenantId);
  
  profs?.forEach(p => {
    console.log(`• ${p.name} - Calendar: ${p.google_calendar_id} - Status: ${p.status}`);
  });
  
  console.log('\n=== RESUMO ===');
  console.log(`Tenant: ${tenant?.business_name} (${tenant?.domain})`);
  console.log(`Account Type: ${tenant?.account_type}`);
  console.log(`Phone: ${tenant?.phone}`);
  console.log(`Services: ${services?.length || 0}`);
  console.log(`Professionals: ${profs?.length || 0}`);
}

checkDemoData().catch(console.error);