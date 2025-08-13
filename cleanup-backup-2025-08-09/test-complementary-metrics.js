const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testComplementaryMetrics() {
    console.log('⚙️ TESTANDO COMPLEMENTARY METRICS - 4 FUNÇÕES');
    console.log('='.repeat(60));
    
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const testTenantId = '33b8c488-5aa9-4891-b335-701d10296681';
    const startDate = '2025-07-31';
    const endDate = '2025-08-07';

    try {
        // Test 1: Average Minutes per Conversation
        console.log('\n⏱️ 1. TESTANDO AVERAGE MINUTES PER CONVERSATION');
        console.log('-'.repeat(50));
        
        const { data: avgMinutesData, error: avgMinutesError } = await supabase
            .rpc('calculate_avg_minutes_per_conversation', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (avgMinutesError) {
            console.error('❌ Erro Average Minutes:', avgMinutesError);
        } else {
            console.log('✅ Average Minutes per Conversation:', JSON.stringify(avgMinutesData, null, 2));
        }

        // Test 2: Total System Cost USD
        console.log('\n💰 2. TESTANDO TOTAL SYSTEM COST USD');
        console.log('-'.repeat(50));
        
        const { data: costData, error: costError } = await supabase
            .rpc('calculate_total_system_cost_usd', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (costError) {
            console.error('❌ Erro Total Cost:', costError);
        } else {
            console.log('✅ Total System Cost USD:', JSON.stringify(costData, null, 2));
        }

        // Test 3: AI Failure Rate
        console.log('\n🤖 3. TESTANDO AI FAILURE RATE');
        console.log('-'.repeat(50));
        
        const { data: failureData, error: failureError } = await supabase
            .rpc('calculate_ai_failure_rate', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (failureError) {
            console.error('❌ Erro AI Failure Rate:', failureError);
        } else {
            console.log('✅ AI Failure Rate:', JSON.stringify(failureData, null, 2));
        }

        // Test 4: Confidence Score
        console.log('\n🎯 4. TESTANDO CONFIDENCE SCORE');
        console.log('-'.repeat(50));
        
        const { data: confidenceData, error: confidenceError } = await supabase
            .rpc('calculate_confidence_score', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (confidenceError) {
            console.error('❌ Erro Confidence Score:', confidenceError);
        } else {
            console.log('✅ Confidence Score:', JSON.stringify(confidenceData, null, 2));
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('🎉 TESTE COMPLEMENTARY METRICS CONCLUÍDO');
        
        if (avgMinutesData && costData && failureData && confidenceData) {
            console.log('\n📊 RESUMO DAS MÉTRICAS COMPLEMENTARES:');
            console.log(`⏱️ Avg Minutes/Conversation: ${avgMinutesData[0]?.avg_minutes || 0} min`);
            console.log(`💰 Total System Cost: $${costData[0]?.total_cost_usd || 0}`);
            console.log(`🤖 AI Failure Rate: ${failureData[0]?.failure_percentage || 0}%`);
            console.log(`🎯 Confidence Score: ${confidenceData[0]?.avg_confidence || 0}`);
            console.log(`🗨️ Total Conversations: ${avgMinutesData[0]?.total_conversations || 0}`);
        }

    } catch (error) {
        console.error('💥 Erro durante teste:', error);
    }
}

testComplementaryMetrics();