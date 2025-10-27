import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const execAsync = promisify(exec);

interface KeywordExtractionResult {
  keywords: string[];
  duration_per_keyword: number; // seconds per visual segment
}

interface VideoClip {
  url: string;
  download_url: string;
  duration: number;
  keyword: string;
}

interface BRollGenerationResult {
  video_url: string;
  video_duration_seconds: number;
  cost_usd: number;
  clips_used: number;
  carla_duration: number;
  bruno_duration: number;
}

/**
 * B-Roll Video Generator Service
 * Gera vídeos usando stock footage + narração em vez de avatars D-ID
 *
 * Workflow:
 * 1. Extrai keywords visuais do script via LLM
 * 2. Busca clips em Pexels API (grátis, HD)
 * 3. Gera áudio via ElevenLabs (Carla + Bruno)
 * 4. Combina clips + áudio com FFmpeg
 * 5. Upload para Supabase Storage
 */
class BRollVideoGeneratorService {
  private readonly ELEVENLABS_API_KEY: string;
  private readonly ELEVENLABS_VOICE_ID_CARLA: string;
  private readonly ELEVENLABS_VOICE_ID_BRUNO: string;
  private readonly PEXELS_API_KEY: string;
  private readonly OPENAI_API_KEY: string;

  private supabase;
  private openai: OpenAI;

  // Custos (USD)
  private readonly ELEVENLABS_COST_PER_1K_CHARS = 0.30; // Eleven Labs pricing
  private readonly VIDEO_GENERATION_COST = 0.00; // Pexels é grátis!

  constructor() {
    this.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
    this.ELEVENLABS_VOICE_ID_CARLA = process.env.ELEVENLABS_VOICE_ID_CARLA || '';
    this.ELEVENLABS_VOICE_ID_BRUNO = process.env.ELEVENLABS_VOICE_ID_BRUNO || '';
    this.PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
    this.OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    this.openai = new OpenAI({ apiKey: this.OPENAI_API_KEY });

    if (!this.ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }
    if (!this.PEXELS_API_KEY) {
      throw new Error('PEXELS_API_KEY not configured');
    }
    if (!this.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }
  }

  /**
   * Extrai keywords visuais do script usando GPT-4
   * Analisa o conteúdo e sugere termos de busca para footage
   */
  private async extractVisualKeywords(
    carlaScript: string,
    brunoScript: string,
    targetDuration: number
  ): Promise<KeywordExtractionResult> {
    const fullScript = `Carla: ${carlaScript}\n\nBruno: ${brunoScript}`;

    const prompt = `Você é um diretor de vídeo especializado em selecionar B-roll footage.

Analise este script de vídeo e extraia ${Math.ceil(targetDuration / 5)} keywords visuais para buscar stock footage (5 segundos por clip).

REGRAS:
- Keywords devem ser GENÉRICAS e VISUAIS (não conceitos abstratos)
- Preferir: "business meeting", "laptop work", "office team", "smartphone typing"
- Evitar: "agendamento", "conversão", "leads" (conceitos abstratos)
- Keywords em INGLÊS (Pexels API)
- 1 keyword por segmento de ~5 segundos

SCRIPT:
${fullScript}

Responda APENAS com JSON:
{
  "keywords": ["keyword1", "keyword2", ...],
  "duration_per_keyword": 5
}`;

    console.log('🎬 Extraindo keywords visuais via GPT-4...');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500
    });

    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content) as KeywordExtractionResult;

    console.log(`✅ Extraídas ${result.keywords.length} keywords: ${result.keywords.join(', ')}`);

    return result;
  }

  /**
   * Busca vídeo clip no Pexels API
   * Fallback para Pixabay se Pexels falhar
   */
  private async searchVideoClip(keyword: string): Promise<VideoClip | null> {
    try {
      console.log(`🔍 Buscando clip para: "${keyword}"`);

      // Pexels API
      const response = await axios.get('https://api.pexels.com/videos/search', {
        headers: {
          Authorization: this.PEXELS_API_KEY
        },
        params: {
          query: keyword,
          per_page: 5,
          orientation: 'portrait', // 9:16 para Instagram
          size: 'medium'
        }
      });

      if (response.data.videos && response.data.videos.length > 0) {
        const video = response.data.videos[0];
        const videoFile = video.video_files?.find((f: any) =>
          f.quality === 'hd' && f.width < f.height // Portrait orientation
        ) || video.video_files?.[0];

        console.log(`✅ Clip encontrado: ${videoFile.link.substring(0, 50)}...`);

        return {
          url: video.url,
          download_url: videoFile.link,
          duration: video.duration || 5,
          keyword
        };
      }

      console.warn(`⚠️ Nenhum clip encontrado para "${keyword}"`);
      return null;
    } catch (error: any) {
      console.error(`❌ Erro buscando clip para "${keyword}":`, error.message);
      return null;
    }
  }

  /**
   * Baixa vídeo clip do Pexels
   */
  private async downloadClip(clip: VideoClip, index: number, tempDir: string): Promise<string> {
    const clipPath = path.join(tempDir, `clip-${index}.mp4`);

    console.log(`⬇️ Baixando clip ${index + 1}: ${clip.keyword}`);

    const response = await axios.get(clip.download_url, { responseType: 'stream' });
    const writer = fs.createWriteStream(clipPath);

    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', () => {
        console.log(`✅ Clip ${index + 1} baixado`);
        resolve(clipPath);
      });
      writer.on('error', reject);
    });
  }

  /**
   * Gera áudio via ElevenLabs (reutiliza lógica do single-video-generator)
   */
  private async generateAudio(
    voiceId: string,
    text: string,
    speaker: string
  ): Promise<{ audioPath: string; duration: number; cost: number }> {
    console.log(`🎤 Gerando áudio ${speaker} via ElevenLabs...`);

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
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

    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const audioPath = path.join(tempDir, `audio-${speaker.toLowerCase()}-${timestamp}.mp3`);

    fs.writeFileSync(audioPath, response.data);

    // Calcula duração via FFprobe
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    );
    const duration = parseFloat(stdout.trim());

    // Calcula custo
    const charCount = text.length;
    const cost = (charCount / 1000) * this.ELEVENLABS_COST_PER_1K_CHARS;

    console.log(`✅ Áudio ${speaker} gerado: ${duration.toFixed(1)}s, custo: $${cost.toFixed(4)}`);

    return { audioPath, duration, cost };
  }

  /**
   * Mescla áudios Carla + Bruno
   */
  private async mergeAudios(
    carlaAudioPath: string,
    brunoAudioPath: string,
    tempDir: string
  ): Promise<string> {
    const timestamp = Date.now();
    const mergedAudioPath = path.join(tempDir, `merged-${timestamp}.mp3`);
    const concatListPath = path.join(tempDir, `concat-${timestamp}.txt`);

    fs.writeFileSync(concatListPath, `file '${carlaAudioPath}'\nfile '${brunoAudioPath}'`);

    console.log('🔊 Mesclando áudios Carla + Bruno com FFmpeg...');

    await execAsync(
      `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${mergedAudioPath}"`
    );

    console.log('✅ Áudios mesclados');

    return mergedAudioPath;
  }

  /**
   * Corta clip para duração específica
   */
  private async trimClip(
    inputPath: string,
    duration: number,
    index: number,
    tempDir: string
  ): Promise<string> {
    const outputPath = path.join(tempDir, `clip-trimmed-${index}.mp4`);

    await execAsync(
      `ffmpeg -i "${inputPath}" -t ${duration} -c copy "${outputPath}"`
    );

    return outputPath;
  }

  /**
   * Combina clips de vídeo + áudio com FFmpeg
   * Sincroniza duração dos clips com duração do áudio
   */
  private async combineClipsWithAudio(
    clipPaths: string[],
    audioPath: string,
    tempDir: string
  ): Promise<string> {
    const timestamp = Date.now();
    const outputPath = path.join(tempDir, `final-video-${timestamp}.mp4`);

    console.log(`🎬 Combinando ${clipPaths.length} clips com áudio...`);

    // Concatena todos os clips em um único vídeo
    const concatListPath = path.join(tempDir, `clips-concat-${timestamp}.txt`);
    const concatContent = clipPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    const concatenatedVideoPath = path.join(tempDir, `concatenated-${timestamp}.mp4`);

    // Step 1: Concatenar clips
    await execAsync(
      `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${concatenatedVideoPath}"`
    );

    // Step 2: Adicionar áudio e ajustar duração
    await execAsync(
      `ffmpeg -i "${concatenatedVideoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`
    );

    console.log('✅ Vídeo final gerado com áudio sincronizado');

    return outputPath;
  }

  /**
   * Upload para Supabase Storage
   */
  private async uploadToSupabaseStorage(
    videoPath: string,
    contentId: string
  ): Promise<string> {
    console.log('📤 Fazendo upload para Supabase Storage...');

    const videoBuffer = fs.readFileSync(videoPath);
    const fileName = `broll-video-${contentId}-${Date.now()}.mp4`;

    const { data, error } = await this.supabase.storage
      .from('instagram-reels')
      .upload(fileName, videoBuffer, {
        contentType: 'video/mp4',
        upsert: false
      });

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    const { data: publicUrlData } = this.supabase.storage
      .from('instagram-reels')
      .getPublicUrl(fileName);

    console.log('✅ Upload completo:', publicUrlData.publicUrl);

    return publicUrlData.publicUrl;
  }

  /**
   * MÉTODO PRINCIPAL: Gera vídeo B-Roll completo
   */
  async generateBRollVideo(
    carlaScript: string,
    brunoScript: string,
    contentId: string
  ): Promise<BRollGenerationResult> {
    const tempDir = os.tmpdir();

    try {
      console.log('🎬 ========== INICIANDO GERAÇÃO B-ROLL VIDEO ==========');

      // Step 1: Gerar áudios (Carla + Bruno)
      const [carlaAudio, brunoAudio] = await Promise.all([
        this.generateAudio(this.ELEVENLABS_VOICE_ID_CARLA, carlaScript, 'Carla'),
        this.generateAudio(this.ELEVENLABS_VOICE_ID_BRUNO, brunoScript, 'Bruno')
      ]);

      const totalAudioDuration = carlaAudio.duration + brunoAudio.duration;
      const totalAudioCost = carlaAudio.cost + brunoAudio.cost;

      console.log(`🎤 Áudio total: ${totalAudioDuration.toFixed(1)}s, custo: $${totalAudioCost.toFixed(4)}`);

      // Step 2: Mesclar áudios
      const mergedAudioPath = await this.mergeAudios(
        carlaAudio.audioPath,
        brunoAudio.audioPath,
        tempDir
      );

      // Step 3: Extrair keywords visuais
      const { keywords, duration_per_keyword } = await this.extractVisualKeywords(
        carlaScript,
        brunoScript,
        totalAudioDuration
      );

      // Step 4: Buscar e baixar clips
      const clips: VideoClip[] = [];
      for (const keyword of keywords) {
        const clip = await this.searchVideoClip(keyword);
        if (clip && clip.download_url) {
          clips.push(clip);
        }
      }

      if (clips.length === 0) {
        throw new Error('Nenhum clip encontrado para os keywords');
      }

      console.log(`📹 ${clips.length} clips encontrados, baixando...`);

      const clipPaths: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        if (!clip) continue;

        const clipPath = await this.downloadClip(clip, i, tempDir);

        // Cortar clip para duração desejada (~5s ou duration_per_keyword)
        const trimmedPath = await this.trimClip(
          clipPath,
          duration_per_keyword,
          i,
          tempDir
        );

        clipPaths.push(trimmedPath);
      }

      // Step 5: Combinar clips + áudio
      const finalVideoPath = await this.combineClipsWithAudio(
        clipPaths,
        mergedAudioPath,
        tempDir
      );

      // Step 6: Upload para Supabase
      const publicUrl = await this.uploadToSupabaseStorage(finalVideoPath, contentId);

      // Step 7: Limpar arquivos temporários
      console.log('🧹 Limpando arquivos temporários...');
      [
        carlaAudio.audioPath,
        brunoAudio.audioPath,
        mergedAudioPath,
        finalVideoPath,
        ...clipPaths
      ].forEach(filePath => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

      console.log('🎉 ========== GERAÇÃO B-ROLL COMPLETA ==========');

      return {
        video_url: publicUrl,
        video_duration_seconds: totalAudioDuration,
        cost_usd: totalAudioCost, // Apenas áudio, clips são grátis!
        clips_used: clips.length,
        carla_duration: carlaAudio.duration,
        bruno_duration: brunoAudio.duration
      };

    } catch (error: any) {
      console.error('❌ Erro na geração B-Roll:', error);
      throw error;
    }
  }
}

export const brollVideoGenerator = new BRollVideoGeneratorService();
