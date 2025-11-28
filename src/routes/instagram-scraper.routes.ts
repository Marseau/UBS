import { Router, Request, Response } from 'express';
import {
  scrapeInstagramTag,
  scrapeInstagramExplore,
  scrapeInstagramProfile,
  scrapeProfileWithExistingPage,
  closeBrowser,
  InstagramProfileData,
  getBrowserStatus,
  forceCloseBrowser,
  listPuppeteerProcesses,
  killOrphanPuppeteerProcesses
} from '../services/instagram-scraper-single.service';
import { createIsolatedContext } from '../services/instagram-context-manager.service';
import { scrapeInstagramUserSearch } from '../services/instagram-scraper-user-search.service';
import { scrapeInstagramFollowers } from '../services/instagram-followers-scraper.service';
import { UrlScraperService } from '../services/url-scraper.service';
import { cleanOrphanPages, monitorOrphanPages, detectOrphanPages } from '../services/instagram-page-cleaner.service';
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
 *   "max_profiles": 10,
 *   "account_profile": "conta1" (opcional, default: "default")
 * }
 */
router.post('/scrape-tag', async (req: Request, res: Response) => {
  const reqId = `TAG_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  try {
    const { search_term, max_profiles = 20, account_profile = 'default' } = req.body;

    if (!search_term) {
      return res.status(400).json({
        success: false,
        message: 'Campo "search_term" é obrigatório'
      });
    }

    console.log(`\n🔎 [${reqId}] ========== SCRAPE-TAG INICIADO ==========`);
    console.log(`🔎 [${reqId}] Termo: #${search_term} (max: ${max_profiles} perfis)`);
    if (account_profile && account_profile !== 'default') {
      console.log(`🎯 [${reqId}] Conta manual: ${account_profile}`);
    }

    // DEBUG: Contar páginas ANTES
    const { getBrowserInstance } = await import('../services/instagram-session.service');
    const browser = getBrowserInstance();
    if (browser) {
      const pagesBefore = await browser.pages();
      console.log(`📊 [${reqId}] ANTES: ${pagesBefore.length} páginas abertas no browser`);
    }

    const result = await scrapeInstagramTag(search_term, max_profiles, account_profile);

    // DEBUG: Contar páginas DEPOIS
    if (browser) {
      const pagesAfter = await browser.pages();
      console.log(`📊 [${reqId}] DEPOIS: ${pagesAfter.length} páginas abertas no browser`);
    }

    // 🆕 LOG DE RESULTADO PARCIAL
    if (result.is_partial) {
      console.log(`⚠️  [${reqId}] RESULTADO PARCIAL: ${result.collected}/${result.requested} perfis (${result.completion_rate})`);
      console.log(`   Possíveis causas: timeout, detached frame, ou falta de perfis na hashtag`);
    }

    // Log consolidado dos perfis extraídos
    console.log(`\n📊 [${reqId}] Resumo dos ${result.profiles.length} perfis extraídos:`);

    const profilesWithEmail = result.profiles.filter(p => p.email).length;
    const profilesWithPhone = result.profiles.filter(p => p.phone).length;
    const profilesWithWebsite = result.profiles.filter(p => p.website).length;
    const profilesWithLocation = result.profiles.filter(p => p.city || p.state || p.address).length;
    const businessAccounts = result.profiles.filter(p => p.is_business_account).length;

    console.log(`   📧 Emails encontrados: ${profilesWithEmail}/${result.profiles.length}`);
    console.log(`   📱 Telefones encontrados: ${profilesWithPhone}/${result.profiles.length}`);
    console.log(`   🔗 Websites encontrados: ${profilesWithWebsite}/${result.profiles.length}`);
    console.log(`   📍 Localizações encontradas: ${profilesWithLocation}/${result.profiles.length}`);
    console.log(`   💼 Contas business: ${businessAccounts}/${result.profiles.length}`);

    if (profilesWithLocation > 0) {
      console.log(`\n   📍 Perfis com localização:`);
      result.profiles
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

    // 🆕 VALIDAÇÃO: Resultado vazio pode indicar erro silencioso
    if (result.collected === 0) {
      console.warn(`⚠️  [${reqId}] ALERTA: Nenhum perfil encontrado para #${search_term}`);
      console.warn(`   Possíveis causas:`);
      console.warn(`   1. Hashtag sem posts`);
      console.warn(`   2. Erro de 'detached frame' durante scraping`);
      console.warn(`   3. Instagram bloqueou temporariamente`);

      // Capturar screenshot para análise
      let screenshotBase64: string | null = null;
      try {
        const { getBrowserInstance } = await import('../services/instagram-session.service');
        const browser = getBrowserInstance();
        if (browser) {
          const allPages = await browser.pages();
          const currentPage = allPages.find(p => !p.isClosed() && p.url().includes('instagram.com'));
          if (currentPage) {
            const screenshot = await currentPage.screenshot({ type: 'png', fullPage: true });
            screenshotBase64 = Buffer.from(screenshot).toString('base64');
          }
        }
      } catch {}

      return res.status(200).json({
        success: false, // ❌ Marcar como false quando vazio
        message: 'Nenhum perfil encontrado - possível erro de scraping',
        screenshot_base64: screenshotBase64,
        partial_result: false,
        data: {
          search_term,
          profiles: [],
          total_found: 0,
          expected: result.requested,
          completion_rate: '0%'
        }
      });
    }

    return res.status(200).json({
      success: result.collected > 0, // ✅ true se tem ALGUM dado
      partial_result: result.is_partial, // 🆕 Flag para N8N saber
      data: {
        search_term,
        profiles: result.profiles,
        total_found: result.collected,
        expected: result.requested,
        completion_rate: result.completion_rate
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
 * POST /api/instagram-scraper/scrape-explore
 * Scrape a página Explorar do Instagram - retorna perfis com bio/contato válidos
 * Diferente do scrape-tag, não precisa de termo de busca - vai direto para /explore/
 *
 * Body:
 * {
 *   "max_profiles": 10,
 *   "account_profile": "conta1" (opcional, default: "default")
 * }
 */
router.post('/scrape-explore', async (req: Request, res: Response) => {
  const reqId = `EXPLORE_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  try {
    const { max_profiles = 10, account_profile = 'default' } = req.body;

    console.log(`\n🔭 [${reqId}] ========== SCRAPE-EXPLORE INICIADO ==========`);
    console.log(`🔭 [${reqId}] Página: Instagram Explorar (max: ${max_profiles} perfis)`);
    if (account_profile && account_profile !== 'default') {
      console.log(`🎯 [${reqId}] Conta manual: ${account_profile}`);
    }

    // DEBUG: Contar páginas ANTES
    const { getBrowserInstance } = await import('../services/instagram-session.service');
    const browser = getBrowserInstance();
    if (browser) {
      const pagesBefore = await browser.pages();
      console.log(`📊 [${reqId}] ANTES: ${pagesBefore.length} páginas abertas no browser`);
    }

    const result = await scrapeInstagramExplore(max_profiles, account_profile);

    // DEBUG: Contar páginas DEPOIS
    if (browser) {
      const pagesAfter = await browser.pages();
      console.log(`📊 [${reqId}] DEPOIS: ${pagesAfter.length} páginas abertas no browser`);
    }

    // LOG DE RESULTADO PARCIAL
    if (result.is_partial) {
      console.log(`⚠️  [${reqId}] RESULTADO PARCIAL: ${result.collected}/${result.requested} perfis (${result.completion_rate})`);
      console.log(`   Possíveis causas: timeout, detached frame, ou falta de perfis no explorar`);
    }

    // Log consolidado dos perfis extraídos
    console.log(`\n📊 [${reqId}] Resumo dos ${result.profiles.length} perfis extraídos:`);

    const profilesWithEmail = result.profiles.filter(p => p.email).length;
    const profilesWithPhone = result.profiles.filter(p => p.phone).length;
    const profilesWithWebsite = result.profiles.filter(p => p.website).length;
    const profilesWithLocation = result.profiles.filter(p => p.city || p.state || p.address).length;
    const businessAccounts = result.profiles.filter(p => p.is_business_account).length;

    console.log(`   📧 Emails encontrados: ${profilesWithEmail}/${result.profiles.length}`);
    console.log(`   📱 Telefones encontrados: ${profilesWithPhone}/${result.profiles.length}`);
    console.log(`   🔗 Websites encontrados: ${profilesWithWebsite}/${result.profiles.length}`);
    console.log(`   📍 Localizações encontradas: ${profilesWithLocation}/${result.profiles.length}`);
    console.log(`   💼 Contas business: ${businessAccounts}/${result.profiles.length}`);

    if (profilesWithLocation > 0) {
      console.log(`\n   📍 Perfis com localização:`);
      result.profiles
        .filter(p => p.city || p.state)
        .slice(0, 5)
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

    console.log(`✅ [${reqId}] ========== SCRAPE-EXPLORE FINALIZADO ==========\n`);

    // VALIDAÇÃO: Resultado vazio pode indicar erro silencioso
    if (result.collected === 0) {
      console.warn(`⚠️  [${reqId}] ALERTA: Nenhum perfil encontrado na página Explorar`);
      console.warn(`   Possíveis causas:`);
      console.warn(`   1. Página Explorar não carregou corretamente`);
      console.warn(`   2. Erro de 'detached frame' durante scraping`);
      console.warn(`   3. Instagram bloqueou temporariamente`);

      // Capturar screenshot para análise
      let screenshotBase64: string | null = null;
      try {
        const { getBrowserInstance } = await import('../services/instagram-session.service');
        const browser = getBrowserInstance();
        if (browser) {
          const allPages = await browser.pages();
          const currentPage = allPages.find(p => !p.isClosed() && p.url().includes('instagram.com'));
          if (currentPage) {
            const screenshot = await currentPage.screenshot({ type: 'png', fullPage: true });
            screenshotBase64 = Buffer.from(screenshot).toString('base64');
          }
        }
      } catch {}

      return res.status(200).json({
        success: false,
        message: 'Nenhum perfil encontrado - possível erro de scraping',
        screenshot_base64: screenshotBase64,
        partial_result: false,
        data: {
          search_term: 'explorar_instagram',
          profiles: [],
          total_found: 0,
          expected: result.requested,
          completion_rate: '0%'
        }
      });
    }

    return res.status(200).json({
      success: result.collected > 0,
      partial_result: result.is_partial,
      data: {
        search_term: 'explorar_instagram',
        profiles: result.profiles,
        total_found: result.collected,
        expected: result.requested,
        completion_rate: result.completion_rate
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao scrape explore:', error);

    // CAPTURAR SCREENSHOT PARA N8N ENVIAR AO TELEGRAM
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
      message: 'Erro ao scrape página Explorar',
      error: error.message,
      screenshot_base64: screenshotBase64,
      error_details: {
        endpoint: 'scrape-explore',
        request_id: reqId,
        timestamp: new Date().toISOString()
      },
      data: {
        search_term: 'explorar_instagram',
        profiles: [],
        total_found: 0
      }
    });
  } finally {
    // FORÇAR LIMPEZA DE TODAS AS PÁGINAS AO FINAL
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
 * POST /api/instagram-scraper/scrape-profiles-batch
 * Scrape múltiplos perfis SEQUENCIALMENTE (1 por vez, mesma sessão)
 * Body: { usernames: string[] }
 */
router.post('/scrape-profiles-batch', async (req: Request, res: Response) => {
  const reqId = `BATCH_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  try {
    const { usernames } = req.body;

    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Campo "usernames" é obrigatório e deve ser array não vazio'
      });
    }

    // ⚠️ VALIDAÇÃO: Detectar se N8N enviou objetos ao invés de strings
    const invalidUsernames = usernames.filter(u => typeof u !== 'string');
    if (invalidUsernames.length > 0) {
      console.error(`\n❌ [${reqId}] ERRO: N8N enviou objetos ao invés de strings!`);
      console.error(`   Recebido: ${JSON.stringify(usernames, null, 2)}`);
      return res.status(400).json({
        success: false,
        message: 'Array "usernames" deve conter apenas STRINGS, não objetos',
        hint: 'No N8N, use: {{ $json.username }} ou {{ $("node").all().map(item => item.json.username) }}',
        received: usernames
      });
    }

    console.log(`\n👥 [${reqId}] ========== SCRAPE-PROFILES-BATCH INICIADO ==========`);
    console.log(`👥 [${reqId}] Total de perfis: ${usernames.length}`);
    console.log(`📋 [${reqId}] Usernames: ${usernames.map(u => `@${u}`).join(', ')}`);
    console.log(`⚠️  [${reqId}] Processamento SEQUENCIAL (1 por vez, mesma sessão)\n`);

    // DEBUG: Contar páginas ANTES
    const { getBrowserInstance } = await import('../services/instagram-session.service');
    const browser = getBrowserInstance();
    if (browser) {
      const pagesBefore = await browser.pages();
      console.log(`📊 [${reqId}] ANTES: ${pagesBefore.length} páginas abertas no browser`);
    }

    const results: any[] = [];
    const errors: any[] = [];

    // 🔑 Criar contexto UMA VEZ para todo o batch (mantém sessão aberta)
    const { page, requestId, cleanup } = await createIsolatedContext();
    console.log(`🔒 Contexto criado: ${requestId} - será reutilizado para todos os perfis\n`);

    try {
      // Processar SEQUENCIALMENTE (1 por vez) com MESMA PÁGINA
      for (let i = 0; i < usernames.length; i++) {
        const username = usernames[i];
        console.log(`\n[${i + 1}/${usernames.length}] Processando @${username}...`);

        try {
          // 🎯 Usar função que NÃO cria/fecha contexto
          const profileData = await scrapeProfileWithExistingPage(page, username);

          console.log(`   ✅ @${username}: ${profileData.followers_count || 0} seguidores, ${profileData.posts_count || 0} posts`);

          // ========================================
          // 🚫 VALIDAÇÕES EARLY-EXIT (3 FILTROS)
          // ========================================

          // VALIDAÇÃO 1: FOLLOWERS < 250
          const currentFollowersCount = profileData.followers_count || 0;
          if (currentFollowersCount < 250) {
            console.log(`   🚫 REJEITADO (Validação 1/3): @${username} tem apenas ${currentFollowersCount} seguidores (mínimo: 250)`);

            // Delay humano: analisando decisão de rejeitar
            await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200)); // 0.8-2s

            try {
              console.log(`   🗑️  Removendo do banco...`);
              await supabase.from('instagram_leads').delete().eq('username', username);
              await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 800)); // 0.5-1.3s após deleção
              console.log(`   ✅ Removido`);
            } catch {}

            errors.push({
              username,
              success: false,
              error: `Rejeitado: ${currentFollowersCount} seguidores < 250 (mínimo)`
            });

            // Pausa antes de ir para o próximo (pensando/descansando)
            const pauseDelay = 1200 + Math.random() * 1800; // 1.2-3s
            console.log(`   ⏭️  Pulando para próximo perfil (aguardando ${(pauseDelay/1000).toFixed(1)}s)...\n`);
            await new Promise(resolve => setTimeout(resolve, pauseDelay));
            continue;
          }

          // VALIDAÇÃO 2: ACTIVITY SCORE < 50
          const { calculateActivityScore } = await import('../services/instagram-profile.utils');
          const activityScore = calculateActivityScore(profileData);
          (profileData as any).activity_score = activityScore.score;
          (profileData as any).is_active = activityScore.isActive;

          console.log(`   📊 Activity Score: ${activityScore.score}/100 (${activityScore.isActive ? 'ATIVA ✅' : 'INATIVA ❌'})`);

          if (!activityScore.isActive) {
            console.log(`   🚫 REJEITADO (Validação 2/3): Activity score muito baixo (score: ${activityScore.score})`);

            // Delay humano: analisando decisão de rejeitar
            await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200)); // 0.8-2s

            try {
              console.log(`   🗑️  Removendo do banco...`);
              await supabase.from('instagram_leads').delete().eq('username', username);
              await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 800)); // 0.5-1.3s após deleção
              console.log(`   ✅ Removido`);
            } catch {}

            errors.push({
              username,
              success: false,
              error: `Rejeitado: Activity score ${activityScore.score} < 50 (inativo)`
            });

            // Pausa antes de ir para o próximo (pensando/descansando)
            const pauseDelay = 1200 + Math.random() * 1800; // 1.2-3s
            console.log(`   ⏭️  Pulando para próximo perfil (aguardando ${(pauseDelay/1000).toFixed(1)}s)...\n`);
            await new Promise(resolve => setTimeout(resolve, pauseDelay));
            continue;
          }

          // VALIDAÇÃO 3: IDIOMA != PT
          const { detectLanguage } = await import('../services/language-country-detector.service');
          console.log(`   🌍 Detectando idioma da bio...`);
          const languageDetection = await detectLanguage(profileData.bio || '', username);
          (profileData as any).language = languageDetection.language;
          console.log(`   🎯 Idioma detectado: ${languageDetection.language} (${languageDetection.confidence})`);

          if (languageDetection.language !== 'pt') {
            console.log(`   🚫 REJEITADO (Validação 3/3): Idioma não-português (${languageDetection.language})`);

            // Delay humano: analisando decisão de rejeitar
            await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200)); // 0.8-2s

            try {
              console.log(`   🗑️  Removendo do banco...`);
              await supabase.from('instagram_leads').delete().eq('username', username);
              await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 800)); // 0.5-1.3s após deleção
              console.log(`   ✅ Removido`);
            } catch {}

            errors.push({
              username,
              success: false,
              error: `Rejeitado: Idioma ${languageDetection.language} != pt (português)`
            });

            // Pausa antes de ir para o próximo (pensando/descansando)
            const pauseDelay = 1200 + Math.random() * 1800; // 1.2-3s
            console.log(`   ⏭️  Pulando para próximo perfil (aguardando ${(pauseDelay/1000).toFixed(1)}s)...\n`);
            await new Promise(resolve => setTimeout(resolve, pauseDelay));
            continue;
          }

          console.log(`   ✅ PERFIL APROVADO NAS 3 VALIDAÇÕES - Prosseguindo com scraping completo...\n`);

          // ========================================
          // 🆕 EXTRAÇÃO DE HASHTAGS DOS POSTS (2 posts)
          // ========================================
          console.log(`   🏷️  Extraindo hashtags dos últimos 2 posts...`);
          try {
            const { extractHashtagsFromPosts, retryWithBackoff } = await import('../services/instagram-profile.utils');

            const profileUrl = `https://www.instagram.com/${username}/`;
            await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Envolver com retry mechanism (máx 2 tentativas, backoff 3s)
            const postHashtags = await retryWithBackoff(
              () => extractHashtagsFromPosts(page, 2),
              2, // máximo 2 tentativas
              3000 // backoff de 3s
            );

            if (postHashtags && postHashtags.length > 0) {
              (profileData as any).hashtags_posts = postHashtags;
              console.log(`   ✅ ${postHashtags.length} hashtags extraídas dos posts`);
            } else {
              (profileData as any).hashtags_posts = null;
              console.log(`   ⚠️  Nenhuma hashtag encontrada nos posts`);
            }
          } catch (hashtagError: any) {
            console.log(`   ⚠️  Erro ao extrair hashtags dos posts: ${hashtagError.message}`);
            (profileData as any).hashtags_posts = null;
          }

          // ========================================
          // 🆕 SCRAPING DE SEGUIDORES (10K-300K followers)
          // ========================================
          const followersCount = profileData.followers_count || 0;
          const hasRelevantAudience = (followersCount >= 10000 && followersCount <= 300000);

          if (hasRelevantAudience) {
            console.log(`\n   🎯 AUDIÊNCIA RELEVANTE DETECTADA!`);
            console.log(`   📊 Seguidores do perfil: ${followersCount.toLocaleString()}`);
            console.log(`   👥 Iniciando scraping de 50 seguidores...`);

            try {
              const { scrapeInstagramFollowers } = await import('../services/instagram-followers-scraper.service');

              // Scrapear 50 seguidores do concorrente
              const followersResult = await scrapeInstagramFollowers(username, 50, page);

              if (followersResult.success && followersResult.followers.length > 0) {
                // Adicionar seguidores ao objeto do perfil
                (profileData as any).followers = followersResult.followers;
                (profileData as any).has_relevant_audience = true;
                (profileData as any).lead_source = 'profile_with_audience';
                (profileData as any).followers_scraped_count = followersResult.followers.length;

                console.log(`   ✅ ${followersResult.followers.length} seguidores coletados com sucesso!`);
                console.log(`   📦 Seguidores salvos em memória (serão persistidos pelo N8N)`);
              } else {
                console.log(`   ⚠️  Falha ao scrapear seguidores: ${followersResult.error_message || 'Erro desconhecido'}`);
                (profileData as any).has_relevant_audience = true;
                (profileData as any).lead_source = 'profile_with_audience';
                (profileData as any).followers = [];
                (profileData as any).followers_scraped_count = 0;
              }
            } catch (followersError: any) {
              console.log(`   ❌ Erro ao scrapear seguidores: ${followersError.message}`);
              (profileData as any).has_relevant_audience = true;
              (profileData as any).lead_source = 'profile_with_audience';
              (profileData as any).followers = [];
              (profileData as any).followers_scraped_count = 0;
            }

            console.log(`   ⏭️  Continuando para próximo perfil...\n`);
          } else {
            console.log(`   👤 Perfil com audiência fora do range (< 10K ou > 300K)`);
            (profileData as any).has_relevant_audience = false;
            (profileData as any).lead_source = 'hashtag_search';
          }

          results.push({
            username,
            success: true,
            data: profileData
          });

        } catch (error: any) {
          console.error(`   ❌ Erro em @${username}:`, error.message);

          errors.push({
            username,
            success: false,
            error: error.message
          });
        }

        // Delay entre perfis (comportamento HUMANO com padrões variados)
        if (i < usernames.length - 1) {
          let delay: number;

          // 10% de chance de pausa longa (usuário distraído/multitarefa)
          if (Math.random() < 0.1) {
            delay = 8000 + Math.random() * 7000; // 8-15 segundos
            console.log(`   😴 Pausa longa (simulando distração)...`);
          }
          // 20% de chance de pausa média-longa (lendo bio com atenção)
          else if (Math.random() < 0.2) {
            delay = 5000 + Math.random() * 4000; // 5-9 segundos
            console.log(`   📖 Lendo com atenção...`);
          }
          // 70% de chance de pausa normal (navegação rápida)
          else {
            delay = 3000 + Math.random() * 3000; // 3-6 segundos
            console.log(`   👀 Navegação normal...`);
          }

          console.log(`   ⏳ Aguardando ${(delay / 1000).toFixed(1)}s antes do próximo...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } finally {
      // 🔓 Fechar contexto APENAS NO FINAL do batch
      console.log(`\n🔓 [${reqId}] Fechando contexto ${requestId} após processar todos os perfis...`);
      await cleanup();
      console.log(`🏁 [${reqId}] Contexto encerrado - sessão completa!\n`);
    }

    // DEBUG: Contar páginas DEPOIS
    if (browser) {
      const pagesAfter = await browser.pages();
      console.log(`📊 [${reqId}] DEPOIS: ${pagesAfter.length} páginas abertas no browser`);
    }

    // Log consolidado dos perfis extraídos (igual ao scrape-tag)
    const allProfiles = results.map(r => r.data).filter(Boolean);
    console.log(`\n📊 [${reqId}] Resumo dos ${allProfiles.length} perfis extraídos:`);

    const profilesWithEmail = allProfiles.filter(p => p.email).length;
    const profilesWithPhone = allProfiles.filter(p => p.phone).length;
    const profilesWithWebsite = allProfiles.filter(p => p.website).length;
    const profilesWithLocation = allProfiles.filter(p => p.city || p.state || p.address).length;
    const businessAccounts = allProfiles.filter(p => p.is_business_account).length;

    console.log(`   📧 Emails encontrados: ${profilesWithEmail}/${allProfiles.length}`);
    console.log(`   📱 Telefones encontrados: ${profilesWithPhone}/${allProfiles.length}`);
    console.log(`   🔗 Websites encontrados: ${profilesWithWebsite}/${allProfiles.length}`);
    console.log(`   📍 Localizações encontradas: ${profilesWithLocation}/${allProfiles.length}`);
    console.log(`   💼 Contas business: ${businessAccounts}/${allProfiles.length}`);

    if (profilesWithLocation > 0) {
      console.log(`\n   📍 Perfis com localização:`);
      allProfiles
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

    console.log(`\n📊 [${reqId}] ========== RESUMO ==========`);
    console.log(`✅ Sucessos: ${results.length}/${usernames.length}`);
    console.log(`❌ Erros: ${errors.length}/${usernames.length}`);
    console.log(`✅ [${reqId}] ========== BATCH FINALIZADO ==========\n`);

    return res.status(200).json({
      success: true,
      total: usernames.length,
      succeeded: results.length,
      failed: errors.length,
      results: results,
      errors: errors
    });

  } catch (error: any) {
    console.error(`❌ [${reqId}] Erro no batch:`, error);

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
      message: 'Erro no processamento batch',
      error: error.message,
      screenshot_base64: screenshotBase64,
      error_details: {
        endpoint: 'scrape-profiles-batch',
        request_id: reqId,
        timestamp: new Date().toISOString()
      },
      data: {
        usernames: req.body.usernames || [],
        total: req.body.usernames?.length || 0,
        succeeded: 0,
        failed: 0,
        results: [],
        errors: []
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
      'POST /scrape-explore': 'Scrape página Explorar do Instagram - retorna perfis com bio/contato (NEW)',
      'POST /scrape-users': 'Busca usuários validados (PT + activity >= 50) - retorna perfis com hashtags',
      'POST /scrape-profile': 'Scrape perfil específico - retorna dados do perfil',
      'POST /scrape-followers': 'Scrape seguidores de concorrente - gera leads B2C',
      'POST /scrape-input-users': 'Scrape lista específica de usernames',
      'POST /scrape-url': 'Extrai emails/telefones de URLs',
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

/**
 * POST /api/instagram-scraper/scrape-followers
 * Scrape seguidores de um perfil concorrente (para gerar leads B2C)
 *
 * Body:
 * {
 *   "competitor_username": "colagenopremium",
 *   "max_followers": 50,
 *   "target_segment": "consumidoras_beleza_estetica" (opcional)
 * }
 */
router.post('/scrape-followers', async (req: Request, res: Response) => {
  const reqId = `FOLLOWERS_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  try {
    const {
      competitor_username,
      max_followers = 50,
      target_segment
    } = req.body;

    if (!competitor_username) {
      return res.status(400).json({
        success: false,
        message: 'Campo "competitor_username" é obrigatório'
      });
    }

    console.log(`\n👥 [${reqId}] ========== SCRAPE-FOLLOWERS INICIADO ==========`);
    console.log(`👥 [${reqId}] Concorrente: @${competitor_username}`);
    console.log(`👥 [${reqId}] Max seguidores: ${max_followers}`);

    // Scrape seguidores
    const result = await scrapeInstagramFollowers(competitor_username, max_followers);

    if (!result.success) {
      throw new Error(result.error_message || 'Erro ao scrapear seguidores');
    }

    console.log(`\n📊 [${reqId}] Salvando ${result.followers.length} seguidores no banco...`);

    const savedFollowers: any[] = [];
    const errors: any[] = [];

    for (const follower of result.followers) {
      try {
        // Verificar se já existe
        const { data: existing } = await supabase
          .from('instagram_leads')
          .select('id, username')
          .eq('username', follower.username)
          .single();

        if (existing) {
          console.log(`   ⚠️  @${follower.username} já existe - pulando`);
          continue;
        }

        // Inserir novo lead
        const { data: inserted, error: insertError } = await supabase
          .from('instagram_leads')
          .insert({
            username: follower.username,
            full_name: follower.full_name,
            profile_pic_url: follower.profile_pic_url,
            is_verified: follower.is_verified,
            is_private: follower.is_private,
            segment: target_segment || null,
            search_term_used: `follower_of_${competitor_username}`,
            lead_source: 'competitor_follower',
            captured_at: new Date().toISOString()
          })
          .select()
          .single();

        if (insertError) {
          console.error(`   ❌ Erro ao salvar @${follower.username}:`, insertError.message);
          errors.push({ username: follower.username, error: insertError.message });
        } else {
          console.log(`   ✅ @${follower.username} salvo como lead B2C`);
          savedFollowers.push(inserted);
        }

      } catch (dbError: any) {
        console.error(`   ❌ Erro BD @${follower.username}:`, dbError.message);
        errors.push({ username: follower.username, error: dbError.message });
      }
    }

    console.log(`\n✅ [${reqId}] ========== SCRAPE-FOLLOWERS CONCLUÍDO ==========`);
    console.log(`📊 [${reqId}] Resumo:`);
    console.log(`   - Seguidores scrapados: ${result.followers.length}`);
    console.log(`   - Salvos como leads: ${savedFollowers.length}`);
    console.log(`   - Já existiam: ${result.followers.length - savedFollowers.length - errors.length}`);
    console.log(`   - Erros: ${errors.length}`);

    return res.status(200).json({
      success: true,
      competitor_username,
      total_followers_scraped: result.followers.length,
      new_leads_saved: savedFollowers.length,
      already_existed: result.followers.length - savedFollowers.length - errors.length,
      errors: errors.length > 0 ? errors : undefined,
      followers: result.followers
    });

  } catch (error: any) {
    console.error(`❌ [${reqId}] Erro ao scrapear seguidores:`, error);

    // Capturar screenshot do erro
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
          console.log(`✅ [${reqId}] Screenshot capturado`);
        }
      }
    } catch (screenshotError: any) {
      console.error('⚠️ Erro ao capturar screenshot:', screenshotError.message);
    }

    return res.status(500).json({
      success: false,
      message: 'Erro ao scrapear seguidores',
      error: error.message,
      screenshot_base64: screenshotBase64,
      error_details: {
        endpoint: 'scrape-followers',
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    });
  } finally {
    // Limpeza de contextos
    const { cleanupAllContexts } = await import('../services/instagram-context-manager.service');
    await cleanupAllContexts();
    console.log(`🧹 [${reqId}] Páginas limpas ao final da execução`);
  }
});

/**
 * POST /api/instagram-scraper/scrape-input-users
 * Scrape perfis diretamente de uma lista de usernames (sem buscar por hashtag)
 *
 * Body:
 * {
 *   "usernames": ["roamhub24", "clicachados.app", "benditocoworking"],
 *   "target_segment": "coworking" (opcional)
 * }
 */
router.post('/scrape-input-users', async (req: Request, res: Response) => {
  const reqId = `INPUT_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  try {
    const {
      usernames,
      target_segment,
      engagement_data // Array com dados de engajamento por username
    } = req.body;

    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Campo "usernames" é obrigatório e deve ser um array não-vazio'
      });
    }

    // Criar mapa de engajamento para fácil acesso
    const engagementMap = new Map();
    if (engagement_data && Array.isArray(engagement_data)) {
      engagement_data.forEach((item: any) => {
        engagementMap.set(item.username, item);
      });
    }

    console.log(`\n🔍 [${reqId}] ========== SCRAPE-INPUT-USERS INICIADO ==========`);
    console.log(`🔍 [${reqId}] ${usernames.length} usernames recebidos`);
    console.log(`🔍 [${reqId}] Dados de engajamento: ${engagement_data ? 'SIM' : 'NÃO'}`);

    const validatedProfiles: InstagramProfileData[] = [];
    const errors: any[] = [];

    // Se temos engagement_data, NÃO fazer scraping - apenas atualizar banco
    const hasEngagementData = engagement_data && Array.isArray(engagement_data) && engagement_data.length > 0;

    if (!hasEngagementData) {
      // MODO NORMAL: Scrapar cada username usando scrapeInstagramUserSearch
      console.log(`📊 [${reqId}] Modo: SCRAPING COMPLETO`);

      for (const username of usernames) {
        try {
          console.log(`\n👤 [${reqId}] Scrapando @${username}...`);

          // Usar scrapeInstagramUserSearch com username como termo de busca
          // skipValidations = true para perfis de engajamento (sem filtro de idioma/activity)
          const profiles = await scrapeInstagramUserSearch(username, 1, true);

          if (profiles && profiles.length > 0) {
            const profileData = profiles[0];
            if (profileData) {
              validatedProfiles.push(profileData);
              console.log(`   ✅ Perfil @${username} scrapado com sucesso`);
              console.log(`   🏷️  Hashtags bio: ${profileData.hashtags_bio?.length || 0}`);
              console.log(`   🏷️  Hashtags posts: ${profileData.hashtags_posts?.length || 0}`);
            } else {
              console.log(`   ⚠️  Perfil @${username} retornou dados vazios`);
              errors.push({ username, error: 'Dados vazios retornados' });
            }
          } else {
            console.log(`   ⚠️  Perfil @${username} não encontrado`);
            errors.push({ username, error: 'Perfil não encontrado' });
          }

        } catch (error: any) {
          console.error(`   ❌ Erro ao scrapar @${username}:`, error.message);
          errors.push({ username, error: error.message });
        }
      }
    } else {
      // MODO ENGAJAMENTO: Pular scraping completamente
      console.log(`💬 [${reqId}] Modo: APENAS ATUALIZAÇÃO DE ENGAJAMENTO (sem scraping)`);
    }

    // Processar TODOS os usernames - incluindo os que já existem
    console.log(`\n💾 [${reqId}] Processando ${usernames.length} usernames para salvar/atualizar no banco...`);

    for (const username of usernames) {
      try {
        // Buscar perfil existente
        const { data: existing } = await supabase
          .from('instagram_leads')
          .select('id, username, full_name, engagement_score, interaction_count')
          .eq('username', username)
          .single();

        // Obter dados de engajamento para este username
        const engagement = engagementMap.get(username);

        // Calcular interaction_type e engagement_score
        let lastInteractionType: string | null = null;
        let engagementScore = 0;
        let hasCommented = false;
        let followStatus = 'not_followed';
        let followedAt: string | null = null;

        if (engagement) {
          if (engagement.commented) {
            lastInteractionType = 'comment';
            engagementScore += 20;
            hasCommented = true;
          } else if (engagement.liked) {
            lastInteractionType = 'like';
            engagementScore += 10;
          }

          if (engagement.is_new_follower) {
            lastInteractionType = 'follow';
            engagementScore += 30;
            followStatus = 'followed'; // Usar 'followed' em vez de 'following'
            followedAt = engagement.notification_date || new Date().toISOString();
          }
        }

        // Se perfil já existe E temos dados de engajamento, ATUALIZAR
        if (existing && engagement) {
          console.log(`   🔄 @${username} já existe - ATUALIZANDO dados de engajamento...`);

          const { error: updateError } = await supabase
            .from('instagram_leads')
            .update({
              has_commented: hasCommented,
              last_interaction_type: lastInteractionType,
              interaction_count: (existing.interaction_count || 0) + 1,
              engagement_score: (existing.engagement_score || 0) + engagementScore,
              follow_status: followStatus !== 'not_followed' ? followStatus : undefined,
              followed_at: followedAt || undefined,
              last_check_notified_at: engagement.notification_date || new Date().toISOString()
            })
            .eq('username', username);

          if (updateError) {
            console.error(`   ❌ Erro ao atualizar @${username}:`, updateError.message);
            errors.push({ username, error: updateError.message });
          } else {
            console.log(`   ✅ @${username} atualizado no banco com engagement_score +${engagementScore}`);
            // Adicionar aos perfis validados para retornar na resposta
            validatedProfiles.push({
              username,
              full_name: existing.full_name,
              engagement_score: (existing.engagement_score || 0) + engagementScore,
              interaction_count: (existing.interaction_count || 0) + 1,
              last_interaction_type: lastInteractionType,
              has_commented: hasCommented
            } as any);
          }
          continue;
        }

        // Se perfil já existe MAS NÃO temos engagement_data, pular
        if (existing && !engagement) {
          console.log(`   ⚠️  @${username} já existe (sem dados de engajamento) - pulando`);
          continue;
        }

        // Se perfil NÃO existe, buscar nos perfis scrapados e inserir
        const profile = validatedProfiles.find(p => p.username === username);
        if (!profile) {
          console.log(`   ⚠️  @${username} não foi scrapado - pulando inserção`);
          continue;
        }

        const { error: insertError } = await supabase
          .from('instagram_leads')
          .insert({
            username: profile.username,
            full_name: profile.full_name,
            bio: profile.bio,
            website: profile.website,
            followers_count: profile.followers_count,
            following_count: profile.following_count,
            posts_count: profile.posts_count,
            profile_pic_url: profile.profile_pic_url,
            is_verified: profile.is_verified,
            is_business_account: profile.is_business_account,
            email: profile.email,
            phone: profile.phone,
            business_category: profile.business_category,
            city: profile.city,
            state: profile.state,
            neighborhood: profile.neighborhood,
            address: profile.address,
            zip_code: profile.zip_code,
            segment: target_segment || null,
            search_term_used: 'engagement_notifications',
            captured_at: new Date().toISOString(),
            hashtags_bio: profile.hashtags_bio || null,
            hashtags_posts: profile.hashtags_posts || null,
            // Dados de engajamento
            has_commented: hasCommented,
            last_interaction_type: lastInteractionType,
            interaction_count: engagementScore > 0 ? 1 : 0,
            engagement_score: engagementScore,
            follow_status: followStatus,
            followed_at: followedAt,
            last_check_notified_at: engagement?.notification_date || null
          });

        if (insertError) {
          console.error(`   ❌ Erro ao salvar @${profile.username}:`, insertError.message);
          errors.push({ username: profile.username, error: insertError.message });
        } else {
          console.log(`   ✅ @${username} salvo no banco`);
        }

      } catch (dbError: any) {
        console.error(`   ❌ Erro BD @${username}:`, dbError.message);
        errors.push({ username, error: dbError.message });
      }
    }

    console.log(`\n✅ [${reqId}] ========== SCRAPE-INPUT-USERS CONCLUÍDO ==========`);
    console.log(`📊 [${reqId}] Resumo:`);
    console.log(`   - Usernames recebidos: ${usernames.length}`);
    console.log(`   - Perfis scrapados: ${validatedProfiles.length}`);
    console.log(`   - Erros: ${errors.length}`);

    return res.status(200).json({
      success: true,
      scraped_count: validatedProfiles.length,
      total_requested: usernames.length,
      profiles: validatedProfiles,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error(`❌ [${reqId}] Erro geral:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao processar usernames',
      error: error.message
    });
  }
});

/**
 * POST /api/instagram-scraper/get-next-hashtag
 * Busca próxima hashtag disponível usando round-robin de contas
 *
 * Body:
 * {
 *   "account_profile": "conta1"
 * }
 *
 * Returns:
 * {
 *   "success": true,
 *   "hashtag": {
 *     "id": "uuid",
 *     "hashtag": "consultoria",
 *     "segment": "marketing"
 *   }
 * }
 */
router.post('/get-next-hashtag', async (req: Request, res: Response) => {
  try {
    const { account_profile = 'default' } = req.body;

    if (!account_profile) {
      return res.status(400).json({
        success: false,
        message: 'Campo "account_profile" é obrigatório'
      });
    }

    console.log(`🔍 Buscando próxima hashtag para conta: ${account_profile}`);

    // Buscar hashtag ativa que NÃO foi processada por esta conta (round-robin)
    const { data, error } = await supabase
      .from('lead_search_terms')
      .select('id, hashtag, segment, last_processed_account')
      .eq('is_active', true)
      .or(`last_processed_account.is.null,last_processed_account.neq.${account_profile}`)
      .order('last_processed_at', { ascending: true, nullsFirst: true })
      .limit(1)
      .single();

    if (error || !data) {
      // Se não encontrou nenhuma, buscar qualquer uma ativa (todas já foram processadas por esta conta)
      console.log(`⚠️  Nenhuma hashtag nova para ${account_profile}. Buscando qualquer ativa...`);

      const { data: anyHashtag, error: anyError } = await supabase
        .from('lead_search_terms')
        .select('id, hashtag, segment, last_processed_account')
        .eq('is_active', true)
        .order('last_processed_at', { ascending: true, nullsFirst: true })
        .limit(1)
        .single();

      if (anyError || !anyHashtag) {
        return res.status(404).json({
          success: false,
          message: 'Nenhuma hashtag ativa disponível'
        });
      }

      console.log(`✅ Hashtag encontrada (reprocessando): #${anyHashtag.hashtag} (última conta: ${anyHashtag.last_processed_account || 'nenhuma'})`);

      return res.status(200).json({
        success: true,
        hashtag: anyHashtag
      });
    }

    console.log(`✅ Hashtag encontrada: #${data.hashtag} (última conta: ${data.last_processed_account || 'nenhuma'})`);

    return res.status(200).json({
      success: true,
      hashtag: data
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar próxima hashtag:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar próxima hashtag',
      error: error.message
    });
  }
});

/**
 * POST /api/instagram-scraper/mark-hashtag-processed
 * Marca hashtag como processada por uma conta
 *
 * Body:
 * {
 *   "hashtag_id": "uuid",
 *   "account_profile": "conta1"
 * }
 */
router.post('/mark-hashtag-processed', async (req: Request, res: Response) => {
  try {
    const { hashtag_id, account_profile = 'default' } = req.body;

    if (!hashtag_id) {
      return res.status(400).json({
        success: false,
        message: 'Campo "hashtag_id" é obrigatório'
      });
    }

    console.log(`📝 Marcando hashtag ${hashtag_id} como processada por: ${account_profile}`);

    const { error } = await supabase
      .from('lead_search_terms')
      .update({
        last_processed_account: account_profile,
        last_processed_at: new Date().toISOString()
      })
      .eq('id', hashtag_id);

    if (error) {
      throw error;
    }

    console.log(`✅ Hashtag marcada como processada por ${account_profile}`);

    return res.status(200).json({
      success: true,
      message: 'Hashtag marcada como processada'
    });

  } catch (error: any) {
    console.error('❌ Erro ao marcar hashtag:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao marcar hashtag como processada',
      error: error.message
    });
  }
});

// ========== ENDPOINTS DE MONITORAMENTO E CLEANUP ==========

/**
 * GET /api/instagram-scraper/browser-status
 * Retorna status do browser Puppeteer
 */
router.get('/browser-status', async (_req: Request, res: Response) => {
  try {
    const status = getBrowserStatus();
    const processes = await listPuppeteerProcesses();

    return res.status(200).json({
      success: true,
      browser: status,
      systemProcesses: {
        count: processes.length,
        pids: processes.map((p: string) => {
          const match = p.match(/\s+(\d+)\s+/);
          return match ? parseInt(match[1] || '0') : 0;
        }).filter((pid: number) => pid > 0)
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao obter status',
      error: error.message
    });
  }
});

/**
 * POST /api/instagram-scraper/force-close
 * Força fechamento do browser Puppeteer (ADMIN)
 */
router.post('/force-close', async (_req: Request, res: Response) => {
  try {
    console.log('🔪 [ADMIN] Forçando fechamento do browser...');
    const result = await forceCloseBrowser();

    return res.status(200).json({
      ...result
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao fechar browser',
      error: error.message
    });
  }
});

/**
 * POST /api/instagram-scraper/kill-orphans
 * Mata todos os processos Puppeteer órfãos (ADMIN)
 */
router.post('/kill-orphans', async (_req: Request, res: Response) => {
  try {
    console.log('🔪 [ADMIN] Matando processos Puppeteer órfãos...');
    const before = await listPuppeteerProcesses();
    await killOrphanPuppeteerProcesses();
    const after = await listPuppeteerProcesses();

    return res.status(200).json({
      success: true,
      message: `Processos mortos: ${before.length - after.length}`,
      before: before.length,
      after: after.length
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao matar processos',
      error: error.message
    });
  }
});

/**
 * GET /api/instagram-scraper/orphan-pages
 * Detecta páginas órfãs abertas no browser (para diagnóstico)
 */
router.get('/orphan-pages', async (_req: Request, res: Response) => {
  try {
    console.log('🔍 [DIAGNOSTIC] Detectando páginas órfãs...');
    const orphans = await detectOrphanPages();

    return res.status(200).json({
      success: true,
      totalPages: orphans.length,
      blankPages: orphans.filter(p => p.isBlank).length,
      closedPages: orphans.filter(p => p.isClosed).length,
      pages: orphans
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao detectar páginas órfãs',
      error: error.message
    });
  }
});

/**
 * GET /api/instagram-scraper/monitor-pages
 * Monitora páginas em tempo real (métricas resumidas)
 */
router.get('/monitor-pages', async (_req: Request, res: Response) => {
  try {
    const stats = await monitorOrphanPages();

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      stats
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao monitorar páginas',
      error: error.message
    });
  }
});

/**
 * POST /api/instagram-scraper/clean-orphan-pages
 * Limpa páginas órfãs do browser (ADMIN)
 *
 * Body (opcional):
 * {
 *   "closeBlankPages": true,        // Fechar about:blank (default: true)
 *   "closeNonInstagramPages": false, // Fechar não-Instagram (default: false)
 *   "keepFirstPage": true,           // Manter primeira página (default: true)
 *   "dryRun": false                  // Apenas simular (default: false)
 * }
 */
router.post('/clean-orphan-pages', async (req: Request, res: Response) => {
  try {
    const {
      closeBlankPages = true,
      closeNonInstagramPages = false,
      keepFirstPage = true,
      dryRun = false
    } = req.body;

    console.log('🧹 [ADMIN] Iniciando limpeza de páginas órfãs...');
    console.log(`   closeBlankPages: ${closeBlankPages}`);
    console.log(`   closeNonInstagramPages: ${closeNonInstagramPages}`);
    console.log(`   keepFirstPage: ${keepFirstPage}`);
    console.log(`   dryRun: ${dryRun}`);

    const result = await cleanOrphanPages({
      closeBlankPages,
      closeNonInstagramPages,
      keepFirstPage,
      dryRun
    });

    const statusCode = result.success ? 200 : 500;

    return res.status(statusCode).json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ Erro ao limpar páginas órfãs:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao limpar páginas órfãs',
      error: error.message
    });
  }
});

// ========== ENDPOINTS DE ROTAÇÃO DE CONTAS ==========

/**
 * GET /api/instagram-scraper/rotation-status
 * Retorna status completo do sistema de rotação de contas
 */
router.get('/rotation-status', async (_req: Request, res: Response) => {
  try {
    const { getAccountRotation } = await import('../services/instagram-account-rotation.service');
    const rotation = getAccountRotation();

    // Forçar sincronização com BD antes de retornar status
    await rotation.forceSync();

    const stats = rotation.getStats();

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      ...stats
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao obter status de rotação',
      error: error.message
    });
  }
});

/**
 * POST /api/instagram-scraper/rotation-cooldown
 * Define cooldown manual para uma conta
 *
 * Body:
 * {
 *   "account": "gourmetsousvide",  // username ou instagram handle
 *   "cooldown_until": "2025-11-26T21:00:00-03:00",  // ISO datetime
 *   "reason": "Conta muito queimada"  // opcional
 * }
 */
router.post('/rotation-cooldown', async (req: Request, res: Response) => {
  try {
    const { account, cooldown_until, reason } = req.body;

    if (!account || !cooldown_until) {
      return res.status(400).json({
        success: false,
        message: 'Campos "account" e "cooldown_until" são obrigatórios'
      });
    }

    const { getAccountRotation } = await import('../services/instagram-account-rotation.service');
    const rotation = getAccountRotation();

    const cooldownDate = new Date(cooldown_until);
    if (isNaN(cooldownDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Campo "cooldown_until" deve ser uma data válida (ISO format)'
      });
    }

    const success = await rotation.setManualCooldown(account, cooldownDate, reason);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: `Conta não encontrada: ${account}`
      });
    }

    return res.status(200).json({
      success: true,
      message: `Cooldown manual definido para ${account} até ${cooldownDate.toLocaleString('pt-BR')}`,
      cooldown_until: cooldownDate.toISOString()
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao definir cooldown manual',
      error: error.message
    });
  }
});

/**
 * POST /api/instagram-scraper/rotation-sync
 * Força sincronização do estado de rotação com BD
 */
router.post('/rotation-sync', async (_req: Request, res: Response) => {
  try {
    const { getAccountRotation } = await import('../services/instagram-account-rotation.service');
    const rotation = getAccountRotation();

    await rotation.forceSync();
    const stats = rotation.getStats();

    return res.status(200).json({
      success: true,
      message: 'Sincronização forçada com BD concluída',
      timestamp: new Date().toISOString(),
      ...stats
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao sincronizar com BD',
      error: error.message
    });
  }
});

console.log('🔍 [DEBUG] Instagram Scraper Routes - All routes registered, exporting router');

export default router;
