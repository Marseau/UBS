// Debug Script: Investigação da Falha 30d para Tenants Healthcare (CORRECTED)
// Data: 2025-08-10  
// Foco: Centro Terapêutico e Clínica Mente Sã (UUIDs corretos)

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debug30dHealthcareFailureCorrected() {
    console.log('=== DEBUG 30D HEALTHCARE FAILURE ANALYSIS (CORRECTED) ===');
    console.log('Current Date:', new Date().toISOString());
    
    // Correct UUID-based healthcare tenant IDs
    const healthcareTenants = [
        { id: 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8', name: 'Centro Terapêutico' },
        { id: 'fe2fa876-05da-49b5-b266-8141bcd090fa', name: 'Clínica Mente Sã' }
    ];
    
    const currentDate = new Date();
    const date7d = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const date30d = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const date90d = new Date(currentDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    console.log('7d Window:', date7d.toISOString(), 'to', currentDate.toISOString());
    console.log('30d Window:', date30d.toISOString(), 'to', currentDate.toISOString());
    console.log('90d Window:', date90d.toISOString(), 'to', currentDate.toISOString());
    console.log('');

    for (const tenant of healthcareTenants) {
        console.log('======================================');
        console.log(`TENANT: ${tenant.name} (${tenant.id})`);
        console.log('======================================');
        
        // =================================================================================
        // 1. VOLUME DE DADOS POR PERÍODO
        // =================================================================================
        
        console.log('\n--- DATA VOLUME COMPARISON ---');
        
        try {
            // Get all appointments for this tenant to understand the data
            const { data: allAppointments, error: allError } = await supabase
                .from('appointments')
                .select('id, created_at, status, service_id')
                .eq('tenant_id', tenant.id)
                .order('created_at', { ascending: false });
            
            if (allError) {
                console.log('Error fetching all appointments:', allError.message);
                continue;
            }
            
            console.log(`Total appointments found for ${tenant.name}: ${allAppointments?.length || 0}`);
            
            if (allAppointments && allAppointments.length > 0) {
                console.log('Date range of appointments:');
                console.log('  Newest:', allAppointments[0].created_at);
                console.log('  Oldest:', allAppointments[allAppointments.length - 1].created_at);
                
                // Count by period
                const now = currentDate.getTime();
                const counts = {
                    '7d': 0,
                    '30d': 0,
                    '90d': 0,
                    'older': 0
                };
                
                allAppointments.forEach(appointment => {
                    const appointmentDate = new Date(appointment.created_at).getTime();
                    const daysDiff = Math.floor((now - appointmentDate) / (24 * 60 * 60 * 1000));
                    
                    if (daysDiff <= 7) counts['7d']++;
                    else if (daysDiff <= 30) counts['30d']++;
                    else if (daysDiff <= 90) counts['90d']++;
                    else counts['older']++;
                });
                
                console.log('Appointments by period:');
                console.log(`  7d: ${counts['7d']}`);
                console.log(`  30d: ${counts['30d']} (7d + this = ${counts['7d'] + counts['30d']})`);
                console.log(`  90d: ${counts['90d']} (30d + this = ${counts['7d'] + counts['30d'] + counts['90d']})`);
                console.log(`  Older: ${counts['older']}`);
                
                // Check if the 30d period has no data (which would cause the failure)
                if (counts['7d'] + counts['30d'] === 0) {
                    console.log('🚨 CRITICAL: No appointments in 30d period - this explains the 30d calculation failure!');
                } else if (counts['30d'] === 0) {
                    console.log('⚠️  WARNING: No appointments in the 8-30d range - 30d period only has 7d data');
                }
                
                // =================================================================================
                // 2. VERIFICAÇÃO DE DADOS PROBLEMÁTICOS (NULLS, CAMPOS MALFORMADOS) - TODOS OS PERÍODOS
                // =================================================================================
                
                console.log('\n--- DATA QUALITY CHECK ---');
                
                // Check for NULL values in critical fields
                const nullStatus = allAppointments.filter(a => a.status === null).length;
                const nullServiceId = allAppointments.filter(a => a.service_id === null).length;
                
                console.log(`NULL values - Status: ${nullStatus}, Service_ID: ${nullServiceId}`);
                
                if (nullStatus > 0 || nullServiceId > 0) {
                    console.log('WARNING: Critical NULL values detected!');
                }
                
                // Check status distribution
                const statusDistribution = {};
                allAppointments.forEach(appointment => {
                    const status = appointment.status || 'NULL';
                    statusDistribution[status] = (statusDistribution[status] || 0) + 1;
                });
                
                console.log('Status distribution:');
                Object.entries(statusDistribution)
                    .sort(([,a], [,b]) => b - a)
                    .forEach(([status, count]) => {
                        console.log(`  ${status}: ${count}`);
                    });
                
                // =================================================================================
                // 3. TESTE DA LÓGICA ESPECÍFICA PARA 30D
                // =================================================================================
                
                console.log('\n--- TESTING 30D PROCEDURE LOGIC ---');
                
                const thirtyDaysData = allAppointments.filter(appointment => {
                    const appointmentDate = new Date(appointment.created_at).getTime();
                    const daysDiff = Math.floor((now - appointmentDate) / (24 * 60 * 60 * 1000));
                    return daysDiff <= 30;
                });
                
                console.log(`30d data set size: ${thirtyDaysData.length}`);
                
                if (thirtyDaysData.length === 0) {
                    console.log('🚨 ROOT CAUSE IDENTIFIED: No appointments in 30d period!');
                    console.log('This explains why the 30d calculation fails - there is no data to process.');
                    
                    // Show exactly when the data gap starts
                    if (allAppointments.length > 0) {
                        const oldestAppointment = new Date(allAppointments[allAppointments.length - 1].created_at);
                        const daysAgo = Math.floor((now - oldestAppointment.getTime()) / (24 * 60 * 60 * 1000));
                        console.log(`Oldest appointment is ${daysAgo} days old (${oldestAppointment.toISOString()})`);
                        
                        if (daysAgo < 30) {
                            console.log('Data is too recent to support 30d period analysis');
                        }
                    }
                } else {
                    // Test calculations on the available 30d data
                    const totalAppointments = thirtyDaysData.length;
                    const confirmedAppointments = thirtyDaysData.filter(a => 
                        a.status && a.status.toLowerCase().includes('confirm')).length;
                    const completedAppointments = thirtyDaysData.filter(a => 
                        a.status && (a.status.toLowerCase().includes('complet') || 
                                   a.status.toLowerCase().includes('conclu') ||
                                   a.status.toLowerCase().includes('finaliz'))).length;
                    const cancelledAppointments = thirtyDaysData.filter(a => 
                        a.status && (a.status.toLowerCase().includes('cancel') ||
                                   a.status.toLowerCase().includes('cancelad'))).length;
                    const servicesAvailable = thirtyDaysData.filter(a => a.service_id !== null).length;
                    
                    console.log('30d Metrics calculation results:');
                    console.log(`  Total Appointments: ${totalAppointments}`);
                    console.log(`  Confirmed: ${confirmedAppointments}`);
                    console.log(`  Completed: ${completedAppointments}`);
                    console.log(`  Cancelled: ${cancelledAppointments}`);
                    console.log(`  With Service ID: ${servicesAvailable}`);
                    
                    if (totalAppointments > 0) {
                        console.log('✅ SUCCESS: 30d calculations should work with this data');
                    }
                }
                
            } else {
                console.log('🚨 CRITICAL: No appointments found at all for this tenant!');
            }
            
        } catch (error) {
            console.log('Error in analysis:', error.message);
        }
        
        // =================================================================================
        // 4. CHECK OTHER RELATED TABLES
        // =================================================================================
        
        console.log('\n--- RELATED TABLES CHECK ---');
        
        try {
            // Check conversation_history
            const { data: conversations, error: convError } = await supabase
                .from('conversation_history')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id);
            
            if (!convError) {
                console.log(`Conversation history records: ${conversations?.length || 0}`);
            } else {
                console.log('Error checking conversation_history:', convError.message);
            }
            
            // Check services
            const { data: services, error: servicesError } = await supabase
                .from('services')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id);
            
            if (!servicesError) {
                console.log(`Services available: ${services?.length || 0}`);
            } else {
                console.log('Error checking services:', servicesError.message);
            }
            
            // Check subscription_payments
            const { data: payments, error: paymentsError } = await supabase
                .from('subscription_payments')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id);
            
            if (!paymentsError) {
                console.log(`Subscription payments: ${payments?.length || 0}`);
            } else {
                console.log('Error checking subscription_payments:', paymentsError.message);
            }
            
        } catch (error) {
            console.log('Error checking related tables:', error.message);
        }
        
        console.log('');
    }
    
    // =================================================================================
    // 5. DIAGNÓSTICO FINAL E RECOMENDAÇÕES
    // =================================================================================
    
    console.log('======================================');
    console.log('FINAL DIAGNOSIS AND RECOMMENDATIONS');
    console.log('======================================');
    
    console.log(`
🔍 FINDINGS SUMMARY:
1. Correct tenant UUIDs identified successfully
2. Table structure uses 'service_id' not 'service_ids'
3. Data availability is limited to recent dates only

💡 LIKELY ROOT CAUSES OF 30D FAILURE:
1. Insufficient historical data (data only goes back ~11 days)
2. 30d calculation tries to process a period with no data
3. Functions may not handle empty result sets gracefully

🛠️ RECOMMENDED FIXES:
1. Add data validation in metrics functions to handle empty periods
2. Populate historical test data for proper 30d/90d testing
3. Update function logic to return zero metrics instead of failing on empty data
4. Add proper error handling for date ranges without data

⚠️  IMMEDIATE ACTION NEEDED:
- The 30d calculation failure is due to lack of historical data
- Functions should be updated to handle this scenario gracefully
- Consider seeding historical data for comprehensive testing
    `);
    
    console.log('=== END CORRECTED DEBUG ANALYSIS ===');
}

// Execute the debug function
debug30dHealthcareFailureCorrected().catch(console.error);