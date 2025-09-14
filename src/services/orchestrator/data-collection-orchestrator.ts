/**
 * Data Collection Orchestrator
 * Gerencia onboarding determinístico de usuários (Nome → Email → Gênero)
 */

import { upsertUserProfile, normalizePhone } from '../user-profile.service';
import { supabaseAdmin } from '../../config/database';
import { DataCollectionState, OnboardingStep, UserContext } from './types/orchestrator.types';

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
  }> {
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
        response = "Email registrado com sucesso!";
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
    if (['m', 'masculino'].includes(normalized)) return 'masculino';
    if (['f', 'feminino'].includes(normalized)) return 'feminino';
    return 'outro';
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