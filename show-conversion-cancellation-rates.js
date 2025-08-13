/**
 * MOSTRAR TAXAS DE CONVERSÃO E CANCELAMENTO DO SISTEMA REAL
 * Context Engineering - Dados salvos pelo sistema de jobs
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function showRatesFromSystem() {
    console.log('📊 TAXAS DE CONVERSÃO E CANCELAMENTO - SISTEMA REAL');
    console.log('=' .repeat(80));
    
    try {
        const { data: metrics, error } = await supabase
            .from('tenant_metrics')
            .select(`
                tenant_id,
                period,
                metric_data,
                tenants(name, business_name)
            `)
            .eq('metric_type', 'business_dashboard')
            .order('tenant_id')
            .order('period');
        
        if (error) {
            console.error('❌ Erro:', error.message);
            return;
        }
        
        console.log(`📋 Encontrados ${metrics.length} registros de métricas`);
        
        // Agrupar por tenant
        const tenantGroups = {};
        metrics.forEach(metric => {
            const tenantName = metric.tenants?.name || 'Unknown';
            if (!tenantGroups[tenantName]) {
                tenantGroups[tenantName] = [];
            }
            tenantGroups[tenantName].push(metric);
        });
        
        Object.entries(tenantGroups).forEach(([tenantName, periods]) => {
            console.log(`\n🏢 TENANT: ${tenantName}`);
            console.log('─'.repeat(60));
            
            periods.forEach(metric => {
                const conversionRate = metric.metric_data?.conversion_rate;
                const cancellationRate = metric.metric_data?.cancellation_rate;
                
                console.log(`\n⏰ PERÍODO: ${metric.period.toUpperCase()}`);
                
                if (conversionRate) {
                    console.log(`   ✅ Taxa Conversão: ${conversionRate.percentage}% (${conversionRate.converted_conversations}/${conversionRate.total_conversations} conversas)`);
                } else {
                    console.log('   ✅ Taxa Conversão: N/A');
                }
                
                if (cancellationRate) {
                    console.log(`   ❌ Taxa Cancelamento: ${cancellationRate.percentage}% (${cancellationRate.cancelled_conversations}/${cancellationRate.total_conversations} conversas)`);
                } else {
                    console.log('   ❌ Taxa Cancelamento: N/A');
                }
            });
        });
        
        console.log('\n✅ Dados extraídos da tabela tenant_metrics (sistema real)');
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

showRatesFromSystem();