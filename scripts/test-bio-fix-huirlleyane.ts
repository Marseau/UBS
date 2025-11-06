/**
 * Teste específico para validar correção do link da bio
 * Perfil: @huirlleyane_psicologa
 *
 * Deve capturar:
 * - Full Name: "PSICÓLOGA | Huirlleyane Ramalho"
 * - Bio completa (após clicar em "mais")
 * - Link correto: wa.me/5581995288480 (NÃO o link do Threads)
 */

import { scrapeInstagramProfile } from '../src/services/instagram-scraper-single.service';

async function testBioFixHuirlleyane() {
  console.log('\n🧪 ===== TESTE DE CORREÇÃO DO LINK DA BIO =====\n');
  console.log('📋 Perfil: @huirlleyane_psicologa\n');

  try {
    const profile = await scrapeInstagramProfile('huirlleyane_psicologa');

    console.log('\n═══════════════════════════════════════════════════════════\n');
    console.log(`📋 RESULTADO DO SCRAPING: @${profile.username}\n`);
    console.log('─────────────────────────────────────────────────────────\n');

    // Validação 1: Full Name
    console.log('✅ VALIDAÇÃO 1: Full Name');
    if (profile.full_name && profile.full_name.trim().length > 0) {
      console.log(`   ✅ Capturado: "${profile.full_name}"`);

      // Verificar se contém "PSICÓLOGA" ou "Huirlleyane"
      if (profile.full_name.includes('PSICÓLOGA') || profile.full_name.includes('Huirlleyane')) {
        console.log('   ✅ Nome correto identificado\n');
      } else {
        console.log('   ⚠️  Nome não parece correto\n');
      }
    } else {
      console.log('   ❌ Full Name: VAZIO ou NULL\n');
    }

    // Validação 2: Bio Completa (após expansão)
    console.log('✅ VALIDAÇÃO 2: Bio Completa (após clicar "mais")');
    if (profile.bio) {
      const bioLength = profile.bio.length;
      const hasTruncation = profile.bio.includes('... mais') || profile.bio.includes('|... mais');

      if (hasTruncation) {
        console.log(`   ❌ Bio TRUNCADA (${bioLength} chars)`);
        console.log(`   "${profile.bio.substring(0, 80)}..."\n`);
      } else {
        console.log(`   ✅ Bio Completa: ${bioLength} chars`);
        console.log(`   "${profile.bio}"\n`);
      }
    } else {
      console.log('   ⚠️  Bio: VAZIA ou NULL\n');
    }

    // Validação 3: Link da Bio (CRÍTICO - deve ser wa.me, NÃO Threads)
    console.log('✅ VALIDAÇÃO 3: Link da Bio Correto');
    if (profile.website) {
      console.log(`   Link capturado: "${profile.website}"`);

      // Verificar se é o link correto (wa.me/5581995288480)
      const isWhatsAppLink = profile.website.includes('wa.me/5581995288480');
      const isThreadsLink = profile.website.includes('threads.com') || profile.website.includes('Threads');
      const isWrapped = profile.website.includes('l.instagram.com/?u=');

      if (isWhatsAppLink) {
        console.log('   ✅ CORRETO: Link do WhatsApp capturado\n');
      } else if (isThreadsLink) {
        console.log('   ❌ ERRO: Capturou link do Threads (botão social)\n');
      } else if (isWrapped) {
        console.log('   ⚠️  ATENÇÃO: Link wrapeado pelo Instagram\n');
      } else {
        console.log('   ⚠️  Link inesperado capturado\n');
      }
    } else {
      console.log('   ❌ Website: Não capturado (NULL)\n');
    }

    // Dados adicionais
    console.log('─────────────────────────────────────────────────────────\n');
    console.log('📊 Dados Adicionais:\n');
    console.log(`   Seguidores: ${profile.followers_count.toLocaleString()}`);
    console.log(`   Posts: ${profile.posts_count}`);
    console.log(`   Conta Business: ${profile.is_business_account ? 'Sim' : 'Não'}`);
    console.log(`   Verificado: ${profile.is_verified ? 'Sim' : 'Não'}`);

    if (profile.email) {
      console.log(`   Email: ${profile.email}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Resumo final
    const fullNameOk = profile.full_name && profile.full_name.length > 0;
    const bioOk = profile.bio && !profile.bio.includes('... mais');
    const websiteOk = profile.website && profile.website.includes('wa.me/5581995288480');

    console.log('📊 RESUMO DA VALIDAÇÃO:\n');
    console.log(`   Full Name capturado: ${fullNameOk ? '✅' : '❌'}`);
    console.log(`   Bio completa: ${bioOk ? '✅' : '❌'}`);
    console.log(`   Link correto (wa.me): ${websiteOk ? '✅' : '❌'}`);

    if (fullNameOk && bioOk && websiteOk) {
      console.log('\n🎉 TODAS AS VALIDAÇÕES PASSARAM! CORREÇÃO BEM-SUCEDIDA!\n');
    } else {
      console.log('\n⚠️  ALGUMAS VALIDAÇÕES FALHARAM - NECESSÁRIO AJUSTE\n');
    }

  } catch (error: any) {
    console.error('\n❌ ERRO NO TESTE:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Executar teste
testBioFixHuirlleyane()
  .then(() => {
    console.log('✅ Teste concluído');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
