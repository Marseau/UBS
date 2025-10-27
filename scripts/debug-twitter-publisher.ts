/**
 * Script de Debug - Twitter Publisher
 * Verifica estado dos tweets e possíveis erros
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugTwitterPublisher() {
  console.log('🔍 Verificando estado dos tweets...\n');

  // Pegar semana atual
  const now = new Date();
  const currentWeek = getISOWeek(now);
  const currentYear = now.getFullYear();

  console.log(`📅 Semana atual: ${currentWeek} / Ano: ${currentYear}`);
  console.log(`🕐 Hora atual: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}\n`);

  // Buscar conteúdo editorial da semana
  const { data: content, error } = await supabase
    .from('editorial_content')
    .select('*')
    .eq('week_number', currentWeek)
    .eq('year', currentYear)
    .single();

  if (error) {
    console.error('❌ Erro ao buscar conteúdo:', error);
    return;
  }

  if (!content) {
    console.log('⚠️  Nenhum conteúdo encontrado para esta semana');
    return;
  }

  console.log('📊 Status dos Tweets:\n');

  // Verificar cada tweet
  for (let i = 1; i <= 7; i++) {
    const published = content[`twitter_thread_${i}_published`];
    const publishedAt = content[`twitter_thread_${i}_published_at`];
    const title = content[`twitter_thread_${i}_title`];

    const hourScheduled = 10 + (i - 1) * 2; // 10h, 12h, 14h, 16h, 18h, 20h, 22h

    console.log(`Tweet ${i}/7 (agendado: ${hourScheduled}:00):`);
    console.log(`  ✓ Título: ${title ? title.substring(0, 50) + '...' : 'NÃO DEFINIDO'}`);
    console.log(`  ✓ Publicado: ${published ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`  ✓ Data: ${publishedAt || 'N/A'}`);

    // Verificar se passou do horário
    if (now.getHours() > hourScheduled) {
      if (!published) {
        console.log(`  ⚠️  ALERTA: Passou do horário e não foi publicado!`);
      }
    }
    console.log('');
  }

  // Verificar tweets que DEVERIAM ter sido publicados
  const currentHour = now.getHours();
  const expectedPublishedCount = Math.max(0, Math.floor((currentHour - 10) / 2) + 1);

  let actualPublishedCount = 0;
  for (let i = 1; i <= 7; i++) {
    if (content[`twitter_thread_${i}_published`]) {
      actualPublishedCount++;
    }
  }

  console.log('📈 Resumo:');
  console.log(`  Esperado publicado até agora: ${expectedPublishedCount}`);
  console.log(`  Realmente publicado: ${actualPublishedCount}`);

  if (actualPublishedCount < expectedPublishedCount) {
    console.log(`  ⚠️  FALTAM ${expectedPublishedCount - actualPublishedCount} tweets!`);
  } else {
    console.log(`  ✅ Tudo em dia!`);
  }

  // Verificar próximo tweet programado
  const nextTweetIndex = actualPublishedCount + 1;
  if (nextTweetIndex <= 7) {
    const nextHour = 10 + (nextTweetIndex - 1) * 2;
    console.log(`\n⏰ Próximo tweet: ${nextTweetIndex}/7 às ${nextHour}:00`);
  } else {
    console.log('\n✅ Todos os tweets da semana foram publicados!');
  }
}

function getISOWeek(date: Date): number {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

debugTwitterPublisher().catch(console.error);
