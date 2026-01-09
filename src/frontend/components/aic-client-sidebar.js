/**
 * AIC Client Sidebar Component
 * Menu lateral de navegacao para o Portal do Cliente
 * Controla acesso baseado na etapa atual da jornada
 */

(function() {
  const currentPath = window.location.pathname;

  // Ordem das etapas da jornada
  const STEP_ORDER = [
    'proposta_enviada',
    'proposta_visualizada',
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
      icon: '&#x1F3E0;',
      path: '/cliente',
      alwaysVisible: true,
      requiredSteps: []
    },
    {
      id: 'proposta',
      label: 'Proposta',
      icon: '&#x1F4E7;',
      path: '/cliente/proposta',
      requiredSteps: ['proposta_enviada'],
      completedAt: 'proposta_visualizada',
      tip: 'Analise a proposta e aceite para continuar'
    },
    {
      id: 'contrato',
      label: 'Contrato',
      icon: '&#x1F4DD;',
      path: '/cliente/contrato',
      requiredSteps: ['proposta_visualizada'],
      completedAt: 'contrato_assinado',
      tip: 'Leia e assine o contrato de prestacao de servicos'
    },
    {
      id: 'pagamento',
      label: 'Pagamento',
      icon: '&#x1F4B3;',
      path: '/cliente/pagamento',
      requiredSteps: ['contrato_assinado'],
      completedAt: 'pagamento_confirmado',
      tip: 'Realize o pagamento de 50% para iniciar'
    },
    {
      id: 'credenciais',
      label: 'Credenciais',
      icon: '&#x1F511;',
      path: '/cliente/credenciais',
      requiredSteps: ['pagamento_confirmado'],
      completedAt: 'credenciais_ok',
      tip: 'Conecte seu WhatsApp e Instagram'
    },
    {
      id: 'briefing',
      label: 'Briefing',
      icon: '&#x1F4CB;',
      path: '/cliente/briefing',
      requiredSteps: ['credenciais_ok'],
      completedAt: 'briefing_completo',
      tip: 'Preencha as informacoes do seu negocio'
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: '&#x1F4CA;',
      path: '/cliente/dashboard',
      requiredSteps: ['briefing_completo'],
      tip: 'Acompanhe as metricas da sua campanha'
    },
    {
      id: 'leads',
      label: 'Leads Entregues',
      icon: '&#x1F4B0;',
      path: '/cliente/leads',
      requiredSteps: ['campanha_ativa'],
      tip: 'Veja os leads quentes gerados'
    },
    {
      id: 'faturas',
      label: 'Faturas',
      icon: '&#x1F9FE;',
      path: '/cliente/faturas',
      requiredSteps: ['contrato_assinado'],
      tip: 'Acompanhe suas faturas e pagamentos'
    }
  ];

  // CSS do Sidebar
  const styles = `
    .aic-client-sidebar {
      position: fixed;
      left: 0;
      top: 0;
      width: 280px;
      height: 100vh;
      background: linear-gradient(180deg, #0C1B33 0%, #091525 100%);
      border-right: 1px solid #1e3a5f;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      transition: transform 0.3s ease;
    }
    .aic-client-sidebar.collapsed { transform: translateX(-280px); }

    .aic-client-sidebar-toggle {
      position: fixed;
      left: 280px;
      top: 20px;
      width: 36px;
      height: 36px;
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
      font-size: 18px;
    }
    .aic-client-sidebar.collapsed + .aic-client-sidebar-toggle { left: 0; }
    .aic-client-sidebar-toggle:hover { background: #1a3055; color: #0ECC97; }

    .aic-client-sidebar-header {
      padding: 24px 20px;
      border-bottom: 1px solid #1e3a5f;
    }
    .aic-client-sidebar-logo {
      height: 36px;
      width: auto;
      margin-bottom: 16px;
    }
    .aic-client-sidebar-user {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .aic-client-sidebar-avatar {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #0ECC97 0%, #0BA578 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      color: #0C1B33;
    }
    .aic-client-sidebar-user-info h3 {
      color: #FDFDFD;
      font-size: 15px;
      font-weight: 600;
      margin: 0;
      line-height: 1.3;
    }
    .aic-client-sidebar-user-info p {
      color: #64748b;
      font-size: 12px;
      margin: 0;
    }

    .aic-client-sidebar-progress {
      padding: 20px;
      border-bottom: 1px solid #1e3a5f;
    }
    .aic-client-sidebar-progress-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .aic-client-sidebar-progress-label span {
      color: #94a3b8;
      font-size: 12px;
    }
    .aic-client-sidebar-progress-label strong {
      color: #0ECC97;
      font-size: 14px;
    }
    .aic-client-sidebar-progress-bar {
      height: 6px;
      background: #1a3055;
      border-radius: 3px;
      overflow: hidden;
    }
    .aic-client-sidebar-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #0ECC97 0%, #0BA578 100%);
      border-radius: 3px;
      transition: width 0.5s ease;
    }

    .aic-client-sidebar-nav {
      flex: 1;
      padding: 16px 0;
      overflow-y: auto;
    }

    .aic-client-sidebar-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 20px;
      color: #94a3b8;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
      border-left: 3px solid transparent;
      position: relative;
    }
    .aic-client-sidebar-item:hover:not(.locked) {
      background: rgba(14, 204, 151, 0.05);
      color: #FDFDFD;
    }
    .aic-client-sidebar-item.active {
      background: rgba(14, 204, 151, 0.1);
      color: #0ECC97;
      border-left-color: #0ECC97;
    }
    .aic-client-sidebar-item.completed {
      color: #FDFDFD;
    }
    .aic-client-sidebar-item.locked {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .aic-client-sidebar-item.current {
      background: rgba(59, 130, 246, 0.1);
      color: #60a5fa;
      border-left-color: #60a5fa;
    }

    .aic-client-sidebar-item-icon {
      font-size: 18px;
      width: 24px;
      text-align: center;
    }
    .aic-client-sidebar-item-label { flex: 1; }

    .aic-client-sidebar-item-status {
      font-size: 14px;
    }
    .aic-client-sidebar-item-status.completed { color: #0ECC97; }
    .aic-client-sidebar-item-status.current { color: #60a5fa; }
    .aic-client-sidebar-item-status.locked { color: #475569; }

    .aic-client-sidebar-tip {
      margin: 0 12px 16px;
      padding: 14px 16px;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 12px;
    }
    .aic-client-sidebar-tip-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #60a5fa;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .aic-client-sidebar-tip-text {
      color: #94a3b8;
      font-size: 13px;
      line-height: 1.5;
    }

    .aic-client-sidebar-footer {
      padding: 16px 20px;
      border-top: 1px solid #1e3a5f;
    }
    .aic-client-sidebar-logout {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #64748b;
      text-decoration: none;
      font-size: 13px;
      padding: 10px 12px;
      border-radius: 8px;
      transition: all 0.2s;
      cursor: pointer;
      background: none;
      border: none;
      width: 100%;
    }
    .aic-client-sidebar-logout:hover {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }

    .aic-client-sidebar-help {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #64748b;
      text-decoration: none;
      font-size: 13px;
      padding: 10px 12px;
      border-radius: 8px;
      transition: all 0.2s;
      margin-bottom: 8px;
    }
    .aic-client-sidebar-help:hover {
      background: rgba(14, 204, 151, 0.1);
      color: #0ECC97;
    }

    body.aic-client-sidebar-open { margin-left: 280px; }
    body.aic-client-sidebar-open .header { margin-left: 280px; width: calc(100% - 280px); }

    @media (max-width: 1024px) {
      .aic-client-sidebar { transform: translateX(-280px); }
      .aic-client-sidebar.open { transform: translateX(0); }
      .aic-client-sidebar-toggle { left: 0; }
      .aic-client-sidebar.open + .aic-client-sidebar-toggle { left: 280px; }
      body.aic-client-sidebar-open { margin-left: 0; }
      body.aic-client-sidebar-open .header { margin-left: 0; width: 100%; }
    }
  `;

  // Adicionar CSS
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Estado da jornada (será carregado da API)
  let journeyState = {
    clientName: 'Carregando...',
    currentStep: 'proposta_enviada',
    progress: 0,
    campaignId: null,
    journeyId: null
  };

  // Verificar se etapa está acessível
  function isStepAccessible(requiredSteps) {
    if (!requiredSteps || requiredSteps.length === 0) return true;
    const currentIndex = STEP_ORDER.indexOf(journeyState.currentStep);
    return requiredSteps.some(step => {
      const requiredIndex = STEP_ORDER.indexOf(step);
      return currentIndex >= requiredIndex;
    });
  }

  // Verificar se etapa está completa
  function isStepCompleted(completedAt) {
    if (!completedAt) return false;
    const currentIndex = STEP_ORDER.indexOf(journeyState.currentStep);
    const completedIndex = STEP_ORDER.indexOf(completedAt);
    return currentIndex > completedIndex;
  }

  // Verificar se é etapa atual
  function isCurrentStep(item) {
    if (!item.completedAt) return false;
    const accessible = isStepAccessible(item.requiredSteps);
    const completed = isStepCompleted(item.completedAt);
    return accessible && !completed;
  }

  // Verificar página ativa
  function isActivePage(path) {
    if (path === '/cliente' && currentPath === '/cliente') return true;
    if (path !== '/cliente' && currentPath.startsWith(path)) return true;
    return false;
  }

  // Obter iniciais do nome
  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  // Encontrar dica atual
  function getCurrentTip() {
    for (const item of MENU_ITEMS) {
      if (isCurrentStep(item) && item.tip) {
        return { label: item.label, tip: item.tip };
      }
    }
    return null;
  }

  // Criar elemento do sidebar
  function renderSidebar() {
    const nav = document.createElement('nav');
    nav.className = 'aic-client-sidebar';
    nav.id = 'aic-client-sidebar';

    // Header
    let html = `
      <div class="aic-client-sidebar-header">
        <img src="/assets/AIC/Imagens%20Vetor%20/Logo%20Completo%20nome%20Branco%20sem%20fundo.png" alt="AIC" class="aic-client-sidebar-logo">
        <div class="aic-client-sidebar-user">
          <div class="aic-client-sidebar-avatar">${getInitials(journeyState.clientName)}</div>
          <div class="aic-client-sidebar-user-info">
            <h3>${journeyState.clientName}</h3>
            <p>Portal do Cliente</p>
          </div>
        </div>
      </div>
    `;

    // Progress
    html += `
      <div class="aic-client-sidebar-progress">
        <div class="aic-client-sidebar-progress-label">
          <span>Progresso da Jornada</span>
          <strong>${journeyState.progress}%</strong>
        </div>
        <div class="aic-client-sidebar-progress-bar">
          <div class="aic-client-sidebar-progress-fill" style="width: ${journeyState.progress}%"></div>
        </div>
      </div>
    `;

    // Nav items
    html += '<div class="aic-client-sidebar-nav">';

    for (const item of MENU_ITEMS) {
      const accessible = item.alwaysVisible || isStepAccessible(item.requiredSteps);
      const completed = isStepCompleted(item.completedAt);
      const current = isCurrentStep(item);
      const active = isActivePage(item.path);

      let statusIcon = '';
      let className = 'aic-client-sidebar-item';

      if (active) {
        className += ' active';
        statusIcon = '';
      } else if (completed) {
        className += ' completed';
        statusIcon = '<span class="aic-client-sidebar-item-status completed">&#x2713;</span>';
      } else if (current) {
        className += ' current';
        statusIcon = '<span class="aic-client-sidebar-item-status current">&#x25CF;</span>';
      } else if (!accessible) {
        className += ' locked';
        statusIcon = '<span class="aic-client-sidebar-item-status locked">&#x1F512;</span>';
      }

      const href = accessible ? item.path : '#';
      const onclick = accessible ? '' : 'onclick="event.preventDefault(); alert(\'Complete as etapas anteriores primeiro.\');"';

      html += `
        <a href="${href}" class="${className}" ${onclick}>
          <span class="aic-client-sidebar-item-icon">${item.icon}</span>
          <span class="aic-client-sidebar-item-label">${item.label}</span>
          ${statusIcon}
        </a>
      `;
    }

    html += '</div>';

    // Tip
    const currentTip = getCurrentTip();
    if (currentTip) {
      html += `
        <div class="aic-client-sidebar-tip">
          <div class="aic-client-sidebar-tip-title">
            <span>&#x1F4A1;</span> Proximo Passo: ${currentTip.label}
          </div>
          <p class="aic-client-sidebar-tip-text">${currentTip.tip}</p>
        </div>
      `;
    }

    // Footer
    html += `
      <div class="aic-client-sidebar-footer">
        <a href="https://wa.me/5511999999999" target="_blank" class="aic-client-sidebar-help">
          <span>&#x1F4AC;</span> Precisa de ajuda?
        </a>
        <button class="aic-client-sidebar-logout" onclick="window.aicClientLogout()">
          <span>&#x1F6AA;</span> Sair
        </button>
      </div>
    `;

    nav.innerHTML = html;
    return nav;
  }

  // Toggle button
  function renderToggle() {
    const btn = document.createElement('button');
    btn.className = 'aic-client-sidebar-toggle';
    btn.id = 'aic-client-sidebar-toggle';
    btn.title = 'Toggle Menu';
    btn.innerHTML = '<span id="client-toggle-icon">&#9776;</span>';
    return btn;
  }

  // Logout function
  window.aicClientLogout = async function() {
    try {
      // Clear Supabase session if available
      if (window.supabase) {
        await window.supabase.auth.signOut();
      }
      // Clear local storage
      localStorage.removeItem('aic_client_journey');
      localStorage.removeItem('aic_client_token');
      // Redirect to login
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
      const cached = localStorage.getItem('aic_client_journey');
      if (cached) {
        const data = JSON.parse(cached);
        if (data && data.currentStep) {
          journeyState = { ...journeyState, ...data };
        }
      }

      // Buscar dados atualizados da API
      const response = await fetch('/api/aic/journey/me', {
        headers: {
          'Authorization': 'Bearer ' + (localStorage.getItem('aic_client_token') || '')
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.journey) {
          journeyState = {
            clientName: data.journey.client_name || 'Cliente',
            currentStep: data.journey.current_step || 'proposta_enviada',
            progress: data.journey.progress || 0,
            campaignId: data.journey.campaign_id,
            journeyId: data.journey.id
          };
          // Cachear para acesso rápido
          localStorage.setItem('aic_client_journey', JSON.stringify(journeyState));
        }
      } else if (response.status === 401) {
        // Não autenticado - redirecionar para login
        window.location.href = '/cliente/login';
        return;
      }
    } catch (e) {
      console.error('Erro ao carregar jornada:', e);
    }

    // Renderizar sidebar
    const sidebar = renderSidebar();
    const toggle = renderToggle();

    document.body.insertBefore(sidebar, document.body.firstChild);
    document.body.insertBefore(toggle, sidebar.nextSibling);
    document.body.classList.add('aic-client-sidebar-open');

    // Event listeners
    toggle.addEventListener('click', function() {
      sidebar.classList.toggle('collapsed');
      document.body.classList.toggle('aic-client-sidebar-open');
      document.getElementById('client-toggle-icon').innerHTML =
        sidebar.classList.contains('collapsed') ? '&#9776;' : '&#10005;';
    });

    // Mobile handling
    if (window.innerWidth <= 1024) {
      sidebar.classList.add('collapsed');
      document.body.classList.remove('aic-client-sidebar-open');
    }
  }

  // Verificar se deve carregar o sidebar
  // Só carrega em páginas do portal do cliente, exceto login
  if (currentPath.startsWith('/cliente') && !currentPath.includes('/login')) {
    loadJourney();
  }
})();
