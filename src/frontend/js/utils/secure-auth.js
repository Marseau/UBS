// Secure authentication management
class SecureAuth {
    constructor() {
        this.tokenKey = 'ubs_auth_token';
        this.userKey = 'ubs_user_data';
        this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
        this.encryptionKey = this.generateKey();
    }

    // Generate a browser-specific encryption key
    generateKey() {
        const userAgent = navigator.userAgent;
        const platform = navigator.platform;
        const language = navigator.language;
        return btoa(userAgent + platform + language).slice(0, 32);
    }

    // Simple XOR encryption for localStorage data
    encrypt(text) {
        if (!text) return null;
        const key = this.encryptionKey;
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(result);
    }

    decrypt(encrypted) {
        if (!encrypted) return null;
        try {
            const text = atob(encrypted);
            const key = this.encryptionKey;
            let result = '';
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
        } catch (error) {
            console.error('Failed to decrypt data:', error);
            return null;
        }
    }

    // Store token with expiration and encryption
    setToken(token) {
        if (!token) return false;
        
        const tokenData = {
            token: token,
            timestamp: Date.now(),
            expires: Date.now() + this.sessionTimeout
        };
        
        const encrypted = this.encrypt(JSON.stringify(tokenData));
        if (!encrypted) return false;
        
        try {
            localStorage.setItem(this.tokenKey, encrypted);
            return true;
        } catch (error) {
            console.error('Failed to store token:', error);
            return false;
        }
    }

    // Get token and validate expiration
    getToken() {
        try {
            const encrypted = localStorage.getItem(this.tokenKey);
            if (!encrypted) return null;
            
            const decrypted = this.decrypt(encrypted);
            if (!decrypted) return null;
            
            const tokenData = JSON.parse(decrypted);
            
            // Check if token is expired
            if (Date.now() > tokenData.expires) {
                this.clearToken();
                return null;
            }
            
            return tokenData.token;
        } catch (error) {
            console.error('Failed to retrieve token:', error);
            this.clearToken();
            return null;
        }
    }

    // Store user data (non-sensitive only)
    setUserData(userData) {
        if (!userData) return false;
        
        // Only store non-sensitive user data
        const safeUserData = {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            role: userData.role,
            tenantId: userData.tenantId || userData.tenant_id,
            timestamp: Date.now()
        };
        
        const encrypted = this.encrypt(JSON.stringify(safeUserData));
        if (!encrypted) return false;
        
        try {
            localStorage.setItem(this.userKey, encrypted);
            return true;
        } catch (error) {
            console.error('Failed to store user data:', error);
            return false;
        }
    }

    // Get user data
    getUserData() {
        try {
            const encrypted = localStorage.getItem(this.userKey);
            if (!encrypted) return null;
            
            const decrypted = this.decrypt(encrypted);
            if (!decrypted) return null;
            
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('Failed to retrieve user data:', error);
            this.clearUserData();
            return null;
        }
    }

    // Clear token
    clearToken() {
        try {
            localStorage.removeItem(this.tokenKey);
        } catch (error) {
            console.error('Failed to clear token:', error);
        }
    }

    // Clear user data
    clearUserData() {
        try {
            localStorage.removeItem(this.userKey);
        } catch (error) {
            console.error('Failed to clear user data:', error);
        }
    }

    // Clear all authentication data
    clearAll() {
        this.clearToken();
        this.clearUserData();
        
        // Also clear old localStorage keys for migration
        try {
            localStorage.removeItem('ubs_token');
            localStorage.removeItem('ubs_user');
            localStorage.removeItem('adminToken');
        } catch (error) {
            console.error('Failed to clear legacy tokens:', error);
        }
    }

    // Check if user is authenticated
    isAuthenticated() {
        const token = this.getToken();
        const userData = this.getUserData();
        return !!(token && userData);
    }

    // Get authorization header for API calls
    getAuthHeader() {
        const token = this.getToken();
        return token ? `Bearer ${token}` : null;
    }

    // Login method
    login(token, userData) {
        const tokenSet = this.setToken(token);
        const userSet = this.setUserData(userData);
        
        if (tokenSet && userSet) {
            console.log('Authentication data stored securely');
            return true;
        } else {
            console.error('Failed to store authentication data');
            this.clearAll();
            return false;
        }
    }

    // Logout method
    logout() {
        this.clearAll();
        console.log('Authentication data cleared');
    }

    // Migrate from old localStorage format
    migrateFromLegacy() {
        try {
            const oldToken = localStorage.getItem('ubs_token');
            const oldUser = localStorage.getItem('ubs_user');
            
            if (oldToken && oldUser) {
                const userData = JSON.parse(oldUser);
                const migrated = this.login(oldToken, userData);
                
                if (migrated) {
                    // Clear old format
                    localStorage.removeItem('ubs_token');
                    localStorage.removeItem('ubs_user');
                    console.log('Successfully migrated authentication data to secure format');
                    return true;
                }
            }
        } catch (error) {
            console.error('Failed to migrate legacy authentication data:', error);
        }
        return false;
    }
}

// Global instance
window.secureAuth = new SecureAuth();

// Auto-migrate on load - DISABLED for compatibility
// document.addEventListener('DOMContentLoaded', () => {
//     window.secureAuth.migrateFromLegacy();
// });