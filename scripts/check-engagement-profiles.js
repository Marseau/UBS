require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const usernames = [
  'elevsolutions',
  'stcsistemas',
  'roamhub24',
  'benditocoworking',
  'clicachados.app',
  'rosellivet',
  'cconecta.ag',
  'acamarketingdigital',
  'homeangelsbrasiliasudoeste',
  'pedroviski',
  'start.midiasociais',
  'eubruno_gestor',
  'trafegocomgabriell',
  'growsales.oficial',
  'metatreina',
  'mineironouber',
  'av.reginasa',
  'neurodesenvolver.dracena',
  'conectafacilloficial',
  'ray.secretariaremota',
  'aoponto.ia',
  'mandandobemaulasparticulares',
  'gestor_dofuturo',
  'achado_especial',
  'marseaufranco'
];

async function checkProfiles() {
  console.log(`🔍 Verificando ${usernames.length} perfis na tabela instagram_leads...\n`);

  const { data, error } = await supabase
    .from('instagram_leads')
    .select('username, created_at, followers_count, search_term_used, contact_status')
    .in('username', usernames)
    .order('username');

  if (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }

  console.log(`✅ Encontrados: ${data.length} perfis\n`);

  if (data.length > 0) {
    console.log('📋 Perfis já cadastrados:');
    data.forEach(profile => {
      const date = new Date(profile.created_at).toLocaleDateString('pt-BR');
      console.log(`   • @${profile.username} (${profile.followers_count || 0} seguidores, termo: ${profile.search_term_used || 'N/A'}, status: ${profile.contact_status})`);
    });
  }

  const existingUsernames = data.map(p => p.username);
  const missingUsernames = usernames.filter(u => !existingUsernames.includes(u));

  if (missingUsernames.length > 0) {
    console.log(`\n❌ Perfis NÃO encontrados (${missingUsernames.length}):`);
    missingUsernames.forEach(username => {
      console.log(`   • @${username}`);
    });
  } else {
    console.log('\n✅ Todos os perfis estão cadastrados!');
  }

  console.log(`\n📊 Resumo:`);
  console.log(`   Total verificados: ${usernames.length}`);
  console.log(`   Encontrados: ${data.length}`);
  console.log(`   Faltando: ${missingUsernames.length}`);
}

checkProfiles();
