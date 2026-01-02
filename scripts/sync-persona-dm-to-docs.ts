/**
 * Script para sincronizar personas e DM scripts existentes como documentos RAG
 * Executa uma vez para campanhas que já têm conteúdo gerado
 */

// Carregar .env ANTES de qualquer outro import
import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { campaignDocumentProcessor } from '../src/services/campaign-document-processor.service';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function syncPersonaDMToDocs() {
  console.log('\n🔄 Sincronizando Personas e DM Scripts para documentos RAG...\n');

  // Buscar campanhas que têm persona ou DM scripts gerados
  const { data: campaigns, error } = await supabase
    .from('cluster_campaigns')
    .select('id, campaign_name, nicho_principal, generated_persona, generated_dm_scripts')
    .or('generated_persona.neq.null,generated_dm_scripts.neq.null');

  if (error) {
    console.error('❌ Erro ao buscar campanhas:', error.message);
    return;
  }

  console.log(`📋 Encontradas ${campaigns?.length || 0} campanhas com conteúdo gerado\n`);

  for (const campaign of campaigns || []) {
    console.log(`\n📦 Processando: ${campaign.campaign_name} (${campaign.id})`);

    // Verificar se já existem documentos auto-gerados para esta campanha
    const { data: existingDocs } = await supabase
      .from('campaign_documents')
      .select('title')
      .eq('campaign_id', campaign.id)
      .like('title', '%Gerada Automaticamente%');

    const existingTitles = (existingDocs || []).map(d => d.title);

    // Criar documento para Persona se existir e não foi criado ainda
    if (campaign.generated_persona && !existingTitles.includes('Persona ICP - Gerada Automaticamente')) {
      console.log('   📄 Criando documento para Persona ICP...');

      const personaResult = await campaignDocumentProcessor.processDocument({
        campaignId: campaign.id,
        title: 'Persona ICP - Gerada Automaticamente',
        docType: 'knowledge',
        content: campaign.generated_persona,
        metadata: {
          source: 'auto-generated',
          syncedAt: new Date().toISOString(),
          nicho: campaign.nicho_principal
        }
      });

      if (personaResult.success) {
        console.log(`   ✅ Persona: ${personaResult.chunksCreated} chunks criados`);
      } else {
        console.error(`   ❌ Erro Persona: ${personaResult.error}`);
      }
    } else if (existingTitles.includes('Persona ICP - Gerada Automaticamente')) {
      console.log('   ⏭️  Persona já existe como documento');
    }

    // Criar documento para DM Scripts se existir e não foi criado ainda
    if (campaign.generated_dm_scripts && !existingTitles.includes('Scripts de DM Outreach - Gerados Automaticamente')) {
      console.log('   📄 Criando documento para DM Scripts...');

      const dmResult = await campaignDocumentProcessor.processDocument({
        campaignId: campaign.id,
        title: 'Scripts de DM Outreach - Gerados Automaticamente',
        docType: 'script',
        content: campaign.generated_dm_scripts,
        metadata: {
          source: 'auto-generated',
          syncedAt: new Date().toISOString(),
          nicho: campaign.nicho_principal
        }
      });

      if (dmResult.success) {
        console.log(`   ✅ DM Scripts: ${dmResult.chunksCreated} chunks criados`);
      } else {
        console.error(`   ❌ Erro DM Scripts: ${dmResult.error}`);
      }
    } else if (existingTitles.includes('Scripts de DM Outreach - Gerados Automaticamente')) {
      console.log('   ⏭️  DM Scripts já existem como documento');
    }
  }

  console.log('\n✅ Sincronização concluída!\n');
}

syncPersonaDMToDocs().catch(console.error);
