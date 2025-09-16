/**
 * Context-Aware Response System
 *
 * Sistema inteligente que analisa o contexto das mensagens do usuário
 * e gera respostas apropriadas mantendo o fluxo conversacional natural.
 *
 * Resolve o problema: Bot ignora perguntas e segue script rígido
 * Solução: Reconhece intenções paralelas e responde contextualmente
 *
 * @author Context Engineering Team
 * @version 1.0.0
 */

import { conversationLogger } from '../../utils/logger';
import { LogContext } from '../../types';
import { GenderInferenceUtil } from '../../utils/gender-inference.util';
import { AINameGenderExtractor } from '../../utils/ai-name-gender-extractor.util';

export interface ConversationContext {
  hasName: boolean;
  hasEmail: boolean;
  hasGender?: boolean;
  hasPhone?: boolean;
  userName?: string;
  userEmail?: string;
  userGender?: string;
  currentStage: 'onboarding' | 'service_selection' | 'scheduling' | 'confirmation';
  previousMessages: string[];
  tenantName?: string;
  businessType?: string;
}

export interface ContextualResponse {
  message: string;
  shouldContinueFlow: boolean;
  nextStage?: string;
  contextUpdate?: Partial<ConversationContext>;
  detectedIntent: string;
  confidence: number;
  aiMetrics?: {
    model_used: string;
    tokens: number;
    api_cost_usd: number;
    processing_time_ms: number;
  };
}

export interface MessageIntent {
  type: 'bot_info_request' | 'casual_conversation' | 'data_collection_response' | 'appointment_request' | 'other';
  confidence: number;
  keywords: string[];
}

export class ContextAwareService {
  private logger = conversationLogger('context-aware-service');

  constructor() {
    this.logger.conversation('Context-Aware Response System initialized', {
      service: 'context-aware-service',
      method: 'constructor',
      operationType: 'initialization'
    });
  }

  /**
   * Detecta se a mensagem é um nome seguido de pergunta sobre o bot
   */
  private isNameWithBotQuestion(message: string): boolean {
    const botQuestionPatterns = [
      /e\s*o\s*seu\??/i,
      /e\s*você\??/i,
      /qual.*o.*seu/i,
      /como.*se\s*chama/i
    ];

    // Verifica se tem pergunta sobre bot E se tem pelo menos 3 caracteres antes da pergunta
    const hasBotQuestion = botQuestionPatterns.some(pattern => pattern.test(message));

    if (hasBotQuestion) {
      // Extrair a parte antes da pergunta
      const beforeQuestion = this.extractNameFromMessage(message).trim();
      console.log('🔍 [CONTEXT-AWARE] isNameWithBotQuestion - beforeQuestion:', beforeQuestion);

      // Se tem conteúdo significativo antes da pergunta (mais de 2 chars), é nome + pergunta
      return beforeQuestion.length > 2;
    }

    return false;
  }

  /**
   * Extrai nomes usando inteligência artificial
   */
  private async extractNameFromMessageAI(message: string): Promise<{
    name: string | null;
    gender: 'male' | 'female' | 'unknown';
    confidence: number;
    intention: 'provided_name' | 'refused' | 'asked_back' | 'ambiguous';
    metrics: {
      model_used: string;
      tokens: number;
      api_cost_usd: number;
      processing_time_ms: number;
    };
  }> {
    try {
      console.log('🤖 [AI-NAME-EXTRACTION] Processing with AI:', message);

      const result = await AINameGenderExtractor.extractNameAndGender(message);

      // Convert Portuguese to English for internal system compatibility
      const genderMapping = {
        'masculino': 'male' as const,
        'feminino': 'female' as const,
        'nao_informado': 'unknown' as const
      };

      const intentionMapping = {
        'informou_nome': 'provided_name' as const,
        'recusou': 'refused' as const,
        'perguntou_de_volta': 'asked_back' as const,
        'ambigua': 'ambiguous' as const
      };

      return {
        name: result.nome_completo,
        gender: genderMapping[result.genero],
        confidence: result.confianca,
        intention: intentionMapping[result.intencao],
        metrics: {
          model_used: result.model_used,
          tokens: result.tokens.total_tokens,
          api_cost_usd: result.api_cost_usd,
          processing_time_ms: result.processing_time_ms
        }
      };

    } catch (error) {
      console.error('❌ [AI-NAME-EXTRACTION] Error:', error);

      return {
        name: null,
        gender: 'unknown',
        confidence: 0,
        intention: 'ambiguous',
        metrics: {
          model_used: 'error',
          tokens: 0,
          api_cost_usd: 0,
          processing_time_ms: 0
        }
      };
    }
  }

  /**
   * Legacy method - mantido para compatibilidade
   */
  private extractNameFromMessage(message: string): string {
    console.log('⚠️ [LEGACY-EXTRACTION] Using legacy regex extraction for:', message);

    // Fallback: limpar padrões de pergunta sobre o bot
    const cleanedMessage = message
      .replace(/e\s*o\s*seu\??/gi, '')
      .replace(/e\s*você\??/gi, '')
      .replace(/qual.*o.*seu/gi, '')
      .replace(/como.*se\s*chama/gi, '')
      .trim();

    return cleanedMessage;
  }

  /**
   * Analisa a intenção da mensagem do usuário
   */
  detectMessageIntent(message: string, context: ConversationContext): MessageIntent {
    const lowerMessage = message.toLowerCase();
    console.log('🔍 [CONTEXT-AWARE] detectMessageIntent analyzing:', { message, lowerMessage });

    // PRIORIDADE 1: Detectar se é um nome seguido de pergunta sobre o bot (pergunta dupla)
    if (this.isNameWithBotQuestion(message)) {
      console.log('✅ [CONTEXT-AWARE] Name + bot question detected!');
      return {
        type: 'bot_info_request',
        confidence: 0.9,
        keywords: ['nome', 'pergunta_dupla']
      };
    }

    // PRIORIDADE 2: Padrões para perguntas simples sobre o bot (sem nome)
    const botInfoPatterns = [
      /qual.*seu nome/i,
      /como.*se chama/i,
      /quem.*você/i,
      /seu nome/i,
      /nome do assistente/i,
      /bot.*nome/i,
      /e\s*o\s*seu\??/i,      // "e o seu?" ou "e o seu" (quando não tem nome antes)
      /e\s*você\??/i,         // "e você?"
      /qual.*o.*seu/i         // "qual é o seu"
    ];

    console.log('🔍 [CONTEXT-AWARE] Testing botInfoPatterns against:', lowerMessage);
    const botInfoMatch = botInfoPatterns.some(pattern => {
      const matches = pattern.test(lowerMessage);
      console.log(`  Pattern ${pattern} matches: ${matches}`);
      return matches;
    });

    // Detectar bot info request simples
    if (botInfoMatch) {
      console.log('✅ [CONTEXT-AWARE] Bot info pattern matched!');
      return {
        type: 'bot_info_request',
        confidence: 0.8,
        keywords: ['nome', 'assistente', 'bot']
      };
    }

    // Padrões para conversa casual
    const casualPatterns = [
      /prazer/i,
      /muito obrigad/i,
      /obrigad/i,
      /legal/i,
      /ótimo/i,
      /perfeito/i,
      /tudo bem/i,
      /como vai/i
    ];

    // Padrões para solicitação de agendamento
    const appointmentPatterns = [
      /agendar/i,
      /marcar.*consulta/i,
      /quero.*horário/i,
      /disponível/i,
      /quando.*pode/i
    ];

    // Detectar casual conversation
    if (casualPatterns.some(pattern => pattern.test(lowerMessage))) {
      return {
        type: 'casual_conversation',
        confidence: 0.8,
        keywords: ['prazer', 'obrigado', 'cortesia']
      };
    }

    // Detectar appointment request
    if (appointmentPatterns.some(pattern => pattern.test(lowerMessage))) {
      return {
        type: 'appointment_request',
        confidence: 0.85,
        keywords: ['agendar', 'consulta', 'horário']
      };
    }

    // Se temos email pattern, é resposta de coleta de dados
    const emailPattern = /\S+@\S+\.\S+/;
    if (emailPattern.test(lowerMessage)) {
      return {
        type: 'data_collection_response',
        confidence: 0.95,
        keywords: ['email', 'dados']
      };
    }

    // Se temos gender pattern, é resposta de coleta de dados
    const genderPattern = /^(masculino|feminino|outro|m|f|o)$/i;
    if (genderPattern.test(message.trim())) {
      console.log('✅ [CONTEXT-AWARE] Gender pattern matched:', message.trim());
      return {
        type: 'data_collection_response',
        confidence: 0.95,
        keywords: ['gender', 'dados']
      };
    }

    // 🔍 DETECÇÃO DE NOME: Verificar se é frase completa com "meu nome é" ou apenas nome
    const nameIntroPatterns = [
      /meu nome é/i,
      /me chamo/i,
      /sou [A-Z]/i,
      /meu nome/i
    ];

    const hasNameIntro = nameIntroPatterns.some(pattern => pattern.test(message));

    if (hasNameIntro) {
      console.log('🔄 [CONTEXT-AWARE] Name introduction detected, requires AI processing:', message.trim());
      return {
        type: 'data_collection_response',
        confidence: 0.95,
        keywords: ['nome_complexo', 'ai_required']
      };
    }

    // 🔍 DETECÇÃO DE NOME SIMPLES: Se parece ser apenas um nome (sem introdução), é resposta de coleta de dados
    const simpleNamePattern = /^[A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ][a-zàáâãäåçèéêëìíîïñòóôõöùúûüý]+(?:\s+(?:[A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ][a-zàáâãäåçèéêëìíîïñòóôõöùúûüý]+|de|da|do|dos|das))*$/;
    if (simpleNamePattern.test(message.trim()) && message.trim().length >= 4) {
      console.log('🔍 [CONTEXT-AWARE] Simple name pattern matched:', message.trim());
      return {
        type: 'data_collection_response',
        confidence: 0.9,
        keywords: ['nome', 'dados']
      };
    }

    return {
      type: 'other',
      confidence: 0.5,
      keywords: []
    };
  }

  /**
   * Gera resposta contextual baseada na intenção e contexto atual
   */
  async generateContextualResponse(
    message: string,
    intent: MessageIntent,
    context: ConversationContext
  ): Promise<ContextualResponse> {
    const logContext: LogContext = {
      service: 'context-aware-service',
      method: 'generateContextualResponse',
      operationType: 'generate_response',
      intent: intent.type,
      confidence: intent.confidence
    };

    this.logger.conversation('Generating contextual response', {
      ...logContext,
      hasName: context.hasName,
      hasEmail: context.hasEmail,
      currentStage: context.currentStage
    });

    switch (intent.type) {
      case 'bot_info_request':
        // Check if it's a combined name + bot question
        if (intent.keywords.includes('pergunta_dupla')) {
          return await this.handleNameWithBotQuestion(message, context);
        }
        return this.handleBotInfoRequest(context);

      case 'casual_conversation':
        return this.handleCasualConversation(message, context);

      case 'data_collection_response':
        return await this.handleDataCollection(message, context, intent);

      case 'appointment_request':
        return this.handleAppointmentRequest(context);

      default:
        return this.handleDefault(message, context);
    }
  }

  /**
   * Handle pergunta sobre informações do bot
   */
  private handleBotInfoRequest(context: ConversationContext): ContextualResponse {
    const businessName = context.tenantName || 'nosso negócio';
    let response = `Sou o assistente inteligente do ${businessName}! 🤖`;

    // Contextualizar baseado no que já sabemos
    if (context.hasName && context.userName) {
      if (context.hasEmail) {
        response += ` Agora que já tenho seus dados, ${context.userName}, como posso te ajudar com seu agendamento?`;
        return {
          message: response,
          shouldContinueFlow: false, // ✅ Stop flow, give complete answer
          nextStage: 'service_selection',
          detectedIntent: 'bot_info_with_transition',
          confidence: 0.9
        };
      } else {
        response += ` ${context.userName}, para finalizar seu cadastro, preciso do seu email:`;
        return {
          message: response,
          shouldContinueFlow: false, // ✅ Stop flow, give complete answer
          nextStage: 'onboarding',
          detectedIntent: 'bot_info_continue_onboarding',
          confidence: 0.9
        };
      }
    }

    response += ' Para começar, preciso de algumas informações. Qual é o seu nome completo?';

    return {
      message: response,
      shouldContinueFlow: false, // ✅ Stop flow, give complete answer about bot identity
      nextStage: 'onboarding',
      detectedIntent: 'bot_info_start_onboarding',
      confidence: 0.9
    };
  }

  /**
   * Handle pergunta dupla: nome + pergunta sobre bot
   */
  private async handleNameWithBotQuestion(message: string, context: ConversationContext): Promise<ContextualResponse> {
    console.log('🤖 [CONTEXT-AWARE] Processing name + bot question with AI:', message);

    // 🤖 Use AI-powered extraction
    const aiResult = await this.extractNameFromMessageAI(message);
    const businessName = context.tenantName || 'nosso negócio';

    console.log('🤖 [AI-EXTRACTION] Result:', aiResult);

    // Handle different AI intentions
    if (aiResult.intention === 'refused') {
      return {
        message: `Sem problemas! Sou o assistente inteligente do ${businessName}! 🤖 Quando quiser compartilhar seu nome, estarei aqui. Como posso te ajudar hoje?`,
        shouldContinueFlow: false,
        nextStage: 'service_selection',
        detectedIntent: 'name_refused_but_answered_bot_question',
        confidence: aiResult.confidence
      };
    }

    if (aiResult.intention === 'ambiguous' || !aiResult.name) {
      return {
        message: `Sou o assistente inteligente do ${businessName}! 🤖 Para começar, qual é o seu nome completo?`,
        shouldContinueFlow: false,
        nextStage: 'onboarding',
        detectedIntent: 'bot_info_with_name_request',
        confidence: aiResult.confidence
      };
    }

    // Successfully extracted name
    const extractedName = aiResult.name;
    let response = `Prazer em te conhecer, ${extractedName}! Sou o assistente inteligente do ${businessName}! 🤖`;

    // Use AI gender inference (higher confidence) if available
    if (aiResult.gender !== 'unknown' && aiResult.confidence >= 0.85) {
      const treatment = aiResult.gender === 'male' ? 'Sr.' : 'Sra.';
      response = `Prazer em te conhecer, ${treatment} ${extractedName}! Sou o assistente inteligente do ${businessName}! 🤖 Para finalizar seu cadastro, preciso do seu email:`;

      return {
        message: response,
        shouldContinueFlow: false,
        nextStage: 'onboarding',
        contextUpdate: {
          hasName: true,
          userName: extractedName,
          hasGender: true,
          userGender: aiResult.gender
        },
        detectedIntent: 'name_and_gender_extracted_by_ai',
        confidence: aiResult.confidence,
        // 📊 Adicionar métricas operacionais da AI
        aiMetrics: aiResult.metrics
      };
    } else {
      // 🧠 Fallback para inference tradicional baseada em nome brasileiro
      const genderInference = GenderInferenceUtil.inferGenderFromName(extractedName);
      console.log('🧠 [GENDER-INFERENCE] Fallback result:', genderInference);

      if (GenderInferenceUtil.shouldSkipGenderQuestion(genderInference)) {
        const treatment = genderInference.gender === 'male' ? 'Sr.' : 'Sra.';
        response = `Prazer em te conhecer, ${treatment} ${extractedName}! Sou o assistente inteligente do ${businessName}! 🤖 Para finalizar seu cadastro, preciso do seu email:`;

        return {
          message: response,
          shouldContinueFlow: false,
          nextStage: 'onboarding',
          contextUpdate: {
            hasName: true,
            userName: extractedName,
            hasGender: true,
            userGender: genderInference.gender
          },
          detectedIntent: 'name_extracted_by_ai_gender_by_inference',
          confidence: Math.max(aiResult.confidence, genderInference.confidence),
          // 📊 Adicionar métricas operacionais da AI
          aiMetrics: aiResult.metrics
        };
      } else {
        // Confiança baixa/média - continua fluxo normal pedindo email
        response += ' Para finalizar seu cadastro, preciso do seu email:';

        return {
          message: response,
          shouldContinueFlow: false,
          nextStage: 'onboarding',
          contextUpdate: {
            hasName: true,
            userName: extractedName
          },
          detectedIntent: 'name_extracted_by_ai_needs_gender',
          confidence: aiResult.confidence,
          // 📊 Adicionar métricas operacionais da AI
          aiMetrics: aiResult.metrics
        };
      }
    }
  }

  /**
   * Handle conversa casual/cortesia
   */
  private handleCasualConversation(message: string, context: ConversationContext): ContextualResponse {
    let response = '';

    if (message.toLowerCase().includes('prazer')) {
      response = 'O prazer é meu! ✨';
    } else if (message.toLowerCase().includes('obrigad')) {
      response = 'De nada! Estou aqui para ajudar! 😊';
    } else {
      response = 'Fico feliz em ajudar! 🙂';
    }

    // Transição contextual baseada no estado atual
    if (context.hasName && !context.hasEmail) {
      response += ` ${context.userName}, agora preciso do seu email para continuar:`;
    } else if (context.hasName && context.hasEmail) {
      response += ` ${context.userName}, como posso te ajudar hoje?`;
    } else {
      response += ' Para começar, qual é o seu nome completo?';
    }

    return {
      message: response,
      shouldContinueFlow: true,
      nextStage: context.hasEmail ? 'service_selection' : 'onboarding',
      detectedIntent: 'casual_with_transition',
      confidence: 0.8
    };
  }

  /**
   * Handle resposta de coleta de dados (email, nome, etc)
   */
  private async handleDataCollection(message: string, context: ConversationContext, intent?: MessageIntent): Promise<ContextualResponse> {
    // Se é uma resposta de gender
    const genderPattern = /^(masculino|feminino|outro|m|f|o)$/i;
    if (genderPattern.test(message.trim())) {
      const normalizedGender = message.trim().toLowerCase();
      // Database expects English values: 'male', 'female', 'other'
      const gender = ['m', 'masculino'].includes(normalizedGender) ? 'male' :
                     ['f', 'feminino'].includes(normalizedGender) ? 'female' : 'other';

      return {
        message: 'Perfeito! Cadastro finalizado com sucesso. ✅ Agora vamos ao seu agendamento. Qual serviço você precisa?',
        shouldContinueFlow: true,
        nextStage: 'service_selection',
        contextUpdate: {
          hasGender: true,
          userGender: gender
        },
        detectedIntent: 'gender_collected',
        confidence: 0.95
      };
    }

    // Se é um email
    const emailPattern = /\S+@\S+\.\S+/;
    if (emailPattern.test(message)) {
      const email = message.match(emailPattern)?.[0];

      // 🧠 Se já temos nome, tentar inferir gender
      if (context.hasName && context.userName) {
        const genderInference = GenderInferenceUtil.inferGenderFromName(context.userName);
        console.log('🧠 [GENDER-INFERENCE] Email coletado, verificando nome:', context.userName, genderInference);

        // Se confiança muito alta (≥85%), finaliza onboarding com gender inferido
        if (GenderInferenceUtil.shouldSkipGenderQuestion(genderInference)) {
          const treatment = genderInference.gender === 'male' ? 'Sr.' : 'Sra.';

          return {
            message: `Email registrado com sucesso, ${treatment} ${context.userName}! ✅ Cadastro finalizado. Agora vamos ao seu agendamento. Qual serviço você precisa?`,
            shouldContinueFlow: true,
            nextStage: 'service_selection',
            contextUpdate: {
              hasEmail: true,
              userEmail: email,
              hasGender: true,
              userGender: genderInference.gender
            },
            detectedIntent: 'email_and_gender_inferred',
            confidence: 0.98
          };
        } else {
          // Confiança baixa/média - pergunta personalizada
          const genderQuestion = GenderInferenceUtil.generateGenderConfirmationMessage(genderInference, context.userName);

          return {
            message: `Email registrado com sucesso! ✅ ${genderQuestion}`,
            shouldContinueFlow: true,
            nextStage: 'onboarding',
            contextUpdate: {
              hasEmail: true,
              userEmail: email
            },
            detectedIntent: 'email_collected_with_smart_gender_question',
            confidence: 0.95
          };
        }
      }

      // Fallback - pergunta padrão se não temos nome
      return {
        message: 'Email registrado com sucesso! ✅ Para finalizar seu cadastro, você poderia me informar como gostaria de ser tratado(a)? (masculino/feminino/outro)',
        shouldContinueFlow: true,
        nextStage: 'onboarding',
        contextUpdate: {
          hasEmail: true,
          userEmail: email
        },
        detectedIntent: 'email_collected',
        confidence: 0.95
      };
    }

    // 🤖 FORÇA USO DA AI: Se intent indica que precisa de AI (nome_complexo)
    if (intent?.keywords.includes('ai_required')) {
      console.log('🤖 [DATA-COLLECTION] AI processing required for complex name:', message);
      return await this.processNameWithAI(message, context);
    }

    // 🔄 SISTEMA HÍBRIDO: REGEX + GENDER FIRST, LLM FALLBACK
    // Se parece ser um nome (não tem @, tem espaços ou mais de 2 palavras), tentar camadas
    if (!message.includes('@') && (message.includes(' ') || message.length > 3)) {
      return await this.processNameWithHybridLayers(message, context);
    }

    return {
      message: 'Não consegui entender. Pode repetir por favor?',
      shouldContinueFlow: true,
      detectedIntent: 'data_collection_unclear',
      confidence: 0.3
    };
  }

  /**
   * 🤖 AI-powered name processing - Substitui fallback REGEX
   */
  private async processNameWithAI(message: string, context: ConversationContext): Promise<ContextualResponse> {
    console.log('🤖 [AI-POWERED-NAME] Processing with full AI logic:', message);

    const businessName = context.tenantName || 'nosso negócio';

    try {
      // 🤖 Use AI-powered extraction
      const aiResult = await this.extractNameFromMessageAI(message);
      console.log('🤖 [AI-POWERED-NAME] AI Result:', aiResult);

      // Handle different AI intentions
      if (aiResult.intention === 'refused') {
        return {
          message: `Sem problemas! Quando quiser compartilhar seu nome, estarei aqui. Como posso te ajudar hoje?`,
          shouldContinueFlow: false,
          nextStage: 'service_selection',
          detectedIntent: 'name_refused',
          confidence: aiResult.confidence,
          aiMetrics: aiResult.metrics
        };
      }

      if (aiResult.intention === 'ambiguous' || !aiResult.name) {
        return {
          message: `Para te ajudar melhor, preciso do seu nome completo. Pode me dizer qual é?`,
          shouldContinueFlow: true,
          nextStage: 'onboarding',
          detectedIntent: 'name_ambiguous_need_clarification',
          confidence: aiResult.confidence,
          aiMetrics: aiResult.metrics
        };
      }

      // Successfully extracted name
      const extractedName = aiResult.name;
      let response = `Prazer em te conhecer, ${extractedName}! Sou o assistente inteligente do ${businessName}! 🤖`;

      // Use AI gender inference (higher confidence) if available
      if (aiResult.gender !== 'unknown' && aiResult.confidence >= 0.85) {
        const treatment = aiResult.gender === 'male' ? 'Sr.' : 'Sra.';
        response = `Prazer em te conhecer, ${treatment} ${extractedName}! Sou o assistente inteligente do ${businessName}! 🤖 Para finalizar seu cadastro, preciso do seu email:`;

        return {
          message: response,
          shouldContinueFlow: true,
          nextStage: 'onboarding',
          contextUpdate: {
            hasName: true,
            userName: extractedName,
            hasGender: true,
            userGender: aiResult.gender
          },
          detectedIntent: 'name_and_gender_extracted_by_ai',
          confidence: aiResult.confidence,
          aiMetrics: aiResult.metrics
        };
      }

      // Use fallback gender inference if AI confidence is low
      const genderInference = GenderInferenceUtil.inferGenderFromName(extractedName);
      console.log('🧠 [GENDER-INFERENCE] Fallback result:', genderInference);

      if (GenderInferenceUtil.shouldSkipGenderQuestion(genderInference)) {
        const treatment = genderInference.gender === 'male' ? 'Sr.' : 'Sra.';
        response = `Prazer em te conhecer, ${treatment} ${extractedName}! Sou o assistente inteligente do ${businessName}! 🤖 Para finalizar seu cadastro, preciso do seu email:`;

        return {
          message: response,
          shouldContinueFlow: true,
          nextStage: 'onboarding',
          contextUpdate: {
            hasName: true,
            userName: extractedName,
            hasGender: true,
            userGender: genderInference.gender
          },
          detectedIntent: 'name_and_gender_inferred_by_fallback',
          confidence: 0.9,
          aiMetrics: aiResult.metrics
        };
      }

      // Need to ask gender
      response += ` Para finalizar seu cadastro, preciso do seu email:`;

      return {
        message: response,
        shouldContinueFlow: true,
        nextStage: 'onboarding',
        contextUpdate: {
          hasName: true,
          userName: extractedName
        },
        detectedIntent: 'name_extracted_need_email',
        confidence: aiResult.confidence,
        aiMetrics: aiResult.metrics
      };

    } catch (error) {
      console.error('🚫 [AI-POWERED-NAME] Error in AI processing:', error);

      // Graceful fallback - treat as simple name
      return {
        message: `Prazer em te conhecer, ${message}! Para continuar, preciso do seu email:`,
        shouldContinueFlow: true,
        nextStage: 'onboarding',
        contextUpdate: {
          hasName: true,
          userName: message
        },
        detectedIntent: 'name_collected_ai_error_fallback',
        confidence: 0.7,
        aiMetrics: {
          model_used: 'error',
          tokens: 0,
          api_cost_usd: 0,
          processing_time_ms: 0
        }
      };
    }
  }

  /**
   * 🔄 SISTEMA HÍBRIDO: Camada 1 (REGEX + Gender) → Camada 2 (LLM)
   * Otimização para nomes simples como "José João" que não ativam AI completa
   */
  private async processNameWithHybridLayers(message: string, context: ConversationContext): Promise<ContextualResponse> {
    console.log('🔄 [HYBRID-LAYERS] Processing name with dual-layer approach:', message);

    const businessName = context.tenantName || 'nosso negócio';

    // 🔵 CAMADA 1: REGEX + GENDER INFERENCE (rápida, sem LLM)
    try {
      const regexNameResult = this.extractNameWithRegexAndGender(message);

      if (regexNameResult.success && regexNameResult.name && regexNameResult.confidence >= 0.8) {
        console.log('✅ [HYBRID-LAYER-1] REGEX + Gender successful:', regexNameResult);

        const treatment = regexNameResult.gender === 'male' ? 'Sr.' :
                         regexNameResult.gender === 'female' ? 'Sra.' : '';

        return {
          message: `Prazer em te conhecer, ${treatment} ${regexNameResult.name}! Sou o assistente inteligente do ${businessName}! 🤖 Para finalizar seu cadastro, preciso do seu email:`,
          shouldContinueFlow: true,
          nextStage: 'onboarding',
          contextUpdate: {
            hasName: true,
            userName: regexNameResult.name,
            hasGender: regexNameResult.confidence >= 0.85,
            userGender: regexNameResult.gender
          },
          detectedIntent: 'name_and_gender_extracted_by_regex',
          confidence: regexNameResult.confidence
        };
      } else {
        console.log('⚡ [HYBRID-LAYER-1] REGEX insufficient, falling back to AI:', regexNameResult);
      }
    } catch (error) {
      console.log('🚫 [HYBRID-LAYER-1] REGEX error, falling back to AI:', error);
    }

    // 🤖 CAMADA 2: AI-POWERED PROCESSING (completa, com LLM)
    console.log('🤖 [HYBRID-LAYER-2] Using AI-powered processing for complex case');
    return await this.processNameWithAI(message, context);
  }

  /**
   * 🔵 CAMADA 1: REGEX + GENDER INFERENCE
   * Processamento rápido para nomes simples (SEM perguntas do bot)
   */
  private extractNameWithRegexAndGender(message: string): {
    success: boolean;
    name?: string;
    gender?: 'male' | 'female' | 'unknown';
    confidence: number;
  } {
    const trimmed = message.trim();

    // 🚫 PRIMEIRO: Detectar se contém perguntas do bot - escalar para AI
    const botQuestionPatterns = [
      /e\s*o\s*seu\??/i,
      /e\s*você\??/i,
      /e\s*vc\??/i,
      /qual.*o.*seu/i,
      /como.*se\s*chama/i,
      /meu nome é .+ e /i,  // "Meu nome é X e..."
      /sou .+ e você/i      // "Sou X e você?"
    ];

    const hasBotQuestion = botQuestionPatterns.some(pattern => pattern.test(trimmed));

    if (hasBotQuestion) {
      console.log('🤖 [REGEX-LAYER-1] Bot question detected, escalating to AI:', trimmed);
      return {
        success: false,
        confidence: 0.1  // Força escalamento para AI
      };
    }

    // Patterns para capturar APENAS nomes simples (sem expressões complexas)
    const simpleNamePatterns = [
      /^([A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ][a-zàáâãäåçèéêëìíîïñòóôõöùúûüý]+\s+[A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ][a-zàáâãäåçèéêëìíîïñòóôõöùúûüý]+)$/,  // João Silva
      /^([A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ][a-zàáâãäåçèéêëìíîïñòóôõöùúûüý]+\s+[A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ][a-zàáâãäåçèéêëìíîïñòóôõöùúûüý]+\s+[A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ][a-zàáâãäåçèéêëìíîïñòóôõöùúûüý]+)$/  // João Silva Santos
    ];

    for (const pattern of simpleNamePatterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        const extractedName = match[1].trim();

        // Validações básicas
        if (extractedName.length < 2 || extractedName.length > 100) continue;
        if (!/^[A-ZÀ-Ý][a-zà-ý\s]+$/.test(extractedName)) continue;

        console.log('✅ [REGEX-LAYER-1] Simple name extracted:', extractedName);

        // Inferir gênero usando o utilitário existente
        const genderInference = GenderInferenceUtil.inferGenderFromName(extractedName);

        return {
          success: true,
          name: extractedName,
          gender: genderInference.gender,
          confidence: Math.min(0.9, genderInference.confidence)
        };
      }
    }

    console.log('🔄 [REGEX-LAYER-1] No simple name pattern matched, escalating to AI');
    return {
      success: false,
      confidence: 0.2
    };
  }

  /**
   * Handle solicitação de agendamento
   */
  private handleAppointmentRequest(context: ConversationContext): ContextualResponse {
    if (!context.hasName || !context.hasEmail) {
      return {
        message: 'Para agendar, preciso primeiro de algumas informações. Qual é o seu nome completo?',
        shouldContinueFlow: true,
        nextStage: 'onboarding',
        detectedIntent: 'appointment_need_data',
        confidence: 0.9
      };
    }

    return {
      message: `${context.userName}, vou ajudar com seu agendamento! Qual serviço você precisa?`,
      shouldContinueFlow: true,
      nextStage: 'service_selection',
      detectedIntent: 'appointment_ready',
      confidence: 0.9
    };
  }

  /**
   * Handle casos não identificados
   */
  private handleDefault(message: string, context: ConversationContext): ContextualResponse {
    let response = 'Entendi! ';

    // Continuar fluxo baseado no contexto atual
    if (!context.hasName) {
      response += 'Para começar, qual é o seu nome completo?';
    } else if (!context.hasEmail) {
      response += `${context.userName}, agora preciso do seu email:`;
    } else {
      response += `${context.userName}, como posso te ajudar com seu agendamento?`;
    }

    return {
      message: response,
      shouldContinueFlow: true,
      nextStage: context.hasEmail ? 'service_selection' : 'onboarding',
      detectedIntent: 'default_continue_flow',
      confidence: 0.6
    };
  }

  /**
   * Processa mensagem completa com contexto e retorna resposta inteligente
   */
  async processContextualMessage(
    message: string,
    context: ConversationContext
  ): Promise<ContextualResponse> {
    console.log('🧠 [CONTEXT-AWARE] processContextualMessage called with:', {
      message,
      hasName: context.hasName,
      hasEmail: context.hasEmail,
      currentStage: context.currentStage
    });

    const traceOperation = this.logger.startConversationTrace('processContextualMessage', {
      service: 'context-aware-service',
      method: 'processContextualMessage',
      operationType: 'process_message',
      hasName: context.hasName,
      hasEmail: context.hasEmail,
      currentStage: context.currentStage
    });

    try {
      // 1. Detectar intenção da mensagem
      const intent = this.detectMessageIntent(message, context);

      this.logger.conversation('Intent detected', {
        service: 'context-aware-service',
        method: 'processContextualMessage',
        operationType: 'intent_detection',
        intent: intent.type,
        confidence: intent.confidence,
        keywords: intent.keywords.join(', ')
      });

      // 2. Gerar resposta contextual
      const response = await this.generateContextualResponse(message, intent, context);

      // 3. Log da resposta gerada
      this.logger.conversation('Contextual response generated', {
        service: 'context-aware-service',
        method: 'processContextualMessage',
        operationType: 'response_generated',
        intent: response.detectedIntent,
        confidence: response.confidence,
        shouldContinueFlow: response.shouldContinueFlow,
        nextStage: response.nextStage
      });

      traceOperation({
        success: true,
        metadata: {
          intent: intent.type,
          confidence: intent.confidence,
          responseIntent: response.detectedIntent
        }
      });

      return response;

    } catch (error) {
      this.logger.conversationError(error as Error, {
        service: 'context-aware-service',
        method: 'processContextualMessage',
        operationType: 'process_error'
      });

      traceOperation({
        success: false,
        error: (error as Error).message
      });

      // Fallback response
      return {
        message: 'Desculpe, ocorreu um erro. Como posso te ajudar?',
        shouldContinueFlow: true,
        detectedIntent: 'error_fallback',
        confidence: 0.1
      };
    }
  }
}

// Singleton instance
export const contextAwareService = new ContextAwareService();