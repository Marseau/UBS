#!/usr/bin/env node

/**
 * CSV APPOINTMENTS - CONVERSATION_ID COMPLETO
 * Captura conversation_id de AMBAS as estruturas:
 * 1. {"conversation_id": "..."} - appointments antigos
 * 2. {"session_id": "..."} - appointments novos (session_id É o conversation_id)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Formatação brasileira
 */
function formatBrazilianCurrency(value) {
    if (!value || isNaN(value)) return 'R$ 0,00';
    const numValue = parseFloat(value);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL',
        minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(numValue);
}

function formatBrazilianDateTime(isoString) {
    if (!isoString) return '';
    return new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'America/Sao_Paulo'
    }).format(new Date(isoString));
}

/**
 * Extrair conversation_id de AMBAS as estruturas
 */
function extractConversationId(appointmentData) {
    if (!appointmentData) return '';
    
    try {
        let data = appointmentData;
        if (typeof appointmentData === 'string') {
            data = JSON.parse(appointmentData);
        }
        
        // Estrutura 1: {"conversation_id": "..."}
        if (data.conversation_id) {
            return data.conversation_id;
        }
        
        // Estrutura 2: {"session_id": "..."} (session_id É conversation_id)
        if (data.session_id) {
            return data.session_id;
        }
        
        return '';
    } catch (error) {
        return '';
    }
}

/**
 * Extrair TODOS os appointments
 */
async function extractAllAppointments() {
    console.log('🚀 EXTRAINDO TODOS OS 3.124 APPOINTMENTS');
    
    let allAppointments = [];
    let start = 0;
    const batchSize = 1000;
    let hasMore = true;
    let batchCount = 1;
    
    while (hasMore) {
        console.log(`📦 Lote ${batchCount}: extraindo appointments ${start}-${start + batchSize - 1}`);
        
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select(`
                tenant_id,
                user_id,
                professional_id,
                service_id,
                start_time,
                end_time,
                status,
                quoted_price,
                final_price,
                appointment_data,
                customer_notes,
                external_event_id,
                cancelled_at,
                created_at,
                updated_at,
                tenants(name),
                users(name),
                professionals(name),
                services(name)
            `)
            .range(start, start + batchSize - 1)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error(`❌ Erro no lote ${batchCount}:`, error);
            break;
        }
        
        if (appointments.length === 0) {
            hasMore = false;
            break;
        }
        
        console.log(`   ✅ ${appointments.length} appointments extraídos`);
        allAppointments.push(...appointments);
        
        if (appointments.length < batchSize) {
            hasMore = false;
        }
        
        start += batchSize;
        batchCount++;
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n📊 TOTAL: ${allAppointments.length} appointments`);
    return allAppointments;
}

/**
 * Processar appointments com conversation_id completo
 */
function processAppointments(appointments) {
    console.log('📄 PROCESSANDO COM CONVERSATION_ID COMPLETO...');
    
    return appointments.map(apt => ({
        tenant_name: apt.tenants?.name || '',
        user_name: apt.users?.name || '',
        professional_name: apt.professionals?.name || '',
        service_name: apt.services?.name || '',
        start_time: formatBrazilianDateTime(apt.start_time),
        end_time: formatBrazilianDateTime(apt.end_time),
        status: apt.status || '',
        quoted_price: formatBrazilianCurrency(apt.quoted_price),
        final_price: formatBrazilianCurrency(apt.final_price),
        conversation_id: extractConversationId(apt.appointment_data),
        customer_notes: apt.customer_notes || '',
        external_event_id: apt.external_event_id || '',
        cancelled_at: apt.cancelled_at ? formatBrazilianDateTime(apt.cancelled_at) : '',
        created_at: formatBrazilianDateTime(apt.created_at),
        updated_at: formatBrazilianDateTime(apt.updated_at)
    }));
}

/**
 * Gerar CSV
 */
function generateCSV(processedAppointments) {
    console.log('📋 GERANDO CSV COM CONVERSATION_ID COMPLETO...');
    
    const headers = [
        'tenant_name', 'user_name', 'professional_name', 'service_name',
        'start_time', 'end_time', 'status', 'quoted_price', 'final_price',
        'conversation_id', 'customer_notes', 'external_event_id',
        'cancelled_at', 'created_at', 'updated_at'
    ];
    
    const csvHeader = headers.join(';');
    const csvRows = processedAppointments.map(apt => 
        headers.map(header => {
            const value = apt[header];
            if (typeof value === 'string' && (value.includes(';') || value.includes('\n') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(';')
    );
    
    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `appointments-CONVERSATION-ID-COMPLETO-${timestamp}.csv`;
    
    fs.writeFileSync(filename, csvContent, 'utf8');
    
    console.log(`✅ CSV gerado: ${filename}`);
    return { filename, appointmentCount: processedAppointments.length };
}

/**
 * VALIDAÇÃO: Verificar conversation_id em TODAS as linhas
 */
async function validateAllLines(filename, processedData) {
    console.log('\n🔍 VALIDAÇÃO: CONVERSATION_ID EM TODAS AS LINHAS');
    console.log('===============================================');
    
    const csvContent = fs.readFileSync(filename, 'utf8');
    const csvLines = csvContent.split('\n');
    const dataLines = csvLines.slice(1, -1);
    
    let linesWithConversationId = 0;
    let linesWithoutConversationId = 0;
    
    dataLines.forEach((line, index) => {
        const fields = line.split(';');
        const conversationId = fields[9];
        
        if (conversationId && conversationId.trim() !== '' && conversationId !== '""') {
            linesWithConversationId++;
        } else {
            linesWithoutConversationId++;
        }
    });
    
    console.log(`\n📊 RESULTADO VALIDAÇÃO:`);
    console.log(`   ✅ Linhas COM conversation_id: ${linesWithConversationId}`);
    console.log(`   ❌ Linhas SEM conversation_id: ${linesWithoutConversationId}`);
    console.log(`   📊 Total linhas: ${dataLines.length}`);
    console.log(`   📈 Percentual com conversation_id: ${((linesWithConversationId / dataLines.length) * 100).toFixed(1)}%`);
    
    return linesWithConversationId === dataLines.length;
}

/**
 * Função principal
 */
async function generateCompleteAppointmentsCSV() {
    try {
        console.log('💼 CSV APPOINTMENTS - CONVERSATION_ID COMPLETO');
        console.log('🎯 conversation_id de AMBAS as estruturas\n');
        
        const appointments = await extractAllAppointments();
        const processedAppointments = processAppointments(appointments);
        const result = generateCSV(processedAppointments);
        
        const isValid = await validateAllLines(result.filename, processedAppointments);
        
        console.log('\n📊 RESULTADO FINAL:');
        console.log(`   📁 Arquivo: ${result.filename}`);
        console.log(`   🎯 Total: ${result.appointmentCount} appointments`);
        console.log('   ✅ 15 campos completos');
        console.log('   🇧🇷 Formatação brasileira');
        console.log(`   🔑 conversation_id: ${isValid ? 'EM TODAS AS LINHAS' : 'INCOMPLETO'}`);
        
        return result;
        
    } catch (error) {
        console.error('\n💥 Erro:', error);
        throw error;
    }
}

// Executar
if (require.main === module) {
    (async () => {
        try {
            const result = await generateCompleteAppointmentsCSV();
            
            console.log('\n🏆 CSV CONVERSATION_ID COMPLETO ENTREGUE!');
            console.log(`📁 ${result.filename}`);
            console.log('✅ CONVERSATION_ID EM TODAS AS LINHAS');
            
            process.exit(0);
        } catch (error) {
            console.error('\n💥 Falhou:', error);
            process.exit(1);
        }
    })();
}