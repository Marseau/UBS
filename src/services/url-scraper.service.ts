/**
 * URL Scraper Service
 * Comprehensive scraping to extract contact information (emails, phones)
 * Handles Instagram redirects, shortened URLs, WhatsApp links, Facebook, Instagram
 *
 * Features:
 * - Auto-cleanup browser after 5min inactivity
 * - Always headless mode (no visual browser)
 * - Better error handling and timeouts
 */

// @ts-nocheck - Código usa document dentro de page.evaluate() (contexto browser)
import puppeteer, { Browser, Page } from 'puppeteer';

interface ScrapedContacts {
  emails: string[];
  phones: string[];
  whatsapp_phones: string[];  // Phones extraídos de wa.me/api.whatsapp (normalizados)
  success: boolean;
  error?: string;
  website_text?: string;
  sources?: {
    main_page?: boolean;
    whatsapp_links?: boolean;
    linktr?: boolean;
    beacons?: boolean;
    linkin?: boolean;
    facebook?: boolean;
    youtube?: boolean;
  };
}

interface ScrapeOptions {
  deepLinks?: boolean;
}

export class UrlScraperService {
  private static browser: Browser | null = null;
  private static lastUsed: number = Date.now();
  private static cleanupTimer: NodeJS.Timeout | null = null;
  private static readonly CLEANUP_TIMEOUT_MS = 300000; // 5 minutes

  // Controle de concorrência
  private static activeScrapers: number = 0;
  private static readonly MAX_CONCURRENT_SCRAPERS: number = 2; // Máximo 2 scrapes simultâneos
  private static scrapeQueue: Array<{
    url: string;
    cacheKey: string;
    options: ScrapeOptions;
    resolve: (value: ScrapedContacts) => void;
    reject: (reason: any) => void;
  }> = [];
  private static isProcessingQueue: boolean = false;

  // Cache de URLs já scrapeadas (evita reprocessamento)
  private static urlCache: Map<string, { result: ScrapedContacts; timestamp: number }> = new Map();
  private static readonly CACHE_TTL_MS = 3600000; // 1 hora de cache

  /**
   * Verifica se URL está no cache e ainda é válida
   */
  private static getCachedResult(url: string): ScrapedContacts | null {
    const cached = this.urlCache.get(url);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      console.log(`📦 [URL-SCRAPER] Cache hit para: ${url.substring(0, 50)}...`);
      return cached.result;
    }
    return null;
  }

  /**
   * Salva resultado no cache
   */
  private static setCachedResult(url: string, result: ScrapedContacts): void {
    this.urlCache.set(url, { result, timestamp: Date.now() });
    // Limpar cache antigo periodicamente
    if (this.urlCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of this.urlCache) {
        if (now - value.timestamp > this.CACHE_TTL_MS) {
          this.urlCache.delete(key);
        }
      }
    }
  }

  /**
   * Retorna estatísticas de concorrência
   */
  static getConcurrencyStats(): { active: number; queued: number; cacheSize: number; maxConcurrent: number } {
    return {
      active: this.activeScrapers,
      queued: this.scrapeQueue.length,
      cacheSize: this.urlCache.size,
      maxConcurrent: this.MAX_CONCURRENT_SCRAPERS,
    };
  }

  /**
   * Processa próximo item da fila
   */
  private static async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.scrapeQueue.length > 0 && this.activeScrapers < this.MAX_CONCURRENT_SCRAPERS) {
      const item = this.scrapeQueue.shift();
      if (item) {
        this.activeScrapers++;
        console.log(`🔄 [URL-SCRAPER] Processando da fila (${this.activeScrapers}/${this.MAX_CONCURRENT_SCRAPERS} ativos, ${this.scrapeQueue.length} na fila)`);

        this.doScrapeUrl(item.url, item.options)
          .then(result => {
            this.activeScrapers--;
            this.setCachedResult(item.cacheKey, result); // Salvar no cache
            item.resolve(result);
            this.processQueue(); // Continuar processando fila
          })
          .catch(error => {
            this.activeScrapers--;
            item.reject(error);
            this.processQueue();
          });
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Get or create shared browser instance
   * Always runs in headless mode (no visual browser)
   */
  private static async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      console.log(`🌐 [URL-SCRAPER] Iniciando browser headless=true...`);

      this.browser = await puppeteer.launch({
        headless: true, // SEMPRE headless para url-scraper
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
        ],
      });
    }

    // Update last used time and schedule cleanup
    this.lastUsed = Date.now();
    this.scheduleCleanup();

    return this.browser;
  }

  /**
   * Schedule browser cleanup after inactivity
   */
  private static scheduleCleanup(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }

    this.cleanupTimer = setTimeout(async () => {
      const inactiveTime = Date.now() - this.lastUsed;
      if (inactiveTime >= this.CLEANUP_TIMEOUT_MS) {
        console.log('🧹 [URL-SCRAPER] Browser inativo por 5min, fechando...');
        await this.closeBrowser();
      }
    }, this.CLEANUP_TIMEOUT_MS);
  }

  /**
   * Extract phone numbers from WhatsApp links (wa.me/*, api.whatsapp.com/send)
   * @param html - HTML content to search for WhatsApp links
   * @returns Array of phone numbers found in WhatsApp links
   */
  private static extractWhatsAppPhones(html: string): string[] {
    const phones: string[] = [];

    // wa.me/5548999998888
    const waMeRegex = /wa\.me\/(\d{10,15})/g;
    let match;
    while ((match = waMeRegex.exec(html)) !== null) {
      // Normaliza com lógica de WhatsApp (adiciona 9 se faltar)
      const normalized = this.normalizePhone(match[1]);
      phones.push(normalized);
    }

    // api.whatsapp.com/send?phone=5548999998888 OR api.whatsapp.com/send/?phone=5548999998888
    const apiWhatsAppRegex = /api\.whatsapp\.com\/send\/?\?phone=(\d{10,15})/g;
    while ((match = apiWhatsAppRegex.exec(html)) !== null) {
      // Normaliza com lógica de WhatsApp (adiciona 9 se faltar)
      const normalized = this.normalizePhone(match[1]);
      phones.push(normalized);
    }

    return phones;
  }

  /**
   * Extract phones from visible text using contextual keywords
   * Only extracts phones near keywords like "telefone", "contato", "whatsapp", etc.
   * @param visibleText - Visible text from page
   * @returns Object with all phones and whatsapp-context phones
   */
  private static extractPhonesFromText(visibleText: string): { phones: string[]; whatsappContext: string[] } {
    const contextKeywords = [
      'telefone', 'tel', 'contato', 'fone',
      'celular', 'ligar', 'chamar', 'phone', 'contact', 'call', 'fale'
    ];

    // Keywords que indicam WhatsApp especificamente
    const whatsappKeywords = [
      'whatsapp', 'wpp', 'zap', 'whats', 'whatszap', 'zapzap', 'watzap'
    ];

    // Emojis que indicam WhatsApp/celular
    const whatsappEmojis = ['📱', '📲', '💬', '📞', '☎️', '✆', '📳'];

    const phoneMatches: string[] = [];
    const whatsappContextPhones: string[] = [];
    const lines = visibleText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ? lines[i].toLowerCase() : '';
      const originalLine = lines[i] || '';

      const hasContext = contextKeywords.some(keyword => line.includes(keyword));
      const hasWhatsappContext = whatsappKeywords.some(keyword => line.includes(keyword));
      const hasWhatsappEmoji = whatsappEmojis.some(emoji => originalLine.includes(emoji));

      if ((hasContext || hasWhatsappContext || hasWhatsappEmoji) && lines[i]) {
        const phoneRegex = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)(?:9\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{4})/g;
        const matches = lines[i].match(phoneRegex);
        if (matches) {
          phoneMatches.push(...matches);
          // Se tem contexto de WhatsApp, adiciona à lista separada
          if (hasWhatsappContext || hasWhatsappEmoji) {
            whatsappContextPhones.push(...matches);
            console.log(`   📱 [CONTEXT] WhatsApp detectado por contexto: "${line.substring(0, 50)}..."`);
          }
        }
      }
    }

    return { phones: phoneMatches, whatsappContext: whatsappContextPhones };
  }

  /**
   * Extract WhatsApp phones from HTML by checking context around phone numbers
   * Uses multiple detection strategies:
   * 1. Keywords/emojis within 500 chars
   * 2. Floating WhatsApp buttons (CSS classes/IDs)
   * 3. Phone inside clickable links (href with phone number)
   * 4. WhatsApp icons (img src/alt)
   * @param html - Raw HTML content
   * @returns Array of phones found with WhatsApp context
   */
  private static extractWhatsAppFromHtmlContext(html: string): string[] {
    const whatsappContextPhones: string[] = [];
    const htmlLower = html.toLowerCase();

    // ============================================
    // ESTRATÉGIA 1: Botões flutuantes de WhatsApp
    // ============================================
    const floatingButtonPatterns = [
      // Classes CSS comuns de botões WhatsApp
      /class\s*=\s*["'][^"']*(?:whatsapp-float|whatsapp-fixed|wpp-float|wpp-fixed|btn-wpp|btn-whatsapp|whatsapp-btn|float-whatsapp|whatsapp-widget|whatsapp-chat)[^"']*["'][^>]*>[\s\S]{0,500}?(\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4})/gi,
      // IDs de botões WhatsApp
      /id\s*=\s*["'](?:whatsapp|wpp|whats|zap)[-_]?(?:button|btn|float|widget|chat)["'][^>]*>[\s\S]{0,500}?(\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4})/gi,
    ];

    for (const pattern of floatingButtonPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        if (match[1]) whatsappContextPhones.push(match[1]);
      }
    }

    // ============================================
    // ESTRATÉGIA 2: Telefone dentro de link <a href>
    // ============================================
    // Links com href contendo o telefone (tel:, whatsapp:, wa.me)
    const linkPatterns = [
      // href="tel:..." com telefone
      /<a[^>]*href\s*=\s*["']tel:[\s+]?(\d{10,13})["'][^>]*>/gi,
      // href contendo wa.me com número
      /<a[^>]*href\s*=\s*["'][^"']*wa\.me\/(\d{10,13})[^"']*["'][^>]*>/gi,
      // href="whatsapp://send?phone=..."
      /<a[^>]*href\s*=\s*["'][^"']*whatsapp:\/\/[^"']*phone=(\d{10,13})[^"']*["'][^>]*>/gi,
      // href com api.whatsapp.com
      /<a[^>]*href\s*=\s*["'][^"']*api\.whatsapp\.com\/send[^"']*phone=(\d{10,13})[^"']*["'][^>]*>/gi,
    ];

    for (const pattern of linkPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        if (match[1]) {
          // Normalizar para formato brasileiro
          let phone = match[1];
          if (phone.length >= 10 && phone.length <= 13) {
            whatsappContextPhones.push(phone);
          }
        }
      }
    }

    // ============================================
    // ESTRATÉGIA 3: Ícones de WhatsApp (img src/alt)
    // ============================================
    // Buscar <img> com whatsapp no src ou alt, e pegar telefone próximo
    const imgWhatsappRegex = /<img[^>]*(?:src|alt)\s*=\s*["'][^"']*whatsapp[^"']*["'][^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgWhatsappRegex.exec(html)) !== null) {
      const imgPosition = imgMatch.index;
      // Buscar telefone dentro de 500 chars após o ícone
      const searchArea = html.substring(imgPosition, Math.min(html.length, imgPosition + 500));
      const phoneInArea = searchArea.match(/\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}/);
      if (phoneInArea) {
        whatsappContextPhones.push(phoneInArea[0]);
      }
    }

    // Também verificar SVG com whatsapp
    const svgWhatsappRegex = /<svg[^>]*(?:class|id)\s*=\s*["'][^"']*whatsapp[^"']*["'][^>]*>[\s\S]*?<\/svg>/gi;
    let svgMatch;
    while ((svgMatch = svgWhatsappRegex.exec(html)) !== null) {
      const svgPosition = svgMatch.index;
      const searchArea = html.substring(svgPosition, Math.min(html.length, svgPosition + 500));
      const phoneInArea = searchArea.match(/\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}/);
      if (phoneInArea) {
        whatsappContextPhones.push(phoneInArea[0]);
      }
    }

    // ============================================
    // ESTRATÉGIA 4: Keywords/emojis no contexto (original expandida)
    // ============================================
    const whatsappKeywords = [
      // WhatsApp direto
      'whatsapp', 'wpp', 'zap', 'whats', 'whatszap', 'zapzap', 'watzap', 'whatss',
      'wa.me', 'api.whatsapp', 'whatsapp.com',
      // Contexto de contato
      'fale conosco', 'fale com', 'chama no', 'chame no', 'chamar no',
      'entre em contato', 'entrar em contato', 'contato direto',
      'atendimento', 'suporte', 'dúvidas', 'orçamento', 'agende', 'agendamento',
      'envie mensagem', 'enviar mensagem', 'mande mensagem', 'mandar mensagem',
      'clique aqui', 'clique para', 'toque para', 'toque aqui',
      // Botões/classes CSS comuns
      'btn-whatsapp', 'whatsapp-button', 'whats-button', 'botao-whatsapp',
      'icon-whatsapp', 'fa-whatsapp', 'whatsapp-icon',
      // Font Awesome e ícones
      'fa-brands fa-whatsapp', 'fab fa-whatsapp', 'bi-whatsapp'
    ];
    const whatsappEmojis = ['📱', '📲', '💬', '📞', '☎️', '✆', '📳', '💭', '🗨️', '✉️', '📩', '📨'];

    const phoneRegex = /\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}/g;
    let match;

    while ((match = phoneRegex.exec(html)) !== null) {
      const phone = match[0];
      const position = match.index;

      // Pegar 500 caracteres antes e depois do telefone
      const start = Math.max(0, position - 500);
      const end = Math.min(html.length, position + phone.length + 500);
      const context = html.substring(start, end).toLowerCase();

      // Verificar se há contexto de WhatsApp
      const hasWhatsappKeyword = whatsappKeywords.some(kw => context.includes(kw));
      const hasWhatsappEmoji = whatsappEmojis.some(emoji => context.includes(emoji));

      if (hasWhatsappKeyword || hasWhatsappEmoji) {
        whatsappContextPhones.push(phone);
      }
    }

    return [...new Set(whatsappContextPhones)]; // Remove duplicatas
  }

  /**
   * Validate Brazilian phone number format
   * @param phone - Phone number string (can contain formatting)
   * @returns true if valid Brazilian phone
   * - 11 dígitos: celular (DDD + 9 + 8 dígitos)
   * - 10 dígitos: fixo apenas se começa com 2,3,4,5 (rejeita 6,7,8,9 = celular sem 9)
   */
  private static isValidBrazilianPhone(phone: string): boolean {
    let cleaned = phone.replace(/[^0-9]/g, '');

    // Remove country code if present (55)
    if (cleaned.length === 13 && cleaned.startsWith('55')) {
      cleaned = cleaned.substring(2);
    } else if (cleaned.length === 12 && cleaned.startsWith('55')) {
      cleaned = cleaned.substring(2);
    }

    // Must be 10 or 11 digits (with area code)
    if (cleaned.length !== 10 && cleaned.length !== 11) return false;

    // If 11 digits, 3rd digit must be 9 (mobile)
    if (cleaned.length === 11 && cleaned[2] !== '9') return false;

    // If 10 digits, check if it's landline (2,3,4,5) or mobile without 9 (6,7,8,9)
    if (cleaned.length === 10) {
      const firstDigitAfterDDD = cleaned.charAt(2);
      // Celular sem o 9 (começa com 6,7,8,9) - INVÁLIDO
      if (['6', '7', '8', '9'].includes(firstDigitAfterDDD)) {
        console.log(`   ⚠️ [VALIDATE] Número rejeitado (celular sem 9): 55${cleaned}`);
        return false;
      }
      // Fixo (começa com 2,3,4,5) - válido
    }

    // Area code must be between 11-99
    const areaCode = parseInt(cleaned.substring(0, 2));
    if (areaCode < 11 || areaCode > 99) return false;

    // Must not be all same digits
    if (/^(\d)\1+$/.test(cleaned)) return false;

    // Filter common fake/test numbers
    const fakeNumbers = [
      '99999999999', '11111111111', '00000000000',
      '12345678901', '98765432109', '99996666666'
    ];
    if (fakeNumbers.includes(cleaned)) return false;

    // Reject numbers with too many repeating digits (like 11994777911)
    const uniqueDigits = new Set(cleaned.split('')).size;
    if (uniqueDigits < 5) return false; // Needs at least 5 different digits

    return true;
  }

  /**
   * Normaliza telefone para formato brasileiro (55 + DDD + número)
   * @param phone - Telefone limpo (apenas dígitos)
   * @returns Telefone normalizado com código do país
   */
  private static normalizePhone(phone: string): string {
    const cleaned = phone.replace(/[^0-9]/g, '');

    // Já tem código do país 55
    if (cleaned.startsWith('55') && cleaned.length >= 12) {
      return cleaned;
    }

    // Número brasileiro sem código do país (10-11 dígitos)
    if (cleaned.length >= 10 && cleaned.length <= 11) {
      return '55' + cleaned;
    }

    return cleaned;
  }


  /**
   * Extrai número WhatsApp de wa.me/message/CODE via navegação
   * Navega para a URL e tenta capturar o número do redirect ou conteúdo
   */
  private static async extractWhatsAppFromMessageLink(url: string): Promise<ScrapedContacts | null> {
    let page: Page | null = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      page.setDefaultNavigationTimeout(15000);
      page.setDefaultTimeout(8000);

      // Capturar redirects
      let redirectedUrl = '';
      page.on('response', (response) => {
        const status = response.status();
        if (status >= 300 && status < 400) {
          const location = response.headers()['location'];
          if (location) {
            redirectedUrl = location;
          }
        }
      });

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Aguardar um pouco para a página carregar completamente
      await new Promise(r => setTimeout(r, 2000));

      // Verificar se houve redirect para URL com número
      const finalUrl = page.url();
      const urlToCheck = redirectedUrl || finalUrl;
      console.log(`   🔍 [wa.me/message] URL final: ${finalUrl}`);
      console.log(`   🔍 [wa.me/message] Redirect URL: ${redirectedUrl || 'nenhum'}`);

      // Tentar extrair número da URL final
      const phoneMatch = urlToCheck.match(/wa\.me\/\+?(\d{10,15})|phone=\+?(\d{10,15})/i);
      if (phoneMatch) {
        const phoneNumber = phoneMatch[1] || phoneMatch[2];
        const normalized = this.normalizePhone(phoneNumber);
        if (normalized && normalized.startsWith('55') && normalized.length >= 12) {
          console.log(`   ✅ [wa.me/message] Número extraído do redirect: ${normalized}`);
          await page.close().catch(() => {});
          return {
            emails: [],
            phones: [normalized],
            whatsapp_phones: [normalized],
            success: true,
            sources: { whatsapp_links: true }
          };
        }
      }

      // Tentar extrair do conteúdo da página - múltiplas estratégias
      const pageContent = await page.content();

      // Estratégia 1: wa.me/NUMERO ou phone=NUMERO
      const contentMatch = pageContent.match(/wa\.me\/\+?(\d{10,15})|"phone":\s*"\+?(\d{10,15})"|phone=\+?(\d{10,15})/i);
      if (contentMatch) {
        const phoneNumber = contentMatch[1] || contentMatch[2] || contentMatch[3];
        const normalized = this.normalizePhone(phoneNumber);
        if (normalized && normalized.startsWith('55') && normalized.length >= 12) {
          console.log(`   ✅ [wa.me/message] Número extraído do conteúdo: ${normalized}`);
          await page.close().catch(() => {});
          return {
            emails: [],
            phones: [normalized],
            whatsapp_phones: [normalized],
            success: true,
            sources: { whatsapp_links: true }
          };
        }
      }

      // Estratégia 2: Buscar número brasileiro no HTML (55 + 10-11 dígitos)
      const brazilPhoneRegex = /[+]?55\s?(\d{2})\s?(\d{4,5})[-\s]?(\d{4})/g;
      let brazilMatch;
      while ((brazilMatch = brazilPhoneRegex.exec(pageContent)) !== null) {
        const rawNumber = `55${brazilMatch[1]}${brazilMatch[2]}${brazilMatch[3]}`;
        const normalized = this.normalizePhone(rawNumber);
        if (normalized && normalized.length >= 12) {
          console.log(`   ✅ [wa.me/message] Número brasileiro encontrado: ${normalized}`);
          await page.close().catch(() => {});
          return {
            emails: [],
            phones: [normalized],
            whatsapp_phones: [normalized],
            success: true,
            sources: { whatsapp_links: true }
          };
        }
      }

      // Estratégia 3: Número com 10-13 dígitos começando com 55 em qualquer lugar
      const genericBrazilMatch = pageContent.match(/\b(55\d{10,11})\b/);
      if (genericBrazilMatch) {
        const normalized = this.normalizePhone(genericBrazilMatch[1]);
        console.log(`   ✅ [wa.me/message] Número genérico encontrado: ${normalized}`);
        await page.close().catch(() => {});
        return {
          emails: [],
          phones: [normalized],
          whatsapp_phones: [normalized],
          success: true,
          sources: { whatsapp_links: true }
        };
      }

      // Debug: mostrar trecho do HTML para diagnóstico
      const phoneHint = pageContent.match(/\d{10,13}/g);
      if (phoneHint) {
        console.log(`   🔍 [wa.me/message] Números encontrados no HTML: ${phoneHint.slice(0, 5).join(', ')}`);
      }

      console.log(`   ⚠️ [wa.me/message] Número não encontrado na URL: ${url}`);
      await page.close().catch(() => {});
      return null;

    } catch (error: any) {
      console.error(`   ❌ [wa.me/message] Erro: ${error.message}`);
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
      return null;
    }
  }

  /**
   * Scrape Facebook page for contact information
   * @param page - Puppeteer page instance
   * @param facebookUrl - Facebook profile/page URL
   * @returns Object with emails and phones arrays
   */
  private static async scrapeFacebookPage(page: Page, facebookUrl: string): Promise<{ emails: string[]; phones: string[] }> {
    try {
      console.log(`  📘 [FACEBOOK] Navegando para: ${facebookUrl}`);
      await page.goto(facebookUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('body', { timeout: 10000 });

      const html = await page.content();
      const visibleText = await page.evaluate(() => (document as any).body.innerText);

      // Extract emails
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = (html.match(emailRegex) || []).filter(email => {
        const lower = email.toLowerCase();
        return !lower.includes('facebook.com') && !lower.includes('example.com');
      });

      // Extract WhatsApp phones from links
      const whatsappPhones = this.extractWhatsAppPhones(html);

      // Extract phones from text WITH context
      const textResult = this.extractPhonesFromText(visibleText);
      const textPhones = textResult.phones;

      // Extract phones from HTML WITHOUT context (catch phones in page data)
      const phoneRegex = /\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}/g;
      const htmlPhones = html.match(phoneRegex) || [];

      // Combine, deduplicate and validate
      const cleanedFbPhones = [...whatsappPhones, ...textPhones, ...htmlPhones].map(p => p.replace(/[^0-9]/g, ''));
      const uniqueFbPhones = [...new Set(cleanedFbPhones)];
      const allPhones = uniqueFbPhones.filter(p => this.isValidBrazilianPhone(p));

      console.log(`  ✅ [FACEBOOK] Encontrado: ${emails.length} emails, ${allPhones.length} telefones`);
      return { emails, phones: allPhones };

    } catch (error: any) {
      console.error(`  ❌ [FACEBOOK] Erro:`, error.message);
      return { emails: [], phones: [] };
    }
  }

  /**
   * Scrape Linktr.ee page - navigate through links and extract contacts
   * @param page - Puppeteer page instance
   * @param linktreeUrl - Linktr.ee URL
   * @returns Object with emails and phones arrays
   */
  private static async scrapeLinktrPage(page: Page, linktreeUrl: string, options: ScrapeOptions = {}): Promise<{ emails: string[]; phones: string[] }> {
    try {
      console.log(`  🌳 [LINKTR.EE] Navegando para: ${linktreeUrl}`);
      await page.goto(linktreeUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('body', { timeout: 10000 });

      const emails: string[] = [];
      const phones: string[] = [];

      // Extrair HTML da página principal
      const html = await page.content();

      // 1. Extrair WhatsApp links da página principal
      const whatsappPhones = this.extractWhatsAppPhones(html);
      phones.push(...whatsappPhones.map(p => p.replace(/[^0-9]/g, '')));

      // 2. Extrair todos os links dos botões
      const links = await page.evaluate(() => {
        const linkElements = Array.from(document.querySelectorAll('a[href]'));
        return linkElements
          .map(el => el.getAttribute('href'))
          .filter(href => href && !href.includes('linktr.ee') && !href.includes('javascript:'));
      });

      console.log(`  🔗 [LINKTR.EE] Encontrados ${links.length} links para processar`);

      // 3. Visitar links leves (priorizar contato direto; modo deep expande links)
      const MAX_VISITS = options.deepLinks ? 5 : 3;
      const PER_LINK_TIMEOUT_MS = 5000;
      const contactLinks = links.filter(link =>
        link.startsWith('http') &&
        (link.includes('wa.me') || link.includes('whatsapp') || link.includes('mailto:') || link.includes('tel:'))
      );
      const genericLinks = links.filter(link =>
        link.startsWith('http') &&
        !contactLinks.includes(link) &&
        !link.includes('instagram.com') &&
        !link.includes('facebook.com') &&
        !link.includes('youtube.com') &&
        !link.includes('tiktok.com')
      );
      const prioritizedLinks = options.deepLinks
        ? [...contactLinks, ...genericLinks].slice(0, MAX_VISITS)
        : contactLinks.slice(0, MAX_VISITS);

      for (let i = 0; i < Math.min(prioritizedLinks.length, MAX_VISITS); i++) {
        const link = prioritizedLinks[i];
        try {
          console.log(`    🔍 [LINKTR.EE] Visitando link ${i + 1}/${MAX_VISITS}: ${link}`);

          // Se for WhatsApp, extrair
          if (link.includes('wa.me') || link.includes('whatsapp')) {
            // wa.me/message/CODE precisa navegar para descobrir o número
            if (link.includes('wa.me/message/')) {
              console.log(`      📱 [LINKTR.EE] Detectado wa.me/message, navegando...`);
              const messageResult = await this.extractWhatsAppFromMessageLink(link);
              if (messageResult?.whatsapp_phones?.length) {
                phones.push(...messageResult.whatsapp_phones);
                console.log(`      ✅ [LINKTR.EE] Extraído: ${messageResult.whatsapp_phones[0]}`);
              }
              continue;
            }
            // wa.me/NUMERO - extrair diretamente
            const waPhones = this.extractWhatsAppPhones(link);
            phones.push(...waPhones.map(p => p.replace(/[^0-9]/g, '')));
            continue;
          }

          const linkPage = await page.browser().newPage();
          try {
            await Promise.race([
              linkPage.goto(link, { waitUntil: 'domcontentloaded', timeout: PER_LINK_TIMEOUT_MS }),
              new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout manual: link > ${PER_LINK_TIMEOUT_MS}ms`)), PER_LINK_TIMEOUT_MS))
            ]);
            await new Promise(resolve => setTimeout(resolve, 500));

            const linkHtml = await linkPage.content();
            const linkText = await linkPage.evaluate(() => (document as any).body.innerText);

            // Extrair emails
            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const foundEmails = linkHtml.match(emailRegex) || [];
            emails.push(...foundEmails.filter(e =>
              !e.includes('example.com') && !e.includes('linktr.ee')
            ));

            // Extrair telefones
            const linkPhones = this.extractWhatsAppPhones(linkHtml);
            phones.push(...linkPhones.map(p => p.replace(/[^0-9]/g, '')));

            const textPhones = this.extractPhonesFromText(linkText);
            phones.push(...textPhones.map(p => p.replace(/[^0-9]/g, '')));
          } finally {
            try { await linkPage.close(); } catch {}
          }

        } catch (linkError: any) {
          console.log(`    ⚠️  [LINKTR.EE] Erro no link ${i + 1}: ${linkError.message}`);
        }
      }

      // Validar e normalizar telefones
      const validPhones = phones
        .filter(p => this.isValidBrazilianPhone(p))
        .map(p => this.normalizePhone(p));
      const uniquePhones = [...new Set(validPhones)];
      const uniqueEmails = [...new Set(emails)];

      console.log(`  ✅ [LINKTR.EE] Encontrado: ${uniqueEmails.length} emails, ${uniquePhones.length} telefones`);
      return { emails: uniqueEmails, phones: uniquePhones };

    } catch (error: any) {
      console.error(`  ❌ [LINKTR.EE] Erro:`, error.message);
      return { emails: [], phones: [] };
    }
  }

  /**
   * Scrape Beacons.ai page - navigate through links and extract contacts
   * @param page - Puppeteer page instance
   * @param beaconsUrl - Beacons.ai URL
   * @returns Object with emails and phones arrays
   */
  private static async scrapeBeaconsPage(page: Page, beaconsUrl: string, options: ScrapeOptions = {}): Promise<{ emails: string[]; phones: string[] }> {
    try {
      console.log(`  🔦 [BEACONS.AI] Navegando para: ${beaconsUrl}`);
      await page.goto(beaconsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('body', { timeout: 10000 });

      const emails: string[] = [];
      const phones: string[] = [];
      const MAX_VISITS = options.deepLinks ? 5 : 3;
      const PER_LINK_TIMEOUT_MS = 5000;

      // Extrair HTML da página principal
      const html = await page.content();

      // 1. Extrair WhatsApp links da página principal
      const whatsappPhones = this.extractWhatsAppPhones(html);
      phones.push(...whatsappPhones.map(p => p.replace(/[^0-9]/g, '')));

      // 2. Extrair todos os links dos botões
      const links = await page.evaluate(() => {
        const linkElements = Array.from(document.querySelectorAll('a[href]'));
        return linkElements
          .map(el => el.getAttribute('href'))
          .filter(href => href && !href.includes('beacons.ai') && !href.includes('javascript:'));
      });

      console.log(`  🔗 [BEACONS.AI] Encontrados ${links.length} links para processar`);

      // 3. Visitar links leves (modo deep expande seleção)
      const contactLinks = links.filter(link =>
        link.startsWith('http') &&
        (link.includes('wa.me') || link.includes('whatsapp') || link.includes('mailto:') || link.includes('tel:'))
      );
      const genericLinks = links.filter(link =>
        link.startsWith('http') &&
        !contactLinks.includes(link) &&
        !link.includes('instagram.com') &&
        !link.includes('facebook.com') &&
        !link.includes('youtube.com') &&
        !link.includes('tiktok.com')
      );
      const prioritizedLinks = options.deepLinks
        ? [...contactLinks, ...genericLinks].slice(0, MAX_VISITS)
        : contactLinks.slice(0, MAX_VISITS);

      for (let i = 0; i < Math.min(prioritizedLinks.length, MAX_VISITS); i++) {
        const link = prioritizedLinks[i];
        try {
          console.log(`    🔍 [BEACONS.AI] Visitando link ${i + 1}/${MAX_VISITS}: ${link}`);

          if (link.includes('wa.me') || link.includes('whatsapp')) {
            // wa.me/message/CODE precisa navegar para descobrir o número
            if (link.includes('wa.me/message/')) {
              console.log(`      📱 [BEACONS.AI] Detectado wa.me/message, navegando...`);
              const messageResult = await this.extractWhatsAppFromMessageLink(link);
              if (messageResult?.whatsapp_phones?.length) {
                phones.push(...messageResult.whatsapp_phones);
                console.log(`      ✅ [BEACONS.AI] Extraído: ${messageResult.whatsapp_phones[0]}`);
              }
              continue;
            }
            // wa.me/NUMERO - extrair diretamente
            const waPhones = this.extractWhatsAppPhones(link);
            phones.push(...waPhones.map(p => p.replace(/[^0-9]/g, '')));
            continue;
          }

          const linkPage = await page.browser().newPage();
          try {
            await Promise.race([
              linkPage.goto(link, { waitUntil: 'domcontentloaded', timeout: PER_LINK_TIMEOUT_MS }),
              new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout manual: link > ${PER_LINK_TIMEOUT_MS}ms`)), PER_LINK_TIMEOUT_MS))
            ]);
            await new Promise(resolve => setTimeout(resolve, 500));

            const linkHtml = await linkPage.content();
            const linkText = await linkPage.evaluate(() => (document as any).body.innerText);

            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const foundEmails = linkHtml.match(emailRegex) || [];
            emails.push(...foundEmails.filter(e =>
              !e.includes('example.com') && !e.includes('beacons.ai')
            ));

            const linkPhones = this.extractWhatsAppPhones(linkHtml);
            phones.push(...linkPhones.map(p => p.replace(/[^0-9]/g, '')));

            const textPhones = this.extractPhonesFromText(linkText);
            phones.push(...textPhones.map(p => p.replace(/[^0-9]/g, '')));
          } finally {
            try { await linkPage.close(); } catch {}
          }

        } catch (linkError: any) {
          console.log(`    ⚠️  [BEACONS.AI] Erro no link ${i + 1}: ${linkError.message}`);
        }
      }

      // Validar e normalizar telefones
      const validPhones = phones
        .filter(p => this.isValidBrazilianPhone(p))
        .map(p => this.normalizePhone(p));
      const uniquePhones = [...new Set(validPhones)];
      const uniqueEmails = [...new Set(emails)];

      console.log(`  ✅ [BEACONS.AI] Encontrado: ${uniqueEmails.length} emails, ${uniquePhones.length} telefones`);
      return { emails: uniqueEmails, phones: uniquePhones };

    } catch (error: any) {
      console.error(`  ❌ [BEACONS.AI] Erro:`, error.message);
      return { emails: [], phones: [] };
    }
  }

  /**
   * Scrape Linkin.bio page - navigate through links and extract contacts
   * @param page - Puppeteer page instance
   * @param linkinUrl - Linkin.bio URL
   * @returns Object with emails and phones arrays
   */
  private static async scrapeLinkinBioPage(page: Page, linkinUrl: string, options: ScrapeOptions = {}): Promise<{ emails: string[]; phones: string[] }> {
    try {
      console.log(`  🔗 [LINKIN.BIO] Navegando para: ${linkinUrl}`);
      await page.goto(linkinUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('body', { timeout: 10000 });

      const emails: string[] = [];
      const phones: string[] = [];
      const MAX_VISITS = options.deepLinks ? 5 : 3;
      const PER_LINK_TIMEOUT_MS = 5000;

      const html = await page.content();

      // 1. Extrair WhatsApp links
      const whatsappPhones = this.extractWhatsAppPhones(html);
      phones.push(...whatsappPhones.map(p => p.replace(/[^0-9]/g, '')));

      // 2. Extrair links
      const links = await page.evaluate(() => {
        const linkElements = Array.from(document.querySelectorAll('a[href]'));
        return linkElements
          .map(el => el.getAttribute('href'))
          .filter(href => href && !href.includes('linkin.bio') && !href.includes('javascript:'));
      });

      console.log(`  🔗 [LINKIN.BIO] Encontrados ${links.length} links para processar`);

      // 3. Processar links leves (modo deep expande seleção)
      const contactLinks = links.filter(link =>
        link.startsWith('http') &&
        (link.includes('wa.me') || link.includes('whatsapp') || link.includes('mailto:') || link.includes('tel:'))
      );
      const genericLinks = links.filter(link =>
        link.startsWith('http') &&
        !contactLinks.includes(link) &&
        !link.includes('instagram.com') &&
        !link.includes('facebook.com') &&
        !link.includes('youtube.com') &&
        !link.includes('tiktok.com')
      );
      const prioritizedLinks = options.deepLinks
        ? [...contactLinks, ...genericLinks].slice(0, MAX_VISITS)
        : contactLinks.slice(0, MAX_VISITS);

      for (let i = 0; i < Math.min(prioritizedLinks.length, MAX_VISITS); i++) {
        const link = prioritizedLinks[i];
        try {
          console.log(`    🔍 [LINKIN.BIO] Visitando link ${i + 1}/${MAX_VISITS}: ${link}`);

          if (link.includes('wa.me') || link.includes('whatsapp')) {
            // wa.me/message/CODE precisa navegar para descobrir o número
            if (link.includes('wa.me/message/')) {
              console.log(`      📱 [LINKIN.BIO] Detectado wa.me/message, navegando...`);
              const messageResult = await this.extractWhatsAppFromMessageLink(link);
              if (messageResult?.whatsapp_phones?.length) {
                phones.push(...messageResult.whatsapp_phones);
                console.log(`      ✅ [LINKIN.BIO] Extraído: ${messageResult.whatsapp_phones[0]}`);
              }
              continue;
            }
            // wa.me/NUMERO - extrair diretamente
            const waPhones = this.extractWhatsAppPhones(link);
            phones.push(...waPhones.map(p => p.replace(/[^0-9]/g, '')));
            continue;
          }

          const linkPage = await page.browser().newPage();
          try {
            await Promise.race([
              linkPage.goto(link, { waitUntil: 'domcontentloaded', timeout: PER_LINK_TIMEOUT_MS }),
              new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout manual: link demorou mais de ${PER_LINK_TIMEOUT_MS}ms`)), PER_LINK_TIMEOUT_MS))
            ]);
            await new Promise(resolve => setTimeout(resolve, 500));

            const linkHtml = await linkPage.content();
            const linkText = await linkPage.evaluate(() => (document as any).body.innerText);

            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const foundEmails = linkHtml.match(emailRegex) || [];
            emails.push(...foundEmails.filter(e =>
              !e.includes('example.com') && !e.includes('linkin.bio')
            ));

            const linkPhones = this.extractWhatsAppPhones(linkHtml);
            phones.push(...linkPhones.map(p => p.replace(/[^0-9]/g, '')));

            const textPhones = this.extractPhonesFromText(linkText);
            phones.push(...textPhones.map(p => p.replace(/[^0-9]/g, '')));
          } finally {
            try { await linkPage.close(); } catch {}
          }

        } catch (linkError: any) {
          console.log(`    ⚠️  [LINKIN.BIO] Erro no link ${i + 1}: ${linkError.message}`);
        }
      }

      // Validar e normalizar telefones
      const validPhones = phones
        .filter(p => this.isValidBrazilianPhone(p))
        .map(p => this.normalizePhone(p));
      const uniquePhones = [...new Set(validPhones)];
      const uniqueEmails = [...new Set(emails)];

      console.log(`  ✅ [LINKIN.BIO] Encontrado: ${uniqueEmails.length} emails, ${uniquePhones.length} telefones`);
      return { emails: uniqueEmails, phones: uniquePhones };

    } catch (error: any) {
      console.error(`  ❌ [LINKIN.BIO] Erro:`, error.message);
      return { emails: [], phones: [] };
    }
  }

  /**
   * Scrape YouTube channel/video page for contact information
   * @param page - Puppeteer page instance
   * @param youtubeUrl - YouTube channel/video URL
   * @returns Object with emails and phones arrays
   */
  private static async scrapeYouTubePage(page: Page, youtubeUrl: string): Promise<{ emails: string[]; phones: string[] }> {
    try {
      console.log(`  📺 [YOUTUBE] Navegando para: ${youtubeUrl}`);
      await page.goto(youtubeUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('body', { timeout: 10000 });

      // Click on "About" tab if exists
      try {
        await page.click('tp-yt-paper-tab:has-text("Sobre"), tp-yt-paper-tab:has-text("About")');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        console.log(`  ⚠️  [YOUTUBE] Aba "Sobre" não encontrada`);
      }

      const html = await page.content();
      const visibleText = await page.evaluate(() => (document as any).body.innerText);

      // Extract emails
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = (html.match(emailRegex) || []).filter(email => {
        const lower = email.toLowerCase();
        return !lower.includes('youtube.com') && !lower.includes('google.com') && !lower.includes('example.com');
      });

      // Extract WhatsApp phones
      const whatsappPhones = this.extractWhatsAppPhones(html);

      // Extract phones from description WITH context
      const textResult = this.extractPhonesFromText(visibleText);
      const textPhones = textResult.phones;

      // Extract phones from HTML WITHOUT context
      const phoneRegex = /\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}/g;
      const htmlPhones = html.match(phoneRegex) || [];

      // Combine, deduplicate and validate
      const cleanedYtPhones = [...whatsappPhones, ...textPhones, ...htmlPhones].map(p => p.replace(/[^0-9]/g, ''));
      const uniqueYtPhones = [...new Set(cleanedYtPhones)];
      const allPhones = uniqueYtPhones.filter(p => this.isValidBrazilianPhone(p));

      console.log(`  ✅ [YOUTUBE] Encontrado: ${emails.length} emails, ${allPhones.length} telefones`);
      return { emails, phones: allPhones };

    } catch (error: any) {
      console.error(`  ❌ [YOUTUBE] Erro:`, error.message);
      return { emails: [], phones: [] };
    }
  }

  /**
   * Normaliza URL (extrai URL real de redirects Instagram)
   */
  private static normalizeUrl(url: string): string {
    if (url.includes('l.instagram.com')) {
      try {
        const urlParams = new URL(url);
        const realUrl = urlParams.searchParams.get('u');
        if (realUrl) {
          const normalized = decodeURIComponent(realUrl);
          console.log(`🔗 [URL-SCRAPER] Instagram redirect detectado, URL real: ${normalized.substring(0, 60)}...`);
          return normalized;
        }
      } catch (e) {
        // Ignorar erros de parsing
      }
    }
    return url;
  }

  /**
   * Scrape URL with concurrency control and caching
   * - Limits to MAX_CONCURRENT_SCRAPERS simultaneous operations
   * - Caches results for 1 hour
   * - Uses queue for excess requests
   *
   * @param url - URL to scrape (must be valid HTTP/HTTPS)
   * @returns ScrapedContacts object with emails, phones and metadata
   */
  static async scrapeUrl(url: string, options: ScrapeOptions = {}): Promise<ScrapedContacts> {
    // 1. Normalizar URL
    const normalizedUrl = this.normalizeUrl(url);
    const cacheKey = options.deepLinks ? `${normalizedUrl}::deep` : normalizedUrl;

    // 🔍 SPECIAL CASE: wa.me/message/CODE - Precisa navegar para descobrir o número
    const waMessageMatch = normalizedUrl.match(/wa\.me\/message\/([A-Za-z0-9]+)/i);
    if (waMessageMatch) {
      console.log(`📱 [URL-SCRAPER] wa.me/message detectado, tentando extrair número via navegação...`);
      const result = await this.extractWhatsAppFromMessageLink(normalizedUrl);
      if (result) {
        this.setCachedResult(cacheKey, result);
        return result;
      }
    }

    // ⚠️ NOTA: wa.me/NUMERO é tratado no instagram-scraper-single.service.ts (extractWhatsAppForPersistence)
    // ⚠️ NOTA: wa.me/qr/CODE é tratado pelo cron n8n às 2:15 AM (headless=false necessário)

    // 2. Verificar cache
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }

    // 3. Se abaixo do limite, processar imediatamente
    if (this.activeScrapers < this.MAX_CONCURRENT_SCRAPERS) {
      this.activeScrapers++;
      console.log(`🔍 [URL-SCRAPER] Processando direto (${this.activeScrapers}/${this.MAX_CONCURRENT_SCRAPERS} ativos)`);

      try {
        const result = await this.doScrapeUrl(normalizedUrl, options);
        this.setCachedResult(cacheKey, result);
        return result;
      } finally {
        this.activeScrapers--;
        this.processQueue(); // Processar próximo da fila
      }
    }

    // 4. Se no limite, adicionar à fila
    console.log(`⏳ [URL-SCRAPER] Limite atingido, adicionando à fila (${this.scrapeQueue.length + 1} na fila)`);

    return new Promise((resolve, reject) => {
      this.scrapeQueue.push({ url: normalizedUrl, cacheKey, options, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Executa o scraping real (método interno)
   * @param url - URL normalizada para scrape
   */
  private static async doScrapeUrl(url: string, options: ScrapeOptions = {}): Promise<ScrapedContacts> {
    let page: Page | null = null;
    const GLOBAL_TIMEOUT_MS = 60000;
    let globalTimeoutHandle: NodeJS.Timeout | null = null;

    // Watchdog: se algo pendurar por 60s, força fechamento do browser e devolve erro controlado
    const watchdogPromise = new Promise<ScrapedContacts>(resolve => {
      globalTimeoutHandle = setTimeout(async () => {
        console.error(`⏰ [URL-SCRAPER] TIMEOUT GLOBAL (${GLOBAL_TIMEOUT_MS / 1000}s) para: ${url}`);
        try {
          if (page && !page.isClosed()) {
            await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 3000 }).catch(() => {});
            await page.close().catch(() => {});
          }
        } catch {}
        try {
          await this.closeBrowser();
        } catch {}

        resolve({
          emails: [],
          phones: [],
          whatsapp_phones: [],
          success: false,
          error: `Timeout global de ${GLOBAL_TIMEOUT_MS / 1000}s ao processar ${url}`,
        });
      }, GLOBAL_TIMEOUT_MS);
    });

    const scrapePromise = (async (): Promise<ScrapedContacts> => {
      try {
        console.log(`🔍 [URL-SCRAPER] Scraping: ${url}`);

        const browser = await this.getBrowser();
        page = await browser.newPage();

        // Timeouts agressivos para evitar travamentos
        page.setDefaultNavigationTimeout(15000);
        page.setDefaultTimeout(8000);

        // Bloquear recursos pesados e trackers que seguram navegação
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          const resourceType = request.resourceType();
          const reqUrl = request.url();
          if (['image', 'stylesheet', 'font', 'media', 'websocket'].includes(resourceType)) {
            request.abort();
            return;
          }
          const blockedDomains = [
            'google-analytics.com', 'googletagmanager.com', 'facebook.net',
            'doubleclick.net', 'hotjar', 'clarity.ms', 'tiktok.com',
            'snap.com', 'pinterest.com'
          ];
          if (blockedDomains.some(domain => reqUrl.includes(domain))) {
            request.abort();
            return;
          }
          request.continue();
        });

        // Evitar diálogos que travam a execução (alert/confirm)
        page.on('dialog', async dialog => {
          try { await dialog.dismiss(); } catch {}
        });

        // Set user agent to avoid bot detection
        await page.setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // Navigate to main URL with retry for slow sites
        console.log(`🌐 [URL-SCRAPER] Navegando para: ${url}`);
        const NAV_TIMEOUT_MS = 30000; // Aumentado para 30s (sites edu/gov são lentos)
        let navSuccess = false;

        for (let attempt = 1; attempt <= 2 && !navSuccess; attempt++) {
          try {
            const navigation = page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
            const navTimeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Timeout: navegação > ${NAV_TIMEOUT_MS}ms`)), NAV_TIMEOUT_MS)
            );
            await Promise.race([navigation, navTimeout]);
            navSuccess = true;
            console.log(`✅ [URL-SCRAPER] Página carregada com sucesso (tentativa ${attempt})`);
          } catch (navError: any) {
            console.error(`❌ [URL-SCRAPER] Erro ao navegar (tentativa ${attempt}): ${navError.message}`);
            if (attempt === 2) {
              try {
                await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 3000 });
              } catch {}
              throw new Error(`Falha ao carregar URL após 2 tentativas: ${navError.message}`);
            }
            // Aguardar antes de retry
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        await page.waitForSelector('body', { timeout: 10000 });
        console.log(`✅ [URL-SCRAPER] Body encontrado`);

        // Aguardar render mínimo para pegar links dinâmicos
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(`✅ [URL-SCRAPER] Aguardou renderização`);

        // Extract from main page com timeout de 10s
        const contentTimeout = 10000;
        const timeoutError = new Error('Timeout: extração de conteúdo demorou mais de 10s');

        const htmlPromise = page.content();
        const html = await Promise.race([
          htmlPromise,
          new Promise<string>((_, reject) => setTimeout(() => reject(timeoutError), contentTimeout))
        ]);
        console.log(`✅ [URL-SCRAPER] HTML extraído (${html.length} chars)`);

        const textPromise = page.evaluate(() => (document as any).body.innerText || '');
        const visibleText = await Promise.race([
          textPromise,
          new Promise<string>((_, reject) => setTimeout(() => reject(timeoutError), contentTimeout))
        ]);
        console.log(`✅ [URL-SCRAPER] Texto extraído (${visibleText.length} chars)`);

        const sources: any = { main_page: false, whatsapp_links: false, facebook: false, youtube: false };

        // 1. Extract emails from HTML
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emailMatches = html.match(emailRegex) || [];

        const validEmails = emailMatches.filter((email) => {
          const lower = email.toLowerCase();
          return (
            !lower.includes('example.com') &&
            !lower.includes('test.com') &&
            !lower.includes('sentry.io') &&
            !lower.includes('facebook.com') &&
            !lower.includes('instagram.com') &&
            !lower.includes('yourdomain.com') &&
            !lower.includes('placeholder') &&
            !lower.endsWith('.png') &&
            !lower.endsWith('.jpg') &&
            !lower.endsWith('.svg') &&
            !lower.endsWith('.gif')
          );
        });

        // 2. Extract WhatsApp phones from links
        const whatsappPhones = this.extractWhatsAppPhones(html);
        console.log(`🔍 [DEBUG] WhatsApp phones: ${whatsappPhones.length} encontrados`);
        if (whatsappPhones.length > 0) sources.whatsapp_links = true;

        // 3. Extract phones from visible text WITH context
        const textResult = this.extractPhonesFromText(visibleText);
        const textPhones = textResult.phones;
        const whatsappContextPhones = textResult.whatsappContext;
        console.log(`🔍 [DEBUG] Text phones: ${textPhones.length} encontrados (${whatsappContextPhones.length} com contexto WhatsApp)`);

        // 4. Extract phones from HTML WITHOUT context (catch phones in page data)
        const phoneRegex = /\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}/g;
        const htmlPhones = html.match(phoneRegex) || [];
        console.log(`🔍 [DEBUG] HTML phones extraídos: ${htmlPhones.length} encontrados`);

        // 5. Extract WhatsApp phones from HTML WITH context (NEW)
        const htmlWhatsAppContext = this.extractWhatsAppFromHtmlContext(html);
        console.log(`🔍 [DEBUG] HTML WhatsApp com contexto: ${htmlWhatsAppContext.length} encontrados`);

        // Clean all phones
        const cleanedWhatsApp = whatsappPhones.map(p => p.replace(/[^0-9]/g, ''));
        const cleanedText = textPhones.map(p => p.replace(/[^0-9]/g, ''));
        const cleanedHtml = htmlPhones.map(p => p.replace(/[^0-9]/g, ''));
        const cleanedWhatsAppContext = whatsappContextPhones.map(p => p.replace(/[^0-9]/g, ''));
        const cleanedHtmlWhatsAppContext = htmlWhatsAppContext.map(p => p.replace(/[^0-9]/g, ''));

        // Remove duplicatas em cada categoria
        const uniqueWhatsApp = [...new Set(cleanedWhatsApp)];
        const uniqueText = [...new Set(cleanedText)];
        const uniqueHtml = [...new Set(cleanedHtml)];
        const uniqueWhatsAppContext = [...new Set(cleanedWhatsAppContext)];
        const uniqueHtmlWhatsAppContext = [...new Set(cleanedHtmlWhatsAppContext)];

        // Validar com PRIORIDADE: WhatsApp links > WhatsApp contexto > Text > HTML
        const allPhonesSet = new Set<string>();
        const whatsAppPhonesValidated: string[] = [];  // WhatsApp phones separados

        // 1. Primeiro WhatsApp links (prioridade máxima)
        for (const phone of uniqueWhatsApp) {
          if (this.isValidBrazilianPhone(phone)) {
            const normalized = this.normalizePhone(phone);
            allPhonesSet.add(normalized);
            whatsAppPhonesValidated.push(normalized);
          }
        }

        // 2. WhatsApp por contexto de texto visível (palavras/emojis)
        for (const phone of uniqueWhatsAppContext) {
          if (this.isValidBrazilianPhone(phone)) {
            const normalized = this.normalizePhone(phone);
            allPhonesSet.add(normalized);
            if (!whatsAppPhonesValidated.includes(normalized)) {
              whatsAppPhonesValidated.push(normalized);
              console.log(`   ✅ [TEXT-CONTEXT] WhatsApp adicionado por contexto texto: ${normalized}`);
            }
          }
        }

        // 2.5 WhatsApp por contexto de HTML (palavras/emojis próximos ao telefone)
        for (const phone of uniqueHtmlWhatsAppContext) {
          if (this.isValidBrazilianPhone(phone)) {
            const normalized = this.normalizePhone(phone);
            allPhonesSet.add(normalized);
            if (!whatsAppPhonesValidated.includes(normalized)) {
              whatsAppPhonesValidated.push(normalized);
              console.log(`   ✅ [HTML-CONTEXT] WhatsApp adicionado por contexto HTML: ${normalized}`);
            }
          }
        }

        // 3. Depois text phones com contexto genérico
        for (const phone of uniqueText) {
          if (this.isValidBrazilianPhone(phone)) {
            allPhonesSet.add(this.normalizePhone(phone));
          }
        }

        // 4. Por último HTML phones
        for (const phone of uniqueHtml) {
          if (this.isValidBrazilianPhone(phone)) {
            allPhonesSet.add(this.normalizePhone(phone));
          }
        }

        const allPhones = [...allPhonesSet];

        console.log(`✅ [DEBUG] Phones validados: ${allPhones.length} (${whatsAppPhonesValidated.length} WhatsApp)`);

        let allEmails = [...validEmails];

        if (allPhones.length > 0 || allEmails.length > 0) {
          sources.main_page = true;
          console.log(`✅ [URL-SCRAPER] Contato encontrado na página principal! Pulando redes sociais.`);
        } else {
          // ========================================
          // LINK AGGREGATORS (linktr.ee, beacons.ai, linkin.bio)
          // ========================================
          console.log(`🔍 [URL-SCRAPER] Sem contato na página principal. Verificando agregadores de links...`);

        // Detect and process Linktr.ee
        if (url.includes('linktr.ee')) {
          console.log(`✅ [URL-SCRAPER] Linktr.ee detectado!`);
          const linktreeResult = await this.scrapeLinktrPage(page, url, options);
          allEmails.push(...linktreeResult.emails);
          allPhones.push(...linktreeResult.phones);
          // Adicionar phones do linktr.ee ao whatsappPhones para incluir em whatsapp_phones
          whatsappPhones.push(...linktreeResult.phones);
          if (linktreeResult.emails.length > 0 || linktreeResult.phones.length > 0) {
            sources.linktr = true;
            console.log(`✅ [URL-SCRAPER] Contato encontrado no Linktr.ee! Pulando redes sociais.`);
            }
          }

          // Detect and process Beacons.ai
        else if (url.includes('beacons.ai')) {
          console.log(`✅ [URL-SCRAPER] Beacons.ai detectado!`);
          const beaconsResult = await this.scrapeBeaconsPage(page, url, options);
          allEmails.push(...beaconsResult.emails);
          allPhones.push(...beaconsResult.phones);
          // Adicionar phones do beacons.ai ao whatsappPhones para incluir em whatsapp_phones
          whatsappPhones.push(...beaconsResult.phones);
          if (beaconsResult.emails.length > 0 || beaconsResult.phones.length > 0) {
            sources.beacons = true;
            console.log(`✅ [URL-SCRAPER] Contato encontrado no Beacons.ai! Pulando redes sociais.`);
            }
          }

          // Detect and process Linkin.bio
        else if (url.includes('linkin.bio')) {
          console.log(`✅ [URL-SCRAPER] Linkin.bio detectado!`);
          const linkinResult = await this.scrapeLinkinBioPage(page, url, options);
          allEmails.push(...linkinResult.emails);
          allPhones.push(...linkinResult.phones);
          // Adicionar phones do linkin.bio ao whatsappPhones para incluir em whatsapp_phones
          whatsappPhones.push(...linkinResult.phones);
          if (linkinResult.emails.length > 0 || linkinResult.phones.length > 0) {
            sources.linkin = true;
            console.log(`✅ [URL-SCRAPER] Contato encontrado no Linkin.bio! Pulando redes sociais.`);
            }
          }

          // ========================================
          // FALLBACK: Facebook and YouTube
          // ========================================
          // Only try Facebook/YouTube if no contacts found in aggregators
          if (allPhones.length === 0 && allEmails.length === 0) {
          // 4. Extract Facebook link and scrape
          const facebookRegex = /(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.com)\/([a-zA-Z0-9._-]+)/;
          const facebookMatch = html.match(facebookRegex);

          console.log(`🔍 [URL-SCRAPER] Buscando link do Facebook...`);
          if (facebookMatch && facebookMatch[0]) {
            const facebookUrl = facebookMatch[0].startsWith('http') ? facebookMatch[0] : `https://${facebookMatch[0]}`;
            console.log(`✅ [URL-SCRAPER] Link do Facebook encontrado: ${facebookUrl}`);
            const fbResult = await this.scrapeFacebookPage(page, facebookUrl);
            console.log(`📊 [URL-SCRAPER] Facebook retornou: ${fbResult.emails.length} emails, ${fbResult.phones.length} telefones`);
            allEmails.push(...fbResult.emails);
            allPhones.push(...fbResult.phones);
            if (fbResult.emails.length > 0 || fbResult.phones.length > 0) {
              sources.facebook = true;
              console.log(`✅ [URL-SCRAPER] Contato encontrado no Facebook! Pulando YouTube.`);
            } else {
              console.log(`⚠️  [URL-SCRAPER] Facebook não retornou contatos, tentando YouTube...`);

              // 5. Extract YouTube link and scrape
              const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:c\/|channel\/|user\/|@)?([a-zA-Z0-9._-]+)|youtu\.be\/([a-zA-Z0-9._-]+))/;
              const youtubeMatch = html.match(youtubeRegex);

              console.log(`🔍 [URL-SCRAPER] Buscando link do YouTube...`);
              if (youtubeMatch && youtubeMatch[0]) {
                const youtubeUrl = youtubeMatch[0].startsWith('http') ? youtubeMatch[0] : `https://${youtubeMatch[0]}`;
                console.log(`✅ [URL-SCRAPER] Link do YouTube encontrado: ${youtubeUrl}`);
                const ytResult = await this.scrapeYouTubePage(page, youtubeUrl);
                console.log(`📊 [URL-SCRAPER] YouTube retornou: ${ytResult.emails.length} emails, ${ytResult.phones.length} telefones`);
                allEmails.push(...ytResult.emails);
                allPhones.push(...ytResult.phones);
                if (ytResult.emails.length > 0 || ytResult.phones.length > 0) sources.youtube = true;
              } else {
                console.log(`❌ [URL-SCRAPER] Nenhum link do YouTube encontrado`);
              }
            }
          } else {
            console.log(`❌ [URL-SCRAPER] Nenhum link do Facebook encontrado`);
          }
          } // Fim do if (allPhones.length === 0 && allEmails.length === 0) para Facebook/YouTube
        }

        // Cleanup
        if (page && !page.isClosed()) {
          await page.close();
        }

        // Remove duplicates
        const uniqueEmails = [...new Set(allEmails)];
        const uniquePhones = [...new Set(allPhones)];

        console.log(
          `✅ [URL-SCRAPER] Total: ${uniqueEmails.length} emails, ${uniquePhones.length} telefones`
        );
        console.log(`📊 [URL-SCRAPER] Fontes:`, sources);

        return {
          emails: uniqueEmails,
          phones: uniquePhones,
          whatsapp_phones: whatsAppPhonesValidated,  // WhatsApp phones normalizados separadamente
          success: true,
          sources,
          website_text: visibleText,
        };
      } catch (error: any) {
        console.error(`❌ [URL-SCRAPER] Erro ao scraping ${url}:`, error.message);
        console.error(`❌ [URL-SCRAPER] Stack trace:`, error.stack);

        // Ensure page cleanup
        if (page && !page.isClosed()) {
          try {
            await page.close();
          } catch (closeError) {
            console.error('⚠️ [URL-SCRAPER] Erro ao fechar página:', closeError);
          }
        }

        return {
          emails: [],
          phones: [],
          whatsapp_phones: [],
          success: false,
          error: error.message,
        };
      }
    })();

    const result = await Promise.race([scrapePromise, watchdogPromise]);

    if (globalTimeoutHandle) {
      clearTimeout(globalTimeoutHandle);
    }

    return result;
  }

  /**
   * Close browser instance and cleanup resources
   * Safe to call multiple times
   */
  static async closeBrowser(): Promise<void> {
    try {
      if (this.cleanupTimer) {
        clearTimeout(this.cleanupTimer);
        this.cleanupTimer = null;
      }

      if (this.browser && this.browser.isConnected()) {
        console.log('🛑 [URL-SCRAPER] Fechando browser...');
        await this.browser.close();
        this.browser = null;
        console.log('✅ [URL-SCRAPER] Browser fechado com sucesso');
      }
    } catch (error: any) {
      console.error('❌ [URL-SCRAPER] Erro ao fechar browser:', error.message);
      this.browser = null; // Force reset
    }
  }

  /**
   * Scrape multiple URLs in sequence with delay between requests
   * @param urls - Array of URLs to scrape
   * @param delayMs - Delay between requests in milliseconds (default: 2000ms)
   * @returns Map of URL to ScrapedContacts results
   */
  static async scrapeMultipleUrls(
    urls: string[],
    delayMs: number = 2000
  ): Promise<Map<string, ScrapedContacts>> {
    const results = new Map<string, ScrapedContacts>();

    console.log(`📋 [URL-SCRAPER] Iniciando scraping de ${urls.length} URLs...`);

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[${i + 1}/${urls.length}] Scraping: ${url}`);

      try {
        const result = await this.scrapeUrl(url);
        results.set(url, result);
      } catch (error: any) {
        console.error(`❌ [URL-SCRAPER] Erro na URL ${url}:`, error.message);
        results.set(url, {
          emails: [],
          phones: [],
          whatsapp_phones: [],
          success: false,
          error: error.message
        });
      }

      // Delay between requests to avoid rate limiting
      if (i < urls.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    console.log(`✅ [URL-SCRAPER] Scraping completo: ${results.size} URLs processadas`);
    return results;
  }
}
