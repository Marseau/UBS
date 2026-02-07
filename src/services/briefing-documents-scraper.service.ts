/**
 * Briefing Documents Scraper Service
 *
 * Processa TODOS os documentos do briefing de uma campanha:
 * - URLs (LP, website, portfólio, etc.)
 * - PDFs (media kit, catálogos)
 * - Redes sociais (Instagram, LinkedIn, YouTube)
 *
 * Usa Puppeteer para renderizar JavaScript e capturar conteúdo completo.
 * Embeda tudo no RAG via CampaignDocumentProcessor.
 *
 * IMPORTANTE: Este serviço é crítico para o funcionamento dos AI Agents.
 * Todo conteúdo do briefing deve ser acessível via RAG.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { campaignDocumentProcessor } from './campaign-document-processor.service';
import { createClient } from '@supabase/supabase-js';

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Browser singleton
let browserInstance: Browser | null = null;

// =====================================================
// TIPOS
// =====================================================

export interface BriefingScrapingResult {
  success: boolean;
  documentsProcessed: number;
  totalChunks: number;
  errors: string[];
  details: DocumentResult[];
}

export interface DocumentResult {
  source: string;
  url: string;
  success: boolean;
  chunksCreated: number;
  error?: string;
}

interface ExtractedContent {
  title: string;
  description: string;
  fullText: string;
  prices: string[];
  promotions: string[];
  metadata: Record<string, any>;
}

// =====================================================
// SERVIÇO PRINCIPAL
// =====================================================

export class BriefingDocumentsScraperService {
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * Processa TODOS os documentos do briefing de uma campanha
   */
  async processAllBriefingDocuments(campaignId: string): Promise<BriefingScrapingResult> {
    const result: BriefingScrapingResult = {
      success: false,
      documentsProcessed: 0,
      totalChunks: 0,
      errors: [],
      details: []
    };

    try {
      console.log(`[BriefingScraper] Iniciando processamento completo para campanha: ${campaignId}`);

      // 1. Buscar briefing da campanha
      const { data: briefing, error: briefingError } = await supabase
        .from('campaign_briefing')
        .select('*')
        .eq('campaign_id', campaignId)
        .single();

      if (briefingError && briefingError.code !== 'PGRST116') {
        throw new Error(`Erro ao buscar briefing: ${briefingError.message}`);
      }

      if (!briefing) {
        console.log(`[BriefingScraper] Briefing não encontrado, buscando URLs da campanha...`);
      }

      // 2. Coletar todas as URLs para processar
      const urlsToProcess: { source: string; url: string; docType: string }[] = [];

      // URLs do briefing
      if (briefing) {
        if (briefing.landing_page_url) {
          urlsToProcess.push({ source: 'Landing Page', url: briefing.landing_page_url, docType: 'landing_page' });
        }
        if (briefing.website_url) {
          urlsToProcess.push({ source: 'Website', url: briefing.website_url, docType: 'knowledge' });
        }
        if (briefing.portfolio_url) {
          urlsToProcess.push({ source: 'Portfólio', url: briefing.portfolio_url, docType: 'knowledge' });
        }
        if (briefing.media_kit_url) {
          urlsToProcess.push({ source: 'Media Kit', url: briefing.media_kit_url, docType: 'knowledge' });
        }
        if (briefing.instagram_url) {
          urlsToProcess.push({ source: 'Instagram', url: briefing.instagram_url, docType: 'knowledge' });
        }
        if (briefing.linkedin_url) {
          urlsToProcess.push({ source: 'LinkedIn', url: briefing.linkedin_url, docType: 'knowledge' });
        }
        if (briefing.youtube_url) {
          urlsToProcess.push({ source: 'YouTube', url: briefing.youtube_url, docType: 'knowledge' });
        }
      }

      // Também buscar da tabela cluster_campaigns (pode ter URL configurada lá)
      const { data: campaign } = await supabase
        .from('cluster_campaigns')
        .select('landing_page_url, website_url')
        .eq('id', campaignId)
        .single();

      if (campaign) {
        if (campaign.landing_page_url && !urlsToProcess.some(u => u.url === campaign.landing_page_url)) {
          urlsToProcess.push({ source: 'Landing Page (Campanha)', url: campaign.landing_page_url, docType: 'landing_page' });
        }
        if (campaign.website_url && !urlsToProcess.some(u => u.url === campaign.website_url)) {
          urlsToProcess.push({ source: 'Website (Campanha)', url: campaign.website_url, docType: 'knowledge' });
        }
      }

      if (urlsToProcess.length === 0) {
        result.errors.push('Nenhuma URL encontrada no briefing para processar');
        return result;
      }

      console.log(`[BriefingScraper] ${urlsToProcess.length} URLs para processar`);

      // 3. Processar cada URL
      for (const item of urlsToProcess) {
        try {
          console.log(`[BriefingScraper] Processando: ${item.source} - ${item.url}`);

          const docResult = await this.processUrl(campaignId, item.url, item.source, item.docType);
          result.details.push(docResult);

          if (docResult.success) {
            result.documentsProcessed++;
            result.totalChunks += docResult.chunksCreated;
          } else {
            result.errors.push(`${item.source}: ${docResult.error}`);
          }
        } catch (error: any) {
          const errorMsg = `${item.source}: ${error.message}`;
          result.errors.push(errorMsg);
          result.details.push({
            source: item.source,
            url: item.url,
            success: false,
            chunksCreated: 0,
            error: error.message
          });
        }
      }

      result.success = result.documentsProcessed > 0;
      console.log(`[BriefingScraper] Processamento completo: ${result.documentsProcessed}/${urlsToProcess.length} documentos, ${result.totalChunks} chunks`);

      return result;

    } catch (error: any) {
      console.error('[BriefingScraper] Erro:', error.message);
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * Processa uma URL específica
   */
  async processUrl(campaignId: string, url: string, source: string, docType: string): Promise<DocumentResult> {
    try {
      // Validar URL
      if (!this.isValidUrl(url)) {
        return { source, url, success: false, chunksCreated: 0, error: 'URL inválida' };
      }

      // Determinar tipo de conteúdo
      const isPdf = url.toLowerCase().endsWith('.pdf') || url.includes('/pdf/');
      const isInstagram = url.includes('instagram.com');
      const isLinkedIn = url.includes('linkedin.com');
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

      let extracted: ExtractedContent;

      if (isPdf) {
        extracted = await this.extractFromPdf(url);
      } else if (isInstagram) {
        extracted = await this.extractFromInstagram(url);
      } else if (isLinkedIn) {
        extracted = await this.extractFromLinkedIn(url);
      } else if (isYouTube) {
        extracted = await this.extractFromYouTube(url);
      } else {
        // Página web genérica (LP, website, portfólio)
        extracted = await this.extractFromWebPage(url);
      }

      if (!extracted.fullText || extracted.fullText.length < 50) {
        return { source, url, success: false, chunksCreated: 0, error: 'Conteúdo insuficiente extraído' };
      }

      console.log(`[BriefingScraper] ${source}: ${extracted.fullText.length} caracteres extraídos`);

      // Embedar via CampaignDocumentProcessor
      const processResult = await campaignDocumentProcessor.processDocument({
        campaignId,
        title: `${source}: ${extracted.title || url}`,
        docType: docType as any,
        content: this.formatContent(extracted, source),
        sourceUrl: url,
        metadata: {
          source_type: source.toLowerCase().replace(/\s+/g, '_'),
          original_url: url,
          extracted_at: new Date().toISOString(),
          ...extracted.metadata
        }
      });

      return {
        source,
        url,
        success: processResult.success,
        chunksCreated: processResult.chunksCreated,
        error: processResult.error
      };

    } catch (error: any) {
      console.error(`[BriefingScraper] Erro ao processar ${source}:`, error.message);
      return { source, url, success: false, chunksCreated: 0, error: error.message };
    }
  }

  // =====================================================
  // EXTRAÇÃO POR TIPO DE FONTE
  // =====================================================

  /**
   * Extrai conteúdo de página web usando Puppeteer
   */
  private async extractFromWebPage(url: string): Promise<ExtractedContent> {
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      await page.setUserAgent(this.userAgent);
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' });

      console.log(`[BriefingScraper] Navegando para: ${url}`);

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Auto-scroll para lazy content
      await this.autoScroll(page);

      const html = await page.content();
      return this.parseHtmlContent(html, url);

    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  /**
   * Extrai conteúdo de PDF
   */
  private async extractFromPdf(url: string): Promise<ExtractedContent> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': this.userAgent }
      });

      const pdfParse = require('pdf-parse');
      const data = await pdfParse(Buffer.from(response.data));

      return {
        title: data.info?.Title || 'PDF Document',
        description: '',
        fullText: data.text || '',
        prices: this.extractPrices(data.text || ''),
        promotions: this.extractPromotions(data.text || ''),
        metadata: {
          pdf_pages: data.numpages,
          pdf_info: data.info
        }
      };
    } catch (error: any) {
      console.error('[BriefingScraper] Erro ao extrair PDF:', error.message);
      throw new Error(`Falha ao extrair PDF: ${error.message}`);
    }
  }

  /**
   * Extrai conteúdo de perfil Instagram
   */
  private async extractFromInstagram(url: string): Promise<ExtractedContent> {
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      await page.setUserAgent(this.userAgent);
      await page.setViewport({ width: 1920, height: 1080 });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Extrair bio e informações do perfil (usando string para evitar erros TS com DOM)
      const profileData = await page.evaluate(`
        (() => {
          const bio = document.querySelector('header section > div:nth-child(3)')?.textContent || '';
          const name = document.querySelector('header h1')?.textContent || '';
          const stats = Array.from(document.querySelectorAll('header ul li')).map(li => li.textContent);
          return { bio, name, stats: stats.join(' | ') };
        })()
      `) as { bio: string; name: string; stats: string };

      const fullText = `
Perfil Instagram: ${profileData.name}
Bio: ${profileData.bio}
Estatísticas: ${profileData.stats}
      `.trim();

      return {
        title: profileData.name || 'Perfil Instagram',
        description: profileData.bio,
        fullText,
        prices: this.extractPrices(fullText),
        promotions: this.extractPromotions(fullText),
        metadata: { source: 'instagram', profile_url: url }
      };
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  /**
   * Extrai conteúdo de perfil LinkedIn
   */
  private async extractFromLinkedIn(url: string): Promise<ExtractedContent> {
    // LinkedIn requer autenticação, usar extração básica
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      await page.setUserAgent(this.userAgent);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 2000));

      const html = await page.content();
      const $ = cheerio.load(html);

      // Extrair informações públicas
      const name = $('h1').first().text().trim();
      const headline = $('[data-field="headline"]').text().trim() || $('h2').first().text().trim();
      const about = $('[data-field="about"]').text().trim();

      const fullText = `
Perfil LinkedIn: ${name}
${headline}
${about}
      `.trim();

      return {
        title: name || 'Perfil LinkedIn',
        description: headline,
        fullText: fullText || 'Conteúdo do LinkedIn requer autenticação',
        prices: [],
        promotions: [],
        metadata: { source: 'linkedin', profile_url: url }
      };
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  /**
   * Extrai conteúdo de canal/vídeo YouTube
   */
  private async extractFromYouTube(url: string): Promise<ExtractedContent> {
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      await page.setUserAgent(this.userAgent);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Extrair informações do canal ou vídeo (usando string para evitar erros TS com DOM)
      const data = await page.evaluate(`
        (() => {
          const title = document.querySelector('#channel-name, #video-title')?.textContent || '';
          const description = document.querySelector('#description, #info-container')?.textContent || '';
          const stats = document.querySelector('#subscriber-count, #info')?.textContent || '';
          return { title, description, stats };
        })()
      `) as { title: string; description: string; stats: string };

      const fullText = `
YouTube: ${data.title}
${data.stats}
${data.description}
      `.trim();

      return {
        title: data.title || 'Canal YouTube',
        description: data.description.substring(0, 200),
        fullText,
        prices: this.extractPrices(fullText),
        promotions: this.extractPromotions(fullText),
        metadata: { source: 'youtube', url }
      };
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  // =====================================================
  // PARSING DE HTML
  // =====================================================

  private parseHtmlContent(html: string, url: string): ExtractedContent {
    const $ = cheerio.load(html);

    // Extrair preços ANTES de remover elementos
    const bodyText = $('body').text();
    const prices = this.extractPrices(bodyText);
    const promotions = this.extractPromotions(bodyText);

    // Extrair header/footer content antes de processar
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

    // Remover apenas scripts e styles
    $('script, style, noscript, iframe').remove();
    $('.cookie-banner, .cookie-notice, .gdpr, #cookie-banner').remove();

    // Título
    const title = $('title').text().trim() ||
                  $('h1').first().text().trim() ||
                  $('meta[property="og:title"]').attr('content') || '';

    // Descrição
    const description = $('meta[name="description"]').attr('content') ||
                        $('meta[property="og:description"]').attr('content') || '';

    // Headings
    const headings: string[] = [];
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text && text.length > 2 && text.length < 300 && !headings.includes(text)) {
        headings.push(text);
      }
    });

    // Parágrafos
    const paragraphs: string[] = [];
    $('p').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text && text.length > 10 && !paragraphs.includes(text)) {
        paragraphs.push(text);
      }
    });

    // Listas
    const lists: string[] = [];
    $('li').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text && text.length > 5 && text.length < 500) {
        lists.push(`- ${text}`);
      }
    });

    // Montar texto completo
    const parts: string[] = [];

    if (title) parts.push(`# ${title}`);
    if (description) parts.push(description);

    if (prices.length > 0) {
      parts.push('\n## PREÇOS E VALORES');
      prices.forEach(p => parts.push(`- ${p}`));
    }

    if (promotions.length > 0) {
      parts.push('\n## PROMOÇÕES E OFERTAS');
      promotions.forEach(p => parts.push(`- ${p}`));
    }

    if (headings.length > 0) {
      parts.push('\n## TÓPICOS');
      headings.slice(0, 30).forEach(h => parts.push(`- ${h}`));
    }

    if (paragraphs.length > 0) {
      parts.push('\n## CONTEÚDO');
      paragraphs.slice(0, 80).forEach(p => parts.push(p));
    }

    if (lists.length > 0) {
      parts.push('\n## CARACTERÍSTICAS');
      lists.slice(0, 50).forEach(l => parts.push(l));
    }

    if (headerContent.length > 0) {
      parts.push('\n## HEADER');
      headerContent.forEach(h => parts.push(h));
    }

    if (footerContent.length > 0) {
      parts.push('\n## FOOTER');
      footerContent.forEach(f => parts.push(f));
    }

    return {
      title,
      description,
      fullText: parts.join('\n').trim(),
      prices,
      promotions,
      metadata: { url, extracted_headings: headings.length, extracted_paragraphs: paragraphs.length }
    };
  }

  // =====================================================
  // EXTRAÇÃO DE PREÇOS E PROMOÇÕES
  // =====================================================

  private extractPrices(text: string): string[] {
    const prices: string[] = [];
    const patterns = [
      /R\$\s*[\d.,]+/gi,
      /[\d.,]+\s*reais/gi,
      /de\s+R\$\s*[\d.,]+\s+por\s+R\$\s*[\d.,]+/gi,
      /\d+%\s*(?:OFF|de desconto|desconto)/gi,
      /apenas\s+R\$\s*[\d.,]+/gi,
      /por\s+R\$\s*[\d.,]+/gi,
      /a\s+partir\s+de\s+R\$\s*[\d.,]+/gi,
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(m => {
          const normalized = m.trim();
          if (!prices.includes(normalized)) prices.push(normalized);
        });
      }
    }

    return prices.slice(0, 30);
  }

  private extractPromotions(text: string): string[] {
    const promotions: string[] = [];
    const patterns = [
      /(?:promoção|oferta|desconto|lançamento).*?(?:\.|!|\n|$)/gi,
      /(?:válido|valido)\s+até\s+[\d\/\-]+/gi,
      /(?:últimas|ultimas)\s+(?:vagas|unidades)/gi,
      /economize\s+R\$\s*[\d.,]+/gi,
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(m => {
          const normalized = m.trim();
          if (normalized.length > 5 && !promotions.includes(normalized)) {
            promotions.push(normalized);
          }
        });
      }
    }

    return promotions.slice(0, 20);
  }

  // =====================================================
  // UTILITÁRIOS
  // =====================================================

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!browserInstance || !browserInstance.connected) {
      console.log('[BriefingScraper] Iniciando browser Puppeteer...');
      browserInstance = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
    }
    return browserInstance;
  }

  private async autoScroll(page: Page): Promise<void> {
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

  private formatContent(extracted: ExtractedContent, source: string): string {
    const parts: string[] = [];

    parts.push(`=== ${source.toUpperCase()} ===\n`);

    if (extracted.title) parts.push(`TÍTULO: ${extracted.title}\n`);
    if (extracted.description) parts.push(`DESCRIÇÃO: ${extracted.description}\n`);

    if (extracted.prices.length > 0) {
      parts.push('\n=== PREÇOS E VALORES ===');
      extracted.prices.forEach(p => parts.push(`- ${p}`));
    }

    if (extracted.promotions.length > 0) {
      parts.push('\n=== PROMOÇÕES E OFERTAS ===');
      extracted.promotions.forEach(p => parts.push(`- ${p}`));
    }

    parts.push('\n=== CONTEÚDO ===');
    parts.push(extracted.fullText);

    return parts.join('\n');
  }

  async closeBrowser(): Promise<void> {
    if (browserInstance && browserInstance.connected) {
      console.log('[BriefingScraper] Fechando browser...');
      await browserInstance.close().catch(() => {});
      browserInstance = null;
    }
  }
}

// =====================================================
// SINGLETON
// =====================================================

let instance: BriefingDocumentsScraperService | null = null;

export function getBriefingDocumentsScraperService(): BriefingDocumentsScraperService {
  if (!instance) {
    instance = new BriefingDocumentsScraperService();
  }
  return instance;
}

process.on('beforeExit', async () => {
  if (instance) await instance.closeBrowser();
});

export default BriefingDocumentsScraperService;
