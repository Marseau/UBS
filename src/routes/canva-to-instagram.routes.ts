import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import { InstagramReelsPublisherService } from '../services/instagram-reels-publisher.service';

const router = express.Router();

// Configuração do multer para upload de vídeo
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tempDir = path.join(os.tmpdir(), `canva-video-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      req.body.tempDir = tempDir;
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      cb(null, `canva-video-${Date.now()}.mp4`);
    }
  }),
  limits: {
    fileSize: 200 * 1024 * 1024 // 200 MB max
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas vídeos
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de vídeo são aceitos'));
    }
  }
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Instagram publisher
const instagramPublisher = new InstagramReelsPublisherService();

/**
 * 🎬 Canva to Instagram - Workflow Completo
 *
 * Recebe vídeo pronto do Canva e publica automaticamente no Instagram Reels
 *
 * Fluxo:
 * 1. Recebe vídeo MP4 do Canva (via N8N ou upload direto)
 * 2. Faz upload para Supabase Storage (bucket: instagram-reels)
 * 3. Gera URL pública do vídeo
 * 4. Publica no Instagram via Graph API
 * 5. Salva metadados na tabela editorial_content
 *
 * Endpoints:
 * - POST /api/canva-to-instagram/publish - Recebe vídeo e publica
 * - POST /api/canva-to-instagram/publish-from-url - Publica vídeo já hospedado
 * - GET  /api/canva-to-instagram/test - Testa conexão Instagram
 */

interface PublishRequest {
  caption?: string;              // Legenda do Reel
  hashtags?: string[];           // Array de hashtags (sem #)
  shareToFeed?: boolean;         // Aparecer no Feed + Reels
  thumbOffset?: number;          // Timestamp (ms) para thumbnail
  contentId?: string;            // ID do editorial_content (para tracking)
  metadata?: {                   // Metadados adicionais
    campaign?: string;
    weekNumber?: number;
    dayOfWeek?: string;
  };
}

/**
 * POST /publish - Recebe vídeo do Canva e publica no Instagram
 *
 * Body (multipart/form-data):
 * - video: Arquivo MP4 (obrigatório)
 * - caption: Legenda (opcional)
 * - hashtags: JSON array de hashtags (opcional)
 * - shareToFeed: boolean (default: true)
 * - thumbOffset: number (default: 0)
 * - contentId: string (opcional)
 */
router.post('/publish', upload.single('video'), async (req: Request, res: Response): Promise<any> => {
  let tempDir: string | null = null;

  try {
    console.log('🎬 ========== CANVA TO INSTAGRAM WORKFLOW ==========');

    if (!req.file) {
      return res.status(400).json({
        error: 'Arquivo de vídeo não fornecido',
        expected: 'Campo multipart "video" com arquivo MP4'
      });
    }

    tempDir = req.body.tempDir || path.dirname(req.file.path);
    const videoPath = req.file.path;
    const videoSize = fs.statSync(videoPath).size;

    console.log(`📥 Vídeo recebido: ${path.basename(videoPath)}`);
    console.log(`📊 Tamanho: ${(videoSize / 1024 / 1024).toFixed(2)} MB`);

    // Parse dos parâmetros
    const {
      caption,
      hashtags,
      shareToFeed = true,
      thumbOffset = 0,
      contentId,
      metadata
    } = req.body as PublishRequest;

    // Parse hashtags se vier como string JSON
    let hashtagsArray: string[] = [];
    if (hashtags) {
      hashtagsArray = typeof hashtags === 'string' ? JSON.parse(hashtags) : hashtags;
    }

    // Montar caption com hashtags
    let fullCaption = caption || '';
    if (hashtagsArray.length > 0) {
      const hashtagsString = hashtagsArray.map(tag => `#${tag.replace('#', '')}`).join(' ');
      fullCaption = fullCaption ? `${fullCaption}\n\n${hashtagsString}` : hashtagsString;
    }

    console.log(`📝 Caption: ${fullCaption.substring(0, 100)}${fullCaption.length > 100 ? '...' : ''}`);

    // Step 1: Upload para Supabase Storage
    console.log('\n📤 STEP 1: Upload para Supabase Storage...');

    const fileName = `reel-${Date.now()}.mp4`;
    const bucketName = 'instagram-reels';

    // Verificar se bucket existe, senão criar
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === bucketName);

    if (!bucketExists) {
      console.log('📦 Criando bucket instagram-reels...');
      await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 200 * 1024 * 1024 // 200MB
      });
    }

    // Upload do arquivo
    const videoBuffer = fs.readFileSync(videoPath);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, videoBuffer, {
        contentType: 'video/mp4',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
    }

    console.log(`✅ Upload concluído: ${uploadData.path}`);

    // Obter URL pública
    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    const videoUrl = publicUrlData.publicUrl;
    console.log(`🔗 URL pública: ${videoUrl}`);

    // Step 2: Publicar no Instagram
    console.log('\n📱 STEP 2: Publicando no Instagram...');

    const publishResult = await instagramPublisher.publishReel({
      videoUrl,
      caption: fullCaption,
      shareToFeed,
      thumbOffset
    });

    if (!publishResult.success) {
      throw new Error(`Erro ao publicar no Instagram: ${publishResult.error}`);
    }

    console.log(`✅ Reel publicado: ${publishResult.permalink}`);

    // Step 3: Salvar metadados no banco (opcional)
    if (contentId) {
      console.log('\n💾 STEP 3: Salvando metadados no banco...');

      const { error: updateError } = await supabase
        .from('editorial_content')
        .update({
          instagram_reel_url: publishResult.permalink,
          instagram_media_id: publishResult.mediaId,
          video_url: videoUrl,
          published_at: new Date().toISOString(),
          status: 'published'
        })
        .eq('id', contentId);

      if (updateError) {
        console.warn('⚠️ Erro ao atualizar editorial_content:', updateError.message);
      } else {
        console.log('✅ Metadados salvos no banco');
      }
    }

    // Cleanup
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Resposta de sucesso
    return res.json({
      success: true,
      message: 'Reel publicado com sucesso!',
      data: {
        instagramUrl: publishResult.permalink,
        mediaId: publishResult.mediaId,
        videoUrl,
        processingTimeSeconds: (publishResult.processingTimeMs! / 1000).toFixed(2),
        caption: fullCaption,
        metadata
      }
    });

  } catch (error: any) {
    console.error('❌ Erro no workflow Canva → Instagram:', error);

    // Cleanup em caso de erro
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    return res.status(500).json({
      error: 'Erro ao publicar vídeo no Instagram',
      message: error.message,
      details: error.response?.data || error.stack
    });
  }
});

/**
 * POST /publish-from-url - Publica vídeo já hospedado no Supabase
 *
 * Body (JSON):
 * {
 *   "videoUrl": "https://xxx.supabase.co/storage/v1/object/public/...",
 *   "caption": "Minha legenda",
 *   "hashtags": ["tech", "instagram", "automation"],
 *   "shareToFeed": true,
 *   "thumbOffset": 0,
 *   "contentId": "uuid"
 * }
 */
router.post('/publish-from-url', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('🎬 ========== PUBLISH FROM URL ==========');

    const {
      videoUrl,
      caption,
      hashtags = [],
      shareToFeed = true,
      thumbOffset = 0,
      contentId,
      metadata
    } = req.body;

    if (!videoUrl) {
      return res.status(400).json({
        error: 'videoUrl é obrigatório',
        example: {
          videoUrl: 'https://qsdfyffuonywmtnlycri.supabase.co/storage/v1/object/public/instagram-reels/reel-123.mp4',
          caption: 'Minha legenda incrível',
          hashtags: ['tech', 'automation']
        }
      });
    }

    // Montar caption com hashtags
    let fullCaption = caption || '';
    if (hashtags.length > 0) {
      const hashtagsString = hashtags.map((tag: string) => `#${tag.replace('#', '')}`).join(' ');
      fullCaption = fullCaption ? `${fullCaption}\n\n${hashtagsString}` : hashtagsString;
    }

    console.log(`🔗 Video URL: ${videoUrl}`);
    console.log(`📝 Caption: ${fullCaption.substring(0, 100)}...`);

    // Publicar no Instagram
    const publishResult = await instagramPublisher.publishReel({
      videoUrl,
      caption: fullCaption,
      shareToFeed,
      thumbOffset
    });

    if (!publishResult.success) {
      throw new Error(`Erro ao publicar no Instagram: ${publishResult.error}`);
    }

    console.log(`✅ Reel publicado: ${publishResult.permalink}`);

    // Atualizar banco se contentId fornecido
    if (contentId) {
      const { error: updateError } = await supabase
        .from('editorial_content')
        .update({
          instagram_reel_url: publishResult.permalink,
          instagram_media_id: publishResult.mediaId,
          published_at: new Date().toISOString(),
          status: 'published'
        })
        .eq('id', contentId);

      if (updateError) {
        console.warn('⚠️ Erro ao atualizar editorial_content:', updateError.message);
      }
    }

    return res.json({
      success: true,
      message: 'Reel publicado com sucesso!',
      data: {
        instagramUrl: publishResult.permalink,
        mediaId: publishResult.mediaId,
        videoUrl,
        processingTimeSeconds: (publishResult.processingTimeMs! / 1000).toFixed(2),
        caption: fullCaption,
        metadata
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao publicar from URL:', error);

    return res.status(500).json({
      error: 'Erro ao publicar vídeo no Instagram',
      message: error.message,
      details: error.response?.data || error.stack
    });
  }
});

/**
 * GET /test - Testa conexão com Instagram Graph API
 */
router.get('/test', async (req: Request, res: Response) => {
  try {
    const result = await instagramPublisher.testConnection();

    if (result.success) {
      return res.json({
        success: true,
        message: 'Conexão Instagram OK!',
        username: result.username,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /health - Health check
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'Canva to Instagram Publisher',
    version: '1.0.0',
    endpoints: [
      'POST /api/canva-to-instagram/publish',
      'POST /api/canva-to-instagram/publish-from-url',
      'GET  /api/canva-to-instagram/test',
      'GET  /api/canva-to-instagram/health'
    ],
    features: [
      '✅ Upload automático Supabase Storage',
      '✅ Publicação Instagram Reels via Graph API',
      '✅ Suporte a legendas e hashtags',
      '✅ Tracking em editorial_content',
      '✅ Integração com N8N'
    ],
    example_curl: {
      upload: `curl -X POST http://localhost:3000/api/canva-to-instagram/publish \\
  -F "video=@meu-video.mp4" \\
  -F "caption=Meu vídeo incrível" \\
  -F "hashtags=[\\"tech\\",\\"automation\\"]" \\
  -F "shareToFeed=true"`,
      from_url: `curl -X POST http://localhost:3000/api/canva-to-instagram/publish-from-url \\
  -H "Content-Type: application/json" \\
  -d '{
    "videoUrl": "https://xxx.supabase.co/storage/v1/object/public/instagram-reels/reel.mp4",
    "caption": "Meu vídeo",
    "hashtags": ["tech", "automation"]
  }'`
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
