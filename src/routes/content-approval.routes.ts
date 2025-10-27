import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/content-approval/pending
 * Get all content pending approval
 */
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const { week_number, year } = req.query;

    let query = supabase
      .from('editorial_content')
      .select('*')
      .order('year', { ascending: false })
      .order('week_number', { ascending: false });

    // Optional filters
    if (week_number) {
      query = query.eq('week_number', parseInt(week_number as string));
    }
    if (year) {
      query = query.eq('year', parseInt(year as string));
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      count: data?.length || 0,
      data
    });
  } catch (error: any) {
    console.error('Error fetching pending content:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/content-approval/:id
 * Get specific content by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('editorial_content')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('Error fetching content:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/content-approval/:id/edit
 * Edit content before approval
 */
router.put('/:id/edit', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // CORRIGIDO: Campos editáveis atualizados para nova estrutura
    const allowedFields = [
      // Twitter threads
      'thread_1_tweets',
      'thread_2_tweets',
      'thread_3_tweets',
      'thread_1_title',
      'thread_2_title',
      'thread_3_title',
      // Instagram reels
      'reel_1_instagram_caption',
      'reel_2_instagram_caption',
      'reel_3_instagram_caption',
      'reel_1_instagram_hashtags',
      'reel_2_instagram_hashtags',
      'reel_3_instagram_hashtags',
      // YouTube
      'youtube_caption'
    ];

    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedFields.includes(key))
      .reduce((obj: any, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update',
        allowedFields
      });
    }

    const { data, error } = await supabase
      .from('editorial_content')
      .update(filteredUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Content updated successfully',
      data
    });
  } catch (error: any) {
    console.error('Error updating content:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-approval/:id/approve
 * Approve specific thread/reel/youtube
 */
router.post('/:id/approve', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { thread_number, reel_number, youtube, approved_by } = req.body;

    const updates: any = {
      approved_by: approved_by || 'system',
      approved_at: new Date().toISOString()
    };

    // CORRIGIDO: Aprovação individual de threads/reels/youtube
    if (thread_number) {
      const threadNum = parseInt(thread_number);
      if (threadNum >= 1 && threadNum <= 3) {
        updates[`thread_${threadNum}_approved`] = true;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid thread_number (must be 1, 2, or 3)'
        });
      }
    } else if (reel_number) {
      const reelNum = parseInt(reel_number);
      if (reelNum >= 1 && reelNum <= 3) {
        updates[`reel_${reelNum}_approved`] = true;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid reel_number (must be 1, 2, or 3)'
        });
      }
    } else if (youtube) {
      updates.youtube_short_approved = true;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Must specify thread_number, reel_number, or youtube: true'
      });
    }

    const { data, error } = await supabase
      .from('editorial_content')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    let approvedItem = '';
    if (thread_number) approvedItem = `Thread ${thread_number}`;
    else if (reel_number) approvedItem = `Reel ${reel_number}`;
    else if (youtube) approvedItem = 'YouTube Short';

    res.json({
      success: true,
      message: `${approvedItem} approved successfully`,
      data
    });
  } catch (error: any) {
    console.error('Error approving content:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-approval/:id/approve-all
 * Approve ALL content for the week (21 tweets + 3 reels + 1 short)
 */
router.post('/:id/approve-all', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved_by } = req.body;

    const updates = {
      // Twitter threads (all 3)
      thread_1_approved: true,
      thread_2_approved: true,
      thread_3_approved: true,
      // Instagram reels (all 3)
      reel_1_approved: true,
      reel_2_approved: true,
      reel_3_approved: true,
      // YouTube short
      youtube_short_approved: true,
      // Metadata
      approved_by: approved_by || 'system',
      approved_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('editorial_content')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'All week content approved (21 tweets + 3 reels + 1 short)',
      data
    });
  } catch (error: any) {
    console.error('Error approving all content:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-approval/:id/reject
 * Reject content with reason
 */
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, rejected_by } = req.body;

    // When rejecting, clear video URLs to allow regeneration
    const { data, error} = await supabase
      .from('editorial_content')
      .update({
        rejected: true,
        rejection_reason: reason,
        approved_by: rejected_by || 'system',
        approved_at: new Date().toISOString(),
        // Clear video URLs to allow regeneration
        reel_1_video_url: null,
        reel_2_video_url: null,
        reel_3_video_url: null,
        youtube_short_url: null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Content rejected - video URLs cleared for regeneration',
      data
    });
  } catch (error: any) {
    console.error('Error rejecting content:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-approval/approve-batch
 * Approve multiple content items at once
 */
router.post('/approve-batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids, approved_by } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        error: 'ids must be a non-empty array'
      });
      return;
    }

    const updates = {
      // Approve all
      thread_1_approved: true,
      thread_2_approved: true,
      thread_3_approved: true,
      reel_1_approved: true,
      reel_2_approved: true,
      reel_3_approved: true,
      youtube_short_approved: true,
      // Metadata
      approved_by: approved_by || 'system',
      approved_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('editorial_content')
      .update(updates)
      .in('id', ids)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: `${data?.length || 0} weeks approved`,
      data
    });
  } catch (error: any) {
    console.error('Error batch approving content:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
