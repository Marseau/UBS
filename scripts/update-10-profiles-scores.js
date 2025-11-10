require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function update10ProfilesScores() {
  console.log('🔄 ATUALIZANDO SCORES DOS 10 PERFIS DE ENGAJAMENTO\n');

  const perfisNoBanco = [
    'achado_especial',
    'gestor_dofuturo',
    'mineironouber',
    'trafegocomgabriell',
    'pedroviski_021',
    'homeangelsbrasiliasudoeste',
    'rosellivet',
    'clicachados.app',
    'marseaufranco',
    'roamhub24'
  ];

  try {
    // 1. Buscar TODAS as notificações (sem filtro)
    console.log('📡 Buscando todas as notificações do Instagram...\n');

    const response = await axios.post('http://localhost:3000/api/instagram/check-engagement', {
      // SEM 'since' para pegar todas
    });

    console.log(`✅ Total de interações encontradas: ${response.data.total_interactions}\n`);

    if (response.data.total_interactions === 0) {
      console.log('⚠️  Nenhuma interação encontrada. Abortando atualização.');
      return;
    }

    // 2. Para cada perfil do banco, buscar suas interações e calcular score
    console.log('💾 Atualizando scores no banco...\n');

    let updated = 0;
    let notFound = 0;

    for (const username of perfisNoBanco) {
      const interactions = response.data.interactions.filter(i => i.username === username);

      if (interactions.length === 0) {
        console.log(`⏭️  @${username} - Sem interações nas notificações`);
        notFound++;
        continue;
      }

      // Calcular score e tipo de interação
      const liked = interactions.some(i => i.liked);
      const commented = interactions.some(i => i.commented);
      const followed = interactions.some(i => i.is_new_follower);

      let score = 0;
      let lastInteractionType = null;
      let followStatus = 'not_followed';
      let followedAt = null;

      if (commented) {
        score += 20;
        lastInteractionType = 'comment';
      } else if (liked) {
        score += 10;
        lastInteractionType = 'like';
      }

      if (followed) {
        score += 30;
        lastInteractionType = 'follow';
        followStatus = 'followed'; // Eles nos seguiram
        followedAt = interactions[0].notification_date || new Date().toISOString();
      }

      // Atualizar no banco
      const { error } = await supabase
        .from('instagram_leads')
        .update({
          engagement_score: score,
          last_interaction_type: lastInteractionType,
          has_commented: commented,
          follow_status: followStatus,
          followed_at: followedAt,
          interaction_count: interactions.length,
          last_check_notified_at: interactions[0].notification_date || new Date().toISOString()
        })
        .eq('username', username);

      if (error) {
        console.error(`❌ @${username} - Erro ao atualizar:`, error.message);
      } else {
        console.log(`✅ @${username} - Score atualizado: ${score} pontos (${lastInteractionType})`);
        updated++;
      }
    }

    // 3. Fechar navegador
    console.log('\n🧹 Fechando navegador...');
    try {
      await axios.post('http://localhost:3000/api/instagram/close-browser');
      console.log('✅ Navegador fechado com sucesso');
    } catch (closeError) {
      console.log('⚠️  Navegador já estava fechado ou erro ao fechar');
    }

    console.log('\n📊 RESUMO:');
    console.log(`   ✅ Perfis atualizados: ${updated}`);
    console.log(`   ⏭️  Perfis sem interações: ${notFound}`);
    console.log(`   📋 Total verificado: ${perfisNoBanco.length}`);

  } catch (error) {
    if (error.response) {
      console.error('❌ Erro na API:', error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ Servidor não está rodando na porta 3000');
    } else {
      console.error('❌ Erro:', error.message);
    }
  }
}

update10ProfilesScores();
