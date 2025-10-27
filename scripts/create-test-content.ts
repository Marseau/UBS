import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createTestContent() {
  console.log('🚀 Criando conteúdo de teste...');

  const { data, error} = await supabase
    .from('editorial_content')
    .insert({
      week_number: 41,
      year: 2025,
      day_of_week: 1,
      main_theme: 'A dor dos agendamentos manuais',
      sub_theme: 'Faltas e agenda manual',
      carla_script: 'Eu perdia R$ 1.500 por semana só com faltas. Fiz as contas: salão com 5 profissionais, 2 faltas cada por semana. Anual? R$ 78 mil indo embora. O problema? Tudo manual: WhatsApp, planilhas, telefone. Zero integração. Equipe sobrecarregada. Cliente muda última hora e ninguém fica sabendo. Agenda furada, clientes frustrados, profissionais desmotivados.',
      bruno_script: 'A solução é automação inteligente com 4 princípios fundamentais. Primeiro: resposta imediata. Cliente recebe retorno em segundos via WhatsApp, não espera 24 horas. Segundo: agenda sincronizada com Google Calendar em tempo real. Terceiro: IA qualifica leads automaticamente, aumentando 50 por cento a eficiência segundo Forrester 2024. Quarto: lembretes automáticos reduzem no-shows de 30 por cento para 8 por cento. Dashboard mostra ROI em tempo real.',
      twitter_insertion_1: '[TBD]',
      twitter_insertion_2: '[TBD]',
      twitter_insertion_3: '[TBD]'
    })
    .select('id, main_theme, carla_script, bruno_script')
    .single();

  if (error) {
    console.error('❌ Erro criando conteúdo:', error.message);
    process.exit(1);
  }

  console.log('\n✅ Conteúdo criado com sucesso!');
  console.log(`📋 ID: ${data.id}`);
  console.log(`🎯 Tema: ${data.main_theme}`);
  console.log(`👩 Carla: ${data.carla_script?.substring(0, 60)}...`);
  console.log(`👨 Bruno: ${data.bruno_script?.substring(0, 60)}...`);
  console.log(`\n🎬 Agora você pode gerar o vídeo B-Roll com:`);
  console.log(`   curl -X POST http://localhost:3000/api/broll-video/generate/${data.id}`);
}

createTestContent();
