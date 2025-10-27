import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Aumentar buffer para suportar logs longos do FFmpeg (50MB)
const execAsync = promisify(exec);
const execWithLargeBuffer = (cmd: string) => execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

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
  audio_url?: string;
}

/**
 * 🎬 Canva Hybrid Video Generator Service
 *
 * Solução híbrida inteligente para Instagram Reels (4:5 - 1080x1350):
 * 1. Recebe PNG do Canva exportado pelo N8N sub-workflow (template selecionado por categoria)
 * 2. Overlay de textos dinâmicos via FFmpeg
 * 3. Adiciona locução dual persona (Carla + Bruno via ElevenLabs)
 * 4. Adiciona música de fundo trending do Supabase
 * 5. Mixa tudo em vídeo final 60s otimizado para Instagram Reels
 *
 * Vantagens:
 * - Visual profissional do Canva com templates variados por categoria
 * - Textos 100% dinâmicos gerados por IA
 * - Formato nativo Instagram Reels (1080x1350)
 * - Totalmente automatizado via N8N + Backend
 * - Custo baixo (~$0.12/vídeo)
 */
export class CanvaSvgVideoGeneratorService {
  private readonly supabase;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Gera vídeo completo com 2 templates Canva + textos dinâmicos + áudio
   * @param carlaScript - Script da Carla (55-75 palavras)
   * @param brunoScript - Script do Bruno (95-120 palavras)
   * @param contentId - ID do conteúdo editorial
   * @param mainPngBinary - PNG template principal (variável por categoria)
   * @param mainDesignId - ID do template principal
   * @param mainDesignName - Nome do template principal
   * @param ctaPngBinary - PNG template CTA final (fixo - logo + URL)
   * @param ctaDesignId - ID do template CTA
   * @param ctaDesignName - Nome do template CTA
   * @param voiceIdCarla - ID voz Carla (default: Carla ElevenLabs)
   * @param voiceIdBruno - ID voz Bruno (default: Bruno ElevenLabs)
   * @param musicCategory - Categoria música (default: corporate)
   */
  async generateVideo(
    carlaScript: string,
    brunoScript: string,
    contentId: string,
    mainPngBinary: string | Buffer,
    mainDesignId: string,
    mainDesignName: string,
    ctaPngBinary: string | Buffer,
    ctaDesignId: string,
    ctaDesignName: string,
    voiceIdCarla: string = 'XrExE9yKIg1WjnnlVkGX', // Carla - Matilda (female)
    voiceIdBruno: string = 'yQtGAPI0R2jQuAXxLWk1', // Bruno - Portuguese male
    musicCategory: string = 'corporate'
  ): Promise<VideoGenerationResult> {
    console.log('🎬 ========== CANVA HYBRID VIDEO GENERATOR ==========');
    console.log(`📄 Content ID: ${contentId}`);
    console.log(`🎨 Main Template: ${mainDesignName} (${mainDesignId})`);
    console.log(`🎯 CTA Template: ${ctaDesignName} (${ctaDesignId})`);
    console.log(`👩‍💼 Carla Script: ${carlaScript.substring(0, 50)}...`);
    console.log(`👨‍💼 Bruno Script: ${brunoScript.substring(0, 50)}...`);

    const tempDir = path.join(os.tmpdir(), `canva-video-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // 1. Salvar os 2 PNGs do Canva (já exportados pelo N8N)
      console.log('\n📥 Salvando PNGs do Canva...');
      const mainPngPath = await this.saveCanvaPngFromN8N(mainPngBinary, tempDir, 'main-template.png');
      const ctaPngPath = await this.saveCanvaPngFromN8N(ctaPngBinary, tempDir, 'cta-template.png');

      // 2. Gerar locuções (Carla + Bruno)
      console.log('\n🎙️ Gerando locuções...');
      const carlaAudioPath = await this.generateVoiceover(carlaScript, voiceIdCarla, tempDir, 'carla');
      const brunoAudioPath = await this.generateVoiceover(brunoScript, voiceIdBruno, tempDir, 'bruno');

      // 3. Mesclar áudios (Carla primeiro, depois Bruno)
      console.log('\n🔊 Mesclando áudios...');
      const mergedAudioPath = await this.mergeAudios(carlaAudioPath, brunoAudioPath, tempDir);

      // 4. Buscar música de fundo
      console.log('\n🎵 Buscando música de fundo...');
      const musicPath = await this.downloadBackgroundMusic(musicCategory, tempDir);

      // 5. Criar vídeo com 3 segmentos (Carla + Bruno + CTA)
      console.log('\n🎬 Criando vídeo final com FFmpeg (3 segmentos)...');
      const finalVideoPath = await this.create3SegmentVideo(
        mainPngPath,
        ctaPngPath,
        mergedAudioPath,
        musicPath,
        carlaScript,
        brunoScript,
        tempDir
      );

      // 6. Upload para Supabase
      console.log('\n☁️ Upload para Supabase...');
      const videoUrl = await this.uploadToSupabase(finalVideoPath, contentId);

      console.log(`✅ Vídeo gerado com sucesso: ${videoUrl}`);

      // Cleanup
      this.cleanupTempFiles(tempDir);

      return {
        video_url: videoUrl,
        duration_seconds: 60,
        content_id: contentId,
        cost_usd: 0.12 // ElevenLabs (~$0.04) + Canva ($0) + infra (~$0.08)
      };
    } catch (error: any) {
      console.error('❌ Erro ao gerar vídeo:', error);
      this.cleanupTempFiles(tempDir);
      throw error;
    }
  }

  /**
   * Salva PNG do Canva recebido do N8N (já exportado pelo sub-workflow)
   */
  private async saveCanvaPngFromN8N(
    pngBinary: string | Buffer | any,
    tempDir: string,
    fileName: string = 'canva-background.png'
  ): Promise<string> {
    try {
      console.log(`💾 Salvando PNG: ${fileName}...`);

      const pngPath = path.join(tempDir, fileName);

      // N8N pode enviar em 3 formatos:
      // 1. String base64 direta
      // 2. Buffer
      // 3. Objeto {data: "base64..."} ← NOVO!
      let base64Data: string;

      if (typeof pngBinary === 'string') {
        // Formato 1: String base64 direta
        base64Data = pngBinary.replace(/^data:image\/png;base64,/, '');
      } else if (Buffer.isBuffer(pngBinary)) {
        // Formato 2: Buffer direto
        fs.writeFileSync(pngPath, pngBinary);
        console.log(`✅ PNG salvo: ${pngPath}`);
        return pngPath;
      } else if (typeof pngBinary === 'object' && pngBinary.data) {
        // Formato 3: Objeto {data: "base64..."} ou referência filesystem
        if (pngBinary.data === 'filesystem-v2' || pngBinary.data.startsWith('filesystem')) {
          throw new Error(
            `❌ N8N enviou referência filesystem ao invés de base64!\n` +
            `Recebido: ${JSON.stringify(pngBinary)}\n\n` +
            `SOLUÇÃO: No N8N, configure o nó HTTP Request para enviar o binário diretamente:\n` +
            `1. Em "Send Binary Data", selecione "Yes"\n` +
            `2. Em "Binary Property", use o nome da propriedade binária\n` +
            `3. Ou use um nó "Convert to/from binary data" antes deste nó`
          );
        }
        console.log('🔧 N8N enviou objeto {data: "base64"}, extraindo...');
        base64Data = pngBinary.data.replace(/^data:image\/png;base64,/, '');
      } else {
        throw new Error(`Formato de PNG inválido. Tipo recebido: ${typeof pngBinary}`);
      }

      // Converter base64 para buffer e salvar
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(pngPath, buffer);

      console.log(`✅ PNG salvo: ${pngPath}`);
      return pngPath;
    } catch (error: any) {
      console.error(`❌ Erro ao salvar PNG do Canva: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gera locução com ElevenLabs
   */
  private async generateVoiceover(
    script: string,
    voiceId: string,
    tempDir: string,
    persona: 'carla' | 'bruno'
  ): Promise<string> {
    try {
      const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
      if (!elevenLabsApiKey) {
        throw new Error('ELEVENLABS_API_KEY não configurada');
      }

      console.log(`🎤 Gerando voz ${persona}...`);

      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text: script,
          model_id: 'eleven_multilingual_v2',
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

      const audioPath = path.join(tempDir, `${persona}.mp3`);
      fs.writeFileSync(audioPath, response.data);

      console.log(`✅ Áudio ${persona} gerado: ${audioPath}`);
      return audioPath;
    } catch (error: any) {
      console.error(`❌ Erro ao gerar voz ${persona}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mescla áudios Carla + Bruno em sequência
   */
  private async mergeAudios(
    carlaPath: string,
    brunoPath: string,
    tempDir: string
  ): Promise<string> {
    try {
      const outputPath = path.join(tempDir, 'merged-voiceover.mp3');

      // Concatenar Carla (20-25s) + Bruno (35-40s) = ~60s total
      const ffmpegCmd = `ffmpeg -i "${carlaPath}" -i "${brunoPath}" \
        -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[out]" \
        -map "[out]" -y "${outputPath}"`;

      await execWithLargeBuffer(ffmpegCmd);

      console.log(`✅ Áudios mesclados: ${outputPath}`);
      return outputPath;
    } catch (error: any) {
      console.error(`❌ Erro ao mesclar áudios: ${error.message}`);
      throw error;
    }
  }

  /**
   * Baixa música de fundo do Supabase
   */
  private async downloadBackgroundMusic(
    category: string,
    tempDir: string
  ): Promise<string | null> {
    try {
      const { data: musicData, error } = await this.supabase
        .from('instagram_trending_audios')
        .select('id, audio_id, audio_name, artist, category, trending_score, audio_url')
        .eq('is_active', true)
        .eq('category', category)
        .order('trending_score', { ascending: false })
        .limit(5);

      if (error || !musicData || musicData.length === 0) {
        console.warn('⚠️ Nenhuma música encontrada, continuando sem música');
        return null;
      }

      const selectedMusic: BackgroundMusic = musicData[Math.floor(Math.random() * musicData.length)]!;
      console.log(`🎵 Música selecionada: "${selectedMusic.audio_name}" por ${selectedMusic.artist}`);

      // Download música
      const musicUrl: string = (selectedMusic.audio_url as string) || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
      const response = await axios.get(musicUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const musicPath = path.join(tempDir, 'background-music.mp3');
      fs.writeFileSync(musicPath, response.data);

      console.log(`✅ Música baixada: ${musicPath}`);
      return musicPath;
    } catch (error: any) {
      console.warn(`⚠️ Erro ao baixar música: ${error.message}`);
      return null;
    }
  }

  /**
   * Cria vídeo final com 3 segmentos:
   * - Segmento 1 (0-25s): Main PNG + Texto Carla
   * - Segmento 2 (25-55s): Main PNG + Texto Bruno
   * - Segmento 3 (55-60s): CTA PNG (logo + URL fixo)
   */
  private async create3SegmentVideo(
    mainPngPath: string,
    ctaPngPath: string,
    voiceoverPath: string,
    musicPath: string | null,
    carlaScript: string,
    brunoScript: string,
    tempDir: string
  ): Promise<string> {
    try {
      const outputPath = path.join(tempDir, 'final-video.mp4');

      // Preparar textos para overlay (remover TODAS as aspas e caracteres problemáticos)
      const carlaText = carlaScript
        .replace(/['"]/g, '')      // Remover todas as aspas (simples e duplas)
        .replace(/[:]/g, ' ')      // Remover dois-pontos (problema no FFmpeg)
        .replace(/\n/g, ' ')       // Remover quebras de linha
        .replace(/\s+/g, ' ')      // Normalizar espaços múltiplos
        .trim()
        .substring(0, 200);
      const brunoText = brunoScript
        .replace(/['"]/g, '')
        .replace(/[:]/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);

      // Criar 3 segmentos separados
      console.log('🎬 Criando Segmento 1: Carla (0-25s)...');
      const segment1Path = await this.createSegment(mainPngPath, carlaText, 0, 25, tempDir, 'segment1.mp4');

      console.log('🎬 Criando Segmento 2: Bruno (25-55s)...');
      const segment2Path = await this.createSegment(mainPngPath, brunoText, 0, 30, tempDir, 'segment2.mp4');

      console.log('🎬 Criando Segmento 3: CTA (55-60s)...');
      const segment3Path = await this.createSegment(ctaPngPath, '', 0, 5, tempDir, 'segment3.mp4');

      // Concatenar os 3 segmentos
      console.log('🔗 Concatenando 3 segmentos...');
      const concatListPath = path.join(tempDir, 'concat-list.txt');
      fs.writeFileSync(concatListPath, `file '${segment1Path}'\nfile '${segment2Path}'\nfile '${segment3Path}'`);

      const videoOnlyPath = path.join(tempDir, 'video-only.mp4');
      await execWithLargeBuffer(`ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy -y "${videoOnlyPath}"`);

      // Adicionar áudio (voiceover + música)
      console.log('🎵 Adicionando áudio...');
      let audioCmd = `ffmpeg -i "${videoOnlyPath}" -i "${voiceoverPath}"`;

      if (musicPath) {
        audioCmd += ` -i "${musicPath}"`;
        audioCmd += ` -filter_complex "[1:a]volume=1.0[voice];[2:a]afade=t=in:st=0:d=2,afade=t=out:st=58:d=2,volume=0.15[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]"`;
      } else {
        audioCmd += ` -map 0:v -map 1:a`;
      }

      audioCmd += ` -c:v copy -c:a aac -b:a 192k -y "${outputPath}"`;
      await execWithLargeBuffer(audioCmd);

      console.log(`✅ Vídeo final (3 segmentos) criado: ${outputPath}`);
      return outputPath;
    } catch (error: any) {
      console.error(`❌ Erro ao criar vídeo 3 segmentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cria um segmento de vídeo individual
   */
  private async createSegment(
    pngPath: string,
    text: string,
    startTime: number,
    duration: number,
    tempDir: string,
    outputName: string
  ): Promise<string> {
    const outputPath = path.join(tempDir, outputName);

    let ffmpegCmd = `ffmpeg -loop 1 -i "${pngPath}" -t ${duration}`;

    // Filtros de vídeo (Instagram Reels 4:5 - 1080x1350)
    let filterComplex = `[0:v]scale=1080:1350,format=yuv420p`;

    // Se tem texto, adiciona overlay
    if (text) {
      filterComplex += `,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:text='${text}':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2[v]`;
    } else {
      filterComplex += `[v]`;
    }

    ffmpegCmd += ` -filter_complex "${filterComplex}" -map "[v]" -c:v libx264 -preset medium -crf 23 -y "${outputPath}"`;

    await execWithLargeBuffer(ffmpegCmd);
    return outputPath;
  }

  /**
   * DEPRECATED: Método antigo com 2 segmentos
   */
  private async createVideoWithOverlay(
    canvaPngPath: string,
    voiceoverPath: string,
    musicPath: string | null,
    carlaScript: string,
    brunoScript: string,
    tempDir: string
  ): Promise<string> {
    try {
      const outputPath = path.join(tempDir, 'final-video.mp4');

      // Preparar textos para overlay (sanitizar aspas e caracteres especiais)
      const carlaText = carlaScript.replace(/'/g, "'\\''").substring(0, 200);
      const brunoText = brunoScript.replace(/'/g, "'\\''").substring(0, 200);

      // FFmpeg: PNG estático → Vídeo 60s com overlay de textos + áudio
      let ffmpegCmd = `ffmpeg -loop 1 -i "${canvaPngPath}" -i "${voiceoverPath}"`;

      if (musicPath) {
        ffmpegCmd += ` -i "${musicPath}"`;
      }

      // Filtros de vídeo e áudio (Instagram Reels 4:5 - 1080x1350)
      let filterComplex = `[0:v]scale=1080:1350,format=yuv420p`;

      // Overlay texto Carla (0-25s)
      // Posicionamento vertical otimizado para 1080x1350
      filterComplex += `,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:text='${carlaText}':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,25)'`;

      // Overlay texto Bruno (25-60s)
      filterComplex += `,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial Bold.ttf:text='${brunoText}':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,25,60)'[v]`;

      // Áudio: voz + música
      if (musicPath) {
        filterComplex += `;[1:a]volume=1.0[voice];[2:a]afade=t=in:st=0:d=2,afade=t=out:st=58:d=2,volume=0.15[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[a]`;
        ffmpegCmd += ` -filter_complex "${filterComplex}" -map "[v]" -map "[a]"`;
      } else {
        filterComplex += `;[1:a]volume=1.0[a]`;
        ffmpegCmd += ` -filter_complex "${filterComplex}" -map "[v]" -map "[a]"`;
      }

      ffmpegCmd += ` -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -t 60 -y "${outputPath}"`;

      console.log(`🎬 Executando FFmpeg...`);
      await execWithLargeBuffer(ffmpegCmd);

      console.log(`✅ Vídeo final criado: ${outputPath}`);
      return outputPath;
    } catch (error: any) {
      console.error(`❌ Erro ao criar vídeo: ${error.message}`);
      console.error(`Stderr: ${error.stderr}`);
      throw error;
    }
  }

  /**
   * Upload para Supabase Storage
   */
  private async uploadToSupabase(videoPath: string, contentId: string): Promise<string> {
    try {
      const videoBuffer = fs.readFileSync(videoPath);
      const fileName = `canva-reel-${contentId}-${Date.now()}.mp4`;

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
    } catch (error: any) {
      console.error(`❌ Erro no upload: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup de arquivos temporários
   */
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
}
