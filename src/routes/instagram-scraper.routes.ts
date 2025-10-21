import { Router, Request, Response } from 'express';
import {
  scrapeInstagramTag,
  scrapeInstagramProfile,
  closeBrowser
} from '../services/instagram-scraper-single.service';

const router = Router();

console.log('🔍 [DEBUG] Instagram Scraper Routes - Module loaded and router created');

/**
 * POST /api/instagram-scraper/scrape-tag
 * Scrape uma hashtag específica - retorna usernames (Opção B - Integração N8N)
 *
 * Body:
 * {
 *   "search_term": "gestor_de_trafego",
 *   "max_profiles": 10
 * }
 */
router.post('/scrape-tag', async (req: Request, res: Response) => {
  try {
    const { search_term, max_profiles = 20 } = req.body;

    if (!search_term) {
      return res.status(400).json({
        success: false,
        message: 'Campo "search_term" é obrigatório'
      });
    }

    console.log(`🔎 Scraping tag: #${search_term} (max: ${max_profiles} perfis)`);

    const profiles = await scrapeInstagramTag(search_term, max_profiles);

    return res.status(200).json({
      success: true,
      data: {
        search_term,
        profiles,
        total_found: profiles.length
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao scrape tag:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao scrape hashtag',
      error: error.message
    });
  }
});

/**
 * POST /api/instagram-scraper/scrape-profile
 * Scrape um perfil específico - retorna dados do perfil (Opção B - Integração N8N)
 *
 * Body:
 * {
 *   "username": "exemplo_usuario"
 * }
 */
router.post('/scrape-profile', async (req: Request, res: Response) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Campo "username" é obrigatório'
      });
    }

    console.log(`👤 Scraping perfil: @${username}`);

    const profileData = await scrapeInstagramProfile(username);

    return res.status(200).json({
      success: true,
      data: profileData
    });

  } catch (error: any) {
    console.error('❌ Erro ao scrape perfil:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao scrape perfil',
      error: error.message
    });
  }
});

/**
 * POST /api/instagram-scraper/close-browser
 * Fecha o browser Puppeteer (libera recursos)
 */
router.post('/close-browser', async (req: Request, res: Response) => {
  try {
    await closeBrowser();
    return res.status(200).json({
      success: true,
      message: 'Browser fechado com sucesso'
    });
  } catch (error: any) {
    console.error('❌ Erro ao fechar browser:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao fechar browser',
      error: error.message
    });
  }
});

/**
 * GET /api/instagram-scraper/status
 * Verifica o status do serviço
 */
router.get('/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Instagram Scraper Service está ativo',
    endpoints: {
      'POST /scrape-tag': 'Scrape hashtag específica - retorna usernames',
      'POST /scrape-profile': 'Scrape perfil específico - retorna dados do perfil',
      'POST /close-browser': 'Fechar browser Puppeteer',
      'GET /debug-page': 'Debug: mostra elementos da página atual'
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/instagram-scraper/debug-page
 * DEBUG: Mostra informações sobre elementos na página atual
 */
router.get('/debug-page', async (req: Request, res: Response) => {
  try {
    const { getSessionPage } = await import('../services/instagram-scraper-single.service');
    const page = await getSessionPage();

    const debugInfo: any = await page.evaluate(`
      (() => {
        const allLinks = Array.from(document.querySelectorAll('a'));
        const articleLinks = Array.from(document.querySelectorAll('article a'));

        return {
          url: window.location.href,
          totalLinks: allLinks.length,
          linksWithP: allLinks.filter(a => a.href.includes('/p/')).length,
          linksWithReel: allLinks.filter(a => a.href.includes('/reel/')).length,
          articleLinks: articleLinks.length,
          articleLinksWithP: articleLinks.filter(a => a.href.includes('/p/')).length,
          articleLinksWithReel: articleLinks.filter(a => a.href.includes('/reel/')).length,
          first10Hrefs: allLinks.slice(0, 10).map(a => a.href),
          selectorTest: {
            'article a[href*="/p/"]': document.querySelectorAll('article a[href*="/p/"]').length,
            'article a[href*="/reel/"]': document.querySelectorAll('article a[href*="/reel/"]').length,
            'a[href*="/p/"]': document.querySelectorAll('a[href*="/p/"]').length,
            'a[href*="/reel/"]': document.querySelectorAll('a[href*="/reel/"]').length
          }
        };
      })()
    `);

    return res.status(200).json({
      success: true,
      data: debugInfo
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao debugar página',
      error: error.message
    });
  }
});

console.log('🔍 [DEBUG] Instagram Scraper Routes - All routes registered, exporting router');

export default router;
