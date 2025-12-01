/**
 * Script de Re-Enriquecimento em Lote
 *
 * Executa:
 * 1. Re-enriquecimento da BIO (extrai dados com IA)
 * 2. Re-enriquecimento da URL (extrai telefones/emails do site)
 *
 * O trigger do banco vai re-normalizar automaticamente após cada update.
 *
 * Uso:
 *   npx ts-node scripts/batch-re-enrich.ts [--bio-only] [--url-only] [--limit N]
 */

import { createClient } from '@supabase/supabase-js';
import { enrichSingleLead } from '../src/services/instagram-lead-enrichment.service';
import { UrlScraperService } from '../src/services/url-scraper.service';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Configurações
const BATCH_SIZE = 100;
const DELAY_BETWEEN_LEADS_MS = 500; // 500ms entre leads
const DELAY_BETWEEN_BATCHES_MS = 2000; // 2s entre lotes

interface Stats {
  total: number;
  processed: number;
  bioEnriched: number;
  urlEnriched: number;
  phonesFound: number;
  emailsFound: number;
  errors: number;
  startTime: Date;
}

const stats: Stats = {
  total: 0,
  processed: 0,
  bioEnriched: 0,
  urlEnriched: 0,
  phonesFound: 0,
  emailsFound: 0,
  errors: 0,
  startTime: new Date()
};

function printProgress() {
  const elapsed = (Date.now() - stats.startTime.getTime()) / 1000;
  const rate = stats.processed / elapsed;
  const remaining = stats.total - stats.processed;
  const eta = remaining / rate;

  console.log(`\n📊 Progresso: ${stats.processed}/${stats.total} (${((stats.processed/stats.total)*100).toFixed(1)}%)`);
  console.log(`   Bio enriquecidos: ${stats.bioEnriched}`);
  console.log(`   URL enriquecidos: ${stats.urlEnriched}`);
  console.log(`   Telefones encontrados: ${stats.phonesFound}`);
  console.log(`   Emails encontrados: ${stats.emailsFound}`);
  console.log(`   Erros: ${stats.errors}`);
  console.log(`   Velocidade: ${rate.toFixed(2)} leads/s`);
  console.log(`   ETA: ${Math.round(eta/60)} minutos`);
}

async function enrichBio(lead: any): Promise<boolean> {
  try {
    if (!lead.bio && !lead.website) {
      return false;
    }

    const result = await enrichSingleLead({
      id: lead.id,
      username: lead.username,
      full_name: lead.full_name,
      bio: lead.bio,
      website: lead.website,
      hashtags_bio: lead.hashtags_bio,
      hashtags_posts: lead.hashtags_posts
    });

    if (result.sources.length > 0) {
      // Atualizar lead com dados enriquecidos
      const updateData: any = {
        dado_enriquecido: true,
        updated_at: new Date().toISOString()
      };

      // Só atualizar campos que foram enriquecidos e não sobrescrever dados existentes
      if (result.enriched.full_name && !lead.full_name) {
        updateData.full_name = result.enriched.full_name;
      }
      if (result.enriched.first_name && !lead.first_name) {
        updateData.first_name = result.enriched.first_name;
      }
      if (result.enriched.last_name && !lead.last_name) {
        updateData.last_name = result.enriched.last_name;
      }
      if (result.enriched.profession && !lead.profession) {
        updateData.profession = result.enriched.profession;
      }
      if (result.enriched.email && !lead.email) {
        updateData.email = result.enriched.email;
        stats.emailsFound++;
      }
      if (result.enriched.phone && !lead.phone) {
        updateData.phone = result.enriched.phone;
        stats.phonesFound++;
      }
      if (result.enriched.city && !lead.city) {
        updateData.city = result.enriched.city;
      }
      if (result.enriched.state && !lead.state) {
        updateData.state = result.enriched.state;
      }
      if (result.enriched.address && !lead.address) {
        updateData.address = result.enriched.address;
      }
      if (result.enriched.zip_code && !lead.zip_code) {
        updateData.zip_code = result.enriched.zip_code;
      }
      if (result.enriched.business_category && !lead.business_category) {
        updateData.business_category = result.enriched.business_category;
      }
      if (result.enriched.hashtags_bio && result.enriched.hashtags_bio.length > 0) {
        updateData.hashtags_bio = result.enriched.hashtags_bio;
      }

      await supabase
        .from('instagram_leads')
        .update(updateData)
        .eq('id', lead.id);

      return true;
    }

    return false;
  } catch (error: any) {
    console.error(`   ❌ Erro bio @${lead.username}:`, error.message);
    stats.errors++;
    return false;
  }
}

async function enrichUrl(lead: any): Promise<boolean> {
  try {
    if (!lead.website) {
      return false;
    }

    // Scrape a URL
    const result = await UrlScraperService.scrapeUrl(lead.website);

    if (!result.success) {
      return false;
    }

    const phonesFound = result.phones?.length || 0;
    const emailsFound = result.emails?.length || 0;

    if (phonesFound === 0 && emailsFound === 0) {
      // Marcar como processado mesmo sem dados
      await supabase
        .from('instagram_leads')
        .update({ url_enriched: true, updated_at: new Date().toISOString() })
        .eq('id', lead.id);
      return false;
    }

    // Preparar dados para update
    const updateData: any = {
      url_enriched: true,
      updated_at: new Date().toISOString()
    };

    // Adicionar telefones ao additional_phones (merge com existentes)
    if (phonesFound > 0) {
      const existingPhones = lead.additional_phones || [];
      const newPhones = result.phones || [];

      // Merge sem duplicatas
      const allPhones = [...new Set([...existingPhones, ...newPhones])];
      updateData.additional_phones = allPhones;

      stats.phonesFound += newPhones.filter((p: string) => !existingPhones.includes(p)).length;
    }

    // Adicionar emails ao additional_emails (merge com existentes)
    if (emailsFound > 0) {
      const existingEmails = lead.additional_emails || [];
      const newEmails = result.emails || [];

      // Merge sem duplicatas
      const allEmails = [...new Set([...existingEmails, ...newEmails])];
      updateData.additional_emails = allEmails;

      stats.emailsFound += newEmails.filter((e: string) => !existingEmails.includes(e)).length;
    }

    // Email principal se não tiver
    if (!lead.email && result.emails && result.emails.length > 0) {
      updateData.email = result.emails[0];
    }

    // Telefone principal se não tiver
    if (!lead.phone && result.phones && result.phones.length > 0) {
      updateData.phone = result.phones[0];
    }

    await supabase
      .from('instagram_leads')
      .update(updateData)
      .eq('id', lead.id);

    return true;
  } catch (error: any) {
    console.error(`   ❌ Erro URL @${lead.username}:`, error.message);
    stats.errors++;
    return false;
  }
}

async function processLead(lead: any, doBio: boolean, doUrl: boolean): Promise<void> {
  console.log(`\n[${stats.processed + 1}/${stats.total}] @${lead.username}`);

  // 1. Enriquecer BIO
  if (doBio) {
    const bioSuccess = await enrichBio(lead);
    if (bioSuccess) {
      stats.bioEnriched++;
      console.log(`   ✅ Bio enriquecida`);
    }
  }

  // 2. Enriquecer URL
  if (doUrl && lead.website) {
    const urlSuccess = await enrichUrl(lead);
    if (urlSuccess) {
      stats.urlEnriched++;
      console.log(`   ✅ URL enriquecida`);
    }
  }

  stats.processed++;
}

async function fetchAllLeads(limit?: number): Promise<any[]> {
  const allLeads: any[] = [];
  let page = 0;
  const pageSize = 1000;

  console.log('📥 Buscando leads...');

  while (true) {
    let query = supabase
      .from('instagram_leads')
      .select('id, username, full_name, first_name, last_name, bio, website, email, phone, city, state, address, zip_code, profession, business_category, hashtags_bio, hashtags_posts, additional_phones, additional_emails, dado_enriquecido, url_enriched')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar leads:', error);
      break;
    }

    if (data.length === 0) break;

    allLeads.push(...data);
    console.log(`   Página ${page + 1}: ${allLeads.length} leads`);

    if (limit && allLeads.length >= limit) {
      return allLeads.slice(0, limit);
    }

    if (data.length < pageSize) break;
    page++;
  }

  return allLeads;
}

async function main() {
  const args = process.argv.slice(2);
  const bioOnly = args.includes('--bio-only');
  const urlOnly = args.includes('--url-only');
  const limitArg = args.find(a => a.startsWith('--limit'));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf('--limit') + 1]) : undefined;

  const doBio = !urlOnly;
  const doUrl = !bioOnly;

  console.log('🚀 Iniciando Re-Enriquecimento em Lote');
  console.log(`   Bio: ${doBio ? 'SIM' : 'NÃO'}`);
  console.log(`   URL: ${doUrl ? 'SIM' : 'NÃO'}`);
  if (limit) console.log(`   Limite: ${limit} leads`);

  // Buscar todos os leads
  const leads = await fetchAllLeads(limit);
  stats.total = leads.length;

  console.log(`\n📊 Total de leads para processar: ${stats.total}`);

  // Processar em lotes
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);

    for (const lead of batch) {
      await processLead(lead, doBio, doUrl);

      // Delay entre leads
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_LEADS_MS));
    }

    // Mostrar progresso a cada lote
    printProgress();

    // Delay entre lotes
    if (i + BATCH_SIZE < leads.length) {
      console.log(`\n⏳ Aguardando ${DELAY_BETWEEN_BATCHES_MS/1000}s antes do próximo lote...`);
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  // Resultado final
  console.log('\n' + '='.repeat(60));
  console.log('✅ RE-ENRIQUECIMENTO CONCLUÍDO');
  console.log('='.repeat(60));
  printProgress();

  const elapsed = (Date.now() - stats.startTime.getTime()) / 1000 / 60;
  console.log(`\n⏱️  Tempo total: ${elapsed.toFixed(1)} minutos`);
}

main().catch(console.error);
