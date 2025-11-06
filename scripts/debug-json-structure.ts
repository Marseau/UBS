import puppeteer from 'puppeteer';

async function debugJsonStructure() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const username = 'cehemorio';
  const url = `https://www.instagram.com/${username}/`;

  console.log(`🌐 Navegando para: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  const html = await page.content();

  // Salvar HTML completo
  const fs = require('fs');
  fs.writeFileSync('/tmp/instagram-html-debug.html', html);
  console.log('✅ HTML salvo em /tmp/instagram-html-debug.html');

  // Procurar todos os blocos JSON
  const scriptTags = html.match(/<script type="application\/json"[^>]*>[\s\S]*?<\/script>/g) || [];
  console.log(`\n📊 Total de blocos JSON encontrados: ${scriptTags.length}`);

  // Procurar username no HTML
  const usernameMatches = html.match(new RegExp(`"username":"${username}"`, 'g')) || [];
  console.log(`📊 "${username}" aparece ${usernameMatches.length}x no HTML`);

  // Procurar full_name no HTML
  const fullNameMatches = html.match(/"full_name":"[^"]+"/g) || [];
  console.log(`\n📊 Total de "full_name" encontrados: ${fullNameMatches.length}`);
  fullNameMatches.slice(0, 5).forEach((match, i) => {
    console.log(`   [${i}] ${match}`);
  });

  // Tentar encontrar o bloco específico com username + full_name
  console.log(`\n🔍 Procurando padrão: "username":"${username}"...full_name`);

  // Testar diferentes distâncias
  for (const distance of [500, 1000, 2000, 5000]) {
    const regex = new RegExp(`"username":"${username}"[\\s\\S]{1,${distance}}?"full_name":"([^"]+)"`, 'g');
    const matches = Array.from(html.matchAll(regex));
    console.log(`   Distância ${distance}: ${matches.length} matches`);
    if (matches.length > 0) {
      matches.forEach((match, i) => {
        console.log(`      [${i}] full_name: "${match[1]}"`);
      });
    }
  }

  await browser.close();
}

debugJsonStructure().catch(console.error);
