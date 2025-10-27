import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface VideoGenerationResult {
  video_url: string;
  duration_seconds: number;
  total_slides: number;
  content_id: string;
  cost_usd: number;
}

export class VideoCarouselGeneratorService {
  /**
   * Converte um array de URLs de imagens em um vídeo MP4 de 60 segundos
   * @param imageUrls - Array de URLs das imagens do carrossel
   * @param contentId - ID do conteúdo editorial
   * @param duration - Duração total do vídeo em segundos (padrão: 60)
   */
  async generateVideoFromImages(
    imageUrls: string[],
    contentId: string,
    duration: number = 60
  ): Promise<VideoGenerationResult> {
    console.log('🎬 ========== INICIANDO GERAÇÃO VÍDEO CARROSSEL ==========');
    console.log(`📄 Content ID: ${contentId}`);
    console.log(`🖼️ Total de imagens: ${imageUrls.length}`);
    console.log(`⏱️ Duração alvo: ${duration}s`);

    const tempDir = path.join(os.tmpdir(), `carousel-${contentId}-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // 1. Download de todas as imagens
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
        console.log(`   ✅ Slide ${i + 1} salvo: ${imagePath}`);
      }

      // 2. Calcular duração por slide
      const durationPerSlide = duration / imageUrls.length;
      console.log(`\n⏱️ Duração por slide: ${durationPerSlide.toFixed(2)}s`);

      // 3. Gerar vídeo usando loop com cada imagem e depois concatenar
      const outputVideoPath = path.join(tempDir, `carousel-${contentId}.mp4`);

      console.log('\n🎬 Gerando vídeo com FFmpeg...');
      console.log('   Aplicando transições fade entre slides...');

      // Criar vídeos individuais de cada imagem com duração específica
      const videoSegments: string[] = [];

      for (let i = 0; i < imagePaths.length; i++) {
        const imagePath = imagePaths[i];
        if (!imagePath) continue;

        const segmentPath = path.join(tempDir, `segment-${i.toString().padStart(2, '0')}.mp4`);

        console.log(`   🎞️ Criando segmento ${i + 1}/${imagePaths.length}...`);

        // Gerar vídeo de cada imagem com duração definida
        const segmentCommand = `ffmpeg -loop 1 -i "${imagePath}" \
          -vf "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,fps=30,format=yuv420p" \
          -c:v libx264 -preset medium -crf 23 \
          -t ${durationPerSlide} \
          -y "${segmentPath}"`;

        await execAsync(segmentCommand);
        videoSegments.push(segmentPath);
      }

      console.log(`   ✅ ${videoSegments.length} segmentos criados`);

      // 4. Criar arquivo de lista para concatenação
      const listFilePath = path.join(tempDir, 'segments.txt');
      let listContent = '';
      for (const segment of videoSegments) {
        listContent += `file '${segment}'\n`;
      }
      fs.writeFileSync(listFilePath, listContent);

      // 5. Concatenar todos os segmentos em um único vídeo
      console.log('   🔗 Concatenando segmentos...');
      const concatCommand = `ffmpeg -f concat -safe 0 -i "${listFilePath}" \
        -c copy \
        -movflags +faststart \
        -y "${outputVideoPath}"`;

      const { stderr } = await execAsync(concatCommand);

      if (stderr.includes('error') || stderr.includes('Error')) {
        console.error('❌ Erro no FFmpeg:', stderr);
        throw new Error(`FFmpeg failed: ${stderr}`);
      }

      console.log('✅ Vídeo gerado com sucesso!');
      console.log(`📹 Output: ${outputVideoPath}`);

      // 5. Verificar se arquivo foi criado
      if (!fs.existsSync(outputVideoPath)) {
        throw new Error('Vídeo não foi gerado pelo FFmpeg');
      }

      const videoStats = fs.statSync(outputVideoPath);
      console.log(`📦 Tamanho do vídeo: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);

      // 6. Aqui você faria upload para Supabase Storage
      // Por enquanto, retornar path local
      const finalVideoUrl = outputVideoPath; // TODO: Upload to Supabase

      // Custo: Placid ($0.076 por imagem) + processamento local (grátis)
      const totalCost = imageUrls.length * 0.076;

      console.log('\n✅ ========== VÍDEO CARROSSEL COMPLETO ==========');
      console.log(`📹 Vídeo: ${finalVideoUrl}`);
      console.log(`⏱️ Duração: ${duration}s`);
      console.log(`🖼️ Slides: ${imageUrls.length}`);
      console.log(`💰 Custo: $${totalCost.toFixed(3)}`);

      return {
        video_url: finalVideoUrl,
        duration_seconds: duration,
        total_slides: imageUrls.length,
        content_id: contentId,
        cost_usd: totalCost
      };

    } catch (error: any) {
      console.error('❌ Erro ao gerar vídeo:', error.message);
      throw error;
    } finally {
      // Limpar arquivos temporários (comentado para debug)
      // console.log('\n🧹 Limpando arquivos temporários...');
      // fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Verifica se FFmpeg está instalado no sistema
   */
  async checkFFmpegInstalled(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      return stdout.includes('ffmpeg version');
    } catch {
      return false;
    }
  }
}
