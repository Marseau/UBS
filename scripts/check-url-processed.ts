import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const campaignId = 'e14454d3-9c58-4607-9592-a590a5c807c7';

  const { data: cl } = await supabase
    .from('campaign_leads')
    .select('lead_id')
    .eq('campaign_id', campaignId);

  if (!cl) return;

  const leadIds = cl.map(c => c.lead_id);

  // Verificar em batches
  let urlProcessed = 0;
  let urlFound = 0;
  let urlNone = 0;
  let bioStatus = { pending: 0, found: 0, none: 0 };

  for (let i = 0; i < leadIds.length; i += 100) {
    const batch = leadIds.slice(i, i + 100);
    const { data } = await supabase
      .from('instagram_leads')
      .select('whatsapp_url_status, whatsapp_bio_status')
      .in('id', batch);

    data?.forEach(l => {
      if (l.whatsapp_url_status === 'found') { urlProcessed++; urlFound++; }
      if (l.whatsapp_url_status === 'none') { urlProcessed++; urlNone++; }
      if (l.whatsapp_bio_status === 'pending') bioStatus.pending++;
      if (l.whatsapp_bio_status === 'found') bioStatus.found++;
      if (l.whatsapp_bio_status === 'none') bioStatus.none++;
    });
  }

  console.log('URL processados:', urlProcessed, '(found:', urlFound, ', none:', urlNone, ')');
  console.log('Bio status:', bioStatus);
}
main();
