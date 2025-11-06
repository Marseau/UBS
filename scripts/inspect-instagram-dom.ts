import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const COOKIES_FILE = path.join(process.cwd(), 'instagram-cookies.json');

async function inspectInstagramProfile() {
  console.log('🔍 Iniciando inspeção do DOM do Instagram...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  // Carregar cookies
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    await page.setCookie(...cookies);
    console.log('✅ Cookies carregados\n');
  }

  // Navegar para o perfil
  const username = 'cehemorio';
  console.log(`🌐 Navegando para @${username}...\n`);
  await page.goto(`https://www.instagram.com/${username}/`, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Clicar no botão "mais" se existir
  try {
    const moreButtonClicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('header section div, header section span'));
      const maisButton = elements.find(el => el.textContent?.trim() === 'mais');
      if (maisButton) {
        (maisButton as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (moreButtonClicked) {
      console.log('✅ Botão "mais" clicado\n');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.log('⚠️  Botão "mais" não encontrado\n');
  }

  // EXTRAIR ESTRUTURA DO HEADER
  const headerAnalysis = await page.evaluate(() => {
    const header = document.querySelector('header');
    if (!header) return { error: 'Header não encontrado' };

    const section = header.querySelector('section');
    if (!section) return { error: 'Section não encontrada' };

    // Pegar HTML do header section para análise
    const headerHTML = section.innerHTML;
    const allElements: any[] = [];

    // Tentar encontrar full_name com vários seletores
    const tests = {
      'header section h2': [] as string[],
      'header section span': [] as string[],
      'header h2': [] as string[],
      'header section h1': [] as string[],
      'header section div span': [] as string[]
    };

    Object.keys(tests).forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el, index) => {
        const text = el.textContent?.trim() || '';
        if (text && text.length < 200) {
          tests[selector].push(`[${index}] ${text.substring(0, 80)}`);
        }
      });
    });

    // Extrair dados do JSON embutido
    const html = document.documentElement.outerHTML;
    const usernameMatch = html.match(/"username":"([^"]+)"/g);
    const fullNameMatch = html.match(/"full_name":"([^"]+)"/g);
    const bioMatch = html.match(/"biography":"([^"]+)"/g);

    return {
      headerHTML,
      tests,
      jsonMatches: {
        username: usernameMatch?.slice(0, 5) || [],
        full_name: fullNameMatch?.slice(0, 5) || [],
        biography: bioMatch?.slice(0, 3) || []
      }
    };
  });

  console.log('📋 ========== HTML DO HEADER SECTION ==========\n');
  if ('error' in headerAnalysis) {
    console.log('❌', headerAnalysis.error);
  } else {
    // Salvar HTML para análise
    fs.writeFileSync('/tmp/instagram-header.html', headerAnalysis.headerHTML || '');
    console.log('✅ HTML salvo em /tmp/instagram-header.html');
    console.log('\nPrimeiros 500 caracteres:');
    console.log((headerAnalysis.headerHTML || '').substring(0, 500));

    console.log('\n\n📊 ========== TESTES DE SELETORES ==========\n');
    if (headerAnalysis.tests) {
      Object.entries(headerAnalysis.tests).forEach(([selector, results]) => {
        console.log(`\n🔍 ${selector}:`);
        (results as string[]).forEach(result => {
          console.log(`   ${result}`);
        });
      });
    }

    console.log('\n\n🔬 ========== MATCHES NO JSON ==========\n');
    if (headerAnalysis.jsonMatches) {
      console.log('\nUsername matches:');
      headerAnalysis.jsonMatches.username.forEach((match: string) => {
        console.log(`   ${match}`);
      });

      console.log('\nFull Name matches:');
      headerAnalysis.jsonMatches.full_name.forEach((match: string) => {
        console.log(`   ${match}`);
      });

      console.log('\nBiography matches:');
      headerAnalysis.jsonMatches.biography.forEach((match: string) => {
        console.log(`   ${match}`);
      });
    }
  }

  console.log('\n\n⏸️  Navegador mantido aberto para inspeção manual...');
  console.log('Pressione Ctrl+C quando terminar de inspecionar.\n');

  // Manter aberto
  await new Promise(() => {});
}

inspectInstagramProfile().catch(console.error);
