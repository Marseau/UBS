/**
 * Orchestrator Core Service
 * Ponto central de entrada que coordena todos os sub-orquestradores
 * Mantém compatibilidade com interface existente
 */

import crypto from 'crypto';
import { supabaseAdmin } from '../../config/database';
import { mergeEnhancedConversationContext } from '../../utils/conversation-context-helper';
import { EnhancedConversationContext } from '../../types/flow-lock.types';

import { IntentDetectionOrchestrator } from './intent-detection-orchestrator';
import { DataCollectionOrchestrator } from './data-collection-orchestrator';
import { ResponseGenerationOrchestrator } from './response-generation-orchestrator';
import { TelemetryOrchestrator } from './telemetry-orchestrator';
import { AppointmentFlowService } from './appointment-flow.service';

import {
  OrchestratorInput,
  OrchestratorResult,
  UserContext,
  TenantContext,
  DataCollectionState
} from '../../types';

export class OrchestratorCoreService {
  private intentDetector: IntentDetectionOrchestrator;
  private dataCollector: DataCollectionOrchestrator;
  private responseGenerator: ResponseGenerationOrchestrator;
  private telemetryHandler: TelemetryOrchestrator;
  private appointmentFlow: AppointmentFlowService;

  constructor() {
    this.intentDetector = new IntentDetectionOrchestrator();
    this.dataCollector = new DataCollectionOrchestrator();
    this.responseGenerator = new ResponseGenerationOrchestrator();
    this.telemetryHandler = new TelemetryOrchestrator();
    this.appointmentFlow = new AppointmentFlowService();
  }

  /**
   * Método principal de orquestração - mantém compatibilidade com interface existente
   */
  async orchestrateWebhookFlow(input: OrchestratorInput): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const { messageText, userPhone, tenantId, isDemo = false, messageSource } = input;

    try {
      // 1. Resolver tenant se não fornecido
      const resolvedTenantId = tenantId || await this.resolveTenantByPhone(input.whatsappNumber);
      if (!resolvedTenantId) {
        return {
          success: false,
          aiResponse: "Número WhatsApp não encontrado no sistema.",
          error: "tenant_not_found"
        };
      }

      // 2. Obter contextos de usuário e tenant
      const [userContext, tenantContext] = await Promise.all([
        this.dataCollector.getUserContext(userPhone, resolvedTenantId),
        this.getTenantContext(resolvedTenantId)
      ]);

      // userContext.id já é populado pelo getUserContext que cria usuários automaticamente

      if (!tenantContext) {
        return {
          success: false,
          aiResponse: "Tenant não encontrado.",
          error: "tenant_not_found"
        };
      }

      // 3. Inicializar contexto da conversa
      const sessionId = this.telemetryHandler.generateSessionId(userContext.id, resolvedTenantId);
      const conversationContext = this.createConversationContext({
        sessionId,
        tenantId: resolvedTenantId,
        userPhone,
        isDemo
      });

      // 4. Verificar se usuário precisa de onboarding
      if (userContext.needsOnboarding) {
        return await this.handleOnboarding(
          messageText,
          userContext,
          tenantContext,
          conversationContext,
          messageSource || (isDemo ? 'whatsapp_demo' : 'whatsapp')
        );
      }

      // 5. Verificar primeiro se é um comando específico de agendamento (prioridade)
      const appointmentCommand = this.appointmentFlow.detectAppointmentCommand(messageText);
      console.log('🔍 [ORCHESTRATOR] Appointment command detected:', appointmentCommand, 'for message:', messageText);

      if (appointmentCommand) {
        console.log('✅ [ORCHESTRATOR] Processing appointment command:', appointmentCommand);
        const appointmentResult = await this.handleAppointmentFlow(
          appointmentCommand,
          messageText,
          userContext,
          tenantContext,
          sessionId
        );

        console.log('📋 [ORCHESTRATOR] Appointment result:', appointmentResult);

        if (appointmentResult) {
          console.log('🎯 [ORCHESTRATOR] Returning appointment response with intent:', appointmentCommand);
          return {
            success: true,
            aiResponse: appointmentResult.response,
            intent: appointmentCommand,
            conversationOutcome: this.determineConversationOutcome(
              appointmentCommand,
              messageText,
              appointmentResult.response
            )
          };
        }
      }

      // 5.1. Processar intent geral para usuário já cadastrado (fallback)
      const intentResult = await this.intentDetector.detectIntent(messageText, conversationContext);

      // 6. Gerar resposta baseada no intent
      const aiResponse = await this.responseGenerator.generateResponse({
        intent: intentResult.intent || 'general_inquiry',
        messageText,
        userContext,
        tenantContext,
        isDemo
      });

      // 7. Determinar conversation outcome
      const conversationOutcome = this.determineConversationOutcome(
        intentResult.intent,
        messageText,
        aiResponse
      );

      // 8. Registrar telemetria
      const telemetryData = this.telemetryHandler.createTelemetryData(
        intentResult.intent,
        intentResult.decision_method,
        intentResult.confidence,
        intentResult.processing_time_ms
      );

      await this.telemetryHandler.recordTelemetry(
        {
          sessionId,
          userId: userContext.id,
          tenantId: resolvedTenantId,
          messageText,
          aiResponse,
          conversationContext,
          messageSource
        },
        telemetryData,
        conversationOutcome
      );

      return {
        success: true,
        aiResponse,
        intent: intentResult.intent,
        conversationOutcome,
        telemetryData
      };

    } catch (error) {
      console.error('❌ [ORCHESTRATOR] Fatal error:', error);

      return {
        success: false,
        aiResponse: "Erro interno. Tente novamente em alguns instantes.",
        error: error instanceof Error ? error.message : 'unknown_error'
      };
    }
  }

  /**
   * Gerenciar fluxo de onboarding determinístico
   */
  private async handleOnboarding(
    messageText: string,
    userContext: UserContext,
    tenantContext: TenantContext,
    conversationContext: EnhancedConversationContext,
    messageSource: 'whatsapp' | 'whatsapp_demo' | 'web' | 'api'
  ): Promise<OrchestratorResult> {
    // Determinar etapa atual do onboarding
    const currentState = await this.dataCollector.determineOnboardingState(userContext);

    if (!currentState) {
      // Onboarding já completo, processar normalmente
      const intentResult = await this.intentDetector.detectIntent(messageText, conversationContext);

      const aiResponse = await this.responseGenerator.generateResponse({
        intent: intentResult.intent || 'greeting',
        messageText,
        userContext,
        tenantContext,
        isDemo: conversationContext.mode === 'demo'
      });

      return {
        success: true,
        aiResponse,
        intent: intentResult.intent,
        conversationOutcome: 'onboarding_completed'
      };
    }

    // Verificar se é primeira interação (saudação)
    const isGreeting = this.isGreetingMessage(messageText);
    if (isGreeting && currentState === DataCollectionState.NEED_NAME) {
      const prompt = this.dataCollector.getOnboardingPrompt(currentState);

      // Registrar telemetria para a saudação inicial
      const telemetryData = this.telemetryHandler.createTelemetryData(
        'onboarding',
        'dictionary', // Onboarding é determinístico
        1.0,
        Date.now() - new Date(conversationContext.session_started_at).getTime()
      );

      await this.telemetryHandler.recordTelemetry(
        {
          sessionId: conversationContext.session_id,
          userId: userContext.id,
          tenantId: tenantContext.id,
          messageText,
          aiResponse: prompt,
          conversationContext,
          messageSource
        },
        telemetryData,
        'onboarding_started'
      );

      return {
        success: true,
        aiResponse: prompt,
        intent: 'onboarding',
        conversationOutcome: 'onboarding_started',
        telemetryData
      };
    }

    // Processar entrada do onboarding
    const onboardingResult = await this.dataCollector.processOnboardingInput(
      messageText,
      currentState,
      userContext,
      tenantContext.id
    );

    if (!onboardingResult.success) {
      return {
        success: true,
        aiResponse: onboardingResult.response,
        intent: 'onboarding_error',
        conversationOutcome: 'onboarding_validation_failed'
      };
    }

    const outcome = onboardingResult.completedOnboarding ?
      'onboarding_completed' :
      'onboarding_in_progress';

    // Registrar telemetria do onboarding
    const processingTime = Date.now() - new Date(conversationContext.session_started_at).getTime();
    const telemetryData = this.telemetryHandler.createTelemetryData(
      'onboarding',
      onboardingResult.aiMetrics ? 'llm' : 'dictionary', // Use LLM when AI was used, dictionary otherwise
      1.0, // Confidence is always 1.0 for onboarding
      onboardingResult.aiMetrics?.processing_time_ms || processingTime,
      onboardingResult.aiMetrics?.model_used,
      onboardingResult.aiMetrics?.tokens
    );

    await this.telemetryHandler.recordTelemetry(
      {
        sessionId: conversationContext.session_id,
        userId: userContext.id,
        tenantId: tenantContext.id,
        messageText,
        aiResponse: onboardingResult.response,
        conversationContext,
        messageSource
      },
      telemetryData,
      outcome
    );

    return {
      success: true,
      aiResponse: onboardingResult.response,
      intent: 'onboarding',
      conversationOutcome: outcome,
      telemetryData
    };
  }

  // Métodos utilitários privados

  private async resolveTenantByPhone(whatsappNumber?: string): Promise<string | null> {
    if (!whatsappNumber) return null;

    const normalizedPhone = whatsappNumber.replace(/\D/g, '');
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('phone', normalizedPhone)
      .eq('status', 'active')
      .single();

    return tenant?.id || null;
  }

  private async getTenantContext(tenantId: string): Promise<TenantContext | null> {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, name, domain, phone, business_name')
      .eq('id', tenantId)
      .single();

    if (!tenant) return null;

    return {
      id: tenant.id,
      name: tenant.name,
      domain: tenant.domain || 'general',
      phone: tenant.phone,
      business_name: tenant.business_name
    };
  }

  private createConversationContext(params: {
    sessionId: string;
    tenantId: string;
    userPhone: string;
    isDemo: boolean;
  }): EnhancedConversationContext {
    const now = new Date().toISOString();

    return {
      session_id: params.sessionId,
      session_started_at: now,
      last_message_at: now,
      duration_ms: 0,
      duration_minutes: 0,
      message_count: 0,
      tenant_id: params.tenantId,
      domain: 'general', // Will be updated with tenant data
      source: params.isDemo ? 'demo' : 'whatsapp',
      mode: params.isDemo ? 'demo' : 'prod',
      flow_lock: null,
      intent_history: []
    };
  }

  /**
   * Handle appointment flow commands
   */
  private async handleAppointmentFlow(
    command: string,
    messageText: string,
    userContext: UserContext,
    tenantContext: TenantContext,
    sessionId: string
  ): Promise<{ response: string; metadata?: any } | null> {
    try {
      const ctx = {
        message: messageText,
        userPhone: userContext.phone,
        sessionId: sessionId,
        userId: userContext.id,
        tenantId: tenantContext.id,
        tenantConfig: tenantContext
      };

      switch (command) {
        case 'my_appointments':
          return await this.appointmentFlow.handleMyAppointments(ctx);

        case 'cancel_appointment':
          return await this.appointmentFlow.handleCancelAppointment(ctx);

        case 'reschedule':
          return await this.appointmentFlow.handleRescheduleAppointment(ctx);

        case 'confirm':
          // Check if this is a booking selection confirmation: "Quero o serviço X no horário Y"
          const message = ctx.message.toLowerCase().trim();
          const isBookingConfirmation = /servi[cç]o\s+\d+.*hor[áa]rio\s+\d+/.test(message);

          if (isBookingConfirmation) {
            return await this.appointmentFlow.handleBookingConfirmation(ctx);
          } else {
            return await this.appointmentFlow.handleConfirmAppointment(ctx);
          }

        case 'booking':
          return await this.appointmentFlow.handleBookingIntent(ctx);

        default:
          console.log(`[APPOINTMENT-FLOW] Comando não implementado: ${command}`);
          return null;
      }
    } catch (error) {
      console.error('[APPOINTMENT-FLOW] Erro ao processar comando:', error);
      return {
        response: 'Erro ao processar comando de agendamento. Tente novamente.',
        metadata: { error: true }
      };
    }
  }

  private isGreetingMessage(messageText: string): boolean {
    const greetings = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'eai'];
    const normalized = messageText.toLowerCase().trim();
    return greetings.some(greeting => normalized.includes(greeting));
  }

  private determineConversationOutcome(
    intent: string | null,
    _messageText: string,
    _aiResponse: string
  ): string {
    // Mapear intents para outcomes conforme lógica existente
    const outcomeMap: Record<string, string> = {
      'my_appointments': 'appointment_inquiry',
      'services': 'service_inquiry',
      'pricing': 'price_inquiry',
      'address': 'location_inquiry',
      'business_hours': 'business_hours_inquiry',
      'booking': 'appointment_inquiry',
      'cancel_appointment': 'appointment_cancelled',
      'reschedule': 'appointment_modified',
      'confirm': 'appointment_confirmed',
      'onboarding': 'onboarding_completed'
    };

    return outcomeMap[intent || ''] || 'info_request_fulfilled';
  }
}