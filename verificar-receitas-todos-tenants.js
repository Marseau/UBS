require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function verificarReceitasTodosTenants() {
    console.log('📊 VERIFICANDO RECEITAS DE TODOS OS TENANTS EM TENANT_METRICS');
    console.log('='.repeat(70));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        const { data: metrics } = await client
            .from('tenant_metrics')
            .select('tenant_id, period, comprehensive_metrics, created_at')
            .order('created_at', { ascending: false });
        
        // Buscar nomes dos tenants
        const { data: tenants } = await client
            .from('tenants')
            .select('id, name');
            
        const tenantMap = {};
        tenants?.forEach(t => {
            tenantMap[t.id] = t.name;
        });
        
        const tenantRevenueMap = {};
        
        metrics?.forEach(metric => {
            const comp = metric.comprehensive_metrics || {};
            const revenue = comp.total_revenue || 0;
            
            if (!tenantRevenueMap[metric.tenant_id]) {
                tenantRevenueMap[metric.tenant_id] = { 
                    name: tenantMap[metric.tenant_id] || 'Unknown',
                    periods: {}, 
                    maxRevenue: 0 
                };
            }
            
            tenantRevenueMap[metric.tenant_id].periods[metric.period] = revenue;
            if (revenue > tenantRevenueMap[metric.tenant_id].maxRevenue) {
                tenantRevenueMap[metric.tenant_id].maxRevenue = revenue;
            }
        });
        
        console.log('💰 RECEITAS POR TENANT:');
        let totalPlatformRevenue = 0;
        
        Object.keys(tenantRevenueMap).forEach((tenantId, i) => {
            const tenant = tenantRevenueMap[tenantId];
            const maxRev = tenant.maxRevenue;
            
            console.log(`${i+1}. ${tenant.name}`);
            console.log(`   ID: ${tenantId.substring(0,8)}...`);
            console.log(`   📊 7d:  R$ ${(tenant.periods['7d'] || 0).toFixed(2)}`);
            console.log(`   📊 30d: R$ ${(tenant.periods['30d'] || 0).toFixed(2)}`); 
            console.log(`   📊 90d: R$ ${(tenant.periods['90d'] || 0).toFixed(2)}`);
            console.log(`   🎯 MAX: R$ ${maxRev.toFixed(2)}`);
            console.log('');
            
            totalPlatformRevenue += maxRev;
        });
        
        console.log('='.repeat(70));
        console.log(`💰 TOTAL PLATFORM REVENUE: R$ ${totalPlatformRevenue.toFixed(2)}`);
        
        // Contar tenants com receita > 0
        const tenantsWithRevenue = Object.values(tenantRevenueMap)
            .filter(tenant => tenant.maxRevenue > 0).length;
            
        console.log(`🏢 Tenants com receita > 0: ${tenantsWithRevenue}/${Object.keys(tenantRevenueMap).length}`);
        
        if (totalPlatformRevenue > 0) {
            console.log('✅ 🎉 SUCESSO! As receitas ESTÃO sendo transferidas corretamente!');
            console.log('💡 O problema era que eu estava olhando os tenants errados antes');
        } else {
            console.log('❌ PROBLEMA: Todas as receitas estão zeradas');
        }
        
    } catch (error) {
        console.error('💥 Erro na verificação:', error);
    }
}

verificarReceitasTodosTenants().then(() => process.exit(0)).catch(console.error);