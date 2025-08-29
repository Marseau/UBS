/**
 * Configuração centralizada de modelos OpenAI
 * Padronização para usar apenas modelos suportados pela API atual
 */

export const MODELS = {
  FAST: process.env.OPENAI_MODEL_FAST || "gpt-4o-mini",      // Para classificação, intent detection, telemetry
  BALANCED: process.env.OPENAI_MODEL_BALANCED || "gpt-3.5-turbo", // Para conversas normais
  STRICT: process.env.OPENAI_MODEL_STRICT || "gpt-4o-mini"   // Sistema de fallback inicia com modelo economico         // Para casos críticos e fallback
};

/**
 * Heurística de seleção de modelo baseada no contexto
 */
export const getModelForContext = (context: 'intent' | 'conversation' | 'critical' | 'multimodal' | 'fallback'): string => {
  switch (context) {
    case 'intent':
      return MODELS.FAST; // Intent detection rápida
    case 'conversation':
      return MODELS.BALANCED; // Conversas normais
    case 'critical':
    case 'fallback':
    case 'multimodal': // Multimodal crítico usa modelo mais capaz
      return MODELS.STRICT;
    default:
      return MODELS.BALANCED;
  }
};

/**
 * Lista de modelos válidos para validação
 */
export const VALID_MODELS = [
  "gpt-4",
  "gpt-3.5-turbo", 
  "gpt-4o-mini"
] as const;

/**
 * Validar se um modelo é suportado
 */
export const isValidModel = (model: string): boolean => {
  return VALID_MODELS.includes(model as any);
};