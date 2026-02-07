/**
 * Landing Page Scraper Service
 *
 * Extrai conteudo de landing pages para embedding no RAG
 * - Usa Puppeteer para renderizar JavaScript
 * - Extrai TODO o conteudo visivel (inclusive precos, promoções)
 * - Processa e embeda via CampaignDocumentProcessor
 *
 * IMPORTANTE: A LP é a documentação principal da campanha AIC.
 * Todo conteudo deve ser capturado para o RAG.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import { campaignDocumentProcessor } from './campaign-document-processor.service';
import { createClient } from '@supabase/supabase-js';

// Supabase client para atualizar briefing
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Browser singleton para reutilização
let browserInstance: Browser | null = null;

// =====================================================
// TIPOS
// =====================================================

export interface LandingPageResult {
  success: boolean;
  title?: string;
  description?: string;
  content?: string;
  chunksCreated?: number;
  error?: string;
}

export interface ExtractedContent {
  title: string;
  description: string;
  headings: string[];
  paragraphs: string[];
  lists: string[];
  ctas: string[];
  prices: string[];           // Preços e valores monetários
  promotions: string[];       // Promoções, descontos, ofertas
  testimonials: string[];     // Depoimentos e provas sociais
  headerContent: string[];    // Conteúdo do header (não removido)
  footerContent: string[];    // Conteúdo do footer (não removido)
  fullText: string;
}

// =====================================================
// SERVICO PRINCIPAL
// =====================================================

export class LandingPageScraperService {

  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * Processa landing page: extrai conteudo e embeda
   */
  async processLandingPage(url: string, campaignId: string): Promise<LandingPageResult> {
    try {
      console.log(`[LandingPageScraper] Processando: ${url}`);

      // 1. Validar URL
      if (!this.isValidUrl(url)) {
        return { success: false, error: 'URL invalida' };
      }

      // 2. Fazer fetch da pagina
      const html = await this.fetchPage(url);
      if (!html) {
        return { success: false, error: 'Nao foi possivel acessar a pagina' };
      }

      // 3. Extrair conteudo
      const extracted = this.extractContent(html, url);
      if (!extracted.fullText || extracted.fullText.length < 100) {
        return { success: false, error: 'Conteudo insuficiente extraido da pagina' };
      }

      console.log(`[LandingPageScraper] Conteudo extraido: ${extracted.fullText.length} caracteres`);

      // 4. Processar e embedar
      const result = await campaignDocumentProcessor.processDocument({
        campaignId,
        title: `Landing Page: ${extracted.title || url}`,
        docType: 'knowledge',
        content: this.formatContent(extracted),
        sourceUrl: url,
        metadata: {
          source: 'landing_page',
          original_url: url,
          extracted_at: new Date().toISOString()
        }
      });

      if (!result.success) {
        return { success: false, error: result.error || 'Erro ao processar documento' };
      }

      console.log(`[LandingPageScraper] Landing page embedada: ${result.chunksCreated} chunks`);

      // 5. NOVO: Extrair campos do briefing automaticamente (em background)
      this.autoExtractBriefingFields(campaignId).catch(err => {
        console.error('[LandingPageScraper] Erro ao extrair briefing (background):', err.message);
      });

      return {
        success: true,
        title: extracted.title,
        description: extracted.description,
        content: extracted.fullText.substring(0, 500) + '...',
        chunksCreated: result.chunksCreated
      };

    } catch (error: any) {
      console.error('[LandingPageScraper] Erro:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Apenas extrai conteudo sem embedar (para preview)
   */
  async extractOnly(url: string): Promise<ExtractedContent | null> {
    try {
      if (!this.isValidUrl(url)) return null;

      const html = await this.fetchPage(url);
      if (!html) return null;

      return this.extractContent(html, url);
    } catch (error) {
      console.error('[LandingPageScraper] Erro ao extrair:', error);
      return null;
    }
  }

  // =====================================================
  // METODOS PRIVADOS
  // =====================================================

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Obter ou criar browser Puppeteer
   */
  private async getBrowser(): Promise<Browser> {
    if (!browserInstance || !browserInstance.connected) {
      console.log('[LandingPageScraper] Iniciando browser Puppeteer...');
      browserInstance = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
    }
    return browserInstance;
  }

  /**
   * Fetch página usando Puppeteer para renderizar JavaScript
   */
  private async fetchPage(url: string): Promise<string | null> {
    let page: Page | null = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Configurar user agent e viewport
      await page.setUserAgent(this.userAgent);
      await page.setViewport({ width: 1920, height: 1080 });

      // Configurar headers em português
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      });

      console.log(`[LandingPageScraper] Navegando para: ${url}`);

      // Navegar com timeout generoso para páginas pesadas
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Aguardar conteúdo dinâmico carregar
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Scroll para carregar lazy content
      await this.autoScroll(page);

      // Obter HTML renderizado
      const html = await page.content();

      console.log(`[LandingPageScraper] Página renderizada: ${html.length} caracteres`);

      return html;

    } catch (error: any) {
      console.error('[LandingPageScraper] Erro ao fazer fetch com Puppeteer:', error.message);
      return null;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Auto-scroll para carregar conteúdo lazy-loaded
   */
  private async autoScroll(page: Page): Promise<void> {
    // Usa string de função para evitar erros de TypeScript com DOM APIs
    await page.evaluate(`
      (async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              window.scrollTo(0, 0);
              resolve();
            }
          }, 100);
          setTimeout(() => {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }, 10000);
        });
      })()
    `);
  }

  private extractContent(html: string, url: string): ExtractedContent {
    const $ = cheerio.load(html);

    // =====================================================
    // EXTRAIR CONTEÚDO DO HEADER/FOOTER ANTES DE REMOVER
    // =====================================================
    const headerContent: string[] = [];
    $('header, [role="banner"], nav').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text && text.length > 5 && text.length < 500) {
        headerContent.push(text);
      }
    });

    const footerContent: string[] = [];
    $('footer, [role="contentinfo"]').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text && text.length > 5 && text.length < 1000) {
        footerContent.push(text);
      }
    });

    // =====================================================
    // EXTRAIR PREÇOS E VALORES MONETÁRIOS (CRÍTICO!)
    // =====================================================
    const prices: string[] = [];
    const pricePatterns = [
      /R\$\s*[\d.,]+/gi,                           // R$ 10,00 / R$ 1.000
      /[\d.,]+\s*reais/gi,                         // 10 reais
      /de\s+R\$\s*[\d.,]+\s+por\s+R\$\s*[\d.,]+/gi, // de R$ 55 por R$ 10
      /\d+%\s*(?:OFF|de desconto|desconto)/gi,    // 82% OFF
      /apenas\s+R\$\s*[\d.,]+/gi,                  // apenas R$ 10
      /somente\s+R\$\s*[\d.,]+/gi,                 // somente R$ 10
      /por\s+R\$\s*[\d.,]+/gi,                     // por R$ 10
      /a\s+partir\s+de\s+R\$\s*[\d.,]+/gi,         // a partir de R$ 10
    ];

    // Buscar preços em todo o HTML (texto visível)
    const bodyText = $('body').text();
    for (const pattern of pricePatterns) {
      const matches = bodyText.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const normalized = match.trim();
          if (!prices.includes(normalized)) {
            prices.push(normalized);
          }
        });
      }
    }

    // Buscar em elementos específicos de preço
    const priceSelectors = [
      '[class*="price"]', '[class*="preco"]', '[class*="valor"]',
      '[class*="cost"]', '[class*="custo"]', '[class*="money"]',
      '[class*="amount"]', '[class*="fee"]', '[class*="rate"]',
      '[data-price]', '[data-value]', '[data-amount]',
      '.price', '.preco', '.valor', '.custo',
      '#price', '#preco', '#valor'
    ];
    $(priceSelectors.join(', ')).each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 1 && text.length < 200) {
        const normalized = text.replace(/\s+/g, ' ');
        if (!prices.includes(normalized)) {
          prices.push(normalized);
        }
      }
    });

    // =====================================================
    // EXTRAIR PROMOÇÕES E DESCONTOS
    // =====================================================
    const promotions: string[] = [];
    const promoSelectors = [
      '[class*="promo"]', '[class*="discount"]', '[class*="desconto"]',
      '[class*="offer"]', '[class*="oferta"]', '[class*="sale"]',
      '[class*="special"]', '[class*="lancamento"]', '[class*="launch"]',
      '[class*="badge"]', '[class*="tag"]', '[class*="label"]',
      '.promo', '.promocao', '.desconto', '.oferta',
      '[class*="countdown"]', '[class*="timer"]', '[class*="urgency"]'
    ];
    $(promoSelectors.join(', ')).each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 3 && text.length < 300) {
        const normalized = text.replace(/\s+/g, ' ');
        if (!promotions.includes(normalized)) {
          promotions.push(normalized);
        }
      }
    });

    // Buscar padrões de promoção no texto
    const promoPatterns = [
      /(?:promoção|oferta|desconto|lançamento).*?(?:\.|!|\n|$)/gi,
      /(?:válido|valido)\s+até\s+[\d\/\-]+/gi,
      /(?:só|somente|apenas)\s+(?:hoje|amanhã|esta semana)/gi,
      /(?:últimas|ultimas)\s+(?:vagas|unidades)/gi,
      /\d+%\s*(?:OFF|de desconto|desconto)/gi,
      /economize\s+R\$\s*[\d.,]+/gi,
      /de\s+R\$\s*[\d.,]+\s+por\s+R\$\s*[\d.,]+/gi,
    ];
    for (const pattern of promoPatterns) {
      const matches = bodyText.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const normalized = match.trim();
          if (normalized.length > 5 && !promotions.includes(normalized)) {
            promotions.push(normalized);
          }
        });
      }
    }

    // =====================================================
    // EXTRAIR DEPOIMENTOS E PROVAS SOCIAIS
    // =====================================================
    const testimonials: string[] = [];
    const testimonialSelectors = [
      '[class*="testimonial"]', '[class*="depoimento"]',
      '[class*="review"]', '[class*="avaliacao"]',
      '[class*="quote"]', '[class*="citacao"]',
      '[class*="feedback"]', '[class*="cliente"]',
      'blockquote', '.testimonial', '.depoimento'
    ];
    $(testimonialSelectors.join(', ')).each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 20 && text.length < 1000) {
        const normalized = text.replace(/\s+/g, ' ');
        if (!testimonials.includes(normalized)) {
          testimonials.push(normalized);
        }
      }
    });

    // =====================================================
    // REMOVER APENAS SCRIPTS E STYLES (manter conteúdo visível)
    // =====================================================
    $('script').remove();
    $('style').remove();
    $('noscript').remove();
    $('iframe').remove();
    $('.cookie-banner, .cookie-notice, .gdpr').remove();
    $('#cookie-banner, #cookie-notice').remove();

    // NÃO removemos mais header/footer/nav - apenas cookies

    // =====================================================
    // EXTRAIR TÍTULO E DESCRIÇÃO
    // =====================================================
    const title = $('title').text().trim() ||
                  $('h1').first().text().trim() ||
                  $('meta[property="og:title"]').attr('content') ||
                  '';

    const description = $('meta[name="description"]').attr('content') ||
                        $('meta[property="og:description"]').attr('content') ||
                        '';

    // =====================================================
    // EXTRAIR TODOS OS HEADINGS (h1-h6)
    // =====================================================
    const headings: string[] = [];
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 2 && text.length < 300) {
        const normalized = text.replace(/\s+/g, ' ');
        if (!headings.includes(normalized)) {
          headings.push(normalized);
        }
      }
    });

    // =====================================================
    // EXTRAIR PARÁGRAFOS E TEXTO
    // =====================================================
    const paragraphs: string[] = [];
    $('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 10) {
        const normalized = text.replace(/\s+/g, ' ');
        if (!paragraphs.includes(normalized)) {
          paragraphs.push(normalized);
        }
      }
    });

    // Extrair spans e divs com texto substancial
    $('span, div').each((_, el) => {
      const $el = $(el);
      // Ignorar se tem filhos complexos (evitar duplicação)
      if ($el.children('p, div, span, ul, ol').length > 0) return;

      const text = $el.text().trim();
      if (text && text.length > 30 && text.length < 500) {
        const normalized = text.replace(/\s+/g, ' ');
        if (!paragraphs.includes(normalized)) {
          paragraphs.push(normalized);
        }
      }
    });

    // =====================================================
    // EXTRAIR LISTAS
    // =====================================================
    const lists: string[] = [];
    $('li').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 5 && text.length < 500) {
        const normalized = text.replace(/\s+/g, ' ');
        if (!lists.some(l => l.includes(normalized))) {
          lists.push(`- ${normalized}`);
        }
      }
    });

    // =====================================================
    // EXTRAIR CTAs
    // =====================================================
    const ctas: string[] = [];
    const ctaSelectors = [
      'button',
      'a.btn', 'a.button', 'a.cta',
      '[class*="btn-"]', '[class*="button-"]', '[class*="cta-"]',
      '[role="button"]',
      'a[href*="whatsapp"]', 'a[href*="wa.me"]',
      'a[href*="calendly"]', 'a[href*="agendar"]',
      '.hero a', '.hero button',
      '[class*="primary"]', '[class*="action"]'
    ];
    $(ctaSelectors.join(', ')).each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length >= 3 && text.length < 100) {
        const normalized = text.replace(/\s+/g, ' ');
        if (!ctas.includes(normalized) &&
            !['×', 'X', '✕', 'Menu', 'Toggle', 'Close'].includes(normalized)) {
          ctas.push(normalized);
        }
      }
    });

    // =====================================================
    // MONTAR TEXTO COMPLETO (ESTRUTURADO PARA RAG)
    // =====================================================
    const fullTextParts: string[] = [];

    if (title) fullTextParts.push(`# ${title}`);
    if (description) fullTextParts.push(`\n${description}`);

    // PREÇOS E VALORES (CRÍTICO PARA O AGENTE!)
    if (prices.length > 0) {
      fullTextParts.push('\n\n## PREÇOS E VALORES');
      prices.slice(0, 30).forEach(p => fullTextParts.push(`- ${p}`));
    }

    // PROMOÇÕES E OFERTAS
    if (promotions.length > 0) {
      fullTextParts.push('\n\n## PROMOÇÕES E OFERTAS');
      promotions.slice(0, 20).forEach(p => fullTextParts.push(`- ${p}`));
    }

    // Headings
    if (headings.length > 0) {
      fullTextParts.push('\n\n## PRINCIPAIS TÓPICOS');
      headings.slice(0, 30).forEach(h => fullTextParts.push(`- ${h}`));
    }

    // Conteúdo principal
    if (paragraphs.length > 0) {
      fullTextParts.push('\n\n## CONTEÚDO');
      paragraphs.slice(0, 80).forEach(p => fullTextParts.push(`\n${p}`));
    }

    // Listas
    if (lists.length > 0) {
      fullTextParts.push('\n\n## CARACTERÍSTICAS E BENEFÍCIOS');
      lists.slice(0, 50).forEach(l => fullTextParts.push(l));
    }

    // Depoimentos
    if (testimonials.length > 0) {
      fullTextParts.push('\n\n## DEPOIMENTOS');
      testimonials.slice(0, 10).forEach(t => fullTextParts.push(`"${t}"`));
    }

    // CTAs
    if (ctas.length > 0) {
      fullTextParts.push('\n\n## CTAs (CHAMADAS PARA AÇÃO)');
      ctas.slice(0, 15).forEach(c => fullTextParts.push(`- ${c}`));
    }

    // Header content (pode ter info importante)
    if (headerContent.length > 0) {
      fullTextParts.push('\n\n## HEADER');
      headerContent.slice(0, 5).forEach(h => fullTextParts.push(h));
    }

    // Footer content (pode ter preços, condições)
    if (footerContent.length > 0) {
      fullTextParts.push('\n\n## FOOTER');
      footerContent.slice(0, 5).forEach(f => fullTextParts.push(f));
    }

    const fullText = fullTextParts.join('\n').trim();

    return {
      title,
      description,
      headings: headings.slice(0, 30),
      paragraphs: paragraphs.slice(0, 80),
      lists: lists.slice(0, 50),
      ctas: ctas.slice(0, 15),
      prices: prices.slice(0, 30),
      promotions: promotions.slice(0, 20),
      testimonials: testimonials.slice(0, 10),
      headerContent: headerContent.slice(0, 5),
      footerContent: footerContent.slice(0, 5),
      fullText
    };
  }

  /**
   * Extrai campos do briefing via IA e preenche automaticamente
   * Apenas preenche campos que estão NULL (não sobrescreve dados manuais)
   */
  private async autoExtractBriefingFields(campaignId: string): Promise<void> {
    try {
      console.log(`[LandingPageScraper] Extraindo campos do briefing para campanha: ${campaignId}`);

      // 1. Verificar se briefing existe e quais campos estão vazios
      const { data: existingBriefing, error: fetchError } = await supabase
        .from('campaign_briefing')
        .select('*')
        .eq('campaign_id', campaignId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      // 2. Extrair campos via IA
      const extractResult = await campaignDocumentProcessor.extractBriefingFields(campaignId);

      if (!extractResult.success || !extractResult.fields) {
        console.log(`[LandingPageScraper] Nenhum campo extraido para campanha: ${campaignId}`);
        return;
      }

      const extracted = extractResult.fields;
      console.log(`[LandingPageScraper] Campos extraidos:`, Object.keys(extracted));

      // 3. Mapear campos extraidos para campos do campaign_briefing
      // Apenas campos que estão NULL serão atualizados
      const fieldsToUpdate: Record<string, any> = {};

      // Mapeamento: campo extraído -> campo do briefing
      const fieldMapping: Record<string, string> = {
        'campaign_offer': 'campaign_offer',
        'target_audience': 'icp_description',
        'main_pain': 'icp_main_pain',
        'why_choose_us': 'why_choose_us',
        'call_to_action': 'call_to_action',
        'tone_of_voice': 'tone_of_voice',
        'price_range': 'price_range',
        'product_name': 'product_service_name',
        'product_description': 'product_service_description',
        'main_differentiator': 'main_differentiator',
        'company_name': 'company_name',
      };

      // Para cada campo extraído, verificar se deve atualizar
      for (const [extractedKey, briefingKey] of Object.entries(fieldMapping)) {
        const extractedValue = (extracted as any)[extractedKey];
        const existingValue = existingBriefing?.[briefingKey];

        // Só atualizar se: tem valor extraído E campo está vazio no briefing
        if (extractedValue && (!existingValue || existingValue === '')) {
          fieldsToUpdate[briefingKey] = extractedValue;
        }
      }

      // Campos de array
      if (extracted.objections && extracted.objections.length > 0) {
        const existingObjections = existingBriefing?.icp_objections;
        if (!existingObjections || existingObjections.length === 0) {
          fieldsToUpdate['icp_objections'] = extracted.objections;
        }
      }

      if (extracted.competitors && extracted.competitors.length > 0) {
        const existingCompetitors = existingBriefing?.competitors_names;
        if (!existingCompetitors || existingCompetitors.length === 0) {
          fieldsToUpdate['competitors_names'] = extracted.competitors;
        }
      }

      // 4. Se há campos para atualizar, fazer update
      if (Object.keys(fieldsToUpdate).length === 0) {
        console.log(`[LandingPageScraper] Nenhum campo para atualizar (todos já preenchidos)`);
        return;
      }

      if (existingBriefing) {
        // Update
        const { error: updateError } = await supabase
          .from('campaign_briefing')
          .update({
            ...fieldsToUpdate,
            updated_at: new Date().toISOString()
          })
          .eq('campaign_id', campaignId);

        if (updateError) throw updateError;
      } else {
        // Insert
        const { error: insertError } = await supabase
          .from('campaign_briefing')
          .insert({
            campaign_id: campaignId,
            ...fieldsToUpdate,
            briefing_status: 'draft'
          });

        if (insertError) throw insertError;
      }

      console.log(`[LandingPageScraper] Briefing auto-preenchido com ${Object.keys(fieldsToUpdate).length} campos:`, Object.keys(fieldsToUpdate));

    } catch (error: any) {
      console.error(`[LandingPageScraper] Erro ao auto-preencher briefing:`, error.message);
      // Não propagar erro - é operação em background
    }
  }

  private formatContent(extracted: ExtractedContent): string {
    const parts: string[] = [];

    parts.push(`=== LANDING PAGE ===\n`);

    if (extracted.title) {
      parts.push(`TITULO: ${extracted.title}\n`);
    }

    if (extracted.description) {
      parts.push(`DESCRICAO: ${extracted.description}\n`);
    }

    // PREÇOS (CRÍTICO - colocar no início para o RAG priorizar)
    if (extracted.prices && extracted.prices.length > 0) {
      parts.push(`\n=== PREÇOS E VALORES ===`);
      extracted.prices.forEach(p => parts.push(`- ${p}`));
    }

    // PROMOÇÕES E OFERTAS
    if (extracted.promotions && extracted.promotions.length > 0) {
      parts.push(`\n=== PROMOÇÕES E OFERTAS ===`);
      extracted.promotions.forEach(p => parts.push(`- ${p}`));
    }

    if (extracted.headings.length > 0) {
      parts.push(`\nPRINCIPAIS TOPICOS:`);
      extracted.headings.forEach(h => parts.push(`- ${h}`));
    }

    if (extracted.paragraphs.length > 0) {
      parts.push(`\nCONTEUDO PRINCIPAL:`);
      extracted.paragraphs.forEach(p => parts.push(`\n${p}`));
    }

    if (extracted.lists.length > 0) {
      parts.push(`\nCARACTERISTICAS E BENEFICIOS:`);
      extracted.lists.forEach(l => parts.push(l));
    }

    // DEPOIMENTOS
    if (extracted.testimonials && extracted.testimonials.length > 0) {
      parts.push(`\nDEPOIMENTOS:`);
      extracted.testimonials.forEach(t => parts.push(`"${t}"`));
    }

    if (extracted.ctas && extracted.ctas.length > 0) {
      parts.push(`\nCTAs (BOTOES DE ACAO):`);
      extracted.ctas.forEach(c => parts.push(`- ${c}`));
    }

    // HEADER (pode conter info útil)
    if (extracted.headerContent && extracted.headerContent.length > 0) {
      parts.push(`\nHEADER:`);
      extracted.headerContent.forEach(h => parts.push(h));
    }

    // FOOTER (pode conter condições, preços, info legal)
    if (extracted.footerContent && extracted.footerContent.length > 0) {
      parts.push(`\nFOOTER:`);
      extracted.footerContent.forEach(f => parts.push(f));
    }

    return parts.join('\n');
  }

  /**
   * Fechar browser (cleanup)
   */
  async closeBrowser(): Promise<void> {
    if (browserInstance && browserInstance.connected) {
      console.log('[LandingPageScraper] Fechando browser Puppeteer...');
      await browserInstance.close().catch(() => {});
      browserInstance = null;
    }
  }
}

// =====================================================
// SINGLETON
// =====================================================

let instance: LandingPageScraperService | null = null;

export function getLandingPageScraperService(): LandingPageScraperService {
  if (!instance) {
    instance = new LandingPageScraperService();
  }
  return instance;
}

// Cleanup on process exit
process.on('beforeExit', async () => {
  if (instance) {
    await instance.closeBrowser();
  }
});

export default LandingPageScraperService;
