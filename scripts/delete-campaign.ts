import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteCampaign() {
  const campaignId = '6320fa6d-1e4a-4b6f-91e6-e02cd0dfd2f1';

  console.log('Deletando campanha:', campaignId);

  // Deletar credenciais primeiro
  const { error: err1 } = await supabase
    .from('campaign_credentials')
    .delete()
    .eq('campaign_id', campaignId);
  console.log('Credenciais:', err1?.message || 'OK');

  // Deletar documentos
  const { error: err2 } = await supabase
    .from('campaign_documents')
    .delete()
    .eq('campaign_id', campaignId);
  console.log('Documentos:', err2?.message || 'OK');

  // Deletar campanha (tabela cluster_campaigns)
  const { error: err3 } = await supabase
    .from('cluster_campaigns')
    .delete()
    .eq('id', campaignId);
  console.log('Campanha:', err3?.message || 'OK');

  // Verificar
  const { data } = await supabase
    .from('cluster_campaigns')
    .select('id, campaign_name')
    .limit(5);
  console.log('Campanhas restantes:', data?.length || 0);
  if (data && data.length > 0) {
    console.log(data);
  }
}

deleteCampaign().catch(console.error);
