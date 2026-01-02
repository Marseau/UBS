/**
 * AIC Sidebar Component
 * Menu lateral de navegacao para paginas admin AIC
 */

(function() {
  const urlParams = new URLSearchParams(window.location.search);
  const campaignId = urlParams.get('campaign');
  const currentPath = window.location.pathname;

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
    .aic-sidebar-submenu.open { max-height: 200px; }
    .aic-sidebar-submenu .aic-sidebar-link { padding-left: 40px; font-size: 13px; }
    .aic-sidebar-campaign-badge {
      margin: 0 20px 16px;
      padding: 12px;
      background: rgba(14, 204, 151, 0.1);
      border: 1px solid rgba(14, 204, 151, 0.2);
      border-radius: 8px;
    }
    .aic-sidebar-campaign-badge-label {
      font-size: 10px;
      color: #0ECC97;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .aic-sidebar-campaign-badge-name {
      font-size: 13px;
      color: #FDFDFD;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
    return currentPath.includes(page);
  }

  // Funcao para verificar secao dashboard
  function isDashboardSection() {
    return isActive('campaigns-dashboard') || isActive('dashboard-campaign') || isActive('dashboard-prova');
  }

  // Carregar nome da campanha
  async function loadCampaignName() {
    if (!campaignId) return;
    try {
      const response = await fetch('/api/campaigns/' + campaignId);
      if (response.ok) {
        const data = await response.json();
        const name = data.campaign_name || data.name || 'Campanha';
        const badge = document.querySelector('.aic-sidebar-campaign-badge-name');
        if (badge) badge.textContent = name;
      }
    } catch (e) {
      console.error('Erro ao carregar nome da campanha:', e);
    }
  }

  // Criar elemento do sidebar
  const nav = document.createElement('nav');
  nav.className = 'aic-sidebar';
  nav.id = 'aic-sidebar';

  // Header
  nav.innerHTML = '<div class="aic-sidebar-header">' +
    '<img src="/assets/AIC/Imagens%20Vetor%20/LOGO%20completo%20sem%20fundo%20Icone%20cheio%20e%20nome%20cheio.png" alt="AIC" class="aic-sidebar-logo">' +
    '</div>';

  // Campaign badge
  if (campaignId) {
    nav.innerHTML += '<div class="aic-sidebar-campaign-badge">' +
      '<div class="aic-sidebar-campaign-badge-label">Campanha Ativa</div>' +
      '<div class="aic-sidebar-campaign-badge-name">Carregando...</div>' +
      '</div>';
  }

  // Nav content
  var navContent = '<div class="aic-sidebar-nav">';

  // Secao Principal
  navContent += '<div class="aic-sidebar-section">';
  navContent += '<div class="aic-sidebar-section-title">Principal</div>';

  // Dashboard toggle
  navContent += '<div class="aic-sidebar-submenu-toggle' + (isDashboardSection() ? ' active open' : '') + '" id="dashboard-toggle">';
  navContent += '<div class="aic-sidebar-submenu-toggle-left">Dashboard</div>';
  navContent += '<span class="aic-sidebar-submenu-arrow">&#9654;</span>';
  navContent += '</div>';

  // Dashboard submenu
  navContent += '<div class="aic-sidebar-submenu' + (isDashboardSection() ? ' open' : '') + '" id="dashboard-submenu">';
  navContent += '<a href="/aic-campaigns-dashboard.html" class="aic-sidebar-link' + (isActive('campaigns-dashboard') ? ' active' : '') + '">Campanhas</a>';
  navContent += '<a href="/aic-dashboard-campaign.html" class="aic-sidebar-link' + (isActive('dashboard-campaign') && !isActive('campaigns-dashboard') ? ' active' : '') + '">Visao Geral</a>';
  navContent += '</div>';
  navContent += '</div>';

  // Secao Campanha Atual (se tiver campaign ID)
  if (campaignId) {
    navContent += '<div class="aic-sidebar-section">';
    navContent += '<div class="aic-sidebar-section-title">Campanha Atual</div>';
    navContent += '<a href="/aic-campaign-briefing.html?campaign=' + campaignId + '" class="aic-sidebar-link' + (isActive('briefing') ? ' active' : '') + '">Briefing</a>';
    navContent += '<a href="/aic-dashboard-prova.html?campaign=' + campaignId + '" class="aic-sidebar-link' + (isActive('dashboard-prova') ? ' active' : '') + '">Analytics</a>';
    navContent += '<a href="/aic-campaign-onboarding.html?campaign=' + campaignId + '" class="aic-sidebar-link' + (isActive('onboarding') ? ' active' : '') + '">Credenciais</a>';
    navContent += '</div>';
  }

  // Secao Inteligencia
  navContent += '<div class="aic-sidebar-section">';
  navContent += '<div class="aic-sidebar-section-title">Inteligencia</div>';
  navContent += '<a href="/cluster-intention-dashboard.html" class="aic-sidebar-link' + (isActive('cluster-intention') ? ' active' : '') + '">Clusters</a>';
  navContent += '<a href="/dynamic-intelligence-dashboard.html" class="aic-sidebar-link' + (isActive('dynamic-intelligence') ? ' active' : '') + '">Dynamic Intelligence</a>';
  navContent += '</div>';

  // Secao Documentacao
  navContent += '<div class="aic-sidebar-section">';
  navContent += '<div class="aic-sidebar-section-title">Documentacao</div>';
  navContent += '<a href="/aic-docs.html" class="aic-sidebar-link' + (isActive('aic-docs') ? ' active' : '') + '">Central de Docs</a>';
  navContent += '<a href="/aic-proposta-comercial.html" class="aic-sidebar-link' + (isActive('proposta') ? ' active' : '') + '">Proposta Comercial</a>';
  navContent += '</div>';

  navContent += '</div>';

  // Footer
  navContent += '<div class="aic-sidebar-footer">';
  navContent += '<a href="/aic" class="aic-sidebar-footer-link">← Voltar para Landing</a>';
  navContent += '</div>';

  nav.innerHTML += navContent;

  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'aic-sidebar-toggle';
  toggleBtn.id = 'aic-sidebar-toggle';
  toggleBtn.title = 'Toggle Menu';
  toggleBtn.innerHTML = '<span id="toggle-icon">&#9776;</span>';

  // Inserir no DOM
  document.body.insertBefore(nav, document.body.firstChild);
  document.body.insertBefore(toggleBtn, nav.nextSibling);
  document.body.classList.add('aic-sidebar-open');

  // Event listeners
  toggleBtn.addEventListener('click', function() {
    nav.classList.toggle('collapsed');
    document.body.classList.toggle('aic-sidebar-open');
    document.getElementById('toggle-icon').innerHTML = nav.classList.contains('collapsed') ? '&#9776;' : '&#10005;';
  });

  var dashboardToggle = document.getElementById('dashboard-toggle');
  var dashboardSubmenu = document.getElementById('dashboard-submenu');
  if (dashboardToggle && dashboardSubmenu) {
    dashboardToggle.addEventListener('click', function() {
      dashboardToggle.classList.toggle('open');
      dashboardSubmenu.classList.toggle('open');
    });
  }

  loadCampaignName();

  if (window.innerWidth <= 1024) {
    nav.classList.add('collapsed');
    document.body.classList.remove('aic-sidebar-open');
  }
})();
