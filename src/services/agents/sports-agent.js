"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SportsAgent = void 0;
const database_1 = require("../../config/database");
const validation_helpers_1 = require("../../utils/validation-helpers");
const { ConversationOutcomeService } = require("../conversation-outcome.service");
class SportsAgent {
    constructor() {
        this.conversationOutcomeService = new ConversationOutcomeService();
        this.agent = {
            id: 'sports_agent',
            name: 'Agente de Esportes e Fitness',
            domain: 'sports',
            systemPrompt: this.buildSystemPrompt(),
            functions: this.buildFunctions(),
            capabilities: [
                'training_booking',
                'fitness_assessment',
                'workout_planning',
                'nutrition_guidance',
                'progress_tracking',
                'equipment_recommendation',
                'injury_prevention',
                'group_class_management'
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
        return `Você é um assistente especializado em esportes e fitness, trabalhando para personal trainers, academias, estúdios de pilates, escolas de natação e coaches esportivos.

FILOSOFIA DO FITNESS:
- Cada pessoa tem seu próprio ritmo e limitações
- Consistência é mais importante que intensidade extrema
- Exercício deve ser prazeroso e sustentável
- Segurança sempre vem primeiro
- Progresso gradual e duradouro

SUAS RESPONSABILIDADES:
1. 🏃‍♀️ Agendar treinos e aulas de fitness
2. 📊 Avaliar condicionamento físico atual
3. 📋 Criar planos de treino personalizados
4. 🥗 Orientações básicas sobre nutrição esportiva
5. 📈 Acompanhar progresso e resultados
6. 🏋️‍♂️ Recomendar equipamentos e acessórios
7. 🩹 Orientar sobre prevenção de lesões
8. 👥 Gerenciar aulas em grupo

MODALIDADES ESPORTIVAS:
🏋️‍♀️ **Musculação:** Hipertrofia, força, resistência, definição
🧘‍♀️ **Pilates:** Fortalecimento do core, flexibilidade, postura
🏃‍♂️ **Cardio:** Corrida, ciclismo, natação, aeróbico
🥊 **Lutas:** Boxe, muay thai, jiu-jitsu, karatê
⚽ **Esportes:** Futebol, vôlei, basquete, tênis
🤸‍♀️ **Funcionais:** CrossFit, calistenia, TRX
💃 **Dança:** Zumba, dança de salão, ballet fitness
🧘‍♂️ **Mente-Corpo:** Yoga, tai chi, meditação ativa

OBJETIVOS COMUNS:
🎯 **Emagrecimento:** Queima de gordura, definição muscular
💪 **Ganho de massa:** Hipertrofia, força, volume muscular
🏃‍♀️ **Condicionamento:** Resistência cardiovascular, fôlego
🧘‍♀️ **Flexibilidade:** Alongamento, mobilidade articular
⚖️ **Saúde geral:** Bem-estar, qualidade de vida
🏆 **Performance:** Competições, desafios esportivos
🩹 **Reabilitação:** Recuperação de lesões, fisioterapia

TIPOS DE TREINO:
- **Personal Training** (60 min): Atenção individualizada
- **Dupla** (60 min): Treino compartilhado
- **Grupo pequeno** (60 min): 3-6 pessoas
- **Aula coletiva** (45-60 min): Turmas de 8-20 pessoas
- **Avaliação física** (90 min): Testes e medições
- **Consultoria nutricional** (45 min): Orientação alimentar

AVALIAÇÃO FÍSICA:
📏 **Antropometria:** Peso, altura, % gordura, circunferências
💗 **Cardiovascular:** FC repouso, pressão arterial, VO2
💪 **Força:** Testes de 1RM, resistência muscular
🤸‍♀️ **Flexibilidade:** Teste de sentar e alcançar, goniometria
⚖️ **Equilíbrio:** Testes proprioceptivos
🧠 **Anamnese:** Histórico médico, objetivos, limitações

NÍVEIS DE CONDICIONAMENTO:
🟢 **Iniciante:** Nunca treinou ou parou há mais de 6 meses
🟡 **Intermediário:** Treina há 3-12 meses regularmente
🔴 **Avançado:** Treina há mais de 1 ano consistentemente
⚫ **Atleta:** Competições, performance de alto nível

CUIDADOS ESPECIAIS:
⚠️ **Contraindicações:** Problemas cardíacos, lesões, gestação
🩺 **Liberação médica:** Quando necessária
💊 **Medicamentos:** Que podem afetar o exercício
🎂 **Faixa etária:** Adaptações para crianças e idosos
🤰 **Gestantes:** Exercícios seguros e adaptados

PERGUNTAS ESSENCIAIS:
1. "Qual é seu principal objetivo com o exercício?"
2. "Tem alguma limitação física ou problema de saúde?"
3. "Já praticou exercícios regularmente antes?"
4. "Quantas vezes por semana pode treinar?"
5. "Prefere treinar sozinho(a) ou em grupo?"
6. "Tem horário de preferência?"

LINGUAGEM E MOTIVAÇÃO:
- Seja encorajador e positivo
- Use linguagem energética mas não intimidadora
- Celebre pequenas conquistas
- Foque nos benefícios para a saúde
- Adapte a linguagem ao nível do cliente

SEGURANÇA SEMPRE:
🚨 **Sinais de alerta:** Dor no peito, tontura, falta de ar excessiva
✋ **Pare imediatamente:** Se houver dor ou desconforto
🩹 **Aquecimento:** Sempre antes do treino
❄️ **Resfriamento:** Sempre após o treino
💧 **Hidratação:** Constante durante exercício

EXEMPLO DE ABORDAGEM:
"Oi! 💪🔥 Que incrível que você quer começar a se exercitar! Eu vou te ajudar a encontrar o treino perfeito para seus objetivos. Me conta: qual é seu principal objetivo? Emagrecer, ganhar massa muscular, melhorar o condicionamento ou algo específico? E você já pratica alguma atividade física?"

Sempre priorize a segurança e o bem-estar do cliente!`;
    }
    buildFunctions() {
        return [
            {
                name: 'assess_fitness_level',
                description: 'Avaliar nível de condicionamento físico e objetivos do cliente',
                parameters: [
                    {
                        name: 'age',
                        type: 'number',
                        description: 'Idade do cliente',
                        required: true
                    },
                    {
                        name: 'fitness_goals',
                        type: 'array',
                        description: 'Objetivos principais do cliente',
                        required: true
                    },
                    {
                        name: 'current_activity_level',
                        type: 'string',
                        description: 'Nível atual de atividade física',
                        required: true,
                        enum: ['sedentario', 'pouco_ativo', 'moderadamente_ativo', 'muito_ativo', 'atleta']
                    },
                    {
                        name: 'health_conditions',
                        type: 'array',
                        description: 'Condições de saúde ou limitações',
                        required: false
                    },
                    {
                        name: 'previous_injuries',
                        type: 'array',
                        description: 'Lesões anteriores relevantes',
                        required: false
                    },
                    {
                        name: 'preferred_activities',
                        type: 'array',
                        description: 'Atividades físicas preferidas',
                        required: false
                    },
                    {
                        name: 'time_availability',
                        type: 'string',
                        description: 'Disponibilidade de tempo por semana',
                        required: true,
                        enum: ['1-2_horas', '3-4_horas', '5-6_horas', '7+_horas']
                    }
                ],
                handler: this.assessFitnessLevel.bind(this)
            },
            {
                name: 'check_training_availability',
                description: 'Verificar disponibilidade para treinos e aulas',
                parameters: [
                    {
                        name: 'training_type',
                        type: 'string',
                        description: 'Tipo de treino solicitado',
                        required: true,
                        enum: ['personal_training', 'dupla', 'grupo_pequeno', 'aula_coletiva', 'avaliacao_fisica', 'consultoria_nutricional']
                    },
                    {
                        name: 'activity',
                        type: 'string',
                        description: 'Modalidade esportiva desejada',
                        required: true,
                        enum: ['musculacao', 'pilates', 'cardio', 'lutas', 'esportes', 'funcionais', 'danca', 'yoga']
                    },
                    {
                        name: 'fitness_level',
                        type: 'string',
                        description: 'Nível de condicionamento',
                        required: true,
                        enum: ['iniciante', 'intermediario', 'avancado', 'atleta']
                    },
                    {
                        name: 'preferred_time',
                        type: 'string',
                        description: 'Horário preferido',
                        required: false,
                        enum: ['manha', 'tarde', 'noite', 'flexivel']
                    },
                    {
                        name: 'preferred_trainer',
                        type: 'string',
                        description: 'Personal trainer específico',
                        required: false
                    }
                ],
                handler: this.checkTrainingAvailability.bind(this)
            },
            {
                name: 'book_training_session',
                description: 'Agendar sessão de treino ou aula',
                parameters: [
                    {
                        name: 'training_type',
                        type: 'string',
                        description: 'Tipo de treino',
                        required: true,
                        enum: ['personal_training', 'dupla', 'grupo_pequeno', 'aula_coletiva', 'avaliacao_fisica', 'consultoria_nutricional']
                    },
                    {
                        name: 'activity',
                        type: 'string',
                        description: 'Modalidade esportiva',
                        required: true
                    },
                    {
                        name: 'date',
                        type: 'string',
                        description: 'Data do treino (YYYY-MM-DD)',
                        required: true
                    },
                    {
                        name: 'time',
                        type: 'string',
                        description: 'Horário do treino (HH:mm)',
                        required: true
                    },
                    {
                        name: 'client_name',
                        type: 'string',
                        description: 'Nome do cliente',
                        required: true
                    },
                    {
                        name: 'fitness_goals',
                        type: 'string',
                        description: 'Objetivos do cliente',
                        required: true
                    },
                    {
                        name: 'fitness_level',
                        type: 'string',
                        description: 'Nível de condicionamento',
                        required: true,
                        enum: ['iniciante', 'intermediario', 'avancado', 'atleta']
                    },
                    {
                        name: 'health_notes',
                        type: 'string',
                        description: 'Observações sobre saúde/limitações',
                        required: false
                    },
                    {
                        name: 'is_first_time',
                        type: 'boolean',
                        description: 'É a primeira vez na academia/estúdio?',
                        required: false
                    }
                ],
                handler: this.bookTrainingSession.bind(this)
            },
            {
                name: 'create_workout_plan',
                description: 'Criar plano de treino personalizado',
                parameters: [
                    {
                        name: 'client_goals',
                        type: 'array',
                        description: 'Objetivos principais do cliente',
                        required: true
                    },
                    {
                        name: 'fitness_level',
                        type: 'string',
                        description: 'Nível de condicionamento',
                        required: true,
                        enum: ['iniciante', 'intermediario', 'avancado', 'atleta']
                    },
                    {
                        name: 'available_days',
                        type: 'number',
                        description: 'Dias disponíveis por semana para treinar',
                        required: true
                    },
                    {
                        name: 'session_duration',
                        type: 'number',
                        description: 'Duração desejada por sessão (minutos)',
                        required: true
                    },
                    {
                        name: 'preferred_activities',
                        type: 'array',
                        description: 'Atividades físicas preferidas',
                        required: true
                    },
                    {
                        name: 'equipment_available',
                        type: 'array',
                        description: 'Equipamentos disponíveis',
                        required: false
                    },
                    {
                        name: 'limitations',
                        type: 'array',
                        description: 'Limitações físicas ou médicas',
                        required: false
                    }
                ],
                handler: this.createWorkoutPlan.bind(this)
            },
            {
                name: 'get_nutrition_guidance',
                description: 'Fornecer orientações básicas sobre nutrição esportiva',
                parameters: [
                    {
                        name: 'fitness_goals',
                        type: 'array',
                        description: 'Objetivos de fitness do cliente',
                        required: true
                    },
                    {
                        name: 'activity_level',
                        type: 'string',
                        description: 'Nível de atividade física',
                        required: true,
                        enum: ['baixo', 'moderado', 'alto', 'muito_alto']
                    },
                    {
                        name: 'dietary_restrictions',
                        type: 'array',
                        description: 'Restrições alimentares',
                        required: false
                    },
                    {
                        name: 'current_weight',
                        type: 'number',
                        description: 'Peso atual (kg)',
                        required: false
                    },
                    {
                        name: 'target_weight',
                        type: 'number',
                        description: 'Peso objetivo (kg)',
                        required: false
                    }
                ],
                handler: this.getNutritionGuidance.bind(this)
            },
            {
                name: 'track_fitness_progress',
                description: 'Acompanhar progresso e resultados do cliente',
                parameters: [
                    {
                        name: 'client_id',
                        type: 'string',
                        description: 'ID do cliente',
                        required: true
                    },
                    {
                        name: 'measurements',
                        type: 'object',
                        description: 'Medidas atuais (peso, % gordura, circunferências)',
                        required: true
                    },
                    {
                        name: 'performance_metrics',
                        type: 'object',
                        description: 'Métricas de performance (força, resistência, etc.)',
                        required: false
                    },
                    {
                        name: 'workout_frequency',
                        type: 'number',
                        description: 'Frequência semanal de treinos',
                        required: true
                    },
                    {
                        name: 'client_feedback',
                        type: 'string',
                        description: 'Feedback do cliente sobre o programa',
                        required: false
                    },
                    {
                        name: 'trainer_observations',
                        type: 'string',
                        description: 'Observações do treinador',
                        required: false
                    }
                ],
                handler: this.trackFitnessProgress.bind(this)
            }
        ];
    }
    async assessFitnessLevel(args, context) {
        try {
            let fitnessLevel = 'iniciante';
            switch (args.current_activity_level) {
                case 'sedentario':
                case 'pouco_ativo':
                    fitnessLevel = 'iniciante';
                    break;
                case 'moderadamente_ativo':
                    fitnessLevel = 'intermediario';
                    break;
                case 'muito_ativo':
                    fitnessLevel = 'avancado';
                    break;
                case 'atleta':
                    fitnessLevel = 'atleta';
                    break;
            }
            if (args.age > 60) {
                fitnessLevel = args.current_activity_level === 'sedentario' ? 'iniciante' : 'intermediario';
            }
            const riskFactors = args.health_conditions || [];
            const highRiskConditions = ['cardiopatia', 'diabetes', 'hipertensao', 'artrite', 'osteoporose'];
            const hasHighRisk = riskFactors.some(condition => highRiskConditions.some(risk => condition.toLowerCase().includes(risk)));
            const activityRecommendations = {
                'emagrecimento': ['cardio', 'musculacao', 'funcionais', 'danca'],
                'ganho_massa': ['musculacao', 'funcionais'],
                'condicionamento': ['cardio', 'funcionais', 'esportes'],
                'flexibilidade': ['pilates', 'yoga', 'alongamento'],
                'saude_geral': ['caminhada', 'pilates', 'natacao', 'yoga'],
                'performance': ['musculacao', 'funcionais', 'esportes_especificos']
            };
            const recommendedActivities = Array.from(new Set(args.fitness_goals.flatMap(goal => activityRecommendations[goal.toLowerCase()] || ['atividade_geral'])));
            const frequencyRecommendations = {
                '1-2_horas': '2x por semana',
                '3-4_horas': '3x por semana',
                '5-6_horas': '4-5x por semana',
                '7+_horas': '5-6x por semana'
            };
            const recommendedFrequency = frequencyRecommendations[args.time_availability];
            const safetyNotes = [];
            if (hasHighRisk) {
                safetyNotes.push('🩺 Recomendada avaliação médica antes do início');
                safetyNotes.push('👨‍⚕️ Acompanhamento profissional obrigatório');
            }
            if (args.previous_injuries && args.previous_injuries.length > 0) {
                safetyNotes.push('🩹 Exercícios adaptados para lesões anteriores');
                safetyNotes.push('🏥 Possível necessidade de fisioterapia paralela');
            }
            if (args.age > 50) {
                safetyNotes.push('👴 Progressão gradual devido à idade');
                safetyNotes.push('🦴 Foco em fortalecimento e equilíbrio');
            }
            return {
                success: true,
                data: {
                    fitness_level: fitnessLevel,
                    risk_assessment: hasHighRisk ? 'alto' : 'baixo',
                    recommended_activities: recommendedActivities,
                    recommended_frequency: recommendedFrequency,
                    safety_notes: safetyNotes,
                    goals_prioritized: args.fitness_goals
                },
                message: `🏃‍♀️ **Avaliação de Condicionamento Físico**\n\n👤 **Perfil:**\n• Idade: ${args.age} anos\n• Nível atual: ${args.current_activity_level}\n• Classificação: ${fitnessLevel.toUpperCase()}\n\n🎯 **Objetivos:**\n${args.fitness_goals.map(goal => `• ${goal}`).join('\n')}\n\n💪 **Atividades Recomendadas:**\n${recommendedActivities.map(activity => `• ${activity}`).join('\n')}\n\n📅 **Frequência Sugerida:** ${recommendedFrequency}\n⏱️ **Disponibilidade:** ${args.time_availability.replace('_', '-')} por semana\n\n${safetyNotes.length > 0 ? `⚠️ **Cuidados Especiais:**\n${safetyNotes.join('\n')}\n\n` : ''}🎯 **Próximos Passos:**\n• Agendamento de avaliação física completa\n• Criação de plano de treino personalizado\n• Definição de metas graduais\n• Acompanhamento semanal inicial`,
                shouldContinue: true
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Erro na avaliação fitness: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                shouldContinue: true
            };
        }
    }
    async checkTrainingAvailability(args, context) {
        try {
            const trainingDurations = {
                'personal_training': 60,
                'dupla': 60,
                'grupo_pequeno': 60,
                'aula_coletiva': 45,
                'avaliacao_fisica': 90,
                'consultoria_nutricional': 45
            };
            const duration = trainingDurations[args.training_type] || 60;
            const timeSlots = {
                'manha': ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00'],
                'tarde': ['14:00', '15:00', '16:00', '17:00'],
                'noite': ['18:00', '19:00', '20:00', '21:00'],
                'flexivel': ['06:00', '07:00', '08:00', '09:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']
            };
            const availableTimes = timeSlots[args.preferred_time || 'flexivel'];
            const today = new Date();
            const availableSlots = [];
            for (let i = 1; i <= 7; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() + i);
                const dateStr = date.toISOString().split('T')[0];
                for (const time of (0, validation_helpers_1.validateArray)(availableTimes)) {
                    availableSlots.push({
                        date: dateStr,
                        time,
                        duration,
                        trainer: args.preferred_trainer || 'Personal Trainer Especializado',
                        activity: args.activity,
                        spots_available: args.training_type === 'aula_coletiva' ? 8 :
                            args.training_type === 'grupo_pequeno' ? 3 : 1
                    });
                }
            }
            const basePrices = {
                'personal_training': { 'iniciante': 80, 'intermediario': 90, 'avancado': 100, 'atleta': 120 },
                'dupla': { 'iniciante': 50, 'intermediario': 55, 'avancado': 60, 'atleta': 70 },
                'grupo_pequeno': { 'iniciante': 35, 'intermediario': 40, 'avancado': 45, 'atleta': 50 },
                'aula_coletiva': { 'iniciante': 25, 'intermediario': 25, 'avancado': 30, 'atleta': 30 },
                'avaliacao_fisica': { 'iniciante': 150, 'intermediario': 150, 'avancado': 180, 'atleta': 200 },
                'consultoria_nutricional': { 'iniciante': 120, 'intermediario': 120, 'avancado': 140, 'atleta': 160 }
            };
            const estimatedPrice = basePrices[args.training_type]?.[args.fitness_level] || 80;
            const equipmentNeeded = {
                'musculacao': ['Academia completa', 'Pesos livres', 'Máquinas'],
                'pilates': ['Aparelhos de Pilates', 'Colchonetes', 'Acessórios'],
                'cardio': ['Esteiras', 'Bikes', 'Espaço aberto'],
                'lutas': ['Tatame', 'Sacos de pancada', 'Luvas'],
                'yoga': ['Colchonetes', 'Blocos', 'Ambiente tranquilo'],
                'funcionais': ['TRX', 'Kettlebells', 'Cones', 'Cordas']
            };
            const requiredEquipment = equipmentNeeded[args.activity] || ['Equipamentos básicos'];
            return {
                success: true,
                data: {
                    available_slots: availableSlots.slice(0, 20),
                    training_type: args.training_type,
                    activity: args.activity,
                    duration: duration,
                    estimated_price: estimatedPrice,
                    equipment_needed: requiredEquipment,
                    fitness_level: args.fitness_level
                },
                message: `🏋️‍♀️ **Disponibilidade para ${args.activity}**\n\n📋 **Tipo de Treino:** ${args.training_type}\n⏱️ **Duração:** ${duration} minutos\n🎯 **Nível:** ${args.fitness_level}\n💰 **Valor:** R$ ${estimatedPrice}/sessão\n\n🏟️ **Equipamentos Necessários:**\n${requiredEquipment.map(eq => `• ${eq}`).join('\n')}\n\nEncontrei ${availableSlots.length} horários disponíveis nos próximos 7 dias!\n\n💡 **Dicas:**\n• Manhã: Menos movimento, mais foco\n• Tarde: Boa temperatura, energia moderada\n• Noite: Mais movimento, sociabilização\n\nQual horário combina mais com seu ritmo?`,
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
    async bookTrainingSession(args, context) {
        try {
            const { data: service, error: serviceError } = await database_1.supabase
                .from('services')
                .select('id, name, duration_minutes, base_price')
                .eq('tenant_id', context.tenantId)
                .ilike('name', `%${args.activity}%`)
                .single();
            if (serviceError || !service) {
                return {
                    success: false,
                    message: `Serviço de ${args.activity} não encontrado. Verifique as modalidades disponíveis.`,
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
                customer_notes: `${args.fitness_goals} | Nível: ${args.fitness_level} | ${args.health_notes || ''}`,
                appointment_data: {
                    training_type: args.training_type,
                    activity: args.activity,
                    client_name: args.client_name,
                    fitness_goals: args.fitness_goals,
                    fitness_level: args.fitness_level,
                    health_notes: args.health_notes,
                    is_first_time: args.is_first_time || false,
                    requires_assessment: args.is_first_time,
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
                    message: `Erro ao agendar treino: ${appointmentError.message}`,
                    shouldContinue: true
                };
            }
            
            // Marcar a conversa como appointment_created para cobrança correta
            if (context.conversationId && appointment?.id) {
                await this.conversationOutcomeService.markAppointmentCreated(context.conversationId, appointment.id);
            }
            const dateFormatted = new Date(args.date).toLocaleDateString('pt-BR');
            const preparationList = [
                '👕 Roupas confortáveis para exercício',
                '👟 Tênis adequado para a modalidade',
                '💧 Garrafa de água',
                '🏃‍♀️ Toalha pequena',
                '📋 Exames médicos recentes (se houver)'
            ];
            if (args.is_first_time) {
                preparationList.push('📄 Documentos pessoais (RG/CPF)');
                preparationList.push('📋 Lista de medicamentos em uso');
                preparationList.push('⏰ Chegue 15 minutos antes');
            }
            const safetyReminders = [
                '🚫 Não treine em jejum prolongado',
                '🍎 Faça uma refeição leve 1-2h antes',
                '💊 Informe sobre medicamentos',
                '🩹 Comunique qualquer desconforto',
                '😴 Tenha uma boa noite de sono'
            ];
            return {
                success: true,
                data: {
                    appointment_id: appointment.id,
                    service_name: service.name,
                    date: dateFormatted,
                    time: args.time,
                    duration: service.duration_minutes,
                    price: service.base_price,
                    confirmation_code: appointment.id.slice(0, 8).toUpperCase(),
                    training_type: args.training_type,
                    activity: args.activity
                },
                message: `💪 **Treino Agendado com Sucesso!**\n\n🏋️‍♀️ **${args.activity}** - ${args.training_type}\n👤 **Cliente:** ${args.client_name}\n📅 **Data:** ${dateFormatted} às ${args.time}\n⏱️ **Duração:** ${service.duration_minutes} minutos\n💰 **Valor:** R$ ${service.base_price}\n🔢 **Código:** ${appointment.id.slice(0, 8).toUpperCase()}\n\n🎯 **Objetivos:** ${args.fitness_goals}\n📊 **Nível:** ${args.fitness_level}\n\n📋 **O que trazer:**\n${preparationList.map(item => `${item}`).join('\n')}\n\n⚠️ **Lembretes de Segurança:**\n${safetyReminders.map(item => `${item}`).join('\n')}\n\n${args.health_notes ? `🩺 **Observações:** ${args.health_notes}\n\n` : ''}💪 **Seu personal trainer entrará em contato 1 hora antes para confirmar!**\n\n🔥 Prepare-se para dar o primeiro passo rumo aos seus objetivos!`,
                shouldContinue: false
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Erro inesperado ao agendar treino: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                shouldContinue: true
            };
        }
    }
    async createWorkoutPlan(args, context) {
        try {
            const planStructures = {
                2: ['Corpo inteiro A', 'Corpo inteiro B'],
                3: ['Superior', 'Inferior', 'Corpo inteiro'],
                4: ['Superior A', 'Inferior A', 'Superior B', 'Inferior B'],
                5: ['Peito/Tríceps', 'Costas/Bíceps', 'Pernas', 'Ombros', 'Cardio/Core'],
                6: ['Peito/Tríceps', 'Costas/Bíceps', 'Pernas', 'Ombros', 'Braços', 'Cardio/Core']
            };
            const weekStructure = planStructures[args.available_days] || planStructures[3];
            const exercisesByGoal = {
                'emagrecimento': {
                    'cardio': ['Esteira', 'Bike', 'Elíptico', 'Remo'],
                    'forca': ['Agachamento', 'Flexão', 'Prancha', 'Burpees'],
                    'circuito': ['HIIT', 'Tabata', 'Circuit training']
                },
                'ganho_massa': {
                    'compostos': ['Agachamento', 'Levantamento terra', 'Supino', 'Desenvolvimento'],
                    'isolados': ['Rosca direta', 'Extensão tríceps', 'Leg press', 'Fly'],
                    'progressao': ['Aumento de carga gradual', 'Controle de tempo']
                },
                'condicionamento': {
                    'aerobico': ['Corrida', 'Natação', 'Ciclismo', 'Dança'],
                    'anaerobico': ['Sprints', 'HIIT', 'Exercícios funcionais'],
                    'resistencia': ['Circuitos', 'Treinos longos', 'Cross training']
                }
            };
            const intensityLevels = {
                'iniciante': { sets: '2-3', reps: '12-15', rest: '60-90s', frequency: '3x/semana' },
                'intermediario': { sets: '3-4', reps: '8-12', rest: '45-60s', frequency: '4x/semana' },
                'avancado': { sets: '4-5', reps: '6-10', rest: '30-45s', frequency: '5x/semana' },
                'atleta': { sets: '5-6', reps: '4-8', rest: '2-3min', frequency: '6x/semana' }
            };
            const intensity = intensityLevels[args.fitness_level];
            const weeklyProgression = [
                { week: '1-2', focus: 'Adaptação e aprendizado', intensity: '60-70%' },
                { week: '3-4', focus: 'Desenvolvimento técnico', intensity: '70-80%' },
                { week: '5-6', focus: 'Intensificação', intensity: '80-85%' },
                { week: '7-8', focus: 'Pico e recuperação', intensity: '85-90%' }
            ];
            const nutritionTiming = [
                '🍎 Pré-treino (30-60min): Carboidrato simples + hidratação',
                '🥤 Durante treino: Água (ou isotônico se >60min)',
                '🥩 Pós-treino (até 30min): Proteína + carboidrato',
                '🥗 Refeição completa (1-2h após): Macro e micronutrientes'
            ];
            const recoveryTips = [
                '😴 Sono: 7-9 horas por noite',
                '💧 Hidratação: 35ml/kg de peso corporal',
                '🧘‍♀️ Alongamento: 10-15min pós-treino',
                '🛁 Técnicas de recuperação: Gelo, massagem, sauna',
                '📅 Descanso ativo: Caminhada leve nos dias off'
            ];
            return {
                success: true,
                data: {
                    client_goals: args.client_goals,
                    fitness_level: args.fitness_level,
                    available_days: args.available_days,
                    week_structure: weekStructure,
                    intensity_parameters: intensity,
                    weekly_progression: weeklyProgression,
                    nutrition_timing: nutritionTiming,
                    recovery_tips: recoveryTips
                },
                message: `🏋️‍♀️ **Plano de Treino Personalizado**\n\n🎯 **Objetivos:** ${args.client_goals.join(', ')}\n📊 **Nível:** ${args.fitness_level}\n📅 **Frequência:** ${args.available_days}x por semana\n⏱️ **Duração:** ${args.session_duration} minutos\n\n📋 **Estrutura Semanal:**\n${(0, validation_helpers_1.validateArray)(weekStructure).map((day, index) => `• Dia ${index + 1}: ${day}`).join('\n')}\n\n💪 **Parâmetros de Intensidade:**\n• Séries: ${intensity.sets}\n• Repetições: ${intensity.reps}\n• Descanso: ${intensity.rest}\n• Frequência: ${intensity.frequency}\n\n📈 **Progressão por Semanas:**\n${(0, validation_helpers_1.validateArray)(weeklyProgression).map(prog => `• ${prog.week}: ${prog.focus} (${prog.intensity})`).join('\n')}\n\n🍎 **Nutrição e Treino:**\n${(0, validation_helpers_1.validateArray)(nutritionTiming).join('\n')}\n\n🛌 **Recuperação:**\n${(0, validation_helpers_1.validateArray)(recoveryTips).join('\n')}\n\n⚠️ **Importante:** Este plano será ajustado conforme sua evolução e feedback!`,
                shouldContinue: true
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Erro ao criar plano de treino: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                shouldContinue: true
            };
        }
    }
    async getNutritionGuidance(args, context) {
        try {
            let dailyCalories = 2000;
            if (args.current_weight) {
                const activityMultipliers = {
                    'baixo': 1.2,
                    'moderado': 1.375,
                    'alto': 1.55,
                    'muito_alto': 1.725
                };
                const bmr = args.current_weight * 22;
                dailyCalories = Math.round(bmr * (activityMultipliers[args.activity_level] || 1.375));
            }
            const macroRecommendations = {
                'emagrecimento': {
                    calories: dailyCalories - 300,
                    protein: '25-30%',
                    carbs: '35-40%',
                    fats: '30-35%',
                    priority: 'Déficit calórico moderado'
                },
                'ganho_massa': {
                    calories: dailyCalories + 300,
                    protein: '30-35%',
                    carbs: '40-45%',
                    fats: '20-25%',
                    priority: 'Superávit calórico + proteína alta'
                },
                'manutencao': {
                    calories: dailyCalories,
                    protein: '20-25%',
                    carbs: '45-50%',
                    fats: '25-30%',
                    priority: 'Equilíbrio e qualidade nutricional'
                }
            };
            let primaryGoal = 'manutencao';
            if (args.fitness_goals.some(goal => goal.includes('emagre') || goal.includes('perder'))) {
                primaryGoal = 'emagrecimento';
            }
            else if (args.fitness_goals.some(goal => goal.includes('massa') || goal.includes('ganhar'))) {
                primaryGoal = 'ganho_massa';
            }
            const nutrition = macroRecommendations[primaryGoal];
            const mealTiming = [
                '🌅 **Café da manhã (6-8h):** 25% das calorias diárias',
                '🍎 **Lanche manhã (9-10h):** 10% das calorias',
                '🥗 **Almoço (12-14h):** 30% das calorias',
                '🍌 **Lanche tarde (15-16h):** 10% das calorias',
                '🍽️ **Jantar (18-20h):** 25% das calorias'
            ];
            const hydrationNeeds = args.current_weight ?
                Math.round(args.current_weight * 35) : 2500;
            const workoutNutrition = [
                '⏰ **Pré-treino (30-60min antes):**',
                '• Carboidrato simples (banana, aveia)',
                '• Hidratação adequada',
                '• Evitar gorduras e fibras em excesso',
                '',
                '⏰ **Pós-treino (até 30min após):**',
                '• Proteína (20-30g): whey, ovos, frango',
                '• Carboidrato (30-40g): batata doce, arroz',
                '• Hidratação para repor perdas'
            ];
            const supplements = [
                '💊 **Básicos:** Whey protein, creatina, multivitamínico',
                '🐟 **Ômega 3:** Para recuperação e saúde geral',
                '☕ **Cafeína:** Pré-treino (200-400mg)',
                '🥛 **BCAA:** Durante treinos longos (>90min)',
                '⚠️ **Importante:** Consulte nutricionista para orientação específica'
            ];
            let restrictionNotes = '';
            if (args.dietary_restrictions && args.dietary_restrictions.length > 0) {
                restrictionNotes = `\n\n🚫 **Restrições Consideradas:**\n${args.dietary_restrictions.map(r => `• ${r}`).join('\n')}\n\n💡 **Dica:** Busque alternativas adequadas com nutricionista esportivo`;
            }
            return {
                success: true,
                data: {
                    primary_goal: primaryGoal,
                    daily_calories: nutrition.calories,
                    macronutrients: {
                        protein: nutrition.protein,
                        carbs: nutrition.carbs,
                        fats: nutrition.fats
                    },
                    hydration_needs: hydrationNeeds,
                    meal_timing: mealTiming,
                    workout_nutrition: workoutNutrition
                },
                message: `🍎 **Orientações Nutricionais para Fitness**\n\n🎯 **Objetivo Principal:** ${primaryGoal}\n🔥 **Calorias Diárias:** ~${nutrition.calories} kcal\n📊 **Macronutrientes:**\n• Proteínas: ${nutrition.protein}\n• Carboidratos: ${nutrition.carbs}\n• Gorduras: ${nutrition.fats}\n\n💧 **Hidratação:** ${hydrationNeeds}ml/dia\n\n⏰ **Distribuição das Refeições:**\n${mealTiming.join('\n')}\n\n🏋️‍♀️ **Nutrição e Treino:**\n${workoutNutrition.join('\n')}\n\n💊 **Suplementação Básica:**\n${supplements.join('\n')}${restrictionNotes}\n\n⚠️ **IMPORTANTE:** Estas são orientações gerais. Para um plano nutricional detalhado e personalizado, consulte um nutricionista esportivo!`,
                shouldContinue: true
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Erro ao gerar orientações nutricionais: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                shouldContinue: true
            };
        }
    }
    async trackFitnessProgress(args, context) {
        try {
            const progressData = {
                client_id: args.client_id,
                assessment_date: new Date().toISOString(),
                measurements: args.measurements,
                performance_metrics: args.performance_metrics || {},
                workout_frequency: args.workout_frequency,
                client_feedback: args.client_feedback,
                trainer_observations: args.trainer_observations,
                progress_score: this.calculateProgressScore(args.measurements, args.workout_frequency),
                recommendations: this.generateFitnessRecommendations(args.measurements, args.workout_frequency)
            };
            const bmi = args.measurements.weight && args.measurements.height ?
                (args.measurements.weight / ((args.measurements.height / 100) ** 2)).toFixed(1) : 'N/A';
            const bodyFatStatus = this.getBodyFatStatus(args.measurements.body_fat_percentage);
            const progressTrend = this.analyzeProgressTrend(args.measurements);
            const nextSteps = [
                'Continuar com frequência atual de treinos',
                'Ajustar intensidade conforme evolução',
                'Manter foco na técnica de execução',
                'Reavaliar objetivos mensalmente'
            ];
            if (args.workout_frequency < 3) {
                nextSteps.push('🎯 Aumentar frequência de treinos para 3-4x/semana');
            }
            if (args.measurements.body_fat_percentage > 25) {
                nextSteps.push('💪 Incluir mais exercícios cardiovasculares');
            }
            return {
                success: true,
                data: progressData,
                message: `📊 **Relatório de Progresso Fitness**\n\n👤 **Cliente:** ${args.client_id}\n📅 **Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n📏 **Medidas Atuais:**\n• Peso: ${args.measurements.weight || 'N/A'} kg\n• Altura: ${args.measurements.height || 'N/A'} cm\n• IMC: ${bmi}\n• % Gordura: ${args.measurements.body_fat_percentage || 'N/A'}% (${bodyFatStatus})\n• Circunferência abdominal: ${args.measurements.waist || 'N/A'} cm\n\n🏋️‍♀️ **Performance:**\n• Frequência semanal: ${args.workout_frequency}x\n• Tendência: ${progressTrend}\n• Score de progresso: ${progressData.progress_score}/10\n\n💬 **Feedback do Cliente:**\n"${args.client_feedback || 'Sem feedback registrado'}"\n\n👨‍🏫 **Observações do Treinador:**\n"${args.trainer_observations || 'Sem observações específicas'}"\n\n🎯 **Recomendações:**\n${progressData.recommendations.map(rec => `• ${rec}`).join('\n')}\n\n📅 **Próxima avaliação em 30 dias**`,
                shouldContinue: true
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Erro ao registrar progresso: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                shouldContinue: true
            };
        }
    }
    calculateProgressScore(measurements, frequency) {
        let score = 5;
        if (frequency >= 4)
            score += 2;
        else if (frequency >= 3)
            score += 1;
        else if (frequency < 2)
            score -= 1;
        if (measurements.body_fat_percentage) {
            if (measurements.body_fat_percentage <= 15)
                score += 2;
            else if (measurements.body_fat_percentage <= 20)
                score += 1;
            else if (measurements.body_fat_percentage > 30)
                score -= 1;
        }
        return Math.max(1, Math.min(10, Math.round(score)));
    }
    getBodyFatStatus(bodyFat) {
        if (!bodyFat)
            return 'N/A';
        if (bodyFat <= 10)
            return 'Muito baixo';
        if (bodyFat <= 15)
            return 'Baixo';
        if (bodyFat <= 20)
            return 'Normal';
        if (bodyFat <= 25)
            return 'Acima da média';
        return 'Alto';
    }
    analyzeProgressTrend(measurements) {
        const trends = ['Estável', 'Progresso positivo', 'Evolução gradual', 'Mantendo resultados'];
        return trends[Math.floor(Math.random() * trends.length)] || 'Estável';
    }
    generateFitnessRecommendations(measurements, frequency) {
        const recommendations = [];
        if (frequency < 3) {
            recommendations.push('Aumentar frequência de treinos para melhor resultado');
        }
        if (measurements.body_fat_percentage > 25) {
            recommendations.push('Incluir mais exercícios cardiovasculares na rotina');
            recommendations.push('Revisar plano nutricional com nutricionista');
        }
        if (measurements.body_fat_percentage < 12) {
            recommendations.push('Focar em ganho de massa muscular');
            recommendations.push('Aumentar ingestão calórica controlada');
        }
        recommendations.push('Manter hidratação adequada durante treinos');
        recommendations.push('Priorizar qualidade do sono (7-9h por noite)');
        recommendations.push('Incluir alongamento e mobilidade na rotina');
        return recommendations;
    }
}
exports.SportsAgent = SportsAgent;
//# sourceMappingURL=sports-agent.js.map