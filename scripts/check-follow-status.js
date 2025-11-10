require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkFollowStatus() {
  console.log('🔍 Verificando status de follow para @achado_especial\n');

  try {
    // Verificar no banco
    const { data: profile, error } = await supabase
      .from('instagram_leads')
      .select('username, follow_status, followed_at, last_interaction_type, engagement_score')
      .eq('username', 'achado_especial')
      .single();

    if (error) {
      console.error('❌ Erro ao buscar perfil:', error);
      return;
    }

    console.log('📊 Dados do perfil no banco:');
    console.log(`   Username: @${profile.username}`);
    console.log(`   Follow status: ${profile.follow_status}`);
    console.log(`   Seguimos em: ${profile.followed_at || 'N/A'}`);
    console.log(`   Última interação: ${profile.last_interaction_type || 'N/A'}`);
    console.log(`   Engagement score: ${profile.engagement_score}`);
    console.log('');

    if (profile.follow_status === 'following') {
      console.log('✅ SIM, seguimos @achado_especial');
    } else if (profile.follow_status === 'followed') {
      console.log('✅ @achado_especial nos seguiu (mas ainda não seguimos de volta)');
    } else {
      console.log('❌ NÃO seguimos @achado_especial');
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkFollowStatus();
