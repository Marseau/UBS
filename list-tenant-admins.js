require('dotenv').config();
const { getAdminClient } = require('./dist/config/database');

async function listTenantAdmins() {
    console.log('🔍 LISTANDO TENANT ADMINS...');
    console.log('============================\n');
    
    try {
        const adminClient = getAdminClient();
        
        // Buscar admin users com role tenant_admin
        const { data: tenantAdmins, error } = await adminClient
            .from('admin_users')
            .select(`
                id,
                email,
                role,
                tenant_id,
                created_at
            `)
            .eq('role', 'tenant_admin')
            .limit(10);
            
        if (error) {
            console.error('❌ Erro ao buscar tenant admins:', error);
            return;
        }
        
        if (!tenantAdmins || tenantAdmins.length === 0) {
            console.log('❌ Nenhum tenant admin encontrado no sistema');
            console.log('💡 Você pode criar um com o script generate-sample-dashboard-data.js');
            return;
        }
        
        console.log(`✅ Encontrados ${tenantAdmins.length} tenant admins:`);
        console.log('='.repeat(60));
        
        tenantAdmins.forEach((admin, index) => {
            console.log(`${index + 1}. Email: ${admin.email}`);
            console.log(`   Role: ${admin.role}`);
            console.log(`   Tenant ID: ${admin.tenant_id}`);
            console.log(`   Criado em: ${new Date(admin.created_at).toLocaleDateString('pt-BR')}`);
            console.log('');
        });
        
        // Buscar dados dos tenants correspondentes
        if (tenantAdmins.length > 0) {
            const tenantIds = tenantAdmins.map(admin => admin.tenant_id).filter(Boolean);
            
            if (tenantIds.length > 0) {
                const { data: tenants } = await adminClient
                    .from('tenants')
                    .select('id, business_name, slug')
                    .in('id', tenantIds);
                    
                if (tenants && tenants.length > 0) {
                    console.log('🏢 DADOS DOS TENANTS:');
                    console.log('='.repeat(60));
                    tenants.forEach((tenant, index) => {
                        console.log(`${index + 1}. Nome: ${tenant.business_name}`);
                        console.log(`   Slug: ${tenant.slug}`);
                        console.log(`   ID: ${tenant.id}`);
                        console.log('');
                    });
                }
            }
        }
        
        console.log('💡 Para testar login use: [email acima] com senha: Admin123');
        
    } catch (error) {
        console.error('❌ Erro geral:', error);
    }
}

listTenantAdmins();