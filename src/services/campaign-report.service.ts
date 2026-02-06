/**
 * Campaign Report Service
 *
 * Gera relatórios finais de campanha com:
 * - Métricas consolidadas
 * - Gráficos de evolução (followers, conversas, conversões)
 * - PDF para download
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// ============================================================================
// TIPOS
// ============================================================================

export interface CampaignMetrics {
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  campaign_created_at: string;
  campaign_ended_at: string | null;
  campaign_duration_days: number;
  leads: {
    total: number;
    whatsapp: number;
    instagram: number;
    contacted: number;
    replied: number;
    qualified: number;
    failed: number;
  };
  conversations: {
    total: number;
    total_messages: number;
    lead_messages: number;
    ai_messages: number;
    avg_messages_per_conversation: number;
  };
  handoffs: {
    total: number;
    completed: number;
    rate_pct: number;
  };
  conversions: {
    total: number;
    value: number;
    rate_pct: number;
  };
  engagement: {
    response_rate_pct: number;
    avg_interest_score: number;
  };
  instagram: {
    username: string | null;
    baseline_followers: number | null;
    final_followers: number | null;
    followers_delta: number;
    followers_growth_pct: number;
  };
}

export interface DailyMetric {
  metric_date: string;
  contacted: number;
  replied: number;
  qualified: number;
  new_conversations: number;
  messages: number;
  handoffs: number;
  conversions: number;
  followers_count: number | null;
  followers_delta: number | null;
}

export interface CampaignReport {
  metrics: CampaignMetrics;
  dailyMetrics: DailyMetric[];
  generatedAt: string;
}

// ============================================================================
// SERVICE
// ============================================================================

class CampaignReportService {
  /**
   * Obtém métricas consolidadas de uma campanha
   */
  async getCampaignMetrics(campaignId: string): Promise<CampaignMetrics | null> {
    const { data, error } = await supabase
      .from('v_campaign_metrics')
      .select('*')
      .eq('campaign_id', campaignId)
      .single();

    if (error || !data) {
      console.error('[CampaignReport] Erro ao buscar métricas:', error);
      return null;
    }

    // Calcular duração em dias
    const createdAt = new Date(data.campaign_created_at);
    const endedAt = data.campaign_ended_at ? new Date(data.campaign_ended_at) : new Date();
    const durationMs = endedAt.getTime() - createdAt.getTime();
    const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

    return {
      campaign_id: data.campaign_id,
      campaign_name: data.campaign_name,
      campaign_status: data.campaign_status,
      campaign_created_at: data.campaign_created_at,
      campaign_ended_at: data.campaign_ended_at,
      campaign_duration_days: durationDays,
      leads: {
        total: data.total_leads || 0,
        whatsapp: data.leads_whatsapp || 0,
        instagram: data.leads_instagram || 0,
        contacted: data.leads_contacted || 0,
        replied: data.leads_replied || 0,
        qualified: data.leads_qualified || 0,
        failed: data.leads_failed || 0
      },
      conversations: {
        total: data.total_conversations || 0,
        total_messages: data.total_messages || 0,
        lead_messages: data.lead_messages || 0,
        ai_messages: data.ai_messages || 0,
        avg_messages_per_conversation: data.avg_messages_per_conversation || 0
      },
      handoffs: {
        total: data.total_handoffs || 0,
        completed: data.handoffs_completed || 0,
        rate_pct: data.handoff_rate_pct || 0
      },
      conversions: {
        total: data.total_conversions || 0,
        value: data.total_conversion_value || 0,
        rate_pct: data.conversion_rate_pct || 0
      },
      engagement: {
        response_rate_pct: data.response_rate_pct || 0,
        avg_interest_score: data.avg_interest_score || 0
      },
      instagram: {
        username: data.instagram_username,
        baseline_followers: data.baseline_followers,
        final_followers: data.current_followers,
        followers_delta: data.followers_delta || 0,
        followers_growth_pct: data.followers_growth_pct || 0
      }
    };
  }

  /**
   * Obtém métricas diárias para gráficos
   */
  async getDailyMetrics(campaignId: string): Promise<DailyMetric[]> {
    const { data, error } = await supabase
      .from('v_campaign_daily_metrics')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('metric_date', { ascending: true });

    if (error) {
      console.error('[CampaignReport] Erro ao buscar métricas diárias:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Gera relatório completo
   */
  async generateReport(campaignId: string): Promise<CampaignReport | null> {
    const metrics = await this.getCampaignMetrics(campaignId);
    if (!metrics) {
      return null;
    }

    const dailyMetrics = await this.getDailyMetrics(campaignId);

    return {
      metrics,
      dailyMetrics,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Encerra uma campanha e gera snapshot de métricas
   */
  async closeCampaign(campaignId: string, endReason: string = 'completed'): Promise<{
    success: boolean;
    metrics?: CampaignMetrics;
    error?: string;
  }> {
    try {
      // Chamar função SQL de encerramento
      const { data, error } = await supabase.rpc('close_campaign', {
        p_campaign_id: campaignId,
        p_end_reason: endReason
      });

      if (error) {
        throw new Error(error.message);
      }

      // Buscar métricas atualizadas
      const metrics = await this.getCampaignMetrics(campaignId);

      return {
        success: true,
        metrics: metrics || undefined
      };
    } catch (error: any) {
      console.error('[CampaignReport] Erro ao encerrar campanha:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Gera PDF do relatório com gráficos
   */
  async generatePDF(campaignId: string): Promise<{
    success: boolean;
    pdfBuffer?: Buffer;
    error?: string;
  }> {
    try {
      const report = await this.generateReport(campaignId);
      if (!report) {
        return { success: false, error: 'Campanha não encontrada' };
      }

      const html = this.generateReportHTML(report);

      // Usar Puppeteer para gerar PDF
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Aguardar gráficos renderizarem
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.waitForFunction('document.querySelectorAll("canvas").length > 0', { timeout: 10000 }).catch(() => {
        // Se não há gráficos, continua
      });

      // Pequeno delay para garantir renderização completa
      await new Promise(resolve => setTimeout(resolve, 1000));

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      await browser.close();

      return {
        success: true,
        pdfBuffer: Buffer.from(pdfBuffer)
      };
    } catch (error: any) {
      console.error('[CampaignReport] Erro ao gerar PDF:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Gera HTML do relatório com Chart.js
   */
  private generateReportHTML(report: CampaignReport): string {
    const { metrics, dailyMetrics } = report;

    // Preparar dados para gráficos
    const labels = dailyMetrics.map(d => {
      const date = new Date(d.metric_date);
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    });

    const followersData = dailyMetrics.map(d => d.followers_count || null);
    const contactedData = dailyMetrics.map(d => d.contacted);
    const repliedData = dailyMetrics.map(d => d.replied);
    const conversionsData = dailyMetrics.map(d => d.conversions);
    const messagesData = dailyMetrics.map(d => d.messages);

    // Calcular totais acumulados
    let accContacted = 0;
    let accReplied = 0;
    let accConversions = 0;
    const accContactedData = contactedData.map(v => accContacted += v);
    const accRepliedData = repliedData.map(v => accReplied += v);
    const accConversionsData = conversionsData.map(v => accConversions += v);

    const formatDate = (dateStr: string | null) => {
      if (!dateStr) return 'Em andamento';
      return new Date(dateStr).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    };

    const formatCurrency = (value: number) => {
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório Final - ${metrics.campaign_name}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }

    .container {
      max-width: 210mm;
      margin: 0 auto;
      background: white;
      padding: 30px;
    }

    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #6366f1;
    }

    .header h1 {
      font-size: 28px;
      color: #6366f1;
      margin-bottom: 5px;
    }

    .header .subtitle {
      font-size: 14px;
      color: #666;
    }

    .header .campaign-name {
      font-size: 22px;
      color: #333;
      margin-top: 10px;
      font-weight: 600;
    }

    .header .period {
      font-size: 12px;
      color: #888;
      margin-top: 5px;
    }

    .section {
      margin-bottom: 30px;
    }

    .section-title {
      font-size: 16px;
      color: #6366f1;
      margin-bottom: 15px;
      padding-bottom: 5px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
    }

    .metric-card {
      background: linear-gradient(135deg, #f8f9fa 0%, #fff 100%);
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      padding: 15px;
      text-align: center;
    }

    .metric-card.highlight {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      border: none;
    }

    .metric-card.success {
      background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
      color: white;
      border: none;
    }

    .metric-card.warning {
      background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
      color: white;
      border: none;
    }

    .metric-value {
      font-size: 28px;
      font-weight: 700;
      line-height: 1.2;
    }

    .metric-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 5px;
      opacity: 0.8;
    }

    .metric-sublabel {
      font-size: 10px;
      margin-top: 3px;
      opacity: 0.6;
    }

    .chart-container {
      background: #f8f9fa;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .chart-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 15px;
      color: #333;
    }

    .chart-wrapper {
      height: 200px;
      position: relative;
    }

    .two-charts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .funnel {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .funnel-step {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .funnel-bar {
      height: 30px;
      background: linear-gradient(90deg, #6366f1, #8b5cf6);
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 10px;
      color: white;
      font-weight: 600;
      font-size: 12px;
      min-width: 50px;
    }

    .funnel-label {
      font-size: 12px;
      color: #666;
      width: 100px;
    }

    .funnel-pct {
      font-size: 11px;
      color: #888;
      width: 50px;
      text-align: right;
    }

    .instagram-section {
      background: linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%);
      border-radius: 10px;
      padding: 20px;
      color: white;
    }

    .instagram-section .section-title {
      color: white;
      border-bottom-color: rgba(255,255,255,0.3);
    }

    .instagram-metrics {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
    }

    .instagram-metric {
      text-align: center;
    }

    .instagram-metric-value {
      font-size: 24px;
      font-weight: 700;
    }

    .instagram-metric-label {
      font-size: 11px;
      text-transform: uppercase;
      opacity: 0.8;
    }

    .roi-section {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 10px;
      padding: 20px;
      color: white;
    }

    .roi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      text-align: center;
    }

    .roi-value {
      font-size: 32px;
      font-weight: 700;
    }

    .roi-label {
      font-size: 12px;
      text-transform: uppercase;
      opacity: 0.8;
    }

    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      font-size: 10px;
      color: #888;
    }

    .page-break {
      page-break-before: always;
    }

    @media print {
      body {
        background: white;
      }
      .container {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- HEADER -->
    <div class="header">
      <h1>📊 Relatório Final de Campanha</h1>
      <div class="subtitle">Applied Intelligence Clustering</div>
      <div class="campaign-name">${metrics.campaign_name}</div>
      <div class="period">
        ${formatDate(metrics.campaign_created_at)} - ${formatDate(metrics.campaign_ended_at)}
        (${metrics.campaign_duration_days} dias)
      </div>
    </div>

    <!-- MÉTRICAS PRINCIPAIS -->
    <div class="section">
      <div class="section-title">📈 Resumo Executivo</div>
      <div class="metrics-grid">
        <div class="metric-card highlight">
          <div class="metric-value">${metrics.leads.total.toLocaleString()}</div>
          <div class="metric-label">Leads Alocados</div>
          <div class="metric-sublabel">${metrics.leads.whatsapp} WA / ${metrics.leads.instagram} IG</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${metrics.leads.contacted.toLocaleString()}</div>
          <div class="metric-label">Leads Contatados</div>
          <div class="metric-sublabel">${metrics.leads.total > 0 ? Math.round(metrics.leads.contacted / metrics.leads.total * 100) : 0}% do total</div>
        </div>
        <div class="metric-card success">
          <div class="metric-value">${metrics.leads.replied.toLocaleString()}</div>
          <div class="metric-label">Respostas</div>
          <div class="metric-sublabel">${metrics.engagement.response_rate_pct}% taxa</div>
        </div>
        <div class="metric-card warning">
          <div class="metric-value">${metrics.handoffs.total}</div>
          <div class="metric-label">Handoffs</div>
          <div class="metric-sublabel">${metrics.handoffs.rate_pct}% dos contatos</div>
        </div>
      </div>
    </div>

    <!-- FUNIL DE CONVERSÃO -->
    <div class="section">
      <div class="section-title">🎯 Funil de Conversão</div>
      <div class="funnel">
        ${this.generateFunnelStep('Leads Alocados', metrics.leads.total, metrics.leads.total, 100)}
        ${this.generateFunnelStep('Contatados', metrics.leads.contacted, metrics.leads.total, metrics.leads.total > 0 ? (metrics.leads.contacted / metrics.leads.total * 100) : 0)}
        ${this.generateFunnelStep('Responderam', metrics.leads.replied, metrics.leads.total, metrics.leads.total > 0 ? (metrics.leads.replied / metrics.leads.total * 100) : 0)}
        ${this.generateFunnelStep('Qualificados', metrics.leads.qualified, metrics.leads.total, metrics.leads.total > 0 ? (metrics.leads.qualified / metrics.leads.total * 100) : 0)}
        ${this.generateFunnelStep('Handoffs', metrics.handoffs.total, metrics.leads.total, metrics.leads.total > 0 ? (metrics.handoffs.total / metrics.leads.total * 100) : 0)}
        ${this.generateFunnelStep('Convertidos', metrics.conversions.total, metrics.leads.total, metrics.leads.total > 0 ? (metrics.conversions.total / metrics.leads.total * 100) : 0)}
      </div>
    </div>

    <!-- CONVERSAS -->
    <div class="section">
      <div class="section-title">💬 Métricas de Conversação</div>
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">${metrics.conversations.total}</div>
          <div class="metric-label">Conversas</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${metrics.conversations.total_messages.toLocaleString()}</div>
          <div class="metric-label">Mensagens Totais</div>
          <div class="metric-sublabel">${metrics.conversations.lead_messages} lead / ${metrics.conversations.ai_messages} AI</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${metrics.conversations.avg_messages_per_conversation.toFixed(1)}</div>
          <div class="metric-label">Média/Conversa</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${metrics.engagement.avg_interest_score.toFixed(1)}</div>
          <div class="metric-label">Score Médio</div>
          <div class="metric-sublabel">Interesse (0-10)</div>
        </div>
      </div>
    </div>

    <!-- GRÁFICO DE EVOLUÇÃO -->
    ${dailyMetrics.length > 0 ? `
    <div class="section">
      <div class="section-title">📊 Evolução da Campanha</div>
      <div class="chart-container">
        <div class="chart-title">Leads Contatados vs Respostas (Acumulado)</div>
        <div class="chart-wrapper">
          <canvas id="evolutionChart"></canvas>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- INSTAGRAM METRICS -->
    ${metrics.instagram.username ? `
    <div class="section instagram-section">
      <div class="section-title">📸 Métricas Instagram @${metrics.instagram.username}</div>
      <div class="instagram-metrics">
        <div class="instagram-metric">
          <div class="instagram-metric-value">${(metrics.instagram.baseline_followers || 0).toLocaleString()}</div>
          <div class="instagram-metric-label">Seguidores Início</div>
        </div>
        <div class="instagram-metric">
          <div class="instagram-metric-value">${(metrics.instagram.final_followers || 0).toLocaleString()}</div>
          <div class="instagram-metric-label">Seguidores Final</div>
        </div>
        <div class="instagram-metric">
          <div class="instagram-metric-value">${metrics.instagram.followers_delta >= 0 ? '+' : ''}${metrics.instagram.followers_delta.toLocaleString()}</div>
          <div class="instagram-metric-label">Variação</div>
        </div>
        <div class="instagram-metric">
          <div class="instagram-metric-value">${metrics.instagram.followers_growth_pct >= 0 ? '+' : ''}${metrics.instagram.followers_growth_pct}%</div>
          <div class="instagram-metric-label">Crescimento</div>
        </div>
      </div>
    </div>

    ${followersData.some(d => d !== null) ? `
    <div class="section">
      <div class="chart-container">
        <div class="chart-title">Evolução de Seguidores ao Longo da Campanha</div>
        <div class="chart-wrapper">
          <canvas id="followersChart"></canvas>
        </div>
      </div>
    </div>
    ` : ''}
    ` : ''}

    <!-- ROI -->
    <div class="section roi-section">
      <div class="section-title" style="color: white; border-bottom-color: rgba(255,255,255,0.3);">💰 ROI da Campanha</div>
      <div class="roi-grid">
        <div>
          <div class="roi-value">${metrics.conversions.total}</div>
          <div class="roi-label">Reuniões Agendadas</div>
        </div>
        <div>
          <div class="roi-value">${formatCurrency(metrics.conversions.value)}</div>
          <div class="roi-label">Valor em Negociação</div>
        </div>
        <div>
          <div class="roi-value">${metrics.conversions.rate_pct}%</div>
          <div class="roi-label">Taxa de Conversão</div>
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <p>Relatório gerado em ${new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}</p>
      <p>AIC - Applied Intelligence Clustering | aic.ubs.app.br</p>
    </div>
  </div>

  <script>
    // Configuração global do Chart.js
    Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    Chart.defaults.font.size = 11;

    ${dailyMetrics.length > 0 ? `
    // Gráfico de Evolução
    const evolutionCtx = document.getElementById('evolutionChart').getContext('2d');
    new Chart(evolutionCtx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [
          {
            label: 'Contatados (Acum.)',
            data: ${JSON.stringify(accContactedData)},
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Respostas (Acum.)',
            data: ${JSON.stringify(accRepliedData)},
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Conversões (Acum.)',
            data: ${JSON.stringify(accConversionsData)},
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
    ` : ''}

    ${followersData.some(d => d !== null) ? `
    // Gráfico de Seguidores
    const followersCtx = document.getElementById('followersChart').getContext('2d');
    new Chart(followersCtx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [{
          label: 'Seguidores',
          data: ${JSON.stringify(followersData)},
          borderColor: '#833ab4',
          backgroundColor: 'rgba(131, 58, 180, 0.1)',
          fill: true,
          tension: 0.4,
          spanGaps: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: false
          }
        }
      }
    });
    ` : ''}
  </script>
</body>
</html>
`;
  }

  /**
   * Gera um passo do funil
   */
  private generateFunnelStep(label: string, value: number, total: number, pct: number): string {
    const width = Math.max(10, pct);
    return `
      <div class="funnel-step">
        <div class="funnel-label">${label}</div>
        <div class="funnel-bar" style="width: ${width}%">${value.toLocaleString()}</div>
        <div class="funnel-pct">${pct.toFixed(1)}%</div>
      </div>
    `;
  }

  /**
   * Salva PDF no Supabase Storage e retorna URL
   */
  async savePDFToStorage(campaignId: string, pdfBuffer: Buffer): Promise<string | null> {
    const fileName = `campaign-reports/${campaignId}/final-report-${Date.now()}.pdf`;

    const { error } = await supabase.storage
      .from('documents')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error) {
      console.error('[CampaignReport] Erro ao salvar PDF:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  }

  /**
   * Gera e salva relatório final completo
   */
  async generateAndSaveFinalReport(campaignId: string): Promise<{
    success: boolean;
    pdfUrl?: string;
    metrics?: CampaignMetrics;
    error?: string;
  }> {
    try {
      // 1. Gerar PDF
      const pdfResult = await this.generatePDF(campaignId);
      if (!pdfResult.success || !pdfResult.pdfBuffer) {
        return { success: false, error: pdfResult.error || 'Erro ao gerar PDF' };
      }

      // 2. Salvar no Storage
      const pdfUrl = await this.savePDFToStorage(campaignId, pdfResult.pdfBuffer);

      // 3. Atualizar campanha com URL do relatório
      if (pdfUrl) {
        await supabase
          .from('cluster_campaigns')
          .update({
            final_report_pdf_url: pdfUrl,
            final_report_generated_at: new Date().toISOString()
          })
          .eq('id', campaignId);
      }

      // 4. Buscar métricas
      const metrics = await this.getCampaignMetrics(campaignId);

      return {
        success: true,
        pdfUrl: pdfUrl || undefined,
        metrics: metrics || undefined
      };
    } catch (error: any) {
      console.error('[CampaignReport] Erro ao gerar relatório final:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export const campaignReportService = new CampaignReportService();
