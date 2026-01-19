// @ts-nocheck
import puppeteer from 'puppeteer';

async function testL4(url: string) {
  console.log(`Testing: ${url}`);
  
  let browser = null;
  let page = null;
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    await page.setDefaultTimeout(30000);
    
    console.log('Navegando...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    console.log('Aguardando 3s...');
    await new Promise(r => setTimeout(r, 3000));
    
    console.log('Scrolling...');
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        window.scrollBy(0, window.innerHeight);
        await new Promise(r => setTimeout(r, 200));
      }
    });
    
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('Extraindo dados...');
    const instagramData = await page.evaluate(() => {
      const results = [];
      
      // Links diretos
      document.querySelectorAll('a[href*="instagram.com"]').forEach(link => {
        results.push({ type: 'href', value: link.getAttribute('href') });
      });
      
      // Texto no body
      const bodyText = document.body?.innerText || '';
      const mentions = bodyText.match(/instagram\.com\/[a-zA-Z0-9._]+/gi) || [];
      mentions.forEach(m => results.push({ type: 'bodyText', value: m }));
      
      // Classes com instagram
      document.querySelectorAll('[class*="instagram"]').forEach(el => {
        const href = el.getAttribute('href') || el.closest('a')?.getAttribute('href');
        if (href) results.push({ type: 'class', value: href });
      });
      
      return results;
    });
    
    console.log(`\n=== RESULTADO ===`);
    console.log(`Total encontrado: ${instagramData.length}`);
    instagramData.forEach((d, i) => console.log(`  ${i+1}. [${d.type}] ${d.value}`));
    
  } catch (err) {
    console.error('ERRO:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

testL4('http://www.cashdobrasil.com.br/');
