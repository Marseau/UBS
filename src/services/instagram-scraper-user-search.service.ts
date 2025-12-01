// @ts-nocheck - Código usa window/document dentro de page.evaluate() (contexto browser)
import { Page } from 'puppeteer';
import { detectLanguage } from './language-country-detector.service';
import { getLoggedUsername } from './instagram-session.service';
import {
  calculateActivityScore,
  extractEmailFromBio,
  extractHashtags,
  parseInstagramCount,
  extractHashtagsFromPosts
} from './instagram-profile.utils';
import { createIsolatedContext } from './instagram-context-manager.service';
import { createClient } from '@supabase/supabase-js';

// Supabase client para salvar perfis imediatamente
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export { closeBrowser } from './instagram-session.service';

/**
 * Interface para dados completos do perfil Instagram
 */
export interface InstagramProfileData {
  username: string;
  full_name: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
  profile_pic_url: string | null;
  is_business_account: boolean;
  is_verified: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  business_category: string | null;
  // Campos de localização (business accounts)
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  zip_code?: string | null;
  activity_score?: number; // Score de atividade (0-100)
  is_active?: boolean; // Se a conta está ativa
  recent_post_dates?: string[]; // ISO strings dos posts mais recentes
  language?: string; // ISO 639-1 language code (pt, en, es, etc)
  hashtags_bio?: string[]; // Hashtags extraídas da bio (max 10)
  hashtags_posts?: string[]; // Top 10 hashtags dos posts recentes
  search_term_used?: string | null; // Termo de busca usado para encontrar este perfil
}

/**
 * Sanitiza dados para inserção no banco (similar ao toSQL do N8N)
 * Garante que valores vazios viram NULL e limita tamanhos de campos
 */
function sanitizeForDatabase(profile: any): any {
  const sanitize = (value: any, maxLength?: number): any => {
    // NULL, undefined ou string vazia → null
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // String - limitar tamanho se especificado
    if (typeof value === 'string' && maxLength) {
      return value.substring(0, maxLength);
    }

    return value;
  };

  return {
    username: sanitize(profile.username),
    full_name: sanitize(profile.full_name),
    bio: sanitize(profile.bio),
    profile_pic_url: sanitize(profile.profile_pic_url),
    is_business_account: profile.is_business_account,
    is_verified: profile.is_verified,
    followers_count: profile.followers_count,
    following_count: profile.following_count,
    posts_count: profile.posts_count,
    email: sanitize(profile.email),
    phone: sanitize(profile.phone),
    website: sanitize(profile.website),
    business_category: sanitize(profile.business_category),
    city: sanitize(profile.city, 100), // MAX 100 caracteres
    state: sanitize(profile.state, 2), // MAX 2 caracteres
    neighborhood: sanitize(profile.neighborhood, 100), // MAX 100 caracteres
    activity_score: profile.activity_score || 0,
    is_active: profile.is_active,
    language: sanitize(profile.language, 10), // MAX 10 caracteres
    hashtags_bio: profile.hashtags_bio || null,
    hashtags_posts: profile.hashtags_posts || null,
    search_term_used: sanitize(profile.search_term_used)
  };
}

/**
 * Delay aleatório para simular comportamento humano (2-5 segundos)
 */
async function humanDelay(): Promise<void> {
  const delay = 2000 + Math.random() * 3000;
  console.log(`   ⏳ Aguardando ${(delay / 1000).toFixed(1)}s (delay humano)...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Delay maior entre ações críticas para evitar detecção de bot (3-5 segundos)
 */
async function antiDetectionDelay(): Promise<void> {
  const delay = 3000 + Math.random() * 2000;
  console.log(`   🛡️  Delay anti-detecção: ${(delay / 1000).toFixed(1)}s...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Busca usernames utilizando o endpoint interno de busca do Instagram
 */
async function fetchSearchUsernamesViaApi(page: Page, searchTerm: string, maxResults: number): Promise<string[]> {
  return page.evaluate(
    async (term, limit) => {
      try {
        const response = await fetch(
          `https://www.instagram.com/web/search/topsearch/?context=blended&query=${encodeURIComponent(term)}&include_reel=true`,
          {
            credentials: 'same-origin',
            headers: {
              'x-requested-with': 'XMLHttpRequest'
            }
          }
        );

        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }

        const json = await response.json();
        const usernames: string[] = [];

        if (Array.isArray(json?.users)) {
          for (const entry of json.users) {
            const username = entry?.user?.username;
            if (typeof username === 'string' && username.length > 0) {
              usernames.push(username);
              if (usernames.length >= limit) break;
            }
          }
        }

        return usernames;
      } catch (apiError) {
        console.error('fetchSearchUsernamesViaApi error', apiError);
        return [];
      }
    },
    searchTerm,
    maxResults
  );
}

/**
 * Fallback: extrai usernames diretamente do modal de busca
 */
async function extractUsernamesFromSearchDialog(page: Page, maxResults: number): Promise<string[]> {
  return page.evaluate((limit) => {
    const usernames: string[] = [];
    const seen = new Set<string>();
    const excludedPages = new Set(['explore', 'direct', 'reels', 'accounts', 'stories', 'nametag', 'igtv']);

    const containers = [
      document.querySelector('div[role="dialog"] ul[role="listbox"]'),
      document.querySelector('div[role="dialog"] div[role="listbox"]'),
      document.querySelector('div[role="dialog"] section[role="presentation"]'),
      document.querySelector('div[role="dialog"]')
    ].filter((el): el is Element => !!el);

    const processLinks = (elements: Element[]) => {
      for (const el of elements) {
        if (usernames.length >= limit) break;

        const link = el instanceof HTMLAnchorElement ? el : el.closest<HTMLAnchorElement>('a[href^="/"]');
        if (!link) continue;

        const href = link.getAttribute('href');
        if (!href) continue;

        const match = href.match(/^\/([a-zA-Z0-9._]+)\/?$/);
        if (!match || !match[1]) continue;

        const username = match[1];
        if (excludedPages.has(username) || seen.has(username)) continue;

        // Garantir que é um resultado com avatar + texto
        const hasAvatar = !!link.querySelector('img');
        const hasText = (link.textContent || '').trim().length > 0;
        if (!hasAvatar || !hasText) continue;

        seen.add(username);
        usernames.push(username);
      }
    };

    for (const container of containers) {
      const items = Array.from(
        container.querySelectorAll('a[href^="/"][role="link"], div[role="none"] a[href^="/"], div[role="option"] a[href^="/"]')
      );
      processLinks(items);
      if (usernames.length >= limit) break;
    }

    if (usernames.length < limit) {
      const fallback = Array.from(document.querySelectorAll('div[role="dialog"] a[href^="/"]'));
      processLinks(fallback);
    }

    return usernames.slice(0, limit);
  }, maxResults);
}

/**
 * Busca usuários do Instagram via campo de busca
 * Retorna apenas usuários com activity_score >= 50 (a menos que skipValidations = true)
 *
 * @param searchTerm - Termo de busca (ex: "gestor de tráfego")
 * @param maxProfiles - Máximo de perfis validados a retornar (padrão: 5)
 * @param skipValidations - Se true, ignora validações de idioma e activity score (padrão: false)
 */
export async function scrapeInstagramUserSearch(
  searchTerm: string,
  maxProfiles: number = 5,
  skipValidations: boolean = false
): Promise<InstagramProfileData[]> {
  const { page, requestId, cleanup } = await createIsolatedContext();
  console.log(`🔒 Request ${requestId} iniciada para scrape-users: "${searchTerm}"`);
  try {
    console.log(`🔍 Buscando usuários para termo: "${searchTerm}"`);

    // 1. IR PARA PÁGINA INICIAL
    console.log(`🏠 Navegando para página inicial...`);
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 120000 });
    await humanDelay();

    // 2. ABRIR CAMPO DE BUSCA
    console.log(`🔍 Abrindo campo de busca...`);
    const searchPanelOpened = await page.evaluate(() => {
      const icon = document.querySelector('svg[aria-label="Pesquisar"], svg[aria-label="Search"]');
      if (!icon) return false;
      const clickable = icon.closest('a, button, div[role="button"]');
      if (clickable instanceof HTMLElement) {
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

    // 3. AGUARDAR CAMPO DE BUSCA APARECER
    const searchInputSelector = 'input[placeholder*="Pesquis"], input[placeholder*="Search"], input[aria-label*="Pesquis"], input[aria-label*="Search"]';
    const searchInput = await page.waitForSelector(searchInputSelector, { timeout: 8000, visible: true }).catch(() => null);

    if (!searchInput) {
      throw new Error('Campo de busca não encontrado após 8 segundos');
    }

    // 4. LIMPAR E DIGITAR TERMO (letra por letra, como humano)
    console.log(`⌨️  Digitando "${searchTerm}"...`);
    await searchInput.evaluate((element: any) => {
      if (element instanceof HTMLInputElement) {
        element.focus();
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    for (const char of searchTerm) {
      await page.keyboard.type(char);
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 150));
    }

    console.log(`⏳ Aguardando sugestões de usuários...`);
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

    // 5. COLETAR USERNAMES (API + fallback DOM)
    console.log(`📋 Obtendo usernames dos resultados de busca...`);
    let searchResultUsernames = await fetchSearchUsernamesViaApi(page, searchTerm, maxProfiles);

    if (searchResultUsernames.length === 0) {
      console.log('   ⚠️  API de busca retornou vazio, tentando extrair do modal...');
      searchResultUsernames = await extractUsernamesFromSearchDialog(page, maxProfiles);
    }

    console.log(`   ✅ ${searchResultUsernames.length} resultados encontrados`);

    if (searchResultUsernames.length === 0) {
      console.log(`   ⚠️  Nenhum resultado encontrado para "${searchTerm}"`);
      return [];
    }

    // Usar os primeiros 5 resultados (os reais)
    const usernamesToProcess = searchResultUsernames;
    console.log(`   📊 Processando ${usernamesToProcess.length} perfis reais para validação...`);

    // 7. PROCESSAR CADA PERFIL SEQUENCIALMENTE (VIA URL)
    const validatedProfiles: InstagramProfileData[] = [];
    const processedUsernames = new Set<string>();

    for (const username of usernamesToProcess) {
      if (validatedProfiles.length >= maxProfiles) {
        console.log(`\n🎯 Meta atingida: ${maxProfiles} perfis validados`);
        break;
      }

      if (processedUsernames.has(username)) {
        console.log(`   ⏭️  @${username} já processado, pulando...`);
        continue;
      }

      const loggedUser = getLoggedUsername();
      if (loggedUser && username === loggedUser) {
        console.log(`   ⏭️  @${username} é o próprio usuário logado, pulando...`);
        processedUsernames.add(username);
        continue;
      }

      console.log(`\n   👤 Processando @${username}...`);
      processedUsernames.add(username);

      try {
        // Delay antes de navegar (simular tempo de leitura/decisão)
        const preNavigationDelay = 1500 + Math.random() * 2000; // 1.5-3.5s
        console.log(`   ⏳ Aguardando ${(preNavigationDelay / 1000).toFixed(1)}s antes de navegar...`);
        await new Promise(resolve => setTimeout(resolve, preNavigationDelay));

        // Navegar para o perfil via URL
        await page.goto(`https://www.instagram.com/${username}/`, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        // Delay após carregar página (simular leitura do perfil)
        await antiDetectionDelay();

        // CRÍTICO: Clicar no botão "... mais" para expandir bio completa (se existir)
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
            console.log(`   ✅ Botão "mais" clicado - bio expandida`);
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        } catch (error: any) {
          // Silencioso - não é crítico se falhar
        }

        // Extrair dados do perfil (estratégia multi-seletor para robustez)
        const profileData = await page.evaluate(() => {
          // FULL NAME: Múltiplas estratégias de extração
          let full_name = '';
          const fullNameSelectors = [
            'header section h1',  // Novo seletor primário
            'header section h2',  // Backup
            'header div[class] h1',
            'header div[class] h2',
            'header section span[class]:not([role])',
            'main header section div span'
          ];

          for (const selector of fullNameSelectors) {
            const el = document.querySelector(selector);
            if (el && el.textContent) {
              const text = el.textContent.trim();
              // Validar que não é username (não começa com @)
              if (text && !text.startsWith('@') && text.length > 1 && text.length < 100) {
                full_name = text;
                break;
              }
            }
          }

          // BIO: Múltiplos seletores (atualizados para capturar bio expandida)
          let bio = '';
          const bioSelectors = [
            'header section h1._ap3a._aaco._aacu._aacx._aad6._aade',  // Container principal da bio
            'header section span._ap3a._aaco._aacu._aacx._aad6._aade', // Texto da bio dentro do span
            'header section div > span._ap3a',                         // Span direto dentro de div
            'header section div[style*="white-space"]',                 // Div com estilo de quebra de linha
            'header section h1 > span',                                 // Span dentro do h1
            'header section div[data-testid]',                          // Fallback com data-testid
            'header section span._ap3a'                                 // Fallback genérico
          ];

          for (const selector of bioSelectors) {
            const el = document.querySelector(selector);
            if (el && el.textContent && el.textContent.trim().length > 5) {
              bio = el.textContent.trim();
              break;
            }
          }

          // STATS: Extração robusta de seguidores/posts
          const stats: string[] = [];
          const selectors = [
            'header section ul li span',
            'header section ul li button span',
            'header section ul li a span',
            'header section ul span',
            'header ul li span',
            'header span[class*="x"]'
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const text = el.textContent?.trim();
              if (text && /\d/.test(text) && text.length < 20) {
                if (!stats.includes(text)) {
                  stats.push(text);
                }
              }
            });
            if (stats.length >= 3) break;
          }

          // PROFILE PIC
          const profilePicEl = document.querySelector('header img') as HTMLImageElement;
          const profile_pic_url = profilePicEl ? profilePicEl.src : '';

          // BUSINESS ACCOUNT & VERIFIED
          const isBusiness = document.body.innerHTML.includes('business_account') ||
                             document.body.innerHTML.includes('Category') ||
                             !!document.querySelector('header section a[href*="mailto"]') ||
                             !!document.querySelector('header section a[href*="tel:"]');
          const isVerified = !!document.querySelector('svg[aria-label="Verified"]') ||
                             !!document.querySelector('svg[aria-label="Verificado"]');

          // EMAIL: Múltiplas estratégias
          let email: string | null = null;

          // Estratégia 1: Link mailto no header
          const mailtoLink = document.querySelector('header a[href^="mailto:"]');
          if (mailtoLink) {
            const href = mailtoLink.getAttribute('href');
            if (href) {
              email = href.replace('mailto:', '').split('?')[0];
            }
          }

          // Estratégia 2: Regex no HTML (backup)
          if (!email) {
            const emailMatch = document.body.innerHTML.match(/mailto:([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
            email = emailMatch ? emailMatch[1] : null;
          }

          // Estratégia 3: Regex na bio
          if (!email && bio) {
            const bioEmailMatch = bio.match(/\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+\b/);
            email = bioEmailMatch ? bioEmailMatch[0] : null;
          }

          // PHONE: Extração de telefone
          let phone: string | null = null;

          // Estratégia 1: Link tel: no header
          const telLink = document.querySelector('header a[href^="tel:"]');
          if (telLink) {
            const href = telLink.getAttribute('href');
            if (href) {
              phone = href.replace('tel:', '').replace(/\s/g, '');
            }
          }

          // Estratégia 2: Regex no HTML
          if (!phone) {
            const phoneMatch = document.body.innerHTML.match(/tel:([+\d\s()-]+)/);
            phone = phoneMatch ? phoneMatch[1].replace(/\s/g, '') : null;
          }

          // Estratégia 3: Padrões de telefone na bio
          if (!phone && bio) {
            const phonePatterns = [
              /\+?\d{2}\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}/,  // Brasil: +55 (11) 99999-9999
              /\(?\d{2,3}\)?\s?\d{4,5}-?\d{4}/,           // Local: (11) 99999-9999
              /\+\d{1,3}\s?\d{8,14}/,                      // Internacional
              /whatsapp:?\s*\+?\d[\d\s()-]{8,}/i          // WhatsApp na bio
            ];

            for (const pattern of phonePatterns) {
              const match = bio.match(pattern);
              if (match) {
                phone = match[0].replace(/\D+/g, '');  // Apenas dígitos
                break;
              }
            }
          }

          // WEBSITE
          const websiteEl = document.querySelector('header section a[href^="http"]');
          const website = websiteEl ? websiteEl.getAttribute('href') : null;

          return {
            full_name,
            bio,
            stats,
            profile_pic_url,
            is_business_account: isBusiness,
            is_verified: isVerified,
            email,
            phone,
            website
          };
        });

        const posts_count = profileData.stats[0] ? parseInstagramCount(profileData.stats[0]) : 0;
        const followers_count = profileData.stats[1] ? parseInstagramCount(profileData.stats[1]) : 0;
        const following_count = profileData.stats[2] ? parseInstagramCount(profileData.stats[2]) : 0;

        const completeProfile: InstagramProfileData = {
          username: username,
          full_name: profileData.full_name || null,
          bio: profileData.bio || null,
          followers_count: followers_count,
          following_count: following_count,
          posts_count: posts_count,
          profile_pic_url: profileData.profile_pic_url || null,
          is_business_account: profileData.is_business_account,
          is_verified: profileData.is_verified,
          email: profileData.email,
          phone: null,
          website: profileData.website,
          business_category: null,
          search_term_used: searchTerm // Termo de busca usado para encontrar este perfil
        };

        // Extrair email da bio se não tiver email público
        if (!completeProfile.email && completeProfile.bio) {
          const emailFromBio = extractEmailFromBio(completeProfile.bio);
          if (emailFromBio) {
            completeProfile.email = emailFromBio;
          }
        }

        // EXTRAIR HASHTAGS DA BIO
        if (completeProfile.bio) {
          const bioHashtags = extractHashtags(completeProfile.bio, 10);
          if (bioHashtags.length > 0) {
            completeProfile.hashtags_bio = bioHashtags;
            console.log(`   🏷️  Hashtags da bio (${bioHashtags.length}): ${bioHashtags.join(', ')}`);
          }
        }

        // ========================================
        // VALIDAÇÃO 0: VERIFICAR SE PERFIL JÁ EXISTE NO BANCO (ANTES DE TODAS AS VALIDAÇÕES)
        // ========================================
        console.log(`   🔍 Verificando se @${username} já existe no banco de dados...`);
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL || '',
          process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        );

        const { data: existingLead } = await supabase
          .from('instagram_leads')
          .select('username')
          .eq('username', username)
          .single();

        if (existingLead) {
          console.log(`   ⏭️  @${username} JÁ EXISTE no banco! Pulando TODAS as validações e extração de hashtags...`);
          continue;
        }

        console.log(`   ✅ @${username} não existe no banco. Prosseguindo com validações...`);

        // ========================================
        // VALIDAÇÃO ANTES DE CLICAR NOS POSTS
        // ========================================

        // CALCULAR ACTIVITY SCORE (SEM HASHTAGS DOS POSTS)
        const activityScore = calculateActivityScore(completeProfile);
        completeProfile.activity_score = activityScore.score;
        completeProfile.is_active = activityScore.isActive;

        console.log(`   📊 Activity Score: ${activityScore.score}/100 (${activityScore.isActive ? 'ATIVA ✅' : 'INATIVA ❌'})`);
        console.log(`   📈 ${activityScore.postsPerMonth.toFixed(1)} posts/mês`);
        if (activityScore.reasons.length > 0) {
          console.log(`   💡 Razões: ${activityScore.reasons.join(', ')}`);
        }

        // VALIDAÇÃO 1: Activity Score >= 50 (apenas se validações ativas)
        if (!skipValidations && !activityScore.isActive) {
          console.log(`   ❌ Perfil rejeitado por baixo activity score - PULANDO extração de hashtags dos posts`);
          continue;
        }

        // VALIDAÇÃO 2: Idioma = Português (apenas se validações ativas)
        console.log(`   🌍 Detectando idioma da bio...`);
        const languageDetection = await detectLanguage(completeProfile.bio, completeProfile.username);
        completeProfile.language = languageDetection.language;
        console.log(`   🎯 Idioma detectado: ${languageDetection.language} (${languageDetection.confidence})`);

        if (!skipValidations && languageDetection.language !== 'pt') {
          console.log(`   ❌ Perfil rejeitado por idioma não-português (${languageDetection.language}) - PULANDO extração de hashtags dos posts`);
          continue;
        }

        // ========================================
        // PERFIL PASSOU NAS VALIDAÇÕES - EXTRAIR HASHTAGS DOS POSTS
        // ========================================
        console.log(`   ✅ Perfil aprovado - Iniciando extração de hashtags dos posts...`);

        // LOG DETALHADO DOS DADOS EXTRAÍDOS
        console.log(`\n   📊 DADOS EXTRAÍDOS:`);
        console.log(`   👤 Username: @${completeProfile.username}`);
        console.log(`   👤 Full Name: ${completeProfile.full_name || 'N/A'}`);
        console.log(`   📝 Bio: ${completeProfile.bio ? (completeProfile.bio.length > 80 ? completeProfile.bio.substring(0, 80) + '...' : completeProfile.bio) : 'N/A'}`);
        console.log(`   🔗 Website: ${completeProfile.website || 'N/A'}`);
        console.log(`   📧 Email: ${completeProfile.email || 'N/A'}`);
        console.log(`   📱 Telefone: ${completeProfile.phone || 'N/A'}`);
        console.log(`   📍 Localização: ${completeProfile.city ? `${completeProfile.city}, ${completeProfile.state || ''}` : 'N/A'}`);
        console.log(`   🏠 Endereço: ${completeProfile.address || 'N/A'}`);
        console.log(`   📮 CEP: ${completeProfile.zip_code || 'N/A'}`);
        console.log(`   💼 Categoria: ${completeProfile.business_category || 'N/A'}`);
        console.log(`   📊 Seguidores: ${completeProfile.followers_count} | Posts: ${completeProfile.posts_count}`);
        console.log(`   ✅ Activity Score: ${completeProfile.activity_score}/100 ${completeProfile.is_active ? '(ATIVA ✅)' : '(INATIVA ❌)'}\n`);

        const postsHashtags = await extractHashtagsFromPosts(page, 2);
        if (postsHashtags && postsHashtags.length > 0) {
          completeProfile.hashtags_posts = postsHashtags;
          console.log(`   🏷️  Top hashtags dos posts (${postsHashtags.length}): ${postsHashtags.join(', ')}`);
        } else {
          completeProfile.hashtags_posts = null;
          console.log(`   ⚠️  Nenhuma hashtag encontrada nos posts`);
        }

        // 💾 SALVAR NO BANCO IMEDIATAMENTE (não acumular em memória)
        try {
          // Converter activity_score (0-100) para lead_score (0-1)
          const leadScore = completeProfile.activity_score ? completeProfile.activity_score / 100 : null;

          // Remover campos que não existem no banco
          const { recent_post_dates, ...profileData } = completeProfile;

          // Sanitizar dados (similar ao toSQL do N8N)
          const sanitizedProfile = sanitizeForDatabase(profileData);

          // Adicionar campos adicionais necessários para o banco
          const profileToSave = {
            ...sanitizedProfile,
            captured_at: new Date().toISOString(),
            lead_source: 'user_search',
            lead_score: leadScore,
            // segment e search_term_id podem ser NULL para scraping manual
            segment: null,
            search_term_id: null
          };
          // phones_normalized será preenchido pelo trigger trg_normalize_instagram_lead()

          const { error: insertError } = await supabase
            .from('instagram_leads')
            .insert(profileToSave);

          if (insertError) {
            console.log(`   ⚠️  Erro ao salvar @${username} no banco: ${insertError.message}`);
          } else {
            console.log(`   ✅ Perfil @${username} SALVO NO BANCO`);
          }
        } catch (dbError: any) {
          console.log(`   ⚠️  Erro ao salvar @${username}: ${dbError.message}`);
        }

        // PERFIL APROVADO NAS 2 VALIDAÇÕES + HASHTAGS EXTRAÍDAS
        validatedProfiles.push(completeProfile);
        console.log(`   ✅ Perfil validado e adicionado (${validatedProfiles.length}/${maxProfiles})`);

        // Delay após análise (simular tempo de decisão)
        const postAnalysisDelay = 1000 + Math.random() * 2000; // 1-3s
        console.log(`   ⏱️  Pausa de ${(postAnalysisDelay / 1000).toFixed(1)}s após análise...`);
        await new Promise(resolve => setTimeout(resolve, postAnalysisDelay));

      } catch (profileError: any) {
        console.log(`   ⚠️  Erro ao processar @${username}: ${profileError.message}`);

        // Se for detached frame, Instagram detectou scraping → ENCERRAR IMEDIATAMENTE
        if (profileError.message.includes('detached Frame')) {
          console.log(`\n🚨 DETACHED FRAME DETECTADO - Instagram detectou scraping`);
          console.log(`   💾 Perfis já salvos no banco: ${validatedProfiles.length}`);
          console.log(`   🛑 ENCERRANDO SESSÃO IMEDIATAMENTE (sem retry)`);
          break; // Sai do loop, retorna perfis salvos
        }

        // Delay mesmo em caso de erro (para não parecer bot)
        const errorDelay = 2000 + Math.random() * 1500; // 2-3.5s
        await new Promise(resolve => setTimeout(resolve, errorDelay));
        continue;
      }

      // Delay extra entre perfis (simular navegação humana)
      if (validatedProfiles.length < maxProfiles && processedUsernames.size < usernamesToProcess.length) {
        const betweenProfilesDelay = 2000 + Math.random() * 3000; // 2-5s
        console.log(`   🕐 Intervalo de ${(betweenProfilesDelay / 1000).toFixed(1)}s antes do próximo perfil...`);
        await new Promise(resolve => setTimeout(resolve, betweenProfilesDelay));
      }
    }

    console.log(`\n✅ Busca concluída: ${validatedProfiles.length} perfis validados de ${processedUsernames.size} processados`);

    if (validatedProfiles.length > 0) {
      const usernames = validatedProfiles.map(p => `@${p.username} (${p.activity_score}/100)`).join(', ');
      console.log(`👥 Perfis validados (apenas PT): ${usernames}`);
    }

    console.log(`✅ SCRAPE-USERS CONCLUÍDO: ${validatedProfiles.length} perfis validados para "${searchTerm}"`);
    return validatedProfiles;

  } catch (error: any) {
    console.error(`❌ Erro na busca de usuários "${searchTerm}":`, error.message);
    throw error;
  } finally {
    console.log(`🔓 Request ${requestId} finalizada (scrape-users: "${searchTerm}")`);
    await cleanup();
    console.log(`🏁 SCRAPE-USERS ENCERRADO COMPLETAMENTE: "${searchTerm}" - Request ${requestId}`);
  }
}
