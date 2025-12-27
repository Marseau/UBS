/**
 * Teste da nova extração de WhatsApp por contexto HTML
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const API_BASE = process.env.API_BASE || 'http://localhost:3000';

async function main() {
  console.log('🔍 Buscando 10 leads com website sem whatsapp_number...\n');

  // Buscar leads com website, sem whatsapp_number, que não seja wa.me
  const { data: leads } = await supabase
    .from('instagram_leads')
    .select('id, username, website')
    .is('whatsapp_number', null)
    .eq('whatsapp_url_status', 'pending')
    .not('website', 'is', null)
    .not('website', 'ilike', '%wa.me/%')  // Excluir wa.me direto (já funciona)
    .limit(10);

  if (!leads || leads.length === 0) {
    console.log('Nenhum lead encontrado');
    return;
  }

  console.log(`📋 ${leads.length} leads para testar\n`);

  let found = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i]!;
    console.log(`[${i+1}/${leads.length}] @${lead.username}`);
    console.log(`   URL: ${(lead.website || '').substring(0, 60)}...`);

    try {
      const response = await fetch(`${API_BASE}/api/instagram-scraper/scrape-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          url: lead.website || '',
          update_database: true
        })
      });

      const result: any = await response.json();

      if (result.whatsapp_phones && result.whatsapp_phones.length > 0) {
        found++;
        console.log(`   ✅ WhatsApp encontrado: ${result.whatsapp_phones.join(', ')}`);
      } else {
        console.log(`   ⚪ Sem WhatsApp (phones: ${result.phones?.length || 0})`);
      }
    } catch (error: any) {
      console.log(`   ❌ Erro: ${error.message}`);
    }

    // Delay entre requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ WhatsApps encontrados: ${found}/${leads.length}`);
}

main().catch(console.error);
