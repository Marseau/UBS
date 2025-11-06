import { scrapeInstagramTag } from '../src/services/instagram-scraper-single.service';

console.log('🧪 TESTE: Validar bio completa capturada por scrapeInstagramTag\n');
console.log('='.repeat(60) + '\n');

(async () => {
  try {
    const hashtag = 'nutricionista';
    const maxProfiles = 1;

    console.log(`🎯 Buscando perfis da hashtag: #${hashtag}`);
    console.log(`📊 Coletando apenas ${maxProfiles} perfil(s)\n`);

    const results = await scrapeInstagramTag(hashtag, maxProfiles);

    if (results && results.length > 0) {
      const profile = results[0];

      console.log('\n' + '='.repeat(60));
      console.log('📊 RESULTADO DA BIO:');
      console.log('='.repeat(60) + '\n');

      console.log(`👤 Username: @${profile.username}`);
      console.log(`👤 Full Name: ${profile.full_name || 'N/A'}\n`);

      console.log(`📝 BIO COMPLETA (${profile.bio ? profile.bio.length : 0} caracteres):`);
      console.log('─'.repeat(60));
      console.log(profile.bio || 'N/A');
      console.log('─'.repeat(60) + '\n');

      // Verificar se contém elementos esperados
      const hasCategory = profile.bio?.includes('Nutricionista') || false;
      const hasDescription = profile.bio && profile.bio.length > 100;

      console.log('✅ VALIDAÇÕES:');
      console.log(`   ${hasCategory ? '✅' : '❌'} Categoria incluída (ex: "Nutricionista")`);
      console.log(`   ${hasDescription ? '✅' : '❌'} Descrição completa (>100 chars)`);
      console.log(`   ${profile.bio && profile.bio.length > 200 ? '✅' : '❌'} Bio extensa (>200 chars)`);

      if (hasCategory && hasDescription) {
        console.log('\n🎉 BIO COMPLETA CAPTURADA COM SUCESSO!');
      } else {
        console.log('\n⚠️  Bio pode estar incompleta');
      }

    } else {
      console.log('⚠️  Nenhum perfil encontrado');
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }

  process.exit(0);
})();
