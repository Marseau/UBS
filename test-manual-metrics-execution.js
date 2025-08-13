/**
 * Teste manual de execução das métricas validadas
 * Simula o processamento sem importar TypeScript
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testManualMetricsExecution() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('🧪 TESTE MANUAL: Execução de métricas validadas');
    console.log('==============================================\n');
    
    try {
        // 1. Buscar tenant para teste
        const { data: tenants } = await client
            .from('tenants')
            .select('id, business_name')
            .limit(1);
            
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado');
            return;
        }
        
        const testTenant = tenants[0];
        console.log(`📍 Tenant de teste: ${testTenant.id.substring(0,8)}... (${testTenant.business_name})`);
        
        // 2. Calcular métricas básicas manualmente
        const period = '30d';
        const periodDays = 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);
        
        console.log(`\n📊 Calculando métricas para período: ${period} (desde ${startDate.toISOString().split('T')[0]})`);
        
        // 2a. Monthly Revenue
        const { data: appointments } = await client
            .from('appointments')
            .select('final_price, quoted_price, status')
            .eq('tenant_id', testTenant.id)
            .in('status', ['completed', 'confirmed'])
            .gte('created_at', startDate.toISOString());
            
        const monthlyRevenue = appointments?.reduce((sum, apt) => {
            const revenue = apt.final_price || apt.quoted_price || 0;
            return sum + parseFloat(revenue.toString());
        }, 0) || 0;
        
        console.log(`   💰 Monthly Revenue: R$ ${monthlyRevenue.toFixed(2)}`);
        
        // 2b. New Customers
        const { data: userTenants } = await client
            .from('user_tenants')
            .select('user_id')
            .eq('tenant_id', testTenant.id)
            .gte('first_interaction', startDate.toISOString());
            
        const newCustomers = new Set(userTenants?.map(ut => ut.user_id) || []).size;
        console.log(`   👥 New Customers: ${newCustomers}`);
        
        // 2c. Conversation Metrics
        const { data: conversations } = await client
            .from('conversation_history')
            .select('conversation_outcome')
            .eq('tenant_id', testTenant.id)
            .gte('created_at', startDate.toISOString());
            
        const totalConversations = conversations?.length || 0;
        const spamConversations = conversations?.filter(c => 
            ['wrong_number', 'spam_detected'].includes(c.conversation_outcome || '')
        ).length || 0;
        
        console.log(`   💬 Total Conversations: ${totalConversations}`);
        console.log(`   🚫 Spam Rate: ${totalConversations > 0 ? ((spamConversations / totalConversations) * 100).toFixed(1) : 0}%`);
        
        // 3. Criar métricas validadas simuladas
        const mockValidatedMetrics = {
            monthly_revenue: monthlyRevenue,
            new_customers: newCustomers,
            appointment_success_rate: 85.5,
            no_show_impact: {
                impact_percentage: 12.3,
                lost_revenue: monthlyRevenue * 0.123,
                no_show_count: 3,
                total_appointments: appointments?.length || 0,
                total_potential_revenue: monthlyRevenue
            },
            spam_rate: {
                percentage: totalConversations > 0 ? (spamConversations / totalConversations) * 100 : 0,
                spam_conversations: spamConversations,
                total_conversations: totalConversations
            },
            information_rate: {
                percentage: 25.7,
                info_conversations: Math.floor(totalConversations * 0.257),
                total_conversations: totalConversations
            },
            test_timestamp: new Date().toISOString(),
            calculated_by: 'manual_test'
        };
        
        console.log(`\n✅ Métricas validadas simuladas criadas (${Object.keys(mockValidatedMetrics).length} chaves)`);
        
        // 4. Testar inserção na tabela
        console.log('\n📝 Testando inserção na tabela tenant_metrics...');
        
        const { error } = await client
            .from('tenant_metrics')
            .upsert({
                tenant_id: testTenant.id,
                metric_type: 'comprehensive',
                period: period,
                metric_data: {
                    tenant_id: testTenant.id,
                    period_type: period,
                    total_revenue: monthlyRevenue,
                    total_conversations: totalConversations,
                    calculated_at: new Date().toISOString()
                },
                metricas_validadas: mockValidatedMetrics,
                calculated_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            
        if (error) {
            console.log(`❌ Erro na inserção: ${error.message}`);
            console.log('Details:', error);
        } else {
            console.log('✅ Métricas inseridas com sucesso!');
        }
        
        // 5. Verificar se foi salvo corretamente
        console.log('\n🔍 Verificando se foi salvo corretamente...');
        
        const { data: savedMetric } = await client
            .from('tenant_metrics')
            .select('metric_type, period, metricas_validadas, calculated_at')
            .eq('tenant_id', testTenant.id)
            .eq('metric_type', 'comprehensive')
            .eq('period', period)
            .order('calculated_at', { ascending: false })
            .limit(1)
            .single();
            
        if (savedMetric) {
            const hasValidated = savedMetric.metricas_validadas && 
                               Object.keys(savedMetric.metricas_validadas).length > 0;
            console.log('✅ Métrica encontrada:');
            console.log(`   - Tipo: ${savedMetric.metric_type}`);
            console.log(`   - Período: ${savedMetric.period}`);
            console.log(`   - Data: ${new Date(savedMetric.calculated_at).toLocaleString('pt-BR')}`);
            console.log(`   - metricas_validadas: ${hasValidated ? '✅ POPULADO' : '❌ VAZIO'}`);
            
            if (hasValidated) {
                const keys = Object.keys(savedMetric.metricas_validadas);
                console.log(`   - Chaves: ${keys.length} (${keys.slice(0,3).join(', ')}...)`);
                console.log(`   - Monthly Revenue: ${savedMetric.metricas_validadas.monthly_revenue}`);
            }
        } else {
            console.log('❌ Métrica não encontrada após inserção');
        }
        
    } catch (error) {
        console.log(`❌ Erro geral: ${error.message}`);
        console.log('Stack:', error.stack?.split('\n').slice(0,5).join('\n'));
    }
}

testManualMetricsExecution().catch(console.error);