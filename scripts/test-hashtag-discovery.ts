/**
 * Script de Teste - Descoberta de Hashtags Instagram
 *
 * Testa se o sistema está extraindo TODAS as 5 hashtags sugeridas
 * pelo Instagram (em vez de apenas 1 como estava acontecendo)
 */

import { ensureLoggedSession, createAuthenticatedPage, closeBrowser } from '../src/services/instagram-session.service';
import { discoverHashtagVariations } from '../src/services/instagram-hashtag-discovery.service';

async function testHashtagDiscovery() {
  console.log('🧪 ========================================');
  console.log('🧪 TESTE: Descoberta de Hashtags Instagram');
  console.log('🧪 ========================================\n');

  try {
    // 1. Fazer login no Instagram
    console.log('🔐 Fazendo login no Instagram...');
    await ensureLoggedSession();
    console.log('✅ Login concluído\n');

    // 2. Criar página autenticada
    console.log('📄 Criando página autenticada...');
    const page = await createAuthenticatedPage();
    console.log('✅ Página criada\n');

    // 3. Testar descoberta com hashtag conhecida
    const testHashtag = 'treino';
    console.log(`🔍 Testando descoberta de variações de #${testHashtag}...\n`);

    const variations = await discoverHashtagVariations(page, testHashtag);

    // 4. Analisar resultados
    console.log('\n📊 ========================================');
    console.log('📊 RESULTADOS DO TESTE');
    console.log('📊 ========================================\n');

    console.log(`✅ Total de hashtags descobertas: ${variations.length}`);
    console.log(`${variations.length === 5 ? '✅' : '❌'} Esperado: 5 hashtags\n`);

    if (variations.length > 0) {
      console.log('📋 Hashtags extraídas:\n');
      variations.forEach((v, i) => {
        console.log(`   ${i + 1}. #${v.hashtag}`);
        console.log(`      Posts: ${v.post_count_formatted} (${v.post_count.toLocaleString()})`);
        console.log(`      Score: ${v.priority_score}`);
        console.log(`      Categoria: ${v.volume_category}\n`);
      });
    } else {
      console.log('❌ NENHUMA hashtag foi extraída!\n');
      console.log('💡 Possíveis causas:');
      console.log('   - Instagram não carregou o dropdown');
      console.log('   - Seletores mudaram');
      console.log('   - Timeout muito curto\n');
    }

    // 5. Fechar página
    await page.close();
    console.log('🔒 Página fechada');

    // 6. Conclusão
    console.log('\n🎯 ========================================');
    if (variations.length === 5) {
      console.log('🎯 ✅ TESTE PASSOU - 5 hashtags extraídas!');
      console.log('🎯 Sistema agora amplifica 5x o universo de scraping');
    } else if (variations.length > 0 && variations.length < 5) {
      console.log(`🎯 ⚠️  TESTE PARCIAL - ${variations.length}/5 hashtags extraídas`);
      console.log('🎯 Ainda faltam hashtags - verificar debug logs acima');
    } else {
      console.log('🎯 ❌ TESTE FALHOU - Nenhuma hashtag extraída');
      console.log('🎯 Verificar implementação da descoberta');
    }
    console.log('🎯 ========================================\n');

  } catch (error: any) {
    console.error('❌ Erro durante teste:', error.message);
    console.error(error.stack);
  } finally {
    // Fechar browser
    console.log('\n🔄 Encerrando browser...');
    await closeBrowser();
    console.log('✅ Browser fechado\n');
  }
}

// Executar teste
testHashtagDiscovery()
  .then(() => {
    console.log('✅ Teste concluído');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Teste falhou:', error);
    process.exit(1);
  });
