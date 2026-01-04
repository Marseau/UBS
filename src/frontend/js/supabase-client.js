/**
 * Supabase Client Configuration
 * Cliente compartilhado para autenticacao em todas as paginas AIC
 */

const SUPABASE_URL = 'https://qsdfyffuonywmtnlycri.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMjY0NzgsImV4cCI6MjA2NjcwMjQ3OH0.IDJdOApiNM0FJvRe5mp28L7U89GWeHpPoPlPreexwbg';

// Criar cliente Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exportar para uso global
window.supabaseClient = supabaseClient;

/**
 * Funcoes auxiliares de autenticacao
 */
const AICAuth = {
  /**
   * Obter sessao atual
   */
  async getSession() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    return { session, error };
  },

  /**
   * Obter usuario atual
   */
  async getUser() {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    return { user, error };
  },

  /**
   * Login com Google
   */
  async signInWithGoogle() {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/aic-campaigns-dashboard.html'
      }
    });
    return { data, error };
  },

  /**
   * Login com email/senha
   */
  async signInWithEmail(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    return { data, error };
  },

  /**
   * Cadastro com email/senha
   */
  async signUp(email, password, metadata = {}) {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });
    return { data, error };
  },

  /**
   * Enviar magic link
   */
  async sendMagicLink(email) {
    const { data, error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + '/aic-campaigns-dashboard.html'
      }
    });
    return { data, error };
  },

  /**
   * Logout
   */
  async signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (!error) {
      window.location.href = '/aic-login.html';
    }
    return { error };
  },

  /**
   * Resetar senha
   */
  async resetPassword(email) {
    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/aic-reset-password.html'
    });
    return { data, error };
  },

  /**
   * Listener de mudanca de estado de auth
   */
  onAuthStateChange(callback) {
    return supabaseClient.auth.onAuthStateChange(callback);
  }
};

window.AICAuth = AICAuth;
