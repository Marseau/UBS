import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);
const execWithLargeBuffer = (cmd: string) => execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

// 🎨 Configuração do estilo de caixa com gradiente
const BOX_STYLE = {
  gradientTop: '#a5acb9',    // Cinza claro
  gradientBottom: '#303643', // Cinza escuro
  borderRadius: 20,          // Bordas arredondadas
  paddingX: 40,
  paddingY: 20
};

interface VideoGenerationResult {
  video_url: string;
  duration_seconds: number;
  content_id: string;
  cost_usd: number;
}

/**
 * 🎬 Canva Animated Video Generator
 *
 * Arquitetura simplificada:
 * - Input: 1 vídeo MP4 do Canva (64s = 8 segmentos × 8s) com música + animações
 * - Processo: Overlay de texto animado + TTS em cada segmento de 8s
 * - Output: Vídeo final com 7 tweets + 1 CTA
 */
export class CanvaAnimatedVideoGeneratorService {
  private readonly supabase;

  // ⏱️ DURAÇÕES REAIS DO CANVA EXPORTADO (em segundos)
  // Canva configurado: 7×9s + 6.5s = 69.5s
  // CTA aumentado em 2s para dar tempo de leitura
  private readonly PAGE_DURATIONS = [
    9,    // Página 1: 9s (8.5s conteúdo + 0.5s transição)
    9,    // Página 2: 9s (8.5s conteúdo + 0.5s transição)
    9,    // Página 3: 9s (8.5s conteúdo + 0.5s transição)
    9,    // Página 4: 9s (8.5s conteúdo + 0.5s transição)
    9,    // Página 5: 9s (8.5s conteúdo + 0.5s transição)
    9,    // Página 6: 9s (8.5s conteúdo + 0.5s transição)
    9,    // Página 7: 9s (8.5s conteúdo + 0.5s transição)
    6.5   // Página 8 (CTA): 6.5s conteúdo (aumentado +2s)
  ];
  // Total: 7×9s + 6.5s = 69.5s ✅

  private readonly TRANSITION_DURATION = 0.5; // Transição no final de cada página (exceto última)
  private readonly TOTAL_SEGMENTS = 8;        // 7 tweets + 1 CTA

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Gera vídeo a partir do template Canva animado
   * @param baseVideoUrl - URL do MP4 Canva (já com música + animações)
   * @param tweets - Array com 7 tweets
   * @param ctaText - Texto do CTA final
   * @param contentId - ID do conteúdo editorial
   */
  async generateAnimatedVideo(
    baseVideoUrl: string,
    tweets: string[],
    ctaText: string,
    contentId: string,
    threadTitle?: string
  ): Promise<VideoGenerationResult> {
    const totalDuration = this.PAGE_DURATIONS.reduce((sum, dur) => sum + dur, 0);

    console.log('🎬 ========== CANVA SINGLE VIDEO GENERATOR (COM TRANSIÇÕES) ==========');
    console.log(`📄 Content ID: ${contentId}`);
    console.log(`🎞️  Usando 1 VÍDEO ÚNICO (preserva transições do Canva)`);
    console.log(`⏱️  Duração: ${totalDuration}s (${this.PAGE_DURATIONS.join('s + ')}s)`);
    console.log(`📝 Tweets: ${tweets.length} + 1 CTA`);
    console.log(`🎥 Vídeo base: ${baseVideoUrl.substring(0, 80)}...`);

    if (tweets.length !== 7) {
      throw new Error(`Esperado 7 tweets, recebido ${tweets.length}`);
    }

    const tempDir = path.join(os.tmpdir(), `canva-animated-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // 1. Download do vídeo base do Canva
      console.log('\n📥 Baixando vídeo base do Canva...');
      const baseVideoPath = await this.downloadVideo(baseVideoUrl, tempDir);
      console.log(`✅ Vídeo baixado: ${baseVideoPath}`);

      // 2. Gerar TTS para todos os textos
      console.log('\n🎙️ Gerando áudios TTS...');
      const allTexts = [...tweets, ctaText];
      const audioFiles: string[] = [];

      const sanitizeForTts = (text: string, isTweet: boolean): string => {
        if (!isTweet) return text;

        return text
          .replace(/^\d+\/\d+\s*/, '') // remove "1/7 "
          .replace(/^[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{231A}-\u{23FF}\u{FE00}-\u{FEFF}]+\s*/gu, '') // emojis no início
          .replace(/#[\w\u00C0-\u00FF]+/g, '') // remove TODAS hashtags (incluindo acentuadas)
          .replace(/\s+/g, ' ') // normaliza espaços extras
          .trim();
      };

      for (let i = 0; i < allTexts.length; i++) {
        const originalText = allTexts[i]!;
        const isTweet = i < tweets.length;
        const text = sanitizeForTts(originalText, isTweet);
        const segmentNumber = i + 1;
        const isOddSegment = segmentNumber % 2 === 1;

        // Alternar vozes: Carla (ímpar), Bruno (par)
        const voiceId = isOddSegment
          ? (process.env.ELEVENLABS_VOICE_ID_CARLA || 'GDzHdQOi6jjf8zaXhCYD')
          : (process.env.ELEVENLABS_VOICE_ID_BRUNO || '6jgYSR71sIsHEewpbat1');

        const voiceName = isOddSegment ? 'Carla' : 'Bruno';

        console.log(`  🎤 Segmento ${segmentNumber} (${voiceName}): ${text.substring(0, 40)}...`);

        const speechSpeed = 1.0; // Velocidade igual para ambos os locutores

        const audioPath = await this.generateVoiceover(
          text,
          voiceId,
          tempDir,
          `segment-${segmentNumber}`,
          speechSpeed
        );

        audioFiles.push(audioPath);
        console.log(`    ✅ ${voiceName} - ${audioPath}`);
      }

      // 3. Criar vídeo final com overlays de texto + TTS
      console.log('\n🎬 Criando vídeo final com overlays animados...');
      const finalVideoPath = await this.createVideoWithAnimatedText(
        baseVideoPath,
        allTexts,
        audioFiles,
        tempDir,
        threadTitle
      );

      // 4. Upload para Supabase
      console.log('\n☁️ Fazendo upload para Supabase...');
      const videoUrl = await this.uploadToSupabase(finalVideoPath, contentId);

      // Calcular duração total (soma das durações de cada página)
      const totalDuration = this.PAGE_DURATIONS.reduce((sum, dur) => sum + dur, 0);
      const ttsCost = allTexts.length * 0.015; // $0.015 por TTS

      console.log(`✅ Vídeo gerado: ${videoUrl}`);
      console.log(`⏱️ Duração: ${totalDuration}s`);
      console.log(`💰 Custo TTS: $${ttsCost.toFixed(3)}`);

      this.cleanupTempFiles(tempDir);

      return {
        video_url: videoUrl,
        duration_seconds: totalDuration,
        content_id: contentId,
        cost_usd: ttsCost
      };

    } catch (error: any) {
      console.error('❌ Erro ao gerar vídeo animado:', error);
      this.cleanupTempFiles(tempDir);
      throw error;
    }
  }

  /**
   * Cria vídeo final com overlays temporais (SEM cortar o vídeo)
   */
  private async createVideoWithAnimatedText(
    baseVideoPath: string,
    texts: string[],
    audioFiles: string[],
    tempDir: string,
    threadTitle?: string
  ): Promise<string> {
    console.log('🎨 Criando overlays temporais (preservando transições)...');
    console.log('⏱️  Calculando timestamps dinâmicos...');

    // Calcular timestamps cumulativos
    const timestamps: { start: number; end: number; contentStart: number; contentEnd: number }[] = [];
    let currentTime = 0;

    for (let i = 0; i < this.TOTAL_SEGMENTS; i++) {
      const duration = this.PAGE_DURATIONS[i]!;
      const start = currentTime;
      const end = currentTime + duration;

      // Calcular tempo de exibição do conteúdo (descontando transição no final)
      // A transição está SEMPRE no final da página (0.5s), exceto última página
      const contentStart = start;
      const contentEnd = (i < 7) ? end - this.TRANSITION_DURATION : end;

      timestamps.push({ start, end, contentStart, contentEnd });
      console.log(`  📄 Página ${i + 1}: ${start.toFixed(2)}s - ${end.toFixed(2)}s (conteúdo: ${contentStart.toFixed(2)}s-${contentEnd.toFixed(2)}s)`);

      currentTime = end;
    }

    const totalDuration = currentTime;
    console.log(`\n📊 Duração total: ${totalDuration.toFixed(2)}s`);

    // Criar overlays de texto temporais para TODAS as páginas
    const finalVideoPath = path.join(tempDir, 'final-video.mp4');
    await this.applyTemporalOverlays(
      baseVideoPath,
      texts,
      audioFiles,
      timestamps,
      finalVideoPath,
      threadTitle
    );

    return finalVideoPath;
  }

  /**
   * Aplica texto animado + TTS em um segmento
   */
  private async applyAnimatedTextOverlay(
    inputVideoPath: string,
    text: string,
    audioPath: string,
    outputPath: string
  ): Promise<string> {
    // Escapar texto para FFmpeg
    const escapedText = text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');

    // Texto animado: fade in (0-0.5s) + stay (0.5-7.5s) + fade out (7.5-8s)
    const textFilter = [
      `drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf`,
      `text='${escapedText}'`,
      `fontsize=60`,
      `fontcolor=white`,
      `box=1`,
      `boxcolor=black@0.7`,
      `boxborderw=20`,
      `x=(w-text_w)/2`,
      `y=(h-text_h)/2`,
      // Animação fade in/out
      `alpha='if(lt(t,0.5),t/0.5,if(gt(t,7.5),(8-t)/0.5,1))'`
    ].join(':');

    const ffmpegCmd = [
      `ffmpeg -i "${inputVideoPath}" -i "${audioPath}"`,
      `-filter_complex "[0:v]${textFilter}[v]; [0:a][1:a]amix=inputs=2:duration=first[a]"`,
      `-map "[v]" -map "[a]"`,
      `-c:v libx264 -preset fast -crf 23`,
      `-c:a aac -b:a 192k`,
      `-shortest`,
      `"${outputPath}"`
    ].join(' ');

    try {
      await execWithLargeBuffer(ffmpegCmd);
      return outputPath;
    } catch (error: any) {
      console.error(`❌ Erro ao aplicar overlay no segmento:`, error.message);
      throw error;
    }
  }

  /**
   * Aplica overlays temporais no vídeo único (SEM cortá-lo)
   * USA FORMATAÇÃO IDÊNTICA À PRODUÇÃO (MultiPageReelGenerator)
   */
  private async applyTemporalOverlays(
    baseVideoPath: string,
    texts: string[],
    audioFiles: string[],
    timestamps: { start: number; end: number; contentStart: number; contentEnd: number }[],
    outputPath: string,
    threadTitle?: string
  ): Promise<string> {
    console.log('🎙️ Sincronizando TTS com delays dinâmicos...');

    const tempDir = path.dirname(outputPath);

    // Fontes Inter (MESMAS DA PRODUÇÃO)
    const interRegularPath = '/Users/marseau/Library/Application Support/io.flutterflow.prod.mac/Inter_regular_8fba6fe30d0e768cf6ec5468e843b4834a29bf71133ca031a80e45d464472beb.ttf';
    const interBoldPath = '/Users/marseau/Library/Application Support/io.flutterflow.prod.mac/Inter_700_0ebefe6637b51f54e953af5beed98d607237c3bdcadbc39cefe3edcbec529ef7.ttf';

    // Helper functions (COPIADAS DA PRODUÇÃO)
    const sanitize = (str: string) =>
      str
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{231A}-\u{23FF}\u{FE00}-\u{FEFF}]/gu, '')
        .replace(/%/g, ' por cento')
        .replace(/'/g, '\u2019')
        .replace(/"/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const wrapText = (text: string, maxChars: number): string => {
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        if ((currentLine + ' ' + word).length > maxChars && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = currentLine ? currentLine + ' ' + word : word;
        }
      }

      if (currentLine) lines.push(currentLine);
      return lines.join('\n');
    };

    const parseTweetContent = (tweet: string): { content: string; hashtag: string } => {
      let cleaned = tweet.replace(/^\d+\/\d+\s*/, '');
      cleaned = cleaned.replace(/^[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{231A}-\u{23FF}\u{FE00}-\u{FEFF}]+\s*/gu, '');

      // 🔍 EXTRAÇÃO ROBUSTA: Busca hashtag em QUALQUER posição (prioriza última)
      const allHashtags = cleaned.match(/#[\w\u00C0-\u00FF]+/g); // Inclui acentos
      const hashtag = allHashtags && allHashtags.length > 0
        ? allHashtags[allHashtags.length - 1]!.trim() // Pega a última hashtag
        : '';

      // Remove TODAS as hashtags do conteúdo
      const content = cleaned.replace(/#[\w\u00C0-\u00FF]+/g, '').trim();

      return { content, hashtag };
    };

    const sanitizedThreadTitle = threadTitle ? sanitize(threadTitle) : '';
    const wrappedThreadTitle = sanitizedThreadTitle ? wrapText(sanitizedThreadTitle, 30) : '';

    // Construir filter_complex com overlays temporais
    let videoFilter = '[0:v]scale=1080:1920,format=yuv420p';

    // Adicionar drawtext para cada página com enable temporal
    for (let i = 0; i < this.TOTAL_SEGMENTS; i++) {
      const text = texts[i]!;
      const { contentStart, contentEnd } = timestamps[i]!;
      const enableCondition = `between(t,${contentStart.toFixed(2)},${contentEnd.toFixed(2)})`;

      // Parse do tweet (exceto CTA que é página 8)
      if (i < 7) {
        const { content, hashtag } = parseTweetContent(text);

        if (i === 0 && wrappedThreadTitle) {
          const titleFilePath = path.join(tempDir, 'overlay-thread-title.txt');
          fs.writeFileSync(titleFilePath, wrappedThreadTitle, 'utf8');
          // 🎨 TÍTULO SEM FUNDO (transparente)
          videoFilter += `,drawtext=fontfile='${interBoldPath}':textfile='${titleFilePath}':fontcolor=white:fontsize=58:line_spacing=0:text_align=center:x=(w-text_w)/2:y=320:enable='${enableCondition}'`;
          console.log(`  📋 Título da thread: "${sanitizedThreadTitle}" [TRANSPARENTE]`);
        }

        // Conteúdo principal
        if (content && content.trim().length > 0) {
          const sanitizedContent = sanitize(content);
          const wrappedContent = wrapText(sanitizedContent, 40);

          if (wrappedContent.length > 0) {
            const textFilePath = path.join(tempDir, `overlay-page-${i + 1}-content.txt`);
            fs.writeFileSync(textFilePath, wrappedContent, 'utf8');

            // 🎨 CONTEÚDO SEM FUNDO (transparente)
            videoFilter += `,drawtext=fontfile='${interRegularPath}':textfile='${textFilePath}':fontcolor=white:fontsize=37:line_spacing=13:text_align=center:x=(w-text_w)/2:y=645:enable='${enableCondition}'`;

            console.log(`  📝 Página ${i + 1}: "${content.substring(0, 40)}..." [TRANSPARENTE]`);
          }
        }

        // Hashtag (se existir)
        if (hashtag) {
          const sanitizedHashtag = sanitize(hashtag);
          videoFilter += `,drawtext=fontfile='${interRegularPath}':text='${sanitizedHashtag}':fontcolor=0x28a745:fontsize=60:line_spacing=24:text_align=center:x=(w-text_w)/2:y=1350:enable='${enableCondition}'`;
          console.log(`  🏷️ Hashtag: ${sanitizedHashtag}`);
        }
      } else {
        // CTA (página 8) - mesmo tamanho do título com caixa
        const sanitizedCta = sanitize(text);
        const wrappedCta = wrapText(sanitizedCta, 30); // Mesmo wrap do título
        const ctaFilePath = path.join(tempDir, `overlay-cta.txt`);
        fs.writeFileSync(ctaFilePath, wrappedCta, 'utf8');

        // 🎨 CTA SEM FUNDO (transparente) - Mesmo tamanho do título (fontsize=58)
        videoFilter += `,drawtext=fontfile='${interBoldPath}':textfile='${ctaFilePath}':fontcolor=white:fontsize=58:line_spacing=0:text_align=center:x=(w-text_w)/2:y=800:enable='${enableCondition}'`;
        console.log(`  🎯 CTA: "${text}" [TRANSPARENTE, TAMANHO TÍTULO]`);
      }
    }

    videoFilter += '[vout]';

    // Construir mix de áudio com delays
    const audioStreams: string[] = [];
    const ctaIndex = this.TOTAL_SEGMENTS - 1;
    const ctaTiming = timestamps[ctaIndex]!;
    for (let i = 0; i < audioFiles.length; i++) {
      const { start } = timestamps[i]!;
      const delayMs = Math.round(start * 1000);
      const segmentNumber = i + 1;
      const isOddSegment = segmentNumber % 2 === 1;
      const isCta = i === ctaIndex;

      // 🔊 VOZ FEMININA (Carla - ímpar) +7dB | VOZ MASCULINA (Bruno - par) = +5dB
      // CTA: Volume reduzido em 20% = +4dB (estava muito alto)
      let volumeDb: string;
      if (isCta) {
        volumeDb = '4dB'; // CTA -20% volume
      } else if (isOddSegment) {
        volumeDb = '7dB'; // Carla
      } else {
        volumeDb = '5dB'; // Bruno
      }

      const voiceName = isOddSegment ? 'Carla' : 'Bruno';
      const volumeNote = isCta ? ' [CTA -20%]' : '';
      console.log(`  🎵 TTS ${segmentNumber} (${voiceName}): delay ${start.toFixed(2)}s, volume +${volumeDb}${volumeNote}`);
      const ttsFilters: string[] = [];
      if (isCta) {
        ttsFilters.push('highpass=f=120', 'lowpass=f=6500');
      }
      ttsFilters.push(`volume=${volumeDb}`);
      ttsFilters.push(`adelay=${delayMs}|${delayMs}`);
      audioStreams.push(`[${i + 1}:a]${ttsFilters.join(',')}[a${i}]`);
    }

    const duckedBaseLabel = '[baseAudio]';
    const duckingFilter = `[0:a]volume='if(between(t,${ctaTiming.start.toFixed(2)},${ctaTiming.end.toFixed(2)}),0.35,1.0)'${duckedBaseLabel}`;

    const audioMix =
      `${audioStreams.join('; ')}; ${duckingFilter}; ${duckedBaseLabel}` +
      `${audioStreams.map((_, i) => `[a${i}]`).join('')}` +
      `amix=inputs=${audioFiles.length + 1}:duration=first[aout]`;

    // Construir comando FFmpeg
    const inputs = [`-i "${baseVideoPath}"`, ...audioFiles.map(f => `-i "${f}"`)].join(' ');

    const ffmpegCmd = [
      `ffmpeg ${inputs}`,
      `-filter_complex "${videoFilter}; ${audioMix}"`,
      `-map "[vout]" -map "[aout]"`,
      `-c:v libx264 -preset medium -crf 18`,
      `-c:a aac -b:a 192k`,
      `-y "${outputPath}"`
    ].join(' ');

    console.log(`\n🔍 FFmpeg Command (Single Video com formatação produção):`);
    console.log(ffmpegCmd.substring(0, 500) + '...');
    console.log('');

    try {
      await execWithLargeBuffer(ffmpegCmd);
      console.log('✅ Vídeo único gerado com overlays + TTS sincronizados + formatação produção!');
      return outputPath;
    } catch (error: any) {
      console.error(`❌ Erro ao aplicar overlays temporais:`, error.message);
      if (error.stderr) {
        console.error('FFmpeg STDERR:', error.stderr);
      }
      throw error;
    }
  }

  /**
   * Concatena múltiplos vídeos usando FFmpeg
   */
  private async concatenateVideos(videoFiles: string[], outputPath: string): Promise<void> {
    const concatListPath = path.join(path.dirname(outputPath), 'concat-list.txt');
    const concatContent = videoFiles.map(f => `file '${f}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    const concatCmd = `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`;

    try {
      await execWithLargeBuffer(concatCmd);
      fs.unlinkSync(concatListPath);
    } catch (error: any) {
      console.error('❌ Erro ao concatenar vídeos:', error.message);
      throw error;
    }
  }

  /**
   * Download do vídeo do Canva
   */
  private async downloadVideo(videoUrl: string, tempDir: string): Promise<string> {
    const videoPath = path.join(tempDir, 'canva-base.mp4');

    const response = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(videoPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        const fileSizeMB = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(2);
        console.log(`  ✅ Baixado: ${fileSizeMB} MB`);
        resolve(videoPath);
      });
      writer.on('error', reject);
    });
  }

  /**
   * Gera voiceover via ElevenLabs
   */
  private async generateVoiceover(
    text: string,
    voiceId: string,
    tempDir: string,
    filename: string,
    speed: number = 1.0
  ): Promise<string> {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY não configurada');
    }

    const audioPath = path.join(tempDir, `${filename}.mp3`);

    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
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

      fs.writeFileSync(audioPath, response.data);

      if (speed !== 1.0) {
        const spedPath = path.join(tempDir, `${filename}-speed.mp3`);
        await execWithLargeBuffer(
          `ffmpeg -i "${audioPath}" -filter:a "atempo=${speed}" -y "${spedPath}"`
        );
        fs.unlinkSync(audioPath);
        fs.renameSync(spedPath, audioPath);
      }

      return audioPath;

    } catch (error: any) {
      console.error('❌ Erro ao gerar TTS:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Upload do vídeo para Supabase Storage
   */
  private async uploadToSupabase(videoPath: string, contentId: string): Promise<string> {
    const videoBuffer = fs.readFileSync(videoPath);
    const fileName = `${contentId}-${Date.now()}.mp4`;

    const { data, error } = await this.supabase.storage
      .from('editorial-videos')
      .upload(fileName, videoBuffer, {
        contentType: 'video/mp4',
        upsert: false
      });

    if (error) {
      throw new Error(`Erro no upload: ${error.message}`);
    }

    const { data: { publicUrl } } = this.supabase.storage
      .from('editorial-videos')
      .getPublicUrl(data.path);

    return publicUrl;
  }

  /**
   * Limpa arquivos temporários
   */
  private cleanupTempFiles(tempDir: string): void {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log('🧹 Arquivos temporários removidos');
      }
    } catch (error: any) {
      console.warn('⚠️ Erro ao limpar arquivos temporários:', error.message);
    }
  }

  /**
   * 🎨 Gera caixa PNG com gradiente e bordas arredondadas usando ImageMagick
   * @param width - Largura da caixa
   * @param height - Altura da caixa
   * @param outputPath - Caminho do arquivo PNG
   */
  private async generateGradientBox(
    width: number,
    height: number,
    outputPath: string
  ): Promise<string> {
    const { gradientTop, gradientBottom, borderRadius } = BOX_STYLE;

    // Comando ImageMagick para criar gradiente com bordas arredondadas
    const magickCmd = [
      `convert -size ${width}x${height}`,
      `gradient:'${gradientTop}'-'${gradientBottom}'`,
      `-alpha set`,
      `\\( +clone -alpha extract`,
      `-draw "fill black polygon 0,0 0,${borderRadius} ${borderRadius},0 fill white circle ${borderRadius},${borderRadius} ${borderRadius},0"`,
      `\\( +clone -flip \\) -compose Multiply -composite`,
      `\\( +clone -flop \\) -compose Multiply -composite`,
      `\\) -alpha off -compose CopyOpacity -composite`,
      `"${outputPath}"`
    ].join(' ');

    try {
      await execWithLargeBuffer(magickCmd);
      return outputPath;
    } catch (error: any) {
      console.warn(`⚠️ ImageMagick falhou, usando fallback sólido: ${error.message}`);
      // Fallback: criar caixa sólida simples se ImageMagick falhar
      const fallbackCmd = `convert -size ${width}x${height} xc:'${gradientBottom}' "${outputPath}"`;
      await execWithLargeBuffer(fallbackCmd);
      return outputPath;
    }
  }

  /**
   * 📏 Calcula dimensões da caixa baseado no texto
   * @param text - Texto a ser exibido
   * @param fontSize - Tamanho da fonte
   * @param maxWidth - Largura máxima permitida
   */
  private calculateBoxDimensions(
    text: string,
    fontSize: number,
    maxWidth: number = 900
  ): { width: number; height: number } {
    const lines = text.split('\n');
    const maxLineLength = Math.max(...lines.map(l => l.length));

    // Estimativa: ~0.6 do fontSize por caractere
    const textWidth = Math.min(maxLineLength * fontSize * 0.6, maxWidth);
    const textHeight = lines.length * (fontSize * 1.3); // 1.3 para line spacing

    const width = Math.ceil(textWidth + BOX_STYLE.paddingX * 2);
    const height = Math.ceil(textHeight + BOX_STYLE.paddingY * 2);

    return { width, height };
  }
}
