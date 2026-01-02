/**
 * Script para processar TODA a base de leads e extrair WhatsApp verificado
 * Executa em background, processa apenas leads pendentes
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_BASE = 'http://localhost:3002';
const BATCH_SIZE = 200;
const DELAY_MS = 500;

let totalProcessed = 0;
let totalSuccess = 0;
let totalErrors = 0;
let startTime = Date.now();

async function scrapeUrl(leadId: string, url: string): Promise<boolean> {
  try {
    const response = await fetch(API_BASE + '/api/instagram-scraper/scrape-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, url, update_database: true })
    });

    if (!response.ok) {
      return false;
    }

    // Verificar se encontrou WhatsApp
    const { data } = await supabase
      .from('instagram_leads')
      .select('whatsapp_number')
      .eq('id', leadId)
      .single();

    return !!data?.whatsapp_number;
  } catch {
    return false;
  }
}

function formatTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : minutes > 0
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;
}

function printProgress() {
  const elapsed = Date.now() - startTime;
  const rate = totalProcessed / (elapsed / 1000);
  const successRate = totalProcessed > 0 ? (totalSuccess / totalProcessed * 100).toFixed(1) : '0';

  console.log(`\n📊 PROGRESSO: ${totalProcessed} processados | ${totalSuccess} com WhatsApp (${successRate}%) | ${totalErrors} erros`);
  console.log(`   ⏱️  Tempo: ${formatTime(elapsed)} | Taxa: ${rate.toFixed(1)} leads/s`);
}

async function processWebsiteLeads() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 PROCESSAMENTO EM MASSA - WHATSAPP VERIFICADO');
  console.log('='.repeat(60));
  console.log('📅 Início:', new Date().toISOString());
  console.log('');

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Buscar batch de leads com website que ainda não foram processados
    const { data: leads, error } = await supabase
      .from('instagram_leads')
      .select('id, username, website')
      .not('website', 'is', null)
      .not('website', 'eq', '')
      .or('whatsapp_verified.is.null,whatsapp_verified.eq.[]')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error('❌ Erro ao buscar leads:', error.message);
      break;
    }

    if (!leads || leads.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`\n📦 Batch ${Math.floor(offset / BATCH_SIZE) + 1}: ${leads.length} leads`);

    for (const lead of leads) {
      totalProcessed++;

      const found = await scrapeUrl(lead.id, lead.website);

      if (found) {
        totalSuccess++;
        process.stdout.write('✅');
      } else {
        process.stdout.write('.');
      }

      // Delay entre chamadas
      await new Promise(r => setTimeout(r, DELAY_MS));

      // Log a cada 50 leads
      if (totalProcessed % 50 === 0) {
        printProgress();
      }
    }

    // Se retornou menos que o batch size, acabou
    if (leads.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      offset += BATCH_SIZE;
    }
  }

  // Estatísticas finais
  const elapsed = Date.now() - startTime;

  console.log('\n\n' + '='.repeat(60));
  console.log('✅ PROCESSAMENTO CONCLUÍDO');
  console.log('='.repeat(60));
  console.log('📅 Fim:', new Date().toISOString());
  console.log('⏱️  Duração total:', formatTime(elapsed));
  console.log('');
  console.log('📊 ESTATÍSTICAS FINAIS:');
  console.log('   Total processados:', totalProcessed);
  console.log('   Com WhatsApp:', totalSuccess, `(${(totalSuccess/totalProcessed*100).toFixed(1)}%)`);
  console.log('   Sem WhatsApp:', totalProcessed - totalSuccess - totalErrors);
  console.log('   Erros:', totalErrors);
  console.log('');
}

processWebsiteLeads().catch(console.error);
