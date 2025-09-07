/**
 * CONVERSATION OUTCOME SERVICE
 * 
 * Responsável por determinar e registrar o desfecho final de cada conversa
 * para métricas precisas e rastreabilidade completa.
 */

const { supabaseAdmin } = require('../config/database');
const { AppointmentConversationDetectorService } = require('./appointment-conversation-detector.service');
const { IntentOutcomeTelemetryService } = require('./intent-outcome-telemetry.service');

class ConversationOutcomeService {
    constructor() {
        this.appointmentDetector = new AppointmentConversationDetectorService();
        this.telemetryService = new IntentOutcomeTelemetryService();
        this.validOutcomes = [
            // OUTCOMES INICIAIS (primeira interação)
            'appointment_created',        // Criou novo agendamento ✅
            'info_request_fulfilled',     // Só queria informação 📋
            'business_hours_inquiry',     // Perguntou horário funcionamento 🕐
            'price_inquiry',             // Perguntou preços 💰
            'location_inquiry',          // Perguntou endereço 📍
            'booking_abandoned',         // Começou agendar mas desistiu 🔄
            'timeout_abandoned',         // Não respondeu em 60s ⏰
            'wrong_number',             // Número errado ❌
            'spam_detected',            // Spam/bot 🚫
            'test_message',             // Mensagem de teste 🧪
            
            // OUTCOMES PÓS-AGENDAMENTO (interações subsequentes)
            'appointment_rescheduled',   // Remarcou agendamento existente 📅
            'appointment_cancelled',     // Cancelou agendamento existente ❌
            'appointment_confirmed',     // Confirmou agendamento existente ✅
            'appointment_inquiry',       // Perguntou sobre agendamento existente ❓
            'appointment_modified',      // Alterou detalhes do agendamento 🔧
            'appointment_noshow_followup' // Justificou/seguiu após no_show 📞
        ];
    }

    /**
     * REGISTRAR OUTCOME quando appointment é criado
     * CENTRALIZADO: Usa updateConversationOutcome() para garantir consistência
     */
    async markAppointmentCreated(conversationId, appointmentId) {
        try {
            console.log(`✅ Marcando conversa ${conversationId} como appointment_created (appointment: ${appointmentId})`);
            
            // Centralizar na função que garante última mensagem + idempotência + telemetria
            const result = await this.updateConversationOutcome(conversationId, 'appointment_created');
            
            if (result) {
                console.log(`🎯 Appointment ${appointmentId} registrado com outcome appointment_created`);
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ Erro ao registrar appointment_created:', error);
            return false;
        }
    }

    /**
     * REGISTRAR OUTCOME quando conversa é abandonada por timeout
     * CORRIGIDO: Processa por sessão para manter "1 outcome por conversa"
     */
    async markTimeoutAbandoned(tenantId, userId) {
        try {
            console.log(`⏰ Marcando conversas como timeout_abandoned para user ${userId}`);
            
            // Buscar sessões ativas (sem outcome) para este usuário
            const { data: activeSessions, error: sessionError } = await supabaseAdmin
                .from('conversation_history')
                .select('session_id_uuid, user_id, tenant_id, MAX(id) as last_message_id')
                .eq('tenant_id', tenantId)
                .eq('user_id', userId)
                .is('conversation_outcome', null)
                .gte('created_at', new Date(Date.now() - 300000).toISOString()) // Últimos 5 min
                .group('session_id_uuid, user_id, tenant_id');

            if (sessionError || !activeSessions?.length) {
                console.log(`⚠️ Nenhuma sessão ativa para marcar como timeout_abandoned`);
                return true;
            }

            // Processar cada sessão individualmente usando updateConversationOutcome
            let processedSessions = 0;
            for (const session of activeSessions) {
                // Usar updateConversationOutcome para garantir consistência
                const result = await this.updateConversationOutcome(session.last_message_id, 'timeout_abandoned');
                
                if (result) {
                    processedSessions++;
                } else {
                    console.error(`❌ Erro ao marcar sessão ${session.session_id_uuid} como timeout_abandoned`);
                }
            }

            console.log(`🎯 ${processedSessions}/${activeSessions.length} sessões marcadas como timeout_abandoned`);
            return true;
            
        } catch (error) {
            console.error('❌ Erro ao registrar timeout_abandoned:', error);
            return false;
        }
    }

    /**
     * DETECTAR E MARCAR automaticamente baseado no conteúdo
     * VERSÃO EXPANDIDA: Considera appointments existentes
     */
    async detectAndMarkOutcome(conversationId, content, intent, confidence, tenantId, userId, phoneNumber) {
        try {
            let outcome = null;
            const contentLower = content.toLowerCase();

            // 1. SPAM DETECTION (confidence baixa)
            if (confidence < 0.3) {
                outcome = 'spam_detected';
            }
            
            // 2. WRONG NUMBER (frases típicas)
            else if (this.isWrongNumber(contentLower)) {
                outcome = 'wrong_number';
            }
            
            // 3. TEST MESSAGE (mensagens de teste)
            else if (this.isTestMessage(contentLower)) {
                outcome = 'test_message';
            }
            
            // 4. VERIFICAR SE É SOBRE APPOINTMENT EXISTENTE
            else if (tenantId && userId && phoneNumber) {
                const appointmentContext = await this.appointmentDetector.detectAppointmentContext(
                    tenantId, userId, phoneNumber, content, intent
                );
                
                if (appointmentContext.hasExistingAppointment) {
                    console.log(`🎯 Detected appointment interaction: ${appointmentContext.interactionType}`);
                    
                    // Processar ação no appointment
                    await this.appointmentDetector.processAppointmentAction(
                        appointmentContext.appointmentId,
                        appointmentContext.interactionType,
                        content // reason
                    );
                    
                    outcome = appointmentContext.suggestedOutcome;
                }
            }
            
            // 5. INFO REQUESTS específicos (se não é sobre appointment)
            if (!outcome && intent === 'info_request') {
                outcome = this.detectInfoType(contentLower);
            }
            
            // 6. BOOKING REQUEST (primeira vez ou sem appointment encontrado)
            else if (!outcome && intent === 'booking_request') {
                // Será marcado como booking_abandoned pelo timeout ou 
                // como appointment_created quando appointment for criado
                return true; // Não marcar ainda
            }

            // Registrar outcome se detectado
            if (outcome) {
                await this.updateConversationOutcome(conversationId, outcome);
                return true;
            }

            return false;
            
        } catch (error) {
            console.error('❌ Erro ao detectar outcome:', error);
            return false;
        }
    }

    /**
     * DETECTAR tipo específico de info request
     */
    detectInfoType(content) {
        const patterns = {
            'business_hours_inquiry': [
                'horário', 'funciona', 'abre', 'fecha', 'domingo', 'feriado', 'funcionamento'
            ],
            'price_inquiry': [
                'preço', 'valor', 'custa', 'quanto', 'tabela', 'orçamento', 'barato', 'caro'
            ],
            'location_inquiry': [
                'endereço', 'onde', 'localização', 'fica', 'como chegar', 'maps', 'gps'
            ]
        };

        for (const [outcome, keywords] of Object.entries(patterns)) {
            if (keywords.some(keyword => content.includes(keyword))) {
                return outcome;
            }
        }

        return 'info_request_fulfilled'; // Genérico
    }

    /**
     * DETECTAR número errado
     */
    isWrongNumber(content) {
        const wrongNumberPhrases = [
            'número errado', 'engano', 'não conheço', 'quem é', 
            'não pedi', 'pare de enviar', 'não quero'
        ];
        
        return wrongNumberPhrases.some(phrase => content.includes(phrase));
    }

    /**
     * DETECTAR mensagem de teste
     */
    isTestMessage(content) {
        const testPhrases = [
            'teste', 'test', 'testing', 'oi', 'olá', '123', 'abc'
        ];
        
        return testPhrases.includes(content.trim()) || content.length < 5;
    }

    /**
     * ATUALIZAR outcome de uma conversa específica
     * CORRIGIDO: Garante aplicação na última mensagem da sessão com idempotência
     */
    async updateConversationOutcome(conversationId, outcome) {
        if (!this.validOutcomes.includes(outcome)) {
            console.error(`❌ Outcome inválido: ${outcome}`);
            return false;
        }

        try {
            // Primeiro, buscar dados da conversa para telemetria estruturada
            const { data: conversationData, error: fetchError } = await supabaseAdmin
                .from('conversation_history')
                .select('session_id_uuid, user_id, tenant_id, conversation_outcome')
                .eq('id', conversationId)
                .single();

            if (fetchError || !conversationData) {
                console.error('❌ Erro ao buscar dados da conversa:', fetchError);
                return false;
            }

            // ✅ IDEMPOTÊNCIA: Verificar se já tem outcome
            if (conversationData.conversation_outcome) {
                console.log(`⚠️ [IDEMPOTENCIA] Conversa ${conversationId} já tem outcome: ${conversationData.conversation_outcome}`);
                return true; // Não reprocessar
            }

            // 🎯 GARANTIA: Buscar última mensagem da sessão para aplicar outcome
            const { data: lastMessage, error: lastMessageError } = await supabaseAdmin
                .from('conversation_history')
                .select('id')
                .eq('session_id_uuid', conversationData.session_id_uuid)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (lastMessageError || !lastMessage) {
                console.error('❌ Erro ao buscar última mensagem da sessão:', lastMessageError);
                return false;
            }

            // Se conversationId não é a última mensagem, aplicar na última
            const targetMessageId = lastMessage.id;
            if (conversationId !== targetMessageId) {
                console.log(`🔄 [AJUSTE] Aplicando outcome na última mensagem ${targetMessageId} em vez de ${conversationId}`);
            }

            // ✅ IDEMPOTÊNCIA RIGOROSA: Atualizar apenas se linha ainda não tem outcome
            const { data: updated, error } = await supabaseAdmin
                .from('conversation_history')
                .update({ 
                    conversation_outcome: outcome,
                    updated_at: new Date().toISOString()
                })
                .eq('id', targetMessageId)
                .is('conversation_outcome', null)
                .select('id'); // Força retorno para verificar se atualizou algo

            if (error) {
                console.error('❌ Erro ao atualizar outcome:', error);
                return false;
            }

            // ⚠️ VERIFICAÇÃO: Se nenhuma linha foi afetada, não emitir telemetria
            if (!updated || updated.length === 0) {
                console.log(`⚠️ [IDEMPOTENCIA] Nenhuma linha afetada; não emitir telemetria. Conversa ${targetMessageId} já processada.`);
                return true; // Nada a fazer, mas não é erro
            }

            console.log(`🎯 Conversa ${targetMessageId} (sessão ${conversationData.session_id_uuid}) marcada como: ${outcome}`);

            // 📊 STRUCTURED TELEMETRY: Capturar outcome finalizado com enriquecimento completo
            // SÓ EMITE se realmente atualizou uma linha
            try {
                // Para abandonment outcomes, usar recordConversationAbandoned
                if (outcome.includes('abandoned')) {
                    const reason = outcome === 'timeout_abandoned' ? 'timeout'
                                 : outcome === 'booking_abandoned' ? 'booking_flow'
                                 : 'unknown';

                    await this.telemetryService.recordConversationAbandoned({
                        session_id: conversationData.session_id_uuid,
                        tenant_id: conversationData.tenant_id,
                        user_id: conversationData.user_id,
                        conversation_id: targetMessageId,
                        reason,
                        outcome,
                        source: 'ConversationOutcomeService.updateConversationOutcome'
                    });
                    console.log(`📊 [TELEMETRY] Abandonment captured: ${outcome} [${reason}] for tenant ${conversationData.tenant_id} session ${conversationData.session_id_uuid}`);
                } else {
                    await this.telemetryService.recordOutcomeFinalized({
                        session_id: conversationData.session_id_uuid,
                        tenant_id: conversationData.tenant_id,
                        user_id: conversationData.user_id,
                        conversation_id: targetMessageId,
                        outcome_new: outcome,
                        source: 'ConversationOutcomeService.updateConversationOutcome'
                    });
                    console.log(`📊 [TELEMETRY] Outcome captured: ${outcome} for tenant ${conversationData.tenant_id} session ${conversationData.session_id_uuid}`);
                }
            } catch (telemetryError) {
                console.error('⚠️ [TELEMETRY] Failed to record outcome:', telemetryError);
            }

            return true;
            
        } catch (error) {
            console.error('❌ Erro ao atualizar conversation outcome:', error);
            return false;
        }
    }

    /**
     * MARCAR conversas antigas sem outcome (cleanup)
     * CORRIGIDO: Processa por sessão e inclui telemetria
     */
    async markBookingAbandoned() {
        try {
            console.log('🔄 Marcando booking abandonados...');
            
            // Buscar sessões com booking_request sem appointment há mais de 1 hora
            const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
            
            const { data: abandonedSessions, error: fetchError } = await supabaseAdmin
                .from('conversation_history')
                .select('session_id_uuid, user_id, tenant_id, MAX(id) as last_message_id')
                .eq('intent_detected', 'booking_request')
                .is('conversation_outcome', null)
                .lt('created_at', oneHourAgo)
                .group('session_id_uuid, user_id, tenant_id');

            if (fetchError || !abandonedSessions?.length) {
                console.log('⚠️ Nenhuma sessão de booking para marcar como abandonada');
                return true;
            }

            // Processar cada sessão individualmente usando updateConversationOutcome
            let processedSessions = 0;
            for (const session of abandonedSessions) {
                // Usar updateConversationOutcome para garantir consistência
                const result = await this.updateConversationOutcome(session.last_message_id, 'booking_abandoned');
                
                if (result) {
                    processedSessions++;
                } else {
                    console.error(`❌ Erro ao marcar sessão ${session.session_id_uuid} como booking_abandoned`);
                }
            }

            console.log(`✅ ${processedSessions}/${abandonedSessions.length} sessões marcadas como booking_abandoned`);
            return true;
            
        } catch (error) {
            console.error('❌ Erro no cleanup de booking abandonados:', error);
            return false;
        }
    }

    /**
     * OBTER estatísticas de outcomes
     */
    async getOutcomeStats(tenantId, startDate, endDate) {
        try {
            const { data, error } = await supabaseAdmin
                .from('conversation_history')
                .select('conversation_outcome')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .lte('created_at', endDate)
                .not('conversation_outcome', 'is', null);

            if (error) {
                console.error('❌ Erro ao obter stats:', error);
                return null;
            }

            // Contar por outcome
            const stats = {};
            this.validOutcomes.forEach(outcome => stats[outcome] = 0);
            
            data.forEach(row => {
                if (row.conversation_outcome) {
                    stats[row.conversation_outcome]++;
                }
            });

            return stats;
            
        } catch (error) {
            console.error('❌ Erro ao calcular outcome stats:', error);
            return null;
        }
    }
}

module.exports = { ConversationOutcomeService };