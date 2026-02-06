/**
 * INSTAGRAM PUBLISH ROUTES
 *
 * Rotas para agendamento e publicação de posts no Instagram
 * vinculados a campanhas AIC.
 *
 * Endpoints:
 * - POST   /api/campaigns/:id/instagram/schedule    - Agendar nova publicação
 * - GET    /api/campaigns/:id/instagram/posts       - Listar publicações
 * - GET    /api/campaigns/:id/instagram/posts/:postId - Detalhes de uma publicação
 * - PATCH  /api/campaigns/:id/instagram/posts/:postId - Editar agendamento
 * - DELETE /api/campaigns/:id/instagram/posts/:postId - Cancelar publicação
 * - POST   /api/instagram/process-scheduled         - Webhook para N8N processar posts
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { credentialsVault } from '../services/credentials-vault.service';
import axios from 'axios';

const router = Router();

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Graph API config
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ============================================================================
// TYPES
// ============================================================================

interface SchedulePostRequest {
  canvaDesignId?: string;
  canvaDesignName: string;
  contentType?: 'post' | 'carousel' | 'reel';
  caption?: string;
  hashtags?: string[];
  scheduledAt: string; // ISO 8601
  mediaUrl?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}

interface UpdatePostRequest {
  canvaDesignName?: string;
  caption?: string;
  hashtags?: string[];
  scheduledAt?: string;
  mediaUrl?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verifica se campanha existe e retorna dados básicos
 */
async function getCampaign(campaignId: string) {
  const { data, error } = await supabase
    .from('cluster_campaigns')
    .select('id, campaign_name, slug, status')
    .eq('id', campaignId)
    .single();

  if (error || !data) {
    return null;
  }
  return data;
}

/**
 * Busca credenciais Instagram da campanha (access_token descriptografado)
 */
async function getCampaignInstagramCredentials(campaignId: string) {
  const { data, error } = await supabase
    .from('instagram_accounts')
    .select('id, instagram_username, instagram_business_account_id, access_token_encrypted, status')
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
    .not('instagram_business_account_id', 'is', null)
    .not('access_token_encrypted', 'is', null)
    .single();

  if (error || !data) {
    return null;
  }

  // Descriptografar access_token
  let accessToken: string | null = null;
  if (data.access_token_encrypted) {
    try {
      accessToken = credentialsVault.decrypt(data.access_token_encrypted);
    } catch (e) {
      console.error('[Instagram Publish] Error decrypting access token:', e);
    }
  }

  return {
    accountId: data.id,
    username: data.instagram_username,
    businessAccountId: data.instagram_business_account_id,
    accessToken
  };
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/campaigns/:id/instagram/schedule
 * Agendar nova publicação
 */
router.post('/campaigns/:id/instagram/schedule', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.id;
    const body = req.body as SchedulePostRequest;

    // Validações
    if (!campaignId) {
      res.status(400).json({ error: 'Campaign ID is required' });
      return;
    }

    if (!body.canvaDesignName) {
      res.status(400).json({ error: 'canvaDesignName is required' });
      return;
    }

    if (!body.scheduledAt) {
      res.status(400).json({ error: 'scheduledAt is required (ISO 8601 format)' });
      return;
    }

    // Verificar se campanha existe
    const campaign = await getCampaign(campaignId);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Verificar se campanha tem credenciais Instagram
    const credentials = await getCampaignInstagramCredentials(campaignId);
    if (!credentials) {
      res.status(400).json({
        error: 'Campaign does not have Instagram publishing credentials configured',
        hint: 'Configure Instagram account with Meta Graph API access in the campaign credentials page'
      });
      return;
    }

    // Validar data de agendamento
    const scheduledAt = new Date(body.scheduledAt);
    if (isNaN(scheduledAt.getTime())) {
      res.status(400).json({ error: 'Invalid scheduledAt date format' });
      return;
    }

    // Nota: permitimos datas passadas para flexibilidade (ex: publicar imediatamente)

    // Criar post agendado
    const { data: post, error: insertError } = await supabase
      .from('instagram_scheduled_posts')
      .insert({
        campaign_id: campaignId,
        canva_design_id: body.canvaDesignId || null,
        canva_design_name: body.canvaDesignName,
        content_type: body.contentType || 'post',
        caption: body.caption || null,
        hashtags: body.hashtags || null,
        scheduled_at: scheduledAt.toISOString(),
        media_url: body.mediaUrl || null,
        thumbnail_url: body.thumbnailUrl || null,
        metadata: body.metadata || {},
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Instagram Publish] Error creating scheduled post:', insertError);
      res.status(500).json({ error: 'Failed to create scheduled post', details: insertError.message });
      return;
    }

    res.status(201).json({
      success: true,
      message: 'Post scheduled successfully',
      data: {
        id: post.id,
        campaignId: post.campaign_id,
        campaignName: campaign.campaign_name,
        canvaDesignName: post.canva_design_name,
        contentType: post.content_type,
        scheduledAt: post.scheduled_at,
        status: post.status,
        instagramAccount: credentials.username
      }
    });

  } catch (error: any) {
    console.error('[Instagram Publish] Error scheduling post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:id/instagram/posts
 * Listar publicações da campanha
 */
router.get('/campaigns/:id/instagram/posts', async (req: Request, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.id;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!campaignId) {
      res.status(400).json({ error: 'Campaign ID is required' });
      return;
    }

    // Verificar se campanha existe
    const campaign = await getCampaign(campaignId);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Buscar posts
    let query = supabase
      .from('instagram_scheduled_posts')
      .select('*', { count: 'exact' })
      .eq('campaign_id', campaignId)
      .order('scheduled_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: posts, error, count } = await query;

    if (error) {
      console.error('[Instagram Publish] Error fetching posts:', error);
      res.status(500).json({ error: 'Failed to fetch posts', details: error.message });
      return;
    }

    // Buscar credenciais para info
    const credentials = await getCampaignInstagramCredentials(campaignId);

    res.json({
      success: true,
      data: {
        posts: posts || [],
        pagination: {
          total: count || 0,
          limit,
          offset,
          hasMore: (count || 0) > offset + limit
        },
        campaign: {
          id: campaign.id,
          name: campaign.campaign_name,
          instagramAccount: credentials?.username || null,
          hasPublishingCredentials: !!credentials?.accessToken
        }
      }
    });

  } catch (error: any) {
    console.error('[Instagram Publish] Error listing posts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/campaigns/:id/instagram/posts/:postId
 * Detalhes de uma publicação
 */
router.get('/campaigns/:id/instagram/posts/:postId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: campaignId, postId } = req.params;

    if (!campaignId || !postId) {
      res.status(400).json({ error: 'Campaign ID and Post ID are required' });
      return;
    }

    const { data: post, error } = await supabase
      .from('instagram_scheduled_posts')
      .select('*')
      .eq('id', postId)
      .eq('campaign_id', campaignId)
      .single();

    if (error || !post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    res.json({
      success: true,
      data: post
    });

  } catch (error: any) {
    console.error('[Instagram Publish] Error getting post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/campaigns/:id/instagram/posts/:postId
 * Editar agendamento (apenas posts pendentes)
 */
router.patch('/campaigns/:id/instagram/posts/:postId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: campaignId, postId } = req.params;
    const body = req.body as UpdatePostRequest;

    if (!campaignId || !postId) {
      res.status(400).json({ error: 'Campaign ID and Post ID are required' });
      return;
    }

    // Buscar post existente
    const { data: existingPost, error: fetchError } = await supabase
      .from('instagram_scheduled_posts')
      .select('*')
      .eq('id', postId)
      .eq('campaign_id', campaignId)
      .single();

    if (fetchError || !existingPost) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    // Só permite editar posts pendentes
    if (existingPost.status !== 'pending') {
      res.status(400).json({
        error: 'Can only edit pending posts',
        currentStatus: existingPost.status
      });
      return;
    }

    // Preparar updates
    const updates: Record<string, unknown> = {};

    if (body.canvaDesignName !== undefined) {
      updates.canva_design_name = body.canvaDesignName;
    }

    if (body.caption !== undefined) {
      updates.caption = body.caption;
    }

    if (body.hashtags !== undefined) {
      updates.hashtags = body.hashtags;
    }

    if (body.mediaUrl !== undefined) {
      updates.media_url = body.mediaUrl;
    }

    if (body.scheduledAt !== undefined) {
      const scheduledAt = new Date(body.scheduledAt);
      if (isNaN(scheduledAt.getTime())) {
        res.status(400).json({ error: 'Invalid scheduledAt date format' });
        return;
      }
      updates.scheduled_at = scheduledAt.toISOString();
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    // Atualizar
    const { data: updatedPost, error: updateError } = await supabase
      .from('instagram_scheduled_posts')
      .update(updates)
      .eq('id', postId)
      .select()
      .single();

    if (updateError) {
      console.error('[Instagram Publish] Error updating post:', updateError);
      res.status(500).json({ error: 'Failed to update post', details: updateError.message });
      return;
    }

    res.json({
      success: true,
      message: 'Post updated successfully',
      data: updatedPost
    });

  } catch (error: any) {
    console.error('[Instagram Publish] Error updating post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/campaigns/:id/instagram/posts/:postId
 * Cancelar publicação pendente
 */
router.delete('/campaigns/:id/instagram/posts/:postId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: campaignId, postId } = req.params;

    if (!campaignId || !postId) {
      res.status(400).json({ error: 'Campaign ID and Post ID are required' });
      return;
    }

    // Buscar post existente
    const { data: existingPost, error: fetchError } = await supabase
      .from('instagram_scheduled_posts')
      .select('status')
      .eq('id', postId)
      .eq('campaign_id', campaignId)
      .single();

    if (fetchError || !existingPost) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    // Só permite cancelar posts pendentes
    if (existingPost.status !== 'pending') {
      res.status(400).json({
        error: 'Can only cancel pending posts',
        currentStatus: existingPost.status
      });
      return;
    }

    // Marcar como cancelled
    const { error: updateError } = await supabase
      .from('instagram_scheduled_posts')
      .update({ status: 'cancelled' })
      .eq('id', postId);

    if (updateError) {
      console.error('[Instagram Publish] Error cancelling post:', updateError);
      res.status(500).json({ error: 'Failed to cancel post', details: updateError.message });
      return;
    }

    res.json({
      success: true,
      message: 'Post cancelled successfully'
    });

  } catch (error: any) {
    console.error('[Instagram Publish] Error cancelling post:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WEBHOOK FOR N8N PROCESSING
// ============================================================================

/**
 * POST /api/instagram/process-scheduled
 * Webhook para N8N buscar e processar posts agendados
 * Retorna posts prontos para publicação (scheduled_at <= NOW())
 */
router.post('/instagram/process-scheduled', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.body.limit as string) || 10;

    // Buscar posts pendentes usando a função SQL
    const { data: posts, error } = await supabase
      .rpc('get_pending_scheduled_posts', { p_limit: limit });

    if (error) {
      console.error('[Instagram Publish] Error fetching pending posts:', error);
      res.status(500).json({ error: 'Failed to fetch pending posts', details: error.message });
      return;
    }

    if (!posts || posts.length === 0) {
      res.json({
        success: true,
        message: 'No posts ready for publishing',
        data: []
      });
      return;
    }

    // Processar cada post
    const results: Array<{
      postId: string;
      campaignId: string;
      campaignName: string;
      canvaDesignId: string | null;
      canvaDesignName: string;
      contentType: string;
      caption: string | null;
      hashtags: string[] | null;
      mediaUrl: string | null;
      instagramAccountId: string;
      instagramBusinessAccountId: string;
      instagramUsername: string;
      accessToken: string;
    }> = [];

    for (const post of posts) {
      // Marcar como processing
      const { data: marked } = await supabase
        .rpc('mark_post_as_processing', { p_post_id: post.post_id });

      if (!marked) {
        // Outro worker já pegou este post
        continue;
      }

      // Descriptografar access_token
      let accessToken: string | null = null;
      if (post.access_token_encrypted) {
        try {
          accessToken = credentialsVault.decrypt(post.access_token_encrypted);
        } catch (e) {
          console.error('[Instagram Publish] Error decrypting token for post:', post.post_id);
          await supabase.rpc('mark_post_as_failed', {
            p_post_id: post.post_id,
            p_error_message: 'Failed to decrypt access token'
          });
          continue;
        }
      }

      if (!accessToken || !post.instagram_business_account_id) {
        await supabase.rpc('mark_post_as_failed', {
          p_post_id: post.post_id,
          p_error_message: 'Missing Instagram credentials'
        });
        continue;
      }

      results.push({
        postId: post.post_id,
        campaignId: post.campaign_id,
        campaignName: post.campaign_name,
        canvaDesignId: post.canva_design_id,
        canvaDesignName: post.canva_design_name,
        contentType: post.content_type,
        caption: post.caption,
        hashtags: post.hashtags,
        mediaUrl: post.media_url,
        instagramAccountId: post.instagram_account_id,
        instagramBusinessAccountId: post.instagram_business_account_id,
        instagramUsername: post.instagram_username,
        accessToken // Enviado para N8N processar
      });
    }

    res.json({
      success: true,
      message: `Found ${results.length} posts ready for publishing`,
      data: results
    });

  } catch (error: any) {
    console.error('[Instagram Publish] Error processing scheduled posts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/instagram/publish-result
 * Webhook para N8N reportar resultado da publicação
 */
router.post('/instagram/publish-result', async (req: Request, res: Response): Promise<void> => {
  try {
    const { postId, success, mediaId, permalink, error: errorMessage } = req.body;

    if (!postId) {
      res.status(400).json({ error: 'postId is required' });
      return;
    }

    if (success) {
      await supabase.rpc('mark_post_as_published', {
        p_post_id: postId,
        p_media_id: mediaId || null,
        p_permalink: permalink || null
      });

      res.json({
        success: true,
        message: 'Post marked as published'
      });
    } else {
      await supabase.rpc('mark_post_as_failed', {
        p_post_id: postId,
        p_error_message: errorMessage || 'Unknown error'
      });

      res.json({
        success: true,
        message: 'Post marked as failed'
      });
    }

  } catch (error: any) {
    console.error('[Instagram Publish] Error updating publish result:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/instagram/publish-now
 * Publicar imediatamente usando Graph API (bypass do agendamento)
 */
router.post('/instagram/publish-now', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      campaignId,
      mediaUrl,
      caption,
      hashtags,
      contentType = 'post'
    } = req.body;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }

    if (!mediaUrl) {
      res.status(400).json({ error: 'mediaUrl is required' });
      return;
    }

    // Buscar credenciais
    const credentials = await getCampaignInstagramCredentials(campaignId);
    if (!credentials || !credentials.accessToken) {
      res.status(400).json({
        error: 'Campaign does not have valid Instagram publishing credentials'
      });
      return;
    }

    // Montar caption com hashtags
    let fullCaption = caption || '';
    if (hashtags && hashtags.length > 0) {
      const hashtagsString = hashtags.map((tag: string) => `#${tag.replace('#', '')}`).join(' ');
      fullCaption = fullCaption ? `${fullCaption}\n\n${hashtagsString}` : hashtagsString;
    }

    // Publicar via Graph API
    let mediaType = 'IMAGE';
    let mediaParam = 'image_url';

    if (contentType === 'reel') {
      mediaType = 'REELS';
      mediaParam = 'video_url';
    }

    // Step 1: Create media container
    const containerParams: Record<string, string> = {
      [mediaParam]: mediaUrl,
      caption: fullCaption,
      access_token: credentials.accessToken
    };

    if (contentType === 'reel') {
      containerParams.media_type = 'REELS';
      containerParams.share_to_feed = 'true';
    }

    const containerResponse = await axios.post(
      `${GRAPH_API_BASE_URL}/${credentials.businessAccountId}/media`,
      null,
      { params: containerParams }
    );

    const containerId = containerResponse.data.id;
    console.log(`[Instagram Publish] Container created: ${containerId}`);

    // Step 2: Wait for processing (for reels)
    if (contentType === 'reel') {
      let processed = false;
      for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const statusResponse = await axios.get(
          `${GRAPH_API_BASE_URL}/${containerId}`,
          {
            params: {
              fields: 'status_code',
              access_token: credentials.accessToken
            }
          }
        );

        if (statusResponse.data.status_code === 'FINISHED') {
          processed = true;
          break;
        }

        if (statusResponse.data.status_code === 'ERROR') {
          throw new Error('Video processing failed');
        }
      }

      if (!processed) {
        throw new Error('Video processing timeout');
      }
    }

    // Step 3: Publish
    const publishResponse = await axios.post(
      `${GRAPH_API_BASE_URL}/${credentials.businessAccountId}/media_publish`,
      null,
      {
        params: {
          creation_id: containerId,
          access_token: credentials.accessToken
        }
      }
    );

    const mediaId = publishResponse.data.id;

    // Step 4: Get permalink
    const mediaResponse = await axios.get(
      `${GRAPH_API_BASE_URL}/${mediaId}`,
      {
        params: {
          fields: 'permalink',
          access_token: credentials.accessToken
        }
      }
    );

    const permalink = mediaResponse.data.permalink;

    res.json({
      success: true,
      message: 'Published successfully',
      data: {
        mediaId,
        permalink,
        instagramAccount: credentials.username
      }
    });

  } catch (error: any) {
    console.error('[Instagram Publish] Error publishing now:', error.response?.data || error);
    res.status(500).json({
      error: 'Failed to publish',
      message: error.response?.data?.error?.message || error.message
    });
  }
});

/**
 * GET /api/instagram/publish/health
 * Health check
 */
router.get('/instagram/publish/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'Instagram Scheduled Publisher',
    version: '1.0.0',
    endpoints: [
      'POST   /api/campaigns/:id/instagram/schedule',
      'GET    /api/campaigns/:id/instagram/posts',
      'GET    /api/campaigns/:id/instagram/posts/:postId',
      'PATCH  /api/campaigns/:id/instagram/posts/:postId',
      'DELETE /api/campaigns/:id/instagram/posts/:postId',
      'POST   /api/instagram/process-scheduled',
      'POST   /api/instagram/publish-result',
      'POST   /api/instagram/publish-now'
    ],
    timestamp: new Date().toISOString()
  });
});

export default router;
