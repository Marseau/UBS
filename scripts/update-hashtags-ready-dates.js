const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateInBatches() {
  let totalUpdated = 0;
  let batch = 0;

  while (true) {
    batch++;

    // Buscar leads onde updated_at != created_at
    const { data: leads, error: fetchError } = await supabase
      .from('instagram_leads')
      .select('id, created_at')
      .eq('hashtags_ready_for_embedding', true)
      .neq('updated_at', supabase.raw('created_at'))
      .limit(500);

    if (fetchError) {
      // Fallback: buscar todos e filtrar depois
      const { data: allLeads, error: allError } = await supabase
        .from('instagram_leads')
        .select('id, created_at, updated_at')
        .eq('hashtags_ready_for_embedding', true)
        .limit(500);

      if (allError) {
        console.error('Fetch error:', allError);
        break;
      }

      // Filtrar os que precisam ser atualizados
      const toUpdate = allLeads.filter(l => l.updated_at !== l.created_at);

      if (toUpdate.length === 0) {
        console.log('No more leads to update');
        break;
      }

      // Atualizar cada um individualmente com seu created_at
      for (const lead of toUpdate) {
        const { error: updateError } = await supabase
          .from('instagram_leads')
          .update({ updated_at: lead.created_at })
          .eq('id', lead.id);

        if (updateError) {
          console.error('Update error for', lead.id, ':', updateError);
        } else {
          totalUpdated++;
        }
      }

      console.log(`Batch ${batch}: updated ${toUpdate.length} leads (total: ${totalUpdated})`);
      continue;
    }

    if (!leads || leads.length === 0) {
      console.log('No more leads to update');
      break;
    }

    // Atualizar cada um com seu created_at
    for (const lead of leads) {
      const { error: updateError } = await supabase
        .from('instagram_leads')
        .update({ updated_at: lead.created_at })
        .eq('id', lead.id);

      if (updateError) {
        console.error('Update error for', lead.id, ':', updateError);
      } else {
        totalUpdated++;
      }
    }

    console.log(`Batch ${batch}: updated ${leads.length} leads (total: ${totalUpdated})`);
  }

  console.log(`\nTotal updated: ${totalUpdated}`);
}

updateInBatches();
