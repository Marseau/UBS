/**
 * LLM Intent Classifier Service - Camada 2
 * Classificador LLM fechado com temperature=0 e validação rigorosa contra allowlist
 * Só é chamada quando detector determinístico retorna null
 */

import OpenAI from 'openai';
import { INTENT_KEYS, IntentKey } from './deterministic-intent-detector.service';

export interface LLMClassificationResult {
  intent: string | null;
  decision_method: 'llm_classification';
  confidence: number;
  processing_time_ms: number;
  model_used?: string;
  // ✅ ADICIONAR MÉTRICAS OPENAI COMPLETAS
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  api_cost_usd?: number;
  raw_response?: any;
}

export class LLMIntentClassifierService {
  private openai: OpenAI;
  private config: any;
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || ''
    });
    
    // Config para escalonamento de modelos
    this.config = {
      openai: {
        models: ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4'],
        temperature: 0,
        maxTokens: 20
      }
    };
  }

  /**
   * ✅ Escalonamento de modelos: tenta em ordem até bater confiança mínima
   */
  private async classifyWithEscalation(
    userText: string,
    systemPrompt: string,
    minConfidence = 0.75
  ): Promise<{ intent: string | null; confidence: number; model_used: string; raw?: any; usage?: any }> {
    const models = (this.config?.openai?.models && this.config.openai.models.length > 0)
      ? this.config.openai.models
      : ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4'];

    let lastError: any;
    for (const model of models) {
      try {
        const supportsJsonMode = model.includes('gpt-4o') || model.includes('gpt-3.5-turbo') || model === 'gpt-4o-mini';
        
        const resp = await this.openai.chat.completions.create({
          model,
          temperature: this.config?.openai?.temperature ?? 0,
          top_p: 0,
          max_tokens: this.config?.openai?.maxTokens ?? 20,
          ...(supportsJsonMode && { response_format: { type: 'json_object' } }),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText }
          ]
        });

        const rawResponse = resp.choices?.[0]?.message?.content?.trim() || '';
        
        // Parse e validação rigorosa usando método existente
        const classifiedIntent = this.parseAndValidateResponse(rawResponse);
        const confidence = classifiedIntent ? 0.8 : 0.0; // 80% para LLM válida, 0% para null

        if (classifiedIntent && confidence >= minConfidence) {
          return { 
            intent: classifiedIntent, 
            confidence, 
            model_used: model, 
            raw: resp,
            usage: resp.usage
          };
        }
        // baixa confiança → tenta próximo modelo
      } catch (err) {
        lastError = err;
        // falha do modelo → tenta próximo
      }
    }

    // Se todos falharam/baixa confiança → retorna nulo com último modelo
    return { 
      intent: null, 
      confidence: 0, 
      model_used: models[models.length - 1], 
      raw: lastError,
      usage: undefined 
    };
  }

  /**
   * Classifica intent usando LLM com temperatura 0 e validação rigorosa
   */
  async classifyIntent(text: string): Promise<LLMClassificationResult> {
    const startTime = Date.now();
    
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(text);

      console.log('🤖 [LLM-CLASSIFIER] Chamando OpenAI para classificação fechada com escalonamento');

      // Usar escalonamento de modelos
      const { intent, confidence, model_used, usage, raw } = 
        await this.classifyWithEscalation(userPrompt, systemPrompt, 0.75);

      const processingTime = Date.now() - startTime;
      
      // ✅ CALCULAR CUSTO DA API
      const apiCost = this.calculateOpenAICost(usage, model_used);
      
      console.log(`🤖 [LLM-CLASSIFIER] Intent classificada: ${intent} (${processingTime}ms) [${model_used}] - R$ ${(apiCost || 0).toFixed(6)}`);

      return {
        intent,
        decision_method: 'llm_classification',
        confidence,
        processing_time_ms: processingTime,
        model_used,
        usage,
        api_cost_usd: apiCost || undefined,
        raw_response: raw
      };

    } catch (error) {
      console.error('🚨 [LLM-CLASSIFIER] Erro na classificação:', error);
      return {
        intent: null,
        decision_method: 'llm_classification',
        confidence: 0.0,
        processing_time_ms: Date.now() - startTime,
        model_used: 'error'
      };
    }
  }

  /**
   * Constrói prompt system para classificação fechada
   */
  private buildSystemPrompt(): string {
    const allowedIntents = INTENT_KEYS.join('\n- ');
    
    return `Você é um classificador de intenção. Classifique a mensagem do usuário em EXATAMENTE UMA das chaves abaixo e nada além disso.

INTENTS PERMITIDAS:
- ${allowedIntents}

Regras:
1) Responda SOMENTE com JSON no formato: {"intent":"<uma-das-chaves>"}.
2) Se NÃO for possível classificar com segurança, responda exatamente: {"intent":null}.
3) Não explique. Não inclua texto extra. Sem sinônimos fora da lista.
4) Use APENAS as chaves exatas da lista acima.
5) Se houver múltiplas possibilidades, escolha a mais provável.`;
  }

  /**
   * Constrói prompt user com a mensagem
   */
  private buildUserPrompt(text: string): string {
    return `Mensagem do usuário (pt-BR):
---
${text}
---
Classifique.`;
  }

  /**
   * Parse e validação com rigor máximo contra allowlist
   */
  private parseAndValidateResponse(rawResponse: string): string | null {
    try {
      // Parse JSON
      const parsed = JSON.parse(rawResponse);
      
      // Verificar estrutura básica
      if (!parsed || typeof parsed.intent === 'undefined') {
        console.warn('🚨 [LLM-CLASSIFIER] Resposta sem campo intent:', rawResponse);
        return null;
      }

      // Se intent é explicitamente null
      if (parsed.intent === null) {
        console.log('🤖 [LLM-CLASSIFIER] LLM retornou null (não conseguiu classificar)');
        return null;
      }

      // Validação rigorosa contra allowlist
      const intentCandidate = parsed.intent as string;
      const isValid = (INTENT_KEYS as readonly string[]).includes(intentCandidate);

      if (!isValid) {
        console.warn(`🚨 [LLM-CLASSIFIER] Intent "${intentCandidate}" NÃO está na allowlist. Rejeitando.`);
        return null;
      }

      // Validação passou - intent aprovada
      console.log(`✅ [LLM-CLASSIFIER] Intent "${intentCandidate}" validada contra allowlist`);
      return intentCandidate;

    } catch (error) {
      console.error('🚨 [LLM-CLASSIFIER] Erro no parse JSON:', error, 'Raw:', rawResponse);
      return null;
    }
  }

  /**
   * ✅ Calcula custo estimado da chamada OpenAI
   */
  private calculateOpenAICost(usage: any, model?: string): number | null {
    if (!usage || !usage.prompt_tokens || !usage.completion_tokens) {
      return null;
    }

    // 💰 CUSTOS CORRETOS POR MODELO (por 1K tokens)
    const modelCosts: Record<string, { prompt: number; completion: number }> = {
      'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
      'gpt-3.5-turbo': { prompt: 0.0015, completion: 0.002 },
      'gpt-4': { prompt: 0.03, completion: 0.06 },
      'gpt-4o': { prompt: 0.005, completion: 0.015 }
    };

    // Detectar modelo atual ou usar fallback genérico
    const costs = modelCosts[model || 'gpt-4o-mini'] || modelCosts['gpt-4o-mini'];
    
    const promptCost = (usage.prompt_tokens / 1000) * costs!.prompt;
    const completionCost = (usage.completion_tokens / 1000) * costs!.completion;
    
    return Math.round((promptCost + completionCost) * 1000000) / 1000000; // 6 casas decimais para precisão
  }

  /**
   * Método utilitário para testar a classificação
   */
  async testClassification(testMessages: string[]): Promise<void> {
    console.log('🧪 [LLM-CLASSIFIER] Iniciando testes de classificação...');
    
    for (const message of testMessages) {
      const result = await this.classifyIntent(message);
      console.log(`📝 "${message}" → ${result.intent || 'null'} (${result.processing_time_ms}ms) - R$ ${(result.api_cost_usd || 0).toFixed(6)}`);
    }
  }
}