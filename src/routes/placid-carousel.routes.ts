import express, { Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PlacidCarouselGeneratorService } from '../services/placid-carousel-generator.service';

const router = express.Router();

// Lazy initialization to avoid module-level errors
let supabase: SupabaseClient;
let placidGenerator: PlacidCarouselGeneratorService;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabase;
}

function getPlacidGenerator() {
  if (!placidGenerator) {
    placidGenerator = new PlacidCarouselGeneratorService();
  }
  return placidGenerator;
}

/**
 * POST /api/placid-carousel/generate/:contentId
 * Gera carrossel de imagens para Instagram usando Placid API
 *
 * @param contentId - ID do conteúdo na tabela editorial_content
 * @returns {
 *   success: boolean,
 *   content_id: string,
 *   carousel_urls: string[],
 *   total_slides: number,
 *   cost: number
 * }
 */
router.post('/generate/:contentId', async (req: Request, res: Response) => {
  const { contentId } = req.params;

  console.log(`📥 Request to generate Placid carousel for content ${contentId}`);

  try {
    // Buscar conteúdo do banco
    const { data: content, error: fetchError } = await getSupabase()
      .from('editorial_content')
      .select('id, x_thread_part1, week_number, day_of_week')
      .eq('id', contentId)
      .single();

    if (fetchError || !content) {
      return res.status(404).json({
        success: false,
        error: 'Content not found',
        message: fetchError?.message || 'No content with this ID'
      });
    }

    if (!content.x_thread_part1) {
      return res.status(400).json({
        success: false,
        error: 'Missing X thread content',
        message: 'x_thread_part1 field is required for carousel generation'
      });
    }

    // Atualizar status no banco
    await getSupabase()
      .from('editorial_content')
      .update({ media_generation_status: 'generating' })
      .eq('id', contentId);

    // Gerar carrossel
    const result = await getPlacidGenerator().generateCarousel(
      content.x_thread_part1!,
      contentId as string
    );

    // Atualizar banco com resultado
    await getSupabase()
      .from('editorial_content')
      .update({
        instagram_carousel_urls: result.carousel_urls,
        carousel_generation_cost_usd: result.cost_usd,
        media_generation_status: 'done',
        media_generated_at: new Date().toISOString()
      })
      .eq('id', contentId);

    return res.status(200).json({
      success: true,
      content_id: contentId,
      week_number: content.week_number,
      day_of_week: content.day_of_week,
      carousel_urls: result.carousel_urls,
      total_slides: result.total_slides,
      cost: result.cost_usd
    });
  } catch (error: any) {
    console.error('❌ Error generating Placid carousel:', error);

    // Atualizar status de erro no banco
    await getSupabase()
      .from('editorial_content')
      .update({
        media_generation_status: 'error',
        error_message: error.message
      })
      .eq('id', contentId);

    return res.status(500).json({
      success: false,
      error: 'Placid carousel generation failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/placid-carousel/status/:contentId
 * Verifica status da geração de carrossel
 */
router.get('/status/:contentId', async (req: Request, res: Response) => {
  const { contentId } = req.params;

  try {
    const { data: content, error } = await getSupabase()
      .from('editorial_content')
      .select('media_generation_status, instagram_carousel_urls, carousel_generation_cost_usd, error_message')
      .eq('id', contentId)
      .single();

    if (error || !content) {
      return res.status(404).json({
        success: false,
        error: 'Content not found'
      });
    }

    return res.status(200).json({
      success: true,
      content_id: contentId,
      status: content.media_generation_status,
      carousel_urls: content.instagram_carousel_urls || [],
      cost: content.carousel_generation_cost_usd || 0,
      error: content.error_message || null
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
