/**
 * WhatsApp QR Code Extractor Service
 *
 * Extrai números WhatsApp de links wa.me/qr/CODE usando browser visível (headless=false)
 * QR codes não renderizam corretamente em modo headless
 *
 * Executado via cron às 2:15 AM
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface WhatsAppExtraction {
  number: string;
  source: 'website_wa_me';
  extracted_at: string;
}

export class WhatsAppQrExtractorService {
  private static browser: Browser | null = null;
  private static readonly BATCH_SIZE = 20;
  private static readonly DELAY_BETWEEN_EXTRACTIONS = 3000; // 3s

  /**
   * Inicia browser em modo visível (headless=false)
   */
  private static async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      console.log('🌐 [QR-EXTRACTOR] Iniciando browser visível (headless=false)...');
      this.browser = await puppeteer.launch({
        headless: false, // IMPORTANTE: QR code precisa de browser visível
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1280,800'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Fecha o browser
   */
  static async closeBrowser(): Promise<void> {
    if (this.browser) {
      console.log('🛑 [QR-EXTRACTOR] Fechando browser...');
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  /**
   * Normaliza telefone para formato brasileiro
   */
  private static normalizePhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('55') && cleaned.length >= 12) {
      return cleaned;
    }
    if (cleaned.length >= 10 && cleaned.length <= 11) {
      return '55' + cleaned;
    }
    return cleaned;
  }

  /**
   * Valida se é número brasileiro válido
   */
  private static isValidBrazilNumber(number: string): boolean {
    return number.startsWith('55') && number.length >= 12 && number.length <= 13;
  }

  /**
   * Extrai número WhatsApp de wa.me/qr/CODE via screenshot e decodificação
   */
  private static async extractFromQrPage(url: string): Promise<string | null> {
    let page: Page | null = null;

    // User-agent de iPhone para forçar WhatsApp a mostrar o QR code
    const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Simular dispositivo mobile
      await page.setUserAgent(MOBILE_USER_AGENT);
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      page.setDefaultNavigationTimeout(20000);
      page.setDefaultTimeout(10000);

      console.log(`   🔍 Navegando para: ${url} (mobile mode)`);

      // Interceptar respostas para capturar redirects
      let capturedPhone: string | null = null;
      page.on('response', async (response) => {
        const responseUrl = response.url();
        // Procurar número no URL de redirect
        const phoneMatch = responseUrl.match(/wa\.me\/(\d{10,15})|phone=(\d{10,15})|send\/?\?phone=(\d{10,15})/i);
        if (phoneMatch) {
          const phone = phoneMatch[1] || phoneMatch[2] || phoneMatch[3];
          if (phone) {
            capturedPhone = this.normalizePhone(phone);
            console.log(`   📡 Número capturado do redirect: ${capturedPhone}`);
          }
        }
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

      // Verificar se capturamos do redirect
      if (capturedPhone && this.isValidBrazilNumber(capturedPhone)) {
        console.log(`   ✅ Número extraído do redirect: ${capturedPhone}`);
        await page.close().catch(() => {});
        return capturedPhone;
      }

      // Aguardar renderização
      await new Promise(r => setTimeout(r, 3000));

      // Verificar URL final (pode ter o número)
      const finalUrl = page.url();
      const urlPhoneMatch = finalUrl.match(/wa\.me\/(\d{10,15})|phone=(\d{10,15})/i);
      if (urlPhoneMatch) {
        const phone = urlPhoneMatch[1] || urlPhoneMatch[2];
        if (phone) {
          const normalized = this.normalizePhone(phone);
          if (this.isValidBrazilNumber(normalized)) {
            console.log(`   ✅ Número encontrado na URL final: ${normalized}`);
            await page.close().catch(() => {});
            return normalized;
          }
        }
      }

      // ESTRATÉGIA 1: Tentar extrair do HTML (às vezes o número está escondido)
      const pageContent = await page.content();
      const contentMatch = pageContent.match(/wa\.me\/\+?(\d{10,15})|"phone":\s*"\+?(\d{10,15})"|phone=\+?(\d{10,15})/i);
      if (contentMatch) {
        const phoneNumber = contentMatch[1] || contentMatch[2] || contentMatch[3];
        if (phoneNumber) {
          const normalized = this.normalizePhone(phoneNumber);
          if (this.isValidBrazilNumber(normalized)) {
            console.log(`   ✅ Número encontrado no HTML: ${normalized}`);
            await page.close().catch(() => {});
            return normalized;
          }
        }
      }

      // ESTRATÉGIA 2: Screenshot e decodificar QR
      console.log(`   📷 Fazendo screenshot para decodificar QR...`);
      const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false }) as Buffer;

      // Decodificar PNG
      const png = PNG.sync.read(screenshotBuffer);
      const { width, height, data } = png;

      // Decodificar QR code
      const decoded = jsQR(new Uint8ClampedArray(data), width, height);

      if (decoded && decoded.data) {
        console.log(`   📱 QR decodificado: ${decoded.data.substring(0, 60)}...`);

        // Extrair número do conteúdo do QR
        const phoneMatch = decoded.data.match(/wa\.me\/\+?(\d{10,15})|tel:\+?(\d{10,15})|phone=\+?(\d{10,15})|(\d{12,13})/i);

        if (phoneMatch) {
          const phoneNumber = phoneMatch[1] || phoneMatch[2] || phoneMatch[3] || phoneMatch[4];
          if (phoneNumber) {
            const normalized = this.normalizePhone(phoneNumber);
            if (this.isValidBrazilNumber(normalized)) {
              console.log(`   ✅ Número extraído do QR: ${normalized}`);
              await page.close().catch(() => {});
              return normalized;
            }
          }
        }
      }

      console.log(`   ⚠️ QR não pôde ser decodificado`);
      await page.close().catch(() => {});
      return null;

    } catch (error: any) {
      console.error(`   ❌ Erro: ${error.message}`);
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
      return null;
    }
  }

  /**
   * Processa todos os leads com wa.me/qr pendentes
   */
  static async processAllQrLinks(): Promise<{ processed: number; updated: number; failed: number }> {
    console.log('\n🚀 [QR-EXTRACTOR] Iniciando extração de wa.me/qr links...\n');

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    let hasMore = true;
    let lastCreatedAt = '1970-01-01T00:00:00Z';

    try {
      while (hasMore) {
        // Buscar leads com wa.me/qr sem whatsapp_number
        const { data: leads, error } = await supabase
          .from('instagram_leads')
          .select('id, username, website, created_at')
          .is('whatsapp_number', null)
          .ilike('website', '%wa.me/qr/%')
          .gt('created_at', lastCreatedAt)
          .order('created_at', { ascending: true })
          .limit(this.BATCH_SIZE);

        if (error) {
          console.error('❌ Erro ao buscar leads:', error.message);
          break;
        }

        if (!leads || leads.length === 0) {
          hasMore = false;
          break;
        }

        console.log(`📦 Processando ${leads.length} leads com wa.me/qr...`);

        for (const lead of leads) {
          totalProcessed++;
          lastCreatedAt = lead.created_at;

          console.log(`\n[${totalProcessed}] @${lead.username}`);

          const number = await this.extractFromQrPage(lead.website);

          if (number) {
            const now = new Date().toISOString();
            const verified: WhatsAppExtraction[] = [{
              number,
              source: 'website_wa_me',
              extracted_at: now
            }];

            const { error: updateError } = await supabase
              .from('instagram_leads')
              .update({
                whatsapp_number: number,
                whatsapp_source: 'website_wa_me',
                whatsapp_verified: verified,
                url_enriched: true
              })
              .eq('id', lead.id);

            if (updateError) {
              console.log(`   ❌ Erro ao persistir: ${updateError.message}`);
              totalFailed++;
            } else {
              console.log(`   💾 Persistido: ${number}`);
              totalUpdated++;
            }
          } else {
            totalFailed++;
          }

          // Delay entre extrações
          await new Promise(r => setTimeout(r, this.DELAY_BETWEEN_EXTRACTIONS));
        }
      }

    } finally {
      await this.closeBrowser();
    }

    console.log('\n========================================');
    console.log('📊 RESUMO - EXTRAÇÃO QR CODE');
    console.log('========================================');
    console.log(`Total processados: ${totalProcessed}`);
    console.log(`Total atualizados: ${totalUpdated}`);
    console.log(`Total falhas:      ${totalFailed}`);
    console.log('========================================\n');

    return { processed: totalProcessed, updated: totalUpdated, failed: totalFailed };
  }
}

// Export para uso direto
export const processQrLinks = () => WhatsAppQrExtractorService.processAllQrLinks();
