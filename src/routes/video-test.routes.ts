import express, { Request, Response } from 'express';
import { VideoCarouselGeneratorService } from '../services/video-carousel-generator.service';

const router = express.Router();

let videoGenerator: VideoCarouselGeneratorService;

function getVideoGenerator() {
  if (!videoGenerator) {
    videoGenerator = new VideoCarouselGeneratorService();
  }
  return videoGenerator;
}

/**
 * POST /api/video-test/generate
 * Testa geração de vídeo usando as imagens já geradas do Placid
 */
router.post('/generate', async (req: Request, res: Response) => {
  console.log('🎬 Gerando vídeo de teste com imagens existentes...');

  // Usar as 7 imagens que já foram geradas e funcionam
  const existingImages = [
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-c7fe86ad0cedadeb0259ffdcb05bab7a-a6shtr8z.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-2c2aec2783d7bb5b8e87d1c7242945b6-ev4coyyl.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-981b63ac81d987f2308682e3dc9d1426-hyty20sm.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-7ec226b3c817885ee683e844c76c6e10-wlwkbjse.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-7af3ded41fafa358bfa39f5da45c7cac-9ukw422l.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-03357df0f50d4163e0a0bff53b405f4f-jpo2uclu.jpg",
    "https://s3-placid.s3.eu-central-1.amazonaws.com/production/rest-images/gzrl0haj9qdu1/rest-58256571e589344c63b52f611e42d1e6-uvhdhxjb.jpg"
  ];

  try {
    console.log(`🖼️ Usando ${existingImages.length} imagens existentes`);

    const videoResult = await getVideoGenerator().generateVideoFromImages(
      existingImages,
      'demo-video-test',
      60 // 60 segundos
    );

    console.log('✅ Vídeo gerado com sucesso!');

    return res.status(200).json({
      success: true,
      video_url: videoResult.video_url,
      duration_seconds: videoResult.duration_seconds,
      total_slides: videoResult.total_slides,
      cost: videoResult.cost_usd,
      message: 'Vídeo de 60s gerado com sucesso! (usando imagens existentes)'
    });
  } catch (error: any) {
    console.error('❌ Error generating video:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to generate video',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;
