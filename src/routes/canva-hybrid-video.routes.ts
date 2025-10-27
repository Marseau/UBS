import * as express from 'express';
import { Request, Response } from 'express';
import { CanvaSvgVideoGeneratorService } from '../services/canva-svg-video-generator.service';
import { MultiPageReelGeneratorService } from '../services/multi-page-reel-generator.service';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 🎬 Canva Hybrid Video Routes
 *
 * Integração completa com Content Seeder:
 * 1. Recebe content_id do editorial_content
 * 2. Busca scripts Carla + Bruno do banco
 * 3. Gera vídeo usando Canva PNG + FFmpeg overlay
 * 4. Retorna URL do vídeo final
 */

/**
 * POST /api/canva-hybrid-video/generate/:content_id/:reel_number
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

    const {
      main_png_binary,
      main_design_id,
      main_design_name,
      cta_png_binary,
      cta_design_id,
      cta_design_name,
      voice_id_carla,
      voice_id_bruno,
      music_category
    } = req.body;

    console.log(`🎬 ========== CANVA HYBRID VIDEO GENERATION ==========`);
    console.log(`📄 Content ID: ${content_id}`);
    console.log(`🎞️  Reel Number: ${reelNum}`);

    // DEBUG: Verificar TODOS os dados recebidos
    console.log('🔍 DEBUG - Body completo recebido:');
    console.log(JSON.stringify(req.body, null, 2));

    // DEBUG: Verificar tipo dos dados recebidos
    console.log('🔍 DEBUG - Tipos recebidos:');
    console.log(`  main_png_binary type: ${typeof main_png_binary}`);
    console.log(`  main_png_binary is Buffer: ${Buffer.isBuffer(main_png_binary)}`);
    if (main_png_binary) {
      const preview = typeof main_png_binary === 'string'
        ? main_png_binary.substring(0, 200)
        : JSON.stringify(main_png_binary).substring(0, 200);
      console.log(`  main_png_binary preview: ${preview}...`);
    } else {
      console.log(`  main_png_binary preview: UNDEFINED ❌`);
    }
    console.log(`  cta_png_binary type: ${typeof cta_png_binary}`);
    console.log(`  cta_png_binary is Buffer: ${Buffer.isBuffer(cta_png_binary)}`);
    if (cta_png_binary) {
      const preview = typeof cta_png_binary === 'string'
        ? cta_png_binary.substring(0, 200)
        : JSON.stringify(cta_png_binary).substring(0, 200);
      console.log(`  cta_png_binary preview: ${preview}...`);
    } else {
      console.log(`  cta_png_binary preview: UNDEFINED ❌`);
    }

    // Validar dados do Canva (vindos do N8N - 2 PNGs)
    if (!main_png_binary || !main_design_id || !cta_png_binary || !cta_design_id) {
      console.error('❌ Dados do Canva não recebidos do N8N');
      return res.status(400).json({
        success: false,
        error: 'main_png_binary, main_design_id, cta_png_binary e cta_design_id são obrigatórios (devem vir do N8N)',
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

    console.log(`🔍 DEBUG - threadTitleField: ${threadTitleField}`);
    console.log(`🔍 DEBUG - threadTweetsField: ${threadTweetsField}`);
    console.log(`🔍 DEBUG - threadTitle: ${threadTitle}`);
    console.log(`🔍 DEBUG - tweetsRaw type: ${typeof tweetsRaw}`);

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

    if (!threadTitle || !tweets || tweets.length === 0) {
      console.error(`❌ Thread ${reelNum} incompleta`);
      return res.status(400).json({
        success: false,
        error: `Thread ${reelNum} incompleta - faltam título ou tweets`,
        content_id,
        reel_number: reelNum,
        found_title: !!threadTitle,
        found_tweets: !!tweets,
        tweets_count: tweets?.length || 0
      });
    }

    console.log(`📝 Thread ${reelNum}: "${threadTitle}" com ${tweets.length} tweets`);

    // ========== MULTI-PAGE ARCHITECTURE ==========
    // 7 tweets = 7 páginas + 1 CTA = 8 páginas total
    // Cada tweet tem seu próprio áudio e timing

    console.log(`🎬 Gerando vídeo multi-página (${tweets.length} tweets + CTA)...`);

    const videoGenerator = new MultiPageReelGeneratorService();

    const result = await videoGenerator.generateMultiPageVideo(
      tweets, // Array de 7 tweets
      `${content_id}-reel${reelNum}`,
      main_png_binary, // PNG principal (usado para todas as 7 páginas)
      main_design_id,
      main_design_name || 'Main Template',
      cta_png_binary, // PNG CTA final
      cta_design_id,
      cta_design_name || 'CTA Template',
      voice_id_carla || process.env.ELEVENLABS_VOICE_ID_CARLA || 'GDzHdQOi6jjf8zaXhCYD', // Voz única para todos os tweets
      music_category || 'corporate',
      voice_id_bruno || process.env.ELEVENLABS_VOICE_ID_BRUNO || '6jgYSR71sIsHEewpbat1', // Não usado neste fluxo
      threadTitle // Título compartilhado por todas as páginas
    );

    // Custo total = apenas TTS (sem GPT-4)
    const scriptGenerationCost = 0; // Não geramos mais scripts on-demand

    console.log(`✅ Vídeo Reel ${reelNum} gerado com sucesso: ${result.video_url}`);

    // 5. Atualizar registro no banco com URL do vídeo + custos
    const totalCost = scriptGenerationCost + result.cost_usd;

    const updateData: any = {};
    updateData[videoUrlField] = result.video_url;

    // Acumular custos LLM (scripts) + API (TTS no api_cost_usd)
    const { data: currentContent } = await supabase
      .from('editorial_content')
      .select('llm_cost_usd, api_cost_usd')
      .eq('id', content_id)
      .single();

    updateData.llm_cost_usd = (currentContent?.llm_cost_usd || 0) + scriptGenerationCost;
    updateData.api_cost_usd = (currentContent?.api_cost_usd || 0) + result.cost_usd; // TTS vai para api_cost_usd

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
        script_generation_usd: scriptGenerationCost,
        video_generation_usd: result.cost_usd,
        total_usd: totalCost
      },
      pages: tweets.length, // 7 tweets
      has_cta: true,
      thread_title: threadTitle,
      tweets_count: tweets.length,
      message: `Vídeo Reel ${reelNum} multi-página gerado com sucesso (${tweets.length} tweets + CTA)`
    });

  } catch (error: any) {
    console.error('❌ Erro ao gerar vídeo híbrido:', error);

    res.status(500).json({
      success: false,
      error: 'Erro ao gerar vídeo híbrido Canva',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/canva-hybrid-video/generate-direct
 * Endpoint direto para testes (sem buscar do banco)
 */
router.post('/generate-direct', async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      carla_script,
      bruno_script,
      content_id,
      canva_png_binary,
      canva_design_id,
      canva_design_name,
      voice_id_carla,
      voice_id_bruno,
      music_category
    } = req.body;

    // Validação
    if (!carla_script || !bruno_script || !content_id || !canva_png_binary || !canva_design_id) {
      return res.status(400).json({
        success: false,
        error: 'carla_script, bruno_script, content_id, canva_png_binary e canva_design_id são obrigatórios'
      });
    }

    console.log(`🎬 ========== CANVA HYBRID VIDEO (DIRECT) ==========`);
    console.log(`📄 Content ID: ${content_id}`);
    console.log(`🎨 Template: ${canva_design_name || canva_design_id}`);
    console.log(`👩‍💼 Carla: ${carla_script.substring(0, 50)}...`);
    console.log(`👨‍💼 Bruno: ${bruno_script.substring(0, 50)}...`);

    const videoGenerator = new CanvaSvgVideoGeneratorService();

    const result = await videoGenerator.generateVideo(
      carla_script,
      bruno_script,
      content_id,
      canva_png_binary,
      canva_design_id,
      canva_design_name || 'Canva Template',
      voice_id_carla || 'XrExE9yKIg1WjnnlVkGX',
      voice_id_bruno || 'yQtGAPI0R2jQuAXxLWk1',
      music_category || 'corporate'
    );

    console.log(`✅ Vídeo direto gerado com sucesso: ${result.video_url}`);

    res.json({
      success: true,
      ...result,
      message: 'Vídeo híbrido Canva gerado com sucesso (modo direto)'
    });

  } catch (error: any) {
    console.error('❌ Erro ao gerar vídeo direto:', error);

    res.status(500).json({
      success: false,
      error: 'Erro ao gerar vídeo híbrido Canva (modo direto)',
      message: error.message
    });
  }
});

/**
 * GET /api/canva-hybrid-video/health
 * Health check
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'Canva Hybrid Video Generator',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    architecture: 'N8N Sub-workflow + Backend Processing',
    workflow: 'Content Seeder → Get Canva Template PNG (sub-workflow) → Generate Hybrid Reel (backend)',
    endpoints: {
      generate: 'POST /api/canva-hybrid-video/generate/:content_id (receives PNG from N8N)',
      generate_direct: 'POST /api/canva-hybrid-video/generate-direct',
      health: 'GET /api/canva-hybrid-video/health'
    },
    features: [
      'N8N sub-workflow: Canva template listing + selection by category',
      'N8N sub-workflow: Canva PNG export (1920x1080)',
      'Backend: Dynamic text overlay with FFmpeg',
      'Backend: Dual persona voiceovers (Carla + Bruno via ElevenLabs)',
      'Backend: Background music from Supabase trending audios',
      'Full automation with Content Seeder integration',
      'Template variety: Multiple Canva templates per category'
    ],
    n8n_integration: {
      sub_workflow_id: 'XW5G28IkaZQzfWk2',
      sub_workflow_name: 'Sub-Canva Template Selection & PNG Export',
      template_selection: 'Dynamic by category (tech, business, analytics, marketing)',
      calls_from: 'Content Seeder Workflow (SswvkJMpyu4pd6dA)'
    }
  });
});

export default router;
