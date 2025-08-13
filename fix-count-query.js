/**
 * Correção: Usar select('id') ao invés de count(*)
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function fixCountQuery() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const bellaVistaId = '33b8c488-5aa9-4891-b335-701d10296681';
    
    const periods = [
        { name: '7d', days: 7 },
        { name: '30d', days: 30 },
        { name: '90d', days: 90 }
    ];
    
    console.log('✅ CORREÇÃO: Usando select("id") ao invés de count(*)\n');
    
    for (const period of periods) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - period.days);
        
        // Método correto: select('id') e contar no JS
        const { data: appointments } = await client
            .from('appointments')
            .select('id')
            .eq('tenant_id', bellaVistaId)
            .gte('start_time', startDate.toISOString())
            .lte('start_time', endDate.toISOString())
            .eq('status', 'cancelled');
        
        const count = appointments?.length || 0;
        console.log(`${period.name}: ${count} cancelled appointments`);
    }
}

fixCountQuery().catch(console.error);