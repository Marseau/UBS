import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function analyzeLeadsWithoutContactDetail() {
  console.log('\n📊 ========== ANÁLISE DETALHADA: LEADS SEM CONTATO ==========\n');

  // Buscar TODOS os leads sem contato
  let leadsWithoutContact: any[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  console.log('🔍 Carregando todos os leads...\n');

  while (hasMore) {
    const { data, error } = await supabase
      .from('instagram_leads')
      .select('username, bio, website, email, phone, additional_emails, additional_phones, url_enriched, dado_enriquecido')
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

  // Separar por categorias
  const categories = {
    // 1. Com website E url_enriched=TRUE (processado mas não achou)
    processedNoResult: leadsWithoutContact.filter(l =>
      l.website && l.website.trim() !== '' && l.url_enriched === true
    ),

    // 2. Com website E url_enriched=FALSE (ainda não processado)
    pendingWithWebsite: leadsWithoutContact.filter(l =>
      l.website && l.website.trim() !== '' && l.url_enriched === false
    ),

    // 3. Com website E url_enriched=NULL (nunca tentou processar)
    nullWithWebsite: leadsWithoutContact.filter(l =>
      l.website && l.website.trim() !== '' && l.url_enriched === null
    ),

    // 4. SEM website
    noWebsite: leadsWithoutContact.filter(l =>
      !l.website || l.website.trim() === ''
    )
  };

  console.log('📋 BREAKDOWN COMPLETO dos leads sem contato:\n');

  console.log(`🔍 Categoria 1: PROCESSADOS mas NÃO ACHARAM (url_enriched=TRUE + website)`);
  console.log(`   Total: ${categories.processedNoResult.length.toLocaleString()}`);
  console.log(`   % do total sem contato: ${(categories.processedNoResult.length / leadsWithoutContact.length * 100).toFixed(1)}%`);

  if (categories.processedNoResult.length > 0) {
    console.log(`\n   🔍 Amostras (primeiros 5):`);
    categories.processedNoResult.slice(0, 5).forEach((lead, i) => {
      console.log(`      ${i + 1}. @${lead.username}`);
      console.log(`         🔗 ${lead.website}`);
      if (lead.bio) {
        const bioPreview = lead.bio.substring(0, 50).replace(/\n/g, ' ');
        console.log(`         📝 "${bioPreview}..."`);
      }
    });
  }

  console.log(`\n🕐 Categoria 2: PENDENTES (url_enriched=FALSE + website)`);
  console.log(`   Total: ${categories.pendingWithWebsite.length.toLocaleString()}`);
  console.log(`   % do total sem contato: ${(categories.pendingWithWebsite.length / leadsWithoutContact.length * 100).toFixed(1)}%`);

  if (categories.pendingWithWebsite.length > 0) {
    console.log(`\n   🔍 Amostras (primeiros 5):`);
    categories.pendingWithWebsite.slice(0, 5).forEach((lead, i) => {
      console.log(`      ${i + 1}. @${lead.username}`);
      console.log(`         🔗 ${lead.website}`);
      if (lead.bio) {
        const bioPreview = lead.bio.substring(0, 50).replace(/\n/g, ' ');
        console.log(`         📝 "${bioPreview}..."`);
      }
    });
  }

  console.log(`\n⚠️  Categoria 3: NULL (url_enriched=NULL + website)`);
  console.log(`   Total: ${categories.nullWithWebsite.length.toLocaleString()}`);
  console.log(`   % do total sem contato: ${(categories.nullWithWebsite.length / leadsWithoutContact.length * 100).toFixed(1)}%`);

  console.log(`\n❌ Categoria 4: SEM WEBSITE (impossível enriquecer)`);
  console.log(`   Total: ${categories.noWebsite.length.toLocaleString()}`);
  console.log(`   % do total sem contato: ${(categories.noWebsite.length / leadsWithoutContact.length * 100).toFixed(1)}%`);

  // Análise adicional: tipos de websites que falharam
  if (categories.processedNoResult.length > 0) {
    console.log(`\n\n🔬 ANÁLISE DOS WEBSITES QUE FALHARAM:`);

    const websiteTypes = {
      linktr: categories.processedNoResult.filter(l => l.website?.includes('linktr.ee')).length,
      linkin: categories.processedNoResult.filter(l => l.website?.includes('linkin.bio')).length,
      beacons: categories.processedNoResult.filter(l => l.website?.includes('beacons.ai')).length,
      instagram: categories.processedNoResult.filter(l => l.website?.includes('instagram.com')).length,
      whatsapp: categories.processedNoResult.filter(l => l.website?.includes('wa.me') || l.website?.includes('whatsapp')).length,
      others: 0
    };

    websiteTypes.others = categories.processedNoResult.length -
      Object.values(websiteTypes).reduce((sum, count) => sum + count, 0) + websiteTypes.others;

    console.log(`\n   📊 Tipos de websites:`);
    console.log(`      🔗 Linktr.ee: ${websiteTypes.linktr} (${(websiteTypes.linktr / categories.processedNoResult.length * 100).toFixed(1)}%)`);
    console.log(`      🔗 Linkin.bio: ${websiteTypes.linkin} (${(websiteTypes.linkin / categories.processedNoResult.length * 100).toFixed(1)}%)`);
    console.log(`      🔗 Beacons.ai: ${websiteTypes.beacons} (${(websiteTypes.beacons / categories.processedNoResult.length * 100).toFixed(1)}%)`);
    console.log(`      📱 Instagram: ${websiteTypes.instagram} (${(websiteTypes.instagram / categories.processedNoResult.length * 100).toFixed(1)}%)`);
    console.log(`      💬 WhatsApp: ${websiteTypes.whatsapp} (${(websiteTypes.whatsapp / categories.processedNoResult.length * 100).toFixed(1)}%)`);
    console.log(`      🌐 Outros: ${websiteTypes.others} (${(websiteTypes.others / categories.processedNoResult.length * 100).toFixed(1)}%)`);
  }

  // Resumo executivo
  console.log(`\n\n📊 ========== RESUMO EXECUTIVO ==========\n`);
  console.log(`Total de leads sem contato: ${leadsWithoutContact.length.toLocaleString()}`);
  console.log(`\n🎯 OPORTUNIDADES:`);
  console.log(`   1. Reprocessar websites que falharam: ${categories.processedNoResult.length.toLocaleString()}`);
  console.log(`   2. Processar pendentes: ${categories.pendingWithWebsite.length.toLocaleString()}`);
  console.log(`   3. Processar com NULL: ${categories.nullWithWebsite.length.toLocaleString()}`);
  console.log(`   TOTAL de oportunidades: ${(categories.processedNoResult.length + categories.pendingWithWebsite.length + categories.nullWithWebsite.length).toLocaleString()}`);

  console.log(`\n❌ SEM SOLUÇÃO:`);
  console.log(`   Leads sem website: ${categories.noWebsite.length.toLocaleString()}`);

  const potentialRecovery = categories.processedNoResult.length + categories.pendingWithWebsite.length + categories.nullWithWebsite.length;
  const estimatedSuccess = Math.round(potentialRecovery * 0.30); // Estimando 30% de sucesso

  console.log(`\n💡 ESTIMATIVA:`);
  console.log(`   Se reprocessar todos: ~${estimatedSuccess.toLocaleString()} novos leads com contato (30% taxa de sucesso)`);
  console.log(`   Taxa de leads com contato subiria de 55.2% para ~${((2798 + estimatedSuccess) / 5072 * 100).toFixed(1)}%`);

  console.log('\n✅ ========== FIM ==========\n');
}

analyzeLeadsWithoutContactDetail().catch(console.error);
