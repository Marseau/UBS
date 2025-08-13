#!/usr/bin/env node

/**
 * Generate CSV with all 25 metrics from tenant_metrics table
 * Simplified version that works with existing data
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateTenantMetricsCSV() {
    console.log('📊 Generating Tenant Metrics CSV - All 25 Metrics');
    console.log('=' .repeat(60));
    
    try {
        // Get all tenants for context
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name, domain')
            .eq('status', 'active');
        
        if (tenantsError) throw tenantsError;
        
        console.log(`🏢 Found ${tenants.length} active tenants`);
        
        // Get all metrics data
        const { data: metrics, error } = await supabase
            .from('tenant_metrics')
            .select('*')
            .order('tenant_id', { ascending: true })
            .order('period', { ascending: true })
            .order('metric_type', { ascending: true });
        
        if (error) throw error;
        
        console.log(`📈 Found ${metrics.length} total metric records`);
        
        // Create tenant lookup
        const tenantLookup = {};
        tenants.forEach(tenant => {
            tenantLookup[tenant.id] = {
                name: tenant.name,
                domain: tenant.domain
            };
        });
        
        // Prepare CSV data - flatten all metrics
        const csvRows = [];
        
        // Header
        csvRows.push([
            'tenant_id',
            'tenant_name', 
            'tenant_domain',
            'metric_type',
            'period',
            'calculated_at',
            'metric_data_json',
            'metric_summary'
        ].join(','));
        
        let totalMetricTypes = new Set();
        let metricsByTenant = {};
        
        // Process each metric
        for (const metric of metrics) {
            const tenant = tenantLookup[metric.tenant_id];
            if (!tenant) continue;
            
            totalMetricTypes.add(metric.metric_type);
            
            if (!metricsByTenant[metric.tenant_id]) {
                metricsByTenant[metric.tenant_id] = [];
            }
            metricsByTenant[metric.tenant_id].push(metric);
            
            // Extract summary from metric data
            let summary = '';
            try {
                const data = metric.metric_data;
                if (typeof data === 'object' && data !== null) {
                    // Extract key metrics for summary
                    if (metric.metric_type === 'risk_assessment') {
                        summary = `Score: ${data.score}% (${data.status})`;
                    } else if (metric.metric_type === 'evolution') {
                        summary = `Growth: ${data.growthRate}% (${data.grandTotal} tenants)`;
                    } else if (data.success_percentage !== undefined) {
                        summary = `Success: ${data.success_percentage}%`;
                    } else if (data.cancellation_percentage !== undefined) {
                        summary = `Cancellation: ${data.cancellation_percentage}%`;
                    } else if (data.count !== undefined) {
                        summary = `Count: ${data.count}`;
                    } else if (data.current_revenue !== undefined) {
                        summary = `Revenue: R$${data.current_revenue}`;
                    } else {
                        summary = 'Data available';
                    }
                } else {
                    summary = 'No data';
                }
            } catch (e) {
                summary = 'Parse error';
            }
            
            csvRows.push([
                metric.tenant_id,
                `"${tenant.name}"`,
                tenant.domain || 'unknown',
                metric.metric_type,
                metric.period,
                metric.calculated_at || metric.creation_date || 'unknown',
                `"${JSON.stringify(metric.metric_data || {}).replace(/"/g, '""')}"`,
                `"${summary}"`
            ].join(','));
        }
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString()
            .replace(/T/, '-')
            .replace(/:/g, '')
            .replace(/\..+/, '')
            .replace(/-/g, '');
        
        const filename = `TODAS-AS-25-METRICAS-${timestamp}.csv`;
        
        // Write CSV file
        fs.writeFileSync(filename, csvRows.join('\n'), 'utf8');
        
        console.log(`\n✅ CSV Generated: ${filename}`);
        console.log(`📊 Total Records: ${csvRows.length - 1}`);
        console.log(`🏢 Tenants with Metrics: ${Object.keys(metricsByTenant).length}`);
        console.log(`📈 Unique Metric Types: ${totalMetricTypes.size}`);
        
        console.log(`\n📋 Metric Types Found:`);
        Array.from(totalMetricTypes).sort().forEach(type => {
            const count = metrics.filter(m => m.metric_type === type).length;
            console.log(`   ${type}: ${count} records`);
        });
        
        console.log(`\n🎯 Metrics by Tenant:`);
        Object.entries(metricsByTenant)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 5)
            .forEach(([tenantId, tenantMetrics]) => {
                const tenant = tenantLookup[tenantId];
                console.log(`   ${tenant.name}: ${tenantMetrics.length} metrics`);
            });
        
        return filename;
        
    } catch (error) {
        console.error('❌ Error generating CSV:', error.message);
        console.error(error.stack);
        throw error;
    }
}

// Run the generator
if (require.main === module) {
    generateTenantMetricsCSV().then((filename) => {
        console.log(`\n🎉 SUCCESS: Generated ${filename}`);
        console.log('📁 File ready for analysis!');
        process.exit(0);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { generateTenantMetricsCSV };