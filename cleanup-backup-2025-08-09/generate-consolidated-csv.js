#!/usr/bin/env node

/**
 * Generate CSV with CONSOLIDATED metrics - ONE per tenant/period
 * Much cleaner for APIs and analysis
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateConsolidatedCSV() {
    console.log('📊 Generating CONSOLIDATED Metrics CSV');
    console.log('🎯 ONE record per tenant/period with ALL metrics');
    console.log('=' .repeat(60));
    
    try {
        // Get all tenants
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name, domain')
            .eq('status', 'active');
        
        if (tenantsError) throw tenantsError;
        
        // Get consolidated metrics only
        const { data: metrics, error } = await supabase
            .from('tenant_metrics')
            .select('*')
            .eq('metric_type', 'consolidated')
            .order('tenant_id', { ascending: true })
            .order('period', { ascending: true });
        
        if (error) throw error;
        
        console.log(`🏢 Found ${tenants.length} tenants`);
        console.log(`📈 Found ${metrics.length} consolidated metrics`);
        
        // Create tenant lookup
        const tenantLookup = {};
        tenants.forEach(tenant => {
            tenantLookup[tenant.id] = {
                name: tenant.name,
                domain: tenant.domain
            };
        });
        
        // Prepare CSV data - flattened structure
        const csvRows = [];
        
        // Comprehensive header with all key metrics
        csvRows.push([
            // Basic info
            'tenant_id',
            'tenant_name', 
            'tenant_domain',
            'period',
            'start_date',
            'end_date',
            'calculated_at',
            
            // Risk Assessment
            'risk_score',
            'risk_status', 
            'risk_level',
            'external_dependency_pct',
            'saas_usage_pct',
            'total_appointments',
            'external_appointments',
            'saas_appointments',
            
            // Customer Metrics
            'new_customers_count',
            'unique_customers',
            'appointments_per_customer',
            
            // Revenue Metrics
            'total_revenue',
            'completed_appointments',
            'average_ticket',
            
            // Operational Metrics
            'appointment_success_rate',
            'cancellation_rate',
            'no_show_rate',
            
            // Full JSON for APIs
            'full_metric_json'
        ].join(','));
        
        // Process each metric
        for (const metric of metrics) {
            const tenant = tenantLookup[metric.tenant_id];
            if (!tenant) continue;
            
            const data = metric.metric_data || {};
            const kpis = data.summary_kpis || {};
            const risk = data.risk_assessment || {};
            const customers = data.customer_analysis || {};
            const revenue = data.revenue_analysis || {};
            const operational = data.operational_metrics || {};
            const period = data.period_info || {};
            
            csvRows.push([
                metric.tenant_id,
                `"${tenant.name}"`,
                tenant.domain || 'unknown',
                metric.period,
                period.start_date || '',
                period.end_date || '',
                metric.calculated_at || '',
                
                // Risk metrics
                risk.score || 0,
                `"${risk.status || 'Unknown'}"`,
                `"${risk.level || 'unknown'}"`,
                risk.external_dependency_percentage || 0,
                risk.saas_usage_percentage || 0,
                risk.total_appointments || 0,
                risk.external_appointments || 0,
                risk.saas_appointments || 0,
                
                // Customer metrics
                (data.new_customers?.count || 0),
                customers.unique_customers || 0,
                customers.appointments_per_customer || 0,
                
                // Revenue metrics
                revenue.total_revenue || 0,
                revenue.completed_appointments || 0,
                revenue.average_ticket || 0,
                
                // Operational metrics
                operational.appointment_success_rate || 0,
                operational.cancellation_rate || 0,
                operational.no_show_rate || 0,
                
                // Full JSON for APIs
                `"${JSON.stringify(metric.metric_data || {}).replace(/"/g, '""')}"`
            ].join(','));
        }
        
        // Generate filename
        const timestamp = new Date().toISOString()
            .replace(/T/, 'T')
            .replace(/:/g, '')
            .replace(/\..+/, '')
            .substring(0, 15);
        
        const filename = `CONSOLIDATED-METRICS-${timestamp}.csv`;
        
        // Write CSV
        fs.writeFileSync(filename, csvRows.join('\n'), 'utf8');
        
        console.log(`\n✅ CONSOLIDATED CSV Generated: ${filename}`);
        console.log(`📊 Total Records: ${csvRows.length - 1}`);
        console.log(`🏢 Tenants: ${tenants.length}`);
        console.log(`📈 Periods per tenant: ${metrics.length / tenants.length}`);
        
        // Show sample data
        console.log(`\n🎯 SAMPLE DATA (first 3 records):`);
        if (metrics.length > 0) {
            metrics.slice(0, 3).forEach(m => {
                const tenant = tenantLookup[m.tenant_id];
                const kpis = m.metric_data?.summary_kpis || {};
                console.log(`   ${tenant?.name || 'Unknown'} (${m.period}): Risk ${kpis.risk_score || 0}%, Revenue R$${kpis.total_revenue || 0}`);
            });
        }
        
        console.log(`\n🚀 PERFECT FOR APIs: Simply query tenant_id + period to get ALL metrics!`);
        return filename;
        
    } catch (error) {
        console.error('❌ Error generating CSV:', error.message);
        console.error(error.stack);
        throw error;
    }
}

// Run generator
if (require.main === module) {
    generateConsolidatedCSV().then((filename) => {
        console.log(`\n🎉 SUCCESS: ${filename} ready for analysis!`);
        process.exit(0);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { generateConsolidatedCSV };