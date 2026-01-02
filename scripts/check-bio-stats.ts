import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const campaignId = 'e14454d3-9c58-4607-9592-a590a5c807c7';

  // Contar leads
  const { data: cl } = await supabase.from('campaign_leads').select('lead_id').eq('campaign_id', campaignId);
  console.log('Total leads na campanha:', cl?.length);

  if (!cl || cl.length === 0) return;

  // Processar em batches
  const leadIds = cl.map(c => c.lead_id);
  let stats = { total: 0, pending: 0, found: 0, none: 0, withBio: 0, withContext: 0, examples: [] as string[] };

  for (let i = 0; i < leadIds.length; i += 100) {
    const batch = leadIds.slice(i, i + 100);
    const { data: leads, error } = await supabase.from('instagram_leads')
      .select('username, whatsapp_bio_status, bio')
      .in('id', batch);

    if (error) {
      console.log('Erro batch', i, ':', error.message);
      continue;
    }
    if (i === 0) console.log('Primeiro batch retornou:', leads?.length, 'leads');

    leads?.forEach(l => {
      stats.total++;
      if (l.whatsapp_bio_status === 'pending') stats.pending++;
      if (l.whatsapp_bio_status === 'found') stats.found++;
      if (l.whatsapp_bio_status === 'none') stats.none++;
      if (l.bio) {
        stats.withBio++;
        const bio = l.bio || '';
        const bioLower = bio.toLowerCase();
        if (bioLower.includes('whatsapp') || bioLower.includes('wpp') ||
            bioLower.includes('zap') || bio.includes('📱') || bio.includes('📲') || bio.includes('💬')) {
          stats.withContext++;
          if (stats.examples.length < 5 && l.whatsapp_bio_status === 'pending') {
            stats.examples.push('@' + l.username + ': ' + bio.substring(0, 60));
          }
        }
      }
    });
  }

  console.log('\nEstatisticas Bio WhatsApp:');
  console.log('  Total leads:', stats.total);
  console.log('  Com bio:', stats.withBio);
  console.log('  Com contexto WhatsApp:', stats.withContext);
  console.log('\nStatus whatsapp_bio_status:');
  console.log('  pending:', stats.pending);
  console.log('  found:', stats.found);
  console.log('  none:', stats.none);

  if (stats.examples.length > 0) {
    console.log('\nExemplos pending com contexto:');
    stats.examples.forEach(e => console.log('  ', e));
  }
}
main();
