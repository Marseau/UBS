/**
 * Script para Inserir Novos Search Terms B2C no Banco
 * Focado em consumidores finais (não profissionais)
 *
 * Data: 2025-01-11
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SearchTermConfig {
  categoria_geral: string;
  area_especifica: string;
  target_segment: string;
  search_terms: Array<{termo: string; hashtag: string} | string>;
}

async function insertSearchTerms() {
  console.log('🚀 Inserindo novos Search Terms B2C...\n');

  const configFiles = [
    'search-terms-b2c-fitness.json',
    'search-terms-b2c-saude-longevidade.json',
    'search-terms-b2c-beleza-feminina.json'
  ];

  let totalInserted = 0;

  for (const configFile of configFiles) {
    const configPath = path.join(__dirname, '..', 'config', configFile);

    if (!fs.existsSync(configPath)) {
      console.log(`⚠️  Arquivo não encontrado: ${configFile}`);
      continue;
    }

    const configData: SearchTermConfig = JSON.parse(
      fs.readFileSync(configPath, 'utf-8')
    );

    console.log(`📁 Processando: ${configData.categoria_geral}`);
    console.log(`   📍 Área: ${configData.area_especifica}`);
    console.log(`   🎯 Segment: ${configData.target_segment}`);
    console.log(`   📊 Total de termos: ${configData.search_terms.length}`);

    // Preparar dados para inserção
    const insertData = {
      target_segment: configData.target_segment,
      categoria_geral: configData.categoria_geral,
      area_especifica: configData.area_especifica,
      search_terms: configData.search_terms,
      terms_count: configData.search_terms.length,
      generated_at: new Date().toISOString(),
      generated_by_model: 'claude-sonnet-4-5-manual',
      times_used: 0,
      leads_generated: 0,
      quality_score: null
    };

    // Verificar se já existe
    const { data: existing } = await supabase
      .from('lead_search_terms')
      .select('id, target_segment')
      .eq('target_segment', configData.target_segment)
      .single();

    if (existing) {
      console.log(`   ⚠️  Já existe configuração para: ${configData.target_segment}`);
      console.log(`   🔄 Atualizando...`);

      const { error: updateError } = await supabase
        .from('lead_search_terms')
        .update(insertData)
        .eq('id', existing.id);

      if (updateError) {
        console.error(`   ❌ Erro ao atualizar:`, updateError);
      } else {
        console.log(`   ✅ Atualizado com sucesso!\n`);
        totalInserted++;
      }
    } else {
      // Inserir novo
      const { error: insertError } = await supabase
        .from('lead_search_terms')
        .insert(insertData);

      if (insertError) {
        console.error(`   ❌ Erro ao inserir:`, insertError);
      } else {
        console.log(`   ✅ Inserido com sucesso!\n`);
        totalInserted++;
      }
    }
  }

  console.log(`\n🎉 Concluído! ${totalInserted} configurações inseridas/atualizadas.`);

  // Listar todas as categorias disponíveis
  console.log('\n📋 Categorias Disponíveis no Banco:\n');

  const { data: allCategories } = await supabase
    .from('lead_search_terms')
    .select('categoria_geral, target_segment, terms_count, leads_generated')
    .order('leads_generated', { ascending: false });

  if (allCategories) {
    allCategories.forEach((cat, idx) => {
      console.log(`${idx + 1}. ${cat.categoria_geral}`);
      console.log(`   Segment: ${cat.target_segment}`);
      console.log(`   Termos: ${cat.terms_count} | Leads: ${cat.leads_generated || 0}\n`);
    });
  }
}

insertSearchTerms().catch(console.error);
