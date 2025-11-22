require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const videoPath = '/Users/marseau/Downloads/UBS Template Base.mp4';
const videoBuffer = fs.readFileSync(videoPath);
const fileName = `test-videos/ubs-template-base-${Date.now()}.mp4`;

(async () => {
  console.log('📤 Fazendo upload do vídeo base para Supabase...');

  const { data, error } = await supabase.storage
    .from('editorial-videos')
    .upload(fileName, videoBuffer, {
      contentType: 'video/mp4',
      upsert: false
    });

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  const { data: urlData } = supabase.storage
    .from('editorial-videos')
    .getPublicUrl(fileName);

  console.log('✅ Upload concluído!');
  console.log('🔗 URL pública:');
  console.log(urlData.publicUrl);
})();
