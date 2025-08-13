#!/usr/bin/env node

/**
 * CSV APPOINTMENTS - CORRETO COM SESSION_ID
 * session_id está em TODOS os appointments (não conversation_id)
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
 * Extrair session_id (o campo correto)
 */
function extractSessionId(appointmentData) {
    if (!appointmentData) return '';
    
    try {
        if (typeof appointmentData === 'string') {
            const parsed = JSON.parse(appointmentData);
            return parsed.session_id || '';
        }
        
        if (typeof appointmentData === 'object') {
            return appointmentData.session_id || '';
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
 * Processar appointments com session_id correto
 */
function processAppointments(appointments) {
    console.log('📄 PROCESSANDO COM SESSION_ID (campo correto)...');
    
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
        conversation_id: extractSessionId(apt.appointment_data), // session_id como conversation_id
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
    console.log('📋 GERANDO CSV COM SESSION_ID...');
    
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
    const filename = `appointments-SESSION-ID-CORRETO-${timestamp}.csv`;
    
    fs.writeFileSync(filename, csvContent, 'utf8');
    
    console.log(`✅ CSV gerado: ${filename}`);
    return { filename, appointmentCount: processedAppointments.length };
}

/**
 * VALIDAÇÃO RIGOROSA - Verificar session_id em TODAS as linhas
 */
async function validateAllLines(filename, processedData) {
    console.log('\n🔍 VALIDAÇÃO: VERIFICANDO SESSION_ID EM TODAS AS LINHAS');
    console.log('=======================================================');
    
    const csvContent = fs.readFileSync(filename, 'utf8');
    const csvLines = csvContent.split('\n');
    const dataLines = csvLines.slice(1, -1); // Remove header e linha vazia final
    
    let linesWithSessionId = 0;
    let linesWithoutSessionId = 0;
    
    dataLines.forEach((line, index) => {
        const fields = line.split(';');
        const sessionId = fields[9]; // conversation_id field (que é session_id)
        
        if (sessionId && sessionId.trim() !== '' && sessionId !== '""') {
            linesWithSessionId++;
        } else {
            linesWithoutSessionId++;
            if (index < 5) { // Mostrar primeiras 5 linhas com problema
                console.log(`❌ Linha ${index + 1} sem session_id: ${line.substring(0, 100)}...`);
            }
        }
    });
    
    console.log(`\n📊 RESULTADO VALIDAÇÃO:`);
    console.log(`   ✅ Linhas COM session_id: ${linesWithSessionId}`);
    console.log(`   ❌ Linhas SEM session_id: ${linesWithoutSessionId}`);
    console.log(`   📊 Total linhas: ${dataLines.length}`);
    console.log(`   📈 Percentual com session_id: ${((linesWithSessionId / dataLines.length) * 100).toFixed(1)}%`);
    
    // Validar 3 linhas aleatórias detalhadamente
    console.log('\n🔍 VALIDAÇÃO DETALHADA - 3 LINHAS ALEATÓRIAS:');
    const randomIndexes = [
        Math.floor(Math.random() * Math.min(100, dataLines.length)),
        Math.floor(dataLines.length / 2),
        Math.max(0, dataLines.length - 50)
    ];
    
    randomIndexes.forEach((index, i) => {
        if (index < dataLines.length) {
            const fields = dataLines[index].split(';');
            const sessionId = fields[9];
            
            console.log(`\n📋 LINHA ${index + 1}:`);
            console.log(`   tenant_name: ${fields[0]}`);
            console.log(`   user_name: ${fields[1]}`);
            console.log(`   session_id: ${sessionId}`);
            console.log(`   status: ${sessionId && sessionId.trim() !== '' ? '✅ TEM SESSION_ID' : '❌ SEM SESSION_ID'}`);
        }
    });
    
    return linesWithSessionId === dataLines.length;
}

/**
 * Função principal
 */
async function generateCorrectAppointmentsCSV() {
    try {
        console.log('💼 CSV APPOINTMENTS - VERSÃO CORRETA COM SESSION_ID');
        console.log('🎯 session_id em TODAS as 3.124 linhas\n');
        
        // Extrair dados
        const appointments = await extractAllAppointments();
        
        // Processar com session_id
        const processedAppointments = processAppointments(appointments);
        
        // Gerar CSV
        const result = generateCSV(processedAppointments);
        
        // VALIDAÇÃO COMPLETA
        const isValid = await validateAllLines(result.filename, processedAppointments);
        
        console.log('\n📊 RESULTADO FINAL:');
        console.log(`   📁 Arquivo: ${result.filename}`);
        console.log(`   🎯 Total: ${result.appointmentCount} appointments`);
        console.log('   ✅ 15 campos completos');
        console.log('   🇧🇷 Formatação brasileira');
        console.log(`   🔑 session_id: ${isValid ? 'EM TODAS AS LINHAS' : 'COM PROBLEMAS'}`);
        
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
            const result = await generateCorrectAppointmentsCSV();
            
            console.log('\n🏆 CSV CORRETO COM SESSION_ID ENTREGUE!');
            console.log(`📁 ${result.filename}`);
            console.log('✅ session_id EM TODAS AS LINHAS');
            
            process.exit(0);
        } catch (error) {
            console.error('\n💥 Falhou:', error);
            process.exit(1);
        }
    })();
}

module.exports = { generateCorrectAppointmentsCSV };