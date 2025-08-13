#!/usr/bin/env node

/**
 * DEBUG: Investigar estrutura real do appointment_data
 * Para entender por que conversation_id não aparece em todas as linhas
 */

const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugAppointmentData() {
    console.log('🔍 INVESTIGANDO ESTRUTURA DO APPOINTMENT_DATA');
    console.log('================================================\n');
    
    // Pegar 20 appointments aleatórios
    const { data: appointments, error } = await supabase
        .from('appointments')
        .select('id, appointment_data, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
    
    if (error) {
        console.error('❌ Erro:', error);
        return;
    }
    
    console.log(`📊 Analisando ${appointments.length} appointments...\n`);
    
    let withConversationId = 0;
    let withoutConversationId = 0;
    let nullAppointmentData = 0;
    
    appointments.forEach((apt, index) => {
        console.log(`📋 APPOINTMENT ${index + 1} (ID: ${apt.id}):`);
        console.log(`   created_at: ${apt.created_at}`);
        
        if (!apt.appointment_data) {
            console.log('   ❌ appointment_data: NULL');
            nullAppointmentData++;
        } else {
            console.log(`   📄 appointment_data: ${JSON.stringify(apt.appointment_data)}`);
            console.log(`   📄 appointment_data type: ${typeof apt.appointment_data}`);
            
            // Tentar diferentes formas de extrair conversation_id
            let conversationId = null;
            
            if (typeof apt.appointment_data === 'object') {
                conversationId = apt.appointment_data.conversation_id;
            } else if (typeof apt.appointment_data === 'string') {
                try {
                    const parsed = JSON.parse(apt.appointment_data);
                    conversationId = parsed.conversation_id;
                } catch (e) {
                    console.log('   ⚠️ Erro ao fazer parse do JSON');
                }
            }
            
            if (conversationId) {
                console.log(`   ✅ conversation_id: ${conversationId}`);
                withConversationId++;
            } else {
                console.log('   ❌ conversation_id: VAZIO ou não encontrado');
                withoutConversationId++;
            }
        }
        
        console.log('');
    });
    
    console.log('📊 ESTATÍSTICAS:');
    console.log(`   ✅ Com conversation_id: ${withConversationId}`);
    console.log(`   ❌ Sem conversation_id: ${withoutConversationId}`);
    console.log(`   🚫 appointment_data NULL: ${nullAppointmentData}`);
    console.log(`   📊 Total analisado: ${appointments.length}`);
    
    // Verificar se TODOS os appointments têm appointment_data
    console.log('\n🔍 VERIFICANDO TODOS OS APPOINTMENTS...');
    
    const { data: allAppointments, error: allError } = await supabase
        .from('appointments')
        .select('id, appointment_data')
        .is('appointment_data', null);
    
    if (allError) {
        console.error('❌ Erro ao verificar appointments:', allError);
    } else {
        console.log(`❌ Appointments com appointment_data NULL: ${allAppointments.length}`);
    }
    
    // Contar total de appointments
    const { count, error: countError } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true });
    
    if (countError) {
        console.error('❌ Erro ao contar appointments:', countError);
    } else {
        console.log(`📊 Total de appointments no banco: ${count}`);
    }
}

// Executar
if (require.main === module) {
    debugAppointmentData()
        .then(() => {
            console.log('\n✅ Debug concluído');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Erro:', error);
            process.exit(1);
        });
}

module.exports = { debugAppointmentData };