import { scrapeInstagramProfile } from '../src/services/instagram-scraper-single.service';

async function testScrapingFinal() {
  console.log('🧪 TESTE FINAL - Validando correções de scraping\n');
  console.log('=' .repeat(60));

  try {
    // Testar com @cehemorio que sabemos os dados corretos
    const username = 'cehemorio';
    console.log(`\n🎯 Testando perfil: @${username}\n`);

    const result = await scrapeInstagramProfile(username);

    console.log('\n📊 RESULTADO DO SCRAPING:\n');
    console.log('=' .repeat(60));

    // Dados esperados vs. obtidos
    const expectedFullName = 'Centro de Estudos Hemorio';
    const expectedBioContains = ['Criador(a) de conteúdo digital', 'Eventos, cursos', 'Rua Frei Caneca'];
    const expectedCity = 'Rio de Janeiro';
    const expectedState = 'RJ';
    const expectedCEP = '20211030';
    const expectedAddress = 'Rua Frei Caneca, 8';

    // VALIDAÇÃO 1: Full Name
    console.log(`\n1️⃣ FULL NAME:`);
    console.log(`   Esperado: "${expectedFullName}"`);
    console.log(`   Obtido:   "${result.full_name || 'NULL'}"`);
    const fullNameOK = result.full_name === expectedFullName;
    console.log(`   Status:   ${fullNameOK ? '✅ CORRETO' : '❌ INCORRETO'}`);

    // VALIDAÇÃO 2: Bio Completa
    console.log(`\n2️⃣ BIO COMPLETA:`);
    console.log(`   Obtida:\n   ${(result.bio || 'NULL').split('\n').join('\n   ')}`);
    const bioComplete = expectedBioContains.every(part => (result.bio || '').includes(part));
    console.log(`   Status:   ${bioComplete ? '✅ COMPLETA' : '❌ INCOMPLETA'}`);

    // VALIDAÇÃO 3: Cidade
    console.log(`\n3️⃣ CIDADE:`);
    console.log(`   Esperado: "${expectedCity}"`);
    console.log(`   Obtido:   "${result.city || 'NULL'}"`);
    const cityOK = result.city === expectedCity;
    console.log(`   Status:   ${cityOK ? '✅ CORRETO' : '❌ INCORRETO'}`);

    // VALIDAÇÃO 4: Estado
    console.log(`\n4️⃣ ESTADO:`);
    console.log(`   Esperado: "${expectedState}"`);
    console.log(`   Obtido:   "${result.state || 'NULL'}"`);
    const stateOK = result.state === expectedState;
    console.log(`   Status:   ${stateOK ? '✅ CORRETO' : '❌ INCORRETO'}`);

    // VALIDAÇÃO 5: CEP
    console.log(`\n5️⃣ CEP:`);
    console.log(`   Esperado: "${expectedCEP}"`);
    console.log(`   Obtido:   "${result.zip_code || 'NULL'}"`);
    const cepOK = result.zip_code === expectedCEP || result.zip_code === '20211-030';
    console.log(`   Status:   ${cepOK ? '✅ CORRETO' : '❌ INCORRETO'}`);

    // VALIDAÇÃO 6: Endereço
    console.log(`\n6️⃣ ENDEREÇO:`);
    console.log(`   Esperado: "${expectedAddress}"`);
    console.log(`   Obtido:   "${result.address || 'NULL'}"`);
    const addressOK = (result.address || '').includes('Rua Frei Caneca');
    console.log(`   Status:   ${addressOK ? '✅ CORRETO' : '❌ INCORRETO'}`);

    // RESUMO
    console.log('\n' + '=' .repeat(60));
    console.log('\n📈 RESUMO DOS TESTES:\n');

    const allTests = [
      { name: 'Full Name', passed: fullNameOK },
      { name: 'Bio Completa', passed: bioComplete },
      { name: 'Cidade', passed: cityOK },
      { name: 'Estado', passed: stateOK },
      { name: 'CEP', passed: cepOK },
      { name: 'Endereço', passed: addressOK }
    ];

    allTests.forEach(test => {
      console.log(`   ${test.passed ? '✅' : '❌'} ${test.name}`);
    });

    const passedCount = allTests.filter(t => t.passed).length;
    const totalCount = allTests.length;

    console.log(`\n   Resultado: ${passedCount}/${totalCount} testes passaram`);

    if (passedCount === totalCount) {
      console.log('\n🎉 TODOS OS TESTES PASSARAM! Correções validadas com sucesso!\n');
    } else {
      console.log('\n⚠️  ALGUNS TESTES FALHARAM. Revisar implementação.\n');
    }

  } catch (error) {
    console.error('\n❌ ERRO durante teste:', error);
    throw error;
  }
}

testScrapingFinal().catch(console.error);
