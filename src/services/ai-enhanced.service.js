const { EnhancedBookingFlow } = require('./agents/enhanced-booking-flow');
const { AgentFactory } = require('./agents/agent-factory');
const { logger } = require('@/utils/logger');

class AIEnhancedService {
    constructor() {
        this.enhancedBookingFlow = new EnhancedBookingFlow();
        this.agentFactory = new AgentFactory();
    }

    /**
     * Processa mensagem com fluxo de agendamento melhorado
     */
    async processMessage(message, context) {
        try {
            // Verificar se é uma resposta de botão interativo
            if (this.isButtonResponse(message)) {
                return await this.processButtonResponse(message, context);
            }
            
            // Extrair texto da mensagem
            const messageText = this.extractMessageText(message);
            
            // Detectar se é intenção de agendamento
            const bookingResponse = await this.enhancedBookingFlow.handleBookingIntent(
                messageText, 
                context, 
                this.agentFactory.getAgent(context.tenantConfig?.domain || 'other')
            );

            if (bookingResponse) {
                // É uma intenção de agendamento - usar fluxo melhorado
                return {
                    success: true,
                    message: bookingResponse.message,
                    shouldContinue: bookingResponse.shouldContinue,
                    actions: bookingResponse.actions || [],
                    data: bookingResponse.data || {},
                    whatsappButtons: bookingResponse.whatsappButtons || null
                };
            }

            // Não é agendamento - usar fluxo normal da IA
            return await this.processNormalMessage(messageText, context);

        } catch (error) {
            logger.error('Error in enhanced AI service:', error);
            return {
                success: false,
                message: 'Desculpe, tive um problema técnico. Pode tentar novamente?',
                shouldContinue: true
            };
        }
    }

    /**
     * Verifica se a mensagem é uma resposta de botão
     */
    isButtonResponse(message) {
        return message.type === 'button' || 
               (message.type === 'interactive' && message.interactive?.button_reply) ||
               (message.type === 'interactive' && message.interactive?.list_reply);
    }

    /**
     * Processa resposta de botão interativo
     */
    async processButtonResponse(message, context) {
        try {
            let buttonPayload = '';
            
            if (message.type === 'button') {
                buttonPayload = message.button?.payload || message.button?.text || '';
            } else if (message.type === 'interactive') {
                if (message.interactive?.button_reply) {
                    buttonPayload = message.interactive.button_reply.id;
                } else if (message.interactive?.list_reply) {
                    buttonPayload = message.interactive.list_reply.id;
                }
            }
            
            if (!buttonPayload) {
                return {
                    success: false,
                    message: 'Desculpe, não consegui processar sua seleção. Pode tentar novamente?',
                    shouldContinue: true
                };
            }
            
            const agent = this.agentFactory.getAgent(context.tenantConfig?.domain || 'other');
            
            // Processar seleção do botão
            const response = await this.enhancedBookingFlow.processButtonSelection(
                buttonPayload, 
                context, 
                agent
            );
            
            return {
                success: response.success,
                message: response.message,
                shouldContinue: response.shouldContinue,
                data: response.data || {},
                whatsappButtons: response.whatsappButtons || null
            };
            
        } catch (error) {
            logger.error('Error processing button response:', error);
            return {
                success: false,
                message: 'Desculpe, tive um problema ao processar sua seleção. Pode tentar novamente?',
                shouldContinue: true
            };
        }
    }

    /**
     * Processa mensagem normal (não relacionada a agendamento)
     */
    async processNormalMessage(messageText, context) {
        const agent = this.agentFactory.getAgent(context.tenantConfig?.domain || 'other');
        
        // Aqui você pode integrar com o sistema de IA existente
        // Por enquanto, retornamos uma resposta básica
        return {
            success: true,
            message: `Olá! Como posso ajudá-lo(a) hoje? 😊\n\nPosso te ajudar com:\n• 📅 Agendamentos\n• ℹ️ Informações sobre serviços\n• 💰 Preços\n• 📞 Suporte`,
            shouldContinue: true
        };
    }

    /**
     * Extrai texto da mensagem do WhatsApp
     */
    extractMessageText(message) {
        if (message.type === 'text') {
            return message.text?.body || '';
        }
        
        if (message.type === 'button') {
            return message.button?.text || message.button?.payload || '';
        }
        
        if (message.type === 'interactive') {
            if (message.interactive?.button_reply) {
                return message.interactive.button_reply.title;
            }
            if (message.interactive?.list_reply) {
                return message.interactive.list_reply.title;
            }
        }
        
        return '';
    }

    /**
     * Processa resposta do usuário sobre horários
     */
    async processTimeResponse(message, context) {
        try {
            const messageText = this.extractMessageText(message);
            const agent = this.agentFactory.getAgent(context.tenantConfig?.domain || 'other');
            
            return await this.enhancedBookingFlow.processTimePreference(
                messageText, 
                context, 
                agent
            );
        } catch (error) {
            logger.error('Error processing time response:', error);
            return {
                success: false,
                message: 'Desculpe, não entendi. Pode tentar novamente?',
                shouldContinue: true
            };
        }
    }

    /**
     * Gera exemplo de conversa melhorada
     */
    generateExampleConversation() {
        return {
            title: "Fluxo de Agendamento Melhorado",
            conversation: [
                {
                    user: "Oi! Quero agendar um corte de cabelo",
                    ai: `🎯 **Perfeito! Vou te ajudar a agendar!**

📋 **Serviços disponíveis:**
• Corte Feminino - R$ 80 (60min)
• Corte Masculino - R$ 50 (30min)
• Escova - R$ 120 (90min)
• Tintura - R$ 150 (120min)

📅 **Agora vou mostrar os horários disponíveis para você escolher:**

⏰ **Próximos horários:**
• ter, 16/01 às 09:00
• ter, 16/01 às 14:00
• ter, 16/01 às 16:00
• qua, 17/01 às 09:00
• qua, 17/01 às 14:00
• qua, 17/01 às 16:00

💬 **Responda com:**
• "Quero [data] às [horário]"
• "Prefiro [manhã/tarde/noite]"
• "Qualquer horário está bom"`
                },
                {
                    user: "Quero amanhã às 14h",
                    ai: `✅ **Perfeito! Vou agendar para você!**

📅 **Amanhã (terça-feira) às 14:00**
💇‍♀️ **Corte Feminino**
💰 **Valor:** R$ 80,00
⏱️ **Duração:** 60 minutos

👤 **Agora preciso de algumas informações:**
• Qual seu nome?
• Seu telefone para contato?
• Alguma observação especial?`
                },
                {
                    user: "Maria Silva, 11999999999",
                    ai: `✨ **AGENDAMENTO CONFIRMADO!** ✨

💇‍♀️ **Serviço:** Corte Feminino
👤 **Cliente:** Maria Silva
📅 **Data:** terça-feira, 16 de janeiro de 2024
🕐 **Horário:** 14:00
⏱️ **Duração:** 60 minutos
💰 **Valor:** R$ 80.00
🔢 **Código:** ABC12345

📍 **Dicas importantes:**
• Chegue 10 minutos antes
• Traga um documento com foto
• Para reagendar: responda esta conversa

Obrigada por escolher nosso salão! 💄✨`
                }
            ]
        };
    }

    /**
     * Gera exemplo de conversa com botões
     */
    generateButtonConversationExample() {
        return {
            title: "Fluxo de Agendamento com Botões Interativos",
            conversation: [
                {
                    user: "Oi! Quero agendar um corte de cabelo",
                    ai: `🎯 **Perfeito! Vou te ajudar a agendar!**

💇‍♀️ **Serviço:** Serviço de Beleza
💰 **Valor:** R$ 80,00
⏱️ **Duração:** 60 minutos

📅 **Clique no botão do dia desejado:**
• Ou me diga sua preferência de período
• "Prefiro manhã/tarde/noite"
• "Qualquer horário está bom"

💡 **Dica:** Após escolher o dia, vou mostrar os horários específicos!`,
                    buttons: [
                        { title: "ter 16/01", id: "date_2024-01-16" },
                        { title: "qua 17/01", id: "date_2024-01-17" },
                        { title: "🌅 Manhã", id: "period_manha" }
                    ]
                },
                {
                    user: "[Clica em 'ter 16/01']",
                    ai: `⏰ **Horários para terça-feira (16/01)**

Clique no horário desejado:

💡 **Dica:** Se nenhum horário funcionar, escolha "Outro dia"`,
                    buttons: [
                        { title: "09:00", id: "select_time:2024-01-16_09:00" },
                        { title: "14:00", id: "select_time:2024-01-16_14:00" },
                        { title: "16:00", id: "select_time:2024-01-16_16:00" },
                        { title: "📅 Outro dia", id: "other_date" }
                    ]
                },
                {
                    user: "[Clica em '14:00']",
                    ai: `✅ **Confirmar Agendamento**

📅 **Data:** terça-feira (16/01)
🕐 **Horário:** 14:00
💇‍♀️ **Serviço:** Serviço de Beleza
💰 **Valor:** R$ 80,00
⏱️ **Duração:** 60 minutos

👤 **Agora preciso de algumas informações:**
• Qual seu nome?
• Seu telefone para contato?

💬 **Responda com:** "Nome, Telefone"`,
                    buttons: [
                        { title: "✅ Confirmar", id: "confirm_booking" },
                        { title: "🔄 Trocar Horário", id: "change_time" },
                        { title: "❌ Cancelar", id: "cancel_booking" }
                    ]
                },
                {
                    user: "Maria Silva, 11999999999",
                    ai: `✨ **AGENDAMENTO CONFIRMADO!** ✨

💇‍♀️ **Serviço:** Serviço de Beleza
👤 **Cliente:** Maria Silva
📅 **Data:** terça-feira, 16 de janeiro de 2024
🕐 **Horário:** 14:00
⏱️ **Duração:** 60 minutos
💰 **Valor:** R$ 80.00
🔢 **Código:** ABC12345

📍 **Dicas importantes:**
• Chegue 10 minutos antes
• Traga um documento com foto
• Para reagendar: responda esta conversa

Obrigada por escolher nosso salão! 💄✨`
                }
            ]
        };
    }
}

module.exports = { AIEnhancedService }; 