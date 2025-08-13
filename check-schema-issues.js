#!/usr/bin/env node
/**
 * Check database schema issues for validation framework
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkSchemaIssues() {
    console.log('🔍 Investigating validation framework schema issues...\n');
    
    try {
        // Check tenant_metrics table structure
        console.log('1. Checking tenant_metrics table...');
        const { data: tenantMetrics, error: tmError } = await supabase
            .from('tenant_metrics')
            .select('*')
            .limit(1);
        
        if (tmError) {
            console.error('❌ tenant_metrics error:', tmError.message);
        } else {
            console.log('✅ tenant_metrics table accessible');
            if (tenantMetrics.length > 0) {
                console.log('   Sample columns:', Object.keys(tenantMetrics[0]));
            }
        }
        
        // Check validation_results table
        console.log('\n2. Checking validation_results table...');
        const { data: validationResults, error: vrError } = await supabase
            .from('validation_results')
            .select('*')
            .limit(1);
        
        if (vrError) {
            console.error('❌ validation_results error:', vrError.message);
        } else {
            console.log('✅ validation_results table accessible');
            if (validationResults.length > 0) {
                console.log('   Sample columns:', Object.keys(validationResults[0]));
            }
        }
        
        // Check if validate_revenue_consistency function exists
        console.log('\n3. Testing revenue validation function...');
        const { data: revFunction, error: rfError } = await supabase
            .rpc('validate_revenue_consistency', { tenant_uuid: 'c3aa73f8-db80-40db-a9c4-73718a0fee34' });
        
        if (rfError) {
            console.error('❌ validate_revenue_consistency function error:', rfError.message);
            console.log('   Hint:', rfError.hint || 'No hint provided');
        } else {
            console.log('✅ validate_revenue_consistency function works');
        }
        
        // Test a simple tenant_metrics query to see what columns exist
        console.log('\n4. Testing tenant_metrics columns...');
        const { data: tmColumns, error: tcError } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, ai_efficiency_score')
            .eq('tenant_id', 'c3aa73f8-db80-40db-a9c4-73718a0fee34')
            .limit(1);
        
        if (tcError) {
            console.error('❌ ai_efficiency_score column error:', tcError.message);
        } else {
            console.log('✅ ai_efficiency_score column exists');
        }
        
    } catch (error) {
        console.error('💥 General error:', error.message);
    }
}

checkSchemaIssues();