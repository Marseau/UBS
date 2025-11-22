
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const COOKIES_FILE = path.join(process.cwd(), 'instagram-cookies.json');

async function inspectInstagramProfile() {
  console.log('🔍 Iniciando inspeção do DOM do Instagram...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  // Carregar cookies
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    await page.setCookie(...cookies);
    console.log('✅ Cookies carregados\n');
  }

  // Navegar para o perfil
  const username = 'cehemorio';
  console.log(`🌐 Navegando para @${username}...\n`);
  await page.goto(`https://www.instagram.com/${username}/`, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Clicar no botão "mais"
  try {
    const moreButtonClicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('header section div, header section span'));
      const maisButton = elements.find(el => el.textContent?.trim() === 'mais');
      if (maisButton) {
        maisButton.click();
        return true;
      }
      return false;
    });

    if (moreButtonClicked) {
      console.log('✅ Botão "mais" clicado\n');
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  } catch (error) {
    console.log('⚠️  Botão "mais" não encontrado\n');
  }

  // EXTRAIR DADOS
  console.log('📊 ========== TESTES DE SELETORES ==========\n');

  const tests = await page.evaluate(() => {
    const results = {};

    // Testar vários seletores
    const selectors = [
      'header h2',
      'header section h2',
      'header section span',
      'header section h1'
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      results[selector] = [];
      elements.forEach((el, index) => {
        const text = el.textContent?.trim() || '';
        if (text && text.length < 200) {
          results[selector].push(`[${index}] ${text.substring(0, 80)}`);
        }
      });
    });

    return results;
  });

  Object.entries(tests).forEach(([selector, results]) => {
    console.log(`\n🔍 ${selector}:`);
    results.forEach(result => {
      console.log(`   ${result}`);
    });
  });

  // Extrair HTML do header
  const headerHTML = await page.evaluate(() => {
    const section = document.querySelector('header section');
    return section ? section.innerHTML : '';
  });

  fs.writeFileSync('/tmp/instagram-header.html', headerHTML);
  console.log('\n\n✅ HTML salvo em /tmp/instagram-header.html');
  console.log(`\n📏 Tamanho: ${headerHTML.length} caracteres\n`);

  // Extrair matches do JSON
  const html = await page.content();
  const usernameMatches = html.match(/"username":"([^"]+)"/g) || [];
  const fullNameMatches = html.match(/"full_name":"([^"]+)"/g) || [];

  console.log('\n🔬 ========== MATCHES NO JSON ==========\n');
  console.log(`\nUsername matches (${usernameMatches.length}):`);
  usernameMatches.slice(0, 5).forEach(match => console.log(`   ${match}`));

  console.log(`\nFull Name matches (${fullNameMatches.length}):`);
  fullNameMatches.slice(0, 5).forEach(match => console.log(`   ${match}`));

  console.log('\n\n⏸️  Navegador mantido aberto para inspeção manual...');
  console.log('Pressione Ctrl+C quando terminar de inspecionar.\n');

  // Manter aberto
  await new Promise(() => {});
}

inspectInstagramProfile().catch(console.error);
