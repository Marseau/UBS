import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function testPexelsSearch() {
  const PEXELS_API_KEY = process.env.PEXELS_API_KEY!;
  const keywords = ['lost business', 'quick response'];

  console.log('🔍 Testando busca na Pexels API...\n');

  for (const keyword of keywords) {
    console.log(`\n📹 Buscando clips para: "${keyword}"`);
    console.log('─'.repeat(60));

    try {
      const response = await axios.get('https://api.pexels.com/videos/search', {
        headers: {
          Authorization: PEXELS_API_KEY
        },
        params: {
          query: keyword,
          per_page: 5,
          orientation: 'portrait', // 9:16 para Instagram
          size: 'medium'
        }
      });

      if (response.data.videos && response.data.videos.length > 0) {
        console.log(`✅ ${response.data.videos.length} clips encontrados\n`);

        response.data.videos.forEach((video: any, index: number) => {
          const videoFile = video.video_files?.find((f: any) =>
            f.quality === 'hd' && f.width < f.height
          ) || video.video_files?.[0];

          console.log(`${index + 1}. ID: ${video.id}`);
          console.log(`   📺 ${video.url}`);
          console.log(`   📸 Imagem: ${video.image}`);
          console.log(`   ⏱️  Duração: ${video.duration}s`);
          console.log(`   📏 Dimensões: ${videoFile?.width}x${videoFile?.height}`);
          console.log(`   🎬 Qualidade: ${videoFile?.quality}`);
          console.log('');
        });
      } else {
        console.log('⚠️ Nenhum clip encontrado');
      }
    } catch (error: any) {
      console.error(`❌ Erro: ${error.message}`);
    }
  }
}

testPexelsSearch();
