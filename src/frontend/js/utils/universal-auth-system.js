/**
 * Universal Authentication & Authorization System
 * Ensures proper role-based access control across all pages
 */

class UniversalAuthSystem {
    constructor() {
        this.currentUser = null;
        this.authToken = null;
        this.baseUrl = '/api';
        this.init();
    }

    async init() {
        // Load authentication state
        await this.loadAuthState();
        
        // Setup page-specific authentication
        await this.setupPageAuth();
        
        // Setup universal avatar functionality
        this.setupUniversalAvatar();
        
        // Setup API interceptors
        this.setupAPIInterceptors();
    }

    async loadAuthState() {
        try {
            console.log('🔐 Loading auth state...');
            
            // Get token from secure storage
            this.authToken = localStorage.getItem('authToken') || 
                           sessionStorage.getItem('authToken');
            
            console.log('🎫 Token found:', !!this.authToken);
            
            if (!this.authToken) {
                console.log('❌ No token found - user needs to login');
                // Don't auto-redirect to prevent infinite loops
                return;
            }

            // Decode and validate token
            console.log('🔍 Decoding token...');
            const tokenPayload = this.decodeToken(this.authToken);
            console.log('📦 Token payload:', tokenPayload);
            
            if (!tokenPayload || this.isTokenExpired(tokenPayload)) {
                console.log('❌ Invalid or expired token');
                this.clearAuthAndRedirect();
                return;
            }

            this.currentUser = {
                id: tokenPayload.id,
                email: tokenPayload.email,
                name: tokenPayload.name || tokenPayload.email.split('@')[0],
                role: tokenPayload.role,
                tenant_id: tokenPayload.tenant_id,
                permissions: tokenPayload.permissions || []
            };

            console.log('🔐 Auth loaded:', this.currentUser.email, `(${this.currentUser.role})`);
            
        } catch (error) {
            console.error('❌ Auth loading failed:', error);
            this.clearAuthAndRedirect();
        }
    }

    async setupPageAuth() {
        // If currentUser is not loaded, don't proceed
        if (!this.currentUser) {
            console.log('❌ No currentUser - auth setup failed');
            return;
        }

        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const pageConfig = this.getPageConfig(currentPage);
        
        console.log(`🔍 Checking access for page: ${currentPage}`);
        console.log(`📋 Page config:`, pageConfig);
        
        // Check if user has access to this page
        if (!this.hasPageAccess(pageConfig)) {
            console.log(`🚫 Access denied for ${this.currentUser?.role || 'unknown'} to ${currentPage}`);
            this.redirectToAccessDenied();
            return;
        }

        // NOVA VERIFICAÇÃO: Subscription status (exceto para super_admin)
        if (this.currentUser.role !== 'super_admin') {
            console.log('🔍 Verificando subscription status...');
            const subscriptionValid = await this.checkSubscriptionStatus();
            
            if (!subscriptionValid.valid) {
                console.log(`🚫 Subscription inválida: ${subscriptionValid.reason}`);
                
                // Permitir acesso à página de billing
                if (currentPage === 'billing-standardized.html' || currentPage === 'billing.html') {
                    console.log('✅ Permitindo acesso à página de billing');
                } else {
                    console.log('🔄 Redirecionando para billing...');
                    this.redirectToBilling(subscriptionValid);
                    return;
                }
            } else {
                console.log(`✅ Subscription válida: ${subscriptionValid.reason}`);
                
                // Se está em trial, mostrar aviso
                if (subscriptionValid.type === 'trial') {
                    this.showTrialWarning(subscriptionValid);
                }
            }
        }

        console.log(`✅ Access granted for ${this.currentUser?.role || 'unknown'} to ${currentPage}`);
        
        // Setup page-specific functionality
        this.setupPageSpecificAuth(pageConfig);
    }

    getPageConfig(pageName) {
        const pageConfigs = {
            // Super Admin Only Pages
            'tenant-business-analytics.html': { 
                requiredRole: 'super_admin',
                title: 'Tenant Analytics',
                apiEndpoints: ['/api/super-admin/tenant-analytics']
            },
            'tenants-standardized.html': { 
                requiredRole: 'super_admin',
                title: 'Platform Management',
                apiEndpoints: ['/api/super-admin/tenants']
            },
            
            // Tenant Admin Pages  
            'dashboard-standardized.html': { 
                requiredRole: ['tenant_admin', 'super_admin'],
                title: 'Dashboard',
                apiEndpoints: ['/api/admin/dashboard', '/api/analytics/dashboard']
            },
            'appointments-standardized.html': { 
                requiredRole: ['tenant_admin', 'super_admin'],
                title: 'Appointments',
                apiEndpoints: ['/api/admin/appointments']
            },
            'customers-standardized.html': { 
                requiredRole: ['tenant_admin', 'super_admin'],
                title: 'Customers', 
                apiEndpoints: ['/api/admin/users']
            },
            'conversations-standardized.html': { 
                requiredRole: ['tenant_admin', 'super_admin'],
                title: 'Conversations',
                apiEndpoints: ['/api/admin/conversations']
            },
            'services-standardized.html': { 
                requiredRole: ['tenant_admin', 'super_admin'],
                title: 'Services',
                apiEndpoints: ['/api/admin/services']
            },
            'professionals-standardized.html': { 
                requiredRole: ['tenant_admin', 'super_admin'],
                title: 'Professionals',
                apiEndpoints: ['/api/admin/professionals']
            },
            'settings-standardized.html': { 
                requiredRole: ['tenant_admin', 'super_admin'],
                title: 'Settings',
                apiEndpoints: ['/api/admin/settings']
            },
            'analytics-standardized.html': { 
                requiredRole: ['tenant_admin', 'super_admin'],
                title: 'Analytics',
                apiEndpoints: ['/api/analytics/dashboard']
            },
            'payments-standardized.html': { 
                requiredRole: ['tenant_admin', 'super_admin'],
                title: 'Payments',
                apiEndpoints: ['/api/admin/payments']
            },
            'billing-standardized.html': { 
                requiredRole: ['tenant_admin', 'super_admin'],
                title: 'Billing',
                apiEndpoints: ['/api/admin/billing']
            }
        };

        return pageConfigs[pageName] || { 
            requiredRole: ['tenant_admin', 'super_admin'],
            title: 'Dashboard',
            apiEndpoints: []
        };
    }

    hasPageAccess(pageConfig) {
        if (!this.currentUser) return false;
        
        const requiredRoles = Array.isArray(pageConfig.requiredRole) 
            ? pageConfig.requiredRole 
            : [pageConfig.requiredRole];
            
        return requiredRoles.includes(this.currentUser.role);
    }

    setupPageSpecificAuth(pageConfig) {
        // Update page title based on user context
        if (pageConfig.title) {
            document.title = `${pageConfig.title} - ${this.currentUser.role === 'super_admin' ? 'Platform Admin' : 'Tenant Admin'}`;
        }

        // Setup role-specific UI elements
        this.setupRoleSpecificUI();
    }

    setupRoleSpecificUI() {
        // Hide/show elements based on role
        const superAdminElements = document.querySelectorAll('[data-role="super_admin"]');
        const tenantAdminElements = document.querySelectorAll('[data-role="tenant_admin"]');
        
        if (this.currentUser.role === 'super_admin') {
            superAdminElements.forEach(el => el.style.display = '');
            tenantAdminElements.forEach(el => el.style.display = 'none');
        } else {
            superAdminElements.forEach(el => el.style.display = 'none');
            tenantAdminElements.forEach(el => el.style.display = '');
        }
    }

    setupUniversalAvatar() {
        // Only setup avatar if user is loaded
        if (!this.currentUser) {
            console.log('❌ No currentUser - skipping avatar setup');
            return;
        }

        // Update all avatar elements across the page
        this.updateAvatarElements();
        
        // Setup dropdown functionality
        this.setupAvatarDropdown();
        
        // Setup logout functionality
        this.setupLogoutFunctionality();
    }

    updateAvatarElements() {
        // Update user name displays
        const nameElements = document.querySelectorAll('#adminName, #currentUser, .user-name, [data-user="name"]');
        nameElements.forEach(el => {
            el.textContent = this.currentUser.name || this.currentUser.email.split('@')[0];
        });

        // Update user email displays
        const emailElements = document.querySelectorAll('.user-email, [data-user="email"]');
        emailElements.forEach(el => {
            el.textContent = this.currentUser.email;
        });

        // Update role displays
        const roleElements = document.querySelectorAll('.user-role, [data-user="role"]');
        roleElements.forEach(el => {
            el.textContent = this.currentUser.role === 'super_admin' ? 'Super Admin' : 'Tenant Admin';
        });

        // Setup avatar image/icon
        const avatarElements = document.querySelectorAll('.user-avatar, #userAvatar, [data-user="avatar"]');
        avatarElements.forEach(el => {
            if (el.tagName === 'IMG') {
                el.src = this.generateAvatarURL(this.currentUser.name || this.currentUser.email);
                el.alt = `${this.currentUser.name} Avatar`;
            } else {
                el.innerHTML = this.generateAvatarHTML(this.currentUser.name || this.currentUser.email);
            }
        });
    }

    setupAvatarDropdown() {
        // Find all dropdown toggle elements
        const dropdownToggles = document.querySelectorAll('[data-bs-toggle="dropdown"], .dropdown-toggle');
        
        dropdownToggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Find the associated dropdown menu
                const dropdownMenu = toggle.nextElementSibling || 
                                   toggle.closest('.dropdown')?.querySelector('.dropdown-menu');
                
                if (dropdownMenu) {
                    // Toggle dropdown visibility
                    if (dropdownMenu.classList.contains('show')) {
                        dropdownMenu.classList.remove('show');
                    } else {
                        // Close other dropdowns first
                        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                            menu.classList.remove('show');
                        });
                        dropdownMenu.classList.add('show');
                    }
                }
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown')) {
                document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
        });
    }

    setupLogoutFunctionality() {
        // Setup all logout buttons
        const logoutButtons = document.querySelectorAll('[data-action="logout"], .logout-btn, #logoutBtn');
        
        logoutButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        });
    }

    setupAPIInterceptors() {
        // Override fetch to automatically add auth headers
        const originalFetch = window.fetch;
        window.fetch = async (url, options = {}) => {
            if (url.startsWith('/api/') && this.authToken) {
                options.headers = {
                    ...options.headers,
                    'Authorization': `Bearer ${this.authToken}`,
                    'Content-Type': 'application/json'
                };
            }
            
            const response = await originalFetch(url, options);
            
            // Handle auth errors
            if (response.status === 401 || response.status === 403) {
                console.log('🚫 API auth error:', response.status, url);
                
                if (response.status === 401) {
                    this.clearAuthAndRedirect();
                }
            }
            
            return response;
        };
    }

    // Utility Methods
    decodeToken(token) {
        try {
            const payload = token.split('.')[1];
            return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        } catch (error) {
            return null;
        }
    }

    isTokenExpired(tokenPayload) {
        if (!tokenPayload.exp) return false;
        return Date.now() >= tokenPayload.exp * 1000;
    }

    generateAvatarURL(name) {
        // Generate avatar using initials
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=0d6efd&color=fff&size=40`;
    }

    generateAvatarHTML(name) {
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        return `<div class="avatar-circle" style="width: 40px; height: 40px; border-radius: 50%; background: #0d6efd; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold;">${initials}</div>`;
    }

    logout() {
        console.log('🚪 Logging out...');
        
        // Clear auth state
        localStorage.removeItem('authToken');
        sessionStorage.removeItem('authToken');
        localStorage.removeItem('user_role');
        localStorage.removeItem('tenant_id');
        
        // Clear current user
        this.currentUser = null;
        this.authToken = null;
        
        // Redirect to login
        window.location.href = '/login-standardized.html';
    }

    clearAuthAndRedirect() {
        this.logout();
    }

    redirectToLogin() {
        window.location.href = '/login-standardized.html';
    }

    redirectToAccessDenied() {
        alert(`Access Denied: This page requires ${this.getPageConfig(window.location.pathname.split('/').pop()).requiredRole} privileges.`);
        
        // Redirect based on role
        if (this.currentUser.role === 'super_admin') {
            window.location.href = '/tenant-business-analytics.html';
        } else {
            window.location.href = '/dashboard-standardized.html';
        }
    }

    // Public API for pages to use
    getAuthHeaders() {
        return {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
        };
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isRole(role) {
        return this.currentUser?.role === role;
    }

    isSuperAdmin() {
        return this.currentUser?.role === 'super_admin';
    }

    isTenantAdmin() {
        return this.currentUser?.role === 'tenant_admin';
    }

    /**
     * Verifica status da subscription via API
     */
    async checkSubscriptionStatus() {
        try {
            console.log('🔍 Verificando subscription status via API...');
            
            const response = await fetch('/api/auth/subscription-status', {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                console.error('❌ Erro na API de subscription:', response.status);
                return {
                    valid: false,
                    reason: 'API error',
                    type: 'api_error'
                };
            }

            const data = await response.json();
            console.log('📊 Subscription status:', data);

            return {
                valid: data.subscription_valid,
                reason: data.reason,
                type: data.subscription_type,
                days_remaining: data.days_remaining,
                trial_ends_at: data.trial_ends_at,
                subscription_status: data.subscription_status
            };

        } catch (error) {
            console.error('❌ Erro ao verificar subscription:', error);
            return {
                valid: false,
                reason: 'Network error',
                type: 'network_error'
            };
        }
    }

    /**
     * Redireciona para página de billing
     */
    redirectToBilling(subscriptionInfo) {
        // Salvar informações para mostrar na página de billing
        sessionStorage.setItem('subscription_info', JSON.stringify(subscriptionInfo));
        
        // Redirecionar
        window.location.href = '/billing-standardized.html';
    }

    /**
     * Mostra aviso de trial
     */
    showTrialWarning(subscriptionInfo) {
        if (subscriptionInfo.days_remaining <= 3) {
            // Criar banner de aviso
            const banner = document.createElement('div');
            banner.className = 'trial-warning-banner';
            banner.innerHTML = `
                <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 10px; border-radius: 5px; text-align: center;">
                    <strong>⚠️ Trial Expiring Soon!</strong>
                    <p>Your trial expires in ${subscriptionInfo.days_remaining} day(s). 
                    <a href="/billing-standardized.html" style="color: #007bff; text-decoration: underline;">
                        Subscribe now to continue using the service.
                    </a></p>
                </div>
            `;
            
            // Inserir no topo da página
            const body = document.body;
            body.insertBefore(banner, body.firstChild);
        }
    }
}

// Initialize global auth system
const UniversalAuth = new UniversalAuthSystem();

// Export for use in other scripts
window.UniversalAuth = UniversalAuth;