/**
 * Video Generator Service
 *
 * Gera vídeos para Instagram Reels e YouTube com:
 * - Imagem estática de fundo (gradiente UBS)
 * - Texto animado sobreposto
 * - Narração via text-to-speech (OpenAI TTS)
 * - Música de fundo
 * - CTA para seguir redes sociais
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface VideoConfig {
  platform: 'instagram' | 'youtube';
  contentId: string;
  text: string;
  theme: string;
  duration?: number; // Instagram: 15-30s, YouTube: 60-90s
  backgroundMusicUrl?: string;
}

interface VideoResult {
  success: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  error?: string;
}

export class VideoGeneratorService {
  private tempDir = path.join(__dirname, '../../temp/videos');
  private backgroundMusicPath = path.join(__dirname, '../../assets/music/background.mp3');

  constructor() {
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Gerar vídeo para Instagram Reel (15-30s)
   */
  async generateInstagramReel(config: Omit<VideoConfig, 'platform'>): Promise<VideoResult> {
    console.log(`🎬 Generating Instagram Reel for content ${config.contentId}...`);

    return this.generateVideo({
      ...config,
      platform: 'instagram',
      duration: 25 // 25 seconds for Instagram
    });
  }

  /**
   * Gerar vídeo para YouTube (60-90s)
   */
  async generateYouTubeVideo(config: Omit<VideoConfig, 'platform'>): Promise<VideoResult> {
    console.log(`🎬 Generating YouTube video for content ${config.contentId}...`);

    return this.generateVideo({
      ...config,
      platform: 'youtube',
      duration: 75 // 75 seconds for YouTube
    });
  }

  /**
   * Método principal de geração de vídeo
   */
  private async generateVideo(config: VideoConfig): Promise<VideoResult> {
    const videoId = `${config.platform}_${config.contentId}_${Date.now()}`;
    const videoPath = path.join(this.tempDir, `${videoId}.mp4`);
    const audioPath = path.join(this.tempDir, `${videoId}_audio.mp3`);
    const thumbnailPath = path.join(this.tempDir, `${videoId}_thumb.jpg`);

    try {
      // FASE INICIAL: Vídeo sem narração (economia de custos)
      // Duração fixa baseada na plataforma
      const videoDuration = config.platform === 'instagram' ? 25 : 75;
      console.log(`🎬 Generating ${config.platform} video (${videoDuration}s) without narration`);

      // Generate video with FFmpeg (sem áudio de narração)
      console.log('🎨 Generating video with FFmpeg...');
      await this.generateVideoWithFFmpeg({
        videoPath,
        audioPath: null, // SEM narração nesta fase
        thumbnailPath,
        text: config.text,
        theme: config.theme,
        duration: videoDuration,
        backgroundMusicUrl: config.backgroundMusicUrl
      });

      // Step 5: Upload to Supabase Storage
      console.log('☁️ Uploading to Supabase Storage...');
      const videoUrl = await this.uploadToStorage(videoPath, `${config.platform}-reels`, `${videoId}.mp4`);
      const thumbnailUrl = await this.uploadToStorage(thumbnailPath, 'video-thumbnails', `${videoId}_thumb.jpg`);

      // Step 6: Update database
      await this.updateContentMediaUrls(config.contentId, config.platform, videoUrl, thumbnailUrl);

      // Cleanup temp files
      this.cleanupTempFiles([videoPath, audioPath, thumbnailPath]);

      console.log(`✅ Video generated successfully: ${videoUrl}`);

      return {
        success: true,
        videoUrl,
        thumbnailUrl,
        duration: videoDuration
      };

    } catch (error: any) {
      console.error(`❌ Error generating video:`, error);

      // Cleanup temp files on error
      this.cleanupTempFiles([videoPath, audioPath, thumbnailPath]);

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Adicionar call-to-action no final da narração
   */
  private addCallToAction(text: string, platform: 'instagram' | 'youtube'): string {
    const ctas = {
      instagram: '\n\nSe você gostou desse conteúdo, não esqueça de nos seguir no Instagram para mais dicas sobre agendamento inteligente e gestão de leads. Até a próxima!',
      youtube: '\n\nGostou do conteúdo? Inscreva-se no canal e ative o sininho para receber mais dicas sobre automação de agendamentos e captação de leads. Nos vemos no próximo vídeo!'
    };

    return text + ctas[platform];
  }

  /**
   * Gerar narração com OpenAI Text-to-Speech
   * Usa fetch direto para evitar headers de projeto que bloqueiam TTS
   */
  private async generateNarration(text: string): Promise<ArrayBuffer> {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1', // Modelo TTS padrão (testado e funcionando)
        voice: 'nova', // Professional female voice (opções: alloy, echo, fable, onyx, nova, shimmer)
        input: text,
        speed: 1.0
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS failed: ${response.status} - ${errorText}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Obter duração do áudio em segundos
   */
  private async getAudioDuration(audioPath: string): Promise<number> {
    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
    return parseFloat(stdout.trim());
  }

  /**
   * Gerar vídeo com FFmpeg (imagem + texto + música opcional)
   * FASE INICIAL: Sem narração de áudio para economia de custos
   */
  private async generateVideoWithFFmpeg(options: {
    videoPath: string;
    audioPath: string | null; // Opcional: null = sem narração
    thumbnailPath: string;
    text: string;
    theme: string;
    duration: number;
    backgroundMusicUrl?: string;
  }): Promise<void> {
    const { videoPath, audioPath, thumbnailPath, text, duration, backgroundMusicUrl } = options;

    // Create gradient background image
    const bgImagePath = path.join(this.tempDir, `bg_${Date.now()}.png`);
    await this.createGradientBackground(bgImagePath);

    // Prepare text overlay (first 150 chars for display)
    const displayText = text.substring(0, 150).replace(/'/g, "\\'");

    // FFmpeg command: Vídeo SEM narração, apenas com música de fundo opcional
    let ffmpegCommand = `ffmpeg -y -loop 1 -i "${bgImagePath}"`;

    // Add background music if provided
    const hasMusicFile = backgroundMusicUrl && fs.existsSync(this.backgroundMusicPath);
    if (hasMusicFile) {
      ffmpegCommand += ` -i "${this.backgroundMusicPath}"`;
    }

    ffmpegCommand += ` -filter_complex "`;

    // Text overlay with fade-in animation
    ffmpegCommand += `[0:v]drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='${displayText}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(lt(t,1),t,1)',format=yuv420p[v]`;

    // Audio handling
    if (hasMusicFile) {
      // Apenas música de fundo (sem narração)
      ffmpegCommand += `;[1:a]volume=0.2,afade=t=in:st=0:d=2,afade=t=out:st=${duration - 2}:d=2[a]"`;
      ffmpegCommand += ` -map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k`;
    } else {
      // Sem áudio (vídeo mudo)
      ffmpegCommand += `" -map "[v]" -c:v libx264 -preset fast -crf 23`;
    }

    ffmpegCommand += ` -t ${duration} "${videoPath}"`;

    console.log('🎬 FFmpeg command:', ffmpegCommand.substring(0, 200) + '...');
    await execAsync(ffmpegCommand);

    // Generate thumbnail (frame at 1s)
    await execAsync(`ffmpeg -y -i "${videoPath}" -ss 00:00:01 -vframes 1 "${thumbnailPath}"`);

    // Cleanup background image
    fs.unlinkSync(bgImagePath);
  }

  /**
   * Criar imagem de fundo com gradiente UBS
   */
  private async createGradientBackground(outputPath: string): Promise<void> {
    // Gradient from #2D5A9B (RGB: 45,90,155) to #4A7BC8 (RGB: 74,123,200) - UBS blue gradient
    // Usando geq com valores RGB decimais
    const command = `ffmpeg -y -f lavfi -i color=c=#2D5A9B:s=1080x1920:d=1 -vf "geq=r='45+29*(Y/H)':g='90+33*(Y/H)':b='155+45*(Y/H)'" -frames:v 1 "${outputPath}"`;
    await execAsync(command);
  }

  /**
   * Upload arquivo para Supabase Storage
   */
  private async uploadToStorage(filePath: string, bucket: string, fileName: string): Promise<string> {
    const fileBuffer = fs.readFileSync(filePath);
    const contentType = fileName.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, fileBuffer, {
        contentType,
        upsert: true
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    const { data: publicUrl } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return publicUrl.publicUrl;
  }

  /**
   * Atualizar URLs de mídia no banco de dados
   */
  private async updateContentMediaUrls(
    contentId: string,
    platform: 'instagram' | 'youtube',
    videoUrl: string,
    thumbnailUrl: string
  ): Promise<void> {
    const updateData = platform === 'instagram'
      ? {
          instagram_reel_url: videoUrl,
          instagram_thumbnail_url: thumbnailUrl,
          media_generated_at: new Date().toISOString(),
          media_generation_status: 'completed'
        }
      : {
          youtube_video_url: videoUrl,
          youtube_thumbnail_url: thumbnailUrl,
          media_generated_at: new Date().toISOString(),
          media_generation_status: 'completed'
        };

    const { error } = await supabase
      .from('editorial_content')
      .update(updateData)
      .eq('id', contentId);

    if (error) {
      throw new Error(`Database update failed: ${error.message}`);
    }
  }

  /**
   * Limpar arquivos temporários
   */
  private cleanupTempFiles(files: string[]): void {
    files.forEach(file => {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch (err) {
          console.warn(`⚠️ Failed to delete temp file: ${file}`);
        }
      }
    });
  }
}

export default VideoGeneratorService;
