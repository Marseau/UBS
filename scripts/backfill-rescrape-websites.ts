/**
 * Backfill: Re-scrape websites de leads já processados
 * Processa em lotes de 200 para acompanhamento
 *
 * Uso: npx ts-node scripts/backfill-rescrape-websites.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_BASE = 'http://localhost:3000';
const BATCH_SIZE = 200;
const DELAY_BETWEEN_REQUESTS = 300; // 300ms

async function scrapeUrl(url: string): Promise<{ whatsapp_phones?: string[] } | null> {
  try {
    const response = await fetch(`${API_BASE}/api/instagram-scraper/scrape-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, deepLinks: true })
    });

    if (!response.ok) return null;
    return await response.json() as { whatsapp_phones?: string[] };
  } catch {
    return null;
  }
}

// SKIP: Pular leads já tentados que falharam (5800 processados - 2294 sucesso = ~3500 falhos)
const SKIP_FAILED = 3500;

async function backfillRescrape() {
  // Contar quantos já foram processados (têm whatsapp_number de website_scrape)
  const { count: jaProcessados } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .eq('whatsapp_source', 'website_scrape');

  const previousFound = jaProcessados || 0;
  console.log('🚀 Backfill: Re-scrape de websites');
  console.log(`📍 Já encontrados anteriormente: ${previousFound}`);
  console.log(`📍 Pulando ${SKIP_FAILED} leads já tentados que falharam\n`);

  let totalProcessed = SKIP_FAILED;
  let totalFound = previousFound;
  let totalFailed = SKIP_FAILED;
  let batchNumber = Math.floor(SKIP_FAILED / BATCH_SIZE);
  let hasMore = true;
  let lastCreatedAt = '1970-01-01T00:00:00Z';

  // Pular para a posição correta
  if (SKIP_FAILED > 0) {
    const { data: skipData } = await supabase
      .from('instagram_leads')
      .select('created_at')
      .is('whatsapp_number', null)
      .eq('url_enriched', true)
      .not('website', 'is', null)
      .not('website', 'ilike', '%wa.me/qr/%')
      .not('website', 'ilike', '%wa.me/message/%')
      .order('created_at', { ascending: true })
      .range(SKIP_FAILED - 1, SKIP_FAILED - 1);

    if (skipData && skipData[0]) {
      lastCreatedAt = skipData[0].created_at;
      console.log('📍 Retomando a partir de:', lastCreatedAt, '\n');
    }
  }

  while (hasMore) {
    batchNumber++;

    // Buscar próximo lote
    const { data: leads, error } = await supabase
      .from('instagram_leads')
      .select('id, username, website, created_at')
      .is('whatsapp_number', null)
      .eq('url_enriched', true)
      .not('website', 'is', null)
      .not('website', 'ilike', '%wa.me/qr/%')
      .not('website', 'ilike', '%wa.me/message/%')
      .gt('created_at', lastCreatedAt)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error || !leads || leads.length === 0) {
      if (error) console.error('❌ Erro:', error.message);
      hasMore = false;
      break;
    }

    console.log(`\n📦 LOTE ${batchNumber} - ${leads.length} leads (total: ${totalProcessed}+)`);
    console.log('─'.repeat(50));

    let batchFound = 0;

    for (const lead of leads) {
      totalProcessed++;
      lastCreatedAt = lead.created_at;

      process.stdout.write(`[${totalProcessed}] @${lead.username.substring(0, 25).padEnd(25)}... `);

      const result = await scrapeUrl(lead.website);

      if (result?.whatsapp_phones && result.whatsapp_phones.length > 0) {
        const phone = result.whatsapp_phones[0];
        console.log(`✅ ${phone}`);
        totalFound++;
        batchFound++;

        // Atualizar no banco
        await supabase
          .from('instagram_leads')
          .update({
            whatsapp_number: phone,
            whatsapp_source: 'website_scrape',
            whatsapp_verified: [{
              number: phone,
              source: 'website_scrape',
              extracted_at: new Date().toISOString()
            }]
          })
          .eq('id', lead.id);
      } else {
        console.log('❌');
        totalFailed++;
      }

      await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
    }

    // Resumo do lote
    console.log('─'.repeat(50));
    console.log(`📊 Lote ${batchNumber}: ${batchFound} encontrados | Total: ${totalFound}/${totalProcessed} (${((totalFound / totalProcessed) * 100).toFixed(1)}%)`);
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUMO FINAL');
  console.log('═'.repeat(50));
  console.log(`Total processados: ${totalProcessed}`);
  console.log(`WhatsApp encontrados: ${totalFound}`);
  console.log(`Sem WhatsApp: ${totalFailed}`);
  console.log(`Taxa de sucesso: ${((totalFound / totalProcessed) * 100).toFixed(1)}%`);
  console.log('═'.repeat(50) + '\n');
}

backfillRescrape()
  .then(() => {
    console.log('✅ Backfill concluído!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  });
