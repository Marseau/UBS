/**
 * Análise de Fontes dos Appointments - Interno vs Externo
 * Context Engineering COLEAM00 - Identificação de padrões
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeAppointmentSources() {
    console.log('🔍 ANÁLISE DE FONTES DOS APPOINTMENTS');
    console.log('=' .repeat(50));
    
    try {
        // Analisar estrutura e campos disponíveis
        const { data: appointments, error: sampleError } = await supabase
            .from('appointments')
            .select('*')
            .limit(5);
        
        if (sampleError) {
            console.error('❌ Erro ao buscar appointments:', sampleError.message);
            return;
        }
        
        console.log('📋 Campos disponíveis na tabela appointments:');
        if (appointments && appointments.length > 0) {
            const fields = Object.keys(appointments[0]);
            fields.forEach((field, index) => {
                console.log(`   ${index + 1}. ${field}`);
            });
            
            // Verificar se conversation_id existe
            const hasConversationId = fields.includes('conversation_id');
            console.log(`\n🔗 Campo conversation_id existe? ${hasConversationId ? '✅ SIM' : '❌ NÃO'}`);
            
            // Mostrar campos relacionados a fonte/origem
            const sourceFields = fields.filter(f => 
                f.includes('source') || 
                f.includes('method') || 
                f.includes('booking') || 
                f.includes('conversation') ||
                f.includes('external') ||
                f.includes('internal')
            );
            
            console.log('\n📍 Campos relacionados à origem:');
            sourceFields.forEach(field => console.log(`   • ${field}`));
        }
        
        // Analisar distribuição por alguns campos de origem identificados
        if (appointments && appointments.length > 0) {
            const sampleAppointment = appointments[0];
            
            console.log('\n📋 EXEMPLO DE APPOINTMENT:');
            console.log(`   ID: ${sampleAppointment.id}`);
            console.log(`   Tenant: ${sampleAppointment.tenant_id}`);
            console.log(`   Status: ${sampleAppointment.status}`);
            console.log(`   Created: ${sampleAppointment.created_at}`);
            
            // Verificar campos de appointment_data (pode conter info de origem)
            if (sampleAppointment.appointment_data) {
                console.log(`   appointment_data: ${JSON.stringify(sampleAppointment.appointment_data)}`);
            }
        }
        
        // Contar total de appointments
        const { count: totalCount, error: countError } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true });
            
        if (!countError) {
            console.log(`\n📊 TOTAL DE APPOINTMENTS: ${totalCount}`);
        }
        
        // Analisar appointments dos tenants testados
        const testedTenants = [
            '33b8c488-5aa9-4891-b335-701d10296681', // Bella Vista Spa
            'c3aa73f8-db80-40db-a9c4-73718a0fee34'   // Centro Educacional
        ];
        
        console.log('\n🎯 ANÁLISE DOS TENANTS TESTADOS:');
        for (const tenantId of testedTenants) {
            console.log(`\nTenant: ${tenantId}`);
            
            const { data: tenantAppointments, count: tenantCount } = await supabase
                .from('appointments')
                .select('id, status, appointment_data, created_at', { count: 'exact' })
                .eq('tenant_id', tenantId)
                .limit(5);
                
            console.log(`   Total appointments: ${tenantCount}`);
            
            if (tenantAppointments && tenantAppointments.length > 0) {
                console.log('   Primeiros 3 appointments:');
                tenantAppointments.slice(0, 3).forEach((apt, i) => {
                    console.log(`     ${i+1}. ${apt.id} - Status: ${apt.status}`);
                    if (apt.appointment_data) {
                        console.log(`        Data: ${JSON.stringify(apt.appointment_data)}`);
                    }
                });
            }
        }
        
        // Buscar se existe relação com conversation_history
        console.log('\n🔍 VERIFICANDO RELAÇÃO COM CONVERSATION_HISTORY:');
        
        // Pegar alguns appointments e ver se há conversations relacionadas
        const { data: recentAppointments } = await supabase
            .from('appointments')
            .select('id, tenant_id, user_id, created_at')
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (recentAppointments && recentAppointments.length > 0) {
            for (const apt of recentAppointments.slice(0, 3)) {
                // Buscar conversas do mesmo tenant/user no mesmo período
                const aptDate = new Date(apt.created_at);
                const searchStart = new Date(aptDate.getTime() - 24 * 60 * 60 * 1000); // 1 dia antes
                const searchEnd = new Date(aptDate.getTime() + 24 * 60 * 60 * 1000);   // 1 dia depois
                
                const { data: relatedConversations, count: convCount } = await supabase
                    .from('conversation_history')
                    .select('id, conversation_outcome', { count: 'exact' })
                    .eq('tenant_id', apt.tenant_id)
                    .eq('user_id', apt.user_id)
                    .gte('created_at', searchStart.toISOString())
                    .lte('created_at', searchEnd.toISOString());
                    
                console.log(`\nAppointment ${apt.id}:`);
                console.log(`   Conversas relacionadas (±1 dia): ${convCount || 0}`);
                
                if (relatedConversations && relatedConversations.length > 0) {
                    const outcomes = relatedConversations.map(c => c.conversation_outcome).filter(Boolean);
                    console.log(`   Outcomes: ${outcomes.join(', ')}`);
                    
                    // Se tem "appointment_created" no outcome, provavelmente é externo
                    const hasAppointmentCreated = outcomes.includes('appointment_created');
                    console.log(`   Provável origem: ${hasAppointmentCreated ? '🤖 EXTERNA (WhatsApp/IA)' : '📋 INTERNA (Manual)'}`);
                }
            }
        }
        
    } catch (error) {
        console.error('💥 Erro durante análise:', error.message);
    }
}

// Executar análise
analyzeAppointmentSources();