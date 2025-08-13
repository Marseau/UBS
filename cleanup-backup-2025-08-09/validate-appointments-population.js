/**
 * VALIDAÇÃO DA POPULAÇÃO DE APPOINTMENTS
 * 
 * Valida se os appointments foram populados corretamente baseados nas conversas:
 * - Verifica datas (3-5 dias após conversas)
 * - Confirma distribuição de status (80% completed, 10% no_show, 10% cancelled)
 * - Valida rastreabilidade conversation_id → appointment
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Validar appointments populados automaticamente
 */
async function validatePopulatedAppointments() {
    console.log('🔍 Validando appointments populados automaticamente...');
    
    // Buscar appointments com source = whatsapp_ai (populados pelo script)
    const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
            id,
            tenant_id,
            user_id,
            start_time,
            end_time,
            status,
            appointment_data,
            created_at,
            tenants:tenant_id (name, domain),
            users:user_id (name),
            services:service_id (name)
        `)
        .contains('appointment_data', { source: 'whatsapp_ai' });

    if (error) {
        console.error('❌ Erro ao buscar appointments:', error);
        throw error;
    }

    console.log(`📊 Encontrados ${appointments.length} appointments populados automaticamente`);
    
    return appointments;
}

/**
 * Validar datas dos agendamentos
 */
function validateAppointmentDates(appointments) {
    console.log('📅 Validando datas dos agendamentos...');
    
    const dateValidation = {
        total: appointments.length,
        validDates: 0,
        invalidDates: 0,
        dateGaps: []
    };

    appointments.forEach(apt => {
        const appointmentData = apt.appointment_data || {};
        const conversationEnd = appointmentData.population_metadata?.conversation_end;
        
        if (conversationEnd) {
            const convEndDate = new Date(conversationEnd);
            const aptStartDate = new Date(apt.start_time);
            
            const diffDays = (aptStartDate - convEndDate) / (1000 * 60 * 60 * 24);
            
            if (diffDays >= 3 && diffDays <= 5) {
                dateValidation.validDates++;
            } else {
                dateValidation.invalidDates++;
            }
            
            dateValidation.dateGaps.push({
                appointment_id: apt.id,
                gap_days: Math.round(diffDays * 10) / 10
            });
        }
    });

    return dateValidation;
}

/**
 * Validar distribuição de status
 */
function validateStatusDistribution(appointments) {
    console.log('📊 Validando distribuição de status...');
    
    const statusCounts = {
        completed: 0,
        no_show: 0,
        cancelled: 0,
        others: 0
    };

    appointments.forEach(apt => {
        if (statusCounts.hasOwnProperty(apt.status)) {
            statusCounts[apt.status]++;
        } else {
            statusCounts.others++;
        }
    });

    const total = appointments.length;
    const statusPercentages = {
        completed: (statusCounts.completed / total) * 100,
        no_show: (statusCounts.no_show / total) * 100,
        cancelled: (statusCounts.cancelled / total) * 100,
        others: (statusCounts.others / total) * 100
    };

    return { statusCounts, statusPercentages };
}

/**
 * Validar rastreabilidade de conversas
 */
async function validateConversationTraceability(appointments) {
    console.log('🔗 Validando rastreabilidade de conversas...');
    
    const traceabilityValidation = {
        withConversationId: 0,
        withoutConversationId: 0,
        uniqueConversations: new Set(),
        duplicateConversations: []
    };

    const conversationMap = new Map();

    appointments.forEach(apt => {
        const appointmentData = apt.appointment_data || {};
        const conversationId = appointmentData.conversation_id || appointmentData.session_id;
        
        if (conversationId) {
            traceabilityValidation.withConversationId++;
            traceabilityValidation.uniqueConversations.add(conversationId);
            
            if (conversationMap.has(conversationId)) {
                traceabilityValidation.duplicateConversations.push({
                    conversation_id: conversationId,
                    appointments: [conversationMap.get(conversationId), apt.id]
                });
            } else {
                conversationMap.set(conversationId, apt.id);
            }
        } else {
            traceabilityValidation.withoutConversationId++;
        }
    });

    return traceabilityValidation;
}

/**
 * Gerar CSV atualizado com todos os appointments
 */
async function generateUpdatedAppointmentsCSV() {
    console.log('📝 Gerando CSV atualizado com todos os appointments...');
    
    const { data: allAppointments, error } = await supabase
        .from('appointments')
        .select(`
            id,
            tenant_id,
            user_id,
            service_id,
            start_time,
            end_time,
            status,
            quoted_price,
            final_price,
            appointment_data,
            created_at,
            tenants:tenant_id (name, domain),
            users:user_id (name, phone),
            services:service_id (name, base_price)
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('❌ Erro ao buscar todos os appointments:', error);
        throw error;
    }

    console.log(`📊 Total de appointments na tabela: ${allAppointments.length}`);

    // Processar dados para CSV
    const csvData = allAppointments.map(apt => {
        const appointmentData = apt.appointment_data || {};
        const duration = apt.start_time && apt.end_time ? 
            (new Date(apt.end_time) - new Date(apt.start_time)) / (1000 * 60) : 0;

        return {
            appointment_id: apt.id,
            tenant_name: apt.tenants?.name || 'Sem nome',
            business_domain: apt.tenants?.domain || 'other',
            user_name: apt.users?.name || 'Sem nome',
            user_phone: apt.users?.phone || '',
            service_name: apt.services?.name || 'Serviço não especificado',
            start_time: apt.start_time ? new Date(apt.start_time).toLocaleString('pt-BR') : '',
            end_time: apt.end_time ? new Date(apt.end_time).toLocaleString('pt-BR') : '',
            duration_minutes: duration.toFixed(2).replace('.', ','),
            status: apt.status,
            quoted_price: apt.quoted_price ? 
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(apt.quoted_price) : 'R$ 0,00',
            final_price: apt.final_price ? 
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(apt.final_price) : 'R$ 0,00',
            conversation_id: appointmentData.conversation_id || appointmentData.session_id || '',
            source: appointmentData.source || 'unknown',
            booking_method: appointmentData.booking_method || '',
            created_at: apt.created_at ? new Date(apt.created_at).toLocaleString('pt-BR') : ''
        };
    });

    // Gerar CSV
    const headers = Object.keys(csvData[0]);
    const csvContent = [
        headers.join(','),
        ...csvData.map(row => 
            headers.map(header => {
                const value = row[header];
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(',')
        )
    ].join('\n');

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `appointments-complete-updated-${timestamp}.csv`;
    
    require('fs').writeFileSync(filename, csvContent, 'utf8');
    
    return { filename, totalRecords: allAppointments.length };
}

/**
 * Função principal de validação
 */
async function main() {
    try {
        console.log('🚀 VALIDAÇÃO DA POPULAÇÃO DE APPOINTMENTS');
        console.log('='.repeat(70));
        
        // 1. Validar appointments populados
        const populatedAppointments = await validatePopulatedAppointments();
        
        // 2. Validar datas
        const dateValidation = validateAppointmentDates(populatedAppointments);
        
        // 3. Validar distribuição de status
        const statusValidation = validateStatusDistribution(populatedAppointments);
        
        // 4. Validar rastreabilidade
        const traceabilityValidation = await validateConversationTraceability(populatedAppointments);
        
        // 5. Gerar CSV atualizado
        const csvResult = await generateUpdatedAppointmentsCSV();
        
        // 6. Relatório final
        console.log('='.repeat(70));
        console.log('📊 RELATÓRIO DE VALIDAÇÃO DA POPULAÇÃO');
        console.log('='.repeat(70));
        console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
        console.log('');
        
        console.log('📊 APPOINTMENTS POPULADOS AUTOMATICAMENTE:');
        console.log(`   Total populados: ${populatedAppointments.length}`);
        console.log('');
        
        console.log('📅 VALIDAÇÃO DE DATAS:');
        console.log(`   Datas válidas (3-5 dias): ${dateValidation.validDates} (${((dateValidation.validDates/dateValidation.total)*100).toFixed(1)}%)`);
        console.log(`   Datas inválidas: ${dateValidation.invalidDates} (${((dateValidation.invalidDates/dateValidation.total)*100).toFixed(1)}%)`);
        console.log('');
        
        console.log('📊 DISTRIBUIÇÃO DE STATUS:');
        console.log(`   Completed: ${statusValidation.statusCounts.completed} (${statusValidation.statusPercentages.completed.toFixed(1)}%)`);
        console.log(`   No-show: ${statusValidation.statusCounts.no_show} (${statusValidation.statusPercentages.no_show.toFixed(1)}%)`);
        console.log(`   Cancelled: ${statusValidation.statusCounts.cancelled} (${statusValidation.statusPercentages.cancelled.toFixed(1)}%)`);
        console.log(`   Outros: ${statusValidation.statusCounts.others} (${statusValidation.statusPercentages.others.toFixed(1)}%)`);
        console.log('');
        
        console.log('🔗 RASTREABILIDADE DE CONVERSAS:');
        console.log(`   Com conversation_id: ${traceabilityValidation.withConversationId} (${((traceabilityValidation.withConversationId/populatedAppointments.length)*100).toFixed(1)}%)`);
        console.log(`   Sem conversation_id: ${traceabilityValidation.withoutConversationId}`);
        console.log(`   Conversas únicas: ${traceabilityValidation.uniqueConversations.size}`);
        console.log(`   Duplicatas: ${traceabilityValidation.duplicateConversations.length}`);
        console.log('');
        
        console.log('📁 CSV ATUALIZADO:');
        console.log(`   Arquivo: ${csvResult.filename}`);
        console.log(`   Total de appointments: ${csvResult.totalRecords}`);
        console.log('');
        
        // Status final
        const allValidationsPass = 
            dateValidation.validDates === populatedAppointments.length &&
            traceabilityValidation.withConversationId === populatedAppointments.length &&
            Math.abs(statusValidation.statusPercentages.completed - 80) < 5 &&
            Math.abs(statusValidation.statusPercentages.no_show - 10) < 5 &&
            Math.abs(statusValidation.statusPercentages.cancelled - 10) < 5;
        
        console.log(allValidationsPass ? 
            '✅ POPULAÇÃO VALIDADA COM SUCESSO - Todos os critérios atendidos!' :
            '⚠️ POPULAÇÃO COM DIVERGÊNCIAS - Revisar critérios não atendidos'
        );
        
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ Erro durante a validação:', error);
        process.exit(1);
    }
}

// Executar se for chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { main };