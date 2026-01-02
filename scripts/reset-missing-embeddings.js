const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function resetMissingLeads() {
  console.log('Buscando leads que precisam reset...');

  // Fetch all in pages
  let allLeads = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('lead_embeddings')
      .select('id, lead_id')
      .not('embedding_bio', 'is', null)
      .is('embedding_website', null)
      .not('embedding_final', 'is', null)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Erro na busca:', error);
      return;
    }

    if (data && data.length > 0) {
      allLeads = allLeads.concat(data);
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  console.log('Total leads encontrados:', allLeads.length);

  if (allLeads.length === 0) {
    console.log('Nenhum lead para resetar.');
    return;
  }

  // Update in batches of 100
  const batchSize = 100;
  let updated = 0;

  for (let i = 0; i < allLeads.length; i += batchSize) {
    const batch = allLeads.slice(i, i + batchSize);
    const ids = batch.map(l => l.id);

    const { error: updateError } = await supabase
      .from('lead_embeddings')
      .update({ embedding_final: null })
      .in('id', ids);

    if (updateError) {
      console.error('Erro ao atualizar batch:', updateError);
    } else {
      updated += batch.length;
      process.stdout.write(`\rProgresso: ${updated}/${allLeads.length}`);
    }
  }

  console.log('\n\nLeads resetados com sucesso:', updated);
}

resetMissingLeads().catch(console.error);
