const TenantMetricsCronService = require('./dist/services/tenant-metrics-cron.service.js').TenantMetricsCronService;
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testarExatamenteOServico() {
    console.log('🔍 TESTANDO EXATAMENTE O QUE O SERVIÇO FAZ');
    console.log('='.repeat(70));
    
    const service = new TenantMetricsCronService();
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // 1. Testar getActiveTenants() exatamente como no código
    console.log('📊 ETAPA 1: getActiveTenants() - FILTRO EXATO DO CÓDIGO');
    
    const { data: tenants, error } = await client
        .from('tenants')
        .select('id, business_name')
        .eq('status', 'active')
        .order('created_at', { ascending: true });
        
    console.log('   Filtro aplicado: status = active');
    console.log('   Tenants encontrados:', tenants ? tenants.length : 0);
    console.log('   Erro:', error ? error.message : 'Nenhum');
    
    if (!tenants || tenants.length === 0) {
        console.log('   🚨 PROBLEMA ENCONTRADO! Nenhum tenant com status=active!');
        
        // Vamos ver quais status existem
        const { data: allTenants } = await client
            .from('tenants')
            .select('id, business_name, status')
            .limit(10);
            
        console.log('   📋 Status dos tenants no banco:');
        if (allTenants) {
            allTenants.forEach(t => {
                console.log('     -', t.business_name, '| status:', t.status);
            });
        }
        
    } else {
        console.log('   ✅ Tenants ativos encontrados!');
        tenants.forEach(t => {
            console.log('     -', t.id.substring(0,8), '|', t.business_name);
        });
        
        // 2. Agora vamos executar o serviço REAL
        console.log('\n📊 ETAPA 2: EXECUTANDO SERVIÇO REAL');
        console.log('   🔄 Chamando executeHistoricalMetricsCalculation()...');
        
        try {
            await service.executeHistoricalMetricsCalculation();
            
            // Verificar se inseriu dados
            const { count } = await client.from('tenant_metrics').select('*', { count: 'exact', head: true });
            console.log('   📊 Registros após execução do serviço:', count || 0);
            
            if (count && count > 0) {
                console.log('   ✅ SERVIÇO FUNCIONOU! Dados inseridos!');
            } else {
                console.log('   ❌ SERVIÇO NÃO INSERIU DADOS!');
            }
            
        } catch (serviceError) {
            console.log('   ❌ ERRO NO SERVIÇO:', serviceError.message);
        }
    }
    
    console.log('='.repeat(70));
}

testarExatamenteOServico().then(() => process.exit(0)).catch(console.error);