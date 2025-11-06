/**
 * Teste de captura de link da bio via busca
 * Usa scrapeInstagramTag para encontrar perfis reais
 * e valida a captura do link da bio
 */

// @ts-nocheck
import { scrapeInstagramTag } from '../src/services/instagram-scraper-single.service';

async function testBioViaSearch() {
  console.log('\n🧪 ===== TESTE DE LINK DA BIO VIA HASHTAG =====\n');

  try {
    // Testar com hashtag "psicologa" - deve retornar vários perfis
    console.log('🔍 Buscando por hashtag: #psicologa\n');
    console.log('   Limite: 3 perfis\n');

    const results = await scrapeInstagramTag('psicologa', 3);

    console.log(`\n✅ Busca concluída: ${results.length} perfis encontrados\n`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Validar cada perfil
    results.forEach((profile, index) => {
      console.log(`\n📋 PERFIL ${index + 1}: @${profile.username}`);
      console.log('─────────────────────────────────────────────────────────');

      // Validação 1: Full Name
      if (profile.full_name && profile.full_name.trim().length > 0) {
        console.log(`✅ Full Name: "${profile.full_name}"`);
      } else {
        console.log(`❌ Full Name: VAZIO ou NULL`);
      }

      // Validação 2: Bio
      if (profile.bio) {
        const bioLength = profile.bio.length;
        const hasTruncation = profile.bio.includes('... mais') || profile.bio.includes('|... mais');

        if (hasTruncation) {
          console.log(`⚠️  Bio TRUNCADA (${bioLength} chars)`);
        } else {
          console.log(`✅ Bio: ${bioLength} chars`);
        }

        // Mostrar preview da bio
        if (bioLength > 80) {
          console.log(`   "${profile.bio.substring(0, 80)}..."`);
        } else {
          console.log(`   "${profile.bio}"`);
        }
      } else {
        console.log(`⚠️  Bio: VAZIA`);
      }

      // Validação 3: Website (CRÍTICO)
      console.log('\n🔗 VALIDAÇÃO DO LINK DA BIO:');
      if (profile.website) {
        console.log(`   Link capturado: "${profile.website}"`);

        // Verificar se é link wrapeado
        const isWrapped = profile.website.includes('l.instagram.com/?u=');
        const isThreads = profile.website.includes('threads.com') || profile.website.includes('Threads');
        const isClean = profile.website.startsWith('http') && !isWrapped && !isThreads;

        if (isWrapped) {
          console.log(`   ❌ ERRO: Link WRAPEADO (não decodificou)`);
        } else if (isThreads) {
          console.log(`   ❌ ERRO: Capturou link do THREADS (botão social)`);
        } else if (isClean) {
          console.log(`   ✅ SUCESSO: Link limpo capturado`);
        } else {
          console.log(`   ⚠️  ATENÇÃO: Formato inesperado`);
        }
      } else {
        console.log(`   ℹ️  Sem link na bio (NULL)`);
      }

      // Métricas
      console.log(`\n📊 Métricas:`);
      console.log(`   Seguidores: ${profile.followers_count.toLocaleString()}`);
      console.log(`   Posts: ${profile.posts_count}`);
      console.log(`   Business: ${profile.is_business_account ? 'Sim' : 'Não'}`);

      if (profile.email) {
        console.log(`   Email: ${profile.email}`);
      }
    });

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Resumo geral
    const fullNameCount = results.filter(p => p.full_name && p.full_name.trim().length > 0).length;
    const bioOkCount = results.filter(p => p.bio && !p.bio.includes('... mais')).length;
    const hasWebsiteCount = results.filter(p => p.website).length;
    const cleanWebsiteCount = results.filter(p =>
      p.website && !p.website.includes('l.instagram.com/?u=') && !p.website.includes('Threads')
    ).length;

    console.log('📊 RESUMO GERAL:\n');
    console.log(`   Full Name capturado: ${fullNameCount}/${results.length} perfis`);
    console.log(`   Bio completa: ${bioOkCount}/${results.length} perfis`);
    console.log(`   Tem website: ${hasWebsiteCount}/${results.length} perfis`);
    console.log(`   Website limpo: ${cleanWebsiteCount}/${hasWebsiteCount} perfis com link`);

    if (cleanWebsiteCount === hasWebsiteCount && hasWebsiteCount > 0) {
      console.log('\n🎉 CORREÇÃO DO LINK DA BIO: SUCESSO!\n');
    } else if (hasWebsiteCount === 0) {
      console.log('\n⚠️  Nenhum perfil com link na bio para validar\n');
    } else {
      console.log('\n❌ CORREÇÃO DO LINK DA BIO: FALHOU\n');
      console.log(`   ${hasWebsiteCount - cleanWebsiteCount} link(s) capturado(s) incorretamente\n`);
    }

  } catch (error: any) {
    console.error('\n❌ ERRO NO TESTE:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Executar teste
testBioViaSearch()
  .then(() => {
    console.log('✅ Teste concluído');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
