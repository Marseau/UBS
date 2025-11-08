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
 */
export function parseInstagramPostCount(formatted: string): number {
  // Remove "posts" e espaços
  const cleaned = formatted.toLowerCase().replace(/\s*posts?\s*/gi, '').trim();

  // Detectar multiplicador
  let multiplier = 1;
  let numberPart = cleaned;

  if (cleaned.includes('mi')) {
    multiplier = 1_000_000;
    numberPart = cleaned.replace(/mi(l)?/gi, '').trim();
  } else if (cleaned.includes('k')) {
    multiplier = 1_000;
    numberPart = cleaned.replace(/k/gi, '').trim();
  }

  // Substituir vírgula por ponto (formato brasileiro)
  numberPart = numberPart.replace(',', '.');

  // Parse e multiplica
  const parsed = parseFloat(numberPart);
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

    // 2. Clicar no campo de busca
    console.log('🔍 Abrindo campo de busca...');
    const searchSelectors = [
      'input[placeholder*="Pesquis"]',
      'input[placeholder*="Search"]',
      'input[aria-label*="Pesquis"]',
      'input[aria-label*="Search"]'
    ];

    let searchInput: any = null;
    for (const selector of searchSelectors) {
      try {
        const element = await page.waitForSelector(selector, { timeout: 5000 });
        if (element) {
          searchInput = element;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!searchInput) {
      throw new Error('Campo de busca não encontrado');
    }

    await searchInput.click();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. Digitar hashtag no campo de busca
    console.log(`⌨️  Digitando "#${parentHashtag}"...`);
    await searchInput.type(`#${parentHashtag}`, { delay: 100 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Extrair sugestões de hashtags do dropdown
    console.log('📊 Extraindo variações sugeridas...');

    const variations = await page.evaluate(() => {
      const results: Array<{ hashtag: string; postCount: string }> = [];

      // Procurar elementos que contenham hashtags e contagem de posts
      // @ts-ignore - Código executado no browser context
      const allElements = Array.from(document.querySelectorAll('*'));

      // @ts-ignore
      for (const element of allElements) {
        // @ts-ignore
        const text = element.textContent || '';

        // Detectar padrão: #hashtag seguido de "X mi posts" ou "X mil posts"
        const hashtagMatch = text.match(/#(\w+)/);
        const postCountMatch = text.match(/(\d+[.,]?\d*\s*(mi|mil|k)\s*posts?)/i);

        if (hashtagMatch && postCountMatch) {
          const hashtag = hashtagMatch[1];
          const postCount = postCountMatch[0];

          // Verificar se já não foi adicionado
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
