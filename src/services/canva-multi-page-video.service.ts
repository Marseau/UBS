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
}

/**
 * 🎬 Canva Multi-Page Video Service
 *
 * Arquitetura SIMPLIFICADA - Recebe 8 vídeos prontos do Canva:
 * - Input: 8 URLs de vídeo (1 por página/tweet)
 * - Processo: Adiciona TTS em cada vídeo + Concatena
 * - Output: Vídeo final 64s
 *
 * VANTAGENS:
 * ✅ Sem cortar/dividir vídeo (evita problemas de sincronia)
 * ✅ Sem overlay de texto (Canva já tem design profissional)
 * ✅ Apenas adiciona áudio TTS
 * ✅ Mantém 100% das animações originais
 */
export class CanvaMultiPageVideoService {
  private readonly supabase;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Gera vídeo final a partir de 1 VÍDEO COMPLETO do Canva (64s)
   * NOVA ABORDAGEM SIMPLIFICADA:
   * - Recebe 1 vídeo completo (64s = 8 páginas × 8s) com transições embutidas
   * - Adiciona overlays de texto com timestamps (enable='between(t,X,Y)')
   * - Adiciona TTS com delays (adelay) para sincronizar com cada página
   *
   * @param baseVideoUrl - URL do vídeo completo 64s do Canva
   * @param tweets - Array com 7 tweets
   * @param ctaText - Texto do CTA
   * @param contentId - ID do conteúdo editorial
   * @param title - Título do reel (thread_X_title)
   */
  async generateFromPages(
    pageVideoUrls: string[],
    tweets: string[],
    ctaText: string,
    contentId: string,
    title?: string
  ): Promise<VideoGenerationResult> {
    console.log('🎬 ========== CANVA MULTI-PAGE VIDEO GENERATOR ==========');
    console.log(`📄 Content ID: ${contentId}`);
    console.log(`🎞️  Processando 8 PÁGINAS INDIVIDUAIS (sincronização perfeita)`);
    console.log(`📝 Tweets: ${tweets.length} + 1 CTA`);

    if (pageVideoUrls.length !== 8) {
      throw new Error(`Esperado 8 páginas de vídeo, recebido ${pageVideoUrls.length}`);
    }

    if (tweets.length !== 7) {
      throw new Error(`Esperado 7 tweets, recebido ${tweets.length}`);
    }

    const tempDir = path.join(os.tmpdir(), `canva-pages-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // 1. Baixar TODOS os 8 vídeos de página
      console.log('\n📥 Baixando 8 páginas de vídeo do Canva...');
      const pageVideos: string[] = [];

      for (let i = 0; i < pageVideoUrls.length; i++) {
        const pageUrl = pageVideoUrls[i]!;
        const pageNumber = i + 1;
        console.log(`  📹 Página ${pageNumber}: ${pageUrl.substring(0, 60)}...`);
        const videoPath = await this.downloadVideo(pageUrl, tempDir, `page-${pageNumber}`);
        pageVideos.push(videoPath);
      }
      console.log('✅ Todas as páginas baixadas');

      // 2. Gerar TTS para todos os textos (SEM numeração, SEM hashtag)
      console.log('\n🎙️ Gerando áudios TTS...');
      const allTexts = [...tweets, ctaText];
      const audioFiles: string[] = [];

      for (let i = 0; i < allTexts.length; i++) {
        const text = allTexts[i]!;
        const pageNumber = i + 1;
        const isOddPage = pageNumber % 2 === 1;

        const voiceId = isOddPage
          ? (process.env.ELEVENLABS_VOICE_ID_CARLA || 'GDzHdQOi6jjf8zaXhCYD')
          : (process.env.ELEVENLABS_VOICE_ID_BRUNO || '6jgYSR71sIsHEewpbat1');

        const voiceName = isOddPage ? 'Carla' : 'Bruno';

        // 🎙️ LIMPAR TEXTO PARA TTS
        let ttsText = text
          .replace(/^\d+\/\d+\s*/, '')                    // Remove "1/7 ", "2/7 "
          .replace(/#\w+/g, '')                           // Remove TODAS as hashtags
          .replace(/^[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{231A}-\u{23FF}\u{FE00}-\u{FEFF}]+\s*/gu, '') // Remove emojis
          .trim();

        console.log(`  🎤 Página ${pageNumber} (${voiceName}): ${ttsText.substring(0, 50)}...`);

        const audioPath = await this.generateVoiceover(ttsText, voiceId, tempDir, `tts-page-${pageNumber}`);
        audioFiles.push(audioPath);
      }

      // 3. Processar cada página individualmente (vídeo + texto + TTS)
      console.log('\n🎬 Processando cada página com overlay de texto + TTS...');
      const processedPages: string[] = [];

      for (let i = 0; i < pageVideos.length; i++) {
        const pageNumber = i + 1;
        const videoPath = pageVideos[i]!;
        const audioPath = audioFiles[i]!;
        const text = allTexts[i]!;
        const isFirstPage = i === 0;

        console.log(`\n📄 Processando Página ${pageNumber}...`);

        const outputPath = path.join(tempDir, `processed-page-${pageNumber}.mp4`);
        await this.addTextAndAudioToVideo(
          videoPath,
          audioPath,
          text,
          outputPath,
          isFirstPage,
          title || ''
        );

        processedPages.push(outputPath);
      }

      // 4. Concatenar todas as páginas
      console.log('\n🔗 Concatenando 8 páginas...');
      const finalVideoPath = await this.concatenateVideos(processedPages, tempDir);

      // 4. Upload para Supabase
      console.log('\n☁️ Fazendo upload para Supabase...');
      const videoUrl = await this.uploadToSupabase(finalVideoPath, contentId);

      const getVideoDuration = async (videoPath: string): Promise<number> => {
        const { stdout } = await execWithLargeBuffer(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
        );
        return parseFloat(stdout.trim());
      };

      const totalDuration = await getVideoDuration(finalVideoPath);
      const ttsCost = allTexts.length * 0.015;

      console.log(`✅ Vídeo gerado: ${videoUrl}`);
      console.log(`⏱️ Duração: ${totalDuration.toFixed(2)}s`);
      console.log(`💰 Custo TTS: $${ttsCost.toFixed(3)}`);

      this.cleanupTempFiles(tempDir);

      return {
        video_url: videoUrl,
        duration_seconds: Math.ceil(totalDuration),
        content_id: contentId,
        cost_usd: ttsCost
      };

    } catch (error: any) {
      console.error('❌ Erro ao gerar vídeo:', error);
      this.cleanupTempFiles(tempDir);
      throw error;
    }
  }

  /**
   * Cria vídeo único com overlays de texto temporais + TTS com delays DINÂMICOS
   * SINCRONIZAÇÃO BASEADA NA DURAÇÃO REAL DO TTS:
   * - 1 vídeo base
   * - Overlays de texto com timestamps baseados na duração REAL de cada TTS
   * - TTS com delays calculados dinamicamente
   */
  private async createSingleVideoWithOverlays(
    baseVideoPath: string,
    texts: string[],
    audioFiles: string[],
    audioDurations: number[], // ✅ DURAÇÕES REAIS DE CADA TTS
    tempDir: string,
    title?: string
  ): Promise<string> {
    console.log('🎨 Criando overlays temporais com SINCRONIZAÇÃO DINÂMICA...');

    const interRegularPath = '/Users/marseau/Library/Application Support/io.flutterflow.prod.mac/Inter_regular_8fba6fe30d0e768cf6ec5468e843b4834a29bf71133ca031a80e45d464472beb.ttf';
    const interBoldPath = '/Users/marseau/Library/Application Support/io.flutterflow.prod.mac/Inter_700_0ebefe6637b51f54e953af5beed98d607237c3bdcadbc39cefe3edcbec529ef7.ttf';

    // Helpers
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

    const parseTweet = (tweet: string) => {
      let cleaned = tweet.replace(/^\d+\/\d+\s*/, '').replace(/^[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{231A}-\u{23FF}\u{FE00}-\u{FEFF}]+\s*/gu, '');
      const hashtagMatch = cleaned.match(/#\w+\s*$/);
      const hashtag = hashtagMatch ? hashtagMatch[0].trim() : '';
      const content = cleaned.replace(/#\w+\s*$/, '').trim();
      return { content, hashtag };
    };

    // ✅ CALCULAR TIMESTAMPS DINÂMICOS baseados na duração REAL de cada TTS
    console.log('⏱️  Calculando timestamps dinâmicos...');
    const timestamps: Array<{ start: number; end: number }> = [];
    let currentTime = 0;

    for (let i = 0; i < audioDurations.length; i++) {
      const duration = audioDurations[i]! + 0.3; // Adiciona 0.3s de margem entre páginas
      timestamps.push({
        start: currentTime,
        end: currentTime + duration
      });
      currentTime += duration;
      console.log(`  📄 Página ${i + 1}: ${timestamps[i]!.start.toFixed(2)}s - ${timestamps[i]!.end.toFixed(2)}s (${duration.toFixed(2)}s)`);
    }

    // Construir filtros de vídeo (overlays) com timestamps DINÂMICOS
    let videoFilter = '[0:v]scale=1080:1920,format=yuv420p';
    const textFiles: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const pageNumber = i + 1;
      const { start, end } = timestamps[i]!;
      const enableCondition = `between(t,${start.toFixed(2)},${end.toFixed(2)})`;

      const { content, hashtag } = parseTweet(texts[i]!);

      // Página 1: Título
      if (i === 0 && title) {
        const wrappedTitle = wrapText(sanitize(title), 30);
        const titleFile = path.join(tempDir, `title.txt`);
        fs.writeFileSync(titleFile, wrappedTitle, 'utf8');
        textFiles.push(titleFile);
        videoFilter += `,drawtext=fontfile='${interBoldPath}':textfile='${titleFile}':fontcolor=white:fontsize=58:line_spacing=0:text_align=center:x=(w-text_w)/2:y=320:enable='${enableCondition}'`;
      }

      // Todas as páginas: Conteúdo
      if (content) {
        const wrappedContent = wrapText(sanitize(content), 40);
        const contentFile = path.join(tempDir, `content-${pageNumber}.txt`);
        fs.writeFileSync(contentFile, wrappedContent, 'utf8');
        textFiles.push(contentFile);
        videoFilter += `,drawtext=fontfile='${interRegularPath}':textfile='${contentFile}':fontcolor=white:fontsize=42:line_spacing=13:text_align=center:x=(w-text_w)/2:y=645:enable='${enableCondition}'`;
      }

      // Hashtag (se existir)
      if (hashtag) {
        videoFilter += `,drawtext=fontfile='${interRegularPath}':text='${sanitize(hashtag)}':fontcolor=0x28a745:fontsize=60:line_spacing=24:text_align=center:x=(w-text_w)/2:y=1350:enable='${enableCondition}'`;
      }
    }

    videoFilter += '[vout]';

    // Construir filtros de áudio (TTS com delays DINÂMICOS)
    console.log('🎙️ Sincronizando TTS com delays dinâmicos...');
    const audioInputs = audioFiles.map((_, i) => `-i "${audioFiles[i]}"`).join(' ');
    let audioFilter = '';

    for (let i = 0; i < audioFiles.length; i++) {
      const delayMs = Math.floor(timestamps[i]!.start * 1000); // ✅ USA TIMESTAMP DINÂMICO
      // ✅ Aumentar volume do TTS em 5dB usando volume filter
      audioFilter += `[${i + 1}:a]volume=5dB,adelay=${delayMs}|${delayMs}[a${i}];`;
      console.log(`  🎵 TTS ${i + 1}: delay ${(delayMs / 1000).toFixed(2)}s, volume +5dB`);
    }

    // Mix todos os áudios TTS + áudio do Canva
    const ttsInputs = audioFiles.map((_, i) => `[a${i}]`).join('');
    audioFilter += `[0:a]${ttsInputs}amix=inputs=${audioFiles.length + 1}:duration=first[aout]`;

    // Comando FFmpeg final
    const finalVideoPath = path.join(tempDir, 'final-video.mp4');
    const ffmpegCmd = [
      `ffmpeg -i "${baseVideoPath}" ${audioInputs}`,
      `-filter_complex "${videoFilter};${audioFilter}"`,
      `-map "[vout]" -map "[aout]"`,
      `-c:v libx264 -preset medium -crf 23`,
      `-c:a aac -b:a 192k`,
      `-y "${finalVideoPath}"`
    ].join(' ');

    console.log('🔍 FFmpeg Command (Single Video):');
    console.log(ffmpegCmd);

    await execWithLargeBuffer(ffmpegCmd);

    // Cleanup text files
    textFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));

    console.log('✅ Vídeo único gerado com overlays + TTS sincronizados!');
    return finalVideoPath;
  }

  /**
   * MÉTODO ANTIGO - Mantido para compatibilidade
   * Adiciona texto em 3 camadas + áudio TTS
   * Layout Instagram Reels (AJUSTADO):
   * - Título (apenas página 1): y=320px, fonte 58 bold branco
   * - Texto principal (todas): y=645px, fonte 42 regular branco, line_spacing=13 (AUMENTADO +10)
   * - Hashtag (se existir): y=1350px, fonte 60 regular verde #28a745
   */
  private async addTextAndAudioToVideo(
    videoPath: string,
    audioPath: string,
    text: string,
    outputPath: string,
    isFirstPage: boolean,
    title: string
  ): Promise<void> {
    // ============ PARSING ROBUSTO (copiado da produção) ============
    const parseTweetContent = (tweet: string): { content: string; hashtag: string } => {
      // 1. Remove numeração (1/7, 2/7)
      let cleaned = tweet.replace(/^\d+\/\d+\s*/, '');

      // 2. Remove emojis iniciais (regex Unicode completo)
      cleaned = cleaned.replace(/^[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{231A}-\u{23FF}\u{FE00}-\u{FEFF}]+\s*/gu, '');

      // 3. Extrai TODAS as hashtags (podem estar em qualquer posição)
      const hashtagMatches = cleaned.match(/#\w+/g);
      const hashtag = hashtagMatches ? hashtagMatches[hashtagMatches.length - 1]! : ''; // Pega a última hashtag

      // 4. Remove TODAS as hashtags do conteúdo
      const content = cleaned.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();

      return { content, hashtag };
    };

    const { content: cleanText, hashtag } = parseTweetContent(text);

    // ============ SANITIZAÇÃO ROBUSTA (copiada da produção) ============
    const sanitize = (str: string) =>
      str
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{231A}-\u{23FF}\u{FE00}-\u{FEFF}]/gu, '')
        .replace(/%/g, ' por cento')
        .replace(/'/g, '\u2019')
        .replace(/"/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // ============ WORD WRAP INTELIGENTE (copiado da produção) ============
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

    // ============ FONTES INTER (mesmas da produção) ============
    const interRegularPath = '/Users/marseau/Library/Application Support/io.flutterflow.prod.mac/Inter_regular_8fba6fe30d0e768cf6ec5468e843b4834a29bf71133ca031a80e45d464472beb.ttf';
    const interBoldPath = '/Users/marseau/Library/Application Support/io.flutterflow.prod.mac/Inter_700_0ebefe6637b51f54e953af5beed98d607237c3bdcadbc39cefe3edcbec529ef7.ttf';

    // ============ APLICAR TRATAMENTOS ============
    const sanitizedTitle = title ? sanitize(title) : '';
    const sanitizedContent = sanitize(cleanText);
    const sanitizedHashtag = hashtag ? sanitize(hashtag) : '';

    const wrappedTitle = sanitizedTitle ? wrapText(sanitizedTitle, 30) : '';
    const wrappedContent = sanitizedContent ? wrapText(sanitizedContent, 40) : '';

    console.log(`🔍 DEBUG TEXT PROCESSING - Página ${isFirstPage ? 1 : 'N'}:`);
    console.log(`  📋 Título original: "${title}"`);
    console.log(`  📋 Título wrapped: "${wrappedTitle}"`);
    console.log(`  📝 Texto original: "${text}"`);
    console.log(`  📝 Texto limpo: "${cleanText}"`);
    console.log(`  📝 Texto wrapped: "${wrappedContent}"`);
    console.log(`  #️⃣ Hashtag: "${sanitizedHashtag}"`);

    // ============ HELPER: DETECTAR DURAÇÃO DO VÍDEO ============
    const getVideoDuration = async (path: string): Promise<number> => {
      const { stdout } = await execWithLargeBuffer(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${path}"`
      );
      return parseFloat(stdout.trim());
    };

    // ============ RE-ENCODING COM MÁXIMA PRESERVAÇÃO ============
    // ⚠️ REALIDADE: Qualquer overlay de texto requer re-encoding
    // ⚠️ SOLUÇÃO: Usar CRF muito baixo + keyframe matching para preservar transições

    let pageFilter = `[0:v]`;

    // ⏱️ TIMING: Respeitar transições do Canva (0.5s entrada + 0.5s saída)
    const TRANSITION_IN = 0.5;
    const TRANSITION_OUT = 0.5;

    const videoDuration = await getVideoDuration(videoPath);
    const contentStartTime = TRANSITION_IN;
    const contentEndTime = videoDuration - TRANSITION_OUT;
    const enableCondition = `between(t,${contentStartTime.toFixed(2)},${contentEndTime.toFixed(2)})`;

    console.log(`  ⏱️  Vídeo ${videoDuration.toFixed(2)}s, texto visível ${contentStartTime.toFixed(2)}s-${contentEndTime.toFixed(2)}s`);

    // Escapar texto para FFmpeg
    const escapeForFFmpeg = (str: string) => str
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "'\\''")
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');

    // Construir overlays de texto
    let hasFilters = false;

    // TÍTULO (página 1)
    if (isFirstPage && wrappedTitle) {
      const escapedTitle = escapeForFFmpeg(wrappedTitle);
      const sep = hasFilters ? ',' : '';
      pageFilter += `${sep}drawtext=fontfile='${interBoldPath}':text='${escapedTitle}':fontcolor=white:fontsize=58:line_spacing=0:text_align=center:x=(w-text_w)/2:y=320:enable='${enableCondition}'`;
      hasFilters = true;
    }

    // CONTEÚDO (todas as páginas)
    if (wrappedContent) {
      const escapedContent = escapeForFFmpeg(wrappedContent);
      const sep = hasFilters ? ',' : '';
      pageFilter += `${sep}drawtext=fontfile='${interRegularPath}':text='${escapedContent}':fontcolor=white:fontsize=42:line_spacing=13:text_align=center:x=(w-text_w)/2:y=645:enable='${enableCondition}'`;
      hasFilters = true;
    }

    // HASHTAG
    if (sanitizedHashtag) {
      const escapedHashtag = escapeForFFmpeg(sanitizedHashtag);
      const sep = hasFilters ? ',' : '';
      pageFilter += `${sep}drawtext=fontfile='${interRegularPath}':text='${escapedHashtag}':fontcolor=0x28a745:fontsize=60:line_spacing=24:text_align=center:x=(w-text_w)/2:y=1350:enable='${enableCondition}'`;
      hasFilters = true;
    }

    pageFilter += `[v]`;

    // ============ ENCODING EQUILIBRADO: QUALIDADE vs VELOCIDADE ============
    const ffmpegCmd = [
      `ffmpeg -i "${videoPath}" -i "${audioPath}"`,
      `-filter_complex "${pageFilter}; [1:a]volume=5dB,apad[tts]; [0:a][tts]amix=inputs=2:duration=longest[a]"`,
      `-map "[v]" -map "[a]"`,
      // 🎯 CONFIGURAÇÕES BALANCEADAS:
      `-c:v libx264`,
      `-preset medium`,          // Balanceado (não muito lento)
      `-crf 18`,                 // Alta qualidade mas razoável
      `-pix_fmt yuv420p`,
      `-movflags +faststart`,
      `-c:a aac -b:a 192k`,
      `-shortest`,
      `-y "${outputPath}"`
    ].join(' ');

    console.log(`🔍 DEBUG FFmpeg Command:`);
    console.log(ffmpegCmd);
    console.log(``);

    try {
      const { stderr } = await execWithLargeBuffer(ffmpegCmd);
      if (stderr && stderr.includes('error')) {
        console.error(`⚠️ FFmpeg STDERR:`, stderr);
      }
      console.log(`✅ Página processada com sucesso`);
    } catch (error: any) {
      console.error(`❌ Erro ao adicionar texto + áudio:`, error.message);
      if (error.stderr) {
        console.error(`FFmpeg STDERR:`, error.stderr);
      }
      throw error;
    }
  }

  /**
   * Concatena múltiplos vídeos usando FFmpeg
   */
  private async concatenateVideos(videoFiles: string[], tempDir: string): Promise<string> {
    const finalVideoPath = path.join(tempDir, 'final-video.mp4');
    const concatListPath = path.join(tempDir, 'concat-list.txt');

    const concatContent = videoFiles.map(f => `file '${f}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    const concatCmd = `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${finalVideoPath}"`;

    try {
      await execWithLargeBuffer(concatCmd);
      fs.unlinkSync(concatListPath);
      return finalVideoPath;
    } catch (error: any) {
      console.error('❌ Erro ao concatenar vídeos:', error.message);
      throw error;
    }
  }

  /**
   * Download de vídeo do Canva
   */
  private async downloadVideo(
    videoUrl: string,
    tempDir: string,
    filename: string
  ): Promise<string> {
    const videoPath = path.join(tempDir, `${filename}.mp4`);

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
        console.log(`    ✅ ${fileSizeMB} MB`);
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
    filename: string
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
}
