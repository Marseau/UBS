#!/usr/bin/env node

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixServicesForTenant(tenantId, domain) {
  console.log(`🔧 Corrigindo serviços para tenant ${tenantId} (${domain})`);
  
  // Buscar serviços existentes sem preço/duração
  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('*')
    .eq('tenant_id', tenantId);

  if (servicesError) {
    console.log(`❌ Erro ao buscar serviços: ${servicesError.message}`);
    return false;
  }

  if (!services || services.length === 0) {
    console.log('❌ Nenhum serviço encontrado');
    return false;
  }

  // Definir preços e durações por domínio
  const pricingByDomain = {
    beauty: { basePrice: 80, baseDuration: 50 },
    healthcare: { basePrice: 150, baseDuration: 50 },
    legal: { basePrice: 200, baseDuration: 60 },
    education: { basePrice: 50, baseDuration: 50 },
    sports: { basePrice: 120, baseDuration: 60 },
    consulting: { basePrice: 300, baseDuration: 60 }
  };

  const pricing = pricingByDomain[domain] || { basePrice: 100, baseDuration: 60 };

  let updatedCount = 0;
  for (let i = 0; i < services.length; i++) {
    const service = services[i];
    
    if (!service.base_price || service.base_price <= 0 || !service.duration_minutes || service.duration_minutes <= 0) {
      const price = pricing.basePrice + (i * 20); // Variação de preços
      const durationMinutes = i % 2 === 0 ? 50 : 60; // Alternar entre 50 e 60 minutos
      
      const { error: updateError } = await supabase
        .from('services')
        .update({
          base_price: price,
          duration_minutes: durationMinutes,
          duration_type: 'fixed'
        })
        .eq('id', service.id);

      if (updateError) {
        console.log(`❌ Erro ao atualizar serviço ${service.name}: ${updateError.message}`);
      } else {
        console.log(`✅ Serviço atualizado: ${service.name} - R$ ${price} - ${durationMinutes}min`);
        updatedCount++;
      }
    }
  }

  console.log(`✅ ${updatedCount} serviços atualizados com preços e durações`);
  return updatedCount > 0;
}

async function createUsersForTenant(tenantId, domain) {
  console.log(`👥 Criando users para tenant ${tenantId} (${domain})`);
  
  // Verificar se já existem users para este tenant
  const { data: existingRelations } = await supabase
    .from('user_tenants')
    .select('user_id')
    .eq('tenant_id', tenantId);

  if (existingRelations && existingRelations.length > 0) {
    console.log(`✅ Já existem ${existingRelations.length} users para este tenant`);
    return true;
  }

  // Criar 2 users para cada tenant
  const usersToCreate = [
    {
      phone: `+5511${Math.floor(900000000 + Math.random() * 99999999)}`,
      name: `Cliente Demo ${domain} 1`,
      email: `cliente1.${domain}.${tenantId.slice(0,8)}@demo.com`,
      preferences: { domain: domain, test: true }
    },
    {
      phone: `+5511${Math.floor(900000000 + Math.random() * 99999999)}`,
      name: `Cliente Demo ${domain} 2`, 
      email: `cliente2.${domain}.${tenantId.slice(0,8)}@demo.com`,
      preferences: { domain: domain, test: true }
    }
  ];

  let createdCount = 0;
  for (const userData of usersToCreate) {
    // Criar o user
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (userError) {
      console.log(`❌ Erro ao criar user: ${userError.message}`);
      continue;
    }

    // Criar relação user_tenant
    const { error: relationError } = await supabase
      .from('user_tenants')
      .insert([{
        user_id: newUser.id,
        tenant_id: tenantId,
        role: 'customer',
        tenant_preferences: { test: true, created_for_demo: true }
      }]);

    if (relationError) {
      console.log(`❌ Erro ao criar relação user_tenant: ${relationError.message}`);
    } else {
      console.log(`✅ User criado: ${userData.name} - ${userData.phone}`);
      createdCount++;
    }
  }

  console.log(`✅ ${createdCount} users criados para o tenant`);
  return createdCount > 0;
}

async function validateAndFixTenant(tenantId, domain) {
  console.log(`\n🔄 PROCESSANDO TENANT: ${tenantId} (${domain.toUpperCase()})`);
  console.log('='.repeat(60));
  
  let success = true;

  // 1. Verificar se tenant existe
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (tenantError || !tenant) {
    console.log('❌ Tenant não existe no banco de dados');
    return false;
  }

  console.log(`✅ Tenant existe: ${tenant.business_name || tenant.name}`);

  // 2. Corrigir serviços
  const servicesFixed = await fixServicesForTenant(tenantId, domain);
  if (!servicesFixed) {
    success = false;
  }

  // 3. Criar users
  const usersCreated = await createUsersForTenant(tenantId, domain);
  if (!usersCreated) {
    success = false;
  }

  // 4. Verificar profissionais com Google Calendar
  const { data: professionals } = await supabase
    .from('professionals')
    .select('*')
    .eq('tenant_id', tenantId);

  const profsWithCalendar = professionals?.filter(p => 
    p.google_calendar_credentials && p.google_calendar_id
  );

  if (!profsWithCalendar || profsWithCalendar.length === 0) {
    console.log('⚠️ Este tenant não tem profissionais com Google Calendar');
    console.log('   Isso pode causar problemas nos testes de agendamento');
    // Não marca como erro pois alguns testes podem funcionar sem calendar
  } else {
    console.log(`✅ ${profsWithCalendar.length} profissionais com Google Calendar`);
  }

  if (success) {
    console.log('🎉 TENANT CORRIGIDO COM SUCESSO!');
  } else {
    console.log('💥 PROBLEMAS ENCONTRADOS NO TENANT');
  }

  return success;
}

async function main() {
  console.log('🚀 CORREÇÃO E POPULAÇÃO DE TENANTS');
  console.log('🎯 Corrigindo serviços sem preço/duração e criando users');
  console.log('='.repeat(60));

  // Carregar arquivo de tenants
  const tenants = JSON.parse(fs.readFileSync('scenarios/tenants.json', 'utf8'));

  let totalFixed = 0;
  let totalTenants = 0;
  const fixedTenants = {};

  for (const [domain, tenantIds] of Object.entries(tenants)) {
    console.log(`\n📋 PROCESSANDO DOMÍNIO: ${domain.toUpperCase()}`);
    fixedTenants[domain] = [];

    for (const tenantId of tenantIds) {
      const wasFixed = await validateAndFixTenant(tenantId, domain);
      totalTenants++;
      
      if (wasFixed) {
        totalFixed++;
        fixedTenants[domain].push(tenantId);
      }
      
      // Pequena pausa para não sobrecarregar o banco
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Resumo final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DA CORREÇÃO');
  console.log('='.repeat(60));
  console.log(`Total de tenants processados: ${totalTenants}`);
  console.log(`Tenants corrigidos com sucesso: ${totalFixed}`);
  console.log(`Tenants com problemas: ${totalTenants - totalFixed}`);

  console.log('\n✅ TENANTS CORRIGIDOS POR DOMÍNIO:');
  for (const [domain, ids] of Object.entries(fixedTenants)) {
    console.log(`${domain}: ${ids.length > 0 ? ids.length + ' tenants' : 'NENHUM'}`);
  }

  if (totalFixed >= 12) {
    console.log('\n🎉 CORREÇÃO CONCLUÍDA! Tenants prontos para o teste.');
    console.log('\n📝 Próximo passo: Execute novamente o validate-tenants.js para confirmar');
  } else {
    console.log('\n⚠️ Alguns tenants ainda têm problemas. Verifique os logs acima.');
  }
}

main().catch(error => {
  console.error('💥 Erro na correção:', error);
  process.exit(1);
});