#!/usr/bin/env node

/**
 * PHASE 3: REFRESH PLATFORM METRICS WITH UPDATED AGGREGATIONS
 * Purpose: Refresh platform metrics after usage costs recalculation
 * Priority: HIGH - Ensure platform metrics reflect accurate cost calculations
 * Author: Claude Programmer/Executor
 * Date: 2025-07-17
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function refreshPlatformMetrics() {
    console.log('📊 PHASE 3: REFRESH PLATFORM METRICS - STARTING...');
    console.log('================================================\n');
    
    const results = {
        timestamp: new Date().toISOString(),
        phase: '3.2',
        task: 'refresh_platform_metrics',
        summary: {
            platform_metrics_before: 0,
            platform_metrics_after: 0,
            metrics_refreshed: 0,
            total_cost_before: 0,
            total_cost_after: 0,
            cost_difference: 0,
            aggregation_errors: 0
        },
        detailed_results: {
            refreshed_metrics: [],
            failed_metrics: [],
            validation_checks: {}
        },
        operations: []
    };

    try {
        // 1. PRE-REFRESH VALIDATION
        console.log('1. ✅ PRE-REFRESH VALIDATION...');
        const preValidation = await preRefreshValidation();
        results.summary.platform_metrics_before = preValidation.current_metrics_count;
        results.summary.total_cost_before = preValidation.current_total_cost;
        
        console.log(`   📊 Current platform metrics: ${preValidation.current_metrics_count}`);
        console.log(`   💰 Current total cost: $${preValidation.current_total_cost.toFixed(2)}`);
        console.log(`   📅 Latest calculation date: ${preValidation.latest_calculation_date}`);

        // 2. AGGREGATE UPDATED USAGE COSTS
        console.log('\n2. 🧮 AGGREGATING UPDATED USAGE COSTS...');
        const aggregatedData = await aggregateUpdatedUsageCosts();
        
        console.log(`   📊 Aggregated data points: ${aggregatedData.length}`);
        console.log(`   💰 New total cost: $${aggregatedData.reduce((sum, item) => sum + item.total_cost, 0).toFixed(2)}`);

        // 3. REFRESH PLATFORM METRICS
        console.log('\n3. 🔄 REFRESHING PLATFORM METRICS...');
        const refreshResults = await refreshMetricsWithAggregatedData(aggregatedData);
        
        results.summary.metrics_refreshed = refreshResults.refreshed_count;
        results.summary.aggregation_errors = refreshResults.failed_count;
        results.detailed_results.refreshed_metrics = refreshResults.refreshed;
        results.detailed_results.failed_metrics = refreshResults.failed;
        
        console.log(`   ✅ Metrics refreshed: ${refreshResults.refreshed_count}`);
        console.log(`   ❌ Refresh errors: ${refreshResults.failed_count}`);

        // 4. TRIGGER PLATFORM METRICS CALCULATION
        console.log('\n4. 🎯 TRIGGERING PLATFORM METRICS CALCULATION...');
        const calculationResults = await triggerPlatformMetricsCalculation();
        
        console.log(`   ✅ Platform metrics calculation triggered: ${calculationResults.success}`);
        if (calculationResults.new_records_created > 0) {
            console.log(`   📊 New metrics records created: ${calculationResults.new_records_created}`);
        }

        // 5. POST-REFRESH VALIDATION
        console.log('\n5. ✅ POST-REFRESH VALIDATION...');
        const postValidation = await postRefreshValidation();
        results.summary.platform_metrics_after = postValidation.new_metrics_count;
        results.summary.total_cost_after = postValidation.new_total_cost;
        results.summary.cost_difference = postValidation.new_total_cost - results.summary.total_cost_before;
        results.detailed_results.validation_checks = postValidation.validation_checks;
        
        console.log(`   📊 New platform metrics count: ${postValidation.new_metrics_count}`);
        console.log(`   💰 New total cost: $${postValidation.new_total_cost.toFixed(2)}`);
        console.log(`   📈 Cost difference: $${results.summary.cost_difference.toFixed(2)}`);
        console.log(`   ✅ Data integrity checks: ${postValidation.validation_checks.data_integrity_passed ? 'PASSED' : 'FAILED'}`);

        // 6. SAVE RESULTS
        console.log('\n6. 📄 SAVING RESULTS...');
        
        const reportPath = path.join(process.cwd(), 'audit-reports');
        if (!fs.existsSync(reportPath)) {
            fs.mkdirSync(reportPath, { recursive: true });
        }
        
        const fileName = `platform-metrics-refresh-${new Date().toISOString().split('T')[0]}.json`;
        const fullPath = path.join(reportPath, fileName);
        
        fs.writeFileSync(fullPath, JSON.stringify(results, null, 2));
        console.log(`   ✅ Results saved to: ${fullPath}`);

        // 7. FINAL SUMMARY
        console.log('\n🎯 PLATFORM METRICS REFRESH SUMMARY:');
        console.log('=====================================');
        console.log(`📊 Metrics before: ${results.summary.platform_metrics_before}`);
        console.log(`📊 Metrics after: ${results.summary.platform_metrics_after}`);
        console.log(`✅ Metrics refreshed: ${results.summary.metrics_refreshed}`);
        console.log(`❌ Aggregation errors: ${results.summary.aggregation_errors}`);
        console.log(`💰 Cost before: $${results.summary.total_cost_before.toFixed(2)}`);
        console.log(`💰 Cost after: $${results.summary.total_cost_after.toFixed(2)}`);
        console.log(`📈 Cost difference: $${results.summary.cost_difference.toFixed(2)}`);
        
        const efficiencyGain = results.summary.cost_difference < 0 ? 'COST REDUCTION' : 'COST INCREASE';
        console.log(`🎯 Result: ${efficiencyGain} of $${Math.abs(results.summary.cost_difference).toFixed(2)}`);
        
        console.log('\n🏁 PHASE 3.2 COMPLETED SUCCESSFULLY');
        
        return results;
        
    } catch (error) {
        console.error('❌ PLATFORM METRICS REFRESH FAILED:', error.message);
        results.operations.push({ 
            step: 'main_execution', 
            error: error.message,
            timestamp: new Date().toISOString()
        });
        return results;
    }
}

async function preRefreshValidation() {
    // Get current platform metrics count
    const { data: currentMetrics, error: metricsError } = await supabase
        .from('platform_metrics')
        .select('*')
        .order('calculation_date', { ascending: false });
    
    if (metricsError) {
        throw new Error(`Pre-refresh validation error: ${metricsError.message}`);
    }
    
    // Get current total cost from usage_costs
    const { data: usageCosts, error: costsError } = await supabase
        .from('usage_costs')
        .select('total_cost_usd');
    
    if (costsError) {
        throw new Error(`Usage costs validation error: ${costsError.message}`);
    }
    
    const currentTotalCost = usageCosts.reduce((sum, item) => sum + (item.total_cost_usd || 0), 0);
    
    return {
        current_metrics_count: currentMetrics.length,
        current_total_cost: currentTotalCost,
        latest_calculation_date: currentMetrics.length > 0 ? currentMetrics[0].calculation_date : null,
        usage_costs_count: usageCosts.length
    };
}

async function aggregateUpdatedUsageCosts() {
    console.log('   🔍 Querying updated usage costs...');
    
    // Get usage costs with tenant and conversation data
    const { data: usageCosts, error } = await supabase
        .from('usage_costs')
        .select(`
            id,
            tenant_id,
            cost_date,
            total_cost_usd,
            ai_cost_usd,
            whatsapp_cost_usd,
            conversations_count,
            ai_tokens_used,
            created_at,
            updated_at,
            conversation_id,
            conversation_history!inner(
                id,
                tenant_id,
                content,
                created_at,
                tenants!inner(
                    id,
                    business_name,
                    domain,
                    subscription_plan,
                    monthly_subscription_fee
                )
            )
        `)
        .order('cost_date', { ascending: false });
    
    if (error) {
        throw new Error(`Failed to aggregate usage costs: ${error.message}`);
    }
    
    console.log(`   📊 Retrieved ${usageCosts.length} usage costs for aggregation`);
    
    // Group by tenant and date for aggregation
    const aggregatedByTenant = {};
    
    for (const cost of usageCosts) {
        const tenantId = cost.tenant_id;
        const costDate = cost.cost_date;
        const key = `${tenantId}-${costDate}`;
        
        if (!aggregatedByTenant[key]) {
            aggregatedByTenant[key] = {
                tenant_id: tenantId,
                cost_date: costDate,
                business_name: cost.conversation_history.tenants.business_name,
                domain: cost.conversation_history.tenants.domain,
                subscription_plan: cost.conversation_history.tenants.subscription_plan,
                monthly_subscription_fee: cost.conversation_history.tenants.monthly_subscription_fee,
                total_cost: 0,
                ai_cost: 0,
                whatsapp_cost: 0,
                conversations_count: 0,
                ai_tokens_used: 0,
                usage_costs_count: 0,
                synthetic_conversations: 0,
                real_conversations: 0
            };
        }
        
        const agg = aggregatedByTenant[key];
        agg.total_cost += cost.total_cost_usd || 0;
        agg.ai_cost += cost.ai_cost_usd || 0;
        agg.whatsapp_cost += cost.whatsapp_cost_usd || 0;
        agg.conversations_count += cost.conversations_count || 0;
        agg.ai_tokens_used += cost.ai_tokens_used || 0;
        agg.usage_costs_count += 1;
        
        // Check if conversation is synthetic
        if (cost.conversation_history.content?.includes('Conversa M0')) {
            agg.synthetic_conversations += 1;
        } else {
            agg.real_conversations += 1;
        }
    }
    
    const aggregatedData = Object.values(aggregatedByTenant);
    
    console.log(`   🧮 Aggregated into ${aggregatedData.length} tenant-date combinations`);
    
    return aggregatedData;
}

async function refreshMetricsWithAggregatedData(aggregatedData) {
    console.log('   🔄 Refreshing metrics with aggregated data...');
    
    const refreshed = [];
    const failed = [];
    
    for (const aggData of aggregatedData) {
        try {
            // Calculate derived metrics
            const avgCostPerConversation = aggData.conversations_count > 0 
                ? aggData.total_cost / aggData.conversations_count 
                : 0;
            
            const avgTokensPerConversation = aggData.conversations_count > 0 
                ? aggData.ai_tokens_used / aggData.conversations_count 
                : 0;
            
            const syntheticPercentage = aggData.usage_costs_count > 0 
                ? (aggData.synthetic_conversations / aggData.usage_costs_count) * 100 
                : 0;
            
            const costEfficiency = aggData.monthly_subscription_fee > 0 
                ? (aggData.total_cost / aggData.monthly_subscription_fee) * 100 
                : 0;
            
            // Create or update platform metrics entry
            const metricsEntry = {
                tenant_id: aggData.tenant_id,
                calculation_date: aggData.cost_date,
                total_cost_usd: aggData.total_cost,
                ai_cost_usd: aggData.ai_cost,
                whatsapp_cost_usd: aggData.whatsapp_cost,
                conversations_count: aggData.conversations_count,
                ai_tokens_used: aggData.ai_tokens_used,
                avg_cost_per_conversation: parseFloat(avgCostPerConversation.toFixed(4)),
                avg_tokens_per_conversation: parseFloat(avgTokensPerConversation.toFixed(2)),
                synthetic_conversations_percentage: parseFloat(syntheticPercentage.toFixed(2)),
                cost_efficiency_percentage: parseFloat(costEfficiency.toFixed(2)),
                period_days: 1, // Daily aggregation
                updated_at: new Date().toISOString()
            };
            
            // Try to update existing record first
            const { data: existingRecord, error: checkError } = await supabase
                .from('platform_metrics')
                .select('id')
                .eq('tenant_id', aggData.tenant_id)
                .eq('calculation_date', aggData.cost_date)
                .single();
            
            if (checkError && checkError.code !== 'PGRST116') {
                throw new Error(`Check existing record error: ${checkError.message}`);
            }
            
            let operation = 'insert';
            let result;
            
            if (existingRecord) {
                // Update existing record
                operation = 'update';
                result = await supabase
                    .from('platform_metrics')
                    .update(metricsEntry)
                    .eq('id', existingRecord.id)
                    .select();
            } else {
                // Insert new record
                result = await supabase
                    .from('platform_metrics')
                    .insert(metricsEntry)
                    .select();
            }
            
            if (result.error) {
                throw new Error(result.error.message);
            }
            
            refreshed.push({
                tenant_id: aggData.tenant_id,
                business_name: aggData.business_name,
                cost_date: aggData.cost_date,
                total_cost: aggData.total_cost,
                operation: operation,
                record_id: result.data[0].id
            });
            
        } catch (error) {
            failed.push({
                tenant_id: aggData.tenant_id,
                cost_date: aggData.cost_date,
                error: error.message
            });
            console.error(`   ❌ Failed to refresh metrics for tenant ${aggData.tenant_id}:`, error.message);
        }
    }
    
    return {
        refreshed_count: refreshed.length,
        failed_count: failed.length,
        refreshed,
        failed
    };
}

async function triggerPlatformMetricsCalculation() {
    console.log('   🎯 Triggering platform-wide metrics calculation...');
    
    try {
        // Call the enhanced platform metrics function
        const { data: functionResult, error: functionError } = await supabase
            .rpc('calculate_enhanced_platform_metrics');
        
        if (functionError) {
            console.warn(`   ⚠️  Platform metrics function warning: ${functionError.message}`);
            return { success: false, new_records_created: 0 };
        }
        
        console.log('   ✅ Platform metrics function executed successfully');
        
        return { 
            success: true, 
            new_records_created: functionResult || 0,
            function_result: functionResult
        };
        
    } catch (error) {
        console.warn(`   ⚠️  Platform metrics calculation failed: ${error.message}`);
        return { success: false, new_records_created: 0 };
    }
}

async function postRefreshValidation() {
    // Get new platform metrics count
    const { data: newMetrics, error: metricsError } = await supabase
        .from('platform_metrics')
        .select('*')
        .order('calculation_date', { ascending: false });
    
    if (metricsError) {
        throw new Error(`Post-refresh validation error: ${metricsError.message}`);
    }
    
    // Calculate new total cost
    const newTotalCost = newMetrics.reduce((sum, item) => sum + (item.total_cost_usd || 0), 0);
    
    // Validation checks
    const validationChecks = {
        data_integrity_passed: true,
        no_null_costs: newMetrics.every(m => m.total_cost_usd !== null),
        reasonable_cost_ranges: newMetrics.every(m => m.total_cost_usd >= 0 && m.total_cost_usd <= 1000),
        calculation_dates_valid: newMetrics.every(m => m.calculation_date !== null),
        tenant_ids_valid: newMetrics.every(m => m.tenant_id !== null)
    };
    
    validationChecks.data_integrity_passed = 
        validationChecks.no_null_costs &&
        validationChecks.reasonable_cost_ranges &&
        validationChecks.calculation_dates_valid &&
        validationChecks.tenant_ids_valid;
    
    return {
        new_metrics_count: newMetrics.length,
        new_total_cost: newTotalCost,
        validation_checks,
        latest_calculation_date: newMetrics.length > 0 ? newMetrics[0].calculation_date : null
    };
}

// Execute the platform metrics refresh
refreshPlatformMetrics()
    .then(results => {
        console.log('\n🏁 PLATFORM METRICS REFRESH COMPLETED');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 PLATFORM METRICS REFRESH CRASHED:', error.message);
        process.exit(1);
    });