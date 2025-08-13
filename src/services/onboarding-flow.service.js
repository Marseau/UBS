"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingFlowService = exports.OnboardingFlowService = void 0;
const database_1 = require("@/config/database");
const logger_1 = require("@/utils/logger");
const whatsapp_service_1 = require("./whatsapp.service");
const email_service_1 = require("./email.service");
const phone_validation_service_1 = require("./phone-validation.service");
class OnboardingFlowService {
    constructor() {
        this.whatsappService = new whatsapp_service_1.WhatsAppService();
        this.emailService = new email_service_1.EmailService();
    }
    async startOnboarding(phone, tenantId, userName) {
        try {
            const registration = await phone_validation_service_1.phoneValidationService.registerUserByPhone(phone, tenantId, userName);
            if (!registration.success) {
                return {
                    success: false,
                    message: registration.message
                };
            }
            if (!registration.needsOnboarding) {
                return {
                    success: true,
                    message: 'Usuário já passou pelo onboarding'
                };
            }
            const { data: tenant, error: tenantError } = await database_1.supabaseAdmin
                .from('tenants')
                .select('business_name, business_domain, business_phone, business_address')
                .eq('id', tenantId)
                .single();
            if (tenantError) {
                logger_1.logger.error('Error getting tenant for onboarding', { error: tenantError });
                throw tenantError;
            }
            const onboardingFlow = await this.getOnboardingFlow(tenantId, tenant.business_domain);
            await this.createOnboardingState(registration.userId, tenantId);
            const welcomeMessage = this.personalizeMessage(onboardingFlow.welcomeMessage, { businessName: tenant.business_name, userName: userName || 'Cliente' });
            await this.whatsappService.sendTextMessage(phone, welcomeMessage);
            await this.executeOnboardingStep(registration.userId, tenantId, onboardingFlow.steps[0]);
            logger_1.logger.info('Onboarding started', { userId: registration.userId, tenantId, phone });
            return {
                success: true,
                message: 'Onboarding iniciado com sucesso'
            };
        }
        catch (error) {
            logger_1.logger.error('Error starting onboarding', { error, phone, tenantId });
            return {
                success: false,
                message: 'Erro ao iniciar onboarding'
            };
        }
    }
    async continueOnboarding(phone, tenantId, userResponse, responseType) {
        try {
            const { data: user } = await database_1.supabaseAdmin
                .from('users')
                .select('id')
                .eq('phone', phone)
                .single();
            if (!user) {
                return {
                    success: false,
                    isCompleted: false,
                    message: 'Usuário não encontrado'
                };
            }
            const onboardingState = await this.getOnboardingState(user.id, tenantId);
            if (!onboardingState || onboardingState.isCompleted) {
                return {
                    success: true,
                    isCompleted: true,
                    message: 'Onboarding já concluído'
                };
            }
            const { data: tenant } = await database_1.supabaseAdmin
                .from('tenants')
                .select('business_domain')
                .eq('id', tenantId)
                .single();
            const onboardingFlow = await this.getOnboardingFlow(tenantId, tenant.business_domain);
            const currentStep = onboardingFlow.steps.find(s => s.id === onboardingState.currentStep);
            if (!currentStep) {
                logger_1.logger.error('Current step not found', { currentStep: onboardingState.currentStep });
                return {
                    success: false,
                    isCompleted: false,
                    message: 'Erro no fluxo de onboarding'
                };
            }
            const isValidResponse = this.validateResponse(currentStep, userResponse, responseType);
            if (!isValidResponse) {
                await this.sendValidationError(phone, currentStep);
                return {
                    success: false,
                    isCompleted: false,
                    message: 'Resposta inválida'
                };
            }
            await this.storeStepResponse(user.id, tenantId, currentStep.id, userResponse);
            const nextStepId = currentStep.nextStep;
            const nextStep = onboardingFlow.steps.find(s => s.id === nextStepId);
            if (!nextStep) {
                await this.completeOnboarding(user.id, tenantId, onboardingFlow);
                return {
                    success: true,
                    isCompleted: true,
                    message: 'Onboarding concluído com sucesso'
                };
            }
            await this.updateOnboardingStep(user.id, tenantId, nextStep.id);
            await this.executeOnboardingStep(user.id, tenantId, nextStep);
            return {
                success: true,
                isCompleted: false,
                message: 'Próximo passo enviado'
            };
        }
        catch (error) {
            logger_1.logger.error('Error continuing onboarding', { error, phone, tenantId });
            return {
                success: false,
                isCompleted: false,
                message: 'Erro ao continuar onboarding'
            };
        }
    }
    async getOnboardingFlow(tenantId, domain) {
        const baseFlow = {
            tenantId,
            domain,
            steps: [],
            welcomeMessage: '',
            completionMessage: ''
        };
        switch (domain) {
            case 'beauty':
                return {
                    ...baseFlow,
                    welcomeMessage: `Oi, linda! 💄✨ Seja muito bem-vinda ao {{businessName}}! 

Eu sou sua assistente virtual e vou te ajudar a conhecer nossos serviços e fazer seu primeiro agendamento!

Vamos começar? 😊`,
                    steps: [
                        {
                            id: 'collect_name',
                            name: 'Coletar Nome',
                            order: 1,
                            message: 'Para começar, me diga seu nome completo:',
                            messageType: 'text',
                            expectedResponse: 'text',
                            validationRules: ['min_length:2'],
                            nextStep: 'collect_preferences'
                        },
                        {
                            id: 'collect_preferences',
                            name: 'Coletar Preferências',
                            order: 2,
                            message: 'Perfeito, {{userName}}! 😊\n\nQue tipo de serviço você tem mais interesse?',
                            messageType: 'interactive',
                            buttons: [
                                { id: 'cabelo', title: 'Cabelo' },
                                { id: 'manicure', title: 'Manicure/Pedicure' },
                                { id: 'estetica', title: 'Estética Facial' }
                            ],
                            expectedResponse: 'button',
                            nextStep: 'collect_frequency'
                        },
                        {
                            id: 'collect_frequency',
                            name: 'Frequência de Visitas',
                            order: 3,
                            message: 'Ótima escolha! ✨\n\nCom que frequência você costuma cuidar da beleza?',
                            messageType: 'interactive',
                            buttons: [
                                { id: 'semanal', title: 'Semanalmente' },
                                { id: 'quinzenal', title: 'Quinzenalmente' },
                                { id: 'mensal', title: 'Mensalmente' },
                                { id: 'especial', title: 'Ocasiões especiais' }
                            ],
                            expectedResponse: 'button',
                            nextStep: 'show_services'
                        },
                        {
                            id: 'show_services',
                            name: 'Apresentar Serviços',
                            order: 4,
                            message: `Perfeito! Agora que te conheço melhor, deixa eu te mostrar alguns dos nossos serviços:

💇‍♀️ **Cabelo**: Corte, escova, hidratação, coloração
💅 **Unhas**: Manicure, pedicure, nail art
✨ **Estética**: Limpeza de pele, design de sobrancelha

Quer agendar algo agora ou prefere conhecer mais sobre nossos serviços?`,
                            messageType: 'interactive',
                            buttons: [
                                { id: 'agendar', title: 'Quero agendar!' },
                                { id: 'conhecer', title: 'Conhecer mais' },
                                { id: 'depois', title: 'Depois' }
                            ],
                            expectedResponse: 'button'
                        }
                    ],
                    completionMessage: `Pronto, {{userName}}! 🎉

Agora você já conhece nosso salão e pode agendar seus serviços a qualquer momento.

Para agendar, é só mandar uma mensagem como:
"Quero agendar um corte de cabelo para sexta-feira"

Estamos aqui para te deixar ainda mais linda! 💄✨`
                };
            case 'healthcare':
                return {
                    ...baseFlow,
                    welcomeMessage: `Olá! 🌟 Seja muito bem-vindo(a) ao {{businessName}}.

Estou aqui para te acolher e ajudar no que precisar. 

Vamos começar conhecendo você melhor?`,
                    steps: [
                        {
                            id: 'collect_name',
                            name: 'Coletar Nome',
                            order: 1,
                            message: 'Me diga seu nome, por favor:',
                            messageType: 'text',
                            expectedResponse: 'text',
                            nextStep: 'collect_type'
                        },
                        {
                            id: 'collect_type',
                            name: 'Tipo de Atendimento',
                            order: 2,
                            message: 'Que tipo de atendimento você está buscando?',
                            messageType: 'interactive',
                            buttons: [
                                { id: 'terapia', title: 'Terapia Individual' },
                                { id: 'consulta', title: 'Consulta Psicológica' },
                                { id: 'orientacao', title: 'Orientação' }
                            ],
                            expectedResponse: 'button',
                            nextStep: 'explain_process'
                        },
                        {
                            id: 'explain_process',
                            name: 'Explicar Processo',
                            order: 3,
                            message: `Entendo, {{userName}}. 

Nosso processo é acolhedor e confidencial. Todas as sessões são realizadas em ambiente seguro e profissional.

Você gostaria de agendar uma primeira conversa ou tem alguma dúvida sobre nossos serviços?`,
                            messageType: 'interactive',
                            buttons: [
                                { id: 'agendar', title: 'Agendar conversa' },
                                { id: 'duvidas', title: 'Tenho dúvidas' },
                                { id: 'info', title: 'Mais informações' }
                            ],
                            expectedResponse: 'button'
                        }
                    ],
                    completionMessage: `{{userName}}, foi um prazer te conhecer! 🌟

Estamos aqui para te apoiar em sua jornada de bem-estar e autoconhecimento.

Para agendar uma sessão, é só me mandar uma mensagem. Respondo rapidamente!

Lembre-se: cuidar da mente é um ato de amor próprio. 💙`
                };
            default:
                return {
                    ...baseFlow,
                    welcomeMessage: `Olá! Seja bem-vindo(a) ao {{businessName}}! 

Estou aqui para te ajudar. Vamos começar?`,
                    steps: [
                        {
                            id: 'collect_name',
                            name: 'Coletar Nome',
                            order: 1,
                            message: 'Para começar, qual seu nome?',
                            messageType: 'text',
                            expectedResponse: 'text',
                            nextStep: 'show_services'
                        },
                        {
                            id: 'show_services',
                            name: 'Apresentar Serviços',
                            order: 2,
                            message: `Olá, {{userName}}! 

Oferecemos serviços de qualidade e estamos prontos para te atender.

Quer conhecer nossos serviços ou fazer um agendamento?`,
                            messageType: 'interactive',
                            buttons: [
                                { id: 'servicos', title: 'Ver serviços' },
                                { id: 'agendar', title: 'Agendar' },
                                { id: 'info', title: 'Mais informações' }
                            ],
                            expectedResponse: 'button'
                        }
                    ],
                    completionMessage: `Obrigado, {{userName}}! 

Agora você já conhece nossos serviços. Para agendar ou tirar dúvidas, é só mandar uma mensagem!

Estamos aqui para te atender! 😊`
                };
        }
    }
    async executeOnboardingStep(userId, tenantId, step) {
        try {
            const { data: user } = await database_1.supabaseAdmin
                .from('users')
                .select('phone, name')
                .eq('id', userId)
                .single();
            if (!user)
                return;
            const stepData = await this.getStepData(userId, tenantId);
            const personalizedMessage = this.personalizeMessage(step.message, {
                userName: stepData.name || user.name || 'Cliente',
                ...stepData
            });
            switch (step.messageType) {
                case 'text':
                    await this.whatsappService.sendTextMessage(user.phone, personalizedMessage);
                    break;
                case 'interactive':
                    if (step.buttons && step.buttons.length > 0) {
                        await this.whatsappService.sendButtonMessage(user.phone, personalizedMessage, step.buttons);
                    }
                    break;
                default:
                    await this.whatsappService.sendTextMessage(user.phone, personalizedMessage);
            }
            logger_1.logger.info('Onboarding step executed', { userId, tenantId, stepId: step.id });
        }
        catch (error) {
            logger_1.logger.error('Error executing onboarding step', { error, userId, tenantId, step: step.id });
        }
    }
    validateResponse(step, response, responseType) {
        if (step.expectedResponse && step.expectedResponse !== responseType) {
            return false;
        }
        if (responseType === 'button' && step.buttons) {
            return step.buttons.some(btn => btn.id === response);
        }
        if (responseType === 'text' && step.validationRules) {
            for (const rule of step.validationRules) {
                if (rule.startsWith('min_length:')) {
                    const minLength = parseInt(rule.split(':')[1]);
                    if (response.length < minLength) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
    async sendValidationError(phone, step) {
        let errorMessage = 'Por favor, tente novamente.';
        if (step.expectedResponse === 'button') {
            errorMessage = 'Por favor, clique em uma das opções disponíveis.';
        }
        else if (step.validationRules?.includes('min_length:2')) {
            errorMessage = 'Por favor, digite um nome com pelo menos 2 caracteres.';
        }
        await this.whatsappService.sendTextMessage(phone, errorMessage);
    }
    personalizeMessage(message, data) {
        let personalizedMessage = message;
        Object.keys(data).forEach(key => {
            const placeholder = `{{${key}}}`;
            personalizedMessage = personalizedMessage.replace(new RegExp(placeholder, 'g'), data[key] || '');
        });
        return personalizedMessage;
    }
    async createOnboardingState(userId, tenantId) {
        await database_1.supabaseAdmin
            .from('user_onboarding_states')
            .upsert({
            user_id: userId,
            tenant_id: tenantId,
            current_step: 'collect_name',
            step_data: {},
            is_completed: false,
            started_at: new Date().toISOString()
        });
    }
    async getOnboardingState(userId, tenantId) {
        const { data } = await database_1.supabaseAdmin
            .from('user_onboarding_states')
            .select('*')
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .single();
        return data;
    }
    async updateOnboardingStep(userId, tenantId, stepId) {
        await database_1.supabaseAdmin
            .from('user_onboarding_states')
            .update({ current_step: stepId })
            .eq('user_id', userId)
            .eq('tenant_id', tenantId);
    }
    async storeStepResponse(userId, tenantId, stepId, response) {
        const { data: currentState } = await database_1.supabaseAdmin
            .from('user_onboarding_states')
            .select('step_data')
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .single();
        const stepData = currentState?.step_data || {};
        stepData[stepId] = response;
        await database_1.supabaseAdmin
            .from('user_onboarding_states')
            .update({ step_data: stepData })
            .eq('user_id', userId)
            .eq('tenant_id', tenantId);
    }
    async getStepData(userId, tenantId) {
        const { data } = await database_1.supabaseAdmin
            .from('user_onboarding_states')
            .select('step_data')
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .single();
        return data?.step_data || {};
    }
    async completeOnboarding(userId, tenantId, flow) {
        await database_1.supabaseAdmin
            .from('user_onboarding_states')
            .update({
            is_completed: true,
            completed_at: new Date().toISOString()
        })
            .eq('user_id', userId)
            .eq('tenant_id', tenantId);
        await phone_validation_service_1.phoneValidationService.markUserAsOnboarded(userId, tenantId);
        const { data: user } = await database_1.supabaseAdmin
            .from('users')
            .select('phone, name')
            .eq('id', userId)
            .single();
        if (user) {
            const stepData = await this.getStepData(userId, tenantId);
            const completionMessage = this.personalizeMessage(flow.completionMessage, {
                userName: stepData.name || user.name || 'Cliente',
                ...stepData
            });
            await this.whatsappService.sendTextMessage(user.phone, completionMessage);
            if (this.emailService.isReady()) {
                await this.emailService.sendWelcomeEmail(userId, tenantId);
            }
        }
        logger_1.logger.info('Onboarding completed', { userId, tenantId });
    }
}
exports.OnboardingFlowService = OnboardingFlowService;
exports.onboardingFlowService = new OnboardingFlowService();
//# sourceMappingURL=onboarding-flow.service.js.map