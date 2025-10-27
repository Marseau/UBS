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

interface PageAudio {
  audioPath: string;
  text: string;
  duration: number;
}

export class MultiPageReelGeneratorService {
  private readonly supabase;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  async generateMultiPageVideo(
    tweets: string[],
    contentId: string,
    mainPngBinary: string | Buffer,
    mainDesignId: string,
    mainDesignName: string,
    ctaPngBinary: string | Buffer,
    ctaDesignId: string,
    ctaDesignName: string,
    voiceId: string = 'GDzHdQOi6jjf8zaXhCYD',
    musicCategory: string = 'corporate',
    _voiceIdBruno?: string,
    threadTitle?: string
  ): Promise<VideoGenerationResult> {
    console.log('🎬 ========== MULTI-PAGE REEL GENERATOR ==========');
    console.log(`📄 Content ID: ${contentId}`);
    console.log(`📝 Total de páginas: ${tweets.length} tweets + 1 CTA`);
    console.log(`📋 Título: ${threadTitle || 'N/A'}`);

    const tempDir = path.join(os.tmpdir(), `multi-page-reel-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const mainPngPath = await this.savePng(mainPngBinary, tempDir, 'main-template.png');
      const ctaPngPath = await this.savePng(ctaPngBinary, tempDir, 'cta-template.png');

      console.log('\n🎙️ Gerando áudios...');
      const pageAudios: PageAudio[] = [];

      for (let i = 0; i < tweets.length; i++) {
        const tweet = tweets[i]!;
        const { content } = this.parseTweetContent(tweet);
        const pageNumber = i + 1;
        const isOddPage = pageNumber % 2 === 1;

        const currentVoiceId = isOddPage
          ? (process.env.ELEVENLABS_VOICE_ID_CARLA || 'GDzHdQOi6jjf8zaXhCYD')
          : (process.env.ELEVENLABS_VOICE_ID_BRUNO || '6jgYSR71sIsHEewpbat1');

        const voiceName = isOddPage ? 'Carla' : 'Bruno';
        const speed = isOddPage ? 1.25 : 1.0;

        console.log(`  🎤 Página ${pageNumber} (${voiceName}): ${content.substring(0, 40)}...`);

        const audioPath = await this.generateVoiceover(
          content,
          currentVoiceId,
          tempDir,
          `page-${pageNumber}`,
          speed
        );

        const duration = await this.getAudioDuration(audioPath);
        pageAudios.push({ audioPath, text: tweet, duration });
        console.log(`    ✅ ${voiceName} - ${duration.toFixed(1)}s`);
      }

      const ctaScript = 'Acesse nosso site e transforme seu negócio!';
      const ctaAudioPath = await this.generateVoiceover(
        ctaScript,
        process.env.ELEVENLABS_VOICE_ID_BRUNO || '6jgYSR71sIsHEewpbat1',
        tempDir,
        'cta',
        1.0
      );
      const ctaDuration = await this.getAudioDuration(ctaAudioPath);
      console.log(`🎯 CTA: ${ctaDuration.toFixed(1)}s`);

      const musicPath = await this.downloadBackgroundMusic(musicCategory, tempDir);

      const finalVideoPath = await this.createVideoAllAtOnce(
        mainPngPath,
        ctaPngPath,
        pageAudios,
        ctaAudioPath,
        ctaDuration,
        musicPath,
        tempDir,
        threadTitle
      );

      const videoUrl = await this.uploadToSupabase(finalVideoPath, contentId);

      const totalDuration = [...pageAudios, { duration: ctaDuration }]
        .reduce((sum, p) => sum + p.duration, 0);

      console.log(`✅ Vídeo gerado: ${videoUrl}`);
      console.log(`⏱️ Duração: ${totalDuration.toFixed(1)}s`);

      this.cleanupTempFiles(tempDir);

      return {
        video_url: videoUrl,
        duration_seconds: Math.ceil(totalDuration),
        content_id: contentId,
        cost_usd: (tweets.length + 1) * 0.015
      };
    } catch (error: any) {
      console.error('❌ Erro:', error);
      this.cleanupTempFiles(tempDir);
      throw error;
    }
  }

  private async createVideoAllAtOnce(
    mainPngPath: string,
    ctaPngPath: string,
    pageAudios: PageAudio[],
    ctaAudioPath: string,
    ctaDuration: number,
    musicPath: string | null,
    tempDir: string,
    threadTitle?: string
  ): Promise<string> {
    const finalVideoPath = path.join(tempDir, 'final-video.mp4');
    const videoSegments: string[] = [];

    console.log('\n🎬 Gerando vídeos individuais por página...');

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

    const interRegularPath = '/Users/marseau/Library/Application Support/io.flutterflow.prod.mac/Inter_regular_8fba6fe30d0e768cf6ec5468e843b4834a29bf71133ca031a80e45d464472beb.ttf';
    const interBoldPath = '/Users/marseau/Library/Application Support/io.flutterflow.prod.mac/Inter_700_0ebefe6637b51f54e953af5beed98d607237c3bdcadbc39cefe3edcbec529ef7.ttf';

    for (let i = 0; i < pageAudios.length; i++) {
      const page = pageAudios[i]!;
      const pageDuration = page.duration + 0.5;
      const { hashtag } = this.parseTweetContent(page.text);
      const content = page.text.replace(/^\d+\/\d+\s*/, '').replace(/#\w+\s*$/, '').trim();

      console.log(`  📄 Página ${i + 1}/${pageAudios.length}: ${content.substring(0, 30)}...`);

      let pageFilter = `[0:v]scale=1080:1920,format=yuv420p`;

      if (threadTitle && i === 0) {
        const wrappedTitle = wrapText(sanitize(threadTitle), 30);
        const titleFilePath = path.join(tempDir, `page-${i + 1}-title.txt`);
        fs.writeFileSync(titleFilePath, wrappedTitle, 'utf8');
        pageFilter += `,drawtext=fontfile='${interBoldPath}':textfile='${titleFilePath}':fontcolor=white:fontsize=58:line_spacing=0:text_align=center:x=(w-text_w)/2:y=320`;
      }

      if (content && content.trim().length > 0) {
        const sanitizedContent = sanitize(content);
        const wrappedContent = wrapText(sanitizedContent, 40);

        console.log(`🔍 DEBUG TEXT OVERLAY - Página ${i + 1}:`);
        console.log(`  Original: "${content}"`);
        console.log(`  Sanitized: "${sanitizedContent}"`);
        console.log(`  Wrapped: "${wrappedContent}"`);
        console.log(`  Length: ${wrappedContent.length} chars`);

        if (wrappedContent.length > 0) {
          const textFilePath = path.join(tempDir, `page-${i + 1}-content.txt`);
          fs.writeFileSync(textFilePath, wrappedContent, 'utf8');
          pageFilter += `,drawtext=fontfile='${interRegularPath}':textfile='${textFilePath}':fontcolor=white:fontsize=32:line_spacing=13:text_align=center:x=(w-text_w)/2:y=645`;
        } else {
          console.warn(`⚠️ AVISO: Texto wrapped vazio para página ${i + 1}`);
        }
      } else {
        console.warn(`⚠️ AVISO: Conteúdo vazio para página ${i + 1}`);
      }

      if (hashtag) {
        pageFilter += `,drawtext=fontfile='${interRegularPath}':text='${sanitize(hashtag)}':fontcolor=0x28a745:fontsize=60:line_spacing=24:text_align=center:x=(w-text_w)/2:y=1350`;
      }

      pageFilter += `[v]`;

      const videoPath = path.join(tempDir, `page-${i + 1}.mp4`);
      let cmd = `ffmpeg -loop 1 -t ${pageDuration} -i "${mainPngPath}" -i "${page.audioPath}"`;

      if (musicPath) {
        cmd += ` -i "${musicPath}"`;
        cmd += ` -filter_complex "${pageFilter};[1:a]volume=1.0,apad=pad_dur=0.5[voice];[2:a]volume=0.12,atrim=0:${pageDuration}[music];[voice][music]amix=inputs=2:duration=longest[a]" -map "[v]" -map "[a]"`;
      } else {
        cmd += ` -filter_complex "${pageFilter};[1:a]volume=1.0,apad=pad_dur=0.5[a]" -map "[v]" -map "[a]"`;
      }

      cmd += ` -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -t ${pageDuration} -y "${videoPath}"`;

      console.log(`🔍 DEBUG FFmpeg Command (Página ${i + 1}):`);
      console.log(cmd);
      console.log(`\n`);

      try {
        const { stderr } = await execWithLargeBuffer(cmd);
        if (stderr && stderr.includes('error')) {
          console.error(`⚠️ FFmpeg STDERR (Página ${i + 1}):`, stderr);
        }
        console.log(`✅ Vídeo página ${i + 1} gerado com sucesso`);
      } catch (error: any) {
        console.error(`❌ ERRO ao gerar página ${i + 1}:`, error.message);
        if (error.stderr) {
          console.error(`FFmpeg STDERR:`, error.stderr);
        }
        throw error;
      }

      videoSegments.push(videoPath);
    }

    console.log(`  🎯 CTA final com 2s de pausa integrada...`);
    const ctaVideoPath = path.join(tempDir, 'page-cta.mp4');
    const pauseDuration = 2.0;
    const ctaTotalDuration = pauseDuration + ctaDuration + 0.5;

    let ctaCmd = `ffmpeg -loop 1 -t ${ctaTotalDuration} -i "${ctaPngPath}"`;
    ctaCmd += ` -f lavfi -t ${pauseDuration} -i anullsrc=channel_layout=stereo:sample_rate=48000`;
    ctaCmd += ` -i "${ctaAudioPath}"`;

    if (musicPath) {
      ctaCmd += ` -i "${musicPath}"`;
      ctaCmd += ` -filter_complex "[0:v]scale=1080:1920,format=yuv420p[v];[1:a][2:a]concat=n=2:v=0:a=1[voice_concat];[voice_concat]volume=1.3,apad=pad_dur=0.5[voice];[3:a]volume=0.12,atrim=0:${ctaTotalDuration}[music];[voice][music]amix=inputs=2:duration=longest[a]" -map "[v]" -map "[a]"`;
    } else {
      ctaCmd += ` -filter_complex "[0:v]scale=1080:1920,format=yuv420p[v];[1:a][2:a]concat=n=2:v=0:a=1[voice_concat];[voice_concat]volume=1.3,apad=pad_dur=0.5[a]" -map "[v]" -map "[a]"`;
    }

    ctaCmd += ` -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -t ${ctaTotalDuration} -y "${ctaVideoPath}"`;

    await execWithLargeBuffer(ctaCmd);
    videoSegments.push(ctaVideoPath);
    console.log(`✅ CTA gerado: ${ctaTotalDuration.toFixed(1)}s (2s pausa + ${ctaDuration.toFixed(1)}s áudio)`);

    const rawDuration = pageAudios.reduce((sum, p) => sum + p.duration, 0);
    const numberOfTransitions = pageAudios.length;
    const fadeDuration = 0.5;
    const totalFadeOverlap = numberOfTransitions * fadeDuration;
    const ctaStartTime = rawDuration - totalFadeOverlap;

    console.log(`🎯 DEBUG CTA TIMESTAMP CALCULATION (PAUSA INTEGRADA):`);
    console.log(`  Raw duration tweets (sem xfade): ${rawDuration.toFixed(2)}s`);
    console.log(`  Número de transições: ${numberOfTransitions}`);
    console.log(`  Total fade overlap: ${totalFadeOverlap.toFixed(2)}s`);
    console.log(`  🎯 CTA começa em: ${ctaStartTime.toFixed(2)}s`);
    console.log(`  📦 CTA total: ${ctaTotalDuration.toFixed(2)}s (2s pausa + ${ctaDuration.toFixed(1)}s áudio)`);

    console.log('\n🔗 Aplicando crossfade entre páginas...');

    if (videoSegments.length === 1) {
      fs.copyFileSync(videoSegments[0]!, finalVideoPath);
    } else {
      await this.applyXfadeTransitions(videoSegments, finalVideoPath, tempDir, ctaStartTime);
    }

    console.log(`✅ Vídeo final gerado com transições suaves + metadata marker CTA!`);
    return finalVideoPath;
  }

  private async savePng(pngBinary: string | Buffer | any, tempDir: string, fileName: string): Promise<string> {
    const pngPath = path.join(tempDir, fileName);
    let base64Data: string;

    if (typeof pngBinary === 'string') {
      base64Data = pngBinary.replace(/^data:image\/png;base64,/, '');
    } else if (Buffer.isBuffer(pngBinary)) {
      fs.writeFileSync(pngPath, pngBinary);
      return pngPath;
    } else if (typeof pngBinary === 'object' && pngBinary.data) {
      base64Data = pngBinary.data.replace(/^data:image\/png;base64,/, '');
    } else {
      throw new Error(`Formato de PNG inválido: ${typeof pngBinary}`);
    }

    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(pngPath, buffer);
    return pngPath;
  }

  private async generateVoiceover(
    text: string,
    voiceId: string,
    tempDir: string,
    name: string,
    speed: number = 1.25
  ): Promise<string> {
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsApiKey) {
      throw new Error('ELEVENLABS_API_KEY não configurada');
    }

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3
        }
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': elevenLabsApiKey,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    const audioPath = path.join(tempDir, `${name}.mp3`);
    fs.writeFileSync(audioPath, response.data);

    const trimmedAudioPath = path.join(tempDir, `${name}-trimmed.mp3`);
    let audioFilters = 'silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB';

    if (speed !== 1.0) {
      audioFilters += `,atempo=${speed}`;
    }

    await execWithLargeBuffer(`ffmpeg -i "${audioPath}" -af "${audioFilters}" -y "${trimmedAudioPath}"`);
    fs.unlinkSync(audioPath);
    fs.renameSync(trimmedAudioPath, audioPath);

    return audioPath;
  }

  private async getAudioDuration(audioPath: string): Promise<number> {
    const { stdout } = await execWithLargeBuffer(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    );
    return parseFloat(stdout.trim());
  }

  private async applyXfadeTransitions(
    videoSegments: string[],
    outputPath: string,
    tempDir: string,
    ctaStartTime?: number
  ): Promise<void> {
    const fadeDuration = 0.5;
    const durations: number[] = [];

    for (const segment of videoSegments) {
      const duration = await this.getVideoDuration(segment);
      durations.push(duration);
    }

    console.log(`  📹 ${videoSegments.length} vídeos para concatenar com xfade`);
    console.log(`  ⏱️ Durações: ${durations.map(d => d.toFixed(1)).join('s, ')}s`);

    const inputs = videoSegments.map((v, i) => `-i "${v}"`).join(' ');

    let videoFilter = '';
    let currentOffset = 0;

    for (let i = 0; i < videoSegments.length - 1; i++) {
      const videoDuration = durations[i]!;
      currentOffset += videoDuration - fadeDuration;

      if (i === 0) {
        videoFilter += `[0:v][1:v]xfade=transition=fade:duration=${fadeDuration}:offset=${currentOffset.toFixed(2)}[v${i}];`;
      } else if (i === videoSegments.length - 2) {
        videoFilter += `[v${i - 1}][${i + 1}:v]xfade=transition=fade:duration=${fadeDuration}:offset=${currentOffset.toFixed(2)}[outv];`;
      } else {
        videoFilter += `[v${i - 1}][${i + 1}:v]xfade=transition=fade:duration=${fadeDuration}:offset=${currentOffset.toFixed(2)}[v${i}];`;
      }
    }

    let audioFilter = '';
    currentOffset = 0;

    for (let i = 0; i < videoSegments.length - 1; i++) {
      const audioDuration = durations[i]!;
      currentOffset += audioDuration - fadeDuration;

      if (i === 0) {
        audioFilter += `[0:a][1:a]acrossfade=d=${fadeDuration}:c1=tri:c2=tri[a${i}];`;
      } else if (i === videoSegments.length - 2) {
        audioFilter += `[a${i - 1}][${i + 1}:a]acrossfade=d=${fadeDuration}:c1=tri:c2=tri[outa];`;
      } else {
        audioFilter += `[a${i - 1}][${i + 1}:a]acrossfade=d=${fadeDuration}:c1=tri:c2=tri[a${i}];`;
      }
    }

    const filterComplex = videoFilter + audioFilter;
    const tempConcatPath = path.join(tempDir, 'temp-concat.mp4');

    const cmd = `ffmpeg ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -y "${tempConcatPath}"`;

    console.log(`🔍 DEBUG xfade + acrossfade command:`);
    console.log(cmd);
    console.log(`\n`);

    await execWithLargeBuffer(cmd);
    console.log(`✅ Transições xfade (vídeo) + acrossfade (áudio) aplicadas com sucesso!`);

    if (ctaStartTime !== undefined && ctaStartTime > 0) {
      console.log(`🏷️ Adicionando metadata marker no timestamp ${ctaStartTime.toFixed(2)}s...`);

      console.log(`🔍 Verificando temp-concat.mp4 streams...`);
      const { stdout: probeOutput } = await execWithLargeBuffer(`ffprobe -v quiet -print_format json -show_streams "${tempConcatPath}"`);
      console.log(`📊 Temp-concat streams:`, JSON.parse(probeOutput));

      const metadataPath = path.join(tempDir, 'metadata.txt');
      const metadataContent = `;FFMETADATA1
[CHAPTER]
TIMEBASE=1/1000
START=${Math.floor(ctaStartTime * 1000)}
END=999999999
title=CTA_START
`;
      fs.writeFileSync(metadataPath, metadataContent, 'utf8');

      console.log(`📝 Metadata file criado:`);
      console.log(metadataContent);

      const metadataCmd = `ffmpeg -i "${tempConcatPath}" -f ffmetadata -i "${metadataPath}" -map_metadata 1 -map 0 -c copy -y "${outputPath}"`;

      console.log(`🔍 DEBUG metadata injection command (STREAM COPY com -f ffmetadata):`);
      console.log(metadataCmd);

      await execWithLargeBuffer(metadataCmd);
      console.log(`✅ Chapter marker CTA_START adicionado em ${ctaStartTime.toFixed(2)}s!`);

      console.log(`🔍 Verificando output streams após metadata injection...`);
      const { stdout: outputProbeOutput } = await execWithLargeBuffer(`ffprobe -v quiet -print_format json -show_streams "${outputPath}"`);
      console.log(`📊 Output streams:`, JSON.parse(outputProbeOutput));

      fs.unlinkSync(tempConcatPath);
    } else {
      fs.renameSync(tempConcatPath, outputPath);
    }
  }

  private async getVideoDuration(videoPath: string): Promise<number> {
    const { stdout } = await execWithLargeBuffer(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    return parseFloat(stdout.trim());
  }

  private async mergeAudios(audioPaths: string[], tempDir: string): Promise<string> {
    const outputPath = path.join(tempDir, 'merged-voiceover.mp3');
    const concatListPath = path.join(tempDir, 'audio-concat.txt');
    const concatList = audioPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(concatListPath, concatList);

    await execWithLargeBuffer(`ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy -y "${outputPath}"`);
    return outputPath;
  }

  private async downloadBackgroundMusic(category: string, tempDir: string): Promise<string | null> {
    try {
      const { data: musicData, error } = await this.supabase
        .from('instagram_trending_audios')
        .select('*')
        .eq('is_active', true)
        .eq('category', category)
        .order('trending_score', { ascending: false })
        .limit(5);

      if (error || !musicData || musicData.length === 0) {
        console.warn('⚠️ Nenhuma música encontrada');
        return null;
      }

      const selectedMusic = musicData[Math.floor(Math.random() * musicData.length)]!;
      console.log(`🎵 Música: "${selectedMusic.audio_name}"`);

      const musicUrl = selectedMusic.audio_url || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
      const response = await axios.get(musicUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const musicPath = path.join(tempDir, 'background-music.mp3');
      fs.writeFileSync(musicPath, response.data);

      return musicPath;
    } catch (error: any) {
      console.warn(`⚠️ Erro ao baixar música: ${error.message}`);
      return null;
    }
  }

  private async uploadToSupabase(videoPath: string, contentId: string): Promise<string> {
    const videoBuffer = fs.readFileSync(videoPath);
    const fileName = `multi-page-reel-${contentId}-${Date.now()}.mp4`;

    const { error } = await this.supabase.storage
      .from('instagram-reels')
      .upload(fileName, videoBuffer, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (error) throw error;

    const { data: publicUrlData } = this.supabase.storage
      .from('instagram-reels')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  }

  private cleanupTempFiles(tempDir: string): void {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`🧹 Temp dir removido: ${tempDir}`);
      }
    } catch (error: any) {
      console.warn(`⚠️ Erro ao limpar temp dir: ${error.message}`);
    }
  }

  private parseTweetContent(tweet: string): { content: string; hashtag: string } {
    console.log(`🔍 DEBUG parseTweetContent - Tweet original: "${tweet}"`);

    let cleaned = tweet.replace(/^\d+\/\d+\s*/, '');
    console.log(`🔍 Após remover numeração: "${cleaned}"`);

    cleaned = cleaned.replace(/^[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{231A}-\u{23FF}\u{FE00}-\u{FEFF}]+\s*/gu, '');
    console.log(`🔍 Após remover emojis: "${cleaned}"`);

    const hashtagMatch = cleaned.match(/#\w+\s*$/);
    const hashtag = hashtagMatch ? hashtagMatch[0].trim() : '';
    console.log(`🔍 Hashtag encontrada: "${hashtag}"`);

    const content = cleaned.replace(/#\w+\s*$/, '').trim();
    console.log(`🔍 Conteúdo final: "${content}"`);
    console.log(`🔍 Conteúdo vazio? ${content.length === 0 ? 'SIM ⚠️' : 'NÃO ✅'}`);

    return { content, hashtag };
  }
}
