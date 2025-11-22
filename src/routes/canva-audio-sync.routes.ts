import express, { Request, Response } from 'express';
import { CanvaAudioOnlySyncService } from '../services/canva-audio-only-sync.service';

const router = express.Router();
const service = new CanvaAudioOnlySyncService();

/**
 * POST /api/canva-audio-sync/test
 * Testa geração de vídeo SEM re-encoding (apenas sincroniza áudio)
 */
router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { base_video_url, tweets, cta_text, content_id, generate_subtitles } = req.body;

    if (!base_video_url || !tweets || !cta_text) {
      res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: base_video_url, tweets (7 itens), cta_text'
      });
      return;
    }

    if (!Array.isArray(tweets) || tweets.length !== 7) {
      res.status(400).json({
        success: false,
        error: 'O campo "tweets" deve ser um array com exatamente 7 itens'
      });
      return;
    }

    const result = await service.generateWithAudioOnly(
      base_video_url,
      tweets,
      cta_text,
      content_id || `test-audio-sync-${Date.now()}`,
      generate_subtitles !== false // Default: true
    );

    res.json({
      success: true,
      ...result,
      message: 'Vídeo gerado SEM re-encoding (transições 100% preservadas)'
    });

  } catch (error: any) {
    console.error('Erro ao gerar vídeo:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
