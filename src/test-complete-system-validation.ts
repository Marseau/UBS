/**
 * COMPLETE SYSTEM VALIDATION
 * Simplified comprehensive test runner
 */

import { UnifiedMetricsService } from './services/unified-metrics.service';
import { UnifiedCronService } from './services/unified-cron.service';
import { getAdminClient } from './config/database';
import * as fs from 'fs';
import * as path from 'path';

async function runCompleteSystemValidation(): Promise<boolean> {
    console.log('🧪 COMPLETE SYSTEM VALIDATION');
    console.log('===============================================');
    
    let allTestsPassed = true;
    const startTime = Date.now();
    
    try {
        // Test 1: Database Connectivity
        console.log('\\n🗄️  Testing Database Connectivity...');
        try {
            const client = getAdminClient();
            const { data, error } = await client.from('tenants').select('count').limit(1);
            if (error) throw error;
            console.log('✅ Database connection successful');
        } catch (error) {
            console.error('❌ Database test failed:', error);
            allTestsPassed = false;
        }
        
        // Test 2: Unified Metrics Service
        console.log('\\n📊 Testing Unified Metrics Service...');
        try {
            const service = UnifiedMetricsService.getInstance();
            const kpis = await service.getPlatformKPIs({ period: '30d' });
            
            if (!kpis || !kpis.kpis) {
                throw new Error('KPIs response missing data');
            }
            
            console.log('✅ Unified Metrics Service working');
            console.log(`   Response time: ${kpis.metadata?.calculation_time_ms || 'N/A'}ms`);
        } catch (error) {
            console.error('❌ Unified Metrics test failed:', error);
            allTestsPassed = false;
        }
        
        // Test 3: Cron Service
        console.log('\\n⏰ Testing Cron Service...');
        try {
            const cronService = new UnifiedCronService();
            const status = cronService.getStatus();
            const asyncStatus = await cronService.getStatusAsync();
            
            if (typeof status !== 'object' || typeof asyncStatus !== 'object') {
                throw new Error('Status methods not returning objects');
            }
            
            console.log('✅ Cron Service working');
            console.log(`   Memory usage: ${status.performance.memoryUsage.toFixed(1)}MB`);
        } catch (error) {
            console.error('❌ Cron Service test failed:', error);
            allTestsPassed = false;
        }
        
        // Test 4: Build System
        console.log('\\n🔨 Testing Build System...');
        try {
            const distPath = path.join(process.cwd(), 'src/frontend/dist/js');
            if (!fs.existsSync(distPath)) {
                throw new Error('Frontend dist directory does not exist');
            }
            
            const files = fs.readdirSync(distPath).filter(f => f.endsWith('.js'));
            if (files.length === 0) {
                throw new Error('No build artifacts found');
            }
            
            let totalSize = 0;
            for (const file of files) {
                const stats = fs.statSync(path.join(distPath, file));
                totalSize += stats.size;
            }
            
            const totalKB = Math.round(totalSize / 1024);
            
            console.log('✅ Build System working');
            console.log(`   ${files.length} files built, total size: ${totalKB}KB`);
        } catch (error) {
            console.error('❌ Build System test failed:', error);
            allTestsPassed = false;
        }
        
        // Test 5: Performance Check
        console.log('\\n⚡ Testing Performance...');
        try {
            const service = UnifiedMetricsService.getInstance();
            const start = Date.now();
            
            await service.getPlatformKPIs({ period: '7d' });
            
            const responseTime = Date.now() - start;
            const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
            
            console.log('✅ Performance test completed');
            console.log(`   API response time: ${responseTime}ms`);
            console.log(`   Memory usage: ${memUsage}MB`);
            
            if (responseTime > 1000) {
                console.warn('⚠️  API response time exceeds 1000ms');
            }
            
        } catch (error) {
            console.error('❌ Performance test failed:', error);
            allTestsPassed = false;
        }
        
    } catch (error) {
        console.error('❌ System validation failed:', error);
        allTestsPassed = false;
    }
    
    const totalTime = Date.now() - startTime;
    
    console.log('\\n===============================================');
    console.log('VALIDATION COMPLETE');
    console.log('===============================================');
    console.log(`Total execution time: ${totalTime}ms`);
    
    if (allTestsPassed) {
        console.log('\\n🎉 ALL SYSTEMS HEALTHY ✅ - READY FOR 110% OPTIMIZATION');
        return true;
    } else {
        console.log('\\n⚠️  SOME TESTS FAILED - REVIEW REQUIRED BEFORE PROCEEDING');
        return false;
    }
}

// Execute if run directly
if (require.main === module) {
    runCompleteSystemValidation()
        .then(success => process.exit(success ? 0 : 1))
        .catch(error => {
            console.error('Test runner crashed:', error);
            process.exit(1);
        });
}

export { runCompleteSystemValidation };