/**
 * AIC Sidebar Component
 * Menu lateral de navegacao unificado - Admin e Cliente
 * Modelo multi-campanha: Cliente/Admin veem campanhas, nao jornada linear
 */

(function() {
  const urlParams = new URLSearchParams(window.location.search);
  const campaignId = urlParams.get('campaign');
  const currentPath = window.location.pathname;

  // Role do usuario - definido no login e salvo no localStorage
  function getUserRole() {
    return localStorage.getItem('aic_user_role') || 'client';
  }

  // CSS do Sidebar
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
    .aic-sidebar-header { padding: 20px; border-bottom: 1px solid #1e3a5f; }
    .aic-sidebar-logo { height: 32px; width: auto; }
    .aic-sidebar-nav { flex: 1; padding: 16px 0; overflow-y: auto; }
    .aic-sidebar-section { margin-bottom: 24px; }
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
      gap: 12px;
      padding: 12px 20px;
      color: #94a3b8;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
      border-left: 3px solid transparent;
    }
    .aic-sidebar-link:hover { background: rgba(14, 204, 151, 0.05); color: #FDFDFD; }
    .aic-sidebar-link.active {
      background: rgba(14, 204, 151, 0.1);
      color: #0ECC97;
      border-left-color: #0ECC97;
      pointer-events: none;
    }
    .aic-sidebar-link.disabled {
      opacity: 0.4;
      pointer-events: none;
    }
    .aic-sidebar-submenu-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      color: #94a3b8;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border-left: 3px solid transparent;
      user-select: none;
    }
    .aic-sidebar-submenu-toggle:hover { background: rgba(14, 204, 151, 0.05); color: #FDFDFD; }
    .aic-sidebar-submenu-toggle.active { color: #0ECC97; }
    .aic-sidebar-submenu-toggle-left { display: flex; align-items: center; gap: 12px; }
    .aic-sidebar-submenu-arrow { font-size: 10px; transition: transform 0.2s; }
    .aic-sidebar-submenu-toggle.open .aic-sidebar-submenu-arrow { transform: rotate(90deg); }
    .aic-sidebar-submenu {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
      background: rgba(0, 0, 0, 0.15);
    }
    .aic-sidebar-submenu.open { max-height: 300px; }
    .aic-sidebar-submenu .aic-sidebar-link { padding-left: 40px; font-size: 13px; }
    .aic-sidebar-campaign-badge {
      margin: 0 12px 16px;
      padding: 14px;
      background: linear-gradient(135deg, rgba(14, 204, 151, 0.15) 0%, rgba(11, 165, 120, 0.1) 100%);
      border: 1px solid rgba(14, 204, 151, 0.25);
      border-radius: 10px;
    }
    .aic-sidebar-campaign-badge-label {
      font-size: 10px;
      color: #0ECC97;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }
    .aic-sidebar-campaign-badge-name {
      font-size: 14px;
      color: #FDFDFD;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .aic-sidebar-campaign-badge-client {
      font-size: 12px;
      color: #94a3b8;
    }
    .aic-sidebar-footer { padding: 16px 20px; border-top: 1px solid #1e3a5f; }
    .aic-sidebar-footer-link {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #64748b;
      text-decoration: none;
      font-size: 12px;
      transition: color 0.2s;
    }
    .aic-sidebar-footer-link:hover { color: #94a3b8; }
    body.aic-sidebar-open { margin-left: 260px; }
    body.aic-sidebar-open .header { margin-left: 260px; width: calc(100% - 260px); }

    /* Badge de notificação */
    .aic-sidebar-badge {
      background: #ef4444;
      color: white;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 10px;
      margin-left: 8px;
      min-width: 18px;
      text-align: center;
      animation: pulse-badge 2s infinite;
    }
    @keyframes pulse-badge {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    /* Back to campaigns link */
    .aic-sidebar-back {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      margin: 0 12px 12px;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 8px;
      color: #3b82f6;
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }
    .aic-sidebar-back:hover {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
    }
    .aic-sidebar-back svg {
      width: 16px;
      height: 16px;
    }

    @media (max-width: 1024px) {
      .aic-sidebar { transform: translateX(-260px); }
      .aic-sidebar.open { transform: translateX(0); }
      .aic-sidebar-toggle { left: 0; }
      .aic-sidebar.open + .aic-sidebar-toggle { left: 260px; }
      body.aic-sidebar-open { margin-left: 0; }
      body.aic-sidebar-open .header { margin-left: 0; width: 100%; }
    }
  `;

  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Funcao para verificar pagina ativa
  function isActive(page) {
    const routeMap = {
      'campanhas': ['campanhas', 'campaigns-dashboard'],
      'analytics': ['analytics', 'dashboard-prova'],
      'briefing': ['briefing', 'campaign-briefing'],
      'onboarding': ['onboarding', 'campaign-onboarding'],
      'credenciais': ['credenciais'],
      'financeiro': ['financeiro', 'financial-dashboard'],
      'entregas': ['entregas', 'lead-deliveries'],
      'leads-entregues': ['leads-entregues'],
      'reunioes-fechamento': ['reunioes-fechamento'],
      'clusters': ['clusters', 'cluster-intention'],
      'inteligencia': ['inteligencia', 'dynamic-intelligence'],
      'docs': ['docs', 'aic-docs'],
      'proposta': ['proposta']
    };

    for (const [key, aliases] of Object.entries(routeMap)) {
      if (aliases.includes(page)) {
        return aliases.some(alias => currentPath.includes(alias));
      }
    }
    return currentPath.includes(page);
  }


  // Info da campanha atual
  let currentCampaign = null;

  async function loadCampaignInfo() {
    if (!campaignId) return;
    try {
      const response = await fetch('/api/campaigns/' + campaignId);
      if (response.ok) {
        currentCampaign = await response.json();
        updateCampaignBadge();
      }
    } catch (e) {
      console.error('Erro ao carregar campanha:', e);
    }
  }

  function updateCampaignBadge() {
    const nameEl = document.querySelector('.aic-sidebar-campaign-badge-name');
    const clientEl = document.querySelector('.aic-sidebar-campaign-badge-client');
    if (nameEl && currentCampaign) {
      nameEl.textContent = currentCampaign.campaign_name || currentCampaign.name || 'Campanha';
    }
    if (clientEl && currentCampaign) {
      clientEl.textContent = currentCampaign.client_name || '';
    }
  }

  function buildSidebar() {
    const role = getUserRole();
    const isAdmin = role === 'admin';
    const isInCampaign = !!campaignId;
    const isClientPortal = currentPath.startsWith('/cliente');

    const nav = document.createElement('nav');
    nav.className = 'aic-sidebar';
    nav.id = 'aic-sidebar';

    // Header
    nav.innerHTML = '<div class="aic-sidebar-header">' +
      '<img src="/assets/AIC/Imagens%20Vetor%20/Logo%20Completo%20nome%20Branco%20sem%20fundo.png" alt="AIC" class="aic-sidebar-logo">' +
      '</div>';

    var navContent = '<div class="aic-sidebar-nav">';

    // === SE ESTA DENTRO DE UMA CAMPANHA (com ?campaign=) ===
    if (isInCampaign) {
      // Back to campaigns
      const backUrl = isAdmin ? '/aic/campanhas' : '/cliente';
      navContent += '<a href="' + backUrl + '" class="aic-sidebar-back">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
        'Voltar para Campanhas' +
        '</a>';

      // Campaign badge
      navContent += '<div class="aic-sidebar-campaign-badge">' +
        '<div class="aic-sidebar-campaign-badge-label">Campanha</div>' +
        '<div class="aic-sidebar-campaign-badge-name">Carregando...</div>' +
        '<div class="aic-sidebar-campaign-badge-client"></div>' +
        '</div>';

      // Jornada da campanha
      navContent += '<div class="aic-sidebar-section">';
      navContent += '<div class="aic-sidebar-section-title">Jornada da Campanha</div>';

      const baseUrl = isAdmin ? '/aic' : '/cliente';
      navContent += '<a href="' + baseUrl + '/proposta?campaign=' + campaignId + '" class="aic-sidebar-link' + (isActive('proposta') && !isActive('proposta-comercial') ? ' active' : '') + '">Proposta</a>';
      navContent += '<a href="' + baseUrl + '/contrato?campaign=' + campaignId + '" class="aic-sidebar-link' + (isActive('contrato') ? ' active' : '') + '">Contrato</a>';
      navContent += '<a href="' + baseUrl + '/briefing?campaign=' + campaignId + '" class="aic-sidebar-link' + (isActive('briefing') ? ' active' : '') + '">Briefing</a>';
      navContent += '<a href="' + baseUrl + '/onboarding?campaign=' + campaignId + '" class="aic-sidebar-link' + (isActive('onboarding') ? ' active' : '') + '">Onboarding</a>';
      navContent += '<a href="' + baseUrl + '/dashboard?campaign=' + campaignId + '" class="aic-sidebar-link' + (isActive('dashboard') && !isActive('financeiro') ? ' active' : '') + '">Dashboard</a>';
      navContent += '</div>';

      // Admin extras dentro da campanha
      if (isAdmin) {
        navContent += '<div class="aic-sidebar-section">';
        navContent += '<div class="aic-sidebar-section-title">Gestao</div>';
        navContent += '<a href="/aic/analytics?campaign=' + campaignId + '" class="aic-sidebar-link' + (isActive('analytics') ? ' active' : '') + '">Analytics</a>';
        navContent += '<a href="/aic/leads-entregues?campaign=' + campaignId + '" class="aic-sidebar-link' + (isActive('leads-entregues') ? ' active' : '') + '">Leads Entregues</a>';
        navContent += '</div>';
      }

    } else {
      // === VISAO GERAL (SEM CAMPANHA SELECIONADA) ===

      if (isAdmin) {
        // Admin - Secao Principal
        navContent += '<div class="aic-sidebar-section">';
        navContent += '<div class="aic-sidebar-section-title">Principal</div>';
        navContent += '<a href="/aic/campanhas" class="aic-sidebar-link' + (isActive('campanhas') ? ' active' : '') + '">Todas Campanhas</a>';
        navContent += '</div>';

        // Inteligencia
        navContent += '<div class="aic-sidebar-section">';
        navContent += '<div class="aic-sidebar-section-title">Inteligência</div>';
        navContent += '<a href="/aic/clusters" class="aic-sidebar-link' + (isActive('clusters') ? ' active' : '') + '">Clusters</a>';
        navContent += '<a href="/aic/inteligencia" class="aic-sidebar-link' + (isActive('inteligencia') ? ' active' : '') + '">Dynamic Intelligence</a>';
        navContent += '</div>';

        // Analytics
        navContent += '<div class="aic-sidebar-section">';
        navContent += '<div class="aic-sidebar-section-title">Analytics</div>';
        navContent += '<a href="/aic/analytics" class="aic-sidebar-link' + (isActive('analytics') ? ' active' : '') + '">Visão Geral</a>';
        navContent += '</div>';

        // Financeiro
        navContent += '<div class="aic-sidebar-section">';
        navContent += '<div class="aic-sidebar-section-title">Financeiro</div>';
        navContent += '<a href="/aic/financeiro" id="sidebar-financeiro-link" class="aic-sidebar-link' + (isActive('financeiro') ? ' active' : '') + '">Dashboard Financeiro<span id="pending-payments-badge" class="aic-sidebar-badge" style="display:none;"></span></a>';
        navContent += '<a href="/aic/reunioes-fechamento" id="sidebar-reunioes-link" class="aic-sidebar-link' + (isActive('reunioes-fechamento') ? ' active' : '') + '">Reuniões Fechamento<span id="unseen-reunioes-badge" class="aic-sidebar-badge" style="display:none;"></span></a>';
        navContent += '</div>';

        // Documentos
        navContent += '<div class="aic-sidebar-section">';
        navContent += '<div class="aic-sidebar-section-title">Documentos</div>';
        navContent += '<a href="/aic/proposta-comercial" class="aic-sidebar-link' + (currentPath.includes('proposta-comercial') ? ' active' : '') + '">Proposta</a>';
        navContent += '<a href="/aic/contrato" class="aic-sidebar-link' + (currentPath.includes('contrato') && !currentPath.includes('cliente') ? ' active' : '') + '">Contrato</a>';
        navContent += '<a href="/aic/docs" class="aic-sidebar-link' + (isActive('docs') ? ' active' : '') + '">Central de Docs</a>';
        navContent += '</div>';

      } else {
        // Cliente - Visao simplificada
        navContent += '<div class="aic-sidebar-section">';
        navContent += '<div class="aic-sidebar-section-title">Minhas Campanhas</div>';
        navContent += '<a href="/cliente" class="aic-sidebar-link' + (currentPath === '/cliente' || currentPath === '/cliente/' ? ' active' : '') + '">Todas as Campanhas</a>';
        navContent += '</div>';

        // Info
        navContent += '<div class="aic-sidebar-section">';
        navContent += '<div class="aic-sidebar-section-title">Ajuda</div>';
        navContent += '<a href="https://wa.me/5511999999999" target="_blank" class="aic-sidebar-link">Falar com Suporte</a>';
        navContent += '</div>';
      }
    }

    navContent += '</div>';

    // Footer
    navContent += '<div class="aic-sidebar-footer">';
    navContent += '<a href="#" class="aic-sidebar-footer-link" onclick="window.aicLogout(); return false;">Sair</a>';
    navContent += '</div>';

    nav.innerHTML += navContent;

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'aic-sidebar-toggle';
    toggleBtn.id = 'aic-sidebar-toggle';
    toggleBtn.title = 'Toggle Menu';
    toggleBtn.innerHTML = '<span id="toggle-icon">&#9776;</span>';

    document.body.insertBefore(nav, document.body.firstChild);
    document.body.insertBefore(toggleBtn, nav.nextSibling);
    document.body.classList.add('aic-sidebar-open');

    // Event listeners
    toggleBtn.addEventListener('click', function() {
      nav.classList.toggle('collapsed');
      document.body.classList.toggle('aic-sidebar-open');
      document.getElementById('toggle-icon').innerHTML = nav.classList.contains('collapsed') ? '&#9776;' : '&#10005;';
    });


    if (isInCampaign) {
      loadCampaignInfo();
    }

    if (window.innerWidth <= 1024) {
      nav.classList.add('collapsed');
      document.body.classList.remove('aic-sidebar-open');
    }
  }

  // Carregar contagem de pagamentos pendentes de confirmacao
  async function loadPendingPaymentsCount() {
    const role = getUserRole();
    if (role !== 'admin') return; // So mostra para admin

    try {
      const response = await fetch('/api/aic/journey/payments/pending');
      if (response.ok) {
        const data = await response.json();
        const count = data.count || 0;
        const badge = document.getElementById('pending-payments-badge');
        if (badge) {
          if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline-block';
          } else {
            badge.style.display = 'none';
          }
        }
      }
    } catch (e) {
      console.error('Erro ao carregar pagamentos pendentes:', e);
    }
  }

  // Carregar contagem de reunioes de fechamento nao vistas
  async function loadUnseenReunioesCount() {
    const role = getUserRole();
    if (role !== 'admin') return; // So mostra para admin

    try {
      const response = await fetch('/api/aic/lead-deliveries/unseen-reunioes');
      if (response.ok) {
        const data = await response.json();
        const count = data.unseen_count || 0;
        const badge = document.getElementById('unseen-reunioes-badge');
        if (badge) {
          if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline-block';
          } else {
            badge.style.display = 'none';
          }
        }
      }
    } catch (e) {
      console.error('Erro ao carregar reunioes nao vistas:', e);
    }
  }

  // Funcao de logout global
  window.aicLogout = async function() {
    try {
      if (window.supabase) {
        await window.supabase.auth.signOut();
      }
      localStorage.removeItem('aic_user_role');
      localStorage.removeItem('aic_client_token');
      window.location.href = '/aic/login';
    } catch (e) {
      console.error('Erro ao fazer logout:', e);
      window.location.href = '/aic/login';
    }
  };

  // Inicializar
  buildSidebar();

  // Carregar badges de notificacao (apenas admin)
  loadPendingPaymentsCount();
  loadUnseenReunioesCount();
})();
