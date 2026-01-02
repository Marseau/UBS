/**
 * Backfill WhatsApp numbers from wa.me/message links
 *
 * Processa leads que:
 * - whatsapp_number IS NULL
 * - website contém wa.me/message/CODE
 *
 * Navega para a URL e captura o número do redirect ou conteúdo
 *
 * NOTA: wa.me/qr links não funcionam em headless mode (apenas 31 leads)
 *
 * Uso: npx ts-node scripts/backfill-whatsapp-special-links.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { UrlScraperService } from '../src/services/url-scraper.service';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 50;
const DELAY_BETWEEN_SCRAPES = 2000; // 2s entre scrapes

interface WhatsAppExtraction {
  number: string;
  source: 'website_wa_me';
  extracted_at: string;
}

async function backfillSpecialLinks() {
  console.log('🚀 Iniciando backfill de WhatsApp via links wa.me/message...\n');

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let hasMore = true;
  let lastCreatedAt = '1970-01-01T00:00:00Z';

  while (hasMore) {
    // Buscar leads com wa.me/message (qr não funciona em headless)
    const { data: leads, error } = await supabase
      .from('instagram_leads')
      .select('id, username, website, created_at')
      .is('whatsapp_number', null)
      .ilike('website', '%wa.me/message/%')
      .gt('created_at', lastCreatedAt)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error('❌ Erro ao buscar leads:', error.message);
      break;
    }

    if (!leads || leads.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`📦 Processando batch de ${leads.length} leads (created_at > ${lastCreatedAt})...`);

    for (const lead of leads) {
      totalProcessed++;
      lastCreatedAt = lead.created_at;

      console.log(`\n[${totalProcessed}] @${lead.username}: ${lead.website.substring(0, 60)}...`);

      try {
        // Usar URL Scraper para extrair o número
        const result = await UrlScraperService.scrapeUrl(lead.website);

        if (result.success && result.whatsapp_phones && result.whatsapp_phones.length > 0) {
          const normalized = result.whatsapp_phones[0]!;

          // Validar formato Brasil
          if (normalized && normalized.startsWith('55') && normalized.length >= 12 && normalized.length <= 13) {
            const now = new Date().toISOString();
            const verified: WhatsAppExtraction[] = [{
              number: normalized as string,
              source: 'website_wa_me',
              extracted_at: now
            }];

            const { error: updateError } = await supabase
              .from('instagram_leads')
              .update({
                whatsapp_number: normalized,
                whatsapp_source: 'website_wa_me',
                whatsapp_verified: verified,
                url_enriched: true
              })
              .eq('id', lead.id);

            if (updateError) {
              console.log(`   ❌ Erro ao atualizar: ${updateError.message}`);
              totalFailed++;
            } else {
              console.log(`   ✅ Número extraído: ${normalized}`);
              totalUpdated++;
            }
          } else {
            console.log(`   ⚠️ Número inválido: ${normalized}`);
            totalFailed++;
          }
        } else {
          console.log(`   ⚠️ Número não encontrado (${result.error || 'sem erro'})`);
          totalFailed++;
        }

      } catch (err: any) {
        console.log(`   ❌ Erro no scrape: ${err.message}`);
        totalFailed++;
      }

      // Delay entre scrapes para não sobrecarregar
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_SCRAPES));
    }

    console.log(`\n📊 Batch finalizado: ${totalUpdated} atualizados, ${totalFailed} falhas\n`);

    // Delay entre batches
    await new Promise(r => setTimeout(r, 1000));
  }

  // Fechar browser do URL Scraper
  await UrlScraperService.closeBrowser();

  console.log('\n========================================');
  console.log('📊 RESUMO DO BACKFILL');
  console.log('========================================');
  console.log(`Total processados: ${totalProcessed}`);
  console.log(`Total atualizados: ${totalUpdated}`);
  console.log(`Total falhas:      ${totalFailed}`);
  console.log('========================================\n');
}

// Executar
backfillSpecialLinks()
  .then(() => {
    console.log('✅ Backfill concluído!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  });
