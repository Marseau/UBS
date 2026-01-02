/**
 * Backfill WhatsApp numbers from website URLs
 *
 * Processa leads que:
 * - whatsapp_number IS NULL
 * - website contém wa.me/NUMERO ou api.whatsapp.com/send?phone=NUMERO
 *
 * Ordem: mais antigo para mais novo
 *
 * Uso: npx ts-node scripts/backfill-whatsapp-from-website.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 100;

interface WhatsAppExtraction {
  number: string;
  source: 'website_wa_me';
  extracted_at: string;
}

/**
 * Extrai número WhatsApp de URL wa.me ou api.whatsapp.com
 */
function extractWhatsAppFromUrl(url: string): string | null {
  if (!url) return null;

  // Ignorar links wa.me/message/CODE e wa.me/qr/CODE (não contém número)
  if (url.includes('wa.me/message/') || url.includes('wa.me/qr/')) {
    return null;
  }

  // wa.me/5551981158802 ou wa.me/+5551981158802
  const waMatch = url.match(/wa\.me\/\+?(\d[\d\-\s]{9,17})/);
  if (waMatch && waMatch[1]) {
    // Limpar hífens e espaços
    return waMatch[1].replace(/[\-\s]/g, '');
  }

  // api.whatsapp.com/send?phone=5551981158802
  const apiMatch = url.match(/api\.whatsapp\.com\/send\/?.*phone=\+?(\d[\d\-\s]{9,17})/);
  if (apiMatch && apiMatch[1]) {
    return apiMatch[1].replace(/[\-\s]/g, '');
  }

  return null;
}

/**
 * Valida se o número está em formato Brasil válido
 */
function isValidBrazilNumber(number: string): boolean {
  return number.startsWith('55') && number.length >= 12 && number.length <= 13;
}

/**
 * Normaliza número para formato brasileiro
 */
function normalizeNumber(number: string): string {
  const cleaned = number.replace(/\D/g, '');
  return cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
}

async function backfillWhatsApp() {
  console.log('🚀 Iniciando backfill de WhatsApp numbers...\n');

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let hasMore = true;
  let lastCreatedAt = '1970-01-01T00:00:00Z';

  while (hasMore) {
    // Buscar leads com website wa.me mas sem whatsapp_number
    const { data: leads, error } = await supabase
      .from('instagram_leads')
      .select('id, username, website, created_at')
      .is('whatsapp_number', null)
      .or('website.ilike.%wa.me/%,website.ilike.%api.whatsapp.com/send%')
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

      const number = extractWhatsAppFromUrl(lead.website);

      if (!number) {
        totalSkipped++;
        continue;
      }

      const normalized = normalizeNumber(number);

      if (!isValidBrazilNumber(normalized)) {
        console.log(`   ⚠️  @${lead.username}: número inválido ${normalized}`);
        totalSkipped++;
        continue;
      }

      const now = new Date().toISOString();
      const verified: WhatsAppExtraction[] = [{
        number: normalized,
        source: 'website_wa_me',
        extracted_at: now
      }];

      const { error: updateError } = await supabase
        .from('instagram_leads')
        .update({
          whatsapp_number: normalized,
          whatsapp_source: 'website_wa_me',
          whatsapp_verified: verified,
          url_enriched: true // Marca como enriquecido (não precisa mais scraping)
        })
        .eq('id', lead.id);

      if (updateError) {
        console.log(`   ❌ @${lead.username}: erro ao atualizar - ${updateError.message}`);
        totalSkipped++;
      } else {
        console.log(`   ✅ @${lead.username}: ${normalized}`);
        totalUpdated++;
      }
    }

    console.log(`   📊 Batch: ${leads.length} processados, ${totalUpdated} atualizados total\n`);

    // Delay entre batches
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n========================================');
  console.log('📊 RESUMO DO BACKFILL');
  console.log('========================================');
  console.log(`Total processados: ${totalProcessed}`);
  console.log(`Total atualizados: ${totalUpdated}`);
  console.log(`Total ignorados:   ${totalSkipped}`);
  console.log('========================================\n');
}

// Executar
backfillWhatsApp()
  .then(() => {
    console.log('✅ Backfill concluído!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  });
