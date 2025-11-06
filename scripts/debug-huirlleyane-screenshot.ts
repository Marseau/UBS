// @ts-nocheck
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

  await page.goto('https://www.instagram.com/huirlleyane_psicologa/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  // Clicar no 'mais' se existir
  await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('header section div, header section span'));
    const maisButton = elements.find(el => el.textContent?.trim() === 'mais');
    if (maisButton) (maisButton as HTMLElement).click();
  });

  await new Promise(r => setTimeout(r, 1000));

  // Tirar screenshot
  await page.screenshot({ path: 'test-huirlleyane-debug.png', fullPage: false });
  console.log('\n📸 Screenshot salva: test-huirlleyane-debug.png\n');

  // Debug: extrair username atual
  const username = await page.evaluate(() => {
    const h2 = document.querySelector('header section h2');
    return h2?.textContent?.trim() || 'não encontrado';
  });

  console.log(`📋 Username detectado no H2: ${username}\n`);

  await browser.close();
})();
