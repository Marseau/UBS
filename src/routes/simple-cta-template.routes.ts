import express, { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import axios from 'axios';

const router = express.Router();
const execAsync = promisify(exec);

/**
 * 🎬 Template Básico CTA - Geração Rápida sem Canva
 *
 * Cria um vídeo CTA simples usando apenas FFmpeg:
 * - Background gradiente
 * - Logo/Texto animado
 * - Link destacado
 * - Locução com ElevenLabs
 *
 * Endpoint: POST /api/simple-cta-template/generate
 */

interface CTATemplateRequest {
  logo_text?: string;        // Ex: "UBS"
  url_text?: string;         // Ex: "universalbookingsystem.com.br"
  cta_message?: string;     // Ex: "↓ CLIQUE NO LINK ↓"
  voiceover_script: string; // Script para ElevenLabs
  background_color?: string; // Ex: "#1a1a2e" (hex color)
}

router.post('/generate', async (req: Request, res: Response): Promise<any> => {
  const tempDir = path.join(os.tmpdir(), `cta-template-${Date.now()}`);

  try {
    console.log('🎬 Iniciando geração de template CTA básico...');

    // Criar diretório temporário
    fs.mkdirSync(tempDir, { recursive: true });

    const {
      logo_text = 'UBS',
      url_text = 'universalbookingsystem.com.br',
      cta_message = '↓ CLIQUE NO LINK ↓',
      voiceover_script,
      background_color = '#1a1a2e'
    } = req.body as CTATemplateRequest;

    if (!voiceover_script) {
      return res.status(400).json({
        error: 'voiceover_script é obrigatório',
        example: {
          voiceover_script: 'Para saber mais, clique no link abaixo e nos siga para acompanhar as novidades!'
        }
      });
    }

    // 1. Gerar locução com ElevenLabs
    console.log('🎙️ Gerando locução com ElevenLabs...');
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = 'yQtGAPI0R2jQuAXxLWk1'; // Bruno - Portuguese (Brazilian)

    if (!elevenLabsApiKey) {
      throw new Error('ELEVENLABS_API_KEY não configurada');
    }

    const voiceResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: voiceover_script,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
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

    const voiceoverPath = path.join(tempDir, 'voiceover.mp3');
    fs.writeFileSync(voiceoverPath, voiceResponse.data);

    // Obter duração do áudio
    const probeCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voiceoverPath}"`;
    const { stdout: durationStr } = await execAsync(probeCommand);
    const audioDuration = parseFloat(durationStr.trim());

    console.log(`⏱️ Duração do áudio: ${audioDuration.toFixed(2)}s`);

    // 2. Criar vídeo com FFmpeg (background gradiente + texto animado)
    console.log('✨ Criando vídeo com animações...');
    const outputVideoPath = path.join(tempDir, 'cta-video.mp4');

    // Converter hex color para RGB para o gradiente
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (result && result[1] && result[2] && result[3]) {
        return {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        };
      }
      return { r: 26, g: 26, b: 46 }; // fallback
    };

    const bgColor = hexToRgb(background_color || '#1a1a2e');

    // Escape single quotes in text content for FFmpeg
    const escapedLogoText = logo_text.replace(/'/g, "'\\''");
    const escapedUrlText = url_text.replace(/'/g, "'\\''");
    const escapedCtaMessage = cta_message.replace(/'/g, "'\\''");

    // FFmpeg command com background gradiente + texto animado com alpha pulsing
    const ffmpegCommand = `ffmpeg -f lavfi -i "color=c=#${background_color}:s=1080x1080:d=${audioDuration},format=rgb24[bg]; \
      [bg]gradients=s=1080x1080:d=${audioDuration}:speed=0.5:n=2:start=${bgColor.r}/${bgColor.g}/${bgColor.b}:end=0/102/204[gradient]" \
      -i "${voiceoverPath}" \
      -filter_complex "\
        [gradient]drawtext=\
          text='${escapedLogoText}':\
          fontfile=/System/Library/Fonts/Helvetica.ttc:\
          fontsize=140:\
          fontcolor=white:\
          x=(w-text_w)/2:\
          y=200:\
          alpha='0.7+0.3*abs(sin(3*PI*t/${audioDuration}))':\
          shadowcolor=cyan@0.8:\
          shadowx=8:\
          shadowy=8[logo];\
        [logo]drawtext=\
          text='${escapedUrlText}':\
          fontfile=/System/Library/Fonts/Helvetica.ttc:\
          fontsize=50:\
          fontcolor=yellow:\
          x=(w-text_w)/2:\
          y=h-350:\
          alpha='0.7+0.3*abs(sin(4*PI*t/${audioDuration}))':\
          shadowcolor=orange@0.8:\
          shadowx=6:\
          shadowy=6[url];\
        [url]drawtext=\
          text='${escapedCtaMessage}':\
          fontfile=/System/Library/Fonts/Helvetica.ttc:\
          fontsize=70:\
          fontcolor=lime:\
          x=(w-text_w)/2:\
          y=h-150:\
          alpha='0.4+0.6*abs(sin(6*PI*t/${audioDuration}))':\
          box=1:\
          boxcolor=black@0.7:\
          boxborderw=15[v]" \
      -map "[v]" -map 1:a \
      -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
      -c:a aac -b:a 192k \
      -t ${audioDuration} \
      -y "${outputVideoPath}"`;

    await execAsync(ffmpegCommand);

    console.log('✅ Vídeo CTA gerado com sucesso!');
    console.log(`📁 Arquivo: ${outputVideoPath}`);
    console.log(`📊 Tamanho: ${(fs.statSync(outputVideoPath).size / 1024 / 1024).toFixed(2)} MB`);

    // Retornar o vídeo
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="cta-video-${Date.now()}.mp4"`);

    const videoStream = fs.createReadStream(outputVideoPath);
    videoStream.pipe(res);

    // Cleanup após envio
    videoStream.on('end', () => {
      setTimeout(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log('🧹 Arquivos temporários removidos');
      }, 1000);
    });

  } catch (error: any) {
    console.error('❌ Erro ao gerar template CTA:', error);

    // Cleanup em caso de erro
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    res.status(500).json({
      error: 'Erro ao gerar vídeo CTA',
      message: error.message,
      details: error.stderr || error.stdout
    });
  }
});

/**
 * GET /test - Endpoint de teste rápido
 */
router.get('/test', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Simple CTA Template API está funcionando!',
    endpoint: 'POST /api/simple-cta-template/generate',
    example_body: {
      logo_text: 'UBS',
      url_text: 'universalbookingsystem.com.br',
      cta_message: '↓ CLIQUE NO LINK ↓',
      voiceover_script: 'Para saber mais, clique no link abaixo e nos siga para acompanhar as novidades!',
      background_color: '#1a1a2e'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
