#!/usr/bin/env node

/**
 * EXTRAIR TODOS OS APPOINTMENTS COM OS 16 CAMPOS SOLICITADOS
 * tenant_name;user_name;professional_name;service_name;start_time,end_time,status,
 * quoted_price,final_price,conversation_id,customer_notes,external_event_id,
 * cancelled_at,created_at,updated_at
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
 * Formatação brasileira para valores monetários
 */
function formatBrazilianCurrency(value) {
    if (!value || isNaN(value)) return 'R$ 0,00';
    const numValue = parseFloat(value);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL',
        minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(numValue);
}

/**
 * Formatação brasileira para data/hora
 */
function formatBrazilianDateTime(isoString) {
    if (!isoString) return '';
    return new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'America/Sao_Paulo'
    }).format(new Date(isoString));
}

/**
 * Extrair todos os appointments via paginação
 */
async function extractAllAppointments() {
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
                *,
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
        
        // Pausa entre requisições
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n📊 TOTAL DE APPOINTMENTS EXTRAÍDOS: ${allAppointments.length}`);
    return allAppointments;
}

/**
 * Processar appointments e gerar CSV
 */
function generateAppointmentsCSV(appointments) {
    console.log('📄 GERANDO CSV COM FORMATAÇÃO BRASILEIRA...');
    
    // Processar dados conforme solicitado
    const processedAppointments = appointments.map(apt => ({
        tenant_name: apt.tenants?.name || 'N/A',
        user_name: apt.users?.name || 'N/A', 
        professional_name: apt.professionals?.name || 'N/A',
        service_name: apt.services?.name || 'N/A',
        start_time: formatBrazilianDateTime(apt.start_time),
        end_time: formatBrazilianDateTime(apt.end_time),
        status: apt.status || '',
        quoted_price: formatBrazilianCurrency(apt.quoted_price),
        final_price: formatBrazilianCurrency(apt.final_price),
        conversation_id: apt.appointment_data?.conversation_id || '',
        customer_notes: apt.customer_notes || '',
        external_event_id: apt.external_event_id || '',
        cancelled_at: apt.cancelled_at ? formatBrazilianDateTime(apt.cancelled_at) : '',
        created_at: formatBrazilianDateTime(apt.created_at),
        updated_at: formatBrazilianDateTime(apt.updated_at)
    }));
    
    // Headers exatamente como solicitado (com ponto e vírgula)
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
            // Escapar valores com ponto e vírgula ou quebras de linha
            return typeof value === 'string' && (value.includes(';') || value.includes('\n') || value.includes('"'))
                ? `"${value.replace(/"/g, '""')}"` 
                : value;
        }).join(';')
    );
    
    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `appointments-${timestamp}.csv`;
    
    fs.writeFileSync(filename, csvContent, 'utf8');
    
    console.log(`\n✅ CSV GERADO: ${filename}`);
    console.log(`🎯 Total de appointments: ${processedAppointments.length}`);
    console.log('🇧🇷 Formatação brasileira aplicada em datas e moedas');
    console.log('📋 Separador: ponto e vírgula (;)');
    
    return { filename, appointmentCount: processedAppointments.length };
}

/**
 * Validar dados do CSV contra uma amostra do banco
 */
async function validateCSVData(filename) {
    console.log('\n🔍 VALIDANDO DADOS DO CSV CONTRA O BANCO...');
    
    // Ler primeira linha de dados do CSV
    const csvContent = fs.readFileSync(filename, 'utf8');
    const lines = csvContent.split('\n');
    const firstDataLine = lines[1].split(';');
    
    console.log('📋 Primeira linha do CSV:');
    console.log(`   tenant_name: ${firstDataLine[0]}`);
    console.log(`   user_name: ${firstDataLine[1]}`);
    console.log(`   professional_name: ${firstDataLine[2]}`);
    console.log(`   service_name: ${firstDataLine[3]}`);
    console.log(`   status: ${firstDataLine[6]}`);
    console.log(`   quoted_price: ${firstDataLine[7]}`);
    
    // Validar contra uma consulta do banco
    const { data: sampleAppointment, error } = await supabase
        .from('appointments')
        .select(`
            *,
            tenants(name),
            users(name),
            professionals(name),
            services(name)
        `)
        .order('created_at', { ascending: false })
        .limit(1);
    
    if (error) {
        console.error('❌ Erro na validação:', error);
        return;
    }
    
    if (sampleAppointment.length > 0) {
        const apt = sampleAppointment[0];
        console.log('\n📊 Dados do banco (primeiro appointment):');
        console.log(`   tenant_name: ${apt.tenants?.name}`);
        console.log(`   user_name: ${apt.users?.name}`);
        console.log(`   professional_name: ${apt.professionals?.name}`);
        console.log(`   service_name: ${apt.services?.name}`);
        console.log(`   status: ${apt.status}`);
        console.log(`   quoted_price: ${apt.quoted_price}`);
        
        console.log('\n✅ VALIDAÇÃO: Comparar dados acima com o CSV');
    }
}

/**
 * Função principal
 */
async function extractAllAppointmentsCSV() {
    try {
        console.log('💼 MISSÃO: EXTRAIR TODOS OS APPOINTMENTS EM CSV');
        console.log('📋 16 CAMPOS: tenant_name;user_name;professional_name;service_name;start_time,end_time,status,quoted_price,final_price,conversation_id,customer_notes,external_event_id,cancelled_at,created_at,updated_at');
        console.log('🇧🇷 Formatação brasileira para datas e moedas\n');
        
        // Extrair todos os appointments
        const allAppointments = await extractAllAppointments();
        
        // Gerar CSV
        const result = generateAppointmentsCSV(allAppointments);
        
        // Validar dados
        await validateCSVData(result.filename);
        
        // Estatísticas finais
        console.log('\n📊 ESTATÍSTICAS FINAIS:');
        console.log(`   📅 Total appointments: ${result.appointmentCount}`);
        console.log(`   📁 Arquivo: ${result.filename}`);
        console.log('   🎯 Todos os 15 campos solicitados incluídos');
        console.log('   ✅ Formatação brasileira aplicada');
        
        return result;
        
    } catch (error) {
        console.error('\n💥 Erro fatal:', error);
        throw error;
    }
}

// Executar
if (require.main === module) {
    (async () => {
        try {
            const result = await extractAllAppointmentsCSV();
            
            console.log('\n🏆 MISSÃO CUMPRIDA!');
            console.log(`📁 Arquivo: ${result.filename}`);
            console.log(`🎯 ${result.appointmentCount} appointments extraídos`);
            console.log('✅ CSV pronto com todos os campos solicitados');
            
            process.exit(0);
        } catch (error) {
            console.error('\n💥 Falha na missão:', error);
            process.exit(1);
        }
    })();
}

module.exports = { extractAllAppointmentsCSV };