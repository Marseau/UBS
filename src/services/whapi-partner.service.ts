/**
 * Whapi Partner API Service
 *
 * Serviço para gerenciamento de canais WhatsApp via Partner API
 * Permite criar, listar, deletar e configurar canais programaticamente
 *
 * Documentação: https://whapi-partner.readme.io/reference
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface PartnerChannel {
  id: string;
  name: string;
  token: string;
  apiUrl: string;
  phone?: string;
  status: 'trial' | 'dev' | 'dev_archive' | 'live';
  activeTill?: string;
  createdAt?: string;
  projectId?: string;
}

export interface CreateChannelOptions {
  name: string;
  projectId?: string;
  phone?: string;
}

export interface CreateChannelResult {
  success: boolean;
  channel?: PartnerChannel;
  error?: string;
}

export interface ListChannelsResult {
  success: boolean;
  channels: PartnerChannel[];
  total?: number;
  error?: string;
}

export interface ChannelModeResult {
  success: boolean;
  error?: string;
}

export interface DeleteChannelResult {
  success: boolean;
  daysRefunded?: number;
  error?: string;
}

export interface PartnerBalance {
  days: number;
  channels: number;
}

// ============================================================================
// WHAPI PARTNER SERVICE
// ============================================================================

export class WhapiPartnerService {
  private client: AxiosInstance;
  private supabase: SupabaseClient;
  private partnerToken: string;

  constructor(partnerToken?: string) {
    this.partnerToken = partnerToken || process.env.WHAPI_PARTNER_TOKEN || '';

    if (!this.partnerToken) {
      console.warn('[WhapiPartner] Token não configurado. Defina WHAPI_PARTNER_TOKEN.');
    }

    this.client = axios.create({
      baseURL: 'https://manager.whapi.cloud',
      headers: {
        'Authorization': `Bearer ${this.partnerToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Interceptor para logs de erro
    this.client.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        console.error('[WhapiPartner] Erro na requisição:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  // ==========================================================================
  // GERENCIAMENTO DE CANAIS
  // ==========================================================================

  /**
   * Cria um novo canal WhatsApp
   */
  async createChannel(options: CreateChannelOptions): Promise<CreateChannelResult> {
    try {
      console.log('[WhapiPartner] Criando canal:', options.name);

      const response = await this.client.put('/channels', {
        name: options.name,
        projectId: options.projectId || 'aic-campaigns',
        phone: options.phone
      });

      const channel: PartnerChannel = {
        id: response.data.id,
        name: response.data.name || options.name,
        token: response.data.token,
        apiUrl: response.data.apiUrl || 'https://gate.whapi.cloud',
        phone: response.data.phone,
        status: response.data.mode || 'trial',
        activeTill: response.data.activeTill,
        createdAt: response.data.createdAt,
        projectId: options.projectId || 'aic-campaigns'
      };

      console.log('[WhapiPartner] Canal criado com sucesso:', channel.id);

      return {
        success: true,
        channel
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message;
      console.error('[WhapiPartner] Erro ao criar canal:', errorMessage);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Lista todos os canais
   */
  async listChannels(options?: { projectId?: string; limit?: number; offset?: number }): Promise<ListChannelsResult> {
    try {
      const path = options?.projectId
        ? `/channels/list/${options.projectId}`
        : '/channels/list';

      const response = await this.client.get(path, {
        params: {
          count: options?.limit || 100,
          offset: options?.offset || 0
        }
      });

      const channels: PartnerChannel[] = (response.data || []).map((ch: any) => ({
        id: ch.id,
        name: ch.name,
        token: ch.token,
        apiUrl: ch.apiUrl || 'https://gate.whapi.cloud',
        phone: ch.phone,
        status: ch.mode || 'trial',
        activeTill: ch.activeTill,
        createdAt: ch.createdAt,
        projectId: ch.projectId
      }));

      return {
        success: true,
        channels,
        total: channels.length
      };
    } catch (error: any) {
      return {
        success: false,
        channels: [],
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Obtém detalhes de um canal específico
   */
  async getChannel(channelId: string): Promise<CreateChannelResult> {
    try {
      const response = await this.client.get(`/channels/${channelId}`);

      const channel: PartnerChannel = {
        id: response.data.id,
        name: response.data.name,
        token: response.data.token,
        apiUrl: response.data.apiUrl || 'https://gate.whapi.cloud',
        phone: response.data.phone,
        status: response.data.mode || 'trial',
        activeTill: response.data.activeTill,
        createdAt: response.data.createdAt,
        projectId: response.data.projectId
      };

      return {
        success: true,
        channel
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Deleta um canal e recupera os dias não utilizados
   */
  async deleteChannel(channelId: string): Promise<DeleteChannelResult> {
    try {
      console.log('[WhapiPartner] Deletando canal:', channelId);

      const response = await this.client.delete(`/channels/${channelId}`);

      console.log('[WhapiPartner] Canal deletado com sucesso');

      return {
        success: true,
        daysRefunded: response.data?.daysRefunded
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Altera o modo do canal (trial -> live)
   */
  async changeChannelMode(channelId: string, mode: 'trial' | 'dev' | 'dev_archive' | 'live'): Promise<ChannelModeResult> {
    try {
      console.log('[WhapiPartner] Alterando modo do canal:', channelId, '->', mode);

      await this.client.patch(`/channels/${channelId}/mode`, { mode });

      console.log('[WhapiPartner] Modo alterado com sucesso');

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Reinicia um canal
   */
  async restartChannel(channelId: string): Promise<ChannelModeResult> {
    try {
      console.log('[WhapiPartner] Reiniciando canal:', channelId);

      await this.client.post(`/channels/${channelId}/restart`);

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // ==========================================================================
  // INTEGRAÇÃO COM CAMPANHAS AIC
  // ==========================================================================

  /**
   * Cria canal WhatsApp para uma campanha e salva no banco
   */
  async createChannelForCampaign(campaignId: string, campaignName: string): Promise<CreateChannelResult> {
    try {
      // 1. Criar canal na Whapi
      const result = await this.createChannel({
        name: `AIC - ${campaignName}`,
        projectId: 'aic-campaigns'
      });

      if (!result.success || !result.channel) {
        return result;
      }

      // 2. Salvar no banco whapi_channels
      const { error: dbError } = await this.supabase
        .from('whapi_channels')
        .insert({
          id: result.channel.id,
          name: result.channel.name,
          channel_id: result.channel.id,
          api_token: result.channel.token,
          status: 'pending_setup',
          rate_limit_hourly: 20,
          rate_limit_daily: 120,
          warmup_mode: false,
          notes: `Canal criado via Partner API para campanha ${campaignId}`
        });

      if (dbError) {
        console.error('[WhapiPartner] Erro ao salvar canal no banco:', dbError);
        // Canal foi criado na Whapi, mas não salvou no banco
        // Retornar sucesso mas com warning
      }

      // 3. Vincular canal à campanha
      const { error: linkError } = await this.supabase
        .from('cluster_campaigns')
        .update({ whapi_channel_uuid: result.channel.id })
        .eq('id', campaignId);

      if (linkError) {
        console.error('[WhapiPartner] Erro ao vincular canal à campanha:', linkError);
      }

      console.log('[WhapiPartner] Canal criado e vinculado à campanha:', campaignId);

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtém QR Code para conexão do WhatsApp
   * Usa a API do canal individual (não a Partner API)
   */
  async getChannelQRCode(channelToken: string): Promise<{ success: boolean; qrCode?: string; error?: string }> {
    try {
      // QR Code é obtido via API do canal, não via Partner API
      const channelClient = axios.create({
        baseURL: 'https://gate.whapi.cloud',
        headers: {
          'Authorization': `Bearer ${channelToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const response = await channelClient.get('/settings/qr');

      return {
        success: true,
        qrCode: response.data?.qr || response.data?.qr_code
      };
    } catch (error: any) {
      // Se retornar 404 ou similar, pode significar que já está conectado
      if (error.response?.status === 404 || error.response?.status === 400) {
        return {
          success: false,
          error: 'Canal pode já estar conectado ou QR não disponível'
        };
      }

      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Verifica status de conexão de um canal
   */
  async getChannelStatus(channelToken: string): Promise<{ connected: boolean; phone?: string; error?: string }> {
    try {
      const channelClient = axios.create({
        baseURL: 'https://gate.whapi.cloud',
        headers: {
          'Authorization': `Bearer ${channelToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const response = await channelClient.get('/health');

      const status = response.data?.status;

      return {
        connected: status?.state === 'connected' || status?.state === 'online',
        phone: status?.phone || response.data?.phone
      };
    } catch (error: any) {
      return {
        connected: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Configura webhook para um canal
   */
  async configureChannelWebhook(
    channelToken: string,
    webhookUrl: string,
    events?: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const channelClient = axios.create({
        baseURL: 'https://gate.whapi.cloud',
        headers: {
          'Authorization': `Bearer ${channelToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      await channelClient.patch('/settings', {
        webhooks: [{
          url: webhookUrl,
          events: events || [
            'messages',
            'message.any',
            'ack',
            'chat'
          ]
        }]
      });

      console.log('[WhapiPartner] Webhook configurado:', webhookUrl);

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Ativa canal para produção (trial -> live)
   */
  async activateChannelForProduction(channelId: string): Promise<ChannelModeResult> {
    const result = await this.changeChannelMode(channelId, 'live');

    if (result.success) {
      // Atualizar status no banco
      await this.supabase
        .from('whapi_channels')
        .update({ status: 'active' })
        .eq('channel_id', channelId);
    }

    return result;
  }

  /**
   * Sincroniza canais da Whapi com o banco local
   */
  async syncChannelsWithDatabase(): Promise<{ synced: number; errors: string[] }> {
    const result = { synced: 0, errors: [] as string[] };

    try {
      // Listar canais da Whapi
      const listResult = await this.listChannels({ projectId: 'aic-campaigns' });

      if (!listResult.success) {
        result.errors.push(`Erro ao listar canais: ${listResult.error}`);
        return result;
      }

      for (const channel of listResult.channels) {
        // Verificar se já existe no banco
        const { data: existing } = await this.supabase
          .from('whapi_channels')
          .select('id')
          .eq('channel_id', channel.id)
          .single();

        if (!existing) {
          // Inserir novo canal
          const { error } = await this.supabase
            .from('whapi_channels')
            .insert({
              id: channel.id,
              name: channel.name,
              channel_id: channel.id,
              api_token: channel.token,
              phone_number: channel.phone,
              status: channel.status === 'live' ? 'active' : 'pending_setup',
              rate_limit_hourly: 20,
              rate_limit_daily: 120,
              notes: 'Sincronizado da Partner API'
            });

          if (error) {
            result.errors.push(`Erro ao inserir canal ${channel.id}: ${error.message}`);
          } else {
            result.synced++;
          }
        }
      }

      console.log(`[WhapiPartner] Sincronização completa: ${result.synced} canais`);

      return result;
    } catch (error: any) {
      result.errors.push(`Erro geral: ${error.message}`);
      return result;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let partnerServiceInstance: WhapiPartnerService | null = null;

export function getWhapiPartnerService(token?: string): WhapiPartnerService {
  if (!partnerServiceInstance) {
    partnerServiceInstance = new WhapiPartnerService(token);
  }
  return partnerServiceInstance;
}

export function resetWhapiPartnerService(): void {
  partnerServiceInstance = null;
}

export default WhapiPartnerService;
