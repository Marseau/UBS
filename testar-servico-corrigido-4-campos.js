require('dotenv').config();
const TenantMetricsCronService = require('./dist/services/tenant-metrics-cron.service.js').TenantMetricsCronService;

async function testarServicoCorrigido4Campos() {
    console.log('🎯 TESTANDO SERVIÇO CORRIGIDO - 4 CAMPOS JSON');
    console.log('='.repeat(80));
    
    try {
        console.log('📊 Inicializando TenantMetricsCronService corrigido...');
        const service = new TenantMetricsCronService();
        
        console.log('🔄 Executando executeHistoricalMetricsCalculation()...');
        console.log('   ⏰ Este processo pode demorar alguns minutos...');
        
        const startTime = Date.now();
        
        // Executar o método principal corrigido
        await service.executeHistoricalMetricsCalculation();
        
        const endTime = Date.now();
        const executionTime = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('✅ SERVIÇO EXECUTADO COM SUCESSO!');
        console.log(`⏱️ Tempo de execução: ${executionTime} segundos`);
        
        console.log('\n' + '='.repeat(80));
        console.log('🔍 VERIFICANDO RESULTADOS - 4 CAMPOS JSON POPULADOS');
        
        // Importar Supabase para verificar dados
        const { createClient } = require('@supabase/supabase-js');
        const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        // Buscar últimos registros para verificar se os 4 campos estão populados
        const { data: latestMetrics, error } = await client
            .from('tenant_metrics')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
            
        if (error) {
            console.error('❌ Erro ao verificar dados:', error);
            return;
        }
        
        if (!latestMetrics || latestMetrics.length === 0) {
            console.log('⚠️ Nenhum dado encontrado na tabela tenant_metrics');
            return;
        }
        
        console.log(`📊 Analisando ${latestMetrics.length} registros mais recentes:`);
        
        let allFieldsPopulated = true;
        let totalComprehensive = 0;
        let totalParticipation = 0; 
        let totalRanking = 0;
        let totalMetricData = 0;
        
        latestMetrics.forEach((record, index) => {
            console.log(`\n📋 REGISTRO ${index + 1}:`);
            console.log(`   🆔 Tenant: ${record.tenant_id?.substring(0,8) || 'N/A'}`);
            console.log(`   📅 Período: ${record.period}`);
            console.log(`   ⏰ Calculado em: ${record.calculated_at}`);
            
            // Verificar comprehensive_metrics
            const comprehensive = record.comprehensive_metrics || {};
            const comprehensiveCount = Object.keys(comprehensive).length;
            totalComprehensive += comprehensiveCount;
            console.log(`   📊 comprehensive_metrics: ${comprehensiveCount} propriedades`);
            
            if (comprehensiveCount > 0) {
                console.log(`      💰 Revenue: ${comprehensive.total_revenue || 0}`);
                console.log(`      📅 Appointments: ${comprehensive.total_appointments || 0}`);
                console.log(`      👥 Customers: ${comprehensive.total_customers || 0}`);
                console.log(`      📈 Health Score: ${comprehensive.business_health_score || 0}`);
            } else {
                console.log(`      ❌ VAZIO!`);
                allFieldsPopulated = false;
            }
            
            // Verificar participation_metrics
            const participation = record.participation_metrics || {};
            const participationCount = Object.keys(participation).length;
            totalParticipation += participationCount;
            console.log(`   📈 participation_metrics: ${participationCount} propriedades`);
            
            if (participationCount > 0) {
                console.log(`      💹 Revenue %: ${participation.revenue_platform_percentage || 0}%`);
                console.log(`      📊 Appointments %: ${participation.appointments_platform_percentage || 0}%`);
                console.log(`      👥 Customers %: ${participation.customers_platform_percentage || 0}%`);
            } else {
                console.log(`      ❌ VAZIO!`);
                allFieldsPopulated = false;
            }
            
            // Verificar ranking_metrics
            const ranking = record.ranking_metrics || {};
            const rankingCount = Object.keys(ranking).length;
            totalRanking += rankingCount;
            console.log(`   🏆 ranking_metrics: ${rankingCount} propriedades`);
            
            if (rankingCount > 0) {
                console.log(`      🎯 Overall Score: ${ranking.overall_score || 0}`);
                console.log(`      ⚠️ Risk Level: ${ranking.risk_level || 'N/A'}`);
                console.log(`      🏅 Position: ${ranking.competitive_position || 'N/A'}`);
            } else {
                console.log(`      ❌ VAZIO!`);
                allFieldsPopulated = false;
            }
            
            // Verificar metric_data
            const metricData = record.metric_data || {};
            const metricDataCount = Object.keys(metricData).length;
            totalMetricData += metricDataCount;
            console.log(`   🗃️ metric_data: ${metricDataCount} propriedades`);
            
            if (metricDataCount === 0) {
                console.log(`      ❌ VAZIO!`);
                allFieldsPopulated = false;
            }
        });
        
        // Resultado final
        console.log('\n' + '='.repeat(80));
        console.log('🎯 RESULTADO FINAL DA CORREÇÃO:');
        
        if (allFieldsPopulated) {
            console.log('✅ SUCESSO TOTAL! Todos os 4 campos JSON estão populados!');
        } else {
            console.log('❌ FALHA: Alguns campos ainda estão vazios');
        }
        
        const avgComprehensive = (totalComprehensive / latestMetrics.length).toFixed(1);
        const avgParticipation = (totalParticipation / latestMetrics.length).toFixed(1);  
        const avgRanking = (totalRanking / latestMetrics.length).toFixed(1);
        const avgMetricData = (totalMetricData / latestMetrics.length).toFixed(1);
        
        console.log('\n📊 ESTATÍSTICAS MÉDIAS POR REGISTRO:');
        console.log(`   📊 comprehensive_metrics: ${avgComprehensive} propriedades/registro`);
        console.log(`   📈 participation_metrics: ${avgParticipation} propriedades/registro`);
        console.log(`   🏆 ranking_metrics: ${avgRanking} propriedades/registro`);
        console.log(`   🗃️ metric_data: ${avgMetricData} propriedades/registro`);
        
        if (allFieldsPopulated) {
            console.log('\n🎉 CORREÇÃO IMPLEMENTADA COM SUCESSO!');
            console.log('💡 Próximo passo: Gerar CSV com dados dos 4 campos JSON');
        } else {
            console.log('\n⚠️ A correção não foi totalmente efetiva');
            console.log('💡 Verifique os logs acima para identificar problemas');
        }
        
    } catch (error) {
        console.error('💥 ERRO CRÍTICO no teste do serviço:', error);
        throw error;
    }
}

testarServicoCorrigido4Campos().then(() => process.exit(0)).catch(console.error);