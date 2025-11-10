/**
 * Script para popular tabela lead_search_terms com os 50 termos mais relevantes
 * Categorias: Empreendedorismo, Marketing Digital, Saúde/Bem-estar, Desenvolvimento Pessoal
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const TOP_50_TERMS = [
  // EMPREENDEDORISMO (15 termos)
  { termo: 'empreendedorismo', hashtag: 'empreendedorismo' },
  { termo: 'empreendedor', hashtag: 'empreendedor' },
  { termo: 'negócios online', hashtag: 'negociosonline' },
  { termo: 'empreendedorismo digital', hashtag: 'empreendedorismodigital' },
  { termo: 'microempreendedor', hashtag: 'microempreendedor' },
  { termo: 'vendas online', hashtag: 'vendasonline' },
  { termo: 'e-commerce', hashtag: 'ecommerce' },
  { termo: 'dropshipping', hashtag: 'dropshipping' },
  { termo: 'infoprodutos', hashtag: 'infoprodutos' },
  { termo: 'afiliados', hashtag: 'afiliados' },
  { termo: 'startups', hashtag: 'startups' },
  { termo: 'business online', hashtag: 'businessonline' },
  { termo: 'empreendedor feminino', hashtag: 'empreendedorfeminino' },
  { termo: 'empreendedorismo social', hashtag: 'empreendedorismosocial' },
  { termo: 'empreendedorismo criativo', hashtag: 'empreendedorismocriativo' },

  // MARKETING DIGITAL (15 termos)
  { termo: 'marketing digital', hashtag: 'marketingdigital' },
  { termo: 'marketing', hashtag: 'marketing' },
  { termo: 'tráfego pago', hashtag: 'trafegopago' },
  { termo: 'gestão de tráfego', hashtag: 'gestaodetrafego' },
  { termo: 'social media', hashtag: 'socialmedia' },
  { termo: 'marketing de conteúdo', hashtag: 'marketingdeconteudo' },
  { termo: 'instagram marketing', hashtag: 'instagrammarketing' },
  { termo: 'copywriting', hashtag: 'copywriting' },
  { termo: 'anúncios online', hashtag: 'anunciosonline' },
  { termo: 'meta ads', hashtag: 'metaads' },
  { termo: 'google ads', hashtag: 'googleads' },
  { termo: 'influencer marketing', hashtag: 'influencermarketing' },
  { termo: 'email marketing', hashtag: 'emailmarketing' },
  { termo: 'SEO', hashtag: 'seo' },
  { termo: 'branding digital', hashtag: 'brandingdigital' },

  // SAÚDE E BEM-ESTAR (10 termos)
  { termo: 'saúde e beleza', hashtag: 'saudeebeleza' },
  { termo: 'fitness', hashtag: 'fitness' },
  { termo: 'nutrição', hashtag: 'nutricao' },
  { termo: 'personal trainer', hashtag: 'personaltrainer' },
  { termo: 'yoga', hashtag: 'yoga' },
  { termo: 'vida saudável', hashtag: 'vidasaudavel' },
  { termo: 'bem-estar', hashtag: 'bemestar' },
  { termo: 'mindfulness', hashtag: 'mindfulness' },
  { termo: 'saúde mental', hashtag: 'saudemental' },
  { termo: 'terapia', hashtag: 'terapia' },

  // DESENVOLVIMENTO PESSOAL (10 termos)
  { termo: 'desenvolvimento pessoal', hashtag: 'desenvolvimentopessoal' },
  { termo: 'coaching', hashtag: 'coaching' },
  { termo: 'mentalidade', hashtag: 'mentalidade' },
  { termo: 'produtividade', hashtag: 'produtividade' },
  { termo: 'motivação', hashtag: 'motivacao' },
  { termo: 'autoconhecimento', hashtag: 'autoconhecimento' },
  { termo: 'liderança', hashtag: 'lideranca' },
  { termo: 'inteligência emocional', hashtag: 'inteligenciaemocional' },
  { termo: 'crescimento pessoal', hashtag: 'crescimentopessoal' },
  { termo: 'mindset', hashtag: 'mindset' },
];

async function populateTerms() {
  console.log('🚀 Iniciando população de termos de busca...\n');

  // Converter termos para formato da tabela
  const searchTermsArray = TOP_50_TERMS.map(term => ({
    termo: term,
    hashtag: term
  }));

  try {
    const { error } = await supabase
      .from('lead_search_terms')
      .insert({
        target_segment: 'top_50_termos_principais',
        categoria_geral: 'Termos Principais para Scraping Instagram',
        area_especifica: 'Top 50 termos curados para descoberta multi-hashtag',
        search_terms: searchTermsArray,
        generated_by_model: 'curated_top_50',
        generation_prompt: 'Top 50 termos curados manualmente cobrindo empreendedorismo (15), marketing digital (15), saúde/bem-estar (10) e desenvolvimento pessoal (10)',
        generation_cost_usd: '0.000000'
      });

    if (error) {
      console.error('❌ Erro ao inserir termos:', error.message);
      process.exit(1);
    }

    console.log('✅ Termos inseridos com sucesso!\n');
    console.log('📊 RESUMO:');
    console.log(`   📈 Total de termos: ${TOP_50_TERMS.length}`);
    console.log(`   📂 Categorias: Empreendedorismo (15), Marketing (15), Saúde (10), Desenvolvimento (10)`);
    console.log(`   🎯 Target segment: top_50_termos_principais`);

  } catch (err) {
    console.error('❌ Exceção ao inserir:', err);
    process.exit(1);
  }
}

populateTerms()
  .then(() => {
    console.log('\n✅ Script finalizado com sucesso!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Erro fatal:', err);
    process.exit(1);
  });
