/**
 * SCRIPT DE POPULAÇÃO: APPOINTMENTS BASEADO EM CONVERSAS EXISTENTES
 * 
 * Seguindo Context Engineering:
 * - Popula appointments linkados às 1041 conversas do conversation_history
 * - Datas: 3-5 dias após cada conversa
 * - Status: 80% completed, 10% noshow, 10% cancelled
 * - Manter rastreabilidade conversation_id → appointment
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Obter conversas únicas do conversation_history (por session_id do JSONB)
 */
async function getUniqueConversations() {
    console.log('🔍 Buscando conversas únicas do conversation_history...');
    
    const { data, error } = await supabase
        .from('conversation_history')
        .select(`
            conversation_context,
            tenant_id,
            user_id,
            created_at,
            conversation_outcome
        `)
        .not('conversation_context->session_id', 'is', null)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('❌ Erro ao buscar conversation_history:', error);
        throw error;
    }

    // Agrupar por session_id para obter conversas únicas
    const conversationMap = new Map();
    
    data.forEach(record => {
        // Extrair session_id do JSONB
        const sessionId = record.conversation_context?.session_id;
        if (!sessionId) return;
        
        const key = sessionId;
        if (!conversationMap.has(key)) {
            conversationMap.set(key, {
                session_id: sessionId,
                tenant_id: record.tenant_id,
                user_id: record.user_id,
                conversation_start: record.created_at,
                conversation_end: record.created_at,
                conversation_outcome: record.conversation_outcome
            });
        } else {
            // Atualizar data final da conversa
            const existing = conversationMap.get(key);
            if (new Date(record.created_at) > new Date(existing.conversation_end)) {
                existing.conversation_end = record.created_at;
            }
            // Atualizar outcome se não existe ou se este é mais específico
            if (!existing.conversation_outcome && record.conversation_outcome) {
                existing.conversation_outcome = record.conversation_outcome;
            }
        }
    });

    const uniqueConversations = Array.from(conversationMap.values());
    console.log(`✅ Encontradas ${uniqueConversations.length} conversas únicas`);
    
    return uniqueConversations;
}

/**
 * Obter dados auxiliares (tenants, services, etc.)
 */
async function getAuxiliaryData() {
    console.log('📊 Buscando dados auxiliares...');
    
    const [tenantsResult, servicesResult, usersResult] = await Promise.all([
        supabase.from('tenants').select('id, name, domain'),
        supabase.from('services').select('id, tenant_id, name, base_price, duration_minutes'),
        supabase.from('users').select('id, name, email, phone')
    ]);

    if (tenantsResult.error) throw tenantsResult.error;
    if (servicesResult.error) throw servicesResult.error;
    if (usersResult.error) throw usersResult.error;

    return {
        tenants: tenantsResult.data || [],
        services: servicesResult.data || [],
        users: usersResult.data || []
    };
}

/**
 * Gerar data do agendamento (3-5 dias após a conversa)
 */
function generateAppointmentDate(conversationEnd) {
    const baseDate = new Date(conversationEnd);
    const daysToAdd = 3 + Math.floor(Math.random() * 3); // 3-5 dias
    const appointmentDate = new Date(baseDate);
    appointmentDate.setDate(appointmentDate.getDate() + daysToAdd);
    
    // Hora entre 9h-18h
    const hour = 9 + Math.floor(Math.random() * 10);
    const minute = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, 45
    
    appointmentDate.setHours(hour, minute, 0, 0);
    return appointmentDate;
}

/**
 * Determinar status baseado na distribuição solicitada
 * Valores válidos do enum: pending, confirmed, in_progress, completed, cancelled, no_show, rescheduled
 */
function determineStatus(index, total) {
    const completedThreshold = Math.floor(total * 0.8);    // 80%
    const noshowThreshold = Math.floor(total * 0.9);       // 10% adicional = 90% total
    
    if (index < completedThreshold) return 'completed';
    if (index < noshowThreshold) return 'no_show';  // Corrigido: "no_show" ao invés de "noshow"
    return 'cancelled';
}

/**
 * Encontrar serviço apropriado para o tenant
 */
function findServiceForTenant(tenantId, services) {
    const tenantServices = services.filter(s => s.tenant_id === tenantId);
    if (tenantServices.length > 0) {
        return tenantServices[Math.floor(Math.random() * tenantServices.length)];
    }
    
    // Fallback: usar qualquer serviço
    return services[Math.floor(Math.random() * services.length)];
}

/**
 * Calcular preços baseados no serviço e status
 */
function calculatePrices(service, status) {
    const basePrice = service?.base_price || 100.00;
    
    let quotedPrice = basePrice;
    let finalPrice = basePrice;
    
    // Adicionar variação de ±20%
    const variation = 0.8 + (Math.random() * 0.4); // 0.8 - 1.2
    quotedPrice = Math.round(basePrice * variation * 100) / 100;
    
    if (status === 'completed') {
        finalPrice = quotedPrice;
    } else if (status === 'cancelled') {
        finalPrice = 0; // Cancelados não pagam
    } else if (status === 'no_show') {
        finalPrice = quotedPrice * 0.5; // Taxa de no-show 50%
    } else {
        finalPrice = quotedPrice; // Outros status mantêm preço cotado
    }
    
    return { quotedPrice, finalPrice };
}

/**
 * Gerar appointment_data JSONB
 */
function generateAppointmentData(conversation, service, prices) {
    return {
        conversation_id: conversation.session_id,
        session_id: conversation.session_id,
        source: 'whatsapp_ai',
        booking_method: 'conversational_ai',
        import_source: 'conversation_history_population',
        quoted_price: prices.quotedPrice,
        final_price: prices.finalPrice,
        service_details: {
            name: service?.name || 'Consulta Geral',
            duration: service?.duration_minutes || 60
        },
        population_metadata: {
            generated_at: new Date().toISOString(),
            based_on_conversation: conversation.session_id,
            conversation_end: conversation.conversation_end
        }
    };
}

/**
 * Popular appointments baseado nas conversas
 */
async function populateAppointments() {
    console.log('🚀 Iniciando população de appointments...');
    
    try {
        // 1. Obter dados necessários
        const conversations = await getUniqueConversations();
        const { tenants, services, users } = await getAuxiliaryData();
        
        console.log(`📊 Processando ${conversations.length} conversas...`);
        console.log(`📊 Disponíveis: ${tenants.length} tenants, ${services.length} serviços, ${users.length} usuários`);
        
        // 2. Gerar appointments
        const appointmentsToInsert = [];
        
        conversations.forEach((conversation, index) => {
            const service = findServiceForTenant(conversation.tenant_id, services);
            const status = determineStatus(index, conversations.length);
            const prices = calculatePrices(service, status);
            const appointmentDate = generateAppointmentDate(conversation.conversation_end);
            
            // Calcular end_time baseado na duração do serviço
            const endTime = new Date(appointmentDate);
            endTime.setMinutes(endTime.getMinutes() + (service?.duration_minutes || 60));
            
            const appointment = {
                tenant_id: conversation.tenant_id,
                user_id: conversation.user_id,
                service_id: service?.id || null,
                start_time: appointmentDate.toISOString(),
                end_time: endTime.toISOString(),
                timezone: 'America/Sao_Paulo',
                status: status,
                quoted_price: prices.quotedPrice,
                final_price: prices.finalPrice,
                currency: 'BRL',
                appointment_data: generateAppointmentData(conversation, service, prices),
                customer_notes: `Agendamento gerado automaticamente baseado na conversa ${conversation.session_id}`,
                internal_notes: `População automática | Status: ${status} | Conversa: ${conversation.session_id}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            appointmentsToInsert.push(appointment);
        });
        
        console.log(`📅 Gerados ${appointmentsToInsert.length} appointments para inserção`);
        
        // 3. Inserir em lotes de 100
        const batchSize = 100;
        let insertedCount = 0;
        
        for (let i = 0; i < appointmentsToInsert.length; i += batchSize) {
            const batch = appointmentsToInsert.slice(i, i + batchSize);
            
            console.log(`📥 Inserindo lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(appointmentsToInsert.length/batchSize)} (${batch.length} registros)...`);
            
            const { data, error } = await supabase
                .from('appointments')
                .insert(batch)
                .select('id');
            
            if (error) {
                console.error('❌ Erro ao inserir lote:', error);
                console.error('Primeiro registro do lote com erro:', JSON.stringify(batch[0], null, 2));
                throw error;
            }
            
            insertedCount += data?.length || 0;
            console.log(`✅ Lote inserido: ${data?.length || 0} registros`);
        }
        
        // 4. Relatório final
        console.log('='.repeat(70));
        console.log('📊 RELATÓRIO DE POPULAÇÃO DE APPOINTMENTS');
        console.log('='.repeat(70));
        console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
        console.log(`🔄 Conversas processadas: ${conversations.length}`);
        console.log(`📥 Appointments inseridos: ${insertedCount}`);
        console.log('');
        
        // Estatísticas de status
        const statusCounts = {
            completed: Math.floor(conversations.length * 0.8),
            no_show: Math.floor(conversations.length * 0.1),
            cancelled: conversations.length - Math.floor(conversations.length * 0.8) - Math.floor(conversations.length * 0.1)
        };
        
        console.log('📊 DISTRIBUIÇÃO DE STATUS:');
        console.log(`   Completed: ${statusCounts.completed} (${((statusCounts.completed/conversations.length)*100).toFixed(1)}%)`);
        console.log(`   No-show: ${statusCounts.no_show} (${((statusCounts.no_show/conversations.length)*100).toFixed(1)}%)`);
        console.log(`   Cancelled: ${statusCounts.cancelled} (${((statusCounts.cancelled/conversations.length)*100).toFixed(1)}%)`);
        console.log('');
        
        console.log('🔗 RASTREABILIDADE:');
        console.log('   Todos os appointments têm conversation_id no appointment_data');
        console.log('   Campo session_id preservado para compatibilidade');
        console.log('   Datas: 3-5 dias após fim de cada conversa');
        console.log('');
        
        console.log('✅ POPULAÇÃO CONCLUÍDA COM SUCESSO!');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ Erro durante a população:', error);
        process.exit(1);
    }
}

/**
 * Validar se já existem appointments para evitar duplicação
 */
async function checkExistingAppointments() {
    console.log('🔍 Verificando appointments existentes...');
    
    const { count, error } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true });
    
    if (error) {
        console.error('❌ Erro ao verificar appointments:', error);
        throw error;
    }
    
    console.log(`📊 Appointments existentes: ${count || 0}`);
    
    if (count && count > 0) {
        console.log('⚠️ ATENÇÃO: Já existem appointments na tabela.');
        console.log('Este script irá ADICIONAR novos appointments baseados nas conversas.');
        console.log('Para evitar duplicação, considere limpar a tabela primeiro se necessário.');
        console.log('');
        
        // Aguardar confirmação implícita (script continua automaticamente)
        console.log('🔄 Continuando em 3 segundos...');
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    return count || 0;
}

/**
 * Função principal
 */
async function main() {
    try {
        console.log('🚀 POPULAÇÃO DE APPOINTMENTS BASEADO EM CONVERSAS');
        console.log('='.repeat(60));
        
        await checkExistingAppointments();
        await populateAppointments();
        
    } catch (error) {
        console.error('❌ Erro na execução:', error);
        process.exit(1);
    }
}

// Executar se for chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { main };