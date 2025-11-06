/**
 * Script de teste para validar captura completa da bio do Instagram
 * Testa os novos seletores CSS implementados
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const COOKIES_FILE = path.join(process.cwd(), 'instagram-cookies.json');

async function testBioScraper(username: string) {
  console.log(`\n🧪 Testando scraper de bio para: @${username}\n`);

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  });

  const page = await browser.newPage();

  // Carregar cookies se existirem
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    await page.setCookie(...cookies);
    console.log('🔑 Cookies carregados');
  }

  // Navegar para o perfil
  const profileUrl = `https://www.instagram.com/${username}/`;
  console.log(`🌐 Navegando para: ${profileUrl}`);

  await page.goto(profileUrl, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  // DEBUG: Verificar estrutura da bio
  console.log('🔍 Debugando estrutura da bio...');
  const bioDebug = await page.evaluate(() => {
    const bioContainer = document.querySelector('header section');
    if (!bioContainer) return { error: 'Container não encontrado' };

    // Procurar todos os elementos que podem conter "mais"
    const allElements = Array.from(bioContainer.querySelectorAll('*'));
    const maisElements = allElements
      .filter(el => el.textContent?.includes('mais'))
      .map(el => ({
        tag: el.tagName,
        role: el.getAttribute('role'),
        class: el.className,
        text: el.textContent?.substring(0, 50),
        clickable: el.getAttribute('role') === 'button' || el.tagName === 'BUTTON'
      }));

    return { maisElements, totalElements: allElements.length };
  });

  console.log('📋 Elementos com "mais":', JSON.stringify(bioDebug, null, 2));

  // CRÍTICO: Clicar no botão "... mais" para expandir bio completa
  console.log('🔍 Procurando botão "... mais" para expandir bio...');
  try {
    const moreButtonExists = await page.evaluate(() => {
      // Tentar múltiplas estratégias para encontrar o botão "mais"
      const strategies = [
        // Estratégia 1: span com role="button"
        () => {
          const spans = Array.from(document.querySelectorAll('header section span[role="button"]'));
          return spans.find(s => s.textContent?.includes('mais'));
        },
        // Estratégia 2: qualquer elemento com "mais" que seja clicável
        () => {
          const elements = Array.from(document.querySelectorAll('header section *'));
          return elements.find(el =>
            el.textContent?.includes('... mais') &&
            (el.getAttribute('role') === 'button' || el.tagName === 'BUTTON')
          );
        },
        // Estratégia 3: div ou span simples com texto "mais"
        () => {
          const elements = Array.from(document.querySelectorAll('header section div, header section span'));
          return elements.find(el => el.textContent?.trim() === 'mais');
        }
      ];

      for (const strategy of strategies) {
        const button = strategy();
        if (button) {
          (button as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (moreButtonExists) {
      console.log('✅ Botão "mais" clicado! Aguardando expansão...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log('⚠️  Botão "mais" não encontrado (bio já completa ou curta)');
    }
  } catch (error) {
    console.log('⚠️  Erro ao clicar no "mais":', error);
  }

  // Extrair bio usando os NOVOS seletores
  const bioData = await page.evaluate(() => {
    // Seletores atualizados do Instagram (2024/2025)
    const bioSelectors = [
      'header section h1._ap3a._aaco._aacu._aacx._aad6._aade',
      'header section span._ap3a._aaco._aacu._aacx._aad6._aade',
      'header section div > span._ap3a',
      'header section div[style*="white-space"]',
      'header section h1 > span',
      'header section div[data-testid]',
      'header section span._ap3a'
    ];

    let bio = '';
    let usedSelector = '';

    for (const selector of bioSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent && el.textContent.trim().length > 10) {
        bio = el.textContent.trim();
        usedSelector = selector;
        break;
      }
    }

    // Fallback: pegar texto completo da section
    if (!bio || bio.length < 10) {
      const sectionEl = document.querySelector('header section');
      if (sectionEl) {
        const fullText = sectionEl.textContent || '';
        bio = fullText.replace(/\d+[.,]?\d*\s*(mil|K|M|seguidores|publicações|seguindo)/gi, '').trim();
        usedSelector = 'header section (fallback)';
      }
    }

    return { bio, usedSelector };
  });

  console.log('\n📊 RESULTADO DO TESTE:\n');
  console.log(`✅ Seletor usado: ${bioData.usedSelector}`);
  console.log(`📏 Tamanho da bio: ${bioData.bio.length} caracteres`);
  console.log(`\n📝 Bio capturada:\n${bioData.bio}\n`);
  console.log(`🔍 Possui "|... mais"?: ${bioData.bio.includes('|... mais') ? 'SIM (TRUNCADA!)' : 'NÃO (COMPLETA!)'}`);

  // Salvar screenshot para validação visual
  const screenshotPath = path.join(process.cwd(), `test-bio-${username}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`\n📸 Screenshot salvo em: ${screenshotPath}`);

  await browser.close();
}

// Testar com o perfil de exemplo
const username = process.argv[2] || 'terapiaocupacional.expert';
testBioScraper(username).catch(console.error);
