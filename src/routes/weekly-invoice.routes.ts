/**
 * Weekly Invoice Routes
 * Endpoints para geração de faturas semanais (chamado por N8N)
 */

import { Router, Request, Response } from 'express';
import { weeklyInvoiceService } from '../services/weekly-invoice.service';

const router = Router();

/**
 * POST /api/aic/invoices/weekly
 * Gera faturas semanais para todas as campanhas
 * Deve ser chamado toda segunda-feira pelo N8N
 *
 * Body: { include_all?: boolean } - Se true, inclui TODAS as entregas pendentes
 */
router.post('/weekly', async (req: Request, res: Response) => {
  try {
    const { include_all = false } = req.body;
    console.log(`[WeeklyInvoice] Requisição recebida - include_all: ${include_all}`);

    const invoices = await weeklyInvoiceService.generateWeeklyInvoices(include_all);

    if (invoices.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhuma entrega pendente para faturar nesta semana',
        invoices: []
      });
    }

    // Resumo para o log
    const summary = invoices.map(inv => ({
      invoice_number: inv.invoice_number,
      campaign: inv.campaign_name,
      leads: inv.total_leads,
      amount: inv.total_amount
    }));

    return res.json({
      success: true,
      message: `${invoices.length} fatura(s) gerada(s) com sucesso`,
      total_invoices: invoices.length,
      total_leads: invoices.reduce((sum, inv) => sum + inv.total_leads, 0),
      total_amount: invoices.reduce((sum, inv) => sum + inv.total_amount, 0),
      invoices: summary
    });

  } catch (error: any) {
    console.error('[WeeklyInvoice] Erro ao gerar faturas semanais:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao gerar faturas semanais',
      error: error.message
    });
  }
});

/**
 * POST /api/aic/invoices/final/:campaignId
 * Gera fatura final para uma campanha específica
 * Chamado quando a campanha é encerrada
 */
router.post('/final/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id é obrigatório'
      });
    }

    console.log(`[WeeklyInvoice] Gerando fatura final para campanha ${campaignId}`);

    const invoice = await weeklyInvoiceService.generateFinalInvoice(campaignId);

    if (!invoice) {
      return res.json({
        success: true,
        message: 'Nenhuma entrega pendente para fatura final ou fatura já existe',
        invoice: null
      });
    }

    return res.json({
      success: true,
      message: 'Fatura final gerada com sucesso',
      invoice: {
        invoice_number: invoice.invoice_number,
        campaign: invoice.campaign_name,
        leads: invoice.total_leads,
        amount: invoice.total_amount,
        period: `${invoice.period_start} - ${invoice.period_end}`
      }
    });

  } catch (error: any) {
    console.error('[WeeklyInvoice] Erro ao gerar fatura final:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao gerar fatura final',
      error: error.message
    });
  }
});

/**
 * GET /api/aic/invoices/pending
 * Lista entregas pendentes de faturamento por campanha
 */
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const { supabase } = await import('../config/database');

    const { data: deliveries, error } = await supabase
      .from('aic_lead_deliveries')
      .select(`
        campaign_id,
        delivery_value
      `)
      .is('invoice_id', null);

    if (error) throw error;

    // Agrupar por campanha
    const byCampaign = new Map<string, { count: number; total: number }>();
    for (const d of deliveries || []) {
      const current = byCampaign.get(d.campaign_id) || { count: 0, total: 0 };
      current.count++;
      current.total += Number(d.delivery_value || 0);
      byCampaign.set(d.campaign_id, current);
    }

    // Buscar nomes das campanhas
    const campaignIds = Array.from(byCampaign.keys());
    const { data: campaigns } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name')
      .in('id', campaignIds);

    const result = campaignIds.map(id => {
      const campaign = campaigns?.find(c => c.id === id);
      const stats = byCampaign.get(id)!;
      return {
        campaign_id: id,
        campaign_name: campaign?.campaign_name || 'Desconhecida',
        pending_leads: stats.count,
        pending_amount: stats.total
      };
    });

    return res.json({
      success: true,
      total_campaigns: result.length,
      total_pending_leads: result.reduce((sum, r) => sum + r.pending_leads, 0),
      total_pending_amount: result.reduce((sum, r) => sum + r.pending_amount, 0),
      campaigns: result
    });

  } catch (error: any) {
    console.error('[WeeklyInvoice] Erro ao listar pendências:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar entregas pendentes',
      error: error.message
    });
  }
});

/**
 * GET /api/aic/invoices/:invoiceId/pdf
 * Retorna o PDF de uma fatura específica
 */
router.get('/:invoiceId/pdf', async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;

    // TODO: Implementar busca do PDF do storage
    // Por enquanto, retornar erro de não implementado

    return res.status(501).json({
      success: false,
      message: 'Download de PDF ainda não implementado. PDF será enviado por email.'
    });

  } catch (error: any) {
    console.error('[WeeklyInvoice] Erro ao buscar PDF:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar PDF da fatura',
      error: error.message
    });
  }
});

export default router;
