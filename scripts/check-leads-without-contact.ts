import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkLeadsWithoutContact() {
  console.log('\n📊 ========== ANÁLISE DE LEADS SEM CONTATO ==========\n');

  // Buscar TODOS os leads sem contato
  let leadsWithoutContact: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  console.log('🔍 Carregando leads sem contato...\n');

  while (hasMore) {
    const { data, error } = await supabase
      .from('instagram_leads')
      .select('username, bio, website, email, phone, additional_emails, additional_phones')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('❌ Erro ao buscar leads:', error);
      break;
    }

    if (data && data.length > 0) {
      // Filtrar apenas leads SEM nenhum contato
      const filtered = data.filter(lead => {
        const hasEmail = !!lead.email;
        const hasPhone = !!lead.phone;
        const hasAdditionalEmail = lead.additional_emails && Array.isArray(lead.additional_emails) && lead.additional_emails.length > 0;
        const hasAdditionalPhone = lead.additional_phones && Array.isArray(lead.additional_phones) && lead.additional_phones.length > 0;

        return !hasEmail && !hasPhone && !hasAdditionalEmail && !hasAdditionalPhone;
      });

      leadsWithoutContact = leadsWithoutContact.concat(filtered);
      from += pageSize;
      hasMore = data.length === pageSize;

      console.log(`   📦 Processados ${from.toLocaleString()} registros...`);
    } else {
      hasMore = false;
    }
  }

  console.log(`\n👥 Total de leads SEM contato: ${leadsWithoutContact.length.toLocaleString()}\n`);

  // Analisar bio e website
  const leadsWithBio = leadsWithoutContact.filter(l => l.bio && l.bio.trim().length > 0);
  const leadsWithWebsite = leadsWithoutContact.filter(l => l.website && l.website.trim().length > 0);
  const leadsWithBioAndWebsite = leadsWithoutContact.filter(l =>
    l.bio && l.bio.trim().length > 0 &&
    l.website && l.website.trim().length > 0
  );
  const leadsWithBioOrWebsite = leadsWithoutContact.filter(l =>
    (l.bio && l.bio.trim().length > 0) ||
    (l.website && l.website.trim().length > 0)
  );
  const leadsCompletlyEmpty = leadsWithoutContact.filter(l =>
    (!l.bio || l.bio.trim().length === 0) &&
    (!l.website || l.website.trim().length === 0)
  );

  const percentWithBio = (leadsWithBio.length / leadsWithoutContact.length * 100).toFixed(1);
  const percentWithWebsite = (leadsWithWebsite.length / leadsWithoutContact.length * 100).toFixed(1);
  const percentWithBioOrWebsite = (leadsWithBioOrWebsite.length / leadsWithoutContact.length * 100).toFixed(1);
  const percentEmpty = (leadsCompletlyEmpty.length / leadsWithoutContact.length * 100).toFixed(1);

  console.log('📋 Breakdown dos leads sem contato:\n');
  console.log(`   📝 Com bio: ${leadsWithBio.length.toLocaleString()} (${percentWithBio}%)`);
  console.log(`   🔗 Com website: ${leadsWithWebsite.length.toLocaleString()} (${percentWithWebsite}%)`);
  console.log(`   ✅ Com bio OU website: ${leadsWithBioOrWebsite.length.toLocaleString()} (${percentWithBioOrWebsite}%)`);
  console.log(`   📊 Com bio E website: ${leadsWithBioAndWebsite.length.toLocaleString()}`);
  console.log(`   ❌ Completamente vazios: ${leadsCompletlyEmpty.length.toLocaleString()} (${percentEmpty}%)`);

  // Amostras
  console.log('\n🔍 Amostra de leads COM website mas SEM contato (primeiros 10):');
  leadsWithWebsite.slice(0, 10).forEach((lead, index) => {
    console.log(`   ${index + 1}. @${lead.username}`);
    console.log(`      🔗 ${lead.website}`);
    if (lead.bio) {
      const bioPreview = lead.bio.substring(0, 60).replace(/\n/g, ' ');
      console.log(`      📝 "${bioPreview}${lead.bio.length > 60 ? '...' : ''}"`);
    }
  });

  console.log('\n🔍 Amostra de leads VAZIOS (sem bio, sem website, sem contato):');
  leadsCompletlyEmpty.slice(0, 10).forEach((lead, index) => {
    console.log(`   ${index + 1}. @${lead.username}`);
  });

  console.log('\n✅ ========== FIM ==========\n');
}

checkLeadsWithoutContact().catch(console.error);
