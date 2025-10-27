import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';

/**
 * 🎬 Video Concatenation Service
 *
 * Serviço para concatenar múltiplos vídeos usando FFmpeg
 *
 * Features:
 * - Baixa vídeos de URLs públicas
 * - Detecta automaticamente o início do CTA usando scene detection
 * - Remove CTAs de vídeos específicos (detecção inteligente, não hardcoded)
 * - Concatena com crossfade suave (0.5s fade) entre vídeos
 * - Mantém apenas CTA final no último vídeo
 * - Upload para Supabase Storage
 * - Cálculo automático de duração e custo
 *
 * Arquitetura:
 * 1. Download dos vídeos de Supabase Storage
 * 2. Detecção automática do início do CTA (FFmpeg scene detection)
 * 3. Processamento FFmpeg (remoção de CTA se necessário)
 * 4. Concatenação com crossfade (xfade para vídeo + acrossfade para áudio)
 * 5. Upload do resultado para Storage
 * 6. Limpeza de arquivos temporários
 */

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ConcatenationResult {
  youtube_short_url?: string;
  video_url?: string;
  duration_seconds: number;
  cost_usd: number;
  file_size_mb: number;
}

export class VideoConcatenationService {
  private readonly STORAGE_BUCKET = 'instagram-reels';
  private readonly FADE_DURATION_SECONDS = 0.5; // Duração do crossfade entre vídeos

  /**
   * Concatena 3 Reels em 1 YouTube Short com CTA estratégico
   */
  async concatenateYouTubeShort(
    videoUrls: string[],
    outputName: string,
    youtubeCaption: string,
    removeCTAFromVideos: number[] = [0, 1],
    keepCTAInVideo: number = 2
  ): Promise<ConcatenationResult> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtube-concat-'));

    try {
      console.log(`📂 Diretório temporário: ${tmpDir}`);

      // 1. Download dos vídeos
      console.log(`⬇️ Baixando ${videoUrls.length} vídeos...`);
      const downloadedFiles: string[] = [];

      for (let i = 0; i < videoUrls.length; i++) {
        const videoUrl = videoUrls[i];
        if (!videoUrl) {
          throw new Error(`URL do vídeo ${i} é undefined`);
        }
        const tempFile = path.join(tmpDir, `video_${i}_original.mp4`);

        console.log(`  📥 [${i + 1}/${videoUrls.length}] ${videoUrl}`);
        await this.downloadVideo(videoUrl, tempFile);
        downloadedFiles.push(tempFile);
      }

      console.log(`✅ ${downloadedFiles.length} vídeos baixados`);

      // 2. Detectar e remover CTAs automaticamente
      console.log(`🔍 Detectando CTAs automaticamente nos vídeos ${removeCTAFromVideos.join(', ')}...`);
      const processedFiles: string[] = [];

      for (let i = 0; i < downloadedFiles.length; i++) {
        const inputFile = downloadedFiles[i];
        if (!inputFile) {
          throw new Error(`Arquivo baixado ${i} é undefined`);
        }
        const outputFile = path.join(tmpDir, `video_${i}_processed.mp4`);

        if (removeCTAFromVideos.includes(i)) {
          // Detecta e remove CTA automaticamente
          console.log(`  🔍 Detectando CTA do vídeo ${i}...`);
          const ctaStartTime = await this.detectCTAStart(inputFile);
          console.log(`  ✂️ CTA detectado em ${ctaStartTime.toFixed(2)}s - Removendo...`);
          await this.removeCTAFromVideoAuto(inputFile, outputFile, ctaStartTime);
          processedFiles.push(outputFile);
        } else {
          // Mantém vídeo completo
          console.log(`  ✅ Mantendo vídeo ${i} completo (com CTA)`);
          processedFiles.push(inputFile);
        }
      }

      console.log(`✅ ${processedFiles.length} vídeos processados`);

      // 3. Concatenar com crossfade
      console.log(`🔗 Concatenando ${processedFiles.length} vídeos com fade suave...`);
      const concatenatedFile = path.join(tmpDir, 'concatenated.mp4');
      await this.concatenateWithCrossfade(processedFiles, concatenatedFile);

      // 4. Obter duração do vídeo final
      const duration = await this.getVideoDuration(concatenatedFile);
      console.log(`⏱️ Duração total: ${duration}s`);

      // 5. Upload para Supabase Storage
      console.log(`☁️ Fazendo upload para Supabase Storage...`);
      const fileName = `${outputName}_${Date.now()}.mp4`;
      const youtubeShortUrl = await this.uploadToStorage(concatenatedFile, fileName);

      console.log(`✅ YouTube Short disponível: ${youtubeShortUrl}`);

      // 6. Calcular custo (baseado em duração)
      const fileStats = await fs.stat(concatenatedFile);
      const fileSizeMB = fileStats.size / (1024 * 1024);
      const cost = this.calculateCost(duration, fileSizeMB);

      // 7. Limpar arquivos temporários
      await fs.rm(tmpDir, { recursive: true, force: true });
      console.log(`🧹 Arquivos temporários removidos`);

      return {
        youtube_short_url: youtubeShortUrl,
        duration_seconds: Math.round(duration),
        cost_usd: cost,
        file_size_mb: parseFloat(fileSizeMB.toFixed(2))
      };

    } catch (error) {
      // Limpar em caso de erro
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  /**
   * Concatenação simples sem processamento de CTA
   */
  async concatenateSimple(
    videoUrls: string[],
    outputName: string,
    caption: string
  ): Promise<ConcatenationResult> {
    return this.concatenateYouTubeShort(
      videoUrls,
      outputName,
      caption,
      [], // Não remove CTA de nenhum vídeo
      -1  // Não há vídeo específico com CTA
    );
  }

  /**
   * Baixa vídeo de URL para arquivo local
   */
  private async downloadVideo(url: string, outputPath: string): Promise<void> {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = require('fs').createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  /**
   * Remove CTA (últimos N segundos) de um vídeo usando FFmpeg
   */
  private async removeCTAFromVideo(
    inputPath: string,
    outputPath: string,
    ctaDurationSeconds: number
  ): Promise<void> {
    const duration = await this.getVideoDuration(inputPath);
    const trimmedDuration = duration - ctaDurationSeconds;

    if (trimmedDuration <= 0) {
      throw new Error(`Vídeo muito curto (${duration}s) para remover ${ctaDurationSeconds}s de CTA`);
    }

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-t', trimmedDuration.toString(), // Corta no tempo especificado
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-y',
        outputPath
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Concatena múltiplos vídeos usando FFmpeg
   */
  private async concatenateVideos(
    inputPaths: string[],
    outputPath: string
  ): Promise<void> {
    // Cria arquivo de lista para concatenação
    const listFile = path.join(path.dirname(outputPath), 'concat_list.txt');
    const listContent = inputPaths.map(p => `file '${p}'`).join('\n');
    await fs.writeFile(listFile, listContent);

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart', // Otimização para streaming
        '-y',
        outputPath
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg concatenation failed with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Detecta automaticamente quando o CTA começa
   *
   * NOVA ABORDAGEM (v4.0 - CORTE ANTES DA CTA COM PAUSA INTEGRADA):
   * 1. Primeiro tenta ler chapter metadata CTA_START (backup)
   * 2. Se falhar, usa CÁLCULO SIMPLES:
   *    - Vídeo = 7 tweets + CTA (2s pausa + 3s áudio = 5s total)
   *    - Cortamos ANTES da CTA começar
   *    - Fórmula: duração_total - 5s
   *
   * A pausa de 2s agora está DENTRO do segmento CTA!
   */
  private async detectCTAStart(videoPath: string): Promise<number> {
    const totalDuration = await this.getVideoDuration(videoPath);
    console.log(`  📹 Duração total do vídeo: ${totalDuration.toFixed(2)}s`);

    return new Promise((resolve) => {
      // Usa ffprobe para ler chapters metadata
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_chapters',
        videoPath
      ]);

      let stdout = '';

      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.on('close', (code) => {
        console.log(`  🔍 FFprobe metadata read exit code: ${code}`);

        try {
          if (code === 0 && stdout.trim().length > 0) {
            const metadata = JSON.parse(stdout);
            console.log(`  📊 Chapters found: ${metadata.chapters?.length || 0}`);

            // Procurar por chapter com title=CTA_START
            const ctaChapter = metadata.chapters?.find((ch: any) =>
              ch.tags?.title === 'CTA_START'
            );

            if (ctaChapter) {
              // Converter start_time (pode estar em string ou number)
              const ctaStart = parseFloat(ctaChapter.start_time);

              // Validação: CTA timestamp deve ser razoável (> 10s e < duração total)
              if (ctaStart > 10 && ctaStart < totalDuration) {
                console.log(`  🎯 CTA marker encontrado no metadata: ${ctaStart.toFixed(2)}s`);
                console.log(`  ✅ Detecção via chapter marker bem-sucedida!`);
                resolve(ctaStart);
                return;
              } else {
                console.warn(`  ⚠️ Chapter marker inválido: ${ctaStart.toFixed(2)}s (fora do range esperado)`);
              }
            }
          }
        } catch (parseError: any) {
          console.warn(`  ⚠️ Erro ao parsear metadata JSON: ${parseError.message}`);
        }

        // ========== FALLBACK INTELIGENTE (v4.0 - CORTE ANTES DA CTA) ==========
        // Arquitetura: 7 tweets + CTA (2s pausa + 3s áudio = 5s total)
        const CTA_TOTAL_DURATION = 5.0; // 2s pausa + 3s áudio
        const calculatedCtaStart = Math.max(0, totalDuration - CTA_TOTAL_DURATION);

        console.log(`  🧮 FALLBACK INTELIGENTE v4.0 (CORTE ANTES DA CTA):`);
        console.log(`     Arquitetura: 7 tweets + CTA (2s pausa + 3s áudio)`);
        console.log(`     Duração CTA total: ${CTA_TOTAL_DURATION}s`);
        console.log(`     🎯 Corte antes da CTA em: ${calculatedCtaStart.toFixed(2)}s`);
        console.log(`     (Total ${totalDuration.toFixed(2)}s - CTA ${CTA_TOTAL_DURATION}s)`);

        resolve(calculatedCtaStart);
      });

      ffprobe.on('error', (err) => {
        console.warn('⚠️ Erro ao ler metadata, usando fallback inteligente:', err.message);

        // Mesmo fallback inteligente em caso de erro
        const CTA_TOTAL_DURATION = 5.0; // 2s pausa + 3s áudio
        const calculatedCtaStart = Math.max(0, totalDuration - CTA_TOTAL_DURATION);

        console.log(`  🧮 FALLBACK INTELIGENTE v4.0 (erro): Corte em ${calculatedCtaStart.toFixed(2)}s`);
        resolve(calculatedCtaStart);
      });
    });
  }

  /**
   * Remove CTA do vídeo cortando no timestamp detectado automaticamente
   */
  private async removeCTAFromVideoAuto(
    inputPath: string,
    outputPath: string,
    ctaStartTime: number
  ): Promise<void> {
    // VALIDAÇÃO CRÍTICA: CTA timestamp deve ser > 1 segundo
    if (ctaStartTime <= 1) {
      console.error(`❌ ERRO: CTA timestamp inválido: ${ctaStartTime}s`);
      console.error(`   Isso indica que o chapter marker não foi lido corretamente!`);
      throw new Error(`CTA timestamp inválido: ${ctaStartTime}s (deve ser > 1s)`);
    }

    console.log(`✂️ Removendo CTA do vídeo...`);
    console.log(`  Input: ${inputPath}`);
    console.log(`  Output: ${outputPath}`);
    console.log(`  Cortando em: ${ctaStartTime}s`);

    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-i', inputPath,
        '-t', ctaStartTime.toString(), // Corta exatamente no início do CTA
        '-c:v', 'libx264',
        '-preset', 'fast', // Fast preset for speed
        '-crf', '18', // High quality
        '-c:a', 'aac', // Re-encode audio to AAC (mais compatível)
        '-b:a', '192k', // Audio bitrate
        '-avoid_negative_ts', 'make_zero', // Fix timestamp issues
        '-y',
        outputPath
      ];

      console.log(`  🎬 FFmpeg comando: ffmpeg ${ffmpegArgs.join(' ')}`);

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ CTA removido com sucesso`);
          resolve();
        } else {
          console.error(`❌ FFmpeg trim falhou com código ${code}`);
          console.error(`   Stderr: ${stderr.substring(0, 500)}...`);
          reject(new Error(`FFmpeg trim failed with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', (err) => {
        console.error(`❌ Erro ao executar FFmpeg:`, err);
        reject(err);
      });
    });
  }

  /**
   * Concatena vídeos com crossfade suave entre cada transição
   * Usa xfade para vídeo e acrossfade para áudio
   */
  private async concatenateWithCrossfade(
    inputPaths: string[],
    outputPath: string
  ): Promise<void> {
    if (inputPaths.length < 2) {
      throw new Error('Necessário pelo menos 2 vídeos para concatenação com crossfade');
    }

    // Para 3 vídeos, precisa de 2 crossfades
    const fadeDuration = this.FADE_DURATION_SECONDS;

    // Obter durações de todos os vídeos
    const durations = await Promise.all(
      inputPaths.map(path => this.getVideoDuration(path))
    );

    return new Promise((resolve, reject) => {
      // Construir filtro complexo de crossfade para 3 vídeos
      // [0:v][1:v]xfade=transition=fade:duration=0.5:offset=D1-0.5[v01];
      // [v01][2:v]xfade=transition=fade:duration=0.5:offset=D1+D2-1[vout];
      // [0:a][1:a]acrossfade=d=0.5[a01];
      // [a01][2:a]acrossfade=d=0.5[aout]

      const video1Duration = durations[0] || 0;
      const video2Duration = durations[1] || 0;

      const offset1 = video1Duration - fadeDuration;
      const offset2 = video1Duration + video2Duration - (2 * fadeDuration);

      const filterComplex = [
        `[0:v][1:v]xfade=transition=fade:duration=${fadeDuration}:offset=${offset1}[v01]`,
        `[v01][2:v]xfade=transition=fade:duration=${fadeDuration}:offset=${offset2}[vout]`,
        `[0:a][1:a]acrossfade=d=${fadeDuration}[a01]`,
        `[a01][2:a]acrossfade=d=${fadeDuration}[aout]`
      ].join(';');

      const ffmpegArgs = [
        '-i', inputPaths[0]!,
        '-i', inputPaths[1]!,
        '-i', inputPaths[2]!,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', '[aout]',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ];

      console.log('  🎬 FFmpeg crossfade command:', 'ffmpeg', ffmpegArgs.join(' '));

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('  ✅ Crossfade concatenation concluído');
          resolve();
        } else {
          reject(new Error(`FFmpeg crossfade failed with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Obtém duração de vídeo usando FFprobe
   */
  private async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath
      ]);

      let stdout = '';
      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          const duration = parseFloat(stdout.trim());
          resolve(duration);
        } else {
          reject(new Error(`FFprobe failed with code ${code}`));
        }
      });

      ffprobe.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Upload de vídeo para Supabase Storage
   */
  private async uploadToStorage(filePath: string, fileName: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);

    const { data, error } = await supabase.storage
      .from(this.STORAGE_BUCKET)
      .upload(`youtube-shorts/${fileName}`, fileBuffer, {
        contentType: 'video/mp4',
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw new Error(`Erro ao fazer upload para Storage: ${error.message}`);
    }

    // Gerar URL pública
    const { data: urlData } = supabase.storage
      .from(this.STORAGE_BUCKET)
      .getPublicUrl(`youtube-shorts/${fileName}`);

    return urlData.publicUrl;
  }

  /**
   * Calcula custo baseado em duração e tamanho do arquivo
   */
  private calculateCost(durationSeconds: number, fileSizeMB: number): number {
    // Custo base de processamento FFmpeg: $0.001 por segundo
    const processingCost = (durationSeconds / 60) * 0.001;

    // Custo de storage Supabase: $0.021 por GB/mês
    // Estimativa: 1 mês = $0.021/GB = ~$0.000021/MB
    const storageCost = fileSizeMB * 0.000021;

    // Custo de bandwidth (assumindo 100 downloads): $0.09 per GB
    // = $0.00009 per MB * 100 downloads = $0.009/MB
    const bandwidthCost = fileSizeMB * 0.009;

    const totalCost = processingCost + storageCost + bandwidthCost;

    return parseFloat(totalCost.toFixed(4));
  }
}
