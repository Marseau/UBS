// Serviço de timeout para conversas
const { createClient } = require('@supabase/supabase-js');
const { ConversationOutcomeService } = require('./conversation-outcome.service');

class ConversationTimeoutService {
    constructor() {
        this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        this.outcomeService = new ConversationOutcomeService();
        this.activeTimeouts = new Map(); // phoneNumber -> timeoutInfo
        this.FIRST_WARNING_DELAY = 30000;  // 30 segundos
        this.ABANDON_DELAY = 30000;        // +30 segundos = 60s total
    }

    /**
     * Iniciar timeout para uma conversa
     */
    startTimeout(phoneNumber, tenantId, appointmentId = null) {
        console.log(`⏰ Iniciando timeout para ${phoneNumber}`);
        
        // Limpar timeout existente se houver
        this.clearTimeout(phoneNumber);
        
        // Primeiro timeout: 30 segundos - pergunta se ainda está lá
        const firstTimeout = setTimeout(async () => {
            await this.sendFirstWarning(phoneNumber, tenantId);
            
            // Segundo timeout: +30 segundos - abandona conversa
            const secondTimeout = setTimeout(async () => {
                await this.abandonConversation(phoneNumber, tenantId, appointmentId);
            }, this.ABANDON_DELAY);
            
            // Atualizar timeout info
            const timeoutInfo = this.activeTimeouts.get(phoneNumber);
            if (timeoutInfo) {
                timeoutInfo.secondTimeout = secondTimeout;
                timeoutInfo.stage = 'warning_sent';
            }
            
        }, this.FIRST_WARNING_DELAY);
        
        // Salvar timeout info
        this.activeTimeouts.set(phoneNumber, {
            firstTimeout,
            secondTimeout: null,
            tenantId,
            appointmentId,
            stage: 'initial',
            startTime: new Date()
        });
    }

    /**
     * Cancelar timeout (usuário respondeu)
     */
    clearTimeout(phoneNumber) {
        const timeoutInfo = this.activeTimeouts.get(phoneNumber);
        if (timeoutInfo) {
            if (timeoutInfo.firstTimeout) {
                clearTimeout(timeoutInfo.firstTimeout);
            }
            if (timeoutInfo.secondTimeout) {
                clearTimeout(timeoutInfo.secondTimeout);
            }
            this.activeTimeouts.delete(phoneNumber);
            console.log(`✅ Timeout cancelado para ${phoneNumber}`);
        }
    }

    /**
     * Resetar timeout (usuário respondeu, mas continuar monitorando)
     */
    resetTimeout(phoneNumber, tenantId, appointmentId = null) {
        this.clearTimeout(phoneNumber);
        this.startTimeout(phoneNumber, tenantId, appointmentId);
    }

    /**
     * Enviar primeiro aviso (30 segundos)
     */
    async sendFirstWarning(phoneNumber, tenantId) {
        console.log(`⚠️ Enviando primeiro aviso para ${phoneNumber}`);
        
        try {
            // Importar WhatsApp service
            const WhatsAppService = require('./whatsapp.service');
            const whatsappService = new WhatsAppService();
            
            const warningMessage = `👋 Olá! Você ainda está aí? 

Notei que você parou de responder. Se precisar de mais tempo para pensar, tudo bem! 

Responda qualquer coisa para continuarmos com seu agendamento. ⏰`;

            await whatsappService.sendTextMessage(phoneNumber, warningMessage);
            
            // Log da ação
            await this.logTimeoutAction(phoneNumber, tenantId, 'first_warning', {
                message: 'Primeiro aviso enviado após 30s de inatividade'
            });
            
        } catch (error) {
            console.error(`❌ Erro ao enviar primeiro aviso para ${phoneNumber}:`, error);
        }
    }

    /**
     * Abandonar conversa (60 segundos total)
     */
    async abandonConversation(phoneNumber, tenantId, appointmentId) {
        console.log(`🚫 Abandonando conversa para ${phoneNumber}`);
        
        try {
            // Importar WhatsApp service
            const WhatsAppService = require('./whatsapp.service');
            const whatsappService = new WhatsAppService();
            
            const abandonMessage = `😔 Encerramento por inatividade

Infelizmente, como não recebi resposta, vou encerrar nosso atendimento por falta de comunicação.

Se quiser fazer um agendamento, é só enviar uma nova mensagem! Estarei aqui para ajudar. 👋`;

            await whatsappService.sendTextMessage(phoneNumber, abandonMessage);
            
            // 🎯 MARCAR CONVERSAS COMO TIMEOUT_ABANDONED
            await this.outcomeService.markTimeoutAbandoned(tenantId, phoneNumber);
            
            // Marcar appointment como abandoned (se existir)
            if (appointmentId) {
                await this.markAppointmentAsAbandoned(appointmentId);
            }
            
            // Limpar estado da conversa
            await this.cleanupConversationState(phoneNumber, tenantId);
            
            // Log da ação
            await this.logTimeoutAction(phoneNumber, tenantId, 'abandoned', {
                message: 'Conversa abandonada após 60s de inatividade',
                appointmentId
            });
            
            // Remover timeout
            this.clearTimeout(phoneNumber);
            
        } catch (error) {
            console.error(`❌ Erro ao abandonar conversa para ${phoneNumber}:`, error);
        }
    }

    /**
     * Marcar appointment como abandoned
     */
    async markAppointmentAsAbandoned(appointmentId) {
        try {
            const { error } = await this.supabase
                .from('appointments')
                .update({
                    status: 'cancelled', // Usar cancelled até implementarmos 'abandoned'
                    updated_at: new Date().toISOString()
                })
                .eq('id', appointmentId);
            
            if (error) {
                console.error('❌ Erro ao marcar appointment como abandoned:', error);
            } else {
                console.log(`✅ Appointment ${appointmentId} marcado como abandoned`);
            }
        } catch (error) {
            console.error('❌ Erro ao atualizar appointment:', error);
        }
    }

    /**
     * Limpar estado da conversa
     */
    async cleanupConversationState(phoneNumber, tenantId) {
        try {
            // Limpar conversation_states
            const { error: stateError } = await this.supabase
                .from('conversation_states')
                .delete()
                .eq('phone_number', phoneNumber)
                .eq('tenant_id', tenantId);
            
            if (stateError) {
                console.error('❌ Erro ao limpar conversation_states:', stateError);
            }
            
            // Poderamos também limpar booking states aqui
            console.log(`🧹 Estado da conversa limpo para ${phoneNumber}`);
            
        } catch (error) {
            console.error('❌ Erro ao limpar estado da conversa:', error);
        }
    }

    /**
     * Log das ações de timeout
     */
    async logTimeoutAction(phoneNumber, tenantId, action, details = {}) {
        try {
            const { error } = await this.supabase
                .from('conversation_history')
                .insert({
                    tenant_id: tenantId,
                    phone_number: phoneNumber,
                    content: `[TIMEOUT] ${action}: ${details.message || ''}`,
                    is_from_user: false,
                    message_type: 'system',
                    conversation_context: {
                        timeout_action: action,
                        ...details
                    },
                    created_at: new Date().toISOString()
                });
            
            if (error) {
                console.error('❌ Erro ao logar ação de timeout:', error);
            }
        } catch (error) {
            console.error('❌ Erro ao criar log:', error);
        }
    }

    /**
     * Verificar se conversa tem timeout ativo
     */
    hasActiveTimeout(phoneNumber) {
        return this.activeTimeouts.has(phoneNumber);
    }

    /**
     * Obter info do timeout
     */
    getTimeoutInfo(phoneNumber) {
        return this.activeTimeouts.get(phoneNumber);
    }
}

module.exports = ConversationTimeoutService;