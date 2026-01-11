/**
 * Weekly Invoice Service
 * Gera faturas semanais consolidadas com relatório PDF
 */

import { supabase } from '../config/database';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

interface DeliveryRecord {
  id: string;
  campaign_id: string;
  lead_name: string;
  lead_whatsapp: string;
  lead_email: string;
  lead_instagram: string;
  delivery_value: number;
  meeting_scheduled_at: string;
  created_at: string;
}

interface CampaignInfo {
  id: string;
  campaign_name: string;
  business_name: string;
  client_email: string;
  client_whatsapp_number: string;
}

interface WeeklyInvoice {
  id: string;
  invoice_number: string;
  campaign_id: string;
  campaign_name: string;
  period_start: string;
  period_end: string;
  total_leads: number;
  total_amount: number;
  deliveries: DeliveryRecord[];
  pdf_url?: string;
}

export class WeeklyInvoiceService {

  /**
   * Gera faturas semanais para todas as campanhas com entregas pendentes
   * @param includeAllPending Se true, inclui TODAS as entregas pendentes (ignora filtro de data)
   */
  async generateWeeklyInvoices(includeAllPending: boolean = false): Promise<WeeklyInvoice[]> {
    console.log('[WeeklyInvoice] Iniciando geração de faturas semanais...');
    console.log(`[WeeklyInvoice] Modo: ${includeAllPending ? 'TODAS pendentes' : 'Apenas semana anterior'}`);

    // Calcular período (ontem para trás, ou semana anterior completa)
    const today = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    if (includeAllPending) {
      // Incluir todas as entregas até AGORA (para testes e fatura final)
      periodEnd = new Date(today);
      periodEnd.setHours(23, 59, 59, 999);

      periodStart = new Date('2020-01-01'); // Data bem antiga para pegar tudo
    } else {
      // Semana anterior completa (segunda a domingo)
      const dayOfWeek = today.getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb

      // Calcular último domingo
      const daysToLastSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
      periodEnd = new Date(today);
      periodEnd.setDate(today.getDate() - daysToLastSunday);
      periodEnd.setHours(23, 59, 59, 999);

      // Segunda anterior ao domingo
      periodStart = new Date(periodEnd);
      periodStart.setDate(periodEnd.getDate() - 6);
      periodStart.setHours(0, 0, 0, 0);
    }

    console.log(`[WeeklyInvoice] Período: ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);

    // Buscar entregas não faturadas
    let query = supabase
      .from('aic_lead_deliveries')
      .select(`
        id,
        campaign_id,
        lead_name,
        lead_whatsapp,
        lead_email,
        lead_instagram,
        delivery_value,
        meeting_scheduled_at,
        created_at
      `)
      .is('invoice_id', null)
      .lte('created_at', periodEnd.toISOString())
      .order('campaign_id')
      .order('created_at');

    if (!includeAllPending) {
      query = query.gte('created_at', periodStart.toISOString());
    }

    const { data: deliveries, error } = await query;

    if (error) {
      console.error('[WeeklyInvoice] Erro ao buscar entregas:', error);
      throw error;
    }

    if (!deliveries || deliveries.length === 0) {
      console.log('[WeeklyInvoice] Nenhuma entrega pendente para faturar');
      return [];
    }

    console.log(`[WeeklyInvoice] ${deliveries.length} entregas encontradas`);

    // Agrupar por campanha
    const byCampaign = new Map<string, DeliveryRecord[]>();
    for (const d of deliveries) {
      const list = byCampaign.get(d.campaign_id) || [];
      list.push(d as DeliveryRecord);
      byCampaign.set(d.campaign_id, list);
    }

    const invoices: WeeklyInvoice[] = [];

    // Processar cada campanha
    for (const [campaignId, campaignDeliveries] of byCampaign) {
      const invoice = await this.createInvoiceForCampaign(
        campaignId,
        campaignDeliveries,
        periodStart,
        periodEnd
      );
      if (invoice) {
        invoices.push(invoice);
      }
    }

    console.log(`[WeeklyInvoice] ${invoices.length} faturas geradas`);
    return invoices;
  }

  /**
   * Cria fatura para uma campanha específica
   */
  private async createInvoiceForCampaign(
    campaignId: string,
    deliveries: DeliveryRecord[],
    periodStart: Date,
    periodEnd: Date
  ): Promise<WeeklyInvoice | null> {

    // Buscar info da campanha
    const { data: campaign } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, business_name, client_email, client_whatsapp_number')
      .eq('id', campaignId)
      .single();

    if (!campaign) {
      console.error(`[WeeklyInvoice] Campanha não encontrada: ${campaignId}`);
      return null;
    }

    // Calcular total
    const totalAmount = deliveries.reduce((sum, d) => sum + Number(d.delivery_value || 0), 0);
    const totalLeads = deliveries.length;

    // Gerar número da fatura: LEAD-XXXXXX-WKNN (Week Number)
    const weekNumber = this.getWeekNumber(periodStart);
    const campaignCode = campaignId.substring(0, 6).toUpperCase();

    // Verificar se já existe fatura para esta semana
    const invoiceNumber = `LEAD-${campaignCode}-WK${String(weekNumber).padStart(2, '0')}`;

    const { data: existingInvoice } = await supabase
      .from('aic_campaign_payments')
      .select('id')
      .eq('invoice_number', invoiceNumber)
      .single();

    if (existingInvoice) {
      console.log(`[WeeklyInvoice] Fatura ${invoiceNumber} já existe, pulando...`);
      return null;
    }

    // Criar fatura
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7); // Vence em 7 dias

    const { data: invoice, error: invoiceError } = await supabase
      .from('aic_campaign_payments')
      .insert({
        campaign_id: campaignId,
        type: 'lead_invoice',
        invoice_number: invoiceNumber,
        description: `Fatura Semanal - ${totalLeads} leads (${this.formatDateBR(periodStart)} a ${this.formatDateBR(periodEnd)})`,
        amount: totalAmount,
        status: 'pending',
        due_date: dueDate.toISOString().split('T')[0]
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      console.error(`[WeeklyInvoice] Erro ao criar fatura para ${campaignId}:`, invoiceError);
      return null;
    }

    // Atualizar entregas com o ID da fatura
    const deliveryIds = deliveries.map(d => d.id);
    const { error: updateError } = await supabase
      .from('aic_lead_deliveries')
      .update({ invoice_id: invoice.id })
      .in('id', deliveryIds);

    if (updateError) {
      console.error(`[WeeklyInvoice] Erro ao atualizar entregas:`, updateError);
    }

    // Gerar PDF
    const pdfBuffer = await this.generatePDF({
      invoiceNumber,
      campaign: campaign as CampaignInfo,
      deliveries,
      periodStart,
      periodEnd,
      totalLeads,
      totalAmount,
      dueDate
    });

    // TODO: Upload do PDF para storage (B2/S3)
    // Por enquanto, salvar localmente ou retornar base64

    console.log(`[WeeklyInvoice] Fatura ${invoiceNumber} criada: ${totalLeads} leads, R$${totalAmount.toFixed(2)}`);

    return {
      id: invoice.id,
      invoice_number: invoiceNumber,
      campaign_id: campaignId,
      campaign_name: campaign.campaign_name,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      total_leads: totalLeads,
      total_amount: totalAmount,
      deliveries
    };
  }

  /**
   * Gera fatura final para campanha (leads restantes não faturados)
   */
  async generateFinalInvoice(campaignId: string): Promise<WeeklyInvoice | null> {
    console.log(`[WeeklyInvoice] Gerando fatura final para campanha ${campaignId}...`);

    // Buscar TODAS as entregas não faturadas da campanha
    const { data: deliveries, error } = await supabase
      .from('aic_lead_deliveries')
      .select(`
        id,
        campaign_id,
        lead_name,
        lead_whatsapp,
        lead_email,
        lead_instagram,
        delivery_value,
        meeting_scheduled_at,
        created_at
      `)
      .eq('campaign_id', campaignId)
      .is('invoice_id', null)
      .order('created_at');

    if (error) {
      console.error('[WeeklyInvoice] Erro ao buscar entregas:', error);
      throw error;
    }

    if (!deliveries || deliveries.length === 0) {
      console.log('[WeeklyInvoice] Nenhuma entrega pendente para fatura final');
      return null;
    }

    // Buscar info da campanha
    const { data: campaign } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, business_name, client_email, client_whatsapp_number')
      .eq('id', campaignId)
      .single();

    if (!campaign) {
      console.error(`[WeeklyInvoice] Campanha não encontrada: ${campaignId}`);
      return null;
    }

    // Calcular total
    const totalAmount = deliveries.reduce((sum, d) => sum + Number(d.delivery_value || 0), 0);
    const totalLeads = deliveries.length;

    // Gerar número da fatura final: LEAD-XXXXXX-FINAL
    const campaignCode = campaignId.substring(0, 6).toUpperCase();
    const invoiceNumber = `LEAD-${campaignCode}-FINAL`;

    // Verificar se já existe
    const { data: existingInvoice } = await supabase
      .from('aic_campaign_payments')
      .select('id')
      .eq('invoice_number', invoiceNumber)
      .single();

    if (existingInvoice) {
      console.log(`[WeeklyInvoice] Fatura final ${invoiceNumber} já existe`);
      return null;
    }

    // Encontrar período das entregas
    const dates = deliveries.map(d => new Date(d.created_at));
    const periodStart = new Date(Math.min(...dates.map(d => d.getTime())));
    const periodEnd = new Date(Math.max(...dates.map(d => d.getTime())));

    // Criar fatura
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const { data: invoice, error: invoiceError } = await supabase
      .from('aic_campaign_payments')
      .insert({
        campaign_id: campaignId,
        type: 'lead_invoice',
        invoice_number: invoiceNumber,
        description: `Fatura Final - ${totalLeads} leads (${this.formatDateBR(periodStart)} a ${this.formatDateBR(periodEnd)})`,
        amount: totalAmount,
        status: 'pending',
        due_date: dueDate.toISOString().split('T')[0]
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      console.error(`[WeeklyInvoice] Erro ao criar fatura final:`, invoiceError);
      return null;
    }

    // Atualizar entregas
    const deliveryIds = deliveries.map(d => d.id);
    await supabase
      .from('aic_lead_deliveries')
      .update({ invoice_id: invoice.id })
      .in('id', deliveryIds);

    // Gerar PDF
    await this.generatePDF({
      invoiceNumber,
      campaign: campaign as CampaignInfo,
      deliveries: deliveries as DeliveryRecord[],
      periodStart,
      periodEnd,
      totalLeads,
      totalAmount,
      dueDate
    });

    console.log(`[WeeklyInvoice] Fatura final ${invoiceNumber} criada: ${totalLeads} leads, R$${totalAmount.toFixed(2)}`);

    return {
      id: invoice.id,
      invoice_number: invoiceNumber,
      campaign_id: campaignId,
      campaign_name: campaign.campaign_name,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      total_leads: totalLeads,
      total_amount: totalAmount,
      deliveries: deliveries as DeliveryRecord[]
    };
  }

  /**
   * Gera PDF da fatura com relatório de leads
   */
  private async generatePDF(data: {
    invoiceNumber: string;
    campaign: CampaignInfo;
    deliveries: DeliveryRecord[];
    periodStart: Date;
    periodEnd: Date;
    totalLeads: number;
    totalAmount: number;
    dueDate: Date;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Cabeçalho
      doc.fontSize(20).font('Helvetica-Bold').text('FATURA DE LEADS', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica').text(data.invoiceNumber, { align: 'center' });
      doc.moveDown(1);

      // Info da campanha
      doc.fontSize(12).font('Helvetica-Bold').text('Campanha:');
      doc.font('Helvetica').text(data.campaign.campaign_name || 'N/A');
      if (data.campaign.business_name) {
        doc.text(data.campaign.business_name);
      }
      doc.moveDown(0.5);

      // Período
      doc.font('Helvetica-Bold').text('Período:');
      doc.font('Helvetica').text(`${this.formatDateBR(data.periodStart)} a ${this.formatDateBR(data.periodEnd)}`);
      doc.moveDown(1);

      // Linha separadora
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      // Tabela de leads
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text('LEADS ENTREGUES', { underline: true });
      doc.moveDown(0.5);

      // Cabeçalho da tabela
      const tableTop = doc.y;
      const col1 = 50;  // #
      const col2 = 80;  // Nome
      const col3 = 200; // WhatsApp
      const col4 = 310; // Instagram
      const col5 = 410; // Reunião
      const col6 = 500; // Valor

      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('#', col1, tableTop, { width: 30 });
      doc.text('Lead', col2, tableTop, { width: 120 });
      doc.text('WhatsApp', col3, tableTop, { width: 100 });
      doc.text('Instagram', col4, tableTop, { width: 90 });
      doc.text('Reunião', col5, tableTop, { width: 80 });
      doc.text('Valor', col6, tableTop, { width: 45 });

      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);

      // Linhas da tabela
      doc.font('Helvetica').fontSize(8);
      let y = doc.y;

      data.deliveries.forEach((delivery, index) => {
        // Verificar se precisa de nova página
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        const meetingDate = delivery.meeting_scheduled_at
          ? this.formatDateTimeBR(new Date(delivery.meeting_scheduled_at))
          : '-';

        doc.text(String(index + 1), col1, y, { width: 30 });
        doc.text(delivery.lead_name || '-', col2, y, { width: 120 });
        doc.text(delivery.lead_whatsapp || '-', col3, y, { width: 100 });
        doc.text(delivery.lead_instagram ? `@${delivery.lead_instagram}` : '-', col4, y, { width: 90 });
        doc.text(meetingDate, col5, y, { width: 80 });
        doc.text(`R$${Number(delivery.delivery_value || 0).toFixed(2)}`, col6, y, { width: 45 });

        y += 15;
      });

      doc.y = y + 10;
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      // Resumo
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text(`Total: ${data.totalLeads} leads x R$10,00 = R$${data.totalAmount.toFixed(2)}`, { align: 'right' });
      doc.moveDown(1);

      // Informações de pagamento
      doc.fontSize(10).font('Helvetica-Bold').text('DADOS PARA PAGAMENTO:');
      doc.font('Helvetica');
      doc.text('PIX: financeiro@aic.com.br');
      doc.text(`Vencimento: ${this.formatDateBR(data.dueDate)}`);
      doc.moveDown(1);

      // Rodapé
      doc.fontSize(8).fillColor('gray');
      doc.text('Fatura gerada automaticamente pelo sistema AIC', { align: 'center' });
      doc.text(`Gerado em: ${this.formatDateTimeBR(new Date())}`, { align: 'center' });

      doc.end();
    });
  }

  /**
   * Obtém número da semana do ano
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * Formata data no padrão brasileiro
   */
  private formatDateBR(date: Date): string {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  /**
   * Formata data e hora no padrão brasileiro
   */
  private formatDateTimeBR(date: Date): string {
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

export const weeklyInvoiceService = new WeeklyInvoiceService();
