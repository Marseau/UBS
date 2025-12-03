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
  success: boolean;
  error?: string;
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

        this.doScrapeUrl(item.url)
          .then(result => {
            this.activeScrapers--;
            this.setCachedResult(item.url, result); // Salvar no cache
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
      phones.push(match[1]);
    }

    // api.whatsapp.com/send?phone=5548999998888 OR api.whatsapp.com/send/?phone=5548999998888
    const apiWhatsAppRegex = /api\.whatsapp\.com\/send\/?\?phone=(\d{10,15})/g;
    while ((match = apiWhatsAppRegex.exec(html)) !== null) {
      phones.push(match[1]);
    }

    return phones;
  }

  /**
   * Extract phones from visible text using contextual keywords
   * Only extracts phones near keywords like "telefone", "contato", "whatsapp", etc.
   * @param visibleText - Visible text from page
   * @returns Array of phone numbers found with context
   */
  private static extractPhonesFromText(visibleText: string): string[] {
    const contextKeywords = [
      'telefone', 'tel', 'whatsapp', 'wpp', 'contato', 'fone',
      'celular', 'ligar', 'chamar', 'phone', 'contact', 'call', 'fale'
    ];

    const phoneMatches: string[] = [];
    const lines = visibleText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ? lines[i].toLowerCase() : '';
      const hasContext = contextKeywords.some(keyword => line.includes(keyword));

      if (hasContext && lines[i]) {
        const phoneRegex = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)(?:9\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{4})/g;
        const matches = lines[i].match(phoneRegex);
        if (matches) phoneMatches.push(...matches);
      }
    }

    return phoneMatches;
  }

  /**
   * Validate Brazilian phone number format
   * @param phone - Phone number string (can contain formatting)
   * @returns true if valid Brazilian phone (10-11 digits, valid area code)
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
      const textPhones = this.extractPhonesFromText(visibleText);

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
  private static async scrapeLinktrPage(page: Page, linktreeUrl: string): Promise<{ emails: string[]; phones: string[] }> {
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

      // 3. Visitar até 5 links (priorizar WhatsApp e sites próprios)
      const prioritizedLinks = links.filter(link =>
        link.includes('wa.me') || link.includes('whatsapp')
      ).concat(links.filter(link =>
        !link.includes('wa.me') && !link.includes('whatsapp') &&
        !link.includes('instagram.com') && !link.includes('facebook.com') &&
        !link.includes('youtube.com') && !link.includes('tiktok.com')
      ));

      for (let i = 0; i < Math.min(prioritizedLinks.length, 5); i++) {
        const link = prioritizedLinks[i];
        try {
          console.log(`    🔍 [LINKTR.EE] Visitando link ${i + 1}/5: ${link}`);

          // Se for WhatsApp, extrair diretamente
          if (link.includes('wa.me') || link.includes('whatsapp')) {
            const waPhones = this.extractWhatsAppPhones(link);
            phones.push(...waPhones.map(p => p.replace(/[^0-9]/g, '')));
            continue;
          }

          // Navegar para o link
          await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await new Promise(resolve => setTimeout(resolve, 1500));

          const linkHtml = await page.content();
          const linkText = await page.evaluate(() => (document as any).body.innerText);

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

        } catch (linkError: any) {
          console.log(`    ⚠️  [LINKTR.EE] Erro no link ${i + 1}: ${linkError.message}`);
        }
      }

      // Validar telefones
      const validPhones = phones.filter(p => this.isValidBrazilianPhone(p));
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
  private static async scrapeBeaconsPage(page: Page, beaconsUrl: string): Promise<{ emails: string[]; phones: string[] }> {
    try {
      console.log(`  🔦 [BEACONS.AI] Navegando para: ${beaconsUrl}`);
      await page.goto(beaconsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
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
          .filter(href => href && !href.includes('beacons.ai') && !href.includes('javascript:'));
      });

      console.log(`  🔗 [BEACONS.AI] Encontrados ${links.length} links para processar`);

      // 3. Visitar até 5 links (mesma lógica do linktr.ee)
      const prioritizedLinks = links.filter(link =>
        link.includes('wa.me') || link.includes('whatsapp')
      ).concat(links.filter(link =>
        !link.includes('wa.me') && !link.includes('whatsapp') &&
        !link.includes('instagram.com') && !link.includes('facebook.com') &&
        !link.includes('youtube.com') && !link.includes('tiktok.com')
      ));

      for (let i = 0; i < Math.min(prioritizedLinks.length, 5); i++) {
        const link = prioritizedLinks[i];
        try {
          console.log(`    🔍 [BEACONS.AI] Visitando link ${i + 1}/5: ${link}`);

          if (link.includes('wa.me') || link.includes('whatsapp')) {
            const waPhones = this.extractWhatsAppPhones(link);
            phones.push(...waPhones.map(p => p.replace(/[^0-9]/g, '')));
            continue;
          }

          await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await new Promise(resolve => setTimeout(resolve, 1500));

          const linkHtml = await page.content();
          const linkText = await page.evaluate(() => (document as any).body.innerText);

          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const foundEmails = linkHtml.match(emailRegex) || [];
          emails.push(...foundEmails.filter(e =>
            !e.includes('example.com') && !e.includes('beacons.ai')
          ));

          const linkPhones = this.extractWhatsAppPhones(linkHtml);
          phones.push(...linkPhones.map(p => p.replace(/[^0-9]/g, '')));

          const textPhones = this.extractPhonesFromText(linkText);
          phones.push(...textPhones.map(p => p.replace(/[^0-9]/g, '')));

        } catch (linkError: any) {
          console.log(`    ⚠️  [BEACONS.AI] Erro no link ${i + 1}: ${linkError.message}`);
        }
      }

      const validPhones = phones.filter(p => this.isValidBrazilianPhone(p));
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
  private static async scrapeLinkinBioPage(page: Page, linkinUrl: string): Promise<{ emails: string[]; phones: string[] }> {
    try {
      console.log(`  🔗 [LINKIN.BIO] Navegando para: ${linkinUrl}`);
      await page.goto(linkinUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('body', { timeout: 10000 });

      const emails: string[] = [];
      const phones: string[] = [];

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

      // 3. Processar links
      const prioritizedLinks = links.filter(link =>
        link.includes('wa.me') || link.includes('whatsapp')
      ).concat(links.filter(link =>
        !link.includes('wa.me') && !link.includes('whatsapp') &&
        !link.includes('instagram.com') && !link.includes('facebook.com') &&
        !link.includes('youtube.com') && !link.includes('tiktok.com')
      ));

      for (let i = 0; i < Math.min(prioritizedLinks.length, 5); i++) {
        const link = prioritizedLinks[i];
        try {
          console.log(`    🔍 [LINKIN.BIO] Visitando link ${i + 1}/5: ${link}`);

          if (link.includes('wa.me') || link.includes('whatsapp')) {
            const waPhones = this.extractWhatsAppPhones(link);
            phones.push(...waPhones.map(p => p.replace(/[^0-9]/g, '')));
            continue;
          }

          await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await new Promise(resolve => setTimeout(resolve, 1500));

          const linkHtml = await page.content();
          const linkText = await page.evaluate(() => (document as any).body.innerText);

          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const foundEmails = linkHtml.match(emailRegex) || [];
          emails.push(...foundEmails.filter(e =>
            !e.includes('example.com') && !e.includes('linkin.bio')
          ));

          const linkPhones = this.extractWhatsAppPhones(linkHtml);
          phones.push(...linkPhones.map(p => p.replace(/[^0-9]/g, '')));

          const textPhones = this.extractPhonesFromText(linkText);
          phones.push(...textPhones.map(p => p.replace(/[^0-9]/g, '')));

        } catch (linkError: any) {
          console.log(`    ⚠️  [LINKIN.BIO] Erro no link ${i + 1}: ${linkError.message}`);
        }
      }

      const validPhones = phones.filter(p => this.isValidBrazilianPhone(p));
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
      const textPhones = this.extractPhonesFromText(visibleText);

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
  static async scrapeUrl(url: string): Promise<ScrapedContacts> {
    // 1. Normalizar URL
    const normalizedUrl = this.normalizeUrl(url);

    // 2. Verificar cache
    const cached = this.getCachedResult(normalizedUrl);
    if (cached) {
      return cached;
    }

    // 3. Se abaixo do limite, processar imediatamente
    if (this.activeScrapers < this.MAX_CONCURRENT_SCRAPERS) {
      this.activeScrapers++;
      console.log(`🔍 [URL-SCRAPER] Processando direto (${this.activeScrapers}/${this.MAX_CONCURRENT_SCRAPERS} ativos)`);

      try {
        const result = await this.doScrapeUrl(normalizedUrl);
        this.setCachedResult(normalizedUrl, result);
        return result;
      } finally {
        this.activeScrapers--;
        this.processQueue(); // Processar próximo da fila
      }
    }

    // 4. Se no limite, adicionar à fila
    console.log(`⏳ [URL-SCRAPER] Limite atingido, adicionando à fila (${this.scrapeQueue.length + 1} na fila)`);

    return new Promise((resolve, reject) => {
      this.scrapeQueue.push({ url: normalizedUrl, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Executa o scraping real (método interno)
   * @param url - URL normalizada para scrape
   */
  private static async doScrapeUrl(url: string): Promise<ScrapedContacts> {
    let page: Page | null = null;

    try {
      console.log(`🔍 [URL-SCRAPER] Scraping: ${url}`);

      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Set user agent to avoid bot detection
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Navigate to main URL with better error handling
      console.log(`🌐 [URL-SCRAPER] Navegando para: ${url}`);
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000, // 30 segundos (reduzido de 60s)
        });
        console.log(`✅ [URL-SCRAPER] Página carregada com sucesso`);
      } catch (navError: any) {
        console.error(`❌ [URL-SCRAPER] Erro ao navegar: ${navError.message}`);
        throw new Error(`Falha ao carregar URL: ${navError.message}`);
      }

      await page.waitForSelector('body', { timeout: 10000 });
      console.log(`✅ [URL-SCRAPER] Body encontrado`);

      // Wait for page to fully render (JavaScript, dynamic content, etc.)
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds delay
      console.log(`✅ [URL-SCRAPER] Aguardou renderização completa`);

      // Extract from main page
      const html = await page.content();
      const visibleText = await page.evaluate(() => (document as any).body.innerText);

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
      const textPhones = this.extractPhonesFromText(visibleText);
      console.log(`🔍 [DEBUG] Text phones: ${textPhones.length} encontrados`);

      // 4. Extract phones from HTML WITHOUT context (catch phones in page data)
      const phoneRegex = /\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}/g;
      const htmlPhones = html.match(phoneRegex) || [];
      console.log(`🔍 [DEBUG] HTML phones extraídos: ${htmlPhones.length} encontrados`);

      // Clean all phones
      const cleanedWhatsApp = whatsappPhones.map(p => p.replace(/[^0-9]/g, ''));
      const cleanedText = textPhones.map(p => p.replace(/[^0-9]/g, ''));
      const cleanedHtml = htmlPhones.map(p => p.replace(/[^0-9]/g, ''));

      // Remove duplicatas em cada categoria
      const uniqueWhatsApp = [...new Set(cleanedWhatsApp)];
      const uniqueText = [...new Set(cleanedText)];
      const uniqueHtml = [...new Set(cleanedHtml)];

      // Validar com PRIORIDADE: WhatsApp > Text > HTML (sem limite)
      const allPhonesSet = new Set<string>();

      // 1. Primeiro WhatsApp links (prioridade máxima)
      for (const phone of uniqueWhatsApp) {
        if (this.isValidBrazilianPhone(phone)) {
          allPhonesSet.add(phone);
        }
      }

      // 2. Depois text phones com contexto
      for (const phone of uniqueText) {
        if (this.isValidBrazilianPhone(phone)) {
          allPhonesSet.add(phone);
        }
      }

      // 3. Por último HTML phones
      for (const phone of uniqueHtml) {
        if (this.isValidBrazilianPhone(phone)) {
          allPhonesSet.add(phone);
        }
      }

      const allPhones = [...allPhonesSet];

      console.log(`✅ [DEBUG] Phones validados: ${allPhones.length} (WhatsApp sempre primeiro)`);

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
          const linktreeResult = await this.scrapeLinktrPage(page, url);
          allEmails.push(...linktreeResult.emails);
          allPhones.push(...linktreeResult.phones);
          if (linktreeResult.emails.length > 0 || linktreeResult.phones.length > 0) {
            sources.linktr = true;
            console.log(`✅ [URL-SCRAPER] Contato encontrado no Linktr.ee! Pulando redes sociais.`);
          }
        }

        // Detect and process Beacons.ai
        else if (url.includes('beacons.ai')) {
          console.log(`✅ [URL-SCRAPER] Beacons.ai detectado!`);
          const beaconsResult = await this.scrapeBeaconsPage(page, url);
          allEmails.push(...beaconsResult.emails);
          allPhones.push(...beaconsResult.phones);
          if (beaconsResult.emails.length > 0 || beaconsResult.phones.length > 0) {
            sources.beacons = true;
            console.log(`✅ [URL-SCRAPER] Contato encontrado no Beacons.ai! Pulando redes sociais.`);
          }
        }

        // Detect and process Linkin.bio
        else if (url.includes('linkin.bio')) {
          console.log(`✅ [URL-SCRAPER] Linkin.bio detectado!`);
          const linkinResult = await this.scrapeLinkinBioPage(page, url);
          allEmails.push(...linkinResult.emails);
          allPhones.push(...linkinResult.phones);
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
        success: true,
        sources
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
        success: false,
        error: error.message,
      };
    }
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
