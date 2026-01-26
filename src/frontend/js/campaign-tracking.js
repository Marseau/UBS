/**
 * AIC Campaign Web Tracking
 * Migration 086 - Sistema completo de analytics e atribuição de leads
 */

(function() {
  // =====================================================
  // CONFIGURAÇÃO DA CAMPANHA
  // =====================================================
  const CAMPAIGN_ID = window.AIC_CAMPAIGN_ID || 'fc171ccf-db60-4e1c-9d61-118458a48712';
  const SESSION_STORAGE_KEY = 'aic-session-uuid';
  const CONSENT_STORAGE_KEY = 'aic-tracking-consent';

  // =====================================================
  // HELPER: Verificar consentimento (LGPD)
  // =====================================================
  function hasTrackingConsent() {
    const consent = localStorage.getItem(CONSENT_STORAGE_KEY);
    // Se não tem consentimento definido, assumir aceito (landing tem cookie consent)
    return consent !== 'rejected';
  }

  // =====================================================
  // HELPER: Extrair UTM Parameters
  // =====================================================
  function getUTMParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      source: params.get('utm_source') || 'seo',
      medium: params.get('utm_medium') || 'organic',
      utm_campaign: params.get('utm_campaign') || 'aic',
      utm_content: params.get('utm_content') || null,
      utm_term: params.get('utm_term') || null
    };
  }

  // =====================================================
  // HELPER: Criar/recuperar session UUID
  // =====================================================
  async function getOrCreateSession() {
    // Verificar se já existe sessão ativa
    let sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);

    if (sessionId) {
      // Atualizar sessão existente (last_activity_at)
      await fetch('/api/tracking/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          campaign_id: CAMPAIGN_ID
        })
      }).catch(err => console.warn('[AIC Tracking] Error updating session:', err));

      return sessionId;
    }

    // Criar nova sessão
    const utms = getUTMParams();
    const response = await fetch('/api/tracking/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: CAMPAIGN_ID,
        source: utms.source,
        medium: utms.medium,
        utm_campaign: utms.utm_campaign,
        utm_content: utms.utm_content,
        utm_term: utms.utm_term,
        landing_url: window.location.href,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent
      })
    });

    const data = await response.json();
    sessionId = data.session_id;

    // Armazenar na sessionStorage
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    console.log('[AIC Tracking] ✅ Session created:', sessionId);

    return sessionId;
  }

  // =====================================================
  // HELPER: Registrar evento
  // =====================================================
  async function trackEvent(eventType, eventLabel, elementData = {}) {
    if (!hasTrackingConsent()) {
      console.log('[AIC Tracking] ⚠️ Tracking blocked - no consent');
      return;
    }

    try {
      const sessionId = await getOrCreateSession();

      await fetch('/api/tracking/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          campaign_id: CAMPAIGN_ID,
          event_type: eventType,
          event_label: eventLabel,
          url: window.location.href,
          element_text: elementData.text || null,
          element_class: elementData.className || null,
          element_id: elementData.id || null
        })
      });

      console.log(`[AIC Tracking] ✅ Event tracked: ${eventType} (${eventLabel})`);
    } catch (error) {
      console.error('[AIC Tracking] ❌ Error tracking event:', error);
    }
  }

  // =====================================================
  // HELPER: Atribuir lead
  // =====================================================
  async function attributeLead(leadId, contactChannel) {
    try {
      const sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);

      await fetch('/api/tracking/lead-attribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          session_id: sessionId,
          campaign_id: CAMPAIGN_ID,
          contact_channel: contactChannel,
          lead_status: 'pending',
          attribution_type: 'first_touch'
        })
      });

      console.log(`[AIC Tracking] ✅ Lead attributed: ${leadId} → ${sessionId}`);
    } catch (error) {
      console.error('[AIC Tracking] ❌ Error attributing lead:', error);
    }
  }

  // =====================================================
  // HANDLER: CTA Click (WhatsApp)
  // =====================================================
  function handleCTAClick(ctaElement) {
    const ctaId = ctaElement.getAttribute('data-umami-event') || 'unknown_cta';
    const elementData = {
      text: ctaElement.textContent.trim(),
      className: ctaElement.className,
      id: ctaElement.id
    };

    // Registrar evento de CTA click
    trackEvent('cta_click', ctaId, elementData);

    // Armazenar no localStorage para tracking pós-conversão
    try {
      const clickData = {
        cta_id: ctaId,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        session_id: sessionStorage.getItem(SESSION_STORAGE_KEY)
      };
      localStorage.setItem('aic-last-cta-click', JSON.stringify(clickData));
    } catch (e) {
      console.warn('[AIC Tracking] Erro ao salvar no localStorage:', e);
    }
  }

  // =====================================================
  // INICIALIZAÇÃO
  // =====================================================
  async function init() {
    if (!hasTrackingConsent()) {
      console.log('[AIC Tracking] ⚠️ Tracking disabled - no consent');
      return;
    }

    // 1. Criar/recuperar sessão
    await getOrCreateSession();

    // 2. Registrar pageview
    await trackEvent('pageview', window.location.pathname);

    // 3. Adicionar listeners em todos os CTAs
    const ctaButtons = document.querySelectorAll('[data-umami-event]');
    ctaButtons.forEach(cta => {
      const href = cta.getAttribute('href') || '';

      // Apenas processar links do WhatsApp
      if (href.includes('wa.me')) {
        cta.addEventListener('click', function(e) {
          // Não prevenir default - deixar o link abrir
          handleCTAClick(this);
        });
        console.log('[AIC Tracking] ✅ Listener added:', cta.getAttribute('data-umami-event'));
      }
    });

    // 4. Tracking de scroll depth (opcional)
    let maxScroll = 0;
    window.addEventListener('scroll', function() {
      const scrollPercent = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
      if (scrollPercent > maxScroll && scrollPercent % 25 === 0) {
        maxScroll = scrollPercent;
        trackEvent('scroll', `scroll_${scrollPercent}%`);
      }
    });

    console.log(`[AIC Tracking] ✅ Initialized - Campaign: ${CAMPAIGN_ID}`);
    console.log(`[AIC Tracking] ✅ Monitoring ${ctaButtons.length} CTAs`);
  }

  // Executar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expor função global para atribuição de leads (usar após conversão)
  window.AICTracking = {
    attributeLead: attributeLead,
    trackEvent: trackEvent,
    getSessionId: () => sessionStorage.getItem(SESSION_STORAGE_KEY)
  };
})();
