#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function populateUsers() {
  console.log('🔄 Populando users table para testes...');
  
  // Ler tenants do arquivo
  const tenants = require('./scenarios/tenants.json');
  const allTenantIds = Object.values(tenants).flat();
  
  console.log(`📋 Tenants para popular: ${allTenantIds.length}`);
  
  for (const tenantId of allTenantIds) {
    console.log(`\n👤 Populando user para tenant: ${tenantId}`);
    
    // Verificar se já existe user para este tenant
    const { data: existingUser } = await supabase
      .from('user_tenants')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .limit(1)
      .single();
    
    if (existingUser) {
      console.log(`  ✅ User já existe para tenant ${tenantId}`);
      continue;
    }
    
    // Criar user genérico para teste
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        phone_number: `+5511999${tenantId.slice(-6)}`, // Usar final do UUID como telefone único
        name: `Test User ${tenantId.slice(0, 8)}`,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();
    
    if (userError) {
      console.error(`  ❌ Erro criando user: ${userError.message}`);
      continue;
    }
    
    console.log(`  ✅ User criado: ${newUser.id}`);
    
    // Associar user ao tenant via junction table
    const { error: junctionError } = await supabase
      .from('user_tenants')
      .insert({
        user_id: newUser.id,
        tenant_id: tenantId,
        created_at: new Date().toISOString()
      });
    
    if (junctionError) {
      console.error(`  ❌ Erro criando associação user-tenant: ${junctionError.message}`);
    } else {
      console.log(`  ✅ Associação user-tenant criada`);
    }
  }
  
  console.log('\n🎉 População de users concluída!');
  
  // Validar resultado
  const { data: totalUsers } = await supabase
    .from('users')
    .select('id', { count: 'exact' });
    
  const { data: totalAssociations } = await supabase
    .from('user_tenants')
    .select('user_id', { count: 'exact' });
  
  console.log(`📊 Total users: ${totalUsers?.length || 0}`);
  console.log(`📊 Total user-tenant associations: ${totalAssociations?.length || 0}`);
}

populateUsers().catch(console.error);