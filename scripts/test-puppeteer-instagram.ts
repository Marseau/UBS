// @ts-nocheck
import puppeteer from 'puppeteer';

async function testScrape() {
  const url = 'http://www.cashdobrasil.com.br/';
  console.log(`Testing: ${url}`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
  
  try {
    console.log('Navigating...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('Page loaded');
    
    // Wait 3s for JS
    await new Promise(r => setTimeout(r, 3000));
    
    // Get page content length
    const content = await page.content();
    console.log(`Page content length: ${content.length}`);
    
    // Check if Instagram is in raw HTML
    if (content.includes('instagram.com')) {
      console.log('✅ "instagram.com" found in page.content()');
      const matches = content.match(/instagram\.com\/[a-zA-Z0-9._]+/gi);
      console.log('Matches:', matches);
    } else {
      console.log('❌ "instagram.com" NOT in page.content()');
    }
    
    // Try the DOM query
    const links = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('a[href*="instagram.com"]').forEach(link => {
        const href = link.getAttribute('href');
        if (href) results.push(href);
      });
      return results;
    });
    
    console.log(`Links found via querySelectorAll: ${links.length}`);
    links.forEach(l => console.log(`  - ${l}`));
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

testScrape();
