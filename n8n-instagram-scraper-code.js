/**
 * Instagram Lead Scraper - Código JavaScript para N8N
 * USO: Copie este código para um nó "Code" no N8N
 *
 * IMPORTANTE:
 * 1. Você precisa estar LOGADO no Instagram antes de executar
 * 2. Este código usa HTTP Request + Puppeteer MCP
 * 3. Adicione delays aleatórios para evitar detecção
 */

// ========== CONFIGURAÇÃO ==========
const INSTAGRAM_BASE_URL = 'https://www.instagram.com';
const MIN_FOLLOWERS = 500; // Mínimo de seguidores
const MIN_POSTS = 10; // Mínimo de posts
const DELAY_MIN = 5000; // 5 segundos
const DELAY_MAX = 15000; // 15 segundos
const MAX_PROFILES_PER_TERM = 5; // Máximo de perfis por termo

// ========== DADOS DE ENTRADA ==========
const sessionData = $input.first().json;
const terms = sessionData.terms; // Array de termos de busca
const sessionId = sessionData.session_id;
const segment = sessionData.segment;

console.log(`🚀 Iniciando scraping: ${terms.length} termos`);
console.log(`📊 Segmento: ${segment}`);

// ========== FUNÇÕES AUXILIARES ==========

/**
 * Aguarda um tempo aleatório para simular comportamento humano
 */
async function randomDelay() {
  const delay = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);
  console.log(`⏳ Aguardando ${(delay / 1000).toFixed(1)}s...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Extrai dados de um perfil do Instagram
 * ATENÇÃO: Este código precisa ser ajustado conforme a estrutura HTML do Instagram
 */
function extractProfileData(html, term) {
  // IMPORTANTE: Seletores CSS podem mudar! Verifique no DevTools do Chrome

  // Exemplo de extração (AJUSTE CONFORME NECESSÁRIO):
  const usernameMatch = html.match(/"username":"([^"]+)"/);
  const fullNameMatch = html.match(/"full_name":"([^"]+)"/);
  const bioMatch = html.match(/"biography":"([^"]+)"/);
  const followersMatch = html.match(/"edge_followed_by":\\{"count":([0-9]+)\\}/);
  const followingMatch = html.match(/"edge_follow":\\{"count":([0-9]+)\\}/);
  const postsMatch = html.match(/"edge_owner_to_timeline_media":\\{"count":([0-9]+)\\}/);
  const isBusinessMatch = html.match(/"is_business_account":(true|false)/);
  const isVerifiedMatch = html.match(/"is_verified":(true|false)/);
  const profilePicMatch = html.match(/"profile_pic_url":"([^"]+)"/);
  const emailMatch = html.match(/"public_email":"([^"]+)"/);
  const phoneMatch = html.match(/"public_phone_number":"([^"]+)"/);
  const websiteMatch = html.match(/"external_url":"([^"]+)"/);
  const categoryMatch = html.match(/"category_name":"([^"]+)"/);

  if (!usernameMatch) {
    return null; // Perfil não encontrado
  }

  const followers = followersMatch ? parseInt(followersMatch[1]) : 0;
  const posts = postsMatch ? parseInt(postsMatch[1]) : 0;
  const isBusiness = isBusinessMatch ? isBusinessMatch[1] === 'true' : false;

  // Filtrar por critérios mínimos
  if (followers < MIN_FOLLOWERS || posts < MIN_POSTS) {
    console.log(`⏭️  Perfil @${usernameMatch[1]} ignorado (${followers} followers, ${posts} posts)`);
    return null;
  }

  return {
    username: usernameMatch[1],
    full_name: fullNameMatch ? fullNameMatch[1] : null,
    bio: bioMatch ? bioMatch[1].replace(/\\n/g, ' ') : null,
    profile_pic_url: profilePicMatch ? profilePicMatch[1] : null,
    is_business_account: isBusiness,
    is_verified: isVerifiedMatch ? isVerifiedMatch[1] === 'true' : false,
    followers_count: followers,
    following_count: followingMatch ? parseInt(followingMatch[1]) : 0,
    posts_count: posts,
    email: emailMatch ? emailMatch[1] : null,
    phone: phoneMatch ? phoneMatch[1] : null,
    website: websiteMatch ? websiteMatch[1] : null,
    business_category: categoryMatch ? categoryMatch[1] : null,
    search_term_used: term
  };
}

/**
 * Busca perfis para um termo específico usando HTTP Request para Mac
 */
async function searchProfiles(term) {
  console.log(`\n🔍 Buscando: "${term}"`);

  try {
    // Passo 1: Buscar usernames da hashtag via HTTP Request no Mac
    const scrapeTagUrl = 'http://192.168.15.5:3000/api/instagram-scraper/scrape-tag';
    const tagResponse = await $http.post(scrapeTagUrl, {
      search_term: term,
      max_profiles: MAX_PROFILES_PER_TERM
    });

    const usernames = tagResponse.data?.data?.usernames || [];
    console.log(`   📋 Encontrados ${usernames.length} usernames em #${term}`);

    if (usernames.length === 0) {
      return [];
    }

    // Passo 2: Para cada username, buscar dados completos do perfil
    const profiles = [];
    for (const username of usernames) {
      try {
        console.log(`   👤 Buscando dados: @${username}`);

        const scrapeProfileUrl = 'http://192.168.15.5:3000/api/instagram-scraper/scrape-profile';
        const profileResponse = await $http.post(scrapeProfileUrl, {
          username: username
        });

        const profileData = profileResponse.data?.data;

        if (profileData) {
          // Aplicar filtros de qualificação
          const followers = profileData.followers_count || 0;
          const posts = profileData.posts_count || 0;

          if (followers >= MIN_FOLLOWERS && posts >= MIN_POSTS) {
            profiles.push({
              username: profileData.username,
              full_name: profileData.full_name,
              bio: profileData.bio,
              profile_pic_url: profileData.profile_pic_url,
              is_business_account: profileData.is_business_account,
              is_verified: profileData.is_verified,
              followers_count: followers,
              following_count: profileData.following_count || 0,
              posts_count: posts,
              email: profileData.email,
              phone: profileData.phone,
              website: profileData.website,
              business_category: profileData.business_category,
              search_term_used: term
            });
            console.log(`   ✅ Perfil qualificado: @${username} (${followers} followers, ${posts} posts)`);
          } else {
            console.log(`   ⏭️ Perfil ignorado: @${username} (${followers} followers, ${posts} posts)`);
          }
        }

        // Delay entre perfis
        await randomDelay();

      } catch (profileError) {
        console.error(`   ❌ Erro ao buscar @${username}:`, profileError.message);
        continue;
      }
    }

    return profiles;

  } catch (error) {
    console.error(`❌ Erro ao buscar "${term}":`, error.message);
    return [];
  }
}

// ========== LOOP PRINCIPAL DE SCRAPING ==========

const allLeads = [];
let termsProcessed = 0;

for (const term of terms) {
  try {
    // Buscar perfis para este termo
    const profiles = await searchProfiles(term);

    if (profiles.length > 0) {
      console.log(`✅ Encontrados ${profiles.length} perfis para "${term}"`);
      allLeads.push(...profiles);
    } else {
      console.log(`⚠️  Nenhum perfil qualificado para "${term}"`);
    }

    termsProcessed++;

    // Delay entre termos (exceto último)
    if (termsProcessed < terms.length) {
      await randomDelay();
    }

  } catch (error) {
    console.error(`❌ Erro processando termo "${term}":`, error.message);

    // Continuar com próximo termo
    continue;
  }
}

// ========== RESULTADO ==========

console.log(`\n🎉 Scraping concluído!`);
console.log(`📊 Termos processados: ${termsProcessed}/${terms.length}`);
console.log(`👥 Leads encontrados: ${allLeads.length}`);
console.log(`👥 Leads únicos (antes de salvar): ${allLeads.length}`);

// Retornar leads para próximo nó processar
// NOTA: A atualização da sessão deve ser feita em um nó Postgres separado ao final
return allLeads.map(lead => ({
  json: {
    ...lead,
    session_id: sessionId,
    segment: segment,
    // Adicionar dados para cálculo de score
    lead_score: lead.followers_count >= 500 ? 0.85 : 0.65,
    is_qualified: lead.followers_count >= MIN_FOLLOWERS && lead.posts_count >= MIN_POSTS,
    // Timestamps
    captured_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}));


// ========== INSTRUÇÕES DE USO ==========
/**
 *
 * COMO USAR ESTE CÓDIGO NO N8N:
 *
 * ARQUITETURA: N8N (Servidor) → HTTP Request → Mac (Express + Puppeteer) → Supabase
 *
 * 1. PREPARAÇÃO NO MAC:
 *    - Inicie o servidor Express: npm start
 *    - URL: http://192.168.15.5:3000
 *    - Na primeira execução, o browser abrirá automaticamente
 *    - Você terá 90 SEGUNDOS para fazer login no Instagram
 *    - O browser permanecerá aberto e logado para próximas execuções
 *
 * 2. Crie um workflow no N8N com estes nós:
 *    - Manual Trigger
 *    - Supabase: Fetch Unused Terms (busca search_terms onde times_used = 0)
 *    - Supabase: Create Scraping Session (cria registro em instagram_scraping_sessions)
 *    - Code: Prepare Data (extrai array de termos)
 *    - **Code (ESTE ARQUIVO)**: Loop de scraping via HTTP
 *    - Supabase/Postgres: Insert Lead (salva cada lead)
 *    - Postgres: Update Session Complete (atualiza métricas da sessão)
 *
 * 3. ENDPOINTS DISPONÍVEIS NO MAC:
 *    - POST /api/instagram-scraper/scrape-tag
 *      Body: { "search_term": "gestor_de_trafego", "max_profiles": 10 }
 *      Retorna: { "success": true, "data": { "usernames": [...] } }
 *
 *    - POST /api/instagram-scraper/scrape-profile
 *      Body: { "username": "exemplo_usuario" }
 *      Retorna: { "success": true, "data": { username, full_name, bio, ... } }
 *
 *    - POST /api/instagram-scraper/close-browser
 *      Fecha o browser (chamar ao final do dia)
 *
 *    - GET /api/instagram-scraper/status
 *      Verifica se serviço está ativo
 *
 * 4. FLUXO DE DADOS:
 *    1. N8N busca termos do banco (lead_search_terms)
 *    2. Cria sessão de scraping (instagram_scraping_sessions)
 *    3. Para cada termo:
 *       - HTTP Request → Mac scrape-tag → Retorna usernames
 *       - Para cada username:
 *         - HTTP Request → Mac scrape-profile → Retorna dados completos
 *         - Filtra por MIN_FOLLOWERS e MIN_POSTS
 *         - Adiciona ao array de leads
 *    4. Retorna todos os leads para próximo nó salvar no banco
 *
 * 5. ANTI-DETECÇÃO:
 *    - Use delays aleatórios entre requisições (5-15s)
 *    - Limite a 20-30 termos por sessão
 *    - Varie horários de execução
 *    - Delays automáticos de 2-5s entre cada requisição (já implementado no Mac)
 *    - Limite a 20-30 termos por sessão
 *    - Browser singleton mantém sessão logada (evita logins repetidos)
 *
 * 6. TROUBLESHOOTING:
 *    - Erro "socket hang up" / ECONNRESET:
 *      → Servidor Mac não está rodando ou IP errado
 *      → Verifique: curl http://192.168.15.5:3000/api/instagram-scraper/status
 *
 *    - Instagram pedir login:
 *      → Sessão expirou ou é primeira execução
 *      → Aguarde 90s após iniciar servidor para fazer login manual
 *      → Browser permanecerá aberto e logado
 *
 *    - Aparecer CAPTCHA:
 *      → Resolva manualmente no browser que está aberto
 *      → Workflow continuará após resolver
 *
 *    - Muitos perfis ignorados (não qualificados):
 *      → Ajuste MIN_FOLLOWERS e MIN_POSTS no topo do script
 *      → Padrão: 500 followers e 10 posts
 *
 *    - Poucos usernames encontrados:
 *      → Aumente MAX_PROFILES_PER_TERM (padrão: 5)
 *      → Teste hashtags mais populares
 *
 * 7. MONITORAMENTO:
 *    - Logs do Mac: Mostram cada requisição e delay
 *    - Logs do N8N: Mostram progresso do scraping
 *    - Banco de dados: instagram_scraping_sessions rastreia métricas
 *
 */
