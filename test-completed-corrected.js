/**
 * TESTE: completed_appointments corrigido (start_time)
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testCompletedCorrected() {
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
        .eq('status', 'completed');
    
    console.log(`90d completed_appointments (start_time): ${appointments?.length || 0}`);
}

testCompletedCorrected().catch(console.error);