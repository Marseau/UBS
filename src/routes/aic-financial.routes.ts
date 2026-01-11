/**
 * AIC FINANCIAL ROUTES
 *
 * Rotas para gerenciar pagamentos, entregas e faturas.
 *
 * Endpoints:
 * - /api/aic/payments - Pagamentos do contrato
 * - /api/aic/deliveries - Entregas de leads quentes
 * - /api/aic/invoices - Faturas
 * - /api/aic/financial/dashboard - Dashboard financeiro
 */

import { Router, Request, Response } from 'express';
import { aicFinancialService } from '../services/aic-financial.service';
import { optionalAuthAIC, AuthenticatedRequest } from '../middleware/aic-auth.middleware';

const router = Router();

// ============================================================================
// CONTRACT PAYMENTS
// ============================================================================

/**
 * GET /api/aic/payments/contract/:contractId
 * Buscar pagamentos de um contrato
 */
router.get('/payments/contract/:contractId', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const contractId = req.params.contractId;
    if (!contractId) {
      res.status(400).json({ error: 'contractId is required' });
      return;
    }
    const payments = await aicFinancialService.getContractPayments(contractId);
    res.json(payments);
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error getting contract payments:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/aic/payments/journey/:journeyId
 * Buscar pagamentos de uma jornada
 */
router.get('/payments/journey/:journeyId', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const journeyId = req.params.journeyId;
    if (!journeyId) {
      res.status(400).json({ error: 'journeyId is required' });
      return;
    }
    const payments = await aicFinancialService.getJourneyPayments(journeyId);
    res.json(payments);
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error getting journey payments:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/aic/payments/:paymentId/pay
 * Marcar pagamento como pago
 */
router.post('/payments/:paymentId/pay', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const paymentId = req.params.paymentId;
    if (!paymentId) {
      res.status(400).json({ error: 'paymentId is required' });
      return;
    }
    const { payment_method, payment_reference } = req.body;

    if (!payment_method) {
      res.status(400).json({ error: 'payment_method is required' });
      return;
    }

    const payment = await aicFinancialService.markPaymentAsPaid(paymentId, payment_method, payment_reference);
    res.json({ success: true, payment });
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error marking payment as paid:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/aic/payments/:paymentId/reminder
 * Registrar envio de lembrete de pagamento
 */
router.post('/payments/:paymentId/reminder', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const paymentId = req.params.paymentId;
    if (!paymentId) {
      res.status(400).json({ error: 'paymentId is required' });
      return;
    }
    const payment = await aicFinancialService.recordPaymentReminder(paymentId);
    res.json({ success: true, payment });
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error recording payment reminder:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/aic/payments/overdue
 * Buscar pagamentos vencidos
 */
router.get('/payments/overdue', optionalAuthAIC, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const overduePayments = await aicFinancialService.checkOverduePayments();
    res.json(overduePayments);
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error checking overdue payments:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// HOT LEAD DELIVERIES
// ============================================================================

/**
 * POST /api/aic/deliveries
 * Registrar entrega de lead quente
 * Cria fatura automaticamente (auto_invoice: true por padrao)
 */
router.post('/deliveries', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      campaign_id,
      journey_id,
      lead_id,
      conversation_id,
      delivery_type,
      lead_name,
      lead_phone,
      lead_instagram,
      lead_email,
      lead_company,
      meeting_scheduled_at,
      meeting_link,
      qualification_score,
      qualification_notes,
      conversation_summary,
      billable,
      unit_value,
      auto_invoice = true  // Criar fatura automaticamente (padrao: true)
    } = req.body;

    if (!campaign_id || !delivery_type || !lead_name) {
      res.status(400).json({ error: 'campaign_id, delivery_type and lead_name are required' });
      return;
    }

    const result = await aicFinancialService.createDelivery({
      campaign_id,
      journey_id,
      lead_id,
      conversation_id,
      delivery_type,
      lead_name,
      lead_phone,
      lead_instagram,
      lead_email,
      lead_company,
      meeting_scheduled_at,
      meeting_link,
      qualification_score,
      qualification_notes,
      conversation_summary,
      billable,
      unit_value,
      auto_invoice
    });

    // Separar delivery e invoice do resultado
    const { invoice, ...delivery } = result as any;

    res.json({
      success: true,
      delivery,
      invoice: invoice || null,
      message: invoice ? 'Lead entregue e fatura criada' : 'Lead entregue registrado'
    });
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error creating delivery:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/aic/deliveries/campaign/:campaignId
 * Buscar entregas de uma campanha
 */
router.get('/deliveries/campaign/:campaignId', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }
    const {
      billable_only,
      invoiced_only,
      not_invoiced,
      delivery_type,
      start_date,
      end_date
    } = req.query;

    const deliveries = await aicFinancialService.getCampaignDeliveries(campaignId, {
      billableOnly: billable_only === 'true',
      invoicedOnly: invoiced_only === 'true',
      notInvoiced: not_invoiced === 'true',
      deliveryType: delivery_type ? String(delivery_type) as any : undefined,
      startDate: start_date ? String(start_date) : undefined,
      endDate: end_date ? String(end_date) : undefined
    });

    res.json(deliveries);
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error getting campaign deliveries:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/aic/deliveries/:deliveryId/meeting-status
 * Atualizar status de reuniao
 */
router.patch('/deliveries/:deliveryId/meeting-status', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const deliveryId = req.params.deliveryId;
    if (!deliveryId) {
      res.status(400).json({ error: 'deliveryId is required' });
      return;
    }
    const { status } = req.body;

    if (!status || !['scheduled', 'completed', 'no_show', 'cancelled'].includes(status)) {
      res.status(400).json({ error: 'Valid status is required (scheduled, completed, no_show, cancelled)' });
      return;
    }

    const delivery = await aicFinancialService.updateMeetingStatus(deliveryId, status);
    res.json({ success: true, delivery });
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error updating meeting status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/aic/deliveries/:deliveryId/not-billable
 * Marcar entrega como nao cobravel
 */
router.patch('/deliveries/:deliveryId/not-billable', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const deliveryId = req.params.deliveryId;
    if (!deliveryId) {
      res.status(400).json({ error: 'deliveryId is required' });
      return;
    }
    const { reason } = req.body;

    const delivery = await aicFinancialService.markAsNotBillable(deliveryId, reason);
    res.json({ success: true, delivery });
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error marking as not billable:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DELIVERY INVOICES
// ============================================================================

/**
 * POST /api/aic/invoices
 * Criar fatura de entregas
 */
router.post('/invoices', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { campaign_id, period_start, period_end, unit_price, due_days } = req.body;

    if (!campaign_id || !period_start || !period_end) {
      res.status(400).json({ error: 'campaign_id, period_start and period_end are required' });
      return;
    }

    const invoice = await aicFinancialService.createInvoice(
      campaign_id,
      period_start,
      period_end,
      unit_price || 150,
      due_days || 5
    );

    res.json({ success: true, invoice });
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error creating invoice:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/aic/invoices/:invoiceId
 * Buscar fatura por ID
 */
router.get('/invoices/:invoiceId', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const invoiceId = req.params.invoiceId;
    if (!invoiceId) {
      res.status(400).json({ error: 'invoiceId is required' });
      return;
    }
    const invoice = await aicFinancialService.getInvoice(invoiceId);

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    res.json(invoice);
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error getting invoice:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/aic/invoices/number/:invoiceNumber
 * Buscar fatura por numero
 */
router.get('/invoices/number/:invoiceNumber', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const invoiceNumber = req.params.invoiceNumber;
    if (!invoiceNumber) {
      res.status(400).json({ error: 'invoiceNumber is required' });
      return;
    }
    const invoice = await aicFinancialService.getInvoiceByNumber(invoiceNumber);

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    res.json(invoice);
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error getting invoice by number:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/aic/invoices/campaign/:campaignId
 * Buscar faturas de uma campanha
 */
router.get('/invoices/campaign/:campaignId', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }
    const invoices = await aicFinancialService.getCampaignInvoices(campaignId);
    res.json(invoices);
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error getting campaign invoices:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/aic/invoices/:invoiceId/send
 * Marcar fatura como enviada
 */
router.post('/invoices/:invoiceId/send', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const invoiceId = req.params.invoiceId;
    if (!invoiceId) {
      res.status(400).json({ error: 'invoiceId is required' });
      return;
    }
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    const invoice = await aicFinancialService.markInvoiceAsSent(invoiceId, email);
    res.json({ success: true, invoice });
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error marking invoice as sent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/aic/invoices/:invoiceId/pay
 * Marcar fatura como paga
 */
router.post('/invoices/:invoiceId/pay', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const invoiceId = req.params.invoiceId;
    if (!invoiceId) {
      res.status(400).json({ error: 'invoiceId is required' });
      return;
    }
    const { payment_method, payment_reference } = req.body;

    if (!payment_method) {
      res.status(400).json({ error: 'payment_method is required' });
      return;
    }

    const invoice = await aicFinancialService.markInvoiceAsPaid(invoiceId, payment_method, payment_reference);
    res.json({ success: true, invoice });
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error marking invoice as paid:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/aic/invoices/:invoiceId/discount
 * Aplicar desconto na fatura
 */
router.post('/invoices/:invoiceId/discount', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const invoiceId = req.params.invoiceId;
    if (!invoiceId) {
      res.status(400).json({ error: 'invoiceId is required' });
      return;
    }
    const { amount, reason } = req.body;

    if (!amount || !reason) {
      res.status(400).json({ error: 'amount and reason are required' });
      return;
    }

    const invoice = await aicFinancialService.applyDiscount(invoiceId, amount, reason);
    res.json({ success: true, invoice });
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error applying discount:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// AUDIT REPORT
// ============================================================================

/**
 * GET /api/aic/invoices/:invoiceId/audit
 * Buscar relatorio de auditoria de uma fatura
 */
router.get('/invoices/:invoiceId/audit', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const invoiceId = req.params.invoiceId;
    if (!invoiceId) {
      res.status(400).json({ error: 'invoiceId is required' });
      return;
    }
    const report = await aicFinancialService.getAuditReport(invoiceId);
    res.json(report);
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error getting audit report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/aic/audit/campaign/:campaignId
 * Buscar relatorio de auditoria de uma campanha
 */
router.get('/audit/campaign/:campaignId', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }
    const { start_date, end_date } = req.query;

    const report = await aicFinancialService.getCampaignAuditReport(
      campaignId,
      start_date ? String(start_date) : undefined,
      end_date ? String(end_date) : undefined
    );

    res.json(report);
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error getting campaign audit report:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * GET /api/aic/financial/dashboard
 * Dashboard financeiro geral
 */
router.get('/financial/dashboard', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { campaign_id } = req.query;
    const dashboard = await aicFinancialService.getFinancialDashboard(campaign_id ? String(campaign_id) : undefined);
    res.json(dashboard);
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error getting financial dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/aic/financial/campaign/:campaignId/summary
 * Resumo financeiro de uma campanha
 */
router.get('/financial/campaign/:campaignId/summary', optionalAuthAIC, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId is required' });
      return;
    }
    const summary = await aicFinancialService.getCampaignFinancialSummary(campaignId);
    res.json(summary);
  } catch (error: any) {
    console.error('[AIC Financial Routes] Error getting campaign financial summary:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
