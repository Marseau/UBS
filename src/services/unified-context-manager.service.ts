/**
 * @deprecated ESTE SERVIÇO FOI ABSORVIDO POR conversation-context-helper.ts
 *
 * ❌ NÃO USE MAIS - Use conversation-context-helper.mergeUnifiedContext()
 *
 * A funcionalidade deste serviço foi movida para o helper unificado para
 * eliminar construção de contextos paralelos.
 *
 * Data de depreciação: 2025-01-15
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { redisCacheService } from './redis-cache.service';
import {
  FlowLock,
  FlowStep,
  FlowType,
  AppointmentStateData,
  EnhancedConversationContext
} from '../types/flow-lock.types';
import { AppointmentFlowState } from '../types/flow-state.types';

export type DetectedTemporalContext = {
  detected_time?: string;
  parsed_datetime?: string;
  user_preference?: string;
  interpretation_confidence?: number;
  original_message?: string;
  detected_at?: string;
};

export interface UnifiedContextData {
  // ✅ CORE CONTEXT DATA
  flow_lock?: FlowLock | null;
  appointment_flow_state?: AppointmentFlowState | AppointmentStateData;
  session_metadata?: {
    session_started_at: string;
    message_count: number;
    duration_minutes: number;
    last_message_at: string;
  };
  intent_history?: Array<{
    intent: string | null;
    confidence: number;
    timestamp: string;
    decision_method: 'command' | 'dictionary' | 'regex' | 'llm' | 'none';
  }>;

  // ✅ TEMPORAL CONTEXT - FUNCIONALIDADE CRÍTICA RESTAURADA
  temporal_context?: DetectedTemporalContext;

  // ✅ TIMEOUT MANAGEMENT - FUNCIONALIDADES CRÍTICAS RESTAURADAS
  timeout_stage?: 'none' | 'checking' | 'finalizing' | 'expired';
  session_timeout_warnings?: number;
  last_activity_timestamp?: string;

  // ✅ FLOW MANAGEMENT - FUNCIONALIDADES CRÍTICAS RESTAURADAS
  flow_lock_history?: Array<{
    flow_type: string | null;
    step: string;
    started_at: string;
    ended_at?: string;
    outcome: 'completed' | 'abandoned' | 'timeout' | 'interrupted';
    reason?: string;
    duration_ms?: number;
  }>;
  flow_metrics?: {
    total_flows?: number;
    completed_flows?: number;
    abandoned_flows?: number;
    average_duration_ms?: number;
    flows_started?: number;
    flows_completed?: number;
    flows_abandoned?: number;
    total_flow_duration_ms?: number;
    most_recent_flow?: string | null;
  };

  // ✅ RECOVERY & DATA COLLECTION - FUNCIONALIDADES CRÍTICAS RESTAURADAS
  recovery_attempts?: number;
  data_collection_state?: {
    [key: string]: any;
  } | import('../types/orchestrator.types').DataCollectionState;

  // ✅ LEGACY COMPATIBILITY
  conversation_context?: any; // Preserva estrutura legacy

  // ✅ METADATA DE SINCRONIZAÇÃO
  unified_context_ref?: {
    context_id: string;
    sync_version: number;
    last_sync_at: string;
    source_system: 'unified_context' | 'migrated' | 'legacy';
  };

  // ✅ SNAPSHOT DO CONTEXTO
  context_snapshot?: {
    active_flows: string[];
    message_sequence: number;
    conversation_phase: string;
  };
}

export interface UnifiedConversationContext {
  id: string;
  session_id_uuid: string;
  tenant_id: string;
  user_id: string;
  context_data: UnifiedContextData;
  active_flows: string[];
  last_activity_at: Date;
  expires_at?: Date;
  version: number;
  status: 'active' | 'idle' | 'expired' | 'completed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: Date;
  updated_at: Date;
}

export interface ContextUpdateResult {
  success: boolean;
  context?: UnifiedConversationContext;
  version_conflict?: boolean;
  error?: string;
}

export interface ContextSyncOptions {
  force_sync?: boolean;
  preserve_legacy?: boolean;
  update_version?: boolean;
  extend_ttl?: boolean;
}

export class UnifiedContextManager {
  private supabase: SupabaseClient;
  private readonly CACHE_KEY_PREFIX = 'unified_context:';
  private readonly DEFAULT_TTL_MINUTES = 120; // 2 horas
  private readonly CACHE_TTL_SECONDS = 600; // 10 minutos no Redis

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * ✅ MÉTODO PRINCIPAL: Obter ou criar contexto unificado
   */
  async getOrCreateUnifiedContext(
    sessionIdUuid: string,
    tenantId: string,
    userId: string,
    initialData?: Partial<UnifiedContextData>
  ): Promise<UnifiedConversationContext> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}${sessionIdUuid}`;

    try {
      // 1. Tentar cache Redis primeiro
      const cached = await redisCacheService.get(cacheKey);
      if (cached) {
        console.log('🎯 [UNIFIED-CONTEXT] Cache hit for session:', sessionIdUuid.substring(0, 8) + '...');
        return JSON.parse(cached);
      }

      // 2. Buscar no banco de dados
      const { data: existing, error } = await this.supabase
        .from('unified_conversation_contexts')
        .select('*')
        .eq('session_id_uuid', sessionIdUuid)
        .single();

      if (existing && !error) {
        console.log('🎯 [UNIFIED-CONTEXT] Database hit for session:', sessionIdUuid.substring(0, 8) + '...');
        const context = this.mapDbToContext(existing);

        // Cache por 10 minutos
        await redisCacheService.set(cacheKey, JSON.stringify(context), this.CACHE_TTL_SECONDS);
        return context;
      }

      // 3. Criar novo contexto se não existir
      console.log('🎯 [UNIFIED-CONTEXT] Creating new unified context for session:', sessionIdUuid.substring(0, 8) + '...');
      return await this.createNewUnifiedContext(sessionIdUuid, tenantId, userId, initialData);

    } catch (error) {
      console.error('❌ [UNIFIED-CONTEXT] Error in getOrCreateUnifiedContext:', error);
      throw error;
    }
  }

  /**
   * ✅ CRIAR NOVO CONTEXTO UNIFICADO
   */
  private async createNewUnifiedContext(
    sessionIdUuid: string,
    tenantId: string,
    userId: string,
    initialData?: Partial<UnifiedContextData>
  ): Promise<UnifiedConversationContext> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.DEFAULT_TTL_MINUTES * 60 * 1000);

    const contextData: UnifiedContextData = {
      session_metadata: {
        session_started_at: now.toISOString(),
        message_count: 0,
        duration_minutes: 0,
        last_message_at: now.toISOString()
      },
      intent_history: [],
      unified_context_ref: {
        context_id: '', // Será preenchido após inserção
        sync_version: 1,
        last_sync_at: now.toISOString(),
        source_system: 'unified_context'
      },
      context_snapshot: {
        active_flows: [],
        message_sequence: 0,
        conversation_phase: 'initialization'
      },
      ...initialData
    };

    const { data, error } = await this.supabase
      .from('unified_conversation_contexts')
      .insert([{
        session_id_uuid: sessionIdUuid,
        tenant_id: tenantId,
        user_id: userId,
        context_data: contextData,
        active_flows: [],
        last_activity_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        version: 1,
        status: 'active',
        priority: 'normal'
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ [UNIFIED-CONTEXT] Error creating unified context:', error);
      throw new Error(`Failed to create unified context: ${error.message}`);
    }

    const context = this.mapDbToContext(data);

    // Atualizar context_id na referência
    context.context_data.unified_context_ref!.context_id = context.id;
    await this.updateUnifiedContext(context.id, {
      context_data: context.context_data
    });

    // Cache por 10 minutos
    const cacheKey = `${this.CACHE_KEY_PREFIX}${sessionIdUuid}`;
    await redisCacheService.set(cacheKey, JSON.stringify(context), this.CACHE_TTL_SECONDS);

    console.log('✅ [UNIFIED-CONTEXT] New unified context created:', context.id);
    return context;
  }

  /**
   * ✅ ATUALIZAR CONTEXTO UNIFICADO (com optimistic locking)
   */
  async updateUnifiedContext(
    contextId: string,
    updates: Partial<UnifiedConversationContext>,
    options: ContextSyncOptions = {}
  ): Promise<ContextUpdateResult> {
    try {
      // 1. Buscar versão atual
      const { data: current, error: fetchError } = await this.supabase
        .from('unified_conversation_contexts')
        .select('*')
        .eq('id', contextId)
        .single();

      if (fetchError || !current) {
        return {
          success: false,
          error: `Context not found: ${contextId}`
        };
      }

      // 2. Verificar versão para optimistic locking
      if (!options.force_sync && updates.version && updates.version !== current.version) {
        return {
          success: false,
          version_conflict: true,
          error: `Version conflict: expected ${updates.version}, got ${current.version}`
        };
      }

      // 3. Preparar updates com nova versão
      const now = new Date();
      const finalUpdates = {
        ...updates,
        updated_at: now.toISOString(),
        last_activity_at: now.toISOString(),
        version: current.version + 1
      };

      // 4. Estender TTL se solicitado
      if (options.extend_ttl) {
        const newExpiresAt = new Date(now.getTime() + this.DEFAULT_TTL_MINUTES * 60 * 1000);
        (finalUpdates as any).expires_at = newExpiresAt.toISOString();
      }

      // 5. Executar update
      const { data: updated, error: updateError } = await this.supabase
        .from('unified_conversation_contexts')
        .update(finalUpdates)
        .eq('id', contextId)
        .eq('version', current.version) // Optimistic locking
        .select()
        .single();

      if (updateError) {
        return {
          success: false,
          error: `Update failed: ${updateError.message}`
        };
      }

      // 6. Atualizar cache
      const context = this.mapDbToContext(updated);
      const cacheKey = `${this.CACHE_KEY_PREFIX}${context.session_id_uuid}`;
      await redisCacheService.set(cacheKey, JSON.stringify(context), this.CACHE_TTL_SECONDS);

      console.log('✅ [UNIFIED-CONTEXT] Context updated successfully:', contextId);
      return {
        success: true,
        context
      };

    } catch (error) {
      console.error('❌ [UNIFIED-CONTEXT] Error updating context:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ✅ ATUALIZAR DADOS DE CONTEXTO ESPECÍFICOS
   */
  async updateContextData(
    sessionIdUuid: string,
    dataUpdates: Partial<UnifiedContextData>,
    options: ContextSyncOptions = {}
  ): Promise<ContextUpdateResult> {
    try {
      console.warn('⚠️ [DEPRECATED] UnifiedContextManager.updateContextData called - use mergeUnifiedContext instead');

      // DEPRECATED: Retornar resultado vazio para não quebrar o fluxo
      if (!sessionIdUuid) {
        return {
          success: false,
          context: undefined,
          error: 'No sessionIdUuid provided to deprecated service'
        };
      }

      // ✅ DEPRECATED: Funcionalidade limitada mas segura para compatibilidade
      if (!sessionIdUuid.trim()) {
        return {
          success: false,
          context: undefined,
          error: 'SessionIdUuid vazio não é permitido'
        };
      }

      // Buscar contexto existente por session_id_uuid diretamente
      const { data: existingContext, error: fetchError } = await this.supabase
        .from('unified_conversation_contexts')
        .select('*')
        .eq('session_id_uuid', sessionIdUuid)
        .single();

      if (fetchError || !existingContext) {
        return {
          success: false,
          context: undefined,
          error: `Context not found for session: ${sessionIdUuid.substring(0, 8)}...`
        };
      }

      // Atualizar apenas context_data do contexto existente
      const updatedContextData: UnifiedContextData = {
        ...existingContext.context_data,
        ...dataUpdates,
        unified_context_ref: {
          ...existingContext.context_data.unified_context_ref,
          sync_version: (existingContext.context_data.unified_context_ref?.sync_version || 0) + 1,
          last_sync_at: new Date().toISOString()
        }
      };

      return await this.updateUnifiedContext(existingContext.id, {
        context_data: updatedContextData
      }, options);

    } catch (error) {
      console.error('❌ [UNIFIED-CONTEXT] Error updating context data:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ✅ SINCRONIZAR FLOW LOCK
   */
  async syncFlowLock(
    sessionIdUuid: string,
    flowLock: FlowLock
  ): Promise<ContextUpdateResult> {
    return await this.updateContextData(sessionIdUuid, {
      flow_lock: flowLock,
      context_snapshot: {
        active_flows: ['flow_lock'],
        message_sequence: flowLock.step_data?.message_count || 0,
        conversation_phase: flowLock.step
      }
    });
  }

  /**
   * ✅ SINCRONIZAR APPOINTMENT FLOW STATE
   */
  async syncAppointmentFlowState(
    sessionIdUuid: string,
    appointmentState: AppointmentFlowState
  ): Promise<ContextUpdateResult> {
    return await this.updateContextData(sessionIdUuid, {
      appointment_flow_state: appointmentState,
      context_snapshot: {
        active_flows: ['appointment_booking'],
        message_sequence: 0, // AppointmentFlowState doesn't have interaction_count
        conversation_phase: appointmentState.step
      }
    });
  }

  /**
   * ✅ CLEANUP CONTEXTOS EXPIRADOS
   */
  async cleanupExpiredContexts(): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .rpc('cleanup_expired_unified_contexts');

      if (error) {
        console.error('❌ [UNIFIED-CONTEXT] Error cleaning up expired contexts:', error);
        return 0;
      }

      console.log(`🧹 [UNIFIED-CONTEXT] Cleaned up ${data} expired contexts`);
      return data;

    } catch (error) {
      console.error('❌ [UNIFIED-CONTEXT] Error in cleanup:', error);
      return 0;
    }
  }

  /**
   * ✅ INVALIDAR CACHE
   */
  async invalidateCache(sessionIdUuid: string): Promise<void> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}${sessionIdUuid}`;
    await redisCacheService.del(cacheKey);
  }

  /**
   * ✅ MAPPER: DB → Context Object
   */
  private mapDbToContext(dbRow: any): UnifiedConversationContext {
    return {
      id: dbRow.id,
      session_id_uuid: dbRow.session_id_uuid,
      tenant_id: dbRow.tenant_id,
      user_id: dbRow.user_id,
      context_data: dbRow.context_data || {},
      active_flows: dbRow.active_flows || [],
      last_activity_at: new Date(dbRow.last_activity_at),
      expires_at: dbRow.expires_at ? new Date(dbRow.expires_at) : undefined,
      version: dbRow.version,
      status: dbRow.status,
      priority: dbRow.priority,
      created_at: new Date(dbRow.created_at),
      updated_at: new Date(dbRow.updated_at)
    };
  }

  /**
   * ✅ MIGRAR CONTEXTO LEGACY PARA UNIFICADO
   */
  async migrateLegacyContext(
    sessionIdUuid: string,
    tenantId: string,
    userId: string,
    legacyContext: any
  ): Promise<UnifiedConversationContext> {
    console.log('🔄 [UNIFIED-CONTEXT] Migrating legacy context for session:', sessionIdUuid.substring(0, 8) + '...');

    const unifiedData: UnifiedContextData = {
      conversation_context: legacyContext, // Preservar legacy
      flow_lock: legacyContext.flow_lock,
      appointment_flow_state: legacyContext.appointment_flow_state,
      session_metadata: {
        session_started_at: legacyContext.session_started_at || new Date().toISOString(),
        message_count: legacyContext.message_count || 0,
        duration_minutes: legacyContext.duration_minutes || 0,
        last_message_at: new Date().toISOString()
      },
      intent_history: legacyContext.intent_history || [],
      unified_context_ref: {
        context_id: '',
        sync_version: 1,
        last_sync_at: new Date().toISOString(),
        source_system: 'migrated'
      }
    };

    return await this.createNewUnifiedContext(sessionIdUuid, tenantId, userId, unifiedData);
  }
}

export const unifiedContextManager = new UnifiedContextManager();