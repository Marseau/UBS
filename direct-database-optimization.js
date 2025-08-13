#!/usr/bin/env node

/**
 * DIRECT DATABASE OPTIMIZATION
 * ============================
 * 
 * Uses direct Supabase client methods to optimize database performance
 * Target: Get all queries under performance targets
 * 
 * Performance Targets:
 * - calculate_enhanced_platform_metrics: 284ms → <200ms
 * - Basic tenant query: 216ms → <100ms  
 * - Appointments count: 196ms → <150ms
 * - Conversation history query: 221ms → <120ms
 */

const { getAdminClient } = require('./dist/config/database');

class DirectDatabaseOptimizer {
    constructor() {
        this.client = getAdminClient();
        this.baseline = {};
        this.optimized = {};
        this.optimizations = [];
    }

    /**
     * Test current performance to establish baseline
     */
    async measureBaseline() {
        console.log('📊 MEASURING BASELINE PERFORMANCE');
        console.log('='.repeat(50));

        const tests = [
            {
                name: 'tenant_count_query',
                target: 100,
                test: async () => {
                    const start = Date.now();
                    const result = await this.client.from('tenants').select('*', { count: 'exact', head: true });
                    return { time: Date.now() - start, count: result.count };
                }
            },
            {
                name: 'conversation_history_count',
                target: 120,
                test: async () => {
                    const start = Date.now();
                    const result = await this.client
                        .from('conversation_history')
                        .select('*', { count: 'exact', head: true })
                        .gte('created_at', '2024-12-18')
                        .lte('created_at', '2025-01-17');
                    return { time: Date.now() - start, count: result.count };
                }
            },
            {
                name: 'appointments_count',
                target: 150,
                test: async () => {
                    const start = Date.now();
                    const result = await this.client
                        .from('appointments')
                        .select('*', { count: 'exact', head: true })
                        .gte('created_at', '2024-12-18')
                        .lte('created_at', '2025-01-17');
                    return { time: Date.now() - start, count: result.count };
                }
            },
            {
                name: 'enhanced_platform_metrics',
                target: 200,
                test: async () => {
                    const start = Date.now();
                    const result = await this.client.rpc('calculate_enhanced_platform_metrics', {
                        p_calculation_date: '2025-01-17',
                        p_period_days: 30
                    });
                    return { 
                        time: Date.now() - start, 
                        internalTime: result.data?.[0]?.execution_time_ms,
                        success: result.data?.[0]?.success
                    };
                }
            }
        ];

        for (const test of tests) {
            try {
                console.log(`\n🔍 Testing: ${test.name}`);
                const result = await test.test();
                
                this.baseline[test.name] = {
                    executionTime: result.time,
                    target: test.target,
                    passed: result.time <= test.target,
                    details: result
                };
                
                const status = result.time <= test.target ? '✅' : '❌';
                console.log(`   ${status} ${result.time}ms (target: ${test.target}ms)`);
                
                if (result.count !== undefined) {
                    console.log(`   📊 Records: ${result.count}`);
                }
                
                if (result.internalTime) {
                    console.log(`   🔍 Internal time: ${result.internalTime}ms`);
                }
                
            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
                this.baseline[test.name] = {
                    executionTime: 9999,
                    target: test.target,
                    passed: false,
                    error: error.message
                };
            }
        }
    }

    /**
     * Create optimized indexes using DDL through functions
     */
    async createOptimizedIndexes() {
        console.log('\n🔧 CREATING OPTIMIZED INDEXES');
        console.log('='.repeat(50));

        // We'll create a function that creates our indexes
        const indexCreationFunction = `
        CREATE OR REPLACE FUNCTION create_performance_indexes()
        RETURNS text
        LANGUAGE plpgsql
        AS $$
        DECLARE
            result_text text := '';
        BEGIN
            -- 1. Conversation History Indexes (HIGHEST PRIORITY)
            BEGIN
                CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_history_tenant_date_type 
                ON conversation_history(tenant_id, created_at, message_type)
                WHERE message_type = 'user';
                result_text := result_text || 'idx_conversation_history_tenant_date_type created; ';
            EXCEPTION WHEN OTHERS THEN
                result_text := result_text || 'idx_conversation_history_tenant_date_type failed: ' || SQLERRM || '; ';
            END;

            BEGIN
                CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_history_created_at 
                ON conversation_history(created_at);
                result_text := result_text || 'idx_conversation_history_created_at created; ';
            EXCEPTION WHEN OTHERS THEN
                result_text := result_text || 'idx_conversation_history_created_at failed: ' || SQLERRM || '; ';
            END;

            BEGIN
                CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_history_confidence 
                ON conversation_history(confidence_score) 
                WHERE confidence_score IS NOT NULL;
                result_text := result_text || 'idx_conversation_history_confidence created; ';
            EXCEPTION WHEN OTHERS THEN
                result_text := result_text || 'idx_conversation_history_confidence failed: ' || SQLERRM || '; ';
            END;

            -- 2. Appointments Indexes (MEDIUM PRIORITY)
            BEGIN
                CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_tenant_created 
                ON appointments(tenant_id, created_at);
                result_text := result_text || 'idx_appointments_tenant_created created; ';
            EXCEPTION WHEN OTHERS THEN
                result_text := result_text || 'idx_appointments_tenant_created failed: ' || SQLERRM || '; ';
            END;

            BEGIN
                CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_created_at 
                ON appointments(created_at);
                result_text := result_text || 'idx_appointments_created_at created; ';
            EXCEPTION WHEN OTHERS THEN
                result_text := result_text || 'idx_appointments_created_at failed: ' || SQLERRM || '; ';
            END;

            -- 3. Tenants Indexes (MEDIUM PRIORITY)
            BEGIN
                CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_status_active 
                ON tenants(status) 
                WHERE status = 'active';
                result_text := result_text || 'idx_tenants_status_active created; ';
            EXCEPTION WHEN OTHERS THEN
                result_text := result_text || 'idx_tenants_status_active failed: ' || SQLERRM || '; ';
            END;

            -- 4. UBS Metrics Indexes (LOW PRIORITY)
            BEGIN
                CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ubs_metrics_tenant_calc_period 
                ON ubs_metric_system(tenant_id, calculation_date, period_days);
                result_text := result_text || 'idx_ubs_metrics_tenant_calc_period created; ';
            EXCEPTION WHEN OTHERS THEN
                result_text := result_text || 'idx_ubs_metrics_tenant_calc_period failed: ' || SQLERRM || '; ';
            END;

            RETURN result_text;
        END;
        $$;
        `;

        try {
            console.log('🔨 Creating index creation function...');
            
            // First create the function
            await this.client.rpc('sql', { query: indexCreationFunction });
            console.log('✅ Index creation function created');
            
            // Then execute it
            console.log('🚀 Executing index creation...');
            const result = await this.client.rpc('create_performance_indexes');
            
            console.log('✅ Index creation completed:');
            console.log(`   📋 Result: ${result.data}`);
            
            this.optimizations.push({
                type: 'indexes',
                description: 'Performance optimization indexes created',
                result: result.data
            });
            
        } catch (error) {
            console.error('❌ Error creating indexes:', error.message);
        }
    }

    /**
     * Update table statistics for better query planning
     */
    async updateTableStatistics() {
        console.log('\n📊 UPDATING TABLE STATISTICS');
        console.log('='.repeat(50));

        const analyzeFunction = `
        CREATE OR REPLACE FUNCTION analyze_performance_tables()
        RETURNS text
        LANGUAGE plpgsql
        AS $$
        DECLARE
            result_text text := '';
        BEGIN
            -- Analyze key tables
            ANALYZE conversation_history;
            result_text := result_text || 'conversation_history analyzed; ';
            
            ANALYZE appointments;
            result_text := result_text || 'appointments analyzed; ';
            
            ANALYZE tenants;
            result_text := result_text || 'tenants analyzed; ';
            
            ANALYZE ubs_metric_system;
            result_text := result_text || 'ubs_metric_system analyzed; ';
            
            RETURN result_text;
        END;
        $$;
        `;

        try {
            console.log('🔨 Creating analyze function...');
            await this.client.rpc('sql', { query: analyzeFunction });
            
            console.log('📊 Running table analysis...');
            const start = Date.now();
            const result = await this.client.rpc('analyze_performance_tables');
            const analyzeTime = Date.now() - start;
            
            console.log(`✅ Table analysis completed in ${analyzeTime}ms`);
            console.log(`   📋 Result: ${result.data}`);
            
            this.optimizations.push({
                type: 'analyze',
                description: 'Table statistics updated',
                time: analyzeTime,
                result: result.data
            });
            
        } catch (error) {
            console.error('❌ Error updating statistics:', error.message);
        }
    }

    /**
     * Create optimized platform metrics function
     */
    async createOptimizedFunction() {
        console.log('\n⚡ CREATING OPTIMIZED PLATFORM METRICS FUNCTION');
        console.log('='.repeat(50));

        const optimizedFunction = `
        CREATE OR REPLACE FUNCTION calculate_enhanced_platform_metrics_ultra_optimized(
            p_calculation_date DATE DEFAULT CURRENT_DATE,
            p_period_days INTEGER DEFAULT 30,
            p_tenant_id UUID DEFAULT NULL
        )
        RETURNS TABLE (
            success BOOLEAN,
            processed_tenants INTEGER,
            platform_totals JSONB,
            execution_time_ms INTEGER
        ) 
        LANGUAGE plpgsql
        AS $$
        DECLARE
            v_start_time TIMESTAMP;
            v_end_time TIMESTAMP;
            v_execution_time INTEGER;
            v_start_date DATE;
            v_end_date DATE;
            v_platform_totals JSONB;
            
            -- Single aggregated query results
            v_tenant_count INTEGER := 0;
            v_total_revenue DECIMAL(12,2) := 0;
            v_total_appointments INTEGER := 0;
            v_total_customers INTEGER := 0;
            v_total_ai_interactions INTEGER := 0;
            v_total_conversations INTEGER := 0;
            v_valid_conversations INTEGER := 0;
            
        BEGIN
            v_start_time := clock_timestamp();
            v_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
            v_end_date := p_calculation_date;
            
            -- ULTRA OPTIMIZATION: Single query for all metrics
            WITH tenant_metrics AS (
                SELECT 
                    COUNT(DISTINCT t.id) as tenant_count,
                    COALESCE(SUM(ums.tenant_revenue_value), 0) as total_revenue,
                    COALESCE(SUM(ums.tenant_appointments_count), 0) as total_appointments,
                    COALESCE(SUM(ums.tenant_customers_count), 0) as total_customers,
                    COALESCE(SUM(ums.tenant_ai_interactions), 0) as total_ai_interactions
                FROM tenants t
                LEFT JOIN ubs_metric_system ums ON (
                    ums.tenant_id = t.id 
                    AND ums.calculation_date = p_calculation_date 
                    AND ums.period_days = p_period_days
                )
                WHERE t.status = 'active'
                AND (p_tenant_id IS NULL OR t.id = p_tenant_id)
            ),
            conversation_metrics AS (
                SELECT 
                    COUNT(*) as total_conversations,
                    COUNT(*) FILTER (WHERE confidence_score >= 0.7) as valid_conversations
                FROM conversation_history ch
                WHERE ch.created_at >= v_start_date 
                AND ch.created_at <= v_end_date 
                AND ch.message_type = 'user'
                AND (p_tenant_id IS NULL OR ch.tenant_id = p_tenant_id)
            )
            SELECT 
                tm.tenant_count,
                tm.total_revenue,
                tm.total_appointments,
                tm.total_customers,
                tm.total_ai_interactions,
                cm.total_conversations,
                cm.valid_conversations
            INTO 
                v_tenant_count,
                v_total_revenue,
                v_total_appointments,
                v_total_customers,
                v_total_ai_interactions,
                v_total_conversations,
                v_valid_conversations
            FROM tenant_metrics tm
            CROSS JOIN conversation_metrics cm;
            
            -- Build result JSON
            v_platform_totals := jsonb_build_object(
                'total_revenue', v_total_revenue,
                'total_appointments', v_total_appointments,
                'total_customers', v_total_customers,
                'total_ai_interactions', v_total_ai_interactions,
                'active_tenants', v_tenant_count,
                'platform_mrr', v_tenant_count * 79.90,
                'total_conversations', v_total_conversations,
                'valid_conversations', v_valid_conversations,
                'spam_rate_pct', CASE 
                    WHEN v_total_conversations > 0 
                    THEN ((v_total_conversations - v_valid_conversations) * 100.0 / v_total_conversations)
                    ELSE 0 
                END,
                'operational_efficiency_pct', CASE 
                    WHEN v_total_conversations > 0 
                    THEN (v_total_appointments * 100.0 / v_total_conversations)
                    ELSE 0 
                END
            );
            
            -- Single UPSERT for platform record
            INSERT INTO ubs_metric_system (
                tenant_id, calculation_date, period_days, data_source,
                platform_total_revenue, platform_total_appointments, platform_total_customers,
                platform_total_ai_interactions, platform_active_tenants, platform_mrr,
                platform_spam_rate_pct, platform_operational_efficiency_pct,
                created_at, updated_at
            ) VALUES (
                NULL, p_calculation_date, p_period_days, 'ultra_optimized_function',
                v_total_revenue, v_total_appointments, v_total_customers, v_total_ai_interactions,
                v_tenant_count, v_tenant_count * 79.90,
                CASE WHEN v_total_conversations > 0 
                     THEN ((v_total_conversations - v_valid_conversations) * 100.0 / v_total_conversations)
                     ELSE 0 END,
                CASE WHEN v_total_conversations > 0 
                     THEN (v_total_appointments * 100.0 / v_total_conversations)
                     ELSE 0 END,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            ON CONFLICT (tenant_id, calculation_date, period_days, data_source) 
            WHERE tenant_id IS NULL
            DO UPDATE SET
                platform_total_revenue = EXCLUDED.platform_total_revenue,
                platform_total_appointments = EXCLUDED.platform_total_appointments,
                platform_total_customers = EXCLUDED.platform_total_customers,
                platform_total_ai_interactions = EXCLUDED.platform_total_ai_interactions,
                platform_active_tenants = EXCLUDED.platform_active_tenants,
                platform_mrr = EXCLUDED.platform_mrr,
                platform_spam_rate_pct = EXCLUDED.platform_spam_rate_pct,
                platform_operational_efficiency_pct = EXCLUDED.platform_operational_efficiency_pct,
                updated_at = CURRENT_TIMESTAMP;
            
            v_end_time := clock_timestamp();
            v_execution_time := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER * 1000;
            
            RETURN QUERY SELECT 
                true as success,
                v_tenant_count,
                v_platform_totals,
                v_execution_time;
            
        EXCEPTION
            WHEN OTHERS THEN
                v_end_time := clock_timestamp();
                v_execution_time := EXTRACT(EPOCH FROM (v_end_time - v_start_time))::INTEGER * 1000;
                
                RETURN QUERY SELECT 
                    false as success,
                    v_tenant_count,
                    jsonb_build_object('error', SQLERRM, 'execution_time_ms', v_execution_time),
                    v_execution_time;
        END;
        $$;
        `;

        try {
            console.log('🔨 Creating ultra-optimized function...');
            
            const start = Date.now();
            await this.client.rpc('sql', { query: optimizedFunction });
            const createTime = Date.now() - start;
            
            console.log(`✅ Ultra-optimized function created in ${createTime}ms`);
            
            this.optimizations.push({
                type: 'function',
                description: 'Ultra-optimized platform metrics function created',
                createTime
            });
            
        } catch (error) {
            console.error('❌ Error creating optimized function:', error.message);
        }
    }

    /**
     * Test optimized performance
     */
    async measureOptimizedPerformance() {
        console.log('\n🚀 MEASURING OPTIMIZED PERFORMANCE');
        console.log('='.repeat(50));

        const tests = [
            {
                name: 'tenant_count_query',
                target: 100,
                test: async () => {
                    const start = Date.now();
                    const result = await this.client.from('tenants').select('*', { count: 'exact', head: true });
                    return { time: Date.now() - start, count: result.count };
                }
            },
            {
                name: 'conversation_history_count',
                target: 120,
                test: async () => {
                    const start = Date.now();
                    const result = await this.client
                        .from('conversation_history')
                        .select('*', { count: 'exact', head: true })
                        .gte('created_at', '2024-12-18')
                        .lte('created_at', '2025-01-17');
                    return { time: Date.now() - start, count: result.count };
                }
            },
            {
                name: 'appointments_count',
                target: 150,
                test: async () => {
                    const start = Date.now();
                    const result = await this.client
                        .from('appointments')
                        .select('*', { count: 'exact', head: true })
                        .gte('created_at', '2024-12-18')
                        .lte('created_at', '2025-01-17');
                    return { time: Date.now() - start, count: result.count };
                }
            },
            {
                name: 'ultra_optimized_platform_metrics',
                target: 200,
                test: async () => {
                    const start = Date.now();
                    const result = await this.client.rpc('calculate_enhanced_platform_metrics_ultra_optimized', {
                        p_calculation_date: '2025-01-17',
                        p_period_days: 30
                    });
                    return { 
                        time: Date.now() - start, 
                        internalTime: result.data?.[0]?.execution_time_ms,
                        success: result.data?.[0]?.success
                    };
                }
            }
        ];

        for (const test of tests) {
            try {
                console.log(`\n⚡ Testing optimized: ${test.name}`);
                const result = await test.test();
                
                this.optimized[test.name] = {
                    executionTime: result.time,
                    target: test.target,
                    passed: result.time <= test.target,
                    details: result
                };
                
                const status = result.time <= test.target ? '✅' : '❌';
                console.log(`   ${status} ${result.time}ms (target: ${test.target}ms)`);
                
                if (result.count !== undefined) {
                    console.log(`   📊 Records: ${result.count}`);
                }
                
                if (result.internalTime) {
                    console.log(`   🔍 Internal time: ${result.internalTime}ms`);
                }
                
                // Compare with baseline
                const baseline = this.baseline[test.name];
                if (baseline && baseline.executionTime) {
                    const improvement = ((baseline.executionTime - result.time) / baseline.executionTime) * 100;
                    console.log(`   📈 Improvement: ${improvement.toFixed(1)}% faster than baseline`);
                }
                
            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
                this.optimized[test.name] = {
                    executionTime: 9999,
                    target: test.target,
                    passed: false,
                    error: error.message
                };
            }
        }
    }

    /**
     * Generate comprehensive optimization report
     */
    async generateReport() {
        console.log('\n📋 OPTIMIZATION REPORT');
        console.log('='.repeat(50));

        console.log('\n🎯 PERFORMANCE COMPARISON:');
        
        let targetsAchieved = 0;
        let totalTargets = 0;
        
        Object.keys(this.baseline).forEach(testName => {
            const baseline = this.baseline[testName];
            const optimized = this.optimized[testName];
            
            if (baseline && optimized) {
                totalTargets++;
                const improvement = ((baseline.executionTime - optimized.executionTime) / baseline.executionTime) * 100;
                
                console.log(`\n   🔍 ${testName}:`);
                console.log(`      Before: ${baseline.executionTime}ms`);
                console.log(`      After:  ${optimized.executionTime}ms`);
                console.log(`      Target: ${optimized.target}ms`);
                console.log(`      Improvement: ${improvement.toFixed(1)}%`);
                console.log(`      Status: ${optimized.passed ? '✅ TARGET ACHIEVED' : '❌ TARGET MISSED'}`);
                
                if (optimized.passed) targetsAchieved++;
            }
        });

        console.log(`\n📊 OVERALL RESULTS:`);
        console.log(`   🎯 Targets Achieved: ${targetsAchieved}/${totalTargets} (${((targetsAchieved/totalTargets)*100).toFixed(1)}%)`);

        console.log('\n🔧 OPTIMIZATIONS APPLIED:');
        this.optimizations.forEach(opt => {
            console.log(`   ✅ ${opt.type.toUpperCase()}: ${opt.description}`);
            if (opt.createTime) console.log(`      Creation time: ${opt.createTime}ms`);
            if (opt.result) console.log(`      Result: ${opt.result}`);
        });

        const successRate = (targetsAchieved/totalTargets)*100;
        
        if (successRate >= 90) {
            console.log('\n🏆 EXCELLENT! Almost all performance targets achieved!');
        } else if (successRate >= 75) {
            console.log('\n✅ GOOD! Most performance targets achieved!');
        } else if (successRate >= 50) {
            console.log('\n⚠️ PARTIAL SUCCESS. Some targets still need work.');
        } else {
            console.log('\n❌ NEEDS MORE WORK. Consider additional optimizations.');
        }

        // Save report
        const report = {
            timestamp: new Date().toISOString(),
            targetsAchieved,
            totalTargets,
            successRate,
            baseline: this.baseline,
            optimized: this.optimized,
            optimizations: this.optimizations
        };

        require('fs').writeFileSync(
            '/Users/marseau/Developer/WhatsAppSalon-N8N/direct-optimization-report.json',
            JSON.stringify(report, null, 2)
        );
        
        console.log('\n💾 Detailed report saved to: direct-optimization-report.json');
        
        return report;
    }

    /**
     * Run complete optimization process
     */
    async optimize() {
        console.log('🚀 DIRECT DATABASE OPTIMIZATION');
        console.log('='.repeat(60));
        
        try {
            await this.measureBaseline();
            await this.createOptimizedIndexes();
            await this.updateTableStatistics();
            await this.createOptimizedFunction();
            await this.measureOptimizedPerformance();
            const report = await this.generateReport();
            
            console.log('\n🎉 DIRECT DATABASE OPTIMIZATION COMPLETED!');
            
            return report;
            
        } catch (error) {
            console.error('💥 Optimization failed:', error.message);
            throw error;
        }
    }
}

// Run optimization if called directly
if (require.main === module) {
    const optimizer = new DirectDatabaseOptimizer();
    
    optimizer.optimize()
        .then(report => {
            console.log('\n✅ Direct database optimization completed successfully');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Direct database optimization failed:', error.message);
            process.exit(1);
        });
}

module.exports = { DirectDatabaseOptimizer };