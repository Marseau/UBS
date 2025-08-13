/**
 * Verificar appointment específico: 9ffcd5bb-6714-42ca-9a51-e14ddf379ea5
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkSpecificAppointment() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const appointmentId = '9ffcd5bb-6714-42ca-9a51-e14ddf379ea5';
    
    console.log(`🔍 VERIFICANDO appointment: ${appointmentId}\n`);
    
    const { data: appointment } = await client
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();
    
    if (appointment) {
        console.log('📋 DADOS DO APPOINTMENT:');
        console.log(`   ID: ${appointment.id}`);
        console.log(`   Tenant ID: ${appointment.tenant_id}`);
        console.log(`   Status: ${appointment.status}`);
        console.log(`   Start Time: ${new Date(appointment.start_time).toLocaleString('pt-BR')}`);
        console.log(`   Created At: ${new Date(appointment.created_at).toLocaleString('pt-BR')}`);
        console.log(`   Service: ${appointment.service_name || 'N/A'}`);
        console.log(`   Customer: ${appointment.customer_name || 'N/A'}`);
        
        // Verificar se é Bella Vista
        const bellaVistaId = '33b8c488-5aa9-4891-b335-701d10296681';
        if (appointment.tenant_id === bellaVistaId) {
            console.log('\n✅ PERTENCE ao tenant Bella Vista');
            
            if (appointment.status === 'cancelled') {
                console.log('✅ STATUS é "cancelled"');
                
                // Verificar se está no período de 90 dias
                const endDate = new Date();
                const startDate90d = new Date();
                startDate90d.setDate(endDate.getDate() - 90);
                
                const appointmentStartTime = new Date(appointment.start_time);
                
                console.log(`\n📅 Período 90d: ${startDate90d.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
                console.log(`📅 Appointment start_time: ${appointmentStartTime.toISOString().split('T')[0]}`);
                
                if (appointmentStartTime >= startDate90d && appointmentStartTime <= endDate) {
                    console.log('✅ ESTÁ dentro do período de 90 dias');
                } else {
                    console.log('❌ NÃO está dentro do período de 90 dias');
                }
            } else {
                console.log(`❌ STATUS não é "cancelled" (atual: ${appointment.status})`);
            }
        } else {
            console.log('❌ NÃO pertence ao tenant Bella Vista');
        }
        
    } else {
        console.log('❌ Appointment não encontrado');
    }
}

checkSpecificAppointment().catch(console.error);