// COLEAM00 Real Authentication Validation
// Based on real browser testing findings

class AuthValidation {
    constructor() {
        this.requiredTokens = ['ubs_token', 'adminToken', 'ubs_auth_token'];
        this.mockTokens = ['mockAuthToken', 'testToken'];
        this.redirectUrls = {
            login: 'login.html',
            dashboard: 'dashboard-tenant-admin.html'
        };
    }

    // REAL token detection based on Coleam00 testing
    detectAuthToken() {
        console.log('🔍 Detectando tokens de autenticação...');
        
        // Check multiple sources based on real testing
        const sources = [
            // Primary sources
            () => window.secureAuth?.getToken(),
            () => localStorage.getItem('ubs_token'),
            () => localStorage.getItem('adminToken'),
            () => localStorage.getItem('ubs_auth_token'),
            
            // Mock/test sources for development
            () => localStorage.getItem('mockAuthToken'),
            () => localStorage.getItem('testToken'),
            
            // Session storage fallback
            () => sessionStorage.getItem('authToken')
        ];

        for (let i = 0; i < sources.length; i++) {
            try {
                const token = sources[i]();
                if (token && token !== 'null' && token.length > 10) {
                    console.log(`✅ Token encontrado na fonte ${i + 1}:`, token.substring(0, 20) + '...');
                    return token;
                }
            } catch (error) {
                console.warn(`⚠️ Erro ao verificar fonte ${i + 1}:`, error);
            }
        }

        console.log('❌ Nenhum token válido encontrado');
        return null;
    }

    // Enhanced authentication check
    isAuthenticated() {
        const token = this.detectAuthToken();
        
        if (!token) {
            console.log('❌ Não autenticado: token não encontrado');
            return false;
        }

        // Validate token format (basic check)
        if (token.length < 10) {
            console.log('❌ Não autenticado: token muito curto');
            return false;
        }

        // Check if token is expired (if it's a JWT)
        try {
            if (token.includes('.')) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.exp && Date.now() >= payload.exp * 1000) {
                    console.log('❌ Não autenticado: token expirado');
                    this.clearAllTokens();
                    return false;
                }
            }
        } catch (error) {
            // Not a JWT, continue with basic validation
        }

        console.log('✅ Autenticado com sucesso');
        return true;
    }

    // Enhanced authorization header
    getAuthHeader() {
        const token = this.detectAuthToken();
        if (!token) {
            console.log('❌ Não foi possível obter header de autorização');
            return null;
        }

        const header = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
        console.log('🔑 Header de autorização criado:', header.substring(0, 30) + '...');
        return header;
    }

    // Clear all possible tokens
    clearAllTokens() {
        console.log('🧹 Limpando todos os tokens...');
        
        const keys = [
            'ubs_token', 'adminToken', 'ubs_auth_token',
            'mockAuthToken', 'testToken', 'authToken'
        ];

        keys.forEach(key => {
            try {
                localStorage.removeItem(key);
                sessionStorage.removeItem(key);
            } catch (error) {
                console.warn(`⚠️ Erro ao limpar ${key}:`, error);
            }
        });

        // Clear secureAuth if exists
        if (window.secureAuth?.logout) {
            window.secureAuth.logout();
        }

        console.log('✅ Tokens limpos');
    }

    // Redirect to login if not authenticated
    requireAuth() {
        if (!this.isAuthenticated()) {
            console.log('🚪 Redirecionando para login...');
            setTimeout(() => {
                window.location.href = this.redirectUrls.login;
            }, 1000);
            return false;
        }
        return true;
    }

    // Set mock token for development/testing
    setMockAuth() {
        console.log('🧪 Configurando autenticação mock...');
        const mockToken = 'mock_jwt_token_' + Date.now();
        const mockUser = {
            id: 1,
            name: 'Test User',
            email: 'test@example.com',
            role: 'admin',
            tenant_id: 1
        };

        localStorage.setItem('mockAuthToken', mockToken);
        localStorage.setItem('mockUserData', JSON.stringify(mockUser));
        
        console.log('✅ Mock auth configurado');
        return mockToken;
    }

    // Get user data from various sources
    getUserData() {
        const sources = [
            () => window.secureAuth?.getUserData(),
            () => JSON.parse(localStorage.getItem('ubs_user') || 'null'),
            () => JSON.parse(localStorage.getItem('userData') || 'null'),
            () => JSON.parse(localStorage.getItem('mockUserData') || 'null')
        ];

        for (const source of sources) {
            try {
                const userData = source();
                if (userData && userData.id) {
                    return userData;
                }
            } catch (error) {
                // Continue to next source
            }
        }

        return null;
    }

    // Update UI with user context
    updateUserContext() {
        const userData = this.getUserData();
        if (!userData) return;

        console.log('👤 Atualizando contexto do usuário:', userData.name);

        // Update avatar
        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl && userData.name) {
            avatarEl.textContent = userData.name.charAt(0).toUpperCase();
        }

        // Update user name
        const nameEl = document.getElementById('userName');
        if (nameEl && userData.name) {
            nameEl.textContent = userData.name;
        }

        // Update user role
        const roleEl = document.getElementById('userRole');
        if (roleEl && userData.role) {
            roleEl.textContent = userData.role === 'admin' ? 'Administrador' : userData.role;
        }
    }

    // Initialize authentication validation
    init() {
        console.log('🚀 Inicializando validação de autenticação...');
        
        // Update user context on load
        this.updateUserContext();

        // Set up periodic token validation
        setInterval(() => {
            if (!this.isAuthenticated() && window.location.pathname !== '/login.html') {
                console.log('⏰ Token expirado ou inválido, redirecionando...');
                this.requireAuth();
            }
        }, 30000); // Check every 30 seconds

        console.log('✅ Validação de autenticação inicializada');
    }
}

// Global instance
window.authValidation = new AuthValidation();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.authValidation.init();
});

// Global helper functions for backward compatibility
window.getAuthToken = () => window.authValidation.detectAuthToken();
window.getAuthHeader = () => window.authValidation.getAuthHeader();
window.isAuthenticated = () => window.authValidation.isAuthenticated();
window.requireAuth = () => window.authValidation.requireAuth();