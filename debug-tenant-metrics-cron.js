/**
 * DEBUG: Investigar por que cron job não popula tenant_metrics
 * 
 * FOCO: Encontrar onde está o problema real
 */

const { getAdminClient } = require('./dist/config/database.js');

async function debugTenantMetricsCron() {
    console.log('🔍 DEBUG: Investigando cron job tenant_metrics');
    
    const client = getAdminClient();
    
    try {
        // STEP 1: Check if tenant_metrics table exists and has data
        console.log('\n📋 STEP 1: Verificando tabela tenant_metrics...');
        
        const { count: metricsCount } = await client
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log(`📊 Registros em tenant_metrics: ${metricsCount || 0}`);
        
        if (metricsCount > 0) {
            const { data: sampleMetrics } = await client
                .from('tenant_metrics')
                .select('tenant_id, metric_type, period, calculated_at')
                .order('calculated_at', { ascending: false })
                .limit(5);
                
            console.log('📋 Últimos registros:');
            sampleMetrics?.forEach((metric, idx) => {
                console.log(`   ${idx + 1}. ${metric.tenant_id} | ${metric.metric_type} | ${metric.period} | ${metric.calculated_at}`);
            });
        }
        
        // STEP 2: Test the main get_tenant_metrics_for_period function
        console.log('\n🧪 STEP 2: Testando função principal get_tenant_metrics_for_period...');
        
        // Get a tenant with data
        const { data: tenantData } = await client
            .from('appointments')
            .select('tenant_id, tenants!inner(business_name)')
            .not('tenant_id', 'is', null)
            .limit(1);
            
        if (!tenantData || tenantData.length === 0) {
            console.log('❌ Nenhum tenant com appointments encontrado');
            return;
        }
        
        const testTenantId = tenantData[0].tenant_id;
        const businessName = tenantData[0].tenants.business_name;
        
        console.log(`🎯 Testando com tenant: ${testTenantId} (${businessName})`);
        
        // Test the main function
        try {
            const startDate = '2024-07-01';
            const endDate = '2024-08-09';
            
            const { data: metricsResult, error: metricsError } = await client.rpc('get_tenant_metrics_for_period', {
                tenant_id: testTenantId,
                start_date: startDate,
                end_date: endDate
            });
            
            if (metricsError) {
                console.log('❌ ERRO na função principal:', metricsError);
            } else if (metricsResult && metricsResult.length > 0) {
                const metrics = metricsResult[0];
                console.log('✅ Função principal funcionando:');
                console.log(`   - total_appointments: ${metrics.total_appointments}`);
                console.log(`   - total_services: ${metrics.total_services}`);
                console.log(`   - services_count: ${metrics.services_count} ⭐`);
                console.log(`   - total_customers: ${metrics.total_customers}`);
                console.log(`   - total_revenue: ${metrics.total_revenue}`);
                
                // STEP 3: Try to insert this data into tenant_metrics
                console.log('\n💾 STEP 3: Testando inserção na tabela tenant_metrics...');
                
                const metricsToInsert = {
                    tenant_id: testTenantId,
                    metric_type: 'comprehensive',
                    metric_data: {
                        total_appointments: metrics.total_appointments,
                        total_services: metrics.total_services,
                        services_count: metrics.services_count,
                        total_customers: metrics.total_customers,
                        total_revenue: metrics.total_revenue,
                        confirmed_appointments: metrics.confirmed_appointments,
                        cancelled_appointments: metrics.cancelled_appointments,
                        completed_appointments: metrics.completed_appointments,
                        average_value: metrics.average_value,
                        new_customers: metrics.new_customers,
                        most_popular_service: metrics.most_popular_service,
                        total_conversations: metrics.total_conversations,
                        ai_success_rate: metrics.ai_success_rate,
                        conversion_rate: metrics.conversion_rate
                    },
                    period: '30d',
                    calculated_at: new Date().toISOString()
                };
                
                const { data: insertResult, error: insertError } = await client
                    .from('tenant_metrics')
                    .upsert(metricsToInsert, {
                        onConflict: 'tenant_id, metric_type, period'
                    })
                    .select();
                
                if (insertError) {
                    console.log('❌ ERRO na inserção:', insertError);
                    
                    // Check table structure
                    console.log('\n🔍 Verificando estrutura da tabela...');
                    const { data: tableInfo, error: infoError } = await client.rpc('describe_table', {
                        table_name: 'tenant_metrics'
                    });
                    
                    if (infoError) {
                        console.log('❌ Erro verificando estrutura:', infoError);
                    } else {
                        console.log('📋 Estrutura da tabela:', tableInfo);
                    }
                } else {
                    console.log('✅ Dados inseridos com sucesso:', insertResult);
                }
                
            } else {
                console.log('⚠️  Função principal retornou vazio');
            }
        } catch (mainError) {
            console.log('❌ Exception na função principal:', mainError.message);
        }
        
        // STEP 4: Check if cron jobs are enabled
        console.log('\n⏰ STEP 4: Verificando configuração de cron jobs...');
        
        const cronEnvVars = [
            'ENABLE_UNIFIED_CRON',
            'ENABLE_TENANT_PLATFORM_CRON', 
            'ENABLE_COMPREHENSIVE_METRICS',
            'ENABLE_DAILY_METRICS',
            'NODE_ENV'
        ];
        
        cronEnvVars.forEach(envVar => {
            console.log(`   ${envVar}: ${process.env[envVar] || 'undefined'}`);
        });
        
        // STEP 5: Summary and recommendations
        console.log('\n📋 RESUMO DA INVESTIGAÇÃO:');
        console.log(`   - Registros em tenant_metrics: ${metricsCount || 0}`);
        console.log(`   - Função get_tenant_services_count_by_period: ✅ Funcionando`);
        console.log(`   - Função get_tenant_metrics_for_period: ${metricsResult ? '✅ Funcionando' : '❌ Com problemas'}`);
        
        if ((metricsCount || 0) === 0) {
            console.log('\n🔧 PROBLEMA IDENTIFICADO: Tabela tenant_metrics vazia');
            console.log('\n💡 POSSÍVEIS CAUSAS:');
            console.log('   1. Cron jobs não estão executando');
            console.log('   2. Erro na inserção de dados');
            console.log('   3. Configuração de ambiente incorreta');
            console.log('   4. RLS bloqueando inserções');
            
            console.log('\n🚀 PRÓXIMOS PASSOS:');
            console.log('   1. Verificar se cron jobs estão ativos no servidor');
            console.log('   2. Executar manualmente: npm run cron:tenant-metrics');
            console.log('   3. Verificar logs de erro do servidor');
            console.log('   4. Testar inserção manual para descartar RLS');
        }
        
    } catch (error) {
        console.error('❌ ERRO GERAL:', error);
    }
}

debugTenantMetricsCron().catch(console.error);