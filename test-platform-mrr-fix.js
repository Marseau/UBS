/**
 * Test script to validate the platform MRR calculation fix
 * This will test the corrected subscription cost field mapping
 */

const { createClient } = require('@supabase/supabase-js');
const { PlatformAggregationOptimizedService } = require('./dist/services/tenant-metrics/platform-aggregation-optimized.service.js');
const { TenantMetricsRedisCache } = require('./dist/services/tenant-metrics/tenant-metrics-redis-cache.service.js');
const { DatabasePoolManagerService } = require('./dist/services/tenant-metrics/database-pool-manager.service.js');
const winston = require('winston');
require('dotenv').config();

// Initialize logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console()
    ]
});

async function testPlatformMrrCalculation() {
    try {
        console.log('🧪 Testing Platform MRR Calculation Fix...\n');
        
        // First, let's check what subscription payments we have in the database
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase credentials');
        }
        
        const client = createClient(supabaseUrl, supabaseKey);
        
        // Check subscription payments for the last 30 days
        const { data: subscriptionPayments, error } = await client
            .from('subscription_payments')
            .select('tenant_id, amount, currency, subscription_plan, payment_status, payment_period_start')
            .eq('payment_status', 'completed')
            .gte('payment_period_start', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
            .order('amount', { ascending: false });
            
        if (error) throw error;
        
        console.log('📊 Subscription Payments (Last 30 days):');
        console.log(`Total payments found: ${subscriptionPayments?.length || 0}`);
        
        if (subscriptionPayments && subscriptionPayments.length > 0) {
            const totalMRR = subscriptionPayments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);
            const payingTenants = new Set(subscriptionPayments.filter(p => parseFloat(p.amount || 0) > 0).map(p => p.tenant_id)).size;
            
            console.log(`💰 Total MRR from subscription_payments: R$ ${totalMRR.toFixed(2)}`);
            console.log(`👥 Paying tenants: ${payingTenants}`);
            console.log(`📋 Payment breakdown:`);
            
            const paymentsByPlan = {};
            subscriptionPayments.forEach(payment => {
                const plan = payment.subscription_plan || 'unknown';
                const amount = parseFloat(payment.amount || 0);
                if (!paymentsByPlan[plan]) paymentsByPlan[plan] = { count: 0, total: 0 };
                paymentsByPlan[plan].count++;
                paymentsByPlan[plan].total += amount;
            });
            
            Object.entries(paymentsByPlan).forEach(([plan, data]) => {
                console.log(`   ${plan}: ${data.count} tenants, R$ ${data.total.toFixed(2)}`);
            });
        }
        
        // Initialize services for testing
        const cache = new TenantMetricsRedisCache({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0'),
            maxMemory: process.env.REDIS_MAX_MEMORY || '1073741824',
            evictionPolicy: process.env.REDIS_EVICTION_POLICY || 'allkeys-lru'
        });
        
        const dbPool = new DatabasePoolManagerService(logger, {
            minConnections: 2,
            maxConnections: 10,
            acquireTimeoutMillis: 30000,
            idleTimeoutMillis: 300000
        });
        
        const platformAggregation = new PlatformAggregationOptimizedService(
            logger,
            cache,
            dbPool
        );
        
        console.log('\n🔄 Testing Platform Aggregation with Fixed MRR Calculation...');
        
        // Test 30-day aggregation
        const result = await platformAggregation.aggregatePlatformMetrics('30d', true);
        
        console.log('\n✅ Platform Aggregation Results:');
        console.log(`📊 Active Tenants: ${result.active_tenants}`);
        console.log(`💰 Platform MRR: R$ ${(result.platform_mrr || 0).toFixed(2)}`);
        console.log(`📈 Total Revenue: R$ ${(result.total_revenue || 0).toFixed(2)}`);
        console.log(`📅 Calculation Date: ${result.calculation_date}`);
        console.log(`🔍 Data Source: ${result.data_source}`);
        
        if (result.platform_mrr && result.platform_mrr > 0) {
            console.log('\n✅ SUCCESS: Platform MRR is now correctly calculated!');
            console.log(`💡 The fix successfully retrieved subscription costs from the subscription_payments table.`);
        } else {
            console.log('\n⚠️  WARNING: Platform MRR is still $0. This could mean:');
            console.log('   1. All tenants are on free/trial plans');
            console.log('   2. No subscription payments found in the selected period');
            console.log('   3. There might be a date filtering issue');
        }
        
        // Cleanup
        await dbPool.close();
        await cache.disconnect();
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
testPlatformMrrCalculation();