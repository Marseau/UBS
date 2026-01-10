/**
 * Supabase Client Configuration
 * Cliente compartilhado para autenticacao em todas as paginas AIC
 */

const SUPABASE_URL = 'https://qsdfyffuonywmtnlycri.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMjY0NzgsImV4cCI6MjA2NjcwMjQ3OH0.IDJdOApiNM0FJvRe5mp28L7U89GWeHpPoPlPreexwbg';

// Aguardar SDK do Supabase e inicializar
(function initSupabaseClient() {
  if (typeof supabase === 'undefined') {
    setTimeout(initSupabaseClient, 50);
    return;
  }

  // Criar cliente Supabase
  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.supabaseClient = client;
  window.supabase = client; // Alias para compatibilidade

  // Criar AICAuth
  window.AICAuth = {
    async getSession() {
      const { data: { session }, error } = await client.auth.getSession();
      return { session, error };
    },

    async getUser() {
      const { data: { user }, error } = await client.auth.getUser();
      return { user, error };
    },

    async signInWithGoogle() {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/aic-campaigns-dashboard.html'
        }
      });
      return { data, error };
    },

    async signInWithEmail(email, password) {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password
      });
      return { data, error };
    },

    async signUp(email, password, metadata = {}) {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: metadata
        }
      });
      return { data, error };
    },

    async sendMagicLink(email) {
      const { data, error } = await client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + '/aic-campaigns-dashboard.html'
        }
      });
      return { data, error };
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (!error) {
        window.location.href = '/aic-login.html';
      }
      return { error };
    },

    async resetPassword(email) {
      const { data, error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/aic-reset-password.html'
      });
      return { data, error };
    },

    onAuthStateChange(callback) {
      return client.auth.onAuthStateChange(callback);
    }
  };
})();
