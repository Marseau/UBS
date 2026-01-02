/**
 * Testa extração de WhatsApp em amostra de bios
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { extractWhatsAppFromBio, isValidBrazilNumber } from '../src/utils/whatsapp-extractor.util';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Padrões de telefone para verificar manualmente
const PHONE_PATTERNS = [
  /\+?55\s*\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4}/g,
  /\(?\d{2}\)?\s*9\s*\d{4}[-\s]?\d{4}/g,
  /\(?\d{2}\)?\s*9\d{4}[-\s]?\d{4}/g,
];

async function check() {
  // Buscar algumas bios com telefone visível
  const { data: leads, error } = await supabase
    .from('instagram_leads')
    .select('username, bio')
    .is('whatsapp_number', null)
    .not('bio', 'is', null)
    .neq('bio', '')
    .limit(30);

  if (error || !leads) {
    console.error('Erro:', error?.message);
    return;
  }

  console.log('📋 Amostra de bios (sem whatsapp_number):\n');

  let comTelefoneManual = 0;
  let comTelefoneUtil = 0;

  for (const lead of leads) {
    const bio = lead.bio || '';

    // Verificar com regex manual
    let phoneManual = null;
    for (const pattern of PHONE_PATTERNS) {
      const match = bio.match(pattern);
      if (match) {
        phoneManual = match[0];
        break;
      }
    }

    // Verificar com função do util
    const phoneUtil = extractWhatsAppFromBio(bio);

    if (phoneManual) comTelefoneManual++;
    if (phoneUtil) comTelefoneUtil++;

    console.log('@' + lead.username + ':');
    console.log('   Bio: "' + bio.substring(0, 100) + '..."');
    console.log('   Regex manual: ' + (phoneManual || 'null'));
    console.log('   Util extract: ' + (phoneUtil || 'null'));
    console.log('');
  }

  console.log('\n📊 Resumo:');
  console.log('   Com telefone (regex manual): ' + comTelefoneManual);
  console.log('   Com telefone (util extract): ' + comTelefoneUtil);
}

check()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Erro:', err);
    process.exit(1);
  });
