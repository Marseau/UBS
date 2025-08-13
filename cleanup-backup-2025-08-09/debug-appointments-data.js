/**
 * Debug Appointments Data - Find the correct data for Bella Vista risk assessment
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
);

async function debugBellaVistaData() {
    const tenantId = '33b8c488-5aa9-4891-b335-701d10296681';
    
    // Check all appointments for this tenant
    const { data: allAppointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
    
    console.log(`🔍 BELLA VISTA - Total appointments in database: ${allAppointments?.length || 0}`);
    
    if (allAppointments?.length > 0) {
        // Show date range
        const dates = allAppointments.map(apt => apt.created_at).filter(Boolean);
        const minDate = Math.min(...dates.map(d => new Date(d).getTime()));
        const maxDate = Math.max(...dates.map(d => new Date(d).getTime()));
        
        console.log(`📅 Date range: ${new Date(minDate).toISOString().split('T')[0]} to ${new Date(maxDate).toISOString().split('T')[0]}`);
        
        // Analyze sources
        const sources = {};
        allAppointments.forEach(apt => {
            const source = apt.appointment_data?.source || 'no_source';
            sources[source] = (sources[source] || 0) + 1;
        });
        
        console.log('\n📊 All Sources:');
        Object.entries(sources).forEach(([source, count]) => {
            console.log(`   ${source}: ${count}`);
        });
        
        // Test periods manually
        const now = new Date();
        const periods = [
            { name: '7d', days: 7 },
            { name: '30d', days: 30 },
            { name: '90d', days: 90 }
        ];
        
        console.log('\n⏰ MANUAL PERIOD CALCULATION:');
        periods.forEach(period => {
            const startDate = new Date(now.getTime() - (period.days * 24 * 60 * 60 * 1000));
            
            const filteredAppointments = allAppointments.filter(apt => {
                const aptDate = new Date(apt.created_at);
                return aptDate >= startDate && aptDate <= now;
            });
            
            const sourceCounts = {};
            filteredAppointments.forEach(apt => {
                const source = apt.appointment_data?.source || 'no_source';
                sourceCounts[source] = (sourceCounts[source] || 0) + 1;
            });
            
            const total = filteredAppointments.length;
            const googleCalendar = sourceCounts['google_calendar'] || 0;
            const whatsapp = sourceCounts['whatsapp'] || 0;
            const whatsappAI = sourceCounts['whatsapp_ai'] || 0;
            const internal = whatsapp + whatsappAI;
            const externalPercent = total > 0 ? (googleCalendar / total * 100).toFixed(1) : 0;
            
            console.log(`\n${period.name} (last ${period.days} days, from ${startDate.toISOString().split('T')[0]}):`);
            console.log(`   Total: ${total}`);
            console.log(`   WhatsApp: ${whatsapp}`);
            console.log(`   WhatsApp_AI: ${whatsappAI}`);
            console.log(`   Google Calendar: ${googleCalendar}`);
            console.log(`   Internal Total: ${internal} (${total > 0 ? (internal/total*100).toFixed(1) : 0}%)`);
            console.log(`   External %: ${externalPercent}%`);
        });
    }
}

debugBellaVistaData().catch(console.error);