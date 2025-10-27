import { Router, Request, Response } from 'express';
import VideoGeneratorService from '../services/video-generator.service';

const router = Router();
const videoGenerator = new VideoGeneratorService();

/**
 * POST /api/video-generation/instagram/:id
 * Generate Instagram Reel for editorial content
 */
router.post('/instagram/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = req.body as { text?: string; theme?: string };
    const text = body.text;
    const theme = body.theme;

    if (!id || !text || !theme) {
      res.status(400).json({
        success: false,
        error: 'id, text and theme are required'
      });
      return;
    }

    console.log(`🎬 Generating Instagram Reel for content ${id}...`);

    const result = await videoGenerator.generateInstagramReel({
      contentId: id,
      text: text!,
      theme: theme!
    });

    if (result.success) {
      res.json({
        success: true,
        video_url: result.videoUrl,
        thumbnail_url: result.thumbnailUrl,
        duration: result.duration,
        message: 'Instagram Reel gerado com sucesso!'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('Error generating Instagram Reel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/video-generation/youtube/:id
 * Generate YouTube video for editorial content
 */
router.post('/youtube/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = req.body as { text?: string; theme?: string };
    const text = body.text;
    const theme = body.theme;

    if (!id || !text || !theme) {
      res.status(400).json({
        success: false,
        error: 'id, text and theme are required'
      });
      return;
    }

    console.log(`🎬 Generating YouTube video for content ${id}...`);

    const result = await videoGenerator.generateYouTubeVideo({
      contentId: id,
      text: text!,
      theme: theme!
    });

    if (result.success) {
      res.json({
        success: true,
        video_url: result.videoUrl,
        thumbnail_url: result.thumbnailUrl,
        duration: result.duration,
        message: 'YouTube video gerado com sucesso!'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('Error generating YouTube video:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/video-generation/batch
 * Generate videos for multiple content items
 */
router.post('/batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const { content_ids, platforms } = req.body;

    if (!Array.isArray(content_ids) || content_ids.length === 0) {
      res.status(400).json({
        success: false,
        error: 'content_ids must be a non-empty array'
      });
      return;
    }

    if (!Array.isArray(platforms) || platforms.length === 0) {
      res.status(400).json({
        success: false,
        error: 'platforms must be a non-empty array (instagram, youtube)'
      });
      return;
    }

    console.log(`🎬 Batch generating ${content_ids.length} videos for platforms: ${platforms.join(', ')}`);

    const results: any[] = [];

    for (const contentId of content_ids) {
      // Get content from database
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: content, error } = await supabase
        .from('editorial_content')
        .select('*')
        .eq('id', contentId)
        .single();

      if (error || !content) {
        results.push({
          contentId,
          success: false,
          error: 'Content not found'
        });
        continue;
      }

      // Generate for each platform
      for (const platform of platforms) {
        try {
          let result;

          if (platform === 'instagram') {
            result = await videoGenerator.generateInstagramReel({
              contentId,
              text: content.instagram_post || content.instagram_caption,
              theme: content.main_theme
            });
          } else if (platform === 'youtube') {
            result = await videoGenerator.generateYouTubeVideo({
              contentId,
              text: content.youtube_segment,
              theme: content.main_theme
            });
          }

          results.push({
            contentId,
            platform,
            ...result
          });
        } catch (err: any) {
          results.push({
            contentId,
            platform,
            success: false,
            error: err.message
          });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = content_ids.length * platforms.length;

    res.json({
      success: true,
      results,
      summary: {
        total: totalCount,
        succeeded: successCount,
        failed: totalCount - successCount
      }
    });

  } catch (error: any) {
    console.error('Error in batch video generation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
