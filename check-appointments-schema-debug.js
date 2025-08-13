// Check Appointments Table Schema - Debug Version
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAppointmentsSchema() {
    console.log('=== APPOINTMENTS TABLE SCHEMA ANALYSIS ===');
    
    // Try to get schema information
    console.log('1. Checking if appointments table exists and getting sample data...');
    
    try {
        // Get a few sample appointments to see the actual structure
        const { data: sampleAppointments, error } = await supabase
            .from('appointments')
            .select('*')
            .limit(3);
        
        if (error) {
            console.error('Error fetching sample appointments:', error.message);
            return;
        }
        
        if (!sampleAppointments || sampleAppointments.length === 0) {
            console.log('No appointments found in database');
            return;
        }
        
        console.log('Sample appointment structure:');
        console.log('Number of sample records:', sampleAppointments.length);
        
        // Show the structure of the first appointment
        const firstAppointment = sampleAppointments[0];
        console.log('\nColumns found in appointments table:');
        Object.keys(firstAppointment).forEach((key, index) => {
            console.log(`${index + 1}. ${key}: ${typeof firstAppointment[key]} (${firstAppointment[key]})`);
        });
        
        // Check for healthcare tenants specifically
        console.log('\n2. Checking for healthcare tenant data...');
        const healthcareTenantIds = [1754748774142, 1754760259082];
        
        for (const tenantId of healthcareTenantIds) {
            const { data: tenantAppointments, error: tenantError } = await supabase
                .from('appointments')
                .select('*')
                .eq('tenant_id', tenantId)
                .limit(5);
            
            if (tenantError) {
                console.log(`Error fetching appointments for tenant ${tenantId}:`, tenantError.message);
            } else {
                console.log(`Tenant ${tenantId}: Found ${tenantAppointments?.length || 0} appointments`);
                
                if (tenantAppointments && tenantAppointments.length > 0) {
                    console.log(`  Sample appointment:`, tenantAppointments[0]);
                }
            }
        }
        
        // Check date range of data
        console.log('\n3. Checking date range of all data...');
        const { data: dateRange, error: dateError } = await supabase
            .from('appointments')
            .select('created_at')
            .order('created_at', { ascending: true })
            .limit(1);
        
        const { data: dateRangeMax, error: dateErrorMax } = await supabase
            .from('appointments')
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (!dateError && !dateErrorMax) {
            console.log('Date range of appointments:');
            console.log('Oldest:', dateRange?.[0]?.created_at);
            console.log('Newest:', dateRangeMax?.[0]?.created_at);
        }
        
        // Check tenant distribution
        console.log('\n4. Checking tenant distribution...');
        const { data: tenantCounts, error: tenantError } = await supabase
            .from('appointments')
            .select('tenant_id')
            .limit(1000); // Get a sample to check tenant distribution
        
        if (!tenantError && tenantCounts) {
            const tenantDistribution = {};
            tenantCounts.forEach(appointment => {
                tenantDistribution[appointment.tenant_id] = (tenantDistribution[appointment.tenant_id] || 0) + 1;
            });
            
            console.log('Tenant distribution (sample):');
            Object.entries(tenantDistribution)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 10)
                .forEach(([tenantId, count]) => {
                    console.log(`  Tenant ${tenantId}: ${count} appointments`);
                });
        }
        
    } catch (error) {
        console.error('Error in schema check:', error.message);
    }
}

checkAppointmentsSchema().catch(console.error);