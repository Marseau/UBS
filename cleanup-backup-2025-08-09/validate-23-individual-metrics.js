/**
 * Validation Script: Test all 23 Individual Metrics Scripts
 * Validates each metric script execution and reports success/failure
 */

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Configuration for 23 Individual Metrics
 */
const METRICS_SCRIPTS = [
    // 1-3. Revenue & Customer Metrics
    { id: 1, name: 'Monthly Revenue', script: 'test-metric-1-monthly-revenue.js' },
    { id: 2, name: 'New Customers', script: 'test-metric-2-new-customers.js' },
    { id: 3, name: 'Appointment Success Rate', script: 'test-metric-3-appointment-success-rate.js' },
    
    // 4. No-Show Impact
    { id: 4, name: 'No-Show Impact', script: 'test-no-show-impact-metric.js' },
    
    // 5-8. Conversation Outcomes
    { id: 5, name: 'Information Rate', script: 'test-information-rate-metric.js' },
    { id: 6, name: 'Spam Rate', script: 'test-spam-rate-metric.js' },
    { id: 7, name: 'Reschedule Rate', script: 'test-reschedule-rate-metric.js' },
    { id: 8, name: 'Cancellation Rate', script: 'test-cancellation-rate-metric.js' },
    
    // 9. Average Minutes per Conversation
    { id: 9, name: 'Average Minutes per Conversation', script: 'test-avg-minutes-per-conversation-metric.js' },
    
    // 10. Total System Cost USD
    { id: 10, name: 'Total System Cost USD', script: 'test-avg-cost-usd-metric.js' },
    
    // 11-12. AI Metrics
    { id: 11, name: 'AI Failure Rate', script: 'test-ai-failure-confidence-metrics.js' },
    { id: 12, name: 'Confidence Score', script: 'test-ai-efficiency-metric.js' },
    
    // 13. Total Unique Customers
    { id: 13, name: 'Total Unique Customers', script: 'test-total-unique-customers.js' },
    
    // 14-15. Resource Metrics
    { id: 14, name: 'Services Available', script: 'test-services-available.js' },
    { id: 15, name: 'Total Professionals', script: 'test-total-professionals-implemented.js' },
    
    // 16. Monthly Platform Cost BRL
    { id: 16, name: 'Monthly Platform Cost BRL', script: 'test-total-cost-usd.js' }, // Reusing cost script
    
    // 17-19. AI Interaction Periods
    { id: 17, name: 'AI Interaction 7d', script: 'test-ai-interaction-periods.js' },
    { id: 18, name: 'AI Interaction 30d', script: 'test-ai-interaction-metric.js' },
    { id: 19, name: 'AI Interaction 90d', script: 'test-ai-interaction-periods.js' }, // Same script handles multiple periods
    
    // 20-22. Historical 6 Months
    { id: 20, name: 'Historical 6 Months Conversations', script: 'test-historical-6months-conversations.js' },
    { id: 21, name: 'Historical 6 Months Revenue', script: 'test-historical-6months-revenue-analysis.js' },
    { id: 22, name: 'Historical 6 Months Customers', script: 'test-historical-revenue-corrected.js' }, // Closest match
    
    // 23. Tenant Outcomes
    { id: 23, name: 'Tenant Outcomes (7d/30d/90d)', script: 'test-conversation-outcome-metrics.js' }
];

/**
 * Check if script file exists
 */
function checkScriptExists(scriptName) {
    const scriptPath = path.join(__dirname, scriptName);
    return fs.existsSync(scriptPath);
}

/**
 * Execute a single metric script with timeout
 */
async function executeMetricScript(scriptInfo) {
    const { id, name, script } = scriptInfo;
    
    console.log(`\n🔄 [${id}/23] Testing: ${name}`);
    console.log(`   📄 Script: ${script}`);
    
    // Check if script exists
    if (!checkScriptExists(script)) {
        console.log(`   ❌ Script not found`);
        return {
            id,
            name,
            script,
            status: 'SCRIPT_NOT_FOUND',
            error: 'Script file does not exist',
            output: null,
            duration: 0
        };
    }
    
    const startTime = Date.now();
    
    try {
        // Execute script with 60-second timeout
        const output = execSync(`node ${script}`, {
            timeout: 60000, // 60 seconds
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        const duration = Date.now() - startTime;
        console.log(`   ✅ Success (${duration}ms)`);
        
        return {
            id,
            name,
            script,
            status: 'SUCCESS',
            error: null,
            output: output.trim(),
            duration
        };
        
    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error.message || error.toString();
        const stderr = error.stderr ? error.stderr.toString() : '';
        
        console.log(`   ❌ Failed (${duration}ms)`);
        console.log(`   💬 Error: ${errorMessage.substring(0, 100)}...`);
        
        return {
            id,
            name,
            script,
            status: 'FAILED',
            error: errorMessage,
            stderr,
            output: null,
            duration
        };
    }
}

/**
 * Main validation function
 */
async function validate23IndividualMetrics() {
    try {
        console.log('🚀 Validating 23 Individual Metrics Scripts');
        console.log('═'.repeat(80));
        console.log(`📋 Total metrics to validate: ${METRICS_SCRIPTS.length}`);
        console.log('═'.repeat(80));
        
        const results = [];
        let successCount = 0;
        let failedCount = 0;
        let notFoundCount = 0;
        
        // Execute each metric script
        for (const metricInfo of METRICS_SCRIPTS) {
            const result = await executeMetricScript(metricInfo);
            results.push(result);
            
            switch (result.status) {
                case 'SUCCESS':
                    successCount++;
                    break;
                case 'FAILED':
                    failedCount++;
                    break;
                case 'SCRIPT_NOT_FOUND':
                    notFoundCount++;
                    break;
            }
        }
        
        // Generate summary report
        console.log('\n📊 VALIDATION SUMMARY REPORT');
        console.log('═'.repeat(80));
        
        console.log('\n🎯 OVERALL RESULTS:');
        console.log(`   Total Scripts: ${METRICS_SCRIPTS.length}`);
        console.log(`   ✅ Successful: ${successCount}`);
        console.log(`   ❌ Failed: ${failedCount}`);
        console.log(`   📄 Not Found: ${notFoundCount}`);
        console.log(`   📈 Success Rate: ${((successCount / METRICS_SCRIPTS.length) * 100).toFixed(1)}%`);
        
        // Detailed results by category
        console.log('\n📋 DETAILED RESULTS:');
        console.log('─'.repeat(60));
        
        const categories = [
            { name: 'Revenue & Customer (1-3)', start: 1, end: 3 },
            { name: 'No-Show Impact (4)', start: 4, end: 4 },
            { name: 'Conversation Outcomes (5-8)', start: 5, end: 8 },
            { name: 'Conversation Analysis (9-10)', start: 9, end: 10 },
            { name: 'AI Metrics (11-12)', start: 11, end: 12 },
            { name: 'Resource Metrics (13-16)', start: 13, end: 16 },
            { name: 'AI Interaction Periods (17-19)', start: 17, end: 19 },
            { name: 'Historical 6 Months (20-22)', start: 20, end: 22 },
            { name: 'Tenant Outcomes (23)', start: 23, end: 23 }
        ];
        
        categories.forEach(category => {
            const categoryResults = results.filter(r => r.id >= category.start && r.id <= category.end);
            const categorySuccess = categoryResults.filter(r => r.status === 'SUCCESS').length;
            const categoryTotal = categoryResults.length;
            const categoryRate = categoryTotal > 0 ? ((categorySuccess / categoryTotal) * 100).toFixed(1) : 0;
            
            console.log(`\n${category.name}:`);
            console.log(`   Success Rate: ${categorySuccess}/${categoryTotal} (${categoryRate}%)`);
            
            categoryResults.forEach(result => {
                const status = result.status === 'SUCCESS' ? '✅' : 
                              result.status === 'SCRIPT_NOT_FOUND' ? '📄' : '❌';
                console.log(`   ${status} ${result.id}. ${result.name}`);
                
                if (result.status === 'FAILED' && result.error) {
                    const shortError = result.error.substring(0, 80).replace(/\n/g, ' ');
                    console.log(`      Error: ${shortError}...`);
                }
            });
        });
        
        // Generate failed scripts report
        const failedResults = results.filter(r => r.status === 'FAILED');
        if (failedResults.length > 0) {
            console.log('\n🔍 FAILED SCRIPTS ANALYSIS:');
            console.log('─'.repeat(60));
            
            failedResults.forEach(result => {
                console.log(`\n❌ ${result.id}. ${result.name} (${result.script})`);
                if (result.error) {
                    console.log(`   Error: ${result.error.substring(0, 200)}...`);
                }
                if (result.stderr) {
                    console.log(`   Stderr: ${result.stderr.substring(0, 200)}...`);
                }
            });
        }
        
        // Generate recommendations
        console.log('\n💡 RECOMMENDATIONS:');
        console.log('─'.repeat(60));
        
        if (successCount === METRICS_SCRIPTS.length) {
            console.log('🎉 All metrics validated successfully!');
            console.log('✅ Ready to integrate all 23 metrics into tenant_metrics table');
        } else {
            console.log(`🔧 ${failedCount + notFoundCount} metrics need attention:`);
            
            if (notFoundCount > 0) {
                console.log(`   📄 Create ${notFoundCount} missing script files`);
            }
            if (failedCount > 0) {
                console.log(`   🛠️ Fix ${failedCount} failed scripts (likely database schema issues)`);
            }
            
            console.log('🎯 Focus on fixing failed scripts before integration');
        }
        
        // Save detailed results to file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const reportPath = `validation-report-23-metrics-${timestamp}.json`;
        
        const reportData = {
            timestamp: new Date().toISOString(),
            summary: {
                total: METRICS_SCRIPTS.length,
                successful: successCount,
                failed: failedCount,
                notFound: notFoundCount,
                successRate: ((successCount / METRICS_SCRIPTS.length) * 100).toFixed(1)
            },
            results
        };
        
        fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
        console.log(`\n📄 Detailed report saved: ${reportPath}`);
        
        return reportData;
        
    } catch (error) {
        console.error('❌ Validation failed:', error);
        throw error;
    }
}

// Run validation if called directly
if (require.main === module) {
    validate23IndividualMetrics()
        .then((report) => {
            console.log(`\n✅ Validation completed!`);
            console.log(`🎯 Final Status: ${report.summary.successful}/${report.summary.total} metrics validated`);
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Validation failed:', error);
            process.exit(1);
        });
}

module.exports = { 
    validate23IndividualMetrics,
    METRICS_SCRIPTS
};