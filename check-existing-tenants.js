const { supabaseAdmin } = require('./dist/config/database');

async function checkTenants() {
    try {
        console.log('🔍 Verificando tenants existentes no banco...');
        
        // Buscar todos os tenants
        const { data: allTenants, error } = await supabaseAdmin
            .from('tenants')
            .select('id, business_name, domain, account_type')
            .order('domain');
            
        if (error) {
            console.error('❌ Erro ao buscar tenants:', error);
            return;
        }
        
        console.log(`📊 Total de tenants encontrados: ${allTenants.length}`);
        
        // Agrupar por domínio
        const byDomain = {};
        allTenants.forEach(tenant => {
            if (!byDomain[tenant.domain]) {
                byDomain[tenant.domain] = [];
            }
            byDomain[tenant.domain].push(tenant);
        });
        
        console.log('\n📋 Tenants por domínio:');
        Object.entries(byDomain).forEach(([domain, tenants]) => {
            console.log(`\n${domain.toUpperCase()}: ${tenants.length} tenants`);
            tenants.forEach((tenant, index) => {
                console.log(`   ${index + 1}. ${tenant.business_name} (${tenant.account_type})`);
                console.log(`      ID: ${tenant.id}`);
            });
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

checkTenants();