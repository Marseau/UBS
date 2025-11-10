require('dotenv').config();
const axios = require('axios');

async function inspectAuthenticatedProfile() {
  console.log('🔍 Inspecionando HTML autenticado do perfil @marseaufranco\n');

  try {
    console.log('📡 Chamando API para extrair HTML do perfil...');

    const response = await axios.post('http://localhost:3000/api/instagram/inspect-profile-html', {
      username: 'marseaufranco'
    });

    console.log('✅ HTML extraído com sucesso!\n');
    console.log('📋 Botões encontrados:\n');

    if (response.data.buttons && response.data.buttons.length > 0) {
      response.data.buttons.forEach((btn, idx) => {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`Botão #${idx}:`);
        console.log(`  Texto: "${btn.text}"`);
        console.log(`  aria-label: "${btn.ariaLabel}"`);
        console.log(`  Classes: ${btn.classes.substring(0, 80)}...`);
      });
    }

    console.log('\n\n🔍 Elementos com "message/mensagem":\n');

    if (response.data.messageElements && response.data.messageElements.length > 0) {
      response.data.messageElements.forEach((el, idx) => {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`Elemento #${idx}:`);
        console.log(`  Tag: ${el.tag}`);
        console.log(`  Texto: "${el.text}"`);
        console.log(`  aria-label: "${el.ariaLabel}"`);
        console.log(`  href: "${el.href}"`);
      });
    }

  } catch (error) {
    if (error.response) {
      console.error('❌ Erro da API:', error.response.status);
      console.error('   Dados:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('❌ Erro:', error.message);
    }
  }
}

inspectAuthenticatedProfile();
