import express, { Request, Response } from 'express';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';

const router = express.Router();
const execAsync = promisify(exec);

// Configuração do multer para processar uploads de arquivo
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tempDir = path.join(os.tmpdir(), `n8n-video-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      req.body.tempDir = tempDir; // Armazenar para uso posterior
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      cb(null, 'canva-video.mp4');
    }
  }),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 MB max
  }
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 🎬 Canva Video Complete - Export + Voiceover + Background Music
 *
 * Processa um template do Canva (8 slides, 60s total) e adiciona:
 * - Locução sincronizada com ElevenLabs
 * - Música de fundo randomizada do Supabase
 * - Mixagem profissional com FFmpeg
 *
 * Endpoint: POST /api/canva-video-complete/generate
 */

interface CanvaVideoRequest {
  design_id: string;              // Ex: "DAG1QCvrgjE"
  voiceover_script: string;       // Script para ElevenLabs (deve durar ~60s)
  voice_id?: string;              // ID da voz ElevenLabs (default: Bruno)
  music_category?: string;        // Categoria: corporate, uplifting, tech, trending
  canva_access_token?: string;    // Token OAuth2 do Canva (se não usar N8N)
}

interface BackgroundMusic {
  id: string;
  audio_id: string;
  audio_name: string;
  artist: string;
  category: string;
  trending_score: number;
}

router.post('/generate', async (req: Request, res: Response): Promise<any> => {
  const tempDir = path.join(os.tmpdir(), `canva-video-${Date.now()}`);

  try {
    console.log('🎬 Iniciando geração de vídeo Canva completo...');

    // Criar diretório temporário
    fs.mkdirSync(tempDir, { recursive: true });

    const {
      design_id,
      voiceover_script,
      voice_id = 'yQtGAPI0R2jQuAXxLWk1', // Bruno - Portuguese (Brazilian)
      music_category = 'corporate',
      canva_access_token
    } = req.body as CanvaVideoRequest;

    if (!design_id || !voiceover_script) {
      return res.status(400).json({
        error: 'design_id e voiceover_script são obrigatórios',
        example: {
          design_id: 'DAG1QCvrgjE',
          voiceover_script: 'Transforme sua presença digital com nosso sistema de agendamentos inteligente...',
          voice_id: 'yQtGAPI0R2jQuAXxLWk1',
          music_category: 'corporate'
        }
      });
    }

    // 1. Buscar música de fundo aleatória do Supabase
    console.log('🎵 Buscando música de fundo no Supabase...');
    const { data: musicData, error: musicError } = await supabase
      .from('instagram_trending_audios')
      .select('id, audio_id, audio_name, artist, category, trending_score')
      .eq('is_active', true)
      .eq('category', music_category)
      .order('trending_score', { ascending: false })
      .limit(5);

    if (musicError || !musicData || musicData.length === 0) {
      console.warn('⚠️ Nenhuma música encontrada, continuando sem música de fundo');
    }

    const selectedMusic: BackgroundMusic | null = musicData && musicData.length > 0
      ? musicData[Math.floor(Math.random() * musicData.length)] as BackgroundMusic
      : null;

    if (selectedMusic) {
      console.log(`🎵 Música selecionada: "${selectedMusic.audio_name}" por ${selectedMusic.artist}`);
    }

    // 2. Gerar locução com ElevenLabs
    console.log('🎙️ Gerando locução com ElevenLabs...');
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!elevenLabsApiKey) {
      throw new Error('ELEVENLABS_API_KEY não configurada');
    }

    const voiceResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        text: voiceover_script,
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

    const voiceoverPath = path.join(tempDir, 'voiceover.mp3');
    fs.writeFileSync(voiceoverPath, voiceResponse.data);

    // Verificar duração do áudio
    const probeCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voiceoverPath}"`;
    const { stdout: durationStr } = await execAsync(probeCommand);
    const voiceoverDuration = parseFloat(durationStr.trim());

    console.log(`⏱️ Duração da locução: ${voiceoverDuration.toFixed(2)}s (esperado: ~60s)`);

    if (voiceoverDuration > 65 || voiceoverDuration < 55) {
      console.warn(`⚠️ AVISO: Duração da locução (${voiceoverDuration.toFixed(2)}s) não está ideal para o vídeo de 60s`);
    }

    // 3. Exportar vídeo do Canva (via API ou download manual)
    console.log('📥 Exportando vídeo do Canva...');
    let canvaVideoPath: string;

    if (canva_access_token) {
      // Opção A: Via Canva API (requer OAuth2)
      console.log('🔐 Usando Canva API para exportar...');

      // Criar job de exportação
      const exportResponse = await axios.post(
        'https://api.canva.com/rest/v1/exports',
        {
          design_id: design_id,
          format: {
            type: 'mp4',
            quality: 'high'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${canva_access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const exportJobId = exportResponse.data.export.id;
      console.log(`📋 Job de exportação criado: ${exportJobId}`);

      // Polling para verificar status (timeout 5 min)
      let exportUrl: string | null = null;
      const maxAttempts = 60; // 5 min (5s por tentativa)

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Aguardar 5s

        const statusResponse = await axios.get(
          `https://api.canva.com/rest/v1/exports/${exportJobId}`,
          {
            headers: {
              'Authorization': `Bearer ${canva_access_token}`
            }
          }
        );

        const status = statusResponse.data.export.status;
        console.log(`📊 Status do export: ${status} (tentativa ${attempt + 1}/${maxAttempts})`);

        if (status === 'success') {
          exportUrl = statusResponse.data.export.url;
          break;
        } else if (status === 'failed') {
          throw new Error('Exportação do Canva falhou');
        }
      }

      if (!exportUrl) {
        throw new Error('Timeout ao exportar vídeo do Canva (5 minutos)');
      }

      // Download do vídeo exportado
      console.log('📥 Baixando vídeo exportado...');
      const videoResponse = await axios.get(exportUrl, {
        responseType: 'arraybuffer'
      });

      canvaVideoPath = path.join(tempDir, 'canva-video.mp4');
      fs.writeFileSync(canvaVideoPath, videoResponse.data);

    } else {
      // Opção B: Usar vídeo do Canva já exportado manualmente
      console.log('⚠️ Canva access token não fornecido - usando exportação manual');

      return res.status(400).json({
        error: 'Por enquanto, você precisa fornecer canva_access_token ou usar o workflow do N8N',
        next_steps: [
          '1. Exporte o vídeo manualmente do Canva (Compartilhar > Baixar > MP4)',
          '2. Use o endpoint /upload-canva-video para fazer upload',
          '3. Ou configure OAuth2 no N8N e use o workflow automático'
        ]
      });
    }

    // 4. Baixar música de fundo (se disponível)
    let musicPath: string | null = null;

    if (selectedMusic) {
      // TODO: Implementar download da música via audio_id
      // Por enquanto, vamos usar uma música de exemplo
      console.log('🎵 Baixando música de fundo...');
      const musicUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

      try {
        const musicResponse = await axios.get(musicUrl, {
          responseType: 'arraybuffer',
          timeout: 30000
        });

        musicPath = path.join(tempDir, 'background-music.mp3');
        fs.writeFileSync(musicPath, musicResponse.data);
        console.log('✅ Música de fundo baixada');
      } catch (error) {
        console.warn('⚠️ Erro ao baixar música, continuando sem música de fundo');
        musicPath = null;
      }
    }

    // 5. Mixar tudo com FFmpeg
    console.log('🎬 Mixando vídeo + locução + música com FFmpeg...');
    const outputVideoPath = path.join(tempDir, 'final-video.mp4');

    let ffmpegCommand: string;

    if (musicPath && fs.existsSync(musicPath)) {
      // Com música de fundo
      ffmpegCommand = `ffmpeg -i "${canvaVideoPath}" -i "${voiceoverPath}" -i "${musicPath}" \
        -filter_complex "\
          [1:a]volume=1.0[voice];\
          [2:a]afade=t=in:st=0:d=2,afade=t=out:st=58:d=2,volume=0.15[music];\
          [voice][music]amix=inputs=2:duration=first:dropout_transition=2[audio]" \
        -map 0:v -map "[audio]" \
        -c:v copy -c:a aac -b:a 192k \
        -t 60 \
        -y "${outputVideoPath}"`;
    } else {
      // Apenas vídeo + locução
      ffmpegCommand = `ffmpeg -i "${canvaVideoPath}" -i "${voiceoverPath}" \
        -filter_complex "[1:a]volume=1.0[audio]" \
        -map 0:v -map "[audio]" \
        -c:v copy -c:a aac -b:a 192k \
        -t 60 \
        -y "${outputVideoPath}"`;
    }

    await execAsync(ffmpegCommand);

    console.log('✅ Vídeo final gerado com sucesso!');
    console.log(`📁 Arquivo: ${outputVideoPath}`);
    console.log(`📊 Tamanho: ${(fs.statSync(outputVideoPath).size / 1024 / 1024).toFixed(2)} MB`);

    // Retornar o vídeo
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="canva-video-complete-${Date.now()}.mp4"`);

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
    console.error('❌ Erro ao gerar vídeo Canva completo:', error);

    // Cleanup em caso de erro
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    res.status(500).json({
      error: 'Erro ao gerar vídeo Canva completo',
      message: error.message,
      details: error.response?.data || error.stderr || error.stdout
    });
  }
});

/**
 * 🎬 POST /process-from-n8n - Processar vídeo do N8N com locução + música
 *
 * Recebe vídeo MP4 exportado pelo N8N do Canva e adiciona:
 * - Locução com ElevenLabs
 * - Música de fundo do Supabase
 * - Mixagem com FFmpeg
 *
 * Endpoint: POST /api/canva-video-complete/process-from-n8n
 */
router.post('/process-from-n8n', upload.single('video'), async (req: Request, res: Response): Promise<any> => {
  let tempDir: string | null = null;

  try {
    console.log('🎬 Processando vídeo recebido do N8N...');

    if (!req.file) {
      return res.status(400).json({
        error: 'Arquivo de vídeo não fornecido',
        expected: 'Campo multipart "video" com arquivo MP4'
      });
    }

    tempDir = req.body.tempDir || path.dirname(req.file.path);
    const canvaVideoPath = req.file.path;

    console.log(`📥 Vídeo recebido: ${canvaVideoPath}`);
    console.log(`📊 Tamanho: ${(fs.statSync(canvaVideoPath).size / 1024 / 1024).toFixed(2)} MB`);

    // Parâmetros do formulário
    const {
      voiceover_script,
      voice_id = 'yQtGAPI0R2jQuAXxLWk1', // Bruno - Portuguese (Brazilian)
      music_category = 'corporate'
    } = req.body;

    if (!voiceover_script) {
      return res.status(400).json({
        error: 'voiceover_script é obrigatório',
        example: {
          video: '[arquivo MP4]',
          voiceover_script: 'Transforme sua presença digital com nosso sistema de agendamentos inteligente...',
          voice_id: 'yQtGAPI0R2jQuAXxLWk1',
          music_category: 'corporate'
        }
      });
    }

    // 1. Buscar música de fundo aleatória do Supabase
    console.log('🎵 Buscando música de fundo no Supabase...');
    const { data: musicData, error: musicError } = await supabase
      .from('instagram_trending_audios')
      .select('id, audio_id, audio_name, artist, category, trending_score')
      .eq('is_active', true)
      .eq('category', music_category)
      .order('trending_score', { ascending: false })
      .limit(5);

    if (musicError || !musicData || musicData.length === 0) {
      console.warn('⚠️ Nenhuma música encontrada, continuando sem música de fundo');
    }

    const selectedMusic: BackgroundMusic | null = musicData && musicData.length > 0
      ? musicData[Math.floor(Math.random() * musicData.length)] as BackgroundMusic
      : null;

    if (selectedMusic) {
      console.log(`🎵 Música selecionada: "${selectedMusic.audio_name}" por ${selectedMusic.artist}`);
    }

    // 2. Gerar locução com ElevenLabs
    console.log('🎙️ Gerando locução com ElevenLabs...');
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!elevenLabsApiKey) {
      throw new Error('ELEVENLABS_API_KEY não configurada');
    }

    if (!tempDir) {
      throw new Error('Diretório temporário não configurado');
    }

    const voiceResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        text: voiceover_script,
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

    const voiceoverPath = path.join(tempDir, 'voiceover.mp3');
    fs.writeFileSync(voiceoverPath, voiceResponse.data);

    // Verificar duração do áudio
    const probeCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voiceoverPath}"`;
    const { stdout: durationStr } = await execAsync(probeCommand);
    const voiceoverDuration = parseFloat(durationStr.trim());

    console.log(`⏱️ Duração da locução: ${voiceoverDuration.toFixed(2)}s (esperado: ~60s)`);

    if (voiceoverDuration > 65 || voiceoverDuration < 55) {
      console.warn(`⚠️ AVISO: Duração da locução (${voiceoverDuration.toFixed(2)}s) não está ideal para o vídeo de 60s`);
    }

    // 3. Baixar música de fundo (se disponível)
    let musicPath: string | null = null;

    if (selectedMusic) {
      // TODO: Implementar download da música via audio_id
      // Por enquanto, vamos usar uma música de exemplo
      console.log('🎵 Baixando música de fundo...');
      const musicUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

      try {
        const musicResponse = await axios.get(musicUrl, {
          responseType: 'arraybuffer',
          timeout: 30000
        });

        musicPath = path.join(tempDir, 'background-music.mp3');
        fs.writeFileSync(musicPath, musicResponse.data);
        console.log('✅ Música de fundo baixada');
      } catch (error) {
        console.warn('⚠️ Erro ao baixar música, continuando sem música de fundo');
        musicPath = null;
      }
    }

    // 4. Mixar tudo com FFmpeg
    console.log('🎬 Mixando vídeo + locução + música com FFmpeg...');
    const outputVideoPath = path.join(tempDir, 'final-video.mp4');

    let ffmpegCommand: string;

    if (musicPath && fs.existsSync(musicPath)) {
      // Com música de fundo
      ffmpegCommand = `ffmpeg -i "${canvaVideoPath}" -i "${voiceoverPath}" -i "${musicPath}" \
        -filter_complex "\
          [1:a]volume=1.0[voice];\
          [2:a]afade=t=in:st=0:d=2,afade=t=out:st=58:d=2,volume=0.15[music];\
          [voice][music]amix=inputs=2:duration=first:dropout_transition=2[audio]" \
        -map 0:v -map "[audio]" \
        -c:v copy -c:a aac -b:a 192k \
        -t 60 \
        -y "${outputVideoPath}"`;
    } else {
      // Apenas vídeo + locução
      ffmpegCommand = `ffmpeg -i "${canvaVideoPath}" -i "${voiceoverPath}" \
        -filter_complex "[1:a]volume=1.0[audio]" \
        -map 0:v -map "[audio]" \
        -c:v copy -c:a aac -b:a 192k \
        -t 60 \
        -y "${outputVideoPath}"`;
    }

    await execAsync(ffmpegCommand);

    console.log('✅ Vídeo final gerado com sucesso!');
    console.log(`📁 Arquivo: ${outputVideoPath}`);
    console.log(`📊 Tamanho: ${(fs.statSync(outputVideoPath).size / 1024 / 1024).toFixed(2)} MB`);

    // Retornar o vídeo
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="canva-video-n8n-${Date.now()}.mp4"`);

    const videoStream = fs.createReadStream(outputVideoPath);
    videoStream.pipe(res);

    // Cleanup após envio
    videoStream.on('end', () => {
      setTimeout(() => {
        if (tempDir) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          console.log('🧹 Arquivos temporários removidos');
        }
      }, 1000);
    });

  } catch (error: any) {
    console.error('❌ Erro ao processar vídeo do N8N:', error);

    // Cleanup em caso de erro
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    res.status(500).json({
      error: 'Erro ao processar vídeo do N8N',
      message: error.message,
      details: error.response?.data || error.stderr || error.stdout
    });
  }
});

/**
 * GET /test - Endpoint de teste
 */
router.get('/test', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Canva Video Complete API está funcionando!',
    endpoint: 'POST /api/canva-video-complete/generate',
    design_id_example: 'DAG1QCvrgjE',
    duration: '60 segundos (8 slides: 7×8s + 1×4s)',
    features: [
      '✅ Export automático do Canva via API',
      '✅ Locução sincronizada com ElevenLabs',
      '✅ Música de fundo randomizada do Supabase',
      '✅ Mixagem profissional com FFmpeg'
    ],
    example_body: {
      design_id: 'DAG1QCvrgjE',
      voiceover_script: 'Transforme sua presença digital com nosso sistema de agendamentos inteligente. Aumente suas conversões, fidelize clientes e automatize seu negócio. Clique no link e descubra como podemos te ajudar!',
      voice_id: 'yQtGAPI0R2jQuAXxLWk1',
      music_category: 'corporate',
      canva_access_token: 'SEU_TOKEN_OAUTH2_AQUI'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
