/**
 * AIC Client Sidebar Component
 * Menu lateral para Portal do Cliente - Padrao visual AIC unificado
 * Controla acesso baseado na etapa atual da jornada
 */

(function() {
  const currentPath = window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);
  const campaignParam = urlParams.get('campaign');

  // Funcao para construir URL com campaign param
  function buildUrl(path) {
    if (campaignParam) {
      return path + '?campaign=' + campaignParam;
    }
    return path;
  }

  // Ordem das etapas da jornada
  const STEP_ORDER = [
    'proposta_enviada',
    'proposta_visualizada',
    'proposta_aceita',
    'contrato_enviado',
    'contrato_assinado',
    'pagamento_pendente',
    'pagamento_confirmado',
    'credenciais_pendente',
    'credenciais_ok',
    'briefing_pendente',
    'briefing_completo',
    'campanha_ativa',
    'campanha_concluida'
  ];

  // Mapeamento de etapas para itens do menu
  const MENU_ITEMS = [
    {
      id: 'jornada',
      label: 'Minha Jornada',
      path: '/cliente',
      alwaysVisible: true,
      requiredSteps: []
    },
    {
      id: 'proposta',
      label: 'Proposta',
      path: '/cliente/proposta',
      requiredSteps: ['proposta_enviada'],
      completedAt: 'proposta_aceita'  // Proposta completa quando aceita
    },
    {
      id: 'contrato',
      label: 'Contrato',
      path: '/cliente/contrato',
      requiredSteps: ['proposta_visualizada'],
      completedAt: 'contrato_assinado'
    },
    {
      id: 'pagamento',
      label: 'Pagamento',
      path: '/cliente/pagamento',
      requiredSteps: ['contrato_assinado'],
      completedAt: 'pagamento_confirmado'
    },
    {
      id: 'credenciais',
      label: 'Credenciais',
      path: '/cliente/credenciais',
      requiredSteps: ['pagamento_confirmado'],
      completedAt: 'credenciais_ok'
    },
    {
      id: 'briefing',
      label: 'Briefing',
      path: '/cliente/briefing',
      requiredSteps: ['credenciais_ok'],
      completedAt: 'briefing_completo'
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      path: '/cliente/dashboard',
      requiredSteps: ['briefing_completo']
    },
    {
      id: 'leads',
      label: 'Leads Entregues',
      path: '/cliente/leads',
      requiredSteps: ['campanha_ativa']
    },
    {
      id: 'faturas',
      label: 'Faturas',
      path: '/cliente/faturas',
      requiredSteps: ['contrato_assinado']
    }
  ];

  // CSS do Sidebar - Padrao AIC unificado (igual ao admin)
  const styles = `
    .aic-sidebar {
      position: fixed;
      left: 0;
      top: 0;
      width: 260px;
      height: 100vh;
      background: linear-gradient(180deg, #0C1B33 0%, #091525 100%);
      border-right: 1px solid #1e3a5f;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      transform: translateX(0);
      transition: transform 0.3s ease;
    }
    .aic-sidebar.collapsed { transform: translateX(-260px); }

    .aic-sidebar-toggle {
      position: fixed;
      left: 260px;
      top: 20px;
      width: 32px;
      height: 32px;
      background: #122444;
      border: 1px solid #1e3a5f;
      border-radius: 0 8px 8px 0;
      color: #94a3b8;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1001;
      transition: all 0.3s ease;
    }
    .aic-sidebar.collapsed + .aic-sidebar-toggle { left: 0; }
    .aic-sidebar-toggle:hover { background: #1a3055; color: #0ECC97; }

    .aic-sidebar-header {
      padding: 20px;
      border-bottom: 1px solid #1e3a5f;
    }
    .aic-sidebar-logo {
      height: 32px;
      width: auto;
    }

    .aic-sidebar-user {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #1e3a5f;
    }
    .aic-sidebar-avatar {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #0ECC97 0%, #0BA578 100%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      color: #0C1B33;
    }
    .aic-sidebar-user-info h3 {
      color: #FDFDFD;
      font-size: 13px;
      font-weight: 600;
      margin: 0;
      line-height: 1.3;
    }
    .aic-sidebar-user-info p {
      color: #64748b;
      font-size: 11px;
      margin: 0;
    }

    .aic-sidebar-progress {
      padding: 16px 20px;
      border-bottom: 1px solid #1e3a5f;
    }
    .aic-sidebar-progress-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .aic-sidebar-progress-label span {
      color: #94a3b8;
      font-size: 11px;
    }
    .aic-sidebar-progress-label strong {
      color: #0ECC97;
      font-size: 12px;
    }
    .aic-sidebar-progress-bar {
      height: 4px;
      background: #1a3055;
      border-radius: 2px;
      overflow: hidden;
    }
    .aic-sidebar-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #0ECC97 0%, #0BA578 100%);
      border-radius: 2px;
      transition: width 0.5s ease;
    }

    .aic-sidebar-nav {
      flex: 1;
      padding: 16px 0;
      overflow-y: auto;
    }

    .aic-sidebar-section {
      margin-bottom: 24px;
    }
    .aic-sidebar-section-title {
      padding: 0 20px;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .aic-sidebar-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      color: #94a3b8;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
      border-left: 3px solid transparent;
    }
    .aic-sidebar-link:hover:not(.disabled) {
      background: rgba(14, 204, 151, 0.05);
      color: #FDFDFD;
    }
    .aic-sidebar-link.active {
      background: rgba(14, 204, 151, 0.1);
      color: #0ECC97;
      border-left-color: #0ECC97;
    }
    .aic-sidebar-link.completed {
      color: #FDFDFD;
    }
    .aic-sidebar-link.disabled {
      opacity: 0.4;
      cursor: not-allowed;
      pointer-events: none;
    }
    .aic-sidebar-link.current {
      background: rgba(59, 130, 246, 0.1);
      color: #60a5fa;
      border-left-color: #60a5fa;
    }

    .aic-sidebar-link-status {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .aic-sidebar-link-status.completed {
      background: rgba(14, 204, 151, 0.15);
      color: #0ECC97;
    }
    .aic-sidebar-link-status.current {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
    }

    .aic-sidebar-footer {
      padding: 16px 20px;
      border-top: 1px solid #1e3a5f;
    }
    .aic-sidebar-footer-link {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #64748b;
      text-decoration: none;
      font-size: 12px;
      padding: 8px 0;
      transition: color 0.2s;
      cursor: pointer;
      background: none;
      border: none;
      width: 100%;
    }
    .aic-sidebar-footer-link:hover {
      color: #94a3b8;
    }
    .aic-sidebar-footer-link.logout:hover {
      color: #ef4444;
    }
    .aic-sidebar-footer-link.admin-back {
      color: #0ECC97;
      font-weight: 600;
      font-size: 13px;
    }
    .aic-sidebar-footer-link.admin-back:hover {
      color: #10E6A8;
    }

    body.aic-sidebar-open { margin-left: 260px; }
    body.aic-sidebar-open .header { margin-left: 260px; width: calc(100% - 260px); }

    @media (max-width: 1024px) {
      .aic-sidebar { transform: translateX(-260px); }
      .aic-sidebar.open { transform: translateX(0); }
      .aic-sidebar-toggle { left: 0; }
      .aic-sidebar.open + .aic-sidebar-toggle { left: 260px; }
      body.aic-sidebar-open { margin-left: 0; }
      body.aic-sidebar-open .header { margin-left: 0; width: 100%; }
    }
  `;

  // Adicionar CSS
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Estado da jornada
  let journeyState = {
    clientName: 'Carregando...',
    currentStep: 'proposta_enviada',
    progress: 0,
    campaignId: null,
    journeyId: null,
    isNewCampaign: false,  // Modo nova campanha (sem jornada existente)
    // Timestamps de completude de cada etapa (para verificacao real)
    completedSteps: {
      proposta_visualizada: null,
      proposta_aceita: null,
      contrato_assinado: null,
      pagamento_confirmado: null,
      credenciais_ok: null,
      briefing_completo: null,
      campanha_ativa: null
    }
  };

  // Verificar se etapa esta acessivel
  function isStepAccessible(requiredSteps, itemId) {
    if (!requiredSteps || requiredSteps.length === 0) return true;

    // No modo nova campanha, apenas Proposta e Minha Jornada são acessíveis
    if (journeyState.isNewCampaign) {
      return itemId === 'proposta' || itemId === 'jornada';
    }

    const currentIndex = STEP_ORDER.indexOf(journeyState.currentStep);
    return requiredSteps.some(function(step) {
      const requiredIndex = STEP_ORDER.indexOf(step);
      return currentIndex >= requiredIndex;
    });
  }

  // Verificar se etapa esta completa (usando timestamps reais)
  function isStepCompleted(completedAt) {
    if (!completedAt) return false;
    // Verificar se temos o timestamp real da etapa completada
    // completedAt é o nome da etapa (ex: 'proposta_visualizada')
    // journeyState.completedSteps tem os timestamps
    const timestamp = journeyState.completedSteps[completedAt];
    return timestamp !== null && timestamp !== undefined;
  }

  // Verificar se e etapa atual
  function isCurrentStep(item) {
    if (!item.completedAt) return false;
    const accessible = isStepAccessible(item.requiredSteps, item.id);
    const completed = isStepCompleted(item.completedAt);
    return accessible && !completed;
  }

  // Verificar pagina ativa
  function isActivePage(path) {
    if (path === '/cliente' && currentPath === '/cliente') return true;
    if (path !== '/cliente' && currentPath.startsWith(path)) return true;
    return false;
  }

  // Obter iniciais do nome
  function getInitials(name) {
    if (!name) return '?';
    var parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  // Criar elemento do sidebar
  function renderSidebar() {
    var nav = document.createElement('nav');
    nav.className = 'aic-sidebar';
    nav.id = 'aic-sidebar';

    // Header com logo e user
    var html = '<div class="aic-sidebar-header">' +
      '<img src="/assets/AIC/Imagens%20Vetor%20/Logo%20Completo%20nome%20Branco%20sem%20fundo.png" alt="AIC" class="aic-sidebar-logo">' +
      '<div class="aic-sidebar-user">' +
        '<div class="aic-sidebar-avatar">' + getInitials(journeyState.clientName) + '</div>' +
        '<div class="aic-sidebar-user-info">' +
          '<h3>' + journeyState.clientName + '</h3>' +
          '<p>Portal do Cliente</p>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Progress bar
    html += '<div class="aic-sidebar-progress">' +
      '<div class="aic-sidebar-progress-label">' +
        '<span>Progresso</span>' +
        '<strong>' + journeyState.progress + '%</strong>' +
      '</div>' +
      '<div class="aic-sidebar-progress-bar">' +
        '<div class="aic-sidebar-progress-fill" style="width: ' + journeyState.progress + '%"></div>' +
      '</div>' +
    '</div>';

    // Nav
    html += '<div class="aic-sidebar-nav">';

    // Secao Jornada
    html += '<div class="aic-sidebar-section">';
    html += '<div class="aic-sidebar-section-title">Jornada</div>';

    for (var i = 0; i < MENU_ITEMS.length; i++) {
      var item = MENU_ITEMS[i];
      if (item.id === 'faturas' || item.id === 'leads') continue; // Separar em outra secao

      var accessible = item.alwaysVisible || isStepAccessible(item.requiredSteps, item.id);
      var completed = isStepCompleted(item.completedAt);
      var current = isCurrentStep(item);
      var active = isActivePage(item.path);

      // No modo nova campanha, Proposta é a etapa atual (entrada do cliente)
      if (journeyState.isNewCampaign && item.id === 'proposta') {
        current = true;
      }

      var className = 'aic-sidebar-link';
      var statusHtml = '';

      if (active) {
        className += ' active';
      } else if (completed) {
        className += ' completed';
        statusHtml = '<span class="aic-sidebar-link-status completed">OK</span>';
      } else if (current) {
        className += ' current';
        statusHtml = '<span class="aic-sidebar-link-status current">Atual</span>';
      } else if (!accessible) {
        className += ' disabled';
      }

      var href = accessible ? buildUrl(item.path) : '#';

      html += '<a href="' + href + '" class="' + className + '">' +
        '<span>' + item.label + '</span>' +
        statusHtml +
      '</a>';
    }

    html += '</div>';

    // Secao Financeiro
    html += '<div class="aic-sidebar-section">';
    html += '<div class="aic-sidebar-section-title">Financeiro</div>';

    var financeItems = MENU_ITEMS.filter(function(item) {
      return item.id === 'faturas' || item.id === 'leads';
    });

    for (var j = 0; j < financeItems.length; j++) {
      var fitem = financeItems[j];
      var faccessible = isStepAccessible(fitem.requiredSteps, fitem.id);
      var factive = isActivePage(fitem.path);

      var fclassName = 'aic-sidebar-link';
      if (factive) fclassName += ' active';
      else if (!faccessible) fclassName += ' disabled';

      var fhref = faccessible ? buildUrl(fitem.path) : '#';

      html += '<a href="' + fhref + '" class="' + fclassName + '">' +
        '<span>' + fitem.label + '</span>' +
      '</a>';
    }

    html += '</div>';
    html += '</div>';

    // Footer - Portal do cliente NUNCA mostra "Voltar para Admin"
    html += '<div class="aic-sidebar-footer">';
    html += '<a href="https://wa.me/5511999999999" target="_blank" class="aic-sidebar-footer-link">Precisa de ajuda?</a>';
    html += '<button class="aic-sidebar-footer-link logout" onclick="window.aicClientLogout()">Sair</button>';
    html += '</div>';

    nav.innerHTML = html;
    return nav;
  }

  // Toggle button
  function renderToggle() {
    var btn = document.createElement('button');
    btn.className = 'aic-sidebar-toggle';
    btn.id = 'aic-sidebar-toggle';
    btn.title = 'Toggle Menu';
    btn.innerHTML = '<span id="toggle-icon">&#9776;</span>';
    return btn;
  }

  // Logout function
  window.aicClientLogout = async function() {
    try {
      var supabaseRef = window.supabaseClient || window.supabase;
      if (supabaseRef && supabaseRef.auth) {
        await supabaseRef.auth.signOut();
      }
      localStorage.removeItem('aic_client_journey');
      localStorage.removeItem('aic_access_token');
      localStorage.removeItem('aic_refresh_token');
      window.location.href = '/cliente/login';
    } catch (e) {
      console.error('Erro ao fazer logout:', e);
      window.location.href = '/cliente/login';
    }
  };

  // Carregar jornada do cliente
  async function loadJourney() {
    try {
      // Tentar obter do localStorage primeiro
      var cached = localStorage.getItem('aic_client_journey');
      if (cached) {
        var data = JSON.parse(cached);
        if (data && data.currentStep) {
          journeyState = Object.assign({}, journeyState, data);
        }
      }

      // Buscar dados atualizados da API
      var token = localStorage.getItem('aic_access_token') || localStorage.getItem('aic_client_token') || '';
      var response = await fetch('/api/aic/journey/me', {
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });

      if (response.ok) {
        var data = await response.json();
        if (data.success && data.journey) {
          var j = data.journey;
          journeyState = {
            clientName: j.client_name || 'Cliente',
            currentStep: j.current_step || 'proposta_enviada',
            progress: j.progress || 0,
            campaignId: j.campaign_id,
            journeyId: j.id,
            isNewCampaign: false,
            // Timestamps reais de cada etapa (para verificacao de completude)
            completedSteps: {
              proposta_visualizada: j.proposta_visualizada_at || null,
              proposta_aceita: j.proposta_aceita_at || null,
              contrato_assinado: j.contrato_assinado_at || null,
              pagamento_confirmado: j.pagamento_confirmado_at || null,
              credenciais_ok: j.credenciais_ok_at || null,
              briefing_completo: j.briefing_completo_at || null,
              campanha_ativa: j.campanha_ativa_at || null
            }
          };
          localStorage.setItem('aic_client_journey', JSON.stringify(journeyState));
        }
      } else if (response.status === 401) {
        window.location.href = '/cliente/login';
        return;
      } else if (response.status === 404) {
        // Sem jornada existente - modo nova campanha
        console.log('[Sidebar] Nenhuma jornada encontrada - modo nova campanha');

        // Tentar obter email do usuário do Supabase
        var clientName = 'Cliente';
        try {
          // Tentar window.supabaseClient, depois window.supabase (alias)
          var supabaseRef = window.supabaseClient || window.supabase;
          if (supabaseRef && supabaseRef.auth) {
            var sessionResult = await supabaseRef.auth.getSession();
            var user = sessionResult.data.session?.user;
            if (user) {
              clientName = user.user_metadata?.name || user.user_metadata?.full_name || user.email || 'Cliente';
            }
          }
        } catch (e) {
          console.log('[Sidebar] Não foi possível obter email do usuário:', e);
        }

        journeyState = {
          clientName: clientName,
          currentStep: 'nova_campanha',
          progress: 0,
          campaignId: null,
          journeyId: null,
          isNewCampaign: true
        };
        localStorage.removeItem('aic_client_journey');
      }
    } catch (e) {
      console.error('Erro ao carregar jornada:', e);
    }

    // Renderizar sidebar
    var sidebar = renderSidebar();
    var toggle = renderToggle();

    document.body.insertBefore(sidebar, document.body.firstChild);
    document.body.insertBefore(toggle, sidebar.nextSibling);
    document.body.classList.add('aic-sidebar-open');

    // Event listeners
    toggle.addEventListener('click', function() {
      sidebar.classList.toggle('collapsed');
      sidebar.classList.toggle('open');
      document.body.classList.toggle('aic-sidebar-open');
      document.getElementById('toggle-icon').innerHTML =
        sidebar.classList.contains('collapsed') ? '&#9776;' : '&#10005;';
    });

    // Mobile handling
    if (window.innerWidth <= 1024) {
      sidebar.classList.add('collapsed');
      document.body.classList.remove('aic-sidebar-open');
    }
  }

  // Verificar se deve carregar o sidebar
  if (currentPath.startsWith('/cliente') && !currentPath.includes('/login')) {
    loadJourney();
  }
})();
