const axios = require('axios');
const { logger } = require('@/utils/logger');

class WhatsAppButtonService {
    constructor(config) {
        this.config = {
            accessToken: config.accessToken,
            phoneNumberId: config.phoneNumberId,
            version: config.version || 'v18.0',
            baseUrl: `https://graph.facebook.com/${config.version || 'v18.0'}`,
            ...config
        };
    }

    /**
     * Envia mensagem com botões interativos
     */
    async sendInteractiveMessage(to, message, buttons) {
        try {
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: {
                        text: message
                    },
                    action: {
                        buttons: buttons
                    }
                }
            };

            const response = await this.sendMessage(payload);
            logger.info(`Interactive message sent to ${to}`, { buttons: buttons.length });
            return response;

        } catch (error) {
            logger.error('Error sending interactive message:', error);
            throw error;
        }
    }

    /**
     * Envia lista interativa (List Message)
     */
    async sendListMessage(to, listData) {
        try {
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'interactive',
                interactive: {
                    type: 'list',
                    body: {
                        text: listData.body
                    },
                    action: {
                        button: listData.button,
                        sections: listData.sections
                    }
                }
            };

            const response = await this.sendMessage(payload);
            logger.info(`List message sent to ${to}`, { sections: listData.sections.length });
            return response;

        } catch (error) {
            logger.error('Error sending list message:', error);
            throw error;
        }
    }

    /**
     * Envia mensagem de texto simples
     */
    async sendTextMessage(to, text) {
        try {
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'text',
                text: {
                    body: text
                }
            };

            const response = await this.sendMessage(payload);
            logger.info(`Text message sent to ${to}`);
            return response;

        } catch (error) {
            logger.error('Error sending text message:', error);
            throw error;
        }
    }

    /**
     * Envia mensagem com botões ou texto baseado na resposta da IA
     */
    async sendAIResponse(to, aiResponse) {
        try {
            // Se tem botões, enviar mensagem interativa
            if (aiResponse.whatsappButtons && aiResponse.whatsappButtons.length > 0) {
                return await this.sendInteractiveMessage(
                    to, 
                    aiResponse.message, 
                    aiResponse.whatsappButtons
                );
            }
            
            // Se tem lista interativa
            if (aiResponse.data?.interactive_list) {
                return await this.sendListMessage(
                    to, 
                    aiResponse.data.interactive_list
                );
            }
            
            // Caso contrário, enviar texto simples
            return await this.sendTextMessage(to, aiResponse.message);

        } catch (error) {
            logger.error('Error sending AI response:', error);
            throw error;
        }
    }

    /**
     * Envia mensagem para API do WhatsApp
     */
    async sendMessage(payload) {
        try {
            const url = `${this.config.baseUrl}/${this.config.phoneNumberId}/messages`;
            
            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;

        } catch (error) {
            logger.error('WhatsApp API error:', {
                status: error.response?.status,
                data: error.response?.data,
                payload: payload
            });
            throw error;
        }
    }

    /**
     * Gera botões para horários disponíveis
     */
    generateTimeButtons(slots, maxButtons = 3) {
        const buttons = [];
        
        // Agrupar slots por data
        const groupedSlots = this.groupSlotsByDate(slots);
        
        let buttonCount = 0;
        
        for (const [date, times] of Object.entries(groupedSlots)) {
            if (buttonCount >= maxButtons) break;
            
            const dateObj = new Date(date);
            const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' });
            const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            
            buttons.push({
                type: 'reply',
                reply: {
                    id: `date_${date}`,
                    title: `${dayName} ${dateStr}`
                }
            });
            
            buttonCount++;
        }
        
        // Adicionar botões de período se ainda houver espaço
        if (buttonCount < maxButtons) {
            buttons.push({
                type: 'reply',
                reply: {
                    id: 'period_manha',
                    title: '🌅 Manhã'
                }
            });
            buttonCount++;
        }
        
        if (buttonCount < maxButtons) {
            buttons.push({
                type: 'reply',
                reply: {
                    id: 'period_tarde',
                    title: '🌞 Tarde'
                }
            });
            buttonCount++;
        }
        
        if (buttonCount < maxButtons) {
            buttons.push({
                type: 'reply',
                reply: {
                    id: 'period_noite',
                    title: '🌙 Noite'
                }
            });
        }
        
        return buttons;
    }

    /**
     * Gera botões para horários específicos de uma data
     */
    generateTimeSlotButtons(date, times, maxButtons = 3) {
        const buttons = [];
        
        // Botões para horários
        times.slice(0, maxButtons).forEach(time => {
            buttons.push({
                type: 'reply',
                reply: {
                    id: `select_time:${date}_${time}`,
                    title: time
                }
            });
        });
        
        // Botão "Ver mais" se houver mais horários
        if (times.length > maxButtons) {
            buttons.push({
                type: 'reply',
                reply: {
                    id: `more_times:${date}`,
                    title: 'Ver mais horários'
                }
            });
        }
        
        // Botão "Outro dia"
        buttons.push({
            type: 'reply',
            reply: {
                id: 'other_date',
                title: '📅 Outro dia'
            }
        });
        
        return buttons;
    }

    /**
     * Gera botões de confirmação
     */
    generateConfirmationButtons() {
        return [
            {
                type: 'reply',
                reply: {
                    id: 'confirm_booking',
                    title: '✅ Confirmar'
                }
            },
            {
                type: 'reply',
                reply: {
                    id: 'change_time',
                    title: '🔄 Trocar Horário'
                }
            },
            {
                type: 'reply',
                reply: {
                    id: 'cancel_booking',
                    title: '❌ Cancelar'
                }
            }
        ];
    }

    /**
     * Agrupa slots por data
     */
    groupSlotsByDate(slots) {
        const grouped = {};
        
        slots.forEach(slot => {
            const date = slot.date;
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(slot.time);
        });
        
        return grouped;
    }

    /**
     * Valida se os botões estão no formato correto
     */
    validateButtons(buttons) {
        if (!Array.isArray(buttons)) {
            throw new Error('Buttons must be an array');
        }
        
        if (buttons.length > 3) {
            throw new Error('Maximum 3 buttons allowed');
        }
        
        buttons.forEach((button, index) => {
            if (!button.type || button.type !== 'reply') {
                throw new Error(`Button ${index} must have type 'reply'`);
            }
            
            if (!button.reply || !button.reply.id || !button.reply.title) {
                throw new Error(`Button ${index} must have reply.id and reply.title`);
            }
            
            if (button.reply.title.length > 20) {
                throw new Error(`Button ${index} title too long (max 20 characters)`);
            }
        });
        
        return true;
    }

    /**
     * Exemplo de uso completo
     */
    async exampleUsage() {
        const exampleButtons = [
            {
                type: 'reply',
                reply: {
                    id: 'date_2024-01-16',
                    title: 'ter 16/01'
                }
            },
            {
                type: 'reply',
                reply: {
                    id: 'date_2024-01-17',
                    title: 'qua 17/01'
                }
            },
            {
                type: 'reply',
                reply: {
                    id: 'period_manha',
                    title: '🌅 Manhã'
                }
            }
        ];

        const message = `🎯 **Perfeito! Vou te ajudar a agendar!**

💇‍♀️ **Serviço:** Serviço de Beleza
💰 **Valor:** R$ 80,00
⏱️ **Duração:** 60 minutos

📅 **Clique no botão do dia desejado:**
• Ou me diga sua preferência de período
• "Prefiro manhã/tarde/noite"
• "Qualquer horário está bom"

💡 **Dica:** Após escolher o dia, vou mostrar os horários específicos!`;

        try {
            // Validar botões
            this.validateButtons(exampleButtons);
            
            // Enviar mensagem com botões
            const result = await this.sendInteractiveMessage(
                '{{TEST_PHONE_NUMBER}}', 
                message, 
                exampleButtons
            );
            
            logger.info('Example message sent successfully', result);
            return result;
            
        } catch (error) {
            logger.error('Example usage failed:', error);
            throw error;
        }
    }
}

module.exports = { WhatsAppButtonService }; 