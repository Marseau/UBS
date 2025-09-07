/**
 * Contextual Policies Service
 * Sistema inteligente de políticas contextuais que aplica regras de negócio 
 * baseadas em contexto, histórico do usuário e configurações do tenant
 */

import { supabaseAdmin } from '../config/database';
import { EnhancedConversationContext } from '../types/flow-lock.types';
import { IntentKey } from './deterministic-intent-detector.service';
import { parseISO, differenceInHours } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { RedisProductionConfig } from '../config/redis-production.config';

// Redis client otimizado para produção  
const redis = RedisProductionConfig.getRedisInstance();

export interface PolicyDecision {
  allowIntent: boolean;
  modifiedIntent?: IntentKey;
  suggestedResponse?: string;
  actionRequired?: 'redirect' | 'block' | 'modify' | 'enhance';
  contextualMessage?: string;
  addedContext?: Record<string, any>; // NEW: Context metadata for orchestrator
  priority: 'low' | 'medium' | 'high';
  /**
   * Código padronizado de razão para auditoria:
   * - POLICY_*: Decisões baseadas em políticas de negócio (ex: POLICY_BLOCK_<policyId>)
   * - SYSTEM_*: Decisões internas do sistema (ex: SYSTEM_ERROR_FALLBACK, SYSTEM_NEW_USER_REDIRECT)
   */
  reasonCode: string;
}

export interface BusinessPolicy {
  id: string;
  name: string;
  intent: IntentKey | 'all';
  conditions: PolicyCondition[];
  actions: PolicyAction[];
  priority: number;
  enabled: boolean;
  tenant_scoped: boolean;
}

export interface PolicyCondition {
  type: 'time' | 'user_type' | 'appointment_count' | 'last_interaction' | 'flow_state' | 'tenant_config';
  operator: 'equals' | 'greater' | 'less' | 'greater_equal' | 'less_equal' | 'contains' | 'not_contains' | 'in_range' | 'exists' | 'day_of_week';
  value: any;
  field?: string;
}

export interface PolicyAction {
  type: 'block' | 'redirect' | 'enhance' | 'modify_response' | 'add_context';
  target?: IntentKey;
  message?: string;
  metadata?: Record<string, any>;
}

export interface UserContext {
  id?: string;
  name?: string;
  email?: string;
  phone: string;
  tenant_id: string;
  is_new_user: boolean;
  total_appointments: number;
  last_appointment?: Date;
  last_interaction?: Date;
  vip_status: boolean;
  preferred_time?: string;
  cancelled_count: number;
  noshow_count: number;
  avg_days_between_appointments: number;
  created_at?: Date;
}

export class ContextualPoliciesService {

  /**
   * Aplica políticas contextuais para um intent específico
   */
  async applyPolicies(
    intent: IntentKey,
    userPhone: string,
    tenantId: string,
    context: EnhancedConversationContext,
    messageText: string,
    sessionId?: string
  ): Promise<PolicyDecision> {
    
    console.log(`🔐 [POLICIES] Aplicando políticas para intent '${intent}' - tenant: ${tenantId}`);

    try {
      // 1. Carregar contexto do usuário
      const userContext = await this.getUserContext(userPhone, tenantId);
      
      // 2. Carregar políticas aplicáveis 
      const applicablePolicies = await this.getApplicablePolicies(intent, tenantId);
      
      // 3. Avaliar cada política em ordem de prioridade
      for (const policy of applicablePolicies) {
        const decision = await this.evaluatePolicy(policy, userContext, context, messageText, intent);
        if (decision) {
          console.log(`🔐 [POLICIES] Política '${policy.name}' aplicada - ação: ${decision.actionRequired}`);
          
          // Registrar auditoria da política aplicada com session tracking
          await this.logPolicyApplication(policy.id, tenantId, userPhone, intent, decision, sessionId);
          
          return decision;
        }
      }

      // 4. Aplicar políticas padrão do sistema
      const systemDecision = await this.applySystemPolicies(intent, userContext, context, messageText);
      if (systemDecision.actionRequired !== 'enhance') {
        return systemDecision;
      }

      // 5. Sem restrições - prosseguir com melhorias contextuais
      const enhancementDecision = await this.applyContextualEnhancements(intent, userContext, context, messageText);
      
      return enhancementDecision;

    } catch (error) {
      console.error('❌ [POLICIES] Erro ao aplicar políticas:', error);
      
      // Fallback seguro - permitir processamento normal
      return {
        allowIntent: true,
        priority: 'low',
        reasonCode: 'SYSTEM_ERROR_FALLBACK'
      };
    }
  }

  /**
   * Carrega contexto completo do usuário com agregações otimizadas (CORRIGIDO)
   */
  private async getUserContext(phone: string, tenantId: string): Promise<UserContext> {
    const startTime = Date.now();
    
    try {
      console.log(`📊 [POLICIES] getUserContext - tenant: ${tenantId}, phone: ${phone.substring(0, 8)}***`);
      
      // Usar função otimizada do banco de dados
      const { data: userContextData } = await (supabaseAdmin as any)
        .rpc('get_user_context_complete', {
          p_tenant_id: tenantId,
          p_phone: phone
        });

      const elapsed = Date.now() - startTime;

      if (!userContextData || userContextData.length === 0) {
        console.log(`👤 [POLICIES] New user context - tenant: ${tenantId}, phone: ${phone.substring(0, 8)}***, elapsed: ${elapsed}ms`);
        
        // Usuário novo - retornar contexto básico
        return {
          phone,
          tenant_id: tenantId,
          is_new_user: true,
          total_appointments: 0,
          vip_status: false,
          cancelled_count: 0,
          noshow_count: 0,
          avg_days_between_appointments: 0
        };
      }

      const userData = userContextData[0];
      const userContext = {
        id: userData.user_id,
        name: userData.name || undefined,
        email: userData.email || undefined,
        phone: userData.phone,
        tenant_id: tenantId,
        is_new_user: userData.is_new_user,
        total_appointments: userData.total_appointments || 0,
        last_appointment: userData.last_appointment_time ? parseISO(userData.last_appointment_time) : undefined,
        last_interaction: userData.last_interaction_time ? parseISO(userData.last_interaction_time) : undefined,
        vip_status: userData.vip_status || false,
        cancelled_count: userData.cancelled_count || 0,
        noshow_count: userData.noshow_count || 0,
        avg_days_between_appointments: userData.avg_days_between_appointments || 0,
        created_at: userData.created_at ? parseISO(userData.created_at) : undefined
      };
      
      console.log(`✅ [POLICIES] User context loaded - tenant: ${tenantId}, phone: ${phone.substring(0, 8)}***, appointments: ${userContext.total_appointments}, vip: ${userContext.vip_status}, elapsed: ${elapsed}ms`);
      
      return userContext;
      
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`❌ [POLICIES] Error loading user context - tenant: ${tenantId}, phone: ${phone.substring(0, 8)}***, elapsed: ${elapsed}ms, error:`, error);
      
      // Fallback seguro para contexto de usuário novo
      return {
        phone,
        tenant_id: tenantId,
        is_new_user: true,
        total_appointments: 0,
        vip_status: false,
        cancelled_count: 0,
        noshow_count: 0,
        avg_days_between_appointments: 0
      };
    }
  }

  /**
   * Busca políticas aplicáveis com cache Redis
   */
  private async getApplicablePolicies(intent: IntentKey, tenantId: string): Promise<BusinessPolicy[]> {
    try {
      // Cache key com TTL de 60 segundos
      const cacheKey = `policies:${tenantId}:${intent}:v1`;
      
      // Tentar buscar do cache primeiro
      try {
        const cachedPolicies = await redis.get(cacheKey);
        if (cachedPolicies) {
          console.log(`🚀 [POLICIES] Cache hit para ${tenantId}:${intent}`);
          return JSON.parse(cachedPolicies);
        }
      } catch (cacheError) {
        console.warn('⚠️ [POLICIES] Erro no cache Redis:', cacheError);
      }
      
      console.log(`🔍 [POLICIES] Cache miss - buscando do banco ${tenantId}:${intent}`);
      
      // Buscar do banco de dados
      const { data: policies, error } = await (supabaseAdmin as any)
        .from('business_policies')
        .select(`
          id, name, intent, priority, enabled, tenant_scoped, created_at, updated_at,
          business_policy_conditions(id, type, operator, field, value_json),
          business_policy_actions(id, type, target, message, metadata_json)
        `)
        .eq('tenant_id', tenantId)
        .in('intent', [intent, 'all'])
        .eq('enabled', true)
        .order('priority', { ascending: true });

      if (error) {
        console.error('❌ [POLICIES] Erro ao buscar políticas:', error);
        return [];
      }

      // Transformar dados do banco para interface esperada
      const transformedPolicies: BusinessPolicy[] = (policies || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        intent: p.intent as IntentKey | 'all',
        conditions: (p.business_policy_conditions || []).map((c: any) => ({
          type: c.type,
          operator: c.operator,
          field: c.field,
          value: c.value_json
        })),
        actions: (p.business_policy_actions || []).map((a: any) => ({
          type: a.type,
          target: a.target,
          message: a.message,
          metadata: a.metadata_json
        })),
        priority: p.priority,
        enabled: p.enabled,
        tenant_scoped: p.tenant_scoped
      }));

      // Armazenar no cache por 60 segundos
      try {
        await redis.setex(cacheKey, 60, JSON.stringify(transformedPolicies));
      } catch (cacheError) {
        console.warn('⚠️ [POLICIES] Erro ao salvar no cache:', cacheError);
      }

      console.log(`✅ [POLICIES] Encontradas ${transformedPolicies.length} políticas aplicáveis`);
      return transformedPolicies;
      
    } catch (error) {
      console.error('❌ [POLICIES] Erro crítico ao buscar políticas:', error);
      return [];
    }
  }
  
  /**
   * Invalida cache de políticas para um tenant
   */
  async invalidatePolicyCache(tenantId: string, intent?: IntentKey): Promise<void> {
    try {
      if (intent) {
        // Invalidar cache específico
        await redis.del(`policies:${tenantId}:${intent}:v1`);
      } else {
        // Invalidar todos os caches do tenant
        const pattern = `policies:${tenantId}:*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
      console.log(`📋 [POLICIES] Cache invalidado para tenant ${tenantId}`);
    } catch (error) {
      console.error('❌ [POLICIES] Erro ao invalidar cache:', error);
    }
  }

  /**
   * Avalia se uma política específica deve ser aplicada
   */
  private async evaluatePolicy(
    policy: BusinessPolicy,
    userContext: UserContext,
    conversationContext: EnhancedConversationContext,
    messageText: string,
    _intent: IntentKey
  ): Promise<PolicyDecision | null> {

    // Avaliar todas as condições da política
    for (const condition of policy.conditions) {
      if (!await this.evaluateCondition(condition, userContext, conversationContext, messageText)) {
        return null; // Condição não atendida, política não se aplica
      }
    }

    // Todas as condições foram atendidas, aplicar TODAS as ações
    if (!policy.actions || policy.actions.length === 0) {
      return null; // Política sem ações definidas
    }
    
    return this.executeMultipleActions(policy);

  }
  
  /**
   * Executa múltiplas ações de uma política - NOVA FUNÇÃO
   */
  private executeMultipleActions(policy: BusinessPolicy): PolicyDecision {
    let allowIntent = true;
    let highestPriority: 'low' | 'medium' | 'high' = 'low';
    let actionRequired: 'redirect' | 'block' | 'modify' | 'enhance' = 'enhance';
    let contextualMessages: string[] = [];
    let addedContext: Record<string, any> = {};
    let suggestedResponse = '';
    let modifiedIntent: IntentKey | undefined;
    
    // Processar todas as ações
    for (const action of policy.actions) {
      switch (action.type) {
        case 'block':
          allowIntent = false;
          suggestedResponse = action.message || '';
          actionRequired = 'block';
          highestPriority = 'high';
          break;
          
        case 'redirect':
          allowIntent = false;
          modifiedIntent = action.target;
          actionRequired = 'redirect';
          if (highestPriority !== 'high') highestPriority = 'medium';
          if (action.message) contextualMessages.push(action.message);
          break;
          
        case 'enhance':
          if (action.message) contextualMessages.push(action.message);
          if (actionRequired === 'enhance' && highestPriority === 'low') highestPriority = 'medium';
          break;
          
        case 'modify_response':
          if (action.message) contextualMessages.push(action.message);
          if (actionRequired !== 'block' && actionRequired !== 'redirect') actionRequired = 'modify';
          if (highestPriority === 'low') highestPriority = 'medium';
          break;
          
        case 'add_context':
          if (action.metadata) {
            addedContext = { ...addedContext, ...action.metadata };
          }
          break;
          
        default:
          console.warn(`⚠️ [POLICIES] Tipo de ação não implementado: ${action.type}`);
      }
    }
    
    return {
      allowIntent,
      modifiedIntent,
      suggestedResponse: suggestedResponse || undefined,
      actionRequired,
      contextualMessage: contextualMessages.length > 0 ? contextualMessages.join(' ') : undefined,
      addedContext: Object.keys(addedContext).length > 0 ? addedContext : undefined,
      priority: highestPriority,
      reasonCode: `POLICY_${actionRequired.toUpperCase()}_${policy.id}`
    };
  }

  /**
   * Avalia uma condição específica - CORRIGIDO com tenant_config
   */
  private async evaluateCondition(
    condition: PolicyCondition,
    userContext: UserContext,
    conversationContext: EnhancedConversationContext,
    _messageText: string
  ): Promise<boolean> {

    switch (condition.type) {
      case 'time':
        return await this.evaluateTimeCondition(condition, userContext.tenant_id);

      case 'user_type':
        return this.evaluateUserCondition(condition, userContext);

      case 'appointment_count':
        return this.evaluateAppointmentCondition(condition, userContext);

      case 'last_interaction':
        return this.evaluateLastInteractionCondition(condition, userContext);

      case 'flow_state':
        return this.evaluateFlowCondition(condition, conversationContext);
        
      case 'tenant_config':
        return this.evaluateTenantConfigCondition(condition, conversationContext);

      default:
        console.warn(`⚠️ [POLICIES] Tipo de condição não implementado: ${condition.type}`);
        return false;
    }
  }

  /**
   * Avalia condições baseadas em tempo - CORRIGIDO com timezone real
   */
  private async evaluateTimeCondition(condition: PolicyCondition, tenantId?: string): Promise<boolean> {
    try {
      // Obter timezone do tenant do banco
      const tenantTimezone = await this.getTenantTimezone(tenantId);
      
      // IMPLEMENTADO: conversão timezone real com date-fns-tz
      const now = new Date();
      const nowInTenantTz = toZonedTime(now, tenantTimezone);
      
      const formatTime = (date: Date) => 
        `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      const currentTime = formatTime(nowInTenantTz);
      
      if (condition.operator === 'in_range') {
        const { start, end } = condition.value;
        
        // Verificação de faixa normal (09:00-18:00)
        if (start <= end) {
          return currentTime >= start && currentTime <= end;
        }
        
        // Faixa noturna que cruza meia-noite (22:00-02:00)
        return (currentTime >= start && currentTime <= '23:59') || 
               (currentTime >= '00:00' && currentTime <= end);
      }
      
      if (condition.operator === 'day_of_week') {
        const { days } = condition.value;
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay = dayNames[nowInTenantTz.getDay()];
        return Array.isArray(days) && days.includes(currentDay);
      }
      
      return false;
      
    } catch (error) {
      console.error('❌ [POLICIES] Erro ao avaliar condição de tempo:', error);
      return false;
    }
  }
  
  /**
   * Obtém timezone do tenant com fallback
   */
  private async getTenantTimezone(tenantId?: string): Promise<string> {
    if (!tenantId) return 'America/Sao_Paulo';
    
    try {
      const { data } = await (supabaseAdmin as any)
        .rpc('get_tenant_timezone', { p_tenant_id: tenantId });
      return data || 'America/Sao_Paulo';
    } catch (error) {
      console.error('❌ [POLICIES] Erro ao obter timezone do tenant:', error);
      return 'America/Sao_Paulo';
    }
  }

  /**
   * Avalia condições baseadas no usuário
   */
  private evaluateUserCondition(condition: PolicyCondition, userContext: UserContext): boolean {
    const fieldValue = userContext[condition.field as keyof UserContext];

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'greater':
        return (fieldValue as number) > condition.value;
      case 'less':
        return (fieldValue as number) < condition.value;
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      default:
        return false;
    }
  }

  /**
   * Avalia condições baseadas em agendamentos - APRIMORADO
   */
  private evaluateAppointmentCondition(condition: PolicyCondition, userContext: UserContext): boolean {
    const fieldValue = userContext[condition.field as keyof UserContext] as number;

    switch (condition.operator) {
      case 'greater':
        return fieldValue > condition.value;
      case 'less':
        return fieldValue < condition.value;
      case 'greater_equal':
        return fieldValue >= condition.value;
      case 'less_equal':
        return fieldValue <= condition.value;
      case 'equals':
        return fieldValue === condition.value;
      default:
        return false;
    }
  }

  /**
   * Avalia condições baseadas na última interação - CORRIGIDO
   */
  private evaluateLastInteractionCondition(condition: PolicyCondition, userContext: UserContext): boolean {
    // Usar last_interaction em vez de last_appointment
    if (!userContext.last_interaction) return false;

    const hoursSinceLastInteraction = differenceInHours(new Date(), userContext.last_interaction);

    switch (condition.operator) {
      case 'greater':
        return hoursSinceLastInteraction > condition.value;
      case 'less':
        return hoursSinceLastInteraction < condition.value;
      case 'greater_equal':
        return hoursSinceLastInteraction >= condition.value;
      case 'less_equal':
        return hoursSinceLastInteraction <= condition.value;
      default:
        return false;
    }
  }

  /**
   * Avalia condições baseadas no estado do flow
   */
  private evaluateFlowCondition(condition: PolicyCondition, conversationContext: EnhancedConversationContext): boolean {
    const flowLock = conversationContext.flow_lock;

    if (condition.field === 'active_flow') {
      return flowLock?.active_flow === condition.value;
    }

    if (condition.field === 'step') {
      return flowLock?.step === condition.value;
    }

    return false;
  }
  
  /**
   * Avalia condições baseadas na configuração do tenant - NOVA FUNÇÃO
   */
  private evaluateTenantConfigCondition(condition: PolicyCondition, conversationContext: EnhancedConversationContext): boolean {
    try {
      if (!condition.field) {
        return false;
      }
      
      // Navegar pelo path da configuração (ex: 'business_rules.working_hours.enabled')
      const configPath = condition.field.split('.');
      let configValue: any = (conversationContext as any)?.tenant_config;
      
      for (const key of configPath) {
        if (configValue && typeof configValue === 'object') {
          configValue = configValue[key];
        } else {
          configValue = undefined;
          break;
        }
      }
      
      switch (condition.operator) {
        case 'exists':
          return configValue !== undefined && configValue !== null;
          
        case 'equals':
          return configValue === condition.value;
          
        case 'contains':
          return Array.isArray(configValue) && configValue.includes(condition.value);
          
        case 'greater':
          return typeof configValue === 'number' && configValue > condition.value;
          
        case 'less':
          return typeof configValue === 'number' && configValue < condition.value;
          
        default:
          return false;
      }
      
    } catch (error) {
      console.error('❌ [POLICIES] Erro ao avaliar condição tenant_config:', error);
      return false;
    }
  }

  /**
   * Aplica políticas padrão do sistema
   */
  private async applySystemPolicies(
    intent: IntentKey,
    userContext: UserContext,
    _context: EnhancedConversationContext,
    _messageText: string
  ): Promise<PolicyDecision> {

    // Política: Usuários com muitos no-shows têm restrições
    if (userContext.noshow_count >= 3 && intent === 'availability') {
      return {
        allowIntent: true,
        contextualMessage: '⚠️ Para garantir seu horário, pedimos confirmação até 2 horas antes do agendamento devido a ausências anteriores.',
        actionRequired: 'modify',
        priority: 'high',
        reasonCode: 'SYSTEM_NOSHOW_WARNING'
      };
    }

    // Política: Novos usuários são direcionados para onboarding
    if (userContext.is_new_user && intent !== 'greeting' && intent !== 'services') {
      return {
        allowIntent: false,
        modifiedIntent: 'services',
        contextualMessage: '👋 Olá! Como é sua primeira vez, que tal conhecer nossos serviços primeiro?',
        actionRequired: 'redirect',
        priority: 'medium',
        reasonCode: 'SYSTEM_NEW_USER_REDIRECT'
      };
    }

    // Default: permitir com possíveis melhorias
    return {
      allowIntent: true,
      priority: 'low',
      reasonCode: 'SYSTEM_DEFAULT_ALLOW'
    };
  }

  /**
   * Aplica melhorias contextuais baseadas no histórico e preferências
   */
  private async applyContextualEnhancements(
    intent: IntentKey,
    userContext: UserContext,
    _context: EnhancedConversationContext,
    _messageText: string
  ): Promise<PolicyDecision> {

    let contextualMessage = '';

    // Enhancement: Clientes VIP recebem tratamento diferenciado
    if (userContext.vip_status) {
      contextualMessage += '⭐ Como cliente preferencial, reservamos nossos melhores horários para você. ';
    }

    // Enhancement: Lembrar preferências de horário
    if (userContext.preferred_time && intent === 'availability') {
      contextualMessage += `🕒 Lembro que você costuma preferir horários ${userContext.preferred_time}. `;
    }

    // Enhancement: Parabenizar clientes frequentes
    if (userContext.total_appointments >= 5 && intent === 'greeting') {
      contextualMessage += `🎉 Sempre um prazer atendê-lo! Já são ${userContext.total_appointments} agendamentos conosco. `;
    }

    // Enhancement: Oferecer reagendamento para quem cancelou recentemente
    if (userContext.cancelled_count > 0 && userContext.last_appointment && intent === 'availability') {
      const daysSinceCancel = differenceInHours(new Date(), userContext.last_appointment) / 24;
      if (daysSinceCancel <= 7) {
        contextualMessage += '🔄 Vejo que precisou cancelar recentemente. Vamos encontrar um novo horário ideal para você. ';
      }
    }

    return {
      allowIntent: true,
      contextualMessage: contextualMessage.trim() || undefined,
      actionRequired: 'enhance',
      priority: 'low',
      reasonCode: 'SYSTEM_CONTEXTUAL_ENHANCEMENT'
    };
  }

  /**
   * Registra aplicação de política para auditoria - IMPLEMENTADO com session tracking
   */
  private async logPolicyApplication(
    policyId: string,
    tenantId: string,
    userPhone: string,
    intent: IntentKey,
    decision: PolicyDecision,
    sessionId?: string
  ): Promise<void> {
    try {
      // Implementar auditoria no banco de dados - ATIVADO com session tracking
      const auditData: any = {
        policy_id: policyId,
        tenant_id: tenantId,
        user_phone: userPhone,
        intent: intent,
        decision_action: decision.actionRequired || 'enhance',
        reason_code: decision.reasonCode,
        applied_at: new Date().toISOString()
      };
      
      // Add session tracking if available
      if (sessionId) {
        auditData.session_id_uuid = sessionId;
      }
      
      const { error } = await (supabaseAdmin as any)
        .from('policy_applications')
        .insert(auditData);
      
      if (error) {
        console.error('❌ [POLICIES] Erro ao inserir auditoria de política:', error);
      } else {
        console.log(`📋 [POLICY] Auditoria registrada: policy ${policyId} for ${intent} - Action: ${decision.actionRequired}${sessionId ? ` - Session: ${sessionId}` : ''}`);
      }
      
    } catch (error) {
      console.error('❌ [POLICIES] Erro crítico ao registrar auditoria:', error);
    }
  }
}