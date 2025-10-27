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
 * POST /api/canva-cta-video/generate
 * Pipeline completo: Canva Design → ElevenLabs Voiceover → FFmpeg Video
 *
 * Workflow:
 * 1. Criar design CTA personalizado via Canva Autofill API
 * 2. Exportar design como imagem PNG/JPG
 * 3. Gerar locução com ElevenLabs
 * 4. Combinar imagem + áudio em vídeo com FFmpeg
 */
router.post('/generate', async (req: Request, res: Response) => {
  console.log('🎨 Iniciando pipeline Canva → ElevenLabs → FFmpeg...');

  const tempDir = path.join(os.tmpdir(), `canva-cta-video-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // 1. Configuração Canva API
    const canvaAccessToken = process.env.CANVA_ACCESS_TOKEN || '';
    const canvaBrandTemplateId = process.env.CANVA_BRAND_TEMPLATE_ID || '';

    if (!canvaAccessToken || !canvaBrandTemplateId) {
      throw new Error('CANVA_ACCESS_TOKEN e CANVA_BRAND_TEMPLATE_ID são obrigatórios no .env');
    }

    // Dados dinâmicos para autofill do template
    const ctaData = {
      LOGO_TEXT: req.body.logo_text || 'UBS',
      URL_TEXT: req.body.url_text || 'universalbookingsystem.com.br',
      CTA_MESSAGE: req.body.cta_message || 'Clique no link abaixo!',
      BRAND_COLOR: req.body.brand_color || '#0066FF'
    };

    console.log('📋 Dados do CTA:', ctaData);

    // 2. Criar design autofill job no Canva
    console.log('🎨 Criando design no Canva via Autofill API...');

    const autofillPayload = {
      brand_template_id: canvaBrandTemplateId,
      data: {
        LOGO_TEXT: { type: 'text', text: ctaData.LOGO_TEXT },
        URL_TEXT: { type: 'text', text: ctaData.URL_TEXT },
        CTA_MESSAGE: { type: 'text', text: ctaData.CTA_MESSAGE }
      }
    };

    const autofillResponse = await axios.post(
      'https://api.canva.com/rest/v1/autofills',
      autofillPayload,
      {
        headers: {
          'Authorization': `Bearer ${canvaAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const jobId = autofillResponse.data.job.id;
    console.log(`✅ Autofill job criado: ${jobId}`);

    // 3. Aguardar conclusão do job (polling)
    console.log('⏳ Aguardando conclusão do design...');
    let designUrl = '';
    let attempts = 0;
    const maxAttempts = 30; // 30 segundos máximo

    while (attempts < maxAttempts) {
      const statusResponse = await axios.get(
        `https://api.canva.com/rest/v1/autofills/${jobId}`,
        {
          headers: {
            'Authorization': `Bearer ${canvaAccessToken}`
          }
        }
      );

      const status = statusResponse.data.job.status;
      console.log(`📊 Status do job: ${status}`);

      if (status === 'success') {
        designUrl = statusResponse.data.job.result.designs[0].url;
        console.log(`✅ Design criado: ${designUrl}`);
        break;
      } else if (status === 'failed') {
        throw new Error(`Canva autofill job falhou: ${statusResponse.data.job.error}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000)); // Aguardar 1s
      attempts++;
    }

    if (!designUrl) {
      throw new Error('Timeout aguardando conclusão do design no Canva');
    }

    // 4. Exportar design como imagem
    console.log('📥 Exportando design como imagem PNG...');

    const designId = designUrl.split('/').pop(); // Extrair ID do design
    const exportResponse = await axios.post(
      `https://api.canva.com/rest/v1/designs/${designId}/export`,
      {
        format: 'png',
        pages: [1]
      },
      {
        headers: {
          'Authorization': `Bearer ${canvaAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const exportJobId = exportResponse.data.job.id;
    console.log(`✅ Export job criado: ${exportJobId}`);

    // 5. Aguardar export e baixar imagem
    console.log('⏳ Aguardando export da imagem...');
    let imageUrl = '';
    attempts = 0;

    while (attempts < maxAttempts) {
      const exportStatusResponse = await axios.get(
        `https://api.canva.com/rest/v1/exports/${exportJobId}`,
        {
          headers: {
            'Authorization': `Bearer ${canvaAccessToken}`
          }
        }
      );

      const exportStatus = exportStatusResponse.data.job.status;
      console.log(`📊 Status do export: ${exportStatus}`);

      if (exportStatus === 'success') {
        imageUrl = exportStatusResponse.data.job.result.urls[0];
        console.log(`✅ Imagem exportada: ${imageUrl}`);
        break;
      } else if (exportStatus === 'failed') {
        throw new Error(`Canva export job falhou`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    if (!imageUrl) {
      throw new Error('Timeout aguardando export da imagem');
    }

    // 6. Download da imagem
    const imagePath = path.join(tempDir, 'canva-cta.png');
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(imagePath, imageResponse.data);
    console.log('✅ Imagem baixada com sucesso');

    // 7. Gerar locução com ElevenLabs
    console.log('🎙️ Gerando locução com ElevenLabs...');
    const voiceScript = req.body.voiceover_script ||
      'Para saber mais sobre o Universal Booking System, clique no link abaixo e nos siga para acompanhar as novidades!';

    const voiceId = process.env.ELEVENLABS_VOICE_ID_Bruno || '';

    const voiceResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: voiceScript,
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

    // 8. Criar vídeo com FFmpeg
    console.log('🎬 Criando vídeo final com FFmpeg...');
    const outputVideoPath = path.join(tempDir, 'canva-cta-video.mp4');

    const ffmpegCommand = `ffmpeg -loop 1 -i "${imagePath}" -i "${voiceoverPath}" \
      -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
      -c:a aac -b:a 192k \
      -t ${audioDuration} \
      -y "${outputVideoPath}"`;

    await execAsync(ffmpegCommand);
    console.log('✅ Vídeo CTA gerado com sucesso!');

    // 9. Abrir vídeo para visualização
    console.log(`\n🎥 Abrindo vídeo: ${outputVideoPath}`);
    await execAsync(`open "${outputVideoPath}"`);

    return res.status(200).json({
      success: true,
      video_url: outputVideoPath,
      duration_seconds: audioDuration,
      canva_design_url: designUrl,
      image_url: imagePath,
      voiceover_url: voiceoverPath,
      cta_data: ctaData,
      message: `Vídeo CTA gerado via Canva → ElevenLabs → FFmpeg! (${audioDuration.toFixed(1)}s)`
    });

  } catch (error: any) {
    console.error('❌ Erro no pipeline Canva → ElevenLabs → FFmpeg:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate CTA video via Canva pipeline',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/canva-cta-video/templates
 * Lista todos os brand templates disponíveis na conta Canva
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const canvaAccessToken = process.env.CANVA_ACCESS_TOKEN || '';

    if (!canvaAccessToken) {
      throw new Error('CANVA_ACCESS_TOKEN é obrigatório');
    }

    const response = await axios.get(
      'https://api.canva.com/rest/v1/brand-templates',
      {
        headers: {
          'Authorization': `Bearer ${canvaAccessToken}`
        }
      }
    );

    return res.status(200).json({
      success: true,
      templates: response.data.items,
      count: response.data.items.length
    });

  } catch (error: any) {
    console.error('❌ Erro ao listar templates:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
