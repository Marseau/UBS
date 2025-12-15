import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

router.get('/:campaignId/performance', async (req: Request, res: Response) => {
  const { campaignId } = req.params;

  if (!campaignId) {
    return res.status(400).json({ error: 'campaignId é obrigatório' });
  }

  try {
    const [funnel, leads, cta, cost] = await Promise.all([
      supabase.from('vw_funnel_seo').select('*').eq('campaign_id', campaignId).maybeSingle(),
      supabase.from('vw_leads_by_source').select('*').eq('campaign_id', campaignId),
      supabase.from('vw_cta_performance').select('*').eq('campaign_id', campaignId),
      supabase.from('vw_cost_per_source').select('*').eq('campaign_id', campaignId)
    ]);

    const errs = [funnel.error, leads.error, cta.error, cost.error].filter(Boolean) as any[];
    if (errs.length) {
      const msg = errs.map((e) => e.message || e.toString()).join(' | ');
      const isMissingViews = msg.includes('vw_funnel_seo') || msg.includes('vw_leads_by_source') || msg.includes('vw_cta_performance') || msg.includes('vw_cost_per_source');
      return res.status(isMissingViews ? 400 : 500).json({
        error: 'Erro ao carregar performance',
        details: msg,
        code: isMissingViews ? 'views_missing' : undefined
      });
    }

    return res.json({
      campaign_id: campaignId,
      funnel: funnel.data || null,
      leads_by_source: leads.data || [],
      cta_performance: cta.data || [],
      cost_per_source: cost.data || []
    });
  } catch (error: any) {
    console.error('[campaign-performance] erro:', error);
    const msg = error?.message || String(error);
    const isMissingViews = msg.includes('vw_funnel_seo') || msg.includes('vw_leads_by_source') || msg.includes('vw_cta_performance') || msg.includes('vw_cost_per_source');
    return res.status(isMissingViews ? 400 : 500).json({
      error: 'Erro ao carregar performance',
      details: msg,
      code: isMissingViews ? 'views_missing' : undefined
    });
  }
});

// Listagem simples de campanhas (id, name, status/pipeline_status) usando cluster_campaigns
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, status, pipeline_status, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const campaigns = (data || []).map((c: any) => ({
      id: c.id,
      name: c.campaign_name,
      status: c.pipeline_status || c.status || 'unknown'
    }));

    return res.json({ campaigns });
  } catch (error: any) {
    console.error('[campaign-performance] erro listando campanhas:', error);
    return res.status(500).json({ error: 'Erro ao listar campanhas', details: error.message });
  }
});

export default router;
