const { supabase } = require('@/config/database');
const { logger } = require('@/utils/logger');

class EnhancedBookingFlow {
    constructor() {
        this.bookingStates = new Map();
    }

    /**
     * Analisa a intenção de agendamento e responde de forma proativa
     */
    async handleBookingIntent(message, context, agent) {
        try {
            const intent = this.detectBookingIntent(message);
            
            if (!intent.hasIntent) {
                return null; // Não é intenção de agendamento
            }

            const bookingState = this.getOrCreateBookingState(context.phoneNumber);
            
            // Se já temos informações suficientes, tentar agendar diretamente
            if (bookingState.serviceType && bookingState.preferredDate) {
                return await this.attemptDirectBooking(bookingState, context, agent);
            }

            // Se temos o tipo de serviço, oferecer horários
            if (bookingState.serviceType && !bookingState.preferredDate) {
                return await this.offerAvailableSlots(bookingState, context, agent);
            }

            // Primeira interação - coletar informações básicas
            return await this.collectServiceInfo(intent, context, agent);

        } catch (error) {
            logger.error('Error in enhanced booking flow:', error);
            return {
                success: false,
                message: 'Desculpe, tive um problema técnico. Pode tentar novamente?',
                shouldContinue: true
            };
        }
    }

    /**
     * Detecta se a mensagem expressa intenção de agendamento
     */
    detectBookingIntent(message) {
        const text = message.toLowerCase();
        const bookingKeywords = [
            'agendar', 'marcar', 'agendamento', 'marcação', 'horário',
            'quero', 'gostaria', 'preciso', 'desejo', 'fazer',
            'corte', 'consulta', 'sessão', 'aula', 'treino', 'serviço'
        ];

        const serviceKeywords = {
            beauty: ['corte', 'cabelo', 'beleza', 'salão', 'escova', 'tintura', 'manicure', 'pedicure'],
            healthcare: ['consulta', 'terapia', 'psicólogo', 'psiquiatra', 'sessão', 'tratamento'],
            education: ['aula', 'professor', 'estudar', 'matemática', 'português', 'inglês'],
            legal: ['advogado', 'consulta jurídica', 'processo', 'documento', 'orientação'],
            sports: ['treino', 'academia', 'personal', 'exercício', 'musculação'],
            consulting: ['consultoria', 'empresa', 'negócio', 'estratégia', 'mentoria']
        };

        const hasIntent = bookingKeywords.some(keyword => text.includes(keyword));
        let detectedService = null;
        let detectedDomain = 'other';

        // Detectar tipo de serviço
        for (const [domain, keywords] of Object.entries(serviceKeywords)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                detectedService = keywords.find(keyword => text.includes(keyword));
                detectedDomain = domain;
                break;
            }
        }

        return {
            hasIntent,
            detectedService,
            detectedDomain,
            originalMessage: message
        };
    }

    /**
     * Coleta informações básicas do serviço
     */
    async collectServiceInfo(intent, context, agent) {
        const bookingState = this.getOrCreateBookingState(context.phoneNumber);
        bookingState.serviceType = intent.detectedService;
        bookingState.domain = intent.detectedDomain;

        // Buscar serviços disponíveis no tenant
        const { data: services } = await supabase
            .from('services')
            .select('id, name, description, duration_minutes, base_price')
            .eq('tenant_id', context.tenantId)
            .eq('is_active', true)
            .limit(5);

        if (!services || services.length === 0) {
            return {
                success: false,
                message: 'Desculpe, não encontrei serviços disponíveis no momento. Entre em contato conosco!',
                shouldContinue: true
            };
        }

        const serviceOptions = services.map(service => 
            `• ${service.name} - R$ ${service.base_price} (${service.duration_minutes}min)`
        ).join('\n');

        return {
            success: true,
            message: `🎯 **Perfeito! Vou te ajudar a agendar!**\n\n📋 **Serviços disponíveis:**\n${serviceOptions}\n\n📅 **Agora vou mostrar os horários disponíveis para você escolher:**\n\n${await this.generateQuickAvailabilityMessage(context, agent)}`,
            shouldContinue: true,
            actions: ['show_availability']
        };
    }

    /**
     * Oferece horários disponíveis de forma proativa com botões interativos
     */
    async offerAvailableSlots(bookingState, context, agent) {
        try {
            // Chamar função de disponibilidade do agente
            const availabilityFunction = this.getAvailabilityFunction(agent);
            
            if (!availabilityFunction) {
                return {
                    success: false,
                    message: 'Desculpe, não consegui verificar a disponibilidade. Pode tentar novamente?',
                    shouldContinue: true
                };
            }

            const availabilityResult = await availabilityFunction({
                service_type: bookingState.serviceType,
                preferred_date: null,
                preferred_time: null,
                flexibility: 'moderadamente_flexivel'
            }, context);

            if (!availabilityResult.success) {
                return availabilityResult;
            }

            const slots = availabilityResult.data.available_slots || [];
            
            // Gerar botões interativos
            const interactiveButtons = this.generateInteractiveButtons(slots, bookingState);
            
            // Gerar mensagem com botões
            const messageWithButtons = this.formatMessageWithButtons(slots, bookingState);

            return {
                success: true,
                message: messageWithButtons,
                shouldContinue: true,
                data: {
                    available_slots: slots,
                    booking_state: bookingState,
                    interactive_buttons: interactiveButtons
                },
                // Estrutura para botões do WhatsApp
                whatsappButtons: interactiveButtons
            };

        } catch (error) {
            logger.error('Error offering available slots:', error);
            return {
                success: false,
                message: 'Desculpe, tive um problema ao verificar os horários. Pode tentar novamente?',
                shouldContinue: true
            };
        }
    }

    /**
     * Gera botões interativos para horários disponíveis
     */
    generateInteractiveButtons(slots, bookingState) {
        const buttons = [];
        const groupedSlots = this.groupSlotsByDate(slots);
        
        // Limitar a 3 botões principais (limite do WhatsApp)
        let buttonCount = 0;
        const maxButtons = 3;
        
        for (const [date, times] of Object.entries(groupedSlots)) {
            if (buttonCount >= maxButtons) break;
            
            const dateObj = new Date(date);
            const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' });
            const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            
            // Criar botão para cada data com horários
            const buttonText = `${dayName} ${dateStr}`;
            const buttonPayload = `select_date:${date}`;
            
            buttons.push({
                type: 'reply',
                reply: {
                    id: `date_${date}`,
                    title: buttonText
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
     * Gera lista interativa (List Message) para mais opções
     */
    generateInteractiveList(slots, bookingState) {
        const sections = [];
        const groupedSlots = this.groupSlotsByDate(slots);
        
        for (const [date, times] of Object.entries(groupedSlots)) {
            const dateObj = new Date(date);
            const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
            const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            
            const rows = times.slice(0, 5).map(time => ({
                id: `slot_${date}_${time}`,
                title: `${time}`,
                description: `${dayName} (${dateStr})`
            }));
            
            sections.push({
                title: `${dayName} - ${dateStr}`,
                rows: rows
            });
        }
        
        return {
            button: 'Escolher Horário',
            body: 'Selecione o horário que melhor funciona para você:',
            sections: sections
        };
    }

    /**
     * Formata mensagem com botões interativos
     */
    formatMessageWithButtons(slots, bookingState) {
        if (!slots || slots.length === 0) {
            return '❌ **Nenhum horário disponível no momento.**\n\n💡 **Sugestões:**\n• Tente uma data diferente\n• Entre em contato conosco\n• Verifique nossos horários de funcionamento';
        }

        const serviceInfo = this.getServiceInfo(bookingState.serviceType, bookingState.domain);
        
        let message = `🎯 **Horários Disponíveis**\n\n`;
        message += `💇‍♀️ **Serviço:** ${serviceInfo.name}\n`;
        message += `💰 **Valor:** R$ ${serviceInfo.price}\n`;
        message += `⏱️ **Duração:** ${serviceInfo.duration} minutos\n\n`;
        
        message += `📅 **Clique no botão do dia desejado:**\n`;
        message += `• Ou me diga sua preferência de período\n`;
        message += `• "Prefiro manhã/tarde/noite"\n`;
        message += `• "Qualquer horário está bom"\n\n`;
        
        message += `💡 **Dica:** Após escolher o dia, vou mostrar os horários específicos!`;

        return message;
    }

    /**
     * Tenta fazer agendamento direto se temos informações suficientes
     */
    async attemptDirectBooking(bookingState, context, agent) {
        try {
            // Verificar se o horário escolhido ainda está disponível
            const isAvailable = await this.checkSlotAvailability(
                bookingState.preferredDate,
                bookingState.preferredTime,
                context.tenantId
            );

            if (!isAvailable) {
                return await this.offerAvailableSlots(bookingState, context, agent);
            }

            // Tentar agendar diretamente
            const bookingFunction = this.getBookingFunction(agent);
            
            if (!bookingFunction) {
                return {
                    success: false,
                    message: 'Desculpe, não consegui processar o agendamento. Pode tentar novamente?',
                    shouldContinue: true
                };
            }

            const bookingResult = await bookingFunction({
                ...bookingState,
                date: bookingState.preferredDate,
                time: bookingState.preferredTime
            }, context);

            if (bookingResult.success) {
                // Limpar estado após agendamento bem-sucedido
                this.clearBookingState(context.phoneNumber);
            }

            return bookingResult;

        } catch (error) {
            logger.error('Error in direct booking:', error);
            return {
                success: false,
                message: 'Desculpe, tive um problema ao fazer o agendamento. Pode tentar novamente?',
                shouldContinue: true
            };
        }
    }

    /**
     * Gera mensagem rápida de disponibilidade
     */
    async generateQuickAvailabilityMessage(context, agent) {
        try {
            const today = new Date();
            const quickSlots = [];
            
            // Gerar 3-4 horários para hoje e amanhã
            for (let i = 1; i <= 2; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() + i);
                const dateStr = date.toLocaleDateString('pt-BR', { 
                    weekday: 'short', 
                    day: '2-digit', 
                    month: '2-digit' 
                });
                
                const times = ['09:00', '14:00', '16:00'];
                for (const time of times) {
                    quickSlots.push(`${dateStr} às ${time}`);
                }
            }

            return `⏰ **Próximos horários:**\n${quickSlots.slice(0, 6).map(slot => `• ${slot}`).join('\n')}\n\n💬 **Responda com:**\n• "Quero [data] às [horário]"\n• "Prefiro [manhã/tarde/noite]"\n• "Qualquer horário está bom"`;

        } catch (error) {
            return '⏰ **Horários disponíveis:**\n• Amanhã às 09:00, 14:00, 16:00\n• Quinta às 09:00, 14:00, 16:00\n\n💬 **Escolha um horário ou me diga sua preferência!**';
        }
    }

    /**
     * Formata slots disponíveis de forma amigável
     */
    formatAvailableSlots(slots) {
        if (!slots || slots.length === 0) {
            return '❌ **Nenhum horário disponível no momento.**\n\n💡 **Sugestões:**\n• Tente uma data diferente\n• Entre em contato conosco\n• Verifique nossos horários de funcionamento';
        }

        const groupedSlots = this.groupSlotsByDate(slots);
        let formatted = '';

        for (const [date, times] of Object.entries(groupedSlots)) {
            const dateObj = new Date(date);
            const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
            const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            
            formatted += `📅 **${dayName} (${dateStr}):**\n`;
            formatted += times.map(time => `• ${time}`).join(' | ') + '\n\n';
        }

        return formatted.trim();
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
     * Verifica se um slot específico está disponível
     */
    async checkSlotAvailability(date, time, tenantId) {
        try {
            const startTime = `${date}T${time}:00`;
            const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();

            const { data: conflicts } = await supabase
                .from('appointments')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('status', 'confirmed')
                .or(`start_time.lt.${endTime},end_time.gt.${startTime}`)
                .limit(1);

            return !conflicts || conflicts.length === 0;

        } catch (error) {
            logger.error('Error checking slot availability:', error);
            return false;
        }
    }

    /**
     * Obtém função de disponibilidade do agente
     */
    getAvailabilityFunction(agent) {
        const availabilityFunctions = [
            'check_service_availability',
            'check_availability', 
            'check_tutoring_availability',
            'check_training_availability',
            'check_legal_availability',
            'check_consulting_availability'
        ];

        for (const funcName of availabilityFunctions) {
            if (agent.functions && agent.functions.find(f => f.name === funcName)) {
                return agent.functions.find(f => f.name === funcName).handler;
            }
        }

        return null;
    }

    /**
     * Obtém função de agendamento do agente
     */
    getBookingFunction(agent) {
        const bookingFunctions = [
            'book_general_appointment',
            'book_beauty_service',
            'book_session',
            'book_tutoring_session',
            'book_training_session',
            'book_legal_consultation',
            'book_consulting_session'
        ];

        for (const funcName of bookingFunctions) {
            if (agent.functions && agent.functions.find(f => f.name === funcName)) {
                return agent.functions.find(f => f.name === funcName).handler;
            }
        }

        return null;
    }

    /**
     * Gerencia estado de agendamento por usuário
     */
    getOrCreateBookingState(phoneNumber) {
        if (!this.bookingStates.has(phoneNumber)) {
            this.bookingStates.set(phoneNumber, {
                serviceType: null,
                preferredDate: null,
                preferredTime: null,
                clientName: null,
                contactInfo: null,
                specialRequests: null,
                domain: null,
                createdAt: new Date()
            });
        }
        return this.bookingStates.get(phoneNumber);
    }

    /**
     * Atualiza estado de agendamento
     */
    updateBookingState(phoneNumber, updates) {
        const state = this.getOrCreateBookingState(phoneNumber);
        Object.assign(state, updates);
        this.bookingStates.set(phoneNumber, state);
    }

    /**
     * Limpa estado de agendamento
     */
    clearBookingState(phoneNumber) {
        this.bookingStates.delete(phoneNumber);
    }

    /**
     * Processa resposta do usuário sobre horários
     */
    async processTimePreference(message, context, agent) {
        const bookingState = this.getOrCreateBookingState(context.phoneNumber);
        const text = message.toLowerCase();

        // Extrair data e hora da mensagem
        const dateTimeMatch = this.extractDateTime(text);
        if (dateTimeMatch) {
            this.updateBookingState(context.phoneNumber, {
                preferredDate: dateTimeMatch.date,
                preferredTime: dateTimeMatch.time
            });
            
            return await this.attemptDirectBooking(bookingState, context, agent);
        }

        // Processar preferências de período
        const periodPreference = this.extractPeriodPreference(text);
        if (periodPreference) {
            return await this.showSlotsForPeriod(periodPreference, context, agent);
        }

        // Resposta genérica
        return {
            success: true,
            message: 'Entendi! Vou mostrar mais opções de horários para você escolher.',
            shouldContinue: true,
            actions: ['show_more_availability']
        };
    }

    /**
     * Extrai data e hora da mensagem
     */
    extractDateTime(text) {
        // Padrões comuns de data e hora
        const patterns = [
            /(hoje|amanhã|depois de amanhã)/i,
            /(\d{1,2})\/(\d{1,2})/,
            /(\d{1,2})h/,
            /(\d{1,2}):(\d{2})/
        ];

        // Implementar lógica de extração
        // Retornar { date: 'YYYY-MM-DD', time: 'HH:mm' }
        return null;
    }

    /**
     * Extrai preferência de período
     */
    extractPeriodPreference(text) {
        if (text.includes('manhã') || text.includes('manha')) return 'manha';
        if (text.includes('tarde')) return 'tarde';
        if (text.includes('noite')) return 'noite';
        if (text.includes('flexível') || text.includes('flexivel')) return 'flexivel';
        return null;
    }

    /**
     * Oferece slots filtrados por período
     */
    async offerFilteredSlots(period, context, agent) {
        // Implementar filtro por período
        return await this.showSlotsForPeriod(period, context, agent);
    }

    /**
     * Processa seleção de botão do usuário
     */
    async processButtonSelection(buttonPayload, context, agent) {
        try {
            const bookingState = this.getOrCreateBookingState(context.phoneNumber);
            
            if (buttonPayload.startsWith('select_date:')) {
                const selectedDate = buttonPayload.replace('select_date:', '');
                return await this.showTimeSlotsForDate(selectedDate, context, agent);
            }
            
            if (buttonPayload.startsWith('select_time:')) {
                const [date, time] = buttonPayload.replace('select_time:', '').split('_');
                return await this.confirmAppointment(date, time, context, agent);
            }
            
            if (buttonPayload.startsWith('period_')) {
                const period = buttonPayload.replace('period_', '');
                return await this.showSlotsForPeriod(period, context, agent);
            }
            
            if (buttonPayload === 'confirm_booking') {
                return await this.finalizeBooking(context, agent);
            }
            
            return {
                success: false,
                message: 'Desculpe, não entendi sua seleção. Pode tentar novamente?',
                shouldContinue: true
            };
            
        } catch (error) {
            logger.error('Error processing button selection:', error);
            return {
                success: false,
                message: 'Desculpe, tive um problema. Pode tentar novamente?',
                shouldContinue: true
            };
        }
    }

    /**
     * Mostra horários específicos para uma data selecionada
     */
    async showTimeSlotsForDate(selectedDate, context, agent) {
        try {
            const bookingState = this.getOrCreateBookingState(context.phoneNumber);
            const availabilityFunction = this.getAvailabilityFunction(agent);
            
            const availabilityResult = await availabilityFunction({
                service_type: bookingState.serviceType,
                preferred_date: selectedDate,
                preferred_time: null,
                flexibility: 'moderadamente_flexivel'
            }, context);

            if (!availabilityResult.success) {
                return availabilityResult;
            }

            const slots = availabilityResult.data.available_slots || [];
            const dateObj = new Date(selectedDate);
            const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
            const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            
            // Gerar botões para horários específicos
            const timeButtons = slots.slice(0, 3).map(slot => ({
                type: 'reply',
                reply: {
                    id: `select_time:${selectedDate}_${slot.time}`,
                    title: `${slot.time}`
                }
            }));
            
            // Adicionar botão "Ver mais horários"
            if (slots.length > 3) {
                timeButtons.push({
                    type: 'reply',
                    reply: {
                        id: `more_times:${selectedDate}`,
                        title: 'Ver mais horários'
                    }
                });
            }
            
            // Adicionar botão "Outro dia"
            timeButtons.push({
                type: 'reply',
                reply: {
                    id: 'other_date',
                    title: '📅 Outro dia'
                }
            });

            const message = `⏰ **Horários para ${dayName} (${dateStr})**\n\n`;
            message += `Clique no horário desejado:\n\n`;
            message += `💡 **Dica:** Se nenhum horário funcionar, escolha "Outro dia"`;

            return {
                success: true,
                message: message,
                shouldContinue: true,
                data: {
                    selected_date: selectedDate,
                    available_times: slots,
                    booking_state: bookingState
                },
                whatsappButtons: timeButtons
            };

        } catch (error) {
            logger.error('Error showing time slots:', error);
            return {
                success: false,
                message: 'Desculpe, tive um problema ao mostrar os horários. Pode tentar novamente?',
                shouldContinue: true
            };
        }
    }

    /**
     * Confirma agendamento após seleção de horário
     */
    async confirmAppointment(selectedDate, selectedTime, context, agent) {
        try {
            const bookingState = this.getOrCreateBookingState(context.phoneNumber);
            
            // Atualizar estado com data e hora selecionadas
            this.updateBookingState(context.phoneNumber, {
                preferredDate: selectedDate,
                preferredTime: selectedTime
            });
            
            const dateObj = new Date(selectedDate);
            const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
            const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            
            const serviceInfo = this.getServiceInfo(bookingState.serviceType, bookingState.domain);
            
            const message = `✅ **Confirmar Agendamento**\n\n`;
            message += `📅 **Data:** ${dayName} (${dateStr})\n`;
            message += `🕐 **Horário:** ${selectedTime}\n`;
            message += `💇‍♀️ **Serviço:** ${serviceInfo.name}\n`;
            message += `💰 **Valor:** R$ ${serviceInfo.price}\n`;
            message += `⏱️ **Duração:** ${serviceInfo.duration} minutos\n\n`;
            message += `👤 **Agora preciso de algumas informações:**\n`;
            message += `• Qual seu nome?\n`;
            message += `• Seu telefone para contato?\n\n`;
            message += `💬 **Responda com:** "Nome, Telefone"`;

            const confirmButtons = [
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

            return {
                success: true,
                message: message,
                shouldContinue: true,
                data: {
                    selected_date: selectedDate,
                    selected_time: selectedTime,
                    booking_state: bookingState
                },
                whatsappButtons: confirmButtons
            };

        } catch (error) {
            logger.error('Error confirming appointment:', error);
            return {
                success: false,
                message: 'Desculpe, tive um problema. Pode tentar novamente?',
                shouldContinue: true
            };
        }
    }

    /**
     * Mostra slots para um período específico
     */
    async showSlotsForPeriod(period, context, agent) {
        try {
            const bookingState = this.getOrCreateBookingState(context.phoneNumber);
            const availabilityFunction = this.getAvailabilityFunction(agent);
            
            const availabilityResult = await availabilityFunction({
                service_type: bookingState.serviceType,
                preferred_date: null,
                preferred_time: null,
                flexibility: 'moderadamente_flexivel'
            }, context);

            if (!availabilityResult.success) {
                return availabilityResult;
            }

            const allSlots = availabilityResult.data.available_slots || [];
            
            // Filtrar slots por período
            const periodSlots = this.filterSlotsByPeriod(allSlots, period);
            
            if (periodSlots.length === 0) {
                return {
                    success: true,
                    message: `❌ **Nenhum horário disponível no período ${period}.**\n\n💡 **Sugestões:**\n• Tente outro período\n• Escolha "Qualquer horário"\n• Entre em contato conosco`,
                    shouldContinue: true
                };
            }
            
            // Gerar botões para os primeiros horários do período
            const periodButtons = periodSlots.slice(0, 3).map(slot => {
                const dateObj = new Date(slot.date);
                const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' });
                const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                
                return {
                    type: 'reply',
                    reply: {
                        id: `select_time:${slot.date}_${slot.time}`,
                        title: `${dayName} ${dateStr} - ${slot.time}`
                    }
                };
            });
            
            // Adicionar botão "Ver mais"
            if (periodSlots.length > 3) {
                periodButtons.push({
                    type: 'reply',
                    reply: {
                        id: `more_period:${period}`,
                        title: 'Ver mais horários'
                    }
                });
            }

            const periodNames = {
                'manha': '🌅 Manhã',
                'tarde': '🌞 Tarde', 
                'noite': '🌙 Noite'
            };

            const message = `⏰ **Horários - ${periodNames[period] || period}**\n\n`;
            message += `Encontrei ${periodSlots.length} horários disponíveis.\n`;
            message += `Clique no horário desejado:`;

            return {
                success: true,
                message: message,
                shouldContinue: true,
                data: {
                    period: period,
                    available_slots: periodSlots,
                    booking_state: bookingState
                },
                whatsappButtons: periodButtons
            };

        } catch (error) {
            logger.error('Error showing period slots:', error);
            return {
                success: false,
                message: 'Desculpe, tive um problema. Pode tentar novamente?',
                shouldContinue: true
            };
        }
    }

    /**
     * Filtra slots por período do dia
     */
    filterSlotsByPeriod(slots, period) {
        const periodRanges = {
            'manha': { start: 6, end: 12 },
            'tarde': { start: 12, end: 18 },
            'noite': { start: 18, end: 22 }
        };
        
        const range = periodRanges[period];
        if (!range) return slots;
        
        return slots.filter(slot => {
            const hour = parseInt(slot.time.split(':')[0]);
            return hour >= range.start && hour < range.end;
        });
    }

    /**
     * Obtém informações do serviço
     */
    getServiceInfo(serviceType, domain) {
        const serviceDefaults = {
            beauty: {
                name: 'Serviço de Beleza',
                price: '80,00',
                duration: 60
            },
            healthcare: {
                name: 'Consulta',
                price: '150,00', 
                duration: 50
            },
            education: {
                name: 'Aula',
                price: '100,00',
                duration: 60
            },
            legal: {
                name: 'Consulta Jurídica',
                price: '200,00',
                duration: 60
            },
            sports: {
                name: 'Treino',
                price: '120,00',
                duration: 60
            },
            consulting: {
                name: 'Consultoria',
                price: '300,00',
                duration: 90
            }
        };
        
        return serviceDefaults[domain] || {
            name: 'Serviço',
            price: '100,00',
            duration: 60
        };
    }
}

module.exports = { EnhancedBookingFlow }; 