const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function countTenants() {
    console.log('📊 Contando tenants no banco de dados...\n');
    
    try {
        // Contar tenants
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name, business_name, domain, status, created_at');
            
        if (error) throw error;
        
        console.log(`🏢 TOTAL DE TENANTS: ${tenants.length}\n`);
        
        if (tenants.length > 0) {
            console.log('📋 LISTA DE TENANTS:');
            console.log('='.repeat(80));
            
            tenants.forEach((tenant, index) => {
                console.log(`${index + 1}. ${tenant.business_name || tenant.name}`);
                console.log(`   - Domínio: ${tenant.domain}`);
                console.log(`   - Status: ${tenant.status}`);
                console.log(`   - Criado em: ${new Date(tenant.created_at).toLocaleDateString('pt-BR')}`);
                console.log('');
            });
            
            // Estatísticas por domínio
            const byDomain = {};
            const byStatus = {};
            
            tenants.forEach(tenant => {
                byDomain[tenant.domain] = (byDomain[tenant.domain] || 0) + 1;
                byStatus[tenant.status] = (byStatus[tenant.status] || 0) + 1;
            });
            
            console.log('📊 ESTATÍSTICAS POR DOMÍNIO:');
            console.log('-'.repeat(40));
            Object.entries(byDomain).forEach(([domain, count]) => {
                console.log(`   ${domain}: ${count} tenant(s)`);
            });
            
            console.log('\n📊 ESTATÍSTICAS POR STATUS:');
            console.log('-'.repeat(40));
            Object.entries(byStatus).forEach(([status, count]) => {
                console.log(`   ${status}: ${count} tenant(s)`);
            });
        } else {
            console.log('⚠️  Nenhum tenant encontrado no banco de dados.');
            console.log('💡 Execute o script de população de dados primeiro.');
        }
        
    } catch (error) {
        console.error('❌ Erro ao contar tenants:', error.message);
    }
}

countTenants(); 