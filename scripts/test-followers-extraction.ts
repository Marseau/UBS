/**
 * TESTE ISOLADO - Extração de followers_count
 *
 * Testa especificamente a extração do número de seguidores
 * para descobrir por que está pegando 991 ao invés de 207K
 */

import { createAuthenticatedPage } from '../src/services/instagram-session.service';
import { Page } from 'puppeteer';

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testFollowersExtraction(username: string) {
  console.log(`\n🧪 ===== TESTE: EXTRAÇÃO DE FOLLOWERS_COUNT =====`);
  console.log(`👤 Perfil: @${username}\n`);

  let page: Page | null = null;

  try {
    // 1. Criar página autenticada
    console.log(`📌 Criando página autenticada...`);
    page = await createAuthenticatedPage();
    console.log(`✅ Página criada\n`);

    // 2. Navegar para o perfil
    const profileUrl = `https://www.instagram.com/${username}/`;
    console.log(`📌 Navegando para: ${profileUrl}`);
    await page.goto(profileUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await delay(3000);
    console.log(`✅ Página carregada\n`);

    // 3. Extrair HTML completo
    console.log(`📌 Extraindo HTML completo...`);
    const html = await page.content();
    console.log(`✅ HTML extraído (${html.length} chars)\n`);

    // 4. TESTE: Buscar JSON com followers_count
    console.log(`📌 TESTE 1: Regex para "edge_followed_by"`);
    const followersJsonMatch = html.match(/"edge_followed_by":\{"count":([0-9]+)\}/);

    if (followersJsonMatch) {
      const followersFromJson = parseInt(followersJsonMatch[1], 10);
      console.log(`   ✅ ENCONTRADO no JSON: ${followersFromJson.toLocaleString()} seguidores`);
      console.log(`   📄 Match completo: ${followersJsonMatch[0]}`);
    } else {
      console.log(`   ❌ NÃO ENCONTRADO com regex "edge_followed_by"`);

      // Tentar variações
      console.log(`\n   🔍 Tentando variações do regex...`);

      const variations = [
        /"edge_followed_by":\s*\{\s*"count"\s*:\s*([0-9]+)\s*\}/,
        /"edge_followed_by"[^}]*"count":([0-9]+)/,
        /edge_followed_by[^}]*count[^0-9]*([0-9]+)/,
        /"follower_count":([0-9]+)/,
      ];

      for (let i = 0; i < variations.length; i++) {
        const match = html.match(variations[i]);
        if (match) {
          console.log(`   ✅ Variação ${i + 1} funcionou: ${match[0]}`);
          console.log(`   📊 Valor: ${parseInt(match[1], 10).toLocaleString()}`);
          break;
        } else {
          console.log(`   ❌ Variação ${i + 1} falhou`);
        }
      }
    }

    // 5. TESTE: Extrair stats do DOM (como está fazendo atualmente)
    console.log(`\n📌 TESTE 2: Extração via DOM (método atual)`);
    const profileData = await page.evaluate(() => {
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

      return { stats };
    });

    console.log(`   📊 Stats encontrados no DOM: ${JSON.stringify(profileData.stats)}`);

    if (profileData.stats.length >= 3) {
      console.log(`   🔢 Interpretação:`);
      console.log(`      Posts: ${profileData.stats[0]}`);
      console.log(`      Seguidores: ${profileData.stats[1]}`);
      console.log(`      Seguindo: ${profileData.stats[2]}`);
    }

    // 6. Salvar parte relevante do HTML para debug
    console.log(`\n📌 Salvando amostra do HTML para análise...`);
    const relevantHtml = html.substring(0, 100000); // Primeiros 100KB
    const fs = require('fs');
    fs.writeFileSync('/tmp/instagram-profile-sample.html', relevantHtml);
    console.log(`   💾 Salvo em: /tmp/instagram-profile-sample.html`);

    // 7. Buscar manualmente no HTML
    console.log(`\n📌 TESTE 3: Busca manual de padrões`);
    const patterns = [
      'edge_followed_by',
      'follower_count',
      'followed_by',
      '"count":'
    ];

    for (const pattern of patterns) {
      const index = html.indexOf(pattern);
      if (index !== -1) {
        const snippet = html.substring(index, index + 100);
        console.log(`   ✅ "${pattern}" encontrado no HTML:`);
        console.log(`      ${snippet.substring(0, 80)}...`);
      } else {
        console.log(`   ❌ "${pattern}" NÃO encontrado no HTML`);
      }
    }

    console.log(`\n✅ ===== TESTE CONCLUÍDO =====`);
    console.log(`📄 Verifique o arquivo /tmp/instagram-profile-sample.html para mais detalhes`);

  } catch (error: any) {
    console.error(`\n❌ Erro no teste:`, error.message);
  }
}

// Testar com perfil específico
const targetProfile = process.argv[2] || 'aliviory';
testFollowersExtraction(targetProfile)
  .then(() => {
    console.log(`\n✅ Teste finalizado`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n❌ Erro fatal:`, err);
    process.exit(1);
  });
