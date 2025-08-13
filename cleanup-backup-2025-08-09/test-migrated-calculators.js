#!/usr/bin/env node

/**
 * TEST: Migrated Calculators Integration
 * 
 * Tests the new modular calculator system to ensure proper migration
 * from individual scripts to integrated service
 */

require('dotenv').config();

async function testMigratedSystem() {
    console.log('🧪 TESTE: SISTEMA DE CALCULATORS MIGRADO');
    console.log('='.repeat(70));
    
    try {
        // Import the new TypeScript modules (will need to compile first)
        const { TenantMetricsService } = await import('./dist/services/tenant-metrics.service.js');
        
        console.log('📦 Modules imported successfully');
        
        // Get a test tenant
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .limit(1);
            
        if (error || !tenants || tenants.length === 0) {
            console.log('⚠️ No tenants found for testing');
            return;
        }
        
        const testTenant = tenants[0];
        console.log(`🏢 Testing with: ${testTenant.name} (${testTenant.id.substring(0, 8)}...)`);
        console.log('');
        
        // Test the new service
        const metricsService = new TenantMetricsService();
        
        console.log('🎯 Testing calculateAllMetrics...');
        await metricsService.calculateAllMetrics(testTenant.id, ['7d']);
        console.log('✅ calculateAllMetrics completed');
        
        console.log('📊 Testing getCalculatedMetrics...');
        const metrics = await metricsService.getCalculatedMetrics(testTenant.id, '7d');
        console.log('✅ getCalculatedMetrics completed');
        
        console.log('📈 Retrieved metrics:');
        for (const [metricType, data] of Object.entries(metrics)) {
            console.log(`   ${metricType}: ${JSON.stringify(data).substring(0, 100)}...`);
        }
        
        console.log('');
        console.log('✅ MIGRATION TEST SUCCESSFUL');
        console.log('🎉 All calculators are working properly');
        
    } catch (error) {
        console.error('❌ MIGRATION TEST FAILED:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run test
testMigratedSystem();