/**
 * Intent Validator Utility
 * Garante separação clara entre BusinessIntent (user intents) e SystemFlowState (flow states)
 * CRÍTICO: Evita contaminação do campo intent_detected com flow states
 */

import { BusinessIntent, SystemFlowState, isValidIntent } from '../types/intent.types';

/**
 * Valida se um valor é uma intenção real do usuário (BusinessIntent)
 * ou um estado interno do sistema (SystemFlowState)
 */
export function sanitizeIntentForPersistence(
  rawIntent: string | null | undefined,
  fallbackIntent: BusinessIntent | null = null
): BusinessIntent | null {
  
  // Se não há intent, retornar fallback ou null
  if (!rawIntent || rawIntent.trim() === '') {
    return fallbackIntent;
  }

  const intent = rawIntent.trim();
  
  // VERIFICAÇÃO CRÍTICA: Se é BusinessIntent válido, usar
  if (isValidIntent(intent)) {
    console.log(`✅ [INTENT-CLEAN] Intent válido preservado: "${intent}"`);
    return intent as BusinessIntent;
  }
  
  // PROTEÇÃO: Se é SystemFlowState, converter para intent apropriado ou null
  if (isSystemFlowState(intent)) {
    const convertedIntent = convertFlowStateToIntent(intent as SystemFlowState);
    if (convertedIntent) {
      console.log(`🔄 [INTENT-CONVERT] Flow state "${intent}" → intent "${convertedIntent}"`);
      return convertedIntent;
    } else {
      console.log(`🚫 [INTENT-BLOCK] Flow state "${intent}" → NULL (não conversível)`);
      return fallbackIntent;
    }
  }
  
  // Se não é nem intent nem flow state conhecido, usar fallback
  console.log(`❓ [INTENT-UNKNOWN] Valor desconhecido "${intent}" → fallback "${fallbackIntent}"`);
  return fallbackIntent;
}

/**
 * Verifica se um valor é um SystemFlowState
 */
function isSystemFlowState(value: string): boolean {
  return Object.values(SystemFlowState).includes(value as SystemFlowState);
}

/**
 * Converte SystemFlowState para BusinessIntent quando possível
 * Regras de conversão baseadas no contexto semântico
 */
function convertFlowStateToIntent(flowState: SystemFlowState): BusinessIntent | null {
  const conversionMap: Partial<Record<SystemFlowState, BusinessIntent | null>> = {
    // Consentimento implica confirmação
    [SystemFlowState.RETURNING_USER_CONSENT_GRANTED]: 'confirm',
    [SystemFlowState.RETURNING_USER_CONSENT]: 'confirm',
    
    // Data collection pode ser múltiplas intenções - retornar null para detectar dinamicamente
    [SystemFlowState.DATA_COLLECTION]: null,
    
    // Estados de onboarding representam greeting inicial
    [SystemFlowState.ONBOARDING]: 'greeting',
    [SystemFlowState.ONBOARDING_COMPLETED]: 'greeting',
    
    // Estados de timeout são do sistema - não têm intent do usuário
    [SystemFlowState.TIMEOUT_WARNING]: null,
    [SystemFlowState.TIMEOUT_CHECKING]: null,
    [SystemFlowState.TIMEOUT_FINALIZING]: null,
    
    // Abandono é intent específico
    [SystemFlowState.BOOKING_ABANDONED]: 'booking_abandoned',
    
    // Fallbacks do sistema não têm intent específico
    [SystemFlowState.RETURNING_USER_FALLBACK]: null,
    [SystemFlowState.SYSTEM_CLARIFICATION]: null,
    [SystemFlowState.DISAMBIGUATION_REQUEST]: null
  };
  
  return conversionMap[flowState] || null;
}

/**
 * Detecta intent baseado no conteúdo da mensagem quando flow state não é conversível
 */
export function detectIntentFromMessage(
  messageText: string,
  currentFlowState?: SystemFlowState
): BusinessIntent | null {
  
  const text = (messageText || '').toLowerCase().trim();
  
  // Detecção de confirmação
  if (/^(sim|ok|confirmo|confirmado|certo|beleza|blz|👍|✅)$/i.test(text)) {
    return 'confirm';
  }
  
  // Detecção de data
  if (/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(text)) {
    return 'appointment_inquiry'; // Data sugere interesse em agendamento
  }
  
  // Detecção de endereço
  if (/\b(rua|av|avenida|praça|estrada|rodovia|alameda)\b/i.test(text) || 
      /\b\d+\b.*\b(casa|apto|apartamento|bloco)\b/i.test(text)) {
    return 'address';
  }
  
  // Detecção de saudação
  if (/^(oi|olá|opa|bom dia|boa tarde|boa noite|eae|fala)$/i.test(text)) {
    return 'greeting';
  }
  
  // Se no contexto de data collection, inferir baseado no estado atual
  if (currentFlowState === SystemFlowState.DATA_COLLECTION) {
    // Se contém números, pode ser telefone ou data
    if (/\d{8,}/.test(text.replace(/\D/g, ''))) {
      return 'appointment_inquiry';
    }
  }
  
  return null;
}

/**
 * Função utilitária para logging de limpeza de intents
 */
export function logIntentCleanup(
  location: string,
  original: string | null | undefined,
  cleaned: BusinessIntent | null,
  context?: string
): void {
  const ctx = context ? ` [${context}]` : '';
  console.log(`🧹 [INTENT-CLEANUP]${ctx} ${location}: "${original}" → "${cleaned}"`);
}