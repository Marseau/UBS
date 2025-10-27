import express, { Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = express.Router();

/**
 * POST /api/animated-cta-test/generate
 * Gera apenas o slide CTA animado com template #4835
 * Animações: zoom no logo, setas pulsando, locução sincronizada
 */
router.post('/generate', async (req: Request, res: Response) => {
  console.log('🎬 Gerando slide CTA ANIMADO (duplicando último slide da apresentação)...');

  const tempDir = path.join(os.tmpdir(), `animated-cta-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // URL do último slide da apresentação (fornecida pelo usuário)
    const lastSlideUrl = req.body.last_slide_url ||
      "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-58256571e589344c63b52f611e42d1e6-uvhdhxjb.jpg";

    console.log('📥 Baixando último slide da apresentação...');

    // 1. Download do último slide
    const slideImagePath = path.join(tempDir, 'last-slide.jpg');
    const slideResponse = await axios.get(lastSlideUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(slideImagePath, slideResponse.data);

    console.log('✅ Último slide baixado - será usado como base para o CTA animado');

    // 4. Gerar locução do CTA
    console.log('🎙️ Gerando locução do CTA...');
    const ctaScript = req.body.voiceover_script || 'Para saber mais, clique no link abaixo e nos siga para acompanhar as novidades!';
    const voiceId = process.env.ELEVENLABS_VOICE_ID_Bruno || '';

    const voiceResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: ctaScript,
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
          'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    const voiceoverPath = path.join(tempDir, 'cta-voiceover.mp3');
    fs.writeFileSync(voiceoverPath, voiceResponse.data);

    // Detectar duração do áudio
    const durationOutput = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voiceoverPath}"`
    );
    const audioDuration = parseFloat(durationOutput.stdout.trim());
    console.log(`✅ Locução gerada: ${audioDuration.toFixed(2)}s`);

    // 3. Criar vídeo com animações usando o slide duplicado
    console.log('✨ Aplicando animações ao TEXTO e LOGO (não ao slide inteiro)...');
    const outputVideoPath = path.join(tempDir, 'cta-animated.mp4');

    // Animações com FFmpeg - APENAS no texto/logo (overlay pulsante), slide permanece estático:
    // - Logo UBS no topo: pulso de brilho (alpha blinking)
    // - Texto do link: pulso de brilho (alpha blinking)
    // - Seta indicadora piscando "↓ CLIQUE NO LINK ↓"
    const animationCommand = `ffmpeg -loop 1 -i "${slideImagePath}" -i "${voiceoverPath}" \
      -filter_complex "\
        [0:v]scale=1080:1080,fps=30[base];\
        [base]drawtext=\
          text='UBS':\
          fontfile=/System/Library/Fonts/Helvetica.ttc:\
          fontsize=120:\
          fontcolor=white:\
          x=(w-text_w)/2:\
          y=80:\
          alpha='0.6+0.4*abs(sin(3*PI*t/${audioDuration}))':\
          shadowcolor=cyan:\
          shadowx=6:\
          shadowy=6:\
          box=0[logo];\
        [logo]drawtext=\
          text='universalbookingsystem.com.br':\
          fontfile=/System/Library/Fonts/Helvetica.ttc:\
          fontsize=70:\
          fontcolor=yellow:\
          x=(w-text_w)/2:\
          y=h-250:\
          alpha='0.6+0.4*abs(sin(4*PI*t/${audioDuration}))':\
          shadowcolor=orange:\
          shadowx=5:\
          shadowy=5[link];\
        [link]drawtext=\
          text='↓ CLIQUE NO LINK ↓':\
          fontfile=/System/Library/Fonts/Helvetica.ttc:\
          fontsize=60:\
          fontcolor=lime:\
          x=(w-text_w)/2:\
          y=h-120:\
          alpha='0.3+0.7*abs(sin(8*PI*t/${audioDuration}))':\
          box=1:\
          boxcolor=black@0.6:\
          boxborderw=10[v]" \
      -map "[v]" -map 1:a \
      -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
      -c:a aac -b:a 192k \
      -t ${audioDuration} \
      -y "${outputVideoPath}"`;

    await execAsync(animationCommand);
    console.log('✅ Vídeo CTA animado gerado com sucesso!');

    // 4. Abrir vídeo para visualização
    console.log(`\n🎥 Abrindo vídeo: ${outputVideoPath}`);
    await execAsync(`open "${outputVideoPath}"`);

    return res.status(200).json({
      success: true,
      video_url: outputVideoPath,
      duration_seconds: audioDuration,
      source_slide: lastSlideUrl,
      voiceover_url: voiceoverPath,
      animations: {
        zoom_pulse: true,
        brightness_oscillation: true,
        arrow_blink: true,
        call_to_action: true
      },
      message: `Slide CTA animado gerado com sucesso a partir do último slide! (${audioDuration.toFixed(1)}s)`
    });

  } catch (error: any) {
    console.error('❌ Erro ao gerar slide CTA animado:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate animated CTA slide',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/animated-cta-test/generate-simple
 * Gera slide CTA SEM animações (para comparação)
 */
router.post('/generate-simple', async (req: Request, res: Response) => {
  console.log('🎬 Gerando slide CTA ESTÁTICO (sem animações)...');

  const tempDir = path.join(os.tmpdir(), `simple-cta-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Usar imagem existente de exemplo
    const ctaImageUrl = "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-c7fe86ad0cedadeb0259ffdcb05bab7a-a6shtr8z.jpg";

    const imagePath = path.join(tempDir, 'cta-static.jpg');
    const imageResponse = await axios.get(ctaImageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(imagePath, imageResponse.data);

    const ctaScript = 'Para saber mais, clique no link abaixo e nos siga para acompanhar as novidades!';
    const voiceId = process.env.ELEVENLABS_VOICE_ID_Bruno || '';

    const voiceResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: ctaScript,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    const voiceoverPath = path.join(tempDir, 'cta-voiceover.mp3');
    fs.writeFileSync(voiceoverPath, voiceResponse.data);

    const durationOutput = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voiceoverPath}"`
    );
    const audioDuration = parseFloat(durationOutput.stdout.trim());

    const outputVideoPath = path.join(tempDir, 'cta-static.mp4');

    // Vídeo simples sem animações
    const simpleCommand = `ffmpeg -loop 1 -i "${imagePath}" -i "${voiceoverPath}" \
      -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
      -c:a aac -b:a 192k \
      -t ${audioDuration} \
      -y "${outputVideoPath}"`;

    await execAsync(simpleCommand);

    await execAsync(`open "${outputVideoPath}"`);

    return res.status(200).json({
      success: true,
      video_url: outputVideoPath,
      duration_seconds: audioDuration,
      animations: false,
      message: 'Slide CTA estático gerado (sem animações)'
    });

  } catch (error: any) {
    console.error('❌ Erro:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
