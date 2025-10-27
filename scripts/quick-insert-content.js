const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('🚀 Inserindo conteúdo de teste...');
  
  const { data, error } = await supabase
    .from('editorial_content')
    .insert({
      week_number: 41,
      year: 2025,
      day_of_week: 1,
      main_theme: 'A dor dos agendamentos manuais',
      sub_theme: 'Faltas e agenda manual',
      carla_script: 'Eu perdia R$ 1.500 por semana só com faltas. Agenda furada, clientes frustrados, profissionais desmotivados.',
      bruno_script: 'Automação inteligente resolve. Resposta imediata, agenda sincronizada, IA qualifica leads, lembretes reduzem no-shows.',
      twitter_insertion_1: '[Placeholder]',
      twitter_insertion_2: '[Placeholder]',
      twitter_insertion_3: '[Placeholder]',
      instagram_post: '[Placeholder]',
      youtube_video_title: '[Placeholder]',
      youtube_video_description: '[Placeholder]'
    })
    .select('id, main_theme')
    .single();

  if (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }

  console.log('✅ Conteúdo criado!');
  console.log(`ID: ${data.id}`);
  console.log(`\n🎬 Teste o vídeo B-Roll com:`);
  console.log(`curl -X POST http://localhost:3000/api/broll-video/generate/${data.id}`);
})();
