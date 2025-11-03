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
