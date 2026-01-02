const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Canal Whapi usado nos testes
const WHAPI_TOKEN = 'pot7O6eCrMNhsXIIFiwaqPZ6uuXFvLiu';

// Campanhas que usam este canal
const CAMPAIGN_IDS = [
  '31edb734-27d1-452e-9620-131d67c392f3', // Teste do Embeddamento
  'd2677954-0425-4c2c-9e3a-e69e2e18f215'  // Busca Leads Agendamento
];

async function setup() {
  console.log('=== SETUP WHAPI CHANNEL ===\n');

  // 1. Verificar colunas de cluster_campaigns
  console.log('1. Verificando colunas de cluster_campaigns...');
  const { data: cols } = await supabase.rpc('execute_sql', {
    query_text: `SELECT column_name FROM information_schema.columns
                 WHERE table_name = 'cluster_campaigns'
                 AND column_name LIKE '%whapi%' OR column_name LIKE '%channel%'
                 ORDER BY ordinal_position`
  });
  console.log('   Colunas relacionadas a canal:', cols);

  // 2. Adicionar coluna whapi_channel_uuid se não existir
  console.log('\n2. Garantindo coluna whapi_channel_uuid...');
  const { error: alterError } = await supabase.rpc('execute_sql', {
    query_text: `ALTER TABLE cluster_campaigns
                 ADD COLUMN IF NOT EXISTS whapi_channel_uuid UUID REFERENCES whapi_channels(id)`
  });
  if (alterError) {
    console.log('   Erro:', alterError.message);
  } else {
    console.log('   ✅ Coluna garantida');
  }

  // 3. Buscar canal existente
  console.log('\n3. Buscando canal existente...');
  const { data: channel } = await supabase
    .from('whapi_channels')
    .select('*')
    .eq('api_token', WHAPI_TOKEN)
    .single();

  if (!channel) {
    console.log('   ❌ Canal não encontrado');
    return;
  }

  console.log('   📡 Canal:', channel.name);
  console.log('   📱 Telefone:', channel.phone_number);
  console.log('   UUID:', channel.id);

  // 4. Vincular campanhas via SQL direto
  console.log('\n4. Vinculando campanhas ao canal...');
  for (const campId of CAMPAIGN_IDS) {
    const { data: result, error } = await supabase.rpc('execute_sql', {
      query_text: `UPDATE cluster_campaigns
                   SET whapi_channel_uuid = '${channel.id}'
                   WHERE id = '${campId}'
                   RETURNING campaign_name`
    });

    if (error) {
      console.log('   ❌ Erro:', error.message);
    } else {
      console.log('   ✅', result[0]?.campaign_name || campId, '-> vinculada');
    }
  }

  // 5. Verificar resultado
  console.log('\n5. Verificando configuração final...');
  const { data: verifyResult } = await supabase.rpc('execute_sql', {
    query_text: `SELECT cc.campaign_name, cc.whapi_channel_uuid, wc.name as channel_name
                 FROM cluster_campaigns cc
                 LEFT JOIN whapi_channels wc ON wc.id = cc.whapi_channel_uuid
                 WHERE cc.id IN ('${CAMPAIGN_IDS.join("','")}')`
  });

  console.log('\n=== RESULTADO ===');
  console.log('\n📡 Canal:', channel.name);
  console.log('   📱 Telefone:', channel.phone_number);
  console.log('   Rate Limits: ' + channel.rate_limit_hourly + '/h, ' + channel.rate_limit_daily + '/dia');

  console.log('\n📋 Campanhas:');
  if (verifyResult) {
    verifyResult.forEach(c => {
      const linked = c.whapi_channel_uuid ? '✅' : '❌';
      console.log('   ' + linked + ' ' + c.campaign_name + ' -> ' + (c.channel_name || 'sem canal'));
    });
  }

  console.log('\n✅ Setup concluído!');
  console.log('\n⚠️  IMPORTANTE: Ambas as campanhas COMPARTILHAM o limite');
  console.log('   de ' + channel.rate_limit_daily + ' msgs/dia deste canal.');
}

setup().catch(console.error);
