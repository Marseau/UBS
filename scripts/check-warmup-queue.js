const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CAMPAIGN_ID = 'd2677954-0425-4c2c-9e3a-e69e2e18f215';

async function checkQueue() {
  console.log('=== Verificando fila de warmup ===\n');

  // Check outreach queue with WhatsApp channel
  const { data: queue, error, count } = await supabase
    .from('campaign_outreach_queue')
    .select('id, lead_id, channel, status', { count: 'exact' })
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('channel', 'whatsapp')
    .eq('status', 'pending')
    .limit(10);

  if (error) {
    console.error('Queue Error:', error);
    return;
  }

  console.log('Total na fila WhatsApp (pendentes):', count);

  // Check leads with phone
  if (queue && queue.length > 0) {
    const leadIds = queue.map(q => q.lead_id);
    const { data: leads, error: leadsError } = await supabase
      .from('instagram_leads')
      .select('id, username, phone, full_name, subcluster_id')
      .in('id', leadIds);

    if (leadsError) {
      console.error('Leads Error:', leadsError);
      return;
    }

    console.log('\nLeads da amostra:');
    leads.forEach(l => {
      const phone = l.phone || 'SEM TELEFONE';
      const sub = l.subcluster_id ? l.subcluster_id.substring(0, 8) : 'N/A';
      console.log('- @' + l.username + ': ' + phone + ' (subcluster: ' + sub + ')');
    });

    // Check subclusters with DMs
    const subIds = leads.filter(l => l.subcluster_id).map(l => l.subcluster_id);
    if (subIds.length > 0) {
      const { data: subs } = await supabase
        .from('cluster_subclusters')
        .select('id, cluster_name, dm_scripts, persona')
        .in('id', subIds);

      console.log('\nSubclusters com DMs:');
      subs?.forEach(s => {
        const hasDMs = s.dm_scripts?.scripts?.length > 0;
        const persona = s.persona?.nome || 'N/A';
        console.log('- ' + s.cluster_name + ': DMs=' + (hasDMs ? 'SIM' : 'NAO') + ', Persona=' + persona);
      });
    }
  }

  // Check total leads with phone in campaign
  const { count: leadsWithPhone } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .not('phone', 'is', null);

  console.log('\nTotal leads com telefone no sistema:', leadsWithPhone);
}

checkQueue().catch(console.error);
