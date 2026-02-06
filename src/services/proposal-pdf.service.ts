/**
 * Proposal PDF Generation Service
 * Uses Puppeteer to generate high-quality PDFs from proposal HTML
 * Similar to contract-pdf.service.ts but for commercial proposals
 */

import puppeteer, { Browser } from 'puppeteer';
import { b2StorageService } from './b2-storage.service';

interface ProposalData {
  // Cliente
  client_name: string;
  client_email?: string;
  client_company?: string;

  // Proposta
  proposal_id: string;
  contract_value: number;
  lead_value: number;

  // Metadata
  accepted_at: string;
  accepted_ip?: string;
}

interface GeneratedPDF {
  buffer: Buffer;
  filename: string;
  url?: string;
}

class ProposalPDFService {
  private browser: Browser | null = null;

  /**
   * Initialize browser instance (reusable)
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.connected) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Generate proposal PDF from data
   */
  async generateProposalPDF(data: ProposalData): Promise<GeneratedPDF> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Generate HTML content
      const html = this.generateProposalHTML(data);

      // Set content
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '20mm',
          right: '20mm'
        },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="font-size: 10px; color: #666; width: 100%; text-align: center; padding: 10px 20mm;">
            AIC - Applied Intelligence Clustering | Proposta Comercial
          </div>
        `,
        footerTemplate: `
          <div style="font-size: 10px; color: #666; width: 100%; text-align: center; padding: 10px 20mm;">
            Pagina <span class="pageNumber"></span> de <span class="totalPages"></span> | Documento gerado em ${new Date().toLocaleDateString('pt-BR')}
          </div>
        `
      });

      const filename = `proposta-aic-${data.proposal_id}-${Date.now()}.pdf`;

      return {
        buffer: Buffer.from(pdfBuffer),
        filename
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Generate and upload PDF to Backblaze B2 Storage
   */
  async generateAndUpload(data: ProposalData): Promise<GeneratedPDF> {
    const pdf = await this.generateProposalPDF(data);

    try {
      // Upload to Backblaze B2 via N8N workflow
      // Reuse the contract upload workflow but with 'proposals/' prefix
      const uploadResult = await b2StorageService.uploadFile(
        pdf.buffer,
        `proposals/${data.proposal_id}`,
        'application/pdf'
      );

      if (uploadResult.success && uploadResult.url) {
        pdf.url = uploadResult.url;
        console.log(`[ProposalPDF] PDF uploaded to B2: ${pdf.url}`);
      } else {
        console.error('[ProposalPDF] Error uploading to B2:', uploadResult.error);
      }
    } catch (err) {
      console.error('[ProposalPDF] B2 Storage error:', err);
    }

    return pdf;
  }

  /**
   * Generate proposal HTML with all sections
   */
  private generateProposalHTML(data: ProposalData): string {
    const formatCurrency = (value: number) =>
      value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      const months = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
                      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
    };

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      background: white;
    }

    .page {
      padding: 0;
    }

    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #0ECC97;
    }

    .logo {
      font-size: 24pt;
      font-weight: 700;
      color: #0ECC97;
      letter-spacing: 2px;
    }

    .logo-sub {
      font-size: 10pt;
      color: #666;
      margin-top: 5px;
    }

    h1 {
      font-size: 18pt;
      font-weight: 700;
      text-align: center;
      margin: 30px 0 10px;
      color: #0C1B33;
    }

    h2 {
      font-size: 12pt;
      font-weight: 700;
      color: #0ECC97;
      margin: 25px 0 10px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
    }

    h3 {
      font-size: 10pt;
      font-weight: 600;
      color: #333;
      margin: 15px 0 8px;
    }

    p {
      margin-bottom: 12px;
      text-align: justify;
    }

    .subtitle {
      text-align: center;
      font-size: 12pt;
      color: #666;
      margin-bottom: 30px;
    }

    .client-info {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }

    .client-name {
      font-size: 14pt;
      font-weight: 700;
      color: #0C1B33;
      margin-bottom: 5px;
    }

    .client-detail {
      font-size: 10pt;
      color: #666;
    }

    .highlight {
      background: rgba(14, 204, 151, 0.1);
      border-left: 3px solid #0ECC97;
      padding: 12px 15px;
      margin: 15px 0;
      font-size: 10pt;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 10pt;
    }

    th, td {
      border: 1px solid #ddd;
      padding: 10px;
      text-align: left;
    }

    th {
      background: #f1f5f9;
      font-weight: 600;
      color: #0C1B33;
    }

    ul, ol {
      margin: 10px 0 10px 25px;
    }

    li {
      margin-bottom: 8px;
    }

    .stats-grid {
      display: flex;
      justify-content: space-around;
      margin: 20px 0;
      text-align: center;
    }

    .stat-card {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 15px 25px;
      min-width: 120px;
    }

    .stat-number {
      font-size: 22pt;
      font-weight: 700;
      color: #0ECC97;
    }

    .stat-label {
      font-size: 9pt;
      color: #666;
    }

    .pricing-section {
      background: linear-gradient(135deg, #f0fdf4, #f8f9fa);
      border: 2px solid #0ECC97;
      border-radius: 12px;
      padding: 25px;
      margin: 25px 0;
      text-align: center;
    }

    .pricing-value {
      font-size: 28pt;
      font-weight: 700;
      color: #0ECC97;
      margin-bottom: 10px;
    }

    .pricing-per-lead {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin: 15px 0;
    }

    .price-crossed {
      font-size: 12pt;
      color: #999;
      text-decoration: line-through;
    }

    .price-promo {
      font-size: 16pt;
      font-weight: 700;
      color: #0ECC97;
    }

    .promo-tag {
      background: linear-gradient(135deg, #ff6b35, #f7931e);
      color: white;
      font-size: 9pt;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
    }

    .step {
      display: flex;
      align-items: flex-start;
      gap: 15px;
      margin-bottom: 15px;
    }

    .step-number {
      background: linear-gradient(135deg, #0ECC97, #0BA578);
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 12pt;
      flex-shrink: 0;
    }

    .step-content h4 {
      margin: 0 0 5px 0;
      font-size: 11pt;
      color: #0C1B33;
    }

    .step-content p {
      margin: 0;
      font-size: 10pt;
      color: #666;
    }

    .acceptance-section {
      background: #f0fdf4;
      border: 1px solid #0ECC97;
      border-radius: 8px;
      padding: 20px;
      margin: 30px 0;
    }

    .acceptance-section h3 {
      color: #0ECC97;
      margin-bottom: 15px;
    }

    .acceptance-data {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      font-size: 9pt;
    }

    .acceptance-item {
      background: white;
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }

    .acceptance-label {
      font-weight: 600;
      color: #666;
      font-size: 8pt;
      text-transform: uppercase;
    }

    .acceptance-value {
      color: #0C1B33;
      margin-top: 2px;
    }

    .footer-note {
      text-align: center;
      font-size: 9pt;
      color: #666;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }

    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="logo">AIC</div>
      <div class="logo-sub">Applied Intelligence Clustering</div>
    </div>

    <h1>PROPOSTA COMERCIAL</h1>
    <p class="subtitle">Campanha de Prospecao Ativa e Qualificacao de Leads</p>

    <!-- Cliente -->
    <div class="client-info">
      <div class="client-name">${data.client_name}</div>
      ${data.client_company ? `<div class="client-detail">${data.client_company}</div>` : ''}
      ${data.client_email ? `<div class="client-detail">${data.client_email}</div>` : ''}
    </div>

    <!-- O que e AIC -->
    <h2>O que e a AIC?</h2>
    <p>
      A <strong>AIC (Applied Intelligence Clustering)</strong> e uma plataforma inovadora desenvolvida para transformar dados publicos em agrupamentos inteligentes e acionaveis.
    </p>
    <p>
      Utilizando algoritmos avancados de analise de dados e machine learning, a AIC identifica grupos de individuos com comportamentos e caracteristicas semelhantes, permitindo que empresas obtenham insights estrategicos para suas acoes de marketing e negocios.
    </p>
    <div class="highlight">
      <strong>Diferencial:</strong> Enquanto o publico-alvo representa um segmento amplo e a persona detalha um perfil semificcional, o <strong>cluster AIC agrupa individuos reais</strong> que compartilham padroes de comportamento e atributos.
    </div>

    <!-- Beneficios -->
    <h2>Beneficios da AIC</h2>
    <table>
      <tr>
        <td><strong>01 - Personalizacao Eficaz</strong><br><span style="color: #666; font-size: 9pt;">Campanhas e mensagens altamente personalizadas para cada grupo identificado.</span></td>
        <td><strong>02 - Decisao Baseada em Dados</strong><br><span style="color: #666; font-size: 9pt;">Identificacao de padroes e relacoes para tomada de decisao estrategica.</span></td>
      </tr>
      <tr>
        <td><strong>03 - Otimizacao de Recursos</strong><br><span style="color: #666; font-size: 9pt;">Esforcos direcionados para segmentos com maior potencial de conversao.</span></td>
        <td><strong>04 - Escalabilidade Inteligente</strong><br><span style="color: #666; font-size: 9pt;">Validacao de perfis no mercado e expansao eficiente das estrategias.</span></td>
      </tr>
    </table>

    <!-- Objetivo -->
    <h2>Objetivo da Campanha</h2>
    <p>
      Realizar uma campanha estruturada de prospeccao ativa, enviando mensagens personalizadas a ate <strong>2.000 potenciais clientes</strong> pertencentes ao seu segmento, ao longo de 30 dias.
    </p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">2.000</div>
        <div class="stat-label">Contatos qualificados</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">30</div>
        <div class="stat-label">Dias de campanha</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">1 a 5</div>
        <div class="stat-label">Clusters focados</div>
      </div>
    </div>

    <h3>Foco:</h3>
    <ul>
      <li><strong>Gerar conversas reais</strong> - nao apenas numeros</li>
      <li><strong>Identificar interesse genuino</strong> - sinais de intencao</li>
      <li><strong>Transformar conversas em leads qualificados</strong> - prontos para seu funil</li>
    </ul>

    <div class="page-break"></div>

    <!-- Metodologia -->
    <h2>Metodologia AIC</h2>
    <p>Nossa metodologia e estruturada em 6 etapas para garantir resultados consistentes:</p>

    <div class="step">
      <div class="step-number">1</div>
      <div class="step-content">
        <h4>Diagnostico Estruturado</h4>
        <p>Entendemos seu negocio, produto, problema que resolve, dores do cliente ideal e posicionamento.</p>
      </div>
    </div>

    <div class="step">
      <div class="step-number">2</div>
      <div class="step-content">
        <h4>Selecao dos 2.000 Perfis</h4>
        <p>Analisamos comportamento, sinais de intencao e perfis ativos para filtrar prospects qualificados.</p>
      </div>
    </div>

    <div class="step">
      <div class="step-number">3</div>
      <div class="step-content">
        <h4>Avaliacao da Landing Page</h4>
        <p>Revisamos sua landing page com foco em clareza, narrativa e consistencia com a campanha.</p>
      </div>
    </div>

    <div class="step">
      <div class="step-number">4</div>
      <div class="step-content">
        <h4>Coleta de Materiais</h4>
        <p>Solicitamos fotos, videos, depoimentos e referencias como insumo para a linha editorial.</p>
      </div>
    </div>

    <div class="step">
      <div class="step-number">5</div>
      <div class="step-content">
        <h4>Criacao da Linha Editorial</h4>
        <p>Desenvolvemos conteudo estrategico alinhado ao cluster, com DMs personalizados.</p>
      </div>
    </div>

    <div class="step">
      <div class="step-number">6</div>
      <div class="step-content">
        <h4>Acompanhamento Continuo</h4>
        <p>Analise de comportamento, ajustes de estrategia e metricas em tempo real.</p>
      </div>
    </div>

    <!-- Expectativa de Resultados -->
    <h2>Expectativa de Resultados</h2>
    <p>Com base em campanhas semelhantes, projetamos:</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">2.000</div>
        <div class="stat-label">Contatos enviados</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">300-500</div>
        <div class="stat-label">Respostas iniciais</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">120-200</div>
        <div class="stat-label">Leads qualificados</div>
      </div>
    </div>

    <div class="highlight">
      <strong>Importante:</strong> Esses numeros sao projecoes realistas baseadas em historico, nao garantias. Os resultados variam conforme nicho, oferta e maturidade do mercado.
    </div>

    <!-- Investimento -->
    <h2>Investimento</h2>

    <div class="pricing-section">
      <div class="pricing-value">${formatCurrency(data.contract_value)}</div>

      <div class="pricing-per-lead">
        <span style="color: #666;">Valor por lead:</span>
        <span class="price-crossed">R$ 55,00</span>
        <span class="promo-tag">1a CAMPANHA</span>
        <span class="price-promo">${formatCurrency(data.lead_value)}</span>
      </div>

      <p style="font-size: 9pt; color: #666; margin: 10px 0 0 0;">
        * Preco promocional valido apenas para a primeira campanha (ate 28/02/2026)
      </p>

      <p style="margin-top: 15px; font-size: 11pt; color: #0C1B33;">
        <strong>Pagamento: 50% no inicio + 50% apos 15 dias</strong>
      </p>
    </div>

    <h3>O que esta incluso:</h3>
    <ul>
      <li>Diagnostico completo do negocio e cluster</li>
      <li>Selecao e validacao de ate 2.000 perfis</li>
      <li>Avaliacao e sugestoes para landing page</li>
      <li>Criacao de linha editorial completa</li>
      <li>Execucao da campanha por 30 dias</li>
      <li>Acompanhamento e relatorios</li>
      <li>Entrega de leads qualificados</li>
    </ul>

    <h3>Lead qualificado =</h3>
    <p>
      Quem responde com intencao aderente + contato valido (email/telefone/WA) ou agenda conversa.
      Exclui spam, concorrente ou curiosidade sem fit. Contestacao em ate 5 dias.
    </p>

    <!-- Proximos Passos -->
    <h2>Proximos Passos</h2>
    <ol>
      <li>Aceite desta proposta</li>
      <li>Assinatura do contrato</li>
      <li>Pagamento (50%)</li>
      <li>Briefing</li>
      <li>Inicio da campanha</li>
    </ol>

    <!-- Aceite da Proposta -->
    <div class="acceptance-section">
      <h3>PROPOSTA ACEITA</h3>
      <div class="acceptance-data">
        <div class="acceptance-item">
          <div class="acceptance-label">Aceito por</div>
          <div class="acceptance-value"><strong>${data.client_name}</strong></div>
        </div>
        <div class="acceptance-item">
          <div class="acceptance-label">Data/Hora</div>
          <div class="acceptance-value">${new Date(data.accepted_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
        </div>
        ${data.accepted_ip ? `
        <div class="acceptance-item">
          <div class="acceptance-label">IP</div>
          <div class="acceptance-value">${data.accepted_ip}</div>
        </div>
        ` : ''}
        <div class="acceptance-item">
          <div class="acceptance-label">ID da Proposta</div>
          <div class="acceptance-value">${data.proposal_id}</div>
        </div>
      </div>
      <p style="margin-top: 15px; font-size: 9pt; color: #666;">
        Este documento foi aceito eletronicamente atraves da plataforma AIC.
      </p>
    </div>

    <div class="footer-note">
      <p>Documento confidencial AIC. (c) 2025 Applied Intelligence Clustering.</p>
      <p>Faixas de resultado sao tipicas e variam por nicho/copy/maturidade.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Close browser when done
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const proposalPDFService = new ProposalPDFService();
export default proposalPDFService;
