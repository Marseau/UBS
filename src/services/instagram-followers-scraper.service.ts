// @ts-nocheck - Código usa window/document dentro de page.evaluate() (contexto browser)
/**
 * Instagram Followers Scraper Service
 *
 * Extrai lista de seguidores de perfis concorrentes para gerar leads B2C
 *
 * Fluxo:
 * 1. Acessa perfil do concorrente
 * 2. Clica em botão "seguidores"
 * 3. Scrolla modal de seguidores (scroll infinito)
 * 4. Extrai username, nome completo, foto de cada seguidor
 * 5. Retorna lista de seguidores para salvar em instagram_leads
 */

import { Page } from 'puppeteer';
import { getSessionPage } from './instagram-session.service';

export interface FollowerBasicData {
  username: string;
  full_name: string | null;
  profile_pic_url: string | null;
  is_verified: boolean;
  is_private: boolean;
}

export interface FollowersScraperResult {
  success: boolean;
  competitor_username: string;
  total_followers_scraped: number;
  followers: FollowerBasicData[];
  error_message?: string;
}

/**
 * Delay aleatório para simular comportamento humano
 */
async function humanDelay(min: number = 2000, max: number = 5000): Promise<void> {
  const delay = min + Math.random() * (max - min);
  console.log(`   ⏳ Aguardando ${(delay / 1000).toFixed(1)}s (delay humano)...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Scrolla modal de seguidores para carregar mais perfis
 */
async function scrollFollowersModal(page: Page, maxScrolls: number = 10): Promise<void> {
  console.log(`   📜 Scrollando modal de seguidores (max ${maxScrolls} scrolls)...`);

  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(() => {
      // Encontra o modal de seguidores e scrolla até o final
      const modalDiv = document.querySelector('div[role="dialog"] div[style*="overflow"]');
      if (modalDiv) {
        modalDiv.scrollTop = modalDiv.scrollHeight;
      }
    });

    console.log(`      Scroll ${i + 1}/${maxScrolls}...`);
    await humanDelay(1500, 3000); // Aguardar carregar mais perfis
  }

  console.log(`   ✅ Scroll concluído`);
}

/**
 * Extrai dados básicos dos seguidores visíveis no modal
 */
async function extractFollowersFromModal(page: Page): Promise<FollowerBasicData[]> {
  console.log(`   🔍 Extraindo dados dos seguidores...`);

  const followers = await page.evaluate(() => {
    const results: FollowerBasicData[] = [];

    // Selecionar todos os itens de seguidor no modal
    const followerItems = document.querySelectorAll('div[role="dialog"] a[href^="/"][href$="/"]');

    followerItems.forEach((item) => {
      try {
        // Username vem do href: /username/
        const href = item.getAttribute('href');
        if (!href) return;

        const username = href.replace(/\//g, '');
        if (!username) return;

        // Full name geralmente está em um span dentro do link
        const nameSpan = item.querySelector('span');
        const fullName = nameSpan?.textContent?.trim() || null;

        // Foto de perfil
        const img = item.querySelector('img');
        const profilePicUrl = img?.getAttribute('src') || null;

        // Verificado? (ícone de verificação)
        const isVerified = !!item.querySelector('svg[aria-label*="Verified"]');

        // Privado? (cadeado)
        const isPrivate = !!item.querySelector('svg[aria-label*="Private"]');

        results.push({
          username,
          full_name: fullName,
          profile_pic_url: profilePicUrl,
          is_verified: isVerified,
          is_private: isPrivate
        });
      } catch (err) {
        console.log('Erro ao extrair seguidor:', err);
      }
    });

    return results;
  });

  console.log(`   ✅ ${followers.length} seguidores extraídos`);
  return followers;
}

/**
 * Scrape seguidores de um perfil do Instagram
 *
 * @param competitorUsername - Username do concorrente (sem @)
 * @param maxFollowers - Número máximo de seguidores para scrapear (padrão: 50)
 * @returns Lista de seguidores com dados básicos
 */
export async function scrapeInstagramFollowers(
  competitorUsername: string,
  maxFollowers: number = 50
): Promise<FollowersScraperResult> {
  console.log(`\n👥 Iniciando scraping de seguidores de @${competitorUsername}...`);
  console.log(`   🎯 Alvo: ${maxFollowers} seguidores`);

  let page: Page | null = null;

  try {
    // 1. Obter página de sessão autenticada
    page = await getSessionPage();
    console.log(`   ✅ Sessão autenticada obtida`);

    // 2. Navegar para o perfil do concorrente
    const profileUrl = `https://www.instagram.com/${competitorUsername}/`;
    console.log(`   🔗 Navegando para: ${profileUrl}`);

    await page.goto(profileUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await humanDelay(2000, 4000);

    // 3. Verificar se perfil existe
    const profileExists = await page.evaluate(() => {
      // Se houver mensagem "This page isn't available", perfil não existe
      return !document.body.textContent?.includes("isn't available");
    });

    if (!profileExists) {
      throw new Error(`Perfil @${competitorUsername} não encontrado ou indisponível`);
    }

    console.log(`   ✅ Perfil encontrado`);

    // 4. Clicar no botão "seguidores" (followers)
    console.log(`   🖱️  Procurando botão de seguidores...`);

    const followersButtonClicked = await page.evaluate(() => {
      // Procurar link que contém "/followers/" no href
      const followersLink = Array.from(document.querySelectorAll('a'))
        .find(link => link.href.includes('/followers/'));

      if (followersLink) {
        (followersLink as HTMLElement).click();
        return true;
      }

      return false;
    });

    if (!followersButtonClicked) {
      throw new Error('Botão de seguidores não encontrado no perfil');
    }

    console.log(`   ✅ Modal de seguidores aberto`);
    await humanDelay(2000, 3000);

    // 5. Calcular quantos scrolls precisamos
    const scrollsNeeded = Math.ceil(maxFollowers / 12); // ~12 seguidores por scroll

    // 6. Scrollar modal para carregar seguidores
    await scrollFollowersModal(page, scrollsNeeded);

    // 7. Extrair dados dos seguidores
    const followers = await extractFollowersFromModal(page);

    // 8. Limitar ao número máximo solicitado
    const limitedFollowers = followers.slice(0, maxFollowers);

    console.log(`\n✅ Scraping concluído!`);
    console.log(`   📊 Total extraído: ${limitedFollowers.length} seguidores`);

    // 9. Fechar modal (ESC)
    await page.keyboard.press('Escape');
    await humanDelay(1000, 2000);

    return {
      success: true,
      competitor_username: competitorUsername,
      total_followers_scraped: limitedFollowers.length,
      followers: limitedFollowers
    };

  } catch (error: any) {
    console.error(`❌ Erro ao scrapear seguidores:`, error.message);

    return {
      success: false,
      competitor_username: competitorUsername,
      total_followers_scraped: 0,
      followers: [],
      error_message: error.message
    };
  }
}
