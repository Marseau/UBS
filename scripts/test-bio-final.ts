/**
 * Teste final com perfis que SABEMOS que funcionam
 * Perfis capturados com sucesso no teste de hashtag
 */

// @ts-nocheck
import { scrapeInstagramProfile } from '../src/services/instagram-scraper-single.service';

async function testBioFinal() {
  console.log('\n🧪 TESTE FINAL: Validação de Captura de Dados\n');

  // Perfis que funcionaram no teste de hashtag
  const profiles = ['elafazterapia', 'gabrielamalosso.psicologa'];

  for (const username of profiles) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 Testando: @${username}`);
    console.log('='.repeat(60));

    try {
      const profile = await scrapeInstagramProfile(username);

      console.log(`\n✅ Scraping concluído!\n`);
      console.log(`   Username: @${profile.username}`);
      console.log(`   Full Name: ${profile.full_name || 'NULL'}`);
      console.log(`   Seguidores: ${profile.followers_count.toLocaleString()}`);
      console.log(`   Posts: ${profile.posts_count}`);

      if (profile.bio) {
        const bioPreview = profile.bio.length > 100 ? profile.bio.substring(0, 100) + '...' : profile.bio;
        console.log(`   Bio: ${bioPreview}`);
      }

      console.log(`\n   🔗 Website: ${profile.website || 'NULL'}`);

      if (profile.website) {
        const isThreads = profile.website.includes('threads.com');
        const isWrapped = profile.website.includes('l.instagram.com/?u=');

        if (isThreads) {
          console.log(`      ❌ ERRO: Link do Threads`);
        } else if (isWrapped) {
          console.log(`      ❌ ERRO: Link wrapeado`);
        } else {
          console.log(`      ✅ Link limpo capturado!`);
        }
      }

      if (profile.email) {
        console.log(`   📧 Email: ${profile.email}`);
      }

    } catch (error: any) {
      console.error(`\n   ❌ ERRO: ${error.message}`);
    }

    // Delay entre perfis
    if (username !== profiles[profiles.length - 1]) {
      console.log(`\n   ⏳ Aguardando 5s antes do próximo perfil...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`\n${'='.repeat(60)}\n`);
  console.log('✅ Teste final concluído\n');
}

testBioFinal()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
