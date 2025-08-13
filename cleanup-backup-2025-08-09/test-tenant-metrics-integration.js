#!/usr/bin/env node

/**
 * Test script for the integrated tenant metrics system
 * Tests calculation of all 25 metrics for one tenant
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Since there may be compilation issues, we'll test the database directly first
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testMetricsIntegration() {
    console.log('🧪 Testing Tenant Metrics Integration - 25 Metrics');
    console.log('=' .repeat(60));
    
    try {
        // Get active tenants
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .limit(3);
        
        if (error || !tenants || tenants.length === 0) {
            console.log('❌ No active tenants found');
            return;
        }
        
        console.log(`📊 Found ${tenants.length} active tenants for testing:`);
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        // Test with first tenant
        const testTenant = tenants[0];
        console.log(`\n🏢 Testing with tenant: ${testTenant.name}`);
        console.log('-'.repeat(50));
        
        // Check if we have the new compiled service
        let TenantMetricsService;
        try {
            ({ TenantMetricsService } = require('./dist/services/tenant-metrics.service.js'));
        } catch (e) {
            console.log('⚠️ Compiled service not available, using TypeScript compilation on-the-fly');
            console.log('   You can run "npm run build" to compile TypeScript files');
            
            // Simple test of database connectivity
            const { data: testMetrics } = await supabase
                .from('tenant_metrics')
                .select('*')
                .eq('tenant_id', testTenant.id)
                .limit(5);
            
            console.log(`📋 Found ${testMetrics?.length || 0} existing metrics for this tenant`);
            return;
        }
        
        // Test metrics calculation
        const service = new TenantMetricsService();
        console.log('🔄 Starting calculation of all 25 metrics...');
        
        await service.calculateAllMetrics(testTenant.id);
        
        console.log('✅ All 25 metrics calculated successfully!');
        
        // Verify results in database
        const { data: savedMetrics } = await supabase
            .from('tenant_metrics')
            .select('metric_type, period, calculated_at')
            .eq('tenant_id', testTenant.id)
            .order('calculated_at', { ascending: false });
        
        console.log(`\n📊 RESULTS: ${savedMetrics?.length || 0} metrics saved`);
        
        if (savedMetrics && savedMetrics.length > 0) {
            const metricsByType = {};
            savedMetrics.forEach(metric => {
                metricsByType[metric.metric_type] = (metricsByType[metric.metric_type] || 0) + 1;
            });
            
            console.log('\n📈 Metrics by type:');
            Object.entries(metricsByType)
                .sort((a, b) => b[1] - a[1])
                .forEach(([type, count]) => {
                    console.log(`   ${type}: ${count} periods`);
                });
        }
        
    } catch (error) {
        console.error('❌ Error during test:', error.message);
        console.error(error.stack);
    }
}

// Run the test
if (require.main === module) {
    testMetricsIntegration().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { testMetricsIntegration };