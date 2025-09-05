#!/usr/bin/env node

/**
 * EVIDÊNCIAS DE PERSISTÊNCIA - SISTEMA DEMO
 * Verificação das 4 tabelas: tenants, services, professionals, admin_users
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const TENANT_ID = 'e206c571-8731-4392-937a-ccc7fa04a569';

async function collectEvidence() {
  console.log('\n🔍 ========== EVIDÊNCIAS DE PERSISTÊNCIA ==========');
  console.log(`🎯 Tenant ID: ${TENANT_ID}`);
  console.log(`📊 Phone: 5511988555777`);
  console.log('='.repeat(50));

  try {
    // 1. TENANTS TABLE
    console.log('\n📋 EVIDÊNCIA 1: TENANTS TABLE');
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name, slug, business_name, email, domain, phone, account_type, status')
      .eq('id', TENANT_ID)
      .single();

    if (tenantError) {
      console.log('❌ Erro:', tenantError.message);
    } else if (tenant) {
      console.log('✅ TENANT ENCONTRADO:');
      console.log(`   - ID: ${tenant.id}`);
      console.log(`   - Name: ${tenant.name}`);
      console.log(`   - Slug: ${tenant.slug}`);
      console.log(`   - Business Name: ${tenant.business_name}`);
      console.log(`   - Email: ${tenant.email}`);
      console.log(`   - Domain: ${tenant.domain}`);
      console.log(`   - Phone: ${tenant.phone}`);
      console.log(`   - Account Type: ${tenant.account_type}`);
      console.log(`   - Status: ${tenant.status}`);
    } else {
      console.log('❌ Tenant não encontrado');
    }

    // 2. SERVICES TABLE
    console.log('\n🛠️  EVIDÊNCIA 2: SERVICES TABLE');
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('id, tenant_id, name, duration_minutes, base_price')
      .eq('tenant_id', TENANT_ID);

    if (servicesError) {
      console.log('❌ Erro:', servicesError.message);
    } else if (services && services.length > 0) {
      console.log(`✅ ${services.length} SERVIÇOS ENCONTRADOS:`);
      services.forEach((service, index) => {
        console.log(`   ${index + 1}. ${service.name} (${service.duration_minutes}min, R$ ${service.base_price/100})`);
      });
    } else {
      console.log('❌ Nenhum serviço encontrado');
    }

    // 3. PROFESSIONALS TABLE
    console.log('\n👨‍⚕️ EVIDÊNCIA 3: PROFESSIONALS TABLE');
    const { data: professionals, error: profError } = await supabase
      .from('professionals')
      .select('id, tenant_id, name, google_calendar_id, status')
      .eq('tenant_id', TENANT_ID);

    if (profError) {
      console.log('❌ Erro:', profError.message);
    } else if (professionals && professionals.length > 0) {
      console.log(`✅ ${professionals.length} PROFISSIONAIS ENCONTRADOS:`);
      professionals.forEach((prof, index) => {
        console.log(`   ${index + 1}. ${prof.name} (${prof.status}) - Calendar: ${prof.google_calendar_id}`);
      });
    } else {
      console.log('❌ Nenhum profissional encontrado');
    }

    // 4. ADMIN_USERS TABLE
    console.log('\n🔐 EVIDÊNCIA 4: ADMIN_USERS TABLE');
    const { data: adminUsers, error: adminError } = await supabase
      .from('admin_users')
      .select('id, tenant_id, email, name, role, is_active')
      .eq('tenant_id', TENANT_ID);

    if (adminError) {
      console.log('❌ Erro:', adminError.message);
    } else if (adminUsers && adminUsers.length > 0) {
      console.log(`✅ ${adminUsers.length} ADMIN USERS ENCONTRADOS:`);
      adminUsers.forEach((admin, index) => {
        console.log(`   ${index + 1}. ${admin.name} (${admin.email}) - Role: ${admin.role} - Ativo: ${admin.is_active}`);
      });
    } else {
      console.log('❌ Nenhum admin user encontrado');
    }

    // 5. BONUS: USERS TABLE (se houver dados do chat)
    console.log('\n👥 EVIDÊNCIA BONUS: USERS TABLE');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, phone, email')
      .eq('phone', '5511999888777');

    if (usersError) {
      console.log('❌ Erro:', usersError.message);
    } else if (users && users.length > 0) {
      console.log(`✅ ${users.length} USUÁRIOS DO CHAT ENCONTRADOS:`);
      users.forEach((user, index) => {
        console.log(`   ${index + 1}. Phone: ${user.phone} - Email: ${user.email || 'N/A'}`);
      });
    } else {
      console.log('ℹ️  Nenhum usuário de chat encontrado ainda');
    }

    console.log('\n🎉 ========== COLETA DE EVIDÊNCIAS COMPLETA ==========');
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

collectEvidence();