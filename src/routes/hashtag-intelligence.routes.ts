import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * GET /api/hashtag-intelligence/kpis
 * Retorna KPIs principais do dashboard
 */
router.get('/kpis', async (_req, res) => {
  try {
    console.log('\n📊 [API] Buscando KPIs detalhados do dashboard');

    // Query otimizada para KPIs com estatísticas segmentadas por Total/Com Contato/Sem Contato
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH leads_classified AS (
            SELECT
                id,
                hashtags_bio,
                hashtags_posts,
                CASE
                    WHEN email IS NOT NULL
                    OR phone IS NOT NULL
                    OR (additional_emails IS NOT NULL AND jsonb_array_length(additional_emails) > 0)
                    OR (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0)
                    THEN 'with_contact'
                    ELSE 'without_contact'
                END as contact_status,
                email,
                phone,
                additional_emails,
                additional_phones
            FROM instagram_leads
        ),
        lead_stats AS (
            SELECT
                COUNT(*) as total_leads,
                COUNT(*) FILTER (WHERE contact_status = 'with_contact') as leads_with_contact,
                COUNT(*) FILTER (WHERE contact_status = 'without_contact') as leads_without_contact,
                COUNT(*) FILTER (WHERE email IS NOT NULL) as leads_with_email,
                COUNT(*) FILTER (WHERE phone IS NOT NULL) as leads_with_phone,
                COUNT(*) FILTER (WHERE additional_emails IS NOT NULL AND jsonb_array_length(additional_emails) > 0) as leads_with_additional_emails,
                COUNT(*) FILTER (WHERE additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0) as leads_with_additional_phones,
                ROUND(COUNT(*) FILTER (WHERE contact_status = 'with_contact')::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 1) as contact_rate
            FROM leads_classified
        ),
        -- Hashtags TOTAL (todos os leads)
        hashtags_total AS (
            SELECT
                COUNT(DISTINCT hashtag) as unique_hashtags_total,
                COUNT(*) as occurrences_total
            FROM (
                SELECT jsonb_array_elements_text(hashtags_bio) as hashtag FROM leads_classified WHERE hashtags_bio IS NOT NULL AND jsonb_array_length(hashtags_bio) > 0
                UNION ALL
                SELECT jsonb_array_elements_text(hashtags_posts) as hashtag FROM leads_classified WHERE hashtags_posts IS NOT NULL AND jsonb_array_length(hashtags_posts) > 0
            ) t WHERE hashtag IS NOT NULL AND hashtag != ''
        ),
        -- Hashtags COM CONTATO
        hashtags_with_contact AS (
            SELECT
                COUNT(DISTINCT hashtag) as unique_hashtags_with_contact,
                COUNT(*) as occurrences_with_contact
            FROM (
                SELECT jsonb_array_elements_text(hashtags_bio) as hashtag FROM leads_classified WHERE contact_status = 'with_contact' AND hashtags_bio IS NOT NULL AND jsonb_array_length(hashtags_bio) > 0
                UNION ALL
                SELECT jsonb_array_elements_text(hashtags_posts) as hashtag FROM leads_classified WHERE contact_status = 'with_contact' AND hashtags_posts IS NOT NULL AND jsonb_array_length(hashtags_posts) > 0
            ) t WHERE hashtag IS NOT NULL AND hashtag != ''
        ),
        -- Hashtags SEM CONTATO
        hashtags_without_contact AS (
            SELECT
                COUNT(DISTINCT hashtag) as unique_hashtags_without_contact,
                COUNT(*) as occurrences_without_contact
            FROM (
                SELECT jsonb_array_elements_text(hashtags_bio) as hashtag FROM leads_classified WHERE contact_status = 'without_contact' AND hashtags_bio IS NOT NULL AND jsonb_array_length(hashtags_bio) > 0
                UNION ALL
                SELECT jsonb_array_elements_text(hashtags_posts) as hashtag FROM leads_classified WHERE contact_status = 'without_contact' AND hashtags_posts IS NOT NULL AND jsonb_array_length(hashtags_posts) > 0
            ) t WHERE hashtag IS NOT NULL AND hashtag != ''
        ),
        -- Detalhamento por fonte (bio vs posts)
        hashtag_sources AS (
            SELECT
                SUM(COALESCE(jsonb_array_length(hashtags_bio), 0)) as total_hashtags_in_bio,
                SUM(COALESCE(jsonb_array_length(hashtags_posts), 0)) as total_hashtags_in_posts,
                COUNT(*) FILTER (WHERE hashtags_bio IS NOT NULL AND jsonb_array_length(hashtags_bio) > 0) as leads_with_hashtags_bio,
                COUNT(*) FILTER (WHERE hashtags_posts IS NOT NULL AND jsonb_array_length(hashtags_posts) > 0) as leads_with_hashtags_posts
            FROM leads_classified
        )
        SELECT
            l.*,
            ht.unique_hashtags_total,
            ht.occurrences_total,
            hwc.unique_hashtags_with_contact,
            hwc.occurrences_with_contact,
            hwoc.unique_hashtags_without_contact,
            hwoc.occurrences_without_contact,
            hs.total_hashtags_in_bio,
            hs.total_hashtags_in_posts,
            hs.leads_with_hashtags_bio,
            hs.leads_with_hashtags_posts
        FROM lead_stats l, hashtags_total ht, hashtags_with_contact hwc, hashtags_without_contact hwoc, hashtag_sources hs
      `
    });

    if (error) throw error;

    const kpis = data && data.length > 0 ? data[0] : {
      // Leads
      total_leads: 0,
      leads_with_contact: 0,
      leads_without_contact: 0,
      leads_with_email: 0,
      leads_with_phone: 0,
      leads_with_additional_emails: 0,
      leads_with_additional_phones: 0,
      contact_rate: 0,
      // Hashtags segmentadas
      unique_hashtags_total: 0,
      occurrences_total: 0,
      unique_hashtags_with_contact: 0,
      occurrences_with_contact: 0,
      unique_hashtags_without_contact: 0,
      occurrences_without_contact: 0,
      // Fontes
      total_hashtags_in_bio: 0,
      total_hashtags_in_posts: 0,
      leads_with_hashtags_bio: 0,
      leads_with_hashtags_posts: 0
    };

    return res.json({
      success: true,
      data: kpis
    });
  } catch (error: any) {
    console.error('❌ Erro em /kpis:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/top-hashtags
 * Retorna top 20 hashtags por frequência
 */
router.get('/top-hashtags', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    console.log(`\n🔥 [API] Buscando top ${limit} hashtags`);

    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH hashtag_frequency AS (
            SELECT
                hashtag,
                COUNT(*) as frequency,
                COUNT(DISTINCT lead_id) as unique_leads
            FROM (
                SELECT hashtag, id as lead_id
                FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
                WHERE hashtags_bio IS NOT NULL
                UNION ALL
                SELECT hashtag, id as lead_id
                FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
                WHERE hashtags_posts IS NOT NULL
            ) combined
            WHERE hashtag IS NOT NULL AND hashtag != ''
            GROUP BY hashtag
        )
        SELECT
            hashtag,
            frequency,
            unique_leads
        FROM hashtag_frequency
        ORDER BY frequency DESC
        LIMIT ${limit}
      `
    });

    if (error) throw error;

    return res.json({
      success: true,
      data: data || []
    });
  } catch (error: any) {
    console.error('❌ Erro em /top-hashtags:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/premium-hashtags
 * Retorna hashtags premium (melhor taxa de contato)
 */
router.get('/premium-hashtags', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 15;
    const minContactRate = parseInt(req.query.min_contact_rate as string) || 65;
    const minLeads = parseInt(req.query.min_leads as string) || 20;

    console.log(`\n💎 [API] Buscando hashtags premium (>=${minContactRate}% contato)`);

    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH hashtag_contacts AS (
            SELECT
                hashtag,
                COUNT(*) as total_leads,
                COUNT(*) FILTER (WHERE email IS NOT NULL OR phone IS NOT NULL) as leads_with_contact,
                ROUND(COUNT(*) FILTER (WHERE email IS NOT NULL OR phone IS NOT NULL)::numeric / COUNT(*)::numeric * 100, 1) as contact_rate
            FROM (
                SELECT hashtag, email, phone
                FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
                WHERE hashtags_bio IS NOT NULL
                UNION ALL
                SELECT hashtag, email, phone
                FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
                WHERE hashtags_posts IS NOT NULL
            ) combined
            WHERE hashtag IS NOT NULL AND hashtag != ''
            GROUP BY hashtag
            HAVING COUNT(*) >= ${minLeads}
        )
        SELECT * FROM hashtag_contacts
        WHERE contact_rate >= ${minContactRate}
        ORDER BY contact_rate DESC, total_leads DESC
        LIMIT ${limit}
      `
    });

    if (error) throw error;

    return res.json({
      success: true,
      data: data || []
    });
  } catch (error: any) {
    console.error('❌ Erro em /premium-hashtags:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/cooccurrences
 * Retorna top co-ocorrências de hashtags
 */
router.get('/cooccurrences', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    console.log(`\n🔗 [API] Buscando top ${limit} co-ocorrências`);

    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH hashtag_pairs AS (
            SELECT
                a.hashtag as hashtag1,
                b.hashtag as hashtag2,
                COUNT(*) as cooccurrence
            FROM (
                SELECT DISTINCT
                    id as lead_id,
                    hashtag
                FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
                WHERE hashtags_bio IS NOT NULL
                UNION
                SELECT DISTINCT
                    id as lead_id,
                    hashtag
                FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
                WHERE hashtags_posts IS NOT NULL
            ) a
            JOIN (
                SELECT DISTINCT
                    id as lead_id,
                    hashtag
                FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
                WHERE hashtags_bio IS NOT NULL
                UNION
                SELECT DISTINCT
                    id as lead_id,
                    hashtag
                FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
                WHERE hashtags_posts IS NOT NULL
            ) b ON a.lead_id = b.lead_id AND a.hashtag < b.hashtag
            WHERE a.hashtag IS NOT NULL AND a.hashtag != ''
              AND b.hashtag IS NOT NULL AND b.hashtag != ''
            GROUP BY a.hashtag, b.hashtag
        )
        SELECT * FROM hashtag_pairs
        ORDER BY cooccurrence DESC
        LIMIT ${limit}
      `
    });

    if (error) throw error;

    return res.json({
      success: true,
      data: data || []
    });
  } catch (error: any) {
    console.error('❌ Erro em /cooccurrences:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/quality-distribution
 * Retorna distribuição de quality score dos lead_search_terms
 */
router.get('/quality-distribution', async (_req, res) => {
  try {
    console.log('\n⭐ [API] Buscando distribuição de quality score');

    const { data: entries } = await supabase
      .from('lead_search_terms')
      .select('quality_score')
      .order('quality_score', { ascending: false });

    if (!entries) {
      return res.json({
        success: true,
        data: {
          '90-100': 0,
          '80-89': 0,
          '70-79': 0,
          '60-69': 0,
          '<60': 0
        }
      });
    }

    // Agrupar por faixas
    const ranges = {
      '90-100': 0,
      '80-89': 0,
      '70-79': 0,
      '60-69': 0,
      '<60': 0
    };

    entries.forEach(entry => {
      const score = entry.quality_score || 0;
      if (score >= 90) ranges['90-100']++;
      else if (score >= 80) ranges['80-89']++;
      else if (score >= 70) ranges['70-79']++;
      else if (score >= 60) ranges['60-69']++;
      else ranges['<60']++;
    });

    return res.json({
      success: true,
      data: ranges
    });
  } catch (error: any) {
    console.error('❌ Erro em /quality-distribution:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/cluster-analysis
 * Analisa força de cluster baseado em intenção do cliente (nicho)
 *
 * Body: {
 *   nicho: string (ex: "social_media", "trafego_pago", "advocacia"),
 *   keywords: string[] (palavras-chave raiz do nicho),
 *   min_frequency?: number (frequência mínima para considerar relevante, padrão: 50)
 * }
 */
router.post('/cluster-analysis', async (req, res) => {
  try {
    const { nicho, keywords, min_frequency = 50 } = req.body;

    if (!nicho || !keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetros inválidos. Forneça: nicho (string) e keywords (array de strings)'
      });
    }

    console.log(`\n🎯 [API] Analisando cluster para nicho: ${nicho}`);
    console.log(`📋 Keywords: ${keywords.join(', ')}`);

    // Buscar todas as hashtags com suas frequências
    const { data: hashtagsData, error: hashtagError } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH hashtag_frequency AS (
            SELECT
                hashtag,
                COUNT(*) as frequency,
                COUNT(DISTINCT lead_id) as unique_leads,
                COUNT(*) FILTER (WHERE has_contact) as leads_with_contact
            FROM (
                SELECT
                    hashtag,
                    id as lead_id,
                    (email IS NOT NULL OR phone IS NOT NULL) as has_contact
                FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
                WHERE hashtags_bio IS NOT NULL
                UNION ALL
                SELECT
                    hashtag,
                    id as lead_id,
                    (email IS NOT NULL OR phone IS NOT NULL) as has_contact
                FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
                WHERE hashtags_posts IS NOT NULL
            ) combined
            WHERE hashtag IS NOT NULL AND hashtag != ''
            GROUP BY hashtag
        )
        SELECT
            hashtag,
            frequency,
            unique_leads,
            leads_with_contact,
            ROUND(leads_with_contact::numeric / NULLIF(unique_leads, 0)::numeric * 100, 1) as contact_rate
        FROM hashtag_frequency
        ORDER BY frequency DESC
      `
    });

    if (hashtagError) throw hashtagError;

    const allHashtags = hashtagsData || [];

    // Filtrar hashtags relacionadas ao nicho (contém alguma keyword)
    const relatedHashtags = allHashtags.filter((h: any) => {
      const tag = h.hashtag.toLowerCase();
      return keywords.some(kw => tag.includes(kw.toLowerCase()));
    });

    // Classificar hashtags por relevância (frequência)
    const hashtagsRaiz = relatedHashtags.filter((h: any) => h.frequency >= 70);
    const hashtagsRelevantes = relatedHashtags.filter((h: any) => h.frequency >= min_frequency);
    const hashtagsTotal = relatedHashtags.length;

    // Estimar total de perfis potenciais
    const estimatedProfiles = relatedHashtags.reduce((sum: number, h: any) => sum + (h.unique_leads || 0), 0);

    // Regras de Classificação AIC
    let clusterStatus: 'forte' | 'medio' | 'fraco' | 'inexistente';
    let necessidadeScrap = false;
    let recomendacao = '';
    let hashtagsNecessarias = 0;

    if (hashtagsRaiz.length >= 10 && hashtagsTotal >= 100) {
      clusterStatus = 'forte';
      recomendacao = 'Cluster pronto para montar persona, DM e copy.';
    } else if (hashtagsRaiz.length >= 5 && hashtagsRaiz.length <= 9 && hashtagsTotal >= 50) {
      clusterStatus = 'medio';
      necessidadeScrap = true;
      hashtagsNecessarias = 100 - hashtagsTotal;
      recomendacao = `Aprovado, mas recomenda scrap adicional de ${hashtagsNecessarias} hashtags para fortalecer cluster.`;
    } else if (hashtagsRaiz.length >= 2 && hashtagsRaiz.length <= 4 && hashtagsTotal < 50) {
      clusterStatus = 'fraco';
      necessidadeScrap = true;
      hashtagsNecessarias = 50 - hashtagsTotal;
      recomendacao = `Necessário scrap de + ${hashtagsNecessarias} hashtags para viabilizar campanha.`;
    } else {
      clusterStatus = 'inexistente';
      necessidadeScrap = true;
      // Sugerir hashtags similares para scrap
      const suggestedHashtags = keywords.flatMap(kw => [`#${kw}`, `#${kw}brasil`, `#${kw}digital`]).slice(0, 5);
      recomendacao = `Impossível gerar cluster. Necessário scrap direcionado: ${suggestedHashtags.join(', ')}`;
    }

    // Verificar suficiência para campanha (2.000 DMs)
    const suficienteParaCampanha =
      hashtagsRelevantes.length >= 300 &&
      hashtagsRaiz.length >= 3 &&
      estimatedProfiles >= 1000;

    // Preparar resposta
    const response = {
      cluster: nicho,
      status: clusterStatus,
      hashtags_encontradas: hashtagsTotal,
      hashtags_raiz: hashtagsRaiz.slice(0, 10).map((h: any) => ({
        hashtag: h.hashtag,
        freq: h.frequency,
        unique_leads: h.unique_leads,
        contact_rate: h.contact_rate || 0
      })),
      hashtags_relevantes: hashtagsRelevantes.length,
      perfis_estimados: estimatedProfiles,
      necessidade_scrap: necessidadeScrap,
      hashtags_necessarias: hashtagsNecessarias,
      recomendacao,
      suficiente_para_campanha: suficienteParaCampanha,
      metricas: {
        total_hashtags_nicho: hashtagsTotal,
        hashtags_freq_70_plus: hashtagsRaiz.length,
        hashtags_freq_50_plus: hashtagsRelevantes.length,
        perfis_unicos: estimatedProfiles,
        taxa_contato_media: hashtagsRelevantes.length > 0
          ? Math.round(hashtagsRelevantes.reduce((sum: number, h: any) => sum + (h.contact_rate || 0), 0) / hashtagsRelevantes.length)
          : 0
      },
      pode_gerar_persona: clusterStatus === 'forte' || clusterStatus === 'medio',
      pode_gerar_dm: clusterStatus === 'forte',
      pode_gerar_copy: clusterStatus === 'forte'
    };

    return res.json({
      success: true,
      data: response
    });
  } catch (error: any) {
    console.error('❌ Erro em /cluster-analysis:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
