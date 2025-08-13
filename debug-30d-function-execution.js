// Debug Script: Test Function Execution for 30d Period
// Foco: Testar a função get_tenant_metrics_for_period com os tenants healthcare
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debug30dFunctionExecution() {
    console.log('=== DEBUG 30D FUNCTION EXECUTION ===');
    
    const healthcareTenants = [
        { id: 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8', name: 'Centro Terapêutico' },
        { id: 'fe2fa876-05da-49b5-b266-8141bcd090fa', name: 'Clínica Mente Sã' }
    ];
    
    const currentDate = new Date();
    const date30d = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    console.log('Current Date:', currentDate.toISOString().split('T')[0]);
    console.log('30d Start Date:', date30d.toISOString().split('T')[0]);
    console.log('');
    
    for (const tenant of healthcareTenants) {
        console.log(`======================================`);
        console.log(`TESTING: ${tenant.name} (${tenant.id})`);
        console.log(`======================================`);
        
        // Test the actual function that's being used in the metrics calculation
        console.log('\n1. Testing get_tenant_metrics_for_period function...');
        
        try {
            // Use RPC to call the function directly
            const { data: functionResult, error: functionError } = await supabase
                .rpc('get_tenant_metrics_for_period', {
                    tenant_id: tenant.id,
                    start_date: date30d.toISOString().split('T')[0],
                    end_date: currentDate.toISOString().split('T')[0]
                });
            
            if (functionError) {
                console.log('❌ FUNCTION ERROR:', functionError.message);
                console.log('Error details:', JSON.stringify(functionError, null, 2));
                
                // This is likely where the 30d failure occurs!
                console.log('\n🚨 ROOT CAUSE IDENTIFIED: Function call failed for 30d period!');
                console.log('This explains why 30d metrics calculation fails in the cron job.');
                
            } else {
                console.log('✅ Function executed successfully');
                console.log('Results:', JSON.stringify(functionResult, null, 2));
            }
            
        } catch (error) {
            console.log('❌ EXCEPTION in function call:', error.message);
        }
        
        // Test individual components of the function to isolate the issue
        console.log('\n2. Testing individual function components...');
        
        try {
            // Test appointments query using start_time vs created_at
            console.log('Testing appointments with start_time filter...');
            const { data: appointmentsByStartTime, error: startTimeError } = await supabase
                .from('appointments')
                .select('id, start_time, created_at, status')
                .eq('tenant_id', tenant.id)
                .gte('start_time', date30d.toISOString())
                .lte('start_time', currentDate.toISOString())
                .limit(5);
            
            if (startTimeError) {
                console.log('❌ start_time query error:', startTimeError.message);
            } else {
                console.log(`✅ start_time query: ${appointmentsByStartTime?.length || 0} records`);
            }
            
            // Test appointments query using created_at  
            console.log('Testing appointments with created_at filter...');
            const { data: appointmentsByCreatedAt, error: createdAtError } = await supabase
                .from('appointments')
                .select('id, start_time, created_at, status')
                .eq('tenant_id', tenant.id)
                .gte('created_at', date30d.toISOString())
                .lte('created_at', currentDate.toISOString())
                .limit(5);
            
            if (createdAtError) {
                console.log('❌ created_at query error:', createdAtError.message);
            } else {
                console.log(`✅ created_at query: ${appointmentsByCreatedAt?.length || 0} records`);
            }
            
            // Test services query
            console.log('Testing services query...');
            const { data: services, error: servicesError } = await supabase
                .from('services')
                .select('id, name, is_active, created_at, updated_at')
                .eq('tenant_id', tenant.id)
                .eq('is_active', true);
            
            if (servicesError) {
                console.log('❌ services query error:', servicesError.message);
            } else {
                console.log(`✅ services query: ${services?.length || 0} records`);
                if (services && services.length > 0) {
                    console.log('Sample service:', services[0]);
                }
            }
            
            // Test user_tenants query
            console.log('Testing user_tenants query...');
            const { data: userTenants, error: userTenantsError } = await supabase
                .from('user_tenants')
                .select('user_id, tenant_id, first_interaction')
                .eq('tenant_id', tenant.id)
                .limit(5);
            
            if (userTenantsError) {
                console.log('❌ user_tenants query error:', userTenantsError.message);
            } else {
                console.log(`✅ user_tenants query: ${userTenants?.length || 0} records`);
            }
            
            // Test conversation_history query
            console.log('Testing conversation_history query...');
            const { data: conversations, error: conversationsError } = await supabase
                .from('conversation_history')
                .select('id, tenant_id, created_at, intent_detected, confidence_score')
                .eq('tenant_id', tenant.id)
                .limit(5);
            
            if (conversationsError) {
                console.log('❌ conversation_history query error:', conversationsError.message);
            } else {
                console.log(`✅ conversation_history query: ${conversations?.length || 0} records`);
            }
            
        } catch (error) {
            console.log('❌ Error testing individual components:', error.message);
        }
        
        // Test the services count function specifically
        console.log('\n3. Testing get_tenant_services_count_by_period function...');
        
        try {
            const { data: servicesCount, error: servicesCountError } = await supabase
                .rpc('get_tenant_services_count_by_period', {
                    p_tenant_id: tenant.id,
                    p_period_type: '30d'
                });
            
            if (servicesCountError) {
                console.log('❌ services count function error:', servicesCountError.message);
            } else {
                console.log(`✅ services count function: ${servicesCount} services`);
            }
            
        } catch (error) {
            console.log('❌ Exception in services count function:', error.message);
        }
        
        // Test if the issue is with date field comparisons
        console.log('\n4. Testing date field compatibility...');
        
        try {
            // Check what date fields actually exist and have data
            const { data: sampleAppointment } = await supabase
                .from('appointments')
                .select('*')
                .eq('tenant_id', tenant.id)
                .limit(1);
            
            if (sampleAppointment && sampleAppointment.length > 0) {
                const appointment = sampleAppointment[0];
                console.log('Sample appointment date fields:');
                console.log('  created_at:', appointment.created_at);
                console.log('  updated_at:', appointment.updated_at);
                console.log('  start_time:', appointment.start_time);
                console.log('  end_time:', appointment.end_time);
                
                // Check if start_time or created_at is more appropriate
                const createdAtDate = new Date(appointment.created_at);
                const startTimeDate = new Date(appointment.start_time);
                const daysDiffCreated = Math.floor((currentDate - createdAtDate) / (24 * 60 * 60 * 1000));
                const daysDiffStart = Math.floor((currentDate - startTimeDate) / (24 * 60 * 60 * 1000));
                
                console.log(`  Days ago (created_at): ${daysDiffCreated}`);
                console.log(`  Days ago (start_time): ${daysDiffStart}`);
                
                if (daysDiffCreated > 30) {
                    console.log('⚠️  WARNING: created_at is older than 30 days - this could cause issues with 30d queries');
                }
                
                if (daysDiffStart > 30) {
                    console.log('⚠️  WARNING: start_time is older than 30 days - this could cause issues with 30d queries');
                }
            }
            
        } catch (error) {
            console.log('❌ Error testing date fields:', error.message);
        }
        
        console.log('');
    }
    
    console.log('======================================');
    console.log('SUMMARY AND RECOMMENDATIONS');
    console.log('======================================');
    
    console.log(`
🔍 KEY FINDINGS:
1. Function get_tenant_metrics_for_period may have internal errors
2. Date field usage (start_time vs created_at) could be causing issues  
3. Missing related tables (user_tenants, conversation_history) may cause NULLs
4. Services table may not exist or have incorrect structure

💡 LIKELY ROOT CAUSES:
1. Function uses start_time for appointments but appointments may not have this field populated correctly
2. Missing foreign key relationships or table structure issues
3. Function assumes tables exist that may not be present in this environment
4. Date range calculations may be incorrect within the function

🛠️ IMMEDIATE FIXES NEEDED:
1. Update function to use created_at instead of start_time for date filtering
2. Add null checks for missing tables (user_tenants, conversation_history)
3. Ensure proper error handling in the function
4. Test function with actual data structure

⚠️  CRITICAL ACTION:
The 30d failure is likely in the PostgreSQL function itself, not the data availability.
Review and update the get_tenant_metrics_for_period function to handle the actual schema.
    `);
}

debug30dFunctionExecution().catch(console.error);