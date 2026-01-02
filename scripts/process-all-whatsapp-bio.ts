/**
 * FASE 2: Processar TODOS os leads com bio para extrair WhatsApp
 * Complementa a Fase 1 (websites) - pode encontrar números adicionais
 * A coluna whatsapp_verified é JSONB e faz merge dos números
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_BASE = 'http://localhost:3002';
const BATCH_SIZE = 100;
const DELAY_MS = 300; // Mais rápido pois enrich-lead é mais leve

let totalProcessed = 0;
let totalNewNumbers = 0;
let totalErrors = 0;
let startTime = Date.now();

async function enrichLead(lead: any): Promise<boolean> {
  try {
    // Buscar números antes
    const { data: before } = await supabase
      .from('instagram_leads')
      .select('whatsapp_verified')
      .eq('id', lead.id)
      .single();

    const countBefore = (before?.whatsapp_verified || []).length;

    const response = await fetch(API_BASE + '/api/instagram/enrich-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: lead.id,
        username: lead.username,
        full_name: lead.full_name,
        bio: lead.bio,
        website: lead.website
      })
    });

    if (!response.ok) {
      return false;
    }

    // Buscar números depois
    const { data: after } = await supabase
      .from('instagram_leads')
      .select('whatsapp_verified')
      .eq('id', lead.id)
      .single();

    const countAfter = (after?.whatsapp_verified || []).length;

    // Retorna true se encontrou NOVOS números
    return countAfter > countBefore;
  } catch {
    totalErrors++;
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
  const newRate = totalProcessed > 0 ? (totalNewNumbers / totalProcessed * 100).toFixed(1) : '0';

  console.log(`\n📊 PROGRESSO: ${totalProcessed} processados | ${totalNewNumbers} novos números (${newRate}%) | ${totalErrors} erros`);
  console.log(`   ⏱️  Tempo: ${formatTime(elapsed)} | Taxa: ${rate.toFixed(1)} leads/s`);
}

async function processBioLeads() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 FASE 2: PROCESSAMENTO BIO - WHATSAPP VERIFICADO');
  console.log('='.repeat(60));
  console.log('📅 Início:', new Date().toISOString());
  console.log('ℹ️  Processa TODOS os leads com bio (merge com existentes)');
  console.log('');

  // Contar total
  const { count } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .not('bio', 'is', null)
    .not('bio', 'eq', '');

  console.log(`📋 Total de leads com bio: ${count}`);

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Buscar batch de leads com bio
    const { data: leads, error } = await supabase
      .from('instagram_leads')
      .select('id, username, full_name, bio, website')
      .not('bio', 'is', null)
      .not('bio', 'eq', '')
      .order('created_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error('❌ Erro ao buscar leads:', error.message);
      break;
    }

    if (!leads || leads.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`\n📦 Batch ${Math.floor(offset / BATCH_SIZE) + 1}: ${leads.length} leads (offset: ${offset})`);

    for (const lead of leads) {
      totalProcessed++;

      const foundNew = await enrichLead(lead);

      if (foundNew) {
        totalNewNumbers++;
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
  console.log('✅ FASE 2 CONCLUÍDA');
  console.log('='.repeat(60));
  console.log('📅 Fim:', new Date().toISOString());
  console.log('⏱️  Duração total:', formatTime(elapsed));
  console.log('');
  console.log('📊 ESTATÍSTICAS FINAIS:');
  console.log('   Total processados:', totalProcessed);
  console.log('   Novos números encontrados:', totalNewNumbers, `(${(totalNewNumbers/totalProcessed*100).toFixed(1)}%)`);
  console.log('   Erros:', totalErrors);
  console.log('');

  // Contar total de WhatsApps verificados no banco
  const { data: stats } = await supabase
    .from('instagram_leads')
    .select('whatsapp_verified')
    .not('whatsapp_verified', 'eq', '[]');

  let totalNumbers = 0;
  if (stats) {
    for (const row of stats) {
      totalNumbers += (row.whatsapp_verified || []).length;
    }
  }

  console.log('📱 TOTAL DE WHATSAPPS VERIFICADOS NO BANCO:', totalNumbers);
}

processBioLeads().catch(console.error);
