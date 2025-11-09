// Automação Instagram - Browser compartilhado (sessão oficial)
import { Page } from 'puppeteer';
import { createOfficialAuthenticatedPage, closeOfficialBrowser } from './instagram-official-session.service';

/**
 * Mutex simples para garantir que apenas 1 batch rode por vez
 */
let batchInProgress = false;

/**
 * Página compartilhada reutilizada entre batches
 * Evita abrir múltiplas abas desnecessariamente
 */
let sharedPage: Page | null = null;

/**
 * Pool de comentários variados para parecer mais humano
 * Categorias: Entusiasmo, Apoio, Admiração, Interesse
 */
/**
 * Pool de comentários: APENAS EMOJIS (neutros para qualquer contexto)
 * Evita situações embaraçosas em posts antigos ou de contexto específico
 */
const COMMENT_POOL = {
  entusiasmo: [
    '🔥🔥🔥',
    '👏👏👏',
    '🚀🚀🚀',
    '💪💪💪',
    '✨✨✨'
  ],
  apoio: [
    '🙏🙏🙏',
    '💯💯💯',
    '🌟🌟🌟',
    '👊👊👊',
    '💙💙💙'
  ],
  admiracao: [
    '😍😍😍',
    '❤️❤️❤️',
    '💕💕💕',
    '👌👌👌',
    '🙌🙌🙌'
  ],
  interesse: [
    '👀👀👀',
    '💡💡💡',
    '🤔🤔🤔',
    '😊😊😊',
    '👍👍👍'
  ]
};

/**
 * Seleciona um comentário aleatório de todas as categorias
 * Distribui uniformemente entre as 4 categorias para variedade
 */
function getRandomComment(): string {
  // Selecionar categoria aleatória
  const categories = Object.keys(COMMENT_POOL) as Array<keyof typeof COMMENT_POOL>;
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];

  // Verificar se categoria existe (type guard)
  if (!randomCategory || !COMMENT_POOL[randomCategory]) {
    return '🔥🔥🔥'; // Fallback seguro
  }

  // Selecionar comentário aleatório da categoria
  const categoryComments = COMMENT_POOL[randomCategory];
  const randomComment = categoryComments[Math.floor(Math.random() * categoryComments.length)];

  // Validar que o comentário não é undefined
  if (!randomComment) {
    return '🔥🔥🔥'; // Fallback seguro
  }

  console.log(`   💬 Comentário selecionado [${randomCategory}]: "${randomComment}"`);

  return randomComment;
}

// createIsolatedBrowser() removida - batch-engagement usa sessão oficial compartilhada

/**
 * Delay aleatório humanizado (2-5 segundos)
 * COPIADO DO SCRAPING
 */
async function humanDelay(): Promise<void> {
  const delay = 2000 + Math.random() * 3000;
  console.log(`   ⏳ Aguardando ${(delay / 1000).toFixed(1)}s (delay humano)...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Delay aleatório humanizado com parâmetros customizáveis
 */
async function customDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  console.log(`   ⏳ Aguardando ${(delay / 1000).toFixed(1)}s (delay humano)...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Random integer entre min e max (inclusive)
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Delay maior entre ações críticas (3-6 segundos)
 * COPIADO DO SCRAPING
 */
async function antiDetectionDelay(): Promise<void> {
  const delay = 3000 + Math.random() * 3000;
  console.log(`   🛡️  Delay anti-detecção: ${(delay / 1000).toFixed(1)}s...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Navega para perfil de um usuário via busca
 * COPIADO DO SCRAPING - PADRÃO QUE FUNCIONA
 */
async function navigateToProfile(page: Page, username: string): Promise<void> {
  console.log(`🔍 Navegando para perfil: @${username}`);

  // 1. IR PARA PÁGINA INICIAL
  console.log(`🏠 Navegando para página inicial...`);
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 120000 });
  await humanDelay();

  // 2. ABRIR CAMPO DE BUSCA (mesmo código do scraping)
  console.log(`🔍 Abrindo campo de busca...`);
  const searchPanelOpened = await page.evaluate(() => {
    // @ts-ignore - Código executado no browser context
    const icon = document.querySelector('svg[aria-label="Pesquisar"], svg[aria-label="Search"]');
    if (!icon) return false;
    const clickable = icon.closest('a, button, div[role="button"]');
    // @ts-ignore - HTMLElement disponível no browser
    if (clickable instanceof HTMLElement) {
      // @ts-ignore
      clickable.click();
      return true;
    }
    return false;
  });

  if (!searchPanelOpened) {
    console.log(`   ⚠️  Ícone de busca não encontrado, tentando atalho "/"`);
    await page.keyboard.press('/');
    await new Promise(resolve => setTimeout(resolve, 600));
  }

  await humanDelay();

  // 3. DIGITAR NO CAMPO DE BUSCA
  console.log(`⌨️  Digitando "@${username}"...`);
  const searchInputSelector = 'input[placeholder*="Pesquis"], input[placeholder*="Search"], input[aria-label*="Pesquis"], input[aria-label*="Search"]';

  const searchInput = await page.waitForSelector(searchInputSelector, { timeout: 10000, visible: true });

  if (!searchInput) {
    throw new Error('Campo de busca não encontrado');
  }

  // Limpar campo
  await searchInput.click();
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await new Promise(resolve => setTimeout(resolve, 300));

  // Digitar username letra por letra
  for (const char of username) {
    await page.keyboard.type(char);
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
  }

  await humanDelay();

  // 4. CLICAR NO PERFIL NOS RESULTADOS
  console.log(`🎯 Procurando perfil @${username} nos resultados...`);

  const profileClicked = await page.evaluate((user) => {
    // Procurar link com href exato /{username}/
    // @ts-ignore - Código executado no browser context
    const links = Array.from(document.querySelectorAll('a[href^="/"]'));
    for (const link of links) {
      // @ts-ignore
      const href = link.getAttribute('href');
      if (href === `/${user}/` || href === `/${user}`) {
        // @ts-ignore
        (link as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, username);

  if (!profileClicked) {
    console.log(`⚠️  Perfil não encontrado nos resultados, navegando direto pela URL`);
    await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  }

  await humanDelay();
  console.log(`✅ Perfil @${username} carregado`);
}

/**
 * Verifica se já está seguindo o usuário
 */
async function checkIfAlreadyFollowing(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector('button', { timeout: 5000 });

    const isFollowing = await page.evaluate(() => {
      // @ts-ignore - Código executado no browser context
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const button of buttons) {
        // @ts-ignore
        const text = button.textContent || '';
        if (text.includes('Seguindo') || text.includes('Following')) {
          return true;
        }
      }
      return false;
    });

    return isFollowing;
  } catch (error: any) {
    console.error(`❌ Erro ao verificar status de follow: ${error.message}`);
    return false;
  }
}

/**
 * Executa follow em um usuário
 */
async function performFollow(page: Page, username: string): Promise<{ success: boolean; error_message: string | null }> {
  try {
    console.log(`👥 [FOLLOW] Seguindo @${username}...`);

    // Aguardar delay anti-detecção ANTES de seguir
    await antiDetectionDelay();

    await page.waitForSelector('button', { timeout: 10000 });

    const followClicked = await page.evaluate(() => {
      // @ts-ignore - Código executado no browser context
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const button of buttons) {
        // @ts-ignore
        const text = button.textContent || '';
        if (text.includes('Seguir') || text.includes('Follow')) {
          // @ts-ignore
          (button as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!followClicked) {
      throw new Error('Botão de Follow não encontrado');
    }

    console.log(`✅ Follow executado em @${username}`);
    return { success: true, error_message: null };

  } catch (error: any) {
    console.error(`❌ Erro ao seguir: ${error.message}`);
    return { success: false, error_message: error.message };
  }
}

/**
 * Curte o primeiro post do perfil
 */
async function performLikeFirstPost(page: Page, username: string): Promise<{ success: boolean; post_url: string | null; error_message: string | null }> {
  try {
    console.log(`❤️  [LIKE] Curtindo primeiro post de @${username}...`);

    // Aguardar delay anti-detecção
    await antiDetectionDelay();

    // Aguardar grid de posts carregar (COPIADO DO SCRAPER)
    const postSelector = 'a[href*="/p/"], a[href*="/reel/"]';
    console.log(`   ⏳ Aguardando posts carregar...`);
    await page.waitForFunction(
      (selector) => {
        // @ts-ignore
        return document.querySelectorAll(selector).length > 0;
      },
      { timeout: 30000 },
      postSelector
    );
    await humanDelay();

    // Pegar primeiro post
    const firstPost = await page.$(postSelector);
    if (!firstPost) {
      throw new Error('Nenhum post encontrado no perfil');
    }

    // @ts-ignore - HTMLAnchorElement disponível no browser
    const postUrl = await page.evaluate(el => (el as HTMLAnchorElement).href, firstPost);
    console.log(`📍 Post encontrado: ${postUrl}`);

    // Clicar no post
    await firstPost.click();

    // DELAY MAIOR: Aguardar modal carregar completamente (5 segundos)
    console.log(`   ⏳ Aguardando modal carregar (5s)...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Validar que o post abriu
    const currentUrl = page.url();
    if (!currentUrl.includes('/p/') && !currentUrl.includes('/reel/')) {
      throw new Error(`Post não abriu. URL: ${currentUrl}`);
    }

    // DEBUG: Verificar quantos SVGs existem no DOM
    const svgCount = await page.evaluate(() => {
      // @ts-ignore
      return document.querySelectorAll('svg').length;
    });
    console.log(`   🔍 [DEBUG] Total de SVGs no DOM: ${svgCount}`);

    // Aguardar botão de like carregar - AGUARDAR O SVG APARECER NO DOM
    console.log(`   ⏳ Aguardando botão de like aparecer (timeout 30s)...`);

    // Estratégia: Aguardar até que QUALQUER SVG com "Curtir" ou "Descurtir" apareça
    const likeButtonFound = await page.waitForFunction(
      () => {
        // @ts-ignore
        const allSvgs = document.querySelectorAll('svg');
        console.log(`[DEBUG BROWSER] Total SVGs: ${allSvgs.length}`);

        // @ts-ignore
        for (const svg of allSvgs) {
          // Verificar aria-label
          const ariaLabel = svg.getAttribute('aria-label');
          if (ariaLabel) {
            console.log(`[DEBUG BROWSER] SVG com aria-label: ${ariaLabel}`);
          }
          if (ariaLabel && (ariaLabel === 'Curtir' || ariaLabel === 'Like')) {
            console.log('[DEBUG BROWSER] ✅ Botão de curtir encontrado via aria-label!');
            return true;
          }

          // Verificar <title>
          // @ts-ignore
          const title = svg.querySelector('title');
          if (title) {
            const text = title.textContent;
            if (text) {
              console.log(`[DEBUG BROWSER] SVG com title: ${text}`);
            }
            if (text === 'Curtir' || text === 'Like' || text === 'Descurtir' || text === 'Unlike') {
              console.log(`[DEBUG BROWSER] ✅ Botão encontrado via title: ${text}`);
              return true;
            }
          }
        }
        return false;
      },
      { timeout: 30000 }
    ).catch(() => null);

    if (!likeButtonFound) {
      // DEBUG: Mostrar todos os SVGs que existem
      const debugInfo = await page.evaluate(() => {
        // @ts-ignore
        const allSvgs = document.querySelectorAll('svg');
        const svgInfo = [];
        // @ts-ignore
        for (const svg of allSvgs) {
          const ariaLabel = svg.getAttribute('aria-label');
          // @ts-ignore
          const title = svg.querySelector('title');
          const titleText = title ? title.textContent : null;
          // @ts-ignore
          svgInfo.push({ ariaLabel, titleText });
        }
        // @ts-ignore
        return svgInfo;
      });
      console.error(`   ❌ [DEBUG] SVGs encontrados: ${JSON.stringify(debugInfo, null, 2)}`);
      throw new Error('Botão de like não apareceu no modal após 30s');
    }

    await humanDelay();

    // Curtir o post - Instagram usa estruturas diferentes para curtido/não curtido
    const likeClicked = await page.evaluate(() => {
      // @ts-ignore - Código executado no browser context
      const allSvgs = document.querySelectorAll('svg');

      // Caso 1: Verificar se já está curtido (SVG com <title>Descurtir</title>)
      // @ts-ignore
      for (const svg of allSvgs) {
        // @ts-ignore
        const title = svg.querySelector('title');
        if (title && (title.textContent === 'Descurtir' || title.textContent === 'Unlike')) {
          console.log('[DEBUG] Post já curtido, pulando...');
          return true; // Já curtido, não precisa fazer nada
        }
      }

      // Caso 2: Buscar botão de curtir (SVG com aria-label="Curtir" ou <title>Curtir</title>)
      // @ts-ignore
      for (const svg of allSvgs) {
        const ariaLabel = svg.getAttribute('aria-label');
        // @ts-ignore
        const title = svg.querySelector('title');
        const titleText = title ? title.textContent : '';

        if ((ariaLabel === 'Curtir' || ariaLabel === 'Like') ||
            (titleText === 'Curtir' || titleText === 'Like')) {
          // @ts-ignore
          const button = svg.closest('button, span[role="button"], div[role="button"]');
          // @ts-ignore
          if (button instanceof HTMLElement) {
            console.log('[DEBUG] Clicando no botão de like...');
            // @ts-ignore
            button.click();
            return true;
          }
        }
      }

      return false;
    });

    if (!likeClicked) {
      throw new Error('Botão de like não encontrado após espera');
    }

    console.log(`✅ Like executado no post`);

    // Aguardar 5 segundos após curtir para garantir que o Instagram registrou
    console.log(`   ⏳ Aguardando 5s após curtir...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Voltar para o perfil
    console.log(`🔙 Voltando para o perfil...`);
    await page.goBack();
    await humanDelay();

    return { success: true, post_url: postUrl, error_message: null };

  } catch (error: any) {
    console.error(`❌ Erro ao curtir: ${error.message}`);
    return { success: false, post_url: null, error_message: error.message };
  }
}

/**
 * Comenta no primeiro post do perfil
 * Se nenhum comentário for especificado, escolhe um aleatório do pool
 */
async function performCommentFirstPost(
  page: Page,
  username: string,
  commentText?: string
): Promise<{ success: boolean; post_url: string | null; error_message: string | null; comment_used: string }> {
  try {
    // Se não foi especificado comentário, escolher um aleatório
    const finalComment = commentText || getRandomComment();

    console.log(`💬 [COMMENT] Comentando "${finalComment}" no post de @${username}...`);

    // Aguardar delay anti-detecção
    await antiDetectionDelay();

    // Aguardar grid de posts (COPIADO DO SCRAPER)
    const postSelector = 'a[href*="/p/"], a[href*="/reel/"]';
    console.log(`   ⏳ Aguardando posts carregar...`);
    await page.waitForFunction(
      (selector) => {
        // @ts-ignore
        return document.querySelectorAll(selector).length > 0;
      },
      { timeout: 30000 },
      postSelector
    );
    await humanDelay();

    // Pegar primeiro post (MESMO que foi curtido)
    const firstPost = await page.$(postSelector);
    if (!firstPost) {
      throw new Error('Nenhum post encontrado');
    }

    // @ts-ignore - HTMLAnchorElement disponível no browser
    const postUrl = await page.evaluate(el => (el as HTMLAnchorElement).href, firstPost);

    // Clicar no post
    await firstPost.click();
    await humanDelay();

    // Validar que o post abriu
    const currentUrl = page.url();
    if (!currentUrl.includes('/p/') && !currentUrl.includes('/reel/')) {
      throw new Error(`Post não abriu. URL: ${currentUrl}`);
    }

    // Aguardar campo de comentário carregar
    console.log(`   ⏳ Aguardando campo de comentário carregar...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Aguardar modal carregar
    await humanDelay();

    // Procurar campo de comentário (por aria-label ou placeholder)
    const commentArea = await page.$('textarea[aria-label*="comentário"], textarea[aria-label*="comment"], textarea[placeholder*="comentário"], textarea[placeholder*="comment"]');
    if (!commentArea) {
      throw new Error('Campo de comentário não encontrado');
    }

    // Clicar no campo
    await commentArea.click();
    await humanDelay();

    // Digitar comentário letra por letra
    console.log(`⌨️  Digitando comentário...`);
    for (const char of finalComment) {
      await page.keyboard.type(char);
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
    }

    await humanDelay();

    // Clicar em Publicar/Postar
    const postButtonClicked = await page.evaluate(() => {
      // @ts-ignore - Código executado no browser context
      // Buscar por button ou div[role="button"]
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      // @ts-ignore
      for (const button of buttons) {
        // @ts-ignore
        const text = (button.textContent || '').trim();
        if (text === 'Publicar' || text === 'Post' || text === 'Postar') {
          // @ts-ignore
          button.click();
          return true;
        }
      }
      return false;
    });

    if (!postButtonClicked) {
      throw new Error('Botão de publicar não encontrado');
    }

    console.log(`✅ Comentário "${finalComment}" publicado`);

    await humanDelay();

    // Voltar para o perfil
    console.log(`🔙 Voltando para o perfil...`);
    await page.goBack();
    await humanDelay();

    return { success: true, post_url: postUrl, error_message: null, comment_used: finalComment };

  } catch (error: any) {
    console.error(`❌ Erro ao comentar: ${error.message}`);
    return { success: false, post_url: null, error_message: error.message, comment_used: '' };
  }
}

/**
 * Processa batch de até 10 usuários com engajamento completo
 * SEGUINDO PADRÃO DO SCRAPING
 * COM MUTEX para evitar execução paralela
 */
export async function processBatchEngagement(
  usernames: string[]
): Promise<{
  success: boolean;
  processed_count: number;
  skipped_count: number;
  timestamp: string;
  leads: Array<{
    username: string;
    processed: boolean;
    already_following: boolean;
    actions: {
      follow?: { success: boolean };
      like?: { success: boolean; post_url?: string };
      comment?: { success: boolean; post_url?: string; comment_text?: string };
    };
    error_message?: string;
  }>;
}> {
  // MUTEX: Aguardar se já tem batch rodando
  if (batchInProgress) {
    console.log('⏳ [MUTEX] Outro batch em execução, aguardando...');

    // Aguardar até batch atual terminar (polling a cada 500ms)
    while (batchInProgress) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('✅ [MUTEX] Batch anterior finalizado, iniciando novo batch');
  }

  // Marcar como em execução
  batchInProgress = true;

  try {
    return await executeBatch(usernames);
  } finally {
    // Liberar mutex
    batchInProgress = false;
  }
}

/**
 * Envia DM personalizado para um lead
 * USANDO PÁGINA COMPARTILHADA (não cria browser isolado)
 */
export async function sendDirectMessageShared(username: string, message: string): Promise<{
  success: boolean;
  sent_at: string | null;
  error_message: string | null;
}> {
  try {
    console.log(`\n💬 [DM] Enviando mensagem para @${username}...`);

    // Reutilizar página compartilhada ou criar nova se necessário
    if (!sharedPage || sharedPage.isClosed()) {
      console.log('📄 Criando nova página compartilhada...');
      sharedPage = await createOfficialAuthenticatedPage();
    } else {
      console.log('♻️  Reutilizando página compartilhada existente');
    }

    const page = sharedPage;

    // Navegar para perfil do lead
    await navigateToProfile(page, username);
    await customDelay(2000, 4000);

    // Procurar botão "Mensagem" ou "Message"
    console.log('🔍 Procurando botão de mensagem...');

    const messageButtonClicked = await page.evaluate(() => {
      // @ts-ignore
      const buttons = Array.from(document.querySelectorAll('button'));

      // @ts-ignore
      for (const button of buttons) {
        // @ts-ignore
        const text = (button.textContent || '').trim();

        // Procurar botão "Mensagem" ou "Message"
        if (text === 'Mensagem' || text === 'Message' || text.includes('Enviar mensagem')) {
          console.log(`[DM-BUTTON] Botão encontrado: "${text}"`);
          // @ts-ignore
          button.click();
          return true;
        }
      }

      console.log('[DM-BUTTON] Botão de mensagem não encontrado');
      return false;
    });

    if (!messageButtonClicked) {
      throw new Error('Botão de mensagem não encontrado no perfil');
    }

    // Aguardar modal de DM abrir
    await customDelay(2000, 3000);
    console.log('📝 Modal de mensagem aberto');

    // Procurar textarea de mensagem
    console.log('🔍 Procurando campo de texto...');

    // Tentar múltiplos seletores (Instagram muda frequentemente)
    const textareaSelectors = [
      'textarea[placeholder*="Mensagem"]',
      'textarea[placeholder*="Message"]',
      'div[contenteditable="true"]',
      'textarea',
      '[role="textbox"]'
    ];

    let textareaFound = false;

    for (const selector of textareaSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });

        // Clicar e focar no campo
        await page.click(selector);
        await customDelay(500, 1000);

        // Digitar mensagem caractere por caractere (mais humano)
        console.log('⌨️  Digitando mensagem...');
        await page.keyboard.type(message, { delay: randomInt(50, 150) });
        await customDelay(1000, 2000);

        textareaFound = true;
        console.log('✅ Mensagem digitada com sucesso');
        break;

      } catch (err) {
        // Tentar próximo seletor
        continue;
      }
    }

    if (!textareaFound) {
      throw new Error('Campo de texto não encontrado no modal de DM');
    }

    // Procurar e clicar no botão "Enviar"
    console.log('🔍 Procurando botão Enviar...');

    const sendButtonClicked = await page.evaluate(() => {
      // @ts-ignore
      const buttons = Array.from(document.querySelectorAll('button'));

      // @ts-ignore
      for (const button of buttons) {
        // @ts-ignore
        const text = (button.textContent || '').trim();

        // Procurar botão "Enviar" ou "Send"
        if (text === 'Enviar' || text === 'Send') {
          console.log(`[SEND-BUTTON] Botão encontrado: "${text}"`);
          // @ts-ignore
          button.click();
          return true;
        }
      }

      console.log('[SEND-BUTTON] Botão Enviar não encontrado');
      return false;
    });

    if (!sendButtonClicked) {
      throw new Error('Botão Enviar não encontrado');
    }

    // Aguardar envio
    await customDelay(2000, 3000);
    console.log('✅ DM enviado com sucesso!');

    return {
      success: true,
      sent_at: new Date().toISOString(),
      error_message: null
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido ao enviar DM';
    console.error(`❌ Erro ao enviar DM para @${username}:`, errorMsg);

    return {
      success: false,
      sent_at: null,
      error_message: errorMsg
    };
  }
}

/**
 * Verifica se um usuário nos segue de volta
 * USANDO PÁGINA COMPARTILHADA (não cria browser isolado)
 */
export async function checkFollowBackShared(username: string): Promise<{
  success: boolean;
  followed_back: boolean;
  error_message: string | null;
}> {
  try {
    console.log(`\n🔍 [CHECK] Verificando follow back de @${username}...`);

    // Reutilizar página compartilhada ou criar nova se necessário
    if (!sharedPage || sharedPage.isClosed()) {
      console.log('📄 Criando nova página compartilhada...');
      sharedPage = await createOfficialAuthenticatedPage();
    } else {
      console.log('♻️  Reutilizando página compartilhada existente');
    }

    const page = sharedPage;

    // Navegar para perfil
    await navigateToProfile(page, username);
    await humanDelay();

    // Aguardar botões carregarem
    await page.waitForSelector('button', { timeout: 10000 });

    // 🔍 DETECÇÃO MELHORADA: Procurar badge "Segue você" de múltiplas formas
    const followsYou = await page.evaluate(() => {
      // Método 1: Procurar por texto específico em spans
      // @ts-ignore
      const spans = Array.from(document.querySelectorAll('span'));
      // @ts-ignore
      for (const span of spans) {
        // @ts-ignore
        const text = (span.textContent || '').trim();
        if (text === 'Segue você' || text === 'Follows you') {
          console.log(`[BADGE-SPAN] Badge encontrado em <span>: "${text}"`);
          return true;
        }
      }

      // Método 2: Procurar em elementos com role
      // @ts-ignore
      const roleElements = Array.from(document.querySelectorAll('[role]'));
      // @ts-ignore
      for (const element of roleElements) {
        // @ts-ignore
        const text = (element.textContent || '').trim();
        if (text === 'Segue você' || text === 'Follows you') {
          console.log(`[BADGE-ROLE] Badge encontrado em [role]: "${text}"`);
          return true;
        }
      }

      // Método 3: Procurar em divs próximos ao header do perfil
      // @ts-ignore
      const allDivs = Array.from(document.querySelectorAll('div'));
      // @ts-ignore
      for (const div of allDivs) {
        // @ts-ignore
        const text = (div.textContent || '').trim();
        // Verificar se é exatamente o texto do badge (sem caracteres extras)
        if (text === 'Segue você' || text === 'Follows you') {
          console.log(`[BADGE-DIV] Badge encontrado em <div>: "${text}"`);
          return true;
        }
      }

      // Método 4: Buscar por variações parciais (mais permissivo)
      // @ts-ignore
      const allElements = Array.from(document.querySelectorAll('*'));
      // @ts-ignore
      for (const element of allElements) {
        // @ts-ignore
        const text = element.textContent || '';

        // Verificar variações
        if (text.includes('Segue você') ||
            text.includes('Follows you') ||
            text.includes('te segue') ||
            text.includes('follows you')) {
          console.log(`[BADGE-PARTIAL] Badge encontrado (parcial): "${text}"`);
          return true;
        }
      }

      console.log('[BADGE-NOT-FOUND] Badge "Segue você" não encontrado');
      return false;
    });

    console.log(followsYou ? `✅ @${username} nos segue de volta!` : `⏳ @${username} ainda não nos seguiu`);

    return {
      success: true,
      followed_back: followsYou,
      error_message: null
    };

  } catch (error: any) {
    console.error(`❌ Erro ao verificar follow back de @${username}:`, error.message);

    return {
      success: false,
      followed_back: false,
      error_message: error.message
    };
  }
}

/**
 * Verifica engajamento do lead em NOSSOS posts (curtidas e comentários)
 * Abre NOSSO perfil (@ubs.sistemas) e verifica últimos posts
 * USANDO PÁGINA COMPARTILHADA (não cria browser isolado)
 */
export async function checkLeadEngagementShared(leadUsername: string): Promise<{
  success: boolean;
  lead_id: string | null;
  actions_taken: string[];
  liked_posts: string[];
  commented_posts: string[];
  total_likes: number;
  total_comments: number;
  engagement_score: number;
  followed_back: boolean;
  message: string;
  error_message: string | null;
}> {
  try {
    console.log(`\n📊 [ENGAGEMENT] Verificando engajamento de @${leadUsername} em nossos posts...`);

    // Reutilizar página compartilhada ou criar nova se necessário
    if (!sharedPage || sharedPage.isClosed()) {
      console.log('📄 Criando nova página compartilhada...');
      sharedPage = await createOfficialAuthenticatedPage();
    } else {
      console.log('♻️  Reutilizando página compartilhada existente');
    }

    const page = sharedPage;

    // Detectar nosso username atual (conta oficial logada)
    const ourUsername = await page.evaluate(() => {
      // @ts-ignore
      // Procurar nosso username no HTML
      // @ts-ignore
      const links = Array.from(document.querySelectorAll('a[href*="/"]'));
      // @ts-ignore
      for (const link of links) {
        // @ts-ignore
        const href = (link as HTMLAnchorElement).href;
        // @ts-ignore
        const match = href.match(/instagram\.com\/([^\/\?]+)/);
        if (match && match[1] && !match[1].includes('explore') && !match[1].includes('direct')) {
          return match[1];
        }
      }
      return 'ubs.sistemas'; // fallback
    });

    console.log(`👤 Nossa conta: @${ourUsername}`);

    // 1. Navegar para página de Notificações
    console.log(`🔔 Navegando para página de Notificações...`);
    await page.goto('https://www.instagram.com/accounts/activity/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await humanDelay();

    // 2. Procurar interações do lead nas notificações
    console.log(`🔍 Procurando interações de @${leadUsername} nas notificações...`);

    // Scroll para carregar mais notificações
    await page.evaluate(() => {
      // @ts-ignore
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const interactions = await page.evaluate((username) => {
      const results = {
        likes: [] as string[],
        comments: [] as string[],
        followedBack: false,
        foundFollowBackButton: false
      };

      // @ts-ignore
      const notificationElements = Array.from(document.querySelectorAll('div, span'));

      // @ts-ignore
      for (const element of notificationElements) {
        // @ts-ignore
        const text = element.textContent || '';
        const lowerText = text.toLowerCase();

        // Verificar se menciona o username do lead
        if (lowerText.includes(username.toLowerCase())) {

          // 1. CURTIDA EM REEL/POST (ignorar "curtiu seu comentário")
          if ((lowerText.includes('curtiu seu reel') || lowerText.includes('curtiram seu reel') ||
               lowerText.includes('curtiu sua publicação') || lowerText.includes('curtiram sua publicação') ||
               lowerText.includes('liked your reel') || lowerText.includes('liked your post')) &&
              !lowerText.includes('comentário') && !lowerText.includes('comment')) {

            // Tentar extrair o post/reel ID do link próximo
            // @ts-ignore
            const parent = element.closest('div');
            if (parent) {
              // @ts-ignore
              const linkElement = parent.querySelector('a[href*="/reel/"], a[href*="/p/"]');
              if (linkElement) {
                // @ts-ignore
                const href = linkElement.getAttribute('href') || linkElement.href;
                if (href) {
                  const match = href.match(/\/(reel|p)\/([^\/\?]+)/);
                  if (match && match[2]) {
                    const postId = match[2];
                    if (!results.likes.includes(postId)) {
                      results.likes.push(postId);
                    }
                  }
                }
              }
            }
          }

          // 2. COMENTÁRIO (texto que menciona "comentou" mas não "curtiu seu comentário")
          if ((lowerText.includes('comentou') || lowerText.includes('commented')) &&
              !lowerText.includes('curtiu seu comentário') && !lowerText.includes('liked your comment')) {

            // @ts-ignore
            const parent = element.closest('div');
            if (parent) {
              // @ts-ignore
              const linkElement = parent.querySelector('a[href*="/reel/"], a[href*="/p/"]');
              if (linkElement) {
                // @ts-ignore
                const href = linkElement.getAttribute('href') || linkElement.href;
                if (href) {
                  const match = href.match(/\/(reel|p)\/([^\/\?]+)/);
                  if (match && match[2]) {
                    const postId = match[2];
                    if (!results.comments.includes(postId)) {
                      results.comments.push(postId);
                    }
                  }
                }
              }
            }
          }

          // 3. NOVO SEGUIDOR - Procurar botão "Seguir de volta"
          if (lowerText.includes('começou a seguir') || lowerText.includes('started following')) {
            results.foundFollowBackButton = true;
          }
        }
      }

      return results;
    }, leadUsername);

    const likedPosts = interactions.likes;
    const commentedPosts = interactions.comments;

    console.log(`   ❤️  Curtidas em reels/posts: ${likedPosts.length}`);
    console.log(`   💬 Comentários: ${commentedPosts.length}`);

    if (likedPosts.length > 0) {
      console.log(`   📋 Posts curtidos:`, likedPosts);
    }
    if (commentedPosts.length > 0) {
      console.log(`   📋 Posts comentados:`, commentedPosts);
    }

    // 3. Se encontrou botão "Seguir de volta", clicar nele
    if (interactions.foundFollowBackButton) {
      console.log(`   🔔 Lead começou a seguir! Procurando botão "Seguir de volta"...`);

      try {
        const followedBack = await page.evaluate((username) => {
          // @ts-ignore
          const allElements = Array.from(document.querySelectorAll('div, span, button'));

          // @ts-ignore
          for (const element of allElements) {
            // @ts-ignore
            const text = (element.textContent || '').toLowerCase();

            // Encontrar elemento que menciona o username E "começou a seguir"
            if (text.includes(username.toLowerCase()) &&
                (text.includes('começou a seguir') || text.includes('started following'))) {

              // Procurar botão "Seguir de volta" próximo
              // @ts-ignore
              const parent = element.closest('div');
              if (parent) {
                // @ts-ignore
                const buttons = parent.querySelectorAll('button');
                // @ts-ignore
                for (const button of buttons) {
                  // @ts-ignore
                  const buttonText = (button.textContent || '').toLowerCase();
                  if (buttonText.includes('seguir de volta') || buttonText.includes('follow back')) {
                    // @ts-ignore
                    button.click();
                    return true;
                  }
                }
              }
            }
          }
          return false;
        }, leadUsername);

        if (followedBack) {
          console.log(`   ✅ Seguiu de volta @${leadUsername}!`);
          interactions.followedBack = true;
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
        } else {
          console.log(`   ⚠️  Botão "Seguir de volta" não encontrado`);
        }
      } catch (followError) {
        console.log(`   ❌ Erro ao seguir de volta: ${(followError as Error).message}`);
      }
    }

    // 3. Calcular engagement score
    const totalLikes = likedPosts.length;
    const totalComments = commentedPosts.length;

    // Score: curtida = 20 pontos, comentário = 40 pontos (max 100)
    const engagementScore = Math.min(100, (totalLikes * 20) + (totalComments * 40));

    console.log(`\n📊 Resultado do engajamento:`);
    console.log(`   ❤️  Curtidas: ${totalLikes}`);
    console.log(`   💬 Comentários: ${totalComments}`);
    console.log(`   📈 Score: ${engagementScore}/100`);

    return {
      success: true,
      lead_id: null,
      actions_taken: [],
      liked_posts: likedPosts,
      commented_posts: commentedPosts,
      total_likes: totalLikes,
      total_comments: totalComments,
      engagement_score: engagementScore,
      followed_back: interactions.followedBack,
      message: `Engajamento detectado: ${totalLikes} curtidas, ${totalComments} comentários`,
      error_message: null
    };

  } catch (error: any) {
    console.error(`❌ Erro ao verificar engajamento de @${leadUsername}:`, error.message);

    return {
      success: false,
      lead_id: null,
      actions_taken: [],
      liked_posts: [],
      commented_posts: [],
      total_likes: 0,
      total_comments: 0,
      engagement_score: 0,
      followed_back: false,
      message: 'Erro ao verificar engajamento',
      error_message: error.message
    };
  }
}

/**
 * Verifica TODAS as notificações do Instagram e retorna interações detectadas
 * Detecta: curtidas em reels/posts, comentários, novos seguidores
 * Clica automaticamente em "Seguir de volta" para novos seguidores
 */
export async function checkAllNotifications(): Promise<{
  success: boolean;
  interactions: Array<{
    username: string;
    liked_posts: string[];
    commented_posts: string[];
    followed_back: boolean;
  }>;
  error_message: string | null;
}> {
  try {
    console.log(`\n📊 [CHECK-ALL] Verificando todas as notificações do Instagram...`);

    // Reutilizar página compartilhada ou criar nova
    if (!sharedPage || sharedPage.isClosed()) {
      console.log('📄 Criando nova página compartilhada...');
      sharedPage = await createOfficialAuthenticatedPage();
    } else {
      console.log('♻️  Reutilizando página compartilhada existente');
    }

    const page = sharedPage;

    // Navegar para página de Notificações
    console.log(`🔔 Navegando para página de Notificações...`);
    await page.goto('https://www.instagram.com/accounts/activity/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await humanDelay();

    // Scroll para carregar mais notificações
    console.log(`📜 Carregando mais notificações...`);
    await page.evaluate(() => {
      // @ts-ignore
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extrair TODAS as interações das notificações
    console.log(`🔍 Extraindo interações...`);

    const allInteractions = await page.evaluate(() => {
      const userInteractions: Record<string, {
        username: string;
        likes: string[];
        comments: string[];
        isNewFollower: boolean;
      }> = {};

      // @ts-ignore
      const notificationElements = Array.from(document.querySelectorAll('div, span'));

      // @ts-ignore
      for (const element of notificationElements) {
        // @ts-ignore
        const text = element.textContent || '';
        const lowerText = text.toLowerCase();

        // Tentar extrair username da notificação
        // Padrão: "roamhub24 curtiu seu reel" ou "roamhub24 e benditocoworking curtiram..."
        const usernameMatch = text.match(/^([a-zA-Z0-9._]+)/);
        if (!usernameMatch) continue;

        const username = usernameMatch[1];

        // Inicializar registro do usuário se não existir
        if (!userInteractions[username]) {
          userInteractions[username] = {
            username: username,
            likes: [],
            comments: [],
            isNewFollower: false
          };
        }

        // 1. CURTIDA EM REEL/POST (ignorar "curtiu seu comentário")
        if ((lowerText.includes('curtiu seu reel') || lowerText.includes('curtiram seu reel') ||
             lowerText.includes('curtiu sua publicação') || lowerText.includes('curtiram sua publicação') ||
             lowerText.includes('liked your reel') || lowerText.includes('liked your post')) &&
            !lowerText.includes('comentário') && !lowerText.includes('comment')) {

          // @ts-ignore
          const parent = element.closest('div');
          if (parent) {
            // @ts-ignore
            const linkElement = parent.querySelector('a[href*="/reel/"], a[href*="/p/"]');
            if (linkElement) {
              // @ts-ignore
              const href = linkElement.getAttribute('href') || linkElement.href;
              if (href) {
                const match = href.match(/\/(reel|p)\/([^\/\?]+)/);
                if (match && match[2]) {
                  const postId = match[2];
                  if (!userInteractions[username].likes.includes(postId)) {
                    userInteractions[username].likes.push(postId);
                  }
                }
              }
            }
          }
        }

        // 2. COMENTÁRIO
        if ((lowerText.includes('comentou') || lowerText.includes('commented')) &&
            !lowerText.includes('curtiu seu comentário') && !lowerText.includes('liked your comment')) {

          // @ts-ignore
          const parent = element.closest('div');
          if (parent) {
            // @ts-ignore
            const linkElement = parent.querySelector('a[href*="/reel/"], a[href*="/p/"]');
            if (linkElement) {
              // @ts-ignore
              const href = linkElement.getAttribute('href') || linkElement.href;
              if (href) {
                const match = href.match(/\/(reel|p)\/([^\/\?]+)/);
                if (match && match[2]) {
                  const postId = match[2];
                  if (!userInteractions[username].comments.includes(postId)) {
                    userInteractions[username].comments.push(postId);
                  }
                }
              }
            }
          }
        }

        // 3. NOVO SEGUIDOR
        if (lowerText.includes('começou a seguir') || lowerText.includes('started following')) {
          userInteractions[username].isNewFollower = true;
        }
      }

      return Object.values(userInteractions);
    });

    console.log(`\n📊 Total de usuários com interações detectadas: ${allInteractions.length}`);

    // Clicar em "Seguir de volta" para todos os novos seguidores
    const processedInteractions: Array<{
      username: string;
      liked_posts: string[];
      commented_posts: string[];
      followed_back: boolean;
    }> = [];

    for (const interaction of allInteractions) {
      const result = {
        username: interaction.username,
        liked_posts: interaction.likes,
        commented_posts: interaction.comments,
        followed_back: false
      };

      console.log(`\n👤 @${interaction.username}:`);
      console.log(`   ❤️  Curtidas: ${interaction.likes.length}`);
      console.log(`   💬 Comentários: ${interaction.comments.length}`);
      console.log(`   👥 Novo seguidor: ${interaction.isNewFollower ? 'Sim' : 'Não'}`);

      // Se é novo seguidor, clicar em "Seguir de volta"
      if (interaction.isNewFollower) {
        try {
          console.log(`   🔄 Procurando botão "Seguir de volta"...`);

          const followedBack = await page.evaluate((username) => {
            // @ts-ignore
            const allElements = Array.from(document.querySelectorAll('div, span, button'));

            // @ts-ignore
            for (const element of allElements) {
              // @ts-ignore
              const text = (element.textContent || '').toLowerCase();

              if (text.includes(username.toLowerCase()) &&
                  (text.includes('começou a seguir') || text.includes('started following'))) {

                // @ts-ignore
                const parent = element.closest('div');
                if (parent) {
                  // @ts-ignore
                  const buttons = parent.querySelectorAll('button');
                  // @ts-ignore
                  for (const button of buttons) {
                    // @ts-ignore
                    const buttonText = (button.textContent || '').toLowerCase();
                    if (buttonText.includes('seguir de volta') || buttonText.includes('follow back')) {
                      // @ts-ignore
                      button.click();
                      return true;
                    }
                  }
                }
              }
            }
            return false;
          }, interaction.username);

          if (followedBack) {
            console.log(`   ✅ Seguiu de volta!`);
            result.followed_back = true;
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
          } else {
            console.log(`   ⚠️  Botão não encontrado`);
          }
        } catch (followError) {
          console.log(`   ❌ Erro ao seguir: ${(followError as Error).message}`);
        }
      }

      processedInteractions.push(result);
    }

    console.log(`\n✅ [CHECK-ALL] Verificação concluída!`);
    console.log(`📊 Total de interações processadas: ${processedInteractions.length}`);

    return {
      success: true,
      interactions: processedInteractions,
      error_message: null
    };

  } catch (error: any) {
    console.error(`❌ [CHECK-ALL] Erro ao verificar notificações:`, error.message);

    return {
      success: false,
      interactions: [],
      error_message: error.message
    };
  }
}

/**
 * Deixa de seguir um usuário
 * USANDO PÁGINA COMPARTILHADA (não cria browser isolado)
 */
export async function unfollowUserShared(username: string): Promise<{
  success: boolean;
  error_message: string | null;
  was_not_following: boolean;
}> {
  try {
    console.log(`\n🗑️  [UNFOLLOW] Aplicando unfollow em @${username}...`);

    // Reutilizar página compartilhada ou criar nova se necessário
    if (!sharedPage || sharedPage.isClosed()) {
      console.log('📄 Criando nova página compartilhada...');
      sharedPage = await createOfficialAuthenticatedPage();
    } else {
      console.log('♻️  Reutilizando página compartilhada existente');
    }

    const page = sharedPage;

    // Navegar para perfil
    await navigateToProfile(page, username);
    await humanDelay();

    // Aguardar botões carregarem
    await page.waitForSelector('button', { timeout: 10000 });

    // Procurar botão "Seguindo" / "Following"
    const buttons = await page.$$('button');
    let notFollowing = false;

    for (const button of buttons) {
      const text = await page.evaluate(el => el.textContent, button);

      if (text && (text.includes('Seguir') || text.includes('Follow')) && !text.includes('Seguindo')) {
        notFollowing = true;
        console.log(`⚠️  Não estava seguindo @${username}`);
        break;
      }
    }

    if (notFollowing) {
      return {
        success: true,
        error_message: null,
        was_not_following: true
      };
    }

    // Procurar e clicar no botão "Seguindo"
    let foundFollowingButton = false;
    for (const button of buttons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text && (text.includes('Seguindo') || text.includes('Following'))) {
        await button.click();
        foundFollowingButton = true;
        break;
      }
    }

    if (!foundFollowingButton) {
      throw new Error('Botão "Seguindo" não encontrado');
    }

    // Aguardar popup de confirmação aparecer
    console.log(`   ⏳ Aguardando popup de unfollow carregar...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Procurar por elemento com texto "Deixar de seguir" / "Unfollow"
    console.log(`   🔍 Procurando opção "Deixar de seguir" no popup...`);

    const unfollowClicked = await page.evaluate(() => {
      // @ts-ignore - Código executado no browser context
      const allElements = Array.from(document.querySelectorAll('button, div[role="menuitem"], span[role="menuitem"], [role="button"]'));

      // @ts-ignore
      for (const element of allElements) {
        // @ts-ignore
        const text = element.textContent || '';

        if (text.includes('Deixar de seguir') || text.includes('Unfollow')) {
          // @ts-ignore
          element.click();
          return true;
        }
      }

      return false;
    });

    if (!unfollowClicked) {
      throw new Error('Botão "Deixar de seguir" não encontrado no popup');
    }

    console.log(`   ✅ Clicou em "Deixar de seguir"`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`✅ Unfollow executado em @${username}`);

    await humanDelay();

    return {
      success: true,
      error_message: null,
      was_not_following: false
    };

  } catch (error: any) {
    console.error(`❌ Erro ao dar unfollow em @${username}:`, error.message);

    return {
      success: false,
      error_message: error.message,
      was_not_following: false
    };
  }
}

/**
 * Execução interna do batch (sem mutex)
 */
async function executeBatch(
  usernames: string[]
): Promise<{
  success: boolean;
  processed_count: number;
  skipped_count: number;
  timestamp: string;
  leads: Array<{
    username: string;
    processed: boolean;
    already_following: boolean;
    actions: {
      follow?: { success: boolean };
      like?: { success: boolean; post_url?: string };
      comment?: { success: boolean; post_url?: string; comment_text?: string };
    };
    error_message?: string;
  }>;
}> {
  let page: Page | null = null;
  const results: Array<{
    username: string;
    processed: boolean;
    already_following: boolean;
    actions: {
      follow?: { success: boolean };
      like?: { success: boolean; post_url?: string };
      comment?: { success: boolean; post_url?: string; comment_text?: string };
    };
    error_message?: string;
  }> = [];

  try {
    // Validar batch
    if (usernames.length === 0) {
      throw new Error('Lista de usuários vazia');
    }

    if (usernames.length > 10) {
      throw new Error('Máximo de 10 usuários por batch');
    }

    console.log(`\n🎯 [BATCH] Processando ${usernames.length} usuários...`);

    // Reutilizar página compartilhada ou criar nova se necessário
    if (!sharedPage || sharedPage.isClosed()) {
      console.log('📄 Criando nova página compartilhada...');
      sharedPage = await createOfficialAuthenticatedPage();
    } else {
      console.log('♻️  Reutilizando página compartilhada existente');
    }

    page = sharedPage;

    let processedCount = 0;
    let skippedCount = 0;

    // Processar cada usuário
    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i];
      if (!username) continue; // Skip if undefined

      console.log(`\n\n═══════════════════════════════════════`);
      console.log(`📍 [${i + 1}/${usernames.length}] Processando @${username}`);
      console.log(`═══════════════════════════════════════`);

      try {
        // 1. Navegar para perfil
        await navigateToProfile(page, username);

        // 2. Verificar se já segue
        const alreadyFollowing = await checkIfAlreadyFollowing(page);

        if (alreadyFollowing) {
          console.log(`⏭️  Já segue @${username}, pulando...`);
          results.push({
            username,
            processed: false,
            already_following: true,
            actions: {}
          });
          skippedCount++;
          continue;
        }

        console.log(`✅ Não segue @${username}, iniciando engajamento...`);

        // 3. FOLLOW
        const followResult = await performFollow(page, username);
        if (!followResult.success) {
          results.push({
            username,
            processed: false,
            already_following: false,
            actions: { follow: { success: false } },
            error_message: followResult.error_message ?? 'Erro ao seguir'
          });
          continue;
        }

        // 4. LIKE
        const likeResult = await performLikeFirstPost(page, username);
        if (!likeResult.success) {
          results.push({
            username,
            processed: true,
            already_following: false,
            actions: {
              follow: { success: true },
              like: { success: false }
            },
            error_message: likeResult.error_message ?? 'Erro ao curtir'
          });
          continue;
        }

        // 5. COMMENT (sem passar comentário = usa aleatório do pool)
        const commentResult = await performCommentFirstPost(page, username);

        // Resultado final
        results.push({
          username,
          processed: true,
          already_following: false,
          actions: {
            follow: { success: true },
            like: { success: true, post_url: likeResult.post_url ?? undefined },
            comment: {
              success: commentResult.success,
              post_url: commentResult.post_url ?? undefined,
              comment_text: commentResult.comment_used // Incluir comentário usado
            }
          },
          error_message: commentResult.success ? undefined : commentResult.error_message ?? undefined
        });

        processedCount++;
        console.log(`\n✅ Engajamento completo em @${username} finalizado!`);

      } catch (error: any) {
        console.error(`❌ Erro ao processar @${username}: ${error.message}`);
        results.push({
          username,
          processed: false,
          already_following: false,
          actions: {},
          error_message: error.message
        });
      }
    }

    const timestamp = new Date().toISOString();

    console.log(`\n\n═══════════════════════════════════════`);
    console.log(`📊 RESUMO DO BATCH`);
    console.log(`═══════════════════════════════════════`);
    console.log(`✅ Processados: ${processedCount}`);
    console.log(`⏭️  Pulados (já seguindo): ${skippedCount}`);
    console.log(`❌ Erros: ${results.filter(r => !r.processed && !r.already_following).length}`);
    console.log(`⏰ Timestamp: ${timestamp}`);
    console.log(`═══════════════════════════════════════\n`);

    return {
      success: true,
      processed_count: processedCount,
      skipped_count: skippedCount,
      timestamp,
      leads: results
    };

  } catch (error: any) {
    console.error(`❌ Erro crítico no batch: ${error.message}`);

    return {
      success: false,
      processed_count: 0,
      skipped_count: 0,
      timestamp: new Date().toISOString(),
      leads: results
    };
  } finally {
    // NÃO fechar página - mantém sessão oficial aberta para próximas chamadas
    // O browser compartilhado é gerenciado pelo instagram-official-session.service
    console.log(`\n✅ Batch finalizado - sessão oficial mantida aberta`);
  }
}
