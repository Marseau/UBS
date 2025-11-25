import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { aicEngineService } from '../services/aic-engine.service';

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
 *   campaign_id?: UUID (ID da campanha no banco - usa regras customizadas),
 *   nicho?: string (nicho principal - obrigatório se não houver campaign_id),
 *   nicho_secundario?: string (nicho secundário opcional),
 *   keywords?: string[] (palavras-chave raiz do nicho - obrigatório se não houver campaign_id),
 *   service_description?: string (descrição do serviço/produto),
 *   target_audience?: string (público desejado),
 *
 *   // Regras AIC Customizadas (opcional - override dos defaults)
 *   rules?: {
 *     min_freq_raiz?: number (padrão: 70),
 *     min_hashtags_forte?: number (padrão: 10),
 *     min_total_forte?: number (padrão: 100),
 *     min_hashtags_medio_min?: number (padrão: 5),
 *     min_hashtags_medio_max?: number (padrão: 9),
 *     min_total_medio?: number (padrão: 50),
 *     min_hashtags_fraco?: number (padrão: 2),
 *     max_hashtags_fraco?: number (padrão: 4),
 *     min_perfis_campanha?: number (padrão: 1000),
 *     min_hashtags_campanha?: number (padrão: 300),
 *     min_hashtags_raiz_campanha?: number (padrão: 3)
 *   }
 * }
 */
router.post('/cluster-analysis', async (req, res) => {
  try {
    const { campaign_id, nicho, nicho_secundario, keywords, service_description, target_audience, rules } = req.body;

    let campaignData: any = null;
    let finalNicho = nicho;
    let finalNichoSecundario = nicho_secundario;
    let finalKeywords = keywords;
    let finalRules: any = {};

    // Se campaign_id foi fornecido, buscar dados da campanha
    if (campaign_id) {
      const { data: campaign, error: campaignError } = await supabase
        .from('cluster_campaigns')
        .select('*')
        .eq('id', campaign_id)
        .single();

      if (campaignError || !campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campanha não encontrada'
        });
      }

      campaignData = campaign;
      finalNicho = campaign.nicho_principal;
      finalNichoSecundario = campaign.nicho_secundario;
      finalKeywords = campaign.keywords;

      // Usar regras da campanha
      finalRules = {
        min_freq_raiz: campaign.rules_min_freq_raiz,
        min_hashtags_forte: campaign.rules_min_hashtags_forte,
        min_total_forte: campaign.rules_min_total_forte,
        min_hashtags_medio_min: campaign.rules_min_hashtags_medio_min,
        min_hashtags_medio_max: campaign.rules_min_hashtags_medio_max,
        min_total_medio: campaign.rules_min_total_medio,
        min_hashtags_fraco: campaign.rules_min_hashtags_fraco,
        max_hashtags_fraco: campaign.rules_max_hashtags_fraco,
        min_perfis_campanha: campaign.rules_min_perfis_campanha,
        min_hashtags_campanha: campaign.rules_min_hashtags_campanha,
        min_hashtags_raiz_campanha: campaign.rules_min_hashtags_raiz_campanha
      };
    } else {
      // Usar regras fornecidas ou defaults
      finalRules = {
        min_freq_raiz: rules?.min_freq_raiz || 70,
        min_hashtags_forte: rules?.min_hashtags_forte || 10,
        min_total_forte: rules?.min_total_forte || 100,
        min_hashtags_medio_min: rules?.min_hashtags_medio_min || 5,
        min_hashtags_medio_max: rules?.min_hashtags_medio_max || 9,
        min_total_medio: rules?.min_total_medio || 50,
        min_hashtags_fraco: rules?.min_hashtags_fraco || 2,
        max_hashtags_fraco: rules?.max_hashtags_fraco || 4,
        min_perfis_campanha: rules?.min_perfis_campanha || 1000,
        min_hashtags_campanha: rules?.min_hashtags_campanha || 300,
        min_hashtags_raiz_campanha: rules?.min_hashtags_raiz_campanha || 3
      };
    }

    // Validação
    if (!finalNicho || !finalKeywords || !Array.isArray(finalKeywords) || finalKeywords.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetros inválidos. Forneça: campaign_id OU (nicho + keywords)'
      });
    }

    console.log(`\n🎯 [API] Analisando cluster para nicho: ${finalNicho}`);
    if (finalNichoSecundario) console.log(`📌 Nicho secundário: ${finalNichoSecundario}`);
    console.log(`📋 Keywords: ${finalKeywords.join(', ')}`);
    console.log(`⚙️  Regras AIC:`, finalRules);

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

    console.log(`📊 Total de hashtags na base: ${allHashtags.length.toLocaleString()}`);

    // ======================================
    // DECISÃO: Usar IA (AIC Engine) ou Regras Simples
    // ======================================
    const useAI = req.body.use_ai !== false; // Default: usar IA

    if (useAI && allHashtags.length > 0) {
      console.log('🧠 Usando AIC ENGINE (IA) para análise inteligente...');

      try {
        // Usar AIC Engine com IA
        const aicResult = await aicEngineService.analyzeCluster({
          niche: finalNicho,
          keywords: finalKeywords,
          hashtags: allHashtags.map((h: any) => ({
            hashtag: h.hashtag,
            freq_total: h.frequency,
            unique_leads: h.unique_leads,
            contact_rate: h.contact_rate
          })),
          nicho_secundario: finalNichoSecundario,
          service_description: service_description,
          target_audience: target_audience
        });

        // Converter resultado IA para formato de resposta
        const response = {
          cluster: finalNicho,
          nicho_secundario: finalNichoSecundario,
          status: aicResult.forca_cluster,
          hashtags_encontradas: aicResult.total_hashtags_relacionadas,
          hashtags_raiz: aicResult.hashtags_raiz_encontradas.map(h => ({
            hashtag: h.hashtag,
            freq: h.freq,
            unique_leads: 0,
            contact_rate: 0
          })),
          hashtags_relevantes: aicResult.total_hashtags_relacionadas,
          perfis_estimados: aicResult.total_hashtags_relacionadas * 10, // Estimativa
          necessidade_scrap: aicResult.precisa_scrap,
          hashtags_necessarias: aicResult.quantidade_scrap_recomendada,
          recomendacao: aicResult.diagnostico_resumido,
          suficiente_para_campanha: aicResult.possivel_gerar_persona_dm,
          metricas: {
            total_hashtags_nicho: aicResult.total_hashtags_relacionadas,
            hashtags_freq_70_plus: aicResult.hashtags_raiz_encontradas.length,
            hashtags_freq_50_plus: aicResult.hashtags_raiz_encontradas.length,
            perfis_unicos: aicResult.total_hashtags_relacionadas * 10,
            taxa_contato_media: 60
          },
          pode_gerar_persona: aicResult.possivel_gerar_persona_dm,
          pode_gerar_dm: aicResult.possivel_gerar_persona_dm,
          pode_gerar_copy: aicResult.possivel_gerar_persona_dm,
          regras_utilizadas: finalRules,
          aic_engine: {
            relacao_com_nicho: aicResult.relacao_com_nicho,
            direcao_scrap: aicResult.direcao_scrap_recomendada,
            diagnostico: aicResult.diagnostico_resumido
          }
        };

        // Se campaign_id fornecido, atualizar resultado na campanha
        if (campaign_id) {
          await supabase
            .from('cluster_campaigns')
            .update({
              analysis_result: response,
              cluster_status: aicResult.forca_cluster,
              last_analysis_at: new Date().toISOString(),
              status: aicResult.possivel_gerar_persona_dm ? 'approved' : 'analyzing'
            })
            .eq('id', campaign_id);

          console.log(`💾 Resultado IA salvo na campanha ${campaign_id}`);
        }

        return res.json({
          success: true,
          data: response,
          ai_powered: true
        });
      } catch (aiError: any) {
        console.error('❌ Erro no AIC Engine, fallback para regras simples:', aiError.message);
        // Continuar com lógica de regras simples abaixo
      }
    }

    // ======================================
    // FALLBACK: Análise por Regras Simples (sem IA)
    // ======================================
    console.log('⚙️  Usando análise por regras simples (sem IA)...');

    // Filtrar hashtags relacionadas ao nicho (contém alguma keyword)
    const relatedHashtags = allHashtags.filter((h: any) => {
      const tag = h.hashtag.toLowerCase();
      return finalKeywords.some(kw => tag.includes(kw.toLowerCase()));
    });

    // Classificar hashtags por relevância (frequência) - USANDO REGRAS CUSTOMIZADAS
    const hashtagsRaiz = relatedHashtags.filter((h: any) => h.frequency >= finalRules.min_freq_raiz);
    const hashtagsRelevantes = relatedHashtags.filter((h: any) => h.frequency >= 50); // relevantes >= 50
    const hashtagsTotal = relatedHashtags.length;

    // Estimar total de perfis potenciais
    const estimatedProfiles = relatedHashtags.reduce((sum: number, h: any) => sum + (h.unique_leads || 0), 0);

    // Regras de Classificação AIC - USANDO REGRAS CUSTOMIZADAS
    let clusterStatus: 'forte' | 'medio' | 'fraco' | 'inexistente';
    let necessidadeScrap = false;
    let recomendacao = '';
    let hashtagsNecessarias = 0;

    if (hashtagsRaiz.length >= finalRules.min_hashtags_forte && hashtagsTotal >= finalRules.min_total_forte) {
      clusterStatus = 'forte';
      recomendacao = 'Cluster pronto para montar persona, DM e copy.';
    } else if (
      hashtagsRaiz.length >= finalRules.min_hashtags_medio_min &&
      hashtagsRaiz.length <= finalRules.min_hashtags_medio_max &&
      hashtagsTotal >= finalRules.min_total_medio
    ) {
      clusterStatus = 'medio';
      necessidadeScrap = true;
      hashtagsNecessarias = finalRules.min_total_forte - hashtagsTotal;
      recomendacao = `Aprovado, mas recomenda scrap adicional de ${hashtagsNecessarias} hashtags para fortalecer cluster.`;
    } else if (
      hashtagsRaiz.length >= finalRules.min_hashtags_fraco &&
      hashtagsRaiz.length <= finalRules.max_hashtags_fraco &&
      hashtagsTotal < finalRules.min_total_medio
    ) {
      clusterStatus = 'fraco';
      necessidadeScrap = true;
      hashtagsNecessarias = finalRules.min_total_medio - hashtagsTotal;
      recomendacao = `Necessário scrap de + ${hashtagsNecessarias} hashtags para viabilizar campanha.`;
    } else {
      clusterStatus = 'inexistente';
      necessidadeScrap = true;
      // Sugerir hashtags similares para scrap
      const suggestedHashtags = finalKeywords.flatMap(kw => [`#${kw}`, `#${kw}brasil`, `#${kw}digital`]).slice(0, 5);
      recomendacao = `Impossível gerar cluster. Necessário scrap direcionado: ${suggestedHashtags.join(', ')}`;
    }

    // Verificar suficiência para campanha - USANDO REGRAS CUSTOMIZADAS
    const suficienteParaCampanha =
      hashtagsRelevantes.length >= finalRules.min_hashtags_campanha &&
      hashtagsRaiz.length >= finalRules.min_hashtags_raiz_campanha &&
      estimatedProfiles >= finalRules.min_perfis_campanha;

    // Preparar resposta
    const response = {
      cluster: finalNicho,
      nicho_secundario: finalNichoSecundario,
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
      pode_gerar_copy: clusterStatus === 'forte',
      regras_utilizadas: finalRules
    };

    // Se campaign_id fornecido, atualizar resultado na campanha
    if (campaign_id) {
      await supabase
        .from('cluster_campaigns')
        .update({
          analysis_result: response,
          cluster_status: clusterStatus,
          last_analysis_at: new Date().toISOString(),
          status: suficienteParaCampanha ? 'approved' : 'analyzing'
        })
        .eq('id', campaign_id);

      console.log(`💾 Resultado salvo na campanha ${campaign_id}`);
    }

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

/**
 * POST /api/hashtag-intelligence/sync
 * Executa sincronização manual completa: PostgreSQL → Parquet → Vector Store
 */
router.post('/sync', async (_req, res) => {
  try {
    console.log('\n🔄 [API] Iniciando sincronização manual...');

    const { hashtagSyncService } = await import('../services/hashtag-sync.service');
    const result = await hashtagSyncService.syncComplete();

    if (result.success) {
      return res.json({
        success: true,
        message: 'Sincronização concluída com sucesso',
        data: {
          parquet: result.parquetExport,
          vectorStore: result.vectorStoreUpload
        }
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Falha na sincronização',
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('❌ Erro em /sync:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/sync/status
 * Retorna status da sincronização (idade dos dados, necessidade de atualização)
 */
router.get('/sync/status', async (_req, res) => {
  try {
    console.log('\n📊 [API] Verificando status da sincronização...');

    const { hashtagSyncService } = await import('../services/hashtag-sync.service');
    const status = await hashtagSyncService.getStatus();

    return res.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    console.error('❌ Erro em /sync/status:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/sync-if-needed
 * Sincronização inteligente: só executa se dados estiverem desatualizados (>24h)
 */
router.post('/sync-if-needed', async (_req, res) => {
  try {
    console.log('\n🔍 [API] Verificando necessidade de sincronização...');

    const { hashtagSyncService } = await import('../services/hashtag-sync.service');
    const result = await hashtagSyncService.syncIfNeeded();

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Erro em /sync-if-needed:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
