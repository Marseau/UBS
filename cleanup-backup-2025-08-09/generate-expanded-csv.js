#!/usr/bin/env node

/**
 * Generate EXPANDED CSV with all JSON fields opened as separate columns
 * Much easier for analysis in Excel/Google Sheets
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateExpandedCSV() {
    console.log('📋 Generating EXPANDED CSV - All JSON fields as columns');
    console.log('🎯 Perfect for Excel/Google Sheets analysis');
    console.log('=' .repeat(60));
    
    try {
        // Get all data
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name, domain')
            .eq('status', 'active');
        
        const { data: metrics, error } = await supabase
            .from('tenant_metrics')
            .select('*')
            .eq('metric_type', 'consolidated')
            .order('tenant_id', { ascending: true })
            .order('period', { ascending: true });
        
        if (tenantsError || error) {
            throw tenantsError || error;
        }
        
        console.log(`🏢 Processing ${tenants.length} tenants`);
        console.log(`📈 Expanding ${metrics.length} consolidated metrics`);
        
        // Create tenant lookup
        const tenantLookup = {};
        tenants.forEach(tenant => {
            tenantLookup[tenant.id] = {
                name: tenant.name,
                domain: tenant.domain
            };
        });
        
        // Prepare CSV with ALL fields expanded
        const csvRows = [];
        
        // COMPREHENSIVE HEADER - All JSON fields opened
        csvRows.push([
            // Basic Info
            'tenant_id',
            'tenant_name', 
            'tenant_domain',
            'period',
            'calculated_at',
            
            // Period Info
            'period_start_date',
            'period_end_date',
            
            // Summary KPIs (for quick reference)
            'summary_risk_score',
            'summary_total_revenue',
            'summary_new_customers_count',
            'summary_success_rate',
            'summary_unique_customers',
            
            // Risk Assessment (detailed)
            'risk_score',
            'risk_status',
            'risk_level', 
            'risk_external_dependency_pct',
            'risk_saas_usage_pct',
            'risk_total_appointments',
            'risk_external_appointments',
            'risk_saas_appointments',
            
            // New Customers
            'new_customers_count',
            'new_customers_growth_analysis',
            
            // Revenue Analysis (detailed)
            'revenue_total',
            'revenue_completed_appointments',
            'revenue_average_ticket',
            'revenue_by_service_count', // number of different services
            'revenue_top_service', // highest revenue service
            'revenue_top_service_amount',
            
            // Operational Metrics
            'operational_appointment_success_rate',
            'operational_cancellation_rate', 
            'operational_no_show_rate',
            'operational_completed_count',
            'operational_cancelled_count',
            'operational_no_show_count',
            'operational_confirmed_count',
            'operational_rescheduled_count',
            'operational_other_status_count',
            
            // Customer Analysis
            'customer_unique_customers',
            'customer_new_customers',
            'customer_appointments_per_customer',
            
            // Full JSON (backup for complex analysis)
            'full_json_backup'
        ].join(','));
        
        // Process each metric and expand all JSON fields
        for (const metric of metrics) {
            const tenant = tenantLookup[metric.tenant_id];
            if (!tenant) continue;
            
            const data = metric.metric_data || {};
            
            // Extract all nested data
            const period = data.period_info || {};
            const summary = data.summary_kpis || {};
            const risk = data.risk_assessment || {};
            const newCustomers = data.new_customers || {};
            const revenue = data.revenue_analysis || {};
            const operational = data.operational_metrics || {};
            const customer = data.customer_analysis || {};
            
            // Process revenue by service
            const revenueByService = revenue.revenue_by_service || {};
            const services = Object.entries(revenueByService);
            const topService = services.length > 0 ? 
                services.reduce((max, curr) => curr[1] > max[1] ? curr : max) : ['', 0];
            
            // Process status distribution
            const statusDist = operational.status_distribution || {};
            
            csvRows.push([
                // Basic Info
                metric.tenant_id,
                `"${tenant.name}"`,
                tenant.domain || '',
                metric.period,
                metric.calculated_at || '',
                
                // Period Info
                period.start_date || '',
                period.end_date || '',
                
                // Summary KPIs
                summary.risk_score || 0,
                summary.total_revenue || 0,
                summary.new_customers_count || 0,
                summary.success_rate || 0,
                summary.unique_customers || 0,
                
                // Risk Assessment
                risk.score || 0,
                `"${risk.status || ''}"`,
                `"${risk.level || ''}"`,
                risk.external_dependency_percentage || 0,
                risk.saas_usage_percentage || 0,
                risk.total_appointments || 0,
                risk.external_appointments || 0,
                risk.saas_appointments || 0,
                
                // New Customers  
                newCustomers.count || 0,
                `"${newCustomers.growth_analysis || ''}"`,
                
                // Revenue Analysis
                revenue.total_revenue || 0,
                revenue.completed_appointments || 0,
                revenue.average_ticket || 0,
                services.length || 0,
                `"${topService[0] || ''}"`,
                topService[1] || 0,
                
                // Operational Metrics
                operational.appointment_success_rate || 0,
                operational.cancellation_rate || 0,
                operational.no_show_rate || 0,
                statusDist.completed || 0,
                statusDist.cancelled || 0,
                statusDist.no_show || 0,
                statusDist.confirmed || 0,
                statusDist.rescheduled || 0,
                Object.values(statusDist).reduce((sum, val) => sum + val, 0) - 
                    (statusDist.completed || 0) - (statusDist.cancelled || 0) - 
                    (statusDist.no_show || 0) - (statusDist.confirmed || 0) - (statusDist.rescheduled || 0),
                
                // Customer Analysis
                customer.unique_customers || 0,
                customer.new_customers || 0,
                customer.appointments_per_customer || 0,
                
                // Full JSON backup
                `"${JSON.stringify(metric.metric_data || {}).replace(/"/g, '""')}"`
            ].join(','));
        }
        
        // Generate filename
        const timestamp = new Date().toISOString()
            .replace(/T/, 'T')
            .replace(/:/g, '')
            .replace(/\..+/, '')
            .substring(0, 15);
        
        const filename = `EXPANDED-METRICS-${timestamp}.csv`;
        
        // Write CSV
        fs.writeFileSync(filename, csvRows.join('\n'), 'utf8');
        
        console.log(`\n✅ EXPANDED CSV Generated: ${filename}`);
        console.log(`📊 Total Records: ${csvRows.length - 1}`);
        console.log(`📋 Total Columns: ${csvRows[0].split(',').length}`);
        
        // Show sample expanded data
        console.log(`\n🎯 EXPANDED FIELDS SAMPLE:`);
        if (metrics.length > 0) {
            const sample = metrics[0];
            const tenant = tenantLookup[sample.tenant_id];
            const data = sample.metric_data || {};
            
            console.log(`   Tenant: ${tenant?.name || 'Unknown'} (${sample.period})`);
            console.log(`   Risk Score: ${data.summary_kpis?.risk_score || 0}%`);
            console.log(`   Total Revenue: R$${data.summary_kpis?.total_revenue || 0}`);
            console.log(`   Success Rate: ${data.operational_metrics?.appointment_success_rate || 0}%`);
            console.log(`   Unique Customers: ${data.customer_analysis?.unique_customers || 0}`);
        }
        
        console.log(`\n🎊 PERFECT FOR ANALYSIS:`);
        console.log(`   📈 All JSON fields opened as columns`);
        console.log(`   📊 Easy filtering and pivot tables`);  
        console.log(`   🔍 No need to parse JSON manually`);
        console.log(`   📋 Backup JSON column for complex queries`);
        
        return filename;
        
    } catch (error) {
        console.error('❌ Error generating expanded CSV:', error.message);
        throw error;
    }
}

// Run generator
if (require.main === module) {
    generateExpandedCSV().then((filename) => {
        console.log(`\n🎉 SUCCESS: ${filename} ready for analysis!`);
        console.log('📁 All JSON fields are now separate columns for easy Excel/Sheets work!');
        process.exit(0);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { generateExpandedCSV };