// @ts-nocheck
/**
 * Instagram Followers Processing Service - NOVA ESTRATÉGIA
 *
 * Processa seguidores diretamente clicando em seus perfis
 * (evita usar search field que gera erro 429)
 *
 * Coleta EXATAMENTE IGUAL ao scraping normal:
 * - Valida followers > 250
 * - Valida idioma PT
 * - Valida activity score >= 50
 * - Visita 2 posts para extrair hashtags
 * - Extrai dados completos
 * - NÃO analisa audiência (pula 10K-300K)
 *
 * Fluxo:
 * 1. Abre modal de seguidores do perfil 10K-300K
 * 2. Para cada um dos 5 seguidores:
 *    - Clica no perfil
 *    - Executa scraping completo (igual ao normal)
 *    - Volta ao modal
 *    - Scroll
 *    - Próximo
 */

import { Page } from 'puppeteer';
import { InstagramProfileData } from '../types/instagram.types';

export interface ProcessedFollowerResult {
  success: boolean;
  competitor_username: string;
  total_processed: number;
  followers: InstagramProfileData[];
  error_message?: string;
}

/**
 * Delay humano
 */
async function humanDelay(min: number = 2000, max: number = 5000): Promise<void> {
  const delay = min + Math.random() * (max - min);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 🆕 GARANTIR QUE MODAL DE SEGUIDORES ESTÁ ABERTO
 * Critico: após goBack(), modal pode ter fechado
 */
async function ensureModalIsOpen(page: Page): Promise<void> {
  // Verificar se modal está aberto (múltiplos seletores)
  const modalStillOpen = await page.evaluate(() => {
    // Tentar diferentes seletores para detectar modal
    const dialog = document.querySelector('div[role="dialog"]');
    const modalHeader = document.querySelector('div:has(> div > div > span)');
    const followersModal = Array.from(document.querySelectorAll('span')).some(
      span => span.textContent === 'Seguidores' || span.textContent === 'Followers'
    );

    return dialog !== null || followersModal;
  });

  if (!modalStillOpen) {
    console.log(`   ⚠️  Modal fechou! Reabrindo...`);

    // Verificar se estamos na URL correta (página do perfil)
    const currentUrl = page.url();
    console.log(`   📍 URL atual: ${currentUrl}`);

    // Tentar reabrir modal com múltiplas estratégias
    const reopened = await page.evaluate(() => {
      // Estratégia 1: Link direto com texto "seguidores"
      const followersLinks = Array.from(document.querySelectorAll('a'));
      let followersLink = followersLinks.find(link => {
        const text = link.textContent?.toLowerCase() || '';
        return text.includes('seguidores') || text.includes('followers');
      });

      // Estratégia 2: Link com href contendo "/followers/"
      if (!followersLink) {
        followersLink = followersLinks.find(link =>
          link.href && link.href.includes('/followers/')
        );
      }

      // Estratégia 3: Procurar pelo número de seguidores (formato: "68,8 mil seguidores")
      if (!followersLink) {
        followersLink = followersLinks.find(link => {
          const text = link.textContent || '';
          return /\d+[\.,]?\d*\s*(mil|k|M)?\s*(seguidores|followers)/i.test(text);
        });
      }

      if (followersLink) {
        (followersLink as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (reopened) {
      await humanDelay(4000, 6000); // Delay maior para garantir que modal carregue
      console.log(`   ✅ Modal reaberto com sucesso`);

      // Verificar se realmente abriu
      const confirmed = await page.evaluate(() => {
        return document.querySelector('div[role="dialog"]') !== null;
      });

      if (!confirmed) {
        console.log(`   ⚠️  Modal não foi detectado após reabertura, mas continuando...`);
      }
    } else {
      console.log(`   ⚠️  Não foi possível encontrar botão de seguidores`);
      throw new Error('Não foi possível reabrir modal de seguidores');
    }
  } else {
    console.log(`   ✅ Modal ainda aberto`);
  }
}

/**
 * NOVA ESTRATÉGIA: Processar seguidores individualmente
 * Usa EXATAMENTE a mesma lógica de scraping do scrape-tag
 */
export async function processFollowersDirectly(
  competitorUsername: string,
  page: Page,
  maxFollowersToProcess: number = 5
): Promise<ProcessedFollowerResult> {
  console.log(`\n👥 NOVA ESTRATÉGIA: Processando seguidores individualmente...`);
  console.log(`   🎯 Perfil: @${competitorUsername}`);
  console.log(`   📊 Meta: processar ${maxFollowersToProcess} seguidores`);

  const processedFollowers: InstagramProfileData[] = [];
  let currentFollowerIndex = 0;

  try {
    // 1. Clicar no botão "seguidores" para abrir modal
    console.log(`\n   🖱️  Abrindo modal de seguidores...`);

    const followersButtonClicked = await page.evaluate(() => {
      const followersLink = Array.from(document.querySelectorAll('a'))
        .find(link => link.href && link.href.includes('/followers/'));

      if (followersLink) {
        (followersLink as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (!followersButtonClicked) {
      throw new Error('Botão de seguidores não encontrado');
    }

    console.log(`   ✅ Modal aberto`);
    await humanDelay(3000, 5000); // Aguardar modal carregar completamente

    // 2. Loop: processar 5 seguidores
    for (let i = 0; i < maxFollowersToProcess; i++) {
      console.log(`\n   ${'='.repeat(60)}`);
      console.log(`   [${i + 1}/${maxFollowersToProcess}] Processando seguidor...`);
      console.log(`   ${'='.repeat(60)}`);

      try {
        // 2a. Extrair username do seguidor visível no modal
        const followerUsername = await page.evaluate((skipCount: number) => {
          const modal = document.querySelector('div[role="dialog"]');
          if (!modal) return null;

          const followerLinks = Array.from(modal.querySelectorAll('a[href^="/"][href$="/"]'));

          // Pegar o seguidor na posição skipCount
          if (followerLinks.length > skipCount) {
            const link = followerLinks[skipCount];
            const href = link.getAttribute('href');
            if (href) {
              return href.replace(/\//g, ''); // Remove /
            }
          }
          return null;
        }, currentFollowerIndex);

        if (!followerUsername) {
          console.log(`   ⚠️  Não foi possível extrair username do seguidor ${currentFollowerIndex}, fazendo scroll...`);

          // Scroll no modal antes de continuar
          await page.evaluate(() => {
            const modal = document.querySelector('div[role="dialog"]');
            if (modal) {
              const allDivs = modal.querySelectorAll('div');
              for (const div of allDivs) {
                if (div.scrollHeight > div.clientHeight) {
                  div.scrollTop += 300;
                  break;
                }
              }
            }
          });

          await humanDelay(2000, 3000);
          currentFollowerIndex++;
          continue;
        }

        console.log(`   👤 Seguidor encontrado: @${followerUsername}`);

        // 2b. Clicar no perfil do seguidor
        const clickedFollower = await page.evaluate((username: string) => {
          const modal = document.querySelector('div[role="dialog"]');
          if (!modal) return false;

          const followerLinks = Array.from(modal.querySelectorAll('a[href^="/"][href$="/"]'));
          const targetLink = followerLinks.find((link: any) => {
            const href = link.getAttribute('href');
            return href && href.replace(/\//g, '') === username;
          });

          if (targetLink) {
            (targetLink as HTMLElement).click();
            return true;
          }
          return false;
        }, followerUsername);

        if (!clickedFollower) {
          console.log(`   ❌ Não foi possível clicar em @${followerUsername}`);
          currentFollowerIndex++;
          continue;
        }

        console.log(`   ✅ Clicou em @${followerUsername}, aguardando perfil carregar...`);

        // 🆕 DELAY MAIOR: Aguardar perfil carregar completamente (pode ser privado)
        await humanDelay(5000, 7000); // 5-7s para garantir que perfil privado carregue

        // 🆕 VERIFICAR SE É PERFIL PRIVADO (precisa de delay extra)
        const isPrivateProfile = await page.evaluate(() => {
          const privateMessage = document.body.innerText;
          return privateMessage.includes('Esta conta é privada') ||
                 privateMessage.includes('This Account is Private') ||
                 privateMessage.includes('Seguir para ver as publicações');
        });

        if (isPrivateProfile) {
          console.log(`   🔒 PERFIL PRIVADO DETECTADO - Pulando (não podemos validar)...`);
          await humanDelay(2000, 3000);
          await page.goBack();

          // 🆕 CRITICAL: Aguardar modal reaparecer e garantir que está aberto
          await humanDelay(4000, 6000);
          await ensureModalIsOpen(page);

          currentFollowerIndex++;
          continue;
        }

        // ========================================
        // 2c. SCRAPING COMPLETO (IGUAL AO NORMAL)
        // ========================================

        // Importar funções de scraping
        const { scrapeFullProfileData } = await import('./instagram-profile.utils');
        const { calculateActivityScore } = await import('./instagram-profile.utils');
        const { detectLanguage } = await import('./language-country-detector.service');
        const { extractHashtagsFromPosts } = await import('./instagram-profile.utils');

        // Extrair dados completos do perfil
        console.log(`   📊 Extraindo dados completos de @${followerUsername}...`);
        const profileData = await scrapeFullProfileData(page, followerUsername);

        if (!profileData) {
          console.log(`   ❌ Erro ao extrair dados de @${followerUsername}`);
          await page.goBack();
          await humanDelay(4000, 6000);
          await ensureModalIsOpen(page);
          currentFollowerIndex++;
          continue;
        }

        // VALIDAÇÃO 1: Followers > 250
        const followersCount = profileData.followers_count || 0;
        if (followersCount < 250) {
          console.log(`   🚫 REJEITADO (Validação 1/3): @${followerUsername} tem apenas ${followersCount} seguidores (mínimo: 250)`);
          await humanDelay(800, 2000);
          await page.goBack();
          await humanDelay(4000, 6000);
          await ensureModalIsOpen(page);
          currentFollowerIndex++;
          continue;
        }

        console.log(`   ✅ Validação 1/3: ${followersCount} seguidores`);

        // VALIDAÇÃO 2: Activity Score >= 50
        const activityScore = calculateActivityScore(profileData);
        console.log(`   📊 Activity Score: ${activityScore.score}/100 (${activityScore.isActive ? 'ATIVA ✅' : 'INATIVA ❌'})`);

        if (!activityScore.isActive) {
          console.log(`   🚫 REJEITADO (Validação 2/3): Activity score muito baixo (score: ${activityScore.score})`);
          await humanDelay(800, 2000);
          await page.goBack();
          await humanDelay(4000, 6000);
          await ensureModalIsOpen(page);
          currentFollowerIndex++;
          continue;
        }

        console.log(`   ✅ Validação 2/3: Activity score aprovado`);

        // VALIDAÇÃO 3: Idioma PT
        console.log(`   🌍 Detectando idioma da bio...`);
        const languageDetection = await detectLanguage(profileData.bio || '', followerUsername);
        console.log(`   🎯 Idioma detectado: ${languageDetection.language} (${languageDetection.confidence})`);

        if (languageDetection.language !== 'pt') {
          console.log(`   🚫 REJEITADO (Validação 3/3): Idioma não-português (${languageDetection.language})`);
          await humanDelay(800, 2000);
          await page.goBack();
          await humanDelay(4000, 6000);
          await ensureModalIsOpen(page);
          currentFollowerIndex++;
          continue;
        }

        console.log(`   ✅ Validação 3/3: Idioma português`);
        console.log(`\n   ✅ PERFIL APROVADO NAS 3 VALIDAÇÕES!`);

        // EXTRAIR HASHTAGS DOS 2 ÚLTIMOS POSTS
        console.log(`\n   📸 Visitando 2 posts para extrair hashtags...`);

        let postHashtags: string[] | null = null;
        try {
          postHashtags = await extractHashtagsFromPosts(page, 2);

          if (postHashtags && postHashtags.length > 0) {
            console.log(`   ✅ ${postHashtags.length} hashtags extraídas dos posts`);
          } else {
            console.log(`   ⚠️  Nenhuma hashtag encontrada nos posts`);
          }
        } catch (hashtagError: any) {
          console.log(`   ⚠️  Erro ao extrair hashtags: ${hashtagError.message}`);
          postHashtags = null;
        }

        // Montar objeto completo (IGUAL AO SCRAPING NORMAL)
        const completeProfile: InstagramProfileData = {
          ...profileData,
          activity_score: activityScore.score,
          is_active: activityScore.isActive,
          language: languageDetection.language,
          hashtags_posts: postHashtags,
          // DIFERENÇA: NÃO analisar audiência
          has_relevant_audience: false,
          lead_source: 'follower_from_competitor',
          discovered_from_profile: competitorUsername,
          followers_scraped_count: 0
        };

        processedFollowers.push(completeProfile);
        console.log(`\n   ✅ PERFIL COMPLETO PROCESSADO: @${followerUsername}`);
        console.log(`   📊 Total processados: ${processedFollowers.length}/${maxFollowersToProcess}`);

        // Voltar ao modal de seguidores
        console.log(`\n   ⬅️  Voltando ao modal de seguidores...`);
        await page.goBack();

        // 🆕 CRITICAL: Aguardar modal reaparecer e garantir que está aberto
        await humanDelay(4000, 6000);
        await ensureModalIsOpen(page);

        // Scroll no modal para carregar próximos
        console.log(`   📜 Fazendo scroll no modal...`);
        await page.evaluate(() => {
          const modal = document.querySelector('div[role="dialog"]');
          if (modal) {
            const allDivs = modal.querySelectorAll('div');
            for (const div of allDivs) {
              if (div.scrollHeight > div.clientHeight) {
                div.scrollTop += 300;
                break;
              }
            }
          }
        });

        await humanDelay(2000, 3000);
        currentFollowerIndex++;

      } catch (followerError: any) {
        console.log(`   ❌ Erro ao processar seguidor ${i + 1}: ${followerError.message}`);

        // Tentar voltar ao modal
        try {
          await page.goBack();
          await humanDelay(4000, 6000);
          await ensureModalIsOpen(page);
        } catch (recoveryError: any) {
          console.log(`   ⚠️  Erro ao recuperar modal: ${recoveryError.message}`);
        }

        currentFollowerIndex++;
        continue;
      }
    }

    // 3. Fechar modal (ESC)
    console.log(`\n   🔒 Fechando modal de seguidores...`);
    await page.keyboard.press('Escape');
    await humanDelay(1000, 2000);

    console.log(`\n✅ Processamento de seguidores concluído!`);
    console.log(`   📊 Total aprovados: ${processedFollowers.length}/${maxFollowersToProcess}`);

    return {
      success: true,
      competitor_username: competitorUsername,
      total_processed: processedFollowers.length,
      followers: processedFollowers
    };

  } catch (error: any) {
    console.error(`❌ Erro geral ao processar seguidores: ${error.message}`);

    return {
      success: false,
      competitor_username: competitorUsername,
      total_processed: processedFollowers.length,
      followers: processedFollowers,
      error_message: error.message
    };
  }
}
