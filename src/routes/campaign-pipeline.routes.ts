/**
 * CAMPAIGN PIPELINE ROUTES
 *
 * Endpoints para execução do pipeline de campanhas:
 * - POST /execute - Executa pipeline completo
 * - GET /status/:campaignId - Status detalhado do pipeline
 * - GET /subclusters/:campaignId - Lista subclusters da campanha
 * - GET /outreach/:campaignId - Próximos leads para outreach (para n8n)
 * - POST /outreach/:campaignId/mark-sent - Marca leads como enviados
 */

import { Router, Request, Response } from 'express';
import {
  executeCampaignPipeline,
  getCampaignPipelineStatus
} from '../services/campaign-pipeline.service';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================
// PIPELINE EXECUTION
// ============================================

/**
 * POST /api/campaign-pipeline/execute
 *
 * Executa o pipeline completo de uma campanha:
 * 1. Clustering dos leads
 * 2. Criação de subclusters
 * 3. Geração de personas
 * 4. Geração de DM scripts
 * 5. Geração de copies
 * 6. População da fila de outreach
 *
 * Body:
 * - campaign_id: string (obrigatório)
 * - k_override?: number (número de clusters, opcional)
 * - max_leads?: number (limite de leads, default 2000)
 * - channel?: string (canal preferido: instagram, whatsapp, email)
 * - skip_outreach_queue?: boolean (pular população da fila)
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const {
      campaign_id,
      k_override,
      max_leads = 2000,
      channel = 'instagram',
      skip_outreach_queue = false
    } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        error: 'campaign_id é obrigatório'
      });
    }

    console.log(`\n📥 [API] POST /campaign-pipeline/execute`);
    console.log(`   Campaign ID: ${campaign_id}`);
    console.log(`   Channel: ${channel}`);
    console.log(`   Max Leads: ${max_leads}`);

    const result = await executeCampaignPipeline(campaign_id, {
      kOverride: k_override,
      maxLeads: max_leads,
      channel,
      skipOutreachQueue: skip_outreach_queue
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);

  } catch (error: any) {
    console.error('❌ Erro ao executar pipeline:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno'
    });
  }
});

// ============================================
// PIPELINE STATUS
// ============================================

/**
 * GET /api/campaign-pipeline/status/:campaignId
 *
 * Retorna status detalhado do pipeline de uma campanha
 */
router.get('/status/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: 'campaignId é obrigatório'
      });
    }

    const status = await getCampaignPipelineStatus(campaignId);

    if (!status.campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campanha não encontrada'
      });
    }

    return res.json({
      success: true,
      ...status
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar status:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno'
    });
  }
});

// ============================================
// SUBCLUSTERS
// ============================================

/**
 * GET /api/campaign-pipeline/subclusters/:campaignId
 *
 * Lista todos os subclusters de uma campanha
 */
router.get('/subclusters/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { include_leads = 'false' } = req.query;

    const { data: subclusters, error } = await supabase
      .from('campaign_subclusters')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('priority_score', { ascending: false });

    if (error) throw error;

    // Se solicitado, incluir contagem de leads por subcluster
    if (include_leads === 'true') {
      for (const subcluster of subclusters || []) {
        const { count } = await supabase
          .from('campaign_leads')
          .select('*', { count: 'exact', head: true })
          .eq('subcluster_id', subcluster.id);

        subcluster.leads_count = count || 0;
      }
    }

    return res.json({
      success: true,
      campaign_id: campaignId,
      total: subclusters?.length || 0,
      subclusters
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar subclusters:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno'
    });
  }
});

/**
 * GET /api/campaign-pipeline/subclusters/:campaignId/:subclusterId
 *
 * Detalhes de um subcluster específico
 */
router.get('/subclusters/:campaignId/:subclusterId', async (req: Request, res: Response) => {
  try {
    const { campaignId, subclusterId } = req.params;

    const { data: subcluster, error } = await supabase
      .from('campaign_subclusters')
      .select('*')
      .eq('id', subclusterId)
      .eq('campaign_id', campaignId)
      .single();

    if (error || !subcluster) {
      return res.status(404).json({
        success: false,
        error: 'Subcluster não encontrado'
      });
    }

    // Buscar leads do subcluster
    const { data: leads, count } = await supabase
      .from('campaign_leads')
      .select('*, instagram_leads(username, full_name, bio, email, phone)', { count: 'exact' })
      .eq('subcluster_id', subclusterId)
      .order('fit_score', { ascending: false })
      .limit(100);

    return res.json({
      success: true,
      subcluster,
      leads: {
        total: count || 0,
        sample: leads || []
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar subcluster:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno'
    });
  }
});

// ============================================
// OUTREACH QUEUE (para n8n)
// ============================================

/**
 * GET /api/campaign-pipeline/outreach/:campaignId
 *
 * Retorna próximo lote de leads para outreach
 * Este endpoint é consumido pelo n8n para processar envios
 *
 * Query params:
 * - channel: string (instagram, whatsapp, email)
 * - batch_size: number (default 50)
 */
router.get('/outreach/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const {
      channel = 'instagram',
      batch_size = '50'
    } = req.query;

    const batchSizeNum = parseInt(batch_size as string) || 50;

    // Usar função SQL para obter batch com lock
    const { data, error } = await supabase.rpc('get_next_outreach_batch', {
      p_campaign_id: campaignId,
      p_channel: channel as string,
      p_batch_size: batchSizeNum
    });

    if (error) {
      // Se a função não existir, fallback para query direta
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('campaign_outreach_queue')
        .select(`
          id,
          lead_id,
          lead_username,
          lead_full_name,
          lead_bio,
          subcluster_name,
          dm_script_used,
          persona_snapshot,
          priority_score
        `)
        .eq('campaign_id', campaignId)
        .eq('channel', channel)
        .eq('status', 'pending')
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(batchSizeNum);

      if (fallbackError) throw fallbackError;

      return res.json({
        success: true,
        campaign_id: campaignId,
        channel,
        batch_size: fallbackData?.length || 0,
        leads: fallbackData || []
      });
    }

    return res.json({
      success: true,
      campaign_id: campaignId,
      channel,
      batch_size: data?.length || 0,
      leads: data || []
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar outreach batch:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno'
    });
  }
});

/**
 * POST /api/campaign-pipeline/outreach/:campaignId/mark-sent
 *
 * Marca leads como enviados após processamento pelo n8n
 *
 * Body:
 * - outreach_ids: string[] (IDs dos registros de outreach)
 * - status: string (sent, failed, delivered)
 * - error_message?: string (se status = failed)
 */
router.post('/outreach/:campaignId/mark-sent', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const {
      outreach_ids,
      status = 'sent',
      error_message
    } = req.body;

    if (!outreach_ids || !Array.isArray(outreach_ids) || outreach_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'outreach_ids é obrigatório e deve ser um array'
      });
    }

    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'sent') {
      updateData.sent_at = new Date().toISOString();
    }

    if (error_message) {
      updateData.error_message = error_message;
    }

    updateData.attempt_count = supabase.rpc('increment', { x: 1 });
    updateData.last_attempt_at = new Date().toISOString();

    const { error } = await supabase
      .from('campaign_outreach_queue')
      .update(updateData)
      .eq('campaign_id', campaignId)
      .in('id', outreach_ids);

    if (error) throw error;

    // Atualizar status dos leads correspondentes
    const { data: outreachRecords } = await supabase
      .from('campaign_outreach_queue')
      .select('lead_id')
      .in('id', outreach_ids);

    if (outreachRecords && outreachRecords.length > 0) {
      const leadIds = outreachRecords.map(r => r.lead_id);

      await supabase
        .from('campaign_leads')
        .update({
          status: status === 'sent' ? 'contacted' : 'pending',
          contacted_at: status === 'sent' ? new Date().toISOString() : null
        })
        .eq('campaign_id', campaignId)
        .in('lead_id', leadIds);
    }

    return res.json({
      success: true,
      updated: outreach_ids.length,
      status
    });

  } catch (error: any) {
    console.error('❌ Erro ao marcar outreach:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno'
    });
  }
});

/**
 * POST /api/campaign-pipeline/outreach/:campaignId/mark-replied
 *
 * Marca lead como respondeu (para tracking de conversão)
 *
 * Body:
 * - outreach_id: string
 * - response_text?: string
 */
router.post('/outreach/:campaignId/mark-replied', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { outreach_id, response_text } = req.body;

    if (!outreach_id) {
      return res.status(400).json({
        success: false,
        error: 'outreach_id é obrigatório'
      });
    }

    const { error } = await supabase
      .from('campaign_outreach_queue')
      .update({
        status: 'replied',
        replied_at: new Date().toISOString(),
        response_text,
        updated_at: new Date().toISOString()
      })
      .eq('id', outreach_id)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    // Atualizar lead correspondente
    const { data: outreach } = await supabase
      .from('campaign_outreach_queue')
      .select('lead_id')
      .eq('id', outreach_id)
      .single();

    if (outreach) {
      await supabase
        .from('campaign_leads')
        .update({
          status: 'replied',
          updated_at: new Date().toISOString()
        })
        .eq('campaign_id', campaignId)
        .eq('lead_id', outreach.lead_id);
    }

    return res.json({
      success: true,
      outreach_id,
      status: 'replied'
    });

  } catch (error: any) {
    console.error('❌ Erro ao marcar reply:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno'
    });
  }
});

/**
 * POST /api/campaign-pipeline/outreach/:campaignId/mark-converted
 *
 * Marca lead como convertido
 */
router.post('/outreach/:campaignId/mark-converted', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { outreach_id } = req.body;

    if (!outreach_id) {
      return res.status(400).json({
        success: false,
        error: 'outreach_id é obrigatório'
      });
    }

    const { error } = await supabase
      .from('campaign_outreach_queue')
      .update({
        status: 'converted',
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', outreach_id)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    // Atualizar lead correspondente
    const { data: outreach } = await supabase
      .from('campaign_outreach_queue')
      .select('lead_id')
      .eq('id', outreach_id)
      .single();

    if (outreach) {
      await supabase
        .from('campaign_leads')
        .update({
          status: 'converted',
          updated_at: new Date().toISOString()
        })
        .eq('campaign_id', campaignId)
        .eq('lead_id', outreach.lead_id);
    }

    return res.json({
      success: true,
      outreach_id,
      status: 'converted'
    });

  } catch (error: any) {
    console.error('❌ Erro ao marcar conversão:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno'
    });
  }
});

// ============================================
// ANALYTICS
// ============================================

/**
 * GET /api/campaign-pipeline/analytics/:campaignId
 *
 * Métricas e analytics do pipeline de uma campanha
 */
router.get('/analytics/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Buscar campanha
    const { data: campaign } = await supabase
      .from('cluster_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campanha não encontrada'
      });
    }

    // Métricas de subclusters
    const { data: subclusters } = await supabase
      .from('campaign_subclusters')
      .select('id, cluster_name, total_leads, priority_score, status')
      .eq('campaign_id', campaignId);

    // Métricas de outreach por status
    const { data: outreachByStatus } = await supabase
      .from('campaign_outreach_queue')
      .select('status')
      .eq('campaign_id', campaignId);

    const outreachStats = (outreachByStatus || []).reduce((acc: Record<string, number>, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    // Métricas de leads por status
    const { data: leadsByStatus } = await supabase
      .from('campaign_leads')
      .select('status')
      .eq('campaign_id', campaignId);

    const leadsStats = (leadsByStatus || []).reduce((acc: Record<string, number>, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    // Calcular taxas
    const totalOutreach = Object.values(outreachStats).reduce((a, b) => a + b, 0);
    const totalSent = outreachStats['sent'] || 0;
    const totalReplied = outreachStats['replied'] || 0;
    const totalConverted = outreachStats['converted'] || 0;

    return res.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.campaign_name,
        nicho: campaign.nicho_principal,
        pipeline_status: campaign.pipeline_status,
        total_subclusters: campaign.total_subclusters,
        total_leads: campaign.total_leads_in_campaign
      },
      subclusters: subclusters || [],
      outreach: {
        total: totalOutreach,
        by_status: outreachStats,
        sent_rate: totalOutreach > 0 ? ((totalSent / totalOutreach) * 100).toFixed(1) : 0,
        reply_rate: totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : 0,
        conversion_rate: totalReplied > 0 ? ((totalConverted / totalReplied) * 100).toFixed(1) : 0
      },
      leads: {
        total: Object.values(leadsStats).reduce((a, b) => a + b, 0),
        by_status: leadsStats
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar analytics:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno'
    });
  }
});

// ============================================
// RESET/CLEANUP (Development)
// ============================================

/**
 * POST /api/campaign-pipeline/reset/:campaignId
 *
 * Reseta o pipeline de uma campanha para re-execução
 * CUIDADO: Remove todos os subclusters, leads e outreach da campanha
 *
 * Body:
 * - confirm: boolean (deve ser true para executar)
 */
router.post('/reset/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { confirm } = req.body;

    if (confirm !== true) {
      return res.status(400).json({
        success: false,
        error: 'Confirmação necessária. Envie { "confirm": true } no body.'
      });
    }

    console.log(`\n🔄 [RESET] Resetando pipeline da campanha: ${campaignId}`);

    // 1. Deletar outreach queue
    const { count: outreachCount } = await supabase
      .from('campaign_outreach_queue')
      .delete({ count: 'exact' })
      .eq('campaign_id', campaignId);
    console.log(`   ✅ ${outreachCount || 0} registros de outreach removidos`);

    // 2. Deletar campaign leads
    const { count: leadsCount } = await supabase
      .from('campaign_leads')
      .delete({ count: 'exact' })
      .eq('campaign_id', campaignId);
    console.log(`   ✅ ${leadsCount || 0} leads da campanha removidos`);

    // 3. Deletar subclusters
    const { count: subclustersCount } = await supabase
      .from('campaign_subclusters')
      .delete({ count: 'exact' })
      .eq('campaign_id', campaignId);
    console.log(`   ✅ ${subclustersCount || 0} subclusters removidos`);

    // 4. Reset status da campanha
    await supabase
      .from('cluster_campaigns')
      .update({
        pipeline_status: 'pending',
        pipeline_started_at: null,
        pipeline_completed_at: null,
        total_subclusters: 0,
        total_leads_assigned: 0,
        total_outreach_queued: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);
    console.log(`   ✅ Status da campanha resetado`);

    return res.json({
      success: true,
      message: 'Pipeline resetado com sucesso',
      deleted: {
        outreach: outreachCount || 0,
        leads: leadsCount || 0,
        subclusters: subclustersCount || 0
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao resetar pipeline:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno'
    });
  }
});

export default router;
