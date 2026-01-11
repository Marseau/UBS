/**
 * AIC FINANCIAL SERVICE
 *
 * Gerencia pagamentos do contrato, entregas de leads quentes e faturas.
 *
 * Tabelas:
 * - aic_contract_payments: Pagamentos do contrato (50% entrada + 50% final)
 * - aic_hot_lead_deliveries: Entregas de leads quentes
 * - aic_delivery_invoices: Faturas das entregas
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// TYPES
// ============================================================================

export type PaymentType = 'entrada' | 'final' | 'adicional';
export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';
export type DeliveryType = 'reuniao_marcada' | 'whatsapp_capturado' | 'interesse_confirmado' | 'proposta_enviada' | 'negociacao';
export type MeetingStatus = 'scheduled' | 'completed' | 'no_show' | 'cancelled';
export type InvoiceStatus = 'draft' | 'pending' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'disputed';
export type InvoiceType = 'leads_quentes' | 'reunioes' | 'mensal' | 'avulsa';

export interface ContractPayment {
  id: string;
  contract_id: string;
  journey_id?: string;
  payment_type: PaymentType;
  installment_number: number;
  amount: number;
  due_date: string;
  status: PaymentStatus;
  paid_at?: string;
  payment_method?: string;
  payment_reference?: string;
  reminder_sent_at?: string;
  reminder_count: number;
  created_at: string;
  updated_at: string;
}

export interface HotLeadDelivery {
  id: string;
  campaign_id: string;
  journey_id?: string;
  lead_id?: string;
  conversation_id?: string;
  delivery_type: DeliveryType;
  lead_name: string;
  lead_phone?: string;
  lead_instagram?: string;
  lead_email?: string;
  lead_company?: string;
  meeting_scheduled_at?: string;
  meeting_link?: string;
  meeting_status?: MeetingStatus;
  qualification_score?: number;
  qualification_notes?: string;
  conversation_summary?: string;
  billable: boolean;
  unit_value?: number;
  invoice_id?: string;
  delivered_at: string;
  delivered_by?: string;
  created_at: string;
  updated_at: string;
}

export interface DeliveryInvoice {
  id: string;
  contract_id?: string;
  campaign_id?: string;
  journey_id?: string;
  invoice_number: string;
  invoice_type: InvoiceType;
  period_start?: string;
  period_end?: string;
  hot_leads_count: number;
  meetings_count: number;
  whatsapp_captured_count: number;
  unit_price?: number;
  subtotal: number;
  discount: number;
  discount_reason?: string;
  total: number;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  sent_at?: string;
  sent_to_email?: string;
  paid_at?: string;
  payment_method?: string;
  payment_reference?: string;
  pix_code?: string;
  boleto_url?: string;
  boleto_barcode?: string;
  audit_report_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDeliveryInput {
  campaign_id: string;
  journey_id?: string;
  lead_id?: string;
  conversation_id?: string;
  delivery_type: DeliveryType;
  lead_name: string;
  lead_phone?: string;
  lead_instagram?: string;
  lead_email?: string;
  lead_company?: string;
  meeting_scheduled_at?: string;
  meeting_link?: string;
  qualification_score?: number;
  qualification_notes?: string;
  conversation_summary?: string;
  billable?: boolean;
  unit_value?: number;
}

export interface FinancialDashboard {
  pagamentos_pendentes: { value: number; count: number };
  pagamentos_recebidos: { value: number; count: number };
  leads_quentes_entregues: { value: number; count: number };
  faturas_pendentes: { value: number; count: number };
  faturas_pagas: { value: number; count: number };
}

// ============================================================================
// CONTRACT PAYMENTS
// ============================================================================

class AICFinancialService {

  /**
   * Criar pagamentos do contrato automaticamente (50% entrada + 50% final)
   */
  async createContractPayments(
    contractId: string,
    journeyId: string,
    totalValue: number,
    signedAt?: Date
  ): Promise<ContractPayment[]> {
    const { data, error } = await supabase.rpc('create_contract_payments', {
      p_contract_id: contractId,
      p_journey_id: journeyId,
      p_total_value: totalValue,
      p_signed_at: signedAt?.toISOString() || new Date().toISOString()
    });

    if (error) {
      console.error('[AIC Financial] Error creating contract payments:', error);
      throw error;
    }

    // Buscar os pagamentos criados
    const { data: payments, error: fetchError } = await supabase
      .from('aic_contract_payments')
      .select('*')
      .eq('contract_id', contractId)
      .order('installment_number');

    if (fetchError) throw fetchError;
    return payments || [];
  }

  /**
   * Buscar pagamentos de um contrato
   */
  async getContractPayments(contractId: string): Promise<ContractPayment[]> {
    const { data, error } = await supabase
      .from('aic_contract_payments')
      .select('*')
      .eq('contract_id', contractId)
      .order('installment_number');

    if (error) throw error;
    return data || [];
  }

  /**
   * Buscar pagamentos de uma jornada
   */
  async getJourneyPayments(journeyId: string): Promise<ContractPayment[]> {
    const { data, error } = await supabase
      .from('aic_contract_payments')
      .select('*')
      .eq('journey_id', journeyId)
      .order('installment_number');

    if (error) throw error;
    return data || [];
  }

  /**
   * Marcar pagamento como pago
   */
  async markPaymentAsPaid(
    paymentId: string,
    paymentMethod: string,
    paymentReference?: string
  ): Promise<ContractPayment> {
    const { data, error } = await supabase
      .from('aic_contract_payments')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: paymentMethod,
        payment_reference: paymentReference
      })
      .eq('id', paymentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Verificar pagamentos vencidos
   */
  async checkOverduePayments(): Promise<any[]> {
    const { data, error } = await supabase.rpc('check_overdue_payments');
    if (error) throw error;
    return data || [];
  }

  /**
   * Registrar envio de lembrete
   */
  async recordPaymentReminder(paymentId: string): Promise<ContractPayment> {
    const { data, error } = await supabase
      .from('aic_contract_payments')
      .update({
        reminder_sent_at: new Date().toISOString(),
        reminder_count: supabase.rpc('increment_reminder_count', { row_id: paymentId })
      })
      .eq('id', paymentId)
      .select()
      .single();

    if (error) {
      // Fallback se a função RPC não existir
      const { data: current } = await supabase
        .from('aic_contract_payments')
        .select('reminder_count')
        .eq('id', paymentId)
        .single();

      const { data: updated, error: updateError } = await supabase
        .from('aic_contract_payments')
        .update({
          reminder_sent_at: new Date().toISOString(),
          reminder_count: (current?.reminder_count || 0) + 1
        })
        .eq('id', paymentId)
        .select()
        .single();

      if (updateError) throw updateError;
      return updated;
    }

    return data;
  }

  // ============================================================================
  // HOT LEAD DELIVERIES
  // ============================================================================

  /**
   * Registrar entrega de lead quente
   * Cria fatura automaticamente na tabela aic_campaign_payments
   */
  async createDelivery(input: CreateDeliveryInput & { auto_invoice?: boolean }): Promise<HotLeadDelivery & { invoice?: any }> {
    const deliveredAt = new Date().toISOString();

    const { data, error } = await supabase
      .from('aic_hot_lead_deliveries')
      .insert({
        campaign_id: input.campaign_id,
        journey_id: input.journey_id,
        lead_id: input.lead_id,
        conversation_id: input.conversation_id,
        delivery_type: input.delivery_type,
        lead_name: input.lead_name,
        lead_phone: input.lead_phone,
        lead_instagram: input.lead_instagram,
        lead_email: input.lead_email,
        lead_company: input.lead_company,
        meeting_scheduled_at: input.meeting_scheduled_at,
        meeting_link: input.meeting_link,
        meeting_status: input.meeting_scheduled_at ? 'scheduled' : null,
        qualification_score: input.qualification_score,
        qualification_notes: input.qualification_notes,
        conversation_summary: input.conversation_summary,
        billable: input.billable ?? true,
        unit_value: input.unit_value,
        delivered_at: deliveredAt
      })
      .select()
      .single();

    if (error) throw error;
    console.log(`[AIC Financial] Delivery created: ${data.id} - ${input.lead_name} (${input.delivery_type})`);

    // Criar fatura automaticamente (padrao: true)
    const autoInvoice = input.auto_invoice !== false;
    const unitValue = input.unit_value || 0;

    if (autoInvoice && unitValue > 0 && input.billable !== false) {
      try {
        // Gerar numero da fatura sequencial
        const { count } = await supabase
          .from('aic_campaign_payments')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', input.campaign_id)
          .eq('type', 'lead_invoice');

        const sequenceNum = (count || 0) + 1;
        const invoiceNumber = `LEAD-${input.campaign_id.slice(0, 6).toUpperCase()}-${String(sequenceNum).padStart(4, '0')}`;

        // Vencimento em 5 dias
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 5);

        // Descricao baseada no tipo
        const typeLabels: Record<string, string> = {
          'reuniao_marcada': 'Reuniao Marcada',
          'proposta_enviada': 'Proposta Enviada',
          'interesse_confirmado': 'Interesse Confirmado',
          'whatsapp_capturado': 'WhatsApp Capturado',
          'negociacao': 'Em Negociacao'
        };
        const typeLabel = typeLabels[input.delivery_type] || input.delivery_type;

        const { data: invoice, error: invoiceError } = await supabase
          .from('aic_campaign_payments')
          .insert({
            campaign_id: input.campaign_id,
            journey_id: input.journey_id,
            delivery_id: data.id,
            type: 'lead_invoice',
            invoice_number: invoiceNumber,
            description: `Lead Quente: ${input.lead_name} (${typeLabel})`,
            amount: unitValue,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'pending'
          })
          .select()
          .single();

        if (invoiceError) {
          console.error('[AIC Financial] Erro ao criar fatura automatica:', invoiceError);
        } else {
          console.log(`[AIC Financial] Fatura criada: ${invoiceNumber} - R$ ${unitValue}`);
          return { ...data, invoice };
        }
      } catch (invoiceErr) {
        console.error('[AIC Financial] Erro ao criar fatura:', invoiceErr);
      }
    }

    return data;
  }

  /**
   * Buscar entregas de uma campanha
   */
  async getCampaignDeliveries(
    campaignId: string,
    options?: {
      billableOnly?: boolean;
      invoicedOnly?: boolean;
      notInvoiced?: boolean;
      deliveryType?: DeliveryType;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<HotLeadDelivery[]> {
    let query = supabase
      .from('aic_hot_lead_deliveries')
      .select('*')
      .eq('campaign_id', campaignId);

    if (options?.billableOnly) {
      query = query.eq('billable', true);
    }

    if (options?.invoicedOnly) {
      query = query.not('invoice_id', 'is', null);
    }

    if (options?.notInvoiced) {
      query = query.is('invoice_id', null);
    }

    if (options?.deliveryType) {
      query = query.eq('delivery_type', options.deliveryType);
    }

    if (options?.startDate) {
      query = query.gte('delivered_at', options.startDate);
    }

    if (options?.endDate) {
      query = query.lte('delivered_at', options.endDate);
    }

    const { data, error } = await query.order('delivered_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Atualizar status de reunião
   */
  async updateMeetingStatus(
    deliveryId: string,
    status: MeetingStatus
  ): Promise<HotLeadDelivery> {
    const { data, error } = await supabase
      .from('aic_hot_lead_deliveries')
      .update({ meeting_status: status })
      .eq('id', deliveryId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Marcar entrega como não cobrável
   */
  async markAsNotBillable(deliveryId: string, reason?: string): Promise<HotLeadDelivery> {
    const { data, error } = await supabase
      .from('aic_hot_lead_deliveries')
      .update({
        billable: false,
        qualification_notes: reason
      })
      .eq('id', deliveryId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // DELIVERY INVOICES
  // ============================================================================

  /**
   * Criar fatura de entregas
   */
  async createInvoice(
    campaignId: string,
    periodStart: string,
    periodEnd: string,
    unitPrice: number = 150,
    dueDays: number = 5
  ): Promise<DeliveryInvoice> {
    const { data, error } = await supabase.rpc('create_delivery_invoice', {
      p_campaign_id: campaignId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_unit_price: unitPrice,
      p_due_days: dueDays
    });

    if (error) throw error;

    // Buscar a fatura criada
    const { data: invoice, error: fetchError } = await supabase
      .from('aic_delivery_invoices')
      .select('*')
      .eq('id', data)
      .single();

    if (fetchError) throw fetchError;

    console.log(`[AIC Financial] Invoice created: ${invoice.invoice_number} - ${invoice.hot_leads_count} leads - R$ ${invoice.total}`);
    return invoice;
  }

  /**
   * Buscar fatura por ID
   */
  async getInvoice(invoiceId: string): Promise<DeliveryInvoice | null> {
    const { data, error } = await supabase
      .from('aic_delivery_invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Buscar fatura por número
   */
  async getInvoiceByNumber(invoiceNumber: string): Promise<DeliveryInvoice | null> {
    const { data, error } = await supabase
      .from('aic_delivery_invoices')
      .select('*')
      .eq('invoice_number', invoiceNumber)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Buscar faturas de uma campanha
   */
  async getCampaignInvoices(campaignId: string): Promise<DeliveryInvoice[]> {
    const { data, error } = await supabase
      .from('aic_delivery_invoices')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('issue_date', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Atualizar status da fatura
   */
  async updateInvoiceStatus(
    invoiceId: string,
    status: InvoiceStatus,
    additionalData?: Partial<DeliveryInvoice>
  ): Promise<DeliveryInvoice> {
    const updateData: any = { status, ...additionalData };

    if (status === 'sent') {
      updateData.sent_at = new Date().toISOString();
    } else if (status === 'paid') {
      updateData.paid_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('aic_delivery_invoices')
      .update(updateData)
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Marcar fatura como enviada
   */
  async markInvoiceAsSent(invoiceId: string, sentToEmail: string): Promise<DeliveryInvoice> {
    return this.updateInvoiceStatus(invoiceId, 'sent', { sent_to_email: sentToEmail });
  }

  /**
   * Marcar fatura como paga
   */
  async markInvoiceAsPaid(
    invoiceId: string,
    paymentMethod: string,
    paymentReference?: string
  ): Promise<DeliveryInvoice> {
    return this.updateInvoiceStatus(invoiceId, 'paid', {
      payment_method: paymentMethod,
      payment_reference: paymentReference
    });
  }

  /**
   * Aplicar desconto na fatura
   */
  async applyDiscount(
    invoiceId: string,
    discountAmount: number,
    reason: string
  ): Promise<DeliveryInvoice> {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    const newTotal = invoice.subtotal - discountAmount;

    const { data, error } = await supabase
      .from('aic_delivery_invoices')
      .update({
        discount: discountAmount,
        discount_reason: reason,
        total: newTotal
      })
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // AUDIT REPORT
  // ============================================================================

  /**
   * Buscar relatório de auditoria de uma fatura
   */
  async getAuditReport(invoiceId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('aic_delivery_audit_report')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('delivered_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Buscar relatório de auditoria de uma campanha (todas as entregas)
   */
  async getCampaignAuditReport(
    campaignId: string,
    startDate?: string,
    endDate?: string
  ): Promise<any[]> {
    let query = supabase
      .from('aic_delivery_audit_report')
      .select('*')
      .eq('campaign_id', campaignId);

    if (startDate) {
      query = query.gte('delivered_at', startDate);
    }

    if (endDate) {
      query = query.lte('delivered_at', endDate);
    }

    const { data, error } = await query.order('delivered_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  // ============================================================================
  // DASHBOARD
  // ============================================================================

  /**
   * Obter métricas do dashboard financeiro
   */
  async getFinancialDashboard(campaignId?: string): Promise<FinancialDashboard> {
    const { data, error } = await supabase.rpc('get_financial_dashboard', {
      p_campaign_id: campaignId || null
    });

    if (error) throw error;

    const dashboard: FinancialDashboard = {
      pagamentos_pendentes: { value: 0, count: 0 },
      pagamentos_recebidos: { value: 0, count: 0 },
      leads_quentes_entregues: { value: 0, count: 0 },
      faturas_pendentes: { value: 0, count: 0 },
      faturas_pagas: { value: 0, count: 0 }
    };

    for (const row of data || []) {
      const key = row.metric as keyof FinancialDashboard;
      if (dashboard[key]) {
        dashboard[key] = {
          value: parseFloat(row.value) || 0,
          count: row.count || 0
        };
      }
    }

    return dashboard;
  }

  /**
   * Resumo financeiro de uma campanha específica
   */
  async getCampaignFinancialSummary(campaignId: string): Promise<{
    payments: ContractPayment[];
    deliveries: HotLeadDelivery[];
    invoices: DeliveryInvoice[];
    dashboard: FinancialDashboard;
  }> {
    const [payments, deliveries, invoices, dashboard] = await Promise.all([
      this.getJourneyPayments(campaignId).catch(() => []),
      this.getCampaignDeliveries(campaignId),
      this.getCampaignInvoices(campaignId),
      this.getFinancialDashboard(campaignId)
    ]);

    return { payments, deliveries, invoices, dashboard };
  }
}

export const aicFinancialService = new AICFinancialService();
