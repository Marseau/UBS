/**
 * Verifica se os scrapes de ontem estão persistindo corretamente
 * o WhatsApp extraído da bio na coluna whatsapp_number
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Contextos que indicam WhatsApp na bio
const WHATSAPP_CONTEXTS = [
  'whatsapp', 'wpp', 'zap', 'zapzap', 'whats',
  '📱', '📲', '💬', 'wa.me', 'chama no', 'chame no'
];

// Padrões de telefone brasileiro
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

async function checkPersistence() {
  console.log('🔍 Verificando persistência de WhatsApp da bio (leads de ontem)\n');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`📅 Período: ${yesterday.toISOString().split('T')[0]} → ${today.toISOString().split('T')[0]}\n`);

  // Buscar leads de ontem com bio
  const { data: leads, error } = await supabase
    .from('instagram_leads')
    .select('id, username, bio, whatsapp_number, whatsapp_source, phone, created_at')
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString())
    .not('bio', 'is', null)
    .neq('bio', '')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Erro ao buscar leads:', error.message);
    return;
  }

  if (!leads || leads.length === 0) {
    console.log('⚠️ Nenhum lead encontrado de ontem com bio');
    return;
  }

  console.log(`📊 Total de leads com bio: ${leads.length}\n`);

  // Analisar leads
  const stats = {
    totalComBio: leads.length,
    comContextoWhatsApp: 0,
    comTelefoneNaBio: 0,
    comAmbos: 0, // contexto + telefone
    persistidoCorretamente: 0,
    naoPersistido: 0,
    semTelefone: 0,
  };

  const problemas: Array<{username: string; bio: string; whatsapp_number: string | null}> = [];
  const exemplosOk: Array<{username: string; bio: string; whatsapp_number: string}> = [];

  for (const lead of leads) {
    const temContexto = hasWhatsAppContext(lead.bio);
    const temTelefone = hasPhoneInBio(lead.bio);

    if (temContexto) stats.comContextoWhatsApp++;
    if (temTelefone) stats.comTelefoneNaBio++;

    if (temContexto && temTelefone) {
      stats.comAmbos++;

      if (lead.whatsapp_number) {
        stats.persistidoCorretamente++;
        if (exemplosOk.length < 5) {
          exemplosOk.push({
            username: lead.username,
            bio: lead.bio.substring(0, 100),
            whatsapp_number: lead.whatsapp_number
          });
        }
      } else {
        stats.naoPersistido++;
        if (problemas.length < 10) {
          problemas.push({
            username: lead.username,
            bio: lead.bio.substring(0, 150),
            whatsapp_number: lead.whatsapp_number
          });
        }
      }
    } else if (temContexto && !temTelefone) {
      stats.semTelefone++;
    }
  }

  // Exibir resultados
  console.log('═'.repeat(60));
  console.log('📊 ESTATÍSTICAS');
  console.log('═'.repeat(60));
  console.log(`Total de leads com bio:           ${stats.totalComBio}`);
  console.log(`Com contexto WhatsApp na bio:     ${stats.comContextoWhatsApp}`);
  console.log(`Com telefone na bio:              ${stats.comTelefoneNaBio}`);
  console.log(`Com contexto + telefone:          ${stats.comAmbos}`);
  console.log('─'.repeat(60));
  console.log(`✅ Persistidos corretamente:      ${stats.persistidoCorretamente}`);
  console.log(`❌ NÃO persistidos (problema):    ${stats.naoPersistido}`);
  console.log(`⚠️ Contexto mas sem telefone:     ${stats.semTelefone}`);

  if (stats.comAmbos > 0) {
    const taxa = ((stats.persistidoCorretamente / stats.comAmbos) * 100).toFixed(1);
    console.log('─'.repeat(60));
    console.log(`📈 Taxa de persistência:          ${taxa}%`);
  }
  console.log('═'.repeat(60));

  // Exibir exemplos OK
  if (exemplosOk.length > 0) {
    console.log('\n✅ EXEMPLOS PERSISTIDOS CORRETAMENTE:');
    console.log('─'.repeat(60));
    for (const ex of exemplosOk) {
      console.log(`@${ex.username.padEnd(25)} → ${ex.whatsapp_number}`);
      console.log(`   Bio: "${ex.bio}..."`);
    }
  }

  // Exibir problemas
  if (problemas.length > 0) {
    console.log('\n❌ PROBLEMAS - Bio com contexto+telefone mas whatsapp_number NULL:');
    console.log('─'.repeat(60));
    for (const prob of problemas) {
      console.log(`@${prob.username}`);
      console.log(`   Bio: "${prob.bio}..."`);
      console.log(`   whatsapp_number: ${prob.whatsapp_number || 'NULL'}`);
      console.log('');
    }
  }
}

checkPersistence()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
  });
