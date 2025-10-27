import * as express from 'express';
import { Request, Response } from 'express';

const router = express.Router();

/**
 * 🎬 Multi-Page Reel Routes
 *
 * TEMPORARIAMENTE DESABILITADO: MultiPageReelGeneratorService em desenvolvimento
 *
 * Esta rota será habilitada quando o serviço multi-page-reel-generator.service.ts
 * for implementado com a arquitetura de 7 páginas (7 tweets) + 1 CTA.
 */

/**
 * POST /api/multi-page-reel/generate/:id/:reelNum
 * Gera Reel multi-página a partir de conteúdo editorial
 * Chamado pela página de aprovação para regeneração manual
 */
router.post('/generate/:id/:reelNum', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id, reelNum } = req.params;
    const reelNumber = parseInt(reelNum!);

    console.log(`🎬 ========== MULTI-PAGE REEL GENERATION REQUEST ==========`);
    console.log(`📄 Editorial Content ID: ${id}`);
    console.log(`🎞️  Reel Number: ${reelNumber}`);

    // Validação
    if (![1, 2, 3].includes(reelNumber)) {
      return res.status(400).json({
        success: false,
        error: 'reelNum deve ser 1, 2 ou 3',
        id,
        reelNum
      });
    }

    // TEMPORARIAMENTE DESABILITADO
    console.error('❌ Multi-page reel generation temporariamente desabilitado');

    return res.status(501).json({
      success: false,
      error: 'Multi-page reel generation temporariamente desabilitado',
      reason: 'MultiPageReelGeneratorService em desenvolvimento',
      alternative: 'Use o Content Seeder workflow (N8N) para gerar Reels automaticamente',
      status: 'not_implemented',
      id,
      reel_number: reelNumber,
      workaround: {
        method: 'Use N8N Content Seeder workflow',
        workflow_id: 'SswvkJMpyu4pd6dA',
        workflow_name: 'Content Seeder',
        instructions: [
          '1. Acesse N8N (n8n.ubs-app.br)',
          '2. Execute o workflow "Content Seeder"',
          '3. O workflow gerará automaticamente os 3 Reels',
          '4. Aguarde ~5 minutos para processamento completo',
          '5. Retorne à página de aprovação para revisar'
        ]
      }
    });

    /* IMPLEMENTAÇÃO FUTURA:

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Buscar conteúdo editorial
    const { data: content, error: fetchError } = await supabase
      .from('editorial_content')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !content) {
      return res.status(404).json({
        success: false,
        error: 'Conteúdo editorial não encontrado',
        id
      });
    }

    // 2. Extrair thread correspondente
    const threadTitleField = `thread_${reelNumber}_title`;
    const threadTweetsField = `thread_${reelNumber}_tweets`;
    const videoUrlField = `reel_${reelNumber}_video_url`;

    const threadTitle = content[threadTitleField];
    let tweetsRaw = content[threadTweetsField];

    // Parse JSON se necessário
    let tweets: string[];
    if (typeof tweetsRaw === 'string') {
      tweets = JSON.parse(tweetsRaw);
    } else if (Array.isArray(tweetsRaw)) {
      tweets = tweetsRaw;
    } else {
      return res.status(400).json({
        success: false,
        error: `Thread ${reelNumber} em formato inválido`,
        id
      });
    }

    if (!threadTitle || !tweets || tweets.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Thread ${reelNumber} incompleta - faltam título ou tweets`,
        id,
        reel_number: reelNumber
      });
    }

    console.log(`📝 Thread ${reelNumber}: "${threadTitle}" com ${tweets.length} tweets`);

    // 3. Gerar vídeo multi-página
    const { MultiPageReelGeneratorService } = require('../services/multi-page-reel-generator.service');
    const videoGenerator = new MultiPageReelGeneratorService();

    const result = await videoGenerator.generateMultiPageReel(
      tweets,
      threadTitle,
      `${id}-reel${reelNumber}`
    );

    console.log(`✅ Reel ${reelNumber} gerado: ${result.video_url}`);

    // 4. Atualizar registro
    const { data: currentContent } = await supabase
      .from('editorial_content')
      .select('api_cost_usd')
      .eq('id', id)
      .single();

    const updateData: any = {};
    updateData[videoUrlField] = result.video_url;
    updateData.api_cost_usd = (currentContent?.api_cost_usd || 0) + result.cost_usd;

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
      reel_number: reelNumber,
      video_url: result.video_url,
      video_url_field: videoUrlField,
      duration_seconds: result.duration_seconds,
      cost_usd: result.cost_usd,
      pages: tweets.length,
      thread_title: threadTitle,
      message: `Reel ${reelNumber} multi-página gerado com sucesso`
    });
    */

  } catch (error: any) {
    console.error('❌ Erro ao gerar multi-page reel:', error);

    res.status(500).json({
      success: false,
      error: 'Erro ao gerar multi-page reel',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/multi-page-reel/health
 * Health check
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'Multi-Page Reel Generator',
    status: 'disabled',
    reason: 'Service under development',
    timestamp: new Date().toISOString(),
    endpoints: {
      generate: 'POST /api/multi-page-reel/generate/:id/:reelNum (DISABLED - use N8N Content Seeder)',
      health: 'GET /api/multi-page-reel/health'
    },
    planned_features: [
      'Multi-page video generation (7 tweets + 1 CTA)',
      'Dynamic text overlay per page',
      'ElevenLabs TTS per tweet',
      'FFmpeg page transitions',
      'Automatic timing calculation',
      'Supabase Storage upload'
    ],
    current_workaround: {
      method: 'N8N Content Seeder Workflow',
      workflow_id: 'SswvkJMpyu4pd6dA',
      url: 'https://n8n.ubs-app.br'
    }
  });
});

export default router;
