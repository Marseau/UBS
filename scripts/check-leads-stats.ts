import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkLeadsStats() {
  console.log('\n📊 ========== ESTATÍSTICAS DE LEADS ==========\n');

  // 1. Total de leads
  const { count: totalLeads, error: error1 } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true });

  if (error1) {
    console.error('❌ Erro ao contar leads:', error1);
    return;
  }

  console.log(`👥 Total de leads: ${totalLeads?.toLocaleString()}`);

  // 2. Leads com email principal
  const { count: leadsWithEmail, error: error2 } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .not('email', 'is', null);

  // 3. Leads com telefone principal
  const { count: leadsWithPhone, error: error3 } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .not('phone', 'is', null);

  // 4. Buscar TODOS os leads (paginação automática)
  let allLeads: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('instagram_leads')
      .select('email, phone, additional_emails, additional_phones')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('❌ Erro ao buscar leads:', error);
      break;
    }

    if (data && data.length > 0) {
      allLeads = allLeads.concat(data);
      from += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  console.log(`   📦 Total de registros carregados para análise: ${allLeads.length.toLocaleString()}\n`);

  const leadsWithAdditionalEmails = allLeads.filter(l =>
    l.additional_emails && Array.isArray(l.additional_emails) && l.additional_emails.length > 0
  ).length || 0;

  const leadsWithAdditionalPhones = allLeads.filter(l =>
    l.additional_phones && Array.isArray(l.additional_phones) && l.additional_phones.length > 0
  ).length || 0;

  // Contar leads com PELO MENOS 1 contato (qualquer um dos campos)
  const leadsWithAnyContact = allLeads.filter(l => {
    const hasEmail = !!l.email;
    const hasPhone = !!l.phone;
    const hasAdditionalEmail = l.additional_emails && Array.isArray(l.additional_emails) && l.additional_emails.length > 0;
    const hasAdditionalPhone = l.additional_phones && Array.isArray(l.additional_phones) && l.additional_phones.length > 0;

    return hasEmail || hasPhone || hasAdditionalEmail || hasAdditionalPhone;
  }).length || 0;

  const percentageWithContact = totalLeads ? ((leadsWithAnyContact / totalLeads) * 100).toFixed(1) : 0;

  console.log(`📞 Leads com pelo menos 1 telefone/email: ${leadsWithAnyContact.toLocaleString()} (${percentageWithContact}%)`);
  console.log(`\n   📧 Com email principal: ${leadsWithEmail?.toLocaleString()}`);
  console.log(`   📧 Com emails adicionais: ${leadsWithAdditionalEmails.toLocaleString()}`);
  console.log(`   📱 Com telefone principal: ${leadsWithPhone?.toLocaleString()}`);
  console.log(`   📱 Com telefones adicionais: ${leadsWithAdditionalPhones.toLocaleString()}`);

  // 5. Total de hashtags únicas considerando bio E posts
  console.log(`\n🏷️  Analisando hashtags (bio + posts)...`);

  let leadsWithHashtags: any[] = [];
  from = 0;
  hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('instagram_leads')
      .select('hashtags_bio, hashtags_posts')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('❌ Erro ao buscar hashtags:', error);
      break;
    }

    if (data && data.length > 0) {
      leadsWithHashtags = leadsWithHashtags.concat(data);
      from += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  console.log(`   📦 Total de registros analisados: ${leadsWithHashtags.length.toLocaleString()}\n`);

  const allHashtags = new Set<string>();

  leadsWithHashtags.forEach(lead => {
    // Hashtags da bio
    if (lead.hashtags_bio && Array.isArray(lead.hashtags_bio)) {
      lead.hashtags_bio.forEach((tag: string) => allHashtags.add(tag.toLowerCase()));
    }

    // Hashtags dos posts
    if (lead.hashtags_posts && Array.isArray(lead.hashtags_posts)) {
      lead.hashtags_posts.forEach((tag: string) => allHashtags.add(tag.toLowerCase()));
    }
  });

  // Top 10 hashtags mais usadas
  const hashtagCount = new Map<string, number>();
  let totalHashtagsWithRepetitions = 0;

  leadsWithHashtags.forEach(lead => {
    const tags = [
      ...(lead.hashtags_bio || []),
      ...(lead.hashtags_posts || [])
    ];

    tags.forEach((tag: string) => {
      const normalized = tag.toLowerCase();
      hashtagCount.set(normalized, (hashtagCount.get(normalized) || 0) + 1);
      totalHashtagsWithRepetitions++;
    });
  });

  console.log(`🏷️  Total de hashtags (com repetições): ${totalHashtagsWithRepetitions.toLocaleString()}`);
  console.log(`🏷️  Total de hashtags únicas: ${allHashtags.size.toLocaleString()}`);

  const topHashtags = Array.from(hashtagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log(`\n   🔝 Top 10 hashtags mais usadas:`);
  topHashtags.forEach(([tag, count], index) => {
    console.log(`      ${index + 1}. #${tag}: ${count} vezes`);
  });

  // 6. Hashtags na tabela lead_search_terms
  const { count: totalSearchTerms, error: error6 } = await supabase
    .from('lead_search_terms')
    .select('*', { count: 'exact', head: true });

  const { count: activeSearchTerms, error: error7 } = await supabase
    .from('lead_search_terms')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  console.log(`\n📋 Hashtags cadastradas (lead_search_terms): ${totalSearchTerms?.toLocaleString()}`);
  console.log(`   ✅ Ativas: ${(activeSearchTerms || 0).toLocaleString()}`);
  console.log(`   ❌ Inativas: ${((totalSearchTerms || 0) - (activeSearchTerms || 0)).toLocaleString()}`);

  console.log('\n✅ ========== FIM ==========\n');
}

checkLeadsStats().catch(console.error);
