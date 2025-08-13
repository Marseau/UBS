/**
 * CONVERSATION OUTCOME SERVICE
 * 
 * Responsável por determinar e registrar o desfecho final de cada conversa
 * para métricas precisas e rastreabilidade completa.
 */

const { supabaseAdmin } = require('../config/database');
const { AppointmentConversationDetectorService } = require('./appointment-conversation-detector.service');

class ConversationOutcomeService {
    constructor() {
        this.appointmentDetector = new AppointmentConversationDetectorService();
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
     */
    async markAppointmentCreated(conversationId, appointmentId) {
        try {
            console.log(`✅ Marcando conversa ${conversationId} como appointment_created`);
            
            const { error } = await supabaseAdmin
                .from('conversation_history')
                .update({ 
                    conversation_outcome: 'appointment_created',
                    updated_at: new Date().toISOString()
                })
                .eq('id', conversationId);

            if (error) {
                console.error('❌ Erro ao marcar appointment_created:', error);
                return false;
            }

            console.log(`🎯 Conversa marcada como appointment_created (appointment: ${appointmentId})`);
            return true;
            
        } catch (error) {
            console.error('❌ Erro ao registrar appointment_created:', error);
            return false;
        }
    }

    /**
     * REGISTRAR OUTCOME quando conversa é abandonada por timeout
     */
    async markTimeoutAbandoned(tenantId, userId) {
        try {
            console.log(`⏰ Marcando conversas como timeout_abandoned para user ${userId}`);
            
            // Marcar todas as conversas recentes sem outcome como abandonadas
            const { error } = await supabaseAdmin
                .from('conversation_history')
                .update({ 
                    conversation_outcome: 'timeout_abandoned',
                    updated_at: new Date().toISOString()
                })
                .eq('tenant_id', tenantId)
                .eq('user_id', userId)
                .is('conversation_outcome', null)
                .gte('created_at', new Date(Date.now() - 300000).toISOString()); // Últimos 5 min

            if (error) {
                console.error('❌ Erro ao marcar timeout_abandoned:', error);
                return false;
            }

            console.log(`🎯 Conversas marcadas como timeout_abandoned`);
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
     */
    async updateConversationOutcome(conversationId, outcome) {
        if (!this.validOutcomes.includes(outcome)) {
            console.error(`❌ Outcome inválido: ${outcome}`);
            return false;
        }

        try {
            const { error } = await supabaseAdmin
                .from('conversation_history')
                .update({ 
                    conversation_outcome: outcome,
                    updated_at: new Date().toISOString()
                })
                .eq('id', conversationId);

            if (error) {
                console.error('❌ Erro ao atualizar outcome:', error);
                return false;
            }

            console.log(`🎯 Conversa ${conversationId} marcada como: ${outcome}`);
            return true;
            
        } catch (error) {
            console.error('❌ Erro ao atualizar conversation outcome:', error);
            return false;
        }
    }

    /**
     * MARCAR conversas antigas sem outcome (cleanup)
     */
    async markBookingAbandoned() {
        try {
            console.log('🔄 Marcando booking abandonados...');
            
            // Conversas com booking_request sem appointment criado há mais de 1 hora
            const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
            
            const { error } = await supabaseAdmin
                .from('conversation_history')
                .update({ conversation_outcome: 'booking_abandoned' })
                .eq('intent_detected', 'booking_request')
                .is('conversation_outcome', null)
                .lt('created_at', oneHourAgo);

            if (error) {
                console.error('❌ Erro ao marcar booking abandonados:', error);
                return false;
            }

            console.log('✅ Booking abandonados marcados');
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