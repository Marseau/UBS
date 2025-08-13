#!/usr/bin/env node
/**
 * Inspect real database schema structure
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function inspectSchema() {
    console.log('🔍 Inspecting real database schema...\n');
    
    try {
        // 1. Check tenants table structure
        console.log('1. Checking tenants table columns...');
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', 'c3aa73f8-db80-40db-a9c4-73718a0fee34')
            .limit(1)
            .single();
            
        if (!tenantError && tenant) {
            console.log('✅ Tenants table columns:', Object.keys(tenant));
            console.log('   Sample data:');
            Object.entries(tenant).forEach(([key, value]) => {
                console.log(`   ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
            });
        } else {
            console.log('❌ Tenants table error:', tenantError?.message);
        }
        
        // 2. Check tenant_metrics structure
        console.log('\n2. Checking tenant_metrics data...');
        const { data: metrics, error: metricsError } = await supabase
            .from('tenant_metrics')
            .select('*')
            .eq('tenant_id', 'c3aa73f8-db80-40db-a9c4-73718a0fee34')
            .limit(3);
            
        if (!metricsError && metrics) {
            console.log('✅ Tenant_metrics table columns:', Object.keys(metrics[0] || {}));
            console.log(`   Found ${metrics.length} records`);
            metrics.forEach((metric, i) => {
                console.log(`   Record ${i + 1}:`);
                console.log(`     Type: ${metric.metric_type}`);
                console.log(`     Data keys: ${Object.keys(metric.metric_data || {})}`);;
                console.log(`     Period: ${metric.period}`);
            });
        } else {
            console.log('❌ Tenant_metrics error:', metricsError?.message);
        }
        
        // 3. Check appointments table
        console.log('\n3. Checking appointments table...');
        const { data: appointments, error: appointmentsError } = await supabase
            .from('appointments')
            .select('*')
            .eq('tenant_id', 'c3aa73f8-db80-40db-a9c4-73718a0fee34')
            .limit(1);
            
        if (!appointmentsError && appointments?.length > 0) {
            console.log('✅ Appointments table columns:', Object.keys(appointments[0]));
            console.log(`   Found ${appointments.length} appointments for this tenant`);
        } else {
            console.log('❌ Appointments error or no data:', appointmentsError?.message || 'No appointments found');
        }
        
        // 4. Check validation_results table structure
        console.log('\n4. Checking validation_results table...');
        const { data: validationResults, error: vrError } = await supabase
            .from('validation_results')
            .select('*')
            .limit(1);
            
        if (!vrError && validationResults?.length > 0) {
            console.log('✅ Validation_results table columns:', Object.keys(validationResults[0]));
        } else {
            console.log('❌ Validation_results error:', vrError?.message || 'No validation results found');
        }
        
        // 5. Test what types of metrics exist across all tenants
        console.log('\n5. Checking all metric types in system...');
        const { data: allMetricTypes, error: allError } = await supabase
            .from('tenant_metrics')
            .select('metric_type')
            .limit(1000);
            
        if (!allError && allMetricTypes) {
            const uniqueTypes = [...new Set(allMetricTypes.map(m => m.metric_type))];
            console.log('✅ All metric types in system:', uniqueTypes);
        } else {
            console.log('❌ All metrics error:', allError?.message);
        }
        
    } catch (error) {
        console.error('💥 General error:', error.message);
    }
}

inspectSchema();