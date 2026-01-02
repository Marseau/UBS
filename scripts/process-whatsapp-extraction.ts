/**
 * Script para processar extração de WhatsApp dos leads da campanha booster
 *
 * Uso: npx ts-node scripts/process-whatsapp-extraction.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_BASE = process.env.API_BASE || 'http://localhost:3002';
const DELAY_MS = 500;

interface Lead {
  id: string;
  username: string;
  bio: string | null;
  website: string | null;
  full_name: string | null;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBoosterLeadIds(): Promise<string[]> {
  // Primeiro buscar o ID da campanha booster
  const { data: campaigns } = await supabase
    .from('cluster_campaigns')
    .select('id')
    .ilike('campaign_name', '%booster%');

  if (!campaigns || campaigns.length === 0) {
    console.error('Campanha booster não encontrada');
    return [];
  }

  const campaignIds = campaigns.map(c => c.id);

  // Buscar lead_ids da campanha (paginado para evitar limite)
  let allLeadIds: string[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data: campaignLeads } = await supabase
      .from('campaign_leads')
      .select('lead_id')
      .in('campaign_id', campaignIds)
      .range(offset, offset + PAGE_SIZE - 1);

    if (!campaignLeads || campaignLeads.length === 0) break;

    allLeadIds = [...allLeadIds, ...campaignLeads.map(cl => cl.lead_id)];
    offset += PAGE_SIZE;

    if (campaignLeads.length < PAGE_SIZE) break;
  }

  return allLeadIds;
}

async function callEnrichLead(lead: Lead): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/api/instagram/enrich-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: lead.id,
        username: lead.username,
        bio: lead.bio || '',
        website: lead.website || '',
        full_name: lead.full_name || ''
      })
    });
    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
}

async function callScrapeUrl(leadId: string, url: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/api/instagram-scraper/scrape-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: leadId,
        url: url,
        update_database: true
      })
    });
    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
}

async function updateLeadFromEnrich(leadId: string, result: any) {
  const updateData: any = {};

  if (result.whatsapp_numbers && result.whatsapp_numbers.length > 0) {
    updateData.whatsapp_numbers = result.whatsapp_numbers;
    updateData.whatsapp_bio_status = 'found';
  } else {
    updateData.whatsapp_bio_status = 'none';
  }

  if (result.phone) updateData.phone = result.phone;
  if (result.email) updateData.email = result.email;
  if (result.city) updateData.city = result.city;
  if (result.state) updateData.state = result.state;
  if (result.profession) updateData.profession = result.profession;

  await supabase.from('instagram_leads').update(updateData).eq('id', leadId);
}

async function processEnrichLead(boosterLeadIds: string[]) {
  console.log('\n📊 FASE 1: /enrich-lead para leads com bio (telefone ou wa.me)\n');

  // Processar em batches de 500 IDs (limite do Supabase)
  const BATCH_SIZE = 500;
  let allLeads: Lead[] = [];

  for (let i = 0; i < boosterLeadIds.length; i += BATCH_SIZE) {
    const batchIds = boosterLeadIds.slice(i, i + BATCH_SIZE);
    const { data: batchLeads } = await supabase
      .from('instagram_leads')
      .select('id, username, bio, website, full_name')
      .in('id', batchIds)
      .eq('whatsapp_bio_status', 'pending')
      .not('bio', 'is', null);

    if (batchLeads) allLeads = [...allLeads, ...batchLeads];
  }

  // Filtrar leads com potencial telefone na bio ou wa.me no website
  const phoneRegex = /\(?\d{2}\)?\s?9\d{4}[-\s]?\d{4}/;
  const leads = allLeads.filter(l =>
    (l.bio && phoneRegex.test(l.bio)) ||
    (l.website && l.website.includes('wa.me'))
  ).slice(0, 500);

  const error = null;

  if (error || !leads) {
    console.error('Erro ao buscar leads:', error);
    return { processed: 0, found: 0 };
  }

  console.log(`📋 ${leads.length} leads com wa.me/55... para processar\n`);

  let processed = 0, found = 0;

  for (const lead of leads) {
    processed++;
    process.stdout.write(`[${processed}/${leads.length}] @${lead.username.padEnd(25)}`);

    const result = await callEnrichLead(lead);

    if (result.whatsapp_numbers && result.whatsapp_numbers.length > 0) {
      await updateLeadFromEnrich(lead.id, result);
      found++;
      console.log(`✅ ${result.whatsapp_numbers[0].number}`);
    } else if (result.error) {
      console.log(`❌ ${result.error}`);
    } else {
      await updateLeadFromEnrich(lead.id, result);
      console.log(`⚪ sem WhatsApp`);
    }

    await sleep(DELAY_MS);
  }

  return { processed, found };
}

async function processScrapeUrl(boosterLeadIds: string[]) {
  console.log('\n📊 FASE 2: /scrape-url para websites (linktr.ee, beacons, etc)\n');

  // Processar em batches de 500 IDs
  const BATCH_SIZE = 500;
  let allLeads: any[] = [];

  for (let i = 0; i < boosterLeadIds.length && allLeads.length < 100; i += BATCH_SIZE) {
    const batchIds = boosterLeadIds.slice(i, i + BATCH_SIZE);
    const { data: batchLeads } = await supabase
      .from('instagram_leads')
      .select('id, username, website')
      .in('id', batchIds)
      .eq('whatsapp_url_status', 'pending')
      .not('website', 'is', null)
      .limit(100 - allLeads.length);

    if (batchLeads) allLeads = [...allLeads, ...batchLeads];
  }

  const leads = allLeads;
  const error = null;

  if (error || !leads) {
    console.error('Erro ao buscar leads:', error);
    return { processed: 0, found: 0 };
  }

  // Filtrar: excluir wa.me direto e instagram.com
  const leadsToScrape = leads.filter(l =>
    l.website &&
    !l.website.includes('wa.me/55') &&
    !l.website.includes('instagram.com')
  );

  console.log(`📋 ${leadsToScrape.length} leads com website para scraping\n`);

  let processed = 0, found = 0;

  for (const lead of leadsToScrape) {
    processed++;
    process.stdout.write(`[${processed}/${leadsToScrape.length}] @${lead.username.padEnd(25)}`);

    const result = await callScrapeUrl(lead.id, lead.website!);

    if (result.whatsapp_phones && result.whatsapp_phones.length > 0) {
      found++;
      console.log(`✅ ${result.whatsapp_phones.join(', ')}`);
    } else if (result.error) {
      console.log(`❌ ${result.error?.substring(0, 30)}`);
    } else {
      console.log(`⚪ ${result.total_contacts || 0} contatos`);
    }

    await sleep(2000); // Delay maior para scraping
  }

  return { processed, found };
}

async function showStats(boosterLeadIds: string[]) {
  // Processar em batches de 500 IDs
  const BATCH_SIZE = 500;
  let allLeads: any[] = [];

  for (let i = 0; i < boosterLeadIds.length; i += BATCH_SIZE) {
    const batchIds = boosterLeadIds.slice(i, i + BATCH_SIZE);
    const { data: batchLeads } = await supabase
      .from('instagram_leads')
      .select('whatsapp_bio_status, whatsapp_url_status, whatsapp_numbers')
      .in('id', batchIds);

    if (batchLeads) allLeads = [...allLeads, ...batchLeads];
  }

  const leads = allLeads;
  if (!leads || leads.length === 0) return;

  const stats = {
    total: leads.length,
    bioFound: leads.filter(l => l.whatsapp_bio_status === 'found').length,
    bioNone: leads.filter(l => l.whatsapp_bio_status === 'none').length,
    bioPending: leads.filter(l => l.whatsapp_bio_status === 'pending').length,
    urlFound: leads.filter(l => l.whatsapp_url_status === 'found').length,
    urlNone: leads.filter(l => l.whatsapp_url_status === 'none').length,
    urlPending: leads.filter(l => l.whatsapp_url_status === 'pending').length,
    withWhatsapp: leads.filter(l => l.whatsapp_numbers && l.whatsapp_numbers.length > 0).length
  };

  console.log('\n' + '═'.repeat(50));
  console.log('📊 ESTATÍSTICAS - CAMPANHA BOOSTER');
  console.log('═'.repeat(50));
  console.log(`Total leads: ${stats.total}`);
  console.log(`\n📝 Bio Status (enrich-lead):`);
  console.log(`   ✅ Found:   ${stats.bioFound}`);
  console.log(`   ⚪ None:    ${stats.bioNone}`);
  console.log(`   ⏳ Pending: ${stats.bioPending}`);
  console.log(`\n🌐 URL Status (scrape-url):`);
  console.log(`   ✅ Found:   ${stats.urlFound}`);
  console.log(`   ⚪ None:    ${stats.urlNone}`);
  console.log(`   ⏳ Pending: ${stats.urlPending}`);
  console.log(`\n📱 LEADS COM WHATSAPP: ${stats.withWhatsapp}`);
  console.log('═'.repeat(50));
}

async function main() {
  console.log('🚀 Processamento de WhatsApp - Campanha Booster\n');

  // Verificar API
  try {
    const health = await fetch(`${API_BASE}/api/health`);
    if (!health.ok) throw new Error('API offline');
    console.log(`✅ API online: ${API_BASE}\n`);
  } catch {
    console.error(`❌ API offline: ${API_BASE}`);
    process.exit(1);
  }

  // Buscar IDs dos leads da campanha booster
  console.log('🔍 Buscando leads da campanha booster...');
  const boosterLeadIds = await getBoosterLeadIds();
  console.log(`📋 ${boosterLeadIds.length} leads na campanha\n`);

  if (boosterLeadIds.length === 0) {
    console.error('Nenhum lead encontrado');
    process.exit(1);
  }

  // Fase 1
  const enrichResult = await processEnrichLead(boosterLeadIds);
  console.log(`\n✅ Fase 1: ${enrichResult.processed} processados, ${enrichResult.found} WhatsApps\n`);

  // Fase 2
  const scrapeResult = await processScrapeUrl(boosterLeadIds);
  console.log(`\n✅ Fase 2: ${scrapeResult.processed} processados, ${scrapeResult.found} WhatsApps\n`);

  // Stats finais
  await showStats(boosterLeadIds);

  console.log('\n✅ Processamento concluído!\n');
}

main().catch(console.error);
