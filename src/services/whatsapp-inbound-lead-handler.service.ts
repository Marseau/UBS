/**
 * WhatsApp Inbound Lead Handler Service
 *
 * Processa contatos que entraram em contato ESPONTANEAMENTE via WhatsApp
 * Fluxo: Criar contato mínimo → Responder com agente inbound → Registrar conversa
 */

import { createClient } from '@supabase/supabase-js';
import { agentPromptService, PromptVariables } from './agent-prompt.service';
import OpenAI from 'openai';

export interface WhatsAppInboundLeadData {
  campaign_id: string;
  phone: string;
  name: string; // Nome do contato WhatsApp
  message_text: string;
}

export class WhatsAppInboundLeadHandler {
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
   * Processar lead inbound do WhatsApp
   */
  async handleInboundLead(data: WhatsAppInboundLeadData): Promise<{
    success: boolean;
    contact_id?: string;
    response_text?: string;
    error?: string;
  }> {
    try {
      console.log(`💬 [WhatsApp Inbound] Processando contato: ${data.phone}`);

      // 1. Verificar se contato já existe
      const existingContact = await this.findExistingContact(
        data.campaign_id,
        data.phone
      );

      if (existingContact) {
        console.log(`✅ [WhatsApp Inbound] Contato já existe: ${existingContact.id}`);
        // Contato existe - processar como conversa contínua
        return this.handleExistingContact(existingContact, data.message_text);
      }

      // 2. Criar contato mínimo
      const newContact = await this.createMinimalContact(data);

      if (!newContact) {
        return {
          success: false,
          error: 'Failed to create contact',
        };
      }

      console.log(`🆕 [WhatsApp Inbound] Contato criado: ${newContact.id}`);

      // 3. Gerar resposta com agente inbound
      const response = await this.generateInboundResponse(
        data.campaign_id,
        newContact,
        data.message_text
      );

      if (!response) {
        return {
          success: false,
          contact_id: newContact.id as string,
          error: 'Failed to generate AI response',
        };
      }

      // 4. Criar conversa
      await this.createConversation(data.campaign_id, newContact.id as string, data.phone);

      return {
        success: true,
        contact_id: newContact.id as string,
        response_text: response,
      };
    } catch (error: any) {
      console.error('[WhatsApp Inbound] Erro ao processar contato:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Buscar contato existente
   */
  private async findExistingContact(campaignId: string, phone: string) {
    const { data, error } = await this.supabase
      .from('aic_whatsapp_contacts')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('phone', phone)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[WhatsApp Inbound] Erro ao buscar contato:', error);
    }

    return data;
  }

  /**
   * Criar contato mínimo
   */
  private async createMinimalContact(data: WhatsAppInboundLeadData) {
    const { data: newContact, error } = await this.supabase
      .from('aic_whatsapp_contacts')
      .insert({
        campaign_id: data.campaign_id,
        phone: data.phone,
        name: data.name,
        source: 'inbound', // ✅ Marcar origem
        first_contact_type: 'inbound',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[WhatsApp Inbound] Erro ao criar contato:', error);
      return null;
    }

    return newContact;
  }

  /**
   * Gerar resposta com agente inbound
   */
  private async generateInboundResponse(
    campaignId: string,
    contact: any,
    messageText: string
  ): Promise<string | null> {
    try {
      // 1. Buscar prompt inbound
      const prompt = await agentPromptService.getActivePrompt(
        campaignId,
        'inbound',
        'whatsapp'
      );

      if (!prompt) {
        console.error('[WhatsApp Inbound] Nenhum prompt inbound encontrado');
        return 'Olá! Obrigado por entrar em contato. Como posso ajudar?';
      }

      // 2. Montar variáveis
      const variables: PromptVariables = {
        phone: contact.phone,
        name: contact.name || 'Cliente',
      };

      // 3. Interpolar system prompt
      const systemPrompt = agentPromptService.interpolateTemplate(
        prompt.system_prompt,
        variables
      );

      // 4. Chamar OpenAI
      console.log(`🤖 [WhatsApp Inbound] Gerando resposta com ${prompt.model}`);

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
        console.error('[WhatsApp Inbound] Resposta vazia da OpenAI');
        return prompt.fallback_message || 'Desculpe, tive um problema. Pode repetir?';
      }

      console.log(`✅ [WhatsApp Inbound] Resposta gerada: ${response.substring(0, 50)}...`);
      return response;
    } catch (error: any) {
      console.error('[WhatsApp Inbound] Erro ao gerar resposta:', error.message);
      return null;
    }
  }

  /**
   * Processar contato existente (conversa contínua)
   */
  private async handleExistingContact(contact: any, messageText: string) {
    const response = await this.generateInboundResponse(
      contact.campaign_id,
      contact,
      messageText
    );

    return {
      success: true,
      contact_id: contact.id,
      response_text: response || undefined,
    };
  }

  /**
   * Criar conversa
   */
  private async createConversation(
    campaignId: string,
    contactId: string,
    phone: string
  ) {
    const { error } = await this.supabase
      .from('aic_whatsapp_conversations')
      .upsert({
        campaign_id: campaignId,
        contact_id: contactId,
        phone: phone,
        status: 'active',
        last_message_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[WhatsApp Inbound] Erro ao criar conversa:', error);
    }
  }
}

// Export singleton instance
export const whatsappInboundLeadHandler = new WhatsAppInboundLeadHandler();
