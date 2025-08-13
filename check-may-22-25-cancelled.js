/**
 * Verificar appointments nos dias 22,23,24,25/5 com status cancelled
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkMay22to25() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const bellaVistaId = '33b8c488-5aa9-4891-b335-701d10296681';
    
    console.log('🔍 VERIFICANDO: Appointments 22-25/maio com status cancelled');
    console.log('=======================================================\n');
    
    // Período específico: 22 a 25 de maio de 2025
    const startDate = new Date('2025-05-22T00:00:00.000Z');
    const endDate = new Date('2025-05-25T23:59:59.999Z');
    
    console.log(`📅 Período: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}\n`);
    
    // 1. Todos os appointments no período (qualquer status)
    const { data: allAppointments } = await client
        .from('appointments')
        .select('id, status, start_time, created_at, service_name, customer_name')
        .eq('tenant_id', bellaVistaId)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .order('start_time', { ascending: true });
    
    console.log(`📊 TODOS appointments (22-25/maio): ${allAppointments?.length || 0}\n`);
    
    if (allAppointments && allAppointments.length > 0) {
        console.log('📋 LISTA COMPLETA:');
        allAppointments.forEach((apt, i) => {
            console.log(`   ${i+1}. Status: ${apt.status}`);
            console.log(`      Start: ${new Date(apt.start_time).toLocaleString('pt-BR')}`);
            console.log(`      Created: ${new Date(apt.created_at).toLocaleString('pt-BR')}`);
            console.log(`      Service: ${apt.service_name || 'N/A'}`);
            console.log('');
        });
    }
    
    // 2. Apenas os cancelled
    const cancelledOnly = allAppointments?.filter(apt => apt.status === 'cancelled') || [];
    console.log(`❌ CANCELLED appointments: ${cancelledOnly.length}\n`);
    
    if (cancelledOnly.length > 0) {
        console.log('📋 CANCELLED appointments:');
        cancelledOnly.forEach((apt, i) => {
            console.log(`   ${i+1}. Start: ${new Date(apt.start_time).toLocaleString('pt-BR')}`);
            console.log(`      Service: ${apt.service_name || 'N/A'}`);
        });
    }
    
    // 3. Verificar se são exatamente 5
    console.log(`\n🎯 RESULTADO: ${cancelledOnly.length} appointments cancelled encontrados`);
    if (cancelledOnly.length === 5) {
        console.log('✅ CONFIRMADO: 5 appointments cancelled nos dias 22-25/maio');
    } else if (cancelledOnly.length === 0) {
        console.log('❌ NENHUM appointment cancelled encontrado');
    } else {
        console.log(`⚠️  Encontrados ${cancelledOnly.length} appointments (esperado: 5)`);
    }
}

checkMay22to25().catch(console.error);