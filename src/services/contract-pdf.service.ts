/**
 * Contract PDF Generation Service
 * Uses Puppeteer to generate high-quality PDFs from contract HTML
 */

import puppeteer, { Browser } from 'puppeteer';
import { b2StorageService } from './b2-storage.service';
import * as fs from 'fs';
import * as path from 'path';

// Logo AIC carregado dinamicamente
const getLogoBase64 = (): string => {
  try {
    const logoPath = path.join(__dirname, '../frontend/assets/AIC/Imagens Vetor /LOGO completo sem fundo Icone cheio e nome cheio.png');
    const logoBuffer = fs.readFileSync(logoPath);
    return `data:image/png;base64,${logoBuffer.toString('base64')}`;
  } catch (err) {
    console.error('[ContractPDF] Error loading logo:', err);
    return '';
  }
};

interface ContractData {
  // Contratante
  client_name: string;
  client_document: string; // CPF ou CNPJ
  client_address: string;
  client_representative?: string;

  // Campanha
  campaign_name?: string;
  project_name?: string;
  target_niche?: string;
  service_description?: string;
  target_audience?: string;
  campaign_whatsapp?: string;

  // Contrato
  contract_id: string;
  contract_date: string;
  contract_value: number;
  lead_value: number;

  // Assinatura
  signature_name: string;
  signature_ip: string;
  signature_date: string;
  signature_user_agent: string;
}

interface GeneratedPDF {
  buffer: Buffer;
  filename: string;
  url?: string;
}

class ContractPDFService {
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
   * Generate contract PDF from data
   */
  async generateContractPDF(data: ContractData): Promise<GeneratedPDF> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Generate HTML content
      const html = this.generateContractHTML(data);

      // Set content
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '15mm',
          bottom: '15mm',
          left: '20mm',
          right: '20mm'
        },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="font-size: 9px; color: #999; width: 100%; text-align: center; padding: 5px 20mm;">
            Página <span class="pageNumber"></span> de <span class="totalPages"></span>
          </div>
        `
      });

      const filename = `contrato-aic-${data.contract_id}-${Date.now()}.pdf`;

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
  async generateAndUpload(data: ContractData): Promise<GeneratedPDF> {
    const pdf = await this.generateContractPDF(data);

    try {
      // Upload to Backblaze B2 via N8N workflow
      const uploadResult = await b2StorageService.uploadContract(pdf.buffer, data.contract_id);

      if (uploadResult.success && uploadResult.url) {
        pdf.url = uploadResult.url;
        console.log(`[ContractPDF] PDF uploaded to B2: ${pdf.url}`);
      } else {
        console.error('[ContractPDF] Error uploading to B2:', uploadResult.error);
      }
    } catch (err) {
      console.error('[ContractPDF] B2 Storage error:', err);
    }

    return pdf;
  }

  /**
   * Generate contract HTML with all clauses
   */
  private generateContractHTML(data: ContractData): string {
    const logoBase64 = getLogoBase64();

    const formatCurrency = (value: number) =>
      value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
    };

    // Detectar se é CPF (pessoa física) ou CNPJ (pessoa jurídica)
    const documentDigits = (data.client_document || '').replace(/\D/g, '');
    const isPessoaFisica = documentDigits.length <= 11;
    const tipoContratante = isPessoaFisica
      ? 'pessoa física'
      : 'pessoa jurídica de direito privado';

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
      font-size: 16pt;
      font-weight: 700;
      text-align: center;
      margin: 30px 0 10px;
      color: #0C1B33;
    }

    h2 {
      font-size: 11pt;
      font-weight: 700;
      color: #0C1B33;
      margin: 25px 0 10px;
      text-transform: uppercase;
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
      font-style: italic;
      color: #666;
      margin-bottom: 30px;
    }

    .parties {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }

    .party {
      margin-bottom: 15px;
    }

    .party-label {
      font-weight: 700;
      color: #0ECC97;
      font-size: 10pt;
      margin-bottom: 5px;
    }

    .party-data {
      font-size: 10pt;
      color: #333;
    }

    .clause {
      margin-bottom: 20px;
    }

    .clause-number {
      font-weight: 700;
      color: #0C1B33;
    }

    .highlight {
      background: rgba(14, 204, 151, 0.1);
      border-left: 3px solid #0ECC97;
      padding: 12px 15px;
      margin: 15px 0;
      font-size: 10pt;
    }

    .important {
      background: rgba(239, 68, 68, 0.1);
      border-left: 3px solid #ef4444;
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

    .signature-section {
      margin-top: 50px;
      page-break-inside: avoid;
    }

    .signature-line {
      margin: 40px 0 10px;
      border-top: 1px solid #333;
      width: 300px;
    }

    .signature-name {
      font-weight: 600;
      font-size: 10pt;
    }

    .signature-role {
      font-size: 9pt;
      color: #666;
    }

    .digital-signature {
      background: #f0fdf4;
      border: 1px solid #0ECC97;
      border-radius: 8px;
      padding: 20px;
      margin: 30px 0;
    }

    .digital-signature h3 {
      color: #0ECC97;
      margin-bottom: 15px;
    }

    .sig-data {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      font-size: 9pt;
    }

    .sig-item {
      background: white;
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }

    .sig-label {
      font-weight: 600;
      color: #666;
      font-size: 8pt;
      text-transform: uppercase;
    }

    .sig-value {
      color: #0C1B33;
      margin-top: 2px;
    }

    .witnesses {
      display: flex;
      gap: 50px;
      margin-top: 30px;
    }

    .witness {
      flex: 1;
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
      <img src="${logoBase64}" alt="AIC" style="height: 60px; margin-bottom: 10px;">
    </div>

    <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
    <p class="subtitle">${data.campaign_name || 'Campanha de Prospecção Ativa e Qualificação de Leads'}</p>

    <!-- Preâmbulo -->
    <h2>PREÂMBULO</h2>
    <p>Pelo presente instrumento particular de contrato de prestação de serviços, e na melhor forma de direito, as partes abaixo qualificadas:</p>

    <div class="parties">
      <div class="party">
        <div class="party-label">CONTRATADA:</div>
        <div class="party-data">
          <strong>PEDRO CABRAL FRANCO CONSULTORIA EM TECNOLOGIA DA INFORMACAO LTDA</strong>, inscrita no CNPJ sob nº 44.767.357/0001-75, Inscrição Municipal 7.172.483-4, com sede na R PDE LEBRET 725, APT 5 - JARDIM LEONOR - CEP 05653-160, São Paulo/SP, operando sob a marca "AIC - Applied Intelligence Clustering", doravante denominada simplesmente "CONTRATADA" ou "AIC".
        </div>
      </div>

      <div class="party">
        <div class="party-label">CONTRATANTE:</div>
        <div class="party-data">
          <strong>${data.client_name}</strong>, ${tipoContratante}, inscrit${isPessoaFisica ? 'a' : 'o'} no ${isPessoaFisica ? 'CPF' : 'CNPJ'} sob o nº <strong>${data.client_document}</strong>, ${isPessoaFisica ? 'residente e domiciliada em' : 'com sede em'} <strong>${data.client_address}</strong>${data.client_representative ? `, neste ato representada por <strong>${data.client_representative}</strong>` : ''}, doravante denominad${isPessoaFisica ? 'a' : 'o'} simplesmente "CONTRATANTE".
        </div>
      </div>
    </div>

    <!-- Especificações da Campanha -->
    <h2>ESPECIFICAÇÕES DA CAMPANHA</h2>
    <table>
      <tr>
        <th style="width: 180px;">Campo</th>
        <th>Especificação</th>
      </tr>
      <tr>
        <td><strong>Nome da Campanha</strong></td>
        <td>${data.campaign_name || '-'}</td>
      </tr>
      <tr>
        <td><strong>Nome do Projeto</strong></td>
        <td>${data.project_name || '-'}</td>
      </tr>
      <tr>
        <td><strong>Nicho Alvo</strong></td>
        <td>${data.target_niche || '-'}</td>
      </tr>
      <tr>
        <td><strong>Descrição do Serviço</strong></td>
        <td>${data.service_description || '-'}</td>
      </tr>
      <tr>
        <td><strong>Público Alvo</strong></td>
        <td>${data.target_audience || '-'}</td>
      </tr>
      <tr>
        <td><strong>WhatsApp da Campanha</strong></td>
        <td>${data.campaign_whatsapp || '-'}</td>
      </tr>
    </table>

    <p>As partes acima qualificadas têm entre si justo e contratado o presente Contrato de Prestação de Serviços, que se regerá pelas cláusulas e condições seguintes:</p>

    <!-- Cláusula 1 -->
    <h2>CLÁUSULA PRIMEIRA - DO OBJETO</h2>
    <p><span class="clause-number">1.1.</span> O presente contrato tem por objeto a prestação de serviços de prospecção ativa, segmentação inteligente e qualificação de leads pela CONTRATADA em favor da CONTRATANTE, utilizando a metodologia proprietária AIC (Applied Intelligence Clustering).</p>

    <p><span class="clause-number">1.2.</span> A campanha objeto deste contrato terá como objetivo a prospecção de até 2.000 (dois mil) perfis públicos pertencentes ao mesmo segmento de mercado ("cluster") definido em conjunto pelas partes, ao longo de um período de 30 (trinta) dias corridos.</p>

    <div class="important">
      <strong>IMPORTANTE:</strong> O número de 2.000 perfis constitui o OBJETIVO da campanha, não uma garantia de resultados. Os resultados efetivos dependem de fatores como nicho de mercado, qualidade da oferta, maturidade do público-alvo e condições das plataformas utilizadas.
    </div>

    <p><span class="clause-number">1.3.</span> Os serviços serão prestados exclusivamente através das plataformas Instagram (via Direct Message) e WhatsApp Business, respeitando os limites e políticas de cada plataforma.</p>

    <!-- Cláusula 2 -->
    <h2>CLÁUSULA SEGUNDA - DA METODOLOGIA</h2>
    <p><span class="clause-number">2.1.</span> A CONTRATADA executará os serviços seguindo a metodologia AIC, composta pelas seguintes etapas:</p>

    <ol type="I">
      <li><strong>Diagnóstico Estruturado:</strong> Análise aprofundada do negócio, produto, problema que resolve, dores do cliente ideal, posicionamento, tom de voz e concorrência da CONTRATANTE.</li>
      <li><strong>Seleção e Validação de Perfis (AIC Filtering):</strong> Análise de comportamento de conteúdo, sinais de intenção e perfis ativos, filtrando até 2.000 prospects qualificados do mesmo nicho, utilizando exclusivamente dados públicos.</li>
      <li><strong>Avaliação da Landing Page:</strong> Revisão da página de destino da CONTRATANTE com foco em clareza, narrativa, autoridade, prova social e consistência com a campanha, com sugestões de ajustes quando necessário.</li>
      <li><strong>Coleta de Materiais de Apoio:</strong> Solicitação e organização de fotos, vídeos, depoimentos, logos, referências e apresentações existentes como insumo para a linha editorial.</li>
      <li><strong>Criação da Linha Editorial:</strong> Desenvolvimento de conteúdo estratégico e scripts de abordagem personalizados, adaptados ao cluster identificado.</li>
      <li><strong>Execução da Campanha:</strong> Envio de mensagens personalizadas em ritmo humano e controlado, com monitoramento diário e ajustes de copy/cadência conforme necessário.</li>
      <li><strong>Qualificação e Fechamento:</strong> Triagem de respostas, identificação de interesse genuíno, e para leads com alto interesse, handoff automático para fechamento humano direto no WhatsApp.</li>
    </ol>

    <!-- Cláusula 3 -->
    <h2>CLÁUSULA TERCEIRA - DOS PRAZOS</h2>
    <p><span class="clause-number">3.1.</span> O presente contrato vigorará pelo prazo de 30 (trinta) dias corridos, contados a partir da data de assinatura, podendo ser prorrogado mediante acordo escrito entre as partes.</p>

    <p><span class="clause-number">3.2.</span> As fases da campanha seguirão o seguinte cronograma estimado:</p>

    <table>
      <tr>
        <th>Fase</th>
        <th>Atividades</th>
        <th>Prazo Estimado</th>
      </tr>
      <tr>
        <td>Fase 1</td>
        <td>Diagnóstico, seleção de perfis, linha editorial</td>
        <td>Dias 1-10</td>
      </tr>
      <tr>
        <td>Fase 2</td>
        <td>Execução da campanha e envio de mensagens</td>
        <td>Dias 11-25</td>
      </tr>
      <tr>
        <td>Fase 3</td>
        <td>Qualificação, relatórios e encerramento</td>
        <td>Dias 26-30</td>
      </tr>
    </table>

    <!-- Cláusula 4 -->
    <h2>CLÁUSULA QUARTA - DO INVESTIMENTO</h2>
    <p><span class="clause-number">4.1.</span> Pelos serviços objeto deste contrato, a CONTRATANTE pagará à CONTRATADA os seguintes valores:</p>

    <table>
      <tr>
        <th>Item</th>
        <th>Valor</th>
        <th>Condição</th>
      </tr>
      <tr>
        <td>Valor Base da Campanha</td>
        <td><strong>${formatCurrency(data.contract_value)}</strong></td>
        <td>50% no início + 50% após 15 dias</td>
      </tr>
      <tr>
        <td>Valor por Lead Qualificado</td>
        <td><strong>${formatCurrency(data.lead_value)}</strong> por lead</td>
        <td>Pago ao final, após validação</td>
      </tr>
    </table>

    <div class="highlight">
      <strong>OFERTA DE LANÇAMENTO:</strong> O valor promocional de R$ 10,00 por lead qualificado é válido exclusivamente para a primeira campanha da CONTRATANTE e para contratos firmados até 28 de fevereiro de 2026. Campanhas subsequentes serão precificadas conforme tabela vigente.
    </div>

    <p><span class="clause-number">4.2.</span> Condições de Pagamento:</p>
    <ul>
      <li><strong>1ª Parcela (50%):</strong> ${formatCurrency(data.contract_value / 2)} no ato da assinatura deste contrato;</li>
      <li><strong>2ª Parcela (50%):</strong> ${formatCurrency(data.contract_value / 2)} após 15 (quinze) dias do início da campanha;</li>
      <li><strong>Valor por Lead:</strong> Faturado ao final da campanha, após validação dos leads qualificados.</li>
    </ul>

    <p><span class="clause-number">4.3.</span> Os pagamentos deverão ser realizados via transferência bancária (PIX ou TED) para a conta indicada pela CONTRATADA, ou mediante boleto bancário.</p>

    <!-- Cláusula 5 -->
    <h2>CLÁUSULA QUINTA - DA DEFINIÇÃO DE LEAD QUALIFICADO</h2>
    <p><span class="clause-number">5.1.</span> Para fins deste contrato, considera-se "Lead Qualificado" o prospecto que cumprir TODOS os seguintes requisitos cumulativos:</p>
    <ol type="I">
      <li>Responder às mensagens enviadas demonstrando interesse genuíno e aderente à oferta da CONTRATANTE;</li>
      <li>Fornecer contato válido (e-mail, telefone ou WhatsApp) ou aceitar contato direto;</li>
      <li>Apresentar fit com a oferta, ou seja, pertencer ao público-alvo definido na fase de diagnóstico.</li>
    </ol>

    <p><span class="clause-number">5.2.</span> NÃO serão considerados leads qualificados:</p>
    <ul>
      <li>Respostas identificadas como spam ou mensagens automáticas;</li>
      <li>Concorrentes da CONTRATANTE ou profissionais do mesmo segmento buscando benchmarking;</li>
      <li>Curiosos sem intenção de compra ou contratação;</li>
      <li>Respostas negativas ou solicitações de opt-out;</li>
      <li>Contatos com dados inválidos ou incompletos.</li>
    </ul>

    <p><span class="clause-number">5.3.</span> A CONTRATANTE terá prazo de 5 (cinco) dias úteis após a entrega do relatório final para contestar a qualificação de leads específicos, apresentando justificativa fundamentada. Após este prazo, os leads serão considerados aceitos para fins de faturamento.</p>

    <!-- Cláusula 6 -->
    <h2>CLÁUSULA SEXTA - DAS EXPECTATIVAS DE RESULTADOS</h2>
    <p><span class="clause-number">6.1.</span> Com base em campanhas anteriores similares, a CONTRATADA projeta as seguintes faixas de resultado:</p>

    <table>
      <tr>
        <th>Métrica</th>
        <th>Projeção (variável por nicho)</th>
      </tr>
      <tr>
        <td>Contatos enviados (objetivo)</td>
        <td>Até 2.000</td>
      </tr>
      <tr>
        <td>Taxa de resposta</td>
        <td>10% a 25%</td>
      </tr>
      <tr>
        <td>Respostas iniciais</td>
        <td>200 a 500</td>
      </tr>
      <tr>
        <td>Leads qualificados</td>
        <td>25 a 120</td>
      </tr>
    </table>

    <div class="important">
      <strong>DECLARAÇÃO DE CIÊNCIA:</strong> A CONTRATANTE declara estar ciente de que os números acima são PROJEÇÕES baseadas em histórico, não constituindo promessa ou garantia de resultados. Os resultados efetivos variam significativamente conforme o nicho de mercado, a qualidade da oferta, a maturidade do público-alvo, a landing page e as condições das plataformas utilizadas no período da campanha.
    </div>

    <!-- Cláusula 7 -->
    <h2>CLÁUSULA SÉTIMA - DOS LIMITES OPERACIONAIS</h2>
    <p><span class="clause-number">7.1.</span> Para preservar a integridade das contas utilizadas e garantir comportamento natural nas plataformas, a CONTRATADA observará os seguintes limites operacionais:</p>

    <table>
      <tr>
        <th>Plataforma</th>
        <th>Limite por Hora</th>
        <th>Limite Diário</th>
      </tr>
      <tr>
        <td>Instagram (DM)</td>
        <td>10 mensagens</td>
        <td>80 mensagens</td>
      </tr>
      <tr>
        <td>WhatsApp Business</td>
        <td>15 mensagens</td>
        <td>120 mensagens</td>
      </tr>
    </table>

    <p><span class="clause-number">7.2.</span> Os envios serão realizados exclusivamente em horário comercial (segunda a sexta, das 9h às 18h, horário de Brasília), salvo acordo em contrário.</p>

    <p><span class="clause-number">7.3.</span> Cada prospecto receberá no máximo 2 (dois) follow-ups em caso de não resposta inicial, respeitando intervalo mínimo de 48 horas entre tentativas.</p>

    <p><span class="clause-number">7.4.</span> Solicitações de opt-out serão atendidas imediatamente, e o prospecto não será mais contatado em nenhuma hipótese.</p>

    <!-- Cláusula 8 -->
    <h2>CLÁUSULA OITAVA - DOS RISCOS E MITIGAÇÕES</h2>
    <p><span class="clause-number">8.1.</span> A CONTRATANTE declara estar ciente dos seguintes riscos inerentes à atividade de prospecção ativa em redes sociais:</p>
    <ul>
      <li>Limitação temporária de envio de mensagens pelas plataformas;</li>
      <li>Bloqueio preventivo de contas (temporário ou permanente);</li>
      <li>Necessidade de aquecimento ou reaquecimento de novas contas;</li>
      <li>Instabilidades das plataformas Instagram/Meta e WhatsApp.</li>
    </ul>

    <p><span class="clause-number">8.2.</span> A CONTRATADA adotará as seguintes medidas de mitigação:</p>
    <ul>
      <li>Utilização de contas previamente aquecidas e configuradas;</li>
      <li>Fingerprints e device hygiene para comportamento natural;</li>
      <li>Limites rígidos de envio conforme Cláusula 7.1;</li>
      <li>Sistema de fallback multi-conta;</li>
      <li>Monitoramento contínuo e ajustes em tempo real;</li>
      <li>Em caso de bloqueio superior a 72 horas, ativação de conta reserva ou pausa comunicada à CONTRATANTE.</li>
    </ul>

    <!-- Cláusula 9 -->
    <h2>CLÁUSULA NONA - DAS OBRIGAÇÕES DA CONTRATADA</h2>
    <p><span class="clause-number">9.1.</span> Constituem obrigações da CONTRATADA:</p>
    <ol type="I">
      <li>Executar os serviços com zelo, diligência e boa-fé;</li>
      <li>Manter comunicação transparente sobre o andamento da campanha;</li>
      <li>Fornecer relatórios semanais de performance;</li>
      <li>Responder a solicitações e ajustes em até 24 horas úteis;</li>
      <li>Implementar mudanças de copy/cadência em até 48 horas;</li>
      <li>Respeitar os limites operacionais e políticas das plataformas;</li>
      <li>Garantir opt-out imediato quando solicitado pelos prospectos;</li>
      <li>Entregar lista final de leads qualificados em formato CSV, Sheets ou integração CRM;</li>
      <li>Manter sigilo sobre informações confidenciais da CONTRATANTE.</li>
    </ol>

    <!-- Cláusula 10 -->
    <h2>CLÁUSULA DÉCIMA - DAS OBRIGAÇÕES DA CONTRATANTE</h2>
    <p><span class="clause-number">10.1.</span> Constituem obrigações da CONTRATANTE:</p>
    <ol type="I">
      <li>Fornecer todas as informações necessárias para o diagnóstico e execução da campanha;</li>
      <li>Disponibilizar materiais de apoio (fotos, vídeos, depoimentos, logos) em tempo hábil;</li>
      <li>Manter landing page ativa e funcional durante toda a campanha;</li>
      <li>Efetuar os pagamentos nas datas acordadas;</li>
      <li>Autorizar acesso às plataformas e ferramentas necessárias;</li>
      <li>Responder a solicitações da CONTRATADA em tempo razoável;</li>
      <li>Dar tratamento adequado aos leads entregues, seguindo boas práticas comerciais;</li>
      <li>Contestar leads dentro do prazo estabelecido na Cláusula 5.3.</li>
    </ol>

    <!-- Cláusula 11 -->
    <h2>CLÁUSULA DÉCIMA PRIMEIRA - DO ESCOPO</h2>
    <p><span class="clause-number">11.1.</span> <strong>ESTÁ INCLUÍDO</strong> no escopo dos serviços:</p>
    <ul>
      <li>Coleta e validação de até 2.000 perfis públicos do Instagram;</li>
      <li>Clustering de intenção e segmentação inteligente;</li>
      <li>Criação de linha editorial e scripts de abordagem;</li>
      <li>Configuração e aquecimento de contas de envio;</li>
      <li>Envio controlado de DMs e mensagens WhatsApp;</li>
      <li>Monitoramento diário e ajustes de estratégia;</li>
      <li>Avaliação e sugestões para landing page;</li>
      <li>Qualificação e triagem de respostas;</li>
      <li>Relatórios semanais e relatório final;</li>
      <li>Handoff automático para fechamento humano via WhatsApp;</li>
      <li>Notificação de leads quentes prontos para fechamento.</li>
    </ul>

    <p><span class="clause-number">11.2.</span> <strong>NÃO ESTÁ INCLUÍDO</strong> no escopo dos serviços:</p>
    <ul>
      <li>Gestão de tráfego pago ou anúncios patrocinados;</li>
      <li>Gestão contínua de redes sociais;</li>
      <li>Criação de sites ou landing pages completas (apenas avaliação e sugestões);</li>
      <li>Atendimento contínuo de leads via WhatsApp (apenas triagem inicial);</li>
      <li>Suporte técnico para ferramentas externas;</li>
      <li>Alterações de escopo sem aprovação prévia e ajuste de valores.</li>
    </ul>

    <!-- Cláusula 12 -->
    <h2>CLÁUSULA DÉCIMA SEGUNDA - DA PROTEÇÃO DE DADOS</h2>
    <p><span class="clause-number">12.1.</span> A CONTRATADA utilizará exclusivamente dados públicos disponibilizados pelos próprios usuários em seus perfis de redes sociais.</p>

    <p><span class="clause-number">12.2.</span> A CONTRATADA declara que sua operação está em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018), fundamentando-se na base legal do legítimo interesse para prospecção comercial.</p>

    <p><span class="clause-number">12.3.</span> A CONTRATADA compromete-se a:</p>
    <ul>
      <li>Não coletar nem tratar dados sensíveis;</li>
      <li>Permitir opt-out imediato a qualquer momento;</li>
      <li>Não comercializar dados coletados com terceiros;</li>
      <li>Tratar dados exclusivamente para fins do presente contrato;</li>
      <li>Manter medidas de segurança adequadas para proteção dos dados.</li>
    </ul>

    <!-- Cláusula 13 -->
    <h2>CLÁUSULA DÉCIMA TERCEIRA - DA CONFIDENCIALIDADE</h2>
    <p><span class="clause-number">13.1.</span> As partes comprometem-se a manter em sigilo todas as informações confidenciais a que tiverem acesso em razão deste contrato.</p>

    <p><span class="clause-number">13.2.</span> A obrigação de confidencialidade permanecerá em vigor por 2 (dois) anos após o término deste contrato.</p>

    <!-- Cláusula 14 -->
    <h2>CLÁUSULA DÉCIMA QUARTA - DA RESCISÃO</h2>
    <p><span class="clause-number">14.1.</span> O presente contrato poderá ser rescindido:</p>
    <ol type="I">
      <li>Por mútuo acordo entre as partes, mediante comunicação escrita;</li>
      <li>Por inadimplemento de qualquer das partes, após notificação e prazo de 5 dias para regularização;</li>
      <li>Por caso fortuito ou força maior que impossibilite a continuidade dos serviços.</li>
    </ol>

    <p><span class="clause-number">14.2.</span> Em caso de rescisão antecipada por iniciativa da CONTRATANTE sem justa causa:</p>
    <ul>
      <li>Valores já pagos não serão restituídos;</li>
      <li>Leads qualificados até a data da rescisão serão faturados normalmente;</li>
      <li>Materiais produzidos serão entregues à CONTRATANTE.</li>
    </ul>

    <!-- Cláusula 15 -->
    <h2>CLÁUSULA DÉCIMA QUINTA - DAS DISPOSIÇÕES GERAIS</h2>
    <p><span class="clause-number">15.1.</span> O presente contrato obriga as partes e seus sucessores a qualquer título.</p>

    <p><span class="clause-number">15.2.</span> A tolerância de uma das partes quanto ao descumprimento de qualquer obrigação pela outra não implicará novação ou renúncia de direitos.</p>

    <p><span class="clause-number">15.3.</span> Qualquer alteração deste contrato somente será válida se formalizada por escrito e assinada por ambas as partes.</p>

    <p><span class="clause-number">15.4.</span> As comunicações entre as partes poderão ser realizadas por e-mail, sendo consideradas válidas mediante confirmação de recebimento.</p>

    <!-- Cláusula 16 -->
    <h2>CLÁUSULA DÉCIMA SEXTA - DO FORO</h2>
    <p><span class="clause-number">16.1.</span> As partes elegem o Foro da Comarca de São Paulo/SP para dirimir quaisquer dúvidas ou controvérsias oriundas do presente contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>

    <!-- Assinaturas -->
    <div class="signature-section">
      <p style="text-align: center; margin-bottom: 30px;">E por estarem assim justas e contratadas, as partes assinam o presente instrumento.</p>

      <p style="text-align: center; margin-bottom: 40px;">São Paulo, ${formatDate(data.contract_date)}</p>

      <!-- Assinatura Digital -->
      <div class="digital-signature">
        <h3>✓ ASSINATURA DIGITAL - CONTRATANTE</h3>
        <div class="sig-data">
          <div class="sig-item">
            <div class="sig-label">Assinado por</div>
            <div class="sig-value"><strong>${data.signature_name}</strong></div>
          </div>
          <div class="sig-item">
            <div class="sig-label">Data/Hora</div>
            <div class="sig-value">${new Date(data.signature_date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
          </div>
          <div class="sig-item">
            <div class="sig-label">IP</div>
            <div class="sig-value">${data.signature_ip}</div>
          </div>
          <div class="sig-item">
            <div class="sig-label">ID do Contrato</div>
            <div class="sig-value">${data.contract_id}</div>
          </div>
        </div>
        <p style="margin-top: 15px; font-size: 9pt; color: #666;">
          Este documento foi assinado eletronicamente conforme MP 2.200-2/2001, Art. 10, § 2º.
          A integridade do documento é garantida pelo sistema AIC.
        </p>
      </div>

      <div style="margin-top: 30px;">
        <div class="signature-line"></div>
        <div class="signature-name">AIC - Applied Intelligence Clustering</div>
        <div class="signature-role">CONTRATADA</div>
      </div>
    </div>

    <div class="footer-note">
      <p>Documento confidencial AIC. © 2025 Applied Intelligence Clustering.</p>
      <p>Este contrato foi gerado e assinado eletronicamente através da plataforma AIC.</p>
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

export const contractPDFService = new ContractPDFService();
export default contractPDFService;
