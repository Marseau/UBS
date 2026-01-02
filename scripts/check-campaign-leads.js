const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Buscar todos os campaign_leads
  const { data: leads, error } = await supabase
    .from('campaign_leads')
    .select('campaign_id, outreach_channel, status, lead_id');

  if (error) {
    console.log('Erro:', error.message);
    return;
  }

  console.log('\n=== LEADS COM TELEFONE POR CAMPANHA ===\n');
  console.log('Total campaign_leads:', leads.length);

  // Agrupar por campaign_id
  const byCampaign = {};
  leads.forEach(function(l) {
    if (!byCampaign[l.campaign_id]) {
      byCampaign[l.campaign_id] = [];
    }
    byCampaign[l.campaign_id].push(l);
  });

  const campaignIds = Object.keys(byCampaign);
  console.log('Campanhas distintas:', campaignIds.length);

  // Buscar nomes das campanhas
  const { data: campaigns } = await supabase
    .from('cluster_campaigns')
    .select('id, campaign_name, status')
    .in('id', campaignIds);

  const campMap = {};
  (campaigns || []).forEach(function(c) {
    campMap[c.id] = c;
  });

  // Para cada campanha
  for (var i = 0; i < campaignIds.length; i++) {
    var campId = campaignIds[i];
    var campLeads = byCampaign[campId];
    var leadIds = campLeads.map(function(l) { return l.lead_id; });

    // Buscar phones_normalized
    var result = await supabase
      .from('instagram_leads')
      .select('id, phones_normalized')
      .in('id', leadIds);

    var igLeads = result.data || [];

    // Mapear quais têm telefone (array não vazio)
    var phoneMap = {};
    igLeads.forEach(function(il) {
      var hasPhone = il.phones_normalized &&
                     Array.isArray(il.phones_normalized) &&
                     il.phones_normalized.length > 0;
      phoneMap[il.id] = hasPhone;
    });

    var comTel = campLeads.filter(function(l) { return phoneMap[l.lead_id]; }).length;
    var prontosWA = campLeads.filter(function(l) {
      return l.outreach_channel === 'whatsapp' &&
        ['pending', 'pending_retry'].indexOf(l.status) >= 0 &&
        phoneMap[l.lead_id];
    }).length;
    var prontosIG = campLeads.filter(function(l) {
      return l.outreach_channel === 'instagram' &&
        ['pending', 'pending_retry'].indexOf(l.status) >= 0;
    }).length;

    var camp = campMap[campId];
    var campName = camp ? camp.campaign_name : campId.substring(0, 8) + '...';
    var campStatus = camp ? camp.status : 'unknown';

    console.log('');
    console.log('📊 ' + campName + ' [' + campStatus + ']');
    console.log('   Total leads: ' + campLeads.length);
    console.log('   Com telefone: ' + comTel);
    console.log('   ✅ Prontos WhatsApp: ' + prontosWA);
    console.log('   📸 Prontos Instagram: ' + prontosIG);
  }
}

main().catch(function(e) { console.log('Error:', e.message); });
