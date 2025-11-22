
const puppeteer = require('puppeteer');

async function extrairInstagramDoSite(page) {
  const links = await page.$$eval('a', as =>
    as.map(a => a.href).filter(href => href.includes('instagram.com/'))
  );
  return links.length ? links[0] : null;
}

async function extrairDadosDoInstagram(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const dados = await page.evaluate(() => {
    const username = window.location.pathname.split('/')[1];
    const nome = document.querySelector('header h2, header h1')?.innerText || '';
    const bio = document.querySelector('header section > div > div')?.innerText || '';
    const contagem = Array.from(document.querySelectorAll('header li span'))
      .map(el => el.getAttribute('title') || el.innerText)
      .filter(t => t && /^\d/.test(t));

    return {
      username,
      nome,
      bio,
      seguidores: contagem[0] || 'Não identificado'
    };
  });

  return dados;
}

async function buscarInstagramProfissionais(termoBusca, maxResultados) {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  const urlBusca = `https://www.google.com/search?q=${encodeURIComponent(termoBusca)}`;

  await page.goto(urlBusca, { waitUntil: 'domcontentloaded' });

  const links = await page.$$eval('a', as =>
    as.map(a => a.href)
      .filter(href =>
        href.startsWith('http') &&
        !href.includes('google.com') &&
        !href.includes('/settings') &&
        !href.includes('/policies'))
  );

  const resultados = [];

  for (const site of links.slice(0, maxResultados)) {
    console.log(`🔎 Visitando site: ${site}`);
    try {
      await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 20000 });

      const instaUrl = await extrairInstagramDoSite(page);
      if (instaUrl) {
        console.log(`➡️ Encontrado Instagram: ${instaUrl}`);
        const novaPage = await browser.newPage();
        const dados = await extrairDadosDoInstagram(novaPage, instaUrl);
        resultados.push({ site, instagram: instaUrl, ...dados });
        await novaPage.close();
      } else {
        console.log('⚠️ Nenhum Instagram encontrado neste site.');
      }
    } catch (err) {
      console.log(`❌ Erro ao visitar ${site}: ${err.message}`);
    }
  }

  await browser.close();
  console.log('\n🎯 RESULTADOS FINAIS:');
  console.table(resultados);
}

// 🔧 Parâmetros personalizáveis
const termo = process.argv[2] || 'cabeleireira São Paulo';
const max = parseInt(process.argv[3]) || 5;

buscarInstagramProfissionais(termo, max);
