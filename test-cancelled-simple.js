/**
 * Query corrigida - cancelled_appointments Bella Vista
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testCancelledSimple() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const bellaVistaId = '33b8c488-5aa9-4891-b335-701d10296681';
    
    const periods = [
        { name: '7d', days: 7 },
        { name: '30d', days: 30 },
        { name: '90d', days: 90 }
    ];
    
    for (const period of periods) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - period.days);
        
        const { data } = await client
            .from('appointments')
            .select('count(*)')
            .eq('tenant_id', bellaVistaId)
            .gte('start_time', startDate.toISOString())
            .lte('start_time', endDate.toISOString())
            .eq('status', 'cancelled');
        
        console.log(`${period.name}: ${data?.[0]?.count || 0}`);
    }
}

testCancelledSimple().catch(console.error);