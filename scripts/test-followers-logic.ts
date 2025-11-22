/**
 * TESTE ISOLADO - Lógica de Scraping de Seguidores
 *
 * Testa ANTES de integrar na API:
 * 1. Localizar botão de seguidores
 * 2. Clicar no botão
 * 3. Aguardar modal aparecer
 * 4. Extrair 50 nomes
 */

import { createAuthenticatedPage } from '../src/services/instagram-session.service';
import { Page } from 'puppeteer';

interface FollowerData {
  username: string;
  full_name: string | null;
}

// Helper function para delay (substitui waitForTimeout deprecado)
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testFollowersLogic(targetUsername: string) {
  console.log(`\n🧪 ===== TESTE ISOLADO: SCRAPING DE SEGUIDORES =====`);
  console.log(`👤 Alvo: @${targetUsername}\n`);

  let page: Page | null = null;

  try {
    // 1. Obter sessão autenticada (cria nova página com cookies)
    console.log(`📌 PASSO 1: Criando página autenticada...`);
    page = await createAuthenticatedPage();
    console.log(`✅ Página autenticada criada com sucesso\n`);

    // 2. Navegar para o perfil
    const profileUrl = `https://www.instagram.com/${targetUsername}/`;
    console.log(`📌 PASSO 2: Navegando para perfil...`);
    console.log(`   🔗 URL: ${profileUrl}`);

    await page.goto(profileUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log(`✅ Página carregada\n`);
    await delay(3000); // Aguardar estabilizar

    // 3. Contar seguidores visíveis na página
    console.log(`📌 PASSO 3: Verificando número de seguidores no perfil...`);
    const followersCount = await page.evaluate(() => {
      // Tentar pegar número de seguidores (formato: "X followers")
      const followersText = Array.from(document.querySelectorAll('a'))
        .find(link => link.href.includes('/followers/'))
        ?.textContent;

      return followersText || 'não encontrado';
    });
    console.log(`   📊 Seguidores visíveis: ${followersCount}`);
    console.log(`✅ Informação coletada\n`);

    // 4. Localizar botão de seguidores
    console.log(`📌 PASSO 4: Localizando botão de seguidores...`);

    // Tentar múltiplos seletores
    const selectors = [
      'a[href*="/followers/"]',
      'a:has-text("followers")',
      'a:has-text("seguidores")'
    ];

    let followersButton = null;
    for (const selector of selectors) {
      console.log(`   🔍 Tentando seletor: ${selector}`);
      try {
        followersButton = await page.$(selector);
        if (followersButton) {
          console.log(`   ✅ Botão encontrado com: ${selector}`);
          break;
        }
      } catch (err) {
        console.log(`   ❌ Seletor falhou: ${selector}`);
      }
    }

    if (!followersButton) {
      throw new Error('❌ Botão de seguidores NÃO encontrado com nenhum seletor!');
    }

    console.log(`✅ Botão localizado com sucesso\n`);

    // 5. Clicar no botão
    console.log(`📌 PASSO 5: Clicando no botão de seguidores...`);
    await followersButton.click();
    console.log(`   🖱️  Clique executado`);
    await delay(2000);
    console.log(`✅ Aguardado 2s após clique\n`);

    // 6. Aguardar modal aparecer
    console.log(`📌 PASSO 6: Aguardando modal de seguidores aparecer...`);

    try {
      await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
      console.log(`   ✅ Modal detectado (div[role="dialog"])`);
    } catch (err) {
      throw new Error('❌ Modal NÃO apareceu após 10 segundos!');
    }

    await delay(2000);
    console.log(`✅ Modal confirmado e estabilizado\n`);

    // 7. Verificar se modal tem conteúdo de seguidores
    console.log(`📌 PASSO 7: Verificando conteúdo do modal...`);
    const modalHasFollowers = await page.evaluate(() => {
      const modal = document.querySelector('div[role="dialog"]');
      if (!modal) return false;

      const followerLinks = modal.querySelectorAll('a[href^="/"][href$="/"]');
      return followerLinks.length > 0;
    });

    if (!modalHasFollowers) {
      throw new Error('❌ Modal abriu mas NÃO contém lista de seguidores!');
    }

    console.log(`✅ Modal contém lista de seguidores\n`);

    // 8. Extrair primeiros seguidores (sem scroll ainda)
    console.log(`📌 PASSO 8: Extraindo seguidores visíveis (sem scroll)...`);
    const initialFollowers = await page.evaluate(() => {
      const results: FollowerData[] = [];
      const seen = new Set<string>(); // Para evitar duplicatas
      const modal = document.querySelector('div[role="dialog"]');
      if (!modal) return results;

      const followerItems = modal.querySelectorAll('a[href^="/"][href$="/"]');

      followerItems.forEach((item) => {
        const href = item.getAttribute('href');
        if (!href) return;

        const username = href.replace(/\//g, '');
        if (!username || seen.has(username)) return; // Ignorar duplicatas

        seen.add(username);

        const nameSpan = item.querySelector('span');
        const fullName = nameSpan?.textContent?.trim() || null;

        results.push({ username, full_name: fullName });
      });

      return results;
    });

    console.log(`   📊 Seguidores extraídos (iniciais): ${initialFollowers.length}`);
    console.log(`\n   👥 Primeiros 5 seguidores:`);
    initialFollowers.slice(0, 5).forEach((f, idx) => {
      console.log(`      ${idx + 1}. @${f.username} - ${f.full_name || '(sem nome)'}`);
    });
    console.log(`\n✅ Extração inicial bem-sucedida\n`);

    // 9. Scroll para carregar mais (até atingir 50+ seguidores ou tentar 20x)
    console.log(`📌 PASSO 9: Scrollando modal para carregar mais seguidores...`);
    console.log(`   🎯 Meta: 50 seguidores`);

    const maxScrollAttempts = 20; // Máximo de tentativas
    let previousCount = initialFollowers.length;
    let stableScrolls = 0; // Contador de scrolls sem novos itens

    for (let i = 0; i < maxScrollAttempts; i++) {
      // Scroll no modal - buscar elemento scrollável dinamicamente
      const scrollResult = await page.evaluate(() => {
        const modal = document.querySelector('div[role="dialog"]');
        if (!modal) return { found: false, reason: 'Modal não encontrado' };

        // Buscar QUALQUER div dentro do modal que seja scrollável
        const allDivs = modal.querySelectorAll('div');
        let scrollableDiv = null;

        for (const div of allDivs) {
          // Se a div tem scrollHeight maior que clientHeight, é scrollável
          if (div.scrollHeight > div.clientHeight) {
            scrollableDiv = div;
            break;
          }
        }

        if (!scrollableDiv) {
          return { found: false, reason: 'Div scrollável não encontrada' };
        }

        const beforeScroll = scrollableDiv.scrollTop;
        scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
        const afterScroll = scrollableDiv.scrollTop;

        return {
          found: true,
          scrolled: afterScroll > beforeScroll,
          before: beforeScroll,
          after: afterScroll,
          height: scrollableDiv.scrollHeight
        };
      });

      if (!scrollResult.found) {
        console.log(`   ⚠️  ${scrollResult.reason} no scroll ${i + 1}`);
      }

      await delay(2500); // Aguardar carregar novos itens

      // Verificar quantos seguidores temos agora
      const currentCount = await page.evaluate(() => {
        const seen = new Set<string>();
        const followerItems = document.querySelectorAll('div[role="dialog"] a[href^="/"][href$="/"]');

        followerItems.forEach((item) => {
          const href = item.getAttribute('href');
          if (href) {
            const username = href.replace(/\//g, '');
            if (username) seen.add(username);
          }
        });

        return seen.size;
      });

      console.log(`   📜 Scroll ${i + 1}: ${currentCount} seguidores carregados`);

      // Se não carregou novos itens, incrementar contador de estabilidade
      if (currentCount === previousCount) {
        stableScrolls++;

        // Se 3 scrolls seguidos sem novos itens, provavelmente chegamos no fim
        if (stableScrolls >= 3) {
          console.log(`   ⚠️  Sem novos itens após 3 scrolls - provavelmente fim da lista`);
          break;
        }
      } else {
        stableScrolls = 0; // Reset contador se carregou novos itens
      }

      previousCount = currentCount;

      // Se atingiu meta de 50, pode parar
      if (currentCount >= 50) {
        console.log(`   ✅ Meta de 50 seguidores atingida!`);
        break;
      }
    }

    console.log(`✅ Scroll concluído\n`);

    // 10. Extrair TODOS os seguidores após scroll
    console.log(`📌 PASSO 10: Extraindo TODOS os seguidores após scroll...`);
    const allFollowers = await page.evaluate(() => {
      const results: FollowerData[] = [];
      const seen = new Set<string>(); // Para evitar duplicatas
      const modal = document.querySelector('div[role="dialog"]');
      if (!modal) return results;

      const followerItems = modal.querySelectorAll('a[href^="/"][href$="/"]');

      followerItems.forEach((item) => {
        const href = item.getAttribute('href');
        if (!href) return;

        const username = href.replace(/\//g, '');
        if (!username || seen.has(username)) return; // Ignorar duplicatas

        seen.add(username);

        const nameSpan = item.querySelector('span');
        const fullName = nameSpan?.textContent?.trim() || null;

        results.push({ username, full_name: fullName });
      });

      return results;
    });

    console.log(`   📊 Total de seguidores extraídos: ${allFollowers.length}`);
    console.log(`\n   👥 Últimos 5 seguidores:`);
    allFollowers.slice(-5).forEach((f, idx) => {
      console.log(`      ${allFollowers.length - 4 + idx}. @${f.username} - ${f.full_name || '(sem nome)'}`);
    });

    console.log(`\n✅ Extração completa bem-sucedida\n`);

    // 11. Fechar modal
    console.log(`📌 PASSO 11: Fechando modal...`);
    await page.keyboard.press('Escape');
    await delay(1000);
    console.log(`✅ Modal fechado\n`);

    // Resumo final
    console.log(`\n🎉 ===== TESTE CONCLUÍDO COM SUCESSO! =====`);
    console.log(`✅ Todos os 11 passos funcionaram perfeitamente`);
    console.log(`📊 Total de seguidores coletados: ${allFollowers.length}`);
    console.log(`👤 Perfil testado: @${targetUsername}`);
    console.log(`\n💡 A lógica está FUNCIONANDO! Pode ser integrada na API.`);

  } catch (error: any) {
    console.error(`\n❌ ===== TESTE FALHOU! =====`);
    console.error(`🔴 Erro: ${error.message}`);
    console.error(`\n💡 Este erro precisa ser corrigido ANTES de integrar na API.`);
  }
}

// Executar teste com perfil de exemplo
// Use um perfil conhecido (ex: light_detox com 17k seguidores)
const targetProfile = process.argv[2] || 'light_detox';

testFollowersLogic(targetProfile)
  .then(() => {
    console.log(`\n✅ Script finalizado`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n❌ Erro fatal:`, err);
    process.exit(1);
  });
