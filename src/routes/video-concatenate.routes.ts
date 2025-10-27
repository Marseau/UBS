import * as express from 'express';
import { Request, Response } from 'express';
import { VideoConcatenationService } from '../services/video-concatenation.service';

const router = express.Router();

/**
 * 🎬 Video Concatenation Routes
 *
 * Concatena múltiplos vídeos em um único arquivo para YouTube Shorts
 *
 * Features:
 * - Remove CTAs de vídeos específicos
 * - Mantém apenas CTA final no último vídeo
 * - Gera YouTube Short em formato 9:16 (1080x1920)
 * - Upload automático para Supabase Storage
 */

/**
 * POST /api/video-concatenate/youtube-short
 * Concatena 3 Reels em 1 YouTube Short
 */
router.post('/youtube-short', async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      video_urls,
      output_name,
      youtube_caption,
      remove_cta_from_videos = [0, 1], // Índices dos vídeos para remover CTA
      keep_cta_in_video = 2 // Índice do vídeo que mantém CTA
    } = req.body;

    console.log('🎬 ========== YOUTUBE SHORT CONCATENATION ==========');
    console.log(`📹 Vídeos para concatenar: ${video_urls?.length || 0}`);
    console.log(`🎯 Output name: ${output_name}`);

    // Validação
    if (!video_urls || !Array.isArray(video_urls) || video_urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'video_urls é obrigatório e deve ser um array com pelo menos 1 URL'
      });
    }

    if (video_urls.length !== 3) {
      console.warn(`⚠️ Esperado 3 vídeos, recebido ${video_urls.length}. Continuando...`);
    }

    // Validar que remove_cta_from_videos não inclui keep_cta_in_video
    if (remove_cta_from_videos.includes(keep_cta_in_video)) {
      return res.status(400).json({
        success: false,
        error: `remove_cta_from_videos não pode incluir o índice ${keep_cta_in_video} (keep_cta_in_video)`
      });
    }

    const videoService = new VideoConcatenationService();

    // Concatena os vídeos
    const result = await videoService.concatenateYouTubeShort(
      video_urls,
      output_name || 'youtube_short',
      youtube_caption || '',
      remove_cta_from_videos,
      keep_cta_in_video
    );

    console.log(`✅ YouTube Short gerado com sucesso: ${result.youtube_short_url}`);
    console.log(`⏱️ Duração total: ${result.duration_seconds}s`);
    console.log(`💰 Custo: $${result.cost_usd}`);

    res.json({
      success: true,
      ...result,
      message: 'YouTube Short concatenado com sucesso'
    });

  } catch (error: any) {
    console.error('❌ Erro ao concatenar YouTube Short:', error);

    res.status(500).json({
      success: false,
      error: 'Erro ao concatenar vídeos para YouTube Short',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/video-concatenate/simple
 * Concatenação simples de vídeos (sem processamento de CTA)
 */
router.post('/simple', async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      video_urls,
      output_name,
      output_caption
    } = req.body;

    console.log('🎬 ========== SIMPLE VIDEO CONCATENATION ==========');
    console.log(`📹 Vídeos para concatenar: ${video_urls?.length || 0}`);

    if (!video_urls || !Array.isArray(video_urls) || video_urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'video_urls é obrigatório e deve ser um array com pelo menos 1 URL'
      });
    }

    const videoService = new VideoConcatenationService();

    const result = await videoService.concatenateSimple(
      video_urls,
      output_name || 'concatenated_video',
      output_caption || ''
    );

    console.log(`✅ Vídeo concatenado com sucesso: ${result.video_url}`);

    res.json({
      success: true,
      ...result,
      message: 'Vídeos concatenados com sucesso'
    });

  } catch (error: any) {
    console.error('❌ Erro ao concatenar vídeos:', error);

    res.status(500).json({
      success: false,
      error: 'Erro ao concatenar vídeos',
      message: error.message
    });
  }
});

/**
 * POST /api/video-concatenate/generate/:id
 * Gera YouTube Short a partir de conteúdo editorial
 * Chamado pela página de aprovação para regeneração manual
 */
router.post('/generate/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    console.log(`🎬 ========== GENERATE YOUTUBE SHORT FROM EDITORIAL ==========`);
    console.log(`📄 Editorial Content ID: ${id}`);

    // Buscar conteúdo editorial
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: content, error: fetchError } = await supabase
      .from('editorial_content')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !content) {
      console.error(`❌ Conteúdo não encontrado: ${fetchError?.message}`);
      return res.status(404).json({
        success: false,
        error: 'Conteúdo editorial não encontrado',
        id
      });
    }

    // Validar que os 3 Reels existem
    const video_urls = [
      content.reel_1_video_url,
      content.reel_2_video_url,
      content.reel_3_video_url
    ];

    const missingReels: number[] = [];
    video_urls.forEach((url, idx) => {
      if (!url) missingReels.push(idx + 1);
    });

    if (missingReels.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Faltam Reels: ${missingReels.join(', ')}. Gere os Reels primeiro.`,
        missing_reels: missingReels,
        id
      });
    }

    console.log(`✅ 3 Reels encontrados - iniciando concatenação`);

    const videoService = new VideoConcatenationService();

    // Concatenar os 3 Reels em 1 YouTube Short
    // IMPORTANTE: Usa week_number para garantir nome único por semana
    const result = await videoService.concatenateYouTubeShort(
      video_urls,
      `youtube_short_week_${content.week_number}`,
      content.youtube_caption || '',
      [0, 1], // Remove CTA dos primeiros 2 vídeos
      2 // Mantém CTA apenas no último vídeo
    );

    console.log(`✅ YouTube Short gerado: ${result.youtube_short_url}`);

    // Atualizar registro com URL e custo
    const { data: currentContent } = await supabase
      .from('editorial_content')
      .select('api_cost_usd')
      .eq('id', id)
      .single();

    const updateData = {
      youtube_short_url: result.youtube_short_url,
      api_cost_usd: (currentContent?.api_cost_usd || 0) + result.cost_usd
    };

    const { error: updateError } = await supabase
      .from('editorial_content')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.warn(`⚠️ Erro ao atualizar banco: ${updateError.message}`);
    }

    res.json({
      success: true,
      id,
      youtube_short_url: result.youtube_short_url,
      duration_seconds: result.duration_seconds,
      cost_usd: result.cost_usd,
      message: 'YouTube Short gerado com sucesso (3 Reels concatenados)'
    });

  } catch (error: any) {
    console.error('❌ Erro ao gerar YouTube Short:', error);

    res.status(500).json({
      success: false,
      error: 'Erro ao gerar YouTube Short',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/video-concatenate/health
 * Health check
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'Video Concatenation Service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: {
      generate: 'POST /api/video-concatenate/generate/:id (Editorial Content → YouTube Short)',
      youtube_short: 'POST /api/video-concatenate/youtube-short (3 Reels → 1 Short com CTA estratégico)',
      simple: 'POST /api/video-concatenate/simple (Concatenação básica)',
      health: 'GET /api/video-concatenate/health'
    },
    features: [
      'FFmpeg video concatenation',
      'CTA removal from specific videos',
      'YouTube Shorts optimization (9:16 format)',
      'Automatic Supabase Storage upload',
      'Duration and cost calculation',
      'Editorial content integration'
    ]
  });
});

export default router;
