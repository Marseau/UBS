/**
 * @deprecated ESTE ARQUIVO FOI SUBSTITUÍDO POR conversation-context-helper.ts
 *
 * ❌ NÃO USE MAIS - Use conversation-context-helper.mergeUnifiedContext()
 *
 * Este arquivo será removido em versões futuras.
 * Migre para: import { mergeUnifiedContext } from './conversation-context-helper'
 *
 * Data de depreciação: 2025-01-15
 */

import { v4 as uuidv4 } from 'uuid';
import { FlowLock } from '../types/flow-lock.types';
import { UnifiedConversationContext, DetectedTemporalContext } from '../services/unified-context-manager.service';
import { unifiedContextManager } from '../services/unified-context-manager.service';

/**
 * ✅ FASE 3: Opções para merge de contexto unificado
 */
export interface UnifiedMergeOptions {
  inactivityMinutesThreshold?: number;
  forceMigration?: boolean;
  preserveLegacy?: boolean;
  extendTTL?: boolean;
}

/**
 * ✅ FASE 3: Dados de intent para historico
 */
export interface UnifiedIntentData {
  intent: string;
  confidence_score: number;
  decision_method: 'command' | 'dictionary' | 'regex' | 'llm' | 'none';
}

/**
 * ✅ FASE 3: FUNÇÃO PRINCIPAL - Merge de contexto unificado
 * Esta é a ÚNICA função que deve ser usada para gerenciar contexto
 */
export async function mergeUnifiedContext(
  userPhone: string,
  tenantId: string,
  userId: string,
  updates: {
    domain?: string;
    source?: 'whatsapp' | 'demo';
    mode?: 'demo' | 'prod';
    flow_lock?: FlowLock;
    temporal_context?: DetectedTemporalContext;
    additional_data?: any;
  },
  intentData?: UnifiedIntentData,
  options?: UnifiedMergeOptions
): Promise<UnifiedConversationContext> {

  const now = new Date();
  const nowISO = now.toISOString();

  try {
    console.log('🎯 [UNIFIED-CONTEXT] Merging unified context for user:', userPhone.substring(0, 8) + '...');

    // 1. Gerar session_id_uuid único se necessário
    let sessionIdUuid: string;

    // Tentar buscar contexto existente primeiro
    let existingContext: UnifiedConversationContext | null = null;

    // Buscar por contexto ativo do usuário
    try {
      existingContext = await unifiedContextManager.getOrCreateUnifiedContext(
        '', // Vamos descobrir o session_id
        tenantId,
        userId
      );
    } catch (error) {
      console.log('ℹ️ [UNIFIED-CONTEXT] No existing context found, will create new one');
    }

    // Verificar inatividade se especificado
    if (existingContext && options?.inactivityMinutesThreshold !== undefined) {
      const lastActivity = existingContext.last_activity_at;
      const inactivityMs = now.getTime() - lastActivity.getTime();
      const inactivityMinutes = inactivityMs > 0 ? inactivityMs / 60000 : 0;

      if (inactivityMinutes >= options.inactivityMinutesThreshold) {
        console.log(`⏱️ [UNIFIED-CONTEXT] Inactivity of ${inactivityMinutes.toFixed(2)}min exceeded threshold ${options.inactivityMinutesThreshold}. Creating new session.`);
        existingContext = null;
      }
    }

    if (existingContext) {
      // MERGE INCREMENTAL
      sessionIdUuid = existingContext.session_id_uuid;

      const sessionStarted = existingContext.created_at;
      const durationMs = now.getTime() - sessionStarted.getTime();
      const durationMinutes = Math.round(durationMs / 60000);
      const messageCount = (existingContext.context_data.session_metadata?.message_count || 0) + 1;

      // Atualizar dados de contexto
      const updatedContextData = {
        ...existingContext.context_data,
        session_metadata: {
          session_started_at: sessionStarted.toISOString(),
          message_count: messageCount,
          duration_minutes: durationMinutes,
          last_message_at: nowISO
        },
        // Merge de dados específicos
        flow_lock: updates.flow_lock || existingContext.context_data.flow_lock,
        temporal_context: updates.temporal_context || existingContext.context_data.temporal_context,

        // Atualizar histórico de intenções
        intent_history: [
          ...(existingContext.context_data.intent_history || []),
          ...(intentData ? [{
            intent: intentData.intent,
            confidence: intentData.confidence_score,
            timestamp: nowISO,
            decision_method: intentData.decision_method
          }] : [])
        ]
      };

      // Sincronizar mudanças
      const result = await unifiedContextManager.updateContextData(
        sessionIdUuid,
        updatedContextData,
        {
          extend_ttl: options?.extendTTL,
          preserve_legacy: options?.preserveLegacy
        }
      );

      if (!result.success) {
        throw new Error(`Failed to update unified context: ${result.error}`);
      }

      console.log('✅ [UNIFIED-CONTEXT] Context merged successfully (incremental)');
      return result.context!;

    } else {
      // CRIAR NOVO CONTEXTO
      sessionIdUuid = uuidv4();

      const initialContextData = {
        session_metadata: {
          session_started_at: nowISO,
          message_count: 1,
          duration_minutes: 0,
          last_message_at: nowISO
        },
        flow_lock: updates.flow_lock,
        temporal_context: updates.temporal_context,
        intent_history: intentData ? [{
          intent: intentData.intent,
          confidence: intentData.confidence_score,
          timestamp: nowISO,
          decision_method: intentData.decision_method
        }] : [],
        ...(updates.additional_data || {})
      };

      const newContext = await unifiedContextManager.getOrCreateUnifiedContext(
        sessionIdUuid,
        tenantId,
        userId,
        initialContextData
      );

      // Essas propriedades não existem mais na UnifiedConversationContext
      // domain, source, mode são gerenciados pelo context_data

      console.log('✅ [UNIFIED-CONTEXT] New unified context created');
      return newContext;
    }

  } catch (error) {
    console.error('❌ [UNIFIED-CONTEXT] Error in mergeUnifiedContext:', error);
    throw error;
  }
}

/**
 * ✅ FASE 3: Converter contexto unificado para formato legacy (compatibilidade)
 */
export function convertUnifiedToLegacy(unifiedContext: UnifiedConversationContext): any {
  const metadata = unifiedContext.context_data.session_metadata;
  return {
    session_id: unifiedContext.session_id_uuid,
    session_started_at: metadata?.session_started_at || unifiedContext.created_at.toISOString(),
    last_message_at: metadata?.last_message_at || unifiedContext.last_activity_at.toISOString(),
    duration_ms: (metadata?.duration_minutes || 0) * 60000,
    duration_minutes: metadata?.duration_minutes || 0,
    message_count: metadata?.message_count || 0,
    tenant_id: unifiedContext.tenant_id,
    domain: 'general', // Propriedades legacy fixas
    source: 'whatsapp',
    mode: 'prod',
    flow_lock: unifiedContext.context_data.flow_lock,
    intent_history: unifiedContext.context_data.intent_history || []
  };
}

/**
 * ✅ FASE 3: Migrar contexto legacy para sistema unificado
 */
export async function migrateLegacyToUnified(
  legacyContext: any,
  tenantId: string,
  userId: string
): Promise<UnifiedConversationContext> {

  console.log('🔄 [UNIFIED-CONTEXT] Migrating legacy context to unified system');

  const sessionIdUuid = legacyContext.session_id || uuidv4();

  const migratedData = {
    session_metadata: {
      session_started_at: legacyContext.session_started_at || new Date().toISOString(),
      message_count: legacyContext.message_count || 0,
      duration_minutes: legacyContext.duration_minutes || 0,
      last_message_at: legacyContext.last_message_at || new Date().toISOString()
    },
    flow_lock: legacyContext.flow_lock,
    intent_history: legacyContext.intent_history || [],
    legacy_context: legacyContext // Preservar dados originais
  };

  const unifiedContext = await unifiedContextManager.migrateLegacyContext(
    sessionIdUuid,
    tenantId,
    userId,
    migratedData
  );

  console.log('✅ [UNIFIED-CONTEXT] Legacy context migrated successfully');
  return unifiedContext;
}

/**
 * ✅ FASE 3: Obter contexto unificado por session_id
 */
export async function getUnifiedContext(
  sessionIdUuid: string,
  tenantId: string,
  userId: string
): Promise<UnifiedConversationContext | null> {

  try {
    const context = await unifiedContextManager.getOrCreateUnifiedContext(
      sessionIdUuid,
      tenantId,
      userId
    );

    return context;
  } catch (error) {
    console.error('❌ [UNIFIED-CONTEXT] Error getting unified context:', error);
    return null;
  }
}

/**
 * ✅ FASE 3: Invalidar cache de contexto
 */
export async function invalidateUnifiedContextCache(sessionIdUuid: string): Promise<void> {
  await unifiedContextManager.invalidateCache(sessionIdUuid);
}

/**
 * ✅ COMPATIBILIDADE: Interface legada para transição gradual
 * DEPRECATED: Use mergeUnifiedContext
 */
export interface ConversationContext {
  session_id: string;
  session_started_at: string;
  last_message_at: string;
  duration_ms: number;
  duration_minutes: number;
  message_count: number;
  tenant_id: string;
  domain: string;
  source: 'whatsapp' | 'demo';
  mode: 'demo' | 'prod';
  chat_duration?: number;
  platform?: string;
  timestamp?: string;
}