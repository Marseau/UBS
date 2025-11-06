import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  console.log('Navegando para Facebook...');
  await page.goto('https://facebook.com/seichofloripa', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await page.waitForSelector('body', { timeout: 10000 });

  const html = await page.content();

  // Procurar por telefone
  console.log('\n=== BUSCANDO TELEFONE NO HTML ===');
  const phoneMatches = html.match(/\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}/g);
  console.log('Telefones encontrados:', phoneMatches);

  // Procurar por "(48) 99137-7773"
  const specificPhone = html.includes('99137-7773');
  console.log('Contém "99137-7773"?', specificPhone);

  // Verificar se página carregou ou foi bloqueada
  const title = await page.title();
  console.log('Title da página:', title);

  // Verificar se tem texto "login" (indica redirecionamento)
  const hasLogin = html.toLowerCase().includes('login');
  console.log('Página pede login?', hasLogin);

  await browser.close();
})();
