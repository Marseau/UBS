/**
 * CHECK MISSING TENANTS WITH CONVERSATIONS
 * Verificar se há tenants com conversas que não estão no job
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkMissingTenantsWithConversations() {
  console.log('🔍 VERIFICANDO TENANTS COM CONVERSAS NOS ÚLTIMOS 30 DIAS');
  console.log('='.repeat(60));

  try {
    // 1. TENANTS NO JOB (tenant_metrics)
    console.log('\n📊 1. TENANTS PROCESSADOS NO JOB:');
    const { data: jobTenants, error: jobError } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, metric_data')
      .eq('metric_type', 'billing_analysis');

    if (jobError) {
      console.log('❌ Erro:', jobError);
      return;
    }

    console.log(`✅ Job processou: ${jobTenants?.length || 0} tenants`);
    const jobTenantIds = jobTenants?.map(t => t.tenant_id) || [];

    // Mostrar alguns
    jobTenants?.slice(0, 5).forEach((tenant, i) => {
      console.log(`   ${i + 1}. ${tenant.metric_data?.business_name || 'Unknown'} (${tenant.tenant_id})`);
    });

    // 2. TENANTS COM CONVERSAS REAIS (últimos 30 dias)
    console.log('\n📊 2. TENANTS COM CONVERSAS REAIS (ÚLTIMOS 30 DIAS):');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: realConversations, error: convError } = await supabase
      .from('conversation_history')
      .select('tenant_id, conversation_context, conversation_outcome')
      .not('conversation_outcome', 'is', null)
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (convError) {
      console.log('❌ Erro:', convError);
      return;
    }

    // Agrupar por tenant e contar sessions únicas
    const tenantSessions = {};
    realConversations?.forEach(conv => {
      const tenantId = conv.tenant_id;
      const sessionId = conv.conversation_context?.session_id;
      
      if (tenantId && sessionId) {
        if (!tenantSessions[tenantId]) {
          tenantSessions[tenantId] = new Set();
        }
        tenantSessions[tenantId].add(sessionId);
      }
    });

    const realTenantIds = Object.keys(tenantSessions);
    console.log(`✅ Tenants com conversas reais: ${realTenantIds.length}`);

    // Buscar nomes dos tenants
    const { data: tenantNames } = await supabase
      .from('tenants')
      .select('id, business_name, status')
      .in('id', realTenantIds);

    const tenantNamesMap = {};
    tenantNames?.forEach(t => {
      tenantNamesMap[t.id] = { name: t.business_name, status: t.status };
    });

    // Mostrar todos os tenants com conversas
    console.log('\n📋 TODOS OS TENANTS COM CONVERSAS:');
    Object.entries(tenantSessions).forEach(([tenantId, sessions], i) => {
      const tenant = tenantNamesMap[tenantId];
      console.log(`   ${i + 1}. ${tenant?.name || 'Unknown'} (${tenant?.status || 'unknown'}): ${sessions.size} conversas`);
    });

    // 3. COMPARAÇÃO - TENANTS FALTANDO NO JOB
    console.log('\n🚨 3. TENANTS COM CONVERSAS MAS NÃO NO JOB:');
    const missingTenants = realTenantIds.filter(id => !jobTenantIds.includes(id));

    if (missingTenants.length === 0) {
      console.log('   ✅ Nenhum tenant faltando! Job processou todos os tenants com conversas.');
    } else {
      console.log(`   ❌ ${missingTenants.length} tenants faltando no job:`);
      
      missingTenants.forEach((tenantId, i) => {
        const tenant = tenantNamesMap[tenantId];
        const conversationsCount = tenantSessions[tenantId]?.size || 0;
        console.log(`      ${i + 1}. ${tenant?.name || 'Unknown'} (${tenant?.status || 'unknown'}): ${conversationsCount} conversas`);
      });
    }

    // 4. TENANTS NO JOB MAS SEM CONVERSAS
    console.log('\n🚨 4. TENANTS NO JOB MAS SEM CONVERSAS:');
    const extraTenants = jobTenantIds.filter(id => !realTenantIds.includes(id));

    if (extraTenants.length === 0) {
      console.log('   ✅ Nenhum tenant extra! Job processou apenas tenants com conversas.');
    } else {
      console.log(`   ⚠️ ${extraTenants.length} tenants no job sem conversas:`);
      
      extraTenants.slice(0, 10).forEach((tenantId, i) => {
        const jobTenant = jobTenants?.find(t => t.tenant_id === tenantId);
        const businessName = jobTenant?.metric_data?.business_name || 'Unknown';
        const conversations = jobTenant?.metric_data?.total_conversations || 0;
        console.log(`      ${i + 1}. ${businessName}: ${conversations} conversas (no job)`);
      });

      if (extraTenants.length > 10) {
        console.log(`      ... e mais ${extraTenants.length - 10} tenants`);
      }
    }

    // 5. ANÁLISE FINAL
    console.log('\n📊 5. ANÁLISE FINAL:');
    console.log(`   📋 Tenants com conversas reais: ${realTenantIds.length}`);
    console.log(`   📋 Tenants processados no job: ${jobTenantIds.length}`);
    console.log(`   ❌ Tenants faltando: ${missingTenants.length}`);
    console.log(`   ⚠️ Tenants extras: ${extraTenants.length}`);

    const isCorrect = missingTenants.length === 0 && extraTenants.length === 0;
    console.log(`\n   🎯 STATUS: ${isCorrect ? '✅ CORRETO' : '❌ INCORRETO'}`);

    if (!isCorrect) {
      console.log('\n   💡 PROBLEMAS IDENTIFICADOS:');
      if (missingTenants.length > 0) {
        console.log(`   - Job não processou ${missingTenants.length} tenants que têm conversas`);
      }
      if (extraTenants.length > 0) {
        console.log(`   - Job processou ${extraTenants.length} tenants que não têm conversas`);
      }
    }

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🔍 VERIFICAÇÃO DE TENANTS CONCLUÍDA');
}

checkMissingTenantsWithConversations();