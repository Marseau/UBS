/**
 * Utilitário para extração de números WhatsApp de URLs e Bio
 * Aplicado no momento do scrape para persistência imediata
 */

import { Page } from 'puppeteer';

export interface WhatsAppExtraction {
  number: string;
  source: 'website_wa_me' | 'bio';
  extracted_at: string;
}

export interface ExtractedWhatsApp {
  whatsapp_number: string | null;
  whatsapp_source: string | null;
  whatsapp_verified: WhatsAppExtraction[];
}

/**
 * Verifica se a URL é um link wa.me/message/CODE
 */
export function isWaMessageLink(url: string | null | undefined): boolean {
  if (!url) return false;
  return /wa\.me\/message\/[A-Za-z0-9]+/i.test(url);
}

/**
 * Extrai número WhatsApp de URL wa.me
 * Formatos suportados:
 * - https://wa.me/5551981158802
 * - https://wa.me/+5551981158802
 * - https://api.whatsapp.com/send?phone=5551981158802
 * - wa.me/5551981158802
 */
export function extractWhatsAppFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Padrão wa.me/NUMERO (com ou sem +)
  const waMatch = url.match(/wa\.me\/\+?(\d{10,15})/);
  if (waMatch && waMatch[1]) {
    return waMatch[1];
  }

  // Padrão api.whatsapp.com/send?phone=NUMERO
  const apiMatch = url.match(/api\.whatsapp\.com\/send\/?.*phone=\+?(\d{10,15})/);
  if (apiMatch && apiMatch[1]) {
    return apiMatch[1];
  }

  return null;
}

/**
 * Extrai número WhatsApp de wa.me/message/CODE via navegação
 * Requer uma página Puppeteer já aberta para navegar
 *
 * @param page - Página Puppeteer para navegar
 * @param url - URL wa.me/message/CODE
 * @returns Número extraído ou null
 */
export async function extractWhatsAppFromMessageLink(page: Page, url: string): Promise<string | null> {
  try {
    console.log(`   📱 [WA-EXTRACT] Navegando para wa.me/message...`);

    // Capturar redirects
    let redirectedUrl = '';
    const responseHandler = (response: any) => {
      const status = response.status();
      if (status >= 300 && status < 400) {
        const location = response.headers()['location'];
        if (location) {
          redirectedUrl = location;
        }
      }
    };

    page.on('response', responseHandler);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (navError: any) {
      // Timeout é ok, podemos tentar extrair mesmo assim
      if (!navError.message.includes('timeout')) {
        throw navError;
      }
    }

    // Remover listener
    page.off('response', responseHandler);

    // Verificar URL final e redirect
    const finalUrl = page.url();
    const urlToCheck = redirectedUrl || finalUrl;

    // Tentar extrair número da URL final
    const phoneMatch = urlToCheck.match(/wa\.me\/\+?(\d{10,15})|phone=\+?(\d{10,15})/i);
    if (phoneMatch) {
      const phoneNumber = phoneMatch[1] || phoneMatch[2];
      if (phoneNumber) {
        const normalized = normalizePhone(phoneNumber);
        if (isValidBrazilNumber(normalized)) {
          console.log(`   ✅ [WA-EXTRACT] Número extraído do redirect: ${normalized}`);
          return normalized;
        }
      }
    }

    // Tentar extrair do conteúdo da página
    const pageContent = await page.content();
    const contentMatch = pageContent.match(/wa\.me\/\+?(\d{10,15})|"phone":\s*"\+?(\d{10,15})"|phone=\+?(\d{10,15})/i);
    if (contentMatch) {
      const phoneNumber = contentMatch[1] || contentMatch[2] || contentMatch[3];
      if (phoneNumber) {
        const normalized = normalizePhone(phoneNumber);
        if (isValidBrazilNumber(normalized)) {
          console.log(`   ✅ [WA-EXTRACT] Número extraído do conteúdo: ${normalized}`);
          return normalized;
        }
      }
    }

    console.log(`   ⚠️ [WA-EXTRACT] Número não encontrado em wa.me/message`);
    return null;

  } catch (error: any) {
    console.error(`   ❌ [WA-EXTRACT] Erro ao extrair de wa.me/message: ${error.message}`);
    return null;
  }
}

/**
 * Normaliza telefone para formato brasileiro
 */
function normalizePhone(phone: string): string {
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
 * Extrai número WhatsApp da bio do Instagram
 * No Brasil, número na bio comercial = WhatsApp (cultura local)
 * Extrai QUALQUER telefone brasileiro válido
 */
export function extractWhatsAppFromBio(bio: string | null | undefined): string | null {
  if (!bio) return null;

  // 1. Procurar links wa.me na bio (prioridade máxima)
  const waLinkMatch = bio.match(/wa\.me\/(\d{10,15})/);
  if (waLinkMatch && waLinkMatch[1]) {
    return waLinkMatch[1];
  }

  // 2. Extrair QUALQUER telefone brasileiro válido (cultura BR: bio = WhatsApp)
  // Formatos suportados:
  // - 55 51 98115-8802, 5551981158802
  // - +55 (51) 98115-8802, +55 51 981158802
  // - (51) 98115-8802, (51) 9 8115-8802
  // - 51 98115-8802, 51 9 8115-8802
  const phonePatterns = [
    /\+?55\s*\(?\d{2}\)?\s*9?\s*\d{4}[\s.-]?\d{4}/g,  // +55 (XX) 9XXXX-XXXX
    /55\s*\d{2}\s*9?\s*\d{4}[\s.-]?\d{4}/g,           // 55 XX 9XXXX-XXXX
    /\(?\d{2}\)?\s*9\s*\d{4}[\s.-]?\d{4}/g,           // (XX) 9 XXXX-XXXX
    /\(?\d{2}\)?\s*9\d{4}[\s.-]?\d{4}/g,              // (XX) 9XXXX-XXXX
  ];

  for (const pattern of phonePatterns) {
    const matches = bio.match(pattern);
    if (matches && matches[0]) {
      // Limpar e normalizar
      const cleaned = matches[0].replace(/\D/g, '');
      // Adicionar 55 se não tiver
      const normalized = cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
      // Validar formato Brasil (12-13 dígitos)
      if (normalized.length >= 12 && normalized.length <= 13) {
        return normalized;
      }
    }
  }

  return null;
}

/**
 * Valida se o número está em formato Brasil válido
 */
export function isValidBrazilNumber(number: string): boolean {
  return number.startsWith('55') && number.length >= 12 && number.length <= 13;
}

/**
 * Extrai WhatsApp de website e bio, retornando dados prontos para persistência
 */
export function extractWhatsAppForPersistence(
  website: string | null | undefined,
  bio: string | null | undefined,
  phone: string | null | undefined
): ExtractedWhatsApp {
  const now = new Date().toISOString();
  const verified: WhatsAppExtraction[] = [];
  let primaryNumber: string | null = null;
  let primarySource: string | null = null;

  // 1. Tentar extrair do website (prioridade máxima)
  const fromWebsite = extractWhatsAppFromUrl(website);
  if (fromWebsite && isValidBrazilNumber(fromWebsite)) {
    verified.push({
      number: fromWebsite,
      source: 'website_wa_me',
      extracted_at: now
    });
    primaryNumber = fromWebsite;
    primarySource = 'website_wa_me';
    console.log(`   📱 [WA-EXTRACT] WhatsApp extraído do website: ${fromWebsite}`);
  }

  // 2. Tentar extrair da bio
  const fromBio = extractWhatsAppFromBio(bio);
  if (fromBio && isValidBrazilNumber(fromBio)) {
    // Verificar se já não foi extraído do website
    const alreadyExists = verified.some(v => v.number === fromBio);
    if (!alreadyExists) {
      verified.push({
        number: fromBio,
        source: 'bio',
        extracted_at: now
      });
      // Se não temos número primário, usar este
      if (!primaryNumber) {
        primaryNumber = fromBio;
        primarySource = 'bio';
      }
      console.log(`   📱 [WA-EXTRACT] WhatsApp extraído da bio: ${fromBio}`);
    }
  }

  // 3. Verificar se o telefone extraído tem formato WhatsApp Brasil
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    const normalizedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    if (isValidBrazilNumber(normalizedPhone)) {
      const alreadyExists = verified.some(v => v.number === normalizedPhone);
      if (!alreadyExists) {
        // Phone extraído por regex genérico - menor certeza, não adicionar ao verified
        // Mas se não temos número primário, usar este
        if (!primaryNumber) {
          primaryNumber = normalizedPhone;
          primarySource = 'phone_extracted';
          console.log(`   📱 [WA-EXTRACT] Telefone normalizado (não verificado): ${normalizedPhone}`);
        }
      }
    }
  }

  return {
    whatsapp_number: primaryNumber,
    whatsapp_source: primarySource,
    whatsapp_verified: verified
  };
}
