require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAllEngagementProfiles() {
  console.log('🔍 Verificando TODOS os perfis de engajamento salvos ontem\n');

  try {
    // Buscar todos os perfis de engajamento
    const { data: profiles, error } = await supabase
      .from('instagram_leads')
      .select('username, full_name, engagement_score, follow_status, last_interaction_type, has_commented, created_at')
      .eq('search_term_used', 'engagement_notifications')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar perfis:', error);
      return;
    }

    console.log(`📊 Total de perfis de engajamento: ${profiles.length}\n`);

    // Separar por situação
    const withScore = profiles.filter(p => p.engagement_score > 0);
    const withoutScore = profiles.filter(p => p.engagement_score === 0);
    const following = profiles.filter(p => p.follow_status === 'following');
    const notFollowed = profiles.filter(p => p.follow_status === 'not_followed');

    console.log('📈 ESTATÍSTICAS:');
    console.log(`   ✅ Com engagement_score > 0: ${withScore.length}`);
    console.log(`   ⚠️  Com engagement_score = 0: ${withoutScore.length}`);
    console.log(`   ✅ Seguindo: ${following.length}`);
    console.log(`   ❌ Não seguindo: ${notFollowed.length}`);
    console.log('');

    // Mostrar perfis com score = 0 E não seguidos
    const problematicos = profiles.filter(p => p.engagement_score === 0 && p.follow_status === 'not_followed');

    if (problematicos.length > 0) {
      console.log(`⚠️  ${problematicos.length} PERFIS NA MESMA SITUAÇÃO que @achado_especial:\n`);
      problematicos.forEach((p, idx) => {
        console.log(`${idx + 1}. @${p.username}`);
        console.log(`   Nome: ${p.full_name || 'N/A'}`);
        console.log(`   Score: ${p.engagement_score}`);
        console.log(`   Follow: ${p.follow_status}`);
        console.log(`   Última interação: ${p.last_interaction_type || 'N/A'}`);
        console.log(`   Criado: ${new Date(p.created_at).toLocaleString('pt-BR')}`);
        console.log('');
      });

      console.log('💡 DIAGNÓSTICO:');
      console.log('   Estes perfis foram salvos SEM engagement_data (modo scraping normal)');
      console.log('   Por isso têm score = 0 e não foram seguidos');
      console.log('   Quando o workflow rodar com engagement_data, eles serão atualizados');
    }

    // Mostrar perfis que FORAM processados corretamente
    const processados = profiles.filter(p => p.engagement_score > 0 || p.follow_status === 'following');

    if (processados.length > 0) {
      console.log(`\n✅ ${processados.length} PERFIS PROCESSADOS CORRETAMENTE:\n`);
      processados.forEach((p, idx) => {
        console.log(`${idx + 1}. @${p.username}`);
        console.log(`   Nome: ${p.full_name || 'N/A'}`);
        console.log(`   Score: ${p.engagement_score}`);
        console.log(`   Follow: ${p.follow_status}`);
        console.log(`   Última interação: ${p.last_interaction_type || 'N/A'}`);
        console.log(`   Comentou: ${p.has_commented ? 'SIM' : 'NÃO'}`);
        console.log(`   Criado: ${new Date(p.created_at).toLocaleString('pt-BR')}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkAllEngagementProfiles();
