const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkProfessional() {
  const FIXED_TENANT_ID = '00000000-0000-4000-8000-000000000001';
  
  // Verificar se tabela professionals existe
  const { data: professionals, error } = await supabase
    .from('professionals')
    .select('*')
    .eq('tenant_id', FIXED_TENANT_ID);
  
  console.log('Professionals found:', professionals);
  console.log('Error:', error);
  
  if (professionals && professionals.length === 0) {
    console.log('🔧 Criando profissional...');
    
    const { data: newProfessional, error: createError } = await supabase
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
    
    console.log('New professional:', newProfessional);
    console.log('Create error:', createError);
    
    if (newProfessional) {
      console.log('');
      console.log('🔗 LINK DE AUTORIZAÇÃO:');
      console.log(`http://localhost:3000/api/demo/google-calendar/auth?tenant_id=${FIXED_TENANT_ID}&professional_id=${newProfessional.id}`);
    }
  } else if (professionals && professionals.length > 0) {
    console.log('');
    console.log('🔗 LINK DE AUTORIZAÇÃO:');
    console.log(`http://localhost:3000/api/demo/google-calendar/auth?tenant_id=${FIXED_TENANT_ID}&professional_id=${professionals[0].id}`);
  }
}

checkProfessional();