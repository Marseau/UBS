#!/usr/bin/env node

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function validateTenant(tenantId, domain) {
  console.log(`\n🔍 VALIDANDO TENANT: ${tenantId} (${domain.toUpperCase()})`);
  
  let valid = true;
  let issues = [];

  try {
    // 1. Verificar se tenant existe
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      console.log('❌ Tenant NÃO EXISTE no banco de dados');
      return false;
    }

    console.log(`✅ Tenant existe: ${tenant.business_name || tenant.name}`);

    // 2. Verificar serviços com preço e duração
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('*')
      .eq('tenant_id', tenantId);

    if (servicesError) {
      console.log(`❌ Erro ao buscar serviços: ${servicesError.message}`);
      issues.push('Erro ao buscar serviços');
      valid = false;
    } else if (!services || services.length === 0) {
      console.log('❌ Nenhum serviço cadastrado');
      issues.push('Sem serviços');
      valid = false;
    } else {
      const servicesWithPriceAndDuration = services.filter(s => 
        s.base_price && s.base_price > 0 && s.duration_minutes && s.duration_minutes > 0
      );
      
      if (servicesWithPriceAndDuration.length === 0) {
        console.log(`❌ Nenhum serviço com preço e duração válidos (${services.length} serviços encontrados)`);
        issues.push('Serviços sem preço/duração');
        valid = false;
      } else {
        console.log(`✅ ${servicesWithPriceAndDuration.length} serviços válidos (com preço e duração)`);
      }
    }

    // 3. Verificar profissionais com Google Calendar
    const { data: professionals, error: profError } = await supabase
      .from('professionals')
      .select('*')
      .eq('tenant_id', tenantId);

    if (profError) {
      console.log(`❌ Erro ao buscar profissionais: ${profError.message}`);
      issues.push('Erro ao buscar profissionais');
      valid = false;
    } else if (!professionals || professionals.length === 0) {
      console.log('❌ Nenhum profissional cadastrado');
      issues.push('Sem profissionais');
      valid = false;
    } else {
      const profsWithCalendar = professionals.filter(p => 
        p.google_calendar_credentials && p.google_calendar_id
      );
      
      if (profsWithCalendar.length === 0) {
        console.log(`❌ Nenhum profissional com Google Calendar configurado (${professionals.length} profissionais encontrados)`);
        issues.push('Profissionais sem Google Calendar');
        valid = false;
      } else {
        console.log(`✅ ${profsWithCalendar.length} profissionais com Google Calendar`);
      }
    }

    // 4. Verificar users para este tenant (via user_tenants junction table)
    const { data: userRelations, error: usersError } = await supabase
      .from('user_tenants')
      .select('user_id, users!inner(*)')
      .eq('tenant_id', tenantId);

    if (usersError) {
      console.log(`❌ Erro ao buscar users: ${usersError.message}`);
      issues.push('Erro ao buscar users');
      valid = false;
    } else if (!userRelations || userRelations.length === 0) {
      console.log('❌ Nenhum user cadastrado');
      issues.push('Sem users');
      valid = false;
    } else {
      console.log(`✅ ${userRelations.length} users cadastrados`);
    }

    // Resumo
    if (valid) {
      console.log(`🎉 TENANT VÁLIDO PARA TESTE`);
    } else {
      console.log(`💥 TENANT INVÁLIDO - Issues: ${issues.join(', ')}`);
    }

    return valid;

  } catch (error) {
    console.log(`❌ ERRO GERAL: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 VALIDAÇÃO DE TENANTS PARA FULL OUTCOME TEST');
  console.log('='.repeat(60));

  // Carregar arquivo de tenants
  const tenants = JSON.parse(fs.readFileSync('scenarios/tenants.json', 'utf8'));

  let totalValid = 0;
  let totalTenants = 0;
  const validTenants = {};
  const invalidTenants = {};

  for (const [domain, tenantIds] of Object.entries(tenants)) {
    console.log(`\n📋 DOMÍNIO: ${domain.toUpperCase()}`);
    validTenants[domain] = [];
    invalidTenants[domain] = [];

    for (const tenantId of tenantIds) {
      const isValid = await validateTenant(tenantId, domain);
      totalTenants++;
      
      if (isValid) {
        totalValid++;
        validTenants[domain].push(tenantId);
      } else {
        invalidTenants[domain].push(tenantId);
      }
    }
  }

  // Resumo final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO FINAL');
  console.log('='.repeat(60));
  console.log(`Total de tenants validados: ${totalTenants}`);
  console.log(`Tenants válidos: ${totalValid}`);
  console.log(`Tenants inválidos: ${totalTenants - totalValid}`);
  
  console.log('\n✅ TENANTS VÁLIDOS POR DOMÍNIO:');
  for (const [domain, ids] of Object.entries(validTenants)) {
    console.log(`${domain}: ${ids.length > 0 ? ids.join(', ') : 'NENHUM'}`);
  }

  console.log('\n❌ TENANTS INVÁLIDOS POR DOMÍNIO:');
  for (const [domain, ids] of Object.entries(invalidTenants)) {
    if (ids.length > 0) {
      console.log(`${domain}: ${ids.join(', ')}`);
    }
  }

  if (totalValid < 12) {
    console.log('\n🚨 ATENÇÃO: Não há tenants válidos suficientes para o teste completo!');
    console.log('   É necessário pelo menos 2 tenants válidos por domínio (12 total)');
    process.exit(1);
  } else {
    console.log('\n🎉 Validação concluída! Tenants suficientes para o teste.');
  }
}

main().catch(error => {
  console.error('💥 Erro na validação:', error);
  process.exit(1);
});