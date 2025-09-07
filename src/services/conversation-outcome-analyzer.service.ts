/**
 * ConversationOutcomeAnalyzerService
 * 
 * Sistema para separação completa entre Intent e Outcome:
 * - Intent: Detectado e persistido a nível de mensagem (conversation_history.intent)
 * - Outcome: Persistido apenas a nível de conversação quando fluxos são finalizados (conversation_history.conversation_outcome)
 * 
 * Regras fundamentais:
 * 1. Intent pode mudar múltiplas vezes na mesma conversa
 * 2. Outcome é definido apenas quando fluxo é completado ou abandonado
 * 3. PROIBIDO mapear outcome diretamente do intent
 * 4. Outcome persiste apenas na última mensagem de cada conversação
 */

import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';

const SUPABASE_URL = process.env.SUPABASE_URL as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// Tipos para Intent (nível de mensagem)
export type MessageIntent = 
  | 'booking'           // Quer agendar
  | 'reschedule'        // Quer reagendar  
  | 'cancel'            // Quer cancelar
  | 'availability'      // Consulta disponibilidade
  | 'services'          // Pergunta sobre serviços
  | 'pricing'           // Consulta preços
  | 'my_appointments'   // Consulta seus agendamentos
  | 'address'           // Pergunta localização
  | 'contact'           // Informações contato
  | 'greeting'          // Cumprimento inicial
  | 'general'           // Conversa geral
  // Novos intents identificados
  | 'emergency'         // Situação de emergência (saúde mental, urgência médica)
  | 'complaint'         // Reclamação ou problema
  | 'compliment'        // Elogio ou feedback positivo
  | 'professional_preference' // Preferência por profissional específico
  | 'treatment_info'    // Informações sobre tratamentos específicos
  | 'follow_up'         // Acompanhamento pós-atendimento
  | 'insurance'         // Questões sobre convênio/plano de saúde
  | 'payment'           // Forma de pagamento
  | 'confirmation'      // Confirmação de agendamento
  | 'waiting_list'      // Lista de espera
  | 'group_booking'     // Agendamento em grupo/família
  | 'package_deal'      // Pacotes de serviços
  | 'loyalty_program'   // Programa de fidelidade
  | 'referral'          // Indicação/recomendação
  | 'special_needs'     // Necessidades especiais/acessibilidade
  // Intents específicos por domínio
  | 'healthcare_emergency'   // Emergência de saúde mental
  | 'healthcare_therapy'     // Tipos de terapia específicos
  | 'healthcare_medication'  // Relacionado a medicamentos
  | 'beauty_treatment'       // Tratamentos específicos de beleza
  | 'beauty_combo'          // Combos de beleza
  | 'legal_consultation'    // Consulta jurídica
  | 'legal_document'        // Documentos legais
  | 'sports_training'       // Treinamento esportivo
  | 'sports_injury'         // Lesão esportiva
  | 'education_course'      // Cursos educacionais
  | 'education_assessment'  // Avaliações educacionais
  | 'consulting_strategy'   // Consultoria estratégica
  | 'consulting_analysis'   // Análise de negócios
  | null;

// Tipos para Outcome (nível de conversação)
export type ConversationOutcome = 
  | 'appointment_created'      // Agendamento criado com sucesso
  | 'appointment_rescheduled'  // Agendamento reagendado
  | 'appointment_cancelled'    // Agendamento cancelado
  | 'information_provided'     // Informações fornecidas (preços, serviços, etc.)
  | 'booking_abandoned'        // Fluxo de agendamento abandonado
  | 'reschedule_abandoned'     // Fluxo de reagendamento abandonado
  | 'cancel_abandoned'         // Fluxo de cancelamento abandonado
  | 'timeout_abandoned'        // Conversação abandonada por timeout
  | 'handoff_completed'        // Transferido para humano
  | 'conversation_ongoing'     // Conversação ainda em andamento
  | null;

interface IntentDetectionResult {
  intent: MessageIntent;
  confidence: number;
  method: 'regex' | 'llm' | 'deterministic';
  metadata?: Record<string, any>;
  urgency?: UrgencyLevel;
  priority?: PriorityLevel;
  context?: ContextualInfo;
}

// Novos tipos para urgência e prioridade
export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';
export type PriorityLevel = 'immediate' | 'same_day' | 'next_day' | 'week' | 'flexible';

interface ContextualInfo {
  isEmergency: boolean;
  requiresImmediate: boolean;
  timeConstraints?: string[];
  specialNeeds?: string[];
  emotionalState?: 'distressed' | 'anxious' | 'frustrated' | 'calm' | 'excited';
}

interface OutcomeFinalizeResult {
  success: boolean;
  outcome: ConversationOutcome;
  conversation_id: string;
  finalized_at: string;
}

export class ConversationOutcomeAnalyzerService {

  /**
   * Analisa contexto, urgência e prioridade da mensagem
   */
  private analyzeUrgencyAndContext(messageText: string, intent: MessageIntent): {
    urgency: UrgencyLevel;
    priority: PriorityLevel;
    context: ContextualInfo;
  } {
    const text = messageText.toLowerCase().trim();
    
    // Análise de emergência e urgência crítica
    const criticalPatterns = [
      /(suicídio|me matar|acabar com tudo|crise|desespero|não aguento mais|não consigo mais)/i,
      /(emergência|socorro|ajuda urgente|preciso agora|é urgente)/i,
      /(ataque.*pânico|crise.*ansiedade|não consigo.*respirar|coração.*acelerado)/i,
      /(pensamentos.*suicidas|automutilação|me machucar)/i
    ];

    const highUrgencyPatterns = [
      /(hoje mesmo|agora|imediato|urgente|não posso esperar)/i,
      /(dor.*forte|muito.*mal|piorando|insuportável)/i,
      /(prazo.*vencendo|amanhã|deadline|data.*limite)/i
    ];

    const timeConstraintPatterns = [
      /(hoje|amanhã|essa semana|próxima semana|até.*dia|antes.*do)/i,
      /(manhã|tarde|noite|fim.*semana|segunda|terça|quarta|quinta|sexta)/i
    ];

    const emotionalDistressPatterns = [
      /(ansioso|nervoso|preocupado|estressado|angustiado)/i,
      /(triste|deprimido|sem.*esperança|desesperado)/i,
      /(frustrado|irritado|revoltado|bravo)/i,
      /(feliz|animado|empolgado|contente)/i
    ];

    const specialNeedsPatterns = [
      /(cadeirante|deficiência|acessibilidade|limitação)/i,
      /(idoso|criança|grávida|lactante)/i,
      /(alergia|sensibilidade|restrição)/i
    ];

    // Determinar urgência
    let urgency: UrgencyLevel = 'low';
    let priority: PriorityLevel = 'flexible';
    
    if (criticalPatterns.some(pattern => pattern.test(text))) {
      urgency = 'critical';
      priority = 'immediate';
    } else if (highUrgencyPatterns.some(pattern => pattern.test(text))) {
      urgency = 'high';
      priority = 'same_day';
    } else if (timeConstraintPatterns.some(pattern => pattern.test(text))) {
      urgency = 'medium';
      priority = text.includes('hoje') ? 'same_day' : 'next_day';
    } else {
      urgency = 'low';
      priority = 'week';
    }

    // Determinar estado emocional
    let emotionalState: ContextualInfo['emotionalState'] = 'calm';
    if (text.match(/(ansioso|nervoso|preocupado|estressado|angustiado|desesperado)/i)) {
      emotionalState = 'distressed';
    } else if (text.match(/(triste|deprimido|sem.*esperança)/i)) {
      emotionalState = 'anxious';
    } else if (text.match(/(frustrado|irritado|revoltado|bravo)/i)) {
      emotionalState = 'frustrated';
    } else if (text.match(/(feliz|animado|empolgado|contente)/i)) {
      emotionalState = 'excited';
    }

    // Extrair restrições de tempo
    const timeConstraints: string[] = [];
    const timeMatches = text.match(/(hoje|amanhã|essa semana|próxima semana|segunda|terça|quarta|quinta|sexta|manhã|tarde|noite)/gi);
    if (timeMatches) {
      timeConstraints.push(...timeMatches);
    }

    // Extrair necessidades especiais
    const specialNeeds: string[] = [];
    const specialMatches = text.match(/(cadeirante|deficiência|acessibilidade|limitação|idoso|criança|grávida|alergia|sensibilidade)/gi);
    if (specialMatches) {
      specialNeeds.push(...specialMatches);
    }

    // Ajustar urgência baseada no intent
    if (intent === 'emergency' || intent === 'healthcare_emergency') {
      urgency = 'critical';
      priority = 'immediate';
    } else if (intent === 'complaint') {
      urgency = urgency === 'low' ? 'medium' : urgency;
      if (priority === 'week') {
        priority = 'same_day';
      }
    }

    const context: ContextualInfo = {
      isEmergency: urgency === 'critical',
      requiresImmediate: priority === 'immediate',
      timeConstraints: timeConstraints.length > 0 ? timeConstraints : undefined,
      specialNeeds: specialNeeds.length > 0 ? specialNeeds : undefined,
      emotionalState
    };

    return { urgency, priority, context };
  }

  /**
   * Detecta e persiste intent a nível de mensagem
   * Intent é detectado para CADA mensagem e pode mudar múltiplas vezes
   */
  async detectAndPersistIntent(
    conversationId: string,
    messageText: string,
    tenantId: string
  ): Promise<IntentDetectionResult> {
    try {
      console.log(`🔍 [INTENT] Analisando mensagem: "${messageText.substring(0, 50)}..."`);
      
      // Fase 1: Detecção por REGEX (mais rápida e precisa)
      const regexResult = this.detectIntentByRegex(messageText);
      if (regexResult.intent && regexResult.confidence > 0.8) {
        // Analisar urgência e contexto
        const { urgency, priority, context } = this.analyzeUrgencyAndContext(messageText, regexResult.intent);
        regexResult.urgency = urgency;
        regexResult.priority = priority;
        regexResult.context = context;
        
        console.log(`✅ [INTENT] Detectado via REGEX: ${regexResult.intent} (${regexResult.confidence}) - Urgência: ${urgency}, Prioridade: ${priority}`);
        await this.persistMessageIntent(conversationId, regexResult.intent, regexResult.method, urgency, priority, context);
        return regexResult;
      }

      // Fase 2: Detecção por LLM (mais contextual)
      const llmResult = await this.detectIntentByLLM(messageText, tenantId);
      if (llmResult.intent && llmResult.confidence > 0.6) {
        // Analisar urgência e contexto
        const { urgency, priority, context } = this.analyzeUrgencyAndContext(messageText, llmResult.intent);
        llmResult.urgency = urgency;
        llmResult.priority = priority;
        llmResult.context = context;
        
        console.log(`✅ [INTENT] Detectado via LLM: ${llmResult.intent} (${llmResult.confidence}) - Urgência: ${urgency}, Prioridade: ${priority}`);
        await this.persistMessageIntent(conversationId, llmResult.intent, llmResult.method, urgency, priority, context);
        return llmResult;
      }

      // Fase 3: Fallback determinístico
      const fallbackResult = this.detectIntentDeterministic(messageText);
      // Analisar urgência e contexto
      const { urgency, priority, context } = this.analyzeUrgencyAndContext(messageText, fallbackResult.intent);
      fallbackResult.urgency = urgency;
      fallbackResult.priority = priority;
      fallbackResult.context = context;
      
      console.log(`✅ [INTENT] Fallback determinístico: ${fallbackResult.intent} (${fallbackResult.confidence}) - Urgência: ${urgency}, Prioridade: ${priority}`);
      await this.persistMessageIntent(conversationId, fallbackResult.intent, fallbackResult.method, urgency, priority, context);
      return fallbackResult;

    } catch (error) {
      console.error('❌ [INTENT] Erro ao detectar intent:', error);
      const fallbackResult: IntentDetectionResult = {
        intent: 'general',
        confidence: 0.1,
        method: 'deterministic',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
        urgency: 'low',
        priority: 'flexible',
        context: {
          isEmergency: false,
          requiresImmediate: false,
          emotionalState: 'calm'
        }
      };
      await this.persistMessageIntent(conversationId, fallbackResult.intent, fallbackResult.method, fallbackResult.urgency, fallbackResult.priority, fallbackResult.context);
      return fallbackResult;
    }
  }

  /**
   * Finaliza outcome apenas quando conversação é completada ou abandonada
   * Outcome é persistido APENAS na última mensagem da conversa
   */
  async finalizeOutcome(
    sessionId: string, 
    outcome: ConversationOutcome
  ): Promise<OutcomeFinalizeResult> {
    try {
      console.log(`🎯 [OUTCOME] Finalizando conversa ${sessionId} com outcome: ${outcome}`);

      const now = new Date().toISOString();

      // Atualizar APENAS a última mensagem da sessão com o outcome
      const { data: lastMessage, error: findError } = await supabaseAdmin
        .from('conversation_history')
        .select('id, created_at')
        .eq('session_id_uuid', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (findError || !lastMessage) {
        console.error('❌ [OUTCOME] Não foi possível encontrar última mensagem:', findError);
        return {
          success: false,
          outcome,
          conversation_id: sessionId,
          finalized_at: now
        };
      }

      // Atualizar apenas a última mensagem com outcome
      const { error: updateError } = await supabaseAdmin
        .from('conversation_history')
        .update({
          conversation_outcome: outcome
        })
        .eq('id', lastMessage.id);

      if (updateError) {
        console.error('❌ [OUTCOME] Erro ao persistir outcome:', updateError);
        return {
          success: false,
          outcome,
          conversation_id: sessionId,
          finalized_at: now
        };
      }

      console.log(`✅ [OUTCOME] Outcome finalizado com sucesso: ${outcome}`);
      return {
        success: true,
        outcome,
        conversation_id: sessionId,
        finalized_at: now
      };

    } catch (error) {
      console.error('❌ [OUTCOME] Erro ao finalizar outcome:', error);
      return {
        success: false,
        outcome,
        conversation_id: sessionId,
        finalized_at: new Date().toISOString()
      };
    }
  }

  /**
   * Verifica se uma conversação deve ter seu outcome finalizado
   */
  shouldFinalizeOutcome(
    flowType: string | null,
    flowStep: string | null,
    lastActivity: string
  ): { shouldFinalize: boolean; suggestedOutcome: ConversationOutcome } {
    
    const lastActivityTime = new Date(lastActivity);
    const now = new Date();
    const minutesSinceActivity = (now.getTime() - lastActivityTime.getTime()) / (1000 * 60);
    
    // Timeout abandonment (mais de 30 minutos sem atividade)
    if (minutesSinceActivity > 30) {
      if (flowType === 'booking' && flowStep !== 'complete') {
        return { shouldFinalize: true, suggestedOutcome: 'booking_abandoned' };
      }
      if (flowType === 'reschedule' && flowStep !== 'complete') {
        return { shouldFinalize: true, suggestedOutcome: 'reschedule_abandoned' };
      }
      if (flowType === 'cancel' && flowStep !== 'complete') {
        return { shouldFinalize: true, suggestedOutcome: 'cancel_abandoned' };
      }
      return { shouldFinalize: true, suggestedOutcome: 'timeout_abandoned' };
    }

    // Fluxos completos
    if (flowStep === 'complete') {
      if (flowType === 'booking') {
        return { shouldFinalize: true, suggestedOutcome: 'appointment_created' };
      }
      if (flowType === 'reschedule') {
        return { shouldFinalize: true, suggestedOutcome: 'appointment_rescheduled' };
      }
      if (flowType === 'cancel') {
        return { shouldFinalize: true, suggestedOutcome: 'appointment_cancelled' };
      }
    }

    // Fluxos informativos (preços, serviços, disponibilidade)
    if (['pricing', 'services', 'availability', 'address', 'my_appointments'].includes(flowType || '')) {
      return { shouldFinalize: true, suggestedOutcome: 'information_provided' };
    }

    return { shouldFinalize: false, suggestedOutcome: 'conversation_ongoing' };
  }


  /**
   * Detecção de intent por REGEX (Fase 1 - mais rápida)
   */
  private detectIntentByRegex(messageText: string): IntentDetectionResult {
    const text = messageText.toLowerCase().trim();
    
    // Patterns específicos com alta confiança - Expandidos para melhor cobertura linguística brasileira
    const patterns = [
      // EMERGÊNCIA (prioridade máxima)
      {
        intent: 'emergency' as MessageIntent,
        regex: /(emergência|urgente|socorro|ajuda|suicídio|me matar|não aguento|acabar com tudo|crise|desespero|não consigo mais)/i,
        confidence: 0.98
      },
      
      // === INTENTS ESPECÍFICOS POR DOMÍNIO ===
      
      // HEALTHCARE (Saúde Mental)
      {
        intent: 'healthcare_emergency' as MessageIntent,
        regex: /(crise.*ansiedade|ataque.*pânico|depressão|não consigo.*dormir|pensamentos.*suicidas|automutilação|cortar.*se|me machucar)/i,
        confidence: 0.97
      },
      {
        intent: 'healthcare_therapy' as MessageIntent,
        regex: /(terapia|psicoterapia|análise|terapia.*casal|terapia.*família|psicanálise|gestalt|cognitiva|comportamental)/i,
        confidence: 0.95
      },
      {
        intent: 'healthcare_medication' as MessageIntent,
        regex: /(medicação|remédio|antidepressivo|ansiolítico|receita|prescrição|dosagem|efeito.*colateral)/i,
        confidence: 0.95
      },
      
      // BEAUTY (Beleza e Estética)
      {
        intent: 'beauty_treatment' as MessageIntent,
        regex: /(botox|preenchimento|limpeza.*pele|peeling|microagulhamento|hidrafacial|radiofrequência|criolipólise)/i,
        confidence: 0.95
      },
      {
        intent: 'beauty_combo' as MessageIntent,
        regex: /(pacote.*beleza|combo|dia.*noiva|make.*cabelo|unha.*cabelo|escova.*progressiva.*junto)/i,
        confidence: 0.9
      },
      
      // LEGAL (Jurídico)
      {
        intent: 'legal_consultation' as MessageIntent,
        regex: /(consulta.*jurídica|advogado|direito.*família|trabalhista|criminal|cível|processo|audiência)/i,
        confidence: 0.95
      },
      {
        intent: 'legal_document' as MessageIntent,
        regex: /(contrato|procuração|petição|recurso|documento|certidão|registro|escritura)/i,
        confidence: 0.9
      },
      
      // SPORTS (Esportes)
      {
        intent: 'sports_training' as MessageIntent,
        regex: /(treino|personal.*trainer|musculação|crossfit|funcional|condicionamento|preparação.*física)/i,
        confidence: 0.95
      },
      {
        intent: 'sports_injury' as MessageIntent,
        regex: /(lesão|fisioterapia|reabilitação|dor.*muscular|entorse|distensão|recuperação.*lesão)/i,
        confidence: 0.95
      },
      
      // EDUCATION (Educação)
      {
        intent: 'education_course' as MessageIntent,
        regex: /(curso|aula|treinamento|capacitação|workshop|palestra|formação|certificação)/i,
        confidence: 0.9
      },
      {
        intent: 'education_assessment' as MessageIntent,
        regex: /(avaliação|prova|teste|exame|diagnóstico.*educacional|análise.*aprendizagem)/i,
        confidence: 0.9
      },
      
      // CONSULTING (Consultoria)
      {
        intent: 'consulting_strategy' as MessageIntent,
        regex: /(consultoria|estratégia|planejamento|gestão|negócios|análise.*mercado|plano.*negócios)/i,
        confidence: 0.9
      },
      {
        intent: 'consulting_analysis' as MessageIntent,
        regex: /(análise.*financeira|due.*diligence|diagnóstico|auditoria|relatório|assessment)/i,
        confidence: 0.9
      },
      
      // AGENDAMENTO - Expandido com mais variações brasileiras
      {
        intent: 'booking' as MessageIntent,
        regex: /(quero|gostaria|preciso|vou|queria|tô querendo|desejo).*(agendar|marcar|reservar|consulta|sessão|atendimento)|(agendar|marcar|reservar).*(consulta|horário|atendimento|sessão|procedimento)|posso.*marcar|tem.*vaga|consegue.*agendar|dá.*pra.*marcar/i,
        confidence: 0.95
      },
      
      // REAGENDAMENTO - Mais variações coloquiais
      {
        intent: 'reschedule' as MessageIntent,
        regex: /(reagenda|remarcar|mudar.*hora|alterar.*agendamento|trocar.*data|mover.*agendamento|empurrar|adiar|transferir.*consulta|passar.*pra.*outro.*dia)/i,
        confidence: 0.95
      },
      
      // CANCELAMENTO - Incluindo gírias e expressões informais
      {
        intent: 'cancel' as MessageIntent,
        regex: /(cancelar|desmarcar|anular|remover.*agendamento|excluir.*agendamento|não.*quero.*mais|desistir|não.*vou.*mais|não.*dá.*mais|mudei.*de.*ideia)/i,
        confidence: 0.95
      },
      
      // CONFIRMAÇÃO
      {
        intent: 'confirmation' as MessageIntent,
        regex: /(confirmar|confirmo|tá confirmado|pode.*confirmar|vou.*sim|estarei.*lá|confirmado|sim.*vou|mantém|ok.*confirma)/i,
        confidence: 0.9
      },
      
      // DISPONIBILIDADE - Mais variações regionais
      {
        intent: 'availability' as MessageIntent,
        regex: /(disponibilidade|disponível|que.*horas|horários.*livres|vagas|tem.*horário|agenda|quando.*posso|que.*dia.*tem|horário.*livre)/i,
        confidence: 0.9
      },
      
      // PROFISSIONAL ESPECÍFICO
      {
        intent: 'professional_preference' as MessageIntent,
        regex: /(com.*doutor|com.*doutora|com.*dr|com.*dra|profissional|atender.*com|quero.*com|preferência|mesmo.*profissional)/i,
        confidence: 0.9
      },
      
      // SERVIÇOS - Expandido com termos específicos de domínio
      {
        intent: 'services' as MessageIntent,
        regex: /(que.*serviços|quais.*procedimentos|o.*que.*fazem|tipos.*atendimento|especialidades|tratamentos|que.*vocês.*fazem|cardápio|menu.*serviços)/i,
        confidence: 0.9
      },
      
      // INFORMAÇÕES SOBRE TRATAMENTOS
      {
        intent: 'treatment_info' as MessageIntent,
        regex: /(como.*funciona|duração|tempo.*demora|que.*é.*isso|explicar|detalhe|informação.*sobre|como.*é.*feito)/i,
        confidence: 0.9
      },
      
      // PREÇOS - Mais gírias e expressões
      {
        intent: 'pricing' as MessageIntent,
        regex: /(quanto.*custa|preço|valor|tabela.*preços|valores|sai.*por|fica.*quanto|investimento|orçamento|taxa)/i,
        confidence: 0.9
      },
      
      // CONVÊNIO/PLANO DE SAÚDE
      {
        intent: 'insurance' as MessageIntent,
        regex: /(convênio|plano.*saúde|unimed|bradesco.*saúde|amil|particular|pelo.*plano|aceita.*convênio|através.*do.*plano)/i,
        confidence: 0.9
      },
      
      // PAGAMENTO
      {
        intent: 'payment' as MessageIntent,
        regex: /(forma.*pagamento|cartão|pix|dinheiro|parcelado|parcela|débito|crédito|à.*vista|como.*pago)/i,
        confidence: 0.9
      },
      
      // MEUS AGENDAMENTOS
      {
        intent: 'my_appointments' as MessageIntent,
        regex: /(meus.*agendamentos|minha.*consulta|ver.*agendamento|status.*agendamento|quando.*é|que.*dia.*é|próxima.*consulta)/i,
        confidence: 0.9
      },
      
      // RECLAMAÇÃO/PROBLEMA
      {
        intent: 'complaint' as MessageIntent,
        regex: /(reclamar|problema|errado|ruim|insatisfeito|não.*gostei|péssimo|horrível|decepcionado|revoltado)/i,
        confidence: 0.9
      },
      
      // ELOGIO/FEEDBACK POSITIVO
      {
        intent: 'compliment' as MessageIntent,
        regex: /(adorei|amei|excelente|ótimo|perfeito|maravilhoso|recomendo|satisfeito|parabéns|muito.*bom)/i,
        confidence: 0.9
      },
      
      // LOCALIZAÇÃO
      {
        intent: 'address' as MessageIntent,
        regex: /(onde.*fica|endereço|localização|como.*chegar|onde.*é|fica.*aonde|como.*ir|google.*maps)/i,
        confidence: 0.9
      },
      
      // CONTATO
      {
        intent: 'contact' as MessageIntent,
        regex: /(telefone|whatsapp|email|contato|falar.*com|ligar)/i,
        confidence: 0.9
      },
      
      // LISTA DE ESPERA
      {
        intent: 'waiting_list' as MessageIntent,
        regex: /(lista.*espera|encaixe|se.*cancelar|sobrar.*vaga|me.*avisa|se.*der)/i,
        confidence: 0.9
      },
      
      // AGENDAMENTO EM GRUPO
      {
        intent: 'group_booking' as MessageIntent,
        regex: /(em.*família|junto|mesmo.*horário|grupo|casal|todos.*juntos|para.*duas|pra.*três)/i,
        confidence: 0.9
      },
      
      // PACOTES
      {
        intent: 'package_deal' as MessageIntent,
        regex: /(pacote|combo|promoção|desconto|conjunto|várias.*sessões|múltiplas)/i,
        confidence: 0.9
      },
      
      // PROGRAMA DE FIDELIDADE
      {
        intent: 'loyalty_program' as MessageIntent,
        regex: /(fidelidade|cartão.*cliente|programa|pontos|benefícios|cashback)/i,
        confidence: 0.9
      },
      
      // INDICAÇÃO
      {
        intent: 'referral' as MessageIntent,
        regex: /(indicação|recomendação|me.*indicaram|falaram.*bem|amiga.*disse)/i,
        confidence: 0.9
      },
      
      // NECESSIDADES ESPECIAIS
      {
        intent: 'special_needs' as MessageIntent,
        regex: /(cadeirante|acessibilidade|deficiência|especial|preciso.*ajuda|limitação|mobilidade)/i,
        confidence: 0.9
      },
      
      // ACOMPANHAMENTO
      {
        intent: 'follow_up' as MessageIntent,
        regex: /(como.*foi|resultado|depois.*do|pós.*consulta|como.*está|evoluindo|melhorou)/i,
        confidence: 0.85
      },
      
      // CUMPRIMENTOS - Expandido com mais variações
      {
        intent: 'greeting' as MessageIntent,
        regex: /^(oi|olá|opa|e.*aí|bom.*dia|boa.*tarde|boa.*noite|hey|hello|alô|oi.*tudo.*bem)$/i,
        confidence: 0.8
      }
    ];

    for (const pattern of patterns) {
      if (pattern.regex.test(text)) {
        return {
          intent: pattern.intent,
          confidence: pattern.confidence,
          method: 'regex',
          metadata: { matched_pattern: pattern.regex.source }
        };
      }
    }

    return {
      intent: null,
      confidence: 0,
      method: 'regex'
    };
  }

  /**
   * Detecção de intent por LLM (Fase 2 - mais contextual)
   * Simulação - em implementação real usaria OpenAI
   */
  private async detectIntentByLLM(messageText: string, _tenantId: string): Promise<IntentDetectionResult> {
    // TODO: Implementar chamada real para OpenAI/GPT-4
    // Por enquanto, retorna detecção básica contextual
    
    const text = messageText.toLowerCase();
    
    // Simulação de análise contextual por LLM
    if (text.includes('preciso') && (text.includes('hoje') || text.includes('urgente'))) {
      return {
        intent: 'booking',
        confidence: 0.8,
        method: 'llm',
        metadata: { context: 'urgency_detected' }
      };
    }

    if (text.includes('não posso') && (text.includes('ir') || text.includes('comparecer'))) {
      return {
        intent: 'reschedule',
        confidence: 0.75,
        method: 'llm',
        metadata: { context: 'conflict_detected' }
      };
    }

    return {
      intent: null,
      confidence: 0,
      method: 'llm'
    };
  }

  /**
   * Detecção determinística (Fase 3 - fallback) - Expandida com novos intents
   */
  private detectIntentDeterministic(messageText: string): IntentDetectionResult {
    const text = messageText.toLowerCase().trim();
    
    // Palavras-chave simples por prioridade
    
    // Emergência (prioridade máxima)
    if (text.includes('emergência') || text.includes('urgente') || text.includes('socorro')) {
      return { intent: 'emergency', confidence: 0.8, method: 'deterministic' };
    }
    
    // Agendamento
    if (text.includes('agendar') || text.includes('marcar') || text.includes('reservar')) {
      return { intent: 'booking', confidence: 0.6, method: 'deterministic' };
    }
    
    // Reagendamento
    if (text.includes('reagendar') || text.includes('remarcar') || text.includes('adiar')) {
      return { intent: 'reschedule', confidence: 0.6, method: 'deterministic' };
    }
    
    // Cancelamento
    if (text.includes('cancelar') || text.includes('desmarcar') || text.includes('desistir')) {
      return { intent: 'cancel', confidence: 0.6, method: 'deterministic' };
    }
    
    // Confirmação
    if (text.includes('confirmar') || text.includes('confirmo') || text.includes('confirmado')) {
      return { intent: 'confirmation', confidence: 0.6, method: 'deterministic' };
    }
    
    // Preços
    if (text.includes('preço') || text.includes('valor') || text.includes('quanto')) {
      return { intent: 'pricing', confidence: 0.6, method: 'deterministic' };
    }
    
    // Convênio
    if (text.includes('convênio') || text.includes('plano')) {
      return { intent: 'insurance', confidence: 0.6, method: 'deterministic' };
    }
    
    // Pagamento
    if (text.includes('pagamento') || text.includes('cartão') || text.includes('pix')) {
      return { intent: 'payment', confidence: 0.6, method: 'deterministic' };
    }
    
    // Disponibilidade
    if (text.includes('disponível') || text.includes('horário') || text.includes('vaga')) {
      return { intent: 'availability', confidence: 0.6, method: 'deterministic' };
    }
    
    // Serviços
    if (text.includes('serviços') || text.includes('tratamentos') || text.includes('procedimentos')) {
      return { intent: 'services', confidence: 0.6, method: 'deterministic' };
    }
    
    // Localização
    if (text.includes('endereço') || text.includes('localização') || text.includes('onde')) {
      return { intent: 'address', confidence: 0.6, method: 'deterministic' };
    }
    
    // Profissional
    if (text.includes('doutor') || text.includes('doutora') || text.includes('profissional')) {
      return { intent: 'professional_preference', confidence: 0.6, method: 'deterministic' };
    }
    
    // Reclamação
    if (text.includes('problema') || text.includes('reclamar') || text.includes('ruim')) {
      return { intent: 'complaint', confidence: 0.6, method: 'deterministic' };
    }
    
    // Elogio
    if (text.includes('ótimo') || text.includes('excelente') || text.includes('adorei')) {
      return { intent: 'compliment', confidence: 0.6, method: 'deterministic' };
    }
    
    // === DOMÍNIO-ESPECÍFICOS ===
    
    // Healthcare
    if (text.includes('terapia') || text.includes('psicólogo') || text.includes('psiquiatra')) {
      return { intent: 'healthcare_therapy', confidence: 0.6, method: 'deterministic' };
    }
    if (text.includes('medicação') || text.includes('remédio') || text.includes('antidepressivo')) {
      return { intent: 'healthcare_medication', confidence: 0.6, method: 'deterministic' };
    }
    
    // Beauty
    if (text.includes('botox') || text.includes('preenchimento') || text.includes('peeling')) {
      return { intent: 'beauty_treatment', confidence: 0.6, method: 'deterministic' };
    }
    if (text.includes('combo') || text.includes('pacote')) {
      return { intent: 'beauty_combo', confidence: 0.6, method: 'deterministic' };
    }
    
    // Legal
    if (text.includes('advogado') || text.includes('jurídica') || text.includes('processo')) {
      return { intent: 'legal_consultation', confidence: 0.6, method: 'deterministic' };
    }
    if (text.includes('contrato') || text.includes('documento') || text.includes('procuração')) {
      return { intent: 'legal_document', confidence: 0.6, method: 'deterministic' };
    }
    
    // Sports
    if (text.includes('treino') || text.includes('personal') || text.includes('musculação')) {
      return { intent: 'sports_training', confidence: 0.6, method: 'deterministic' };
    }
    if (text.includes('lesão') || text.includes('fisioterapia') || text.includes('reabilitação')) {
      return { intent: 'sports_injury', confidence: 0.6, method: 'deterministic' };
    }
    
    // Education
    if (text.includes('curso') || text.includes('aula') || text.includes('treinamento')) {
      return { intent: 'education_course', confidence: 0.6, method: 'deterministic' };
    }
    if (text.includes('avaliação') || text.includes('prova') || text.includes('teste')) {
      return { intent: 'education_assessment', confidence: 0.6, method: 'deterministic' };
    }
    
    // Consulting
    if (text.includes('consultoria') || text.includes('estratégia') || text.includes('negócios')) {
      return { intent: 'consulting_strategy', confidence: 0.6, method: 'deterministic' };
    }
    if (text.includes('análise') || text.includes('diagnóstico') || text.includes('auditoria')) {
      return { intent: 'consulting_analysis', confidence: 0.6, method: 'deterministic' };
    }

    // Fallback geral
    return {
      intent: 'general',
      confidence: 0.3,
      method: 'deterministic',
      metadata: { fallback: true }
    };
  }

  /**
   * Persiste intent detectado na mensagem com urgência e contexto
   */
  private async persistMessageIntent(
    conversationId: string,
    intent: MessageIntent,
    method: string,
    urgency?: UrgencyLevel,
    priority?: PriorityLevel,
    context?: ContextualInfo
  ): Promise<void> {
    try {
      // Atualizar APENAS o intent da mensagem atual (não mexer no conversation_context!)
      const { error } = await supabaseAdmin
        .from('conversation_history')
        .update({
          intent_detected: intent
        })
        .eq('id', conversationId); // conversationId é na verdade o ID da mensagem

      if (error) {
        console.error('❌ [INTENT] Erro ao persistir intent:', error);
      } else {
        console.log(`✅ [INTENT] Intent persistido: ${intent} via ${method} - Urgência: ${urgency}, Prioridade: ${priority}`);
        
        // Log adicional para contextos críticos
        if (urgency === 'critical' || context?.isEmergency) {
          console.warn(`🚨 [URGENT] Contexto crítico detectado para mensagem ${conversationId}: ${intent} - ${context?.emotionalState}`);
        }
      }
    } catch (error) {
      console.error('❌ [INTENT] Erro interno ao persistir intent:', error);
    }
  }

  /**
   * VERIFICAR SE CONVERSA ESTÁ FINALIZADA
   * (para ser chamado periodicamente)
   */
  async checkForFinishedConversations(): Promise<void> {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      
      // Buscar sessões sem outcome nas últimas 10 minutos (última mensagem pode ser do usuário OU da IA)
      const { data, error } = await supabaseAdmin
        .from('conversation_history')
        .select('session_id_uuid, created_at')
        .is('conversation_outcome', null)
        .lt('created_at', tenMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error || !data) {
        console.warn('⚠️ No sessions fetched for outcome scan', error);
        return;
      }

      // Deduplicar por sessão (ignorar nulos)
      const uniqueSessions = [...new Set(
        data
          .map((row: any) => row.session_id_uuid)
          .filter((s: string | null) => !!s)
      )];

      console.info(`🔍 Checking ${uniqueSessions.length} sessions for timeout outcomes`);

      for (const sessionId of uniqueSessions) {
        console.log(`🔍 [SESSION] Analisando sessão: ${sessionId}`);
        
        // Buscar contexto da sessão para determinar outcome
        const { data: sessionData, error: sessionError } = await supabaseAdmin
          .from('conversation_history')
          .select('conversation_context, created_at')
          .eq('session_id_uuid', sessionId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (sessionError || !sessionData) {
          console.warn(`⚠️ Could not fetch session data for ${sessionId}`);
          continue;
        }

        const flowType = sessionData.conversation_context?.flow_type || null;
        const flowStep = sessionData.conversation_context?.flow_step || null;
        
        const { shouldFinalize, suggestedOutcome } = this.shouldFinalizeOutcome(
          flowType,
          flowStep,
          sessionData.created_at
        );

        if (shouldFinalize) {
          console.log(`🎯 [OUTCOME] Finalizando sessão ${sessionId} com outcome: ${suggestedOutcome}`);
          await this.finalizeOutcome(sessionId, suggestedOutcome);
        } else {
          console.log(`⏳ [OUTCOME] Sessão ${sessionId} ainda não precisa ser finalizada`);
        }
      }

    } catch (error) {
      console.error('❌ Failed to check finished conversations', error);
    }
  }
}