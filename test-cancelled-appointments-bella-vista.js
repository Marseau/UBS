/**
 * TESTE: cancelled_appointments para Bella Vista
 * Usando start_time (correto) ao invés de created_at
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testCancelledAppointmentsBellaVista() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('📊 TESTE: cancelled_appointments - Bella Vista (start_time)');
    console.log('========================================================\n');
    
    try {
        const bellaVistaId = '33b8c488-5aa9-4891-b335-701d10296681';
        
        // Períodos para teste
        const periods = [
            { name: '7d', days: 7 },
            { name: '30d', days: 30 },
            { name: '90d', days: 90 }
        ];
        
        for (const period of periods) {
            console.log(`🔍 PERÍODO ${period.name.toUpperCase()} - cancelled_appointments:`);
            
            // Período atual
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - period.days);
            
            console.log(`   📅 De ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
            
            // QUERY CORRETA: Filtrar por start_time e status = 'cancelled'
            const { data: cancelledAppointments } = await client
                .from('appointments')
                .select('id, status, start_time, created_at, service_name, customer_name')
                .eq('tenant_id', bellaVistaId)
                .gte('start_time', startDate.toISOString())
                .lte('start_time', endDate.toISOString())
                .eq('status', 'cancelled')
                .order('start_time', { ascending: false });
            
            const cancelledTotal = cancelledAppointments?.length || 0;
            console.log(`   ❌ CANCELLED appointments: ${cancelledTotal}`);
            
            if (cancelledAppointments && cancelledAppointments.length > 0) {
                console.log('   📋 Lista de appointments cancelados:');
                cancelledAppointments.forEach((apt, i) => {
                    console.log(`      ${i+1}. Start: ${new Date(apt.start_time).toLocaleString('pt-BR')}`);
                    console.log(`         Service: ${apt.service_name || 'N/A'} - Customer: ${apt.customer_name || 'N/A'}`);
                    console.log(`         Created: ${new Date(apt.created_at).toLocaleString('pt-BR')}`);
                });
            } else {
                console.log('   ✅ Nenhum appointment cancelado no período');
            }
            
            // Comparar com metric_data armazenado
            const { data: storedMetrics } = await client
                .from('tenant_metrics')
                .select('period, metric_data')
                .eq('tenant_id', bellaVistaId)
                .eq('metric_type', 'comprehensive')
                .eq('period', period.name)
                .order('calculated_at', { ascending: false })
                .limit(1);
                
            if (storedMetrics && storedMetrics.length > 0) {
                const storedCancelled = storedMetrics[0].metric_data?.cancelled_appointments || 0;
                console.log(`   📊 COMPARAÇÃO - Stored: ${storedCancelled}, Calculado: ${cancelledTotal}`);
                
                if (storedCancelled !== cancelledTotal) {
                    console.log(`   ⚠️  DIFERENÇA detectada!`);
                } else {
                    console.log(`   ✅ Valores coincidem`);
                }
            }
            
            console.log('');
        }
        
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
    }
}

testCancelledAppointmentsBellaVista().catch(console.error);