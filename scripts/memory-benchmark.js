#!/usr/bin/env node

/**
 * Memory Benchmark Script
 * Comprehensive benchmarking for 50MB RSS target
 */

const { performance } = require('perf_hooks');

class MemoryBenchmark {
    constructor() {
        this.baselineMemory = process.memoryUsage();
        this.benchmarks = [];
        this.targetRSS = 50 * 1024 * 1024; // 50MB in bytes
    }

    async runBenchmarks() {
        console.log('🚀 Memory Benchmark Suite - Target: 50MB RSS');
        console.log('================================================\n');

        // Baseline measurement
        await this.benchmark('baseline', 'Initial memory state', () => {
            return Promise.resolve();
        });

        // Object allocation benchmark
        await this.benchmark('object-allocation', 'Object allocation stress test', () => {
            const objects = [];
            for (let i = 0; i < 1000; i++) {
                objects.push({
                    id: i,
                    data: new Array(100).fill(Math.random()),
                    timestamp: Date.now()
                });
            }
            return objects;
        });

        // String allocation benchmark  
        await this.benchmark('string-allocation', 'String allocation stress test', () => {
            const strings = [];
            for (let i = 0; i < 5000; i++) {
                strings.push(`Test string ${i} with some content to allocate memory`);
            }
            return strings;
        });

        // Function calls benchmark
        await this.benchmark('function-calls', 'Function call overhead test', () => {
            const results = [];
            for (let i = 0; i < 10000; i++) {
                results.push(this.testFunction(i));
            }
            return results;
        });

        // Array operations benchmark
        await this.benchmark('array-operations', 'Array operations stress test', () => {
            const arr = new Array(10000).fill(0).map((_, i) => i);
            return arr.map(x => x * 2).filter(x => x % 2 === 0).reduce((a, b) => a + b, 0);
        });

        // JSON operations benchmark
        await this.benchmark('json-operations', 'JSON serialization stress test', () => {
            const obj = {
                data: new Array(1000).fill(0).map(i => ({ id: i, value: Math.random() })),
                timestamp: Date.now(),
                metadata: { version: '1.0', type: 'benchmark' }
            };
            
            const json = JSON.stringify(obj);
            return JSON.parse(json);
        });

        // Memory cleanup test
        await this.benchmark('memory-cleanup', 'Memory cleanup effectiveness', () => {
            if (typeof global.gc === 'function') {
                global.gc();
            }
            return Promise.resolve();
        });

        this.generateReport();
    }

    async benchmark(name, description, operation) {
        console.log(`📊 Running: ${description}`);
        
        const startTime = performance.now();
        const startMemory = process.memoryUsage();
        
        let result;
        try {
            result = await operation();
        } catch (error) {
            console.error(`❌ Benchmark ${name} failed:`, error);
            return;
        }
        
        const endTime = performance.now();
        const endMemory = process.memoryUsage();
        
        const benchmark = {
            name,
            description,
            duration: endTime - startTime,
            memoryBefore: startMemory,
            memoryAfter: endMemory,
            memoryDelta: {
                rss: endMemory.rss - startMemory.rss,
                heapUsed: endMemory.heapUsed - startMemory.heapUsed,
                heapTotal: endMemory.heapTotal - startMemory.heapTotal,
                external: endMemory.external - startMemory.external
            },
            efficiency: this.calculateEfficiency(startMemory, endMemory),
            targetCompliant: endMemory.rss <= this.targetRSS
        };
        
        this.benchmarks.push(benchmark);
        
        console.log(`   Duration: ${benchmark.duration.toFixed(2)}ms`);
        console.log(`   RSS: ${this.formatBytes(endMemory.rss)} (Δ${this.formatBytes(benchmark.memoryDelta.rss, true)})`);
        console.log(`   Target: ${benchmark.targetCompliant ? '✅' : '❌'} (${this.formatBytes(this.targetRSS)} limit)`);
        console.log('');
    }

    testFunction(input) {
        return {
            input,
            output: input * 2,
            processed: Date.now()
        };
    }

    calculateEfficiency(before, after) {
        const memoryIncrease = after.rss - before.rss;
        if (memoryIncrease <= 0) return 100;
        
        const efficiency = Math.max(0, 100 - (memoryIncrease / (1024 * 1024))); // Penalty per MB
        return Math.round(efficiency * 100) / 100;
    }

    formatBytes(bytes, showSign = false) {
        const sign = showSign && bytes > 0 ? '+' : '';
        const abs = Math.abs(bytes);
        
        if (abs >= 1024 * 1024) {
            return `${sign}${(bytes / (1024 * 1024)).toFixed(2)}MB`;
        } else if (abs >= 1024) {
            return `${sign}${(bytes / 1024).toFixed(2)}KB`;
        } else {
            return `${sign}${bytes}B`;
        }
    }

    generateReport() {
        console.log('📋 MEMORY BENCHMARK REPORT');
        console.log('==========================\n');

        // Summary table
        console.log('Benchmark Results:');
        console.log('Test                     | Duration  | RSS Change | Target | Efficiency');
        console.log('-------------------------|-----------|------------|--------|----------');
        
        this.benchmarks.forEach(bench => {
            const name = bench.name.padEnd(24);
            const duration = `${bench.duration.toFixed(1)}ms`.padStart(9);
            const rssChange = this.formatBytes(bench.memoryDelta.rss, true).padStart(10);
            const target = bench.targetCompliant ? '✅ PASS' : '❌ FAIL';
            const efficiency = `${bench.efficiency.toFixed(1)}%`.padStart(8);
            
            console.log(`${name} | ${duration} | ${rssChange} | ${target} | ${efficiency}`);
        });

        console.log('\n');

        // Memory analysis
        const currentMemory = process.memoryUsage();
        const memoryIncrease = currentMemory.rss - this.baselineMemory.rss;
        const targetCompliance = currentMemory.rss <= this.targetRSS;

        console.log('Memory Analysis:');
        console.log(`Baseline RSS: ${this.formatBytes(this.baselineMemory.rss)}`);
        console.log(`Current RSS: ${this.formatBytes(currentMemory.rss)}`);
        console.log(`Total Increase: ${this.formatBytes(memoryIncrease, true)}`);
        console.log(`Target Compliance: ${targetCompliance ? '✅ WITHIN LIMIT' : '❌ EXCEEDS TARGET'}`);
        console.log(`Target Distance: ${this.formatBytes(currentMemory.rss - this.targetRSS, true)}`);

        // Performance analysis
        const avgDuration = this.benchmarks.reduce((sum, b) => sum + b.duration, 0) / this.benchmarks.length;
        const avgEfficiency = this.benchmarks.reduce((sum, b) => sum + b.efficiency, 0) / this.benchmarks.length;
        const passRate = (this.benchmarks.filter(b => b.targetCompliant).length / this.benchmarks.length) * 100;

        console.log('\nPerformance Summary:');
        console.log(`Average Duration: ${avgDuration.toFixed(2)}ms`);
        console.log(`Average Efficiency: ${avgEfficiency.toFixed(1)}%`);
        console.log(`Target Pass Rate: ${passRate.toFixed(1)}%`);

        // Recommendations
        console.log('\n💡 Recommendations:');
        
        if (!targetCompliance) {
            console.log('   - Memory usage exceeds 50MB target');
            console.log('   - Consider implementing more aggressive optimizations');
        }
        
        if (avgEfficiency < 80) {
            console.log('   - Low memory efficiency detected');
            console.log('   - Review object allocation patterns');
        }
        
        if (passRate < 80) {
            console.log('   - Multiple benchmarks exceed target');
            console.log('   - Apply V8 optimization flags');
        }

        // V8 optimization status
        console.log('\n🔧 V8 Status:');
        console.log(`   - Max old space: ${process.env.NODE_OPTIONS?.includes('max-old-space-size') ? 'Limited' : 'Default'}`);
        console.log(`   - Expose GC: ${typeof global.gc === 'function' ? 'Enabled' : 'Disabled'}`);
        console.log(`   - Current heap: ${this.formatBytes(currentMemory.heapTotal)}`);

        console.log('\n✅ Memory benchmark completed!');
        
        // Exit with error code if target not met
        if (!targetCompliance) {
            console.log('❌ Target not achieved - review optimization strategies');
            process.exit(1);
        }
    }
}

// Memory stress test
async function memoryStressTest() {
    console.log('\n🔥 Memory Stress Test');
    console.log('===================\n');
    
    const iterations = 50;
    const startMemory = process.memoryUsage().rss;
    
    console.log(`Running ${iterations} stress iterations...`);
    
    for (let i = 0; i < iterations; i++) {
        // Allocate and release memory
        const tempData = new Array(1000).fill(0).map(() => ({
            id: Math.random(),
            data: new Array(100).fill(Math.random()),
            timestamp: Date.now()
        }));
        
        // Process data
        tempData.forEach(item => {
            item.processed = item.data.reduce((a, b) => a + b, 0);
        });
        
        // Cleanup reference
        tempData.length = 0;
        
        if (i % 10 === 0) {
            if (typeof global.gc === 'function') {
                global.gc();
            }
            
            const currentMemory = process.memoryUsage().rss;
            const change = currentMemory - startMemory;
            console.log(`Iteration ${i}: ${(currentMemory / 1024 / 1024).toFixed(2)}MB (${change > 0 ? '+' : ''}${(change / 1024 / 1024).toFixed(2)}MB)`);
        }
    }
    
    const endMemory = process.memoryUsage().rss;
    const memoryLeak = endMemory - startMemory;
    
    console.log(`\nStress test completed:`);
    console.log(`Memory change: ${(memoryLeak / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Leak detection: ${memoryLeak > 10 * 1024 * 1024 ? '❌ POTENTIAL LEAK' : '✅ NO SIGNIFICANT LEAK'}`);
}

// Main execution
async function main() {
    console.log('Starting comprehensive memory benchmark...\n');
    
    const benchmark = new MemoryBenchmark();
    
    try {
        await benchmark.runBenchmarks();
        await memoryStressTest();
    } catch (error) {
        console.error('❌ Benchmark failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}