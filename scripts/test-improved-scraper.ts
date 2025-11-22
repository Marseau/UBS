import { UrlScraperService } from '../src/services/url-scraper.service';

async function testImprovedScraper() {
  console.log('\n🧪 ========== TESTE DO SCRAPER MELHORADO ==========\n');

  // URLs de teste (dos leads que falharam anteriormente)
  const testUrls = [
    {
      name: 'Linktr.ee - Solides',
      url: 'https://linktr.ee/solides_oficial',
      expected: 'linktr'
    },
    {
      name: 'Linkin.bio - OAB Jaboticabal',
      url: 'https://linkin.bio/oabjaboticabal',
      expected: 'linkin'
    },
    {
      name: 'Beacons.ai - Joyce Contadora',
      url: 'https://beacons.ai/joycecontadora',
      expected: 'beacons'
    },
    {
      name: 'Website Normal - Renome Contabilidade',
      url: 'https://www.escritoriorenome.com.br',
      expected: 'main_page'
    }
  ];

  const results: any[] = [];

  for (let i = 0; i < testUrls.length; i++) {
    const test = testUrls[i];
    console.log(`\n📋 [${i + 1}/${testUrls.length}] Testando: ${test.name}`);
    console.log(`🔗 URL: ${test.url}`);
    console.log(`🎯 Esperado: ${test.expected}\n`);

    try {
      const result = await UrlScraperService.scrapeUrl(test.url);

      console.log(`\n📊 RESULTADO:`);
      console.log(`   ✅ Sucesso: ${result.success}`);
      console.log(`   📧 Emails: ${result.emails.length} (${result.emails.slice(0, 2).join(', ')}${result.emails.length > 2 ? '...' : ''})`);
      console.log(`   📱 Telefones: ${result.phones.length} (${result.phones.slice(0, 2).join(', ')}${result.phones.length > 2 ? '...' : ''})`);
      console.log(`   📍 Fontes:`, result.sources);

      // Verificar se fonte esperada foi detectada
      const sourceDetected = result.sources && result.sources[test.expected as keyof typeof result.sources];
      console.log(`   ${sourceDetected ? '✅' : '❌'} Fonte esperada detectada: ${test.expected}`);

      results.push({
        name: test.name,
        url: test.url,
        success: result.success,
        emails_count: result.emails.length,
        phones_count: result.phones.length,
        total_contacts: result.emails.length + result.phones.length,
        source_detected: sourceDetected,
        sources: result.sources
      });

    } catch (error: any) {
      console.error(`   ❌ Erro: ${error.message}`);
      results.push({
        name: test.name,
        url: test.url,
        success: false,
        error: error.message
      });
    }

    // Delay entre testes
    if (i < testUrls.length - 1) {
      console.log(`\n⏳ Aguardando 3s antes do próximo teste...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Resumo final
  console.log(`\n\n📊 ========== RESUMO DOS TESTES ==========\n`);
  console.log(`Total de testes: ${results.length}`);

  const successful = results.filter(r => r.success && r.total_contacts > 0);
  const withContacts = results.filter(r => r.total_contacts > 0);
  const failed = results.filter(r => !r.success || r.total_contacts === 0);

  console.log(`✅ Sucessos (encontrou contato): ${successful.length}/${results.length}`);
  console.log(`❌ Falhas (não encontrou): ${failed.length}/${results.length}`);
  console.log(`📈 Taxa de sucesso: ${((successful.length / results.length) * 100).toFixed(1)}%`);

  console.log(`\n📋 Detalhes:\n`);
  results.forEach((r, i) => {
    const status = r.total_contacts > 0 ? '✅' : '❌';
    console.log(`${status} ${i + 1}. ${r.name}`);
    console.log(`   Contatos: ${r.total_contacts || 0} (${r.emails_count || 0} emails, ${r.phones_count || 0} telefones)`);
    if (r.sources) {
      const sources = Object.keys(r.sources).filter(k => r.sources[k]).join(', ');
      console.log(`   Fontes: ${sources || 'nenhuma'}`);
    }
    if (r.error) {
      console.log(`   Erro: ${r.error}`);
    }
    console.log('');
  });

  // Fechar browser
  await UrlScraperService.closeBrowser();

  console.log('✅ ========== FIM DOS TESTES ==========\n');
}

testImprovedScraper().catch(console.error);
