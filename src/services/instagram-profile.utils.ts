// @ts-nocheck - utilidades compartilhadas para análise de perfis Instagram

export interface ActivityScore {
  isActive: boolean;
  score: number;
  postsPerMonth: number;
  reasons: string[];
}

export interface ProfileForScoring {
  posts_count: number;
  followers_count: number;
  following_count: number;
  bio: string | null;
  is_business_account: boolean;
  email: string | null;
  phone: string | null;
  is_verified: boolean;
  recent_post_dates?: string[] | null;
}

/**
 * Converte contadores do Instagram (ex: "6 mil") em número inteiro
 */
export function parseInstagramCount(value: string | null): number {
  if (!value) return 0;

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return 0;
  }

  const multiplierMap: Record<string, number> = {
    'mil': 1_000,
    'k': 1_000,
    'm': 1_000_000,
    'mi': 1_000_000,
    'kk': 1_000_000,
    'b': 1_000_000_000
  };

  const match = normalized.match(/^([\d.,\s]+)\s*([a-z]*)/i);
  if (!match) {
    const digits = normalized.replace(/\D/g, '');
    return digits ? Number.parseInt(digits, 10) : 0;
  }

  const [, numberPortion, suffixRaw] = match;
  const suffix = suffixRaw?.toLowerCase() ?? '';
  const multiplier = multiplierMap[suffix] ?? 1;

  let numeric: number;

  // Se não tem sufixo (mil, k, etc), pontos/vírgulas são separadores de milhares - remover
  if (!suffix || suffix.length === 0) {
    // Remover todos os separadores de milhares (pontos e vírgulas)
    const cleaned = numberPortion.replace(/[.,\s]/g, '');
    numeric = Number.parseInt(cleaned, 10);
  } else {
    // Tem sufixo: vírgula é decimal, ponto é separador de milhares
    numeric = Number.parseFloat(numberPortion.replace(/\./g, '').replace(/,/g, '.'));
  }

  if (!Number.isFinite(numeric)) {
    numeric = Number.parseInt(numberPortion.replace(/\D/g, ''), 10);
  }

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.round(numeric * multiplier);
}

/**
 * Extrai email da bio do Instagram
 */
export function extractEmailFromBio(bio: string | null): string | null {
  if (!bio) return null;

  const emailPattern = /\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+\b/gi;
  const match = bio.match(emailPattern);

  if (match && match.length > 0) {
    const email = match[0].toLowerCase();
    console.log(`   📧 Email encontrado na bio: ${email}`);
    return email;
  }

  return null;
}

/**
 * Extrai hashtags de um texto (bio ou posts)
 */
export function extractHashtags(text: string | null, maxHashtags: number = 10): string[] {
  if (!text) return [];

  const hashtagPattern = /#([a-zA-Z0-9_]+)/g;
  const matches = text.match(hashtagPattern);

  if (!matches || matches.length === 0) return [];

  return matches
    .map(tag => tag.substring(1).toLowerCase())
    .filter((tag, index, self) => self.indexOf(tag) === index)
    .slice(0, maxHashtags);
}

/**
 * Calcula score de atividade (0-100) para um perfil
 */
export function calculateActivityScore(profile: ProfileForScoring): ActivityScore {
  let score = 100;
  const reasons: string[] = [];
  const DAY_IN_MS = 24 * 60 * 60 * 1000;

  if (profile.posts_count === 0) {
    return {
      isActive: false,
      score: 0,
      postsPerMonth: 0,
      reasons: ['Nenhum post publicado']
    };
  }

  const now = Date.now();
  const recentDates = (profile.recent_post_dates || [])
    .map(dateString => new Date(dateString))
    .filter(date => Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  let postsPerMonth = profile.posts_count / 12;

  if (recentDates.length > 0) {
    const latest = recentDates[recentDates.length - 1];
    const earliest = recentDates[0];
    const spanDays = Math.max(30, (latest.getTime() - earliest.getTime()) / DAY_IN_MS + 1);
    const recentPostsPerMonth = recentDates.length / (spanDays / 30);
    postsPerMonth = Math.max(postsPerMonth, recentPostsPerMonth);

    const daysSinceLastPost = (now - latest.getTime()) / DAY_IN_MS;

    if (daysSinceLastPost > 120) {
      score -= 40;
      reasons.push('Sem posts recentes (>=120 dias)');
    } else if (daysSinceLastPost > 60) {
      score -= 25;
      reasons.push('Último post há mais de 60 dias');
    } else if (daysSinceLastPost > 30) {
      score -= 15;
      reasons.push('Último post há mais de 30 dias');
    } else if (daysSinceLastPost <= 14) {
      score += 10;
      reasons.push('Postou nas últimas 2 semanas');
    } else {
      score += 5;
      reasons.push('Postou no último mês');
    }

    const postsInLast90Days = recentDates.filter(date => now - date.getTime() <= 90 * DAY_IN_MS).length;
    if (postsInLast90Days === 0) {
      score -= 35;
      reasons.push('Nenhum post nos últimos 90 dias');
    } else if (postsInLast90Days >= 6) {
      score += 10;
      reasons.push('>=6 posts nos últimos 90 dias');
    } else if (postsInLast90Days <= 2) {
      score -= 10;
      reasons.push('Poucos posts nos últimos 90 dias');
    }
  } else {
    score -= 10;
    reasons.push('Posts recentes indisponíveis');
  }

  if (postsPerMonth < 1) {
    score -= 25;
    reasons.push(`Baixa frequência média: ${postsPerMonth.toFixed(1)} posts/mês`);
  } else if (postsPerMonth >= 4) {
    score += 10;
    reasons.push(`Alta atividade: ${postsPerMonth.toFixed(1)} posts/mês`);
  }

  if (profile.followers_count > profile.posts_count * 100 && profile.posts_count < 50) {
    score -= 25;
    reasons.push('Muitos seguidores para poucos posts (possível compra)');
  }

  if (!profile.bio || profile.bio.length < 10) {
    score -= 10;
    reasons.push('Bio vazia ou muito curta');
  } else {
    score += 5;
    reasons.push('Bio completa');
  }

  if (profile.is_business_account && !profile.email && !profile.phone) {
    score -= 15;
    reasons.push('Conta business sem contato público');
  }

  if (profile.is_verified) {
    score += 15;
    reasons.push('Conta verificada');
  }

  if (profile.followers_count < 100) {
    score -= 20;
    reasons.push('Poucos seguidores (<100)');
  }

  if (profile.following_count > profile.followers_count * 2 && profile.followers_count > 100) {
    score -= 10;
    reasons.push('Following >> Followers (comportamento suspeito)');
  }

  score = Math.max(0, Math.min(100, score));

  return {
    isActive: score >= 50,
    score,
    postsPerMonth,
    reasons
  };
}

/**
 * Extrai hashtags clicando nos posts do perfil
 * IMPORTANTE: Esta função requer uma página do Puppeteer já navegada para o perfil do Instagram
 *
 * @param page - Instância da página do Puppeteer
 * @param maxPosts - Máximo de posts para clicar (padrão: 4)
 * @returns Array de hashtags únicas extraídas dos posts ou null se nenhuma encontrada
 */
export async function extractHashtagsFromPosts(page: any, maxPosts: number = 4): Promise<string[] | null> {
  try {
    console.log(`   🔍 Clicando nos últimos ${maxPosts} posts para extrair hashtags (6s por post)...`);

    const allHashtags = new Set<string>();
    const profileUrl = page.url();

    // Aguardar o grid de posts carregar
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Clicar nos últimos N posts
    for (let i = 0; i < maxPosts; i++) {
      try {
        // Voltar para a página do perfil se não for a primeira iteração
        if (i > 0) {
          await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Tentar múltiplos seletores para encontrar posts no grid
        const postSelectors = [
          'a[href*="/p/"]',
          'article a[href*="/p/"]',
          'main a[href*="/p/"]',
          'div[role="button"] a[href*="/p/"]'
        ];

        let postClicked = false;

        for (const selector of postSelectors) {
          const postCount = await page.evaluate((sel: string) => {
            return document.querySelectorAll(sel).length;
          }, selector);

          if (postCount > 0) {
            // CLICAR diretamente no post (não usar goto)
            const clicked = await page.evaluate((sel: string, index: number) => {
              const posts = Array.from(document.querySelectorAll(sel));
              if (posts.length > index) {
                const post = posts[index] as HTMLElement;
                post.click();
                return true;
              }
              return false;
            }, selector, i);

            if (clicked) {
              console.log(`   🖱️  Clique no post ${i + 1}/${maxPosts} realizado`);
              postClicked = true;
              await new Promise(resolve => setTimeout(resolve, 6000)); // 6 SEGUNDOS por post
              break;
            }
          }
        }

        if (!postClicked) {
          console.log(`   ⚠️  Nenhum post encontrado para clicar (tentativa ${i + 1})`);
          break;
        }

        // Extrair hashtags da legenda do post (no modal aberto)
        const postHashtags = await page.evaluate(() => {
          const captionSelectors = [
            'article h1',
            'article span[dir="auto"]',
            'div[class*="Caption"] span',
            'article div span'
          ];

          let captionText = '';
          for (const selector of captionSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of Array.from(elements)) {
              const text = el.textContent || '';
              if (text.includes('#') && text.length > 0) {
                captionText += ' ' + text;
              }
            }
          }

          const hashtagPattern = /#([a-zA-Z0-9_áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]+)/g;
          const matches = captionText.match(hashtagPattern);

          if (!matches || matches.length === 0) {
            return [];
          }

          const uniqueHashtags = [...new Set(matches.map(tag => tag.substring(1).toLowerCase()))];
          return uniqueHashtags;
        });

        if (postHashtags.length > 0) {
          const beforeCount = allHashtags.size;
          postHashtags.forEach(tag => allHashtags.add(tag));
          const newUnique = allHashtags.size - beforeCount;
          console.log(`   🏷️  Post ${i + 1}: ${postHashtags.length} hashtags (${newUnique} únicas novas) - Total acumulado: ${allHashtags.size}`);
        } else {
          console.log(`   ⚠️  Nenhuma hashtag no post ${i + 1}`);
        }

        // Fechar o modal (ESC ou clique fora)
        await page.keyboard.press('Escape');
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (postError: any) {
        console.log(`   ⚠️  Erro ao processar post ${i + 1}: ${postError.message}`);
        // Tentar fechar modal se houver erro
        try {
          await page.keyboard.press('Escape');
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch {}
        continue;
      }
    }

    const finalHashtags = Array.from(allHashtags);

    // Se não encontrou nenhuma hashtag, retorna null
    if (finalHashtags.length === 0) {
      console.log(`   📊 Nenhuma hashtag encontrada - retornando null`);
      return null;
    }

    console.log(`   📊 Total de hashtags únicas extraídas: ${finalHashtags.length}`);
    console.log(`   🏷️  Hashtags: ${finalHashtags.slice(0, 10).join(', ')}${finalHashtags.length > 10 ? '...' : ''}`);
    return finalHashtags;

  } catch (error: any) {
    console.log(`   ⚠️  Erro ao extrair hashtags dos posts: ${error.message}`);
    return null;
  }
}
