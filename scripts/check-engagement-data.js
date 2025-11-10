require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkEngagementData() {
  console.log('🔍 Verificando dados de engajamento salvos no banco...\n');

  const { data, error } = await supabase
    .from('instagram_leads')
    .select(`
      username,
      search_term_used,
      has_commented,
      last_interaction_type,
      interaction_count,
      engagement_score,
      follow_status,
      followed_at,
      last_check_notified_at
    `)
    .eq('search_term_used', 'engagement_notifications')
    .order('engagement_score', { ascending: false });

  if (error) {
    console.error('❌ Erro:', error);
    return;
  }

  if (data.length === 0) {
    console.log('⚠️  Nenhum perfil de engajamento encontrado no banco.');
    return;
  }

  console.log(`📊 Encontrados ${data.length} perfis de engajamento:\n`);

  data.forEach((profile, index) => {
    console.log(`${index + 1}. 👤 @${profile.username}`);
    console.log(`   Score: ${profile.engagement_score} pontos`);
    console.log(`   Última interação: ${profile.last_interaction_type || 'N/A'}`);
    console.log(`   Comentou: ${profile.has_commented ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`   Status follow: ${profile.follow_status}`);
    if (profile.followed_at) {
      const date = new Date(profile.followed_at).toLocaleString('pt-BR');
      console.log(`   Seguiu em: ${date}`);
    }
    if (profile.last_check_notified_at) {
      const date = new Date(profile.last_check_notified_at).toLocaleString('pt-BR');
      console.log(`   Notificação: ${date}`);
    }
    console.log('');
  });

  // Estatísticas
  const stats = {
    total: data.length,
    commented: data.filter(p => p.has_commented).length,
    following: data.filter(p => p.follow_status === 'following').length,
    avgScore: (data.reduce((sum, p) => sum + (p.engagement_score || 0), 0) / data.length).toFixed(1)
  };

  console.log('📈 Estatísticas:');
  console.log(`   Total: ${stats.total} perfis`);
  console.log(`   Comentaram: ${stats.commented} (${(stats.commented/stats.total*100).toFixed(1)}%)`);
  console.log(`   Seguindo: ${stats.following} (${(stats.following/stats.total*100).toFixed(1)}%)`);
  console.log(`   Score médio: ${stats.avgScore} pontos`);
}

checkEngagementData();
