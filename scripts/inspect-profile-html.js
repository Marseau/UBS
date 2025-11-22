
require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function inspectProfileHTML() {
  console.log('🔍 Inspecionando HTML do perfil @marseaufranco\n');

  let browser;
  try {
    // Iniciar browser
    browser = await puppeteer.launch({
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      userDataDir: '/Users/marseau/Library/Application Support/Google Chrome/Profile 2',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('🌐 Navegando para perfil @marseaufranco...');
    await page.goto('https://www.instagram.com/marseaufranco/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('⏳ Aguardando página carregar...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('📄 Extraindo HTML completo...');
    const html = await page.content();

    // Salvar HTML completo
    const htmlPath = path.join(__dirname, 'profile-marseaufranco.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`✅ HTML salvo em: ${htmlPath}`);

    console.log('\n📋 Extraindo estrutura de botões...');
    const buttonsInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));

      return buttons.map((btn, idx) => {
        const text = (btn.textContent || '').trim();
        const classes = btn.className;
        const innerHTML = btn.innerHTML.substring(0, 200); // Primeiros 200 chars
        const ariaLabel = btn.getAttribute('aria-label');
        const role = btn.getAttribute('role');
        const type = btn.getAttribute('type');

        return {
          index: idx,
          text: text,
          ariaLabel: ariaLabel,
          role: role,
          type: type,
          classes: classes,
          innerHTML: innerHTML
        };
      }).filter(btn => btn.text.length > 0 || btn.ariaLabel);
    });

    console.log(`\n🔍 Total de botões encontrados: ${buttonsInfo.length}\n`);

    buttonsInfo.forEach(btn => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Botão #${btn.index}:`);
      console.log(`  Texto: "${btn.text}"`);
      console.log(`  aria-label: "${btn.ariaLabel}"`);
      console.log(`  role: "${btn.role}"`);
      console.log(`  type: "${btn.type}"`);
      console.log(`  classes: ${btn.classes}`);
      console.log(`  HTML: ${btn.innerHTML.substring(0, 100)}...`);
    });

    // Buscar especificamente links/botões de mensagem
    console.log('\n\n🔍 Procurando elementos com "message" ou "mensagem"...\n');
    const messageElements = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      const matches = [];

      all.forEach((el, idx) => {
        const text = (el.textContent || '').toLowerCase();
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const href = el.getAttribute('href') || '';

        if (text.includes('message') || text.includes('mensagem') ||
            ariaLabel.includes('message') || ariaLabel.includes('mensagem') ||
            href.includes('direct')) {
          matches.push({
            tag: el.tagName,
            text: el.textContent ? el.textContent.substring(0, 50) : '',
            ariaLabel: el.getAttribute('aria-label'),
            href: href,
            classes: el.className
          });
        }
      });

      return matches.slice(0, 20); // Primeiros 20 matches
    });

    messageElements.forEach((el, idx) => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Elemento #${idx}:`);
      console.log(`  Tag: ${el.tag}`);
      console.log(`  Texto: "${el.text}"`);
      console.log(`  aria-label: "${el.ariaLabel}"`);
      console.log(`  href: "${el.href}"`);
      console.log(`  classes: ${el.classes}`);
    });

    console.log('\n✅ Inspeção completa!');
    console.log(`📄 HTML completo salvo em: ${htmlPath}`);

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    if (browser) {
      console.log('\n🚪 Fechando browser em 5 segundos...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      await browser.close();
    }
  }
}

inspectProfileHTML();
