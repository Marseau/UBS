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
  userPhone: string, 
  tenantId: string
): Promise<ConversationContext | null> {
  try {
    // Buscar pelo telefone do usuário
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('phone', userPhone)
      .single();

    if (userError || !user) {
      return null;
    }

    const { data: lastConversation, error } = await supabaseAdmin
      .from('conversation_history')
      .select('conversation_context, created_at')
      .eq('user_id', user.id)
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
  userPhone: string,
  tenantId: string,
  updates: Partial<ConversationContext>
): Promise<ConversationContext> {
  
  const now = new Date();
  const nowISO = now.toISOString();
  
  // 1. Buscar contexto anterior da sessão
  const previousContext = await getPreviousContext(userPhone, tenantId);
  
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
  userPhone: string,
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
  console.log(`🔍 [DEBUG] Buscando contexto anterior para ${userPhone} no tenant ${tenantId}`);
  const previousContext = await getPreviousEnhancedContext(userPhone, tenantId);
  console.log(`🔍 [DEBUG] Contexto recuperado:`, previousContext ? `Session ${previousContext.session_id?.substring(0,8)}... | Flow: ${previousContext.flow_lock?.active_flow} | Step: ${previousContext.flow_lock?.step}` : 'NULL');
  
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
 * CORRIGIDO: Busca pelo contexto mais recente da sessão ativa
 */
async function getPreviousEnhancedContext(
  userPhone: string, 
  tenantId: string
): Promise<EnhancedConversationContext | null> {
  try {
    // CORREÇÃO: Usar a mesma lógica de busca de telefone do upsertUserForTenant
    const raw = String(userPhone || '').trim();
    const digits = raw.replace(/\D/g, '');
    const candidatesSet = new Set<string>();
    if (digits) {
      candidatesSet.add(digits);
      candidatesSet.add(`+${digits}`);
      if (digits.startsWith('55')) {
        const local = digits.slice(2);
        if (local) {
          candidatesSet.add(local);
          candidatesSet.add(`+${local}`);
        }
      } else {
        candidatesSet.add(`55${digits}`);
        candidatesSet.add(`+55${digits}`);
      }
    }
    const candidates = Array.from(candidatesSet);
    const orClause = candidates.map(v => `phone.eq.${v}`).join(',');

    // Buscar pelo telefone do usuário usando a mesma lógica complexa
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .or(orClause)
      .limit(1)
      .maybeSingle();

    console.log(`🔍 [DEBUG] Busca de usuário - Phone: ${userPhone}, Candidates: ${candidates.join(',')}, User encontrado:`, user ? `ID: ${user.id}` : 'NULL', 'Error:', userError);

    if (userError || !user) {
      return null;
    }

    // CORREÇÃO: Buscar conversas mais recentes e agrupar por session_id
    // IMPORTANTE: Excluir conversas que já foram finalizadas pelo cronjob
    // TESTE RLS: Usar query mais simples para diagnosticar problema de permissão
    console.log(`🔍 [RLS-TEST] Testando query conversation_history para user_id=${user.id}, tenant_id=${tenantId}`);
    
    const { data: recentConversations, error } = await supabaseAdmin
      .from('conversation_history')
      .select('conversation_context, created_at, user_id, tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10); // Reduzir limite para debug

    console.log(`🔍 [DEBUG] Query conversation_history - UserID: ${user.id}, TenantID: ${tenantId}, Encontrados: ${recentConversations?.length || 0}, Error:`, error);
    console.log(`🔍 [RECOVERY-DEBUG] Query details - SQL: conversation_history WHERE user_id='${user.id}' AND tenant_id='${tenantId}' AND conversation_outcome IS NULL`);

    if (error || !recentConversations || recentConversations.length === 0) {
      return null;
    }

    // Agrupar por session_id e pegar o mais recente de cada sessão
    const sessionMap = new Map<string, { context: any, timestamp: string }>();
    
    for (const conversation of recentConversations) {
      if (!conversation.conversation_context || !conversation.created_at) continue;
      
      try {
        const rawContext = conversation.conversation_context;
        
        // CORREÇÃO CRÍTICA: Verificar o tipo do contexto 
        if (typeof rawContext === 'object' && rawContext !== null) {
          // Já é um objeto - usar diretamente
          console.log(`🔍 [OBJECT] Contexto já é objeto - processando diretamente`);
          const context = rawContext as any;
          
          // Validar se tem session_id válido
          if (context.session_id && isValidUUID(context.session_id)) {
            const sessionId = context.session_id;
            const currentTimestamp = conversation.created_at;
            
            // Se não temos essa sessão ou este registro é mais recente
            if (!sessionMap.has(sessionId) || currentTimestamp > sessionMap.get(sessionId)!.timestamp) {
              console.log(`✅ [VALID-OBJ] Contexto recuperado: Session ${sessionId.substring(0,8)}... | Flow: ${context.flow_lock?.active_flow || 'none'} | Step: ${context.flow_lock?.step || 'none'}`);
              sessionMap.set(sessionId, {
                context: context,
                timestamp: currentTimestamp
              });
            }
          }
          continue;
        }
        
        // Se é string, processar como antes
        const rawContextStr = String(rawContext);
        
        // CORREÇÃO EMERGENCIAL: Detectar e corrigir dados corrompidos [object Object]
        if (rawContextStr.includes('[object Object]')) {
          console.log(`🗑️ [SKIP] Ignorando registro corrompido: ${rawContextStr.substring(0, 50)}...`);
          continue;
        }
        
        // CORREÇÃO: Verificar se não é uma string vazia ou inválida
        if (!rawContextStr.trim() || rawContextStr === 'null' || rawContextStr === 'undefined') {
          console.log(`🗑️ [SKIP] Ignorando contexto vazio/inválido`);
          continue;
        }
        
        // DEBUG: Mostrar todos os contextos que estamos tentando processar
        console.log(`🔍 [ATTEMPT] Tentando processar contexto: ${rawContextStr.substring(0, 100)}...`);
        
        const context = JSON.parse(rawContextStr);
        
        // Validar se tem session_id válido (pode ser UUID ou tenant:phone format)
        console.log(`🔍 [VALIDATION] session_id: "${context.session_id}", isUUID: ${isValidUUID(context.session_id)}, hasColon: ${context.session_id?.includes(':')}`);
        
        if (context.session_id && (isValidUUID(context.session_id) || context.session_id.includes(':'))) {
          const sessionId = context.session_id;
          const currentTimestamp = conversation.created_at;
          
          // Se não temos essa sessão ou este registro é mais recente
          if (!sessionMap.has(sessionId) || currentTimestamp > sessionMap.get(sessionId)!.timestamp) {
            console.log(`✅ [VALID] Contexto recuperado: Session ${sessionId.substring(0,8)}... | Flow: ${context.flow_lock?.active_flow || 'none'} | Step: ${context.flow_lock?.step || 'none'}`);
            sessionMap.set(sessionId, {
              context: context,
              timestamp: currentTimestamp
            });
          }
        }
      } catch (parseError) {
        console.warn(`❌ [JSON ERROR] Erro ao fazer parse do contexto:`, parseError);
        continue;
      }
    }

    // Pegar a sessão mais recente entre todas as sessões
    let mostRecentContext: any = null;
    let mostRecentTimestamp = '';
    
    for (const [sessionId, sessionData] of sessionMap.entries()) {
      if (sessionData.timestamp > mostRecentTimestamp) {
        mostRecentTimestamp = sessionData.timestamp;
        mostRecentContext = sessionData.context;
      }
    }

    if (mostRecentContext) {
      console.log(`📋 [CORRIGIDO] Recuperando contexto: Session ${mostRecentContext.session_id.substring(0,8)}... | Flow: ${mostRecentContext.flow_lock?.active_flow || 'none'} | Step: ${mostRecentContext.flow_lock?.step || 'none'} | Timestamp: ${mostRecentTimestamp}`);
      
      // Converter para EnhancedConversationContext
      return {
        ...mostRecentContext,
        flow_lock: mostRecentContext.flow_lock || null,
        intent_history: mostRecentContext.intent_history || []
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