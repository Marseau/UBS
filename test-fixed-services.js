/**
 * TESTE: Validar correção services_available no cron job
 */

async function testFixedServices() {
    console.log('🧪 TESTE: Correção services_available no cron job');
    
    const { getAdminClient } = require('./dist/config/database.js');
    const client = getAdminClient();
    
    try {
        // PASSO 1: Buscar um tenant para teste
        const { data: tenant } = await client
            .from('tenants')
            .select('id, business_name')
            .eq('status', 'active')
            .limit(1)
            .single();
            
        console.log(`🎯 Testando com: ${tenant.business_name}`);
        
        // PASSO 2: Testar query ANTES da correção (sem is_active)
        console.log('\n📋 ANTES da correção (sem filtro is_active):');
        const { data: allServices } = await client
            .from('services')
            .select('name, is_active')
            .eq('tenant_id', tenant.id);
            
        console.log(`   Total serviços: ${allServices?.length || 0}`);
        allServices?.forEach((service, idx) => {
            const status = service.is_active ? '✅' : '❌';
            console.log(`   ${idx + 1}. ${service.name} ${status}`);
        });
        
        // PASSO 3: Testar query DEPOIS da correção (com is_active = true)
        console.log('\n📋 DEPOIS da correção (com filtro is_active = true):');
        const { data: activeServices } = await client
            .from('services')
            .select('name')
            .eq('tenant_id', tenant.id)
            .eq('is_active', true);
            
        console.log(`   Serviços ativos: ${activeServices?.length || 0}`);
        activeServices?.forEach((service, idx) => {
            console.log(`   ${idx + 1}. ${service.name} ✅`);
        });
        
        // PASSO 4: Executar o cron job corrigido
        console.log('\n🚀 EXECUTANDO cron job corrigido...');
        
        try {
            // Import the corrected service
            const { ValidatedMetricsCalculatorService } = await import('./dist/services/tenant-metrics/validated-metrics-calculator.service.js');
            const metricsService = new ValidatedMetricsCalculatorService();
            
            console.log('📊 Calculando métricas...');
            const result = await metricsService.calculateValidatedMetrics(tenant.id, 30);
            
            console.log('✅ RESULTADO DO CRON JOB:');
            console.log(`   services_available.count: ${result.services_available.count}`);
            console.log(`   services_available.services: ${JSON.stringify(result.services_available.services)}`);
            
            if (result.services_available.services.length > 0) {
                console.log('\n🎉 SUCESSO: Cron job agora retorna os nomes dos serviços!');
                result.services_available.services.forEach((name, idx) => {
                    console.log(`   ${idx + 1}. ${name}`);
                });
            } else {
                console.log('\n⚠️ Ainda sem serviços no resultado');
            }
            
            // PASSO 5: Salvar na tabela tenant_metrics
            console.log('\n💾 SALVANDO na tabela tenant_metrics...');
            
            const { error: insertError } = await client
                .from('tenant_metrics')
                .upsert({
                    tenant_id: tenant.id,
                    metric_type: 'comprehensive',
                    metric_data: result,
                    period: '30d',
                    calculated_at: new Date().toISOString()
                }, {
                    onConflict: 'tenant_id, metric_type, period'
                });
                
            if (insertError) {
                console.log('❌ Erro salvando:', insertError);
            } else {
                console.log('✅ Salvo com sucesso em tenant_metrics!');
                
                // Verificar se foi salvo
                const { data: savedMetrics } = await client
                    .from('tenant_metrics')
                    .select('metric_data')
                    .eq('tenant_id', tenant.id)
                    .eq('metric_type', 'comprehensive')
                    .eq('period', '30d')
                    .order('calculated_at', { ascending: false })
                    .limit(1)
                    .single();
                    
                if (savedMetrics?.metric_data?.services_available) {
                    console.log('\n🎯 CONFIRMAÇÃO: Dados salvos na tabela:');
                    console.log(`   services_available: ${JSON.stringify(savedMetrics.metric_data.services_available)}`);
                }
            }
            
        } catch (serviceError) {
            console.log('❌ Erro executando serviço:', serviceError.message);
        }
        
    } catch (error) {
        console.log('❌ Erro geral:', error.message);
    }
}

testFixedServices().catch(console.error);