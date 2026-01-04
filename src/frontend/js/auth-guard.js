/**
 * Auth Guard - Protecao de rotas AIC
 * Incluir este script nas paginas que requerem autenticacao
 *
 * Uso:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="/js/supabase-client.js"></script>
 *   <script src="/js/auth-guard.js"></script>
 */

(async function() {
  'use strict';

  // Aguardar Supabase estar disponivel
  if (typeof supabaseClient === 'undefined') {
    console.error('[Auth Guard] supabaseClient nao encontrado. Inclua supabase-client.js primeiro.');
    return;
  }

  try {
    // Verificar sessao
    const { session, error } = await AICAuth.getSession();

    if (error) {
      console.error('[Auth Guard] Erro ao verificar sessao:', error);
    }

    if (!session) {
      console.log('[Auth Guard] Usuario nao autenticado. Redirecionando para login...');

      // Salvar URL atual para redirect apos login
      const currentPath = window.location.pathname + window.location.search;
      const redirectUrl = '/aic-login.html?redirect=' + encodeURIComponent(currentPath);

      window.location.href = redirectUrl;
      return;
    }

    // Usuario autenticado
    console.log('[Auth Guard] Usuario autenticado:', session.user.email);

    // Disponibilizar usuario globalmente
    window.currentUser = session.user;
    window.currentSession = session;

    // Buscar perfil completo do usuario
    const { data: userProfile } = await supabaseClient
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (userProfile) {
      window.currentUserProfile = userProfile;
      console.log('[Auth Guard] Perfil carregado:', userProfile.tipo_user, userProfile.user_app);
    }

    // Disparar evento customizado para outras partes da pagina
    window.dispatchEvent(new CustomEvent('aic:authenticated', {
      detail: {
        user: session.user,
        session: session,
        profile: userProfile
      }
    }));

    // Atualizar UI com info do usuario (se existir elementos)
    updateUserUI(session.user, userProfile);

  } catch (err) {
    console.error('[Auth Guard] Erro:', err);
    // Em caso de erro, redirecionar para login
    window.location.href = '/aic-login.html';
  }

  /**
   * Atualizar elementos de UI com dados do usuario
   */
  function updateUserUI(user, profile) {
    // Email do usuario
    const emailElements = document.querySelectorAll('[data-user-email]');
    emailElements.forEach(el => {
      el.textContent = user.email;
    });

    // Nome do usuario
    const nameElements = document.querySelectorAll('[data-user-name]');
    nameElements.forEach(el => {
      el.textContent = profile?.name || user.user_metadata?.name || user.email.split('@')[0];
    });

    // Avatar do usuario
    const avatarElements = document.querySelectorAll('[data-user-avatar]');
    avatarElements.forEach(el => {
      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
      if (avatarUrl) {
        el.src = avatarUrl;
        el.style.display = 'block';
      }
    });

    // Tipo de usuario (admin/normal)
    const tipoElements = document.querySelectorAll('[data-user-tipo]');
    tipoElements.forEach(el => {
      el.textContent = profile?.tipo_user || 'normal';
    });

    // Elementos so para admin
    const adminOnlyElements = document.querySelectorAll('[data-admin-only]');
    adminOnlyElements.forEach(el => {
      if (profile?.tipo_user !== 'admin') {
        el.style.display = 'none';
      }
    });

    // Botao de logout
    const logoutButtons = document.querySelectorAll('[data-logout]');
    logoutButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await AICAuth.signOut();
      });
    });
  }
})();

/**
 * Helper para verificar se usuario e admin
 */
function isAdmin() {
  return window.currentUserProfile?.tipo_user === 'admin';
}

/**
 * Helper para obter user_id atual
 */
function getCurrentUserId() {
  return window.currentUser?.id || null;
}
