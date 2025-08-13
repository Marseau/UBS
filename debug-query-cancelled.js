/**
 * Debug: Por que a query não encontra o appointment que sabemos que existe?
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function debugQuery() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const bellaVistaId = '33b8c488-5aa9-4891-b335-701d10296681';
    const appointmentId = '9ffcd5bb-6714-42ca-9a51-e14ddf379ea5';
    
    console.log('🔍 DEBUG: Por que a query não encontra o appointment?\n');
    
    // 1. Dados do appointment específico
    const { data: appointment } = await client
        .from('appointments')
        .select('id, status, start_time, created_at')
        .eq('id', appointmentId)
        .single();
        
    console.log('📋 APPOINTMENT ESPECÍFICO:');
    console.log(`   ID: ${appointment.id}`);
    console.log(`   Status: ${appointment.status}`);
    console.log(`   Start Time: ${appointment.start_time}`);
    console.log(`   Created At: ${appointment.created_at}`);
    
    // 2. Período 90d usado na query
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 90);
    
    console.log(`\n📅 PERÍODO 90D usado na query:`);
    console.log(`   Start: ${startDate.toISOString()}`);
    console.log(`   End: ${endDate.toISOString()}`);
    console.log(`   Start (apenas data): ${startDate.toISOString().split('T')[0]}`);
    console.log(`   End (apenas data): ${endDate.toISOString().split('T')[0]}`);
    
    // 3. Comparação manual
    const appointmentStartTime = new Date(appointment.start_time);
    console.log(`\n🔍 COMPARAÇÃO MANUAL:`);
    console.log(`   Appointment start_time: ${appointment.start_time}`);
    console.log(`   appointmentStartTime >= startDate: ${appointmentStartTime >= startDate}`);
    console.log(`   appointmentStartTime <= endDate: ${appointmentStartTime <= endDate}`);
    
    // 4. Query EXATA que estou usando
    console.log(`\n🔍 EXECUTANDO QUERY EXATA:`);
    const { data: result } = await client
        .from('appointments')
        .select('count(*)')
        .eq('tenant_id', bellaVistaId)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .eq('status', 'cancelled');
    
    console.log(`   Resultado count: ${result?.[0]?.count || 0}`);
    
    // 5. Query com select completo para debug
    const { data: debugResult } = await client
        .from('appointments')
        .select('id, status, start_time')
        .eq('tenant_id', bellaVistaId)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .eq('status', 'cancelled');
    
    console.log(`\n📋 APPOINTMENTS ENCONTRADOS NA QUERY: ${debugResult?.length || 0}`);
    if (debugResult && debugResult.length > 0) {
        debugResult.forEach((apt, i) => {
            console.log(`   ${i+1}. ${apt.id} - ${apt.start_time} - ${apt.status}`);
        });
    }
    
    // 6. Teste: incluir explicitamente o appointment conhecido
    const { data: explicitTest } = await client
        .from('appointments')
        .select('id, status, start_time')
        .eq('id', appointmentId);
        
    console.log(`\n🎯 TESTE EXPLÍCITO do appointment conhecido:`);
    if (explicitTest && explicitTest.length > 0) {
        const apt = explicitTest[0];
        console.log(`   Found: ${apt.id} - ${apt.start_time} - ${apt.status}`);
        
        // Teste manual dos filtros
        const aptStart = new Date(apt.start_time);
        console.log(`   Filtro tenant_id: ${bellaVistaId === bellaVistaId} ✅`);
        console.log(`   Filtro status: ${apt.status === 'cancelled'} ${apt.status === 'cancelled' ? '✅' : '❌'}`);
        console.log(`   Filtro start_time >= startDate: ${aptStart >= startDate} ${aptStart >= startDate ? '✅' : '❌'}`);
        console.log(`   Filtro start_time <= endDate: ${aptStart <= endDate} ${aptStart <= endDate ? '✅' : '❌'}`);
    }
}

debugQuery().catch(console.error);