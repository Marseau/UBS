#!/usr/bin/env node

/**
 * DELETAR CONVERSAS EM EXCESSO - MÉTODO DIRETO
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deleteExcessConversations() {
  console.log('🗑️ DELETANDO CONVERSAS EM EXCESSO');
  console.log('='.repeat(50));
  
  try {
    // 1. Obter um tenant por vez e processar
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name')
      .gte('created_at', '2025-07-16T15:30:00')
      .limit(5); // processar apenas 5 tenants por vez
      
    for (const tenant of tenants) {
      console.log(`\n📌 Processando: ${tenant.name}`);
      
      // Contar conversations deste tenant
      const { count: conversationCount } = await supabase
        .from('conversation_history')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);
        
      console.log(`   💬 Conversations: ${conversationCount}`);
      
      if (conversationCount > 500) { // se tem mais de 500, deletar algumas
        const toDelete = conversationCount - 400; // deixar 400
        console.log(`   🗑️ Deletando ${toDelete} conversas...`);
        
        // Deletar as mais antigas
        const { data: oldConversations } = await supabase
          .from('conversation_history')
          .select('id')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: true })
          .limit(toDelete);
          
        if (oldConversations && oldConversations.length > 0) {
          const idsToDelete = oldConversations.map(c => c.id);
          
          // Deletar em lotes de 100
          const batchSize = 100;
          let deleted = 0;
          
          for (let i = 0; i < idsToDelete.length; i += batchSize) {
            const batch = idsToDelete.slice(i, i + batchSize);
            const { error } = await supabase
              .from('conversation_history')
              .delete()
              .in('id', batch);
              
            if (error) {
              console.error(`     ❌ Erro:`, error.message);
            } else {
              deleted += batch.length;
              console.log(`     ✅ Deletado: ${batch.length} (total: ${deleted})`);
            }
          }
        }
      }
    }
    
    // 2. Verificar totais finais
    const { data: allTenants } = await supabase
      .from('tenants')
      .select('id')
      .gte('created_at', '2025-07-16T15:30:00');
      
    const allTenantIds = allTenants.map(t => t.id);
    
    const { count: finalAppointments } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .in('tenant_id', allTenantIds);
      
    const { count: finalConversations } = await supabase
      .from('conversation_history')
      .select('*', { count: 'exact', head: true })
      .in('tenant_id', allTenantIds);
      
    console.log('\n📊 TOTAIS FINAIS:');
    console.log(`   Appointments: ${finalAppointments}`);
    console.log(`   Conversations: ${finalConversations}`);
    console.log(`   Ratio: ${(finalConversations / finalAppointments).toFixed(2)}x`);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

deleteExcessConversations();