const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Buscar lead_ids das campanhas
  var res = await supabase
    .from('campaign_leads')
    .select('lead_id')
    .limit(200);

  var leadIds = res.data.map(function(l) { return l.lead_id; });
  console.log('Checando', leadIds.length, 'leads de campanhas...\n');

  // Buscar detalhes desses leads
  var igRes = await supabase
    .from('instagram_leads')
    .select('id, phone, additional_phones, phones_normalized, bio')
    .in('id', leadIds);

  var comPhoneOriginal = 0;
  var comPhonesNormalized = 0;
  var semNenhum = 0;
  var comPhoneMasSemNormalized = [];

  (igRes.data || []).forEach(function(il) {
    var hasOriginal = il.phone && il.phone.trim().length > 0;
    var hasNormalized = il.phones_normalized &&
                        Array.isArray(il.phones_normalized) &&
                        il.phones_normalized.length > 0;

    if (hasOriginal && !hasNormalized) {
      comPhoneMasSemNormalized.push({
        id: il.id,
        phone: il.phone,
        phones_normalized: il.phones_normalized
      });
      comPhoneOriginal++;
    }
    if (hasNormalized) comPhonesNormalized++;
    if (!hasOriginal && !hasNormalized) semNenhum++;
  });

  console.log('=== Resumo (amostra de ' + igRes.data.length + ' leads) ===');
  console.log('Com phone original mas SEM normalized:', comPhoneOriginal);
  console.log('Com phones_normalized:', comPhonesNormalized);
  console.log('Sem nenhum telefone:', semNenhum);

  if (comPhoneMasSemNormalized.length > 0) {
    console.log('\n=== Exemplos de leads com phone mas sem normalized ===');
    comPhoneMasSemNormalized.slice(0, 5).forEach(function(l) {
      console.log('Lead:', l.id);
      console.log('  phone:', l.phone);
      console.log('  phones_normalized:', JSON.stringify(l.phones_normalized));
    });
  }
}

main().catch(function(e) { console.log('Error:', e); });
