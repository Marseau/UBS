#!/usr/bin/env node

/**
 * LIMPEZA COMPLETA - APAGAR TUDO CRIADO HOJE
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function limparTudo() {
  console.log('🧹 LIMPANDO TUDO CRIADO HOJE...');
  console.log('='.repeat(60));
  
  try {
    // 1. Buscar IDs dos tenants criados hoje
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id')
      .gte('created_at', '2025-07-16T15:30:00');
      
    if (!tenants || tenants.length === 0) {
      console.log('❌ Nenhum tenant encontrado para limpar');
      return;
    }
    
    const tenantIds = tenants.map(t => t.id);
    console.log(`📊 Encontrados ${tenantIds.length} tenants para limpar`);
    
    // 2. Deletar appointments
    console.log('\n🗑️ Deletando appointments...');
    const { error: appointmentsError } = await supabase
      .from('appointments')
      .delete()
      .in('tenant_id', tenantIds);
      
    if (appointmentsError) {
      console.error('❌ Erro ao deletar appointments:', appointmentsError);
    } else {
      console.log('✅ Appointments deletados');
    }
    
    // 3. Deletar conversations
    console.log('\n🗑️ Deletando conversations...');
    const { error: conversationsError } = await supabase
      .from('conversation_history')
      .delete()
      .in('tenant_id', tenantIds);
      
    if (conversationsError) {
      console.error('❌ Erro ao deletar conversations:', conversationsError);
    } else {
      console.log('✅ Conversations deletadas');
    }
    
    // 4. Deletar stripe_customers
    console.log('\n🗑️ Deletando stripe_customers...');
    const { error: stripeError } = await supabase
      .from('stripe_customers')
      .delete()
      .in('tenant_id', tenantIds);
      
    if (stripeError) {
      console.error('❌ Erro ao deletar stripe_customers:', stripeError);
    } else {
      console.log('✅ Stripe customers deletados');
    }
    
    // 5. Deletar services
    console.log('\n🗑️ Deletando services...');
    const { error: servicesError } = await supabase
      .from('services')
      .delete()
      .in('tenant_id', tenantIds);
      
    if (servicesError) {
      console.error('❌ Erro ao deletar services:', servicesError);
    } else {
      console.log('✅ Services deletados');
    }
    
    // 6. Deletar professionals
    console.log('\n🗑️ Deletando professionals...');
    const { error: professionalsError } = await supabase
      .from('professionals')
      .delete()
      .in('tenant_id', tenantIds);
      
    if (professionalsError) {
      console.error('❌ Erro ao deletar professionals:', professionalsError);
    } else {
      console.log('✅ Professionals deletados');
    }
    
    // 7. Deletar admin_users
    console.log('\n🗑️ Deletando admin_users...');
    const { error: adminError } = await supabase
      .from('admin_users')
      .delete()
      .in('tenant_id', tenantIds);
      
    if (adminError) {
      console.error('❌ Erro ao deletar admin_users:', adminError);
    } else {
      console.log('✅ Admin users deletados');
    }
    
    // 8. Deletar tenants (por último)
    console.log('\n🗑️ Deletando tenants...');
    const { error: tenantsError } = await supabase
      .from('tenants')
      .delete()
      .in('id', tenantIds);
      
    if (tenantsError) {
      console.error('❌ Erro ao deletar tenants:', tenantsError);
    } else {
      console.log('✅ Tenants deletados');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ LIMPEZA CONCLUÍDA!');
    console.log('📊 Todos os dados criados hoje foram removidos');
    console.log('🎯 Agora você pode recomeçar do zero');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

// Executar
limparTudo();