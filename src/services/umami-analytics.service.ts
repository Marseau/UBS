/**
 * Umami Analytics Service
 * Envia eventos do backend para o Umami para tracking de API
 *
 * Eventos rastreados:
 * - Scraping: scrape-tag, scrape-url, scrape-profile, scrape-followers
 * - WhatsApp: message-received, message-sent, webhook-processed
 * - Leads: lead-created, lead-enriched, lead-converted
 * - Appointments: appointment-created, appointment-confirmed, appointment-cancelled
 * - System: api-error, rate-limit-hit, cache-hit, cache-miss
 */

import dotenv from 'dotenv';

dotenv.config();

interface UmamiEvent {
  name: string;
  data?: Record<string, string | number | boolean>;
}

interface UmamiPayload {
  payload: {
    hostname: string;
    language: string;
    referrer: string;
    screen: string;
    title: string;
    url: string;
    website: string;
    name?: string;
    data?: Record<string, string | number | boolean>;
  };
  type: 'event';
}

class UmamiAnalyticsService {
  private readonly baseUrl: string;
  private readonly websiteId: string;
  private readonly hostname: string;
  private readonly enabled: boolean;

  constructor() {
    this.baseUrl = process.env.UMAMI_URL || 'http://localhost:3001';
    this.websiteId = process.env.UMAMI_WEBSITE_ID || '';
    this.hostname = process.env.UMAMI_HOSTNAME || 'api.whatsappsalon.local';
    this.enabled = process.env.UMAMI_ENABLED === 'true' && !!this.websiteId;

    if (this.enabled) {
      console.log(`📊 [UMAMI] Analytics habilitado - ${this.baseUrl}`);
    } else {
      console.log(`📊 [UMAMI] Analytics desabilitado (configure UMAMI_ENABLED=true e UMAMI_WEBSITE_ID)`);
    }
  }

  /**
   * Envia evento para o Umami
   */
  async trackEvent(event: UmamiEvent): Promise<void> {
    if (!this.enabled) return;

    try {
      const payload: UmamiPayload = {
        type: 'event',
        payload: {
          hostname: this.hostname,
          language: 'pt-BR',
          referrer: '',
          screen: '1920x1080',
          title: event.name,
          url: `/api/${event.name.replace(/-/g, '/')}`,
          website: this.websiteId,
          name: event.name,
          data: event.data,
        },
      };

      const response = await fetch(`${this.baseUrl}/api/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'WhatsAppSalon-API/1.0',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.warn(`⚠️ [UMAMI] Erro ao enviar evento: ${response.status}`);
      }
    } catch (error: any) {
      // Silently fail - analytics shouldn't break the app
      console.warn(`⚠️ [UMAMI] Falha ao enviar evento: ${error.message}`);
    }
  }

  // ==========================================
  // EVENTOS DE SCRAPING
  // ==========================================

  async trackScrapeTag(searchTerm: string, profilesFound: number, success: boolean): Promise<void> {
    await this.trackEvent({
      name: 'scrape-tag',
      data: {
        search_term: searchTerm,
        profiles_found: profilesFound,
        success,
      },
    });
  }

  async trackScrapeUrl(url: string, emailsFound: number, phonesFound: number, cached: boolean): Promise<void> {
    await this.trackEvent({
      name: 'scrape-url',
      data: {
        domain: new URL(url).hostname,
        emails_found: emailsFound,
        phones_found: phonesFound,
        cached,
      },
    });
  }

  async trackScrapeProfile(username: string, hasEmail: boolean, hasPhone: boolean, hasWebsite: boolean): Promise<void> {
    await this.trackEvent({
      name: 'scrape-profile',
      data: {
        has_email: hasEmail,
        has_phone: hasPhone,
        has_website: hasWebsite,
      },
    });
  }

  async trackScrapeFollowers(targetUsername: string, followersScraped: number): Promise<void> {
    await this.trackEvent({
      name: 'scrape-followers',
      data: {
        followers_scraped: followersScraped,
      },
    });
  }

  // ==========================================
  // EVENTOS DE WHATSAPP
  // ==========================================

  async trackWhatsAppMessage(direction: 'received' | 'sent', tenantId: string, messageType: string): Promise<void> {
    await this.trackEvent({
      name: `whatsapp-message-${direction}`,
      data: {
        tenant_id: tenantId,
        message_type: messageType,
      },
    });
  }

  async trackWhatsAppWebhook(eventType: string, success: boolean): Promise<void> {
    await this.trackEvent({
      name: 'whatsapp-webhook',
      data: {
        event_type: eventType,
        success,
      },
    });
  }

  // ==========================================
  // EVENTOS DE LEADS
  // ==========================================

  async trackLeadCreated(source: string, hasEmail: boolean, hasPhone: boolean): Promise<void> {
    await this.trackEvent({
      name: 'lead-created',
      data: {
        source,
        has_email: hasEmail,
        has_phone: hasPhone,
      },
    });
  }

  async trackLeadEnriched(enrichmentType: 'profile' | 'url' | 'whatsapp', contactsAdded: number): Promise<void> {
    await this.trackEvent({
      name: 'lead-enriched',
      data: {
        enrichment_type: enrichmentType,
        contacts_added: contactsAdded,
      },
    });
  }

  // ==========================================
  // EVENTOS DE AGENDAMENTOS
  // ==========================================

  async trackAppointment(action: 'created' | 'confirmed' | 'cancelled' | 'completed', tenantId: string): Promise<void> {
    await this.trackEvent({
      name: `appointment-${action}`,
      data: {
        tenant_id: tenantId,
      },
    });
  }

  // ==========================================
  // EVENTOS DE SISTEMA
  // ==========================================

  async trackApiError(endpoint: string, errorCode: number, errorMessage: string): Promise<void> {
    await this.trackEvent({
      name: 'api-error',
      data: {
        endpoint,
        error_code: errorCode,
        error_message: errorMessage.substring(0, 100),
      },
    });
  }

  async trackRateLimit(endpoint: string, tenantId: string): Promise<void> {
    await this.trackEvent({
      name: 'rate-limit-hit',
      data: {
        endpoint,
        tenant_id: tenantId,
      },
    });
  }

  async trackCache(type: 'hit' | 'miss', cacheKey: string): Promise<void> {
    await this.trackEvent({
      name: `cache-${type}`,
      data: {
        cache_key: cacheKey.substring(0, 50),
      },
    });
  }

  async trackCronJob(jobName: string, duration: number, success: boolean, itemsProcessed: number): Promise<void> {
    await this.trackEvent({
      name: 'cron-job',
      data: {
        job_name: jobName,
        duration_ms: duration,
        success,
        items_processed: itemsProcessed,
      },
    });
  }
}

// Singleton instance
export const umamiAnalytics = new UmamiAnalyticsService();
