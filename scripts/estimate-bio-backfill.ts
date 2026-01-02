/**
 * Estima o impacto do backfill de WhatsApp da bio
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { extractWhatsAppFromBio, isValidBrazilNumber } from '../src/utils/whatsapp-extractor.util';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function estimate() {
  console.log('🔍 Estimando impacto do backfill de bio...\n');

  // Contar total de leads sem whatsapp_number mas com bio
  const { count: totalSemWhatsApp } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .is('whatsapp_number', null)
    .not('bio', 'is', null)
    .neq('bio', '');

  console.log('📊 Leads sem whatsapp_number com bio: ' + (totalSemWhatsApp || 0));

  // Amostra para estimar taxa de extração
  const { data: sample, error } = await supabase
    .from('instagram_leads')
    .select('id, username, bio')
    .is('whatsapp_number', null)
    .not('bio', 'is', null)
    .neq('bio', '')
    .limit(1000);

  if (error || !sample || sample.length === 0) {
    console.error('Erro ao buscar amostra:', error?.message);
    return;
  }

  let extraidos = 0;
  const exemplos: Array<{ username: string; bio: string; number: string }> = [];

  for (const lead of sample) {
    const number = extractWhatsAppFromBio(lead.bio);
    if (number && isValidBrazilNumber(number)) {
      extraidos++;
      if (exemplos.length < 10) {
        exemplos.push({
          username: lead.username,
          bio: lead.bio.substring(0, 80),
          number
        });
      }
    }
  }

  const taxa = (extraidos / sample.length) * 100;
  const estimativaTotal = Math.round((totalSemWhatsApp || 0) * (extraidos / sample.length));

  console.log('📱 Amostra analisada: ' + sample.length + ' leads');
  console.log('✅ Telefones extraídos: ' + extraidos);
  console.log('📈 Taxa de extração: ' + taxa.toFixed(1) + '%');
  console.log('\n🎯 ESTIMATIVA: ~' + estimativaTotal + ' leads podem ter WhatsApp extraído da bio');

  if (exemplos.length > 0) {
    console.log('\n📋 EXEMPLOS DE NÚMEROS EXTRAÍVEIS:');
    console.log('─'.repeat(60));
    for (const ex of exemplos) {
      console.log(`@${ex.username.padEnd(25)} → ${ex.number}`);
      console.log(`   Bio: "${ex.bio}..."`);
    }
  }
}

estimate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Erro:', err);
    process.exit(1);
  });
