/**
 * Verificar appointments em maio de 2024 (ano anterior)
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkMay2024() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const bellaVistaId = '33b8c488-5aa9-4891-b335-701d10296681';
    
    console.log('🔍 VERIFICANDO: Appointments maio 2024 com status cancelled\n');
    
    // Período: maio de 2024
    const startDate = new Date('2024-05-22T00:00:00.000Z');
    const endDate = new Date('2024-05-25T23:59:59.999Z');
    
    console.log(`📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}\n`);
    
    const { data: appointments } = await client
        .from('appointments')
        .select('id, status, start_time, created_at, service_name')
        .eq('tenant_id', bellaVistaId)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .order('start_time', { ascending: true });
    
    console.log(`📊 Appointments (22-25/maio/2024): ${appointments?.length || 0}\n`);
    
    if (appointments && appointments.length > 0) {
        appointments.forEach((apt, i) => {
            console.log(`   ${i+1}. Status: ${apt.status} - Start: ${new Date(apt.start_time).toLocaleString('pt-BR')}`);
        });
        
        const cancelled = appointments.filter(apt => apt.status === 'cancelled');
        console.log(`\n❌ CANCELLED: ${cancelled.length}`);
    }
}

checkMay2024().catch(console.error);