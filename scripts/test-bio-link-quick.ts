/**
 * Teste rápido e direto: captura link da bio de perfil conhecido
 */

// @ts-nocheck
import { scrapeInstagramProfile } from '../src/services/instagram-scraper-single.service';

async function testBioLinkQuick() {
  console.log('\n🧪 TESTE RÁPIDO: Link da Bio\n');

  // Testar com perfil que sabemos que tem link: terapiaocupacional.expert
  const username = 'terapiaocupacional.expert';

  console.log(`📋 Testando perfil: @${username}\n`);

  try {
    const profile = await scrapeInstagramProfile(username);

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`✅ Scraping concluído: @${profile.username}\n`);
    console.log('─────────────────────────────────────────────────────────\n');

    console.log(`Full Name: ${profile.full_name || 'NULL'}`);
    console.log(`Bio: ${profile.bio ? `${profile.bio.substring(0, 100)}${profile.bio.length > 100 ? '...' : ''}` : 'NULL'}`);
    console.log(`\n🔗 WEBSITE CAPTURADO: ${profile.website || 'NULL'}\n`);

    if (profile.website) {
      const isThreads = profile.website.includes('threads.com') || profile.website.includes('Threads');
      const isWrapped = profile.website.includes('l.instagram.com/?u=');

      if (isThreads) {
        console.log('❌ ERRO: Capturou link do THREADS (botão social)');
      } else if (isWrapped) {
        console.log('❌ ERRO: Link WRAPEADO (não decodificou)');
      } else {
        console.log('✅ SUCESSO: Link limpo capturado!');
      }
    } else {
      console.log('❌ ERRO: Nenhum link capturado (NULL)');
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message);
    process.exit(1);
  }
}

testBioLinkQuick()
  .then(() => {
    console.log('✅ Teste concluído');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
