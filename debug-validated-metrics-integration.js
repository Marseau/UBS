/**
 * Script de debug para verificar a integração das métricas validadas
 * COLEAM00 - Investigação completa da falha de população
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function debugValidatedMetricsIntegration() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('🔍 DEBUG: Integração das métricas validadas');
    console.log('===========================================\n');
    
    // 1. Verificar se ValidatedMetricsCalculatorService retorna dados
    console.log('📊 TESTE 1: Instanciar ValidatedMetricsCalculatorService');
    try {
        const ValidatedService = require('./src/services/tenant-metrics/validated-metrics-calculator.service.ts');
        console.log('✅ Serviço importado com sucesso');
        
        // Buscar um tenant para teste
        const { data: tenants } = await client
            .from('tenants')
            .select('id, business_name')
            .limit(1);
            
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado para teste');
            return;
        }
        
        const testTenant = tenants[0];
        console.log(`📍 Tenant de teste: ${testTenant.id.substring(0,8)}... (${testTenant.business_name})`);
        
        // Testar cálculo de métricas validadas
        console.log('\n📊 TESTE 2: Calcular métricas validadas manualmente');
        const winston = require('winston');
        const logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [new winston.transports.Console()]
        });
        
        const validatedCalculator = new ValidatedService.ValidatedMetricsCalculatorService(logger);
        const validatedMetrics = await validatedCalculator.calculateValidatedMetrics(testTenant.id, '30d');
        
        console.log('✅ Métricas validadas calculadas:');
        console.log(`   - Chaves principais: ${Object.keys(validatedMetrics).slice(0, 5).join(', ')}...`);
        console.log(`   - Total de chaves: ${Object.keys(validatedMetrics).length}`);
        console.log(`   - Monthly Revenue: ${validatedMetrics.monthly_revenue}`);
        console.log(`   - New Customers: ${validatedMetrics.new_customers}`);
        
    } catch (error) {
        console.log(`❌ Erro no teste: ${error.message}`);
        console.log('Stack:', error.stack?.split('\n').slice(0,3).join('\n'));
    }
    
    // 2. Verificar integração no TenantMetricsCronOptimizedService
    console.log('\n📊 TESTE 3: Verificar integração no cronjob');
    try {
        // Simular o que acontece no cronjob
        const TenantService = require('./src/services/tenant-metrics/tenant-metrics-calculator.service.ts');
        const winston = require('winston');
        const logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [new winston.transports.Console()]
        });
        
        console.log('✅ TenantMetricsCalculatorService importado');
        
        // Verificar se o resultado combinado está correto
        const testTenant = (await client.from('tenants').select('id').limit(1)).data[0];
        
        console.log('\n📊 TESTE 4: Simular processamento combinado');
        console.log('   - Tenant ID:', testTenant.id.substring(0,8));
        console.log('   - Period: 30d');
        
        // Verificar se os campos esperados existem
        const { data: recentMetric } = await client
            .from('tenant_metrics')
            .select('metric_data, metricas_validadas')
            .eq('tenant_id', testTenant.id)
            .eq('metric_type', 'comprehensive')
            .order('calculated_at', { ascending: false })
            .limit(1)
            .single();
            
        if (recentMetric) {
            console.log('✅ Métrica recente encontrada:');
            console.log(`   - metric_data existe: ${!!recentMetric.metric_data}`);
            console.log(`   - metricas_validadas existe: ${!!recentMetric.metricas_validadas}`);
            console.log(`   - metricas_validadas populado: ${!!(recentMetric.metricas_validadas && Object.keys(recentMetric.metricas_validadas).length > 0)}`);
        } else {
            console.log('❌ Nenhuma métrica recente encontrada para este tenant');
        }
        
    } catch (error) {
        console.log(`❌ Erro na integração: ${error.message}`);
        console.log('Stack:', error.stack?.split('\n').slice(0,3).join('\n'));
    }
    
    // 3. Verificar se o problema é no upsert
    console.log('\n📊 TESTE 5: Verificar estrutura do banco');
    try {
        const { data: tableInfo } = await client
            .from('tenant_metrics')
            .select('tenant_id, metric_type, metricas_validadas')
            .eq('metric_type', 'comprehensive')
            .not('metricas_validadas', 'is', null)
            .limit(1);
            
        console.log(`   - Registros 'comprehensive' COM metricas_validadas: ${tableInfo?.length || 0}`);
        
        const { data: allComprehensive } = await client
            .from('tenant_metrics')
            .select('count(*)')
            .eq('metric_type', 'comprehensive');
            
        console.log(`   - Total registros 'comprehensive': ${allComprehensive?.[0]?.count || 0}`);
        
    } catch (error) {
        console.log(`❌ Erro na consulta: ${error.message}`);
    }
    
    console.log('\n🎯 CONCLUSÃO DO DEBUG:');
    console.log('======================');
    console.log('Se os testes passaram mas metricas_validadas não está populado,');
    console.log('o problema está na integração do cronjob ou no upsert do banco.');
}

debugValidatedMetricsIntegration().catch(console.error);