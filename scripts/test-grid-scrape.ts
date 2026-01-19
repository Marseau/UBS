/**
 * Teste de validação do grid de scraping
 * Testa 6 pontos (1 por região) com termo "empresa"
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { scrapeGoogleMaps } from '../src/services/google-maps-scraper.service';

const testPoints = [
  { regiao: 'ABCD', bairro: 'São Bernardo do Campo', cidade: 'São Bernardo do Campo' },
  { regiao: 'Zona Sul', bairro: 'Brooklin', cidade: 'São Paulo' },
  { regiao: 'Zona Oeste', bairro: 'Pinheiros', cidade: 'São Paulo' },
  { regiao: 'Centro', bairro: 'Avenida Paulista', cidade: 'São Paulo' },
  { regiao: 'Zona Norte', bairro: 'Santana', cidade: 'São Paulo' },
  { regiao: 'Zona Leste', bairro: 'Mooca', cidade: 'São Paulo' },
];

async function runTest() {
  console.log('='.repeat(60));
  console.log('TESTE DE VALIDAÇÃO DO GRID DE SCRAPING');
  console.log('Termo: "empresa" | Max: 20 por ponto');
  console.log('='.repeat(60));
  console.log();

  const results: any[] = [];

  for (const point of testPoints) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📍 TESTANDO: ${point.regiao} - ${point.bairro}`);
    console.log(`${'─'.repeat(60)}\n`);

    try {
      const result = await scrapeGoogleMaps({
        termo: 'empresa',
        cidade: point.cidade,
        localizacao: point.bairro,
        max_resultados: 20,
        saveToDb: false  // Não salvar, só testar
      });

      results.push({
        regiao: point.regiao,
        bairro: point.bairro,
        total_scraped: result.total_scraped,
        with_website: result.with_website,
        with_instagram: result.with_instagram,
        leads: result.leads.length,
        errors: result.errors.length
      });

      console.log(`\n✅ ${point.regiao}: ${result.with_instagram} com Instagram de ${result.total_scraped} processados`);

      // Pausa entre buscas para evitar rate limit
      console.log('\n⏳ Aguardando 30s antes da próxima busca...\n');
      await new Promise(r => setTimeout(r, 30000));

    } catch (error: any) {
      console.error(`❌ Erro em ${point.bairro}: ${error.message}`);
      results.push({
        regiao: point.regiao,
        bairro: point.bairro,
        error: error.message
      });
    }
  }

  // Resumo final
  console.log('\n');
  console.log('='.repeat(60));
  console.log('RESUMO DO TESTE');
  console.log('='.repeat(60));
  console.log();

  let totalScraped = 0;
  let totalInstagram = 0;

  console.log('| Região      | Bairro              | Processados | Com IG |');
  console.log('|-------------|---------------------|-------------|--------|');

  for (const r of results) {
    if (r.error) {
      console.log(`| ${r.regiao.padEnd(11)} | ${r.bairro.padEnd(19)} | ERRO        | -      |`);
    } else {
      console.log(`| ${r.regiao.padEnd(11)} | ${r.bairro.padEnd(19)} | ${String(r.total_scraped).padEnd(11)} | ${String(r.with_instagram).padEnd(6)} |`);
      totalScraped += r.total_scraped;
      totalInstagram += r.with_instagram;
    }
  }

  console.log('|-------------|---------------------|-------------|--------|');
  console.log(`| TOTAL       |                     | ${String(totalScraped).padEnd(11)} | ${String(totalInstagram).padEnd(6)} |`);
  console.log();

  const taxaInstagram = totalScraped > 0 ? ((totalInstagram / totalScraped) * 100).toFixed(1) : 0;
  console.log(`📊 Taxa de Instagram: ${taxaInstagram}%`);
  console.log(`📊 Estimativa para 100 pontos: ~${Math.round(totalInstagram / 6 * 100)} empresas com Instagram`);
  console.log();
}

runTest().catch(console.error);
