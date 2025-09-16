/**
 * Token Validator Utility
 * Previne navegação com tokens expirados
 * Implementa limpeza automática de tokens antigos
 */

/**
 * Verifica se token JWT está expirado e remove automaticamente tokens inválidos
 * @param {string} token - JWT token
 * @returns {boolean} - true se token válido, false se expirado/inválido
 */
function isTokenExpired(token) {
    if (!token) return true;

    try {
        // Decodificar payload do JWT
        const tokenPayload = JSON.parse(atob(token.split('.')[1]));
        const currentTime = Math.floor(Date.now() / 1000);

        // Verificar expiração
        if (tokenPayload.exp && currentTime > tokenPayload.exp) {
            console.log('❌ Token expirado detectado:', {
                exp: new Date(tokenPayload.exp * 1000),
                current: new Date(),
                expired_for: `${Math.round((currentTime - tokenPayload.exp) / 3600)}h`
            });
            return true;
        }

        console.log('✅ Token válido:', {
            exp: new Date(tokenPayload.exp * 1000),
            time_left: `${Math.round((tokenPayload.exp - currentTime) / 3600)}h`
        });
        return false;
    } catch (error) {
        console.error('❌ Token inválido/corrompido:', error);
        return true;
    }
}

/**
 * Função de autenticação robusta com limpeza automática
 * @returns {boolean} - true se autenticado, false se não
 */
function checkAuthWithAutoCleanup() {
    const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');

    if (!token) {
        console.log('❌ Nenhum token encontrado');
        redirectToLogin('Sessão não encontrada');
        return false;
    }

    if (isTokenExpired(token)) {
        console.log('❌ Token expirado, limpando localStorage...');
        localStorage.removeItem('ubs_token');
        localStorage.removeItem('adminToken');
        redirectToLogin('Sessão expirada');
        return false;
    }

    return true;
}

/**
 * Redireciona para login com mensagem
 * @param {string} message - Mensagem para o usuário
 */
function redirectToLogin(message = 'Sessão expirada') {
    alert(`${message}. Você será redirecionado para a página de login.`);
    window.location.href = 'login-standardized.html';
}

/**
 * Obtém token com validação automática
 * @returns {string|null} - Token válido ou null
 */
function getValidAuthToken() {
    const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');

    if (!token || isTokenExpired(token)) {
        console.error('❌ Token não disponível ou expirado');
        return null;
    }

    return 'Bearer ' + token;
}

// Exportar para uso global
window.TokenValidator = {
    isTokenExpired,
    checkAuthWithAutoCleanup,
    redirectToLogin,
    getValidAuthToken
};