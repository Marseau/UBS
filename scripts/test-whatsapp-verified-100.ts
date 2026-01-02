/**
 * Script para testar extração de WhatsApp verificado com 100 leads
 * Testa AMBAS as APIs: scrape-url e enrich-lead
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_BASE = 'http://localhost:3002';

interface LeadResult {
  username: string;
  api: string;
  whatsapp_verified: any[];
  whatsapp_number: string | null;
  whatsapp_source: string | null;
  success: boolean;
  error?: string;
}

// ============================================================
// API 1: scrape-url (extrai de websites)
// ============================================================
async function scrapeUrl(leadId: string, url: string): Promise<any> {
  const response = await fetch(API_BASE + '/api/instagram-scraper/scrape-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: leadId, url, update_database: true })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error('HTTP ' + response.status + ': ' + text.substring(0, 100));
  }

  return response.json();
}

// ============================================================
// API 2: enrich-lead (extrai da bio)
// ============================================================
async function enrichLead(lead: any): Promise<any> {
  const response = await fetch(API_BASE + '/api/instagram/enrich-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error('HTTP ' + response.status + ': ' + text.substring(0, 100));
  }

  return response.json();
}

async function testScrapeUrl(): Promise<LeadResult[]> {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TESTE API 1: scrape-url (websites)');
  console.log('='.repeat(60) + '\n');

  // Buscar 100 leads com website
  const { data: leads, error } = await supabase
    .from('instagram_leads')
    .select('id, username, website')
    .not('website', 'is', null)
    .not('website', 'eq', '')
    .limit(100);

  if (error || !leads) {
    console.error('❌ Erro ao buscar leads:', error?.message);
    return [];
  }

  console.log('📋 Leads com website:', leads.length);
  console.log('-'.repeat(60) + '\n');

  const results: LeadResult[] = [];

  for (const lead of leads) {
    const progress = '[' + (leads.indexOf(lead) + 1) + '/' + leads.length + ']';

    try {
      process.stdout.write(progress + ' @' + lead.username.padEnd(25));

      await scrapeUrl(lead.id, lead.website);

      // Buscar dados atualizados
      const { data: updated } = await supabase
        .from('instagram_leads')
        .select('whatsapp_verified, whatsapp_number, whatsapp_source')
        .eq('id', lead.id)
        .single();

      const verified = updated?.whatsapp_verified || [];
      const number = updated?.whatsapp_number || null;

      results.push({
        username: lead.username,
        api: 'scrape-url',
        whatsapp_verified: verified,
        whatsapp_number: number,
        whatsapp_source: updated?.whatsapp_source || null,
        success: true
      });

      if (number) {
        console.log(' ✅ ' + number);
      } else {
        console.log(' -');
      }

      // Delay entre chamadas
      await new Promise(r => setTimeout(r, 500));

    } catch (err: any) {
      console.log(' ❌ ' + err.message.substring(0, 50));
      results.push({
        username: lead.username,
        api: 'scrape-url',
        whatsapp_verified: [],
        whatsapp_number: null,
        whatsapp_source: null,
        success: false,
        error: err.message
      });
    }
  }

  return results;
}

async function testEnrichLead(): Promise<LeadResult[]> {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TESTE API 2: enrich-lead (bio)');
  console.log('='.repeat(60) + '\n');

  // Buscar 100 leads com bio
  const { data: leads, error } = await supabase
    .from('instagram_leads')
    .select('id, username, full_name, bio, website')
    .not('bio', 'is', null)
    .not('bio', 'eq', '')
    .limit(100);

  if (error || !leads) {
    console.error('❌ Erro ao buscar leads:', error?.message);
    return [];
  }

  console.log('📋 Leads com bio:', leads.length);
  console.log('-'.repeat(60) + '\n');

  const results: LeadResult[] = [];

  for (const lead of leads) {
    const progress = '[' + (leads.indexOf(lead) + 1) + '/' + leads.length + ']';

    try {
      process.stdout.write(progress + ' @' + lead.username.padEnd(25));

      await enrichLead({
        id: lead.id,
        username: lead.username,
        full_name: lead.full_name,
        bio: lead.bio,
        website: lead.website
      });

      // Buscar dados atualizados
      const { data: updated } = await supabase
        .from('instagram_leads')
        .select('whatsapp_verified, whatsapp_number, whatsapp_source')
        .eq('id', lead.id)
        .single();

      const verified = updated?.whatsapp_verified || [];
      const number = updated?.whatsapp_number || null;

      results.push({
        username: lead.username,
        api: 'enrich-lead',
        whatsapp_verified: verified,
        whatsapp_number: number,
        whatsapp_source: updated?.whatsapp_source || null,
        success: true
      });

      if (number) {
        console.log(' ✅ ' + number);
      } else {
        console.log(' -');
      }

      // Delay entre chamadas
      await new Promise(r => setTimeout(r, 300));

    } catch (err: any) {
      console.log(' ❌ ' + err.message.substring(0, 50));
      results.push({
        username: lead.username,
        api: 'enrich-lead',
        whatsapp_verified: [],
        whatsapp_number: null,
        whatsapp_source: null,
        success: false,
        error: err.message
      });
    }
  }

  return results;
}

function printStats(results: LeadResult[], apiName: string) {
  const total = results.length;
  const success = results.filter(r => r.success).length;
  const errors = results.filter(r => !r.success).length;
  const withVerified = results.filter(r => r.whatsapp_verified.length > 0).length;
  const withNumber = results.filter(r => r.whatsapp_number).length;

  console.log('\n' + '-'.repeat(40));
  console.log('📈 ' + apiName.toUpperCase());
  console.log('-'.repeat(40));
  console.log('Total:             ' + total);
  console.log('Sucesso:           ' + success + ' (' + (success/total*100).toFixed(1) + '%)');
  console.log('Erros:             ' + errors + ' (' + (errors/total*100).toFixed(1) + '%)');
  console.log('Com verificados:   ' + withVerified + ' (' + (withVerified/total*100).toFixed(1) + '%)');
  console.log('Com whatsapp_num:  ' + withNumber + ' (' + (withNumber/total*100).toFixed(1) + '%)');

  // Contagem por fonte
  const sourceCount: Record<string, number> = {};
  let totalNumbers = 0;
  for (const r of results) {
    for (const v of r.whatsapp_verified) {
      totalNumbers++;
      const src = v.source || 'unknown';
      sourceCount[src] = (sourceCount[src] || 0) + 1;
    }
  }

  if (totalNumbers > 0) {
    console.log('\nNúmeros por fonte:');
    for (const [src, count] of Object.entries(sourceCount)) {
      console.log('  ' + src + ': ' + count);
    }
  }

  return { total, success, errors, withVerified, withNumber, sourceCount };
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 TESTE COMPLETO: WHATSAPP VERIFICADO - 2 APIs x 100 LEADS');
  console.log('='.repeat(60));

  // Teste API 1: scrape-url
  const scrapeResults = await testScrapeUrl();

  // Teste API 2: enrich-lead
  const enrichResults = await testEnrichLead();

  // Estatísticas finais
  console.log('\n' + '='.repeat(60));
  console.log('📊 ESTATÍSTICAS CONSOLIDADAS');
  console.log('='.repeat(60));

  const scrapeStats = printStats(scrapeResults, 'scrape-url (websites)');
  const enrichStats = printStats(enrichResults, 'enrich-lead (bio)');

  // Resumo consolidado
  console.log('\n' + '='.repeat(60));
  console.log('📋 RESUMO FINAL');
  console.log('='.repeat(60));

  const totalLeads = scrapeStats.total + enrichStats.total;
  const totalWithWA = scrapeStats.withNumber + enrichStats.withNumber;

  console.log('\nTotal de leads testados:  ' + totalLeads);
  console.log('Total com WhatsApp:       ' + totalWithWA);
  console.log('Taxa de sucesso global:   ' + (totalWithWA/totalLeads*100).toFixed(1) + '%');

  // Lista de leads com WhatsApp
  console.log('\n' + '-'.repeat(60));
  console.log('📱 LEADS COM WHATSAPP (scrape-url):');
  console.log('-'.repeat(60));
  const scrapeWithWA = scrapeResults.filter(r => r.whatsapp_number);
  for (const r of scrapeWithWA.slice(0, 20)) {
    console.log('@' + r.username.padEnd(25) + ' ' + r.whatsapp_number + ' [' + r.whatsapp_source + ']');
  }
  if (scrapeWithWA.length > 20) {
    console.log('... e mais ' + (scrapeWithWA.length - 20) + ' leads');
  }

  console.log('\n' + '-'.repeat(60));
  console.log('📱 LEADS COM WHATSAPP (enrich-lead):');
  console.log('-'.repeat(60));
  const enrichWithWA = enrichResults.filter(r => r.whatsapp_number);
  for (const r of enrichWithWA.slice(0, 20)) {
    console.log('@' + r.username.padEnd(25) + ' ' + r.whatsapp_number + ' [' + r.whatsapp_source + ']');
  }
  if (enrichWithWA.length > 20) {
    console.log('... e mais ' + (enrichWithWA.length - 20) + ' leads');
  }

  console.log('\n✅ Teste completo!\n');
}

main().catch(console.error);
