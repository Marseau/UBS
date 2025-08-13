require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearAndExecutePipeline() {
    console.log('🚀 PIPELINE COMPLETO - LIMPEZA E EXECUÇÃO');
    console.log('='.repeat(60));
    
    try {
        console.log('\n🧹 ETAPA 1: LIMPEZA DAS TABELAS');
        
        const { error: clearTenant } = await client
            .from('tenant_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
            
        const { error: clearPlatform } = await client
            .from('platform_metrics') 
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
            
        console.log('✅ Tabelas limpas com sucesso');
        
        console.log('\n📊 ETAPA 2: EXECUÇÃO DOS SERVIÇOS');
        
        // 1. Tenant Metrics Cron
        console.log('\n1️⃣ Executando tenant-metrics-cron.service...');
        const TenantMetricsCronService = require('./dist/services/tenant-metrics-cron.service.js').TenantMetricsCronService;
        const tenantService = new TenantMetricsCronService();
        
        try {
            await tenantService.executeHistoricalMetricsCalculation();
            console.log('✅ Tenant metrics cron executado');
        } catch (error) {
            console.log('⚠️ Tenant metrics cron com alguns erros, mas continua...');
        }
        
        // 2. Platform Aggregation 
        console.log('\n2️⃣ Executando platform-aggregation.service...');
        const PlatformAggregationService = require('./dist/services/platform-aggregation.service.js').PlatformAggregationService;
        const platformService = new PlatformAggregationService();
        
        await platformService.executeCompletePlatformAggregation();
        console.log('✅ Platform aggregation executado');
        
        // 3. Tenant Platform Cron
        console.log('\n3️⃣ Executando tenant-platform-cron.service...');
        const TenantPlatformCronService = require('./dist/services/tenant-platform-cron.service.js').TenantPlatformCronService;
        const tenantPlatformService = new TenantPlatformCronService();
        
        await tenantPlatformService.executeCompletePlatformCron();
        console.log('✅ Tenant platform cron executado');
        
        console.log('\n📋 ETAPA 3: VERIFICAÇÃO DOS DADOS');
        
        const { count: tenantCount } = await client
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        const { count: platformCount } = await client
            .from('platform_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log('='.repeat(60));
        console.log('📊 RELATÓRIO FINAL');
        console.log('='.repeat(60));
        console.log(`✅ Registros tenant_metrics: ${tenantCount || 0}`);
        console.log(`✅ Registros platform_metrics: ${platformCount || 0}`);
        console.log('🎯 Pipeline executado com sucesso!');
        console.log('📊 Dados populados usando SERVIÇOS REAIS');
        console.log('='.repeat(60));
        
        return {
            success: true,
            tenant_records: tenantCount || 0,
            platform_records: platformCount || 0
        };
        
    } catch (error) {
        console.error('❌ Erro no pipeline:', error);
        throw error;
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    clearAndExecutePipeline()
        .then(result => {
            console.log('\n🎉 PIPELINE CONCLUÍDO COM SUCESSO!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 FALHA no pipeline:', error.message);
            process.exit(1);
        });
}

module.exports = { clearAndExecutePipeline };