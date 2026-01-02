/**
 * Backfill WhatsApp numbers from bio
 *
 * Processa leads que:
 * - whatsapp_number IS NULL
 * - bio contém padrão de telefone brasileiro
 *
 * No Brasil, número na bio de Instagram comercial = WhatsApp (cultura local)
 *
 * Uso: npx ts-node scripts/backfill-whatsapp-from-bio.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { extractWhatsAppFromBio, isValidBrazilNumber } from '../src/utils/whatsapp-extractor.util';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 100;

interface WhatsAppExtraction {
  number: string;
  source: 'bio';
  extracted_at: string;
}

async function backfillFromBio() {
  console.log('🚀 Iniciando backfill de WhatsApp via bio...\n');

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let hasMore = true;
  let lastCreatedAt = '1970-01-01T00:00:00Z';

  while (hasMore) {
    // Buscar leads com bio que contém padrão de telefone, sem whatsapp_number
    const { data: leads, error } = await supabase
      .from('instagram_leads')
      .select('id, username, bio, created_at')
      .is('whatsapp_number', null)
      .not('bio', 'is', null)
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

    console.log(`📦 Processando batch de ${leads.length} leads...`);

    for (const lead of leads) {
      totalProcessed++;
      lastCreatedAt = lead.created_at;

      // Tentar extrair número da bio
      const number = extractWhatsAppFromBio(lead.bio);

      if (number && isValidBrazilNumber(number)) {
        const now = new Date().toISOString();
        const verified: WhatsAppExtraction[] = [{
          number,
          source: 'bio',
          extracted_at: now
        }];

        const { error: updateError } = await supabase
          .from('instagram_leads')
          .update({
            whatsapp_number: number,
            whatsapp_source: 'bio',
            whatsapp_verified: verified
          })
          .eq('id', lead.id);

        if (updateError) {
          console.log(`   ❌ @${lead.username}: Erro ao atualizar - ${updateError.message}`);
        } else {
          console.log(`   ✅ @${lead.username}: ${number}`);
          totalUpdated++;
        }
      } else {
        totalSkipped++;
      }
    }

    // Progresso a cada batch
    if (totalProcessed % 500 === 0) {
      console.log(`\n📊 Progresso: ${totalProcessed} processados, ${totalUpdated} atualizados, ${totalSkipped} sem telefone\n`);
    }
  }

  console.log('\n========================================');
  console.log('📊 RESUMO DO BACKFILL - BIO');
  console.log('========================================');
  console.log(`Total processados: ${totalProcessed}`);
  console.log(`Total atualizados: ${totalUpdated}`);
  console.log(`Sem telefone:      ${totalSkipped}`);
  console.log('========================================\n');
}

// Executar
backfillFromBio()
  .then(() => {
    console.log('✅ Backfill concluído!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  });
