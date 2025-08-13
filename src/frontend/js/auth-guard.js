// =================================================================
// Universal Booking System - Auth Guard
// =================================================================
// Este script atua como um portão de segurança para páginas
// que exigem autenticação. Ele deve ser o primeiro script
// a ser executado no <head> da página.

// Ele verifica a presença e validade de um token de autenticação.
// Se o usuário não estiver autenticado, ele é imediatamente
// redirecionado para a página de login antes que qualquer
// conteúdo da página protegida seja renderizado.
// =================================================================

(function() {
    // Tenta obter o token do localStorage
    const token = localStorage.getItem('ubs_token') || localStorage.getItem('adminToken');

    // Verifica se o token existe
    if (!token) {
        console.warn('Auth Guard: Token não encontrado. Redirecionando para /login.html');
        window.location.href = '/login.html';
        return;
    }

    try {
        // Decodifica o payload do token para verificar a expiração.
        const payload = JSON.parse(atob(token.split('.')[1]));
        const now = Math.floor(Date.now() / 1000);

        // Se o token expirou, limpa o localStorage e redireciona.
        if (payload.exp < now) {
            console.warn('Auth Guard: Token expirado. Limpando sessão e redirecionando.');
            localStorage.removeItem('ubs_token');
            localStorage.removeItem('adminToken');
            localStorage.removeItem('ubs_user');
            window.location.href = '/login.html';
        }
    } catch (e) {
        // Se houver um erro ao decodificar, o token é inválido.
        console.error('Auth Guard: Token inválido. Limpando sessão e redirecionando.', e);
        localStorage.removeItem('ubs_token');
        localStorage.removeItem('adminToken');
        localStorage.removeItem('ubs_user');
        window.location.href = '/login.html';
    }
})(); 