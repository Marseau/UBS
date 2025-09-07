/**
 * Progressive Data Collector Service
 * Sistema de coleta inteligente de dados que atende às expectativas duais:
 * - Usuário: UX natural sem "interrogatório"
 * - Plataforma: Coleta completa de dados (nome, email, gênero, nascimento, endereço)
 * 
 * Estratégia Win-Win: Coleta contextual durante interações naturais
 */

import { supabaseAdmin } from '../config/database';

export interface UserProfileData {
  name?: string;
  email?: string;
  gender?: string;
  birth_date?: string;
  address?: string;
  phone: string; // sempre conhecido via WhatsApp
}

export interface CollectionContext {
  intent: string;
  messageCount: number;
  hasBookingInterest: boolean;
  hasServiceInterest: boolean;
  conversationTone: 'formal' | 'casual';
  lastDataRequest?: Date;
}

export interface DataCollectionStep {
  field: keyof UserProfileData;
  contextualTrigger: string[];
  naturalPhrase: string;
  priority: 'high' | 'medium' | 'low';
  canCombine: boolean; // pode ser combinado com outro campo
}

export class ProgressiveDataCollectorService {
  private dataCollectionSteps: DataCollectionStep[] = [
    {
      field: 'name',
      contextualTrigger: ['availability', 'services', 'greeting'],
      naturalPhrase: 'Para personalizar melhor o atendimento, como posso te chamar?',
      priority: 'high',
      canCombine: false
    },
    {
      field: 'email',
      contextualTrigger: ['availability', 'booking', 'confirm'],
      naturalPhrase: 'Para confirmar por email, qual seu e-mail para contato?',
      priority: 'high',
      canCombine: true
    },
    {
      field: 'gender',
      contextualTrigger: ['services', 'pricing'],
      naturalPhrase: '', // inferido do nome automaticamente
      priority: 'medium',
      canCombine: true
    },
    {
      field: 'birth_date',
      contextualTrigger: ['services', 'pricing', 'policies'],
      naturalPhrase: 'Temos promoções especiais por faixa etária. Qual sua data de nascimento?',
      priority: 'low',
      canCombine: true
    },
    {
      field: 'address',
      contextualTrigger: ['availability', 'address', 'policies'],
      naturalPhrase: 'Para sugerir o melhor horário considerando sua localização, me fala seu bairro?',
      priority: 'medium',
      canCombine: true
    }
  ];

  /**
   * Determina se deve coletar dados neste momento
   */
  shouldCollectData(
    context: CollectionContext,
    currentProfile: Partial<UserProfileData>
  ): boolean {
    // Não coletar se já perguntou recentemente (cooldown de 5 minutos)
    if (context.lastDataRequest && Date.now() - context.lastDataRequest.getTime() < 5 * 60 * 1000) {
      return false;
    }

    // Coletar apenas dados de alta prioridade nos primeiros 3 intercâmbios
    if (context.messageCount <= 3) {
      return this.getHighPriorityMissingFields(currentProfile).length > 0;
    }

    // Após 3 mensagens, coletar dados contextuais
    const contextualFields = this.getContextualMissingFields(context.intent, currentProfile);
    return contextualFields.length > 0;
  }

  /**
   * Gera coleta de dados contextual baseada na intenção atual
   */
  async generateContextualDataCollection(
    intent: string,
    currentProfile: Partial<UserProfileData>,
    context: CollectionContext
  ): Promise<{
    message: string;
    expectedFields: string[];
    isOptional: boolean;
  } | null> {

    // Buscar campos contextuais faltantes
    const missingFields = this.getContextualMissingFields(intent, currentProfile);
    if (missingFields.length === 0) return null;

    // Selecionar o campo de maior prioridade
    const primaryField = this.selectPrimaryFieldForCollection(missingFields, context);
    if (!primaryField) return null;

    // Gerar mensagem contextual
    const message = this.generateContextualMessage(primaryField, intent, context);

    return {
      message,
      expectedFields: [primaryField.field],
      isOptional: primaryField.priority !== 'high'
    };
  }

  /**
   * Processa resposta do usuário e extrai dados
   */
  async processUserResponseForData(
    userMessage: string,
    expectedFields: string[],
    currentProfile: Partial<UserProfileData>
  ): Promise<{
    extractedData: Partial<UserProfileData>;
    confidence: number;
    needsConfirmation: boolean;
  }> {
    const extractedData: Partial<UserProfileData> = {};
    let confidence = 0;
    let needsConfirmation = false;

    for (const field of expectedFields) {
      switch (field) {
        case 'name':
          const name = this.extractName(userMessage);
          if (name) {
            extractedData.name = name;
            extractedData.gender = this.inferGender(name); // Auto-inferir gênero
            confidence += 0.8;
          }
          break;

        case 'email':
          const email = this.extractEmail(userMessage);
          if (email) {
            extractedData.email = email;
            confidence += 0.9;
          } else {
            needsConfirmation = true;
          }
          break;

        case 'birth_date':
          const birthDate = this.extractBirthDate(userMessage);
          if (birthDate) {
            extractedData.birth_date = birthDate;
            confidence += 0.7;
            needsConfirmation = true; // Sempre confirmar data
          }
          break;

        case 'address':
          const address = this.extractAddress(userMessage);
          if (address) {
            extractedData.address = address;
            confidence += 0.6;
          }
          break;
      }
    }

    return {
      extractedData,
      confidence: confidence / expectedFields.length,
      needsConfirmation
    };
  }

  /**
   * Salva dados coletados no perfil do usuário
   */
  async saveCollectedData(
    phone: string,
    tenantId: string,
    extractedData: Partial<UserProfileData>
  ): Promise<boolean> {
    try {
      const { data: existingUser, error: findError } = await supabaseAdmin
        .from('users')
        .select('id, name, email, gender, birth_date, address')
        .eq('phone', phone)
        .single();

      if (findError && findError.code !== 'PGRST116') {
        console.error('Erro ao buscar usuário para coleta de dados:', findError);
        return false;
      }

      // Preparar dados para update (apenas campos não-null)
      const updateData: any = {};
      Object.entries(extractedData).forEach(([key, value]) => {
        if (value && value.trim() !== '') {
          updateData[key] = value;
        }
      });

      if (Object.keys(updateData).length === 0) {
        return false; // Nada para atualizar
      }

      // Atualizar perfil existente ou criar novo
      if (existingUser && 'id' in existingUser && typeof existingUser.id === 'string') {
        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update(updateData)
          .eq('id', existingUser.id);

        if (updateError) {
          console.error('Erro ao atualizar dados coletados:', updateError);
          return false;
        }

        // Garantir que existe relação user_tenants para usuários existentes
        const { data: existingRelation } = await supabaseAdmin
          .from('user_tenants')
          .select('id')
          .eq('user_id', existingUser.id)
          .eq('tenant_id', tenantId)
          .single();

        if (!existingRelation) {
          await supabaseAdmin
            .from('user_tenants')
            .insert({
              user_id: existingUser.id,
              tenant_id: tenantId,
              role: 'customer'
            });
          console.log('✅ Relação user-tenant criada para usuário existente');
        }
      } else {
        // Criar novo usuário
        const { error: createError } = await supabaseAdmin
          .from('users')
          .insert({
            phone,
            ...updateData
          });

        if (createError) {
          console.error('Erro ao criar usuário com dados coletados:', createError);
          return false;
        }

        // Vincular ao tenant
        const { data: newUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('phone', phone)
          .single();

        if (newUser && 'id' in newUser) {
          await supabaseAdmin
            .from('user_tenants')
            .insert({
              user_id: newUser.id,
              tenant_id: tenantId,
              role: 'customer'
            });
        }
      }

      console.log('✅ Dados coletados progressivamente salvos:', updateData);
      return true;

    } catch (error) {
      console.error('Erro no sistema de coleta progressiva:', error);
      return false;
    }
  }

  /**
   * Gera estatísticas da coleta de dados para analytics
   */
  async getCollectionStats(tenantId: string): Promise<{
    completionRate: number;
    fieldCompletionRates: Record<string, number>;
    averageCollectionTime: number;
  }> {
    try {
      const { data: tenantUsers, error } = await supabaseAdmin
        .from('users')
        .select(`
          name, email, gender, birth_date, address,
          user_tenants!inner(tenant_id)
        `)
        .eq('user_tenants.tenant_id', tenantId);

      if (error || !tenantUsers) {
        return { completionRate: 0, fieldCompletionRates: {}, averageCollectionTime: 0 };
      }

      const totalUsers = tenantUsers.length;
      if (totalUsers === 0) {
        return { completionRate: 0, fieldCompletionRates: {}, averageCollectionTime: 0 };
      }

      // Calcular rates por campo
      const fieldCompletionRates: Record<string, number> = {};
      ['name', 'email', 'gender', 'birth_date', 'address'].forEach(field => {
        const completed = tenantUsers.filter(user => user[field as keyof typeof user]).length;
        fieldCompletionRates[field] = (completed / totalUsers) * 100;
      });

      // Taxa geral de completion (média dos campos essenciais)
      const essentialFields = ['name', 'email'];
      const completionRate = essentialFields.reduce((sum, field) => 
        sum + (fieldCompletionRates[field] || 0), 0) / essentialFields.length;

      return {
        completionRate,
        fieldCompletionRates,
        averageCollectionTime: 2.5 // mock - implementar tracking real
      };

    } catch (error) {
      console.error('Erro ao gerar estatísticas de coleta:', error);
      return { completionRate: 0, fieldCompletionRates: {}, averageCollectionTime: 0 };
    }
  }

  // ========================= MÉTODOS PRIVADOS =========================

  private getHighPriorityMissingFields(profile: Partial<UserProfileData>): DataCollectionStep[] {
    return this.dataCollectionSteps.filter(step => 
      step.priority === 'high' && !profile[step.field]
    );
  }

  private getContextualMissingFields(
    intent: string,
    profile: Partial<UserProfileData>
  ): DataCollectionStep[] {
    return this.dataCollectionSteps.filter(step => 
      step.contextualTrigger.includes(intent) && !profile[step.field]
    );
  }

  private selectPrimaryFieldForCollection(
    missingFields: DataCollectionStep[],
    context: CollectionContext
  ): DataCollectionStep | null {
    // Priorizar por prioridade e contexto
    const highPriority = missingFields.filter(f => f.priority === 'high');
    if (highPriority.length > 0) return highPriority[0] || null;

    const mediumPriority = missingFields.filter(f => f.priority === 'medium');
    if (mediumPriority.length > 0) return mediumPriority[0] || null;

    return missingFields[0] || null;
  }

  private generateContextualMessage(
    field: DataCollectionStep,
    intent: string,
    context: CollectionContext
  ): string {
    // Personalizar mensagem baseada no contexto
    switch (intent) {
      case 'availability':
        if (field.field === 'name') {
          return 'Para sugerir os melhores horários, como posso te chamar?';
        }
        if (field.field === 'email') {
          return 'Posso enviar a confirmação por email. Qual seu e-mail?';
        }
        break;

      case 'services':
        if (field.field === 'name') {
          return 'Para indicar os serviços mais adequados, como prefere ser chamado(a)?';
        }
        break;

      case 'pricing':
        if (field.field === 'birth_date') {
          return 'Temos descontos especiais por idade. Qual sua data de nascimento?';
        }
        break;
    }

    // Fallback para mensagem padrão
    return field.naturalPhrase;
  }

  // Métodos de extração de dados (reutilizados do webhook-flow-orchestrator)
  private extractName(text: string): string | null {
    const t = text.trim();
    
    // Formatos explícitos
    const explicitMatch = 
      t.match(/\b(meu nome é|me chamo|sou)\s+(.+)/i) ||
      t.match(/\bnome\s*:\s*(.+)/i);
    
    let candidate = (explicitMatch?.[2] || explicitMatch?.[1] || '').trim();
    
    // Se não achou padrão explícito, tenta padrão genérico
    if (!candidate) {
      const genericMatch = t.match(/([A-ZÀ-Ú][a-zA-ZÀ-ÿ''´`-]+(?:\s+[A-ZÀ-Ú][a-zA-ZÀ-ÿ''´`-]+)*)/);
      candidate = genericMatch?.[1]?.trim() || '';
    }
    
    if (!candidate) return null;
    
    // Validação básica
    const parts = candidate.split(/\s+/).filter(p => p.length >= 2);
    if (parts.length < 1) return null;
    
    // Anti-lixo
    if (/\b(obrigad[ao]|valeu|tchau|por favor|como vai|tudo bem)\b/i.test(candidate)) return null;
    
    return candidate.replace(/\s+/g, ' ').trim();
  }

  private extractEmail(text: string): string | null {
    const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    return match ? match[0].toLowerCase() : null;
  }

  private extractBirthDate(text: string): string | null {
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/;
    const match = text.match(dateRegex);
    
    if (!match || !match[1] || !match[2] || !match[3]) return null;
    
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    const year = parseInt(match[3]);
    
    // Validações básicas
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    if (year < 1900 || year > new Date().getFullYear()) return null;
    
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  private extractAddress(text: string): string | null {
    // Detectar padrões de endereço/bairro
    const addressPatterns = [
      /\b([A-ZÀ-Ú][a-zA-ZÀ-ÿ\s]+(?:centro|jardim|vila|bairro|distrito))/i,
      /\b(rua|av|avenida|alameda)\s+([A-ZÀ-Ú][a-zA-ZÀ-ÿ\s,\d-]+)/i,
      /\bmoro\s+(em|no|na)\s+([A-ZÀ-Ú][a-zA-ZÀ-ÿ\s]+)/i
    ];

    for (const pattern of addressPatterns) {
      const match = text.match(pattern);
      if (match) {
        const address = (match[2] || match[1] || '').trim();
        if (address.length > 3) return address;
      }
    }

    return null;
  }

  private inferGender(name: string): string | undefined {
    const firstName = name.split(/\s+/)[0]?.toLowerCase();
    if (!firstName) return undefined;
    
    if (/a$/.test(firstName)) return 'female';
    if (/o$/.test(firstName)) return 'male';
    return undefined;
  }
}