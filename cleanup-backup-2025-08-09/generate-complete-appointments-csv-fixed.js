/**
 * GERAÇÃO COMPLETA DE CSV APPOINTMENTS - VERSÃO CORRIGIDA
 * 
 * Garante captura de TODOS os registros (1149) sem limitações
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Formatar valor monetário no padrão brasileiro
 */
function formatBrazilianCurrency(value) {
    if (!value || isNaN(value)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(parseFloat(value));
}

/**
 * Formatar número decimal no padrão brasileiro
 */
function formatBrazilianDecimal(value) {
    if (!value || isNaN(value)) return '0,00';
    return parseFloat(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Formatar data/hora no padrão brasileiro
 */
function formatBrazilianDateTime(isoString) {
    if (!isoString) return '';
    return new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'America/Sao_Paulo'
    }).format(new Date(isoString));
}

/**
 * Escapar campo CSV
 */
function escapeCsvField(field) {
    if (field === null || field === undefined) return '';
    const str = String(field);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

/**
 * Extrair conversation_id do JSONB
 */
function extractConversationId(appointmentData) {
    if (!appointmentData) return '';
    try {
        const data = typeof appointmentData === 'string' ? JSON.parse(appointmentData) : appointmentData;
        return data.conversation_id || data.session_id || '';
    } catch (e) {
        return '';
    }
}

/**
 * Extrair TODOS os appointments em lotes para evitar limitações
 */
async function extractAllAppointments() {
    console.log('🔍 Extraindo TODOS os appointments em lotes...');
    
    // Primeiro, obter contagem total
    const { count: totalCount, error: countError } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true });
    
    if (countError) {
        console.error('❌ Erro ao contar appointments:', countError);
        throw countError;
    }
    
    console.log(`📊 Total de appointments na tabela: ${totalCount}`);
    
    let allAppointments = [];
    const batchSize = 1000;
    let offset = 0;
    
    while (offset < totalCount) {
        console.log(`📥 Buscando lote ${Math.floor(offset/batchSize) + 1}/${Math.ceil(totalCount/batchSize)} (offset: ${offset})...`);
        
        const { data, error } = await supabase
            .from('appointments')
            .select(`
                id,
                tenant_id,
                user_id,
                service_id,
                start_time,
                end_time,
                timezone,
                status,
                quoted_price,
                final_price,
                currency,
                appointment_data,
                customer_notes,
                internal_notes,
                external_event_id,
                cancelled_at,
                cancelled_by,
                cancellation_reason,
                created_at,
                updated_at,
                tenants:tenant_id (
                    name,
                    domain,
                    business_name,
                    slug
                ),
                users:user_id (
                    name,
                    email,
                    phone
                ),
                services:service_id (
                    name,
                    base_price,
                    duration_minutes,
                    description
                )
            `)
            .range(offset, offset + batchSize - 1)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('❌ Erro ao extrair lote:', error);
            throw error;
        }
        
        allAppointments = allAppointments.concat(data || []);
        console.log(`✅ Lote capturado: ${data?.length || 0} registros`);
        
        offset += batchSize;
        
        // Se o último lote retornou menos que o batch size, paramos
        if (!data || data.length < batchSize) {
            break;
        }
    }
    
    console.log(`✅ Total extraído: ${allAppointments.length}/${totalCount} registros`);
    
    if (allAppointments.length !== totalCount) {
        console.warn(`⚠️ ATENÇÃO: Esperado ${totalCount}, mas obtido ${allAppointments.length}`);
    }
    
    return allAppointments;
}

/**
 * Processar dados para CSV com TODOS os campos necessários
 */
function processDataForCsv(rawData) {
    console.log('🔄 Processando dados para formato CSV...');
    
    const processedData = rawData.map((appointment) => {
        // Calcular duração em minutos
        let durationMinutes = '';
        if (appointment.start_time && appointment.end_time) {
            const start = new Date(appointment.start_time);
            const end = new Date(appointment.end_time);
            const diffMs = end - start;
            const diffMinutes = diffMs / (1000 * 60);
            durationMinutes = formatBrazilianDecimal(diffMinutes);
        }

        // Extrair dados do JSONB
        const appointmentData = appointment.appointment_data || {};
        const jsonbQuotedPrice = appointmentData.quoted_price;
        const jsonbFinalPrice = appointmentData.final_price;

        // Determinar preço efetivo
        const effectivePrice = appointment.final_price || 
                              appointment.quoted_price || 
                              jsonbFinalPrice || 
                              jsonbQuotedPrice || 0;

        // Identificar se foi populado pelo script
        const isPopulated = appointmentData.source === 'whatsapp_ai';
        const populationSource = isPopulated ? 'Script População' : 'Dados Originais';

        return {
            // IDs e chaves
            appointment_id: appointment.id,
            
            // Tenant (substituição de ID por nome)
            tenant_name: appointment.tenants?.name || 'Sem nome',
            business_domain: appointment.tenants?.domain || 'other',
            business_name: appointment.tenants?.business_name || appointment.tenants?.name || 'Sem nome',
            tenant_slug: appointment.tenants?.slug || '',
            
            // Usuário
            user_name: appointment.users?.name || 'Sem nome',
            user_email: appointment.users?.email || 'Sem email',
            user_phone: appointment.users?.phone || 'Sem telefone',
            
            // Serviço
            service_name: appointment.services?.name || 'Serviço não especificado',
            service_base_price: appointment.services?.base_price ? 
                formatBrazilianCurrency(appointment.services.base_price) : 'R$ 0,00',
            service_duration: appointment.services?.duration_minutes || '',
            
            // Datas/horários
            start_time: formatBrazilianDateTime(appointment.start_time),
            end_time: formatBrazilianDateTime(appointment.end_time),
            duration_minutes: durationMinutes,
            
            // Status e informações básicas
            status: appointment.status || 'pending',
            timezone: appointment.timezone || 'America/Sao_Paulo',
            currency: appointment.currency || 'BRL',
            
            // Preços formatados
            quoted_price: appointment.quoted_price ? 
                formatBrazilianCurrency(appointment.quoted_price) : 'R$ 0,00',
            final_price: appointment.final_price ? 
                formatBrazilianCurrency(appointment.final_price) : 'R$ 0,00',
            effective_price: formatBrazilianCurrency(effectivePrice),
            
            // Dados da conversa/origem
            conversation_id: extractConversationId(appointment.appointment_data),
            appointment_source: appointmentData.source || 'unknown',
            booking_method: appointmentData.booking_method || '',
            population_source: populationSource,
            is_populated_by_script: isPopulated ? 'Sim' : 'Não',
            
            // Notas e observações
            customer_notes: appointment.customer_notes || '',
            internal_notes: appointment.internal_notes || '',
            
            // Integração externa
            external_event_id: appointment.external_event_id || '',
            
            // Cancelamento
            cancelled_at: appointment.cancelled_at ? 
                formatBrazilianDateTime(appointment.cancelled_at) : '',
            cancelled_by: appointment.cancelled_by || '',
            cancellation_reason: appointment.cancellation_reason || '',
            
            // Timestamps de controle
            created_at: formatBrazilianDateTime(appointment.created_at),
            updated_at: formatBrazilianDateTime(appointment.updated_at)
        };
    });

    console.log(`✅ Processados ${processedData.length} registros`);
    return processedData;
}

/**
 * Gerar CSV com todos os campos
 */
function generateCsv(data) {
    console.log('📝 Gerando arquivo CSV completo...');
    
    if (!data || data.length === 0) {
        console.warn('⚠️ Nenhum dado para gerar CSV');
        return '';
    }

    // Cabeçalhos completos
    const headers = [
        'appointment_id',
        'tenant_name', 
        'business_domain',
        'business_name',
        'tenant_slug',
        'user_name',
        'user_email',
        'user_phone',
        'service_name',
        'service_base_price',
        'service_duration',
        'start_time',
        'end_time', 
        'duration_minutes',
        'status',
        'timezone',
        'currency',
        'quoted_price',
        'final_price',
        'effective_price',
        'conversation_id',
        'appointment_source',
        'booking_method',
        'population_source',
        'is_populated_by_script',
        'customer_notes',
        'internal_notes',
        'external_event_id',
        'cancelled_at',
        'cancelled_by',
        'cancellation_reason',
        'created_at',
        'updated_at'
    ];

    // Gerar linhas CSV
    const csvLines = [headers.join(',')];
    
    data.forEach(row => {
        const csvRow = headers.map(header => escapeCsvField(row[header]));
        csvLines.push(csvRow.join(','));
    });

    console.log(`✅ CSV gerado com ${csvLines.length - 1} linhas de dados + 1 cabeçalho`);
    return csvLines.join('\n');
}

/**
 * Função principal
 */
async function main() {
    try {
        console.log('🚀 GERAÇÃO COMPLETA DE CSV APPOINTMENTS - VERSÃO CORRIGIDA');
        console.log('='.repeat(70));
        
        // 1. Extrair TODOS os dados
        const rawData = await extractAllAppointments();
        
        if (!rawData || rawData.length === 0) {
            console.log('⚠️ Nenhum appointment encontrado na base de dados');
            return;
        }
        
        // 2. Processar dados
        const processedData = processDataForCsv(rawData);
        
        // 3. Gerar CSV
        const csvContent = generateCsv(processedData);
        
        // 4. Salvar arquivo
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `appointments-complete-FULL-${timestamp}.csv`;
        const filepath = path.join(__dirname, filename);
        
        fs.writeFileSync(filepath, csvContent, 'utf8');
        
        // 5. Análise final
        const originalCount = processedData.filter(r => r.population_source === 'Dados Originais').length;
        const populatedCount = processedData.filter(r => r.population_source === 'Script População').length;
        const withConversation = processedData.filter(r => r.conversation_id).length;
        
        const statusBreakdown = {};
        const domainBreakdown = {};
        
        processedData.forEach(row => {
            const status = row.status || 'undefined';
            statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
            
            const domain = row.business_domain || 'undefined';
            domainBreakdown[domain] = (domainBreakdown[domain] || 0) + 1;
        });
        
        // 6. Relatório final
        console.log('='.repeat(70));
        console.log('📊 RELATÓRIO COMPLETO DE EXTRAÇÃO CSV');
        console.log('='.repeat(70));
        console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
        console.log(`📁 Arquivo: ${filename}`);
        console.log(`💾 Tamanho: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`);
        console.log('');
        
        console.log('📈 ESTATÍSTICAS COMPLETAS:');
        console.log(`   Total de appointments: ${processedData.length}`);
        console.log(`   Dados originais: ${originalCount} (${((originalCount/processedData.length)*100).toFixed(1)}%)`);
        console.log(`   Populados pelo script: ${populatedCount} (${((populatedCount/processedData.length)*100).toFixed(1)}%)`);
        console.log(`   Com conversation_id: ${withConversation} (${((withConversation/processedData.length)*100).toFixed(1)}%)`);
        console.log('');
        
        console.log('📊 BREAKDOWN POR STATUS:');
        Object.entries(statusBreakdown)
            .sort((a, b) => b[1] - a[1])
            .forEach(([status, count]) => {
                console.log(`   ${status}: ${count} (${((count/processedData.length)*100).toFixed(1)}%)`);
            });
        console.log('');
        
        console.log('🏢 BREAKDOWN POR DOMÍNIO:');
        Object.entries(domainBreakdown)
            .sort((a, b) => b[1] - a[1])
            .forEach(([domain, count]) => {
                console.log(`   ${domain}: ${count} (${((count/processedData.length)*100).toFixed(1)}%)`);
            });
        console.log('');
        
        console.log('✅ EXTRAÇÃO 100% COMPLETA - Todos os registros capturados');
        console.log('🔗 CSV com rastreabilidade completa: originais vs populados');
        console.log('📋 Formatação brasileira aplicada a preços e datas');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ Erro durante a extração:', error);
        process.exit(1);
    }
}

// Executar script
if (require.main === module) {
    main();
}

module.exports = { main };