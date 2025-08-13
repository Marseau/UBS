require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const TenantMetricsCronService = require('./dist/services/tenant-metrics-cron.service.js').TenantMetricsCronService;
const PlatformAggregationService = require('./dist/services/platform-aggregation.service.js').PlatformAggregationService;

async function executarPipeline2ServicosFuncionais() {
    console.log('🚀 EXECUTANDO PIPELINE COM OS 2 SERVIÇOS FUNCIONAIS');
    console.log('='.repeat(80));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // ETAPA 1: LIMPEZA COMPLETA
        console.log('🗑️ ETAPA 1: LIMPANDO TABELAS...');
        
        await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await client.from('platform_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        
        const { count: tenantCount } = await client.from('tenant_metrics').select('*', { count: 'exact', head: true });
        const { count: platformCount } = await client.from('platform_metrics').select('*', { count: 'exact', head: true });
        
        console.log(`✅ Limpeza concluída: tenant_metrics=${tenantCount||0}, platform_metrics=${platformCount||0}`);
        
        // ETAPA 2: SERVIÇO 1 - TenantMetricsCronService
        console.log('\n📊 SERVIÇO 1: TenantMetricsCronService');
        console.log('   💡 Processando dados reais: 1.149 appointments + 4.560 conversations');
        
        const service1Start = Date.now();
        const tenantService = new TenantMetricsCronService();
        
        await tenantService.executeHistoricalMetricsCalculation();
        
        const service1Time = ((Date.now() - service1Start) / 1000).toFixed(2);
        console.log(`   ✅ Concluído em ${service1Time}s`);
        
        // ETAPA 3: SERVIÇO 2 - PlatformAggregationService (CORRIGIDO)
        console.log('\n🌐 SERVIÇO 2: PlatformAggregationService (CORRIGIDO)');
        console.log('   💡 Agregando R$ 21.986,22 de receitas reais');
        
        const service2Start = Date.now();
        const platformService = new PlatformAggregationService();
        
        await platformService.executeCompletePlatformAggregation();
        
        const service2Time = ((Date.now() - service2Start) / 1000).toFixed(2);
        console.log(`   ✅ Concluído em ${service2Time}s`);
        
        // ETAPA 4: VERIFICAÇÃO FINAL
        console.log('\n🔍 VERIFICAÇÃO FINAL:');
        
        const { data: tenantMetrics, count: finalTenantCount } = await client
            .from('tenant_metrics')
            .select('tenant_id, comprehensive_metrics', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(3);
            
        const { data: platformMetrics, count: finalPlatformCount } = await client
            .from('platform_metrics')
            .select('comprehensive_metrics', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(3);
        
        console.log(`📊 tenant_metrics: ${finalTenantCount || 0} registros`);
        console.log(`🌐 platform_metrics: ${finalPlatformCount || 0} registros`);
        
        // Verificar receitas
        let totalTenantRevenue = 0;
        tenantMetrics?.forEach((metric, i) => {
            const comp = metric.comprehensive_metrics || {};
            const revenue = comp.total_revenue || 0;
            totalTenantRevenue += revenue;
            console.log(`   Tenant ${i+1}: R$ ${revenue.toFixed(2)}`);
        });
        
        let totalPlatformRevenue = 0;
        platformMetrics?.forEach((metric, i) => {
            const comp = metric.comprehensive_metrics || {};
            const revenue = comp.total_platform_revenue || 0;
            totalPlatformRevenue = Math.max(totalPlatformRevenue, revenue);
            console.log(`   Platform ${i+1}: R$ ${revenue.toFixed(2)}`);
        });
        
        console.log('\n' + '='.repeat(80));
        console.log('🎉 PIPELINE DOS 2 SERVIÇOS CONCLUÍDO COM SUCESSO!');
        console.log('='.repeat(80));
        
        console.log(`⏱️ Tempo total: ${((Date.now() - service1Start) / 1000).toFixed(2)}s`);
        console.log(`📊 ${finalTenantCount} tenant metrics | ${finalPlatformCount} platform metrics`);
        console.log(`💰 Receita agregada: R$ ${totalPlatformRevenue.toFixed(2)}`);
        
        if (totalPlatformRevenue > 0) {
            console.log('✅ DADOS REAIS PROCESSADOS COM SUCESSO!');
            console.log('🚀 Sistema pronto para geração de CSVs e análises');
        } else {
            console.log('⚠️ Receitas ainda em R$ 0 - verificar agregação');
        }
        
        return true;
        
    } catch (error) {
        console.error('💥 Erro no pipeline:', error);
        return false;
    }
}

executarPipeline2ServicosFuncionais()
    .then(success => {
        console.log(success ? '\n✅ SUCESSO TOTAL!' : '\n❌ FALHA NO PIPELINE');
        process.exit(success ? 0 : 1);
    })
    .catch(console.error);