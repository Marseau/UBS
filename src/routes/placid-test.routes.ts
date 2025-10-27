import express, { Request, Response } from 'express';
import { PlacidCarouselGeneratorService } from '../services/placid-carousel-generator.service';
import { VideoCarouselGeneratorService } from '../services/video-carousel-generator.service';

const router = express.Router();

let placidGenerator: PlacidCarouselGeneratorService;
let videoGenerator: VideoCarouselGeneratorService;

function getPlacidGenerator() {
  if (!placidGenerator) {
    placidGenerator = new PlacidCarouselGeneratorService();
  }
  return placidGenerator;
}

function getVideoGenerator() {
  if (!videoGenerator) {
    videoGenerator = new VideoCarouselGeneratorService();
  }
  return videoGenerator;
}

/**
 * POST /api/placid-test/generate
 * Endpoint de teste para gerar carrossel sem depender do banco
 */
router.post('/generate', async (req: Request, res: Response) => {
  console.log('🎨 Gerando carrossel de teste...');

  const testContent = `Slide 1:
30% dos agendamentos falham em PMEs (HubSpot, 2024)

👉 Sua agenda está vazando receita?

Slide 2:
Agendamento manual = caos:

📲 WhatsApp + planilhas + telefone
❌ Zero integração
💥 Equipe sobrecarregada

Slide 3:
Exemplo:

Salão com 5 profissionais
2 faltas/semana cada → R$1.500/semana perdidos
Anual: R$78.000 indo embora

Slide 4:
Consequências:

1️⃣ Agenda furada
2️⃣ Clientes frustrados
3️⃣ Profissionais desmotivados

Slide 5:
E piora quando:

⚠️ Sem lembretes
⚠️ Agenda compartilhada
⚠️ Cliente muda última hora

Slide 6:
Sintomas claros:

✅ Tudo manual
✅ Não sabe quem confirmou
✅ Muitos cancelamentos

Slide 7:
👉 Resumindo: sua agenda pode estar drenando receita.

Salve este carrossel e siga para aprender como evitar!`;

  try {
    // 1. Gerar imagens via Placid
    console.log('🎨 Gerando imagens via Placid...');
    const carouselResult = await getPlacidGenerator().generateCarousel(
      testContent,
      'test-content-001'
    );

    console.log(`✅ ${carouselResult.carousel_urls.length} imagens geradas`);

    // 2. Converter imagens em vídeo de 60s
    console.log('🎬 Convertendo imagens em vídeo de 60s...');
    const videoResult = await getVideoGenerator().generateVideoFromImages(
      carouselResult.carousel_urls,
      'test-content-001',
      60 // 60 segundos
    );

    console.log('✅ Vídeo gerado com sucesso!');

    return res.status(200).json({
      success: true,
      content_id: 'test-content-001',
      carousel_urls: carouselResult.carousel_urls,
      video_url: videoResult.video_url,
      duration_seconds: videoResult.duration_seconds,
      total_slides: videoResult.total_slides,
      cost: videoResult.cost_usd,
      message: 'Vídeo carrossel de 60s gerado com sucesso!'
    });
  } catch (error: any) {
    console.error('❌ Error generating video carousel:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to generate video carousel',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;
