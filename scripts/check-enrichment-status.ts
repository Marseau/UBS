import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkEnrichmentStatus() {
  console.log('\n📊 ========== ANÁLISE DE ENRIQUECIMENTO DE DADOS ==========\n');

  // 1. Total de leads
  const { count: totalLeads } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true });

  console.log(`👥 Total de leads: ${totalLeads?.toLocaleString()}\n`);

  // 2. Status de dado_enriquecido
  const { count: dadoEnriquecidoTrue } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .eq('dado_enriquecido', true);

  const { count: dadoEnriquecidoFalse } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .eq('dado_enriquecido', false);

  const dadoEnriquecidoNull = (totalLeads || 0) - (dadoEnriquecidoTrue || 0) - (dadoEnriquecidoFalse || 0);

  console.log('📝 Status: dado_enriquecido');
  console.log(`   ✅ TRUE: ${(dadoEnriquecidoTrue || 0).toLocaleString()} (${((dadoEnriquecidoTrue || 0) / (totalLeads || 1) * 100).toFixed(1)}%)`);
  console.log(`   ❌ FALSE: ${(dadoEnriquecidoFalse || 0).toLocaleString()} (${((dadoEnriquecidoFalse || 0) / (totalLeads || 1) * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  NULL: ${dadoEnriquecidoNull.toLocaleString()} (${(dadoEnriquecidoNull / (totalLeads || 1) * 100).toFixed(1)}%)`);

  // 3. Status de url_enriched
  const { count: urlEnrichedTrue } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .eq('url_enriched', true);

  const { count: urlEnrichedFalse } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .eq('url_enriched', false);

  const urlEnrichedNull = (totalLeads || 0) - (urlEnrichedTrue || 0) - (urlEnrichedFalse || 0);

  console.log('\n🔗 Status: url_enriched');
  console.log(`   ✅ TRUE: ${(urlEnrichedTrue || 0).toLocaleString()} (${((urlEnrichedTrue || 0) / (totalLeads || 1) * 100).toFixed(1)}%)`);
  console.log(`   ❌ FALSE: ${(urlEnrichedFalse || 0).toLocaleString()} (${((urlEnrichedFalse || 0) / (totalLeads || 1) * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  NULL: ${urlEnrichedNull.toLocaleString()} (${(urlEnrichedNull / (totalLeads || 1) * 100).toFixed(1)}%)`);

  // 4. Leads elegíveis para o workflow (dado_enriquecido=TRUE e url_enriched=FALSE e website IS NOT NULL)
  const { count: elegiveis } = await supabase
    .from('instagram_leads')
    .select('*', { count: 'exact', head: true })
    .eq('dado_enriquecido', true)
    .eq('url_enriched', false)
    .not('website', 'is', null)
    .neq('website', '');

  console.log(`\n🎯 Leads ELEGÍVEIS para workflow de URL (dado_enriquecido=TRUE, url_enriched=FALSE, website!=NULL):`);
  console.log(`   Total: ${(elegiveis || 0).toLocaleString()}`);

  // 5. Taxa de sucesso do enriquecimento por URL
  console.log('\n📈 Análise de SUCESSO do enriquecimento de URL:\n');

  // Buscar leads que já foram processados (url_enriched=TRUE)
  let processedLeads: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('instagram_leads')
      .select('id, username, website, email, phone, additional_emails, additional_phones')
      .eq('url_enriched', true)
      .range(from, from + pageSize - 1);

    if (error || !data) break;

    processedLeads = processedLeads.concat(data);
    from += pageSize;
    hasMore = data.length === pageSize;
  }

  console.log(`   📦 Total processados (url_enriched=TRUE): ${processedLeads.length.toLocaleString()}`);

  if (processedLeads.length > 0) {
    // Contar sucessos (encontrou pelo menos 1 contato em additional_emails ou additional_phones)
    const successfulEnrichments = processedLeads.filter(lead => {
      const hasAdditionalEmail = lead.additional_emails && Array.isArray(lead.additional_emails) && lead.additional_emails.length > 0;
      const hasAdditionalPhone = lead.additional_phones && Array.isArray(lead.additional_phones) && lead.additional_phones.length > 0;
      return hasAdditionalEmail || hasAdditionalPhone;
    });

    const successRate = (successfulEnrichments.length / processedLeads.length * 100).toFixed(1);

    console.log(`   ✅ Sucessos (encontrou contato): ${successfulEnrichments.length.toLocaleString()} (${successRate}%)`);
    console.log(`   ❌ Falhas (não encontrou): ${(processedLeads.length - successfulEnrichments.length).toLocaleString()} (${(100 - parseFloat(successRate)).toFixed(1)}%)`);

    // Breakdown dos sucessos
    const withAdditionalEmail = successfulEnrichments.filter(l =>
      l.additional_emails && l.additional_emails.length > 0
    ).length;

    const withAdditionalPhone = successfulEnrichments.filter(l =>
      l.additional_phones && l.additional_phones.length > 0
    ).length;

    const withBoth = successfulEnrichments.filter(l =>
      l.additional_emails && l.additional_emails.length > 0 &&
      l.additional_phones && l.additional_phones.length > 0
    ).length;

    console.log(`\n   📧 Com additional_emails: ${withAdditionalEmail.toLocaleString()}`);
    console.log(`   📱 Com additional_phones: ${withAdditionalPhone.toLocaleString()}`);
    console.log(`   🎯 Com ambos: ${withBoth.toLocaleString()}`);

    // Total de contatos adicionais extraídos
    const totalAdditionalEmails = successfulEnrichments.reduce((sum, l) =>
      sum + (l.additional_emails?.length || 0), 0
    );

    const totalAdditionalPhones = successfulEnrichments.reduce((sum, l) =>
      sum + (l.additional_phones?.length || 0), 0
    );

    console.log(`\n   📊 Total de contatos ADICIONAIS extraídos:`);
    console.log(`      📧 ${totalAdditionalEmails.toLocaleString()} emails`);
    console.log(`      📱 ${totalAdditionalPhones.toLocaleString()} telefones`);
  }

  // 6. Leads que AINDA PRECISAM ser processados pelo workflow
  console.log(`\n\n🔄 PRÓXIMA EXECUÇÃO DO WORKFLOW (4AM):`);
  console.log(`   ⏳ Leads que serão processados: ${(elegiveis || 0).toLocaleString()}`);

  if (elegiveis && elegiveis > 0) {
    // Buscar alguns exemplos
    const { data: exemples } = await supabase
      .from('instagram_leads')
      .select('username, website')
      .eq('dado_enriquecido', true)
      .eq('url_enriched', false)
      .not('website', 'is', null)
      .neq('website', '')
      .limit(5);

    if (exemples && exemples.length > 0) {
      console.log(`\n   🔍 Exemplos de leads pendentes:`);
      exemples.forEach((lead, i) => {
        console.log(`      ${i + 1}. @${lead.username} → ${lead.website}`);
      });
    }
  }

  console.log('\n✅ ========== FIM ==========\n');
}

checkEnrichmentStatus().catch(console.error);
