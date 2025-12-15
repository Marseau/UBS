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

    if (funnel.error) throw funnel.error;
    if (leads.error) throw leads.error;
    if (cta.error) throw cta.error;
    if (cost.error) throw cost.error;

    return res.json({
      campaign_id: campaignId,
      funnel: funnel.data || null,
      leads_by_source: leads.data || [],
      cta_performance: cta.data || [],
      cost_per_source: cost.data || []
    });
  } catch (error: any) {
    console.error('[campaign-performance] erro:', error);
    return res.status(500).json({ error: 'Erro ao carregar performance', details: error.message });
  }
});

// Listagem simples de campanhas (id, name, status)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('aic_campaigns')
      .select('id, name, status, start_date, end_date')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({
      campaigns: data || []
    });
  } catch (error: any) {
    console.error('[campaign-performance] erro listando campanhas:', error);
    return res.status(500).json({ error: 'Erro ao listar campanhas', details: error.message });
  }
});

export default router;
