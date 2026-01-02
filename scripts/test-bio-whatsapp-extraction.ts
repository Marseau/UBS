/**
 * Script para testar extração de WhatsApp da bio via API /enrich-lead
 * Processa os mesmos 80 leads que foram processados para URL
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_BASE = process.env.API_BASE || 'http://localhost:3002';

async function main() {
  console.log('🔍 Buscando os 80 leads já processados para URL...\n');

  const campaignId = 'e14454d3-9c58-4607-9592-a590a5c807c7';

  // Buscar leads que já foram processados para URL (found ou none)
  const { data: cl } = await supabase
    .from('campaign_leads')
    .select('lead_id')
    .eq('campaign_id', campaignId);

  if (!cl) {
    console.error('Erro ao buscar leads');
    return;
  }

  const leadIds = cl.map(c => c.lead_id);
  let leads: any[] = [];

  // Buscar em batches de 100
  for (let i = 0; i < leadIds.length && leads.length < 80; i += 100) {
    const batch = leadIds.slice(i, i + 100);
    const { data } = await supabase
      .from('instagram_leads')
      .select('id, username, bio, full_name, whatsapp_bio_status')
      .in('id', batch)
      .eq('whatsapp_bio_status', 'pending')
      .not('bio', 'is', null);

    // Filtrar leads COM contexto de WhatsApp na bio
    const filtered = data?.filter(l => {
      const bio = l.bio || '';
      const bioLower = bio.toLowerCase();
      return bioLower.includes('whatsapp') || bioLower.includes('wpp') ||
             bioLower.includes('zap') || bio.includes('📱') ||
             bio.includes('📲') || bio.includes('💬');
    }) || [];

    if (filtered.length > 0) leads = [...leads, ...filtered];
  }

  leads = leads.slice(0, 80);
  console.log(`📋 ${leads.length} leads para processar\n`);

  if (leads.length === 0) {
    console.log('Nenhum lead encontrado');
    return;
  }

  let processed = 0, found = 0;

  for (const lead of leads) {
    processed++;
    process.stdout.write(`[${processed}/${leads.length}] @${lead.username.padEnd(25)}`);

    try {
      const response = await fetch(`${API_BASE}/api/instagram/enrich-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: lead.id,
          username: lead.username,
          bio: lead.bio || '',
          full_name: lead.full_name || ''
        })
      });

      const result: any = await response.json();

      // API já persiste diretamente - apenas verificar resultado
      const bioWhatsApp = result.whatsapp_numbers?.filter((w: any) => w.source === 'bio') || [];

      if (bioWhatsApp.length > 0) {
        found++;
        console.log(`✅ ${bioWhatsApp[0].number}`);
      } else {
        console.log(`⚪ sem contexto WhatsApp`);
      }
    } catch (error: any) {
      console.log(`❌ ${error.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log(`\n✅ Processados: ${processed} | WhatsApps encontrados: ${found}`);
}

main().catch(console.error);
