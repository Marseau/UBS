/**
 * Script para validar todos os números de phones_normalized via Whapi.cloud
 * Transforma de array de strings para array de objetos com valid_whatsapp: true
 *
 * Uso: npx ts-node scripts/validate-all-phones-whapi.ts
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const WHAPI_TOKEN = 'pot7O6eCrMNhsXIIFiwaqPZ6uuXFvLiu';
const WHAPI_URL = 'https://gate.whapi.cloud';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface PhoneValidation {
  number: string;
  valid_whatsapp?: true;
}

interface Lead {
  id: string;
  username: string;
  phones_normalized: string[];
}

// Estatísticas globais
const stats = {
  totalLeads: 0,
  processedLeads: 0,
  totalPhones: 0,
  validWhatsApp: 0,
  invalidWhatsApp: 0,
  errors: 0,
  startTime: Date.now()
};

async function checkWhatsAppNumber(phone: string): Promise<boolean | null> {
  try {
    const cleanPhone = phone.replace('+', '');

    const response = await axios.post(
      `${WHAPI_URL}/contacts`,
      {
        blocking: 'wait',
        contacts: [cleanPhone]
      },
      {
        headers: {
          'Authorization': `Bearer ${WHAPI_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const contact = response.data?.contacts?.[0];
    return contact?.status === 'valid';
  } catch (error: any) {
    if (error.response?.status === 402) {
      console.error('\n[ERRO] Limite de requisicoes atingido (402). Aguarde ou upgrade do plano.');
      process.exit(1);
    }
    stats.errors++;
    return null;
  }
}

async function validateLeadPhones(lead: Lead): Promise<PhoneValidation[]> {
  const validatedPhones: PhoneValidation[] = [];

  for (const phone of lead.phones_normalized) {
    const isValid = await checkWhatsAppNumber(phone);
    stats.totalPhones++;

    if (isValid === true) {
      validatedPhones.push({ number: phone, valid_whatsapp: true });
      stats.validWhatsApp++;
    } else {
      validatedPhones.push({ number: phone });
      if (isValid === false) {
        stats.invalidWhatsApp++;
      }
    }

    // Delay de 300ms entre verificacoes para nao sobrecarregar
    await new Promise(r => setTimeout(r, 300));
  }

  return validatedPhones;
}

async function updateLeadPhones(leadId: string, validatedPhones: PhoneValidation[]): Promise<boolean> {
  const { error } = await supabase
    .from('instagram_leads')
    .update({
      phones_normalized: validatedPhones,
      updated_at: new Date().toISOString()
    })
    .eq('id', leadId);

  if (error) {
    console.error(`[ERRO] Falha ao atualizar lead ${leadId}:`, error.message);
    return false;
  }
  return true;
}

function printProgress() {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = stats.totalPhones / elapsed;
  const remaining = ((stats.totalLeads - stats.processedLeads) * 1.5) / rate; // estimativa

  const validPercent = stats.totalPhones > 0
    ? Math.round((stats.validWhatsApp / stats.totalPhones) * 100)
    : 0;

  process.stdout.write(
    `\r[${stats.processedLeads}/${stats.totalLeads}] ` +
    `Phones: ${stats.totalPhones} | ` +
    `WhatsApp: ${stats.validWhatsApp} (${validPercent}%) | ` +
    `Sem WA: ${stats.invalidWhatsApp} | ` +
    `Erros: ${stats.errors} | ` +
    `${rate.toFixed(1)}/s | ` +
    `ETA: ${Math.round(remaining / 60)}min    `
  );
}

async function fetchAllLeadsWithPagination(): Promise<Lead[]> {
  const PAGE_SIZE = 1000;
  let offset = 0;
  const allLeads: Lead[] = [];

  console.log('Buscando leads com paginacao...');

  while (true) {
    const { data, error } = await supabase
      .from('instagram_leads')
      .select('id, username, phones_normalized')
      .not('phones_normalized', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Erro ao buscar leads:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    // Filtrar apenas leads que ainda tem array de strings (nao validados)
    const filtered = data.filter((lead: any) => {
      if (!lead.phones_normalized || !Array.isArray(lead.phones_normalized)) return false;
      if (lead.phones_normalized.length === 0) return false;
      return typeof lead.phones_normalized[0] === 'string';
    }) as Lead[];

    allLeads.push(...filtered);
    console.log(`  Pagina ${Math.floor(offset / PAGE_SIZE) + 1}: ${data.length} leads, ${filtered.length} pendentes`);

    offset += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }

  return allLeads;
}

async function main() {
  console.log('==============================================');
  console.log('  VALIDACAO DE WHATSAPP VIA WHAPI.CLOUD');
  console.log('  (com paginacao para processar todos os leads)');
  console.log('==============================================\n');

  const leadsToProcess = await fetchAllLeadsWithPagination();

  stats.totalLeads = leadsToProcess.length;

  const totalPhones = leadsToProcess.reduce((acc, lead) => acc + lead.phones_normalized.length, 0);

  console.log(`Encontrados ${stats.totalLeads} leads com ${totalPhones} telefones para validar\n`);

  if (stats.totalLeads === 0) {
    console.log('Nenhum lead para processar. Todos ja foram validados!');
    return;
  }

  console.log('Iniciando validacao...\n');

  for (const lead of leadsToProcess) {
    const validatedPhones = await validateLeadPhones(lead);
    await updateLeadPhones(lead.id, validatedPhones);

    stats.processedLeads++;
    printProgress();
  }

  // Resultado final
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const validPercent = Math.round((stats.validWhatsApp / stats.totalPhones) * 100);

  console.log('\n\n==============================================');
  console.log('  RESULTADO FINAL');
  console.log('==============================================');
  console.log(`Leads processados: ${stats.processedLeads}`);
  console.log(`Total de telefones: ${stats.totalPhones}`);
  console.log(`Com WhatsApp: ${stats.validWhatsApp} (${validPercent}%)`);
  console.log(`Sem WhatsApp: ${stats.invalidWhatsApp} (${100 - validPercent}%)`);
  console.log(`Erros: ${stats.errors}`);
  console.log(`Tempo total: ${Math.round(elapsed / 60)} minutos`);
  console.log('==============================================\n');
}

main().catch(console.error);
