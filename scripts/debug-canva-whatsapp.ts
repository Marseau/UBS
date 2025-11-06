import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  console.log('Navegando para URL...');
  await page.goto('https://neijustino.my.canva.site/page', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await page.waitForSelector('body', { timeout: 10000 });

  const html = await page.content();

  // Procurar por links WhatsApp
  console.log('\n=== BUSCANDO LINKS WHATSAPP NO HTML ===');

  const waMe = html.match(/wa\.me\/\d{10,15}/gi);
  console.log('wa.me links:', waMe);

  const apiWhatsapp1 = html.match(/api\.whatsapp\.com\/send\?phone=\d{10,15}/gi);
  console.log('api.whatsapp.com/send?phone= links:', apiWhatsapp1);

  const apiWhatsapp2 = html.match(/api\.whatsapp\.com\/send\/\?phone=\d{10,15}/gi);
  console.log('api.whatsapp.com/send/?phone= links:', apiWhatsapp2);

  // Mostrar parte do HTML que contém "whatsapp"
  const whatsappSections = html.match(/.{0,200}whatsapp.{0,200}/gi);
  console.log('\n=== SEÇÕES COM "WHATSAPP" NO HTML ===');
  if (whatsappSections) {
    whatsappSections.forEach((section, i) => {
      console.log(`\n[${i+1}] ${section}`);
    });
  } else {
    console.log('Nenhuma seção com "whatsapp" encontrada');
  }

  await browser.close();
})();
