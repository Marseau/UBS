import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface VideoSlide {
  slide_number: string;
  main_title: string;
  subtitle?: string;
  content: string;
  footer?: string;
}

interface VideoGenerationResult {
  video_url: string;
  duration_seconds: number;
  content_id: string;
  cost_usd: number;
}

interface BackgroundMusic {
  id: string;
  audio_id: string;
  audio_name: string;
  artist: string;
  category: string;
  trending_score: number;
}

/**
 * 🎬 Canva Video Generator Service
 *
 * Integração completa com Canva API + ElevenLabs + FFmpeg para geração de vídeos
 * Similar ao PlacidCarouselGeneratorService, mas para vídeos do Canva
 *
 * Fluxo:
 * 1. Recebe conteúdo editorial (texto por dia da semana)
 * 2. Gera script de locução baseado no conteúdo
 * 3. Chama N8N workflow para exportar vídeo do Canva
 * 4. Adiciona locução (ElevenLabs) + música de fundo
 * 5. Faz upload do vídeo final para Supabase Storage
 */
export class CanvaVideoGeneratorService {
  private readonly CANVA_DESIGN_ID: string;
  private readonly N8N_WEBHOOK_URL: string;
  private readonly LOCAL_API_URL: string;
  private readonly supabase;

  constructor() {
    this.CANVA_DESIGN_ID = process.env.CANVA_DESIGN_ID || 'DAG1QCvrgjE';
    this.N8N_WEBHOOK_URL = process.env.N8N_CANVA_WEBHOOK_URL || 'http://localhost:5678/webhook/canva-video';
    this.LOCAL_API_URL = process.env.LOCAL_API_URL || 'http://127.0.0.1:3000';

    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (!this.CANVA_DESIGN_ID) {
      console.warn('⚠️ CANVA_DESIGN_ID not set! Using default: DAG1QCvrgjE');
    }
  }

  /**
   * Gera um vídeo do Canva com locução e música de fundo
   * @param contentText - Conteúdo editorial do dia
   * @param contentId - ID do conteúdo editorial
   * @param voiceId - ID da voz ElevenLabs (default: Bruno)
   * @param musicCategory - Categoria de música (default: corporate)
   */
  async generateVideo(
    contentText: string,
    contentId: string,
    voiceId: string = 'yQtGAPI0R2jQuAXxLWk1',
    musicCategory: string = 'corporate'
  ): Promise<VideoGenerationResult> {
    console.log('🎬 ========== INICIANDO GERAÇÃO VÍDEO CANVA ==========');
    console.log(`📄 Content ID: ${contentId}`);
    console.log(`🎤 Voice ID: ${voiceId}`);
    console.log(`🎵 Music Category: ${musicCategory}`);

    // 1. Gerar script de locução baseado no conteúdo
    const voiceoverScript = this.generateVoiceoverScript(contentText);
    console.log(`📝 Script gerado (${voiceoverScript.length} caracteres)`);
    console.log(`📝 Preview: ${voiceoverScript.substring(0, 100)}...`);

    // 2. Exportar vídeo do Canva via N8N workflow
    console.log('\n📥 Exportando vídeo do Canva via N8N...');
    const canvaVideoPath = await this.exportCanvaVideoViaN8N();

    if (!canvaVideoPath) {
      throw new Error('Falha ao exportar vídeo do Canva via N8N');
    }

    console.log(`✅ Vídeo do Canva exportado: ${canvaVideoPath}`);

    // 3. Processar vídeo com locução + música
    console.log('\n🎙️ Processando vídeo com locução e música...');
    const processedVideoPath = await this.processVideoWithAudio(
      canvaVideoPath,
      voiceoverScript,
      voiceId,
      musicCategory
    );

    console.log(`✅ Vídeo processado: ${processedVideoPath}`);

    // 4. Upload para Supabase Storage
    console.log('\n☁️ Fazendo upload para Supabase Storage...');
    const videoUrl = await this.uploadToSupabase(processedVideoPath, contentId);

    console.log(`✅ Upload concluído: ${videoUrl}`);

    // 5. Cleanup de arquivos temporários
    this.cleanupTempFiles([canvaVideoPath, processedVideoPath]);

    // Custo estimado:
    // - Canva: gratuito (free tier) ou ~$0.10/vídeo
    // - ElevenLabs: ~$0.02 por 1000 caracteres
    // - Total estimado: ~$0.12/vídeo
    const estimatedCost = 0.12;

    return {
      video_url: videoUrl,
      duration_seconds: 60, // Template é 60s fixo
      content_id: contentId,
      cost_usd: estimatedCost
    };
  }

  /**
   * Gera script de locução baseado no conteúdo editorial
   */
  private generateVoiceoverScript(contentText: string): string {
    // Remove formatação Markdown/HTML e limita para ~60 segundos de fala
    // Estimativa: 150 palavras/minuto em português = 150 palavras para 60s

    const cleanText = contentText
      .replace(/#{1,6}\s/g, '') // Remove Markdown headers
      .replace(/\*\*/g, '') // Remove bold
      .replace(/\*/g, '') // Remove italic
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links
      .trim();

    // Dividir em sentenças e limitar
    const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);

    // Aproximadamente 10-12 sentenças para 60 segundos
    const maxSentences = 12;
    const selectedSentences = sentences.slice(0, maxSentences);

    let script = selectedSentences.join('. ').trim();

    // Adicionar CTA final se não houver
    if (!script.toLowerCase().includes('clique') && !script.toLowerCase().includes('acesse')) {
      script += '. Clique no link e descubra como podemos te ajudar!';
    }

    return script;
  }

  /**
   * Exporta vídeo do Canva via N8N workflow (sub-workflow)
   */
  private async exportCanvaVideoViaN8N(): Promise<string | null> {
    try {
      console.log(`📡 Chamando N8N webhook: ${this.N8N_WEBHOOK_URL}`);

      // Chamar webhook do N8N que irá:
      // 1. Criar job de export no Canva
      // 2. Fazer polling até success
      // 3. Baixar MP4
      // 4. Retornar caminho do arquivo
      const response = await axios.post(
        this.N8N_WEBHOOK_URL,
        {
          design_id: this.CANVA_DESIGN_ID,
          quality: 'horizontal_1080p'
        },
        {
          timeout: 300000 // 5 minutos timeout
        }
      );

      if (response.data && response.data.video_path) {
        return response.data.video_path;
      }

      console.warn('⚠️ N8N webhook não retornou video_path');
      return null;
    } catch (error: any) {
      console.error(`❌ Erro ao chamar N8N webhook: ${error.message}`);

      if (error.code === 'ECONNREFUSED') {
        console.error('❌ N8N não está acessível. Verifique se está rodando.');
      }

      return null;
    }
  }

  /**
   * Processa vídeo adicionando locução + música de fundo
   */
  private async processVideoWithAudio(
    videoPath: string,
    voiceoverScript: string,
    voiceId: string,
    musicCategory: string
  ): Promise<string> {
    try {
      console.log(`📡 Chamando endpoint local: ${this.LOCAL_API_URL}/api/canva-video-complete/process-from-n8n`);

      // Ler arquivo de vídeo
      const videoFile = fs.readFileSync(videoPath);

      // Criar FormData
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('video', videoFile, {
        filename: 'canva-video.mp4',
        contentType: 'video/mp4'
      });
      formData.append('voiceover_script', voiceoverScript);
      formData.append('voice_id', voiceId);
      formData.append('music_category', musicCategory);

      // Chamar endpoint local
      const response = await axios.post(
        `${this.LOCAL_API_URL}/api/canva-video-complete/process-from-n8n`,
        formData,
        {
          headers: formData.getHeaders(),
          responseType: 'arraybuffer',
          timeout: 300000 // 5 minutos timeout
        }
      );

      // Salvar vídeo processado
      const tempDir = os.tmpdir();
      const outputPath = path.join(tempDir, `processed-video-${Date.now()}.mp4`);
      fs.writeFileSync(outputPath, response.data);

      return outputPath;
    } catch (error: any) {
      console.error(`❌ Erro ao processar vídeo com áudio: ${error.message}`);
      throw error;
    }
  }

  /**
   * Faz upload do vídeo para Supabase Storage
   */
  private async uploadToSupabase(videoPath: string, contentId: string): Promise<string> {
    try {
      // Ler arquivo de vídeo
      const videoBuffer = fs.readFileSync(videoPath);

      // Upload para Supabase
      const fileName = `canva-video-${contentId}-${Date.now()}.mp4`;
      const { data, error } = await this.supabase.storage
        .from('instagram-reels')
        .upload(fileName, videoBuffer, {
          contentType: 'video/mp4',
          upsert: true
        });

      if (error) {
        throw error;
      }

      // Gerar URL pública
      const { data: publicUrlData } = this.supabase.storage
        .from('instagram-reels')
        .getPublicUrl(fileName);

      return publicUrlData.publicUrl;
    } catch (error: any) {
      console.error(`❌ Erro no upload para Supabase: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove arquivos temporários
   */
  private cleanupTempFiles(filePaths: string[]): void {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🧹 Arquivo removido: ${filePath}`);
        }
      } catch (error: any) {
        console.warn(`⚠️ Erro ao remover arquivo ${filePath}: ${error.message}`);
      }
    }
  }
}
