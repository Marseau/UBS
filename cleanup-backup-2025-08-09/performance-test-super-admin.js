/**
 * SUPER ADMIN DASHBOARD PERFORMANCE TESTING
 * Comprehensive performance analysis for the super admin dashboard system
 * 
 * Tests:
 * 1. API endpoint response times
 * 2. Database query performance  
 * 3. Job execution performance
 * 4. Memory usage and resource consumption
 * 5. Real-time data freshness
 * 6. System bottlenecks identification
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

// Configuration
const config = {
    baseUrl: 'http://localhost:3000',
    testDuration: 30000, // 30 seconds
    concurrentRequests: 5,
    endpoints: [
        '/api/super-admin/kpis',
        '/api/super-admin/tenant-list',
        '/api/super-admin/last-update',
        '/api/super-admin/charts/revenue-vs-usage-cost',
        '/api/super-admin/charts/appointment-status',
        '/api/super-admin/insights/distortion',
        '/api/super-admin/insights/upsell',
        '/api/super-admin/status',
        '/api/super-admin/exchange-rate',
        '/api/super-admin/risk-alerts',
        '/api/super-admin/tenants-ranking'
    ]
};

class SuperAdminPerformanceTester {
    constructor() {
        this.results = {
            endpoints: new Map(),
            system: {
                startTime: Date.now(),
                memoryStart: process.memoryUsage(),
                errors: [],
                warnings: []
            },
            summary: {
                totalRequests: 0,
                totalErrors: 0,
                avgResponseTime: 0,
                slowestEndpoint: null,
                fastestEndpoint: null
            }
        };
    }

    /**
     * Run comprehensive performance test
     */
    async runPerformanceTest() {
        console.log('🚀 SUPER ADMIN DASHBOARD PERFORMANCE TEST');
        console.log('========================================');
        console.log(`⏰ Duration: ${config.testDuration / 1000}s`);
        console.log(`🔗 Base URL: ${config.baseUrl}`);
        console.log(`📊 Endpoints: ${config.endpoints.length}`);
        console.log(`⚡ Concurrent: ${config.concurrentRequests}`);
        console.log('');

        try {
            // 1. Test server availability
            await this.testServerAvailability();
            
            // 2. Test individual endpoint performance
            await this.testEndpointPerformance();
            
            // 3. Test concurrent load
            await this.testConcurrentLoad();
            
            // 4. Test database performance
            await this.testDatabasePerformance();
            
            // 5. Test cron job execution
            await this.testCronJobPerformance();
            
            // 6. Generate comprehensive report
            this.generatePerformanceReport();
            
        } catch (error) {
            console.error('❌ Performance test failed:', error);
            this.results.system.errors.push(error.message);
        }
    }

    /**
     * Test if server is running and responsive
     */
    async testServerAvailability() {
        console.log('🔍 Testing server availability...');
        
        try {
            const start = performance.now();
            const response = await axios.get(`${config.baseUrl}/api/super-admin/status`, {
                timeout: 10000
            });
            const duration = performance.now() - start;
            
            if (response.status === 200) {
                console.log(`✅ Server available in ${duration.toFixed(2)}ms`);
                return true;
            } else {
                throw new Error(`Server responded with status ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Server unavailable:', error.message);
            this.results.system.errors.push(`Server unavailable: ${error.message}`);
            return false;
        }
    }

    /**
     * Test individual endpoint performance
     */
    async testEndpointPerformance() {
        console.log('📊 Testing individual endpoint performance...');
        
        for (const endpoint of config.endpoints) {
            console.log(`   Testing ${endpoint}...`);
            
            const endpointStats = {
                endpoint,
                requests: 0,
                totalTime: 0,
                errors: 0,
                minTime: Infinity,
                maxTime: 0,
                avgTime: 0,
                lastResponse: null,
                dataQuality: {
                    hasData: false,
                    isComplete: false,
                    isFresh: false
                }
            };

            // Test endpoint 3 times for baseline
            for (let i = 0; i < 3; i++) {
                try {
                    const start = performance.now();
                    const response = await axios.get(`${config.baseUrl}${endpoint}`, {
                        timeout: 15000,
                        params: endpoint.includes('charts') ? { period: 30 } : {}
                    });
                    const duration = performance.now() - start;
                    
                    endpointStats.requests++;
                    endpointStats.totalTime += duration;
                    endpointStats.minTime = Math.min(endpointStats.minTime, duration);
                    endpointStats.maxTime = Math.max(endpointStats.maxTime, duration);
                    endpointStats.lastResponse = response.data;
                    
                    // Analyze data quality
                    this.analyzeDataQuality(response.data, endpointStats.dataQuality);
                    
                } catch (error) {
                    endpointStats.errors++;
                    console.error(`     ❌ Error: ${error.message}`);
                }
            }
            
            endpointStats.avgTime = endpointStats.totalTime / endpointStats.requests;
            this.results.endpoints.set(endpoint, endpointStats);
            
            const status = endpointStats.errors === 0 ? '✅' : '❌';
            const quality = endpointStats.dataQuality.hasData ? '📊' : '📭';
            console.log(`     ${status} ${quality} Avg: ${endpointStats.avgTime.toFixed(2)}ms (${endpointStats.errors} errors)`);
        }
    }

    /**
     * Test concurrent load performance
     */
    async testConcurrentLoad() {
        console.log('⚡ Testing concurrent load performance...');
        
        const promises = [];
        const startTime = Date.now();
        const endTime = startTime + config.testDuration;
        
        // Create concurrent request streams
        for (let i = 0; i < config.concurrentRequests; i++) {
            promises.push(this.runContinuousRequests(endTime, i));
        }
        
        const results = await Promise.all(promises);
        
        // Aggregate results
        const totalRequests = results.reduce((sum, r) => sum + r.requests, 0);
        const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
        const avgThroughput = totalRequests / (config.testDuration / 1000);
        
        console.log(`✅ Concurrent load test completed:`);
        console.log(`   Total requests: ${totalRequests}`);
        console.log(`   Total errors: ${totalErrors}`);
        console.log(`   Error rate: ${((totalErrors / totalRequests) * 100).toFixed(2)}%`);
        console.log(`   Throughput: ${avgThroughput.toFixed(2)} req/s`);
        
        this.results.summary.totalRequests += totalRequests;
        this.results.summary.totalErrors += totalErrors;
    }

    /**
     * Run continuous requests for load testing
     */
    async runContinuousRequests(endTime, workerId) {
        let requests = 0;
        let errors = 0;
        
        while (Date.now() < endTime) {
            try {
                const endpoint = config.endpoints[Math.floor(Math.random() * config.endpoints.length)];
                const response = await axios.get(`${config.baseUrl}${endpoint}`, {
                    timeout: 5000
                });
                requests++;
                
                // Small delay to prevent overwhelming
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                errors++;
            }
        }
        
        return { workerId, requests, errors };
    }

    /**
     * Test database query performance
     */
    async testDatabasePerformance() {
        console.log('🗃️ Testing database performance...');
        
        const dbTests = [
            { name: 'KPIs calculation', endpoint: '/api/super-admin/kpis?period=30' },
            { name: 'Tenant metrics', endpoint: '/api/super-admin/tenant-list' },
            { name: 'Chart data', endpoint: '/api/super-admin/charts/revenue-vs-usage-cost?period=30' },
            { name: 'Complex insights', endpoint: '/api/super-admin/insights/distortion?period=30' }
        ];
        
        for (const test of dbTests) {
            try {
                const start = performance.now();
                const response = await axios.get(`${config.baseUrl}${test.endpoint}`, {
                    timeout: 30000 // Longer timeout for complex queries
                });
                const duration = performance.now() - start;
                
                const status = duration < 5000 ? '🟢' : duration < 10000 ? '🟡' : '🔴';
                console.log(`   ${status} ${test.name}: ${duration.toFixed(2)}ms`);
                
                if (duration > 10000) {
                    this.results.system.warnings.push(`Slow database query: ${test.name} took ${duration.toFixed(2)}ms`);
                }
                
            } catch (error) {
                console.log(`   ❌ ${test.name}: Error - ${error.message}`);
                this.results.system.errors.push(`Database test failed: ${test.name}`);
            }
        }
    }

    /**
     * Test cron job execution performance
     */
    async testCronJobPerformance() {
        console.log('⏰ Testing cron job execution performance...');
        
        try {
            console.log('   Triggering manual calculation...');
            const start = performance.now();
            
            const response = await axios.post(`${config.baseUrl}/api/super-admin/trigger-calculation`, {
                period_days: 30
            }, {
                timeout: 60000 // 1 minute timeout for cron jobs
            });
            
            const duration = performance.now() - start;
            
            if (response.data.success) {
                console.log(`   ✅ Cron job completed in ${duration.toFixed(2)}ms`);
                console.log(`   📊 Processed: ${response.data.data?.processed || 'N/A'} items`);
                
                if (duration > 30000) {
                    this.results.system.warnings.push(`Slow cron execution: ${duration.toFixed(2)}ms`);
                }
            } else {
                console.log(`   ❌ Cron job failed: ${JSON.stringify(response.data.errors)}`);
                this.results.system.errors.push('Cron job execution failed');
            }
            
        } catch (error) {
            console.log(`   ❌ Cron job test failed: ${error.message}`);
            this.results.system.errors.push(`Cron job test error: ${error.message}`);
        }
    }

    /**
     * Analyze data quality from API responses
     */
    analyzeDataQuality(responseData, qualityStats) {
        if (!responseData) return;
        
        qualityStats.hasData = !!responseData.success;
        
        if (responseData.data) {
            // Check for KPIs completeness
            if (responseData.data.kpis) {
                const kpiCount = Object.keys(responseData.data.kpis).length;
                qualityStats.isComplete = kpiCount >= 8; // Expected 8+ KPIs
            }
            
            // Check for array data
            if (Array.isArray(responseData.data)) {
                qualityStats.isComplete = responseData.data.length > 0;
            }
            
            // Check data freshness
            if (responseData.data.metadata?.period_days) {
                qualityStats.isFresh = !responseData.data.metadata.is_mock_data;
            }
        }
    }

    /**
     * Generate comprehensive performance report
     */
    generatePerformanceReport() {
        console.log('\n📋 PERFORMANCE REPORT');
        console.log('=====================');

        const endMemory = process.memoryUsage();
        const testDuration = Date.now() - this.results.system.startTime;
        
        // Calculate summary statistics
        let totalTime = 0;
        let totalRequests = 0;
        let slowestEndpoint = null;
        let fastestEndpoint = null;
        let slowestTime = 0;
        let fastestTime = Infinity;
        
        for (const [endpoint, stats] of this.results.endpoints) {
            totalRequests += stats.requests;
            totalTime += stats.totalTime;
            
            if (stats.avgTime > slowestTime) {
                slowestTime = stats.avgTime;
                slowestEndpoint = endpoint;
            }
            
            if (stats.avgTime < fastestTime && stats.requests > 0) {
                fastestTime = stats.avgTime;
                fastestEndpoint = endpoint;
            }
        }
        
        this.results.summary.avgResponseTime = totalTime / totalRequests;
        this.results.summary.slowestEndpoint = { endpoint: slowestEndpoint, time: slowestTime };
        this.results.summary.fastestEndpoint = { endpoint: fastestEndpoint, time: fastestTime };
        
        // System Overview
        console.log('\n🖥️ SYSTEM OVERVIEW:');
        console.log(`   Test duration: ${(testDuration / 1000).toFixed(2)}s`);
        console.log(`   Total requests: ${this.results.summary.totalRequests + totalRequests}`);
        console.log(`   Total errors: ${this.results.summary.totalErrors}`);
        console.log(`   Overall success rate: ${(((this.results.summary.totalRequests + totalRequests - this.results.summary.totalErrors) / (this.results.summary.totalRequests + totalRequests)) * 100).toFixed(2)}%`);
        
        // Performance Metrics
        console.log('\n⚡ PERFORMANCE METRICS:');
        console.log(`   Average response time: ${this.results.summary.avgResponseTime.toFixed(2)}ms`);
        console.log(`   Fastest endpoint: ${fastestEndpoint} (${fastestTime.toFixed(2)}ms)`);
        console.log(`   Slowest endpoint: ${slowestEndpoint} (${slowestTime.toFixed(2)}ms)`);
        
        // Memory Usage
        console.log('\n💾 MEMORY USAGE:');
        console.log(`   Start RSS: ${(this.results.system.memoryStart.rss / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   End RSS: ${(endMemory.rss / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Memory delta: ${((endMemory.rss - this.results.system.memoryStart.rss) / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Heap used: ${(endMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        
        // Endpoint Breakdown
        console.log('\n📊 ENDPOINT BREAKDOWN:');
        const sortedEndpoints = Array.from(this.results.endpoints.entries())
            .sort(([,a], [,b]) => b.avgTime - a.avgTime);
            
        for (const [endpoint, stats] of sortedEndpoints) {
            const errorRate = stats.requests > 0 ? (stats.errors / stats.requests * 100).toFixed(1) : '0.0';
            const quality = stats.dataQuality.hasData ? '📊' : '📭';
            const performance = stats.avgTime < 1000 ? '🟢' : stats.avgTime < 3000 ? '🟡' : '🔴';
            
            console.log(`   ${performance} ${quality} ${endpoint}`);
            console.log(`      Avg: ${stats.avgTime.toFixed(2)}ms | Min: ${stats.minTime.toFixed(2)}ms | Max: ${stats.maxTime.toFixed(2)}ms`);
            console.log(`      Requests: ${stats.requests} | Errors: ${stats.errors} (${errorRate}%)`);
            console.log(`      Data: ${stats.dataQuality.hasData ? 'Yes' : 'No'} | Complete: ${stats.dataQuality.isComplete ? 'Yes' : 'No'} | Fresh: ${stats.dataQuality.isFresh ? 'Yes' : 'No'}`);
        }
        
        // Issues and Warnings
        if (this.results.system.errors.length > 0) {
            console.log('\n❌ ERRORS:');
            this.results.system.errors.forEach(error => console.log(`   • ${error}`));
        }
        
        if (this.results.system.warnings.length > 0) {
            console.log('\n⚠️ WARNINGS:');
            this.results.system.warnings.forEach(warning => console.log(`   • ${warning}`));
        }
        
        // Performance Assessment
        console.log('\n🎯 PERFORMANCE ASSESSMENT:');
        const assessment = this.assessSystemPerformance();
        console.log(`   Overall Grade: ${assessment.grade}`);
        console.log(`   Score: ${assessment.score}/100`);
        console.log('   Areas for improvement:');
        assessment.improvements.forEach(improvement => console.log(`   • ${improvement}`));
        
        console.log('\n✅ Performance test completed successfully!');
    }

    /**
     * Assess overall system performance
     */
    assessSystemPerformance() {
        let score = 100;
        const improvements = [];
        
        // Response time assessment
        if (this.results.summary.avgResponseTime > 3000) {
            score -= 20;
            improvements.push('Optimize slow API endpoints (>3s average)');
        } else if (this.results.summary.avgResponseTime > 1000) {
            score -= 10;
            improvements.push('Consider response time optimization (<1s target)');
        }
        
        // Error rate assessment
        const errorRate = (this.results.summary.totalErrors / (this.results.summary.totalRequests || 1)) * 100;
        if (errorRate > 10) {
            score -= 25;
            improvements.push('High error rate detected - investigate failing endpoints');
        } else if (errorRate > 5) {
            score -= 10;
            improvements.push('Moderate error rate - monitor endpoint stability');
        }
        
        // Memory usage assessment
        const memoryDelta = process.memoryUsage().rss - this.results.system.memoryStart.rss;
        if (memoryDelta > 100 * 1024 * 1024) { // 100MB
            score -= 15;
            improvements.push('High memory usage detected - check for memory leaks');
        }
        
        // Data quality assessment
        let dataQualityIssues = 0;
        for (const [, stats] of this.results.endpoints) {
            if (!stats.dataQuality.hasData) dataQualityIssues++;
        }
        
        if (dataQualityIssues > 2) {
            score -= 20;
            improvements.push('Multiple endpoints returning incomplete data');
        }
        
        // Determine grade
        let grade = 'A';
        if (score < 90) grade = 'B';
        if (score < 80) grade = 'C';
        if (score < 70) grade = 'D';
        if (score < 60) grade = 'F';
        
        if (improvements.length === 0) {
            improvements.push('System performance is excellent!');
        }
        
        return { grade, score: Math.max(0, score), improvements };
    }
}

// Run the performance test
if (require.main === module) {
    const tester = new SuperAdminPerformanceTester();
    tester.runPerformanceTest().catch(console.error);
}

module.exports = SuperAdminPerformanceTester;