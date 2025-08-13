require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function verificar4CamposJSON() {
    console.log('🔍 VERIFICANDO OS 4 CAMPOS JSON NAS DUAS TABELAS');
    console.log('='.repeat(70));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // Verificar tenant_metrics
        const { data: tenantSample, error: tenantError } = await client
            .from('tenant_metrics')
            .select('tenant_id, period, comprehensive_metrics, participation_metrics, ranking_metrics, metric_data')
            .limit(1);
        
        if (tenantError) {
            console.error('❌ Erro ao buscar tenant_metrics:', tenantError);
            return;
        }
        
        console.log('📊 TENANT_METRICS:');
        if (tenantSample && tenantSample[0]) {
            const sample = tenantSample[0];
            console.log(`   Tenant: ${sample.tenant_id?.substring(0,8)} | Período: ${sample.period}`);
            console.log('   ✅ comprehensive_metrics:', sample.comprehensive_metrics ? `${Object.keys(sample.comprehensive_metrics).length} campos` : 'VAZIO');
            console.log('   ✅ participation_metrics:', sample.participation_metrics ? `${Object.keys(sample.participation_metrics).length} campos` : 'VAZIO');
            console.log('   ✅ ranking_metrics:', sample.ranking_metrics ? `${Object.keys(sample.ranking_metrics).length} campos` : 'VAZIO');
            console.log('   ✅ metric_data:', sample.metric_data ? `${Object.keys(sample.metric_data).length} campos` : 'VAZIO');
        } else {
            console.log('   ❌ Nenhum registro encontrado');
        }
        
        // Verificar platform_metrics  
        const { data: platformSample, error: platformError } = await client
            .from('platform_metrics')
            .select('period, comprehensive_metrics, participation_metrics, ranking_metrics, metric_data')
            .limit(1);
            
        if (platformError) {
            console.error('❌ Erro ao buscar platform_metrics:', platformError);
            return;
        }
        
        console.log('\n🌐 PLATFORM_METRICS:');
        if (platformSample && platformSample[0]) {
            const sample = platformSample[0];
            console.log(`   Período: ${sample.period}`);
            console.log('   ✅ comprehensive_metrics:', sample.comprehensive_metrics ? `${Object.keys(sample.comprehensive_metrics).length} campos` : 'VAZIO');
            console.log('   ✅ participation_metrics:', sample.participation_metrics ? `${Object.keys(sample.participation_metrics).length} campos` : 'VAZIO');
            console.log('   ✅ ranking_metrics:', sample.ranking_metrics ? `${Object.keys(sample.ranking_metrics).length} campos` : 'VAZIO');
            console.log('   ✅ metric_data:', sample.metric_data ? `${Object.keys(sample.metric_data).length} campos` : 'VAZIO');
        } else {
            console.log('   ❌ Nenhum registro encontrado');
        }
        
        // Contar registros totais
        const { count: tenantCount } = await client
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        const { count: platformCount } = await client
            .from('platform_metrics')
            .select('*', { count: 'exact', head: true });
        
        console.log('\n📊 RESUMO:');
        console.log(`   📈 tenant_metrics: ${tenantCount || 0} registros`);
        console.log(`   🌐 platform_metrics: ${platformCount || 0} registros`);
        console.log('\n✅ CONCLUSÃO: Ambas as tabelas têm os 4 campos JSON!');
        console.log('   📊 tenant_metrics: dados individuais por tenant');
        console.log('   🌐 platform_metrics: agregação dos dados dos tenants');
        
    } catch (error) {
        console.error('💥 Erro na verificação:', error);
    }
}

verificar4CamposJSON()
    .then(() => process.exit(0))
    .catch(console.error);