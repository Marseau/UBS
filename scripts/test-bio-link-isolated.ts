/**
 * Script isolado para testar captura de link da bio
 * Não mexe no código principal - apenas testa estratégias
 */

// @ts-nocheck
import puppeteer from 'puppeteer';
import fs from 'fs';

async function testBioLinkIsolated() {
  console.log('\n🧪 TESTE ISOLADO: Captura de Link da Bio\n');

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Carregar cookies da sessão existente
  if (fs.existsSync('instagram-cookies.json')) {
    const cookies = JSON.parse(fs.readFileSync('instagram-cookies.json', 'utf8'));
    await page.setCookie(...cookies);
    console.log('✅ Cookies carregados\n');
  }

  // Navegar para um perfil que sabemos que tem link na bio
  const username = 'huirlleyane_psicologa'; // Tem link wa.me/5581995288480
  console.log(`📋 Testando perfil: @${username}\n`);

  await page.goto(`https://www.instagram.com/${username}/`, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  await new Promise(r => setTimeout(r, 3000));

  // Clicar no botão "mais" se existir
  const moreClicked = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('header section div, header section span'));
    const maisButton = elements.find(el => el.textContent?.trim() === 'mais');
    if (maisButton) {
      (maisButton as HTMLElement).click();
      return true;
    }
    return false;
  });

  if (moreClicked) {
    console.log('✅ Botão "mais" clicado\n');
    await new Promise(r => setTimeout(r, 1000));
  }

  // TESTAR DIFERENTES ESTRATÉGIAS DE CAPTURA
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 TESTANDO ESTRATÉGIAS DE CAPTURA DE LINK\n');

  // Estratégia 1: Todos os links HTTP no header
  const allLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('header section a[href^="http"]'));
    return links.map((a: any) => ({
      href: a.getAttribute('href'),
      text: a.textContent?.trim(),
      role: a.getAttribute('role'),
      isButton: a.closest('button') !== null,
      classes: a.className
    }));
  });

  console.log(`📊 Estratégia 1: Todos os links HTTP (${allLinks.length} encontrados)\n`);
  allLinks.forEach((link, i) => {
    console.log(`   ${i + 1}. "${link.text}"`);
    console.log(`      href: ${link.href}`);
    console.log(`      role: ${link.role || 'null'}`);
    console.log(`      isButton: ${link.isButton}`);
    console.log(`      classes: ${link.classes.substring(0, 50)}...\n`);
  });

  // Estratégia 2: Links que não são botões
  const nonButtonLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('header section a[href^="http"]'))
      .filter((a: any) => {
        const isButton = a.getAttribute('role') === 'button' || a.closest('button');
        return !isButton;
      });
    return links.map((a: any) => ({
      href: a.getAttribute('href'),
      text: a.textContent?.trim()
    }));
  });

  console.log(`\n📊 Estratégia 2: Links não-botão (${nonButtonLinks.length} encontrados)\n`);
  nonButtonLinks.forEach((link, i) => {
    console.log(`   ${i + 1}. "${link.text}" → ${link.href}\n`);
  });

  // Estratégia 3: Filtrar por href (excluir threads.com)
  const noThreadsLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('header section a[href^="http"]'))
      .filter((a: any) => {
        const href = a.getAttribute('href') || '';
        const isButton = a.getAttribute('role') === 'button' || a.closest('button');
        return !isButton && !href.includes('threads.com');
      });
    return links.map((a: any) => ({
      href: a.getAttribute('href'),
      text: a.textContent?.trim()
    }));
  });

  console.log(`\n📊 Estratégia 3: Excluindo threads.com (${noThreadsLinks.length} encontrados)\n`);
  noThreadsLinks.forEach((link, i) => {
    console.log(`   ${i + 1}. "${link.text}" → ${link.href}\n`);
  });

  // Estratégia 4: Filtrar por texto (excluir "Threads" no texto)
  const noThreadsTextLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('header section a[href^="http"]'))
      .filter((a: any) => {
        const href = a.getAttribute('href') || '';
        const text = a.textContent?.trim() || '';
        const isButton = a.getAttribute('role') === 'button' || a.closest('button');
        return !isButton && !href.includes('threads.com') && !text.includes('Threads');
      });
    return links.map((a: any) => ({
      href: a.getAttribute('href'),
      text: a.textContent?.trim()
    }));
  });

  console.log(`\n📊 Estratégia 4: Excluindo "Threads" no texto (${noThreadsTextLinks.length} encontrados)\n`);
  noThreadsTextLinks.forEach((link, i) => {
    console.log(`   ${i + 1}. "${link.text}" → ${link.href}\n`);
  });

  // Estratégia 5: Apenas links com ponto no texto (parecem URL)
  const urlLikeLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('header section a[href^="http"]'))
      .filter((a: any) => {
        const href = a.getAttribute('href') || '';
        const text = a.textContent?.trim() || '';
        const isButton = a.getAttribute('role') === 'button' || a.closest('button');
        const looksLikeUrl = text.includes('.') || text.includes('/') || text.startsWith('wa.me');
        return !isButton && !href.includes('threads.com') && looksLikeUrl;
      });
    return links.map((a: any) => ({
      href: a.getAttribute('href'),
      text: a.textContent?.trim()
    }));
  });

  console.log(`\n📊 Estratégia 5: Apenas links que parecem URL (${urlLikeLinks.length} encontrados)\n`);
  urlLikeLinks.forEach((link, i) => {
    console.log(`   ${i + 1}. "${link.text}" → ${link.href}\n`);
  });

  console.log('═══════════════════════════════════════════════════════════\n');

  // Tirar screenshot para análise visual
  await page.screenshot({ path: 'test-bio-link-debug.png', fullPage: false });
  console.log('📸 Screenshot salva: test-bio-link-debug.png\n');

  // CONCLUSÃO
  console.log('💡 ANÁLISE:\n');
  if (urlLikeLinks.length > 0) {
    console.log(`✅ Estratégia 5 funcionou! Encontrou ${urlLikeLinks.length} link(s):`);
    urlLikeLinks.forEach((link, i) => {
      console.log(`   ${i + 1}. "${link.text}"`);
      const isWrapped = link.href.includes('l.instagram.com/?u=');
      if (isWrapped) {
        console.log(`      ⚠️  Link wrapeado - precisa decodificar`);
      } else {
        console.log(`      ✅ Link limpo!`);
      }
    });
  } else {
    console.log('❌ Nenhuma estratégia encontrou links válidos');
    console.log('   Verifique o screenshot para análise manual');
  }

  await browser.close();
  console.log('\n✅ Teste concluído\n');
}

testBioLinkIsolated()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Erro:', error);
    process.exit(1);
  });
