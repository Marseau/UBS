/**
 * Backfill: Re-scrape websites de leads já processados
 * Processa em lotes de 10 DIAS de created_at (do mais antigo ao mais novo)
 * Marca leads re-verificados com flag whatsapp_reverified_at
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
const DAYS_PER_BATCH = 10; // 10 dias por lote
const DELAY_BETWEEN_REQUESTS = 300; // 300ms

async function scrapeUrl(leadId: string, url: string): Promise<{ whatsapp_phones?: string[], database_updated?: boolean } | null> {
  try {
    const response = await fetch(`${API_BASE}/api/instagram-scraper/scrape-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: leadId,
        url,
        update_database: true,
        deepLinks: true
      })
    });

    if (!response.ok) return null;
    return await response.json() as { whatsapp_phones?: string[], database_updated?: boolean };
  } catch {
    return null;
  }
}

// Marcar lead como re-verificado
async function markAsReverified(leadId: string): Promise<void> {
  await supabase
    .from('instagram_leads')
    .update({ whatsapp_reverified_at: new Date().toISOString() })
    .eq('id', leadId);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] as string;
}

async function backfillRescrape() {
  console.log('🚀 Backfill: Re-scrape de websites (por lotes de 10 dias)\n');

  // Buscar data mais antiga de lead não re-verificado
  const { data: oldestLead } = await supabase
    .from('instagram_leads')
    .select('created_at')
    .is('whatsapp_number', null)
    .eq('url_enriched', true)
    .not('website', 'is', null)
    .not('website', 'ilike', '%wa.me/qr/%')
    .is('whatsapp_reverified_at', null)
    .order('created_at', { ascending: true })
    .limit(1);

  if (!oldestLead || oldestLead.length === 0) {
    console.log('✅ Todos os leads já foram re-verificados!');
    return;
  }

  // Buscar data mais recente para calcular o range total
  const { data: newestLead } = await supabase
    .from('instagram_leads')
    .select('created_at')
    .is('whatsapp_number', null)
    .eq('url_enriched', true)
    .not('website', 'is', null)
    .not('website', 'ilike', '%wa.me/qr/%')
    .is('whatsapp_reverified_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  // Contar total pendente
  const { count: totalPendente } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .is('whatsapp_number', null)
    .eq('url_enriched', true)
    .not('website', 'is', null)
    .not('website', 'ilike', '%wa.me/qr/%')
    .is('whatsapp_reverified_at', null);

  const startDate = new Date(oldestLead[0]!.created_at);
  const endDate = newestLead && newestLead[0] ? new Date(newestLead[0].created_at) : new Date();

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const totalBatches = Math.ceil(totalDays / DAYS_PER_BATCH);

  console.log(`📅 Range de datas: ${formatDate(startDate)} → ${formatDate(endDate)}`);
  console.log(`📊 Total de dias: ${totalDays} (~${totalBatches} lotes de ${DAYS_PER_BATCH} dias)`);
  console.log(`📋 Leads pendentes: ${totalPendente || 0}\n`);

  let currentStart = startDate;
  let batchNumber = 0;
  let totalProcessed = 0;
  let totalFound = 0;
  let totalFailed = 0;

  while (currentStart < endDate) {
    batchNumber++;
    const currentEnd = addDays(currentStart, DAYS_PER_BATCH);

    // Buscar leads deste período que ainda não foram re-verificados
    const { data: leads, error } = await supabase
      .from('instagram_leads')
      .select('id, username, website, created_at')
      .is('whatsapp_number', null)
      .eq('url_enriched', true)
      .not('website', 'is', null)
      .not('website', 'ilike', '%wa.me/qr/%')
      .is('whatsapp_reverified_at', null)
      .gte('created_at', currentStart.toISOString())
      .lt('created_at', currentEnd.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`❌ Erro no lote ${batchNumber}:`, error.message);
      currentStart = currentEnd;
      continue;
    }

    if (!leads || leads.length === 0) {
      console.log(`📦 LOTE ${batchNumber} [${formatDate(currentStart)} → ${formatDate(currentEnd)}]: 0 leads (já processados ou vazios)`);
      currentStart = currentEnd;
      continue;
    }

    console.log(`\n📦 LOTE ${batchNumber} [${formatDate(currentStart)} → ${formatDate(currentEnd)}]: ${leads.length} leads`);
    console.log('─'.repeat(60));

    let batchFound = 0;
    let batchProcessed = 0;

    for (const lead of leads) {
      totalProcessed++;
      batchProcessed++;

      process.stdout.write(`[${batchProcessed}/${leads.length}] @${lead.username.substring(0, 25).padEnd(25)}... `);

      const result = await scrapeUrl(lead.id, lead.website);

      // Marcar como re-verificado (independente do resultado)
      await markAsReverified(lead.id);

      if (result?.whatsapp_phones && result.whatsapp_phones.length > 0) {
        const phone = result.whatsapp_phones[0];
        console.log(`✅ ${phone} (${result.whatsapp_phones.length} total)`);
        totalFound++;
        batchFound++;
      } else {
        console.log('❌');
        totalFailed++;
      }

      await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
    }

    // Resumo do lote
    console.log('─'.repeat(60));
    const batchRate = batchProcessed > 0 ? ((batchFound / batchProcessed) * 100).toFixed(1) : '0';
    const totalRate = totalProcessed > 0 ? ((totalFound / totalProcessed) * 100).toFixed(1) : '0';
    console.log(`📊 Lote ${batchNumber}: ${batchFound}/${batchProcessed} (${batchRate}%) | Acumulado: ${totalFound}/${totalProcessed} (${totalRate}%)`);

    // Próximo lote
    currentStart = currentEnd;
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMO FINAL');
  console.log('═'.repeat(60));
  console.log(`Total de lotes: ${batchNumber}`);
  console.log(`Total processados: ${totalProcessed}`);
  console.log(`WhatsApp encontrados: ${totalFound}`);
  console.log(`Sem WhatsApp: ${totalFailed}`);
  console.log(`Taxa de sucesso: ${totalProcessed > 0 ? ((totalFound / totalProcessed) * 100).toFixed(1) : 0}%`);
  console.log('═'.repeat(60) + '\n');
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
