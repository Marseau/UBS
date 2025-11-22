import * as express from 'express';
import { Request, Response } from 'express';
import { CanvaAnimatedVideoGeneratorService } from '../services/canva-animated-video-generator.service';
import { CanvaMultiPageVideoService } from '../services/canva-multi-page-video.service';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 🎬 Canva Animated Video Routes
 *
 * Nova arquitetura simplificada:
 * 1. N8N exporta MP4 animado do Canva (64s = 8 × 8s) com música
 * 2. Backend recebe URL do vídeo base
 * 3. Aplica overlay de texto animado + TTS em cada segmento de 8s
 * 4. Retorna vídeo final
 */

/**
 * POST /api/canva-animated-video/generate/:content_id/:reel_number
 * Endpoint principal chamado pelo Content Seeder workflow
 * @param content_id - ID do registro editorial_content
 * @param reel_number - Número do Reel (1, 2 ou 3)
 */
router.post('/generate/:content_id/:reel_number', async (req: Request, res: Response): Promise<any> => {
  try {
    const { content_id, reel_number } = req.params;
    const reelNum = parseInt(reel_number!);

    if (![1, 2, 3].includes(reelNum)) {
      return res.status(400).json({
        success: false,
        error: 'reel_number deve ser 1, 2 ou 3',
        content_id
      });
    }

    const { base_video_url } = req.body;

    console.log(`🎬 ========== CANVA ANIMATED VIDEO GENERATION ==========`);
    console.log(`📄 Content ID: ${content_id}`);
    console.log(`🎞️  Reel Number: ${reelNum}`);
    console.log(`🎥 Vídeo base: ${base_video_url?.substring(0, 80)}...`);

    // Validar URL do vídeo base
    if (!base_video_url) {
      console.error('❌ URL do vídeo base não recebida do N8N');
      return res.status(400).json({
        success: false,
        error: 'base_video_url é obrigatória (deve vir do export MP4 do Canva via N8N)',
        content_id
      });
    }

    // 1. Buscar conteúdo editorial do banco
    const { data: content, error: fetchError } = await supabase
      .from('editorial_content')
      .select('*')
      .eq('id', content_id)
      .single();

    if (fetchError || !content) {
      console.error(`❌ Erro ao buscar conteúdo: ${fetchError?.message}`);
      return res.status(404).json({
        success: false,
        error: 'Conteúdo editorial não encontrado',
        content_id
      });
    }

    console.log(`✅ Conteúdo encontrado: ${content.main_theme}`);

    // 2. Buscar tweets e título da thread correspondente
    const threadTitleField = `thread_${reelNum}_title`;
    const threadTweetsField = `thread_${reelNum}_tweets`;
    const videoUrlField = `reel_${reelNum}_video_url`;

    const threadTitle = content[threadTitleField];
    let tweetsRaw = content[threadTweetsField];

    // Parse JSON se for string
    let tweets: string[];
    if (typeof tweetsRaw === 'string') {
      tweets = JSON.parse(tweetsRaw);
    } else if (Array.isArray(tweetsRaw)) {
      tweets = tweetsRaw;
    } else {
      return res.status(400).json({
        success: false,
        error: `Tweets da thread ${reelNum} em formato inválido`,
        content_id,
        reel_number: reelNum
      });
    }

    if (!threadTitle || !tweets || tweets.length !== 7) {
      console.error(`❌ Thread ${reelNum} incompleta ou com número errado de tweets`);
      return res.status(400).json({
        success: false,
        error: `Thread ${reelNum} deve ter exatamente 7 tweets (recebido: ${tweets?.length || 0})`,
        content_id,
        reel_number: reelNum,
        found_title: !!threadTitle,
        tweets_count: tweets?.length || 0
      });
    }

    console.log(`📝 Thread ${reelNum}: "${threadTitle}" com ${tweets.length} tweets`);

    // 3. CTA padrão (duas linhas)
    const ctaText = 'Quer reduzir a lotação da sua sala de espera?\n\nAcesse nosso site e transforme seu negócio!';

    // 4. Gerar vídeo animado
    console.log(`🎬 Gerando vídeo animado (${tweets.length} tweets + CTA)...`);

    const videoGenerator = new CanvaAnimatedVideoGeneratorService();

    const result = await videoGenerator.generateAnimatedVideo(
      base_video_url,
      tweets,
      ctaText,
      `${content_id}-reel${reelNum}`,
      threadTitle
    );

    console.log(`✅ Vídeo Reel ${reelNum} gerado com sucesso: ${result.video_url}`);

    // 5. Atualizar registro no banco com URL do vídeo + custos
    const updateData: any = {};
    updateData[videoUrlField] = result.video_url;

    // Acumular custos TTS no api_cost_usd
    const { data: currentContent } = await supabase
      .from('editorial_content')
      .select('api_cost_usd')
      .eq('id', content_id)
      .single();

    updateData.api_cost_usd = (currentContent?.api_cost_usd || 0) + result.cost_usd;

    const { error: updateError } = await supabase
      .from('editorial_content')
      .update(updateData)
      .eq('id', content_id);

    if (updateError) {
      console.warn(`⚠️ Erro ao atualizar banco: ${updateError.message}`);
    }

    // 6. Retornar resultado
    res.json({
      success: true,
      content_id,
      reel_number: reelNum,
      video_url: result.video_url,
      video_url_field: videoUrlField,
      duration_seconds: result.duration_seconds,
      cost_breakdown: {
        tts_usd: result.cost_usd,
        total_usd: result.cost_usd
      },
      segments: 8,
      tweets_count: tweets.length,
      has_cta: true,
      thread_title: threadTitle,
      message: `Vídeo Reel ${reelNum} animado gerado com sucesso (${tweets.length} tweets + CTA em ${result.duration_seconds}s)`
    });

  } catch (error: any) {
    console.error('❌ Erro ao gerar vídeo animado:', error);

    res.status(500).json({
      success: false,
      error: 'Erro ao gerar vídeo animado Canva',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/canva-animated-video/generate-from-pages/:content_id/:reel_number
 * Endpoint SIMPLIFICADO - Recebe 8 URLs de vídeo (páginas prontas do Canva)
 * @param content_id - ID do registro editorial_content
 * @param reel_number - Número do Reel (1, 2 ou 3)
 * @body page_video_urls - Array com 8 URLs de vídeo (7 tweets + 1 CTA)
 */
router.post('/generate-from-pages/:content_id/:reel_number', async (req: Request, res: Response): Promise<any> => {
  try {
    const { content_id, reel_number } = req.params;
    const reelNum = parseInt(reel_number!);

    if (![1, 2, 3].includes(reelNum)) {
      return res.status(400).json({
        success: false,
        error: 'reel_number deve ser 1, 2 ou 3',
        content_id
      });
    }

    const { page_video_urls } = req.body;

    console.log(`🎬 ========== CANVA MULTI-PAGE VIDEO ==========`);
    console.log(`📄 Content ID: ${content_id}`);
    console.log(`🎞️  Reel Number: ${reelNum}`);
    console.log(`📹 Páginas recebidas: ${page_video_urls?.length || 0}`);

    // Validar URLs das páginas
    if (!page_video_urls || !Array.isArray(page_video_urls) || page_video_urls.length !== 8) {
      console.error('❌ Número incorreto de páginas de vídeo');
      return res.status(400).json({
        success: false,
        error: 'page_video_urls deve ser um array com 8 URLs (7 tweets + 1 CTA)',
        content_id,
        received: page_video_urls?.length || 0
      });
    }

    // 1. Buscar conteúdo editorial do banco
    const { data: content, error: fetchError } = await supabase
      .from('editorial_content')
      .select('*')
      .eq('id', content_id)
      .single();

    if (fetchError || !content) {
      console.error(`❌ Erro ao buscar conteúdo: ${fetchError?.message}`);
      return res.status(404).json({
        success: false,
        error: 'Conteúdo editorial não encontrado',
        content_id
      });
    }

    console.log(`✅ Conteúdo encontrado: ${content.main_theme}`);

    // 2. Buscar tweets da thread correspondente
    const threadTweetsField = `thread_${reelNum}_tweets`;
    const videoUrlField = `reel_${reelNum}_video_url`;

    let tweetsRaw = content[threadTweetsField];

    // Parse JSON se for string
    let tweets: string[];
    if (typeof tweetsRaw === 'string') {
      tweets = JSON.parse(tweetsRaw);
    } else if (Array.isArray(tweetsRaw)) {
      tweets = tweetsRaw;
    } else {
      return res.status(400).json({
        success: false,
        error: `Tweets da thread ${reelNum} em formato inválido`,
        content_id,
        reel_number: reelNum
      });
    }

    if (!tweets || tweets.length !== 7) {
      console.error(`❌ Thread ${reelNum} deve ter exatamente 7 tweets`);
      return res.status(400).json({
        success: false,
        error: `Thread ${reelNum} deve ter exatamente 7 tweets (recebido: ${tweets?.length || 0})`,
        content_id,
        reel_number: reelNum
      });
    }

    console.log(`📝 Thread ${reelNum}: ${tweets.length} tweets`);

    // 3. CTA padrão (duas linhas)
    const ctaText = 'Quer reduzir a lotação da sua sala de espera?\n\nAcesse nosso site e transforme seu negócio!';

    // 4. Gerar vídeo usando novo serviço (8 páginas)
    console.log(`🎬 Gerando vídeo a partir de 8 páginas do Canva...`);

    const videoGenerator = new CanvaMultiPageVideoService();

    const result = await videoGenerator.generateFromPages(
      page_video_urls,
      tweets,
      ctaText,
      `${content_id}-reel${reelNum}`
    );

    console.log(`✅ Vídeo Reel ${reelNum} gerado com sucesso: ${result.video_url}`);

    // 5. Atualizar registro no banco
    const updateData: any = {};
    updateData[videoUrlField] = result.video_url;

    const { data: currentContent } = await supabase
      .from('editorial_content')
      .select('api_cost_usd')
      .eq('id', content_id)
      .single();

    updateData.api_cost_usd = (currentContent?.api_cost_usd || 0) + result.cost_usd;

    const { error: updateError } = await supabase
      .from('editorial_content')
      .update(updateData)
      .eq('id', content_id);

    if (updateError) {
      console.warn(`⚠️ Erro ao atualizar banco: ${updateError.message}`);
    }

    // 6. Retornar resultado
    res.json({
      success: true,
      content_id,
      reel_number: reelNum,
      video_url: result.video_url,
      video_url_field: videoUrlField,
      duration_seconds: result.duration_seconds,
      cost_breakdown: {
        tts_usd: result.cost_usd,
        total_usd: result.cost_usd
      },
      pages: 8,
      tweets_count: tweets.length,
      has_cta: true,
      message: `Vídeo Reel ${reelNum} gerado a partir de 8 páginas Canva (${tweets.length} tweets + CTA)`
    });

  } catch (error: any) {
    console.error('❌ Erro ao gerar vídeo multi-página:', error);

    res.status(500).json({
      success: false,
      error: 'Erro ao gerar vídeo multi-página Canva',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/canva-animated-video/test
 * Endpoint de teste direto (sem buscar do banco)
 */
router.post('/test', async (req: Request, res: Response): Promise<any> => {
  try {
    const { base_video_url, tweets, cta_text, content_id, title } = req.body;

    // Validação
    if (!base_video_url || !tweets || !Array.isArray(tweets) || tweets.length !== 7 || !content_id) {
      return res.status(400).json({
        success: false,
        error: 'base_video_url, tweets (array com 7 itens), cta_text e content_id são obrigatórios'
      });
    }

    console.log(`🎬 ========== TESTE CANVA ANIMATED VIDEO ==========`);
    console.log(`📄 Content ID: ${content_id}`);
    console.log(`🎥 Vídeo base: ${base_video_url.substring(0, 80)}...`);
    console.log(`📝 Tweets: ${tweets.length}`);

    const videoGenerator = new CanvaAnimatedVideoGeneratorService();

    const result = await videoGenerator.generateAnimatedVideo(
      base_video_url,
      tweets,
      cta_text || 'Acesse nosso site e transforme seu negócio!',
      content_id,
      title
    );

    console.log(`✅ Vídeo de teste gerado com sucesso: ${result.video_url}`);

    res.json({
      success: true,
      ...result,
      message: 'Vídeo animado Canva gerado com sucesso (modo teste)'
    });

  } catch (error: any) {
    console.error('❌ Erro ao gerar vídeo de teste:', error);

    res.status(500).json({
      success: false,
      error: 'Erro ao gerar vídeo animado Canva (modo teste)',
      message: error.message
    });
  }
});

/**
 * POST /api/canva-animated-video/test-pages
 * Endpoint de teste com 8 páginas separadas
 */
router.post('/test-pages', async (req: Request, res: Response): Promise<any> => {
  try {
    const { page_video_urls, tweets, cta_text, content_id, title } = req.body;

    // Validação
    if (!page_video_urls || !Array.isArray(page_video_urls) || page_video_urls.length !== 8) {
      return res.status(400).json({
        success: false,
        error: 'page_video_urls deve ser array com 8 URLs'
      });
    }

    if (!tweets || !Array.isArray(tweets) || tweets.length !== 7) {
      return res.status(400).json({
        success: false,
        error: 'tweets deve ser array com 7 itens'
      });
    }

    if (!content_id) {
      return res.status(400).json({
        success: false,
        error: 'content_id é obrigatório'
      });
    }

    console.log(`🎬 ========== TESTE 8 PÁGINAS CANVA ==========`);
    console.log(`📄 Content ID: ${content_id}`);
    console.log(`📹 Páginas: ${page_video_urls.length}`);
    console.log(`📝 Tweets: ${tweets.length}`);

    const videoGenerator = new CanvaMultiPageVideoService();

    const result = await videoGenerator.generateFromPages(
      page_video_urls,
      tweets,
      cta_text || 'Acesse nosso site e transforme seu negócio!',
      content_id,
      title // thread_X_title
    );

    console.log(`✅ Vídeo de teste gerado: ${result.video_url}`);

    res.json({
      success: true,
      ...result,
      message: 'Vídeo gerado a partir de 8 páginas Canva (modo teste)'
    });

  } catch (error: any) {
    console.error('❌ Erro ao gerar vídeo de teste (8 páginas):', error);

    res.status(500).json({
      success: false,
      error: 'Erro ao gerar vídeo de teste (8 páginas)',
      message: error.message
    });
  }
});

/**
 * GET /api/canva-animated-video/health
 * Health check
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'Canva Animated Video Generator',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    architecture: 'Canva MP4 Export + FFmpeg Text Overlay',
    workflow: 'Content Seeder → Export Canva MP4 (N8N) → Generate Animated Reel (backend)',
    endpoints: {
      generate: 'POST /api/canva-animated-video/generate/:content_id/:reel_number',
      test: 'POST /api/canva-animated-video/test',
      health: 'GET /api/canva-animated-video/health'
    },
    features: [
      'N8N workflow: Canva MP4 export (64s com música + animações)',
      'Backend: 8 segmentos de 8 segundos fixos',
      'Backend: Texto animado (fade in/out) via FFmpeg',
      'Backend: TTS alternado (Carla ímpar, Bruno par) via ElevenLabs',
      'Backend: 7 tweets + 1 CTA',
      'Full automation with Content Seeder integration'
    ],
    specifications: {
      total_duration: '64 segundos',
      segments: 8,
      segment_duration: '8 segundos fixos',
      tweets: 7,
      cta: 1,
      voices: 'Alternadas (Carla/Bruno)',
      text_animation: 'Fade in (0-0.5s) + Stay (0.5-7.5s) + Fade out (7.5-8s)'
    }
  });
});

export default router;
