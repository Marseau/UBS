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
  let withNumbers = 0;
  let sources: Record<string, number> = {};

  for (let i = 0; i < leadIds.length; i += 100) {
    const batch = leadIds.slice(i, i + 100);
    const { data } = await supabase
      .from('instagram_leads')
      .select('username, whatsapp_numbers')
      .in('id', batch)
      .not('whatsapp_numbers', 'is', null);

    data?.forEach(l => {
      if (l.whatsapp_numbers && l.whatsapp_numbers.length > 0) {
        withNumbers++;
        l.whatsapp_numbers.forEach((w: any) => {
          sources[w.source] = (sources[w.source] || 0) + 1;
        });
      }
    });
  }

  console.log('Leads com whatsapp_numbers:', withNumbers);
  console.log('Fontes:', sources);
}
main();
