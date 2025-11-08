import express, { Request, Response } from 'express';
import { createOfficialAuthenticatedPage } from '../services/instagram-official-session.service';
import { discoverHashtagVariations } from '../services/instagram-hashtag-discovery.service';

const router = express.Router();

/**
 * POST /api/instagram/discover-hashtag-variations
 *
 * Descobre variações de uma hashtag e retorna com scores calculados
 * O workflow N8N persiste os dados em instagram_hashtag_variations
 */
router.post('/discover-hashtag-variations', async (req: Request, res: Response) => {
  try {
    const { parent_hashtag } = req.body;

    if (!parent_hashtag) {
      return res.status(400).json({
        error: 'Campo obrigatório faltando',
        required: ['parent_hashtag']
      });
    }

    // Remover # se vier no input
    const cleanHashtag = parent_hashtag.replace(/^#/, '');

    console.log(`\n🔍 Iniciando descoberta de variações para #${cleanHashtag}...`);

    // Criar página autenticada
    const page = await createOfficialAuthenticatedPage();

    // Descobrir variações
    const variations = await discoverHashtagVariations(page, cleanHashtag);

    if (variations.length === 0) {
      return res.status(200).json({
        success: true,
        parent_hashtag: cleanHashtag,
        variations: [],
        message: 'Nenhuma variação encontrada'
      });
    }

    // Filtrar apenas as com score > 80 (prioritárias)
    const priorityVariations = variations.filter(v => v.priority_score >= 80);

    console.log(`\n✅ Descoberta concluída:`);
    console.log(`   Total de variações: ${variations.length}`);
    console.log(`   Variações prioritárias (score >= 80): ${priorityVariations.length}`);

    // Retornar para N8N persistir
    return res.status(200).json({
      success: true,
      parent_hashtag: cleanHashtag,
      total_variations: variations.length,
      priority_variations: priorityVariations.length,
      variations: variations.map(v => ({
        parent_hashtag: cleanHashtag,
        hashtag: v.hashtag,
        post_count: v.post_count,
        post_count_formatted: v.post_count_formatted,
        priority_score: v.priority_score,
        volume_category: v.volume_category,
        discovered_at: new Date().toISOString()
      }))
    });

  } catch (error) {
    console.error('❌ Erro ao descobrir variações:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao descobrir variações de hashtag',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * GET /api/instagram/hashtag-variations/priority
 *
 * Retorna hashtags com score >= 80 que ainda não foram scrapadas
 * ou foram scrapadas há mais de 30 dias
 */
router.get('/hashtag-variations/priority', async (_req: Request, res: Response) => {
  try {
    // Esta rota será implementada quando integrarmos com Supabase
    // Por enquanto retorna vazio
    return res.status(200).json({
      success: true,
      message: 'Endpoint em desenvolvimento',
      priority_hashtags: []
    });

  } catch (error) {
    console.error('❌ Erro ao buscar hashtags prioritárias:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar hashtags prioritárias',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

export default router;
