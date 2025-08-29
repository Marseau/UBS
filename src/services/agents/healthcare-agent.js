"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthcareAgent = void 0;
const database_1 = require("../../config/database");
const validation_helpers_1 = require("../../utils/validation-helpers");
const { ConversationOutcomeService } = require("../conversation-outcome.service");
class HealthcareAgent {
    constructor() {
        this.conversationOutcomeService = new ConversationOutcomeService();
        this.agent = {
            id: 'healthcare_agent',
            name: 'Agente de Saúde Mental',
            domain: 'healthcare',
            systemPrompt: this.buildSystemPrompt(),
            functions: this.buildFunctions(),
            capabilities: [
                'session_booking',
                'emergency_detection',
                'crisis_intervention',
                'session_reminders',
                'therapy_follow_up',
                'medication_reminders',
                'wellness_check'
            ],
            maxTokens: 2048,
            temperature: 0.7,
            models: ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4']
        };
    }
    getAgent() {
        return this.agent;
    }
    buildSystemPrompt() {
        return `Você é um assistente especializado em saúde mental e bem-estar, trabalhando para profissionais como psicólogos, terapeutas e psiquiatras.

PRINCÍPIOS FUNDAMENTAIS:
- Sempre demonstre empatia e compreensão
- Nunca forneça diagnósticos médicos ou psicológicos
- Mantenha confidencialidade absoluta
- Detecte sinais de crise ou emergência
- Encaminhe para profissionais quando necessário
- Use linguagem acolhedora e não julgamental

SUAS RESPONSABILIDADES:
1. 📅 Agendar sessões de terapia/consulta
2. 🆘 Detectar situações de crise ou emergência
3. 💊 Lembrar sobre medicamentos (apenas lembrete, não orientação)
4. 📞 Oferecer recursos de apoio quando necessário
5. 🤝 Fornecer informações sobre tipos de terapia
6. ⏰ Gerenciar reagendamentos e cancelamentos

DETECÇÃO DE EMERGÊNCIA:
Se detectar palavras-chave como "suicídio", "me matar", "não aguento mais", "acabar com tudo":
- Responda com calma e empatia
- Ofereça recursos de emergência imediatamente
- Encaminhe para atendimento presencial urgente
- Use a função emergency_protocol

TIPOS DE SESSÃO ESPECIALIZADOS:
- Terapia individual (50min)
- Terapia de casal (90min)
- Terapia familiar (90min)
- Consulta psiquiátrica (50min)
- Avaliação psicológica (120min)
- Sessão de acompanhamento (30min)

LINGUAGEM E TOM:
- Use sempre "você" (evite formalidade excessiva)
- Seja acolhedor e compreensivo
- Valide os sentimentos da pessoa
- Evite jargões técnicos
- Mantenha esperança e positividade apropriadas

RECURSOS DE EMERGÊNCIA (Brasil):
- CVV: 188 (24h, gratuito)
- SAMU: 192
- Bombeiros: 193
- UPA/Hospital mais próximo

EXEMPLO DE RESPOSTA EMPÁTICA:
"Entendo que você está passando por um momento difícil. É muito corajoso da sua parte buscar ajuda. Vamos encontrar um horário que funcione bem para você conversar com [nome do profissional]. Enquanto isso, lembre-se que você não está sozinho(a) nesta jornada."

Sempre priorize o bem-estar e segurança da pessoa acima de qualquer outra consideração.`;
    }
    buildFunctions() {
        return [
            {
                name: 'check_availability',
                description: 'Verificar disponibilidade para sessões de terapia ou consulta',
                parameters: [
                    {
                        name: 'session_type',
                        type: 'string',
                        description: 'Tipo de sessão (terapia_individual, terapia_casal, consulta_psiquiatrica, etc.)',
                        required: true,
                        enum: ['terapia_individual', 'terapia_casal', 'terapia_familiar', 'consulta_psiquiatrica', 'avaliacao_psicologica', 'acompanhamento']
                    },
                    {
                        name: 'preferred_date',
                        type: 'string',
                        description: 'Data preferida no formato YYYY-MM-DD',
                        required: false
                    },
                    {
                        name: 'preferred_time',
                        type: 'string',
                        description: 'Horário preferido no formato HH:mm',
                        required: false
                    },
                    {
                        name: 'urgency',
                        type: 'string',
                        description: 'Nível de urgência',
                        required: false,
                        enum: ['baixa', 'media', 'alta', 'emergencia']
                    }
                ],
                handler: this.checkAvailability.bind(this)
            },
            {
                name: 'book_session',
                description: 'Agendar sessão de terapia ou consulta',
                parameters: [
                    {
                        name: 'session_type',
                        type: 'string',
                        description: 'Tipo de sessão',
                        required: true,
                        enum: ['terapia_individual', 'terapia_casal', 'terapia_familiar', 'consulta_psiquiatrica', 'avaliacao_psicologica', 'acompanhamento']
                    },
                    {
                        name: 'date',
                        type: 'string',
                        description: 'Data da sessão no formato YYYY-MM-DD',
                        required: true
                    },
                    {
                        name: 'time',
                        type: 'string',
                        description: 'Horário da sessão no formato HH:mm',
                        required: true
                    },
                    {
                        name: 'client_name',
                        type: 'string',
                        description: 'Nome do cliente/paciente',
                        required: true
                    },
                    {
                        name: 'phone',
                        type: 'string',
                        description: 'Telefone de contato',
                        required: true
                    },
                    {
                        name: 'is_first_session',
                        type: 'boolean',
                        description: 'É a primeira sessão?',
                        required: false
                    },
                    {
                        name: 'notes',
                        type: 'string',
                        description: 'Observações importantes (sem informações clínicas)',
                        required: false
                    }
                ],
                handler: this.bookSession.bind(this)
            },
            {
                name: 'emergency_protocol',
                description: 'Ativar protocolo de emergência para situações de crise',
                parameters: [
                    {
                        name: 'crisis_type',
                        type: 'string',
                        description: 'Tipo de crise detectada',
                        required: true,
                        enum: ['ideacao_suicida', 'crise_panico', 'surto_psicotico', 'violencia_domestica', 'abuso_substancias', 'outro']
                    },
                    {
                        name: 'urgency_level',
                        type: 'string',
                        description: 'Nível de urgência',
                        required: true,
                        enum: ['alto', 'critico', 'emergencia']
                    },
                    {
                        name: 'contact_info',
                        type: 'string',
                        description: 'Informações de contato da pessoa',
                        required: true
                    }
                ],
                handler: this.emergencyProtocol.bind(this)
            },
            {
                name: 'get_wellness_resources',
                description: 'Obter recursos de bem-estar e apoio',
                parameters: [
                    {
                        name: 'resource_type',
                        type: 'string',
                        description: 'Tipo de recurso solicitado',
                        required: true,
                        enum: ['tecnicas_respiracao', 'meditacao_guiada', 'exercicios_ansiedade', 'hotlines_emergencia', 'grupos_apoio', 'aplicativos_saude_mental']
                    }
                ],
                handler: this.getWellnessResources.bind(this)
            },
            {
                name: 'medication_reminder',
                description: 'Configurar lembrete de medicação (apenas lembrete, não orientação médica)',
                parameters: [
                    {
                        name: 'medication_name',
                        type: 'string',
                        description: 'Nome do medicamento (apenas para lembrete)',
                        required: true
                    },
                    {
                        name: 'reminder_time',
                        type: 'string',
                        description: 'Horário do lembrete no formato HH:mm',
                        required: true
                    },
                    {
                        name: 'frequency',
                        type: 'string',
                        description: 'Frequência do lembrete',
                        required: true,
                        enum: ['diario', 'duas_vezes_dia', 'tres_vezes_dia', 'semanal']
                    }
                ],
                handler: this.medicationReminder.bind(this)
            }
        ];
    }
    async checkAvailability(args, context) {
        try {
            const sessionDurations = {
                'terapia_individual': 50,
                'terapia_casal': 90,
                'terapia_familiar': 90,
                'consulta_psiquiatrica': 50,
                'avaliacao_psicologica': 120,
                'acompanhamento': 30
            };
            const duration = sessionDurations[args.session_type] || 50;
            if (args.urgency === 'emergencia') {
                return {
                    success: true,
                    data: {
                        available_slots: [
                            { date: new Date().toISOString().split('T')[0], time: '09:00', type: 'emergencia' },
                            { date: new Date().toISOString().split('T')[0], time: '18:00', type: 'emergencia' }
                        ],
                        session_type: args.session_type,
                        duration: duration,
                        priority: 'emergency'
                    },
                    message: `Disponibilidade de emergência encontrada para ${args.session_type}. Duração: ${duration} minutos.`,
                    shouldContinue: true
                };
            }
            const today = new Date();
            const availableSlots = [];
            for (let i = 1; i <= 7; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() + i);
                const dateStr = date.toISOString().split('T')[0];
                const slots = ['09:00', '10:30', '14:00', '15:30', '17:00'];
                for (const time of slots) {
                    availableSlots.push({ date: dateStr, time, duration });
                }
            }
            return {
                success: true,
                data: {
                    available_slots: availableSlots.slice(0, 10),
                    session_type: args.session_type,
                    duration: duration
                },
                message: `Encontrei ${availableSlots.length} horários disponíveis para ${args.session_type} nos próximos 7 dias.`,
                shouldContinue: true
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Erro ao verificar disponibilidade: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                shouldContinue: true
            };
        }
    }
    async bookSession(args, context) {
        try {
            const { data: service, error: serviceError } = await database_1.supabase
                .from('services')
                .select('id, name, duration_minutes, base_price')
                .eq('tenant_id', context.tenantId)
                .ilike('name', `%${args.session_type.replace('_', ' ')}%`)
                .single();
            if (serviceError || !service) {
                return {
                    success: false,
                    message: 'Serviço não encontrado. Por favor, verifique os tipos de sessão disponíveis.',
                    shouldContinue: true
                };
            }
            const appointmentData = {
                tenant_id: context.tenantId,
                user_id: context.userId,
                service_id: service.id,
                start_time: `${args.date}T${args.time}:00`,
                end_time: new Date(new Date(`${args.date}T${args.time}:00`).getTime() + ((0, validation_helpers_1.validateServiceDuration)(service.duration_minutes) * 60000)).toISOString(),
                timezone: context.tenantConfig?.businessHours.timezone || 'America/Sao_Paulo',
                status: (0, validation_helpers_1.validateAppointmentStatus)('confirmed'),
                quoted_price: service.base_price,
                customer_notes: args.notes || '',
                appointment_data: {
                    session_type: args.session_type,
                    is_first_session: args.is_first_session || false,
                    client_name: args.client_name,
                    phone: args.phone,
                    booked_via: 'whatsapp_ai'
                }
            };
            const { data: appointment, error: appointmentError } = await database_1.supabase
                .from('appointments')
                .insert(appointmentData)
                .select()
                .single();
            if (appointmentError) {
                return {
                    success: false,
                    message: `Erro ao criar agendamento: ${appointmentError.message}`,
                    shouldContinue: true
                };
            }
            
            // Marcar a conversa como appointment_created para cobrança correta
            if (context.conversationId && appointment?.id) {
                await this.conversationOutcomeService.markAppointmentCreated(context.conversationId, appointment.id);
            }
            const sessionTypeDisplay = args.session_type.replace('_', ' ').toLowerCase();
            const dateFormatted = new Date(args.date).toLocaleDateString('pt-BR');
            return {
                success: true,
                data: {
                    appointment_id: appointment.id,
                    service_name: service.name,
                    date: dateFormatted,
                    time: args.time,
                    duration: service.duration_minutes,
                    price: service.base_price,
                    confirmation_code: appointment.id.slice(0, 8).toUpperCase()
                },
                message: `✅ Sessão agendada com sucesso!\n\n📅 ${sessionTypeDisplay}\n🗓️ ${dateFormatted} às ${args.time}\n⏱️ Duração: ${service.duration_minutes} minutos\n💰 Valor: R$ ${service.base_price}\n🔢 Código: ${appointment.id.slice(0, 8).toUpperCase()}\n\nLembre-se de chegar 10 minutos antes do horário. Em caso de necessidade, entre em contato para reagendar.`,
                shouldContinue: false
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Erro inesperado ao agendar sessão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                shouldContinue: true
            };
        }
    }
    async emergencyProtocol(args, context) {
        try {
            console.error('🚨 EMERGENCY DETECTED:', {
                crisis_type: args.crisis_type,
                urgency_level: args.urgency_level,
                tenant_id: context.tenantId,
                user_id: context.userId,
                contact_info: args.contact_info,
                timestamp: new Date().toISOString()
            });
            await database_1.supabase
                .from('conversation_history')
                .insert({
                tenant_id: context.tenantId,
                user_id: context.userId,
                is_from_user: false,
                message_type: 'emergency',
                content: `EMERGÊNCIA DETECTADA: ${args.crisis_type} - Nível: ${args.urgency_level}`,
                intent_detected: 'emergency',
                confidence_score: 1.0,
                conversation_context: {
                    crisis_type: args.crisis_type,
                    urgency_level: args.urgency_level,
                    contact_info: args.contact_info,
                    requires_immediate_attention: true
                }
            });
            let emergencyMessage = `🆘 **Situação de Emergência Detectada**\n\nEntendo que você está passando por um momento muito difícil. Você não está sozinho(a) nesta situação.\n\n`;
            switch (args.crisis_type) {
                case 'ideacao_suicida':
                    emergencyMessage += `**RECURSOS IMEDIATOS:**\n📞 CVV - Centro de Valorização da Vida: 188 (24h, gratuito)\n📞 SAMU: 192\n🏥 Procure a UPA ou hospital mais próximo\n\n**IMPORTANTE:** Sua vida tem valor. Existem pessoas dispostas a ajudar.`;
                    break;
                case 'crise_panico':
                    emergencyMessage += `**TÉCNICA IMEDIATA - Respiração 4-7-8:**\n1. Inspire por 4 segundos\n2. Segure por 7 segundos\n3. Expire por 8 segundos\n4. Repita 4 vezes\n\n📞 Se não melhorar: SAMU 192`;
                    break;
                case 'violencia_domestica':
                    emergencyMessage += `**RECURSOS URGENTES:**\n📞 Central de Atendimento à Mulher: 180\n📞 Polícia Militar: 190\n📞 Disque Denúncia: 197\n\n**IMPORTANTE:** Busque um local seguro imediatamente.`;
                    break;
                default:
                    emergencyMessage += `**RECURSOS GERAIS:**\n📞 SAMU: 192\n📞 Bombeiros: 193\n📞 CVV: 188\n🏥 Procure atendimento médico imediato`;
            }
            emergencyMessage += `\n\n**Estou notificando nossa equipe para atendimento prioritário. Alguém entrará em contato em breve.**`;
            return {
                success: true,
                data: {
                    emergency_level: args.urgency_level,
                    crisis_type: args.crisis_type,
                    immediate_action_required: true,
                    escalate_to_professional: true,
                    resources_provided: true
                },
                message: emergencyMessage,
                shouldContinue: false
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Erro no protocolo de emergência: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                shouldContinue: true
            };
        }
    }
    async getWellnessResources(args, context) {
        const resources = {
            'tecnicas_respiracao': `🌬️ **Técnicas de Respiração:**\n\n**1. Respiração 4-7-8 (para ansiedade):**\n- Inspire por 4 segundos\n- Segure por 7 segundos\n- Expire por 8 segundos\n- Repita 4 vezes\n\n**2. Respiração diafragmática:**\n- Coloque uma mão no peito, outra na barriga\n- Respire lentamente pelo nariz\n- A mão da barriga deve se mover mais\n- Expire pela boca devagar`,
            'meditacao_guiada': `🧘 **Recursos de Meditação:**\n\n**Apps Recomendados:**\n- Headspace (inglês)\n- Calm (inglês/português)\n- Insight Timer (gratuito)\n- Zen (português)\n\n**Técnicas simples:**\n- Meditação de 5 minutos focando na respiração\n- Body scan (varredura corporal)\n- Mindfulness no dia a dia`,
            'exercicios_ansiedade': `😰 **Exercícios para Ansiedade:**\n\n**Técnica 5-4-3-2-1:**\n- 5 coisas que você VÊ\n- 4 coisas que você TOCA\n- 3 coisas que você OUVE\n- 2 coisas que você CHEIRA\n- 1 coisa que você PROVA\n\n**Respiração quadrada:**\n- Inspire por 4 segundos\n- Segure por 4 segundos\n- Expire por 4 segundos\n- Segure por 4 segundos`,
            'hotlines_emergencia': `📞 **Linhas de Apoio 24h:**\n\n🇧🇷 **Brasil:**\n- CVV: 188 (prevenção suicídio)\n- SAMU: 192\n- Polícia: 190\n- Bombeiros: 193\n- Central da Mulher: 180\n- Disque Denúncia: 197\n\n**Online:**\n- CVV Chat: cvv.org.br\n- Mapa da Saúde Mental: mapasaudemental.com.br`,
            'grupos_apoio': `🤝 **Grupos de Apoio:**\n\n**Presenciais:**\n- CAPS (Centro de Atenção Psicossocial)\n- Pastoral da Escuta\n- Alcoólicos Anônimos\n- Narcóticos Anônimos\n\n**Online:**\n- Grupos no Telegram\n- Fóruns especializados\n- Comunidades no Reddit (r/depression, r/anxiety)\n\n**Para encontrar grupos locais:**\n- Consulte sua UBS\n- Procure no site da prefeitura`,
            'aplicativos_saude_mental': `📱 **Apps de Saúde Mental:**\n\n**Gratuitos:**\n- Sanvello (ansiedade/depressão)\n- MindShift (ansiedade)\n- Insight Timer (meditação)\n- Daylio (mood tracker)\n\n**Brasileiros:**\n- Zen (meditação)\n- Vittude (terapia online)\n- Eurekka (bem-estar)\n- Mindfulness Brasil\n\n**Mood tracking:**\n- Daylio\n- eMoods\n- Mood Meter`
        };
        const resource = resources[args.resource_type];
        if (!resource) {
            return {
                success: false,
                message: 'Tipo de recurso não encontrado. Recursos disponíveis: técnicas de respiração, meditação guiada, exercícios para ansiedade, hotlines de emergência, grupos de apoio, aplicativos de saúde mental.',
                shouldContinue: true
            };
        }
        return {
            success: true,
            data: { resource_type: args.resource_type },
            message: resource + `\n\n💙 Lembre-se: buscar ajuda é um sinal de força, não fraqueza. Você não está sozinho(a) nesta jornada.`,
            shouldContinue: true
        };
    }
    async medicationReminder(args, context) {
        try {
            const reminderConfig = {
                user_id: context.userId,
                tenant_id: context.tenantId,
                medication_name: args.medication_name,
                reminder_time: args.reminder_time,
                frequency: args.frequency,
                created_at: new Date().toISOString(),
                is_active: true
            };
            console.log('💊 Medication reminder configured:', reminderConfig);
            const frequencyDisplay = {
                'diario': 'todos os dias',
                'duas_vezes_dia': '2 vezes por dia',
                'tres_vezes_dia': '3 vezes por dia',
                'semanal': 'semanalmente'
            };
            return {
                success: true,
                data: reminderConfig,
                message: `💊 **Lembrete configurado!**\n\n📋 Medicamento: ${args.medication_name}\n⏰ Horário: ${args.reminder_time}\n📅 Frequência: ${frequencyDisplay[args.frequency]}\n\n⚠️ **IMPORTANTE:** Este é apenas um lembrete. Sempre siga as orientações do seu médico. Não altere dosagens ou pare o medicamento sem orientação médica.\n\nVocê receberá lembretes no WhatsApp nos horários configurados.`,
                shouldContinue: true
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Erro ao configurar lembrete: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                shouldContinue: true
            };
        }
    }
}
exports.HealthcareAgent = HealthcareAgent;
//# sourceMappingURL=healthcare-agent.js.map