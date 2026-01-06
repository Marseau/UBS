// @ts-nocheck - utilidades compartilhadas para análise de perfis Instagram

/**
 * Normaliza uma hashtag removendo acentos e convertendo para minúsculas
 * Garante consistência no banco de dados e Parquet
 *
 * @param hashtag - Hashtag com ou sem # no início
 * @returns Hashtag normalizada (sem acentos, lowercase, sem #)
 */
export function normalizeHashtag(hashtag: string): string {
  if (!hashtag) return '';

  // Remover # se presente
  let normalized = hashtag.startsWith('#') ? hashtag.substring(1) : hashtag;

  // Mapa de acentos para caracteres ASCII
  const accentMap: Record<string, string> = {
    'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'ç': 'c', 'ñ': 'n',
    'Á': 'a', 'À': 'a', 'Â': 'a', 'Ã': 'a', 'Ä': 'a', 'Å': 'a',
    'É': 'e', 'È': 'e', 'Ê': 'e', 'Ë': 'e',
    'Í': 'i', 'Ì': 'i', 'Î': 'i', 'Ï': 'i',
    'Ó': 'o', 'Ò': 'o', 'Ô': 'o', 'Õ': 'o', 'Ö': 'o',
    'Ú': 'u', 'Ù': 'u', 'Û': 'u', 'Ü': 'u',
    'Ç': 'c', 'Ñ': 'n'
  };

  // Substituir acentos
  normalized = normalized.split('').map(char => accentMap[char] || char).join('');

  // Converter para minúsculas
  normalized = normalized.toLowerCase();

  // Remover caracteres inválidos (manter apenas a-z, 0-9, _)
  normalized = normalized.replace(/[^a-z0-9_]/g, '');

  return normalized;
}

/**
 * Retry mechanism com backoff exponencial para operações propensas a timeout
 * @param fn - Função assíncrona para executar
 * @param maxRetries - Número máximo de tentativas (padrão: 3)
 * @param baseDelay - Delay base em ms para backoff (padrão: 2000ms)
 * @returns Promise com resultado da função ou erro após todas as tentativas
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const isLastAttempt = attempt === maxRetries - 1;

      if (isLastAttempt) {
        console.log(`   ❌ Todas as ${maxRetries} tentativas falharam. Último erro: ${lastError.message}`);
        throw lastError;
      }

      // Backoff exponencial: 2s, 4s, 8s...
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`   ⏳ Tentativa ${attempt + 1}/${maxRetries} falhou (${lastError.message}). Retry em ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Retry failed without error');
}

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
  website: string | null; // 🔧 ADICIONADO - Campo faltante!
  is_verified: boolean;
  recent_post_dates?: string[] | null;
}

/**
 * Converte contadores do Instagram (ex: "6 mil", "1.187 seguidores") em número inteiro
 *
 * Formatos suportados:
 * - "1.187 seguidores" → 1187 (BR: ponto como separador de milhar)
 * - "7.522 seguidores" → 7522
 * - "6 mil" → 6000
 * - "93.2K" → 93200 (US: ponto como decimal + multiplicador)
 * - "1,5 mi" → 1500000
 */
export function parseInstagramCount(value: string | null): number {
  if (!value) return 0;

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return 0;
  }

  // Multiplicadores conhecidos do Instagram
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

  // Verificar se o sufixo é um multiplicador CONHECIDO
  const isKnownMultiplier = suffix in multiplierMap;
  const multiplier = multiplierMap[suffix] ?? 1;

  let numeric: number;

  // Se NÃO tem multiplicador conhecido (posts, seguidores, seguindo, etc)
  // → tratar pontos/vírgulas como separadores de milhares (formato BR)
  if (!isKnownMultiplier) {
    // "1.187 seguidores" → "1187" → 1187
    // "7.522" → "7522" → 7522
    const cleaned = numberPortion.replace(/[.,\s]/g, '');
    numeric = Number.parseInt(cleaned, 10);
  } else {
    // Tem multiplicador (k, mil, m, etc): Instagram usa formato US (ponto é decimal)
    // "93.2K" → 93.2 * 1000 = 93200
    // "1,5 mil" → 1.5 * 1000 = 1500
    // Substituir vírgula por ponto para parseFloat funcionar
    numeric = Number.parseFloat(numberPortion.replace(/,/g, '.').replace(/\s/g, ''));
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
 * Aplica normalização automática (remove acentos, lowercase)
 */
export function extractHashtags(text: string | null, maxHashtags: number = 10): string[] {
  if (!text) return [];

  // Regex expandido para capturar hashtags com acentos
  const hashtagPattern = /#([a-zA-Z0-9_áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÇÑ]+)/g;
  const matches = text.match(hashtagPattern);

  if (!matches || matches.length === 0) return [];

  return matches
    .map(tag => normalizeHashtag(tag)) // Aplica normalização completa
    .filter(tag => tag.length > 0) // Remove vazios
    .filter((tag, index, self) => self.indexOf(tag) === index) // Remove duplicados
    .slice(0, maxHashtags);
}

/**
 * 🎯 SISTEMA DE VALIDAÇÃO SIMPLIFICADO PARA PERFIS B2C
 *
 * REGRA 1: TEM WEBSITE → APROVADO ✅
 *
 * REGRA 2: SEM WEBSITE → Precisa de:
 *   - Bio > 25 caracteres E
 *   - Followers > 100
 *   → APROVADO ✅
 *
 * Caso contrário → REJEITADO ❌
 */
export function calculateActivityScore(profile: ProfileForScoring): ActivityScore {
  const reasons: string[] = [];

  // REGRA 1: TEM WEBSITE OU BIO >= 100 → APROVAÇÃO AUTOMÁTICA
  const hasWebsite = profile.website && profile.website.length > 0;
  const hasLongBio = profile.bio && profile.bio.length >= 100;

  if (hasWebsite || hasLongBio) {
    if (hasWebsite && hasLongBio) {
      reasons.push('✅ WEBSITE + BIO >= 100 → APROVAÇÃO AUTOMÁTICA');
    } else if (hasWebsite) {
      reasons.push('✅ TEM WEBSITE → APROVAÇÃO AUTOMÁTICA');
    } else {
      reasons.push(`✅ BIO >= 100 (${profile.bio?.length} chars) → APROVAÇÃO AUTOMÁTICA`);
    }
    return {
      isActive: true,
      score: 100,
      postsPerMonth: 0,
      reasons
    };
  }

  // REGRA 2: SEM WEBSITE E BIO < 100 → Verifica Bio + Followers
  const hasBio = profile.bio && profile.bio.length > 25;
  const hasFollowers = profile.followers_count > 100;

  reasons.push(`Website: ❌`);
  reasons.push(`Bio >= 100: ❌ (${profile.bio?.length || 0} chars)`);
  reasons.push(`Bio > 25 chars: ${hasBio ? '✅' : '❌'} (${profile.bio?.length || 0} chars)`);
  reasons.push(`Followers > 100: ${hasFollowers ? '✅' : '❌'} (${profile.followers_count})`);

  const isApproved = hasBio && hasFollowers;

  if (isApproved) {
    reasons.push('✅ APROVADO - Bio + Followers');
  } else {
    reasons.push('❌ REJEITADO - Falta Bio>25 ou Followers>100');
  }

  return {
    isActive: isApproved,
    score: isApproved ? 75 : 0,
    postsPerMonth: 0,
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
    console.log(`   🔍 Clicando nos últimos ${maxPosts} posts para extrair hashtags (3s por post, timeout individual de 15s)...`);

    const allHashtags = new Set<string>();
    const profileUrl = page.url();

    // Aguardar o grid de posts carregar
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Clicar nos últimos N posts
    for (let i = 0; i < maxPosts; i++) {
      try {
        // Voltar para a página do perfil se não for a primeira iteração
        if (i > 0) {
          await Promise.race([
            page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 15000 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Navigation timeout')), 15000))
          ]).catch((err: Error) => {
            console.log(`   ⚠️  Timeout ao retornar ao perfil (post ${i + 1}): ${err.message}`);
            return null;
          });
          await new Promise(resolve => setTimeout(resolve, 1500));
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
          try {
            // Timeout individual para page.evaluate
            const postCount = await Promise.race([
              page.evaluate((sel: string) => {
                return document.querySelectorAll(sel).length;
              }, selector),
              new Promise<number>((_, reject) =>
                setTimeout(() => reject(new Error('Evaluate timeout')), 10000)
              )
            ]).catch(() => 0);

            if (postCount > 0) {
              // CLICAR diretamente no post (não usar goto) com timeout
              const clicked = await Promise.race([
                page.evaluate((sel: string, index: number) => {
                  const posts = Array.from(document.querySelectorAll(sel));
                  if (posts.length > index) {
                    const post = posts[index] as HTMLElement;
                    post.click();
                    return true;
                  }
                  return false;
                }, selector, i),
                new Promise<boolean>((_, reject) =>
                  setTimeout(() => reject(new Error('Click timeout')), 10000)
                )
              ]).catch(() => false);

              if (clicked) {
                console.log(`   🖱️  Clique no post ${i + 1}/${maxPosts} realizado`);
                postClicked = true;
                await new Promise(resolve => setTimeout(resolve, 3000)); // 3 SEGUNDOS por post (otimizado)
                break;
              }
            }
          } catch (selectorError) {
            console.log(`   ⚠️  Erro com seletor ${selector}: ${(selectorError as Error).message}`);
            continue;
          }
        }

        if (!postClicked) {
          console.log(`   ⚠️  Nenhum post encontrado para clicar (tentativa ${i + 1})`);
          break;
        }

        // Extrair hashtags da legenda do post (no modal aberto) com timeout
        const rawPostHashtags = await Promise.race([
          page.evaluate(() => {
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

            // Retorna hashtags brutas (com acentos) - normalização será feita no Node.js
            return [...new Set(matches.map(tag => tag.substring(1)))];
          }),
          new Promise<string[]>((_, reject) =>
            setTimeout(() => reject(new Error('Hashtag extraction timeout')), 10000)
          )
        ]).catch((err: Error) => {
          console.log(`   ⚠️  Erro ao extrair hashtags do post ${i + 1}: ${err.message}`);
          return [];
        });

        // Normalizar hashtags no Node.js (remove acentos, lowercase)
        const postHashtags = rawPostHashtags
          .map(tag => normalizeHashtag(tag))
          .filter(tag => tag.length > 0);

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
