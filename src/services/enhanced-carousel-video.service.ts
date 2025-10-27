import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface EnhancedVideoOptions {
  backgroundMusicUrl?: string;
  voiceoverScript?: string;
  voiceoverScriptPerSlide?: string[]; // Script sincronizado por slide
  voicePerSlide?: ('bruno' | 'carla')[]; // Voz por slide: 'bruno' ou 'carla'
  finalStaticSlide?: {
    imageUrl: string;      // URL da imagem do slide final estático
    duration: number;      // Duração em segundos (ex: 3)
  };
  musicVolume?: number; // 0.0 to 1.0 (default: 0.3)
  useFadeTransitions?: boolean; // default: true
  fadeTransitionDuration?: number; // seconds (default: 0.5)
}

interface EnhancedVideoResult {
  video_url: string;
  duration_seconds: number;
  total_slides: number;
  content_id: string;
  cost_usd: number;
  voiceover_url?: string;
  music_used: boolean;
  transitions_used: boolean;
}

export class EnhancedCarouselVideoService {
  private readonly ELEVENLABS_API_KEY: string;
  private readonly ELEVENLABS_VOICE_ID_BRUNO: string;
  private readonly ELEVENLABS_VOICE_ID_CARLA: string;
  private readonly ELEVENLABS_COST_PER_1K_CHARS = 0.30;

  constructor() {
    this.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
    this.ELEVENLABS_VOICE_ID_BRUNO = process.env.ELEVENLABS_VOICE_ID_Bruno || '';
    this.ELEVENLABS_VOICE_ID_CARLA = process.env.ELEVENLABS_VOICE_ID_Carla || '';
  }

  /**
   * Gera vídeo carrossel com transições fade, música e locução do Bruno
   */
  async generateEnhancedVideo(
    imageUrls: string[],
    contentId: string,
    duration: number = 60,
    options: EnhancedVideoOptions = {}
  ): Promise<EnhancedVideoResult> {
    console.log('🎬 ========== INICIANDO GERAÇÃO VÍDEO ENHANCED ==========');
    console.log(`📄 Content ID: ${contentId}`);
    console.log(`🖼️ Total de imagens: ${imageUrls.length}`);
    console.log(`⏱️ Duração alvo: ${duration}s`);
    console.log(`🎵 Música: ${options.backgroundMusicUrl ? 'SIM' : 'NÃO'}`);
    console.log(`🎙️ Locução Bruno: ${options.voiceoverScript ? 'SIM' : 'NÃO'}`);
    console.log(`✨ Transições fade: ${options.useFadeTransitions !== false ? 'SIM' : 'NÃO'}`);

    const tempDir = path.join(os.tmpdir(), `enhanced-carousel-${contentId}-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    let voiceoverPath: string | undefined;
    let musicPath: string | undefined;
    let totalCost = imageUrls.length * 0.076; // Placid cost

    try {
      // 1. Download das imagens
      console.log('\n📥 Fazendo download das imagens...');
      const imagePaths: string[] = [];

      for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i];
        if (!imageUrl) continue;

        console.log(`   ⬇️ Baixando slide ${i + 1}/${imageUrls.length}...`);
        const imagePath = path.join(tempDir, `slide-${i.toString().padStart(2, '0')}.jpg`);

        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(imagePath, response.data);
        imagePaths.push(imagePath);
      }

      // 1.1 Download do slide final estático (se fornecido)
      if (options.finalStaticSlide) {
        console.log('\n🎯 Baixando slide final estático (CTA)...');
        const finalImagePath = path.join(tempDir, `slide-${imagePaths.length.toString().padStart(2, '0')}.jpg`);
        const response = await axios.get(options.finalStaticSlide.imageUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(finalImagePath, response.data);
        imagePaths.push(finalImagePath);
        console.log(`   ✅ Slide final adicionado com ${options.finalStaticSlide.duration}s de duração`);
      }

      // 2. Gerar locução do Bruno (sincronizada ou monolítica)
      let voiceoverDurations: number[] = [];
      let syncedVoiceovers: string[] = [];

      if (options.voiceoverScriptPerSlide && this.ELEVENLABS_API_KEY) {
        // MODO SINCRONIZADO: Gerar áudio por slide com suporte a múltiplas vozes
        const { audioPaths, durations, totalDuration } = await this.generateSyncedVoiceovers(
          options.voiceoverScriptPerSlide,
          tempDir,
          options.voicePerSlide // Array opcional de vozes: 'bruno' ou 'carla'
        );
        syncedVoiceovers = audioPaths;
        voiceoverDurations = durations;
        totalCost += options.voiceoverScriptPerSlide.join('').length / 1000 * this.ELEVENLABS_COST_PER_1K_CHARS;

        // Ajustar duração total para coincidir com narração
        duration = Math.max(duration, totalDuration + 2); // +2s de margem
        console.log(`\n⏱️ Duração ajustada para ${duration.toFixed(2)}s (baseado na narração)`);
      } else if (options.voiceoverScript && this.ELEVENLABS_API_KEY) {
        // MODO ANTIGO: Gerar áudio único
        console.log('\n🎙️ Gerando locução do Bruno via ElevenLabs...');
        voiceoverPath = await this.generateVoiceover(
          options.voiceoverScript,
          tempDir
        );
        totalCost += (options.voiceoverScript.length / 1000) * this.ELEVENLABS_COST_PER_1K_CHARS;
        console.log(`✅ Locução gerada: ${voiceoverPath}`);
      }

      // 3. Download da música de fundo (se fornecida)
      if (options.backgroundMusicUrl) {
        console.log('\n🎵 Fazendo download da música de fundo...');
        musicPath = path.join(tempDir, 'background-music.mp3');
        const musicResponse = await axios.get(options.backgroundMusicUrl, {
          responseType: 'arraybuffer'
        });
        fs.writeFileSync(musicPath, musicResponse.data);
        console.log('✅ Música baixada');
      }

      // 4. Calcular duração por slide (sincronizada ou distribuída)
      let durationsPerSlide: number[];

      if (voiceoverDurations.length > 0) {
        // Usar durações reais dos áudios + pequena margem
        durationsPerSlide = voiceoverDurations.map(d => d + 0.5);

        // Adicionar duração do slide final estático (sem locução)
        if (options.finalStaticSlide) {
          durationsPerSlide.push(options.finalStaticSlide.duration);
        }

        console.log(`\n⏱️ Durações sincronizadas por slide:`, durationsPerSlide.map(d => d.toFixed(2) + 's'));
      } else {
        // Distribuir uniformemente (considerando slide final se existir)
        const totalSlides = options.finalStaticSlide ? imageUrls.length + 1 : imageUrls.length;
        const durationPerSlide = duration / totalSlides;
        durationsPerSlide = Array(totalSlides).fill(durationPerSlide);
        console.log(`\n⏱️ Duração por slide: ${durationPerSlide.toFixed(2)}s`);
      }

      // 5. Gerar vídeo com ou sem transições fade
      const outputVideoPath = path.join(tempDir, `carousel-${contentId}.mp4`);

      if (options.useFadeTransitions !== false) {
        await this.generateVideoWithFadeTransitionsSynced(
          imagePaths,
          outputVideoPath,
          durationsPerSlide,
          options.fadeTransitionDuration || 0.5,
          syncedVoiceovers // Áudios sincronizados (se existirem)
        );
      } else {
        await this.generateVideoSimpleSynced(imagePaths, outputVideoPath, durationsPerSlide, syncedVoiceovers);
      }

      // 6. Adicionar música de fundo ao vídeo sincronizado
      if (musicPath && syncedVoiceovers.length > 0) {
        console.log('\n🎵 Adicionando música de fundo ao vídeo sincronizado...');
        const finalVideoPath = path.join(tempDir, `final-${contentId}.mp4`);

        // Adicionar música como trilha de fundo (mixada com locuções já embutidas)
        const mixCommand = `ffmpeg -i "${outputVideoPath}" -i "${musicPath}" \
          -filter_complex "[1:a]volume=${options.musicVolume || 0.15},afade=t=in:st=0:d=2,afade=t=out:st=${duration - 2}:d=2[music]; \
            [0:a][music]amix=inputs=2:duration=first:weights=1 ${options.musicVolume || 0.15}[audio]" \
          -map 0:v -map "[audio]" \
          -c:v copy -c:a aac -b:a 192k \
          -shortest \
          -y "${finalVideoPath}"`;

        await execAsync(mixCommand);
        fs.renameSync(finalVideoPath, outputVideoPath);
        console.log('   ✅ Música de fundo adicionada');

      } else if ((voiceoverPath || musicPath) && syncedVoiceovers.length === 0) {
        // Modo antigo: áudio único
        console.log('\n🎵 Adicionando áudio ao vídeo...');
        const finalVideoPath = path.join(tempDir, `final-${contentId}.mp4`);
        await this.addAudioToVideo(
          outputVideoPath,
          finalVideoPath,
          voiceoverPath,
          musicPath,
          duration,
          options.musicVolume || 0.3
        );

        fs.renameSync(finalVideoPath, outputVideoPath);
      }

      // 7. Verificar arquivo final
      if (!fs.existsSync(outputVideoPath)) {
        throw new Error('Vídeo não foi gerado pelo FFmpeg');
      }

      const videoStats = fs.statSync(outputVideoPath);
      console.log(`\n📦 Tamanho do vídeo: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);

      console.log('\n✅ ========== VÍDEO ENHANCED COMPLETO ==========');
      console.log(`📹 Vídeo: ${outputVideoPath}`);
      console.log(`⏱️ Duração: ${duration}s`);
      console.log(`🖼️ Slides: ${imageUrls.length}`);
      console.log(`💰 Custo: $${totalCost.toFixed(3)}`);

      return {
        video_url: outputVideoPath,
        duration_seconds: duration,
        total_slides: imageUrls.length,
        content_id: contentId,
        cost_usd: totalCost,
        voiceover_url: voiceoverPath,
        music_used: !!musicPath,
        transitions_used: options.useFadeTransitions !== false
      };

    } catch (error: any) {
      console.error('❌ Erro ao gerar vídeo enhanced:', error.message);
      throw error;
    }
  }

  /**
   * Gera áudios de locução sincronizados por slide com suporte a múltiplas vozes
   */
  private async generateSyncedVoiceovers(
    scriptsPerSlide: string[],
    tempDir: string,
    voicesPerSlide?: ('bruno' | 'carla')[]
  ): Promise<{ audioPaths: string[], durations: number[], totalDuration: number }> {
    console.log('\n🎙️ Gerando locuções sincronizadas por slide...');

    const audioPaths: string[] = [];
    const durations: number[] = [];
    let totalDuration = 0;

    for (let i = 0; i < scriptsPerSlide.length; i++) {
      const script = scriptsPerSlide[i];
      if (!script) continue;

      // Determina qual voz usar para este slide
      const voiceType = voicesPerSlide?.[i] || 'bruno';
      const voiceId = voiceType === 'carla' ? this.ELEVENLABS_VOICE_ID_CARLA : this.ELEVENLABS_VOICE_ID_BRUNO;
      const voiceEmoji = voiceType === 'carla' ? '👩 Carla' : '🧔 Bruno';

      const audioPath = path.join(tempDir, `voiceover-slide-${i + 1}.mp3`);

      console.log(`   🎤 Slide ${i + 1} (${voiceEmoji}): "${script.substring(0, 50)}..."`);

      // Gerar áudio
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text: script,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.35,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'xi-api-key': this.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      fs.writeFileSync(audioPath, response.data);
      audioPaths.push(audioPath);

      // Detectar duração do áudio
      const durationOutput = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
      );
      const duration = parseFloat(durationOutput.stdout.trim());
      durations.push(duration);
      totalDuration += duration;

      console.log(`   ✅ Slide ${i + 1}: ${duration.toFixed(2)}s de áudio gerado`);
    }

    console.log(`\n📊 Duração total da narração: ${totalDuration.toFixed(2)}s`);

    return { audioPaths, durations, totalDuration };
  }

  /**
   * Gera áudio de locução via ElevenLabs
   */
  private async generateVoiceover(script: string, tempDir: string): Promise<string> {
    const voiceoverPath = path.join(tempDir, 'voiceover.mp3');

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.ELEVENLABS_VOICE_ID_BRUNO}`,
      {
        text: script,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.35,        // Reduzido de 0.5 para fala mais lenta e expressiva
          similarity_boost: 0.75,
          style: 0.3,             // Adiciona mais variação tonal
          use_speaker_boost: true // Melhora clareza da voz
        }
      },
      {
        headers: {
          'xi-api-key': this.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    fs.writeFileSync(voiceoverPath, response.data);
    return voiceoverPath;
  }

  /**
   * Gera vídeo COM transições fade E áudios sincronizados por slide (NOVO)
   */
  private async generateVideoWithFadeTransitionsSynced(
    imagePaths: string[],
    outputPath: string,
    durationsPerSlide: number[],
    transitionDuration: number,
    voiceoverPaths: string[]
  ): Promise<void> {
    console.log('\\n🎬 Gerando vídeo com transições fade e sincronização...');
    console.log(`   ✨ Duração da transição: ${transitionDuration}s`);

    // Criar segmentos de vídeo individuais SEM áudio primeiro
    const videoSegments: string[] = [];

    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      if (!imagePath) continue;

      const duration = durationsPerSlide[i] || 10;
      const segmentPath = path.join(path.dirname(outputPath), `segment-${i.toString().padStart(2, '0')}.mp4`);

      console.log(`   🎞️ Criando segmento ${i + 1}/${imagePaths.length} (${duration.toFixed(2)}s)...`);

      // Criar vídeo SEM áudio (áudio será adicionado depois)
      const segmentCommand = `ffmpeg -loop 1 -i "${imagePath}" \
        -vf "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,fps=30,format=yuv420p" \
        -c:v libx264 -preset medium -crf 23 -t ${duration} -y "${segmentPath}"`;

      await execAsync(segmentCommand);
      videoSegments.push(segmentPath);
    }

    console.log(`   ✨ Aplicando ${videoSegments.length - 1} transições fade...`);

    // Aplicar xfade recursivamente APENAS no vídeo (sem áudio)
    let currentVideo: string = videoSegments[0]!;
    let currentDuration = durationsPerSlide[0] || 10;

    for (let i = 1; i < videoSegments.length; i++) {
      const tempOutput = path.join(path.dirname(outputPath), `merged-${i}.mp4`);
      const nextVideo = videoSegments[i]!;
      const offset = currentDuration - transitionDuration;

      console.log(`   🔗 Mesclando slide ${i + 1} (current: ${currentDuration.toFixed(2)}s, offset: ${offset.toFixed(2)}s)...`);

      // Xfade APENAS para vídeo (sem áudio)
      const xfadeCommand = `ffmpeg -i "${currentVideo}" -i "${nextVideo}" \
        -filter_complex "[0:v][1:v]xfade=transition=fade:duration=${transitionDuration}:offset=${offset.toFixed(2)}[vout]" \
        -map "[vout]" \
        -c:v libx264 -preset medium -crf 23 \
        -y "${tempOutput}"`;

      await execAsync(xfadeCommand);

      currentDuration = currentDuration + (durationsPerSlide[i] || 10) - transitionDuration;
      currentVideo = tempOutput;
    }

    // Agora adicionar áudio sincronizado ao vídeo com transições
    const videoWithTransitions = currentVideo;
    const finalVideoWithAudio = path.join(path.dirname(outputPath), 'final-with-audio.mp4');

    console.log('   🎤 Adicionando áudios sincronizados ao vídeo...');

    // Criar arquivo de concat para os áudios
    const audioListPath = path.join(path.dirname(outputPath), 'audio-list.txt');
    let audioListContent = '';
    for (const audioPath of voiceoverPaths) {
      if (audioPath) {
        audioListContent += `file '${audioPath}'\n`;
      }
    }
    fs.writeFileSync(audioListPath, audioListContent);

    // Concatenar todos os áudios e adicionar ao vídeo
    const addAudioCommand = `ffmpeg -i "${videoWithTransitions}" -f concat -safe 0 -i "${audioListPath}" \
      -c:v copy -c:a aac -b:a 192k -shortest \
      -y "${finalVideoWithAudio}"`;

    await execAsync(addAudioCommand);
    fs.renameSync(finalVideoWithAudio, outputPath);

    console.log('   ✅ Transições e sincronização aplicadas com sucesso');
  }

  /**
   * Gera vídeo SEM transições MAS com áudios sincronizados (NOVO)
   */
  private async generateVideoSimpleSynced(
    imagePaths: string[],
    outputPath: string,
    durationsPerSlide: number[],
    voiceoverPaths: string[]
  ): Promise<void> {
    console.log('\\n🎬 Gerando vídeo sincronizado sem transições...');

    const videoSegments: string[] = [];

    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      if (!imagePath) continue;

      const duration = durationsPerSlide[i] || 10;
      const segmentPath = path.join(path.dirname(outputPath), `segment-${i.toString().padStart(2, '0')}.mp4`);

      console.log(`   🎞️ Criando segmento ${i + 1}/${imagePaths.length} (${duration.toFixed(2)}s)...`);

      let segmentCommand = `ffmpeg -loop 1 -i "${imagePath}"`;

      if (voiceoverPaths[i]) {
        segmentCommand += ` -i "${voiceoverPaths[i]}"`;
      }

      segmentCommand += ` -vf "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,fps=30,format=yuv420p" \
        -c:v libx264 -preset medium -crf 23`;

      if (voiceoverPaths[i]) {
        segmentCommand += ` -c:a aac -b:a 192k -shortest`;
      }

      segmentCommand += ` -t ${duration} -y "${segmentPath}"`;

      await execAsync(segmentCommand);
      videoSegments.push(segmentPath);
    }

    // Concatenar
    const listFilePath = path.join(path.dirname(outputPath), 'segments.txt');
    let listContent = '';
    for (const segment of videoSegments) {
      listContent += `file '${segment}'\n`;
    }
    fs.writeFileSync(listFilePath, listContent);

    const concatCommand = `ffmpeg -f concat -safe 0 -i "${listFilePath}" \
      -c copy -movflags +faststart \
      -y "${outputPath}"`;

    await execAsync(concatCommand);
    console.log('   ✅ Vídeo sincronizado concatenado');
  }

  /**
   * Gera vídeo COM transições fade usando xfade filter do FFmpeg
   * ABORDAGEM RECURSIVA: Aplica xfade um por vez para evitar problemas de offset
   */
  private async generateVideoWithFadeTransitions(
    imagePaths: string[],
    outputPath: string,
    durationPerSlide: number,
    transitionDuration: number
  ): Promise<void> {
    console.log('\n🎬 Gerando vídeo com transições fade...');
    console.log(`   ✨ Duração da transição: ${transitionDuration}s`);

    // Criar segmentos de vídeo individuais
    const videoSegments: string[] = [];

    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      if (!imagePath) continue;

      const segmentPath = path.join(path.dirname(outputPath), `segment-${i.toString().padStart(2, '0')}.mp4`);

      console.log(`   🎞️ Criando segmento ${i + 1}/${imagePaths.length}...`);

      const segmentCommand = `ffmpeg -loop 1 -i "${imagePath}" \
        -vf "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,fps=30,format=yuv420p" \
        -c:v libx264 -preset medium -crf 23 \
        -t ${durationPerSlide} \
        -y "${segmentPath}"`;

      await execAsync(segmentCommand);
      videoSegments.push(segmentPath);
    }

    console.log(`   ✨ Aplicando ${videoSegments.length - 1} transições fade...`);

    // Aplicar xfade recursivamente (um por vez)
    let currentVideo: string = videoSegments[0]!;
    let currentDuration = durationPerSlide; // Duração real do vídeo atual

    for (let i = 1; i < videoSegments.length; i++) {
      const tempOutput = path.join(path.dirname(outputPath), `merged-${i}.mp4`);
      const nextVideo = videoSegments[i]!;

      // Offset CORRETO: duração do vídeo atual menos a duração da transição
      const offset = currentDuration - transitionDuration;

      console.log(`   🔗 Mesclando slide ${i + 1} (current: ${currentDuration.toFixed(2)}s, offset: ${offset.toFixed(2)}s)...`);

      const xfadeCommand = `ffmpeg -i "${currentVideo}" -i "${nextVideo}" \
        -filter_complex "[0:v][1:v]xfade=transition=fade:duration=${transitionDuration}:offset=${offset.toFixed(2)}[v]" \
        -map "[v]" \
        -c:v libx264 -preset medium -crf 23 \
        -y "${tempOutput}"`;

      await execAsync(xfadeCommand);

      // Atualizar duração: vídeo atual + novo slide - overlap da transição
      currentDuration = currentDuration + durationPerSlide - transitionDuration;

      // Usar o merged como current para próxima iteração
      currentVideo = tempOutput;
    }

    // Mover vídeo final para output path
    fs.renameSync(currentVideo, outputPath);
    console.log('   ✅ Transições aplicadas com sucesso');
  }

  /**
   * Gera vídeo SEM transições (concatenação simples)
   */
  private async generateVideoSimple(
    imagePaths: string[],
    outputPath: string,
    durationPerSlide: number
  ): Promise<void> {
    console.log('\n🎬 Gerando vídeo sem transições...');

    const videoSegments: string[] = [];

    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      if (!imagePath) continue;

      const segmentPath = path.join(path.dirname(outputPath), `segment-${i.toString().padStart(2, '0')}.mp4`);

      console.log(`   🎞️ Criando segmento ${i + 1}/${imagePaths.length}...`);

      const segmentCommand = `ffmpeg -loop 1 -i "${imagePath}" \
        -vf "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,fps=30,format=yuv420p" \
        -c:v libx264 -preset medium -crf 23 \
        -t ${durationPerSlide} \
        -y "${segmentPath}"`;

      await execAsync(segmentCommand);
      videoSegments.push(segmentPath);
    }

    // Concatenar
    const listFilePath = path.join(path.dirname(outputPath), 'segments.txt');
    let listContent = '';
    for (const segment of videoSegments) {
      listContent += `file '${segment}'\n`;
    }
    fs.writeFileSync(listFilePath, listContent);

    const concatCommand = `ffmpeg -f concat -safe 0 -i "${listFilePath}" \
      -c copy \
      -movflags +faststart \
      -y "${outputPath}"`;

    await execAsync(concatCommand);
    console.log('   ✅ Vídeo concatenado');
  }

  /**
   * Adiciona locução e música ao vídeo
   */
  private async addAudioToVideo(
    videoPath: string,
    outputPath: string,
    voiceoverPath: string | undefined,
    musicPath: string | undefined,
    duration: number,
    musicVolume: number
  ): Promise<void> {
    let audioFilterComplex = '';
    let inputs = `-i "${videoPath}"`;
    let mapAudio = '';

    if (voiceoverPath && musicPath) {
      // Locução + Música
      inputs += ` -i "${voiceoverPath}" -i "${musicPath}"`;

      // Aplicar fade in/out na música, ajustar volume, e mixar com locução
      audioFilterComplex = `-filter_complex "\
[2:a]volume=${musicVolume},afade=t=in:st=0:d=2,afade=t=out:st=${duration - 2}:d=2[music];\
[1:a][music]amix=inputs=2:duration=longest:weights=1 ${musicVolume}[audio]" \
-map 0:v -map "[audio]"`;

    } else if (voiceoverPath) {
      // Apenas locução
      inputs += ` -i "${voiceoverPath}"`;
      mapAudio = '-map 0:v -map 1:a';

    } else if (musicPath) {
      // Apenas música
      inputs += ` -i "${musicPath}"`;
      audioFilterComplex = `-filter_complex "\
[1:a]volume=${musicVolume},afade=t=in:st=0:d=2,afade=t=out:st=${duration - 2}:d=2[audio]" \
-map 0:v -map "[audio]"`;
    }

    const command = `ffmpeg ${inputs} ${audioFilterComplex || mapAudio} \
      -c:v copy -c:a aac -b:a 192k \
      -shortest \
      -y "${outputPath}"`;

    await execAsync(command);
    console.log('   ✅ Áudio adicionado ao vídeo');
  }
}
