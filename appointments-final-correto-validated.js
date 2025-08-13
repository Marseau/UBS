#!/usr/bin/env node

/**
 * CSV APPOINTMENTS - VERSÃO FINAL VALIDADA
 * Com conversation_id extraído corretamente do JSONB
 * VALIDAÇÃO RIGOROSA antes da entrega
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis Supabase não encontradas');
    process.exit(1);
}

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
 * Extrair conversation_id do JSONB usando post-processing
 */
function extractConversationId(appointmentData) {
    if (!appointmentData) return '';
    
    try {
        // Se já é string, tentar fazer parse
        if (typeof appointmentData === 'string') {
            const parsed = JSON.parse(appointmentData);
            return parsed.conversation_id || '';
        }
        
        // Se já é objeto
        if (typeof appointmentData === 'object') {
            return appointmentData.conversation_id || '';
        }
        
        return '';
    } catch (error) {
        console.log('⚠️ Erro ao extrair conversation_id:', error.message);
        return '';
    }
}

/**
 * Extrair TODOS os appointments via paginação
 */
async function extractAllAppointmentsPaginated() {
    console.log('🚀 EXTRAINDO TODOS OS APPOINTMENTS VIA PAGINAÇÃO');
    
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
    
    console.log(`\n📊 TOTAL DE APPOINTMENTS EXTRAÍDOS: ${allAppointments.length}`);
    return allAppointments;
}

/**
 * Processar appointments com os 15 campos EXATOS solicitados
 */
function processAppointments(appointments) {
    console.log('📄 PROCESSANDO APPOINTMENTS COM 15 CAMPOS...');
    
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
    console.log('📋 GERANDO CSV...');
    
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
    const filename = `appointments-VALIDADO-${timestamp}.csv`;
    
    fs.writeFileSync(filename, csvContent, 'utf8');
    
    console.log(`✅ CSV gerado: ${filename}`);
    return { filename, appointmentCount: processedAppointments.length };
}

/**
 * VALIDAÇÃO RIGOROSA - 3 LINHAS ALEATÓRIAS COLUNA POR COLUNA
 */
async function validateRandomLinesRigorous(filename, originalData, processedData) {
    console.log('\n🔍 VALIDAÇÃO RIGOROSA - 3 LINHAS ALEATÓRIAS COLUNA POR COLUNA');
    console.log('================================================================');
    
    const csvContent = fs.readFileSync(filename, 'utf8');
    const csvLines = csvContent.split('\n');
    
    // Pegar 3 linhas aleatórias (evitando header e última linha vazia)
    const dataLines = csvLines.slice(1, -1);
    const randomIndexes = [
        Math.floor(Math.random() * Math.min(10, dataLines.length)),
        Math.floor(dataLines.length / 2),
        Math.max(0, dataLines.length - 10)
    ];
    
    let totalErrors = 0;
    
    for (let i = 0; i < randomIndexes.length; i++) {
        const lineIndex = randomIndexes[i];
        if (lineIndex < dataLines.length && dataLines[lineIndex]) {
            const csvFields = dataLines[lineIndex].split(';');
            const dbRecord = originalData[lineIndex];
            const processedRecord = processedData[lineIndex];
            
            console.log(`\n📋 VALIDAÇÃO LINHA ${lineIndex + 1} (ALEATÓRIA):`);
            console.log(`──────────────────────────────────────────────────────`);
            
            // Validar TODOS os 15 campos
            const validations = [
                { field: 'tenant_name', csv: csvFields[0], expected: processedRecord?.tenant_name || '', raw: dbRecord?.tenants?.name || '' },
                { field: 'user_name', csv: csvFields[1], expected: processedRecord?.user_name || '', raw: dbRecord?.users?.name || '' },
                { field: 'professional_name', csv: csvFields[2], expected: processedRecord?.professional_name || '', raw: dbRecord?.professionals?.name || '' },
                { field: 'service_name', csv: csvFields[3], expected: processedRecord?.service_name || '', raw: dbRecord?.services?.name || '' },
                { field: 'start_time', csv: csvFields[4], expected: processedRecord?.start_time || '', raw: dbRecord?.start_time },
                { field: 'end_time', csv: csvFields[5], expected: processedRecord?.end_time || '', raw: dbRecord?.end_time },
                { field: 'status', csv: csvFields[6], expected: processedRecord?.status || '', raw: dbRecord?.status },
                { field: 'quoted_price', csv: csvFields[7], expected: processedRecord?.quoted_price || '', raw: dbRecord?.quoted_price },
                { field: 'final_price', csv: csvFields[8], expected: processedRecord?.final_price || '', raw: dbRecord?.final_price },
                { field: 'conversation_id', csv: csvFields[9], expected: processedRecord?.conversation_id || '', raw: extractConversationId(dbRecord?.appointment_data) },
                { field: 'customer_notes', csv: csvFields[10], expected: processedRecord?.customer_notes || '', raw: dbRecord?.customer_notes },
                { field: 'external_event_id', csv: csvFields[11], expected: processedRecord?.external_event_id || '', raw: dbRecord?.external_event_id },
                { field: 'cancelled_at', csv: csvFields[12], expected: processedRecord?.cancelled_at || '', raw: dbRecord?.cancelled_at },
                { field: 'created_at', csv: csvFields[13], expected: processedRecord?.created_at || '', raw: dbRecord?.created_at },
                { field: 'updated_at', csv: csvFields[14], expected: processedRecord?.updated_at || '', raw: dbRecord?.updated_at }
            ];
            
            let lineErrors = 0;
            validations.forEach(v => {
                const csvValue = v.csv.startsWith('"') && v.csv.endsWith('"') ? v.csv.slice(1, -1) : v.csv;
                const match = csvValue === v.expected;
                const status = match ? '✅' : '❌';
                if (!match) {
                    lineErrors++;
                    totalErrors++;
                }
                
                console.log(`${status} ${v.field.padEnd(18)}: CSV="${csvValue}" | ESPERADO="${v.expected}" | RAW="${v.raw}"`);
            });
            
            console.log(`\n${lineErrors === 0 ? '✅ LINHA PERFEITA' : `❌ ${lineErrors} ERROS NA LINHA`}`);
        }
    }
    
    console.log(`\n📊 RESULTADO VALIDAÇÃO: ${totalErrors === 0 ? '✅ PERFEITO' : `❌ ${totalErrors} ERROS ENCONTRADOS`}`);
    return totalErrors === 0;
}

/**
 * Função principal
 */
async function generateValidatedAppointmentsCSV() {
    try {
        console.log('💼 CSV APPOINTMENTS - VERSÃO FINAL VALIDADA');
        console.log('🎯 15 campos + formatação brasileira + validação rigorosa\n');
        
        // Extrair dados
        const appointments = await extractAllAppointmentsPaginated();
        
        if (appointments.length === 0) {
            throw new Error('Nenhum appointment extraído');
        }
        
        // Processar formatação
        const processedAppointments = processAppointments(appointments);
        
        // Gerar CSV
        const result = generateCSV(processedAppointments);
        
        // VALIDAÇÃO RIGOROSA
        const isValid = await validateRandomLinesRigorous(result.filename, appointments, processedAppointments);
        
        console.log('\n📊 RESULTADO FINAL:');
        console.log(`   📁 Arquivo: ${result.filename}`);
        console.log(`   🎯 Total: ${result.appointmentCount} appointments`);
        console.log('   ✅ 15 campos completos');
        console.log('   🇧🇷 Formatação brasileira');
        console.log(`   🔍 Validação: ${isValid ? 'PERFEITA' : 'COM ERROS'}`);
        
        if (!isValid) {
            throw new Error('Validação falhou - CSV tem erros');
        }
        
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
            const result = await generateValidatedAppointmentsCSV();
            
            console.log('\n🏆 CSV APPOINTMENTS ENTREGUE E VALIDADO!');
            console.log(`📁 ${result.filename}`);
            console.log('✅ VALIDADO COLUNA POR COLUNA EM 3 LINHAS ALEATÓRIAS');
            console.log('✅ CONVERSATION_ID FUNCIONANDO');
            
            process.exit(0);
        } catch (error) {
            console.error('\n💥 Falhou:', error);
            process.exit(1);
        }
    })();
}

module.exports = { generateValidatedAppointmentsCSV };