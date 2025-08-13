/**
 * APPOINTMENT CONVERSATION DETECTOR SERVICE
 * 
 * Detecta se uma conversa é sobre um agendamento existente.
 * Essencial para cobrança correta por conversa e rastreamento completo da jornada.
 */

const { supabaseAdmin } = require('../config/database');

class AppointmentConversationDetectorService {
    constructor() {
        this.keywords = {
            reschedule: [
                'remarcar', 'reagendar', 'mudar', 'alterar', 'trocar', 'outro dia', 
                'outro horário', 'transferir', 'adiar', 'antecipar'
            ],
            cancel: [
                'cancelar', 'desmarcar', 'não quero mais', 'desistir', 'não vou', 
                'não posso', 'emergência', 'imprevisto'
            ],
            confirm: [
                'confirmar', 'manter', 'tá bom', 'ok', 'certo', 'combinado', 
                'está mantido', 'vou sim', 'estarei lá'
            ],
            inquiry: [
                'meu agendamento', 'que horas', 'que dia', 'quando', 'onde', 
                'endereço', 'lembrar', 'qual horário', 'ainda vale'
            ],
            modify: [
                'incluir', 'adicionar', 'tirar', 'sem', 'com', 'mais', 'menos',
                'diferente', 'outro serviço', 'mudar serviço'
            ]
        };
    }

    /**
     * DETECTAR se conversa é sobre appointment existente
     */
    async detectAppointmentContext(tenantId, userId, phoneNumber, messageContent, intent) {
        try {
            console.log(`🔍 Detectando contexto de appointment para ${phoneNumber}`);
            
            // 1. Verificar se usuário tem appointments ativos/recentes (últimos 30 dias)
            const existingAppointment = await this.findRecentAppointment(tenantId, userId, phoneNumber);
            
            if (!existingAppointment) {
                console.log('📋 Nenhum appointment encontrado - conversa inicial');
                return { hasExistingAppointment: false, appointmentId: null, suggestedOutcome: null };
            }

            // 2. Verificar se appointment é passado
            const now = new Date();
            const appointmentTime = new Date(existingAppointment.start_time);
            const isPast = appointmentTime < now;

            // 3. Analisar intent e conteúdo para determinar tipo de interação
            const interactionType = this.analyzeInteractionType(
                messageContent, 
                intent, 
                existingAppointment.status,
                isPast
            );
            
            console.log(`🎯 Appointment existente encontrado: ${existingAppointment.id}`);
            console.log(`   Status: ${existingAppointment.status}, Passado: ${isPast}`);
            console.log(`   Tipo interação: ${interactionType}`);
            
            return {
                hasExistingAppointment: true,
                appointmentId: existingAppointment.id,
                appointmentStatus: existingAppointment.status,
                isPast: isPast,
                suggestedOutcome: this.mapInteractionToOutcome(interactionType),
                interactionType
            };
            
        } catch (error) {
            console.error('❌ Erro ao detectar contexto de appointment:', error);
            return { hasExistingAppointment: false, appointmentId: null, suggestedOutcome: null };
        }
    }

    /**
     * BUSCAR appointment por CHAVE (tenant + user + phone)
     * LÓGICA CORRETA: Por chave única, não por tempo (futuro/passado)
     */
    async findRecentAppointment(tenantId, userId, phoneNumber) {
        try {
            console.log(`🔑 Buscando appointment por CHAVE: ${tenantId}+${userId}+${phoneNumber}`);

            const { data, error } = await supabaseAdmin
                .from('appointments')
                .select('id, status, start_time, end_time, created_at, appointment_data')
                .eq('tenant_id', tenantId)
                .or(`user_id.eq.${userId},appointment_data->>phone.eq.${phoneNumber}`)
                .not('status', 'eq', 'cancelled') // Só excluir cancelados
                .order('start_time', { ascending: false }) // Mais recente primeiro
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
                console.error('❌ Erro ao buscar appointment por chave:', error);
                return null;
            }

            if (data) {
                const now = new Date();
                const appointmentTime = new Date(data.start_time);
                const isPast = appointmentTime < now;
                
                console.log(`✅ Appointment encontrado: ${data.id}`);
                console.log(`   📅 Data: ${data.start_time}`);
                console.log(`   📊 Status: ${data.status}`);
                console.log(`   ⏰ É passado: ${isPast ? 'SIM' : 'NÃO'}`);
                
                // 🎯 MARCAR COMO NO_SHOW se é passado e ainda está confirmed
                if (isPast && data.status === 'confirmed') {
                    console.log(`🚨 Appointment passado ainda confirmed - marcando como no_show`);
                    await this.markAppointmentAsNoShow(data.id);
                    data.status = 'no_show'; // Atualizar status local
                }
                
                return data;
            } else {
                console.log(`📋 Nenhum appointment encontrado para chave: ${tenantId}+${userId}+${phoneNumber}`);
            }

            return null;
            
        } catch (error) {
            console.error('❌ Erro na busca de appointment por chave:', error);
            return null;
        }
    }

    /**
     * MARCAR appointment como no_show automaticamente
     */
    async markAppointmentAsNoShow(appointmentId) {
        try {
            console.log(`🚨 Marcando appointment ${appointmentId} como no_show automaticamente`);
            
            const { error } = await supabaseAdmin
                .from('appointments')
                .update({
                    status: 'no_show',
                    updated_at: new Date().toISOString(),
                    appointment_data: supabaseAdmin.raw(`
                        COALESCE(appointment_data, '{}') || 
                        '{"auto_noshow_at": "${new Date().toISOString()}", "auto_noshow_reason": "Marcado automaticamente - appointment passou do horário"}'::jsonb
                    `)
                })
                .eq('id', appointmentId);

            if (error) {
                console.error('❌ Erro ao marcar como no_show:', error);
                return false;
            }

            console.log(`✅ Appointment ${appointmentId} marcado como no_show`);
            return true;
            
        } catch (error) {
            console.error('❌ Erro ao executar markAppointmentAsNoShow:', error);
            return false;
        }
    }

    /**
     * ANALISAR tipo de interação baseado no conteúdo
     * VERSÃO EXPANDIDA: Considera appointments passados (no_show)
     */
    analyzeInteractionType(messageContent, intent, appointmentStatus, isPast) {
        const contentLower = messageContent.toLowerCase();
        
        // 🎯 LÓGICA ESPECIAL: Appointment passado (no_show)
        if (isPast && appointmentStatus === 'no_show') {
            // Cliente ligando após no_show
            if (intent === 'booking_request' || this.containsKeywords(contentLower, this.keywords.reschedule)) {
                return 'reschedule_after_noshow'; // Criar NOVO appointment
            }
            
            // Palavras de justificativa/desculpa
            const justifyKeywords = [
                'desculpa', 'perdão', 'imprevisto', 'emergência', 'atrasado',
                'trânsito', 'problema', 'não consegui', 'esqueci', 'justificar'
            ];
            
            if (this.containsKeywords(contentLower, justifyKeywords)) {
                return 'justify_noshow'; // Tenant deve entrar em contato
            }
            
            return 'justify_noshow'; // Default para no_show
        }
        
        // 🎯 LÓGICA NORMAL: Appointment futuro ou presente
        
        // 1. Prioridade para intent detectado pela IA
        if (intent === 'booking_request') {
            if (this.containsKeywords(contentLower, this.keywords.reschedule)) {
                return 'reschedule';
            }
            return 'reschedule'; // Assume remarcar se já tem appointment
        }

        // 2. Análise por palavras-chave
        if (this.containsKeywords(contentLower, this.keywords.cancel)) {
            return 'cancel';
        }
        
        if (this.containsKeywords(contentLower, this.keywords.reschedule)) {
            return 'reschedule';
        }
        
        if (this.containsKeywords(contentLower, this.keywords.confirm)) {
            return 'confirm';
        }
        
        if (this.containsKeywords(contentLower, this.keywords.modify)) {
            return 'modify';
        }
        
        if (this.containsKeywords(contentLower, this.keywords.inquiry)) {
            return 'inquiry';
        }

        // 3. Fallback - assumir que é pergunta sobre appointment
        return 'inquiry';
    }

    /**
     * VERIFICAR se conteúdo contém palavras-chave
     */
    containsKeywords(content, keywords) {
        return keywords.some(keyword => content.includes(keyword));
    }

    /**
     * MAPEAR tipo de interação para outcome
     * VERSÃO EXPANDIDA: Inclui casos pós no_show
     */
    mapInteractionToOutcome(interactionType) {
        const mapping = {
            'reschedule': 'appointment_rescheduled',
            'cancel': 'appointment_cancelled', 
            'confirm': 'appointment_confirmed',
            'inquiry': 'appointment_inquiry',
            'modify': 'appointment_modified',
            
            // 🎯 NOVOS: Pós no_show
            'reschedule_after_noshow': 'appointment_created', // Novo appointment
            'justify_noshow': 'appointment_noshow_followup'  // Justificativa
        };
        
        return mapping[interactionType] || 'appointment_inquiry';
    }

    /**
     * PROCESSAR ação no appointment baseado na interação
     */
    async processAppointmentAction(appointmentId, interactionType, reason = null) {
        try {
            console.log(`🔧 Processando ação ${interactionType} no appointment ${appointmentId}`);
            
            let newStatus = null;
            let updateData = {
                updated_at: new Date().toISOString()
            };

            switch (interactionType) {
                case 'reschedule':
                    newStatus = 'rescheduled';
                    updateData.appointment_data = supabaseAdmin.raw(`
                        COALESCE(appointment_data, '{}') || 
                        '{"rescheduled_at": "${new Date().toISOString()}", "reschedule_reason": "${reason || 'Cliente solicitou remarcar'}"}'::jsonb
                    `);
                    break;
                    
                case 'cancel':
                    newStatus = 'cancelled';
                    updateData.cancelled_at = new Date().toISOString();
                    updateData.cancellation_reason = reason || 'Cancelado pelo cliente via WhatsApp';
                    break;
                    
                case 'confirm':
                    // Manter status atual, apenas adicionar confirmação
                    updateData.appointment_data = supabaseAdmin.raw(`
                        COALESCE(appointment_data, '{}') || 
                        '{"confirmed_at": "${new Date().toISOString()}", "confirmation_method": "whatsapp"}'::jsonb
                    `);
                    break;
                    
                case 'modify':
                    updateData.appointment_data = supabaseAdmin.raw(`
                        COALESCE(appointment_data, '{}') || 
                        '{"modified_at": "${new Date().toISOString()}", "modification_reason": "${reason || 'Cliente solicitou alteração'}"}'::jsonb
                    `);
                    break;
            }

            // Aplicar status se necessário
            if (newStatus) {
                updateData.status = newStatus;
            }

            // Atualizar appointment
            const { data, error } = await supabaseAdmin
                .from('appointments')
                .update(updateData)
                .eq('id', appointmentId)
                .select()
                .single();

            if (error) {
                console.error('❌ Erro ao atualizar appointment:', error);
                return { success: false, error: error.message };
            }

            console.log(`✅ Appointment ${appointmentId} atualizado: ${interactionType}`);
            return { success: true, appointment: data, action: interactionType };
            
        } catch (error) {
            console.error('❌ Erro ao processar ação do appointment:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * OBTER estatísticas de interações pós-agendamento
     */
    async getPostAppointmentStats(tenantId, startDate, endDate) {
        try {
            const { data, error } = await supabaseAdmin
                .from('conversation_history')
                .select('conversation_outcome')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .lte('created_at', endDate)
                .in('conversation_outcome', [
                    'appointment_rescheduled',
                    'appointment_cancelled', 
                    'appointment_confirmed',
                    'appointment_inquiry',
                    'appointment_modified'
                ]);

            if (error) {
                console.error('❌ Erro ao obter stats pós-agendamento:', error);
                return null;
            }

            // Contar por tipo
            const stats = {
                appointment_rescheduled: 0,
                appointment_cancelled: 0,
                appointment_confirmed: 0,
                appointment_inquiry: 0,
                appointment_modified: 0,
                total_post_appointment: 0
            };

            data.forEach(row => {
                if (row.conversation_outcome && stats.hasOwnProperty(row.conversation_outcome)) {
                    stats[row.conversation_outcome]++;
                    stats.total_post_appointment++;
                }
            });

            return stats;
            
        } catch (error) {
            console.error('❌ Erro ao calcular stats pós-agendamento:', error);
            return null;
        }
    }
}

module.exports = { AppointmentConversationDetectorService };