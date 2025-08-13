#!/usr/bin/env node

/**
 * SQL EXECUTOR HELPER FOR MCP-LIKE DATABASE OPERATIONS
 * ===================================================
 * 
 * Provides direct SQL execution capabilities similar to MCP Supabase server
 * Includes EXPLAIN ANALYZE, index management, and performance monitoring
 */

const { getAdminClient } = require('./dist/config/database');

class SQLExecutor {
    constructor() {
        this.client = getAdminClient();
    }

    /**
     * Execute raw SQL query using Supabase client
     */
    async execSQL(sql, options = {}) {
        try {
            const start = Date.now();
            
            // Try to determine query type and use appropriate Supabase method
            const sqlLower = sql.toLowerCase().trim();
            let result;
            
            if (sqlLower.startsWith('select count(*)')) {
                // Handle COUNT queries
                const tableName = this.extractTableName(sql);
                if (tableName) {
                    result = await this.client.from(tableName).select('*', { count: 'exact', head: true });
                    result.data = [{ count: result.count }];
                } else {
                    // Fallback to rpc if available
                    result = await this.client.rpc('execute_sql', { query: sql });
                }
            } else if (sqlLower.startsWith('select')) {
                // Handle SELECT queries
                const tableName = this.extractTableName(sql);
                if (tableName && !sql.includes('WHERE')) {
                    // Simple table select
                    result = await this.client.from(tableName).select('*').limit(1000);
                } else {
                    // Complex query - try RPC
                    result = await this.client.rpc('execute_sql', { query: sql });
                }
            } else if (sqlLower.startsWith('explain')) {
                // EXPLAIN queries need special handling
                result = await this.client.rpc('execute_sql', { query: sql });
            } else {
                // DDL/DML queries (CREATE, INSERT, UPDATE, etc.)
                result = await this.client.rpc('execute_sql', { query: sql });
            }
            
            const executionTime = Date.now() - start;
            
            if (options.showTiming) {
                console.log(`⏱️  Query executed in ${executionTime}ms`);
            }
            
            return {
                success: true,
                data: result.data || [],
                executionTime,
                rowCount: result.data ? result.data.length : 0,
                count: result.count
            };
            
        } catch (error) {
            const executionTime = Date.now() - Date.now();
            
            if (options.showTiming) {
                console.log(`❌ Query failed in ${executionTime}ms: ${error.message}`);
            }
            
            return {
                success: false,
                error: error.message,
                executionTime,
                rowCount: 0
            };
        }
    }
    
    /**
     * Extract table name from simple SQL queries
     */
    extractTableName(sql) {
        const fromMatch = sql.match(/from\s+(\w+)/i);
        return fromMatch ? fromMatch[1] : null;
    }

    /**
     * Execute EXPLAIN ANALYZE query
     */
    async explainAnalyze(sql) {
        const explainSQL = `EXPLAIN ANALYZE ${sql}`;
        return await this.execSQL(explainSQL, { showTiming: true });
    }

    /**
     * Check if index exists
     */
    async indexExists(indexName) {
        const sql = `
            SELECT 1 FROM pg_indexes 
            WHERE indexname = '${indexName}'
        `;
        
        const result = await this.execSQL(sql);
        return result.success && result.data && result.data.length > 0;
    }

    /**
     * Create index if not exists
     */
    async createIndexSafe(indexSQL) {
        try {
            const result = await this.execSQL(indexSQL);
            return result;
        } catch (error) {
            if (error.message.includes('already exists')) {
                return {
                    success: true,
                    message: 'Index already exists',
                    skipped: true
                };
            }
            throw error;
        }
    }

    /**
     * Get table statistics
     */
    async getTableStats(tableName) {
        const sql = `
            SELECT 
                schemaname,
                tablename,
                n_tup_ins as inserts,
                n_tup_upd as updates,
                n_tup_del as deletes,
                n_live_tup as live_tuples,
                n_dead_tup as dead_tuples,
                last_analyze,
                last_autoanalyze
            FROM pg_stat_user_tables 
            WHERE tablename = '${tableName}'
        `;
        
        return await this.execSQL(sql);
    }

    /**
     * Get index usage statistics
     */
    async getIndexStats(tableName) {
        const sql = `
            SELECT 
                indexrelname as index_name,
                idx_tup_read as tuples_read,
                idx_tup_fetch as tuples_fetched,
                idx_scan as scans
            FROM pg_stat_user_indexes 
            WHERE relname = '${tableName}'
            ORDER BY idx_scan DESC
        `;
        
        return await this.execSQL(sql);
    }

    /**
     * Analyze table (update statistics)
     */
    async analyzeTable(tableName) {
        const sql = `ANALYZE ${tableName}`;
        return await this.execSQL(sql, { showTiming: true });
    }

    /**
     * Get query performance for conversation_history
     */
    async testConversationHistoryPerformance() {
        const queries = [
            {
                name: 'tenant_filter_performance',
                sql: `
                    SELECT COUNT(*) 
                    FROM conversation_history 
                    WHERE tenant_id = (SELECT id FROM tenants LIMIT 1)
                `
            },
            {
                name: 'date_range_performance',
                sql: `
                    SELECT COUNT(*) 
                    FROM conversation_history 
                    WHERE created_at >= '2024-12-18'
                    AND created_at <= '2025-01-17'
                `
            },
            {
                name: 'message_type_performance',
                sql: `
                    SELECT COUNT(*) 
                    FROM conversation_history 
                    WHERE message_type = 'user'
                `
            },
            {
                name: 'composite_filter_performance',
                sql: `
                    SELECT COUNT(*) 
                    FROM conversation_history 
                    WHERE tenant_id = (SELECT id FROM tenants LIMIT 1)
                    AND created_at >= '2024-12-18'
                    AND created_at <= '2025-01-17'
                    AND message_type = 'user'
                `
            }
        ];

        const results = {};
        
        for (const query of queries) {
            console.log(`\n🔍 Testing: ${query.name}`);
            const result = await this.execSQL(query.sql, { showTiming: true });
            results[query.name] = result;
            
            if (result.success) {
                console.log(`   ✅ Success: ${result.rowCount} rows, ${result.executionTime}ms`);
            } else {
                console.log(`   ❌ Error: ${result.error}`);
            }
        }
        
        return results;
    }

    /**
     * Test function performance
     */
    async testFunctionPerformance(functionName, params = {}) {
        const paramList = Object.entries(params)
            .map(([key, value]) => `${key} => '${value}'`)
            .join(', ');
            
        const sql = paramList 
            ? `SELECT * FROM ${functionName}(${paramList})`
            : `SELECT * FROM ${functionName}()`;
            
        console.log(`\n⚡ Testing function: ${functionName}`);
        console.log(`   SQL: ${sql}`);
        
        const result = await this.execSQL(sql, { showTiming: true });
        
        if (result.success) {
            console.log(`   ✅ Function executed successfully`);
            console.log(`   ⏱️  Execution time: ${result.executionTime}ms`);
            console.log(`   📊 Rows returned: ${result.rowCount}`);
            
            if (result.data && result.data.length > 0) {
                const firstRow = result.data[0];
                if (firstRow.execution_time_ms) {
                    console.log(`   🔍 Internal execution time: ${firstRow.execution_time_ms}ms`);
                }
                if (firstRow.processed_tenants) {
                    console.log(`   👥 Processed tenants: ${firstRow.processed_tenants}`);
                }
            }
        } else {
            console.log(`   ❌ Function failed: ${result.error}`);
        }
        
        return result;
    }

    /**
     * Create the missing exec_sql function if needed
     */
    async createExecSQLFunction() {
        const sql = `
        CREATE OR REPLACE FUNCTION exec_sql(sql text)
        RETURNS TABLE(result jsonb)
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        DECLARE
            rec record;
            result_array jsonb := '[]'::jsonb;
            row_obj jsonb;
        BEGIN
            -- Execute the dynamic SQL
            FOR rec IN EXECUTE sql LOOP
                row_obj := to_jsonb(rec);
                result_array := result_array || row_obj;
            END LOOP;
            
            -- Return the result as a single JSONB column
            RETURN QUERY SELECT result_array;
        END;
        $$;
        `;
        
        try {
            console.log('🔧 Creating exec_sql helper function...');
            const result = await this.client.rpc('sql', { sql });
            console.log('✅ exec_sql function created successfully');
            return result;
        } catch (error) {
            console.log('ℹ️  exec_sql function may already exist or using different method');
            return { success: false, error: error.message };
        }
    }
}

// Test the SQL executor
async function testSQLExecutor() {
    console.log('🧪 TESTING SQL EXECUTOR');
    console.log('='.repeat(40));
    
    const executor = new SQLExecutor();
    
    try {
        // Test basic query
        console.log('\n1. Testing basic query...');
        const basicResult = await executor.execSQL('SELECT COUNT(*) as total_tenants FROM tenants');
        console.log(`   Result: ${JSON.stringify(basicResult, null, 2)}`);
        
        // Test table stats
        console.log('\n2. Testing table statistics...');
        const statsResult = await executor.getTableStats('tenants');
        console.log(`   Stats: ${JSON.stringify(statsResult.data, null, 2)}`);
        
        // Test conversation history performance
        console.log('\n3. Testing conversation history performance...');
        await executor.testConversationHistoryPerformance();
        
        console.log('\n✅ SQL Executor tests completed');
        
    } catch (error) {
        console.error('❌ SQL Executor test failed:', error.message);
    }
}

// Run tests if called directly
if (require.main === module) {
    testSQLExecutor()
        .then(() => {
            console.log('\n🎉 SQL Executor testing completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 SQL Executor testing failed:', error.message);
            process.exit(1);
        });
}

module.exports = { SQLExecutor };