/**
 * EXECUÇÃO DIRETA: Dispara cron jobs usando o serviço interno
 */

async function executeCronDirect() {
    console.log('🚀 EXECUÇÃO DIRETA: Cron jobs via serviço interno');
    
    try {
        // Import the comprehensive metrics directly
        console.log('📤 Importando executeAllMetrics...');
        
        // Check if file exists first
        const fs = require('fs');
        const path = require('path');
        
        const possiblePaths = [
            './execute-all-metrics.js',
            './dist/execute-all-metrics.js',
            './src/services/unified-cron.service.js',
            './dist/services/unified-cron.service.js'
        ];
        
        let foundPath = null;
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                foundPath = testPath;
                console.log(`✅ Encontrado: ${testPath}`);
                break;
            }
        }
        
        if (!foundPath) {
            console.log('❌ Arquivo executeAllMetrics não encontrado');
            console.log('💡 Tentativa alternativa: Executar via serviço unificado...');
            
            // Try alternative approach - import unified cron service
            const { UnifiedCronService } = await import('./dist/services/unified-cron.service.js');
            const cronService = new UnifiedCronService();
            
            console.log('🚀 Executando cálculos de métricas...');
            const result = await cronService.calculateComprehensiveMetrics();
            
            console.log('✅ Resultado:', result);
            return;
        }
        
        // Execute the metrics
        const { executeAllMetrics } = require(foundPath);
        
        console.log('🚀 Executando sistema completo de métricas...');
        const result = await executeAllMetrics();
        
        console.log('✅ Resultado da execução:', result.success ? 'SUCESSO' : 'FALHA');
        
        if (result.details) {
            console.log('📊 Detalhes:', result.details);
        }
        
        if (result.errors && result.errors.length > 0) {
            console.log('❌ Erros encontrados:');
            result.errors.forEach((error, idx) => {
                console.log(`   ${idx + 1}. ${error}`);
            });
        }
        
    } catch (importError) {
        console.log('❌ Erro importando serviço:', importError.message);
        
        // PLANO B: Executar via tenant-metrics-cron service
        console.log('\n💡 PLANO B: Executando via tenant-metrics-cron...');
        
        try {
            // Import database client and execute manually
            const { getAdminClient } = require('./dist/config/database.js');
            const client = getAdminClient();
            
            console.log('🏃‍♂️ Executando cálculo manual...');
            
            // Get a list of active tenants
            const { data: tenants } = await client
                .from('tenants')
                .select('id, business_name')
                .eq('status', 'active')
                .limit(5); // Test with first 5 tenants
                
            console.log(`🎯 Processando ${tenants?.length || 0} tenants...`);
            
            let processedCount = 0;
            
            for (const tenant of (tenants || [])) {
                try {
                    console.log(`   📊 Processando: ${tenant.business_name}`);
                    
                    // Get metrics for this tenant
                    const { data: metricsResult } = await client.rpc('get_tenant_metrics_for_period', {
                        tenant_id: tenant.id,
                        start_date: '2024-07-01',
                        end_date: '2024-08-09'
                    });
                    
                    if (metricsResult && metricsResult.length > 0) {
                        const metrics = metricsResult[0];
                        
                        // Insert into tenant_metrics table
                        const { error: insertError } = await client
                            .from('tenant_metrics')
                            .upsert({
                                tenant_id: tenant.id,
                                metric_type: 'comprehensive',
                                metric_data: {
                                    total_appointments: metrics.total_appointments,
                                    total_services: metrics.total_services,
                                    services_count: metrics.services_count,
                                    total_customers: metrics.total_customers,
                                    total_revenue: metrics.total_revenue,
                                    average_value: metrics.average_value,
                                    confirmed_appointments: metrics.confirmed_appointments,
                                    cancelled_appointments: metrics.cancelled_appointments,
                                    completed_appointments: metrics.completed_appointments,
                                    new_customers: metrics.new_customers,
                                    total_conversations: metrics.total_conversations,
                                    ai_success_rate: metrics.ai_success_rate,
                                    conversion_rate: metrics.conversion_rate,
                                    most_popular_service: metrics.most_popular_service
                                },
                                period: '30d',
                                calculated_at: new Date().toISOString()
                            }, {
                                onConflict: 'tenant_id, metric_type, period'
                            });
                            
                        if (!insertError) {
                            processedCount++;
                            console.log(`   ✅ ${tenant.business_name} - metrics updated`);
                        } else {
                            console.log(`   ❌ ${tenant.business_name} - error: ${insertError.message}`);
                        }
                    } else {
                        console.log(`   ⚠️  ${tenant.business_name} - no data`);
                    }
                    
                } catch (tenantError) {
                    console.log(`   ❌ ${tenant.business_name} - error: ${tenantError.message}`);
                }
            }
            
            console.log(`\n🎉 PROCESSAMENTO CONCLUÍDO: ${processedCount}/${tenants?.length || 0} tenants`);
            
        } catch (planBError) {
            console.log('❌ Erro no Plano B:', planBError.message);
        }
    }
    
    // Verificar resultado final
    console.log('\n🔍 VERIFICAÇÃO FINAL...');
    
    try {
        const { getAdminClient } = require('./dist/config/database.js');
        const client = getAdminClient();
        
        const { count: finalCount } = await client
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log(`📈 Total final de registros: ${finalCount || 0}`);
        
        const { data: latestMetrics } = await client
            .from('tenant_metrics')
            .select('tenant_id, metric_type, period, calculated_at, tenants!inner(business_name)')
            .order('calculated_at', { ascending: false })
            .limit(3);
            
        console.log('\n📋 Últimos registros atualizados:');
        latestMetrics?.forEach((metric, idx) => {
            const time = new Date(metric.calculated_at).toLocaleString('pt-BR');
            const businessName = metric.tenants?.business_name || 'N/A';
            console.log(`   ${idx + 1}. ${businessName} | ${metric.metric_type} | ${time}`);
        });
        
    } catch (finalError) {
        console.log(`❌ Erro na verificação final: ${finalError.message}`);
    }
}

executeCronDirect().catch(console.error);