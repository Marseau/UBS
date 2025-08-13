#!/usr/bin/env node

/**
 * DEBUG PROFUNDO: Por que só 339/3124 appointments têm session_id?
 */

const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugDeepAppointmentData() {
    console.log('🔍 DEBUG PROFUNDO: APPOINTMENT_DATA');
    console.log('===================================\n');
    
    // 1. Contar appointments por tipo de appointment_data
    console.log('📊 1. ANÁLISE GERAL:');
    
    const { count: totalCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true });
    
    const { count: nullCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .is('appointment_data', null);
    
    const { count: notNullCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .not('appointment_data', 'is', null);
    
    console.log(`   📊 Total appointments: ${totalCount}`);
    console.log(`   🚫 appointment_data NULL: ${nullCount}`);
    console.log(`   ✅ appointment_data NOT NULL: ${notNullCount}`);
    
    // 2. Analisar appointments mais antigos (podem ter estrutura diferente)
    console.log('\n📊 2. APPOINTMENTS MAIS ANTIGOS (primeiros 10):');
    
    const { data: oldestAppointments } = await supabase
        .from('appointments')
        .select('id, appointment_data, created_at')
        .order('created_at', { ascending: true })
        .limit(10);
    
    oldestAppointments.forEach((apt, index) => {
        console.log(`\n   📋 ANTIGO ${index + 1} (${apt.created_at}):`);
        if (!apt.appointment_data) {
            console.log('      ❌ appointment_data: NULL');
        } else {
            console.log(`      📄 appointment_data: ${JSON.stringify(apt.appointment_data)}`);
            const hasSessionId = apt.appointment_data?.session_id ? '✅' : '❌';
            console.log(`      🔑 session_id: ${hasSessionId}`);
        }
    });
    
    // 3. Analisar appointments mais novos
    console.log('\n📊 3. APPOINTMENTS MAIS NOVOS (últimos 10):');
    
    const { data: newestAppointments } = await supabase
        .from('appointments')
        .select('id, appointment_data, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
    
    newestAppointments.forEach((apt, index) => {
        console.log(`\n   📋 NOVO ${index + 1} (${apt.created_at}):`);
        if (!apt.appointment_data) {
            console.log('      ❌ appointment_data: NULL');
        } else {
            console.log(`      📄 appointment_data: ${JSON.stringify(apt.appointment_data)}`);
            const hasSessionId = apt.appointment_data?.session_id ? '✅' : '❌';
            console.log(`      🔑 session_id: ${hasSessionId}`);
        }
    });
    
    // 4. Verificar appointments criados por diferentes métodos
    console.log('\n📊 4. APPOINTMENTS POR FONTE:');
    
    // Com source="whatsapp_conversation"
    const { count: whatsappCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .like('appointment_data', '%whatsapp_conversation%');
    
    console.log(`   📱 Com source="whatsapp_conversation": ${whatsappCount}`);
    
    // Sem appointment_data ou appointment_data vazio
    const { data: sampleWithoutData } = await supabase
        .from('appointments')
        .select('id, appointment_data, created_at, customer_notes')
        .is('appointment_data', null)
        .limit(5);
    
    console.log(`\n   📋 SAMPLE SEM APPOINTMENT_DATA (${sampleWithoutData.length}):`);
    sampleWithoutData.forEach((apt, index) => {
        console.log(`      ${index + 1}. ID: ${apt.id.substring(0, 8)}... | Notes: "${apt.customer_notes}" | Created: ${apt.created_at}`);
    });
    
    // 5. Buscar por conversation_id em outros campos ou formatos
    console.log('\n📊 5. BUSCANDO CONVERSATION_ID EM OUTROS LUGARES:');
    
    // Na customer_notes?
    const { data: notesWithConv } = await supabase
        .from('appointments')
        .select('id, customer_notes, appointment_data')
        .like('customer_notes', '%conv_%')
        .limit(5);
    
    console.log(`\n   📝 Customer_notes com "conv_": ${notesWithConv.length} encontrados`);
    notesWithConv.forEach((apt, index) => {
        console.log(`      ${index + 1}. Notes: "${apt.customer_notes}"`);
    });
    
    // Com conversation_id no appointment_data?
    const { data: appointmentsWithConvId } = await supabase
        .from('appointments')
        .select('id, appointment_data, created_at')
        .like('appointment_data', '%conversation_id%')
        .limit(5);
    
    console.log(`\n   🔍 appointment_data com "conversation_id": ${appointmentsWithConvId.length} encontrados`);
    appointmentsWithConvId.forEach((apt, index) => {
        console.log(`      ${index + 1}. Data: ${JSON.stringify(apt.appointment_data)}`);
    });
}

// Executar
if (require.main === module) {
    debugDeepAppointmentData()
        .then(() => {
            console.log('\n✅ Debug profundo concluído');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Erro:', error);
            process.exit(1);
        });
}

module.exports = { debugDeepAppointmentData };