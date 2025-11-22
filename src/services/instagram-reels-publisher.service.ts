import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

/**
 * 📱 Instagram Reels Publisher Service
 *
 * Publica vídeos como Instagram Reels usando Facebook Graph API
 *
 * Fluxo:
 * 1. Recebe URL pública do vídeo (Supabase Storage)
 * 2. Cria container de mídia no Instagram
 * 3. Aguarda processamento do vídeo
 * 4. Publica o Reel
 *
 * Requisitos:
 * - Vídeo MP4/MOV hospedado publicamente (Supabase Storage)
 * - Duração: máximo 90 segundos
 * - Instagram Business Account conectado via Facebook Graph API
 *
 * @see https://developers.facebook.com/docs/instagram-api/reference/ig-user/media
 */

export interface InstagramReelPublishOptions {
  videoUrl: string;              // URL pública do vídeo MP4
  caption?: string;              // Legenda do Reel (max 2200 caracteres)
  shareToFeed?: boolean;         // Aparecer no Feed + Reels (default: true)
  thumbOffset?: number;          // Timestamp (ms) para thumbnail (default: 0)
  coverUrl?: string;             // URL de imagem de capa (opcional)
  locationId?: string;           // ID de localização do Instagram (opcional)
  userTags?: Array<{            // Tags de usuários no vídeo
    username: string;
    x: number;  // 0.0 - 1.0
    y: number;  // 0.0 - 1.0
  }>;
}

export interface InstagramReelPublishResult {
  success: boolean;
  mediaId?: string;              // ID do Reel publicado
  permalink?: string;            // Link permanente do Reel
  error?: string;                // Mensagem de erro
  containerId?: string;          // ID do container (para debug)
  processingTimeMs?: number;     // Tempo de processamento
}

export class InstagramReelsPublisherService {
  private readonly INSTAGRAM_BUSINESS_ACCOUNT_ID: string;
  private readonly INSTAGRAM_ACCESS_TOKEN: string;
  private readonly GRAPH_API_VERSION = 'v21.0';
  private readonly GRAPH_API_BASE_URL: string;
  private readonly MAX_POLLING_ATTEMPTS = 60;  // 5 minutos (5s por tentativa)
  private readonly POLLING_INTERVAL_MS = 5000;  // 5 segundos
  private readonly supabase;

  constructor() {
    this.INSTAGRAM_BUSINESS_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;
    this.INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!;
    this.GRAPH_API_BASE_URL = `https://graph.facebook.com/${this.GRAPH_API_VERSION}`;

    if (!this.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
      throw new Error('❌ INSTAGRAM_BUSINESS_ACCOUNT_ID não configurado no .env');
    }

    if (!this.INSTAGRAM_ACCESS_TOKEN) {
      throw new Error('❌ INSTAGRAM_ACCESS_TOKEN não configurado no .env');
    }

    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log('✅ Instagram Reels Publisher Service initialized');
    console.log(`📱 Business Account ID: ${this.INSTAGRAM_BUSINESS_ACCOUNT_ID}`);
  }

  /**
   * Publica um vídeo como Instagram Reel
   *
   * @param options - Configurações de publicação
   * @returns Resultado da publicação
   */
  async publishReel(options: InstagramReelPublishOptions): Promise<InstagramReelPublishResult> {
    const startTime = Date.now();

    try {
      console.log('🎬 ========== INICIANDO PUBLICAÇÃO INSTAGRAM REEL ==========');
      console.log(`📹 Video URL: ${options.videoUrl}`);
      console.log(`📝 Caption: ${options.caption?.substring(0, 100)}...`);
      console.log(`📊 Share to Feed: ${options.shareToFeed !== false}`);

      // Validações básicas
      this.validateOptions(options);

      // Step 1: Criar container de mídia
      console.log('\n📦 STEP 1: Criando container de mídia...');
      const containerId = await this.createMediaContainer(options);
      console.log(`✅ Container criado: ${containerId}`);

      // Step 2: Aguardar processamento do vídeo
      console.log('\n⏳ STEP 2: Aguardando processamento do vídeo...');
      const isProcessed = await this.waitForProcessing(containerId);

      if (!isProcessed) {
        throw new Error('Timeout ao processar vídeo no Instagram (5 minutos)');
      }

      console.log('✅ Vídeo processado com sucesso');

      // Step 3: Publicar o Reel
      console.log('\n🚀 STEP 3: Publicando Reel...');
      const mediaId = await this.publishMediaContainer(containerId);
      console.log(`✅ Reel publicado: ${mediaId}`);

      // Step 4: Obter permalink
      console.log('\n🔗 STEP 4: Obtendo permalink...');
      const permalink = await this.getMediaPermalink(mediaId);
      console.log(`✅ Permalink: ${permalink}`);

      const processingTimeMs = Date.now() - startTime;

      console.log('\n🎉 ========== REEL PUBLICADO COM SUCESSO ==========');
      console.log(`⏱️  Tempo total: ${(processingTimeMs / 1000).toFixed(2)}s`);
      console.log(`🔗 Link: ${permalink}`);

      return {
        success: true,
        mediaId,
        permalink,
        containerId,
        processingTimeMs
      };

    } catch (error: any) {
      console.error('❌ Erro ao publicar Reel:', error);

      return {
        success: false,
        error: error.message || 'Erro desconhecido',
        processingTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * Valida as opções de publicação
   */
  private validateOptions(options: InstagramReelPublishOptions): void {
    if (!options.videoUrl) {
      throw new Error('videoUrl é obrigatório');
    }

    // Verificar se é URL válida
    try {
      new URL(options.videoUrl);
    } catch {
      throw new Error('videoUrl deve ser uma URL válida');
    }

    // Verificar se é URL pública (Supabase Storage)
    if (!options.videoUrl.includes('supabase') && !options.videoUrl.startsWith('http')) {
      throw new Error('videoUrl deve ser uma URL pública acessível');
    }

    // Validar tamanho da caption
    if (options.caption && options.caption.length > 2200) {
      throw new Error('Caption não pode ter mais de 2200 caracteres');
    }
  }

  /**
   * Cria um container de mídia no Instagram
   *
   * @returns Container ID
   */
  private async createMediaContainer(options: InstagramReelPublishOptions): Promise<string> {
    const params: any = {
      media_type: 'REELS',
      video_url: options.videoUrl,
      access_token: this.INSTAGRAM_ACCESS_TOKEN
    };

    // Parâmetros opcionais
    if (options.caption) {
      params.caption = options.caption;
    }

    if (options.shareToFeed !== false) {
      params.share_to_feed = true;
    }

    if (options.thumbOffset !== undefined) {
      params.thumb_offset = options.thumbOffset;
    }

    if (options.coverUrl) {
      params.cover_url = options.coverUrl;
    }

    if (options.locationId) {
      params.location_id = options.locationId;
    }

    // TODO: Implementar user tags quando necessário
    // if (options.userTags && options.userTags.length > 0) {
    //   params.user_tags = JSON.stringify(options.userTags);
    // }

    const response = await axios.post(
      `${this.GRAPH_API_BASE_URL}/${this.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`,
      null,
      { params }
    );

    if (!response.data || !response.data.id) {
      throw new Error('Falha ao criar container de mídia: resposta inválida');
    }

    return response.data.id;
  }

  /**
   * Aguarda o processamento do vídeo no Instagram
   *
   * @param containerId - ID do container
   * @returns true se processado, false se timeout
   */
  private async waitForProcessing(containerId: string): Promise<boolean> {
    for (let attempt = 0; attempt < this.MAX_POLLING_ATTEMPTS; attempt++) {
      await this.sleep(this.POLLING_INTERVAL_MS);

      const response = await axios.get(
        `${this.GRAPH_API_BASE_URL}/${containerId}`,
        {
          params: {
            fields: 'status_code,status',
            access_token: this.INSTAGRAM_ACCESS_TOKEN
          }
        }
      );

      const statusCode = response.data.status_code;
      const status = response.data.status;

      console.log(`   📊 Status: ${status} (código: ${statusCode}) - tentativa ${attempt + 1}/${this.MAX_POLLING_ATTEMPTS}`);

      // Status codes:
      // - IN_PROGRESS: Processando
      // - FINISHED: Pronto para publicar
      // - ERROR: Erro no processamento
      // - EXPIRED: Container expirado

      if (statusCode === 'FINISHED') {
        return true;
      }

      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        throw new Error(`Erro no processamento do vídeo: ${status}`);
      }
    }

    return false; // Timeout
  }

  /**
   * Publica o container de mídia processado
   *
   * @param containerId - ID do container
   * @returns Media ID do Reel publicado
   */
  private async publishMediaContainer(containerId: string): Promise<string> {
    const response = await axios.post(
      `${this.GRAPH_API_BASE_URL}/${this.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish`,
      null,
      {
        params: {
          creation_id: containerId,
          access_token: this.INSTAGRAM_ACCESS_TOKEN
        }
      }
    );

    if (!response.data || !response.data.id) {
      throw new Error('Falha ao publicar Reel: resposta inválida');
    }

    return response.data.id;
  }

  /**
   * Obtém o permalink de um Reel publicado
   *
   * @param mediaId - ID da mídia publicada
   * @returns URL permanente do Reel
   */
  private async getMediaPermalink(mediaId: string): Promise<string> {
    const response = await axios.get(
      `${this.GRAPH_API_BASE_URL}/${mediaId}`,
      {
        params: {
          fields: 'permalink',
          access_token: this.INSTAGRAM_ACCESS_TOKEN
        }
      }
    );

    return response.data.permalink || `https://www.instagram.com/p/${mediaId}`;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Testa a conexão com a API do Instagram
   */
  async testConnection(): Promise<{ success: boolean; username?: string; error?: string }> {
    try {
      const response = await axios.get(
        `${this.GRAPH_API_BASE_URL}/${this.INSTAGRAM_BUSINESS_ACCOUNT_ID}`,
        {
          params: {
            fields: 'username,name,profile_picture_url',
            access_token: this.INSTAGRAM_ACCESS_TOKEN
          }
        }
      );

      console.log('✅ Conexão Instagram OK');
      console.log(`👤 Username: ${response.data.username}`);
      console.log(`📛 Name: ${response.data.name}`);

      return {
        success: true,
        username: response.data.username
      };

    } catch (error: any) {
      console.error('❌ Erro ao testar conexão Instagram:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }
}
