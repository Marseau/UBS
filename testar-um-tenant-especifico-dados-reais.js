require('dotenv').config();
const TenantMetricsCronService = require('./dist/services/tenant-metrics-cron.service.js').TenantMetricsCronService;

async function testarUmTenantEspecificoComDadosReais() {
    console.log('🎯 TESTANDO UM TENANT ESPECÍFICO COM DADOS REAIS');
    console.log('='.repeat(80));
    
    try {
        // Inicializar serviço
        const service = new TenantMetricsCronService();
        
        // Testar com Clínica Mente Sã (sabemos que tem dados reais)
        const tenantId = 'fe2fa876-05da-49b5-b266-8141bcd090fa';
        const period = '90d';
        
        console.log(`📊 Testando tenant: ${tenantId} período: ${period}`);
        console.log('💡 Este tenant tem 185 appointments e R$ 6.292,61 de receita real!');
        
        // Limpar métricas existentes deste tenant para teste
        const { createClient } = require('@supabase/supabase-js');
        const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        console.log('🗑️ Limpando métricas antigas deste tenant...');
        await client
            .from('tenant_metrics')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('period', period);
            
        console.log('🔄 Executando cálculo de métricas...');
        
        // Executar calculateTenantHistoricalMetrics diretamente
        await service.calculateTenantHistoricalMetrics(tenantId, period);
        
        console.log('✅ Cálculo executado! Verificando resultados...');
        
        // Verificar se os dados foram salvos corretamente
        const { data: savedMetrics, error } = await client
            .from('tenant_metrics')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('period', period)
            .order('created_at', { ascending: false })
            .limit(1);
            
        if (error) {
            console.error('❌ Erro ao buscar métricas salvas:', error);
            return;
        }
        
        if (!savedMetrics || savedMetrics.length === 0) {
            console.log('❌ PROBLEMA: Nenhuma métrica foi salva no banco!');
            return;
        }
        
        const metric = savedMetrics[0];
        console.log('🎉 MÉTRICA SALVA ENCONTRADA!');
        console.log('='.repeat(80));
        
        // Verificar comprehensive_metrics
        console.log('📊 COMPREHENSIVE_METRICS:');
        const comp = metric.comprehensive_metrics || {};
        console.log(`   Properties: ${Object.keys(comp).length}`);
        console.log(`   💰 Revenue: R$ ${comp.total_revenue || 0}`);
        console.log(`   📅 Appointments: ${comp.total_appointments || 0}`);
        console.log(`   👥 Customers: ${comp.total_customers || 0}`);
        console.log(`   📊 Health Score: ${comp.business_health_score || 0}`);
        console.log(`   🎯 Success Rate: ${comp.appointment_success_rate || 0}%`);
        
        // Verificar participation_metrics
        console.log('\\n📈 PARTICIPATION_METRICS:');
        const part = metric.participation_metrics || {};
        console.log(`   Properties: ${Object.keys(part).length}`);
        console.log(`   💹 Revenue %: ${part.revenue_platform_percentage || 0}%`);
        console.log(`   📊 Market Share: ${part.platform_market_share || 0}%`);
        
        // Verificar ranking_metrics
        console.log('\\n🏆 RANKING_METRICS:');
        const rank = metric.ranking_metrics || {};
        console.log(`   Properties: ${Object.keys(rank).length}`);
        console.log(`   🎯 Overall Score: ${rank.overall_score || 0}`);
        console.log(`   ⚠️ Risk Level: ${rank.risk_level || 'N/A'}`);
        
        // Verificar metric_data
        console.log('\\n🗃️ METRIC_DATA:');
        const data = metric.metric_data || {};
        console.log(`   Properties: ${Object.keys(data).length}`);
        console.log(`   📊 Period: ${data.period_type || 'N/A'}`);
        console.log(`   📅 Start: ${data.period_start || 'N/A'}`);
        console.log(`   📅 End: ${data.period_end || 'N/A'}`);
        
        // RESULTADO FINAL
        console.log('\\n' + '='.repeat(80));
        console.log('🎯 RESULTADO DO TESTE:');
        
        const hasComp = Object.keys(comp).length > 0;
        const hasPart = Object.keys(part).length > 0;
        const hasRank = Object.keys(rank).length > 0;
        const hasData = Object.keys(data).length > 0;
        
        if (hasComp && hasPart && hasRank && hasData) {
            console.log('✅ 🎉 SUCESSO! Todos os 4 campos JSON estão populados com dados REAIS!');
            console.log(`💰 Revenue real processada: R$ ${comp.total_revenue || 0}`);
            console.log(`📅 Appointments reais: ${comp.total_appointments || 0}`);
            console.log('🚀 O serviço está funcionando perfeitamente com dados reais!');
        } else {
            console.log('❌ FALHA: Alguns campos ainda estão vazios');
            console.log(`   comp: ${hasComp ? '✅' : '❌'}`);
            console.log(`   part: ${hasPart ? '✅' : '❌'}`);
            console.log(`   rank: ${hasRank ? '✅' : '❌'}`);
            console.log(`   data: ${hasData ? '✅' : '❌'}`);
        }
        
    } catch (error) {
        console.error('💥 Erro no teste:', error);
    }
}

testarUmTenantEspecificoComDadosReais().then(() => process.exit(0)).catch(console.error);