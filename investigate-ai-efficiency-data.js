/**
 * INVESTIGAÇÃO: AI ASSISTANT EFFICIENCY
 * 
 * Verificar relação entre:
 * - conversation_history.conversation_context->>'session_id'
 * - appointments (como identificar se veio de IA)
 * - Estrutura dos dados para calcular eficiência
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateAIEfficiencyData() {
    console.log('🔍 INVESTIGAÇÃO: AI ASSISTANT EFFICIENCY DATA');
    console.log('='.repeat(70));
    
    try {
        // 1. Analisar conversation_history - session_id
        console.log('💬 ANÁLISE CONVERSATION_HISTORY:');
        console.log('-'.repeat(50));
        
        const { data: conversations, error: convError } = await supabase
            .from('conversation_history')
            .select('id, conversation_context, tenant_id, created_at')
            .limit(10)
            .order('created_at', { ascending: false });
        
        if (convError) {
            console.error('❌ Erro conversation_history:', convError);
        } else if (conversations && conversations.length > 0) {
            console.log(`📊 Total sample: ${conversations.length} conversations`);
            console.log('');
            console.log('🔍 Estrutura conversation_context (primeiros 3):');
            
            conversations.slice(0, 3).forEach((conv, i) => {
                console.log(`${i + 1}. ID: ${conv.id}`);
                console.log(`   Tenant: ${conv.tenant_id}`);
                console.log(`   Created: ${new Date(conv.created_at).toLocaleDateString('pt-BR')}`);
                if (conv.conversation_context) {
                    console.log(`   Context keys: ${Object.keys(conv.conversation_context).join(', ')}`);
                    if (conv.conversation_context.session_id) {
                        console.log(`   Session ID: ${conv.conversation_context.session_id}`);
                    }
                } else {
                    console.log('   Context: null');
                }
                console.log('');
            });
            
            // Contar sessions únicas
            const sessionIds = new Set();
            conversations.forEach(conv => {
                if (conv.conversation_context?.session_id) {
                    sessionIds.add(conv.conversation_context.session_id);
                }
            });
            console.log(`🔢 Sessions únicas encontradas: ${sessionIds.size}`);
        }
        
        // 2. Analisar appointments - campos de origem/IA
        console.log('');
        console.log('📅 ANÁLISE APPOINTMENTS - CAMPOS DE ORIGEM:');
        console.log('-'.repeat(50));
        
        const { data: appointments, error: apptError } = await supabase
            .from('appointments')
            .select('id, appointment_data, customer_notes, tenant_id, created_at, start_time')
            .limit(10)
            .order('created_at', { ascending: false });
        
        if (apptError) {
            console.error('❌ Erro appointments:', apptError);
        } else if (appointments && appointments.length > 0) {
            console.log(`📊 Total sample: ${appointments.length} appointments`);
            console.log('');
            console.log('🔍 Estrutura appointment_data (primeiros 3):');
            
            appointments.slice(0, 3).forEach((apt, i) => {
                console.log(`${i + 1}. ID: ${apt.id}`);
                console.log(`   Tenant: ${apt.tenant_id}`);
                console.log(`   Created: ${new Date(apt.created_at).toLocaleDateString('pt-BR')}`);
                console.log(`   Start: ${new Date(apt.start_time).toLocaleDateString('pt-BR')}`);
                
                if (apt.appointment_data) {
                    console.log(`   Data keys: ${Object.keys(apt.appointment_data).join(', ')}`);
                    
                    // Procurar campos relacionados a IA/conversa
                    const relevantFields = ['conversation_id', 'session_id', 'source', 'ai_generated', 'chat_origin'];
                    relevantFields.forEach(field => {
                        if (apt.appointment_data[field]) {
                            console.log(`   ${field}: ${apt.appointment_data[field]}`);
                        }
                    });
                } else {
                    console.log('   appointment_data: null');
                }
                
                if (apt.customer_notes) {
                    console.log(`   Customer notes: ${apt.customer_notes.substring(0, 100)}...`);
                }
                console.log('');
            });
        }
        
        // 3. Tentar encontrar conexão session_id -> appointment
        console.log('🔗 BUSCA DE CONEXÕES SESSION_ID <-> APPOINTMENT:');
        console.log('-'.repeat(50));
        
        // Buscar alguns session_ids de conversation_history
        const { data: sampleConversations } = await supabase
            .from('conversation_history')
            .select('conversation_context, tenant_id')
            .limit(50);
        
        if (sampleConversations) {
            const sampleSessionIds = [];
            sampleConversations.forEach(conv => {
                if (conv.conversation_context?.session_id) {
                    sampleSessionIds.push({
                        sessionId: conv.conversation_context.session_id,
                        tenantId: conv.tenant_id
                    });
                }
            });
            
            console.log(`🔍 Testando ${Math.min(5, sampleSessionIds.length)} session_ids...`);
            
            for (let i = 0; i < Math.min(5, sampleSessionIds.length); i++) {
                const { sessionId, tenantId } = sampleSessionIds[i];
                
                // Buscar appointments que podem estar relacionados
                const { data: relatedAppointments } = await supabase
                    .from('appointments')
                    .select('id, appointment_data, customer_notes')
                    .eq('tenant_id', tenantId);
                
                let found = false;
                if (relatedAppointments) {
                    relatedAppointments.forEach(apt => {
                        // Verificar se session_id aparece em appointment_data ou customer_notes
                        const dataStr = JSON.stringify(apt.appointment_data || {});
                        const notesStr = apt.customer_notes || '';
                        
                        if (dataStr.includes(sessionId) || notesStr.includes(sessionId)) {
                            console.log(`✅ MATCH encontrado!`);
                            console.log(`   Session ID: ${sessionId}`);
                            console.log(`   Appointment ID: ${apt.id}`);
                            console.log(`   Tenant: ${tenantId}`);
                            found = true;
                        }
                    });
                }
                
                if (!found) {
                    console.log(`❌ Session ${sessionId.substring(0, 8)}... não encontrado em appointments`);
                }
            }
        }
        
        // 4. Análise estatística geral
        console.log('');
        console.log('📊 ANÁLISE ESTATÍSTICA GERAL:');
        console.log('-'.repeat(50));
        
        // Total conversations vs appointments por tenant
        const { data: allConversations } = await supabase
            .from('conversation_history')
            .select('tenant_id, conversation_context');
        
        const { data: allAppointments } = await supabase
            .from('appointments')
            .select('tenant_id');
        
        if (allConversations && allAppointments) {
            // Agrupar por tenant
            const tenantStats = {};
            
            // Contar conversas por tenant
            allConversations.forEach(conv => {
                if (!tenantStats[conv.tenant_id]) {
                    tenantStats[conv.tenant_id] = { conversations: 0, sessions: new Set(), appointments: 0 };
                }
                tenantStats[conv.tenant_id].conversations++;
                
                if (conv.conversation_context?.session_id) {
                    tenantStats[conv.tenant_id].sessions.add(conv.conversation_context.session_id);
                }
            });
            
            // Contar appointments por tenant
            allAppointments.forEach(apt => {
                if (tenantStats[apt.tenant_id]) {
                    tenantStats[apt.tenant_id].appointments++;
                }
            });
            
            console.log('🏢 Conversas vs Appointments por Tenant:');
            Object.entries(tenantStats)
                .sort((a, b) => b[1].conversations - a[1].conversations)
                .slice(0, 5)
                .forEach(([tenantId, stats]) => {
                    const sessionsCount = stats.sessions.size;
                    const potentialEfficiency = stats.appointments > 0 && sessionsCount > 0 
                        ? (stats.appointments / sessionsCount * 100).toFixed(1)
                        : '0.0';
                    
                    console.log(`   ${tenantId}:`);
                    console.log(`      Conversas: ${stats.conversations}`);
                    console.log(`      Sessions únicas: ${sessionsCount}`);
                    console.log(`      Appointments: ${stats.appointments}`);
                    console.log(`      Eficiência potencial: ${potentialEfficiency}%`);
                });
        }
        
        console.log('');
        console.log('✅ INVESTIGAÇÃO CONCLUÍDA');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ Erro durante investigação:', error);
    }
}

investigateAIEfficiencyData().catch(console.error);