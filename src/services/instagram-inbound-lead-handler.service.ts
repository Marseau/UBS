/**
 * Instagram Inbound Lead Handler Service
 *
 * Processa leads que entraram em contato ESPONTANEAMENTE via Instagram
 * Fluxo: Criar lead mínimo → Responder com agente inbound → Enriquecer em background
 */

import { createClient } from '@supabase/supabase-js';
import { agentPromptService, PromptVariables } from './agent-prompt.service';
import OpenAI from 'openai';
import { enqueueLeadForEnrichment } from './lead-enrichment-worker.service';

export interface InstagramInboundLeadData {
  campaign_id: string;
  username: string;
  message_text: string;
  sender_id?: string;
}

export class InstagramInboundLeadHandler {
  private supabase: ReturnType<typeof createClient>;
  private openai: OpenAI;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }

  /**
   * Processar lead inbound do Instagram
   */
  async handleInboundLead(data: InstagramInboundLeadData): Promise<{
    success: boolean;
    lead_id?: string;
    response_text?: string;
    error?: string;
  }> {
    try {
      console.log(`📨 [Instagram Inbound] Processando lead: ${data.username}`);

      // 1. Verificar se lead já existe
      const existingLead = await this.findExistingLead(
        data.campaign_id,
        data.username
      );

      if (existingLead) {
        console.log(`✅ [Instagram Inbound] Lead já existe: ${existingLead.id}`);
        // Lead existe - processar como conversa contínua
        return this.handleExistingLead(existingLead, data.message_text);
      }

      // 2. Criar lead mínimo (sem scraping)
      const newLead = await this.createMinimalLead(data);

      if (!newLead) {
        return {
          success: false,
          error: 'Failed to create lead',
        };
      }

      console.log(`🆕 [Instagram Inbound] Lead criado: ${newLead.id}`);

      // 3. Gerar resposta com agente inbound
      const response = await this.generateInboundResponse(
        data.campaign_id,
        newLead,
        data.message_text
      );

      if (!response) {
        return {
          success: false,
          lead_id: newLead.id as string,
          error: 'Failed to generate AI response',
        };
      }

      // 4. Criar conversa
      await this.createConversation(data.campaign_id, newLead.id as string, data.username);

      // 5. Registrar DM outreach
      await this.registerOutreach(newLead.id as string, data.username, response);

      // 6. Enfileirar enriquecimento em background (baixa prioridade)
      await this.enqueueProfileEnrichment(newLead.id as string, data.username, data.campaign_id);

      return {
        success: true,
        lead_id: newLead.id as string,
        response_text: response,
      };
    } catch (error: any) {
      console.error('[Instagram Inbound] Erro ao processar lead:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Buscar lead existente
   */
  private async findExistingLead(campaignId: string, username: string) {
    const { data, error } = await this.supabase
      .from('instagram_leads')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('username', username)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found (ok)
      console.error('[Instagram Inbound] Erro ao buscar lead:', error);
    }

    return data;
  }

  /**
   * Criar lead mínimo (sem dados de scraping)
   */
  private async createMinimalLead(data: InstagramInboundLeadData) {
    const { data: newLead, error } = await this.supabase
      .from('instagram_leads')
      .insert({
        campaign_id: data.campaign_id,
        username: data.username,
        instagram_user_id: data.sender_id,
        full_name: null, // Não temos ainda
        bio: null,
        profile_pic_url: null,
        followers_count: null,
        following_count: null,
        posts_count: null,
        business_category: null,
        location: null,
        source: 'inbound', // ✅ Marcar origem
        first_contact_type: 'inbound',
        scraped_at: null, // Não foi scrapado
        is_enriched: false,
      })
      .select()
      .single();

    if (error) {
      console.error('[Instagram Inbound] Erro ao criar lead:', error);
      return null;
    }

    return newLead;
  }

  /**
   * Gerar resposta com agente inbound
   */
  private async generateInboundResponse(
    campaignId: string,
    lead: any,
    messageText: string
  ): Promise<string | null> {
    try {
      // 1. Buscar prompt inbound
      const prompt = await agentPromptService.getActivePrompt(
        campaignId,
        'inbound',
        'instagram'
      );

      if (!prompt) {
        console.error('[Instagram Inbound] Nenhum prompt inbound encontrado');
        return 'Olá! Obrigado por entrar em contato. Como posso ajudar?';
      }

      // 2. Montar variáveis (dados mínimos)
      const variables: PromptVariables = {
        username: lead.username,
        name: lead.full_name || lead.username,
      };

      // 3. Interpolar system prompt
      const systemPrompt = agentPromptService.interpolateTemplate(
        prompt.system_prompt,
        variables
      );

      // 4. Chamar OpenAI
      console.log(`🤖 [Instagram Inbound] Gerando resposta com ${prompt.model}`);

      const completion = await this.openai.chat.completions.create({
        model: prompt.model,
        temperature: prompt.temperature,
        max_tokens: prompt.max_tokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: messageText },
        ],
      });

      const response = completion.choices[0]?.message?.content;

      if (!response) {
        console.error('[Instagram Inbound] Resposta vazia da OpenAI');
        return prompt.fallback_message || 'Desculpe, tive um problema. Pode repetir?';
      }

      console.log(`✅ [Instagram Inbound] Resposta gerada: ${response.substring(0, 50)}...`);
      return response;
    } catch (error: any) {
      console.error('[Instagram Inbound] Erro ao gerar resposta:', error.message);
      return null;
    }
  }

  /**
   * Processar lead existente (conversa contínua)
   */
  private async handleExistingLead(lead: any, messageText: string) {
    // TODO: Implementar lógica de conversa contínua
    // Por enquanto, apenas gerar resposta
    const response = await this.generateInboundResponse(
      lead.campaign_id,
      lead,
      messageText
    );

    return {
      success: true,
      lead_id: lead.id,
      response_text: response || undefined,
    };
  }

  /**
   * Criar conversa
   */
  private async createConversation(
    campaignId: string,
    leadId: string,
    username: string
  ) {
    const { error } = await this.supabase
      .from('aic_instagram_conversations')
      .upsert({
        campaign_id: campaignId,
        lead_id: leadId,
        username: username,
        status: 'active',
        last_message_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[Instagram Inbound] Erro ao criar conversa:', error);
    }
  }

  /**
   * Registrar DM enviado
   */
  private async registerOutreach(
    leadId: string,
    username: string,
    messageText: string
  ) {
    const { error } = await this.supabase.from('instagram_dm_outreach').insert({
      lead_id: leadId,
      username: username,
      message_text: messageText,
      message_generated_by: 'gpt-4o-inbound',
      sent_at: new Date().toISOString(),
      delivery_status: 'pending',
    });

    if (error) {
      console.error('[Instagram Inbound] Erro ao registrar outreach:', error);
    }
  }

  /**
   * Enfileirar enriquecimento de perfil (background)
   */
  private async enqueueProfileEnrichment(leadId: string, username: string, campaignId?: string) {
    try {
      await enqueueLeadForEnrichment(leadId, username, 'inbound_instagram', campaignId, 7); // Prioridade 7 (mais baixa)
      console.log(`🔄 [Instagram Inbound] Enfileirado para enriquecimento: @${username}`);
    } catch (error: any) {
      console.error(`[Instagram Inbound] Erro ao enfileirar enriquecimento:`, error.message);
    }
  }
}

// Export singleton instance
export const instagramInboundLeadHandler = new InstagramInboundLeadHandler();
