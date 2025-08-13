const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testConversationOutcomeMetrics() {
    console.log('🗨️ TESTANDO CONVERSATION OUTCOME METRICS - 4 FUNÇÕES');
    console.log('='.repeat(60));
    
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const testTenantId = '33b8c488-5aa9-4891-b335-701d10296681';
    const startDate = '2025-07-31';
    const endDate = '2025-08-07';

    try {
        // Test 1: Information Rate
        console.log('\n📋 1. TESTANDO INFORMATION RATE');
        console.log('-'.repeat(40));
        
        const { data: infoData, error: infoError } = await supabase
            .rpc('calculate_information_rate', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (infoError) {
            console.error('❌ Erro Information Rate:', infoError);
        } else {
            console.log('✅ Information Rate:', JSON.stringify(infoData, null, 2));
        }

        // Test 2: Spam Rate
        console.log('\n🚫 2. TESTANDO SPAM RATE');
        console.log('-'.repeat(40));
        
        const { data: spamData, error: spamError } = await supabase
            .rpc('calculate_spam_rate', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (spamError) {
            console.error('❌ Erro Spam Rate:', spamError);
        } else {
            console.log('✅ Spam Rate:', JSON.stringify(spamData, null, 2));
        }

        // Test 3: Reschedule Rate
        console.log('\n🔄 3. TESTANDO RESCHEDULE RATE');
        console.log('-'.repeat(40));
        
        const { data: rescheduleData, error: rescheduleError } = await supabase
            .rpc('calculate_reschedule_rate', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (rescheduleError) {
            console.error('❌ Erro Reschedule Rate:', rescheduleError);
        } else {
            console.log('✅ Reschedule Rate:', JSON.stringify(rescheduleData, null, 2));
        }

        // Test 4: Cancellation Rate
        console.log('\n❌ 4. TESTANDO CANCELLATION RATE');
        console.log('-'.repeat(40));
        
        const { data: cancelData, error: cancelError } = await supabase
            .rpc('calculate_cancellation_rate', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (cancelError) {
            console.error('❌ Erro Cancellation Rate:', cancelError);
        } else {
            console.log('✅ Cancellation Rate:', JSON.stringify(cancelData, null, 2));
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('🎉 TESTE CONVERSATION OUTCOME METRICS CONCLUÍDO');
        
        if (infoData && spamData && rescheduleData && cancelData) {
            console.log('\n📊 RESUMO DAS MÉTRICAS:');
            console.log(`📋 Information Rate: ${infoData[0]?.information_rate_current || 0}%`);
            console.log(`🚫 Spam Rate: ${spamData[0]?.spam_rate_current || 0}%`);
            console.log(`🔄 Reschedule Rate: ${rescheduleData[0]?.reschedule_rate_current || 0}%`);
            console.log(`❌ Cancellation Rate: ${cancelData[0]?.cancellation_rate_current || 0}%`);
            console.log(`🗨️ Total Conversations: ${infoData[0]?.total_conversations_current || 0}`);
        }

    } catch (error) {
        console.error('💥 Erro durante teste:', error);
    }
}

testConversationOutcomeMetrics();