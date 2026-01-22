/**
 * Landing Page Scraper Service
 *
 * Extrai conteudo de landing pages para embedding no RAG
 * - Faz fetch da URL
 * - Extrai texto limpo (remove scripts, styles, etc)
 * - Processa e embeda via CampaignDocumentProcessor
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { campaignDocumentProcessor } from './campaign-document-processor.service';

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

  private async fetchPage(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
        timeout: 30000,
        maxRedirects: 5
      });

      return response.data;
    } catch (error: any) {
      console.error('[LandingPageScraper] Erro ao fazer fetch:', error.message);
      return null;
    }
  }

  private extractContent(html: string, url: string): ExtractedContent {
    const $ = cheerio.load(html);

    // Remover elementos que nao sao conteudo
    $('script').remove();
    $('style').remove();
    $('noscript').remove();
    $('iframe').remove();
    $('nav').remove();
    $('header').remove();
    $('footer').remove();
    $('[role="navigation"]').remove();
    $('[role="banner"]').remove();
    $('[role="contentinfo"]').remove();
    $('.cookie-banner, .cookie-notice, .gdpr').remove();
    $('#cookie-banner, #cookie-notice').remove();

    // Extrair titulo
    const title = $('title').text().trim() ||
                  $('h1').first().text().trim() ||
                  $('meta[property="og:title"]').attr('content') ||
                  '';

    // Extrair descricao
    const description = $('meta[name="description"]').attr('content') ||
                        $('meta[property="og:description"]').attr('content') ||
                        '';

    // Extrair headings
    const headings: string[] = [];
    $('h1, h2, h3, h4').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 2 && text.length < 200) {
        headings.push(text);
      }
    });

    // Extrair paragrafos
    const paragraphs: string[] = [];
    $('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 20) {
        paragraphs.push(text);
      }
    });

    // Extrair listas
    const lists: string[] = [];
    $('li').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 10 && text.length < 500) {
        lists.push(`- ${text}`);
      }
    });

    // Extrair CTAs (botoes e links de acao)
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
        // Evitar duplicatas e textos genericos
        const normalized = text.replace(/\s+/g, ' ');
        if (!ctas.includes(normalized) &&
            !['×', 'X', '✕', 'Menu', 'Toggle'].includes(normalized)) {
          ctas.push(normalized);
        }
      }
    });

    // Extrair texto de sections e divs principais
    const mainContent: string[] = [];
    $('main, article, section, [role="main"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 50) {
        // Limpar espacos extras
        const cleaned = text.replace(/\s+/g, ' ').trim();
        if (cleaned.length > 50 && !mainContent.includes(cleaned)) {
          mainContent.push(cleaned);
        }
      }
    });

    // Montar texto completo
    const fullTextParts: string[] = [];

    if (title) fullTextParts.push(`# ${title}`);
    if (description) fullTextParts.push(`\n${description}`);

    if (headings.length > 0) {
      fullTextParts.push('\n\n## Principais Topicos');
      headings.slice(0, 20).forEach(h => fullTextParts.push(`- ${h}`));
    }

    if (paragraphs.length > 0) {
      fullTextParts.push('\n\n## Conteudo');
      paragraphs.slice(0, 50).forEach(p => fullTextParts.push(`\n${p}`));
    }

    if (lists.length > 0) {
      fullTextParts.push('\n\n## Caracteristicas e Beneficios');
      lists.slice(0, 30).forEach(l => fullTextParts.push(l));
    }

    if (ctas.length > 0) {
      fullTextParts.push('\n\n## CTAs (Chamadas para Acao)');
      ctas.slice(0, 10).forEach(c => fullTextParts.push(`- ${c}`));
    }

    const fullText = fullTextParts.join('\n').trim();

    return {
      title,
      description,
      headings: headings.slice(0, 20),
      paragraphs: paragraphs.slice(0, 50),
      lists: lists.slice(0, 30),
      ctas: ctas.slice(0, 10),
      fullText
    };
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

    if (extracted.ctas && extracted.ctas.length > 0) {
      parts.push(`\nCTAs (BOTOES DE ACAO):`);
      extracted.ctas.forEach(c => parts.push(`- ${c}`));
    }

    return parts.join('\n');
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

export default LandingPageScraperService;
