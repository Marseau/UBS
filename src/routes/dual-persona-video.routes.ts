/**
 * Dual Persona Video Generation Routes
 *
 * API endpoints for generating Instagram Reels with Carla + Bruno
 */

import { Router, Request, Response } from 'express';
import { singleVideoGenerator } from '../services/single-video-generator.service';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const router = Router();

/**
 * POST /api/dual-persona-video/generate/:contentId
 *
 * Generate dual persona Reel for a specific editorial content
 */
router.post('/generate/:contentId', async (req: Request, res: Response) => {
  const { contentId } = req.params;

  if (!contentId) {
    return res.status(400).json({
      success: false,
      error: 'contentId is required'
    });
  }

  try {
    console.log(`📥 Request to generate dual persona video for content ${contentId}`);

    // Fetch content from database
    const { data: content, error: fetchError } = await supabase
      .from('editorial_content')
      .select('id, carla_script, bruno_script, week_number, day_of_week')
      .eq('id', contentId)
      .single();

    if (fetchError || !content) {
      return res.status(404).json({
        success: false,
        error: 'Content not found',
        details: fetchError?.message
      });
    }

    // Validate scripts exist
    if (!content.carla_script || !content.bruno_script) {
      return res.status(400).json({
        success: false,
        error: 'Missing carla_script or bruno_script in content'
      });
    }

    // Update status to generating
    await supabase
      .from('editorial_content')
      .update({
        media_generation_status: 'generating'
      })
      .eq('id', contentId);

    // Generate single unified video
    const result = await singleVideoGenerator.generateSingleReel(
      content.carla_script,
      content.bruno_script,
      contentId as string
    );

    // Update database with results
    const { error: updateError } = await supabase
      .from('editorial_content')
      .update({
        instagram_reel_url: result.video_url,
        merged_video_duration_seconds: result.video_duration_seconds,
        video_generation_cost_usd: result.cost_usd,
        media_generation_status: 'done',
        media_generated_at: new Date().toISOString()
      })
      .eq('id', contentId);

    if (updateError) {
      console.error('❌ Error updating database:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update database',
        details: updateError.message,
        result // Still return the result even if DB update fails
      });
    }

    console.log(`✅ Dual persona video generation complete for content ${contentId}`);

    return res.status(200).json({
      success: true,
      content_id: contentId,
      week_number: content.week_number,
      day_of_week: content.day_of_week,
      video_url: result.video_url,
      duration: result.video_duration_seconds,
      cost: result.cost_usd
    });

  } catch (error: any) {
    console.error('❌ Error generating unified video:', error);

    // Update status to error
    await supabase
      .from('editorial_content')
      .update({
        media_generation_status: 'error'
      })
      .eq('id', contentId);

    return res.status(500).json({
      success: false,
      error: 'Video generation failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/dual-persona-video/batch-generate
 *
 * Generate videos for multiple content IDs
 */
router.post('/batch-generate', async (req: Request, res: Response) => {
  const { contentIds } = req.body;

  if (!Array.isArray(contentIds) || contentIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'contentIds must be a non-empty array'
    });
  }

  console.log(`📥 Batch generation request for ${contentIds.length} contents`);

  const results: Array<{
    contentId: any;
    success: boolean;
    result?: any;
    error?: string;
  }> = [];

  for (const contentId of contentIds) {
    try {
      // Fetch content
      const { data: content, error: fetchError } = await supabase
        .from('editorial_content')
        .select('id, carla_script, bruno_script')
        .eq('id', contentId)
        .single();

      if (fetchError || !content) {
        results.push({
          contentId,
          success: false,
          error: 'Content not found'
        });
        continue;
      }

      if (!content.carla_script || !content.bruno_script) {
        results.push({
          contentId,
          success: false,
          error: 'Missing scripts'
        });
        continue;
      }

      // Generate single unified video
      const result = await singleVideoGenerator.generateSingleReel(
        content.carla_script,
        content.bruno_script,
        contentId as string
      );

      // Update database
      await supabase
        .from('editorial_content')
        .update({
          instagram_reel_url: result.video_url,
          merged_video_duration_seconds: result.video_duration_seconds,
          video_generation_cost_usd: result.cost_usd,
          media_generation_status: 'done',
          media_generated_at: new Date().toISOString()
        })
        .eq('id', contentId);

      results.push({
        contentId,
        success: true,
        result: {
          video_url: result.video_url,
          duration: result.video_duration_seconds,
          cost: result.cost_usd
        }
      });

    } catch (error: any) {
      results.push({
        contentId,
        success: false,
        error: error.message
      });

      // Update status to error
      await supabase
        .from('editorial_content')
        .update({
          media_generation_status: 'error'
        })
        .eq('id', contentId);
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;

  console.log(`✅ Batch generation complete: ${successCount} success, ${failCount} failed`);

  return res.status(200).json({
    success: true,
    total: results.length,
    successful: successCount,
    failed: failCount,
    results
  });
});

/**
 * GET /api/dual-persona-video/status/:contentId
 *
 * Get video generation status for a content
 */
router.get('/status/:contentId', async (req: Request, res: Response) => {
  const { contentId } = req.params;

  if (!contentId) {
    return res.status(400).json({
      success: false,
      error: 'contentId is required'
    });
  }

  try {
    const { data: content, error } = await supabase
      .from('editorial_content')
      .select(`
        id,
        week_number,
        day_of_week,
        media_generation_status,
        instagram_reel_url,
        merged_video_duration_seconds,
        video_generation_cost_usd,
        media_generated_at
      `)
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
      content
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
