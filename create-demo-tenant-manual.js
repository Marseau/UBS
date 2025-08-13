const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createFixedDemoTenant() {
  console.log('🏗️ Criando tenant demo fixo único...');
  
  const FIXED_TENANT_ID = '00000000-0000-4000-8000-000000000001';
  const DEMO_BUSINESS_NAME = 'Google Calendar Demo Business';
  const DEMO_EMAIL = 'demo@googlecalendar.system';
  const DEMO_PHONE = '+5511999887766';
  
  try {
    // 1. Verificar se já existe
    const { data: existing } = await supabase
      .from('tenants')
      .select('id, business_name')
      .eq('id', FIXED_TENANT_ID)
      .single();
    
    if (existing) {
      console.log('♻️ Tenant demo fixo já existe:', existing.business_name);
      
      // Buscar profissional existente
      const { data: professional } = await supabase
        .from('professionals')
        .select('id, name')
        .eq('tenant_id', FIXED_TENANT_ID)
        .single();
      
      console.log('✅ RESULTADO:');
      console.log('Tenant ID:', FIXED_TENANT_ID);
      console.log('Professional ID:', professional?.id);
      console.log('');
      console.log('🔗 LINK DE AUTORIZAÇÃO:');
      console.log(`http://localhost:3000/api/demo/google-calendar/auth?tenant_id=${FIXED_TENANT_ID}&professional_id=${professional?.id}`);
      return;
    }
    
    // 2. Criar tenant
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .insert([{
        id: FIXED_TENANT_ID,
        name: DEMO_BUSINESS_NAME,
        business_name: DEMO_BUSINESS_NAME,
        slug: 'google-calendar-demo',
        email: DEMO_EMAIL,
        domain: 'beauty',
        status: 'active',
        account_type: 'test',
        created_at: new Date().toISOString(),
        phone: DEMO_PHONE
      }])
      .select()
      .single();
    
    if (tenantError) {
      console.error('❌ Erro ao criar tenant:', tenantError);
      return;
    }
    
    console.log('✅ Tenant criado:', tenantData.business_name);
    
    // 3. Criar profissional
    const { data: professionalData, error: professionalError } = await supabase
      .from('professionals')
      .insert([{
        tenant_id: FIXED_TENANT_ID,
        name: 'Profissional Demo',
        email: 'profissional@demo.system',
        phone: '+5511999887767',
        specialties: ['Cortes', 'Coloração', 'Tratamentos']
      }])
      .select()
      .single();
    
    if (professionalError) {
      console.error('❌ Erro ao criar profissional:', professionalError);
      return;
    }
    
    console.log('✅ Profissional criado:', professionalData.name);
    
    // 4. Mostrar resultado
    console.log('');
    console.log('🎉 TENANT DEMO FIXO CRIADO COM SUCESSO!');
    console.log('='.repeat(50));
    console.log('Tenant ID:', FIXED_TENANT_ID);
    console.log('Business Name:', DEMO_BUSINESS_NAME);
    console.log('Professional ID:', professionalData.id);
    console.log('Professional Name:', professionalData.name);
    console.log('');
    console.log('🔗 LINK DE AUTORIZAÇÃO DO GOOGLE CALENDAR:');
    console.log(`http://localhost:3000/api/demo/google-calendar/auth?tenant_id=${FIXED_TENANT_ID}&professional_id=${professionalData.id}`);
    console.log('');
    console.log('📋 PRÓXIMO PASSO:');
    console.log('1. Acesse o link acima no seu navegador');
    console.log('2. Autorize o acesso ao seu Google Calendar');
    console.log('3. Sistema estará pronto para todos os testes!');
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

createFixedDemoTenant();