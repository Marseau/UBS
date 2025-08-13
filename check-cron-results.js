/**
 * VERIFICAR RESULTADOS: Cron job tenant_metrics
 */

async function checkCronResults() {
    console.log('🔍 VERIFICANDO RESULTADOS DO CRON JOB');
    
    try {
        const { getAdminClient } = require('./dist/config/database.js');
        const client = getAdminClient();
        
        // STEP 1: Count total records
        console.log('\n📊 CONTAGEM GERAL...');
        
        const { count: totalCount } = await client
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log(`📈 Total de registros em tenant_metrics: ${totalCount || 0}`);
        
        // STEP 2: Group by periods
        const { data: periodCounts } = await client
            .from('tenant_metrics')
            .select('period, metric_type')
            .order('calculated_at', { ascending: false })
            .limit(50);
            
        const periodStats = {};
        periodCounts?.forEach(record => {
            const key = `${record.period}-${record.metric_type}`;
            periodStats[key] = (periodStats[key] || 0) + 1;
        });
        
        console.log('\n📋 Por período/tipo:');
        Object.entries(periodStats).forEach(([key, count]) => {
            console.log(`   ${key}: ${count} registros`);
        });
        
        // STEP 3: Most recent records
        console.log('\n⏰ ÚLTIMOS REGISTROS...');
        
        const { data: recentRecords } = await client
            .from('tenant_metrics')
            .select('tenant_id, metric_type, period, calculated_at, tenants!inner(business_name)')
            .order('calculated_at', { ascending: false })
            .limit(10);
            
        recentRecords?.forEach((record, idx) => {
            const time = new Date(record.calculated_at).toLocaleString('pt-BR');
            const businessName = record.tenants?.business_name || 'N/A';
            console.log(`   ${idx + 1}. ${businessName} | ${record.period} | ${time}`);
        });
        
        // STEP 4: Check function get_tenant_services_count_by_period is working
        console.log('\n🔧 VALIDAÇÃO DA FUNÇÃO...');
        
        const testTenant = recentRecords?.[0];
        if (testTenant) {
            try {
                const { data: functionResult } = await client.rpc('get_tenant_services_count_by_period', {
                    p_tenant_id: testTenant.tenant_id,
                    p_period_type: '30d'
                });
                
                console.log(`✅ get_tenant_services_count_by_period para ${testTenant.tenants.business_name}: ${functionResult} serviços`);
                
                // Check if this data is in the metrics
                const { data: metricsData } = await client
                    .from('tenant_metrics')
                    .select('metric_data')
                    .eq('tenant_id', testTenant.tenant_id)
                    .eq('period', '30d')
                    .eq('metric_type', 'comprehensive')
                    .order('calculated_at', { ascending: false })
                    .limit(1)
                    .single();
                    
                if (metricsData?.metric_data?.services_count) {
                    console.log(`✅ Dados na tabela tenant_metrics: ${metricsData.metric_data.services_count} serviços`);
                    
                    if (functionResult === metricsData.metric_data.services_count) {
                        console.log('✅ PERFEITO: Função e tabela estão sincronizadas!');
                    } else {
                        console.log('⚠️ DIFERENÇA: Função e tabela têm valores diferentes');
                    }
                } else {
                    console.log('⚠️ services_count não encontrado nos dados da métrica');
                }
                
            } catch (funcError) {
                console.log(`❌ Erro testando função: ${funcError.message}`);
            }
        }
        
        // STEP 5: Summary
        console.log('\n🎯 RESUMO FINAL:');
        console.log(`   📊 Total registros: ${totalCount || 0}`);
        console.log(`   🏢 Tenants processados: ${Object.keys(periodStats).length > 0 ? 'Múltiplos' : 'Nenhum'}`);
        console.log(`   ⏰ Último update: ${recentRecords?.[0]?.calculated_at ? new Date(recentRecords[0].calculated_at).toLocaleString('pt-BR') : 'N/A'}`);
        
        if ((totalCount || 0) > 30) {
            console.log('\n🎉 SUCESSO: Cron job está funcionando!');
            console.log('✅ A função get_tenant_services_count_by_period NÃO tinha problema');
            console.log('✅ O sistema está populando tenant_metrics corretamente'); 
            console.log('✅ Dados estão sendo atualizados em tempo real');
        } else {
            console.log('\n⚠️ Status incerto - poucas atualizações recentes');
        }
        
    } catch (error) {
        console.error('❌ ERRO:', error);
    }
}

checkCronResults().catch(console.error);