require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GERADOR DE CSVs DAS MÉTRICAS - PIPELINE FINAL
 * Gera CSVs com campos JSON expandidos para validação
 */

async function generateMetricsCSVs() {
    console.log('📊 GERANDO CSVs DAS MÉTRICAS PARA VALIDAÇÃO');
    console.log('='.repeat(70));
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    
    try {
        // 1. CSV da tabela tenant_metrics
        console.log('📋 1. Gerando CSV de tenant_metrics...');
        await generateTenantMetricsCSV(timestamp);
        
        // 2. CSV da tabela platform_metrics
        console.log('📋 2. Gerando CSV de platform_metrics...');
        await generatePlatformMetricsCSV(timestamp);
        
        console.log('\n✅ TODOS OS CSVs GERADOS COM SUCESSO!');
        
    } catch (error) {
        console.error('❌ ERRO na geração de CSVs:', error);
    }
}

async function generateTenantMetricsCSV(timestamp) {
    const { data: tenantMetrics, error } = await supabase
        .from('tenant_metrics')
        .select('*')
        .order('calculated_at', { ascending: false });
    
    if (error) {
        throw new Error(`Erro ao buscar tenant_metrics: ${error.message}`);
    }
    
    if (!tenantMetrics || tenantMetrics.length === 0) {
        console.log('⚠️ Nenhum registro encontrado em tenant_metrics');
        return;
    }
    
    console.log(`📊 Processando ${tenantMetrics.length} registros de tenant_metrics...`);
    
    // Expandir campos JSON e criar CSV
    const csvRows = [];
    
    // Header
    const headers = [
        'id', 'tenant_id', 'metric_type', 'period', 'calculated_at', 'created_at', 'updated_at',
        // Campos expandidos do metric_data
        'total_appointments', 'confirmed_appointments', 'cancelled_appointments', 
        'completed_appointments', 'pending_appointments', 'appointments_growth_rate',
        'total_revenue', 'revenue_growth_rate', 'average_value',
        'total_customers', 'new_customers', 'returning_customers', 'customer_growth_rate',
        'revenue_platform_percentage', 'appointments_platform_percentage', 'customers_platform_percentage',
        'business_health_score', 'risk_level', 'risk_score',
        'period_start', 'period_end', 'period_type'
    ];
    
    csvRows.push(headers.join(','));
    
    // Dados
    tenantMetrics.forEach(record => {
        const metricData = record.metric_data || {};
        
        const row = [
            record.id || '',
            record.tenant_id || '',
            record.metric_type || '',
            record.period || '',
            record.calculated_at || '',
            record.created_at || '',
            record.updated_at || '',
            // Expandir metric_data
            metricData.total_appointments || 0,
            metricData.confirmed_appointments || 0,
            metricData.cancelled_appointments || 0,
            metricData.completed_appointments || 0,
            metricData.pending_appointments || 0,
            metricData.appointments_growth_rate || 0,
            metricData.total_revenue || 0,
            metricData.revenue_growth_rate || 0,
            metricData.average_value || 0,
            metricData.total_customers || 0,
            metricData.new_customers || 0,
            metricData.returning_customers || 0,
            metricData.customer_growth_rate || 0,
            metricData.revenue_platform_percentage || 0,
            metricData.appointments_platform_percentage || 0,
            metricData.customers_platform_percentage || 0,
            metricData.business_health_score || 0,
            metricData.risk_level || 'N/A',
            metricData.risk_score || 0,
            metricData.period_start || '',
            metricData.period_end || '',
            metricData.period_type || ''
        ];
        
        csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const fileName = `TENANT-METRICS-EXPANDED-${timestamp}.csv`;
    
    fs.writeFileSync(fileName, csvContent);
    console.log(`✅ CSV gerado: ${fileName}`);
    console.log(`   📊 Registros: ${tenantMetrics.length}`);
    console.log(`   📋 Colunas: ${headers.length}`);
}

async function generatePlatformMetricsCSV(timestamp) {
    const { data: platformMetrics, error } = await supabase
        .from('platform_metrics')
        .select('*')
        .order('calculation_date', { ascending: false });
    
    if (error) {
        throw new Error(`Erro ao buscar platform_metrics: ${error.message}`);
    }
    
    if (!platformMetrics || platformMetrics.length === 0) {
        console.log('⚠️ Nenhum registro encontrado em platform_metrics');
        return;
    }
    
    console.log(`📊 Processando ${platformMetrics.length} registros de platform_metrics...`);
    
    // Expandir campos JSON e criar CSV
    const csvRows = [];
    
    // Header - usar todos os campos da tabela platform_metrics
    const headers = [
        'id', 'calculation_date', 'period_days', 'data_source', 'created_at', 'updated_at',
        'total_revenue', 'total_appointments', 'total_customers', 'active_tenants', 
        'total_conversations', 'platform_mrr', 'platform_growth_rate',
        'revenue_per_tenant', 'appointments_per_tenant', 'customers_per_tenant',
        'conversion_rate', 'churn_rate', 'ltv', 'cac', 'mrr_growth_rate',
        'platform_health_score', 'operational_efficiency', 'revenue_usage_ratio',
        'tenant_satisfaction_avg', 'platform_uptime', 'avg_response_time_ms',
        'total_ai_interactions', 'ai_success_rate', 'total_cost_usd'
    ];
    
    csvRows.push(headers.join(','));
    
    // Dados
    platformMetrics.forEach(record => {
        const row = [
            record.id || '',
            record.calculation_date || '',
            record.period_days || 0,
            record.data_source || '',
            record.created_at || '',
            record.updated_at || '',
            record.total_revenue || 0,
            record.total_appointments || 0,
            record.total_customers || 0,
            record.active_tenants || 0,
            record.total_conversations || 0,
            record.platform_mrr || 0,
            record.platform_growth_rate || 0,
            record.revenue_per_tenant || 0,
            record.appointments_per_tenant || 0,
            record.customers_per_tenant || 0,
            record.conversion_rate || 0,
            record.churn_rate || 0,
            record.ltv || 0,
            record.cac || 0,
            record.mrr_growth_rate || 0,
            record.platform_health_score || 0,
            record.operational_efficiency || 0,
            record.revenue_usage_ratio || 0,
            record.tenant_satisfaction_avg || 0,
            record.platform_uptime || 0,
            record.avg_response_time_ms || 0,
            record.total_ai_interactions || 0,
            record.ai_success_rate || 0,
            record.total_cost_usd || 0
        ];
        
        csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const fileName = `PLATFORM-METRICS-EXPANDED-${timestamp}.csv`;
    
    fs.writeFileSync(fileName, csvContent);
    console.log(`✅ CSV gerado: ${fileName}`);
    console.log(`   📊 Registros: ${platformMetrics.length}`);
    console.log(`   📋 Colunas: ${headers.length}`);
}

// Executar
generateMetricsCSVs()
    .then(() => {
        console.log('\n🎉 GERAÇÃO DE CSVs CONCLUÍDA!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 FALHA NA GERAÇÃO:', error);
        process.exit(1);
    });