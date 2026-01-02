/**
 * Script de teste para validar a extração de localização
 *
 * Testa o LocationExtractor com uma amostra de leads reais do banco
 *
 * Uso:
 *   npx ts-node scripts/test-location-extraction.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  extractLocation,
  extractStateFromProfessionalRegistry,
  extractLocationFromEmoji,
  extractLocationFromTextPatterns,
  findKnownCityInText,
  inferStateFromCity
} from '../src/services/location-extractor.service';

// Carregar variáveis de ambiente
config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// TESTES UNITÁRIOS
// ============================================

console.log('🧪 TESTES UNITÁRIOS DO LOCATION EXTRACTOR\n');
console.log('=' .repeat(60));

// Teste 1: Registros profissionais
console.log('\n📋 Teste 1: Registros Profissionais\n');
const registryTests = [
  { input: 'CREF: 146803-G/SP', expected: 'SP' },
  { input: 'CRM/MG 12345', expected: 'MG' },
  { input: 'OAB-RJ 98765', expected: 'RJ' },
  { input: 'CRO/SP', expected: 'SP' },
  { input: 'CRP 06/12345', expected: null }, // CRP usa números de região, não UF
  { input: 'COREN-BA', expected: 'BA' },
  { input: 'Sem registro', expected: null },
];

registryTests.forEach(({ input, expected }) => {
  const result = extractStateFromProfessionalRegistry(input);
  const status = result === expected ? '✅' : '❌';
  console.log(`   ${status} "${input}" → ${result || 'null'} (esperado: ${expected || 'null'})`);
});

// Teste 2: Emoji de localização
console.log('\n📍 Teste 2: Emoji de Localização\n');
const emojiTests = [
  { input: '📍SP', expectedState: 'SP', expectedCity: null },
  { input: '📍 São Paulo - SP', expectedState: 'SP', expectedCity: 'São Paulo' },
  { input: '📍Curitiba | PR', expectedState: 'PR', expectedCity: 'Curitiba' },
  { input: '🏠 Belo Horizonte', expectedState: 'MG', expectedCity: 'Belo Horizonte' },
  { input: 'Sem emoji', expectedState: null, expectedCity: null },
];

emojiTests.forEach(({ input, expectedState, expectedCity }) => {
  const result = extractLocationFromEmoji(input);
  const stateOk = result?.state === expectedState;
  const cityOk = (result?.city || null) === expectedCity ||
                 (result?.city?.includes(expectedCity || '') && expectedCity);
  const status = stateOk ? '✅' : '❌';
  console.log(`   ${status} "${input}" → ${result?.city || '-'}/${result?.state || '-'}`);
});

// Teste 3: Padrões de texto
console.log('\n📝 Teste 3: Padrões de Texto\n');
const textTests = [
  { input: 'Atendimento em São Paulo - SP', expectedState: 'SP' },
  { input: 'Clínica em Curitiba/PR', expectedState: 'PR' },
  { input: 'Consultório | Rio de Janeiro | RJ', expectedState: 'RJ' },
  { input: 'Presencial em Florianópolis', expectedState: 'SC' },
  { input: 'Online para todo Brasil', expectedState: null },
];

textTests.forEach(({ input, expectedState }) => {
  const result = extractLocationFromTextPatterns(input);
  const status = result?.state === expectedState ? '✅' : '❌';
  console.log(`   ${status} "${input}" → ${result?.city || '-'}/${result?.state || '-'}`);
});

// Teste 4: Cidades conhecidas
console.log('\n🏙️ Teste 4: Cidades Conhecidas no Texto\n');
const cityTests = [
  { input: 'Trabalho em Joinville há 10 anos', expectedCity: 'Joinville', expectedState: 'SC' },
  { input: 'Nutricionista em Presidente Prudente', expectedCity: 'Presidente Prudente', expectedState: 'SP' },
  { input: 'Morando em Porto Alegre desde 2020', expectedCity: 'Porto Alegre', expectedState: 'RS' },
  { input: 'Zona Norte - atendimento domiciliar', expectedCity: 'Zona Norte', expectedState: 'SP' },
];

cityTests.forEach(({ input, expectedCity, expectedState }) => {
  const result = findKnownCityInText(input);
  const status = result?.state === expectedState ? '✅' : '❌';
  console.log(`   ${status} "${input.substring(0, 40)}..." → ${result?.city || '-'}/${result?.state || '-'}`);
});

// Teste 5: Inferência de state
console.log('\n🔍 Teste 5: Inferência de State a partir de City\n');
const inferTests = [
  { input: 'Belo Horizonte', expected: 'MG' },
  { input: 'Presidente Prudente', expected: 'SP' },
  { input: 'Campo Grande', expected: 'MS' },
  { input: 'Cidade Desconhecida', expected: null },
];

inferTests.forEach(({ input, expected }) => {
  const result = inferStateFromCity(input);
  const status = result === expected ? '✅' : '❌';
  console.log(`   ${status} "${input}" → ${result || 'null'} (esperado: ${expected || 'null'})`);
});

// ============================================
// TESTE COM DADOS REAIS
// ============================================

async function testWithRealData() {
  console.log('\n' + '=' .repeat(60));
  console.log('\n🔬 TESTE COM DADOS REAIS DO BANCO\n');

  // Buscar leads sem state mas com bio
  const { data: leads, error } = await supabase
    .from('instagram_leads')
    .select('id, username, bio, phone, city, state')
    .is('state', null)
    .not('bio', 'is', null)
    .limit(50);

  if (error) {
    console.error('❌ Erro ao buscar leads:', error.message);
    return;
  }

  if (!leads || leads.length === 0) {
    console.log('⚠️ Nenhum lead encontrado para teste');
    return;
  }

  console.log(`📊 Testando com ${leads.length} leads sem state...\n`);

  let extracted = 0;
  let notExtracted = 0;
  const bySource: Record<string, number> = {};
  const examples: Array<{ username: string; bio: string; result: any }> = [];

  for (const lead of leads) {
    const result = extractLocation(lead.bio, lead.phone);

    if (result?.state) {
      extracted++;
      bySource[result.source] = (bySource[result.source] || 0) + 1;

      if (examples.length < 15) {
        examples.push({
          username: lead.username,
          bio: lead.bio?.substring(0, 100) || '',
          result
        });
      }
    } else {
      notExtracted++;
    }
  }

  // Resultados
  console.log('📈 RESULTADOS:\n');
  console.log(`   Total testado: ${leads.length}`);
  console.log(`   ✅ Extraído com sucesso: ${extracted} (${((extracted / leads.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Não extraído: ${notExtracted} (${((notExtracted / leads.length) * 100).toFixed(1)}%)`);

  console.log('\n📍 POR FONTE:');
  Object.entries(bySource)
    .sort(([, a], [, b]) => b - a)
    .forEach(([source, count]) => {
      console.log(`   ${source}: ${count}`);
    });

  console.log('\n📋 EXEMPLOS DE EXTRAÇÃO:');
  examples.forEach(({ username, bio, result }) => {
    console.log(`\n   @${username}`);
    console.log(`   Bio: "${bio}..."`);
    console.log(`   → ${result.city || '-'}/${result.state} (${result.source})`);
  });

  // Buscar alguns leads que não foram extraídos para análise
  console.log('\n📋 EXEMPLOS SEM EXTRAÇÃO (para análise):');
  const notExtractedLeads = leads.filter(l => {
    const result = extractLocation(l.bio, l.phone);
    return !result?.state;
  }).slice(0, 5);

  notExtractedLeads.forEach(lead => {
    console.log(`\n   @${lead.username}`);
    console.log(`   Bio: "${lead.bio?.substring(0, 150)}..."`);
  });
}

// Executar testes com dados reais
testWithRealData().then(() => {
  console.log('\n✨ Testes concluídos!');
}).catch(error => {
  console.error('\n❌ Erro:', error);
  process.exit(1);
});
