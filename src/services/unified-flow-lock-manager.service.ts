/**
 * 🎯 FASE 3: Unified FlowLock Manager
 *
 * Substituição do FlowLockManager original que integra com UnifiedContextManager.
 * Mantém interface compatível mas usa sistema unificado de contexto.
 *
 * Responsabilidades:
 * - Interface compatível com FlowLockManager existente
 * - Delegação para UnifiedContextManager
 * - Migração automática de contextos legacy
 * - Manutenção de TTLs e timeouts
 *
 * Autor: Claude Code (Fase 3 Implementation)
 * Data: 2025-01-15
 */

import {
  FlowLock,
  FlowStep,
  FlowType,
  AppointmentStateData,
  FlowPriority,
  EnhancedConversationContext
} from '../types/flow-lock.types';
import { unifiedContextManager } from './unified-context-manager.service';

export interface FlowLockResult {
  success: boolean;
  flowLock?: FlowLock;
  error?: string;
  migrated_from_legacy?: boolean;
}

export interface TimeoutConfig {
  step_timeout_minutes: number;
  max_session_duration_minutes: number;
  extend_on_activity: boolean;
}

/**
 * ✅ FASE 3: UnifiedFlowLockManager
 * Wrapper que mantém compatibilidade com sistema existente
 * mas delega para UnifiedContextManager
 */
export class UnifiedFlowLockManager {
  private readonly DEFAULT_TIMEOUT_MINUTES = 15;
  private readonly MAX_SESSION_DURATION_MINUTES = 120;

  /**
   * ✅ COMPATIBILIDADE: Criar ou atualizar FlowLock
   */
  async createOrUpdateFlowLock(
    sessionId: string,
    tenantId: string,
    userId: string,
    step: FlowStep,
    stepData: any = {},
    timeoutMinutes: number = this.DEFAULT_TIMEOUT_MINUTES,
    priority: FlowPriority = 'medium'
  ): Promise<FlowLockResult> {
    try {
      console.log('🎯 [UNIFIED-FLOW-LOCK] Creating/updating flow lock:', {
        sessionId: sessionId.substring(0, 8) + '...',
        step,
        priority,
        timeoutMinutes
      });

      // Criar FlowLock object
      const flowLock: FlowLock = {
        active_flow: this.determineFlowType(step),
        step,
        expires_at: new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        priority,
        step_data: {
          ...stepData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      };

      // Sincronizar com unified context
      const result = await unifiedContextManager.syncFlowLock(sessionId, flowLock);

      if (result.success) {
        console.log('✅ [UNIFIED-FLOW-LOCK] Flow lock synchronized successfully');
        return {
          success: true,
          flowLock
        };
      } else {
        console.error('❌ [UNIFIED-FLOW-LOCK] Failed to sync flow lock:', result.error);
        return {
          success: false,
          error: result.error
        };
      }

    } catch (error) {
      console.error('❌ [UNIFIED-FLOW-LOCK] Error in createOrUpdateFlowLock:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ✅ COMPATIBILIDADE: Obter FlowLock existente
   */
  async getFlowLock(sessionId: string, tenantId: string, userId: string): Promise<FlowLockResult> {
    try {
      console.log('🎯 [UNIFIED-FLOW-LOCK] Getting flow lock for session:', sessionId.substring(0, 8) + '...');

      const context = await unifiedContextManager.getOrCreateUnifiedContext(
        sessionId,
        tenantId,
        userId
      );

      const flowLock = context.context_data.flow_lock;

      if (flowLock) {
        console.log('✅ [UNIFIED-FLOW-LOCK] Flow lock found:', flowLock.step);
        return {
          success: true,
          flowLock
        };
      } else {
        console.log('ℹ️ [UNIFIED-FLOW-LOCK] No flow lock found for session');
        return {
          success: true,
          flowLock: undefined
        };
      }

    } catch (error) {
      console.error('❌ [UNIFIED-FLOW-LOCK] Error getting flow lock:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ✅ COMPATIBILIDADE: Verificar se FlowLock está ativo
   */
  async isFlowLockActive(sessionId: string, tenantId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.getFlowLock(sessionId, tenantId, userId);

      if (!result.success || !result.flowLock) {
        return false;
      }

      // Verificar se não expirou
      const expiresAt = new Date(result.flowLock.expires_at);
      const now = new Date();

      return expiresAt > now;

    } catch (error) {
      console.error('❌ [UNIFIED-FLOW-LOCK] Error checking if flow lock is active:', error);
      return false;
    }
  }

  /**
   * ✅ COMPATIBILIDADE: Liberar FlowLock
   */
  async releaseFlowLock(sessionId: string, tenantId: string, userId: string): Promise<FlowLockResult> {
    try {
      console.log('🎯 [UNIFIED-FLOW-LOCK] Releasing flow lock for session:', sessionId.substring(0, 8) + '...');

      // Atualizar contexto removendo flow_lock
      const result = await unifiedContextManager.updateContextData(sessionId, {
        flow_lock: undefined
      });

      if (result.success) {
        console.log('✅ [UNIFIED-FLOW-LOCK] Flow lock released successfully');
        return {
          success: true
        };
      } else {
        console.error('❌ [UNIFIED-FLOW-LOCK] Failed to release flow lock:', result.error);
        return {
          success: false,
          error: result.error
        };
      }

    } catch (error) {
      console.error('❌ [UNIFIED-FLOW-LOCK] Error releasing flow lock:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ✅ COMPATIBILIDADE: Estender timeout do FlowLock
   */
  async extendFlowLockTimeout(
    sessionId: string,
    tenantId: string,
    userId: string,
    additionalMinutes: number = this.DEFAULT_TIMEOUT_MINUTES
  ): Promise<FlowLockResult> {
    try {
      console.log('🎯 [UNIFIED-FLOW-LOCK] Extending flow lock timeout:', {
        sessionId: sessionId.substring(0, 8) + '...',
        additionalMinutes
      });

      const currentResult = await this.getFlowLock(sessionId, tenantId, userId);
      if (!currentResult.success || !currentResult.flowLock) {
        return {
          success: false,
          error: 'No active flow lock to extend'
        };
      }

      const flowLock = currentResult.flowLock;
      const newTimeout = new Date(Date.now() + additionalMinutes * 60 * 1000);

      // Atualizar timeout
      flowLock.expires_at = newTimeout.toISOString();
      if (flowLock.step_data) {
        flowLock.step_data.updated_at = new Date().toISOString();
      }

      const result = await unifiedContextManager.syncFlowLock(sessionId, flowLock);

      if (result.success) {
        console.log('✅ [UNIFIED-FLOW-LOCK] Flow lock timeout extended successfully');
        return {
          success: true,
          flowLock
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }

    } catch (error) {
      console.error('❌ [UNIFIED-FLOW-LOCK] Error extending flow lock timeout:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ✅ MIGRAÇÃO: Migrar FlowLock legacy para sistema unificado
   */
  async migrateLegacyFlowLock(
    sessionId: string,
    tenantId: string,
    userId: string,
    legacyContext: EnhancedConversationContext
  ): Promise<FlowLockResult> {
    try {
      console.log('🔄 [UNIFIED-FLOW-LOCK] Migrating legacy flow lock for session:', sessionId.substring(0, 8) + '...');

      // Migrar contexto completo
      await unifiedContextManager.migrateLegacyContext(
        sessionId,
        tenantId,
        userId,
        legacyContext
      );

      const flowLock = legacyContext.flow_lock;
      if (flowLock) {
        console.log('✅ [UNIFIED-FLOW-LOCK] Legacy flow lock migrated successfully');
        return {
          success: true,
          flowLock,
          migrated_from_legacy: true
        };
      } else {
        return {
          success: true,
          migrated_from_legacy: true
        };
      }

    } catch (error) {
      console.error('❌ [UNIFIED-FLOW-LOCK] Error migrating legacy flow lock:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ✅ LIMPEZA: Limpar FlowLocks expirados
   */
  async cleanupExpiredFlowLocks(): Promise<number> {
    try {
      console.log('🧹 [UNIFIED-FLOW-LOCK] Starting cleanup of expired flow locks...');

      // Delegar para UnifiedContextManager
      const cleanedCount = await unifiedContextManager.cleanupExpiredContexts();

      console.log(`✅ [UNIFIED-FLOW-LOCK] Cleaned up ${cleanedCount} expired contexts with flow locks`);
      return cleanedCount;

    } catch (error) {
      console.error('❌ [UNIFIED-FLOW-LOCK] Error during cleanup:', error);
      return 0;
    }
  }

  /**
   * ✅ HELPER: Determinar FlowType baseado no step
   */
  private determineFlowType(step: FlowStep): FlowType {
    const appointmentSteps: FlowStep[] = [
      'collect_service',
      'collect_datetime',
      'show_slots',
      'select_time_slot',
      'collect_confirmation',
      'confirm'
    ];

    if (appointmentSteps.includes(step)) {
      return 'booking';
    }

    return 'general';
  }

  /**
   * ✅ COMPATIBILIDADE: Configurar timeout personalizado
   */
  async configureFlowTimeout(
    sessionId: string,
    tenantId: string,
    userId: string,
    config: TimeoutConfig
  ): Promise<FlowLockResult> {
    try {
      console.log('🎯 [UNIFIED-FLOW-LOCK] Configuring flow timeout:', config);

      const context = await unifiedContextManager.getOrCreateUnifiedContext(
        sessionId,
        tenantId,
        userId
      );

      // Atualizar configuração de timeout no contexto através de session_metadata
      const result = await unifiedContextManager.updateContextData(sessionId, {
        session_metadata: {
          session_started_at: context.context_data.session_metadata?.session_started_at || new Date().toISOString(),
          message_count: context.context_data.session_metadata?.message_count || 0,
          duration_minutes: context.context_data.session_metadata?.duration_minutes || 0,
          last_message_at: new Date().toISOString()
        }
      }, { extend_ttl: config.extend_on_activity });

      if (result.success) {
        console.log('✅ [UNIFIED-FLOW-LOCK] Flow timeout configured successfully');
        return {
          success: true
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }

    } catch (error) {
      console.error('❌ [UNIFIED-FLOW-LOCK] Error configuring flow timeout:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// ✅ EXPORT: Instância singleton compatível
export const unifiedFlowLockManager = new UnifiedFlowLockManager();

// ✅ COMPATIBILIDADE: Export para manter imports existentes funcionando
export { unifiedFlowLockManager as flowLockManager };