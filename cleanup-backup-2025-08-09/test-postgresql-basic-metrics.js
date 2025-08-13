const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testPostgreSQLMetrics() {
    console.log('🧪 TESTANDO POSTGRESQL FUNCTIONS - 4 MÉTRICAS BÁSICAS');
    console.log('='.repeat(60));
    
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const testTenantId = '33b8c488-5aa9-4891-b335-701d10296681';
    const startDate = '2025-07-31';
    const endDate = '2025-08-07';

    try {
        // Test 1: Monthly Revenue
        console.log('\n📊 1. TESTANDO MONTHLY REVENUE');
        console.log('-'.repeat(40));
        
        const { data: revenueData, error: revenueError } = await supabase
            .rpc('calculate_monthly_revenue', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (revenueError) {
            console.error('❌ Erro Monthly Revenue:', revenueError);
        } else {
            console.log('✅ Monthly Revenue:', JSON.stringify(revenueData, null, 2));
        }

        // Test 2: New Customers (debug version)
        console.log('\n👥 2. TESTANDO NEW CUSTOMERS');
        console.log('-'.repeat(40));
        
        // First check what data we have
        const { data: appointmentCheck } = await supabase
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', testTenantId)
            .gte('start_time', startDate)
            .lte('start_time', endDate + ' 23:59:59')
            .limit(5);

        console.log('📋 Sample appointments:', appointmentCheck);

        const { data: customersData, error: customersError } = await supabase
            .rpc('calculate_new_customers', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (customersError) {
            console.error('❌ Erro New Customers:', customersError);
        } else {
            console.log('✅ New Customers:', JSON.stringify(customersData, null, 2));
        }

        // Test 3: Appointment Success Rate
        console.log('\n🎯 3. TESTANDO APPOINTMENT SUCCESS RATE');
        console.log('-'.repeat(40));
        
        const { data: successData, error: successError } = await supabase
            .rpc('calculate_appointment_success_rate', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (successError) {
            console.error('❌ Erro Success Rate:', successError);
        } else {
            console.log('✅ Success Rate:', JSON.stringify(successData, null, 2));
        }

        // Test 4: No-Show Impact
        console.log('\n🚫 4. TESTANDO NO-SHOW IMPACT');
        console.log('-'.repeat(40));
        
        const { data: noShowData, error: noShowError } = await supabase
            .rpc('calculate_no_show_impact', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (noShowError) {
            console.error('❌ Erro No-Show Impact:', noShowError);
        } else {
            console.log('✅ No-Show Impact:', JSON.stringify(noShowData, null, 2));
        }

        // Test 5: All Basic Metrics
        console.log('\n🔄 5. TESTANDO ALL BASIC METRICS');
        console.log('-'.repeat(40));
        
        const { data: allMetricsData, error: allMetricsError } = await supabase
            .rpc('calculate_all_basic_metrics', {
                p_tenant_id: testTenantId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (allMetricsError) {
            console.error('❌ Erro All Metrics:', allMetricsError);
        } else {
            console.log('✅ All Metrics:', JSON.stringify(allMetricsData, null, 2));
        }

        console.log('\n' + '='.repeat(60));
        console.log('🎉 TESTE DE POSTGRESQL FUNCTIONS CONCLUÍDO');

    } catch (error) {
        console.error('💥 Erro durante teste:', error);
    }
}

testPostgreSQLMetrics();