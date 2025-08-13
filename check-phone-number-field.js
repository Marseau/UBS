const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkPhoneNumberField() {
  console.log('📱 VERIFICANDO CAMPO PHONE_NUMBER NA CONVERSATION_HISTORY');
  console.log('='.repeat(60));
  
  try {
    // Tentar buscar com phone_number
    const { data: testData, error } = await supabase
      .from('conversation_history')
      .select('id, phone_number, user_id, created_at')
      .limit(3);
    
    if (error) {
      console.log('❌ Campo phone_number não existe:', error.message);
      
      // Verificar se existe phone em users
      console.log('\n🔍 Verificando relação com tabela users...');
      const { data: usersData } = await supabase
        .from('conversation_history')
        .select(`
          id,
          user_id,
          users!inner(phone, name)
        `)
        .limit(3);
        
      if (usersData) {
        console.log('✅ Dados de phone disponíveis via JOIN com users:');
        usersData.forEach(record => {
          console.log(`   ID: ${record.id}`);
          console.log(`   User ID: ${record.user_id}`);
          console.log(`   Phone: ${record.users.phone}`);
          console.log(`   Name: ${record.users.name || 'N/A'}`);
          console.log('   ---');
        });
      }
    } else {
      console.log('✅ Campo phone_number encontrado na tabela!');
      console.log('📊 Amostra de dados:');
      testData?.forEach(record => {
        console.log(`   ID: ${record.id}`);
        console.log(`   Phone: ${record.phone_number || 'NULL'}`);
        console.log(`   User ID: ${record.user_id}`);
        console.log('   ---');
      });
    }
    
  } catch (error) {
    console.error('❌ Erro na verificação:', error);
  }
}

checkPhoneNumberField().catch(console.error);