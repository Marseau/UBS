/**
 * Data Collection Orchestrator
 * Gerencia onboarding determinístico de usuários (Nome → Email → Gênero)
 */

import { upsertUserProfile, normalizePhone } from '../user-profile.service';
import { supabaseAdmin } from '../../config/database';
import { DataCollectionState, OnboardingStep, UserContext } from '../../types';
import {
  contextAwareService,
  ConversationContext
} from '../conversation-intelligence/context-aware.service';

export class DataCollectionOrchestrator {
  private onboardingSteps: Map<DataCollectionState, OnboardingStep> = new Map();

  constructor() {
    this.initializeOnboardingSteps();
  }

  private initializeOnboardingSteps() {
    this.onboardingSteps = new Map([
      [
        DataCollectionState.NEED_NAME,
        {
          state: DataCollectionState.NEED_NAME,
          prompt: "Olá! Para te atender melhor, preciso de algumas informações. Qual é o seu nome completo?",
          validation: (input) => input.trim().length >= 2,
          nextState: DataCollectionState.NEED_EMAIL
        }
      ],
      [
        DataCollectionState.NEED_EMAIL,
        {
          state: DataCollectionState.NEED_EMAIL,
          prompt: "Perfeito! Agora, qual é o seu email?",
          validation: (input) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input),
          nextState: DataCollectionState.NEED_GENDER_CONFIRMATION
        }
      ],
      [
        DataCollectionState.NEED_GENDER_CONFIRMATION,
        {
          state: DataCollectionState.NEED_GENDER_CONFIRMATION,
          prompt: "Para finalizar, você poderia me informar como gostaria de ser tratado(a)? (masculino/feminino/outro)",
          validation: (input) => /^(masculino|feminino|outro|m|f|o)$/i.test(input.trim()),
          nextState: DataCollectionState.COLLECTION_COMPLETE
        }
      ]
    ]);
  }

  /**
   * Determina se usuário precisa de onboarding e qual etapa
   */
  async determineOnboardingState(userContext: UserContext): Promise<DataCollectionState | null> {
    if (!userContext.isNewUser) {
      // Usuário existente - verificar se dados estão completos
      const missingData = this.getMissingUserData(userContext);
      if (missingData.length === 0) {
        return null; // Onboarding completo
      }

      // Retomar da primeira etapa faltante
      if (!userContext.name) return DataCollectionState.NEED_NAME;
      if (!userContext.email) return DataCollectionState.NEED_EMAIL;
      if (!userContext.gender) return DataCollectionState.NEED_GENDER_CONFIRMATION;
    }

    return DataCollectionState.NEED_NAME;
  }

  /**
   * Processa entrada do usuário durante onboarding
   */
  async processOnboardingInput(
    input: string,
    currentState: DataCollectionState,
    userContext: UserContext,
    tenantId: string
  ): Promise<{
    success: boolean;
    nextState: DataCollectionState | null;
    response: string;
    completedOnboarding?: boolean;
    aiMetrics?: {
      model_used: string;
      tokens: number;
      api_cost_usd: number;
      processing_time_ms: number;
    };
  }> {
    // Get tenant information for personalized responses
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('business_name, name, domain')
      .eq('id', tenantId)
      .single();

    const tenantName = tenant?.business_name || tenant?.name || 'nosso negócio';
    const businessType = tenant?.domain === 'healthcare' ? 'clínica' :
                        tenant?.domain === 'beauty' ? 'salão de beleza' :
                        tenant?.domain === 'legal' ? 'escritório' :
                        tenant?.domain === 'education' ? 'escola' :
                        'negócio';

    // First, check if this message needs context-aware intelligent processing
    const conversationContext: ConversationContext = {
      hasName: !!userContext.name,
      hasEmail: !!userContext.email,
      hasGender: !!userContext.gender,
      userName: userContext.name,
      userEmail: userContext.email,
      userGender: userContext.gender,
      currentStage: 'onboarding',
      previousMessages: [], // TODO: Get from conversation history
      tenantName: tenantName,
      businessType: businessType
    };

    console.log('🚨 [DATA-COLLECTION] About to call Context-Aware service!', { input });

    // Process message with Context-Aware intelligence
    const contextualResponse = await contextAwareService.processContextualMessage(
      input,
      conversationContext
    );

    console.log('🚨 [DATA-COLLECTION] Context-Aware response received:', contextualResponse);

    // If context-aware service provides a complete response OR has processed data intelligently
    if (!contextualResponse.shouldContinueFlow || contextualResponse.contextUpdate) {
      // Process context updates (e.g., extracted name from combined message)
      if (contextualResponse.contextUpdate) {
        console.log('🔄 [DATA-COLLECTION] Processing context update:', contextualResponse.contextUpdate);

        if (contextualResponse.contextUpdate.userName && contextualResponse.contextUpdate.hasName) {
          // Update user context with extracted name (and potentially inferred gender)
          const updatedUser = await upsertUserProfile({
            tenantId: tenantId,
            userPhone: userContext.phone,
            name: contextualResponse.contextUpdate.userName,
            email: userContext.email || undefined,
            gender: contextualResponse.contextUpdate.userGender || userContext.gender || undefined
          });

          console.log('✅ [DATA-COLLECTION] User updated with extracted name:', updatedUser);

          // Check if gender was also inferred (high confidence)
          if (contextualResponse.contextUpdate.hasGender && contextualResponse.contextUpdate.userGender) {
            console.log('🧠 [DATA-COLLECTION] Gender also inferred:', contextualResponse.contextUpdate.userGender);
            // Name + Gender collected, check if email is missing
            if (!userContext.email) {
              // Still need email, go directly to email collection (skip gender confirmation)
              const nextState = DataCollectionState.NEED_EMAIL;
              return {
                success: true,
                nextState: nextState,
                response: contextualResponse.message,
                completedOnboarding: false,
                aiMetrics: contextualResponse.aiMetrics
              };
            } else {
              // We have name + gender + email = onboarding complete!
              return {
                success: true,
                nextState: null, // Onboarding completed
                response: contextualResponse.message,
                completedOnboarding: true,
                aiMetrics: contextualResponse.aiMetrics
              };
            }
          } else {
            // Only name collected, move to email collection
            const nextState = DataCollectionState.NEED_EMAIL;

            return {
              success: true,
              nextState: nextState,
              response: contextualResponse.message,
              completedOnboarding: false,
              aiMetrics: contextualResponse.aiMetrics
            };
          }
        }

        if (contextualResponse.contextUpdate.userEmail && contextualResponse.contextUpdate.hasEmail) {
          // Update user context with email (and potentially inferred gender)
          const updatedUser = await upsertUserProfile({
            tenantId: tenantId,
            userPhone: userContext.phone,
            name: userContext.name,
            email: contextualResponse.contextUpdate.userEmail,
            gender: contextualResponse.contextUpdate.userGender || userContext.gender || undefined
          });

          console.log('✅ [DATA-COLLECTION] User updated with email:', updatedUser);

          // Check if gender was also inferred when email was collected
          if (contextualResponse.contextUpdate.hasGender && contextualResponse.contextUpdate.userGender) {
            console.log('🧠 [DATA-COLLECTION] Email + Gender both collected/inferred - onboarding complete!');
            return {
              success: true,
              nextState: null, // Onboarding completed
              response: contextualResponse.message,
              completedOnboarding: true,
              aiMetrics: contextualResponse.aiMetrics
            };
          } else {
            // Only email collected, check if user already has gender
            if (userContext.gender) {
              // We already have gender from previous interactions - onboarding complete!
              console.log('✅ [DATA-COLLECTION] Email collected, gender already exists - onboarding complete!');
              return {
                success: true,
                nextState: null, // Onboarding completed
                response: contextualResponse.message,
                completedOnboarding: true,
                aiMetrics: contextualResponse.aiMetrics
              };
            } else {
              // Still need gender, move to gender collection
              const nextState = DataCollectionState.NEED_GENDER_CONFIRMATION;
              return {
                success: true,
                nextState: nextState,
                response: contextualResponse.message,
                completedOnboarding: false,
                aiMetrics: contextualResponse.aiMetrics
              };
            }
          }
        }

        if (contextualResponse.contextUpdate.userGender && contextualResponse.contextUpdate.hasGender) {
          // Update user context with gender and complete onboarding
          const updatedUser = await upsertUserProfile({
            tenantId: tenantId,
            userPhone: userContext.phone,
            name: userContext.name,
            email: userContext.email,
            gender: contextualResponse.contextUpdate.userGender
          });

          console.log('✅ [DATA-COLLECTION] User updated with gender:', updatedUser);

          return {
            success: true,
            nextState: null, // Onboarding completed
            response: contextualResponse.message,
            completedOnboarding: true,
            aiMetrics: contextualResponse.aiMetrics
          };
        }
      }

      return {
        success: true,
        nextState: currentState, // Keep current state
        response: contextualResponse.message,
        completedOnboarding: false,
        aiMetrics: contextualResponse.aiMetrics
      };
    }

    // Continue with normal onboarding flow processing
    const step = this.onboardingSteps.get(currentState);
    if (!step) {
      return {
        success: false,
        nextState: null,
        response: "Erro interno no processo de cadastro. Tente novamente."
      };
    }

    // Validar entrada
    const isValid = step.validation ? step.validation(input) : true;
    if (!isValid) {
      return {
        success: false,
        nextState: currentState,
        response: this.getValidationErrorMessage(currentState)
      };
    }

    // Processar dados específicos por etapa
    const updateData: any = {};
    let response = "";

    switch (currentState) {
      case DataCollectionState.NEED_NAME:
        updateData.name = this.normalizeName(input);
        response = `Prazer em te conhecer, ${updateData.name}!`;
        break;

      case DataCollectionState.NEED_EMAIL:
        updateData.email = input.trim().toLowerCase();
        response = `Email registrado com sucesso! ✅ ${userContext.name}, como posso te ajudar hoje?`;
        break;

      case DataCollectionState.NEED_GENDER_CONFIRMATION:
        updateData.gender = this.normalizeGender(input);
        response = "Perfeito! Cadastro finalizado com sucesso. Como posso te ajudar hoje?";
        break;
    }

    // Persistir dados no banco
    try {
      await upsertUserProfile({
        tenantId,
        userPhone: userContext.phone,
        ...updateData
      });

      const nextState = step.nextState;
      const completedOnboarding = nextState === DataCollectionState.COLLECTION_COMPLETE;

      return {
        success: true,
        nextState: completedOnboarding ? null : (nextState ?? null),
        response,
        completedOnboarding
      };

    } catch (error) {
      console.error('❌ Error updating user profile:', error);
      return {
        success: false,
        nextState: currentState,
        response: "Erro ao salvar informações. Tente novamente."
      };
    }
  }

  /**
   * Gerar prompt para etapa específica do onboarding
   */
  getOnboardingPrompt(state: DataCollectionState, userName?: string): string {
    const step = this.onboardingSteps.get(state);
    if (!step) return "Como posso te ajudar?";

    // Personalizar prompt se nome já foi coletado
    if (userName && state !== DataCollectionState.NEED_NAME) {
      return step.prompt.replace("Perfeito!", `Perfeito, ${userName}!`);
    }

    return step.prompt;
  }

  /**
   * Verificar se usuário por telefone existe e obter contexto
   * Se não existir, cria automaticamente o usuário e relacionamento tenant
   */
  async getUserContext(phone: string, tenantId: string): Promise<UserContext> {
    const normalizedPhone = normalizePhone(phone);

    // Primeiro: verificar se usuário já existe
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, name, email, gender')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    let finalUser = user;
    let isNewUser = !user;

    if (user) {
      // Verificar se usuário tem relacionamento com o tenant
      const { data: userTenantRelation } = await supabaseAdmin
        .from('user_tenants')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      // Se usuário existe mas não tem relação com tenant, criar a relação
      if (!userTenantRelation) {
        const { error: tenantError } = await supabaseAdmin
          .from('user_tenants')
          .upsert({
            user_id: user.id,
            tenant_id: tenantId,
            role: 'customer'
          }, {
            onConflict: 'user_id,tenant_id',
            ignoreDuplicates: true
          });

        if (tenantError) {
          console.error('❌ [DATA-COLLECTION] Erro ao criar relação user-tenant:', tenantError);
        } else {
          console.log(`✅ [DATA-COLLECTION] Relação user-tenant criada: ${user.id} → ${tenantId}`);
        }
      }
    } else {
      // Se usuário não existe, criar automaticamente (como no sistema original)
      try {
        const { upsertUserProfile } = await import('../user-profile.service');
        const createdUserId = await upsertUserProfile({
          tenantId,
          userPhone: normalizedPhone,
          // Não fornecer dados pessoais - só criar o registro básico
        });

        // Buscar o usuário recém-criado
        const { data: newUser } = await supabaseAdmin
          .from('users')
          .select('id, name, email, gender')
          .eq('id', createdUserId)
          .single();

        finalUser = newUser;
        isNewUser = true;
        console.log(`✅ [DATA-COLLECTION] Usuário criado automaticamente: ${createdUserId}`);
      } catch (error) {
        console.error('❌ [DATA-COLLECTION] Erro ao criar usuário:', error);
        // Continuar com usuário null - será tratado no onboarding
        finalUser = null;
      }
    }

    const needsOnboarding = isNewUser || this.getMissingUserData(finalUser || {}).length > 0;

    const onboardingStep = needsOnboarding
      ? await this.determineOnboardingState({
          ...finalUser,
          id: finalUser?.id || '',
          phone: normalizedPhone,
          isNewUser,
          needsOnboarding
        } as UserContext)
      : null;

    const result = {
      id: finalUser?.id || '',
      phone: normalizedPhone,
      name: finalUser?.name || undefined,
      email: finalUser?.email || undefined,
      gender: finalUser?.gender || undefined,
      isNewUser,
      needsOnboarding,
      onboardingStep: onboardingStep || undefined
    };

    console.log('🔍 [DATA-COLLECTION] UserContext result:', {
      userId: result.id,
      phone: result.phone,
      isNewUser: result.isNewUser,
      needsOnboarding: result.needsOnboarding,
      hasName: !!result.name,
      hasEmail: !!result.email,
      onboardingStep: result.onboardingStep
    });

    return result;
  }

  // Utilitários privados
  private getMissingUserData(user: any): string[] {
    const missing: string[] = [];
    if (!user.name) missing.push('name');
    if (!user.email) missing.push('email');
    if (!user.gender) missing.push('gender');
    return missing;
  }

  private normalizeName(input: string): string {
    return input.trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private normalizeGender(input: string): string {
    const normalized = input.trim().toLowerCase();
    // Database expects English values: 'male', 'female', 'other'
    if (['m', 'masculino'].includes(normalized)) return 'male';
    if (['f', 'feminino'].includes(normalized)) return 'female';
    return 'other';
  }

  private getValidationErrorMessage(state: DataCollectionState): string {
    switch (state) {
      case DataCollectionState.NEED_NAME:
        return "Por favor, digite um nome válido (mínimo 2 caracteres).";
      case DataCollectionState.NEED_EMAIL:
        return "Por favor, digite um email válido (exemplo@email.com).";
      case DataCollectionState.NEED_GENDER_CONFIRMATION:
        return "Por favor, escolha entre: masculino, feminino ou outro.";
      default:
        return "Entrada inválida. Tente novamente.";
    }
  }
}