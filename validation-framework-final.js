#!/usr/bin/env node
/**
 * FINAL WORKING VALIDATION FRAMEWORK for WhatsAppSalon-N8N
 * Compatible with real database structure
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class ValidationFramework {
    constructor() {
        this.validationResults = [];
        this.startTime = Date.now();
    }
    
    async validateTenant(tenantId) {
        console.log(`🔍 STARTING VALIDATION FOR TENANT: ${tenantId}`);
        console.log('='.repeat(60));
        
        try {
            // 1. Validate tenant existence (adjusted for real schema)
            await this.validateTenantExistence(tenantId);
            
            // 2. Validate metrics availability
            await this.validateMetricsAvailability(tenantId);
            
            // 3. Validate revenue metrics quality
            await this.validateRevenueMetrics(tenantId);
            
            // 4. Validate conversion metrics quality
            await this.validateConversionMetrics(tenantId);
            
            // 5. Validate data consistency
            await this.validateDataConsistency(tenantId);
            
            // Generate final report
            return this.generateFinalReport(tenantId);
            
        } catch (error) {
            console.error('💥 VALIDATION FRAMEWORK ERROR:', error.message);
            throw error;
        }
    }
    
    async validateTenantExistence(tenantId) {
        console.log('\n1️⃣ Validating tenant existence...');
        
        try {
            // Check if tenant exists in any table that references tenants
            const { data: tenantCheck, error } = await supabase
                .from('tenant_metrics')
                .select('tenant_id')
                .eq('tenant_id', tenantId)
                .limit(1)
                .single();
                
            if (error || !tenantCheck) {
                this.addValidationResult('tenant_existence', false, 0, 'Tenant not found in system');
                console.log('❌ Tenant not found');
            } else {
                this.addValidationResult('tenant_existence', true, 100, 'Tenant exists and has metrics data');
                console.log('✅ Tenant found');
            }
            
        } catch (error) {
            this.addValidationResult('tenant_existence', false, 0, `Validation error: ${error.message}`);
            console.log('❌ Tenant validation failed');
        }
    }
    
    async validateMetricsAvailability(tenantId) {
        console.log('\n2️⃣ Validating metrics availability...');
        
        try {
            const { data: metrics, error } = await supabase
                .from('tenant_metrics')
                .select('metric_type, period, calculated_at')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false });
                
            if (error || !metrics || metrics.length === 0) {
                this.addValidationResult('metrics_availability', false, 0, 'No metrics data found');
                console.log('❌ No metrics data');
                return;
            }
            
            const metricTypes = [...new Set(metrics.map(m => m.metric_type))];
            const periods = [...new Set(metrics.map(m => m.period))];
            
            console.log(`✅ Found ${metrics.length} metrics`);
            console.log(`   Types: ${metricTypes.join(', ')}`);
            console.log(`   Periods: ${periods.join(', ')}`);
            
            // Score based on metric diversity and recency
            let score = 70; // Base score for having data
            if (metricTypes.length >= 3) score += 20; // Bonus for variety
            if (periods.includes('7d') && periods.includes('30d')) score += 10; // Bonus for multiple periods
            
            this.addValidationResult('metrics_availability', true, score, 
                `${metrics.length} metrics found (${metricTypes.length} types, ${periods.length} periods)`);
                
        } catch (error) {
            this.addValidationResult('metrics_availability', false, 0, `Metrics validation error: ${error.message}`);
            console.log('❌ Metrics validation failed');
        }
    }
    
    async validateRevenueMetrics(tenantId) {
        console.log('\n3️⃣ Validating revenue metrics...');
        
        try {
            const { data: revenueMetrics, error } = await supabase
                .from('tenant_metrics')
                .select('metric_data, period, calculated_at')
                .eq('tenant_id', tenantId)
                .eq('metric_type', 'revenue_per_customer')
                .order('created_at', { ascending: false });
                
            if (error || !revenueMetrics || revenueMetrics.length === 0) {
                this.addValidationResult('revenue_metrics', false, 20, 'No revenue metrics found');
                console.log('⚠️ No revenue metrics');
                return;
            }
            
            let totalScore = 0;
            let validMetrics = 0;
            
            revenueMetrics.forEach(metric => {
                const data = metric.metric_data;
                let metricScore = 0;
                
                // Check required fields
                if (data.total_revenue !== undefined) metricScore += 25;
                if (data.unique_customers !== undefined) metricScore += 25;
                if (data.revenue_per_customer !== undefined) metricScore += 25;
                if (data.total_appointments !== undefined) metricScore += 25;
                
                // Quality checks
                if (data.total_revenue > 0) metricScore += 10;
                if (data.unique_customers > 0) metricScore += 10;
                if (data.revenue_per_customer > 0) metricScore += 10;
                
                totalScore += metricScore;
                validMetrics++;
                
                console.log(`   ${metric.period}: Revenue R$${data.total_revenue || 0}, Customers: ${data.unique_customers || 0}`);
            });
            
            const averageScore = Math.min(100, totalScore / validMetrics);
            const passed = averageScore >= 70;
            
            this.addValidationResult('revenue_metrics', passed, averageScore, 
                `${validMetrics} revenue metrics with average quality score ${averageScore.toFixed(1)}`);
                
            console.log(`${passed ? '✅' : '❌'} Revenue metrics quality: ${averageScore.toFixed(1)}/100`);
            
        } catch (error) {
            this.addValidationResult('revenue_metrics', false, 0, `Revenue validation error: ${error.message}`);
            console.log('❌ Revenue validation failed');
        }
    }
    
    async validateConversionMetrics(tenantId) {
        console.log('\n4️⃣ Validating conversion metrics...');
        
        try {
            const { data: conversionMetrics, error } = await supabase
                .from('tenant_metrics')
                .select('metric_data, period, calculated_at')
                .eq('tenant_id', tenantId)
                .eq('metric_type', 'conversion_rate')
                .order('created_at', { ascending: false });
                
            if (error || !conversionMetrics || conversionMetrics.length === 0) {
                this.addValidationResult('conversion_metrics', false, 20, 'No conversion metrics found');
                console.log('⚠️ No conversion metrics');
                return;
            }
            
            let totalScore = 0;
            let validMetrics = 0;
            
            conversionMetrics.forEach(metric => {
                const data = metric.metric_data;
                let metricScore = 0;
                
                // Check required fields
                if (data.conversion_rate !== undefined) metricScore += 30;
                if (data.total_conversations !== undefined) metricScore += 30;
                if (data.successful_conversions !== undefined) metricScore += 25;
                if (data.avg_confidence !== undefined) metricScore += 15;
                
                // Quality checks
                if (data.conversion_rate >= 0 && data.conversion_rate <= 1) metricScore += 10;
                if (data.total_conversations > 0) metricScore += 10;
                
                totalScore += metricScore;
                validMetrics++;
                
                console.log(`   ${metric.period}: Rate ${(data.conversion_rate * 100).toFixed(1)}%, Conversations: ${data.total_conversations || 0}`);
            });
            
            const averageScore = Math.min(100, totalScore / validMetrics);
            const passed = averageScore >= 70;
            
            this.addValidationResult('conversion_metrics', passed, averageScore, 
                `${validMetrics} conversion metrics with average quality score ${averageScore.toFixed(1)}`);
                
            console.log(`${passed ? '✅' : '❌'} Conversion metrics quality: ${averageScore.toFixed(1)}/100`);
            
        } catch (error) {
            this.addValidationResult('conversion_metrics', false, 0, `Conversion validation error: ${error.message}`);
            console.log('❌ Conversion validation failed');
        }
    }
    
    async validateDataConsistency(tenantId) {
        console.log('\n5️⃣ Validating data consistency...');
        
        try {
            // Get all metrics for consistency checks
            const { data: allMetrics, error } = await supabase
                .from('tenant_metrics')
                .select('metric_type, metric_data, period')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false });
                
            if (error || !allMetrics) {
                this.addValidationResult('data_consistency', false, 0, 'Cannot check consistency - no data');
                console.log('❌ No data for consistency check');
                return;
            }
            
            let consistencyScore = 100;
            const issues = [];
            
            // Check if we have matching periods for different metric types
            const periodsByType = {};
            allMetrics.forEach(metric => {
                if (!periodsByType[metric.metric_type]) {
                    periodsByType[metric.metric_type] = [];
                }
                periodsByType[metric.metric_type].push(metric.period);
            });
            
            // Cross-validate revenue and conversion data
            const revenueData = allMetrics.filter(m => m.metric_type === 'revenue_per_customer');
            const conversionData = allMetrics.filter(m => m.metric_type === 'conversion_rate');
            
            if (revenueData.length > 0 && conversionData.length > 0) {
                // Check for same periods
                const revenuePeriods = revenueData.map(r => r.period);
                const conversionPeriods = conversionData.map(c => c.period);
                const commonPeriods = revenuePeriods.filter(p => conversionPeriods.includes(p));
                
                if (commonPeriods.length === 0) {
                    consistencyScore -= 30;
                    issues.push('No matching periods between revenue and conversion metrics');
                }
                
                console.log(`   Common periods: ${commonPeriods.join(', ')}`);
            }
            
            // Check for data freshness (within last 7 days)
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const recentMetrics = allMetrics.filter(m => {
                const calculatedAt = new Date(m.metric_data.calculated_at);
                return calculatedAt > weekAgo;
            });
            
            if (recentMetrics.length === 0) {
                consistencyScore -= 20;
                issues.push('No recent metrics (within last 7 days)');
            }
            
            const passed = consistencyScore >= 60;
            const message = issues.length > 0 
                ? `Consistency issues: ${issues.join(', ')}`
                : 'Data consistency validated successfully';
                
            this.addValidationResult('data_consistency', passed, consistencyScore, message);
            console.log(`${passed ? '✅' : '❌'} Data consistency: ${consistencyScore}/100`);
            
            if (issues.length > 0) {
                issues.forEach(issue => console.log(`   ⚠️ ${issue}`));
            }
            
        } catch (error) {
            this.addValidationResult('data_consistency', false, 0, `Consistency validation error: ${error.message}`);
            console.log('❌ Consistency validation failed');
        }
    }
    
    addValidationResult(testName, passed, score, message) {
        this.validationResults.push({
            test: testName,
            passed,
            score,
            message,
            timestamp: new Date().toISOString()
        });
    }
    
    generateFinalReport(tenantId) {
        const executionTime = Date.now() - this.startTime;
        const totalTests = this.validationResults.length;
        const passedTests = this.validationResults.filter(r => r.passed).length;
        const overallScore = this.validationResults.reduce((sum, r) => sum + r.score, 0) / totalTests;
        const overallPassed = passedTests >= Math.ceil(totalTests * 0.6); // 60% pass rate
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 FINAL VALIDATION REPORT');
        console.log('='.repeat(60));
        console.log(`Tenant ID: ${tenantId}`);
        console.log(`Execution Time: ${executionTime}ms`);
        console.log(`Overall Score: ${overallScore.toFixed(1)}/100`);
        console.log(`Tests Passed: ${passedTests}/${totalTests}`);
        console.log(`Status: ${overallPassed ? '✅ PASSED' : '❌ FAILED'}`);
        
        console.log('\n📋 Detailed Results:');
        this.validationResults.forEach((result, index) => {
            const icon = result.passed ? '✅' : '❌';
            console.log(`${index + 1}. ${icon} ${result.test}: ${result.score}/100 - ${result.message}`);
        });
        
        console.log('\n💡 Recommendations:');
        const failedTests = this.validationResults.filter(r => !r.passed);
        if (failedTests.length === 0) {
            console.log('✅ All validations passed - metrics system is healthy!');
        } else {
            failedTests.forEach(test => {
                console.log(`- ${this.getRecommendation(test.test)}`);
            });
        }
        
        // Store validation results in database
        this.storeValidationResults(tenantId);
        
        return {
            tenantId,
            timestamp: new Date().toISOString(),
            executionTime,
            overallScore: Math.round(overallScore * 100) / 100,
            passed: overallPassed,
            totalTests,
            passedTests,
            results: this.validationResults,
            status: overallPassed ? 'PASSED' : 'FAILED'
        };
    }
    
    getRecommendation(testName) {
        const recommendations = {
            tenant_existence: 'Verify tenant configuration and data population',
            metrics_availability: 'Run metrics calculation jobs to populate data',
            revenue_metrics: 'Review revenue calculation logic and appointment pricing',
            conversion_metrics: 'Verify conversation tracking and AI efficiency',
            data_consistency: 'Check metrics calculation synchronization and timing'
        };
        return recommendations[testName] || 'Review system configuration';
    }
    
    async storeValidationResults(tenantId) {
        try {
            const validationRecords = this.validationResults.map(result => ({
                tenant_id: tenantId,
                validation_type: result.test.toUpperCase(),
                metric_name: result.test,
                field_name: result.test,
                status: result.passed ? 'PASSED' : 'FAILED',
                score: result.score,
                passed: result.passed,
                details: [{ message: result.message, score: result.score }],
                recommendations: [this.getRecommendation(result.test)],
                execution_time_ms: Date.now() - this.startTime,
                validated_at: new Date().toISOString()
            }));
            
            const { error } = await supabase
                .from('validation_results')
                .insert(validationRecords);
                
            if (error) {
                console.log(`⚠️ Could not store validation results: ${error.message}`);
            } else {
                console.log('✅ Validation results stored in database');
            }
        } catch (error) {
            console.log(`⚠️ Error storing validation results: ${error.message}`);
        }
    }
}

// Main execution
async function runValidation() {
    const tenantId = process.argv[2] || 'c3aa73f8-db80-40db-a9c4-73718a0fee34';
    
    const framework = new ValidationFramework();
    
    try {
        const result = await framework.validateTenant(tenantId);
        
        console.log('\n🎯 JSON OUTPUT:');
        console.log(JSON.stringify(result, null, 2));
        
        process.exit(result.passed ? 0 : 1);
        
    } catch (error) {
        console.error('💥 VALIDATION FRAMEWORK FAILED:', error.message);
        process.exit(1);
    }
}

runValidation();