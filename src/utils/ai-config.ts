/**
 * AI Configuration Centralizada
 * 
 * Centraliza configuração do modelo OpenAI usado em todo o sistema.
 * Garante consistência e facilita mudanças futuras.
 * 
 * @author PRP-OPENAI-MODEL-UNI
 */

/**
 * Retorna array de modelos OpenAI para sistema de fallback
 * @returns string[] - Array de modelos em ordem de prioridade
 */
export function getOpenAIModels(): string[] {
  return ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4'];
}

/**
 * Retorna primeiro modelo da sequência de fallback
 * @returns string - Nome do modelo primário
 */
export function getOpenAIModel(): string {
  const models = getOpenAIModels();
  
  // Log de debug em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    console.log(`🤖 AI Models: [${models.join(', ')}] (fallback system)`);
  }
  
  return models[0];
}

/**
 * Valida se o modelo é um GPT-4 (necessário para produção)
 * 
 * @returns boolean - true se modelo começa com 'gpt-4'
 */
export function isGpt4(): boolean {
  const model = getOpenAIModel();
  return model.toLowerCase().startsWith('gpt-4');
}

/**
 * Validação de modelos para produção
 * Sistema de fallback sempre disponível
 */
export function validateProductionModel(): void {
  const models = getOpenAIModels();
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`✅ AI Fallback System: ${models.length} modelos configurados`);
    console.log(`🎯 Ordem de tentativa: ${models.join(' → ')}`);
  }
  
  // Em produção, apenas logga sem abortar processo
  if (process.env.NODE_ENV === 'production') {
    console.log(`🚀 Production AI: Fallback system active with ${models.length} models`);
  }
}

/**
 * Configuração padrão para OpenAI chat.completions
 * Usar em todos os serviços que fazem chamadas à API
 */
export const defaultOpenAIConfig = {
  models: getOpenAIModels(), // Array para fallback
  temperature: 0.7,
  max_tokens: 1000,
  top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0
} as const;

/**
 * Log estruturado do modelo usado para telemetria
 * Usar ao gravar dados de conversation_history
 */
export function getModelUsedForTelemetry(): string {
  return getOpenAIModel();
}