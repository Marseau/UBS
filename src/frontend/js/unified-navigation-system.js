/**
 * UNIFIED NAVIGATION SYSTEM
 * Synchronizes navigation patterns across all dashboards
 */

(function() {
    'use strict';

    // Navigation configuration
    const NAV_CONFIG = {
        // Super Admin Navigation
        superAdmin: {
            sections: [
                {
                    title: 'Dashboard',
                    items: [
                        { href: 'dashboard-standardized.html', icon: 'fas fa-chart-line', text: 'Visão Geral' }
                    ]
                },
                {
                    title: 'Operações',
                    items: [
                        { href: 'appointments-standardized.html', icon: 'fas fa-calendar-check', text: 'Agendamentos' },
                        { href: 'customers-standardized.html', icon: 'fas fa-users', text: 'Clientes' },
                        { href: 'services-standardized.html', icon: 'fas fa-concierge-bell', text: 'Serviços' }
                    ]
                },
                {
                    title: 'Comunicação',
                    items: [
                        { href: 'conversations.html', icon: 'fab fa-whatsapp', text: 'Conversas' }
                    ]
                },
                {
                    title: 'Financeiro',
                    items: [
                        { href: 'payments-standardized.html', icon: 'fas fa-credit-card', text: 'Pagamentos' },
                        { href: 'billing.html', icon: 'fas fa-file-invoice-dollar', text: 'Faturamento' }
                    ]
                },
                {
                    title: 'Sistema',
                    items: [
                        { href: 'settings.html', icon: 'fas fa-cog', text: 'Configurações' }
                    ]
                }
            ]
        },
        // Tenant Admin Navigation
        tenantAdmin: {
            sections: [
                {
                    title: 'Dashboard',
                    items: [
                        { href: 'dashboard-tenant-admin.html', icon: 'fas fa-chart-line', text: 'Visão Geral' }
                    ]
                },
                {
                    title: 'Operações',
                    items: [
                        { href: 'appointments.html', icon: 'fas fa-calendar-check', text: 'Agendamentos' },
                        { href: 'customers.html', icon: 'fas fa-users', text: 'Clientes' },
                        { href: 'services.html', icon: 'fas fa-concierge-bell', text: 'Serviços' }
                    ]
                },
                {
                    title: 'Comunicação',
                    items: [
                        { href: 'conversations.html', icon: 'fab fa-whatsapp', text: 'Conversas' }
                    ]
                },
                {
                    title: 'Analytics',
                    items: [
                        { href: 'analytics.html', icon: 'fas fa-chart-bar', text: 'Relatórios' }
                    ]
                },
                {
                    title: 'Sistema',
                    items: [
                        { href: 'settings.html', icon: 'fas fa-cog', text: 'Configurações' }
                    ]
                }
            ]
        }
    };

    // Unified Navigation System
    class UnifiedNavigationSystem {
        constructor() {
            this.currentPath = window.location.pathname;
            this.userRole = null;
            this.initializeCSS();
            this.detectUserRole();
        }

        // Initialize CSS for navigation
        initializeCSS() {
            if (document.getElementById('unified-navigation-styles')) return;

            const style = document.createElement('style');
            style.id = 'unified-navigation-styles';
            style.textContent = `
                /* Unified Navigation Styles */
                .sidebar {
                    width: 260px;
                    height: 100vh;
                    background: linear-gradient(135deg, #2d5a9b 0%, #1e3a6f 100%);
                    color: white;
                    position: fixed;
                    left: 0;
                    top: 0;
                    overflow-y: auto;
                    transition: all 0.3s ease;
                    z-index: 1000;
                    box-shadow: 4px 0 12px rgba(0,0,0,0.1);
                }

                .sidebar.collapsed {
                    width: 70px;
                }

                .sidebar .logo {
                    padding: 1.5rem 1rem;
                    text-align: center;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                }

                .sidebar .logo img {
                    max-height: 40px;
                    transition: all 0.3s ease;
                }

                .sidebar.collapsed .logo img {
                    max-height: 30px;
                }

                .nav-section {
                    margin: 1rem 0;
                }

                .nav-section-title {
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    padding: 0.5rem 1rem;
                    color: rgba(255,255,255,0.7);
                    margin-bottom: 0.5rem;
                    transition: all 0.3s ease;
                }

                .sidebar.collapsed .nav-section-title {
                    opacity: 0;
                    font-size: 0;
                    padding: 0;
                    margin: 0;
                }

                .nav-link {
                    display: flex;
                    align-items: center;
                    padding: 0.75rem 1rem;
                    color: rgba(255,255,255,0.85);
                    text-decoration: none;
                    transition: all 0.3s ease;
                    position: relative;
                    border-radius: 0;
                }

                .nav-link:hover {
                    background: rgba(255,255,255,0.1);
                    color: white;
                }

                .nav-link.active {
                    background: rgba(255,255,255,0.15);
                    color: white;
                    font-weight: 500;
                }

                .nav-link.active::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    width: 3px;
                    background: #ffd700;
                }

                .nav-link i {
                    width: 20px;
                    text-align: center;
                    margin-right: 0.75rem;
                    transition: all 0.3s ease;
                }

                .sidebar.collapsed .nav-link {
                    justify-content: center;
                    padding: 0.75rem;
                }

                .sidebar.collapsed .nav-link span {
                    display: none;
                }

                .sidebar.collapsed .nav-link i {
                    margin-right: 0;
                }

                /* Top Navigation */
                .top-navbar {
                    background: white;
                    border-bottom: 1px solid #e2e8f0;
                    padding: 0.75rem 0;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }

                .main-content {
                    margin-left: 260px;
                    min-height: 100vh;
                    background: #f8fafc;
                    transition: all 0.3s ease;
                }

                .main-content.expanded {
                    margin-left: 70px;
                }

                /* User Menu Styles */
                .user-menu .dropdown-toggle {
                    border: none;
                    background: none;
                    padding: 0.5rem;
                }

                .user-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: var(--ubs-primary, #2d5a9b);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    font-size: 0.9rem;
                }

                .compact-button {
                    padding: 0.375rem 0.5rem !important;
                }

                .compact-text {
                    font-size: 0.9rem;
                }

                .compact-small {
                    font-size: 0.8rem;
                }

                .compact-dropdown {
                    font-size: 0.9rem;
                }

                .compact-dropdown-item {
                    padding: 0.375rem 0.75rem;
                }

                .compact-dropdown-header {
                    font-size: 0.8rem;
                    padding: 0.25rem 0.75rem;
                }

                /* Mobile Navigation */
                @media (max-width: 768px) {
                    .sidebar {
                        transform: translateX(-100%);
                        z-index: 1050;
                    }
                    
                    .sidebar.mobile-open {
                        transform: translateX(0);
                    }
                    
                    .sidebar-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0,0,0,0.5);
                        z-index: 1040;
                        opacity: 0;
                        visibility: hidden;
                        transition: all 0.3s ease;
                    }
                    
                    .sidebar-overlay.show {
                        opacity: 1;
                        visibility: visible;
                    }
                    
                    .main-content {
                        margin-left: 0;
                    }
                    
                    .main-content.expanded {
                        margin-left: 0;
                    }
                }

                /* Breadcrumb Navigation */
                .breadcrumb-nav {
                    background: white;
                    padding: 0.75rem 1rem;
                    border-bottom: 1px solid #e2e8f0;
                    margin-bottom: 1rem;
                }

                .breadcrumb {
                    margin-bottom: 0;
                    background: none;
                    padding: 0;
                }

                .breadcrumb-item {
                    font-size: 0.9rem;
                }

                .breadcrumb-item.active {
                    color: var(--ubs-primary, #2d5a9b);
                    font-weight: 500;
                }

                /* Quick Navigation */
                .quick-nav {
                    position: fixed;
                    bottom: 30px;
                    left: 30px;
                    z-index: 999;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .quick-nav-button {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: var(--ubs-primary, #2d5a9b);
                    color: white;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    transition: all 0.3s ease;
                    cursor: pointer;
                }

                .quick-nav-button:hover {
                    transform: scale(1.1);
                    background: var(--ubs-accent, #1e3a6f);
                }

                @media (max-width: 768px) {
                    .quick-nav {
                        bottom: 20px;
                        left: 20px;
                    }
                    
                    .quick-nav-button {
                        width: 44px;
                        height: 44px;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // Detect user role based on current page
        detectUserRole() {
            if (this.currentPath.includes('dashboard-standardized') || 
                this.currentPath.includes('super-admin')) {
                this.userRole = 'super_admin';
            } else if (this.currentPath.includes('dashboard-tenant-admin') || 
                       this.currentPath.includes('tenant-business-analytics')) {
                this.userRole = 'tenant_admin';
            } else {
                // Try to detect from token or localStorage
                const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');
                if (token) {
                    try {
                        const payload = JSON.parse(atob(token.split('.')[1]));
                        this.userRole = payload.role || 'tenant_admin';
                    } catch (e) {
                        this.userRole = 'tenant_admin'; // Default
                    }
                } else {
                    this.userRole = 'tenant_admin'; // Default
                }
            }
            
            console.log(`🧭 Navigation role detected: ${this.userRole}`);
        }

        // Initialize navigation
        initialize() {
            this.updateSidebarNavigation();
            this.setupSidebarToggle();
            this.setupMobileNavigation();
            this.setActiveNavigation();
            this.addBreadcrumbNavigation();
            this.setupQuickNavigation();
            
            console.log('✅ Unified Navigation System initialized');
        }

        // Update sidebar navigation based on role
        updateSidebarNavigation() {
            const sidebar = document.getElementById('sidebar');
            if (!sidebar) return;

            // Check if sidebar already has static navigation sections
            const existingNavSections = sidebar.querySelectorAll('.nav-section');
            if (existingNavSections.length > 0) {
                console.log('🔍 Static sidebar navigation detected, skipping dynamic generation');
                return; // Don't create dynamic navigation if static exists
            }

            const config = this.userRole === 'super_admin' ? 
                NAV_CONFIG.superAdmin : NAV_CONFIG.tenantAdmin;

            // Find nav sections container
            let navContainer = sidebar.querySelector('.nav-sections-container');
            if (!navContainer) {
                // Create nav container after logo
                const logo = sidebar.querySelector('.logo');
                navContainer = document.createElement('div');
                navContainer.className = 'nav-sections-container';
                if (logo && logo.nextSibling) {
                    sidebar.insertBefore(navContainer, logo.nextSibling);
                } else if (logo) {
                    sidebar.appendChild(navContainer);
                }
            }

            // Clear existing nav sections (except logo)
            navContainer.innerHTML = '';

            // Build navigation sections
            config.sections.forEach(section => {
                const sectionElement = document.createElement('div');
                sectionElement.className = 'nav-section';
                
                sectionElement.innerHTML = `
                    <div class="nav-section-title">${section.title}</div>
                    <ul class="nav flex-column">
                        ${section.items.map(item => `
                            <li class="nav-item">
                                <a class="nav-link" href="${item.href}">
                                    <i class="${item.icon}"></i>
                                    <span>${item.text}</span>
                                </a>
                            </li>
                        `).join('')}
                    </ul>
                `;
                
                navContainer.appendChild(sectionElement);
            });
        }

        // Setup sidebar toggle functionality
        setupSidebarToggle() {
            const sidebarToggle = document.getElementById('sidebarToggle');
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.getElementById('mainContent');

            if (sidebarToggle && sidebar && mainContent) {
                sidebarToggle.addEventListener('click', () => {
                    sidebar.classList.toggle('collapsed');
                    mainContent.classList.toggle('expanded');
                    
                    // Store preference
                    localStorage.setItem('sidebar_collapsed', sidebar.classList.contains('collapsed'));
                });

                // Restore sidebar state
                const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
                if (isCollapsed) {
                    sidebar.classList.add('collapsed');
                    mainContent.classList.add('expanded');
                }
            }
        }

        // Setup mobile navigation
        setupMobileNavigation() {
            const sidebarToggle = document.getElementById('sidebarToggle');
            const sidebar = document.getElementById('sidebar');
            const sidebarOverlay = document.getElementById('sidebarOverlay');

            if (!sidebarOverlay) {
                // Create overlay if it doesn't exist
                const overlay = document.createElement('div');
                overlay.className = 'sidebar-overlay';
                overlay.id = 'sidebarOverlay';
                document.body.appendChild(overlay);
            }

            const overlay = document.getElementById('sidebarOverlay');

            if (sidebarToggle && sidebar && overlay) {
                // Mobile toggle handler
                const toggleMobile = () => {
                    if (window.innerWidth <= 768) {
                        sidebar.classList.toggle('mobile-open');
                        overlay.classList.toggle('show');
                    }
                };

                sidebarToggle.addEventListener('click', (e) => {
                    if (window.innerWidth <= 768) {
                        e.stopPropagation();
                        toggleMobile();
                    }
                });

                // Overlay click handler
                overlay.addEventListener('click', () => {
                    sidebar.classList.remove('mobile-open');
                    overlay.classList.remove('show');
                });

                // Close on escape key
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && sidebar.classList.contains('mobile-open')) {
                        sidebar.classList.remove('mobile-open');
                        overlay.classList.remove('show');
                    }
                });
            }
        }

        // Set active navigation item
        setActiveNavigation() {
            const navLinks = document.querySelectorAll('.sidebar .nav-link');
            const currentFile = this.currentPath.split('/').pop() || 'index.html';

            navLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href && (href === currentFile || this.currentPath.includes(href))) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
        }

        // Add breadcrumb navigation
        addBreadcrumbNavigation() {
            const mainContent = document.getElementById('mainContent');
            if (!mainContent) return;

            const breadcrumbContainer = document.createElement('div');
            breadcrumbContainer.className = 'breadcrumb-nav d-none d-md-block';
            
            const breadcrumbData = this.getBreadcrumbData();
            
            breadcrumbContainer.innerHTML = `
                <nav aria-label="breadcrumb">
                    <ol class="breadcrumb">
                        ${breadcrumbData.map((item, index) => `
                            <li class="breadcrumb-item ${index === breadcrumbData.length - 1 ? 'active' : ''}">
                                ${index === breadcrumbData.length - 1 ? 
                                    item.text : 
                                    `<a href="${item.href}" class="text-decoration-none">${item.text}</a>`
                                }
                            </li>
                        `).join('')}
                    </ol>
                </nav>
            `;

            // Insert after top navbar
            const topNavbar = mainContent.querySelector('.top-navbar');
            if (topNavbar && topNavbar.nextSibling) {
                mainContent.insertBefore(breadcrumbContainer, topNavbar.nextSibling);
            }
        }

        // Get breadcrumb data based on current page
        getBreadcrumbData() {
            const breadcrumbs = [
                { href: this.userRole === 'super_admin' ? 'dashboard-standardized.html' : 'dashboard-tenant-admin.html', text: 'Dashboard' }
            ];

            const currentFile = this.currentPath.split('/').pop();
            
            const pageMap = {
                'appointments-standardized.html': 'Agendamentos',
                'appointments.html': 'Agendamentos',
                'customers-standardized.html': 'Clientes', 
                'customers.html': 'Clientes',
                'services-standardized.html': 'Serviços',
                'services.html': 'Serviços',
                'conversations.html': 'Conversas',
                'analytics.html': 'Relatórios',
                'settings.html': 'Configurações',
                'tenant-business-analytics.html': 'Analytics do Negócio'
            };

            if (pageMap[currentFile]) {
                breadcrumbs.push({ text: pageMap[currentFile] });
            }

            return breadcrumbs;
        }

        // Setup quick navigation
        setupQuickNavigation() {
            const quickNav = document.createElement('div');
            quickNav.className = 'quick-nav d-none d-lg-flex';
            quickNav.innerHTML = `
                <button class="quick-nav-button" onclick="window.history.back()" title="Voltar">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <button class="quick-nav-button" onclick="window.location.reload()" title="Recarregar">
                    <i class="fas fa-sync"></i>
                </button>
                <button class="quick-nav-button" onclick="window.scrollTo(0,0)" title="Topo">
                    <i class="fas fa-arrow-up"></i>
                </button>
            `;

            document.body.appendChild(quickNav);
        }

        // Navigate to page
        navigateTo(href) {
            window.location.href = href;
        }

        // Update navigation for role change
        updateForRole(newRole) {
            this.userRole = newRole;
            this.updateSidebarNavigation();
            this.setActiveNavigation();
            console.log(`🧭 Navigation updated for role: ${newRole}`);
        }

        // Get current navigation state
        getNavigationState() {
            return {
                role: this.userRole,
                currentPath: this.currentPath,
                sidebarCollapsed: document.getElementById('sidebar')?.classList.contains('collapsed'),
                mobileOpen: document.getElementById('sidebar')?.classList.contains('mobile-open')
            };
        }
    }

    // Create global instance
    window.unifiedNavigationSystem = new UnifiedNavigationSystem();

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.unifiedNavigationSystem.initialize();
        });
    } else {
        window.unifiedNavigationSystem.initialize();
    }

    // Backward compatibility
    window.setupSidebarToggle = () => window.unifiedNavigationSystem.setupSidebarToggle();
    window.setupMobileNavigation = () => window.unifiedNavigationSystem.setupMobileNavigation();
    window.setupActiveNavigation = () => window.unifiedNavigationSystem.setActiveNavigation();

    console.log('✅ Unified Navigation System loaded');

})();