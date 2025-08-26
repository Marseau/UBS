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
}

export class LLMIntentClassifierService {
  private openai: OpenAI;
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || ''
    });
  }

  /**
   * Classifica intent usando LLM com temperatura 0 e validação rigorosa
   */
  async classifyIntent(text: string): Promise<LLMClassificationResult> {
    const startTime = Date.now();
    
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(text);

      console.log('🤖 [LLM-CLASSIFIER] Chamando OpenAI para classificação fechada');

      // Usar modelo compatível com JSON mode
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const supportsJsonMode = model.includes('gpt-4o') || model.includes('gpt-3.5-turbo') || model === 'gpt-4o-mini';
      
      const completion = await this.openai.chat.completions.create({
        model,
        temperature: 0,
        top_p: 0,
        max_tokens: 20,
        ...(supportsJsonMode && { response_format: { type: 'json_object' } }),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });

      const processingTime = Date.now() - startTime;
      const rawResponse = completion.choices?.[0]?.message?.content?.trim() || '';
      
      console.log('🤖 [LLM-CLASSIFIER] Resposta bruta:', rawResponse);

      // Parse e validação rigorosa
      const classifiedIntent = this.parseAndValidateResponse(rawResponse);
      
      console.log(`🤖 [LLM-CLASSIFIER] Intent classificada: ${classifiedIntent} (${processingTime}ms)`);

      return {
        intent: classifiedIntent,
        decision_method: 'llm_classification',
        confidence: classifiedIntent ? 0.8 : 0.0, // 80% para LLM, 0% para null
        processing_time_ms: processingTime
      };

    } catch (error) {
      console.error('🚨 [LLM-CLASSIFIER] Erro na classificação:', error);
      return {
        intent: null,
        decision_method: 'llm_classification',
        confidence: 0.0,
        processing_time_ms: Date.now() - startTime
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
   * Método utilitário para testar a classificação
   */
  async testClassification(testMessages: string[]): Promise<void> {
    console.log('🧪 [LLM-CLASSIFIER] Iniciando testes de classificação...');
    
    for (const message of testMessages) {
      const result = await this.classifyIntent(message);
      console.log(`📝 "${message}" → ${result.intent || 'null'} (${result.processing_time_ms}ms)`);
    }
  }
}