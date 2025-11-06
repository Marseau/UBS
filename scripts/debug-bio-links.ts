import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Carregar cookies
  if (fs.existsSync('instagram-cookies.json')) {
    const cookies = JSON.parse(fs.readFileSync('instagram-cookies.json', 'utf8'));
    await page.setCookie(...cookies);
  }

  await page.goto('https://www.instagram.com/terapiaocupacional.expert/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  // Clicar no 'mais' se existir
  await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('header section div, header section span'));
    const maisButton = elements.find(el => el.textContent?.trim() === 'mais');
    if (maisButton) (maisButton as HTMLElement).click();
  });

  await new Promise(r => setTimeout(r, 1000));

  // Debug: listar TODOS os links no header
  const allLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('header a[href]'));
    return links.map(a => ({
      href: a.getAttribute('href'),
      text: a.textContent?.trim(),
      visible: (a as HTMLElement).offsetParent !== null
    }));
  });

  console.log('\n🔗 TODOS OS LINKS NO HEADER:\n');
  allLinks.forEach((link, i) => {
    console.log(`${i + 1}. [${link.visible ? 'VISÍVEL' : 'OCULTO'}] ${link.text || '(sem texto)'}`);
    console.log(`   → ${link.href}\n`);
  });

  // Testar seletor atual
  const currentSelector = await page.evaluate(() => {
    const bioLinkEl = document.querySelector('header section a[href^="http"]');
    return {
      found: !!bioLinkEl,
      href: bioLinkEl?.getAttribute('href'),
      text: bioLinkEl?.textContent?.trim()
    };
  });

  console.log('\n📋 SELETOR ATUAL (header section a[href^="http"]):\n');
  console.log('   Found:', currentSelector.found);
  console.log('   Href:', currentSelector.href);
  console.log('   Text:', currentSelector.text);

  await browser.close();
})();
