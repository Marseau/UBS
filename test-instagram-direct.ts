/**
 * Teste direto do Instagram Scraper - SEM servidor HTTP
 * Executa o código diretamente para garantir que estamos testando a versão corrigida
 */

import { scrapeInstagramTag } from './src/services/instagram-scraper-single.service';

console.log('🧪 ===== TESTE DIRETO DO SCRAPER =====\n');
console.log('📌 Este teste importa o código DIRETAMENTE (sem HTTP)');
console.log('📌 Garantindo que estamos testando a versão com o seletor corrigido\n');

async function test() {
  try {
    console.log('🔎 Iniciando scraping de #cafe (max: 5 perfis)...\n');

    const startTime = Date.now();
    const usernames = await scrapeInstagramTag('cafe', 5);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n\n🎯 ===== RESULTADO =====`);
    console.log(`⏱️ Tempo: ${duration}s`);
    console.log(`👥 Usernames encontrados: ${usernames.length}`);

    if (usernames.length > 0) {
      console.log(`\n✅ SUCESSO! Perfis extraídos com dados completos:`);
      usernames.forEach((profile: any, i: number) => {
        console.log(`\n   ${i + 1}. @${profile.username}`);
        console.log(`      Nome: ${profile.full_name || 'N/A'}`);
        console.log(`      Seguidores: ${profile.followers_count}`);
        console.log(`      Posts: ${profile.posts_count}`);
        console.log(`      Bio: ${profile.bio ? profile.bio.substring(0, 50) + '...' : 'N/A'}`);
        console.log(`      Business: ${profile.is_business_account ? 'Sim' : 'Não'}`);
        console.log(`      Email: ${profile.email || 'N/A'}`);
      });
    } else {
      console.log(`\n❌ FALHA: Nenhum username encontrado`);
      console.log(`   Possíveis causas:`);
      console.log(`   - Seletor CSS ainda está errado`);
      console.log(`   - Instagram mudou estrutura HTML`);
      console.log(`   - Página não carregou completamente`);
    }

    process.exit(usernames.length > 0 ? 0 : 1);

  } catch (error: any) {
    console.error('\n❌ ERRO NO TESTE:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
