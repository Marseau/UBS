import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  console.log('Navegando para página de links...');
  await page.goto('https://dradanibernardi.com.br/pagina-de-links/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await page.waitForSelector('body', { timeout: 10000 });

  const html = await page.content();

  console.log('\n=== BUSCANDO NÚMERO 554198690103 ===');

  // Procurar exatamente este número
  const hasExactNumber = html.includes('554198690103');
  console.log('Contém "554198690103"?', hasExactNumber);

  // Procurar variações
  const has41986 = html.includes('41986');
  console.log('Contém "41986"?', has41986);

  // Extrair todos os links WhatsApp
  const waLinks = html.match(/api\.whatsapp\.com\/send[^"']*/g);
  console.log('\n=== LINKS WHATSAPP ENCONTRADOS ===');
  if (waLinks) {
    waLinks.forEach((link, i) => {
      console.log(`${i+1}. ${link}`);
    });
  } else {
    console.log('Nenhum link WhatsApp encontrado');
  }

  await browser.close();
})();
