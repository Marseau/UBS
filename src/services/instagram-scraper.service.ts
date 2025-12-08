// @ts-nocheck - Código usa window/document dentro de page.evaluate() (contexto browser)
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://qsdfyffuonywmtnlycri.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface ScrapingResult {
  session_id: string;
  terms_processed: number;
  leads_found: number;
  leads_new: number;
  leads_duplicate: number;
  status: 'completed' | 'failed';
  error?: string;
}

/**
 * Extrai dados de um perfil do Instagram
 */
async function extrairDadosDoInstagram(page: any, username: string) {
  const url = `https://www.instagram.com/${username}/`;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  const dados = await page.evaluate(() => {
    const username = (window as any).location.pathname.split('/')[1];
    const nome = (document as any).querySelector('header h2, header h1')?.innerText || '';
    const bio = (document as any).querySelector('header section > div > div')?.innerText || '';

    // Extrai contagem de seguidores
    const contagem = Array.from((document as any).querySelectorAll('header li span'))
      .map((el: any) => el.getAttribute('title') || el.innerText)
      .filter((t: string) => t && /^\d/.test(t));

    // Extrai foto de perfil
    const profilePic = (document as any).querySelector('header img')?.src || '';

    return {
      username,
      full_name: nome,
      bio,
      followers: contagem[0] || '0',
      profile_pic_url: profilePic
    };
  });

  return dados;
}

/**
 * Extrai usernames de uma página de hashtag
 */
async function extrairUsernamesDeHashtag(page: any, searchTerm: string) {
  const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(searchTerm)}/`;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  const usernames = await page.evaluate(() => {
    const links = Array.from((document as any).querySelectorAll('a[href*="/"]'));
    const users = links
      .map((link: any) => {
        const href = link.getAttribute('href');
        const match = href.match(/^\/([\w\.]+)\/$/);
        return match ? match[1] : null;
      })
      .filter((u: any) => u && !['explore', 'reels', 'p'].includes(u));

    return [...new Set(users)].slice(0, 10);
  });

  return usernames;
}

/**
 * Executa scraping do Instagram
 */
export async function executarScrapingInstagram(
  maxTerms: number = 5
): Promise<ScrapingResult> {
  let browser;
  let sessionId: string = '';

  try {
    // 1. Buscar termos não usados do Supabase
    const { data: searchTermsData, error: fetchError } = await supabase
      .from('lead_search_terms')
      .select('*')
      .eq('times_used', 0)
      .limit(1)
      .single();

    if (fetchError || !searchTermsData) {
      throw new Error(`Nenhum termo disponível: ${fetchError?.message}`);
    }

    const { id: searchTermsId, search_terms, target_segment } = searchTermsData;
    const termsToProcess = search_terms.slice(0, maxTerms);

    console.log(`📋 Processando ${termsToProcess.length} termos do segmento: ${target_segment}`);

    // 2. Criar sessão de scraping
    const { data: sessionData, error: sessionError } = await supabase
      .from('instagram_scraping_sessions')
      .insert({
        search_term_id: searchTermsId,
        segment: target_segment,
        status: 'running'
      })
      .select()
      .single();

    if (sessionError || !sessionData) {
      throw new Error(`Erro ao criar sessão: ${sessionError?.message}`);
    }

    sessionId = sessionData.id;
    console.log(`✅ Sessão criada: ${sessionId}`);

    // 3. Iniciar Puppeteer
    browser = await puppeteer.launch({
      headless: false, // Visível no Mac para login manual
      defaultViewport: null,
      args: ['--start-maximized']
    });

    const page = await browser.newPage();

    let totalLeads = 0;
    let newLeads = 0;
    let duplicateLeads = 0;

    // 4. Processar cada termo
    for (const term of termsToProcess) {
      console.log(`🔎 Buscando hashtag: #${term}`);

      try {
        // Extrair usernames da hashtag
        const usernames = await extrairUsernamesDeHashtag(page, term);
        console.log(`   Encontrados ${usernames.length} perfis`);

        // Processar cada username
        for (const username of usernames) {
          try {
            console.log(`   ➡️ Extraindo dados: @${username}`);

            const profileData = await extrairDadosDoInstagram(page, username);

            // Converter followers para número
            const followersCount = parseInt(profileData.followers.replace(/[,\.]/g, '')) || 0;

            // Salvar no Supabase (upsert por username)
            const { data: leadData, error: leadError } = await supabase
              .from('instagram_leads')
              .upsert({
                username: profileData.username,
                full_name: profileData.full_name,
                bio: profileData.bio,
                profile_pic_url: profileData.profile_pic_url,
                followers_count: followersCount,
                segment: target_segment,
                search_term_id: searchTermsId,
                search_term_used: term,
                lead_score: 0.75,
                is_qualified: followersCount >= 500,
                // RESETAR flags de enriquecimento para reprocessar
                dado_enriquecido: false,
                url_enriched: false
              }, {
                onConflict: 'username',
                ignoreDuplicates: false
              })
              .select();

            if (!leadError) {
              totalLeads++;
              if (leadData && leadData.length > 0) {
                newLeads++;
                console.log(`   ✅ Lead salvo: @${username} (${followersCount} seguidores)`);
              } else {
                duplicateLeads++;
                console.log(`   ⚠️ Lead duplicado: @${username}`);
              }
            } else {
              console.error(`   ❌ Erro ao salvar lead: ${leadError.message}`);
            }

            // Delay para evitar rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));

          } catch (profileError: any) {
            console.error(`   ❌ Erro ao processar @${username}: ${profileError.message}`);
          }
        }

      } catch (termError: any) {
        console.error(`❌ Erro ao processar termo "${term}": ${termError.message}`);
      }
    }

    // 5. Atualizar sessão como completa
    await supabase
      .from('instagram_scraping_sessions')
      .update({
        terms_processed: termsToProcess.length,
        leads_found: totalLeads,
        leads_new: newLeads,
        leads_duplicate: duplicateLeads,
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    // 6. Atualizar times_used do search_term
    await supabase
      .from('lead_search_terms')
      .update({
        times_used: searchTermsData.times_used + 1,
        last_used_at: new Date().toISOString(),
        leads_generated: (searchTermsData.leads_generated || 0) + totalLeads
      })
      .eq('id', searchTermsId);

    console.log(`\n🎯 SCRAPING CONCLUÍDO!`);
    console.log(`   Termos processados: ${termsToProcess.length}`);
    console.log(`   Leads encontrados: ${totalLeads}`);
    console.log(`   Novos: ${newLeads} | Duplicados: ${duplicateLeads}`);

    return {
      session_id: sessionId,
      terms_processed: termsToProcess.length,
      leads_found: totalLeads,
      leads_new: newLeads,
      leads_duplicate: duplicateLeads,
      status: 'completed'
    };

  } catch (error: any) {
    console.error('❌ ERRO NO SCRAPING:', error.message);

    // Marcar sessão como falha
    if (sessionId) {
      await supabase
        .from('instagram_scraping_sessions')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', sessionId);
    }

    return {
      session_id: sessionId || '',
      terms_processed: 0,
      leads_found: 0,
      leads_new: 0,
      leads_duplicate: 0,
      status: 'failed',
      error: error.message
    };

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
