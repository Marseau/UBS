require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function investigarPorqueServicosNaoLeemDadosReais() {
    console.log('🔍 INVESTIGANDO POR QUE OS SERVIÇOS NÃO LEEM DADOS REAIS');
    console.log('='.repeat(80));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        console.log('📊 TESTANDO QUERIES QUE OS SERVIÇOS DEVERIAM EXECUTAR:');
        console.log('='.repeat(80));
        
        // 1. Testar query de appointments por tenant (como o serviço deveria fazer)
        console.log('📅 TESTE 1: Buscar appointments por tenant (últimos 90 dias)');
        
        const startDate90d = new Date();
        startDate90d.setDate(startDate90d.getDate() - 90);
        
        const { data: appointmentsByTenant, error: aptError } = await client
            .from('appointments')
            .select(`
                tenant_id,
                status,
                quoted_price,
                currency,
                created_at,
                start_time
            `)
            .gte('created_at', startDate90d.toISOString())
            .order('created_at', { ascending: false });
            
        if (aptError) {
            console.log('❌ ERRO na query de appointments:', aptError);
        } else {
            console.log(`✅ ${appointmentsByTenant?.length || 0} appointments encontrados nos últimos 90 dias`);
            
            // Agrupar por tenant_id
            const appointmentsByTenantGroup = {};
            appointmentsByTenant?.forEach(apt => {
                if (!appointmentsByTenantGroup[apt.tenant_id]) {
                    appointmentsByTenantGroup[apt.tenant_id] = [];
                }
                appointmentsByTenantGroup[apt.tenant_id].push(apt);
            });
            
            console.log('📋 APPOINTMENTS POR TENANT:');
            Object.keys(appointmentsByTenantGroup).forEach(tenantId => {
                const apts = appointmentsByTenantGroup[tenantId];
                const totalRevenue = apts.reduce((sum, apt) => sum + (apt.quoted_price || 0), 0);
                const confirmed = apts.filter(a => a.status === 'confirmed').length;
                const cancelled = apts.filter(a => a.status === 'cancelled').length;
                const completed = apts.filter(a => a.status === 'completed').length;
                
                console.log(`   🏢 ${tenantId.substring(0,8)}: ${apts.length} appointments | R$ ${totalRevenue} | Conf:${confirmed} Canc:${cancelled} Comp:${completed}`);
            });
        }
        
        // 2. Testar query de conversations por tenant
        console.log('\n💬 TESTE 2: Buscar conversations por tenant (últimos 90 dias)');
        
        const { data: conversationsByTenant, error: convError } = await client
            .from('conversation_history')
            .select(`
                tenant_id,
                intent_detected,
                conversation_outcome,
                api_cost_usd,
                created_at
            `)
            .gte('created_at', startDate90d.toISOString())
            .order('created_at', { ascending: false });
            
        if (convError) {
            console.log('❌ ERRO na query de conversations:', convError);
        } else {
            console.log(`✅ ${conversationsByTenant?.length || 0} conversations encontradas nos últimos 90 dias`);
            
            // Agrupar por tenant_id
            const conversationsByTenantGroup = {};
            conversationsByTenant?.forEach(conv => {
                if (!conversationsByTenantGroup[conv.tenant_id]) {
                    conversationsByTenantGroup[conv.tenant_id] = [];
                }
                conversationsByTenantGroup[conv.tenant_id].push(conv);
            });
            
            console.log('📋 CONVERSATIONS POR TENANT:');
            Object.keys(conversationsByTenantGroup).forEach(tenantId => {
                const convs = conversationsByTenantGroup[tenantId];
                const totalCost = convs.reduce((sum, conv) => sum + (conv.api_cost_usd || 0), 0);
                const withIntent = convs.filter(c => c.intent_detected).length;
                
                console.log(`   🏢 ${tenantId.substring(0,8)}: ${convs.length} conversations | $${totalCost.toFixed(4)} | Intent:${withIntent}`);
            });
        }
        
        // 3. Verificar se os tenant_ids nas métricas correspondem aos dados reais
        console.log('\n🔍 TESTE 3: Comparar tenant_ids nas métricas vs dados reais');
        
        const { data: metricsData } = await client
            .from('tenant_metrics')
            .select('tenant_id')
            .order('created_at', { ascending: false })
            .limit(10);
            
        const { data: tenantsData } = await client
            .from('tenants')
            .select('id, name');
            
        console.log('📊 TENANT_IDs NAS MÉTRICAS:');
        const metricsTenantIds = [...new Set(metricsData?.map(m => m.tenant_id) || [])];
        metricsTenantIds.forEach(id => {
            const tenant = tenantsData?.find(t => t.id === id);
            const hasAppointments = Object.keys(appointmentsByTenantGroup).includes(id);
            const hasConversations = Object.keys(conversationsByTenantGroup).includes(id);
            
            console.log(`   🏢 ${id.substring(0,8)}: ${tenant?.name || 'Unknown'} | Apt:${hasAppointments ? '✅' : '❌'} Conv:${hasConversations ? '✅' : '❌'}`);
        });
        
        // 4. DIAGNÓSTICO FINAL
        console.log('\n' + '='.repeat(80));
        console.log('🎯 DIAGNÓSTICO: POR QUE AS MÉTRICAS ESTÃO VAZIAS?');
        
        const tenantsWithData = Object.keys(appointmentsByTenantGroup);
        const tenantsWithMetrics = metricsTenantIds;
        
        console.log(`📊 Tenants com appointments REAIS: ${tenantsWithData.length}`);
        console.log(`📈 Tenants com métricas calculadas: ${tenantsWithMetrics.length}`);
        
        const mismatch = tenantsWithMetrics.filter(id => !tenantsWithData.includes(id));
        const missing = tenantsWithData.filter(id => !tenantsWithMetrics.includes(id));
        
        if (mismatch.length > 0) {
            console.log('❌ PROBLEMA: Tenants nas métricas SEM dados reais:');
            mismatch.forEach(id => console.log(`   - ${id.substring(0,8)}`));
        }
        
        if (missing.length > 0) {
            console.log('⚠️ OPORTUNIDADE: Tenants com dados reais SEM métricas:');
            missing.forEach(id => {
                const tenant = tenantsData?.find(t => t.id === id);
                console.log(`   - ${id.substring(0,8)}: ${tenant?.name || 'Unknown'}`);
            });
        }
        
        console.log('\n🔧 SOLUÇÃO IDENTIFICADA:');
        if (tenantsWithData.length > 0 && tenantsWithMetrics.length > 0) {
            console.log('✅ Existem dados reais E tenants nas métricas');
            console.log('💡 O serviço precisa ser corrigido para ler os dados reais corretamente');
            console.log('🎯 Próximo passo: Verificar as queries nos serviços de métricas');
        } else {
            console.log('❌ Há incompatibilidade entre dados e métricas');
        }
        
    } catch (error) {
        console.error('💥 Erro na investigação:', error);
    }
}

investigarPorqueServicosNaoLeemDadosReais().then(() => process.exit(0)).catch(console.error);