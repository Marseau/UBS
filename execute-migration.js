require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function executeMigration() {
    console.log('🚀 EXECUTANDO MIGRAÇÃO PARA CONVERSATION PLANS');
    console.log('='.repeat(50));
    
    try {
        // 1. Verificar se colunas já existem
        console.log('🔍 1. Verificando estrutura atual...');
        const { data: currentTenant } = await supabase
            .from('tenants')
            .select('*')
            .limit(1);
            
        const hasConversationPlan = currentTenant && currentTenant[0] && 'conversation_plan' in currentTenant[0];
        
        if (hasConversationPlan) {
            console.log('✅ Colunas já existem, pulando para atualização de dados...');
        } else {
            console.log('📋 2. Adicionando novas colunas...');
            
            // Usar SQL direto via função
            const { error: alterError } = await supabase.rpc('execute_raw_sql', {
                sql: `
                    ALTER TABLE tenants 
                    ADD COLUMN IF NOT EXISTS conversation_plan VARCHAR(20) DEFAULT 'basico',
                    ADD COLUMN IF NOT EXISTS max_conversations INTEGER DEFAULT 200,
                    ADD COLUMN IF NOT EXISTS stripe_subscription_item_id VARCHAR(255);
                `
            });
            
            if (alterError) {
                console.log('Tentando método alternativo...');
                // Método alternativo: usar admin client
                const { error: altError } = await supabase
                    .schema('public')
                    .rpc('exec', { 
                        sql: `
                            ALTER TABLE tenants 
                            ADD COLUMN IF NOT EXISTS conversation_plan VARCHAR(20) DEFAULT 'basico',
                            ADD COLUMN IF NOT EXISTS max_conversations INTEGER DEFAULT 200,
                            ADD COLUMN IF NOT EXISTS stripe_subscription_item_id VARCHAR(255);
                        `
                    });
                    
                if (altError) {
                    console.log('⚠️ Não foi possível adicionar colunas via API. Executando UPDATE direto...');
                }
            }
        }
        
        // 3. Migrar dados existentes usando UPDATE manual
        console.log('📋 3. Migrando dados tenant por tenant...');
        
        const { data: allTenants } = await supabase
            .from('tenants')
            .select('id, name, subscription_plan');
            
        let migratedCount = 0;
        
        for (const tenant of allTenants) {
            const conversationPlan = tenant.subscription_plan === 'starter' ? 'basico' :
                                   tenant.subscription_plan === 'professional' ? 'profissional' :
                                   tenant.subscription_plan === 'enterprise' ? 'enterprise' : 'basico';
            
            const maxConversations = tenant.subscription_plan === 'starter' ? 200 :
                                   tenant.subscription_plan === 'professional' ? 400 :
                                   tenant.subscription_plan === 'enterprise' ? 1250 : 200;
            
            try {
                const { error: updateError } = await supabase
                    .from('tenants')
                    .update({
                        conversation_plan: conversationPlan,
                        max_conversations: maxConversations,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', tenant.id);
                
                if (updateError) {
                    console.log(`❌ Erro ao migrar ${tenant.name}:`, updateError.message);
                } else {
                    console.log(`✅ ${tenant.name}: ${tenant.subscription_plan} → ${conversationPlan} (${maxConversations} conversas)`);
                    migratedCount++;
                }
            } catch (err) {
                console.log(`⚠️ Erro ao migrar ${tenant.name}:`, err.message);
            }
        }
        
        console.log(`\n✅ MIGRAÇÃO CONCLUÍDA! ${migratedCount}/${allTenants.length} tenants migrados`);
        
        // 4. Verificar resultado final
        const { data: migratedTenants } = await supabase
            .from('tenants')
            .select('name, subscription_plan, conversation_plan, max_conversations')
            .limit(5);
            
        console.log('\n📊 Resultado da migração:');
        if (migratedTenants) {
            migratedTenants.forEach(t => {
                console.log(`   ${t.name}: ${t.subscription_plan} → ${t.conversation_plan || 'NULL'} (${t.max_conversations || 'NULL'} conversas)`);
            });
        }
        
    } catch (error) {
        console.error('❌ Erro geral:', error);
    }
}

executeMigration().catch(console.error);