import { Router, Request, Response } from 'express';
import {
  scrapeInstagramTag,
  scrapeInstagramProfile,
  closeBrowser,
  InstagramProfileData
} from '../services/instagram-scraper-single.service';
import { scrapeInstagramUserSearch } from '../services/instagram-scraper-user-search.service';
import { UrlScraperService } from '../services/url-scraper.service';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://qsdfyffuonywmtnlycri.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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
  const reqId = `TAG_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  try {
    const { search_term, max_profiles = 20 } = req.body;

    if (!search_term) {
      return res.status(400).json({
        success: false,
        message: 'Campo "search_term" é obrigatório'
      });
    }

    console.log(`\n🔎 [${reqId}] ========== SCRAPE-TAG INICIADO ==========`);
    console.log(`🔎 [${reqId}] Termo: #${search_term} (max: ${max_profiles} perfis)`);

    // DEBUG: Contar páginas ANTES
    const { getBrowserInstance } = await import('../services/instagram-session.service');
    const browser = getBrowserInstance();
    if (browser) {
      const pagesBefore = await browser.pages();
      console.log(`📊 [${reqId}] ANTES: ${pagesBefore.length} páginas abertas no browser`);
    }

    const profiles = await scrapeInstagramTag(search_term, max_profiles);

    // DEBUG: Contar páginas DEPOIS
    if (browser) {
      const pagesAfter = await browser.pages();
      console.log(`📊 [${reqId}] DEPOIS: ${pagesAfter.length} páginas abertas no browser`);
    }

    // Log consolidado dos perfis extraídos
    console.log(`\n📊 [${reqId}] Resumo dos ${profiles.length} perfis extraídos:`);

    const profilesWithEmail = profiles.filter(p => p.email).length;
    const profilesWithPhone = profiles.filter(p => p.phone).length;
    const profilesWithWebsite = profiles.filter(p => p.website).length;
    const profilesWithLocation = profiles.filter(p => p.city || p.state || p.address).length;
    const businessAccounts = profiles.filter(p => p.is_business_account).length;

    console.log(`   📧 Emails encontrados: ${profilesWithEmail}/${profiles.length}`);
    console.log(`   📱 Telefones encontrados: ${profilesWithPhone}/${profiles.length}`);
    console.log(`   🔗 Websites encontrados: ${profilesWithWebsite}/${profiles.length}`);
    console.log(`   📍 Localizações encontradas: ${profilesWithLocation}/${profiles.length}`);
    console.log(`   💼 Contas business: ${businessAccounts}/${profiles.length}`);

    if (profilesWithLocation > 0) {
      console.log(`\n   📍 Perfis com localização:`);
      profiles
        .filter(p => p.city || p.state)
        .slice(0, 5) // Mostrar apenas os primeiros 5
        .forEach(p => {
          const locationParts: string[] = [];
          if (p.city) locationParts.push(p.city);
          if (p.state) locationParts.push(p.state);
          console.log(`      @${p.username}: ${locationParts.join(', ')}`);
        });
      if (profilesWithLocation > 5) {
        console.log(`      ... e mais ${profilesWithLocation - 5} perfis`);
      }
    }

    console.log(`✅ [${reqId}] ========== SCRAPE-TAG FINALIZADO ==========\n`);

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

    // 🚨 CAPTURAR SCREENSHOT PARA N8N ENVIAR AO TELEGRAM
    let screenshotBase64: string | null = null;
    try {
      const { getBrowserInstance } = await import('../services/instagram-session.service');
      const browser = getBrowserInstance();

      if (browser) {
        const allPages = await browser.pages();
        const currentPage = allPages.find(p => !p.isClosed() && p.url().includes('instagram.com'));

        if (currentPage) {
          console.log(`📸 [${reqId}] Capturando screenshot do erro...`);
          const screenshot = await currentPage.screenshot({
            type: 'png',
            fullPage: true
          });
          screenshotBase64 = Buffer.from(screenshot).toString('base64');
          const sizeKB = ((screenshotBase64?.length || 0) / 1024).toFixed(1);
          console.log(`✅ [${reqId}] Screenshot capturado (${sizeKB} KB)`);
        }
      }
    } catch (screenshotError: any) {
      console.error('⚠️ Erro ao capturar screenshot:', screenshotError.message);
    }

    return res.status(500).json({
      success: false,
      message: 'Erro ao scrape hashtag',
      error: error.message,
      screenshot_base64: screenshotBase64,
      error_details: {
        endpoint: 'scrape-tag',
        request_id: reqId,
        timestamp: new Date().toISOString()
      },
      data: {
        search_term: req.body.search_term || '',
        profiles: [],
        total_found: 0
      }
    });
  } finally {
    // 🔥 FORÇAR LIMPEZA DE TODAS AS PÁGINAS AO FINAL
    const { cleanupAllContexts } = await import('../services/instagram-context-manager.service');
    await cleanupAllContexts();
    console.log(`🧹 [${reqId}] Todas as páginas foram limpas ao final da execução`);
  }
});

/**
 * POST /api/instagram-scraper/scrape-users
 * Busca usuários via campo de busca - retorna perfis validados (PT + activity >= 50)
 *
 * Body:
 * {
 *   "search_term": "gestor de trafego",
 *   "max_profiles": 5,
 *   "target_segment": "marketing",
 *   "search_terms_id": "uuid",
 *   "session_id": "uuid"
 * }
 */
router.post('/scrape-users', async (req: Request, res: Response) => {
  const reqId = `USERS_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  try {
    const {
      search_term,
      max_profiles = 5,
      target_segment,
      search_terms_id,
      session_id
    } = req.body;

    if (!search_term) {
      return res.status(400).json({
        success: false,
        message: 'Campo "search_term" é obrigatório'
      });
    }

    console.log(`\n🔍 [${reqId}] ========== SCRAPE-USERS INICIADO ==========`);
    console.log(`🔍 [${reqId}] Termo: "${search_term}" (max: ${max_profiles} perfis validados)`);

    // DEBUG: Contar páginas ANTES
    const { getBrowserInstance } = await import('../services/instagram-session.service');
    const browser = getBrowserInstance();
    if (browser) {
      const pagesBefore = await browser.pages();
      console.log(`📊 [${reqId}] ANTES: ${pagesBefore.length} páginas abertas no browser`);
    }

    const profiles = await scrapeInstagramUserSearch(search_term, max_profiles);

    // DEBUG: Contar páginas DEPOIS
    if (browser) {
      const pagesAfter = await browser.pages();
      console.log(`📊 [${reqId}] DEPOIS: ${pagesAfter.length} páginas abertas no browser`);
    }

    // Log consolidado dos perfis extraídos
    console.log(`\n📊 [${reqId}] Resumo dos ${profiles.length} perfis extraídos:`);

    const profilesWithEmail = profiles.filter(p => p.email).length;
    const profilesWithPhone = profiles.filter(p => p.phone).length;
    const profilesWithWebsite = profiles.filter(p => p.website).length;
    const profilesWithLocation = profiles.filter(p => p.city || p.state || p.address).length;
    const businessAccounts = profiles.filter(p => p.is_business_account).length;

    console.log(`   📧 Emails encontrados: ${profilesWithEmail}/${profiles.length}`);
    console.log(`   📱 Telefones encontrados: ${profilesWithPhone}/${profiles.length}`);
    console.log(`   🔗 Websites encontrados: ${profilesWithWebsite}/${profiles.length}`);
    console.log(`   📍 Localizações encontradas: ${profilesWithLocation}/${profiles.length}`);
    console.log(`   💼 Contas business: ${businessAccounts}/${profiles.length}`);

    if (profilesWithLocation > 0) {
      console.log(`\n   📍 Perfis com localização:`);
      profiles
        .filter(p => p.city || p.state)
        .slice(0, 5) // Mostrar apenas os primeiros 5
        .forEach(p => {
          const locationParts: string[] = [];
          if (p.city) locationParts.push(p.city);
          if (p.state) locationParts.push(p.state);
          console.log(`      @${p.username}: ${locationParts.join(', ')}`);
        });
      if (profilesWithLocation > 5) {
        console.log(`      ... e mais ${profilesWithLocation - 5} perfis`);
      }
    }

    console.log(`✅ [${reqId}] ========== SCRAPE-USERS FINALIZADO ==========\n`);

    return res.status(200).json({
      success: true,
      data: {
        search_term,
        profiles,
        total_found: profiles.length,
        target_segment,
        search_terms_id,
        session_id
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao scrape users:', error);

    // 🚨 CAPTURAR SCREENSHOT PARA N8N ENVIAR AO TELEGRAM
    let screenshotBase64: string | null = null;
    try {
      const { getBrowserInstance } = await import('../services/instagram-session.service');
      const browser = getBrowserInstance();

      if (browser) {
        const allPages = await browser.pages();
        const currentPage = allPages.find(p => !p.isClosed() && p.url().includes('instagram.com'));

        if (currentPage) {
          console.log(`📸 [${reqId}] Capturando screenshot do erro...`);
          const screenshot = await currentPage.screenshot({
            type: 'png',
            fullPage: true
          });
          screenshotBase64 = Buffer.from(screenshot).toString('base64');
          const sizeKB = ((screenshotBase64?.length || 0) / 1024).toFixed(1);
          console.log(`✅ [${reqId}] Screenshot capturado (${sizeKB} KB)`);
        }
      }
    } catch (screenshotError: any) {
      console.error('⚠️ Erro ao capturar screenshot:', screenshotError.message);
    }

    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar usuários',
      error: error.message,
      screenshot_base64: screenshotBase64,
      error_details: {
        endpoint: 'scrape-users',
        request_id: reqId,
        timestamp: new Date().toISOString()
      },
      data: {
        search_term: req.body.search_term || '',
        profiles: [],
        total_found: 0,
        target_segment: req.body.target_segment || null,
        search_terms_id: req.body.search_terms_id || null,
        session_id: req.body.session_id || null
      }
    });
  } finally {
    // 🔥 FORÇAR LIMPEZA DE TODAS AS PÁGINAS AO FINAL
    const { cleanupAllContexts } = await import('../services/instagram-context-manager.service');
    await cleanupAllContexts();
    console.log(`🧹 [${reqId}] Todas as páginas foram limpas ao final da execução`);
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

    console.log(`\n👤 ========== SCRAPE-PROFILE INICIADO ==========`);
    console.log(`👤 Username: @${username}`);

    const profileData = await scrapeInstagramProfile(username);

    // Log detalhado dos dados extraídos
    console.log(`\n📊 Dados extraídos do perfil @${username}:`);
    console.log(`   👤 Full Name: ${profileData.full_name || 'N/A'}`);
    console.log(`   📈 Seguidores: ${profileData.followers_count || 0}`);
    console.log(`   📸 Posts: ${profileData.posts_count || 0}`);

    if (profileData.website) {
      console.log(`   🔗 Website (link da bio): ${profileData.website}`);
    }

    if (profileData.email) {
      console.log(`   📧 Email: ${profileData.email}`);
    }

    if (profileData.phone) {
      console.log(`   📱 Telefone: ${profileData.phone}`);
    }

    if (profileData.city || profileData.state || profileData.address) {
      const locationParts: string[] = [];
      if (profileData.city) locationParts.push(profileData.city);
      if (profileData.state) locationParts.push(profileData.state);
      if (profileData.neighborhood) locationParts.push(`(${profileData.neighborhood})`);
      console.log(`   📍 Localização: ${locationParts.join(', ')}`);

      if (profileData.address) {
        console.log(`   🏠 Endereço: ${profileData.address}`);
      }

      if (profileData.zip_code) {
        console.log(`   📮 CEP: ${profileData.zip_code}`);
      }
    }

    console.log(`✅ ========== SCRAPE-PROFILE FINALIZADO ==========\n`);

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
 * POST /api/instagram-scraper/cleanup-pages
 * Limpa todas as páginas abertas SEM fechar o browser
 * Útil para N8N chamar entre execuções
 */
router.post('/cleanup-pages', async (req: Request, res: Response) => {
  try {
    const { cleanupAllContexts, getContextStats } = await import('../services/instagram-context-manager.service');
    const { getBrowserInstance } = await import('../services/instagram-session.service');

    const browser = getBrowserInstance();

    if (!browser) {
      return res.status(200).json({
        success: true,
        message: 'Browser não está inicializado, nada para limpar',
        pages_cleaned: 0
      });
    }

    const pagesBefore = await browser.pages();
    const statsBefore = getContextStats();

    console.log(`⏳ [CLEANUP] Aguardando 60s antes de limpar páginas...`);
    await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60s

    console.log(`🧹 [CLEANUP] Limpando ${statsBefore.activeCount} páginas gerenciadas...`);

    await cleanupAllContexts();

    const pagesAfter = await browser.pages();
    const pagesRemoved = pagesBefore.length - pagesAfter.length;

    console.log(`✅ [CLEANUP] ${pagesRemoved} páginas removidas (${pagesAfter.length} restantes)`);

    return res.status(200).json({
      success: true,
      message: 'Páginas limpas com sucesso',
      pages_before: pagesBefore.length,
      pages_after: pagesAfter.length,
      pages_cleaned: pagesRemoved,
      managed_pages_cleaned: statsBefore.activeCount
    });
  } catch (error: any) {
    console.error('❌ Erro ao limpar páginas:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao limpar páginas',
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
      'POST /scrape-tag': 'Scrape hashtag específica - retorna perfis completos',
      'POST /scrape-users': 'Busca usuários validados (PT + activity >= 50) - retorna perfis com hashtags',
      'POST /scrape-profile': 'Scrape perfil específico - retorna dados do perfil',
      'POST /cleanup-pages': 'Limpa todas as páginas abertas SEM fechar o browser',
      'POST /close-browser': 'Fechar browser Puppeteer',
      'GET /debug-page': 'Debug: mostra elementos da página atual',
      'GET /debug-pages': 'Debug: lista TODAS as páginas abertas no browser'
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/instagram-scraper/debug-pages
 * DEBUG: Lista TODAS as páginas abertas no browser
 */
router.get('/debug-pages', async (req: Request, res: Response) => {
  try {
    const { getBrowserInstance } = await import('../services/instagram-session.service');
    const { getContextStats } = await import('../services/instagram-context-manager.service');

    const browser = getBrowserInstance();

    if (!browser) {
      return res.status(200).json({
        success: true,
        browser_running: false,
        message: 'Browser não está inicializado'
      });
    }

    const allPages = await browser.pages();
    const contextStats = getContextStats();

    const pagesInfo = await Promise.all(
      allPages.map(async (page, index) => ({
        index,
        url: page.url(),
        isClosed: page.isClosed(),
        title: await page.title().catch(() => 'N/A')
      }))
    );

    return res.status(200).json({
      success: true,
      browser_running: true,
      total_pages_in_browser: allPages.length,
      active_managed_pages: contextStats.activeCount,
      unmanaged_pages: allPages.length - contextStats.activeCount,
      pages: pagesInfo,
      managed_contexts: contextStats.contexts
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar páginas',
      error: error.message
    });
  }
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

/**
 * POST /api/instagram-scraper/scrape-url
 * Scrape URL para extrair emails e telefones
 *
 * Body:
 * {
 *   "lead_id": 123,
 *   "url": "https://doity.com.br/...",
 *   "update_database": true (opcional, default: false)
 * }
 */
router.post('/scrape-url', async (req: Request, res: Response) => {
  try {
    const { lead_id, url, update_database = false } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'Campo "url" é obrigatório'
      });
    }

    console.log(`🔍 [SCRAPE-URL] Iniciando scraping: ${url}`);

    // Scrape URL
    const result = await UrlScraperService.scrapeUrl(url);

    // Se update_database=true e lead_id fornecido, atualizar no banco
    if (update_database && lead_id) {
      const { error: updateError } = await supabase
        .from('instagram_leads')
        .update({
          email: result.emails[0] || null,
          phone: result.phones[0] || null,
          additional_emails: result.emails.slice(1),
          additional_phones: result.phones.slice(1),
          url_enriched: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead_id);

      if (updateError) {
        console.error(`❌ [SCRAPE-URL] Erro ao atualizar lead ${lead_id}:`, updateError);
        return res.status(500).json({
          success: false,
          message: 'Erro ao atualizar lead no banco',
          scraping_result: result,
          error: updateError.message
        });
      }

      console.log(`✅ [SCRAPE-URL] Lead ${lead_id} atualizado com sucesso`);
    }

    return res.status(200).json({
      success: true,
      lead_id,
      url,
      emails: result.emails,
      phones: result.phones,
      total_contacts: result.emails.length + result.phones.length,
      database_updated: update_database && lead_id ? true : false
    });

  } catch (error: any) {
    console.error('❌ [SCRAPE-URL] Erro:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao scraping URL',
      error: error.message
    });
  }
});

console.log('🔍 [DEBUG] Instagram Scraper Routes - All routes registered, exporting router');

export default router;
