#!/usr/bin/env node
/**
 * Simplified validation test that works with current database structure
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function runSimplifiedValidation() {
    const tenantId = process.argv[2] || 'c3aa73f8-db80-40db-a9c4-73718a0fee34';
    console.log(`🧪 Running simplified validation for tenant: ${tenantId}\n`);
    
    const results = [];
    let overallScore = 0;
    let validationsPassed = 0;
    let totalValidations = 0;
    
    try {
        // 1. Test tenant existence
        console.log('1️⃣ Validating tenant existence...');
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('business_name, plan')
            .eq('id', tenantId)
            .single();
            
        if (tenantError || !tenant) {
            console.log(`❌ Tenant not found: ${tenantError?.message || 'No tenant data'}`);
            results.push({
                test: 'tenant_existence',
                passed: false,
                score: 0,
                message: 'Tenant not found in system'
            });
        } else {
            console.log(`✅ Tenant found: ${tenant.business_name} (${tenant.plan})`);
            results.push({
                test: 'tenant_existence',
                passed: true,
                score: 100,
                message: `Valid tenant: ${tenant.business_name}`
            });
            validationsPassed++;
        }
        totalValidations++;
        
        // 2. Test metrics data availability
        console.log('\n2️⃣ Validating metrics data availability...');
        const { data: metrics, error: metricsError } = await supabase
            .from('tenant_metrics')
            .select('metric_type, metric_data')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(5);
            
        if (metricsError || !metrics || metrics.length === 0) {
            console.log(`❌ No metrics found: ${metricsError?.message || 'Empty dataset'}`);
            results.push({
                test: 'metrics_availability',
                passed: false,
                score: 0,
                message: 'No metrics data available for tenant'
            });
        } else {
            console.log(`✅ Found ${metrics.length} metric records`);
            const metricTypes = [...new Set(metrics.map(m => m.metric_type))];
            console.log(`   Types: ${metricTypes.join(', ')}`);
            results.push({
                test: 'metrics_availability',
                passed: true,
                score: 100,
                message: `${metrics.length} metrics found with types: ${metricTypes.join(', ')}`
            });
            validationsPassed++;
        }
        totalValidations++;
        
        // 3. Test revenue data quality
        console.log('\n3️⃣ Validating revenue data quality...');
        const revenueMetrics = metrics?.filter(m => m.metric_type === 'revenue_per_customer') || [];
        if (revenueMetrics.length === 0) {
            console.log(`⚠️ No revenue metrics found`);
            results.push({
                test: 'revenue_data_quality',
                passed: false,
                score: 30,
                message: 'No revenue metrics available'
            });
        } else {
            const revenueData = revenueMetrics[0].metric_data;
            const hasRequiredFields = revenueData.total_revenue && revenueData.unique_customers;
            
            if (hasRequiredFields) {
                console.log(`✅ Revenue data quality OK`);
                console.log(`   Total Revenue: ${revenueData.total_revenue}`);
                console.log(`   Unique Customers: ${revenueData.unique_customers}`);
                console.log(`   Revenue per Customer: ${revenueData.revenue_per_customer}`);
                results.push({
                    test: 'revenue_data_quality',
                    passed: true,
                    score: 100,
                    message: `Valid revenue data: R$${revenueData.total_revenue} from ${revenueData.unique_customers} customers`
                });
                validationsPassed++;
            } else {
                console.log(`❌ Revenue data incomplete`);
                results.push({
                    test: 'revenue_data_quality',
                    passed: false,
                    score: 50,
                    message: 'Revenue metrics missing required fields'
                });
            }
        }
        totalValidations++;
        
        // 4. Test conversion data quality
        console.log('\n4️⃣ Validating conversion data quality...');
        const conversionMetrics = metrics?.filter(m => m.metric_type === 'conversion_rate') || [];
        if (conversionMetrics.length === 0) {
            console.log(`⚠️ No conversion metrics found`);
            results.push({
                test: 'conversion_data_quality',
                passed: false,
                score: 30,
                message: 'No conversion metrics available'
            });
        } else {
            const conversionData = conversionMetrics[0].metric_data;
            const hasRequiredFields = conversionData.conversion_rate !== undefined && conversionData.total_conversations;
            
            if (hasRequiredFields) {
                console.log(`✅ Conversion data quality OK`);
                console.log(`   Conversion Rate: ${(conversionData.conversion_rate * 100).toFixed(1)}%`);
                console.log(`   Total Conversations: ${conversionData.total_conversations}`);
                console.log(`   Successful Conversions: ${conversionData.successful_conversions}`);
                results.push({
                    test: 'conversion_data_quality',
                    passed: true,
                    score: 100,
                    message: `Valid conversion data: ${(conversionData.conversion_rate * 100).toFixed(1)}% rate from ${conversionData.total_conversations} conversations`
                });
                validationsPassed++;
            } else {
                console.log(`❌ Conversion data incomplete`);
                results.push({
                    test: 'conversion_data_quality',
                    passed: false,
                    score: 50,
                    message: 'Conversion metrics missing required fields'
                });
            }
        }
        totalValidations++;
        
        // 5. Test appointments data
        console.log('\n5️⃣ Validating appointments data...');
        const { data: appointments, error: appointmentsError } = await supabase
            .from('appointments')
            .select('id, final_price, status')
            .eq('tenant_id', tenantId)
            .not('final_price', 'is', null)
            .limit(10);
            
        if (appointmentsError || !appointments || appointments.length === 0) {
            console.log(`⚠️ No appointments with pricing found: ${appointmentsError?.message || 'Empty dataset'}`);
            results.push({
                test: 'appointments_data',
                passed: false,
                score: 20,
                message: 'No appointments with pricing data found'
            });
        } else {
            console.log(`✅ Found ${appointments.length} appointments with pricing`);
            const validPrices = appointments.filter(a => a.final_price > 0).length;
            const priceQuality = (validPrices / appointments.length) * 100;
            
            console.log(`   Valid prices: ${validPrices}/${appointments.length} (${priceQuality.toFixed(1)}%)`);
            results.push({
                test: 'appointments_data',
                passed: priceQuality >= 80,
                score: Math.round(priceQuality),
                message: `${appointments.length} appointments found, ${priceQuality.toFixed(1)}% with valid pricing`
            });
            
            if (priceQuality >= 80) validationsPassed++;
        }
        totalValidations++;
        
        // Calculate overall score and status
        overallScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
        const overallPassed = validationsPassed >= (totalValidations * 0.6); // 60% pass threshold
        
        // 6. Summary
        console.log('\n📊 VALIDATION SUMMARY');
        console.log('='.repeat(50));
        console.log(`Overall Score: ${overallScore.toFixed(1)}/100`);
        console.log(`Validations Passed: ${validationsPassed}/${totalValidations}`);
        console.log(`Status: ${overallPassed ? '✅ PASSED' : '❌ FAILED'}`);
        
        console.log('\n📋 Detailed Results:');
        results.forEach((result, index) => {
            const icon = result.passed ? '✅' : '❌';
            console.log(`${index + 1}. ${icon} ${result.test}: ${result.score}/100 - ${result.message}`);
        });
        
        // 7. Recommendations
        console.log('\n💡 Recommendations:');
        const failedTests = results.filter(r => !r.passed);
        if (failedTests.length === 0) {
            console.log('✅ All validations passed - system is healthy!');
        } else {
            failedTests.forEach(test => {
                switch (test.test) {
                    case 'tenant_existence':
                        console.log('- Verify tenant is properly configured in system');
                        break;
                    case 'metrics_availability':
                        console.log('- Run metrics calculation jobs to populate data');
                        break;
                    case 'revenue_data_quality':
                        console.log('- Review revenue calculation logic and data sources');
                        break;
                    case 'conversion_data_quality':
                        console.log('- Verify conversation tracking and conversion calculations');
                        break;
                    case 'appointments_data':
                        console.log('- Ensure appointment pricing is properly populated');
                        break;
                }
            });
        }
        
        return {
            tenantId,
            overallScore,
            passed: overallPassed,
            totalValidations,
            validationsPassed,
            results,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('💥 Validation failed:', error.message);
        return {
            tenantId,
            overallScore: 0,
            passed: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

runSimplifiedValidation()
    .then(result => {
        console.log('\n🎯 Final Result:');
        console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });