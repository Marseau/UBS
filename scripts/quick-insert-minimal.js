const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Tentar inserir apenas com campos mínimos
  const { data, error } = await supabase
    .from('editorial_content')
    .insert({
      week_number: 41,
      year: 2025,
      day_of_week: 1,
      main_theme: 'Agendamentos manuais',
      sub_theme: 'Faltas',
      carla_script: 'Perco R$ mil por mês com faltas. Agenda manual é caos total.',
      bruno_script: 'Automação resolve. Resposta imediata, agenda sincronizada, lembretes reduzem no-shows.',
      twitter_insertion_1: 'TBD',
      twitter_insertion_2: 'TBD',
      twitter_insertion_3: 'TBD',
      instagram_post: 'TBD',
      youtube_video_title: 'TBD'
    })
    .select()
    .single();

  if (error) {
    console.log('❌', error.message);
    return process.exit(1);
  }

  console.log('✅ ID:', data.id);
  console.log(`\ncurl -X POST http://localhost:3000/api/broll-video/generate/${data.id}`);
})();
