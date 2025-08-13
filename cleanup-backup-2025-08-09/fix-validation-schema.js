#!/usr/bin/env node
/**
 * Fix validation framework schema issues
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function fixValidationSchema() {
    console.log('🔧 Fixing validation framework schema issues...\n');
    
    try {
        // 1. Test current revenue validation function with correct parameter name
        console.log('1. Testing revenue validation function with p_tenant_id...');
        try {
            const { data: revFunction, error: rfError } = await supabase
                .rpc('validate_revenue_consistency', { p_tenant_id: 'c3aa73f8-db80-40db-a9c4-73718a0fee34' });
            
            if (rfError) {
                console.error('❌ validate_revenue_consistency still failing:', rfError.message);
            } else {
                console.log('✅ validate_revenue_consistency works with p_tenant_id parameter');
                console.log('   Result:', revFunction);
            }
        } catch (error) {
            console.error('❌ Function test failed:', error.message);
        }
        
        // 2. Check actual metric_data structure to understand how AI efficiency is stored
        console.log('\n2. Analyzing tenant_metrics.metric_data structure...');
        const { data: metricSamples, error: msError } = await supabase
            .from('tenant_metrics')
            .select('metric_type, metric_data')
            .eq('tenant_id', 'c3aa73f8-db80-40db-a9c4-73718a0fee34')
            .limit(5);
        
        if (msError) {
            console.error('❌ Failed to fetch metric samples:', msError.message);
        } else {
            console.log('✅ Found metric data samples:');
            metricSamples.forEach(sample => {
                console.log(`   Type: ${sample.metric_type}`);
                console.log(`   Data keys:`, Object.keys(sample.metric_data || {}));
                if (sample.metric_data && sample.metric_data.ai_efficiency_score) {
                    console.log(`   AI Efficiency Score: ${sample.metric_data.ai_efficiency_score}`);
                }
            });
        }
        
        // 3. Test validation_results insert to check for NOT NULL constraints
        console.log('\n3. Testing validation_results constraints...');
        const testResult = {
            tenant_id: 'c3aa73f8-db80-40db-a9c4-73718a0fee34',
            validation_type: 'SCHEMA_TEST',
            metric_name: 'test_metric',
            field_name: 'test_field',
            status: 'PASSED',
            score: 100.0,
            passed: true,
            details: [{ test: 'constraint check' }],
            recommendations: ['Test recommendation'],
            execution_time_ms: 100
        };
        
        const { data: insertResult, error: insertError } = await supabase
            .from('validation_results')
            .insert(testResult)
            .select();
        
        if (insertError) {
            console.error('❌ validation_results insert failed:', insertError.message);
        } else {
            console.log('✅ validation_results insert works');
            // Clean up test record
            await supabase
                .from('validation_results')
                .delete()
                .eq('validation_type', 'SCHEMA_TEST');
        }
        
    } catch (error) {
        console.error('💥 General error:', error.message);
    }
}

fixValidationSchema();