/**
 * Webhook V3 Flow Integration Service
 * Integração gradual do Flow Lock System com webhook v3 existente
 * Permite rollback completo sem quebrar funcionalidade atual
 */

import { WebhookFlowOrchestratorService } from './webhook-flow-orchestrator.service';
import { supabaseAdmin } from '../config/database';

export interface V3IntegrationConfig {
  enableFlowLock: boolean;
  gradualRollout: boolean;
  rolloutPercentage: number;
  fallbackToLegacy: boolean;
  logComparisons: boolean;
}

export class WebhookV3FlowIntegrationService {
  private orchestrator: WebhookFlowOrchestratorService;
  private config: V3IntegrationConfig;

  constructor(config?: Partial<V3IntegrationConfig>) {
    this.orchestrator = new WebhookFlowOrchestratorService();
    this.config = {
      enableFlowLock: process.env.ENABLE_FLOW_LOCK === 'true',
      gradualRollout: process.env.GRADUAL_ROLLOUT === 'true',
      rolloutPercentage: parseInt(process.env.ROLLOUT_PERCENTAGE || '10'),
      fallbackToLegacy: process.env.FALLBACK_TO_LEGACY !== 'false',
      logComparisons: process.env.LOG_FLOW_COMPARISONS === 'true',
      ...config
    };
    
    // 🔍 DEBUG: Log das variáveis de ambiente e configuração inicial
    console.log('🔧 ENV VARIABLES:', {
      ENABLE_FLOW_LOCK: process.env.ENABLE_FLOW_LOCK,
      GRADUAL_ROLLOUT: process.env.GRADUAL_ROLLOUT,
      ROLLOUT_PERCENTAGE: process.env.ROLLOUT_PERCENTAGE,
      FALLBACK_TO_LEGACY: process.env.FALLBACK_TO_LEGACY
    });
    console.log('🔒 Flow Lock Configuration:', {
      enableFlowLock: this.config.enableFlowLock,
      gradualRollout: this.config.gradualRollout,
      rolloutPercentage: this.config.rolloutPercentage,
      fallbackToLegacy: this.config.fallbackToLegacy
    });
  }

  /**
   * Ponto de integração principal - substitui generateLLMResponse quando ativo
   */
  async processWithFlowLockOrFallback(
    session: any,
    text: string,
    intent: string | null,
    tenantData: any,
    availabilityBlock?: any,
    businessHoursBlock?: string,
    upsellBlock?: string,
    legacyGenerateLLMResponse?: Function
  ): Promise<string> {
    
    // 1. Verificar se deve usar Flow Lock System
    if (!this.shouldUseFlowLock(session, tenantData)) {
      console.log(`🔄 [FLOW-INTEGRATION] Usando sistema legado - tenant: ${tenantData?.tenant?.id}`);
      return legacyGenerateLLMResponse ? 
        await legacyGenerateLLMResponse(session, text, intent, tenantData, availabilityBlock, businessHoursBlock || '', upsellBlock || '') :
        'Sistema legado não disponível.';
    }

    console.log(`🔒 [FLOW-INTEGRATION] Usando Flow Lock System - tenant: ${tenantData?.tenant?.id}`);

    try {
      // 2. Executar Flow Lock System
      const result = await this.orchestrator.orchestrateWebhookFlow(
        text,
        tenantData?.user?.id || 'unknown',
        tenantData?.tenant?.id || 'unknown',
        this.buildTenantConfig(tenantData),
        this.buildExistingContext(session)
      );

      // 3. Persistir contexto atualizado de volta na sessão
      await this.syncContextBackToSession(session, result.updatedContext);

      // 4. Capturar telemetria
      await this.captureTelemetry(result.telemetryData, tenantData?.tenant?.id);

      // 5. Log comparação se habilitado
      if (this.config.logComparisons && legacyGenerateLLMResponse) {
        await this.logComparison(
          session, text, intent, tenantData, availabilityBlock, businessHoursBlock || '', upsellBlock || '',
          result.aiResponse,
          legacyGenerateLLMResponse
        );
      }

      return result.aiResponse;

    } catch (error) {
      console.error('🚨 [FLOW-INTEGRATION] Erro no Flow Lock System:', error);
      
      // Fallback para sistema legado se habilitado
      if (this.config.fallbackToLegacy && legacyGenerateLLMResponse) {
        console.log('🔄 [FLOW-INTEGRATION] Fallback para sistema legado');
        return await legacyGenerateLLMResponse(session, text, intent, tenantData, availabilityBlock, businessHoursBlock || '', upsellBlock || '');
      }
      
      return 'Desculpe, ocorreu um erro interno. Tente novamente.';
    }
  }

  /**
   * Determina se deve usar Flow Lock para esta requisição
   */
  private shouldUseFlowLock(session: any, tenantData: any): boolean {
    const debugInfo = {
      sessionId: session?.sessionId || 'none',
      tenantId: tenantData?.tenant?.id || 'none',
      userId: tenantData?.user?.id || 'none'
    };
    
    // 1. Verificação global
    if (!this.config.enableFlowLock) {
      console.log('🔄 [FLOW-DECISION] Flow Lock DISABLED globally', debugInfo);
      return false;
    }

    // 2. Rollout gradual por porcentagem
    if (this.config.gradualRollout) {
      const sessionId = session?.sessionId || tenantData?.user?.id || 'default';
      const hash = this.simpleHash(sessionId);
      const percentage = hash % 100;
      console.log('🎲 [FLOW-DECISION] Rollout check:', { 
        ...debugInfo, 
        hash: percentage, 
        threshold: this.config.rolloutPercentage,
        willActivate: percentage < this.config.rolloutPercentage
      });
      if (percentage >= this.config.rolloutPercentage) {
        console.log('🔄 [FLOW-DECISION] Flow Lock DISABLED by rollout percentage');
        return false;
      }
    }

    // 3. Blacklist de tenants (se necessário)
    const blacklistedTenants = process.env.FLOW_LOCK_BLACKLIST?.split(',') || [];
    if (blacklistedTenants.includes(tenantData?.tenant?.id)) {
      console.log('🔄 [FLOW-DECISION] Flow Lock DISABLED - tenant blacklisted', debugInfo);
      return false;
    }

    // 4. Verificar se tenant tem configuração mínima necessária
    // Em demo mode (via token), user pode ser null
    const isDemoMode = session?.demoMode || false;
    console.log('🔍 [FLOW-DEBUG] Session demoMode check:', { 
      hasDemoMode: !!session?.demoMode, 
      demoModeValue: session?.demoMode,
      isDemoMode,
      hasTenantId: !!tenantData?.tenant?.id,
      hasUserId: !!tenantData?.user?.id
    });
    
    if (!tenantData?.tenant?.id || (!isDemoMode && !tenantData?.user?.id)) {
      console.log('🔄 [FLOW-DECISION] Flow Lock DISABLED - missing tenant/user data', {
        ...debugInfo,
        isDemoMode,
        reason: !tenantData?.tenant?.id ? 'no_tenant' : 'no_user'
      });
      return false;
    }

    console.log('🔒 [FLOW-DECISION] Flow Lock ENABLED', debugInfo);
    return true;
  }

  /**
   * Constrói config do tenant para Flow Lock System
   */
  private buildTenantConfig(tenantData: any) {
    return {
      domain: tenantData?.tenant?.domain || 'general',
      services: tenantData?.tenant?.services || [],
      policies: {
        address: tenantData?.tenant?.business_address || '',
        hours: tenantData?.tenant?.business_hours || '',
        cancellation: tenantData?.tenant?.cancellation_policy || '',
        phone: tenantData?.tenant?.business_phone || ''
      }
    };
  }

  /**
   * Constrói contexto existente da sessão v3
   */
  private buildExistingContext(session: any) {
    return {
      // Mapear campos da sessão v3 para enhanced context
      session_id: session?.sessionId || session?.id,
      name: session?.name,
      email: session?.email,
      gender: session?.gender,
      messageCount: session?.messageCount || 0,
      lastActivity: session?.lastActivity,
      history: session?.history || []
    };
  }

  /**
   * Sincroniza contexto enhanced de volta para sessão v3
   */
  private async syncContextBackToSession(session: any, enhancedContext: any) {
    try {
      // Atualizar campos da sessão com dados do enhanced context
      if (enhancedContext.flow_lock) {
        session.flowLock = {
          active_flow: enhancedContext.flow_lock.active_flow,
          step: enhancedContext.flow_lock.step,
          expires_at: enhancedContext.flow_lock.expires_at
        };
      }

      session.lastFlowIntent = enhancedContext.intent_history?.[enhancedContext.intent_history.length - 1]?.intent;
      session.lastFlowUpdate = new Date().toISOString();
      
      // Salvar sessão atualizada no cache (assumindo que existe método de save)
      // await this.cache.setSession(sessionKey, session);
      
    } catch (error) {
      console.warn('⚠️ [FLOW-INTEGRATION] Erro ao sincronizar contexto:', error);
    }
  }

  /**
   * Captura telemetria do Flow Lock System
   */
  private async captureTelemetry(telemetryData: any, tenantId: string) {
    try {
      const telemetryRecord = {
        tenant_id: tenantId,
        event_type: 'flow_lock_decision',
        event_data: {
          intent: telemetryData.intent,
          confidence: telemetryData.confidence,
          decision_method: telemetryData.decision_method,
          flow_lock_active: telemetryData.flow_lock_active,
          processing_time_ms: telemetryData.processing_time_ms
        },
        created_at: new Date().toISOString()
      };

      // Log telemetria (tabela ainda não criada)
      console.log('📊 [TELEMETRY]', JSON.stringify(telemetryRecord));
        
    } catch (error) {
      console.warn('⚠️ [FLOW-INTEGRATION] Erro ao capturar telemetria:', error);
    }
  }

  /**
   * Log de comparação entre sistemas (para análise A/B)
   */
  private async logComparison(
    session: any,
    text: string,
    intent: string | null,
    tenantData: any,
    availabilityBlock: any,
    businessHoursBlock: string,
    upsellBlock: string,
    flowLockResponse: string,
    legacyGenerateLLMResponse: Function
  ) {
    try {
      // Executar sistema legado para comparação
      const legacyResponse = await legacyGenerateLLMResponse(session, text, intent, tenantData, availabilityBlock, businessHoursBlock, upsellBlock);
      
      const comparison = {
        tenant_id: tenantData?.tenant?.id,
        user_input: text,
        intent_detected: intent,
        flow_lock_response: flowLockResponse,
        legacy_response: legacyResponse,
        responses_match: flowLockResponse.trim() === legacyResponse.trim(),
        timestamp: new Date().toISOString()
      };

      // Log comparação para análise posterior
      console.log('🔍 [COMPARISON]', JSON.stringify(comparison));

      console.log(`📊 [FLOW-COMPARISON] Logged comparison - Match: ${comparison.responses_match}`);
      
    } catch (error) {
      console.warn('⚠️ [FLOW-INTEGRATION] Erro no log de comparação:', error);
    }
  }

  /**
   * Hash simples para distribuição de rollout
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Métricas do sistema de integração
   */
  async getIntegrationMetrics(tenantId?: string) {
    try {
      // Mock data para demonstração (tabela ainda não criada)
      const mockTelemetryData = [
        { event_data: { processing_time_ms: 150, decision_method: 'command', intent: 'booking', flow_lock_active: true } },
        { event_data: { processing_time_ms: 89, decision_method: 'regex', intent: 'pricing', flow_lock_active: false } }
      ];

      const telemetryData = mockTelemetryData;

      const metrics = {
        total_requests: telemetryData?.length || 0,
        flow_lock_usage: telemetryData?.filter((t: any) => t.event_data.flow_lock_active).length || 0,
        avg_processing_time: 0,
        decision_methods: {} as Record<string, number>,
        intents_distribution: {} as Record<string, number>
      };

      if (telemetryData && telemetryData.length > 0) {
        metrics.avg_processing_time = telemetryData.reduce((sum: number, t: any) => 
          sum + (t.event_data.processing_time_ms || 0), 0) / telemetryData.length;

        telemetryData.forEach((t: any) => {
          const method = t.event_data.decision_method;
          const intent = t.event_data.intent;
          
          metrics.decision_methods[method] = (metrics.decision_methods[method] || 0) + 1;
          metrics.intents_distribution[intent] = (metrics.intents_distribution[intent] || 0) + 1;
        });
      }

      return metrics;
      
    } catch (error) {
      console.error('🚨 [FLOW-INTEGRATION] Erro ao obter métricas:', error);
      return null;
    }
  }
}