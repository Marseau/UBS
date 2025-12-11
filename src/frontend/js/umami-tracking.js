/**
 * Umami Tracking Script para Frontend
 *
 * Uso: Incluir em todas as páginas HTML:
 * <script src="/js/umami-tracking.js"></script>
 *
 * Configuração via variáveis globais (definir ANTES de incluir o script):
 * window.UMAMI_URL = 'http://localhost:3001';
 * window.UMAMI_WEBSITE_ID = 'seu-website-id';
 */

(function() {
  'use strict';

  // Configuração
  const UMAMI_URL = window.UMAMI_URL || 'http://localhost:3001';
  const UMAMI_WEBSITE_ID = window.UMAMI_WEBSITE_ID || '';

  if (!UMAMI_WEBSITE_ID) {
    console.log('📊 [Umami] Website ID não configurado. Tracking desabilitado.');
    return;
  }

  // Carregar script do Umami
  const script = document.createElement('script');
  script.async = true;
  script.defer = true;
  script.src = `${UMAMI_URL}/script.js`;
  script.setAttribute('data-website-id', UMAMI_WEBSITE_ID);
  script.setAttribute('data-auto-track', 'true');
  script.setAttribute('data-do-not-track', 'false');
  script.setAttribute('data-cache', 'false');

  script.onload = function() {
    console.log('📊 [Umami] Script carregado com sucesso');

    // Tracking automático de eventos customizados
    setupCustomTracking();
  };

  script.onerror = function() {
    console.warn('📊 [Umami] Falha ao carregar script');
  };

  document.head.appendChild(script);

  /**
   * Configura tracking customizado para elementos específicos
   */
  function setupCustomTracking() {
    // Aguardar umami estar disponível
    if (typeof window.umami === 'undefined') {
      setTimeout(setupCustomTracking, 100);
      return;
    }

    // Track cliques em botões de ação
    document.querySelectorAll('[data-umami-event]').forEach(function(el) {
      el.addEventListener('click', function() {
        const eventName = el.getAttribute('data-umami-event');
        const eventData = el.getAttribute('data-umami-data');

        if (eventData) {
          try {
            window.umami.track(eventName, JSON.parse(eventData));
          } catch (e) {
            window.umami.track(eventName);
          }
        } else {
          window.umami.track(eventName);
        }
      });
    });

    // Track mudanças de página (SPA)
    trackPageViews();

    // Track tempo na página
    trackTimeOnPage();

    // Track scroll depth
    trackScrollDepth();

    console.log('📊 [Umami] Custom tracking configurado');
  }

  /**
   * Track page views em Single Page Applications
   */
  function trackPageViews() {
    let lastPath = window.location.pathname;

    // Observar mudanças na URL
    const originalPushState = history.pushState;
    history.pushState = function() {
      originalPushState.apply(this, arguments);
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        if (window.umami) {
          window.umami.track();
        }
      }
    };

    window.addEventListener('popstate', function() {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        if (window.umami) {
          window.umami.track();
        }
      }
    });
  }

  /**
   * Track tempo na página
   */
  function trackTimeOnPage() {
    const startTime = Date.now();

    window.addEventListener('beforeunload', function() {
      const timeSpent = Math.round((Date.now() - startTime) / 1000);
      const pageName = document.title || window.location.pathname;

      if (window.umami && timeSpent > 5) { // Só track se ficou mais de 5 segundos
        window.umami.track('time-on-page', {
          page: pageName,
          seconds: timeSpent
        });
      }
    });
  }

  /**
   * Track scroll depth (25%, 50%, 75%, 100%)
   */
  function trackScrollDepth() {
    const milestones = [25, 50, 75, 100];
    const tracked = new Set();

    function getScrollPercent() {
      const h = document.documentElement;
      const b = document.body;
      const st = 'scrollTop';
      const sh = 'scrollHeight';
      return Math.round((h[st] || b[st]) / ((h[sh] || b[sh]) - h.clientHeight) * 100);
    }

    window.addEventListener('scroll', function() {
      const percent = getScrollPercent();

      milestones.forEach(function(milestone) {
        if (percent >= milestone && !tracked.has(milestone)) {
          tracked.add(milestone);
          if (window.umami) {
            window.umami.track('scroll-depth', {
              depth: milestone,
              page: window.location.pathname
            });
          }
        }
      });
    });
  }

  // Expor função para tracking manual
  window.trackUmamiEvent = function(eventName, eventData) {
    if (window.umami) {
      window.umami.track(eventName, eventData);
    }
  };

})();
