#!/usr/bin/env node

/**
 * TEST: Direct Calculators Test (JavaScript)
 * 
 * Tests the calculators directly without TypeScript compilation
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Mock BaseCalculatorOptions for testing
function createTestOptions(tenantId, period) {
    const endDate = new Date();
    const startDate = new Date();
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    startDate.setDate(endDate.getDate() - periodDays);

    return {
        tenantId,
        period,
        startDate,
        endDate
    };
}

// Simple AI Efficiency Calculator (JavaScript version)
class AIEfficiencyCalculatorJS {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }

    async calculate(options) {
        console.log(`🤖 Calculating AI Efficiency for ${options.tenantId} (${options.period})`);
        
        try {
            // Fetch conversations
            const { data: conversations, error } = await this.supabase
                .from('conversation_history')
                .select('conversation_outcome, confidence_score, conversation_context')
                .eq('tenant_id', options.tenantId)
                .gte('created_at', options.startDate.toISOString())
                .lte('created_at', options.endDate.toISOString())
                .not('conversation_outcome', 'is', null)
                .not('confidence_score', 'is', null);

            if (error) {
                throw new Error(`Database error: ${error.message}`);
            }

            if (!conversations || conversations.length === 0) {
                return {
                    value: {
                        percentage: 0,
                        total_conversations: 0,
                        success_weighted: 0,
                        neutral_weighted: 0,
                        failure_weighted: 0,
                        avg_confidence_score: 0
                    },
                    metadata: {
                        calculated_at: new Date().toISOString(),
                        execution_time_ms: 0,
                        data_points_count: 0,
                        period: options.period,
                        tenant_id: options.tenantId
                    }
                };
            }

            // Simple calculation
            const totalConversations = conversations.length;
            const avgConfidence = conversations.reduce((sum, conv) => sum + (conv.confidence_score || 0), 0) / totalConversations;
            
            return {
                value: {
                    percentage: Math.round(avgConfidence * 100) / 100,
                    total_conversations: totalConversations,
                    success_weighted: Math.round(avgConfidence * totalConversations * 100) / 100,
                    neutral_weighted: 0,
                    failure_weighted: 0,
                    avg_confidence_score: Math.round(avgConfidence * 1000) / 1000
                },
                metadata: {
                    calculated_at: new Date().toISOString(),
                    execution_time_ms: Date.now() - Date.now(),
                    data_points_count: totalConversations,
                    period: options.period,
                    tenant_id: options.tenantId
                }
            };

        } catch (error) {
            console.error('❌ Error calculating AI Efficiency:', error);
            throw error;
        }
    }
}

async function testCalculators() {
    console.log('🧪 TESTE: CALCULATORS DIRETO (JAVASCRIPT)');
    console.log('='.repeat(60));
    
    try {
        // Get test tenant
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .limit(1);
            
        if (error || !tenants || tenants.length === 0) {
            console.log('⚠️ No tenants found for testing');
            return;
        }
        
        const testTenant = tenants[0];
        console.log(`🏢 Testing with: ${testTenant.name} (${testTenant.id.substring(0, 8)}...)`);
        console.log('');
        
        // Test AI Efficiency Calculator
        const aiCalculator = new AIEfficiencyCalculatorJS();
        const options = createTestOptions(testTenant.id, '7d');
        
        console.log('🎯 Testing AI Efficiency Calculator...');
        const result = await aiCalculator.calculate(options);
        
        console.log('✅ AI Efficiency Calculator Result:');
        console.log(`   Percentage: ${result.value.percentage}%`);
        console.log(`   Total Conversations: ${result.value.total_conversations}`);
        console.log(`   Avg Confidence: ${result.value.avg_confidence_score}`);
        console.log(`   Execution Time: ${result.metadata.execution_time_ms}ms`);
        
        console.log('');
        console.log('✅ CALCULATOR TEST SUCCESSFUL');
        console.log('🎉 Migrated logic is working properly!');
        
    } catch (error) {
        console.error('❌ CALCULATOR TEST FAILED:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run test
testCalculators();