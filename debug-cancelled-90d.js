/**
 * Debug: Por que não encontra 5 cancelled appointments em 90d?
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function debugCancelled90d() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const bellaVistaId = '33b8c488-5aa9-4891-b335-701d10296681';
    
    console.log('🔍 DEBUG: Procurando 5 cancelled appointments em 90d\n');
    
    // 1. Todos os appointments cancelled (sem filtro de data)
    const { data: allCancelled } = await client
        .from('appointments')
        .select('id, status, start_time, created_at, service_name, customer_name')
        .eq('tenant_id', bellaVistaId)
        .eq('status', 'cancelled')
        .order('start_time', { ascending: false });
    
    console.log(`📊 TOTAL appointments cancelled (sem filtro data): ${allCancelled?.length || 0}\n`);
    
    if (allCancelled && allCancelled.length > 0) {
        console.log('📋 TODOS os cancelled appointments:');
        allCancelled.forEach((apt, i) => {
            console.log(`   ${i+1}. Start: ${new Date(apt.start_time).toLocaleString('pt-BR')}`);
            console.log(`      Created: ${new Date(apt.created_at).toLocaleString('pt-BR')}`);
            console.log(`      Service: ${apt.service_name || 'N/A'}`);
            console.log('');
        });
    }
    
    // 2. Verificar com created_at (sistema antigo)
    const endDate = new Date();
    const startDate90d = new Date();
    startDate90d.setDate(endDate.getDate() - 90);
    
    console.log(`📅 Período 90d: ${startDate90d.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}\n`);
    
    const { data: cancelledCreatedAt } = await client
        .from('appointments')
        .select('count(*)')
        .eq('tenant_id', bellaVistaId)
        .gte('created_at', startDate90d.toISOString())
        .lte('created_at', endDate.toISOString())
        .eq('status', 'cancelled');
    
    console.log(`❌ Cancelled (created_at): ${cancelledCreatedAt?.[0]?.count || 0}`);
    
    const { data: cancelledStartTime } = await client
        .from('appointments')
        .select('count(*)')
        .eq('tenant_id', bellaVistaId)
        .gte('start_time', startDate90d.toISOString())
        .lte('start_time', endDate.toISOString())
        .eq('status', 'cancelled');
    
    console.log(`❌ Cancelled (start_time): ${cancelledStartTime?.[0]?.count || 0}`);
}

debugCancelled90d().catch(console.error);