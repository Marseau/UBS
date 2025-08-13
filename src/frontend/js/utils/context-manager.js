// Context Manager - Gerencia contexto do usuário para navegação adequada
class ContextManager {
    constructor() {
        this.currentContext = null;
        this.userContexts = {
            SUPER_ADMIN: 'super_admin',
            TENANT_ADMIN: 'tenant_admin',
            USER: 'user'
        };
        
        this.init();
    }

    // Inicializa o contexto baseado nos dados do usuário
    async init() {
        await this.detectContext();
        this.setupNavigationHandlers();
    }

    // Detecta o contexto atual do usuário
    async detectContext() {
        try {
            // FORÇA DETECÇÃO BASEADA NA URL PRIMEIRO
            const currentPage = window.location.pathname.split('/').pop();
            if (currentPage.includes('dashboard-standardized')) {
                this.currentContext = this.userContexts.SUPER_ADMIN;
                console.log('🔵 Detectado: SUPER ADMIN (via URL)');
                return this.currentContext;
            } else {
                // TODAS AS OUTRAS PÁGINAS SÃO TENANT ADMIN
                this.currentContext = this.userContexts.TENANT_ADMIN;
                console.log('🟢 Detectado: TENANT ADMIN (via URL)');
                
                // Carregar dados reais do tenant via API
                await this.loadRealTenantData();
                
                return this.currentContext;
            }

        } catch (error) {
            console.error('Erro ao detectar contexto:', error);
            this.currentContext = this.userContexts.TENANT_ADMIN;
            console.log('⚠️ Erro: Usando TENANT ADMIN como fallback');
        }

        return this.currentContext;
    }

    // Carrega dados reais do tenant via API
    async loadRealTenantData() {
        try {
            const token = localStorage.getItem('ubs_token');
            if (!token) {
                console.warn('⚠️ Token não encontrado');
                return;
            }

            const response = await fetch('/api/admin/user-info', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const userInfo = await response.json();
                const tenant = userInfo.data;

                if (tenant) {
                    this.currentUserData = {
                        tenantName: tenant.business_name || tenant.name,
                        businessName: tenant.business_name || tenant.name,
                        role: 'administrador',
                        tenantId: tenant.id,
                        domain: tenant.domain
                    };
                    console.log('✅ Dados reais do tenant carregados:', this.currentUserData);
                } else {
                    console.warn('⚠️ Dados do tenant não encontrados na resposta');
                }
            } else {
                console.error('❌ Erro ao carregar dados do tenant:', response.status);
            }
        } catch (error) {
            console.error('❌ Erro na API call para dados do tenant:', error);
        }
    }

    // Mapeia role para contexto
    mapRoleToContext(role) {
        if (!role) return this.userContexts.TENANT_ADMIN; // DEFAULT PARA TENANT ADMIN
        
        const roleLower = role.toLowerCase();
        
        if (roleLower.includes('super') || roleLower.includes('admin_global')) {
            return this.userContexts.SUPER_ADMIN;
        } else if (roleLower.includes('admin') || roleLower.includes('tenant') || roleLower.includes('administrador')) {
            return this.userContexts.TENANT_ADMIN;
        }
        
        return this.userContexts.TENANT_ADMIN; // DEFAULT PARA TENANT ADMIN
    }

    // Retorna o contexto atual
    getCurrentContext() {
        if (!this.currentContext) {
            this.detectContext();
        }
        return this.currentContext;
    }

    // Retorna dados do usuário atual
    getCurrentUserData() {
        if (!this.currentUserData) {
            this.detectContext();
        }
        return this.currentUserData;
    }

    // Verifica se é Super Admin
    isSuperAdmin() {
        return this.getCurrentContext() === this.userContexts.SUPER_ADMIN;
    }

    // Verifica se é Tenant Admin
    isTenantAdmin() {
        return this.getCurrentContext() === this.userContexts.TENANT_ADMIN;
    }

    // Atualiza avatar e informações do usuário na interface
    updateUserInterface() {
        const avatarElement = document.getElementById('userAvatar');
        const nameElement = document.getElementById('userName');
        const roleElement = document.getElementById('userRole');

        if (!avatarElement || !nameElement || !roleElement) {
            return; // Elementos não encontrados
        }

        const userData = this.getCurrentUserData();
        const context = this.getCurrentContext();

        if (context === this.userContexts.SUPER_ADMIN) {
            avatarElement.textContent = 'S';
            nameElement.textContent = 'Super Admin';
            roleElement.textContent = 'Super Administrador';
        } else if (context === this.userContexts.TENANT_ADMIN) {
            // Usa dados reais do tenant se disponível
            const tenantName = userData?.tenantName || userData?.businessName || 'Salão Bella Vista';
            const tenantInitial = tenantName.charAt(0).toUpperCase();
            
            avatarElement.textContent = tenantInitial;
            nameElement.textContent = tenantName;
            roleElement.textContent = 'Administrador';
        } else {
            // FALLBACK PARA TENANT ADMIN (não usuário comum)
            const tenantName = userData?.tenantName || userData?.businessName || 'Salão Bella Vista';
            const tenantInitial = tenantName.charAt(0).toUpperCase();
            
            avatarElement.textContent = tenantInitial;
            nameElement.textContent = tenantName;
            roleElement.textContent = 'Administrador';
        }
    }

    // Configura handlers de navegação baseados em contexto
    setupNavigationHandlers() {
        // Intercepta cliques nos links do menu
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a.nav-link');
            if (!link) return;

            const href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('http')) return;

            // Verifica se é uma navegação que precisa de contexto
            if (this.isContextSensitivePage(href)) {
                event.preventDefault();
                this.navigateWithContext(href);
            }
        });
    }

    // Verifica se a página é sensível ao contexto
    isContextSensitivePage(href) {
        const contextSensitivePages = [
            'appointments-standardized.html',
            'customers-standardized.html',
            'services-standardized.html',
            'conversations-standardized.html',
            'settings-standardized.html',
            'payments-standardized.html',
            'billing-standardized.html',
            'tenant-business-analytics.html'
        ];
        
        return contextSensitivePages.some(page => href.includes(page));
    }

    // Navega considerando o contexto
    navigateWithContext(href) {
        // Adiciona parâmetro de contexto à URL
        const url = new URL(href, window.location.origin);
        url.searchParams.set('context', this.getCurrentContext());
        
        // Adiciona dados do tenant se aplicável
        if (this.isTenantAdmin()) {
            const userData = this.getCurrentUserData();
            if (userData?.tenantId) {
                url.searchParams.set('tenantId', userData.tenantId);
            }
        }

        window.location.href = url.toString();
    }

    // Inicializa a página baseada no contexto da URL
    initializePageFromContext() {
        const urlParams = new URLSearchParams(window.location.search);
        const contextParam = urlParams.get('context');
        const tenantIdParam = urlParams.get('tenantId');

        if (contextParam) {
            this.currentContext = contextParam;
            
            if (tenantIdParam && contextParam === this.userContexts.TENANT_ADMIN) {
                // Atualiza dados do tenant se necessário
                if (this.currentUserData) {
                    this.currentUserData.tenantId = tenantIdParam;
                }
            }
        }

        // Atualiza interface depois da inicialização
        setTimeout(() => {
            this.updateUserInterface();
        }, 100);
    }

    // Método para forçar atualização de contexto
    refreshContext() {
        this.currentContext = null;
        this.currentUserData = null;
        this.detectContext();
        this.updateUserInterface();
    }
}

// Instância global
window.contextManager = new ContextManager();

// Inicializa quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    if (window.contextManager) {
        window.contextManager.initializePageFromContext();
    }
});

// Exporta para uso em outros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContextManager;
}