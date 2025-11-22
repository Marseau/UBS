import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);
const execWithLargeBuffer = (cmd: string) => execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

interface VideoGenerationResult {
  video_url: string;
  duration_seconds: number;
  content_id: string;
  cost_usd: number;
  subtitle_url?: string;
}

/**
 * 🎬 Canva Audio-Only Sync Service
 *
 * ✅ SEM RE-ENCODING DE VÍDEO - Preserva 100% das transições
 *
 * Estratégia:
 * 1. Vídeo único do Canva (67.5s) com TEXTO JÁ INCLUÍDO
 * 2. Gerar TTS para cada página
 * 3. Adicionar áudio com -c:v copy (SEM tocar no vídeo)
 * 4. Opcional: Gerar legendas .srt para acessibilidade
 *
 * VANTAGENS:
 * ✅ Zero degradação de vídeo (codec copy)
 * ✅ 100% das transições preservadas
 * ✅ TTS perfeitamente sincronizado
 * ✅ Legendas opcionais (.srt)
 */
export class CanvaAudioOnlySyncService {
  private readonly supabase;

  // ⏱️ DURAÇÕES REAIS DO CANVA EXPORTADO (em segundos)
  private readonly PAGE_DURATIONS = [
    9,    // Página 1: 9s (8.5s conteúdo + 0.5s transição)
    9,    // Página 2: 9s (8.5s conteúdo + 0.5s transição)
    9,    // Página 3: 9s (8.5s conteúdo + 0.5s transição)
    9,    // Página 4: 9s (8.5s conteúdo + 0.5s transição)
    9,    // Página 5: 9s (8.5s conteúdo + 0.5s transição)
    9,    // Página 6: 9s (8.5s conteúdo + 0.5s transição)
    9,    // Página 7: 9s (8.5s conteúdo + 0.5s transição)
    4.5   // Página 8 (CTA): 4.5s conteúdo (sem transição)
  ];
  // Total: 67.5s

  private readonly TOTAL_SEGMENTS = 8;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Gera vídeo final APENAS sincronizando áudio (sem re-encoding)
   * @param baseVideoUrl - URL do vídeo completo do Canva (67.5s) COM TEXTO JÁ INCLUÍDO
   * @param tweets - Array com 7 tweets (para TTS)
   * @param ctaText - Texto do CTA (para TTS)
   * @param contentId - ID do conteúdo editorial
   * @param generateSubtitles - Se deve gerar arquivo .srt de legendas
   */
  async generateWithAudioOnly(
    baseVideoUrl: string,
    tweets: string[],
    ctaText: string,
    contentId: string,
    generateSubtitles: boolean = true
  ): Promise<VideoGenerationResult> {
    console.log('🎬 ========== CANVA AUDIO-ONLY SYNC (ZERO RE-ENCODING) ==========');
    console.log(`📄 Content ID: ${contentId}`);
    console.log(`🎥 Vídeo base (COM TEXTO): ${baseVideoUrl.substring(0, 80)}...`);
    console.log(`🎙️  Sincronizando TTS SEM alterar vídeo`);
    console.log(`📝 Tweets: ${tweets.length} + 1 CTA`);
    console.log(`📊 Duração: 67.5s`);

    if (tweets.length !== 7) {
      throw new Error(`Esperado 7 tweets, recebido ${tweets.length}`);
    }

    const tempDir = path.join(os.tmpdir(), `canva-audio-sync-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // 1. Download do vídeo base
      console.log('\n📥 Baixando vídeo base do Canva...');
      const baseVideoPath = await this.downloadVideo(baseVideoUrl, tempDir);
      console.log(`✅ Vídeo baixado: ${baseVideoPath}`);

      // 2. Gerar TTS para todos os textos
      console.log('\n🎙️ Gerando áudios TTS...');
      const allTexts = [...tweets, ctaText];
      const audioFiles: string[] = [];

      for (let i = 0; i < allTexts.length; i++) {
        const text = allTexts[i]!;
        const segmentNumber = i + 1;
        const isOddSegment = segmentNumber % 2 === 1;

        // Alternar vozes: Carla (ímpar), Bruno (par)
        const voiceId = isOddSegment
          ? (process.env.ELEVENLABS_VOICE_ID_CARLA || 'GDzHdQOi6jjf8zaXhCYD')
          : (process.env.ELEVENLABS_VOICE_ID_BRUNO || 'onwK4e9ZLuTAKqWW03F9');

        console.log(`  🗣️  Página ${segmentNumber}: ${isOddSegment ? 'Carla (F)' : 'Bruno (M)'}`);
        console.log(`     "${text.substring(0, 60)}..."`);

        const audioPath = await this.generateTTS(text, voiceId, segmentNumber, tempDir);
        audioFiles.push(audioPath);
      }

      console.log(`✅ ${audioFiles.length} áudios TTS gerados`);

      // 3. Calcular timestamps para cada página
      console.log('\n⏱️  Calculando timestamps...');
      const timestamps = this.calculateTimestamps();

      // 4. Gerar legendas .srt (opcional)
      let subtitlePath: string | undefined;
      if (generateSubtitles) {
        console.log('\n📝 Gerando legendas .srt...');
        subtitlePath = await this.generateSubtitles(allTexts, timestamps, tempDir);
        console.log(`✅ Legendas geradas: ${subtitlePath}`);
      }

      // 5. Mixar áudios SEM re-encodar vídeo
      console.log('\n🎵 Mixando áudios (preservando vídeo original)...');
      const finalVideoPath = await this.mixAudioWithoutReencoding(
        baseVideoPath,
        audioFiles,
        timestamps,
        tempDir
      );

      console.log(`✅ Vídeo final gerado: ${finalVideoPath}`);

      // 6. Upload para Supabase
      console.log('\n☁️  Fazendo upload para Supabase...');
      const videoUrl = await this.uploadToSupabase(finalVideoPath, contentId);
      console.log(`✅ Upload concluído: ${videoUrl}`);

      let subtitleUrl: string | undefined;
      if (subtitlePath) {
        console.log('\n☁️  Fazendo upload das legendas...');
        subtitleUrl = await this.uploadToSupabase(subtitlePath, `${contentId}-subtitles`, 'text/plain');
        console.log(`✅ Legendas disponíveis: ${subtitleUrl}`);
      }

      // 7. Limpar temporários
      console.log('\n🧹 Limpando arquivos temporários...');
      fs.rmSync(tempDir, { recursive: true, force: true });

      const totalDuration = this.PAGE_DURATIONS.reduce((sum, dur) => sum + dur, 0);
      const costUsd = this.calculateCost(audioFiles.length);

      console.log('\n✅ ========== PROCESSO CONCLUÍDO ==========');
      console.log(`🎥 URL: ${videoUrl}`);
      console.log(`⏱️  Duração: ${totalDuration}s`);
      console.log(`💰 Custo estimado: $${costUsd.toFixed(2)}`);
      if (subtitleUrl) {
        console.log(`📝 Legendas: ${subtitleUrl}`);
      }

      return {
        video_url: videoUrl,
        duration_seconds: Math.round(totalDuration),
        content_id: contentId,
        cost_usd: costUsd,
        subtitle_url: subtitleUrl
      };

    } catch (error: any) {
      console.error('❌ Erro ao gerar vídeo:', error.message);
      // Limpar em caso de erro
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  /**
   * Calcular timestamps de cada página
   */
  private calculateTimestamps(): Array<{ start: number; end: number; contentStart: number; contentEnd: number }> {
    const timestamps: Array<{ start: number; end: number; contentStart: number; contentEnd: number }> = [];
    let currentTime = 0;

    for (let i = 0; i < this.TOTAL_SEGMENTS; i++) {
      const duration = this.PAGE_DURATIONS[i]!;
      const start = currentTime;
      const end = currentTime + duration;

      // Conteúdo: descontar 0.5s de transição no final (exceto última página)
      const contentStart = start;
      const contentEnd = (i < 7) ? end - 0.5 : end;

      timestamps.push({ start, end, contentStart, contentEnd });
      console.log(`  📄 Página ${i + 1}: ${start.toFixed(2)}s - ${end.toFixed(2)}s (narração: ${contentStart.toFixed(2)}s-${contentEnd.toFixed(2)}s)`);

      currentTime = end;
    }

    return timestamps;
  }

  /**
   * Mixar áudios usando -c:v copy (SEM re-encoding)
   */
  private async mixAudioWithoutReencoding(
    baseVideoPath: string,
    audioFiles: string[],
    timestamps: Array<{ start: number; end: number; contentStart: number; contentEnd: number }>,
    tempDir: string
  ): Promise<string> {
    console.log('🎙️ Sincronizando TTS com delays...');

    // Construir filter para áudio
    const audioStreams: string[] = [];

    for (let i = 0; i < audioFiles.length; i++) {
      const { start } = timestamps[i]!;
      const delayMs = Math.round(start * 1000);
      console.log(`  🎵 TTS ${i + 1}: delay ${start.toFixed(2)}s (${delayMs}ms), volume +5dB`);
      audioStreams.push(`[${i + 1}:a]volume=5dB,adelay=${delayMs}|${delayMs}[a${i}]`);
    }

    // Mix: áudio original + todos os TTS
    const audioMix = audioStreams.join('; ') +
      `; [0:a]${audioStreams.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audioFiles.length + 1}:duration=first[aout]`;

    // Inputs
    const inputs = [`-i "${baseVideoPath}"`, ...audioFiles.map(f => `-i "${f}"`)].join(' ');

    const outputPath = path.join(tempDir, 'final-video-audio-only.mp4');

    // ⚡ ZERO RE-ENCODING: -c:v copy preserva 100% do vídeo original
    const ffmpegCmd = [
      `ffmpeg ${inputs}`,
      `-filter_complex "${audioMix}"`,
      `-map 0:v`,              // Vídeo do input 0 (base)
      `-map "[aout]"`,         // Áudio mixado
      `-c:v copy`,             // ⚡ SEM RE-ENCODING! Copia stream de vídeo
      `-c:a aac -b:a 192k`,    // Apenas encode o áudio mixado
      `-movflags +faststart`,  // Otimizar para streaming
      `-y "${outputPath}"`
    ].join(' ');

    console.log('\n🔍 FFmpeg Command (Audio-Only Mix):');
    console.log('⚡ ZERO VIDEO RE-ENCODING - Preservando 100% das transições');
    console.log(ffmpegCmd.substring(0, 500) + '...');
    console.log('');

    try {
      await execWithLargeBuffer(ffmpegCmd);
      console.log('✅ Áudio sincronizado (vídeo intacto)!');
      return outputPath;
    } catch (error: any) {
      console.error('❌ Erro ao mixar áudio:', error.message);
      throw error;
    }
  }

  /**
   * Gerar arquivo .srt de legendas
   */
  private async generateSubtitles(
    texts: string[],
    timestamps: Array<{ start: number; end: number; contentStart: number; contentEnd: number }>,
    tempDir: string
  ): Promise<string> {
    const srtPath = path.join(tempDir, 'subtitles.srt');
    let srtContent = '';

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]!;
      const { contentStart, contentEnd } = timestamps[i]!;

      // Formato SRT: HH:MM:SS,mmm
      const startTime = this.formatSrtTime(contentStart);
      const endTime = this.formatSrtTime(contentEnd);

      srtContent += `${i + 1}\n`;
      srtContent += `${startTime} --> ${endTime}\n`;
      srtContent += `${text}\n\n`;
    }

    fs.writeFileSync(srtPath, srtContent, 'utf-8');
    return srtPath;
  }

  /**
   * Formatar tempo para formato SRT (HH:MM:SS,mmm)
   */
  private formatSrtTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.round((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  /**
   * Download de vídeo
   */
  private async downloadVideo(url: string, tempDir: string): Promise<string> {
    const fileName = `base-video-${Date.now()}.mp4`;
    const filePath = path.join(tempDir, fileName);

    const response = await axios.get(url, { responseType: 'stream' });
    const writer = fs.createWriteStream(filePath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(filePath));
      writer.on('error', reject);
    });
  }

  /**
   * Gerar TTS com ElevenLabs
   */
  private async generateTTS(text: string, voiceId: string, segmentNumber: number, tempDir: string): Promise<string> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY não configurada');
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const outputPath = path.join(tempDir, `tts-${segmentNumber}.mp3`);

    const response = await axios.post(
      url,
      {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    fs.writeFileSync(outputPath, response.data);
    return outputPath;
  }

  /**
   * Upload para Supabase Storage
   */
  private async uploadToSupabase(filePath: string, contentId: string, contentType: string = 'video/mp4'): Promise<string> {
    const fileName = `${contentId}-${Date.now()}${path.extname(filePath)}`;
    const fileBuffer = fs.readFileSync(filePath);

    const bucket = contentType === 'video/mp4' ? 'editorial-videos' : 'editorial-videos';

    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(fileName, fileBuffer, {
        contentType,
        upsert: false
      });

    if (error) {
      throw new Error(`Erro ao fazer upload: ${error.message}`);
    }

    const { data: urlData } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  }

  /**
   * Calcular custo estimado
   */
  private calculateCost(numAudios: number): number {
    // ElevenLabs: ~$0.18/1000 caracteres
    // Estimativa: 100 caracteres por tweet = $0.018/tweet
    return numAudios * 0.015;
  }
}
