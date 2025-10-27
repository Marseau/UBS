import express, { Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import multer from 'multer';

const execAsync = promisify(exec);
const router = express.Router();

// Configurar multer para upload de imagens
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'));
    }
  }
});

/**
 * POST /api/n8n-cta-webhook/generate-from-url
 * Webhook para N8N: Recebe URL da imagem do Canva e gera vídeo CTA
 *
 * Workflow N8N:
 * 1. Google Drive Trigger (detecta novo arquivo Canva)
 * 2. Upload para Imgur/S3
 * 3. Chama este webhook com URL
 * 4. Retorna URL do vídeo gerado
 */
router.post('/generate-from-url', async (req: Request, res: Response) => {
  console.log('🔔 Webhook N8N recebido - Gerando vídeo CTA...');

  const tempDir = path.join(os.tmpdir(), `n8n-cta-video-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const { image_url, voiceover_script, webhook_callback_url } = req.body;

    if (!image_url) {
      return res.status(400).json({
        success: false,
        error: 'image_url é obrigatório'
      });
    }

    console.log('📥 Baixando imagem do Canva:', image_url);

    // 1. Download da imagem
    const imagePath = path.join(tempDir, 'canva-design.png');
    const imageResponse = await axios.get(image_url, { responseType: 'arraybuffer' });
    fs.writeFileSync(imagePath, imageResponse.data);

    console.log('✅ Imagem baixada com sucesso');

    // 2. Gerar locução com ElevenLabs
    console.log('🎙️ Gerando locução...');
    const script = voiceover_script || 'Para saber mais, clique no link abaixo e nos siga para acompanhar as novidades!';
    const voiceId = process.env.ELEVENLABS_VOICE_ID_Bruno || '';

    const voiceResponse = await axios.post(
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
          'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    const voiceoverPath = path.join(tempDir, 'voiceover.mp3');
    fs.writeFileSync(voiceoverPath, voiceResponse.data);

    // Detectar duração
    const durationOutput = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voiceoverPath}"`
    );
    const audioDuration = parseFloat(durationOutput.stdout.trim());
    console.log(`✅ Locução gerada: ${audioDuration.toFixed(2)}s`);

    // 3. Criar vídeo com FFmpeg
    console.log('🎬 Criando vídeo final...');
    const outputVideoPath = path.join(tempDir, 'cta-video.mp4');

    const ffmpegCommand = `ffmpeg -loop 1 -i "${imagePath}" -i "${voiceoverPath}" \
      -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
      -c:a aac -b:a 192k \
      -t ${audioDuration} \
      -y "${outputVideoPath}"`;

    await execAsync(ffmpegCommand);
    console.log('✅ Vídeo gerado com sucesso!');

    // 4. Se houver callback URL do N8N, notificar conclusão
    if (webhook_callback_url) {
      console.log('📡 Enviando callback para N8N...');
      await axios.post(webhook_callback_url, {
        success: true,
        video_path: outputVideoPath,
        duration: audioDuration,
        source_image: image_url
      });
    }

    // 5. Abrir vídeo (opcional)
    await execAsync(`open "${outputVideoPath}"`);

    return res.status(200).json({
      success: true,
      video_url: outputVideoPath,
      duration_seconds: audioDuration,
      source_image_url: image_url,
      voiceover_script: script,
      message: `Vídeo CTA gerado via N8N webhook! (${audioDuration.toFixed(1)}s)`
    });

  } catch (error: any) {
    console.error('❌ Erro no webhook N8N:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate CTA video from webhook',
      message: error.message
    });
  }
});

/**
 * POST /api/n8n-cta-webhook/generate-from-upload
 * Upload direto de imagem do Canva via N8N
 *
 * Workflow N8N:
 * 1. Google Drive Trigger
 * 2. Download file binary
 * 3. POST multipart/form-data com arquivo
 */
router.post('/generate-from-upload', upload.single('image'), async (req: Request, res: Response) => {
  console.log('📤 Webhook N8N com upload - Gerando vídeo CTA...');

  const tempDir = path.join(os.tmpdir(), `n8n-upload-cta-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Arquivo de imagem é obrigatório'
      });
    }

    const { voiceover_script } = req.body;

    console.log('✅ Imagem recebida:', req.file.originalname);

    // 1. Salvar imagem enviada
    const imagePath = path.join(tempDir, 'canva-design.png');
    fs.writeFileSync(imagePath, req.file.buffer);

    // 2. Gerar locução
    console.log('🎙️ Gerando locução...');
    const script = voiceover_script || 'Para saber mais, clique no link abaixo e nos siga para acompanhar as novidades!';
    const voiceId = process.env.ELEVENLABS_VOICE_ID_Bruno || '';

    const voiceResponse = await axios.post(
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
          'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    const voiceoverPath = path.join(tempDir, 'voiceover.mp3');
    fs.writeFileSync(voiceoverPath, voiceResponse.data);

    const durationOutput = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voiceoverPath}"`
    );
    const audioDuration = parseFloat(durationOutput.stdout.trim());
    console.log(`✅ Locução gerada: ${audioDuration.toFixed(2)}s`);

    // 3. Criar vídeo
    console.log('🎬 Criando vídeo final...');
    const outputVideoPath = path.join(tempDir, 'cta-video.mp4');

    const ffmpegCommand = `ffmpeg -loop 1 -i "${imagePath}" -i "${voiceoverPath}" \
      -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
      -c:a aac -b:a 192k \
      -t ${audioDuration} \
      -y "${outputVideoPath}"`;

    await execAsync(ffmpegCommand);
    console.log('✅ Vídeo gerado com sucesso!');

    await execAsync(`open "${outputVideoPath}"`);

    return res.status(200).json({
      success: true,
      video_url: outputVideoPath,
      duration_seconds: audioDuration,
      source_file: req.file.originalname,
      file_size: req.file.size,
      message: `Vídeo CTA gerado via upload N8N! (${audioDuration.toFixed(1)}s)`
    });

  } catch (error: any) {
    console.error('❌ Erro no webhook upload:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/n8n-cta-webhook/test
 * Endpoint de teste para validar conexão N8N
 */
router.get('/test', (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    message: 'N8N CTA Webhook está funcionando!',
    endpoints: {
      generate_from_url: 'POST /api/n8n-cta-webhook/generate-from-url',
      generate_from_upload: 'POST /api/n8n-cta-webhook/generate-from-upload'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
