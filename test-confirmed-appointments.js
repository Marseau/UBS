/**
 * TESTE: confirmed_appointments para Bella Vista em 90 dias
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testConfirmedAppointments() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const bellaVistaId = '33b8c488-5aa9-4891-b335-701d10296681';
    
    // Período 90d
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 90);
    
    const { data: appointments } = await client
        .from('appointments')
        .select('id')
        .eq('tenant_id', bellaVistaId)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .eq('status', 'confirmed');
    
    console.log(`90d confirmed_appointments: ${appointments?.length || 0}`);
}

testConfirmedAppointments().catch(console.error);