/**
 * SCRIPT DE EXTRAÇÃO COMPLETA: TABELA APPOINTMENTS → CSV
 * 
 * Seguindo princípios de Context Engineering:
 * - Context is King: Todos os campos e relacionamentos incluídos
 * - Validation Loops: Validação rigorosa dos dados extraídos
 * - Information Dense: Substituição de IDs por nomes legíveis
 * - Progressive Success: Extração → Formatação → Validação → CSV
 */

// Load environment variables
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Variáveis de ambiente SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
 * Formatar número decimal no padrão brasileiro (vírgula)
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
 * Escapar campo CSV (aspas duplas e quebras de linha)
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
 * Extrair conversation_id do JSONB (ambas estruturas: conversation_id ou session_id)
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
 * Extrair campo específico do JSONB
 */
function extractJsonbField(appointmentData, fieldName) {
    if (!appointmentData) return '';
    try {
        const data = typeof appointmentData === 'string' ? JSON.parse(appointmentData) : appointmentData;
        return data[fieldName] || '';
    } catch (e) {
        return '';
    }
}

/**
 * Query principal para extrair dados completos
 */
async function extractAppointmentsData() {
    console.log('🔍 Extraindo dados completos da tabela appointments...');
    
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
        .order('created_at', { ascending: false });

    if (error) {
        console.error('❌ Erro ao extrair dados:', error);
        throw error;
    }

    console.log(`✅ Extraídos ${data?.length || 0} registros de appointments`);
    return data || [];
}

/**
 * Processar e formatar dados para CSV
 */
function processDataForCsv(rawData) {
    console.log('🔄 Processando dados para formato CSV...');
    
    const processedData = rawData.map((appointment, index) => {
        // Calcular duração em minutos
        let durationMinutes = '';
        if (appointment.start_time && appointment.end_time) {
            const start = new Date(appointment.start_time);
            const end = new Date(appointment.end_time);
            const diffMs = end - start;
            const diffMinutes = diffMs / (1000 * 60);
            durationMinutes = formatBrazilianDecimal(diffMinutes);
        }

        // Extrair preços do JSONB
        const jsonbQuotedPrice = extractJsonbField(appointment.appointment_data, 'quoted_price');
        const jsonbFinalPrice = extractJsonbField(appointment.appointment_data, 'final_price');

        // Determinar preço efetivo (hierarquia: final_price > quoted_price > jsonb_final_price > jsonb_quoted_price)
        const effectivePrice = appointment.final_price || 
                              appointment.quoted_price || 
                              jsonbFinalPrice || 
                              jsonbQuotedPrice || 0;

        return {
            // IDs e chaves
            appointment_id: appointment.id,
            
            // Tenant (substituição de ID por nome)
            tenant_name: appointment.tenants?.name || 'Sem nome',
            business_domain: appointment.tenants?.domain || 'other',
            business_name: appointment.tenants?.business_name || appointment.tenants?.name || 'Sem nome',
            tenant_slug: appointment.tenants?.slug || '',
            
            // Usuário (substituição de ID por dados)
            user_name: appointment.users?.name || 'Sem nome',
            user_email: appointment.users?.email || 'Sem email',
            user_phone: appointment.users?.phone || 'Sem telefone',
            
            // Serviço (substituição de ID por nome)
            service_name: appointment.services?.name || 'Serviço não especificado',
            service_base_price: appointment.services?.base_price ? 
                formatBrazilianCurrency(appointment.services.base_price) : 'R$ 0,00',
            service_duration: appointment.services?.duration_minutes || '',
            
            // Datas/horários formatados
            start_time: formatBrazilianDateTime(appointment.start_time),
            end_time: formatBrazilianDateTime(appointment.end_time),
            duration_minutes: durationMinutes,
            
            // Status e informações básicas
            status: appointment.status || 'pending',
            timezone: appointment.timezone || 'America/Sao_Paulo',
            currency: appointment.currency || 'BRL',
            
            // Preços formatados (padrão brasileiro)
            quoted_price: appointment.quoted_price ? 
                formatBrazilianCurrency(appointment.quoted_price) : 'R$ 0,00',
            final_price: appointment.final_price ? 
                formatBrazilianCurrency(appointment.final_price) : 'R$ 0,00',
            effective_price: formatBrazilianCurrency(effectivePrice),
            
            // Preços do JSONB (se existirem)
            jsonb_quoted_price: jsonbQuotedPrice ? 
                formatBrazilianCurrency(jsonbQuotedPrice) : '',
            jsonb_final_price: jsonbFinalPrice ? 
                formatBrazilianCurrency(jsonbFinalPrice) : '',
            
            // Dados da conversa/origem
            conversation_id: extractConversationId(appointment.appointment_data),
            appointment_source: extractJsonbField(appointment.appointment_data, 'source'),
            booking_method: extractJsonbField(appointment.appointment_data, 'booking_method'),
            import_source: extractJsonbField(appointment.appointment_data, 'import_source'),
            
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
            updated_at: formatBrazilianDateTime(appointment.updated_at),
            
            // Dados brutos do JSONB (para debug)
            appointment_data_raw: JSON.stringify(appointment.appointment_data || {})
        };
    });

    console.log(`✅ Processados ${processedData.length} registros`);
    return processedData;
}

/**
 * Gerar CSV com cabeçalhos
 */
function generateCsv(data) {
    console.log('📝 Gerando arquivo CSV...');
    
    if (!data || data.length === 0) {
        console.warn('⚠️ Nenhum dado para gerar CSV');
        return '';
    }

    // Cabeçalhos do CSV
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
        'jsonb_quoted_price',
        'jsonb_final_price',
        'conversation_id',
        'appointment_source',
        'booking_method',
        'import_source',
        'customer_notes',
        'internal_notes',
        'external_event_id',
        'cancelled_at',
        'cancelled_by',
        'cancellation_reason',
        'created_at',
        'updated_at',
        'appointment_data_raw'
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
 * Validar dados extraídos
 */
async function validateExtractedData(processedData) {
    console.log('🔍 Validando dados extraídos...');
    
    // Contagem original no banco
    const { count: originalCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true });
    
    const validationReport = {
        originalCount: originalCount || 0,
        extractedCount: processedData.length,
        missingCount: (originalCount || 0) - processedData.length,
        
        // Validações específicas
        withTenant: processedData.filter(r => r.tenant_name !== 'Sem nome').length,
        withUser: processedData.filter(r => r.user_name !== 'Sem nome').length,
        withService: processedData.filter(r => r.service_name !== 'Serviço não especificado').length,
        withConversation: processedData.filter(r => r.conversation_id).length,
        withPrice: processedData.filter(r => r.effective_price !== 'R$ 0,00').length,
        
        // Status breakdown
        statusBreakdown: {},
        
        // Domínios de negócio
        domainsBreakdown: {}
    };

    // Contar por status
    processedData.forEach(row => {
        const status = row.status || 'undefined';
        validationReport.statusBreakdown[status] = (validationReport.statusBreakdown[status] || 0) + 1;
        
        const domain = row.business_domain || 'undefined';
        validationReport.domainsBreakdown[domain] = (validationReport.domainsBreakdown[domain] || 0) + 1;
    });

    return validationReport;
}

/**
 * Função principal
 */
async function main() {
    try {
        console.log('🚀 Iniciando extração completa da tabela appointments...');
        console.log('='.repeat(60));
        
        // 1. Extrair dados
        const rawData = await extractAppointmentsData();
        
        if (!rawData || rawData.length === 0) {
            console.log('⚠️ Nenhum appointment encontrado na base de dados');
            return;
        }
        
        // 2. Processar dados
        const processedData = processDataForCsv(rawData);
        
        // 3. Validar dados
        const validationReport = await validateExtractedData(processedData);
        
        // 4. Gerar CSV
        const csvContent = generateCsv(processedData);
        
        // 5. Salvar arquivo
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `appointments-complete-${timestamp}.csv`;
        const filepath = path.join(__dirname, filename);
        
        fs.writeFileSync(filepath, csvContent, 'utf8');
        
        // 6. Relatório final
        console.log('='.repeat(60));
        console.log('📊 RELATÓRIO DE EXTRAÇÃO APPOINTMENTS → CSV');
        console.log('='.repeat(60));
        console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
        console.log(`📁 Arquivo: ${filename}`);
        console.log(`💾 Tamanho: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`);
        console.log('');
        console.log('📈 ESTATÍSTICAS:');
        console.log(`   Registros originais no BD: ${validationReport.originalCount}`);
        console.log(`   Registros extraídos: ${validationReport.extractedCount}`);
        console.log(`   Diferença: ${validationReport.missingCount} (${validationReport.missingCount === 0 ? '✅ OK' : '⚠️ ATENÇÃO'})`);
        console.log('');
        console.log('🔍 QUALIDADE DOS DADOS:');
        console.log(`   Com tenant: ${validationReport.withTenant} (${((validationReport.withTenant/validationReport.extractedCount)*100).toFixed(1)}%)`);
        console.log(`   Com usuário: ${validationReport.withUser} (${((validationReport.withUser/validationReport.extractedCount)*100).toFixed(1)}%)`);
        console.log(`   Com serviço: ${validationReport.withService} (${((validationReport.withService/validationReport.extractedCount)*100).toFixed(1)}%)`);
        console.log(`   Com conversa: ${validationReport.withConversation} (${((validationReport.withConversation/validationReport.extractedCount)*100).toFixed(1)}%)`);
        console.log(`   Com preço: ${validationReport.withPrice} (${((validationReport.withPrice/validationReport.extractedCount)*100).toFixed(1)}%)`);
        console.log('');
        console.log('📊 BREAKDOWN POR STATUS:');
        Object.entries(validationReport.statusBreakdown).forEach(([status, count]) => {
            console.log(`   ${status}: ${count} (${((count/validationReport.extractedCount)*100).toFixed(1)}%)`);
        });
        console.log('');
        console.log('🏢 BREAKDOWN POR DOMÍNIO:');
        Object.entries(validationReport.domainsBreakdown).forEach(([domain, count]) => {
            console.log(`   ${domain}: ${count} (${((count/validationReport.extractedCount)*100).toFixed(1)}%)`);
        });
        console.log('');
        console.log(validationReport.missingCount === 0 ? 
            '✅ EXTRAÇÃO COMPLETA - Todos os registros capturados' :
            `⚠️ ATENÇÃO - ${validationReport.missingCount} registros não capturados`
        );
        console.log('='.repeat(60));
        
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