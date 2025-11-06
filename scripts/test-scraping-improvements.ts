/**
 * Script de teste para validar melhorias no scraping:
 * - Link da bio limpo (não wrapeado)
 * - Full name sempre capturado
 * - Bio completa expandida
 */

import { scrapeInstagramTag } from '../src/services/instagram-scraper-single.service';

async function testScrapingImprovements() {
  console.log('\n🧪 ===== TESTE DE MELHORIAS DE SCRAPING =====\n');

  try {
    // TESTE 1: Scraping por hashtag
    console.log('📊 TESTE 1: Scraping por Hashtag #esporteparatodos\n');
    console.log('   Buscando até 3 perfis para validar melhorias...\n');

    const hashtagResults = await scrapeInstagramTag('esporteparatodos', 3);

    console.log(`\n✅ Scraping concluído: ${hashtagResults.length} perfis encontrados\n`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Validar cada perfil
    hashtagResults.forEach((profile, index) => {
      console.log(`\n📋 PERFIL ${index + 1}: @${profile.username}`);
      console.log('─────────────────────────────────────────────────────────');

      // Validação 1: Full Name
      if (profile.full_name && profile.full_name.trim().length > 0) {
        console.log(`✅ Full Name: "${profile.full_name}"`);
      } else {
        console.log(`❌ Full Name: VAZIO ou NULL`);
      }

      // Validação 2: Bio Completa
      if (profile.bio) {
        const bioLength = profile.bio.length;
        const hasTruncation = profile.bio.includes('... mais') || profile.bio.includes('|... mais');

        if (hasTruncation) {
          console.log(`⚠️  Bio: TRUNCADA (${bioLength} chars) - "${profile.bio.substring(0, 50)}..."`);
        } else {
          console.log(`✅ Bio Completa: ${bioLength} chars`);
          if (bioLength > 100) {
            console.log(`   "${profile.bio.substring(0, 80)}..."`);
          } else {
            console.log(`   "${profile.bio}"`);
          }
        }
      } else {
        console.log(`⚠️  Bio: VAZIA ou NULL`);
      }

      // Validação 3: Link da Bio Limpo
      if (profile.website) {
        const isWrapped = profile.website.includes('l.instagram.com/?u=');
        const isClean = profile.website.startsWith('http') && !isWrapped;

        if (isWrapped) {
          console.log(`❌ Website: WRAPEADO (não decodificou)`);
          console.log(`   "${profile.website.substring(0, 60)}..."`);
        } else if (isClean) {
          console.log(`✅ Website Limpo: "${profile.website}"`);
        } else {
          console.log(`⚠️  Website: Formato inesperado - "${profile.website}"`);
        }
      } else {
        console.log(`   Website: Não disponível (sem link na bio)`);
      }

      // Dados adicionais
      console.log(`\n   📊 Métricas:`);
      console.log(`      Seguidores: ${profile.followers_count.toLocaleString()}`);
      console.log(`      Posts: ${profile.posts_count}`);
      console.log(`      Idioma: ${profile.language || 'não detectado'}`);
      console.log(`      Activity Score: ${profile.activity_score || 'N/A'}/100`);

      if (profile.email) {
        console.log(`      Email: ${profile.email}`);
      }

      if (profile.hashtags_bio && profile.hashtags_bio.length > 0) {
        console.log(`      Hashtags Bio: ${profile.hashtags_bio.slice(0, 3).join(', ')}`);
      }
    });

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Resumo de validação
    const fullNameCount = hashtagResults.filter(p => p.full_name && p.full_name.trim().length > 0).length;
    const completeBioCount = hashtagResults.filter(p =>
      p.bio && !p.bio.includes('... mais') && !p.bio.includes('|... mais')
    ).length;
    const cleanWebsiteCount = hashtagResults.filter(p =>
      p.website && !p.website.includes('l.instagram.com/?u=')
    ).length;
    const hasWebsiteCount = hashtagResults.filter(p => p.website).length;

    console.log('📊 RESUMO DA VALIDAÇÃO:\n');
    console.log(`   Full Name capturado: ${fullNameCount}/${hashtagResults.length} perfis ✅`);
    console.log(`   Bio completa: ${completeBioCount}/${hashtagResults.length} perfis ${completeBioCount === hashtagResults.length ? '✅' : '⚠️'}`);
    console.log(`   Website limpo: ${cleanWebsiteCount}/${hasWebsiteCount} perfis com link ${cleanWebsiteCount === hasWebsiteCount ? '✅' : '❌'}`);

    if (fullNameCount === hashtagResults.length &&
        completeBioCount === hashtagResults.length &&
        cleanWebsiteCount === hasWebsiteCount) {
      console.log('\n🎉 TODAS AS MELHORIAS VALIDADAS COM SUCESSO!\n');
    } else {
      console.log('\n⚠️  ALGUMAS MELHORIAS PRECISAM DE AJUSTES\n');
    }

  } catch (error: any) {
    console.error('\n❌ ERRO NO TESTE:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Executar teste
testScrapingImprovements()
  .then(() => {
    console.log('✅ Teste concluído');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
