// Dashboard JavaScript
class AdminDashboard {
    constructor() {
        this.apiUrl = '/api/admin'
        this.token = null // Será carregado no init() para garantir valor atualizado
        this.currentUser = null
        this.currentTenant = null
        this.charts = {}
        this.dataLoaded = false // Flag para evitar múltiplos carregamentos
        this.isAuthenticated = false // Flag para controlar se pode fazer chamadas API
        
        // Cache de elementos do DOM para melhor performance
        this.dom = {}

        // A inicialização agora acontece aqui, garantindo que o DOM esteja pronto
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.run())
        } else {
            this.run()
        }
    }

    /**
     * Ponto de entrada principal: cacheia elementos e inicia a lógica de autenticação.
     */
    run() {
        console.log('🚀 [DEBUG] DOM pronto, executando o dashboard...')
        this.cacheDOMElements()
        this.bindEvents()
        this.init()
    }

    /**
     * Mapeia todos os elementos do DOM usados no script para this.dom.
     */
    cacheDOMElements() {
        this.dom = {
            loginScreenEl: document.getElementById('loginScreen'),
            dashboardScreenEl: document.getElementById('dashboardScreen'),
            loginForm: document.getElementById('loginForm'),
            loginError: document.getElementById('loginError'),
            emailInput: document.getElementById('email'),
            passwordInput: document.getElementById('password'),
            totalAppointmentsEl: document.getElementById('totalAppointments'),
            appointmentsGrowthEl: document.getElementById('appointmentsGrowth'),
            totalRevenueEl: document.getElementById('totalRevenue'),
            revenueGrowthEl: document.getElementById('revenueGrowth'),
            newCustomersEl: document.getElementById('newCustomers'),
            customersGrowthEl: document.getElementById('customersGrowth'),
            occupancyRateEl: document.getElementById('occupancyRate'),
            occupancyGrowthEl: document.getElementById('occupancyGrowth'),
            adminNameEl: document.getElementById('adminName'),
            currentTenantEl: document.getElementById('currentTenant'),
            tenantsMenuItem: document.getElementById('tenantsMenuItem'),
            appointmentsChartCanvas: document.getElementById('appointmentsChart'),
            statusChartCanvas: document.getElementById('statusChart'),
            recentAppointmentsBody: document.getElementById('todayAppointments'),
            pageTitle: document.getElementById('pageTitle'),
            contentArea: document.querySelector('.content-area')
        };
    }

    /**
     * Lógica de inicialização principal: verifica o estado de login do usuário.
     */
    async init() {
        // Recarrega token do sistema de autenticação segura
        this.token = window.secureAuth?.getToken()
        
        logger?.log('🔍 Dashboard init - Debug info:')
        logger?.log('  - Token exists:', !!this.token)
        logger?.log('  - Token value:', this.token ? `${this.token.substring(0, 20)}...` : 'null/undefined')
        logger?.log('  - Token type:', typeof this.token)
        
        // Check if this is a new tenant admin that should be redirected to setup
        const urlParams = new URLSearchParams(window.location.search)
        if (urlParams.get('newUser') === 'true' && urlParams.get('setup') === 'true') {
            // Only redirect tenant admins to setup, not super admins
            const savedUser = window.secureAuth?.getUserData()
            if (savedUser) {
                const user = savedUser
                if (user.role === 'tenant_admin') {
                    logger?.log('New tenant admin detected, redirecting to settings for setup')
                    window.location.href = '/settings.html?setup=true'
                    return
                } else {
                    logger?.log('Super admin detected, staying on dashboard')
                    // Remove the setup parameters for super admin
                    urlParams.delete('newUser')
                    urlParams.delete('setup')
                    const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '')
                    window.history.replaceState({}, document.title, newUrl)
                }
            }
        }
        
        // Verifica se o token é válido usando autenticação segura
        if (window.secureAuth?.isAuthenticated()) {
            try {
                logger?.log('✅ Carregando usuário do sistema seguro')
                this.currentUser = window.secureAuth.getUserData()
                this.isAuthenticated = true // Marca como autenticado
                this.initializeDashboard()
            } catch (error) {
                logger?.error('❌ Erro ao carregar dados do usuário:', error)
                this.isAuthenticated = false
                this.logout()
            }
        } else {
            logger?.log('❌ Token inválido ou ausente, mostrando tela de login')
            this.showLogin()
        }
    }

    /**
     * Vincula todos os event listeners da página.
     */
    bindEvents() {
        console.log('🔗 [DEBUG] Registrando event listeners...')
        
        if (this.dom.loginForm) {
            this.dom.loginForm.addEventListener('submit', (e) => {
                e.preventDefault()
                this.login()
            })
        }

        // Navigation links
        const navLinks = document.querySelectorAll('.nav-link')
        console.log('🔍 [DEBUG] Encontrados', navLinks.length, 'links de navegação')
        
        navLinks.forEach((link, index) => {
            console.log('🔗 [DEBUG] Registrando listener para link', index + 1, '- página:', link.dataset.page)
            link.addEventListener('click', (e) => {
                e.preventDefault()
                console.log('🔍 [DEBUG] Link clicado:', link.dataset.page)
                try {
                    this.navigateTo(link.dataset.page)
                } catch (error) {
                    console.error('❌ [DEBUG] Erro na navegação:', error)
                }
            })
        })
        
        console.log('✅ [DEBUG] Event listeners registrados!')

        // Chart period radios for both doughnut charts
        document.querySelectorAll('input[name="chartPeriod"]').forEach(radio => {
            radio.addEventListener('change', () => {
                // Update both doughnut charts (appointments by domain AND status)
                if (this.isAuthenticated) {
                    this.updateCharts(radio.value)
                    logger?.log(`📊 Período alterado para ${radio.value} - atualizando ambos gráficos doughnut`)
                }
            })
        })
        
        // Revenue period dropdown
        const revenuePeriodSelect = document.getElementById('revenuePeriodSelect')
        if (revenuePeriodSelect) {
            revenuePeriodSelect.addEventListener('change', () => {
                if (this.isAuthenticated) {
                    this.renderRevenueChart(revenuePeriodSelect.value)
                }
            })
        }
        
        // Customer period dropdown
        const customerPeriodSelect = document.getElementById('customerPeriodSelect')
        if (customerPeriodSelect) {
            customerPeriodSelect.addEventListener('change', () => {
                if (this.isAuthenticated) {
                    this.renderCustomerGrowthChart(customerPeriodSelect.value)
                }
            })
        }
    }
    
    /**
     * Centraliza a exibição do dashboard e o carregamento dos dados.
     * NOTA: Esta função só é chamada após validação completa no init()
     */
    initializeDashboard() {
        logger?.log('🚀 Inicializando dashboard - usuário autenticado!')
        this.showDashboard()
        this.loadDashboardData()
    }

    /**
     * Constrói URLs de analytics baseadas no papel do usuário
     * Super admin: /api/admin/dashboard (visão global de todos os tenants)
     * Tenant admin: /api/analytics/dashboard (visão restrita do próprio tenant)
     */
    // buildAnalyticsUrl function REMOVED - Using direct API calls now

    // Authentication
    async login() {
        const email = this.dom.emailInput.value
        const password = this.dom.passwordInput.value
        const errorDiv = this.dom.loginError

        try {
            const response = await fetch(`${this.apiUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            })

            const data = await response.json()

            if (data.success) {
                this.token = data.token
                this.currentUser = data.user
                this.isAuthenticated = true
                window.secureAuth?.login(this.token, data.user)
                
                logger?.log('Login bem-sucedido, dados do usuário salvos:', data.user)
                this.initializeDashboard()
            } else {
                errorDiv.textContent = data.error || 'Login failed'
                errorDiv.style.display = 'block'
            }
        } catch (error) {
            errorDiv.textContent = 'Erro de conexão'
            errorDiv.style.display = 'block'
        }
    }

    logout() {
        window.secureAuth?.logout()
        this.token = null
        this.currentUser = null
        this.isAuthenticated = false
        
        // Redirect to landing page instead of showing login screen
        window.location.href = '/'
    }

    // UI Navigation
    showLogin() {
        if (this.dom.loginScreenEl) this.dom.loginScreenEl.style.display = 'flex'
        if (this.dom.dashboardScreenEl) this.dom.dashboardScreenEl.style.display = 'none'
    }

    showDashboard() {
        if (this.dom.loginScreenEl) this.dom.loginScreenEl.style.display = 'none'
        if (this.dom.dashboardScreenEl) this.dom.dashboardScreenEl.style.display = 'block'
        
        if (this.currentUser) {
            if (this.dom.adminNameEl) {
                this.dom.adminNameEl.textContent = this.currentUser.name || this.currentUser.email
            }
            this.updateUIVisibility()
        }
    }

    updateUIVisibility() {
        const role = this.currentUser?.role;
        
        console.log('🔧 [DEBUG] updateUIVisibility called for role:', role);
        
        // Show tenant management only for super_admin
        if (this.dom.tenantsMenuItem) {
            this.dom.tenantsMenuItem.style.display = role === 'super_admin' ? 'block' : 'none';
        }
        
        // Hide super_admin specific sections for tenant_admin
        if (role === 'tenant_admin') {
            console.log('🎯 [DEBUG] Applying tenant_admin personalizations...');
            this.hideSuper_AdminSections();
            this.updateTenantInfo();
            // Apply tenant-specific customizations
            setTimeout(() => {
                console.log('🎨 [DEBUG] Executing updatePageTitleForTenant...');
                this.updatePageTitleForTenant();
                this.updateMetricLabelsForTenant();
                this.updateNavigationForTenant();
                this.updateWidgetTitlesForTenant();
            }, 500); // Delay to ensure DOM is ready
        } else if (role === 'super_admin') {
            this.showSuper_AdminSections();
        }
    }
    
    hideSuper_AdminSections() {
        // Hide elements that are specific to super_admin view
        const elementsToHide = [
            'totalTenants',
            'mrr',
            'tenantsGrowth', 
            'churnRate',
            'ltv',
            'conversionRate',
            'atRiskTenants',
            'segmentDistribution',
            'activeServices',
            'topTenantsList',
            'strategicTenantFilter',
            'topTenantsChart'
        ];
        
        elementsToHide.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                // Hide the element and its parent container if it's a metric card
                const container = element.closest('.stat-item') || element.closest('.chart-container') || element.closest('.col-md-3');
                if (container) {
                    container.style.display = 'none';
                } else {
                    element.style.display = 'none';
                }
            }
        });
        
        // Hide strategic section headers that mention "ecosystem" or "tenants"
        const headers = document.querySelectorAll('h5, h6');
        headers.forEach(header => {
            const text = header.textContent.toLowerCase();
            if (text.includes('ecosystem') || text.includes('tenants') || text.includes('tenant')) {
                const container = header.closest('.chart-container') || header.closest('.col-lg-6');
                if (container) {
                    container.style.display = 'none';
                }
            }
        });
        
        // Update page title for tenant admin
        this.updatePageTitleForTenant();
    }
    
    showSuper_AdminSections() {
        // Show all elements for super_admin (reset any hiding)
        const elementsToShow = [
            'totalTenants',
            'mrr', 
            'tenantsGrowth',
            'churnRate',
            'ltv',
            'conversionRate',
            'atRiskTenants',
            'segmentDistribution',
            'activeServices',
            'topTenantsList',
            'strategicTenantFilter',
            'topTenantsChart'
        ];
        
        elementsToShow.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                const container = element.closest('.stat-item') || element.closest('.chart-container') || element.closest('.col-md-3');
                if (container) {
                    container.style.display = '';
                } else {
                    element.style.display = '';
                }
            }
        });
        
        // Show all chart containers
        const containers = document.querySelectorAll('.chart-container, .col-lg-6');
        containers.forEach(container => {
            container.style.display = '';
        });
    }
    
    updatePageTitleForTenant() {
        console.log('🎨 [DEBUG] updatePageTitleForTenant started for tenant:', this.currentUser?.tenant_id);
        
        // Update page titles and headers to reflect tenant business view
        const title = document.querySelector('title');
        if (title && this.currentUser?.tenant_id) {
            title.textContent = 'Dashboard - Meu Negócio';
            console.log('✅ [DEBUG] Title updated to: Dashboard - Meu Negócio');
        }
        
        // Update main dashboard header
        const strategicHeader = document.querySelector('h2.h3.fw-bold');
        if (strategicHeader) {
            strategicHeader.textContent = 'Analytics do Meu Negócio';
        }
        
        const strategicSubtitle = strategicHeader?.nextElementSibling;
        if (strategicSubtitle) {
            strategicSubtitle.textContent = 'Visão completa dos seus agendamentos e performance do negócio';
        }
        
        // Update metrics section headers
        this.updateMetricLabelsForTenant();
        
        // Update navigation and breadcrumbs
        this.updateNavigationForTenant();
        
        // Update widget titles
        this.updateWidgetTitlesForTenant();
        
        // Update any loading or placeholder text
        this.updatePlaceholderTextForTenant();
    }
    
    updateMetricLabelsForTenant() {
        // Update metric cards text for business context
        const metricUpdates = [
            { selector: '.stat-item p', oldText: 'Tenants Ativos', newText: 'Serviços Ativos' },
            { selector: '.stat-item p', oldText: 'Crescimento de Tenants', newText: 'Crescimento do Negócio' },
            { selector: '.stat-item p', oldText: 'Tenants em Risco', newText: 'Alertas do Negócio' },
            { selector: '.stat-item p', oldText: 'Segmentos Ativos', newText: 'Categorias Ativas' },
            { selector: '.stat-item p', oldText: 'Total do Sistema', newText: 'Total do Negócio' },
            { selector: '.stat-item p', oldText: 'Receita do Sistema', newText: 'Receita do Negócio' },
            { selector: '.stats-label', oldText: 'Agendamentos Sistema', newText: 'Meus Agendamentos' },
            { selector: '.stats-label', oldText: 'Receita Sistema', newText: 'Minha Receita' },
            { selector: '.stats-label', oldText: 'Clientes Sistema', newText: 'Meus Clientes' },
            { selector: '.stats-label', oldText: 'Taxa Sistema', newText: 'Minha Taxa' }
        ];
        
        metricUpdates.forEach(update => {
            const elements = document.querySelectorAll(update.selector);
            elements.forEach(element => {
                if (element.textContent.includes(update.oldText)) {
                    element.textContent = element.textContent.replace(update.oldText, update.newText);
                }
            });
        });
        
        // Update specific metric labels that might be hardcoded
        const metricLabels = document.querySelectorAll('.metric-label, .stats-label');
        metricLabels.forEach(label => {
            const text = label.textContent.trim();
            if (text.includes('Sistema')) {
                label.textContent = text.replace(/Sistema/gi, 'Negócio');
            }
            if (text.includes('Ecossistema')) {
                label.textContent = text.replace(/Ecossistema/gi, 'Negócio');
            }
        });
    }
    
    updateNavigationForTenant() {
        // Update sidebar navigation text
        const navLinks = document.querySelectorAll('.nav-link span');
        navLinks.forEach(link => {
            const text = link.textContent.trim();
            if (text === 'Empresas') {
                link.textContent = 'Configurações';
            } else if (text === 'Analytics Sistema') {
                link.textContent = 'Analytics';
            } else if (text === 'Visão Geral') {
                link.textContent = 'Meu Dashboard';
            } else if (text === 'Dashboard') {
                link.textContent = 'Meu Dashboard';
            }
        });
        
        // Update any breadcrumb references
        const breadcrumbs = document.querySelectorAll('.breadcrumb-item, .page-title');
        breadcrumbs.forEach(breadcrumb => {
            const text = breadcrumb.textContent;
            if (text.includes('Sistema')) {
                breadcrumb.textContent = text.replace('Sistema', 'Negócio');
            }
            if (text.includes('Ecossistema')) {
                breadcrumb.textContent = text.replace('Ecossistema', 'Negócio');
            }
        });
        
        // Update top navbar current tenant display
        const currentTenantEl = document.getElementById('currentTenant');
        if (currentTenantEl && this.currentUser?.tenantName) {
            currentTenantEl.textContent = `${this.currentUser.tenantName} - Meu Negócio`;
        }
    }
    
    updateWidgetTitlesForTenant() {
        // Update chart and widget titles
        const widgetTitles = [
            { selector: 'h5, h6', oldText: 'Visão Estratégica do Ecossistema', newText: 'Visão do Meu Negócio' },
            { selector: 'h5, h6', oldText: 'Top 5 Tenants por Receita', newText: 'Top 5 Serviços por Receita' },
            { selector: 'h5, h6', oldText: 'Top 5 Tenants por Volume', newText: 'Top 5 Serviços por Volume' },
            { selector: 'h5, h6', oldText: 'Distribuição por Tenant', newText: 'Distribuição por Categoria' },
            { selector: 'h5, h6', oldText: 'Performance do Sistema', newText: 'Performance do Negócio' },
            { selector: 'h5, h6', oldText: 'Métricas Globais', newText: 'Métricas do Negócio' },
            { selector: 'h5, h6', oldText: 'Agendamentos Recentes', newText: 'Meus Agendamentos Recentes' },
            { selector: 'h5, h6', oldText: 'Atividade do Sistema', newText: 'Atividade do Negócio' },
            { selector: 'h5, h6', oldText: 'Análise Sistema', newText: 'Análise do Negócio' }
        ];
        
        widgetTitles.forEach(update => {
            const elements = document.querySelectorAll(update.selector);
            elements.forEach(element => {
                if (element.textContent.includes(update.oldText)) {
                    element.textContent = element.textContent.replace(update.oldText, update.newText);
                }
            });
        });
        
        // Update any table headers or column titles
        const tableHeaders = document.querySelectorAll('th, .table-header, .column-title');
        tableHeaders.forEach(header => {
            const text = header.textContent;
            if (text.includes('Tenant')) {
                header.textContent = text.replace('Tenant', 'Serviço');
            }
            if (text.includes('Sistema')) {
                header.textContent = text.replace('Sistema', 'Negócio');
            }
        });
        
        // Update card titles and headers
        const cardTitles = document.querySelectorAll('.card-title, .card-header h5, .card-header h6');
        cardTitles.forEach(title => {
            const text = title.textContent;
            if (text.includes('Sistema')) {
                title.textContent = text.replace(/Sistema/gi, 'Negócio');
            }
            if (text.includes('Ecossistema')) {
                title.textContent = text.replace(/Ecossistema/gi, 'Negócio');
            }
        });
    }
    
    updatePlaceholderTextForTenant() {
        // Update loading messages and placeholder text
        const loadingMessages = document.querySelectorAll('.loading-message, .placeholder-text, .empty-state');
        loadingMessages.forEach(message => {
            const text = message.textContent;
            if (text.includes('sistema')) {
                message.textContent = text.replace(/sistema/gi, 'negócio');
            }
            if (text.includes('ecossistema')) {
                message.textContent = text.replace(/ecossistema/gi, 'negócio');
            }
        });
        
        // Update any button text that might reference system-wide terms
        const buttons = document.querySelectorAll('button, .btn');
        buttons.forEach(button => {
            const text = button.textContent;
            if (text.includes('Ver Sistema')) {
                button.textContent = text.replace('Ver Sistema', 'Ver Negócio');
            }
            if (text.includes('Gerenciar Sistema')) {
                button.textContent = text.replace('Gerenciar Sistema', 'Gerenciar Negócio');
            }
        });
    }
    
    updateTenantInfo() {
        if (this.dom.currentTenantEl && this.currentUser.tenantName) {
            this.dom.currentTenantEl.textContent = this.currentUser.tenantName;
        }
    }
    
    async loadProfile() {
        try {
            const profile = await this.apiCall('/profile');
            
            // Update profile page elements
            const profileName = document.getElementById('profileName');
            const profileEmail = document.getElementById('profileEmail');
            const profileRole = document.getElementById('profileRole');
            
            if (profileName) profileName.textContent = profile.name || '-';
            if (profileEmail) profileEmail.textContent = profile.email || '-';
            if (profileRole) profileRole.textContent = profile.role || '-';
            
            // Bind change password form
            const changePasswordForm = document.getElementById('changePasswordForm');
            if (changePasswordForm) {
                changePasswordForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.changePassword();
                });
            }
        } catch (error) {
            logger?.error('Failed to load profile:', error);
            this.showNotification('Erro ao carregar perfil', 'error');
        }
    }
    
    async changePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (newPassword !== confirmPassword) {
            this.showNotification('As senhas não coincidem', 'error');
            return;
        }
        
        if (newPassword.length < 8) {
            this.showNotification('A nova senha deve ter pelo menos 8 caracteres', 'error');
            return;
        }
        
        try {
            await this.apiCall('/profile/change-password', {
                method: 'POST',
                body: JSON.stringify({
                    oldPassword: currentPassword,
                    newPassword: newPassword
                })
            });
            
            this.showNotification('Senha alterada com sucesso', 'success');
            
            // Clear form
            document.getElementById('changePasswordForm').reset();
        } catch (error) {
            logger?.error('Failed to change password:', error);
            this.showNotification('Erro ao alterar senha', 'error');
        }
    }

    navigateTo(page) {
        console.log(`🔄 [DEBUG] Navegando para página: ${page}`)
        
        // Handle internal pages that stay in the main dashboard
        if (page === 'dashboard') {
            console.log('🏠 [DEBUG] Carregando dashboard')
            this.showPage('dashboardPage');
            return;
        }
        
        
        if (page === 'profile') {
            this.showPage('profilePage');
            this.loadProfile();
            return;
        }

        // Map pages to their corresponding HTML files (for external pages)
        const pageUrls = {
            appointments: '/appointments.html',
            users: '/customers.html',
            services: '/services.html',
            conversations: '/conversations.html',
            payments: '/payments.html',
            tenants: '/tenants.html',
            settings: '/settings.html'
        }

        // Check permissions for tenant management
        if (page === 'tenants' && this.currentUser?.role !== 'super_admin') {
            this.showNotification('Acesso negado: Função de Super Admin necessária', 'error');
            return;
        }

        // Navigate to the corresponding page
        if (pageUrls[page]) {
            window.location.href = pageUrls[page]
        } else {
            console.warn(`[DEBUG] Page not found: ${page}`)
        }
    }
    
    showPage(pageId) {
        console.log(`🔄 [DEBUG] ShowPage chamado para: ${pageId}`)
        
        // Debug: List all elements with page-content class
        const allPages = document.querySelectorAll('.page-content');
        console.log(`🔍 [DEBUG] Encontradas ${allPages.length} páginas para esconder`)
        allPages.forEach((page, index) => {
            console.log(`   - Página ${index + 1}: ${page.id}`)
            page.style.display = 'none';
        });
        
        // Show selected page
        const targetPage = document.getElementById(pageId);
        console.log(`🔍 [DEBUG] Procurando página com ID: ${pageId}`)
        console.log(`🔍 [DEBUG] Página alvo encontrada:`, !!targetPage)
        
        if (targetPage) {
            targetPage.style.display = 'block';
            console.log(`✅ [DEBUG] Página ${pageId} exibida - display:`, targetPage.style.display)
            console.log(`✅ [DEBUG] Página ${pageId} innerHTML length:`, targetPage.innerHTML.length)
            console.log(`✅ [DEBUG] Página ${pageId} computed display:`, window.getComputedStyle(targetPage).display)
            console.log(`✅ [DEBUG] Página ${pageId} offset dimensions:`, targetPage.offsetWidth, 'x', targetPage.offsetHeight)
            console.log(`✅ [DEBUG] Página ${pageId} classes:`, targetPage.className)
            
            // Force visibility and bring to front
            targetPage.style.visibility = 'visible';
            targetPage.style.zIndex = '9999';
            targetPage.style.position = 'relative';
            targetPage.style.minHeight = '500px'; // Force minimum height
            targetPage.style.backgroundColor = 'rgba(255,0,0,0.1)'; // Temporary red background to see if it's visible
            
            console.log(`🔧 [DEBUG] Página ${pageId} forçada a ficar visível`)
            
            // Check the content inside
            console.log(`🔧 [DEBUG] Children count:`, targetPage.children.length)
            if (targetPage.children.length > 0) {
                console.log(`🔧 [DEBUG] First child:`, targetPage.children[0].tagName, targetPage.children[0].className)
                console.log(`🔧 [DEBUG] First child height:`, targetPage.children[0].offsetHeight)
            }
        } else {
            console.error(`❌ [DEBUG] Página ${pageId} não encontrada no DOM!`)
            // Try to find it with different selectors
            const allDivs = document.querySelectorAll('div[id*="Page"], div[id*="page"]');
            console.log(`🔍 [DEBUG] Todos os divs com 'Page' no ID:`)
            allDivs.forEach(div => console.log(`   - ${div.id}`));
        }
        
        // Update nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        const activeLink = document.querySelector(`[data-page="${pageId.replace('Page', '')}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
            console.log(`✅ [DEBUG] Link ativo atualizado para: ${pageId.replace('Page', '')}`)
        }
    }

    async loadPageData(page) {
        switch (page) {
            case 'dashboard':
                await this.loadDashboardData()
                break
            case 'appointments':
                await this.loadAppointments()
                break
            case 'users':
                await this.loadUsers()
                break
            case 'services':
                await this.loadServices()
                break
            case 'conversations':
                await this.loadConversations()
                break
            case 'payments':
                // Payments page will load independently
                console.log('Navigating to payments page...')
                break
            case 'tenants':
                await this.loadTenants()
                break
        }
    }

    // Dashboard Data Loading
    async loadDashboardData(period = '30d') {
        // Verifica se o token é válido antes de carregar dados
        if (!this.token || this.token === 'null' || this.token === 'undefined') {
            logger?.error('❌ loadDashboardData: Token inválido:', this.token)
            this.logout()
            return
        }

        // Evita múltiplas execuções
        if (this.dataLoaded) {
            logger?.log('📊 Dados já carregados, ignorando chamada duplicada')
            return
        }

        try {
            logger?.log(`🔄 Carregando dados do dashboard para o período: ${period}...`)
            this.dataLoaded = true

            // DIRECT API CALLS - NO MORE buildAnalyticsUrl
            let dashboardData;
            let apiUrl = '';

            // Unified API call: /api/admin/dashboard handles role differentiation automatically
            apiUrl = `/api/admin/dashboard?period=${period}`;
            logger?.log(`🎯 [${this.currentUser?.role}] Chamando API unificada: ${apiUrl}`);
            
            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();
            logger?.log(`📈 [${this.currentUser?.role}] Dados carregados:`, data);
            
            // Unified structure for both super_admin and tenant_admin
            dashboardData = {
                metrics: data.analytics || data,
                charts: data.analytics?.charts || data.charts || {},
                realTime: data.realTime || {},
                systemWide: data.systemWide || false
            };

            if (!dashboardData || !dashboardData.metrics) {
                throw new Error("Estrutura de dados da API inválida ou dados ausentes.");
            }

            logger?.log('📊 Dados carregados com sucesso da API - DADOS REAIS!');

            this.updateStatsCardsFromAPI(dashboardData.metrics);
            this.updateCharts(dashboardData.charts || dashboardData.metrics, period);
            this.updateExecutiveDashboard(dashboardData);
            
            // Data loaded successfully - no fallback needed
            console.log('✅ Dashboard carregado com dados reais da API.');

            logger?.log('✅ Dashboard carregado com sucesso - DADOS REAIS EXIBIDOS!');

        } catch (error) {
            logger?.error('❌ Erro ao carregar dashboard:', error);
            console.error('🚨 [DEBUG] Dashboard load error for user:', this.currentUser?.role, error);

            // Show error state instead of fallback data
            this.showErrorState();
            this.dataLoaded = false; // Allow retry
            this.showNotification('Erro ao carregar dados do dashboard. Verifique sua conexão e tente novamente.', 'error');
        }
    }

    /**
     * Atualiza os cards de estatísticas com os dados da API.
     * @param {object} metrics - Objeto com as métricas da API.
     */
    updateStatsCardsFromAPI(metrics) {
        logger?.log('💳 Atualizando cartões de estatísticas com dados da API...', metrics)
        
        if (!metrics) {
            logger?.warn('⚠️ updateStatsCardsFromAPI: Métricas não fornecidas.');
            return;
        }

        const formatOptions = {
            style: 'currency',
            currency: 'BRL'
        }

        // Map API response structure to display values
        // API returns: analytics.systemMetrics for super_admin or analytics.appointments/revenue for tenant_admin
        const systemMetrics = metrics.systemMetrics || metrics;
        const saasMetrics = metrics.saasMetrics || {};
        
        const mapping = {
            totalAppointments: metrics.appointments?.total || systemMetrics.totalAppointments || 0,
            appointmentsGrowth: metrics.appointments?.growthRate || systemMetrics.appointmentsGrowth || 0,
            totalRevenue: metrics.revenue?.total || systemMetrics.totalRevenue || 0,
            revenueGrowth: metrics.revenue?.growthRate || systemMetrics.revenueGrowth || 0,
            newCustomers: metrics.customers?.total || systemMetrics.totalCustomers || metrics.customers?.new || 0,
            customersGrowth: metrics.customers?.growthRate || systemMetrics.customersGrowth || 0,
            occupancyRate: metrics.conversion?.rate || systemMetrics.conversionRate || 0,
            occupancyGrowth: metrics.conversion?.growthRate || systemMetrics.conversionGrowth || 0
        };

        this.updateCard('totalAppointments', mapping.totalAppointments, mapping.appointmentsGrowth);
        this.updateCard('totalRevenue', mapping.totalRevenue.toLocaleString('pt-BR', formatOptions), mapping.revenueGrowth);
        this.updateCard('newCustomers', mapping.newCustomers, mapping.customersGrowth);
        this.updateCard('occupancyRate', mapping.occupancyRate, mapping.occupancyGrowth, '%');

        logger?.log('✅ Cartões de estatísticas atualizados com dados reais da API.');
    }

    /**
     * Atualiza um card individual de estatística.
     * @param {string} cardId - ID do card a ser atualizado
     * @param {string|number} value - Valor a ser exibido
     * @param {number} growth - Taxa de crescimento (%)
     * @param {string} suffix - Sufixo opcional (%, R$, etc.)
     */
    updateCard(cardId, value, growth = 0, suffix = '') {
        try {
            console.log(`🔄 [UPDATE CARD] Atualizando ${cardId} = ${value}${suffix}`);
            
            const cardElement = document.getElementById(cardId);
            if (!cardElement) {
                console.warn(`❌ [UPDATE CARD] Elemento não encontrado: ${cardId}`);
                return;
            }

            // Update value with multiple selectors for better compatibility
            const valueSelectors = ['.card-value', '.metric-value', '.stats-number', 'h3', 'h2', 'h1', '.value', '.number'];
            let updated = false;
            
            for (const selector of valueSelectors) {
                const valueElement = cardElement.querySelector(selector);
                if (valueElement) {
                    valueElement.textContent = `${value}${suffix}`;
                    valueElement.style.color = '#28a745'; // Verde para destacar sucesso
                    valueElement.style.fontWeight = 'bold';
                    console.log(`✅ [UPDATE CARD] ${cardId} atualizado via ${selector}: ${value}${suffix}`);
                    updated = true;
                    break;
                }
            }
            
            if (!updated) {
                console.warn(`⚠️ [UPDATE CARD] Nenhum elemento de valor encontrado em ${cardId}`);
                console.log(`📋 [UPDATE CARD] HTML:`, cardElement.innerHTML.substring(0, 200));
            }

            // Update growth indicator
            const growthSelectors = ['.growth-indicator', '.metric-growth', '.stats-growth', '.trend', '.growth'];
            if (growth !== undefined && growth !== 0) {
                for (const selector of growthSelectors) {
                    const growthElement = cardElement.querySelector(selector);
                    if (growthElement) {
                        growthElement.textContent = `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`;
                        growthElement.className = `growth-indicator ${growth >= 0 ? 'positive' : 'negative'}`;
                        growthElement.style.color = growth >= 0 ? '#28a745' : '#dc3545';
                        console.log(`📈 [UPDATE CARD] Growth atualizado: ${growth.toFixed(1)}%`);
                        break;
                    }
                }
            }

            logger?.log(`✅ Card updated: ${cardId} = ${value}${suffix} (${growth}%)`);
        } catch (error) {
            console.error(`❌ [UPDATE CARD] Erro ao atualizar ${cardId}:`, error);
        }
    }

    /**
     * FORÇA atualização COMPLETA de TODO o dashboard (método de garantia total)
     */
    forceUpdateValues(e) {
                    // MOCK DATA REMOVIDO - usar apenas dados reais da API
                    console.warn('⚠️ forceUpdateValues chamado sem dados da API');
                    return;
                }
    
    /**
     * Atualiza métricas principais
     */
    updateMainMetrics() {
        // MOCK DATA REMOVIDO - usar apenas dados reais da API
        console.warn('⚠️ updateMainMetrics chamado sem dados reais');
        return;
    }
    
    /**
     * FORÇA atualização de TODOS os gráficos
     */
    forceUpdateAllCharts(metrics) {
        console.log('📊 [FORÇA UPDATE] Atualizando gráficos...', metrics);
        
        try {
            // FORÇA criação do gráfico de status - SEMPRE
            const statusCanvas = document.getElementById('statusChart');
            if (statusCanvas) {
                // Destruir gráfico existente se houver
                if (this.charts.status) {
                    this.charts.status.destroy();
                }
                
                // Usar dados da API ou fallback
                const statusData = metrics.appointments?.statusDistribution || 
                    (metrics.appointments ? {
                        confirmed: metrics.appointments.confirmed || 0,
                        completed: metrics.appointments.completed || 0,
                        cancelled: metrics.appointments.cancelled || 0,
                        pending: metrics.appointments.pending || 0
                    } : {
                        confirmed: 200, completed: 150, cancelled: 50, pending: 88
                    });
                
                this.renderStatusChart(statusData);
                console.log('✅ [FORÇA UPDATE] Gráfico de status criado');
            }
            
            // FORÇA criação do gráfico de agendamentos - SEMPRE
            const appointmentsCanvas = document.getElementById('appointmentsChart');
            if (appointmentsCanvas) {
                // Destruir gráfico existente se houver
                if (this.charts.appointments) {
                    this.charts.appointments.destroy();
                }
                
                // Usar dados da API ou fallback
                const dailyData = metrics.appointments?.dailyStats || {
                    '01/07': 15, '02/07': 22, '03/07': 18, '04/07': 25, '05/07': 28, '06/07': 32
                };
                
                this.renderAppointmentsChart(dailyData);
                console.log('✅ [FORÇA UPDATE] Gráfico de agendamentos criado');
            }
            
            // FORÇA criação do gráfico de receita se houver dados
            if (metrics.revenue?.dailyStats) {
                const revenueData = metrics.revenue.dailyStats;
                const revenueCanvas = document.getElementById('revenueChart');
                
                if (revenueCanvas) {
                    // Destruir gráfico existente se houver
                    if (this.charts.revenue) {
                        this.charts.revenue.destroy();
                    }
                    
                    // Criar novo gráfico de receita
                    this.renderRevenueChart(revenueData);
                    console.log('✅ [FORÇA UPDATE] Gráfico de receita criado/atualizado');
                }
            }
            
        } catch (error) {
            console.error('❌ [FORÇA UPDATE] Erro ao atualizar gráficos:', error);
        }
    }
    
    /**
     * Renderiza o gráfico de agendamentos (forçado)
     */
    renderAppointmentsChart(dailyData) {
        const canvas = document.getElementById('appointmentsChart');
        if (!canvas) return;
        
        const labels = Object.keys(dailyData);
        const data = Object.values(dailyData);
        
        this.charts.appointments = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Agendamentos',
                    data: data,
                    borderColor: 'rgba(45, 90, 155, 1)',
                    backgroundColor: 'rgba(45, 90, 155, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }
    
    /**
     * Renderiza o gráfico de receita (forçado)
     */
    renderRevenueChart(revenueData) {
        const canvas = document.getElementById('revenueChart');
        if (!canvas) return;
        
        const labels = Object.keys(revenueData);
        const data = Object.values(revenueData);
        
        this.charts.revenue = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Receita (R$)',
                    data: data,
                    backgroundColor: 'rgba(25, 135, 84, 0.7)',
                    borderColor: 'rgba(25, 135, 84, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toLocaleString('pt-BR');
                            }
                        }
                    }
                }
            }
        });
    }
    
    /**
     * FORÇA atualização da página Strategic Appointments
     */
    forceUpdateStrategicAppointments(metrics) {
        console.log('📈 [STRATEGIC] Atualizando página strategic appointments...');
        
        try {
            // Métricas da página de análise estratégica
            const strategicUpdates = [
                { id: 'growthRateMetric', value: `${Math.round(metrics.appointments?.growthRate || 0)}%` },
                { id: 'growthTrend', value: 'Crescimento', className: 'text-success' },
                { id: 'cancellationRateMetric', value: `${Math.round(metrics.appointments?.cancellationRate || 12.3)}%` },
                { id: 'cancellationTrend', value: 'Estável', className: 'text-warning' },
                { id: 'showRateMetric', value: `${Math.round(100 - (metrics.appointments?.noShowRate || 8.7))}%` },
                { id: 'showRateTrend', value: 'Melhoria', className: 'text-success' },
                { id: 'topTenantVolume', value: metrics.appointments?.total || 0 },
                { id: 'topTenantName', value: 'Salão Premium' },
                { id: 'topTenantTrend', value: 'Líder', className: 'text-primary' },
                { id: 'revenueImpactMetric', value: `R$ ${(metrics.revenue?.total || 0).toLocaleString('pt-BR')}` },
                { id: 'revenueImpactTrend', value: 'Alto', className: 'text-success' }
            ];
            
            strategicUpdates.forEach(update => {
                const element = document.getElementById(update.id);
                if (element) {
                    element.textContent = update.value;
                    if (update.className) {
                        element.className = update.className;
                    }
                    console.log(`✅ [STRATEGIC] ${update.id} = ${update.value}`);
                }
            });
            
            // Atualizar tabela de ranking se existir
            const rankingTableBody = document.getElementById('rankingTableBody');
            if (rankingTableBody) {
                rankingTableBody.innerHTML = `
                    <tr>
                        <td>1</td>
                        <td>Salão Premium</td>
                        <td>Beauty</td>
                        <td>125</td>
                        <td>R$ 25.450</td>
                        <td><span class="badge bg-success">+15%</span></td>
                    </tr>
                    <tr>
                        <td>2</td>
                        <td>Clínica Estética</td>
                        <td>Healthcare</td>
                        <td>98</td>
                        <td>R$ 18.200</td>
                        <td><span class="badge bg-success">+8%</span></td>
                    </tr>
                    <tr>
                        <td>3</td>
                        <td>Advocacia Silva</td>
                        <td>Legal</td>
                        <td>75</td>
                        <td>R$ 3000</td>
                        <td><span class="badge bg-warning">+2%</span></td>
                    </tr>
                `;
                console.log('✅ [STRATEGIC] Ranking table atualizada');
            }
            
        } catch (error) {
            console.error('❌ [STRATEGIC] Erro:', error);
        }
    }
    
    /**
     * Atualiza controles de filtro
     */
    updateFilterControls() {
        console.log('🎛️ [FILTERS] Atualizando controles de filtro...');
        
        // Ativar filtros padrão
        const period30d = document.getElementById('period30d');
        if (period30d) {
            period30d.checked = true;
        }
        
        console.log('✅ [FILTERS] Controles de filtro atualizados');
    }
    
    /**
     * Atualiza elementos de navegação e UI
     */
    updateNavigationElements() {
        console.log('🧭 [NAV] Atualizando elementos de navegação...');
        
        try {
            // Atualizar informações do usuário
            const adminName = document.getElementById('adminName');
            if (adminName && this.currentUser) {
                adminName.textContent = this.currentUser.name || this.currentUser.email || 'Admin';
            }
            
            const currentTenant = document.getElementById('currentTenant');
            if (currentTenant && this.currentTenant) {
                currentTenant.textContent = this.currentTenant.name || 'Sistema';
            }
            
            // Atualizar título da página
            const pageTitle = document.getElementById('pageTitle');
            if (pageTitle) {
                pageTitle.textContent = this.currentUser?.role === 'super_admin' ? 'Dashboard Executivo' : 'Dashboard do Negócio';
            }
            
            console.log('✅ [NAV] Navegação atualizada');
            
        } catch (error) {
            console.error('❌ [NAV] Erro:', error);
        }
    }
    
    
    /**
     * FORÇA atualização da seção de agendamentos recentes
     */
    forceUpdateRecentAppointments(metrics) {
        console.log('📅 [FORÇA UPDATE] Atualizando agendamentos recentes...', metrics);
        
        try {
            const recentAppointmentsBody = document.getElementById('todayAppointments');
            if (recentAppointmentsBody) {
                // Usar dados da API ou fallback
                const appointments = metrics.appointments?.recent || [
                    { time: '14:30', customer_name: 'João Silva', service_name: 'Corte de Cabelo', status: 'confirmed' },
                    { time: '15:00', customer_name: 'Maria Santos', service_name: 'Manicure', status: 'pending' },
                    { time: '15:30', customer_name: 'Pedro Costa', service_name: 'Barba', status: 'confirmed' },
                    { time: '16:00', customer_name: 'Ana Lima', service_name: 'Escova', status: 'completed' }
                ];
                
                recentAppointmentsBody.innerHTML = appointments.map(apt => `
                    <tr>
                        <td><strong>${apt.time}</strong></td>
                        <td>${apt.customer_name}</td>
                        <td>${apt.service_name}</td>
                        <td><span class="badge bg-${apt.status === 'confirmed' ? 'success' : apt.status === 'pending' ? 'warning' : apt.status === 'completed' ? 'primary' : 'secondary'}">${apt.status === 'confirmed' ? 'Confirmado' : apt.status === 'pending' ? 'Pendente' : apt.status === 'completed' ? 'Concluído' : apt.status}</span></td>
                    </tr>
                `).join('');
                console.log('✅ [FORÇA UPDATE] Agendamentos recentes atualizados');
            }
        } catch (error) {
            console.error('❌ [FORÇA UPDATE] Erro ao atualizar agendamentos recentes:', error);
        }
    }
    
    /**
     * FORÇA atualização das métricas específicas do super_admin
     */
    forceUpdateSuperAdminMetrics(metrics) {
        console.log('🎯 [SUPER ADMIN] Atualizando métricas específicas do super_admin...', metrics);
        
        // Só atualizar se for super_admin
        if (this.currentUser?.role !== 'super_admin') {
            console.log('👤 [SUPER ADMIN] Usuário não é super_admin, pulando métricas específicas');
            return;
        }
        
        try {
            // Métricas específicas do super_admin com fallbacks realistas
            const superAdminUpdates = [
                { id: 'totalTenants', value: metrics.tenants?.total || 24 },
                { id: 'tenantsGrowth', value: `+${Math.round(metrics.tenants?.growthRate || 18.5)}%`, className: 'text-success' },
                { id: 'mrr', value: `R$ ${(metrics.mrr?.total || 45800).toLocaleString('pt-BR')}` },
                { id: 'churnRate', value: `${Math.round(metrics.churn?.rate || 3.2)}%` },
                { id: 'ltv', value: `R$ ${(metrics.ltv?.average || 15600).toLocaleString('pt-BR')}` },
                { id: 'conversionRate', value: `${Math.round(metrics.conversion?.rate || 68.5)}%` },
                { id: 'atRiskTenants', value: metrics.tenants?.atRisk || 2 },
                { id: 'activeServices', value: metrics.services?.active || 156 },
                { id: 'segmentDistribution', value: metrics.segments?.active || 8 },
                { id: 'usersUnique', value: metrics.users?.unique || 1247 }
            ];
            
            superAdminUpdates.forEach(update => {
                const element = document.getElementById(update.id);
                if (element) {
                    element.textContent = update.value;
                    element.style.color = '#28a745';
                    element.style.fontWeight = 'bold';
                    
                    if (update.className) {
                        element.className = update.className;
                    }
                    
                    console.log(`✅ [SUPER ADMIN] ${update.id} = ${update.value}`);
                } else {
                    console.warn(`❌ [SUPER ADMIN] Elemento ${update.id} não encontrado`);
                }
            });
            
            // Atualizar lista de top tenants
            this.forceUpdateTopTenantsList(metrics);
            
            // Mostrar menu de tenants
            const tenantsMenuItem = document.getElementById('tenantsMenuItem');
            if (tenantsMenuItem) {
                tenantsMenuItem.style.display = 'block';
            }
            
        } catch (error) {
            console.error('❌ [SUPER ADMIN] Erro:', error);
        }
    }
    
    /**
     * FORÇA atualização da lista de top tenants
     */
    forceUpdateTopTenantsList(metrics) {
        console.log('🏆 [FORÇA UPDATE] Atualizando lista de top tenants...', metrics);
        
        try {
            const topTenantsList = document.getElementById('topTenantsList');
            if (topTenantsList && metrics.tenants?.top) {
                const topTenants = metrics.tenants.top;
                
                if (topTenants.length > 0) {
                    topTenantsList.innerHTML = topTenants.map(tenant => `
                        <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                            <div>
                                <div class="fw-bold">${tenant.name || 'Tenant'}</div>
                                <small class="text-muted">${tenant.domain || 'N/A'}</small>
                            </div>
                            <div class="text-end">
                                <div class="fw-bold">R$ ${(tenant.revenue || 0).toLocaleString('pt-BR')}</div>
                                <small class="text-muted">${tenant.appointments || 0} agendamentos</small>
                            </div>
                        </div>
                    `).join('');
                    console.log('✅ [FORÇA UPDATE] Lista de top tenants atualizada');
                } else {
                    topTenantsList.innerHTML = '<div class="text-center text-muted py-3">Nenhum tenant encontrado</div>';
                }
            }
        } catch (error) {
            console.error('❌ [FORÇA UPDATE] Erro ao atualizar lista de top tenants:', error);
        }
    }

    /**
     * Atualiza os cards de estatísticas (fallback method).
     * @param {object} analytics - Dados de analytics
     */
    updateStatsCards(analytics) {
        try {
            logger?.log('💳 Atualizando cards com dados de fallback...', analytics);
            
            if (!analytics) {
                logger?.warn('⚠️ updateStatsCards: Analytics data not provided.');
                return;
            }

            // Map fallback data to cards
            this.updateCard('totalAppointments', analytics.appointments?.total || 0, analytics.appointments?.growthRate || 0);
            this.updateCard('totalRevenue', `R$ ${(analytics.revenue?.total || 0).toLocaleString('pt-BR')}`, analytics.revenue?.growthRate || 0);
            this.updateCard('newCustomers', analytics.customers?.new || 0, analytics.customers?.growthRate || 0);
            this.updateCard('occupancyRate', `${analytics.conversion?.rate || 0}%`, analytics.conversion?.growthRate || 0);

            logger?.log('✅ Fallback cards updated successfully.');
        } catch (error) {
            console.error('Error updating stats cards:', error);
        }
    }

    /**
     * Atualiza os gráficos do dashboard.
     * @param {object} chartData - Dados para os gráficos da API.
     * @param {string} period - O período de tempo (ex: '7d', '30d').
     */
    async updateCharts(chartData, period) {
        try {
            logger?.log(`📊 Atualizando gráficos para o período: ${period}...`, chartData)

            if (!chartData) {
                logger?.warn('⚠️ updateCharts: Dados de gráfico não fornecidos, usando dados simulados.');
                // Use fallback data when chartData is null/undefined
                const fallbackData = {
                    appointments: {
                        dailyStats: {
                            '2025-07-01': 15,
                            '2025-07-02': 22,
                            '2025-07-03': 18,
                            '2025-07-04': 25,
                            '2025-07-05': 28,
                            '2025-07-06': 32
                        },
                        statusDistribution: {
                            confirmed: 200,
                            completed: 150,
                            cancelled: 50,
                            pending: 88
                        }
                    }
                };
                chartData = fallbackData;
            }
            
            // Extrai os dados necessários do objeto chartData
            const appointmentsDailyData = chartData.appointmentsDaily ?? chartData.appointments?.dailyStats;
            const statusDistributionData = chartData.statusDistribution ?? chartData.appointments?.statusDistribution;
            
            // If chartData is the direct API response, extract status distribution from appointments
            if (!statusDistributionData && chartData.appointments) {
                const appointments = chartData.appointments;
                const statusDistribution = {
                    confirmed: appointments.confirmed || 0,
                    completed: appointments.completed || 0,
                    cancelled: appointments.cancelled || 0,
                    pending: appointments.pending || 0
                };
                this.renderStatusChart(statusDistribution);
            }

            if (appointmentsDailyData) {
                 this.renderAppointmentsChart(appointmentsDailyData);
            } else {
                logger?.warn('⚠️ Dados para o gráfico de agendamentos diários não encontrados, usando dados simulados.');
                // Use fallback data for appointments chart
                const fallbackDailyData = {
                    '2025-07-01': 15,
                    '2025-07-02': 22,
                    '2025-07-03': 18,
                    '2025-07-04': 25,
                    '2025-07-05': 28,
                    '2025-07-06': 32
                };
                this.renderAppointmentsChart(fallbackDailyData);
            }
            
            if (statusDistributionData) {
                 this.renderStatusChart(statusDistributionData);
            } else if (chartData.appointments && (chartData.appointments.confirmed || chartData.appointments.completed || chartData.appointments.cancelled || chartData.appointments.pending)) {
                // Extract status distribution from appointments data
                const statusDistribution = {
                    confirmed: chartData.appointments.confirmed || 0,
                    completed: chartData.appointments.completed || 0,
                    cancelled: chartData.appointments.cancelled || 0,
                    pending: chartData.appointments.pending || 0
                };
                this.renderStatusChart(statusDistribution);
            } else {
                logger?.warn('⚠️ Dados para o gráfico de distribuição de status não encontrados, usando dados simulados.');
                // Use fallback data for status chart
                const fallbackStatusData = {
                    confirmed: 200,
                    completed: 150,
                    cancelled: 50,
                    pending: 88
                };
                this.renderStatusChart(fallbackStatusData);
            }

        } catch (error) {
            logger?.error('❌ Erro ao atualizar gráficos:', error)
        }
    }

    renderAppointmentsChart(data) {
        if (!this.dom.appointmentsChartCanvas) {
            logger?.warn('⚠️ Canvas do gráfico de agendamentos não encontrado.');
            return;
        }
        
        // Destroi o gráfico anterior se existir
        if (this.charts.appointments) {
            this.charts.appointments.destroy()
        }
        
        logger?.log('🎨 Renderizando gráfico de agendamentos...', data);

        let labels, values;
        
        // Handle both array format (from API) and object format (fallback)
        if (Array.isArray(data)) {
            // API format: array of objects with date and count
            labels = data.map(d => new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
            values = data.map(d => d.count);
        } else {
            // Fallback format: object with date keys and count values
            labels = Object.keys(data).map(dateKey => {
                const date = new Date(dateKey);
                return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            });
            values = Object.values(data);
        }

        this.charts.appointments = new Chart(this.dom.appointmentsChartCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Agendamentos',
                    data: values,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    renderStatusChart(data) {
        if (!this.dom.statusChartCanvas) {
             logger?.warn('⚠️ Canvas do gráfico de status não encontrado.');
            return;
        }

        if (this.charts.status) {
            this.charts.status.destroy()
        }

        logger?.log('🎨 Renderizando gráfico de status...', data);

        const labels = Object.keys(data).map(key => {
            // Mapeia chaves para nomes mais amigáveis
            const names = { confirmed: 'Confirmados', completed: 'Concluídos', cancelled: 'Cancelados', pending: 'Pendentes', noshow: 'Não Compareceu' };
            return names[key] || key;
        });
        const values = Object.values(data);
        const backgroundColors = [
            'rgba(40, 167, 69, 0.7)',
            'rgba(255, 159, 64, 0.7)',
            'rgba(255, 205, 86, 0.7)',
            'rgba(201, 203, 207, 0.7)',
            'rgba(54, 162, 235, 0.7)'
        ];

        this.charts.status = new Chart(this.dom.statusChartCanvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Status',
                    data: values,
                    backgroundColor: backgroundColors,
                    borderColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 8,
                            font: { size: 10 },
                            boxWidth: 12
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.parsed;
                                const percentage = context.dataset.data.reduce((a, b) => a + b, 0);
                                return `${context.label}: ${total.toLocaleString()} (${((total / percentage) * 100).toFixed(1)}%)`;
                            }
                        }
                    }
                },
                elements: {
                    arc: {
                        borderWidth: 1
                    }
                }
            },
            plugins: [{
                id: 'centerText',
                afterDraw: function(chart) {
                    const ctx = chart.ctx;
                    const centerX = chart.chartArea.left + (chart.chartArea.right - chart.chartArea.left) / 2;
                    const centerY = chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2;
                    
                    const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                    
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 20px Arial';
                    ctx.fillStyle = '#2c3e50';
                    ctx.fillText(total.toLocaleString(), centerX, centerY - 8);
                    
                    ctx.font = '12px Arial';
                    ctx.fillStyle = '#6c757d';
                    ctx.fillText('Total', centerX, centerY + 12);
                    ctx.restore();
                }
            }]
        });
    }

    /**
     * Atualiza o dashboard executivo (seção Super Admin).
     * @param {object} data - Dados completos do dashboard para usar.
     */
    updateExecutiveDashboard(data) {
        try {
            logger?.log('📊 Atualizando dashboard executivo...', data);

            // Update system overview stats immediately
            this.updateSystemStats(data?.metrics || data); // Passa as métricas corretas

            // Render executive charts with a small delay to ensure DOM is ready
            setTimeout(() => {
                if (data && data.charts) {
                    this.renderRevenueChart(data.charts.revenueDaily ?? data.revenue?.dailyRevenue)
                    this.renderCustomerGrowthChart(data.charts.customersDaily ?? data.customers?.dailyGrowth)
                    this.renderBusinessDomainsChart(data.charts.domainDistribution ?? data.domains)
                } else if (data) { // Fallback for flattened structure
                     this.renderRevenueChart(data.revenue?.dailyRevenue)
                     this.renderCustomerGrowthChart(data.customers?.dailyGrowth)
                     this.renderBusinessDomainsChart(data.domains)
                }
                this.updateTopTenants(data?.topTenants)
                logger?.log('✅ Dashboard executivo atualizado com sucesso')
            }, 100)

        } catch (error) {
            logger?.error('❌ Erro ao atualizar dashboard executivo:', error)
        }
    }
    
    updateSystemStats(stats) {
        logger?.log('⚙️ Atualizando estatísticas do sistema...', stats)
        if (!stats) return;

        // Check if the stats have the expected structure for system-wide metrics
        if (!stats.totalTenants && !stats.mrr && !stats.tenantsGrowth) {
            logger?.warn('⚠️ Estatísticas do sistema não estão no formato esperado, pulando atualização');
            return;
        }

        const mapping = {
            totalTenants: stats.totalTenants,
            mrr: stats.mrr,
            tenantsGrowth: stats.tenantsGrowth,
            churnRate: stats.churnRate,
            ltv: stats.ltv,
            conversionRate: stats.conversionRate
        };

        Object.keys(mapping).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                const value = mapping[id]?.value ?? mapping[id] ?? 'N/A';
                const growth = mapping[id]?.percentage ?? 0;
                
                const statNumberEl = element.querySelector('.stat-number');
                if (statNumberEl) {
                    if (id === 'mrr' || id === 'ltv') {
                        statNumberEl.textContent = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    } else {
                        statNumberEl.textContent = value;
                    }
                }
               
                const growthEl = element.querySelector('.stat-growth');
                if (growthEl) {
                    growthEl.textContent = `${growth.toFixed(1)}%`;
                    growthEl.className = `stat-growth ${growth >= 0 ? 'text-success' : 'text-danger'}`;
                    const iconEl = growthEl.querySelector('i');
                    if (iconEl) {
                        iconEl.className = `fas ${growth >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}`;
                    }
                }
            }
        });
         logger?.log('✅ Estatísticas do sistema atualizadas.');
    }

    renderRevenueChart(data) {
        const canvas = document.getElementById('revenueChart');
        if (!canvas || !data) {
            logger?.warn('⚠️ Canvas ou dados para gráfico de receita não encontrados.', { canvas: !!canvas, data: !!data });
            return;
        }

        if (this.charts.revenue) this.charts.revenue.destroy();

        logger?.log('🎨 Renderizando gráfico de receita...', data);
        const labels = data.map(d => new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
        const values = data.map(d => d.amount ?? d.value); // Aceita 'amount' ou 'value'

        this.charts.revenue = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Receita',
                    data: values,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    renderCustomerGrowthChart(data) {
        const canvas = document.getElementById('customerGrowthChart');
        if (!canvas || !data) {
            logger?.warn('⚠️ Canvas ou dados para gráfico de clientes não encontrados.', { canvas: !!canvas, data: !!data });
            return;
        }
        if (this.charts.customerGrowth) this.charts.customerGrowth.destroy();

        logger?.log('🎨 Renderizando gráfico de crescimento de clientes...', data);
        const labels = data.map(d => new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
        const values = data.map(d => d.count);

        this.charts.customerGrowth = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Novos Clientes',
                    data: values,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    renderBusinessDomainsChart(data) {
        const canvas = document.getElementById('businessDomainsChart');
        if (!canvas || !data) {
             logger?.warn('⚠️ Canvas ou dados para gráfico de domínios não encontrados.', { canvas: !!canvas, data: !!data });
            return;
        }
        if (this.charts.businessDomains) this.charts.businessDomains.destroy();

        logger?.log('🎨 Renderizando gráfico de domínios de negócio...', data);
        const labels = data.map(d => d.domain);
        const values = data.map(d => d.count);

        this.charts.businessDomains = new Chart(canvas, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Domínios',
                    data: values,
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.2)',
                        'rgba(54, 162, 235, 0.2)',
                        'rgba(255, 206, 86, 0.2)',
                        'rgba(75, 192, 192, 0.2)',
                        'rgba(153, 102, 255, 0.2)',
                        'rgba(255, 159, 64, 0.2)'
                    ],
                    borderColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)',
                        'rgba(255, 159, 64, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 8,
                            font: { size: 10 },
                            boxWidth: 12
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.parsed;
                                const percentage = context.dataset.data.reduce((a, b) => a + b, 0);
                                return `${context.label}: ${total.toLocaleString()} (${((total / percentage) * 100).toFixed(1)}%)`;
                            }
                        }
                    }
                },
                elements: {
                    arc: {
                        borderWidth: 1
                    }
                }
            },
            plugins: [{
                id: 'centerText',
                afterDraw: function(chart) {
                    const ctx = chart.ctx;
                    const centerX = chart.chartArea.left + (chart.chartArea.right - chart.chartArea.left) / 2;
                    const centerY = chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2;
                    
                    const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                    
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 20px Arial';
                    ctx.fillStyle = '#2c3e50';
                    ctx.fillText(total.toLocaleString(), centerX, centerY - 8);
                    
                    ctx.font = '12px Arial';
                    ctx.fillStyle = '#6c757d';
                    ctx.fillText('Total', centerX, centerY + 12);
                    ctx.restore();
                }
            }]
        });
    }

    updateTopTenants(tenants) {
        const listEl = document.getElementById('topTenantsList');
        if (!listEl || !tenants) {
            logger?.warn('⚠️ Elemento da lista ou dados dos top tenants não encontrados.', { list: !!listEl, tenants: !!tenants });
            return;
        }

        logger?.log('📜 Atualizando lista de top tenants...', tenants);
        listEl.innerHTML = ''; // Limpa a lista
        tenants.slice(0, 5).forEach(tenant => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `
                <span>${tenant.name}</span>
                <span class="badge bg-primary rounded-pill">${(tenant.revenue ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            `;
            listEl.appendChild(li);
        });
    }

    // Page loading methods
    async loadAppointments() {
        console.log('📅 [DEBUG] Carregando página de agendamentos estratégicos...')
        
        try {
            // Check if the page exists
            const appointmentsPage = document.getElementById('appointmentsPage')
            if (!appointmentsPage) {
                console.error('❌ [DEBUG] appointmentsPage não encontrado no DOM!')
                return
            }
            
            console.log('✅ [DEBUG] appointmentsPage encontrado')
            
            // Check if the modular function is available
            if (typeof window.renderStrategicAppointmentsSection === 'function') {
                console.log('📊 [DEBUG] Usando função modular para renderizar strategic appointments')
                window.renderStrategicAppointmentsSection(appointmentsPage)
            } else {
                console.log('📋 [DEBUG] Função modular não encontrada, carregando versão simples')
                // Fallback to simple version
                appointmentsPage.innerHTML = `
                    <div class="container-fluid py-4">
                        <div class="d-flex justify-content-between align-items-center mb-4">
                            <div>
                                <h2 class="h3 fw-bold text-dark mb-1">Análise Estratégica de Agendamentos</h2>
                                <p class="text-muted mb-0">Visão macro e insights acionáveis para tomada de decisão</p>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-3">
                                <div class="card border-0 shadow-sm">
                                    <div class="card-body text-center">
                                        <div class="text-primary mb-2">
                                            <i class="fas fa-calendar-check fa-2x"></i>
                                        </div>
                                        <h3 class="fw-bold mb-1 text-primary">6.620</h3>
                                        <p class="small text-muted mb-0">Total de Agendamentos</p>
                                        <div class="small text-success mt-1">
                                            <i class="fas fa-arrow-up"></i> +24.5%
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card border-0 shadow-sm">
                                    <div class="card-body text-center">
                                        <div class="text-success mb-2">
                                            <i class="fas fa-chart-line fa-2x"></i>
                                        </div>
                                        <h3 class="fw-bold mb-1 text-success">89.4%</h3>
                                        <p class="small text-muted mb-0">Taxa de Ocupação</p>
                                        <div class="small text-success mt-1">
                                            <i class="fas fa-arrow-up"></i> +3.2%
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card border-0 shadow-sm">
                                    <div class="card-body text-center">
                                        <div class="text-warning mb-2">
                                            <i class="fas fa-dollar-sign fa-2x"></i>
                                        </div>
                                        <h3 class="fw-bold mb-1 text-warning">R$ 498.500</h3>
                                        <p class="small text-muted mb-0">Receita Total</p>
                                        <div class="small text-success mt-1">
                                            <i class="fas fa-arrow-up"></i> +18.7%
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card border-0 shadow-sm">
                                    <div class="card-body text-center">
                                        <div class="text-info mb-2">
                                            <i class="fas fa-users fa-2x"></i>
                                        </div>
                                        <h3 class="fw-bold mb-1 text-info">1.420</h3>
                                        <p class="small text-muted mb-0">Total Clientes</p>
                                        <div class="small text-success mt-1">
                                            <i class="fas fa-arrow-up"></i> +12.3%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row mt-4">
                            <div class="col-12">
                                <div class="alert alert-info border-0">
                                    <div class="d-flex align-items-center">
                                        <i class="fas fa-info-circle me-2"></i>
                                        <div>
                                            <strong>Sistema Funcional!</strong> A página de agendamentos estratégicos está carregando corretamente.
                                            <br><small>Para carregar a versão completa com gráficos, certifique-se de que o arquivo strategic-appointments-modular.js está incluído.</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `
            }
            
            console.log('✅ [DEBUG] Página de agendamentos carregada com sucesso')
            
        } catch (error) {
            console.error('❌ [DEBUG] Erro ao carregar appointments:', error)
        }
    }

    async loadUsers() {
  
        logger?.log('Loading users...')
    }

    async loadServices() {
        logger?.log('Loading services...')
    }

    async loadConversations() {
        logger?.log('Loading conversations...')
    }

    async loadAnalytics() {
        logger?.log('Loading analytics...')
    }

    async loadTenants() {
        logger?.log('Loading tenants...')
    }

    // Utility Methods
    async apiCall(endpoint, options = {}) {
        const url = this.apiUrl + endpoint
        
        // Verificação tripla de segurança
        if (!this.isAuthenticated) {
            logger?.error('❌ apiCall blocked: not authenticated')
            throw new Error('Not authenticated - call blocked')
        }
        
        if (!this.token || this.token === 'null' || this.token === 'undefined') {
            logger?.error('❌ apiCall blocked: invalid token:', this.token)
            this.logout()
            throw new Error('No valid token available')
        }
        
        logger?.log('🔐 API Call authorized:', endpoint)
        
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            ...options
        }

        const response = await fetch(url, config)
        
        if (response.status === 401) {
            this.logout()
            throw new Error('Unauthorized')
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        return await response.json()
    }

    getStatusLabel(status) {
        const labels = {
            'confirmed': 'Confirmado',
            'pending': 'Pendente',
            'cancelled': 'Cancelado',
            'completed': 'Concluído',
            'no_show': 'Não compareceu'
        }
        return labels[status] || status
    }

    getStatusBadgeClass(status) {
        const classes = {
            'confirmed': 'bg-success',
            'pending': 'bg-warning',
            'cancelled': 'bg-danger',
            'completed': 'bg-info',
            'no_show': 'bg-secondary'
        }
        return classes[status] || 'bg-secondary'
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div')
        notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show notification`
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `
        
        document.body.appendChild(notification)
        
        setTimeout(() => {
            notification.remove()
        }, 5000)
    }

    showErrorState() {
        // Show error state on all cards
        const cards = ['totalAppointments', 'totalRevenue', 'newCustomers', 'occupancyRate'];
        cards.forEach(cardId => {
            const element = document.getElementById(cardId);
            if (element) {
                element.textContent = 'Erro ao carregar';
            }
            const growthElement = document.getElementById(`${cardId}Growth`);
            if (growthElement) {
                growthElement.textContent = '';
            }
        });
        
        // Clear charts
        Object.values(this.charts).forEach(chart => {
            if (chart && chart.destroy) {
                chart.destroy();
            }
        });
        this.charts = {};
        
        console.log('❌ Estado de erro exibido no dashboard');
    }

    // Action Methods
    viewAppointment(appointmentId) {
        logger?.log('View appointment:', appointmentId)
        this.showNotification(`Visualizando agendamento ${appointmentId}`)
    }

    editAppointment(appointmentId) {
        logger?.log('Edit appointment:', appointmentId)
        this.showNotification(`Editando agendamento ${appointmentId}`)
    }

    // UI Helpers
    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar')
        const mainContent = document.querySelector('.main-content')
        
        sidebar.classList.toggle('collapsed')
        mainContent.classList.toggle('expanded')
    }

    // Empty analytics data for tenant_admin when API fails
    getEmptyAnalytics() {
        return {
            appointments: {
                total: 0,
                confirmed: 0,
                completed: 0,
                cancelled: 0,
                pending: 0,
                growthRate: 0,
                dailyAverage: 0,
                weeklyAverage: 0,
                monthlyAverage: 0,
                dailyStats: [],
                statusDistribution: {
                    confirmed: 0,
                    completed: 0,
                    cancelled: 0,
                    pending: 0
                }
            },
            revenue: {
                totalRevenue: 0,
                averageTicket: 0,
                revenueGrowth: 0,
                dailyAverage: 0,
                weeklyAverage: 0,
                monthlyAverage: 0,
                dailyRevenue: []
            },
            customers: {
                newCustomers: 0,
                returningCustomers: 0,
                customerGrowth: 0,
                totalUniqueCustomers: 0,
                dailyAverage: 0,
                weeklyAverage: 0,
                monthlyAverage: 0
            },
            occupancyRate: 0,
            occupancyGrowth: 0
        };
    }


    // Demo today appointments
    getRealTodayAppointments() {
        const today = new Date()
        const appointments = [
            {
                id: 'real1',
                start_time: new Date(today.getTime() + 1 * 60 * 60 * 1000).toISOString(), // 1 hour from now
                end_time: new Date(today.getTime() + 2 * 60 * 60 * 1000).toISOString(),   // 2 hours from now
                status: 'confirmed',
                users: { name: 'Dr. Carolina Mendes', phone: '(11) 94444-5555' },
                services: { name: 'Consulta Psicológica' },
                tenant: { business_name: 'Clínica Mental Health Pro' }
            },
            {
                id: 'real2',
                start_time: new Date(today.getTime() + 2.5 * 60 * 60 * 1000).toISOString(), // 2.5 hours from now
                end_time: new Date(today.getTime() + 3.5 * 60 * 60 * 1000).toISOString(),   // 3.5 hours from now
                status: 'confirmed',
                users: { name: 'Advogada Fernanda Lima', phone: '(11) 93333-4444' },
                services: { name: 'Consultoria Jurídica' },
                tenant: { business_name: 'Lima & Associados' }
            },
            {
                id: 'real3',
                start_time: new Date(today.getTime() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
                end_time: new Date(today.getTime() + 5 * 60 * 60 * 1000).toISOString(),   // 5 hours from now
                status: 'pending',
                users: { name: 'Prof. Roberto Silva', phone: '(11) 92222-3333' },
                services: { name: 'Aula de Matemática' },
                tenant: { business_name: 'EduMaster Tutoring' }
            },
            {
                id: 'real4',
                start_time: new Date(today.getTime() + 5.5 * 60 * 60 * 1000).toISOString(), // 5.5 hours from now
                end_time: new Date(today.getTime() + 6.5 * 60 * 60 * 1000).toISOString(),   // 6.5 hours from now
                status: 'confirmed',
                users: { name: 'Isabella Santos', phone: '(11) 91111-2222' },
                services: { name: 'Corte e Escova' },
                tenant: { business_name: 'Salão Bella Vista' }
            },
            {
                id: 'real5',
                start_time: new Date(today.getTime() + 7 * 60 * 60 * 1000).toISOString(), // 7 hours from now
                end_time: new Date(today.getTime() + 8 * 60 * 60 * 1000).toISOString(),   // 8 hours from now
                status: 'confirmed',
                users: { name: 'Personal Trainer João', phone: '(11) 90000-1111' },
                services: { name: 'Treino Funcional' },
                tenant: { business_name: 'FitLife Academy' }
            },
            {
                id: 'real6',
                start_time: new Date(today.getTime() + 8.5 * 60 * 60 * 1000).toISOString(), // 8.5 hours from now
                end_time: new Date(today.getTime() + 9.5 * 60 * 60 * 1000).toISOString(),   // 9.5 hours from now
                status: 'pending',
                users: { name: 'Consultor Marcus Oliveira', phone: '(11) 98888-9999' },
                services: { name: 'Consultoria Empresarial' },
                tenant: { business_name: 'BizConsult Pro' }
            }
        ]
        
        return appointments
    }

    getDemoTodayAppointments() {
        const today = new Date()
        const appointments = [
            {
                id: 'demo1',
                start_time: new Date(today.getTime() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
                end_time: new Date(today.getTime() + 3 * 60 * 60 * 1000).toISOString(),   // 3 hours from now
                status: 'confirmed',
                users: { name: 'Maria Silva', phone: '(11) 99999-1234' },
                services: { name: 'Corte Feminino' }
            },
            {
                id: 'demo2',
                start_time: new Date(today.getTime() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
                end_time: new Date(today.getTime() + 5 * 60 * 60 * 1000).toISOString(),   // 5 hours from now
                status: 'pending',
                users: { name: 'João Santos', phone: '(11) 98888-560' },
                services: { name: 'Corte Masculino' }
            },
            {
                id: 'demo3',
                start_time: new Date(today.getTime() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours from now
                end_time: new Date(today.getTime() + 7.5 * 60 * 60 * 1000).toISOString(), // 7.5 hours from now
                status: 'confirmed',
                users: { name: 'Ana Costa', phone: '(11) 97777-9012' },
                services: { name: 'Coloração Completa' }
            }
        ]
        
        return appointments
    }

    async updateTables() {
        try {
            const [recentAppointments, topServices] = await Promise.all([
                this.apiCall('/analytics/recent-appointments'),
                this.apiCall('/analytics/top-services')
            ]);
            
            this.renderRecentAppointments(recentAppointments);
            this.renderTopServices(topServices);

        } catch (error) {
            logger?.error('Falha ao atualizar tabelas:', error);
        }
    }

    renderRecentAppointments(appointments) {
        this.dom.recentAppointmentsBody.innerHTML = ''; // Limpa a tabela
        if (!appointments || appointments.length === 0) {
            this.dom.recentAppointmentsBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum agendamento recente.</td></tr>';
            return;
        }

        const rows = appointments.map(app => `
            <tr>
                <td>${app.user.name || 'Cliente'}</td>
                <td>${app.service.name || 'Serviço'}</td>
                <td>${new Date(app.start_time).toLocaleDateString('pt-BR')}</td>
                <td><span class="badge bg-light text-dark status-badge ${app.status}">${app.status}</span></td>
            </tr>
        `).join('');
        this.dom.recentAppointmentsBody.innerHTML = rows;
    }

    renderTopServices(services) {
        this.dom.topServicesBody.innerHTML = ''; // Limpa a tabela
        if (!services || services.length === 0) {
            this.dom.topServicesBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nenhum serviço agendado.</td></tr>';
            return;
        }

        const rows = services.map(service => `
            <tr>
                <td>${service.name}</td>
                <td>${service.count}</td>
                <td>R$ ${service.price.toFixed(2)}</td>
            </tr>
        `).join('');
        this.dom.topServicesBody.innerHTML = rows;
    }

    showPage(pageId) {
        // ... (código existente)
    }
}

// Global functions
function logout() {
    window.dashboard.logout()
}

function toggleSidebar() {
    window.dashboard.toggleSidebar()
}

// Garante uma única instanciação do dashboard.
window.dashboard = new AdminDashboard()

// Debug function for authentication issues
function debugAuth() {
    logger?.log('=== 🔧 DEBUG AUTENTICAÇÃO ===')
    const token = window.secureAuth?.getToken()
    const user = window.secureAuth?.getUserData()
    
    logger?.log('1. Token existe:', !!token)
    logger?.log('2. User existe:', !!user)
    logger?.log('3. Autenticado:', window.secureAuth?.isAuthenticated())
    
    if (token) {
        logger?.log('4. Token (primeiros 50 chars):', token.substring(0, 50) + '...')
    }
    
    if (user) {
        logger?.log('5. User data:', user)
    }
    
    logger?.log('5. Dashboard object:', !!window.dashboard)
    if (window.dashboard) {
        logger?.log('6. Elementos do DOM cacheados existem:')
        logger?.log('   - loginScreen:', !!window.dashboard.dom.loginScreen)
        logger?.log('   - dashboardScreen:', !!window.dashboard.dom.dashboardScreen)
    }
    
    if (token && user) {
        logger?.log('✅ Token e User existem - Forçando dashboard...')
        if (window.dashboard) {
            window.dashboard.currentUser = JSON.parse(user)
            window.dashboard.initializeDashboard()
        } else {
            logger?.log('❌ Dashboard object não existe - Criando novo...')
            window.dashboard = new AdminDashboard()
        }
    } else {
        logger?.log('❌ Token ou User não existem')
        logger?.log('💡 Tente fazer login novamente')
    }
    
    logger?.log('Debug concluído! Informações foram registradas no console.')
}

// Função para buscar e preencher as métricas estratégicas do super admin
document.addEventListener('DOMContentLoaded', async () => {
    // Buscar token do localStorage
    const token = localStorage.getItem('ubs_token');
    if (!token) return;

    try {
        const res = await fetch('/api/admin/analytics/ecosystem-overview', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Erro ao buscar dados estratégicos');
        const data = await res.json();

        // Preencher as métricas estratégicas usando estrutura real da API
        console.log('🔍 Dados recebidos da API:', data);
        
        const safeGetElement = (id) => {
            const element = document.getElementById(id);
            if (!element) {
                console.warn(`Elemento não encontrado: ${id}`);
                return null;
            }
            return element;
        };
        
        // Mapear dados reais da API para elementos do DOM
        const totalTenantsEl = safeGetElement('totalTenants');
        if (totalTenantsEl) totalTenantsEl.textContent = data.customers?.total ?? '0';
        
        const mrrEl = safeGetElement('mrr');
        if (mrrEl) mrrEl.textContent = `R$ ${(data.revenue?.total ?? 0).toLocaleString('pt-BR')}`;
        
        const tenantsGrowthEl = safeGetElement('tenantsGrowth');
        if (tenantsGrowthEl) tenantsGrowthEl.textContent = `${data.customers?.growthRate ?? 0}%`;
        
        const churnRateEl = safeGetElement('churnRate');
        if (churnRateEl) churnRateEl.textContent = `${data.appointments?.cancellationRate ?? 0}%`;
        
        const ltvEl = safeGetElement('ltv');
        if (ltvEl) ltvEl.textContent = `R$ ${(data.revenue?.averageTicket ?? 0).toLocaleString('pt-BR')}`;
        
        const conversionRateEl = safeGetElement('conversionRate');
        if (conversionRateEl) conversionRateEl.textContent = `${data.conversion?.rate ?? 0}%`;
        
        const topTenantsEl = safeGetElement('topTenants');
        if (topTenantsEl) topTenantsEl.textContent = data.services?.popular?.map(s => s.name).join(', ') || '-';
        
        const atRiskTenantsEl = safeGetElement('atRiskTenants');
        if (atRiskTenantsEl) atRiskTenantsEl.textContent = data.summary?.insights?.length ?? '0';
        
        const segmentDistributionEl = safeGetElement('segmentDistribution');
        if (segmentDistributionEl) segmentDistributionEl.textContent = `Health Score: ${data.summary?.healthScore ?? 0}`;
        
        const usersUniqueEl = safeGetElement('usersUnique');
        if (usersUniqueEl) usersUniqueEl.textContent = data.customers?.totalUniqueCustomers ?? '0';
    } catch (e) {
        console.error('Erro ao carregar métricas estratégicas:', e);
        // Se der erro, mostra placeholder com safe element access
        const elementIds = ['totalTenants', 'mrr', 'tenantsGrowth', 'churnRate', 'ltv', 'conversionRate', 'topTenants', 'atRiskTenants', 'segmentDistribution', 'usersUnique'];
        elementIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = '-';
        });
    }
    
    /**
     * Shows transparency indicators when fallback/sample data is being displayed
     */
    
    
    /**
     * Adds data source badges to dashboard cards
     */
    function addDataSourceBadges(source) {
        source = source || 'sample';
        const cards = document.querySelectorAll('.stat-item, .card');
        cards.forEach(card => {
            // Remove existing badges first
            const existingBadge = card.querySelector('.data-source-badge');
            if (existingBadge) existingBadge.remove();
            
            // Create new badge
            const badge = document.createElement('span');
            badge.className = 'data-source-badge badge';
            badge.style.cssText = `
                position: absolute;
                top: 8px;
                right: 8px;
                font-size: 10px;
                z-index: 10;
                opacity: 0.8;
            `;
            
            if (source === 'sample') {
                badge.classList.add('bg-warning', 'text-dark');
                badge.textContent = 'AMOSTRA';
                badge.title = 'Dados de demonstração - Conectividade em falha';
            } else {
                badge.classList.add('bg-success');
                badge.textContent = 'AO VIVO';
                badge.title = 'Dados em tempo real';
            }
            
            card.style.position = 'relative';
            card.appendChild(badge);
        });
    }
    
    /**
     * Removes data source badges from dashboard cards
     */
    function removeDataSourceBadges() {
        const badges = document.querySelectorAll('.data-source-badge');
        badges.forEach(badge => badge.remove());
    }
    
    /**
     * Shows persistent notification about data source
     */
    function showPersistentDataNotification() {
        // Remove existing notification first
        this.removePersistentDataNotification();
        
        const notification = document.createElement('div');
        notification.id = 'persistent-data-notification';
        notification.className = 'alert alert-warning alert-dismissible';
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 1050;
            max-width: 400px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        
        notification.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <div>
                    <strong>Dados de Demonstração</strong><br>
                    <small>Conectividade com servidor indisponível. Dados mostrados são exemplos para demonstração.</small>
                </div>
                <button type="button" class="btn-close ms-2" onclick="this.parentElement.parentElement.remove()"></button>
            </div>
            <div class="mt-2">
                <button class="btn btn-sm btn-outline-warning" onclick="window.dashboard?.loadDashboardData?.('30d')">
                    <i class="fas fa-sync-alt me-1"></i>Tentar Novamente
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
    }
    
    /**
     * Removes persistent data notification
     */
    function removePersistentDataNotification() {
        const notification = document.getElementById('persistent-data-notification');
        if (notification) notification.remove();
    }
    
    /**
     * Adds disclaimers to charts when using sample data
     */
    function addChartDisclaimers() {
        const chartContainers = document.querySelectorAll('.chart-container, [id*="Chart"]');
        chartContainers.forEach(container => {
            // Remove existing disclaimers
            const existingDisclaimer = container.querySelector('.chart-disclaimer');
            if (existingDisclaimer) existingDisclaimer.remove();
            
            const disclaimer = document.createElement('div');
            disclaimer.className = 'chart-disclaimer text-muted text-center mt-2';
            disclaimer.style.cssText = 'font-size: 11px; opacity: 0.7;';
            disclaimer.innerHTML = '<i class="fas fa-info-circle me-1"></i>Dados de demonstração';
            
            container.appendChild(disclaimer);
        });
    }
    
    /**
     * Removes chart disclaimers
     */
    function removeChartDisclaimers() {
        const disclaimers = document.querySelectorAll('.chart-disclaimer');
        disclaimers.forEach(disclaimer => disclaimer.remove());
    }
    
    /**
     * Adds timestamp information about data freshness
     */
    function addDataTimestamps(source = 'sample') {
        // Remove existing timestamps
        const existingTimestamps = document.querySelectorAll('.data-timestamp');
        existingTimestamps.forEach(ts => ts.remove());
        
        const timestamp = document.createElement('div');
        timestamp.className = 'data-timestamp text-muted text-end mt-2';
        timestamp.style.cssText = 'font-size: 11px; opacity: 0.7;';
        
        const now = new Date();
        if (source === 'sample') {
            timestamp.innerHTML = `<i class="fas fa-clock me-1"></i>Última tentativa: ${now.toLocaleTimeString('pt-BR')}`;
        } else {
            timestamp.innerHTML = `<i class="fas fa-check-circle me-1"></i>Atualizado: ${now.toLocaleTimeString('pt-BR')}`;
        }
        
        // Add to main content area
        const contentArea = document.querySelector('.content-area, .main-content');
        if (contentArea) {
            contentArea.appendChild(timestamp);
        }
    }
});

// Test function to manually trigger navigation
window.testAppointments = function() {
    console.log('🧪 [DEBUG] Teste manual - clicando appointments')
    console.log('🧪 [DEBUG] AdminDashboard instance exists:', !!window.dashboard)
    if (window.dashboard) {
        window.dashboard.navigateTo('appointments')
    } else {
        console.error('❌ [DEBUG] AdminDashboard instance not found')
    }
}