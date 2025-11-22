/**
 * TESTE: Extração correta identificando por palavra-chave
 */

import { createAuthenticatedPage } from '../src/services/instagram-session.service';

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCorrectExtraction(username: string) {
  console.log(`\n🧪 TESTE: Extração correta por palavra-chave`);
  console.log(`👤 Perfil: @${username}\n`);

  const page = await createAuthenticatedPage();

  await page.goto(`https://www.instagram.com/${username}/`, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  await delay(3000);

  // Extrair identificando por palavra-chave
  const result = await page.evaluate(() => {
    const allSpans = document.querySelectorAll('header section ul li span, header section ul li button span, header section ul li a span');

    let posts_text = '';
    let followers_text = '';
    let following_text = '';

    allSpans.forEach(span => {
      const text = span.textContent?.trim() || '';
      const textLower = text.toLowerCase();

      // Identificar por palavra-chave
      if ((textLower.includes('post') || textLower.includes('publicaç')) && !posts_text) {
        posts_text = text;
      } else if ((textLower.includes('seguidor') || textLower.includes('follower')) && !followers_text) {
        followers_text = text;
      } else if ((textLower.includes('seguindo') || textLower.includes('following')) && !following_text) {
        following_text = text;
      }
    });

    return { posts_text, followers_text, following_text };
  });

  console.log(`✅ Resultado:`);
  console.log(`   Posts: "${result.posts_text}"`);
  console.log(`   Seguidores: "${result.followers_text}"`);
  console.log(`   Seguindo: "${result.following_text}"`);

  // Função para converter texto para número
  function parseCount(text: string): number {
    if (!text) return 0;

    // Remover tudo exceto números, vírgulas, pontos e letras (k, m, mil)
    const cleaned = text.toLowerCase().replace(/[^0-9,.km]/g, '');

    // Se contém "mil" ou "k"
    if (text.toLowerCase().includes('mil') || text.toLowerCase().includes('k')) {
      const num = parseFloat(cleaned.replace(',', '.'));
      return Math.floor(num * 1000);
    }

    // Se contém "mi" ou "m" (milhões)
    if (text.toLowerCase().includes('mi') || text.toLowerCase().includes('m')) {
      const num = parseFloat(cleaned.replace(',', '.'));
      return Math.floor(num * 1000000);
    }

    // Número direto
    return parseInt(cleaned.replace(/[.,]/g, ''), 10) || 0;
  }

  const posts_count = parseCount(result.posts_text);
  const followers_count = parseCount(result.followers_text);
  const following_count = parseCount(result.following_text);

  console.log(`\n📊 Valores numéricos:`);
  console.log(`   Posts: ${posts_count.toLocaleString()}`);
  console.log(`   Seguidores: ${followers_count.toLocaleString()}`);
  console.log(`   Seguindo: ${following_count.toLocaleString()}`);

  console.log(`\n✅ TESTE CONCLUÍDO!`);
  console.log(`   ${followers_count >= 10000 && followers_count <= 300000 ? '🎯 PERFIL TEM AUDIÊNCIA RELEVANTE (10k-300k)' : '❌ Perfil fora da faixa'}`);

  process.exit(0);
}

const targetProfile = process.argv[2] || 'aliviory';
testCorrectExtraction(targetProfile).catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
