/**
 * Teste: Re-scrape 200 leads já processados
 * Verifica se conseguimos extrair mais WhatsApp com a lógica atual
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_BASE = 'http://localhost:3000';

async function scrapeUrl(url: string): Promise<{ whatsapp_phones: string[] } | null> {
  try {
    const response = await fetch(`${API_BASE}/api/instagram-scraper/scrape-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, deepLinks: true })
    });

    if (!response.ok) return null;
    const data = await response.json() as { whatsapp_phones?: string[] };
    return data as { whatsapp_phones: string[] };
  } catch {
    return null;
  }
}

async function testRescrape() {
  console.log('🧪 Teste: Re-scrape de 200 leads já processados\n');

  // Buscar 200 leads já processados mas sem whatsapp_number
  const { data: leads, error } = await supabase
    .from('instagram_leads')
    .select('id, username, website, created_at')
    .is('whatsapp_number', null)
    .eq('url_enriched', true)
    .not('website', 'is', null)
    .not('website', 'ilike', '%wa.me/qr/%')
    .not('website', 'ilike', '%wa.me/message/%')
    .order('created_at', { ascending: true })
    .limit(200);

  if (error || !leads) {
    console.error('❌ Erro ao buscar leads:', error?.message);
    return;
  }

  console.log(`📦 Processando ${leads.length} leads...\n`);

  let totalProcessed = 0;
  let totalFound = 0;
  let totalFailed = 0;

  for (const lead of leads) {
    totalProcessed++;

    process.stdout.write(`[${totalProcessed}/${leads.length}] @${lead.username}... `);

    const result = await scrapeUrl(lead.website);

    if (result && result.whatsapp_phones && result.whatsapp_phones.length > 0) {
      const phone = result.whatsapp_phones[0];
      console.log(`✅ ${phone}`);
      totalFound++;

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
      console.log('❌ não encontrado');
      totalFailed++;
    }

    // Pequeno delay para não sobrecarregar
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n========================================');
  console.log('📊 RESULTADO DO TESTE');
  console.log('========================================');
  console.log(`Total processados: ${totalProcessed}`);
  console.log(`WhatsApp encontrados: ${totalFound}`);
  console.log(`Sem WhatsApp: ${totalFailed}`);
  console.log(`Taxa de sucesso: ${((totalFound / totalProcessed) * 100).toFixed(1)}%`);
  console.log('========================================\n');
}

testRescrape()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  });
