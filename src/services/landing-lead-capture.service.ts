/**
 * Landing Lead Capture Service
 *
 * Captura leads da landing page e roteia para o WhatsApp correto:
 * - Se lead existe na campanha -> WhatsApp da campanha
 * - Se lead novo -> Scrape, adiciona à campanha, WhatsApp da campanha
 *
 * Fluxo:
 * 1. LP vinculada a campaign_id
 * 2. Lead preenche modal com @instagram
 * 3. Verifica se já existe em campaign_leads
 * 4. Se não existe: cria em instagram_leads + campaign_leads
 * 5. Dispara scraping async
 * 6. Retorna WhatsApp da campanha
 */

import { createClient } from '@supabase/supabase-js';
import { scrapeInstagramProfile } from './instagram-scraper-single.service';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// =====================================================
// TIPOS
// =====================================================

export interface LandingLeadInput {
  campaignId: string;
  name: string;
  email: string;
  whatsapp: string;
  instagramUsername: string;
  utmParams?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
  };
}

export interface LandingLeadResult {
  success: boolean;
  isExistingLead: boolean;
  leadId?: string;
  campaignLeadId?: string;
  redirectWhatsapp?: string;
  whatsappMessage?: string;
  error?: string;
}

export interface CampaignInfo {
  id: string;
  campaignName: string;
  whatsappNumber: string;
  whapiChannelId: string;
}

// =====================================================
// SERVICO PRINCIPAL
// =====================================================

export class LandingLeadCaptureService {

  /**
   * Captura lead da landing page
   */
  async captureLead(input: LandingLeadInput): Promise<LandingLeadResult> {
    try {
      const { campaignId, name, email, whatsapp, instagramUsername, utmParams } = input;

      // Normalizar username (remover @) - opcional
      const username = instagramUsername ? instagramUsername.replace(/^@/, '').toLowerCase().trim() : '';

      console.log(`[LandingLeadCapture] Processando lead ${username ? '@' + username : '(sem IG)'} para campanha ${campaignId}`);

      // 1. Buscar info da campanha
      const campaign = await this.getCampaignInfo(campaignId);
      if (!campaign) {
        return { success: false, isExistingLead: false, error: 'Campanha não encontrada' };
      }

      // 2. Se não tem Instagram, apenas redirecionar para WhatsApp
      // O AI Agent vai solicitar o Instagram durante a conversa
      if (!username) {
        console.log(`[LandingLeadCapture] Lead sem Instagram - redirecionando para WhatsApp da campanha`);

        return {
          success: true,
          isExistingLead: false,
          redirectWhatsapp: campaign.whatsappNumber,
          whatsappMessage: this.buildWhatsappMessageWithoutIG(name, campaign.campaignName)
        };
      }

      // 3. Verificar se lead já existe na campanha (por username)
      const existingCampaignLead = await this.findExistingCampaignLead(campaignId, username);

      if (existingCampaignLead) {
        // Lead já existe - atualizar e retornar
        console.log(`[LandingLeadCapture] Lead @${username} já existe na campanha`);

        await this.updateExistingLead(existingCampaignLead.id, existingCampaignLead.leadId);

        return {
          success: true,
          isExistingLead: true,
          leadId: existingCampaignLead.leadId,
          campaignLeadId: existingCampaignLead.id,
          redirectWhatsapp: campaign.whatsappNumber,
          whatsappMessage: this.buildWhatsappMessage(name, username, campaign.campaignName, true)
        };
      }

      // 4. Lead novo - verificar se já existe em instagram_leads
      let instagramLead = await this.findInstagramLead(username);

      if (!instagramLead) {
        // Criar novo registro em instagram_leads
        console.log(`[LandingLeadCapture] Criando novo lead @${username}`);
        instagramLead = await this.createInstagramLead({
          username,
          fullName: name,
          email,
          whatsappNumber: whatsapp
        });

        if (!instagramLead) {
          return { success: false, isExistingLead: false, error: 'Erro ao criar lead' };
        }

        // Disparar scraping em background
        this.triggerAsyncScraping(username, instagramLead.id);
      } else {
        // Atualizar dados de contato se necessário
        await this.updateInstagramLeadContact(instagramLead.id, { email, whatsappNumber: whatsapp, fullName: name });
      }

      // 5. Adicionar à campanha
      const campaignLead = await this.addLeadToCampaign({
        campaignId,
        leadId: instagramLead.id,
        source: 'landing',
        utmParams
      });

      if (!campaignLead) {
        return { success: false, isExistingLead: false, error: 'Erro ao adicionar lead à campanha' };
      }

      console.log(`[LandingLeadCapture] Lead @${username} adicionado à campanha com sucesso`);

      return {
        success: true,
        isExistingLead: false,
        leadId: instagramLead.id,
        campaignLeadId: campaignLead.id,
        redirectWhatsapp: campaign.whatsappNumber,
        whatsappMessage: this.buildWhatsappMessage(name, username, campaign.campaignName, false)
      };

    } catch (error: any) {
      console.error('[LandingLeadCapture] Erro:', error);
      return { success: false, isExistingLead: false, error: error.message };
    }
  }

  // =====================================================
  // METODOS AUXILIARES
  // =====================================================

  /**
   * Busca info da campanha incluindo WhatsApp
   */
  private async getCampaignInfo(campaignId: string): Promise<CampaignInfo | null> {
    try {
      const { data, error } = await supabase
        .from('cluster_campaigns')
        .select(`
          id,
          campaign_name,
          whapi_channel_uuid,
          whapi_channels!inner(phone_number)
        `)
        .eq('id', campaignId)
        .single();

      if (error || !data) {
        console.error('[LandingLeadCapture] Campanha não encontrada:', error);
        return null;
      }

      return {
        id: data.id,
        campaignName: data.campaign_name,
        whatsappNumber: (data.whapi_channels as any)?.phone_number || '',
        whapiChannelId: data.whapi_channel_uuid
      };
    } catch (error) {
      console.error('[LandingLeadCapture] Erro ao buscar campanha:', error);
      return null;
    }
  }

  /**
   * Verifica se lead já existe na campanha (por username)
   */
  private async findExistingCampaignLead(campaignId: string, username: string): Promise<{ id: string; leadId: string } | null> {
    try {
      const { data, error } = await supabase
        .from('campaign_leads')
        .select(`
          id,
          lead_id,
          instagram_leads!inner(username)
        `)
        .eq('campaign_id', campaignId)
        .eq('instagram_leads.username', username)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        leadId: data.lead_id
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Busca lead em instagram_leads por username
   */
  private async findInstagramLead(username: string): Promise<{ id: string } | null> {
    try {
      const { data, error } = await supabase
        .from('instagram_leads')
        .select('id')
        .eq('username', username)
        .single();

      if (error || !data) return null;
      return { id: data.id };
    } catch (error) {
      return null;
    }
  }

  /**
   * Cria novo lead em instagram_leads
   */
  private async createInstagramLead(data: {
    username: string;
    fullName: string;
    email: string;
    whatsappNumber: string;
  }): Promise<{ id: string } | null> {
    try {
      const { data: lead, error } = await supabase
        .from('instagram_leads')
        .insert({
          username: data.username,
          full_name: data.fullName,
          email: data.email,
          whatsapp_number: data.whatsappNumber,
          source: 'landing',
          captured_at: new Date().toISOString(),
          needs_scraping: true
        })
        .select('id')
        .single();

      if (error) {
        console.error('[LandingLeadCapture] Erro ao criar lead:', error);
        return null;
      }

      return { id: lead.id };
    } catch (error) {
      console.error('[LandingLeadCapture] Erro ao criar lead:', error);
      return null;
    }
  }

  /**
   * Atualiza dados de contato do lead existente
   */
  private async updateInstagramLeadContact(leadId: string, data: {
    email?: string;
    whatsappNumber?: string;
    fullName?: string;
  }): Promise<void> {
    try {
      const updateData: any = { updated_at: new Date().toISOString() };

      if (data.email) updateData.email = data.email;
      if (data.whatsappNumber) updateData.whatsapp_number = data.whatsappNumber;
      if (data.fullName) updateData.full_name = data.fullName;

      await supabase
        .from('instagram_leads')
        .update(updateData)
        .eq('id', leadId);
    } catch (error) {
      console.error('[LandingLeadCapture] Erro ao atualizar lead:', error);
    }
  }

  /**
   * Atualiza lead existente (visited_landing, etc)
   */
  private async updateExistingLead(campaignLeadId: string, leadId: string): Promise<void> {
    try {
      // Atualizar campaign_leads
      await supabase
        .from('campaign_leads')
        .update({
          visited_landing: true,
          visited_landing_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', campaignLeadId);

      // Atualizar instagram_leads
      await supabase
        .from('instagram_leads')
        .update({
          visited_landing: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);

    } catch (error) {
      console.error('[LandingLeadCapture] Erro ao atualizar lead existente:', error);
    }
  }

  /**
   * Adiciona lead à campanha
   */
  private async addLeadToCampaign(data: {
    campaignId: string;
    leadId: string;
    source: string;
    utmParams?: LandingLeadInput['utmParams'];
  }): Promise<{ id: string } | null> {
    try {
      const { data: campaignLead, error } = await supabase
        .from('campaign_leads')
        .insert({
          campaign_id: data.campaignId,
          lead_id: data.leadId,
          status: 'new',
          match_source: data.source,
          visited_landing: true,
          visited_landing_at: new Date().toISOString(),
          utm_params: data.utmParams || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) {
        console.error('[LandingLeadCapture] Erro ao adicionar à campanha:', error);
        return null;
      }

      return { id: campaignLead.id };
    } catch (error) {
      console.error('[LandingLeadCapture] Erro ao adicionar à campanha:', error);
      return null;
    }
  }

  /**
   * Dispara scraping em background
   */
  private async triggerAsyncScraping(username: string, leadId: string): Promise<void> {
    // Executar em background sem bloquear a resposta
    setImmediate(async () => {
      try {
        console.log(`[LandingLeadCapture] Iniciando scraping async para @${username}`);

        const profileData = await scrapeInstagramProfile(username);

        if (profileData) {
          // Atualizar instagram_leads com dados scraped
          await supabase
            .from('instagram_leads')
            .update({
              full_name: profileData.full_name || undefined,
              bio: profileData.bio || undefined,
              followers_count: profileData.followers_count || undefined,
              following_count: profileData.following_count || undefined,
              posts_count: profileData.posts_count || undefined,
              profile_pic_url: profileData.profile_pic_url || undefined,
              is_business: profileData.is_business_account || false,
              is_verified: profileData.is_verified || false,
              external_url: profileData.website || undefined,
              category: profileData.business_category || undefined,
              hashtags: profileData.hashtags_bio || [],
              needs_scraping: false,
              scraped_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', leadId);

          console.log(`[LandingLeadCapture] Scraping concluído para @${username}`);
        }
      } catch (error) {
        console.error(`[LandingLeadCapture] Erro no scraping async de @${username}:`, error);
      }
    });
  }

  /**
   * Monta mensagem para WhatsApp (com Instagram)
   */
  private buildWhatsappMessage(name: string, username: string, campaignName: string, isExisting: boolean): string {
    if (isExisting) {
      return `Olá! Sou ${name} (@${username}), já estávamos conversando e visitei a landing page. Gostaria de continuar!`;
    }
    return `Olá! Sou ${name} (@${username}), conheci a ${campaignName} pela landing page e gostaria de saber mais!`;
  }

  /**
   * Monta mensagem para WhatsApp (sem Instagram)
   * O AI Agent vai solicitar o Instagram durante a conversa
   */
  private buildWhatsappMessageWithoutIG(name: string, campaignName: string): string {
    return `Olá! Sou ${name}, conheci a ${campaignName} pela landing page e gostaria de saber mais!`;
  }
}

// =====================================================
// SINGLETON
// =====================================================

let instance: LandingLeadCaptureService | null = null;

export function getLandingLeadCaptureService(): LandingLeadCaptureService {
  if (!instance) {
    instance = new LandingLeadCaptureService();
  }
  return instance;
}

export default LandingLeadCaptureService;
