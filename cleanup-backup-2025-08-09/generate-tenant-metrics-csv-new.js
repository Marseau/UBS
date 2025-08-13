const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function generateTenantMetricsCSV() {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('📊 Gerando CSV das métricas de tenant...\n');
    
    try {
        // Get all tenant metrics
        const { data: metrics, error } = await supabase
            .from('tenant_metrics')
            .select('*')
            .order('tenant_id', { ascending: true })
            .order('period', { ascending: true })
            .order('created_at', { ascending: false });
            
        if (error) {
            console.error('❌ Erro ao buscar métricas:', error);
            return;
        }
        
        if (!metrics || metrics.length === 0) {
            console.log('⚠️ Nenhuma métrica encontrada');
            return;
        }

        console.log(`📈 Total de métricas encontradas: ${metrics.length}`);
        
        // Create CSV with flattened JSON fields
        const csvRows = [];
        const headers = [
            'id',
            'tenant_id', 
            'metric_type',
            'period',
            'calculated_at',
            'created_at',
            'updated_at',
            // Flattened metric_data fields
            'period_type',
            'period_start',
            'period_end',
            'total_appointments',
            'confirmed_appointments',
            'cancelled_appointments', 
            'completed_appointments',
            'pending_appointments',
            'appointments_growth_rate',
            'total_revenue',
            'revenue_growth_rate',
            'average_value',
            'total_customers',
            'new_customers',
            'returning_customers',
            'customer_growth_rate',
            'revenue_platform_percentage',
            'appointments_platform_percentage', 
            'customers_platform_percentage',
            'business_health_score',
            'risk_level',
            'risk_score'
        ];
        
        csvRows.push(headers.join(','));
        
        metrics.forEach(metric => {
            const data = metric.metric_data || {};
            
            const row = [
                metric.id || '',
                metric.tenant_id || '',
                metric.metric_type || '',
                metric.period || '',
                metric.calculated_at || '',
                metric.created_at || '',
                metric.updated_at || '',
                // Flattened metric_data
                data.period_type || '',
                data.period_start || '',
                data.period_end || '',
                data.total_appointments || 0,
                data.confirmed_appointments || 0,
                data.cancelled_appointments || 0,
                data.completed_appointments || 0,
                data.pending_appointments || 0,
                data.appointments_growth_rate || 0,
                data.total_revenue || 0,
                data.revenue_growth_rate || 0,
                data.average_value || 0,
                data.total_customers || 0,
                data.new_customers || 0,
                data.returning_customers || 0,
                data.customer_growth_rate || 0,
                data.revenue_platform_percentage || 0,
                data.appointments_platform_percentage || 0,
                data.customers_platform_percentage || 0,
                data.business_health_score || 0,
                data.risk_level || '',
                data.risk_score || 0
            ];
            
            // Escape commas in text fields and wrap in quotes
            const escapedRow = row.map(field => {
                if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
                    return `"${field.replace(/"/g, '""')}"`;
                }
                return field;
            });
            
            csvRows.push(escapedRow.join(','));
        });
        
        const csvContent = csvRows.join('\n');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `TENANT-METRICS-ANALYSIS-${timestamp}.csv`;
        
        require('fs').writeFileSync(filename, csvContent, 'utf8');
        
        console.log(`✅ CSV gerado: ${filename}`);
        console.log(`📊 Total de registros: ${metrics.length}`);
        console.log(`📋 Campos exportados: ${headers.length}`);
        
        // Show summary by period
        const periodSummary = {};
        metrics.forEach(metric => {
            const period = metric.period;
            periodSummary[period] = (periodSummary[period] || 0) + 1;
        });
        
        console.log('\n📈 Resumo por período:');
        Object.keys(periodSummary).sort().forEach(period => {
            console.log(`  • ${period}: ${periodSummary[period]} métricas`);
        });
        
        // Show tenant count
        const tenantIds = [...new Set(metrics.map(m => m.tenant_id))];
        console.log(`\n👥 Total de tenants: ${tenantIds.length}`);
        
    } catch (error) {
        console.error('❌ Erro durante geração do CSV:', error);
    }
}

generateTenantMetricsCSV();