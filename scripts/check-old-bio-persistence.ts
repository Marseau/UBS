/**
 * Verifica leads ANTIGOS (antes de ontem) para ver se WhatsApp da bio foi persistido
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WHATSAPP_CONTEXTS = ['whatsapp', 'wpp', 'zap', 'zapzap', 'whats', '📱', '📲', '💬', 'wa.me', 'chama no', 'chame no'];
const PHONE_PATTERNS = [
  /\+?55\s*\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4}/,
  /\(?\d{2}\)?\s*9\s*\d{4}[-\s]?\d{4}/,
  /\(?\d{2}\)?\s*9\d{4}[-\s]?\d{4}/,
];

function hasWhatsAppContext(bio: string): boolean {
  const bioLower = bio.toLowerCase();
  return WHATSAPP_CONTEXTS.some(ctx => bioLower.includes(ctx));
}

function hasPhoneInBio(bio: string): boolean {
  return PHONE_PATTERNS.some(pattern => pattern.test(bio));
}

async function check() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  console.log('🔍 Verificando leads ANTERIORES a ontem (antes de ' + yesterday.toISOString().split('T')[0] + ')\n');

  // Buscar leads anteriores a ontem com bio - amostra de 2000
  const { data: leads, error } = await supabase
    .from('instagram_leads')
    .select('id, username, bio, whatsapp_number, created_at')
    .lt('created_at', yesterday.toISOString())
    .not('bio', 'is', null)
    .neq('bio', '')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error || !leads) {
    console.error('Erro:', error?.message);
    return;
  }

  let comAmbos = 0;
  let persistido = 0;
  let naoPersistido = 0;
  const problemas: Array<{ username: string; bio: string }> = [];

  for (const lead of leads) {
    if (hasWhatsAppContext(lead.bio) && hasPhoneInBio(lead.bio)) {
      comAmbos++;
      if (lead.whatsapp_number) {
        persistido++;
      } else {
        naoPersistido++;
        if (problemas.length < 5) {
          problemas.push({ username: lead.username, bio: lead.bio.substring(0, 120) });
        }
      }
    }
  }

  console.log('📊 Leads analisados: ' + leads.length);
  console.log('📱 Com contexto + telefone: ' + comAmbos);
  console.log('✅ Persistidos: ' + persistido);
  console.log('❌ NÃO persistidos: ' + naoPersistido);
  console.log('📈 Taxa: ' + (comAmbos > 0 ? ((persistido / comAmbos) * 100).toFixed(1) : 0) + '%');

  if (problemas.length > 0) {
    console.log('\n❌ EXEMPLOS NÃO PERSISTIDOS:');
    problemas.forEach(p => console.log('@' + p.username + ': "' + p.bio + '..."'));
  }
}

check()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Erro:', err);
    process.exit(1);
  });
