import express, { Request, Response } from 'express';
import { EnhancedCarouselVideoService } from '../services/enhanced-carousel-video.service';

const router = express.Router();

let enhancedVideoService: EnhancedCarouselVideoService;

function getEnhancedVideoService() {
  if (!enhancedVideoService) {
    enhancedVideoService = new EnhancedCarouselVideoService();
  }
  return enhancedVideoService;
}

/**
 * POST /api/enhanced-video-test/generate
 * Testa geração de vídeo com música, fade transitions e locução do Bruno
 */
router.post('/generate', async (req: Request, res: Response) => {
  console.log('🎬 Gerando vídeo ENHANCED com música, fade e locução...');

  // Usar as 7 imagens que já foram geradas
  const existingImages = [
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-c7fe86ad0cedadeb0259ffdcb05bab7a-a6shtr8z.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-2c2aec2783d7bb5b8e87d1c7242945b6-ev4coyyl.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-981b63ac81d987f2308682e3dc9d1426-hyty20sm.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-7ec226b3c817885ee683e844c76c6e10-wlwkbjse.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-7af3ded41fafa358bfa39f5da45c7cac-9ukw422l.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-03357df0f50d4163e0a0bff53b405f4f-jpo2uclu.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-58256571e589344c63b52f611e42d1e6-uvhdhxjb.jpg"
  ];

  // Script SINCRONIZADO por slide com ALTERNÂNCIA entre Carla (dor) e Bruno (solução)
  const scriptPerSlide = [
    "Você sabia que 30% dos agendamentos falham em pequenas e médias empresas?",
    "O agendamento manual está criando caos no seu negócio. WhatsApp misturado com planilhas e telefone, sem nenhuma integração, e sua equipe cada vez mais sobrecarregada.",
    "Veja esse exemplo: um salão com 5 profissionais, com apenas 2 faltas por semana cada, perde mil e quinhentos reais semanalmente. Isso significa 78 mil reais jogados fora por ano!",
    "As consequências são graves: agenda furada, clientes frustrados e profissionais desmotivados.",
    "E a situação piora quando não há lembretes automáticos, a agenda é compartilhada sem controle, e clientes mudam de ideia na última hora.",
    "Os sintomas são claros: tudo é manual, você não sabe quem confirmou, e os cancelamentos são frequentes.",
    "Resumindo: sua agenda pode estar drenando receita do seu negócio. Salve este carrossel e siga para aprender como evitar essas perdas!"
  ];

  // DEFINIR QUAL VOZ USA EM CADA SLIDE: 'carla' para dor, 'bruno' para solução
  const voicePerSlide: ('bruno' | 'carla')[] = [
    'carla',  // Slide 1: Carla apresenta o problema (30% falham)
    'carla',  // Slide 2: Carla descreve o caos
    'carla',  // Slide 3: Carla mostra o impacto financeiro
    'bruno',  // Slide 4: Bruno apresenta consequências (transição para solução)
    'bruno',  // Slide 5: Bruno explica agravantes
    'bruno',  // Slide 6: Bruno identifica sintomas
    'bruno'   // Slide 7: Bruno conclui com call-to-action
  ];

  // URL de música de fundo (exemplo - substitua por música real)
  const backgroundMusicUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

  // Slide final estático (CTA)
  const finalSlideUrl = "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-c7fe86ad0cedadeb0259ffdcb05bab7a-a6shtr8z.jpg"; // Exemplo - substitua por seu CTA

  try {
    console.log(`🖼️ Usando ${existingImages.length} imagens existentes`);
    console.log(`🎙️ Script sincronizado: ${scriptPerSlide.length} slides`);
    console.log(`🎵 Música de fundo: ${backgroundMusicUrl}`);
    console.log(`👥 Vozes: ${voicePerSlide.join(' → ')}`);
    console.log(`🎯 Slide final estático: SIM (3s)`);

    const result = await getEnhancedVideoService().generateEnhancedVideo(
      existingImages,
      'enhanced-dual-voice-001',
      70, // Duração será ajustada automaticamente baseada nos áudios
      {
        backgroundMusicUrl: backgroundMusicUrl,
        voiceoverScriptPerSlide: scriptPerSlide, // SINCRONIZADO!
        voicePerSlide: voicePerSlide, // ALTERNÂNCIA Carla/Bruno!
        finalStaticSlide: {
          imageUrl: finalSlideUrl,
          duration: 3 // 3 segundos para o CTA final
        },
        musicVolume: 0.15, // Música bem baixa para não competir com locução
        useFadeTransitions: true,
        fadeTransitionDuration: 0.5
      }
    );

    console.log('✅ Vídeo enhanced gerado com sucesso!');

    return res.status(200).json({
      success: true,
      video_url: result.video_url,
      voiceover_url: result.voiceover_url,
      duration_seconds: result.duration_seconds,
      total_slides: result.total_slides,
      cost: result.cost_usd,
      features: {
        fade_transitions: result.transitions_used,
        background_music: result.music_used,
        bruno_voiceover: !!result.voiceover_url
      },
      message: 'Vídeo enhanced de 60s gerado com sucesso! (música + fade + locução Bruno)'
    });
  } catch (error: any) {
    console.error('❌ Error generating enhanced video:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to generate enhanced video',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/enhanced-video-test/generate-simple
 * Testa com apenas música (sem locução)
 */
router.post('/generate-simple', async (req: Request, res: Response) => {
  console.log('🎬 Gerando vídeo com APENAS música e fade...');

  const existingImages = [
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-c7fe86ad0cedadeb0259ffdcb05bab7a-a6shtr8z.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-2c2aec2783d7bb5b8e87d1c7242945b6-ev4coyyl.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-981b63ac81d987f2308682e3dc9d1426-hyty20sm.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-7ec226b3c817885ee683e844c76c6e10-wlwkbjse.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-7af3ded41fafa358bfa39f5da45c7cac-9ukw422l.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-03357df0f50d4163e0a0bff53b405f4f-jpo2uclu.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-58256571e589344c63b52f611e42d1e6-uvhdhxjb.jpg"
  ];

  const backgroundMusicUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

  try {
    const result = await getEnhancedVideoService().generateEnhancedVideo(
      existingImages,
      'simple-demo-001',
      60,
      {
        backgroundMusicUrl: backgroundMusicUrl,
        musicVolume: 0.4, // Música mais alta sem locução
        useFadeTransitions: true,
        fadeTransitionDuration: 0.5
      }
    );

    return res.status(200).json({
      success: true,
      video_url: result.video_url,
      duration_seconds: result.duration_seconds,
      total_slides: result.total_slides,
      cost: result.cost_usd,
      features: {
        fade_transitions: true,
        background_music: true,
        bruno_voiceover: false
      },
      message: 'Vídeo com música e fade gerado com sucesso! (sem locução)'
    });
  } catch (error: any) {
    console.error('❌ Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
