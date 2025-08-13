/**
 * TESTE: Serviço ValidatedMetricsCalculatorService corrigido
 */

async function testCorrectedService() {
    console.log('🧪 TESTE: ValidatedMetricsCalculatorService corrigido');
    
    const { getAdminClient } = require('./dist/config/database.js');
    const client = getAdminClient();
    
    try {
        // PASSO 1: Testar o serviço corrigido diretamente
        console.log('📤 Importando ValidatedMetricsCalculatorService...');
        
        // Import the corrected service
        const { ValidatedMetricsCalculatorService } = require('./dist/services/tenant-metrics/validated-metrics-calculator.service.js');
        
        console.log('✅ Serviço importado com sucesso');
        
        // PASSO 2: Buscar um tenant
        const { data: tenant } = await client
            .from('tenants')
            .select('id, business_name')
            .eq('status', 'active')
            .limit(1)
            .single();
            
        console.log(`🎯 Testando com: ${tenant.business_name}`);
        
        // PASSO 3: Executar o serviço corrigido
        console.log('🚀 Executando ValidatedMetricsCalculatorService...');
        
        const metricsService = new ValidatedMetricsCalculatorService();
        const result = await metricsService.calculateValidatedMetrics(tenant.id, 30);
        
        console.log('✅ RESULTADO:');
        console.log(`   services_available.count: ${result.services_available?.count || 'N/A'}`);
        console.log(`   services_available.services: ${JSON.stringify(result.services_available?.services || [])}`);
        
        if (result.services_available?.services && result.services_available.services.length > 0) {
            console.log('\n🎉 SUCESSO: Serviço corrigido retorna nomes!');
            result.services_available.services.forEach((name, idx) => {
                console.log(`   ${idx + 1}. ${name}`);
            });
        } else {
            console.log('\n❌ PROBLEMA: Ainda sem nomes de serviços');
            console.log('Resultado completo services_available:', result.services_available);
        }
        
        // PASSO 4: Salvar na tabela tenant_metrics
        console.log('\n💾 SALVANDO resultado corrigido...');
        
        const { error: insertError } = await client
            .from('tenant_metrics')
            .upsert({
                tenant_id: tenant.id,
                metric_type: 'comprehensive_corrected',
                metric_data: result,
                period: '30d',
                calculated_at: new Date().toISOString()
            }, {
                onConflict: 'tenant_id, metric_type, period'
            });
            
        if (insertError) {
            console.log('❌ Erro salvando:', insertError);
        } else {
            console.log('✅ Salvo como comprehensive_corrected!');
            
            // Verificar se foi salvo corretamente
            const { data: savedMetric } = await client
                .from('tenant_metrics')
                .select('metric_data')
                .eq('tenant_id', tenant.id)
                .eq('metric_type', 'comprehensive_corrected')
                .eq('period', '30d')
                .order('calculated_at', { ascending: false })
                .limit(1)
                .single();
                
            if (savedMetric?.metric_data?.services_available) {
                console.log('\n🎯 CONFIRMAÇÃO NA TABELA:');
                console.log(`   services_available: ${JSON.stringify(savedMetric.metric_data.services_available)}`);
                
                if (savedMetric.metric_data.services_available.services?.length > 0) {
                    console.log('🎉 CONFIRMADO: Correção funcionando na tabela!');
                } else {
                    console.log('❌ AINDA COM PROBLEMA na tabela');
                }
            }
        }
        
    } catch (error) {
        console.log('❌ Erro:', error.message);
        console.log('Stack:', error.stack);
    }
}

testCorrectedService().catch(console.error);