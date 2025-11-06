import axios from 'axios';

(async () => {
  console.log('🧪 Testando Instagram Redirect URL...\n');

  const instagramRedirectUrl = 'https://l.instagram.com/?u=https%3A%2F%2Fdradanibernardi.com.br%2Fpagina-de-links%2F';

  try {
    const response = await axios.post(
      'http://localhost:3000/api/instagram-scraper/scrape-url',
      { url: instagramRedirectUrl },
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log('✅ Resposta recebida:');
    console.log(JSON.stringify(response.data, null, 2));

    if (response.data.phones && response.data.phones.length > 0) {
      console.log('\n✅ SUCCESS: Instagram redirect foi processado corretamente!');
      console.log(`📞 Total de telefones encontrados: ${response.data.phones.length}`);
      console.log(`📋 Telefones: ${response.data.phones.join(', ')}`);
    } else {
      console.log('\n❌ FAIL: Nenhum telefone encontrado');
    }
  } catch (error: any) {
    console.error('❌ Erro ao fazer requisição:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
})();
