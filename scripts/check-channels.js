const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  // Check known campaigns
  const { data: campaigns, error: e2 } = await supabase
    .from('cluster_campaigns')
    .select('*')
    .or('campaign_name.ilike.%Busca%,campaign_name.ilike.%Teste%Embed%')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('=== CAMPANHAS CONHECIDAS ===');
  if (e2) {
    console.log('Erro:', e2.message);
  } else if (!campaigns || campaigns.length === 0) {
    console.log('Nenhuma campanha encontrada');
  } else {
    campaigns.forEach(c => {
      console.log('');
      console.log('📋 ' + (c.campaign_name || c.name));
      console.log('   ID: ' + c.id);
      console.log('   Nicho: ' + (c.nicho_principal || c.nicho));
      console.log('   Cluster Status: ' + c.cluster_status);
      // Show all keys to understand structure
      console.log('   Campos:', Object.keys(c).join(', '));
    });
  }

  // Check whatsapp_sessions
  const { data: sessions, error: e1 } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .order('created_at', { ascending: false });

  console.log('');
  console.log('=== SESSÕES WHATSAPP ===');
  if (e1) {
    console.log('Erro:', e1.message);
  } else if (!sessions || sessions.length === 0) {
    console.log('Nenhuma sessão criada ainda');
  } else {
    sessions.forEach(s => {
      console.log('- [' + (s.is_active ? 'ATIVO' : 'INATIVO') + '] ' + (s.session_name || 'Sem nome'));
      console.log('  Phone: ' + (s.phone_number || 'N/A') + ' | Status: ' + s.status);
      console.log('  Campaign ID: ' + s.campaign_id);
    });
  }

  // Check if there's a resolve_campaign_from_contact function behavior
  console.log('');
  console.log('=== WORKFLOW N8N ===');
  console.log('O workflow AIC WhatsApp AI Agent v7 usa Whapi via API');
  console.log('Token Whapi: pot7O6eCrMNhsXIIFiwaqPZ6uuXFvLiu');
  console.log('Este token representa UM CANAL físico (um número de WhatsApp)');
  console.log('');
  console.log('🔍 DIAGNÓSTICO:');
  console.log('   - Tabela whatsapp_sessions: VAZIA (não há sessões cadastradas)');
  console.log('   - O rate limit atual está sendo controlado por:');
  console.log('     1. Workflow n8n (sem verificação de limites)');
  console.log('     2. Ou código TypeScript (outreach-agent.service.ts)');
}

check().catch(console.error);
