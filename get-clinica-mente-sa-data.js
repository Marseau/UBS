/**
 * Get Clinica Mente Sã Risk Assessment Data for 90 days
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
);

async function getClinicaMenteSaData() {
    try {
        // Get Clinica Mente Sã tenant ID
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id, business_name')
            .ilike('business_name', '%mente%sã%')
            .single();
        
        if (tenantError || !tenant) {
            console.log('❌ Tenant Clinica Mente Sã não encontrado');
            console.log('Erro:', tenantError);
            return;
        }
        
        console.log(`🏢 Encontrado: ${tenant.business_name} (${tenant.id})`);
        
        // Calculate 90 days period
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);
        
        console.log(`📅 Período 90d: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
        
        // Query appointments with source filtering by start_time
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('appointment_data, start_time, status')
            .eq('tenant_id', tenant.id)
            .gte('start_time', startDate.toISOString())
            .lte('start_time', endDate.toISOString());
        
        if (error) {
            console.error('❌ Erro:', error);
            return;
        }
        
        let saasCount = 0;
        let externalCount = 0;
        let unknownCount = 0;
        const sourceCounts = {};
        
        appointments.forEach(appointment => {
            const appointmentData = appointment.appointment_data || {};
            const source = appointmentData.source;
            
            sourceCounts[source || 'no_source'] = (sourceCounts[source || 'no_source'] || 0) + 1;
            
            if (source === 'google_calendar') {
                externalCount++;
            } else if (source === 'whatsapp' || source === 'whatsapp_ai' || source === 'whatsapp_conversation') {
                saasCount++;
            } else {
                unknownCount++;
                saasCount++; // Conservative approach
            }
        });
        
        const total = appointments.length;
        const externalPercentage = total > 0 ? (externalCount / total * 100).toFixed(1) : 0;
        
        console.log('\n📊 CLINICA MENTE SÃ - 90 DIAS:');
        console.log(`   Total appointments: ${total}`);
        console.log(`   SaaS appointments: ${saasCount}`);  
        console.log(`   External appointments: ${externalCount}`);
        console.log(`   External percentage: ${externalPercentage}%`);
        console.log(`   Source breakdown:`, sourceCounts);
        
    } catch (error) {
        console.error('❌ Erro geral:', error);
    }
}

getClinicaMenteSaData().catch(console.error);