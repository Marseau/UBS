/**
 * Client Journey Service
 * State machine para gerenciar a jornada do cliente AIC
 *
 * Fluxo: Proposta -> Contrato -> Pagamento -> Credenciais -> Briefing -> Campanha
 */

import { supabaseAdmin } from '../config/database';

// ============================================
// TIPOS
// ============================================

export type JourneyStep =
  | 'proposta_enviada'
  | 'proposta_visualizada'
  | 'proposta_aceita'
  | 'contrato_enviado'
  | 'contrato_assinado'
  | 'pagamento_pendente'
  | 'pagamento_confirmado'
  | 'credenciais_pendente'
  | 'credenciais_ok'
  | 'briefing_pendente'
  | 'briefing_completo'
  | 'campanha_ativa'
  | 'campanha_concluida';

export interface JourneyData {
  id: string;
  delivery_id?: string;
  contract_id?: string;
  campaign_id?: string;
  auth_user_id?: string;
  client_name: string;
  client_email: string;
  client_phone?: string;
  client_document?: string;
  client_company?: string;
  current_step: JourneyStep;
  next_action_message: string;
  next_action_url?: string;
  access_token: string;
  proposal_data: ProposalData;
  created_at: string;
  updated_at: string;
}

export interface ProposalData {
  project_name?: string;
  campaign_whatsapp?: string; // Linha WhatsApp da campanha
  target_niche?: string;
  service_description?: string;
  target_audience?: string;
  contract_value?: number;
  lead_value?: number;
  campaign_duration_days?: number;
  target_leads?: number;
}

export interface CreateJourneyInput {
  delivery_id?: string;
  client_name: string;
  client_email: string;
  client_phone?: string;
  client_document?: string;
  client_company?: string;
  proposal_data?: ProposalData;
  created_by?: string;
  current_step?: JourneyStep;  // Etapa inicial (default: proposta_enviada)
  auth_user_id?: string;       // Vincular ao usuário autenticado
}

export interface StepTransitionResult {
  success: boolean;
  journey?: JourneyData;
  message: string;
  error?: string;
}

// ============================================
// CONSTANTES
// ============================================

const STEP_ORDER: JourneyStep[] = [
  'proposta_enviada',
  'proposta_visualizada',
  'proposta_aceita',
  'contrato_enviado',
  'contrato_assinado',
  'pagamento_pendente',
  'pagamento_confirmado',
  'credenciais_pendente',
  'credenciais_ok',
  'briefing_pendente',
  'briefing_completo',
  'campanha_ativa',
  'campanha_concluida'
];

const STEP_MESSAGES: Record<JourneyStep, { message: string; urlPath?: string }> = {
  proposta_enviada: {
    message: 'Sua proposta foi enviada! Clique no link para visualizar os detalhes.',
    urlPath: '/aic/proposta'
  },
  proposta_visualizada: {
    message: 'Voce visualizou a proposta. Clique para aceitar.',
    urlPath: '/cliente/proposta'
  },
  proposta_aceita: {
    message: 'Proposta aceita! Agora assine o contrato.',
    urlPath: '/cliente/contrato'
  },
  contrato_enviado: {
    message: 'Seu contrato esta pronto para assinatura! Clique no link para assinar eletronicamente.',
    urlPath: '/aic-contrato-prestacao-servicos.html'
  },
  contrato_assinado: {
    message: 'Contrato assinado com sucesso! Realize o pagamento de 50% para iniciar.',
    urlPath: '/aic/pagamento'
  },
  pagamento_pendente: {
    message: 'Aguardando confirmacao do pagamento (50% de entrada).',
    urlPath: '/aic/pagamento'
  },
  pagamento_confirmado: {
    message: 'Pagamento confirmado! Configure suas credenciais de WhatsApp e Instagram.',
    urlPath: '/aic/onboarding'
  },
  credenciais_pendente: {
    message: 'Configure suas credenciais de WhatsApp e Instagram para iniciar.',
    urlPath: '/aic/onboarding'
  },
  credenciais_ok: {
    message: 'Credenciais configuradas! Preencha o briefing da campanha.',
    urlPath: '/campaign'
  },
  briefing_pendente: {
    message: 'Preencha o briefing da campanha (minimo 80%).',
    urlPath: '/campaign'
  },
  briefing_completo: {
    message: 'Briefing completo! Sua campanha sera ativada em breve.',
  },
  campanha_ativa: {
    message: 'Sua campanha esta ativa! Acompanhe os resultados no dashboard.',
    urlPath: '/aic/dashboard'
  },
  campanha_concluida: {
    message: 'Campanha concluida! Veja o relatorio final.',
    urlPath: '/aic/relatorio'
  }
};

const STEP_PROGRESS: Record<JourneyStep, number> = {
  proposta_enviada: 5,
  proposta_visualizada: 10,
  proposta_aceita: 20,
  contrato_enviado: 25,
  contrato_assinado: 35,
  pagamento_pendente: 40,
  pagamento_confirmado: 50,
  credenciais_pendente: 55,
  credenciais_ok: 65,
  briefing_pendente: 70,
  briefing_completo: 85,
  campanha_ativa: 95,
  campanha_concluida: 100
};

// ============================================
// SERVICE CLASS
// ============================================

class ClientJourneyService {
  /**
   * Criar nova jornada do cliente
   */
  async createJourney(input: CreateJourneyInput): Promise<StepTransitionResult> {
    try {
      // Usar etapa inicial do input ou default 'proposta_enviada'
      const initialStep = input.current_step || 'proposta_enviada';
      const stepInfo = STEP_MESSAGES[initialStep];

      const { data: journey, error } = await supabaseAdmin
        .from('aic_client_journeys')
        .insert({
          delivery_id: input.delivery_id,
          client_name: input.client_name,
          client_email: input.client_email,
          client_phone: input.client_phone,
          client_document: input.client_document,
          client_company: input.client_company,
          current_step: initialStep,
          next_action_message: stepInfo.message,
          next_action_url: stepInfo.urlPath,
          proposal_data: input.proposal_data || {},
          created_by: input.created_by,
          auth_user_id: input.auth_user_id  // Vincular ao usuário autenticado
        })
        .select()
        .single();

      if (error) {
        console.error('[ClientJourney] Error creating journey:', error);
        return { success: false, message: 'Erro ao criar jornada', error: error.message };
      }

      console.log(`[ClientJourney] Journey created: ${journey.id} for ${input.client_email}`);

      return {
        success: true,
        journey: journey as JourneyData,
        message: 'Jornada criada com sucesso'
      };
    } catch (error) {
      console.error('[ClientJourney] Exception creating journey:', error);
      return { success: false, message: 'Erro interno', error: String(error) };
    }
  }

  /**
   * Obter jornada por ID
   */
  async getJourneyById(journeyId: string): Promise<JourneyData | null> {
    const { data, error } = await supabaseAdmin
      .from('aic_client_journeys')
      .select('*')
      .eq('id', journeyId)
      .single();

    if (error) {
      console.error('[ClientJourney] Error fetching journey:', error);
      return null;
    }

    return data as JourneyData;
  }

  /**
   * Obter jornada por token de acesso (para acesso publico)
   */
  async getJourneyByAccessToken(token: string): Promise<JourneyData | null> {
    const { data, error } = await supabaseAdmin
      .from('aic_client_journeys')
      .select('*')
      .eq('access_token', token)
      .gt('access_token_expires_at', new Date().toISOString())
      .single();

    if (error) {
      console.error('[ClientJourney] Error fetching journey by token:', error);
      return null;
    }

    return data as JourneyData;
  }

  /**
   * Obter jornada por delivery_id
   */
  async getJourneyByDeliveryId(deliveryId: string): Promise<JourneyData | null> {
    const { data, error } = await supabaseAdmin
      .from('aic_client_journeys')
      .select('*')
      .eq('delivery_id', deliveryId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[ClientJourney] Error fetching journey by delivery:', error);
    }

    return data as JourneyData | null;
  }

  /**
   * Obter jornada por email do cliente
   */
  async getJourneyByEmail(email: string): Promise<JourneyData | null> {
    const { data, error } = await supabaseAdmin
      .from('aic_client_journeys')
      .select('*')
      .eq('client_email', email.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[ClientJourney] Error fetching journey by email:', error);
    }

    return data as JourneyData | null;
  }

  /**
   * Verificar se pode acessar determinada etapa
   */
  canAccessStep(currentStep: JourneyStep, requestedStep: JourneyStep): boolean {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    const requestedIndex = STEP_ORDER.indexOf(requestedStep);

    // Pode acessar etapa atual ou etapas anteriores
    return requestedIndex <= currentIndex;
  }

  /**
   * Verificar se pode avancar para proxima etapa
   */
  canAdvanceToStep(currentStep: JourneyStep, targetStep: JourneyStep): boolean {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    const targetIndex = STEP_ORDER.indexOf(targetStep);

    // Pode avancar para proxima etapa ou pular (ex: direto de contrato_assinado para pagamento_pendente)
    return targetIndex > currentIndex;
  }

  /**
   * Avancar para proxima etapa
   */
  async advanceStep(journeyId: string, targetStep?: JourneyStep): Promise<StepTransitionResult> {
    try {
      const journey = await this.getJourneyById(journeyId);
      if (!journey) {
        return { success: false, message: 'Jornada nao encontrada' };
      }

      const currentIndex = STEP_ORDER.indexOf(journey.current_step);
      const nextStep = targetStep || STEP_ORDER[currentIndex + 1];

      if (!nextStep) {
        return { success: false, message: 'Jornada ja concluida' };
      }

      const stepInfo = STEP_MESSAGES[nextStep];
      let nextUrl = stepInfo.urlPath;

      // Construir URL com IDs quando necessario
      if (nextUrl && journey.campaign_id) {
        nextUrl = nextUrl.replace('/campaign', `/campaign/${journey.campaign_id}/briefing`);
      }
      if (nextUrl && journey.id) {
        nextUrl = nextUrl.replace('/aic/pagamento', `/aic/pagamento/${journey.id}`);
        nextUrl = nextUrl.replace('/aic/onboarding', `/aic/onboarding/${journey.campaign_id || journey.id}`);
        nextUrl = nextUrl.replace('/aic/dashboard', `/aic/dashboard/${journey.campaign_id || journey.id}`);
      }

      const { data: updated, error } = await supabaseAdmin
        .from('aic_client_journeys')
        .update({
          current_step: nextStep,
          next_action_message: stepInfo.message,
          next_action_url: nextUrl
        })
        .eq('id', journeyId)
        .select()
        .single();

      if (error) {
        console.error('[ClientJourney] Error advancing step:', error);
        return { success: false, message: 'Erro ao avancar etapa', error: error.message };
      }

      console.log(`[ClientJourney] Journey ${journeyId} advanced to: ${nextStep}`);

      return {
        success: true,
        journey: updated as JourneyData,
        message: `Avancou para: ${nextStep}`
      };
    } catch (error) {
      console.error('[ClientJourney] Exception advancing step:', error);
      return { success: false, message: 'Erro interno', error: String(error) };
    }
  }

  /**
   * Definir etapa especifica (para transicoes forcadas)
   */
  async setStep(journeyId: string, step: JourneyStep, additionalData?: Partial<JourneyData>): Promise<StepTransitionResult> {
    try {
      const stepInfo = STEP_MESSAGES[step];

      const updateData: Record<string, unknown> = {
        current_step: step,
        next_action_message: stepInfo.message,
        next_action_url: stepInfo.urlPath,
        ...additionalData
      };

      const { data: updated, error } = await supabaseAdmin
        .from('aic_client_journeys')
        .update(updateData)
        .eq('id', journeyId)
        .select()
        .single();

      if (error) {
        console.error('[ClientJourney] Error setting step:', error);
        return { success: false, message: 'Erro ao definir etapa', error: error.message };
      }

      console.log(`[ClientJourney] Journey ${journeyId} set to: ${step}`);

      return {
        success: true,
        journey: updated as JourneyData,
        message: `Etapa definida: ${step}`
      };
    } catch (error) {
      console.error('[ClientJourney] Exception setting step:', error);
      return { success: false, message: 'Erro interno', error: String(error) };
    }
  }

  /**
   * Vincular contrato a jornada e criar campanha
   */
  async linkContractAndCreateCampaign(
    journeyId: string,
    contractId: string,
    contractData: {
      client_name: string;
      client_email: string;
      client_phone?: string;
      client_document?: string;
      client_company?: string;
      project_name?: string;
      campaign_whatsapp?: string; // Linha WhatsApp da campanha (obrigatorio no contrato)
      target_niche?: string;
      service_description?: string;
      target_audience?: string;
      contract_value?: number;
      lead_value?: number;
    }
  ): Promise<StepTransitionResult> {
    try {
      // 1. Criar projeto
      const { data: project, error: projectError } = await supabaseAdmin
        .from('cluster_projects')
        .insert({
          client_name: contractData.client_name,
          client_email: contractData.client_email,
          project_name: `Campanha ${contractData.client_company || contractData.client_name}`,
          status: 'active',
          metadata: {
            client_phone: contractData.client_phone,
            client_company: contractData.client_company,
            service_description: contractData.service_description
          }
        })
        .select()
        .single();

      if (projectError) {
        console.error('[ClientJourney] Error creating project:', projectError);
        return { success: false, message: 'Erro ao criar projeto', error: projectError.message };
      }

      // 2. Criar campanha com dados do contrato
      const { data: campaign, error: campaignError } = await supabaseAdmin
        .from('cluster_campaigns')
        .insert({
          project_id: project.id,
          campaign_name: contractData.project_name || `Campanha ${contractData.client_name}`,
          project_name: contractData.project_name || `Campanha ${contractData.client_name}`,
          nicho_principal: contractData.target_niche,
          keywords: [], // Campo obrigatorio - sera preenchido na clusterizacao
          service_description: contractData.service_description,
          target_audience: contractData.target_audience,
          onboarding_status: 'pending_config',
          client_contact_name: contractData.client_name,
          // Linha WhatsApp da campanha (declarada no contrato)
          client_whatsapp_number: contractData.campaign_whatsapp || contractData.client_phone,
          client_email: contractData.client_email,
          client_document: contractData.client_document
        })
        .select()
        .single();

      if (campaignError) {
        console.error('[ClientJourney] Error creating campaign:', campaignError);
        return { success: false, message: 'Erro ao criar campanha', error: campaignError.message };
      }

      console.log(`[ClientJourney] Campaign created: ${campaign.id} for journey ${journeyId}`);

      // 3. Atualizar jornada com contract_id e campaign_id
      const stepInfo = STEP_MESSAGES['pagamento_pendente'];
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('aic_client_journeys')
        .update({
          contract_id: contractId,
          campaign_id: campaign.id,
          client_name: contractData.client_name,
          client_email: contractData.client_email,
          client_phone: contractData.client_phone,
          client_document: contractData.client_document,
          client_company: contractData.client_company,
          current_step: 'pagamento_pendente',
          next_action_message: stepInfo.message,
          next_action_url: `/aic/pagamento/${journeyId}`,
          proposal_data: {
            project_name: contractData.project_name,
            target_niche: contractData.target_niche,
            service_description: contractData.service_description,
            target_audience: contractData.target_audience,
            contract_value: contractData.contract_value || 4000,
            lead_value: contractData.lead_value || 10,
            campaign_duration_days: 30,
            target_leads: 2000
          }
        })
        .eq('id', journeyId)
        .select()
        .single();

      if (updateError) {
        console.error('[ClientJourney] Error updating journey:', updateError);
        return { success: false, message: 'Erro ao atualizar jornada', error: updateError.message };
      }

      return {
        success: true,
        journey: updated as JourneyData,
        message: `Contrato vinculado e campanha ${campaign.id} criada`
      };
    } catch (error) {
      console.error('[ClientJourney] Exception linking contract:', error);
      return { success: false, message: 'Erro interno', error: String(error) };
    }
  }

  /**
   * Confirmar pagamento
   */
  async confirmPayment(journeyId: string): Promise<StepTransitionResult> {
    return this.setStep(journeyId, 'pagamento_confirmado');
  }

  /**
   * Marcar credenciais como configuradas e avancar para briefing_pendente
   */
  async markCredentialsComplete(journeyId: string): Promise<StepTransitionResult> {
    // Primeiro marca credenciais_ok, depois avanca para briefing_pendente
    const credResult = await this.setStep(journeyId, 'credenciais_ok');
    if (!credResult.success) return credResult;

    // Avancar para briefing_pendente
    return this.setStep(journeyId, 'briefing_pendente');
  }

  /**
   * Marcar briefing como completo
   */
  async markBriefingComplete(journeyId: string): Promise<StepTransitionResult> {
    return this.setStep(journeyId, 'briefing_completo');
  }

  /**
   * Ativar campanha
   */
  async activateCampaign(journeyId: string): Promise<StepTransitionResult> {
    return this.setStep(journeyId, 'campanha_ativa');
  }

  /**
   * Concluir campanha
   */
  async completeCampaign(journeyId: string): Promise<StepTransitionResult> {
    return this.setStep(journeyId, 'campanha_concluida');
  }

  /**
   * Obter progresso da jornada em percentual
   */
  getProgress(step: JourneyStep): number {
    return STEP_PROGRESS[step] || 0;
  }

  /**
   * Obter todas as etapas com status
   */
  getStepsWithStatus(currentStep: JourneyStep): Array<{
    step: JourneyStep;
    label: string;
    status: 'completed' | 'current' | 'pending';
    progress: number;
  }> {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    const stepLabels: Record<JourneyStep, string> = {
      proposta_enviada: 'Proposta Enviada',
      proposta_visualizada: 'Proposta Visualizada',
      proposta_aceita: 'Proposta Aceita',
      contrato_enviado: 'Contrato Enviado',
      contrato_assinado: 'Contrato Assinado',
      pagamento_pendente: 'Pagamento Pendente',
      pagamento_confirmado: 'Pagamento Confirmado',
      credenciais_pendente: 'Credenciais Pendentes',
      credenciais_ok: 'Credenciais OK',
      briefing_pendente: 'Briefing Pendente',
      briefing_completo: 'Briefing Completo',
      campanha_ativa: 'Campanha Ativa',
      campanha_concluida: 'Campanha Concluida'
    };

    return STEP_ORDER.map((step, index) => ({
      step,
      label: stepLabels[step],
      status: index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'pending',
      progress: STEP_PROGRESS[step]
    }));
  }

  /**
   * Listar jornadas com filtros
   */
  async listJourneys(filters?: {
    current_step?: JourneyStep;
    client_email?: string;
    campaign_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<JourneyData[]> {
    let query = supabaseAdmin
      .from('aic_client_journeys')
      .select('*, campaign:cluster_campaigns(id, campaign_name)')
      .order('created_at', { ascending: false });

    if (filters?.current_step) {
      query = query.eq('current_step', filters.current_step);
    }
    if (filters?.client_email) {
      query = query.eq('client_email', filters.client_email.toLowerCase());
    }
    if (filters?.campaign_id) {
      query = query.eq('campaign_id', filters.campaign_id);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ClientJourney] Error listing journeys:', error);
      return [];
    }

    return data as JourneyData[];
  }

  /**
   * Obter jornada pelo auth_user_id (usuario Supabase logado)
   * Inclui dados da campanha vinculada
   */
  async getJourneyByUserId(userId: string): Promise<JourneyData | null> {
    const { data, error } = await supabaseAdmin
      .from('aic_client_journeys')
      .select(`
        *,
        campaign:cluster_campaigns (
          id,
          campaign_name,
          slug,
          project_name,
          nicho_principal,
          service_description,
          target_audience,
          client_contact_name,
          client_email,
          client_document,
          client_whatsapp_number,
          client_address
        )
      `)
      .eq('auth_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[ClientJourney] Error fetching journey by user_id:', error);
    }

    return data as JourneyData | null;
  }

  /**
   * Buscar jornada especifica por ID, verificando que pertence ao usuario
   */
  async getJourneyByIdAndUser(journeyId: string, userId: string): Promise<JourneyData | null> {
    const { data, error } = await supabaseAdmin
      .from('aic_client_journeys')
      .select(`
        *,
        campaign:cluster_campaigns (
          id,
          campaign_name,
          slug,
          project_name,
          nicho_principal,
          service_description,
          target_audience,
          client_contact_name,
          client_email,
          client_document,
          client_whatsapp_number,
          client_address
        )
      `)
      .eq('id', journeyId)
      .eq('auth_user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[ClientJourney] Error fetching journey by id and user:', error);
    }

    return data as JourneyData | null;
  }

  /**
   * Vincular usuario autenticado a uma jornada via access_token
   */
  async linkUserToJourney(accessToken: string, userId: string): Promise<StepTransitionResult> {
    try {
      // Primeiro, buscar a jornada pelo token
      const journey = await this.getJourneyByAccessToken(accessToken);

      if (!journey) {
        return { success: false, message: 'Jornada nao encontrada ou token expirado' };
      }

      // Verificar se ja esta vinculada a outro usuario
      if (journey.auth_user_id && journey.auth_user_id !== userId) {
        return { success: false, message: 'Esta jornada ja esta vinculada a outro usuario' };
      }

      // Se ja esta vinculada ao mesmo usuario, sucesso
      if (journey.auth_user_id === userId) {
        return {
          success: true,
          journey: journey,
          message: 'Jornada ja vinculada a este usuario'
        };
      }

      // Vincular o usuario
      const { data: updated, error } = await supabaseAdmin
        .from('aic_client_journeys')
        .update({
          auth_user_id: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', journey.id)
        .select()
        .single();

      if (error) {
        console.error('[ClientJourney] Error linking user to journey:', error);
        return { success: false, message: 'Erro ao vincular usuario', error: error.message };
      }

      console.log(`[ClientJourney] User ${userId} linked to journey ${journey.id}`);

      return {
        success: true,
        journey: updated as JourneyData,
        message: 'Usuario vinculado com sucesso'
      };
    } catch (error) {
      console.error('[ClientJourney] Exception linking user:', error);
      return { success: false, message: 'Erro interno', error: String(error) };
    }
  }

  /**
   * Gerar link de convite para o cliente
   */
  generateInviteLink(accessToken: string, baseUrl?: string): string {
    const base = baseUrl || process.env.APP_URL || 'https://dev.ubs.app.br';
    return `${base}/cliente/login?invite=${accessToken}`;
  }
}

export const clientJourneyService = new ClientJourneyService();
export default clientJourneyService;
