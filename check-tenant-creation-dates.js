/**
 * Verificar datas de criação dos tenants
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Erro: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTenantCreationDates() {
    try {
        console.log('📅 Verificando datas de criação dos tenants...');
        
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select(`
                id,
                name,
                business_name,
                subscription_plan,
                subscription_status,
                subscription_start_date,
                created_at,
                updated_at
            `)
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        
        console.log(`✅ Encontrados ${tenants.length} tenants\n`);
        
        console.log('📊 DATAS DE CRIAÇÃO DOS TENANTS:');
        console.log('='.repeat(80));
        
        tenants.forEach((tenant, index) => {
            const createdDate = new Date(tenant.created_at);
            const subscriptionStartDate = new Date(tenant.subscription_start_date);
            
            console.log(`${index + 1}. ${tenant.name}`);
            console.log(`   Criado em: ${createdDate.toLocaleString('pt-BR')}`);
            console.log(`   Assinatura iniciada: ${subscriptionStartDate.toLocaleString('pt-BR')}`);
            console.log(`   Plano: ${tenant.subscription_plan}`);
            console.log(`   Status: ${tenant.subscription_status}`);
            console.log('');
        });
        
        // Análise estatística
        const creationDates = tenants.map(t => new Date(t.created_at));
        const oldestCreation = new Date(Math.min(...creationDates));
        const newestCreation = new Date(Math.max(...creationDates));
        
        console.log('📈 ANÁLISE ESTATÍSTICA:');
        console.log('='.repeat(40));
        console.log(`Primeiro tenant criado: ${oldestCreation.toLocaleString('pt-BR')}`);
        console.log(`Último tenant criado: ${newestCreation.toLocaleString('pt-BR')}`);
        
        const timeDiff = newestCreation - oldestCreation;
        const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        console.log(`Período de criação: ${daysDiff} dias`);
        
        // Verificar se created_at e subscription_start_date são iguais
        console.log('\n🔍 COMPARAÇÃO DE DATAS:');
        console.log('='.repeat(40));
        
        let sameDate = 0;
        let differentDate = 0;
        
        tenants.forEach(tenant => {
            const created = new Date(tenant.created_at).toDateString();
            const subscriptionStart = new Date(tenant.subscription_start_date).toDateString();
            
            if (created === subscriptionStart) {
                sameDate++;
            } else {
                differentDate++;
                console.log(`${tenant.name}: Criado em ${created}, assinatura em ${subscriptionStart}`);
            }
        });
        
        console.log(`Tenants com datas iguais (created_at = subscription_start_date): ${sameDate}`);
        console.log(`Tenants com datas diferentes: ${differentDate}`);
        
        return tenants;
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        throw error;
    }
}

async function main() {
    try {
        console.log('📅 VERIFICAÇÃO DE DATAS DE CRIAÇÃO');
        console.log('='.repeat(50));
        
        await checkTenantCreationDates();
        
    } catch (error) {
        console.error('\n💥 ERRO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { checkTenantCreationDates };