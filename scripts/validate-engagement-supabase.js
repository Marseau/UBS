require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function validateEngagementSystem() {
  console.log('🔍 VALIDAÇÃO DO SISTEMA DE ENGAJAMENTO (Supabase)\n');

  try {
    // 1. Verificar perfis de engajamento
    console.log('📋 PASSO 1: Verificar perfis de engajamento');
    const { data: engagementProfiles, error: engError } = await supabase
      .from('instagram_leads')
      .select('*')
      .eq('search_term_used', 'engagement_notifications')
      .order('created_at', { ascending: false })
      .limit(10);

    if (engError) {
      console.error('   ❌ Erro ao buscar perfis:', engError);
    } else {
      console.log(`   ✅ Total de perfis de engajamento: ${engagementProfiles.length}`);

      if (engagementProfiles.length > 0) {
        console.log('   \n   📊 Últimos perfis registrados:');
        engagementProfiles.forEach((profile, idx) => {
          console.log(`\n   ${idx + 1}. @${profile.username}`);
          console.log(`      Nome: ${profile.full_name || 'N/A'}`);
          console.log(`      Score: ${profile.engagement_score} pontos`);
          console.log(`      Tipo interação: ${profile.last_interaction_type || 'N/A'}`);
          console.log(`      Comentou: ${profile.has_commented ? 'SIM' : 'NÃO'}`);
          console.log(`      Status follow: ${profile.follow_status}`);
          console.log(`      Criado em: ${new Date(profile.created_at).toLocaleString('pt-BR')}`);
        });
      } else {
        console.log('   ⚠️  Nenhum perfil de engajamento encontrado ainda');
      }
    }
    console.log('');

    // 2. Verificar se achado_especial foi salvo
    console.log('📋 PASSO 2: Verificar perfil específico @achado_especial');
    const { data: specificProfile, error: specError } = await supabase
      .from('instagram_leads')
      .select('*')
      .eq('username', 'achado_especial')
      .maybeSingle();

    if (specError) {
      console.error('   ❌ Erro ao buscar perfil:', specError);
    } else if (!specificProfile) {
      console.log('   ❌ Perfil @achado_especial NÃO foi encontrado no banco');
      console.log('   💡 Possíveis razões:');
      console.log('      - Workflow ainda não completou o scrape');
      console.log('      - Perfil foi rejeitado nas validações (idioma, activity score)');
      console.log('      - Erro durante o scrape');
    } else {
      console.log('   ✅ Perfil @achado_especial ENCONTRADO!');
      console.log('   📊 Dados:');
      console.log(`      Nome completo: ${specificProfile.full_name || 'N/A'}`);
      console.log(`      Seguidores: ${specificProfile.followers_count || 0}`);
      console.log(`      Engagement Score: ${specificProfile.engagement_score}`);
      console.log(`      Última interação: ${specificProfile.last_interaction_type || 'N/A'}`);
      console.log(`      Termo de busca: ${specificProfile.search_term_used}`);
      console.log(`      Criado em: ${new Date(specificProfile.created_at).toLocaleString('pt-BR')}`);
    }
    console.log('');

    // 3. Verificar histórico de DMs enviados
    console.log('📋 PASSO 3: Verificar histórico de DMs (últimos 30 dias)');
    const { data: dmHistory, error: dmError } = await supabase
      .from('instagram_dm_outreach')
      .select('*')
      .gte('sent_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('sent_at', { ascending: false })
      .limit(10);

    if (dmError) {
      console.error('   ❌ Erro ao buscar DMs:', dmError);
    } else {
      console.log(`   ✅ Total de DMs enviados (30 dias): ${dmHistory.length}`);

      if (dmHistory.length > 0) {
        console.log('   \n   📨 Últimos DMs enviados:');
        dmHistory.forEach((dm, idx) => {
          console.log(`\n   ${idx + 1}. @${dm.username}`);
          console.log(`      Enviado em: ${new Date(dm.sent_at).toLocaleString('pt-BR')}`);
          console.log(`      Status: ${dm.status}`);
        });
      } else {
        console.log('   ℹ️  Nenhum DM enviado nos últimos 30 dias');
      }
    }
    console.log('');

    // 4. Resumo e diagnóstico
    console.log('📊 RESUMO DA VALIDAÇÃO:');
    console.log(`   ${engagementProfiles?.length > 0 ? '✅' : '⚠️ '} Perfis de engajamento: ${engagementProfiles?.length || 0}`);
    console.log(`   ${specificProfile ? '✅' : '❌'} Perfil @achado_especial: ${specificProfile ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
    console.log(`   ${dmHistory?.length > 0 ? '✅' : 'ℹ️ '} DMs enviados: ${dmHistory?.length || 0}`);

  } catch (error) {
    console.error('❌ Erro durante validação:', error.message);
  }
}

validateEngagementSystem();
