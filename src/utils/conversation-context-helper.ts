/**
 * Helper para gerenciar conversation_context com merge incremental + Flow Lock
 * Implementa contrato padronizado: session_id, duração crescente, contadores + sincronização de intenções
 */

import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/database';
import { EnhancedConversationContext, FlowLock } from '../types/flow-lock.types';

// Manter interface legada para compatibilidade
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
  chat_duration?: number; // Compatibilidade com scripts existentes
  platform?: string;
  timestamp?: string;
}

/**
 * Busca contexto anterior da sessão para o usuário/tenant
 */
async function getPreviousContext(
  userId: string, 
  tenantId: string
): Promise<ConversationContext | null> {
  try {
    const { data: lastConversation, error } = await supabaseAdmin
      .from('conversation_history')
      .select('conversation_context, created_at')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !lastConversation?.conversation_context) {
      return null;
    }

    const context = JSON.parse(lastConversation.conversation_context as string);
    
    // Validar se tem session_id válido (UUID format)
    if (context.session_id && isValidUUID(context.session_id)) {
      return context;
    }

    return null;
  } catch (error) {
    console.warn('Erro ao buscar contexto anterior:', error);
    return null;
  }
}

/**
 * Merge incremental do conversation_context com suporte a Flow Lock
 * NUNCA sobrescreve - sempre adiciona/atualiza campos
 */
export async function mergeConversationContext(
  userId: string,
  tenantId: string,
  updates: Partial<ConversationContext>
): Promise<ConversationContext> {
  
  const now = new Date();
  const nowISO = now.toISOString();
  
  // 1. Buscar contexto anterior da sessão
  const previousContext = await getPreviousContext(userId, tenantId);
  
  let finalContext: ConversationContext;
  
  if (previousContext && previousContext.session_id) {
    // MERGE INCREMENTAL - Preservar sessão existente
    const sessionStarted = new Date(previousContext.session_started_at);
    const durationMs = now.getTime() - sessionStarted.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));
    
    finalContext = {
      ...previousContext,
      ...updates, // Override com novos valores
      session_id: previousContext.session_id, // PRESERVAR session_id
      session_started_at: previousContext.session_started_at, // PRESERVAR início
      last_message_at: nowISO,
      duration_ms: durationMs,
      duration_minutes: durationMinutes,
      chat_duration: durationMinutes, // Compatibilidade
      message_count: (previousContext.message_count || 0) + 1,
      timestamp: nowISO // Atualizar timestamp
    };
  } else {
    // NOVA SESSÃO - Criar contexto inicial
    finalContext = {
      session_id: uuidv4(),
      session_started_at: nowISO,
      last_message_at: nowISO,
      duration_ms: 0,
      duration_minutes: 0,
      chat_duration: 0,
      message_count: 1,
      tenant_id: tenantId,
      domain: updates.domain || 'general',
      source: updates.source || 'whatsapp',
      mode: updates.mode || 'prod',
      platform: updates.platform || 'whatsapp',
      timestamp: nowISO,
      ...updates // Aplicar updates fornecidos
    };
  }
  
  console.log(`📋 Context merge: Session ${(finalContext.session_id || 'unknown').substring(0,8)}... | Msg #${finalContext.message_count} | ${finalContext.duration_minutes}min`);
  
  return finalContext;
}

/**
 * Validar se string é UUID válido
 */
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Enhanced merge com suporte a Flow Lock
 */
export async function mergeEnhancedConversationContext(
  userId: string,
  tenantId: string,
  updates: Partial<EnhancedConversationContext>,
  intentData?: {
    intent: string;
    confidence: number;
    decision_method: 'command' | 'dictionary' | 'regex' | 'llm';
  }
): Promise<EnhancedConversationContext> {
  
  const now = new Date();
  const nowISO = now.toISOString();
  
  // 1. Buscar contexto anterior (incluindo flow_lock)
  const previousContext = await getPreviousEnhancedContext(userId, tenantId);
  
  let finalContext: EnhancedConversationContext;
  
  if (previousContext && previousContext.session_id) {
    // MERGE INCREMENTAL preservando Flow Lock
    const sessionStarted = new Date(previousContext.session_started_at);
    const durationMs = now.getTime() - sessionStarted.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));
    
    finalContext = {
      ...previousContext,
      ...updates,
      // Preservar campos críticos
      session_id: previousContext.session_id,
      session_started_at: previousContext.session_started_at,
      last_message_at: nowISO,
      duration_ms: durationMs,
      duration_minutes: durationMinutes,
      message_count: (previousContext.message_count || 0) + 1,
      // Manter flow_lock se não foi explicitamente alterado
      flow_lock: updates.flow_lock || previousContext.flow_lock,
      // Atualizar intent_history
      intent_history: [
        ...(previousContext.intent_history || []),
        ...(intentData ? [{
          intent: intentData.intent,
          confidence: intentData.confidence,
          timestamp: nowISO,
          decision_method: intentData.decision_method
        }] : [])
      ].slice(-10), // Manter apenas últimos 10
      // Compatibilidade
      chat_duration: durationMinutes,
      timestamp: nowISO
    };
  } else {
    // NOVA SESSÃO
    finalContext = {
      session_id: uuidv4(),
      session_started_at: nowISO,
      last_message_at: nowISO,
      duration_ms: 0,
      duration_minutes: 0,
      message_count: 1,
      tenant_id: tenantId,
      domain: updates.domain || 'general',
      source: updates.source || 'whatsapp',
      mode: updates.mode || 'prod',
      flow_lock: updates.flow_lock || null,
      intent_history: intentData ? [{
        intent: intentData.intent,
        confidence: intentData.confidence,
        timestamp: nowISO,
        decision_method: intentData.decision_method
      }] : [],
      // Aplicar outros updates
      ...updates,
      // Compatibilidade
      chat_duration: 0,
      timestamp: nowISO
    };
  }
  
  console.log(`🔒 Enhanced Context: Session ${(finalContext.session_id || 'unknown').substring(0,8)}... | Flow: ${finalContext.flow_lock?.active_flow || 'none'} | Step: ${finalContext.flow_lock?.step || 'none'}`);
  
  return finalContext;
}

/**
 * Busca contexto enhanced anterior (com flow_lock)
 */
async function getPreviousEnhancedContext(
  userId: string, 
  tenantId: string
): Promise<EnhancedConversationContext | null> {
  try {
    const { data: lastConversation, error } = await supabaseAdmin
      .from('conversation_history')
      .select('conversation_context, created_at')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !lastConversation?.conversation_context) {
      return null;
    }

    const context = JSON.parse(lastConversation.conversation_context as string);
    
    // Validar se tem session_id válido
    if (context.session_id && isValidUUID(context.session_id)) {
      // Converter para EnhancedConversationContext se necessário
      return {
        ...context,
        flow_lock: context.flow_lock || null,
        intent_history: context.intent_history || []
      } as EnhancedConversationContext;
    }

    return null;
  } catch (error) {
    console.warn('Erro ao buscar contexto enhanced anterior:', error);
    return null;
  }
}

/**
 * Utilitário para extrair session_id do contexto JSON
 */
export function extractSessionId(conversationContext: string): string | null {
  try {
    const context = JSON.parse(conversationContext);
    return context.session_id || null;
  } catch {
    return null;
  }
}