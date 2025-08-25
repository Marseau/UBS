/**
 * AI Configuration Centralizada
 * 
 * Centraliza configuração do modelo OpenAI usado em todo o sistema.
 * Garante consistência e facilita mudanças futuras.
 * 
 * @author PRP-OPENAI-MODEL-UNI
 */

/**
 * Retorna o modelo OpenAI configurado via variável de ambiente
 * com fallback seguro para gpt-4
 * 
 * @returns string - Nome do modelo OpenAI (ex: 'gpt-4', 'gpt-4-turbo')
 */
export function getOpenAIModel(): string {
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4';
  
  // Log de debug em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    console.log(`🤖 AI Model: ${model} (from ${process.env.OPENAI_MODEL ? 'env' : 'default'})`);
  }
  
  return model;
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
 * Validação de modelo para produção
 * Aborta processo se modelo não for gpt-4* em produção
 */
export function validateProductionModel(): void {
  if (process.env.NODE_ENV === 'production' && !isGpt4()) {
    const currentModel = getOpenAIModel();
    console.error('🚨 CRITICAL ERROR: OPENAI_MODEL must be gpt-4* in production');
    console.error(`📋 Current model: ${currentModel}`);
    console.error(`📋 NODE_ENV: ${process.env.NODE_ENV}`);
    console.error(`📋 OPENAI_MODEL env: ${process.env.OPENAI_MODEL || 'not set'}`);
    console.error('🔧 Fix: Set OPENAI_MODEL=gpt-4 or similar gpt-4* variant');
    
    // Abortar processo em produção
    process.exit(1);
  }
}

/**
 * Configuração padrão para OpenAI chat.completions
 * Usar em todos os serviços que fazem chamadas à API
 */
export const defaultOpenAIConfig = {
  model: getOpenAIModel(),
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