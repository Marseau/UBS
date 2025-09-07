/**
 * Script para atualizar endereço do tenant diretamente no banco
 */

const { createClient } = require('@supabase/supabase-js');

async function updateTenantAddress() {
  console.log('📍 [UPDATE] Atualizando endereço do tenant...\n');
  
  const supabaseUrl = process.env.SUPABASE_URL || 'https://qsdfyffuonywhpdhwfkh.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada no ambiente');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const tenantId = '9a349440-1409-4d65-b707-a6e5aa00c581';
  const address = 'Rua das Flores, 123, Centro, São Paulo - SP, CEP: 01234-567';
  
  try {
    console.log(`🏢 Tenant ID: ${tenantId}`);
    console.log(`📍 Endereço: ${address}\n`);
    
    const { data, error } = await supabase
      .from('tenants')
      .update({
        address: address,
        business_address: address
      })
      .eq('id', tenantId)
      .select();
    
    if (error) {
      console.error('❌ Erro ao atualizar tenant:', error);
      return;
    }
    
    console.log('✅ Tenant atualizado com sucesso!');
    console.log('📄 Dados atualizados:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

updateTenantAddress().catch(console.error);