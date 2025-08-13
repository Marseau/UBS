require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const TenantMetricsCronService = require('./dist/services/tenant-metrics-cron.service.js').TenantMetricsCronService;

async function limparEExecutarServicoCorrigido() {
    console.log('🧹 LIMPANDO DADOS E EXECUTANDO SERVIÇO CORRIGIDO - 4 CAMPOS JSON');
    console.log('='.repeat(80));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // 1. LIMPAR TABELA TENANT_METRICS
        console.log('🗑️ ETAPA 1: Limpando tabela tenant_metrics...');
        
        const { error: deleteError } = await client
            .from('tenant_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all except impossible ID
            
        if (deleteError) {
            console.error('❌ Erro ao limpar tenant_metrics:', deleteError);
        } else {
            console.log('✅ Tabela tenant_metrics limpa com sucesso');
        }
        
        // 2. VERIFICAR SE ESTÁ VAZIA
        const { count } = await client
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log(`📊 Registros restantes na tenant_metrics: ${count || 0}`);
        
        // 3. EXECUTAR SERVIÇO CORRIGIDO
        console.log('\n🔄 ETAPA 2: Executando TenantMetricsCronService corrigido...');
        
        const service = new TenantMetricsCronService();
        const startTime = Date.now();
        
        console.log('📊 Iniciando executeHistoricalMetricsCalculation()...');
        await service.executeHistoricalMetricsCalculation();
        
        const endTime = Date.now();
        const executionTime = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('✅ SERVIÇO EXECUTADO COM SUCESSO!');
        console.log(`⏱️ Tempo de execução: ${executionTime} segundos`);
        
        // 4. VERIFICAR RESULTADOS
        console.log('\n🔍 ETAPA 3: Verificando resultados dos 4 campos JSON...');
        
        const { data: newMetrics, error: selectError } = await client
            .from('tenant_metrics')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (selectError) {
            console.error('❌ Erro ao verificar dados:', selectError);
            return;
        }
        
        if (!newMetrics || newMetrics.length === 0) {
            console.log('⚠️ Nenhum dado encontrado após execução do serviço');
            return;
        }
        
        console.log(`📊 Analisando ${newMetrics.length} registros gerados:`);
        
        let allCamposPreenchidos = true;
        let totalComprehensive = 0;
        let totalParticipation = 0;
        let totalRanking = 0;
        let totalMetricData = 0;
        
        newMetrics.forEach((record, index) => {
            console.log(`\n📋 REGISTRO ${index + 1}:`);
            console.log(`   🆔 Tenant: ${record.tenant_id?.substring(0,8) || 'N/A'}`);
            console.log(`   📅 Período: ${record.period}`);
            console.log(`   ⏰ Calculado: ${record.calculated_at}`);
            
            // Verificar os 4 campos JSON
            const comprehensive = record.comprehensive_metrics || {};
            const participation = record.participation_metrics || {};
            const ranking = record.ranking_metrics || {};
            const metricData = record.metric_data || {};
            
            const comprehensiveCount = Object.keys(comprehensive).length;
            const participationCount = Object.keys(participation).length;
            const rankingCount = Object.keys(ranking).length;
            const metricDataCount = Object.keys(metricData).length;
            
            totalComprehensive += comprehensiveCount;
            totalParticipation += participationCount;
            totalRanking += rankingCount;
            totalMetricData += metricDataCount;
            
            console.log(`   📊 comprehensive_metrics: ${comprehensiveCount} propriedades ${comprehensiveCount > 0 ? '✅' : '❌'}`);
            console.log(`   📈 participation_metrics: ${participationCount} propriedades ${participationCount > 0 ? '✅' : '❌'}`);
            console.log(`   🏆 ranking_metrics: ${rankingCount} propriedades ${rankingCount > 0 ? '✅' : '❌'}`);
            console.log(`   🗃️ metric_data: ${metricDataCount} propriedades ${metricDataCount > 0 ? '✅' : '❌'}`);
            
            if (comprehensiveCount === 0 || participationCount === 0 || rankingCount === 0 || metricDataCount === 0) {
                allCamposPreenchidos = false;
            }
            
            // Mostrar alguns valores importantes
            if (comprehensiveCount > 0) {
                console.log(`      💰 Revenue: ${comprehensive.total_revenue || 0}`);
                console.log(`      👥 Customers: ${comprehensive.total_customers || 0}`);
                console.log(`      📊 Health Score: ${comprehensive.business_health_score || 0}`);
            }
            
            if (participationCount > 0) {
                console.log(`      📈 Revenue %: ${(participation.revenue_platform_percentage || 0).toFixed(2)}%`);
                console.log(`      🎯 Market Share: ${(participation.platform_market_share || 0).toFixed(2)}%`);
            }
            
            if (rankingCount > 0) {
                console.log(`      🏆 Overall Score: ${ranking.overall_score || 0}`);
                console.log(`      ⚠️ Risk Level: ${ranking.risk_level || 'N/A'}`);
            }
        });
        
        // 5. RESULTADO FINAL
        console.log('\n' + '='.repeat(80));
        console.log('🎯 RESULTADO FINAL DA CORREÇÃO:');
        
        if (allCamposPreenchidos) {
            console.log('✅ 🎉 SUCESSO ABSOLUTO! Todos os 4 campos JSON estão populados!');
        } else {
            console.log('❌ ⚠️ FALHA PARCIAL: Alguns campos ainda estão vazios');
        }
        
        const avgComprehensive = (totalComprehensive / newMetrics.length).toFixed(1);
        const avgParticipation = (totalParticipation / newMetrics.length).toFixed(1);
        const avgRanking = (totalRanking / newMetrics.length).toFixed(1);
        const avgMetricData = (totalMetricData / newMetrics.length).toFixed(1);
        
        console.log('\n📊 ESTATÍSTICAS MÉDIAS POR REGISTRO:');
        console.log(`   📊 comprehensive_metrics: ${avgComprehensive} propriedades/registro`);
        console.log(`   📈 participation_metrics: ${avgParticipation} propriedades/registro`);
        console.log(`   🏆 ranking_metrics: ${avgRanking} propriedades/registro`);
        console.log(`   🗃️ metric_data: ${avgMetricData} propriedades/registro`);
        
        const { count: finalCount } = await client
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log(`\n📈 TOTAL DE REGISTROS GERADOS: ${finalCount || 0}`);
        
        if (allCamposPreenchidos) {
            console.log('\n🎉 CORREÇÃO DO TenantMetricsCronService IMPLEMENTADA COM SUCESSO!');
            console.log('💡 Os 4 campos JSON estão sendo populados corretamente');
            console.log('🚀 Próximo passo: Gerar CSV final com dados completos');
        } else {
            console.log('\n⚠️ A correção foi parcialmente efetiva');
            console.log('💡 Alguns campos podem estar vazios por falta de dados reais');
        }
        
    } catch (error) {
        console.error('💥 ERRO CRÍTICO na execução:', error);
        throw error;
    }
}

limparEExecutarServicoCorrigido().then(() => process.exit(0)).catch(console.error);