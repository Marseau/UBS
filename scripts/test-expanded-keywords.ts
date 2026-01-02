/**
 * Teste das keywords expandidas e janela de contexto aumentada
 * Testa 100 leads na porta 3002
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const API_BASE = 'http://localhost:3000';
const LIMIT = 100;

async function test() {
  console.log('🔍 Buscando 100 leads com website sem whatsapp_number...\n');

  // Buscar leads com website, sem whatsapp_number
  const { data: leads } = await supabase
    .from('instagram_leads')
    .select('id, username, website')
    .is('whatsapp_number', null)
    .eq('url_enriched', true)
    .not('website', 'is', null)
    .not('website', 'ilike', '%wa.me/qr/%')
    .limit(LIMIT);

  if (!leads || leads.length === 0) {
    console.log('Nenhum lead encontrado');
    return;
  }

  console.log(`📋 ${leads.length} leads para testar\n`);

  let found = 0;
  let errors = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i]!;
    const num = `[${i + 1}/${leads.length}]`;

    process.stdout.write(`${num} @${lead.username.substring(0, 25).padEnd(25)}... `);

    try {
      const response = await fetch(`${API_BASE}/api/instagram-scraper/scrape-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          url: lead.website,
          update_database: false  // Não persistir, só testar
        })
      });

      if (!response.ok) {
        console.log('❌ HTTP ' + response.status);
        errors++;
        continue;
      }

      const result: any = await response.json();

      if (result.whatsapp_phones && result.whatsapp_phones.length > 0) {
        found++;
        console.log(`✅ ${result.whatsapp_phones[0]} (${result.whatsapp_phones.length} total)`);
      } else {
        console.log('❌');
      }
    } catch (error: any) {
      console.log(`❌ Erro: ${error.message?.substring(0, 30)}`);
      errors++;
    }

    // Delay entre requests
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 RESULTADO DO TESTE`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`Total testados: ${leads.length}`);
  console.log(`WhatsApps encontrados: ${found}`);
  console.log(`Erros: ${errors}`);
  console.log(`Taxa de sucesso: ${((found / leads.length) * 100).toFixed(1)}%`);
  console.log(`${'═'.repeat(50)}\n`);
}

test().catch(console.error);
