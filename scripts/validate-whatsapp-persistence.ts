/**
 * Teste de validação: verificar se WhatsApp extraído está persistido em whatsapp_number
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('='.repeat(60));
  console.log('TESTE 1: Leads com wa.me no website (100 mais antigos)');
  console.log('='.repeat(60));

  // Buscar 100 leads mais antigos com wa.me no website
  const { data: waMeLeads } = await supabase
    .from('instagram_leads')
    .select('id, username, website, whatsapp_number, whatsapp_numbers, created_at')
    .ilike('website', '%wa.me%')
    .order('created_at', { ascending: true })
    .limit(100);

  let waMePersisted = 0;
  let waMeNotPersisted = 0;
  let waMeExamples: string[] = [];

  waMeLeads?.forEach(lead => {
    // Extrair número do wa.me
    const match = lead.website?.match(/wa\.me\/(\d+)/i);
    const extractedNumber = match ? match[1] : null;

    if (extractedNumber) {
      // Verificar se está em whatsapp_number ou whatsapp_numbers
      const inColumn = lead.whatsapp_number?.includes(extractedNumber.slice(-8));
      const inArray = lead.whatsapp_numbers?.some((w: any) => w.number?.includes(extractedNumber.slice(-8)));

      if (inColumn || inArray) {
        waMePersisted++;
      } else {
        waMeNotPersisted++;
        if (waMeExamples.length < 5) {
          waMeExamples.push(`@${lead.username}: wa.me/${extractedNumber} -> whatsapp_number=${lead.whatsapp_number || 'NULL'}`);
        }
      }
    }
  });

  console.log(`✅ Persistidos: ${waMePersisted}`);
  console.log(`❌ NÃO persistidos: ${waMeNotPersisted}`);
  if (waMeExamples.length > 0) {
    console.log('\nExemplos não persistidos:');
    waMeExamples.forEach(e => console.log(`   ${e}`));
  }

  console.log('\n' + '='.repeat(60));
  console.log('TESTE 2: Leads com WhatsApp na bio (100 mais antigos)');
  console.log('='.repeat(60));

  // Buscar 100 leads mais antigos com contexto WhatsApp na bio
  const { data: allLeads } = await supabase
    .from('instagram_leads')
    .select('id, username, bio, whatsapp_number, whatsapp_numbers, created_at')
    .not('bio', 'is', null)
    .order('created_at', { ascending: true })
    .limit(2000);

  // Filtrar leads com contexto WhatsApp na bio
  const bioLeads = allLeads?.filter(l => {
    const bio = l.bio || '';
    const bioLower = bio.toLowerCase();
    return (bioLower.includes('whatsapp') || bioLower.includes('wpp') ||
            bioLower.includes('zap') || bio.includes('📱') ||
            bio.includes('📲') || bio.includes('💬')) &&
           /\d{2}\s*9?\d{4}[-\s]?\d{4}/.test(bio);
  }).slice(0, 100);

  let bioPersisted = 0;
  let bioNotPersisted = 0;
  let bioExamples: string[] = [];

  bioLeads?.forEach(lead => {
    // Extrair telefone da bio
    const phoneMatch = lead.bio?.match(/(\d{2})\s*(\d{4,5})[-.\s]?(\d{4})/);
    if (phoneMatch) {
      const extractedPhone = phoneMatch[1] + phoneMatch[2] + phoneMatch[3];
      const last8 = extractedPhone.slice(-8);

      const inColumn = lead.whatsapp_number?.includes(last8);
      const inArray = lead.whatsapp_numbers?.some((w: any) => w.number?.includes(last8));

      if (inColumn || inArray) {
        bioPersisted++;
      } else {
        bioNotPersisted++;
        if (bioExamples.length < 5) {
          bioExamples.push(`@${lead.username}: bio tem ${extractedPhone} -> whatsapp_number=${lead.whatsapp_number || 'NULL'}`);
        }
      }
    }
  });

  console.log(`✅ Persistidos: ${bioPersisted}`);
  console.log(`❌ NÃO persistidos: ${bioNotPersisted}`);
  if (bioExamples.length > 0) {
    console.log('\nExemplos não persistidos:');
    bioExamples.forEach(e => console.log(`   ${e}`));
  }

  console.log('\n' + '='.repeat(60));
  console.log('RESUMO');
  console.log('='.repeat(60));
  console.log(`wa.me: ${waMePersisted}/${waMePersisted + waMeNotPersisted} persistidos (${Math.round(waMePersisted/(waMePersisted+waMeNotPersisted)*100)}%)`);
  console.log(`Bio: ${bioPersisted}/${bioPersisted + bioNotPersisted} persistidos (${Math.round(bioPersisted/(bioPersisted+bioNotPersisted)*100) || 0}%)`);
}

main().catch(console.error);
