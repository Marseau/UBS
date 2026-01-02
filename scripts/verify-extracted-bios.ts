/**
 * Verifica bios que JÁ têm whatsapp_number extraído
 * Para confirmar que a função está funcionando
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Buscar leads COM whatsapp_number extraído da bio
  const { data: leads, error } = await supabase
    .from('instagram_leads')
    .select('username, bio, whatsapp_number, whatsapp_source')
    .not('whatsapp_number', 'is', null)
    .eq('whatsapp_source', 'bio')
    .limit(10);

  if (error || !leads) {
    console.error('Erro:', error?.message);
    return;
  }

  console.log('✅ Leads com WhatsApp extraído da bio:\n');
  console.log('─'.repeat(70));

  for (const lead of leads) {
    console.log('@' + lead.username);
    console.log('   WhatsApp: ' + lead.whatsapp_number);
    console.log('   Source: ' + lead.whatsapp_source);
    console.log('   Bio: "' + (lead.bio || '').substring(0, 120) + '..."');
    console.log('');
  }

  // Contar totais
  const { count: totalBio } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .not('whatsapp_number', 'is', null)
    .eq('whatsapp_source', 'bio');

  const { count: totalWebsite } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .not('whatsapp_number', 'is', null)
    .eq('whatsapp_source', 'website_wa_me');

  const { count: totalHtml } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .not('whatsapp_number', 'is', null)
    .eq('whatsapp_source', 'html_context');

  console.log('═'.repeat(70));
  console.log('📊 TOTAIS POR FONTE:');
  console.log('─'.repeat(70));
  console.log('   Bio: ' + (totalBio || 0));
  console.log('   Website wa.me: ' + (totalWebsite || 0));
  console.log('   HTML context: ' + (totalHtml || 0));
  console.log('═'.repeat(70));
}

check()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Erro:', err);
    process.exit(1);
  });
