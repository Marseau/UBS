/**
 * Instagram Hashtag Discovery Service
 *
 * Descobre variações de hashtags automaticamente e calcula score de priorização
 * baseado em volume ideal (500k - 5mi posts = melhor ROI)
 */

import { Page } from 'puppeteer';

export interface HashtagVariation {
  hashtag: string;
  post_count: number;
  post_count_formatted: string;
  priority_score: number;
  volume_category: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
}

/**
 * Calcula score de priorização baseado no volume de posts
 *
 * Lógica:
 * - Volume ideal: 500k - 5mi posts (score 100)
 * - Muito pequeno: < 500k (score proporcional)
 * - Muito grande: > 5mi (score inversamente proporcional)
 *
 * @param postCount Volume de posts da hashtag
 * @returns Score de 0 a 100
 */
export function calculateHashtagScore(postCount: number): number {
  const IDEAL_MIN = 500_000; // 500k posts
  const IDEAL_MAX = 5_000_000; // 5mi posts

  // Sweet spot: 500k - 5mi posts
  if (postCount >= IDEAL_MIN && postCount <= IDEAL_MAX) {
    return 100;
  }

  // Muito pequena: penaliza proporcionalmente
  if (postCount < IDEAL_MIN) {
    return Math.round((postCount / IDEAL_MIN) * 100);
  }

  // Muito grande: penaliza inversamente
  return Math.round((IDEAL_MAX / postCount) * 100);
}

/**
 * Classifica hashtag por categoria de volume
 */
export function categorizeHashtagVolume(postCount: number): 'tiny' | 'small' | 'medium' | 'large' | 'huge' {
  if (postCount < 100_000) return 'tiny';
  if (postCount < 500_000) return 'small';
  if (postCount < 5_000_000) return 'medium';
  if (postCount < 20_000_000) return 'large';
  return 'huge';
}

/**
 * Parse volume formatado do Instagram (ex: "46,3 mi posts" → 46300000)
 *
 * Suporta:
 * - "770 mil posts" → 770000
 * - "208K posts" → 208000
 * - "2,4 mi posts" → 2400000
 * - "100+ posts" → 100
 * - "Menos de 100 posts" → 50
 * - "unknown" → 0
 */
export function parseInstagramPostCount(formatted: string): number {
  // Tratar casos especiais primeiro
  if (!formatted || formatted === 'unknown') {
    return 0;
  }

  const lower = formatted.toLowerCase();

  // "Menos de X posts" ou "Less than X posts" → retorna metade do valor
  if (lower.includes('menos de') || lower.includes('less than')) {
    const match = lower.match(/(\d+)/);
    if (match && match[1]) {
      return Math.round(parseInt(match[1], 10) / 2); // Metade como estimativa
    }
    return 50; // Fallback
  }

  // "100+ posts" → retorna o número
  if (lower.includes('+')) {
    const match = lower.match(/(\d+)/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  // Remove "posts" e espaços
  const cleaned = lower.replace(/\s*posts?\s*/gi, '').trim();

  // Detectar multiplicador (IMPORTANTE: checar "mil" ANTES de "mi")
  let multiplier = 1;
  let numberPart = cleaned;

  if (cleaned.includes('mil')) {
    // "mil" em português = thousand
    multiplier = 1_000;
    numberPart = cleaned.replace(/mil/gi, '').trim();
  } else if (cleaned.includes('mi')) {
    // "mi" = millions
    multiplier = 1_000_000;
    numberPart = cleaned.replace(/mi/gi, '').trim();
  } else if (cleaned.includes('k')) {
    multiplier = 1_000;
    numberPart = cleaned.replace(/k/gi, '').trim();
  }

  // Substituir vírgula por ponto (formato brasileiro)
  numberPart = numberPart.replace(',', '.');

  // Parse e multiplica
  const parsed = parseFloat(numberPart);
  if (isNaN(parsed)) {
    return 0;
  }
  return Math.round(parsed * multiplier);
}

/**
 * Descobre variações de uma hashtag usando Puppeteer
 *
 * Navega até a busca do Instagram e captura as 5 sugestões
 * que aparecem no dropdown
 *
 * @param page Página do Puppeteer já autenticada
 * @param parentHashtag Hashtag principal (sem #)
 * @returns Array de variações descobertas
 */
export async function discoverHashtagVariations(
  page: Page,
  parentHashtag: string
): Promise<HashtagVariation[]> {
  try {
    console.log(`\n🔍 [DISCOVERY] Descobrindo variações de #${parentHashtag}...`);

    // 1. Navegar para página inicial do Instagram
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Abrir campo de busca usando atalho de teclado (MAIS CONFIÁVEL)
    console.log('🔍 Abrindo campo de busca com atalho "/" ...');

    // Usar atalho de teclado "/" - funciona em qualquer lugar do Instagram
    await page.keyboard.press('/');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Aguardar input aparecer

    // Agora buscar o campo de input
    const searchInputSelectors = [
      'input[placeholder*="Pesquis"]',
      'input[placeholder*="Search"]',
      'input[aria-label*="Pesquis"]',
      'input[aria-label*="Search"]',
      'input[type="text"]'
    ];

    let searchInput: any = null;
    for (const selector of searchInputSelectors) {
      try {
        const element = await page.waitForSelector(selector, { timeout: 3000 });
        if (element) {
          searchInput = element;
          console.log(`   ✅ Campo de busca encontrado: ${selector}`);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!searchInput) {
      throw new Error('Campo de busca não encontrado após clicar no ícone');
    }

    // 3. Digitar hashtag no campo de busca DEVAGAR para trigger dropdown
    console.log(`⌨️  Digitando "#${parentHashtag}" (devagar para trigger dropdown)...`);
    await searchInput.type(`#${parentHashtag}`, { delay: 150 }); // Delay maior = 150ms entre cada tecla

    // 4. AGUARDAR DROPDOWN DE SUGESTÕES CARREGAR COMPLETAMENTE (CRITICAL!)
    console.log('⏳ Aguardando Instagram carregar dropdown com 5 sugestões...');

    // Aguardar ATIVAMENTE até ter pelo menos 5 sugestões (ou timeout após 15 segundos)
    const startTime = Date.now();
    const maxWaitTime = 15000; // 15 segundos
    let hashtagLinksCount = 0;

    while (Date.now() - startTime < maxWaitTime) {
      // Contar quantas sugestões já apareceram
      hashtagLinksCount = await page.evaluate(() => {
        // @ts-ignore
        const links = document.querySelectorAll('a[href*="/explore/tags/"]');
        return links.length;
      });

      console.log(`   📊 ${hashtagLinksCount} sugestões carregadas até agora...`);

      // Se já tem 5 ou mais sugestões, aguardar mais 2 segundos para estabilizar e sair
      if (hashtagLinksCount >= 5) {
        console.log('   ✅ 5+ sugestões detectadas! Aguardando estabilização...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        break;
      }

      // Aguardar 500ms antes de checar novamente
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Verificar se conseguiu carregar sugestões
    if (hashtagLinksCount === 0) {
      console.log('   ⚠️  Timeout: Nenhuma sugestão de hashtag encontrada após 15s');

      // DEBUG: Tirar screenshot e HTML para entender o que está acontecendo
      try {
        const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
        console.log('   📸 Screenshot capturado (primeiros 200 chars):', screenshot.substring(0, 200));

        const htmlDebug = await page.evaluate(() => {
          // @ts-ignore
          const searchInput = document.querySelector('input[placeholder*="Pesquis"], input[placeholder*="Search"]');
          // @ts-ignore
          const allLinks = document.querySelectorAll('a[href*="/explore/"]');
          return {
            inputExists: !!searchInput,
            // @ts-ignore
            inputValue: searchInput ? searchInput.value : null,
            // @ts-ignore
            inputFocused: searchInput ? searchInput === document.activeElement : false,
            totalExploreLinks: allLinks.length,
            // @ts-ignore
            sampleLinks: Array.from(allLinks).slice(0, 5).map(l => l.href)
          };
        });

        console.log('   🔍 Debug HTML:', JSON.stringify(htmlDebug, null, 2));
      } catch (debugError) {
        console.log('   ⚠️  Erro ao capturar debug:', (debugError as Error).message);
      }

      return []; // Retorna vazio
    }

    console.log(`   ✅ Dropdown carregado com ${hashtagLinksCount} sugestões. Processando...`);

    // 5. Extrair sugestões de hashtags do dropdown
    console.log('📊 Extraindo variações sugeridas...');

    const variations = await page.evaluate(() => {
      const results: Array<{ hashtag: string; postCount: string }> = [];

      // 🔧 FIX: Buscar links de hashtag e extrair contagem DENTRO de cada <a> individualmente
      // @ts-ignore
      const hashtagLinks = document.querySelectorAll('a[href*="/explore/tags/"]');
      // @ts-ignore
      console.log(`   [DEBUG] Links de hashtag encontrados: ${hashtagLinks.length}`);

      // Padrões de contagem de posts
      const countPatterns = [
        /(\d+[.,]?\d*\s*(M|mi|mil|K|k)\s*posts?)/i,  // "770 mil posts", "208K posts"
        /(\d+\+?\s*posts?)/i,                         // "100+ posts", "100 posts"
        /(Menos de \d+\s*posts?)/i,                   // "Menos de 100 posts"
        /(Less than \d+\s*posts?)/i                   // "Less than 100 posts"
      ];

      // @ts-ignore
      for (const link of hashtagLinks) {
        // @ts-ignore
        const href = link.getAttribute('href') || '';
        const hashtagMatch = href.match(/\/explore\/tags\/([^/]+)/);

        if (hashtagMatch) {
          const hashtag = decodeURIComponent(hashtagMatch[1]);

          // 🔧 FIX: Buscar contagem APENAS dentro do próprio <a> (não subir para parents!)
          // @ts-ignore
          const linkText = link.textContent || '';
          let postCount = '';

          // Tentar cada padrão de contagem
          for (const pattern of countPatterns) {
            const match = linkText.match(pattern);
            if (match) {
              postCount = match[0];
              // @ts-ignore
              console.log(`   [DEBUG] #${hashtag}: "${postCount}" (dentro do link)`);
              break;
            }
          }

          // Se não encontrou, marcar como unknown
          if (!postCount) {
            postCount = 'unknown';
            // @ts-ignore
            console.log(`   [DEBUG] #${hashtag}: SEM CONTAGEM (linkText: "${linkText.substring(0, 50)}")`);
          }

          // Adicionar se não duplicada
          if (!results.find(r => r.hashtag === hashtag)) {
            results.push({ hashtag, postCount });

            // Limitar a 5 resultados
            if (results.length >= 5) break;
          }
        }
      }

      return results;
    });

    console.log(`✅ ${variations.length} variações descobertas`);

    // 5. Processar e calcular scores
    const processed: HashtagVariation[] = variations.map(v => {
      const postCount = parseInstagramPostCount(v.postCount);
      const priorityScore = calculateHashtagScore(postCount);
      const volumeCategory = categorizeHashtagVolume(postCount);

      return {
        hashtag: v.hashtag,
        post_count: postCount,
        post_count_formatted: v.postCount,
        priority_score: priorityScore,
        volume_category: volumeCategory
      };
    });

    // Ordenar por score (maior primeiro)
    processed.sort((a, b) => b.priority_score - a.priority_score);

    // Log resumo
    console.log('\n📊 Variações encontradas:');
    processed.forEach(v => {
      console.log(`   #${v.hashtag} - ${v.post_count_formatted} - Score: ${v.priority_score} - ${v.volume_category}`);
    });

    return processed;

  } catch (error) {
    console.error('❌ Erro ao descobrir variações:', error);
    return [];
  }
}

/**
 * Formata número para display (ex: 46300000 → "46.3M")
 */
export function formatPostCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}
