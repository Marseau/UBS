const { TenantMetricsCronService } = require('./dist/services/tenant-metrics-cron.service.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testTenantMetricsCron() {
    console.log('🧪 Testando Tenant Metrics Cron Service...\n');
    
    const service = new TenantMetricsCronService();
    
    try {
        // Execute manual metrics calculation
        console.log('⏰ Iniciando execução manual do cron...');
        await service.executeManualMetricsUpdate();
        console.log('✅ Execução manual concluída\n');
        
        // Check database results
        console.log('📊 Verificando resultados na base de dados...');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        const { data: metrics, error } = await supabase
            .from('tenant_metrics')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) {
            console.error('❌ Erro ao buscar métricas:', error);
            return;
        }
        
        console.log(`📈 Total de métricas salvas: ${metrics?.length || 0}`);
        
        if (metrics && metrics.length > 0) {
            console.log('\n📋 Métricas por tenant:');
            const tenantGroups = {};
            metrics.forEach(metric => {
                if (!tenantGroups[metric.tenant_id]) {
                    tenantGroups[metric.tenant_id] = [];
                }
                tenantGroups[metric.tenant_id].push(metric.period);
            });
            
            Object.keys(tenantGroups).forEach(tenantId => {
                console.log(`  • ${tenantId}: ${tenantGroups[tenantId].join(', ')}`);
            });
            
            console.log('\n📊 Sample metric data:');
            const sample = metrics[0];
            console.log(`  • Tenant: ${sample.tenant_id}`);
            console.log(`  • Period: ${sample.period}`);
            console.log(`  • Data keys: ${Object.keys(sample.metric_data || {}).slice(0, 5).join(', ')}...`);
            console.log(`  • Calculated at: ${sample.calculation_date}`);
        }
        
    } catch (error) {
        console.error('❌ Erro durante teste:', error);
    }
}

testTenantMetricsCron();