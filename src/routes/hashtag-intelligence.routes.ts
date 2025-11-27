import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { aicEngineService } from '../services/aic-engine.service';
import { nicheValidatorService, DEFAULT_CRITERIA, ViabilityCriteria } from '../services/niche-validator.service';
import { clusteringEngineService } from '../services/clustering-engine.service';

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

    // 🔧 NORMALIZAÇÃO: remove acentos, converte para minúsculas, agrupa variantes
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH hashtag_normalized AS (
            SELECT
                LOWER(
                    REPLACE(
                        TRANSLATE(
                            hashtag,
                            'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                            'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
                        ),
                        ' ', '_'
                    )
                ) as hashtag_clean,
                id as lead_id
            FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
            WHERE hashtags_bio IS NOT NULL
            UNION ALL
            SELECT
                LOWER(
                    REPLACE(
                        TRANSLATE(
                            hashtag,
                            'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                            'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
                        ),
                        ' ', '_'
                    )
                ) as hashtag_clean,
                id as lead_id
            FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
            WHERE hashtags_posts IS NOT NULL
        ),
        hashtag_frequency AS (
            SELECT
                hashtag_clean as hashtag,
                COUNT(*) as frequency,
                COUNT(DISTINCT lead_id) as unique_leads
            FROM hashtag_normalized
            WHERE hashtag_clean IS NOT NULL
              AND hashtag_clean != ''
              AND hashtag_clean ~ '^[a-z0-9_]+$'
            GROUP BY hashtag_clean
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
    // 🔧 NORMALIZAÇÃO: remove acentos, converte para minúsculas, agrupa variantes
    const { data: hashtagsData, error: hashtagError } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH hashtag_normalized AS (
            SELECT
                -- Normaliza: minúsculas + remove acentos + remove caracteres inválidos
                LOWER(
                    REPLACE(
                        TRANSLATE(
                            hashtag,
                            'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                            'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
                        ),
                        ' ', '_'
                    )
                ) as hashtag_clean,
                hashtag as hashtag_original,
                id as lead_id,
                (email IS NOT NULL OR phone IS NOT NULL) as has_contact
            FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
            WHERE hashtags_bio IS NOT NULL
            UNION ALL
            SELECT
                LOWER(
                    REPLACE(
                        TRANSLATE(
                            hashtag,
                            'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                            'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
                        ),
                        ' ', '_'
                    )
                ) as hashtag_clean,
                hashtag as hashtag_original,
                id as lead_id,
                (email IS NOT NULL OR phone IS NOT NULL) as has_contact
            FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
            WHERE hashtags_posts IS NOT NULL
        ),
        hashtag_frequency AS (
            SELECT
                hashtag_clean as hashtag,
                COUNT(*) as frequency,
                COUNT(DISTINCT lead_id) as unique_leads,
                COUNT(*) FILTER (WHERE has_contact) as leads_with_contact
            FROM hashtag_normalized
            WHERE hashtag_clean IS NOT NULL
              AND hashtag_clean != ''
              AND hashtag_clean ~ '^[a-z0-9_]+$'  -- Apenas hashtags válidas (sem acentos/caracteres especiais)
            GROUP BY hashtag_clean
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
    // DECISÃO: Usar IA (AIC Engine) ou Regras Matemáticas
    // ======================================
    // IA DESABILITADA: A análise é puramente matemática (min_df, P90, P50)
    // A IA não agrega valor pois inventa dados em vez de usar os reais
    // Para reabilitar: use_ai=true no body da requisição
    // ======================================
    const useAI = req.body.use_ai === true; // Default: NÃO usar IA (regras matemáticas)

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

    // ========================================
    // CÁLCULO DINÂMICO DE PERCENTIS COM MIN_DF
    // ========================================
    // Documentação: docs/HASHTAG-MINDF-THRESHOLD.md
    //
    // min_df (Minimum Document Frequency) = 0.5% do total de leads
    // - Filtra "ruído" (hashtags com frequência muito baixa)
    // - Baseado em TF-IDF (scikit-learn)
    // - Escala automaticamente com o tamanho da base
    //
    // Plano de evolução:
    // - < 20K leads: 0.5%
    // - 20K-50K leads: 0.75%
    // - > 50K leads: 1.0%
    // ========================================

    // Obter total de leads para calcular min_df
    const { count: totalLeadsCount } = await supabase
      .from('instagram_leads')
      .select('*', { count: 'exact', head: true });

    const totalLeads = totalLeadsCount || 10000;

    // Definir percentual de min_df baseado no tamanho da base
    let minDfPercent: number;
    if (totalLeads < 20000) {
      minDfPercent = 0.005;  // 0.5% para bases pequenas
    } else if (totalLeads < 50000) {
      minDfPercent = 0.0075; // 0.75% para bases médias
    } else {
      minDfPercent = 0.01;   // 1.0% para bases grandes
    }

    // Calcular min_df (threshold mínimo de unique_leads)
    const minDf = Math.ceil(totalLeads * minDfPercent);

    // Filtrar hashtags com unique_leads >= min_df (eliminando ruído/long tail)
    const filteredHashtags = allHashtags.filter((h: any) => (h.unique_leads || h.frequency) >= minDf);
    const filteredFrequencies = filteredHashtags
      .map((h: any) => h.unique_leads || h.frequency)
      .sort((a: number, b: number) => a - b);

    const nTotal = allHashtags.length;
    const nFiltered = filteredFrequencies.length;

    console.log(`   📊 MIN_DF: ${minDf} (${(minDfPercent * 100).toFixed(2)}% de ${totalLeads} leads)`);
    console.log(`   📊 Hashtags após filtro: ${nFiltered} de ${nTotal} (${((nFiltered/nTotal)*100).toFixed(1)}% sobreviveram)`);

    // Função para calcular percentil com interpolação linear
    // Fórmula: i = (p/100) × (n + 1)
    // Se i não é inteiro, interpola entre posições vizinhas
    const calculatePercentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;

      const i = (p / 100) * (arr.length + 1); // Posição teórica (1-indexed)

      if (i <= 1) return arr[0] ?? 0;
      if (i >= arr.length) return arr[arr.length - 1] ?? 0;

      const i1 = Math.floor(i); // Posição inferior (1-indexed)
      const i2 = Math.ceil(i);  // Posição superior (1-indexed)
      const alpha = i - i1;     // Parte decimal para interpolação

      // Converter para 0-indexed e interpolar
      const f1 = arr[i1 - 1] ?? 0;
      const f2 = arr[i2 - 1] ?? 0;

      return Math.round(f1 + alpha * (f2 - f1));
    };

    // Calcular P90 e P50 sobre hashtags FILTRADAS (sem ruído)
    const p90 = calculatePercentile(filteredFrequencies, 90);
    const p50 = calculatePercentile(filteredFrequencies, 50);

    // Usar os percentis como thresholds
    const thresholdRaiz = Math.max(p90, minDf); // P90 das hashtags filtradas
    const thresholdSugestaoMin = Math.max(p50, minDf); // P50 das hashtags filtradas

    console.log(`   📈 Percentis FILTRADOS (n=${nFiltered}, min_df≥${minDf}): P90=${p90}, P50=${p50}`);
    console.log(`   📈 Thresholds dinâmicos: Raiz≥${thresholdRaiz}, Sugestão≥${thresholdSugestaoMin}`);

    // Classificar hashtags por relevância (frequência) - USANDO PERCENTIS DINÂMICOS
    const hashtagsRaiz = relatedHashtags.filter((h: any) => h.frequency >= thresholdRaiz);
    const hashtagsRelevantes = relatedHashtags.filter((h: any) => h.frequency >= thresholdSugestaoMin);
    const hashtagsTotal = relatedHashtags.length;

    // Estimar total de perfis potenciais
    const estimatedProfiles = relatedHashtags.reduce((sum: number, h: any) => sum + (h.unique_leads || 0), 0);

    // ========================================
    // REGRAS DE CLASSIFICAÇÃO AIC v2.2 (DINÂMICO)
    // ========================================
    // IDEAL:       ≥5 hashtags raiz (P90) E ≥3.000 perfis estimados
    // MODERADA:    ≥3 hashtags raiz (P90) E ≥1.500 perfis estimados
    // FRACA:       ≥2 hashtags raiz (P90) E ≥800 perfis estimados
    // INEXISTENTE: <2 hashtags raiz OU <800 perfis estimados
    // ========================================

    // Identificar hashtags candidatas a scrap (P50 até P90) - já estão no contexto semântico!
    const hashtagsCandidatasScrap = relatedHashtags
      .filter((h: any) => h.frequency >= thresholdSugestaoMin && h.frequency < thresholdRaiz)
      .sort((a: any, b: any) => b.frequency - a.frequency) // Mais próximas do P90 primeiro
      .slice(0, 5);

    let clusterStatus: 'ideal' | 'moderada' | 'fraca' | 'inexistente';
    let necessidadeScrap = false;
    let recomendacao = '';
    let perfisNecessarios = 0;
    let suggestedHashtags: string[] = [];

    console.log(`   📊 Classificação: ${hashtagsRaiz.length} hashtags raiz (≥P90=${thresholdRaiz}), ${estimatedProfiles} perfis estimados`);
    console.log(`   📊 Hashtags candidatas a scrap (P50=${thresholdSugestaoMin} a P90=${thresholdRaiz}): ${hashtagsCandidatasScrap.length}`);

    if (hashtagsRaiz.length >= 5 && estimatedProfiles >= 3000) {
      // CLUSTER IDEAL - Pronto para campanha completa
      clusterStatus = 'ideal';
      recomendacao = 'Cluster ideal! Pronto para montar persona, DM e copy com alta precisão.';
      console.log(`   🌟 Status: IDEAL (≥5 raiz E ≥3000 perfis)`);
    } else if (hashtagsRaiz.length >= 3 && estimatedProfiles >= 1500) {
      // CLUSTER MODERADA - Bom para campanha
      clusterStatus = 'moderada';
      necessidadeScrap = true;
      perfisNecessarios = Math.max(0, 3000 - estimatedProfiles);

      // Sugerir hashtags do contexto para fortalecer
      if (hashtagsCandidatasScrap.length > 0) {
        suggestedHashtags = hashtagsCandidatasScrap.map((h: any) => `#${h.hashtag} (${h.frequency})`);
        recomendacao = `Cluster aprovado. Para alcançar IDEAL, scrap direcionado em: ${suggestedHashtags.join(', ')}`;
      } else {
        recomendacao = `Cluster aprovado. Recomenda scrap de +${perfisNecessarios} perfis para alcançar IDEAL.`;
      }
      console.log(`   ✅ Status: MODERADA (≥3 raiz E ≥1500 perfis)`);
    } else if (hashtagsRaiz.length >= 2 && estimatedProfiles >= 800) {
      // CLUSTER FRACA - Funciona mas precisa melhorar
      clusterStatus = 'fraca';
      necessidadeScrap = true;
      perfisNecessarios = Math.max(0, 1500 - estimatedProfiles);

      // Sugerir hashtags do contexto para fortalecer
      if (hashtagsCandidatasScrap.length > 0) {
        suggestedHashtags = hashtagsCandidatasScrap.map((h: any) => `#${h.hashtag} (${h.frequency})`);
        recomendacao = `Cluster fraco. Para fortalecer, scrap direcionado em: ${suggestedHashtags.join(', ')}`;
      } else {
        recomendacao = `Cluster fraco. Recomenda scrap de +${perfisNecessarios} perfis para fortalecer.`;
      }
      console.log(`   ⚠️  Status: FRACA (≥2 raiz E ≥800 perfis)`);
    } else {
      // CLUSTER INEXISTENTE - Precisa de scrap direcionado
      clusterStatus = 'inexistente';
      necessidadeScrap = true;
      perfisNecessarios = Math.max(0, 800 - estimatedProfiles);

      // Priorizar hashtags do contexto, senão fallback para keywords
      if (hashtagsCandidatasScrap.length > 0) {
        suggestedHashtags = hashtagsCandidatasScrap.map((h: any) => `#${h.hashtag} (${h.frequency})`);
        recomendacao = `Impossível gerar cluster. Necessário scrap direcionado: ${suggestedHashtags.join(', ')}`;
      } else {
        // Fallback: sugerir baseado nas keywords do nicho
        suggestedHashtags = finalKeywords.flatMap(kw => [`#${kw}`, `#${kw}brasil`]).slice(0, 5);
        recomendacao = `Impossível gerar cluster. Necessário scrap direcionado: ${suggestedHashtags.join(', ')}`;
      }
      console.log(`   ❌ Status: INEXISTENTE (<2 raiz OU <800 perfis)`);
    }

    // Verificar suficiência para campanha - USANDO REGRAS CUSTOMIZADAS
    const suficienteParaCampanha =
      hashtagsRelevantes.length >= finalRules.min_hashtags_campanha &&
      hashtagsRaiz.length >= finalRules.min_hashtags_raiz_campanha &&
      estimatedProfiles >= finalRules.min_perfis_campanha;

    // ========================================
    // ESTIMATIVA DE PERFIS PARA ALCANÇAR IDEAL
    // ========================================
    // IDEAL requer: ≥5 hashtags raiz E ≥3.000 perfis
    // Calculamos baseado na proporção atual de perfis/hashtag
    // ========================================
    const taxaPerfisporRaiz = hashtagsRaiz.length > 0
      ? Math.round(estimatedProfiles / hashtagsRaiz.length)
      : 500; // Fallback: estimativa conservadora de 500 perfis por hashtag raiz

    const hashtagsRaizFaltantes = Math.max(0, 5 - hashtagsRaiz.length);
    const perfisFaltantesPorHashtag = hashtagsRaizFaltantes * taxaPerfisporRaiz;
    const perfisFaltantesDireto = Math.max(0, 3000 - estimatedProfiles);

    // O maior valor entre as duas abordagens
    const perfisParaIdeal = clusterStatus === 'ideal'
      ? 0
      : Math.max(perfisFaltantesDireto, perfisFaltantesPorHashtag);

    console.log(`   📈 Estimativa para IDEAL: +${perfisParaIdeal} perfis (taxa atual: ${taxaPerfisporRaiz} perfis/raiz)`);

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
      perfis_necessarios: perfisNecessarios,
      perfis_para_ideal: perfisParaIdeal,
      recomendacao,
      suficiente_para_campanha: suficienteParaCampanha,
      metricas: {
        total_hashtags_nicho: hashtagsTotal,
        hashtags_raiz_count: hashtagsRaiz.length,
        hashtags_relevantes_count: hashtagsRelevantes.length,
        perfis_unicos: estimatedProfiles,
        taxa_perfis_por_raiz: taxaPerfisporRaiz,
        taxa_contato_media: hashtagsRelevantes.length > 0
          ? Math.round(hashtagsRelevantes.reduce((sum: number, h: any) => sum + (h.contact_rate || 0), 0) / hashtagsRelevantes.length)
          : 0
      },
      // Percentis dinâmicos calculados com min_df
      percentis: {
        p90: p90,
        p50: p50,
        threshold_raiz: thresholdRaiz,
        threshold_sugestao_min: thresholdSugestaoMin,
        // min_df (Minimum Document Frequency) - filtro de ruído
        min_df: minDf,
        min_df_percent: minDfPercent,
        total_leads: totalLeads,
        hashtags_filtradas: nFiltered,
        hashtags_total: nTotal
      },
      // Estimativa para alcançar IDEAL
      estimativa_ideal: {
        hashtags_raiz_faltantes: hashtagsRaizFaltantes,
        perfis_faltantes_por_hashtag: perfisFaltantesPorHashtag,
        perfis_faltantes_direto: perfisFaltantesDireto,
        perfis_para_ideal: perfisParaIdeal,
        taxa_perfis_por_raiz: taxaPerfisporRaiz
      },
      // Status: ideal, moderada, fraca, inexistente
      pode_gerar_persona: clusterStatus === 'ideal' || clusterStatus === 'moderada' || clusterStatus === 'fraca',
      pode_gerar_dm: clusterStatus === 'ideal' || clusterStatus === 'moderada',
      pode_gerar_copy: clusterStatus === 'ideal' || clusterStatus === 'moderada',
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
 * POST /api/hashtag-intelligence/save-analysis
 * Salva análise completa: cria projeto (se necessário), campanha e persiste resultado
 *
 * Body: {
 *   client_name: string (obrigatório),
 *   client_email?: string,
 *   project_name: string (obrigatório),
 *   campaign_name: string (obrigatório),
 *   nicho: string (obrigatório),
 *   nicho_secundario?: string,
 *   keywords: string[] (obrigatório),
 *   service_description?: string,
 *   target_audience?: string,
 *   analysis_result: object (resultado da análise - obrigatório)
 * }
 */
router.post('/save-analysis', async (req, res) => {
  try {
    const {
      client_name,
      client_email,
      project_name,
      campaign_name,
      nicho,
      nicho_secundario,
      keywords,
      service_description,
      target_audience,
      target_age_range,
      target_gender,
      target_location,
      target_income_class,
      analysis_result
    } = req.body;

    // Validações
    if (!client_name || !project_name || !campaign_name || !nicho || !keywords || !analysis_result) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: client_name, project_name, campaign_name, nicho, keywords, analysis_result'
      });
    }

    console.log(`\n💾 [API] Salvando análise para cliente: ${client_name}`);
    console.log(`   📁 Projeto: ${project_name}`);
    console.log(`   🎯 Campanha: ${campaign_name}`);

    // 1. Verificar se projeto já existe para este cliente
    let projectId: string;
    const { data: existingProject } = await supabase
      .from('cluster_projects')
      .select('id')
      .eq('client_name', client_name)
      .eq('project_name', project_name)
      .single();

    if (existingProject) {
      projectId = existingProject.id;
      console.log(`   ✅ Projeto existente encontrado: ${projectId}`);
    } else {
      // Criar novo projeto
      const { data: newProject, error: projectError } = await supabase
        .from('cluster_projects')
        .insert({
          client_name,
          client_email: client_email || null,
          project_name,
          status: 'active'
        })
        .select('id')
        .single();

      if (projectError) throw projectError;
      projectId = newProject.id;
      console.log(`   🆕 Novo projeto criado: ${projectId}`);
    }

    // 2. Verificar se campanha já existe neste projeto
    const { data: existingCampaign } = await supabase
      .from('cluster_campaigns')
      .select('id')
      .eq('project_id', projectId)
      .eq('campaign_name', campaign_name)
      .single();

    let campaignId: string;
    let isUpdate = false;

    if (existingCampaign) {
      // Atualizar campanha existente
      campaignId = existingCampaign.id;
      isUpdate = true;

      const { error: updateError } = await supabase
        .from('cluster_campaigns')
        .update({
          nicho_principal: nicho,
          nicho_secundario: nicho_secundario || null,
          keywords,
          service_description: service_description || null,
          target_audience: target_audience || null,
          target_age_range: target_age_range || null,
          target_gender: target_gender || null,
          target_location: target_location || null,
          target_income_class: target_income_class || null,
          analysis_result,
          cluster_status: analysis_result.isViable ? 'approved' : 'analyzing',
          last_analysis_at: new Date().toISOString()
        })
        .eq('id', campaignId);

      if (updateError) throw updateError;
      console.log(`   🔄 Campanha atualizada: ${campaignId}`);
    } else {
      // Criar nova campanha
      const { data: newCampaign, error: campaignError } = await supabase
        .from('cluster_campaigns')
        .insert({
          project_id: projectId,
          campaign_name,
          nicho_principal: nicho,
          nicho_secundario: nicho_secundario || null,
          keywords,
          service_description: service_description || 'Servico a definir',
          target_audience: target_audience || 'Publico a definir',
          target_age_range: target_age_range || null,
          target_gender: target_gender || null,
          target_location: target_location || null,
          target_income_class: target_income_class || null,
          analysis_result,
          cluster_status: analysis_result.isViable ? 'approved' : 'analyzing',
          last_analysis_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (campaignError) throw campaignError;
      campaignId = newCampaign.id;
      console.log(`   🆕 Nova campanha criada: ${campaignId}`);
    }

    // 3. Salvar insights comportamentais da IA (se houver dados de IA)
    if (analysis_result.aic_engine) {
      // Verificar se já existe cluster dinâmico para este nicho
      let clusterId: string | null = null;

      const { data: existingCluster } = await supabase
        .from('hashtag_clusters_dynamic')
        .select('id')
        .eq('cluster_key', nicho.toLowerCase().replace(/\s+/g, '_'))
        .single();

      if (existingCluster) {
        clusterId = existingCluster.id;
      } else {
        // Criar cluster dinâmico
        const { data: newCluster, error: clusterError } = await supabase
          .from('hashtag_clusters_dynamic')
          .insert({
            cluster_key: nicho.toLowerCase().replace(/\s+/g, '_'),
            cluster_name: nicho,
            cluster_description: service_description || `Cluster para ${nicho}`,
            hashtags: analysis_result.hashtags_raiz || [],
            hashtag_count: analysis_result.hashtags_encontradas || 0,
            algorithm_used: 'aic_engine',
            is_active: true
          })
          .select('id')
          .single();

        if (!clusterError && newCluster) {
          clusterId = newCluster.id;
          console.log(`   🆕 Cluster dinâmico criado: ${clusterId}`);
        }
      }

      // Salvar insights comportamentais
      if (clusterId) {
        const aicData = analysis_result.aic_engine;

        // Verificar se já existe insight para este cluster
        const { data: existingInsight } = await supabase
          .from('cluster_behavioral_insights')
          .select('id')
          .eq('cluster_id', clusterId)
          .single();

        const insightData = {
          cluster_id: clusterId,
          pain_points: aicData.pain_points || null,
          emerging_trends: aicData.trends || null,
          approach_recommendations: aicData.direcao_scrap ? [aicData.direcao_scrap] : null,
          analyzed_by_model: 'gpt-4',
          analysis_prompt: `Análise AIC para ${nicho}`,
          confidence_score: aicData.relacao_com_nicho === 'alta' ? 90 : aicData.relacao_com_nicho === 'media' ? 70 : 50,
          analyzed_at: new Date().toISOString()
        };

        if (existingInsight) {
          await supabase
            .from('cluster_behavioral_insights')
            .update(insightData)
            .eq('id', existingInsight.id);
          console.log(`   🔄 Insights atualizados`);
        } else {
          await supabase
            .from('cluster_behavioral_insights')
            .insert(insightData);
          console.log(`   🆕 Insights comportamentais salvos`);
        }
      }
    }

    return res.json({
      success: true,
      message: isUpdate ? 'Análise atualizada com sucesso' : 'Análise salva com sucesso',
      data: {
        project_id: projectId,
        campaign_id: campaignId,
        is_update: isUpdate
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /save-analysis:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/clients
 * Lista todos os clientes únicos
 */
router.get('/clients', async (_req, res) => {
  try {
    console.log('\n👤 [API] Listando clientes...');

    const { data, error } = await supabase
      .from('cluster_projects')
      .select('client_name')
      .order('client_name', { ascending: true });

    if (error) throw error;

    // Remover duplicatas
    const uniqueClients = [...new Set((data || []).map(d => d.client_name))].filter(Boolean);

    return res.json({
      success: true,
      data: uniqueClients
    });
  } catch (error: any) {
    console.error('❌ Erro em /clients:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/projects
 * Lista todos os projetos com suas campanhas
 */
router.get('/projects', async (req, res) => {
  try {
    const clientName = req.query.client_name as string;

    console.log('\n📁 [API] Listando projetos...');

    let query = supabase
      .from('cluster_projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (clientName) {
      query = query.ilike('client_name', `%${clientName}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.json({
      success: true,
      data: data || []
    });
  } catch (error: any) {
    console.error('❌ Erro em /projects:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/campaigns/:projectId
 * Lista campanhas de um projeto específico
 */
router.get('/campaigns/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    console.log(`\n🎯 [API] Listando campanhas do projeto: ${projectId}`);

    const { data, error } = await supabase
      .from('cluster_campaigns')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({
      success: true,
      data: data || []
    });
  } catch (error: any) {
    console.error('❌ Erro em /campaigns:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/campaign/:campaignId
 * Retorna dados completos de uma campanha específica
 */
router.get('/campaign/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;

    console.log(`\n🎯 [API] Buscando campanha: ${campaignId}`);

    // Buscar campanha com dados do projeto
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    // Buscar projeto associado
    const { data: project, error: projectError } = await supabase
      .from('cluster_projects')
      .select('*')
      .eq('id', campaign.project_id)
      .single();

    if (projectError) throw projectError;

    return res.json({
      success: true,
      data: {
        campaign,
        project
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /campaign/:campaignId:', error);
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
          csv: result.csvExport,
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

/**
 * POST /api/hashtag-intelligence/generate-search-terms
 * Gera uma linha na tabela lead_search_terms a partir da análise de cluster
 *
 * Body: {
 *   campaign_name: string (target_segment),
 *   nicho_principal: string (categoria_geral),
 *   nicho_secundario?: string,
 *   project_name: string (area_especifica),
 *   hashtags_raiz: Array<{ hashtag: string, freq: number }>,
 *   hashtags_recomendadas: string[] (hashtags sugeridas para scrap 20-69),
 *   cluster_status: 'existente' | 'moderado' | 'inexistente'
 * }
 */
router.post('/generate-search-terms', async (req, res) => {
  try {
    const {
      campaign_name,
      nicho_principal,
      nicho_secundario,
      project_name,
      hashtags_raiz,
      hashtags_recomendadas,
      cluster_status
    } = req.body;

    // Validações
    if (!campaign_name || !nicho_principal || !project_name) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: campaign_name, nicho_principal, project_name'
      });
    }

    console.log(`\n🎯 [API] Gerando search_terms para campanha: ${campaign_name}`);
    console.log(`   📁 Projeto: ${project_name}`);
    console.log(`   🏷️  Nicho: ${nicho_principal}${nicho_secundario ? ` / ${nicho_secundario}` : ''}`);

    // Construir array de search_terms (pares termo/hashtag)
    const searchTerms: Array<{ termo: string; hashtag: string }> = [];

    // 1. Adicionar hashtags raiz (≥70 freq)
    if (hashtags_raiz && Array.isArray(hashtags_raiz)) {
      for (const h of hashtags_raiz) {
        const hashtag = h.hashtag.replace(/^#/, '').toLowerCase();
        searchTerms.push({
          termo: hashtag,
          hashtag: hashtag
        });
      }
    }

    // 2. Adicionar hashtags recomendadas (20-69 freq)
    if (hashtags_recomendadas && Array.isArray(hashtags_recomendadas)) {
      for (const h of hashtags_recomendadas) {
        // Formato pode ser "#hashtag (freq)" ou apenas "hashtag"
        const cleanHashtag = h.replace(/^#/, '').replace(/\s*\(\d+\)\s*$/, '').toLowerCase();
        // Evitar duplicatas
        if (!searchTerms.some(st => st.hashtag === cleanHashtag)) {
          searchTerms.push({
            termo: cleanHashtag,
            hashtag: cleanHashtag
          });
        }
      }
    }

    if (searchTerms.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum search term para gerar. Forneça hashtags_raiz ou hashtags_recomendadas.'
      });
    }

    console.log(`   📊 Total de search terms: ${searchTerms.length}`);

    // Construir categoria_geral com nicho secundário se existir
    const categoriaGeral = nicho_secundario
      ? `${nicho_principal} | ${nicho_secundario}`
      : nicho_principal;

    // Verificar se já existe entrada com mesmo target_segment
    const { data: existing } = await supabase
      .from('lead_search_terms')
      .select('id, search_terms')
      .eq('target_segment', campaign_name)
      .single();

    let result;
    if (existing) {
      // Atualizar existente - mesclar search_terms
      const existingTerms = existing.search_terms || [];
      const mergedTerms = [...existingTerms];

      for (const newTerm of searchTerms) {
        if (!mergedTerms.some((t: any) => t.hashtag === newTerm.hashtag)) {
          mergedTerms.push(newTerm);
        }
      }

      const { data, error } = await supabase
        .from('lead_search_terms')
        .update({
          search_terms: mergedTerms,
          categoria_geral: categoriaGeral,
          area_especifica: project_name,
          generated_by_model: 'cluster-analysis-v2',
          generation_prompt: `Gerado via análise de cluster AIC. Status: ${cluster_status}. Hashtags raiz: ${hashtags_raiz?.length || 0}, Recomendadas: ${hashtags_recomendadas?.length || 0}`,
          quality_score: cluster_status === 'existente' ? 5 : cluster_status === 'moderado' ? 3.5 : 2
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = { ...data, action: 'updated', terms_added: mergedTerms.length - existingTerms.length };
      console.log(`   ✅ Atualizado: +${result.terms_added} termos (total: ${mergedTerms.length})`);
    } else {
      // Criar novo registro
      const { data, error } = await supabase
        .from('lead_search_terms')
        .insert({
          target_segment: campaign_name,
          categoria_geral: categoriaGeral,
          area_especifica: project_name,
          search_terms: searchTerms,
          generated_by_model: 'cluster-analysis-v2',
          generation_prompt: `Gerado via análise de cluster AIC. Status: ${cluster_status}. Hashtags raiz: ${hashtags_raiz?.length || 0}, Recomendadas: ${hashtags_recomendadas?.length || 0}`,
          quality_score: cluster_status === 'existente' ? 5 : cluster_status === 'moderado' ? 3.5 : 2
        })
        .select()
        .single();

      if (error) throw error;
      result = { ...data, action: 'created' };
      console.log(`   ✅ Criado novo registro com ${searchTerms.length} termos`);
    }

    return res.json({
      success: true,
      data: {
        id: result.id,
        target_segment: result.target_segment,
        categoria_geral: result.categoria_geral,
        area_especifica: result.area_especifica,
        terms_count: result.terms_count,
        action: result.action,
        terms_added: result.terms_added || searchTerms.length,
        search_terms: result.search_terms
      },
      message: result.action === 'updated'
        ? `Search terms atualizados! +${result.terms_added} novos termos.`
        : `Search terms criados com ${searchTerms.length} termos para scraping.`
    });
  } catch (error: any) {
    console.error('❌ Erro em /generate-search-terms:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/validate-niche
 * Valida se um nicho tem massa crítica para clusterização
 *
 * Body:
 * {
 *   "seeds": ["gestao", "trafego", "marketing"],
 *   "criteria": {  // opcional - usa defaults se não fornecido
 *     "minHashtagsWithFreq5": 20,
 *     "minUniqueLeads": 100,
 *     "minHashtagsWithLeads3": 5,
 *     "minContactRate": 20
 *   }
 * }
 */
router.post('/validate-niche', async (req, res) => {
  try {
    const { seeds, criteria } = req.body;

    if (!seeds || !Array.isArray(seeds) || seeds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Campo "seeds" é obrigatório e deve ser um array de strings'
      });
    }

    console.log(`\n📊 [API] POST /validate-niche - Seeds: [${seeds.join(', ')}]`);

    // Merge criteria com defaults
    const finalCriteria: ViabilityCriteria = {
      ...DEFAULT_CRITERIA,
      ...(criteria || {})
    };

    const result = await nicheValidatorService.validateNiche(seeds, finalCriteria);

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Erro em /validate-niche:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/execute-clustering
 * Executa clusterização KMeans em um nicho validado
 *
 * Body:
 * {
 *   "seeds": ["gestao", "trafego", "marketing"],
 *   "nicho": "Gestão de Tráfego",
 *   "k": 5,  // opcional - se não fornecido, usa silhouette para encontrar K ótimo
 *   "campaign_id": "uuid"  // opcional - salva resultado na campanha
 * }
 */
router.post('/execute-clustering', async (req, res) => {
  try {
    const { seeds, nicho, k, campaign_id } = req.body;

    if (!seeds || !Array.isArray(seeds) || seeds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Campo "seeds" é obrigatório e deve ser um array de strings'
      });
    }

    if (!nicho || typeof nicho !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Campo "nicho" é obrigatório'
      });
    }

    console.log(`\n🔬 [API] POST /execute-clustering - Nicho: ${nicho}, Seeds: [${seeds.join(', ')}]`);
    if (k) console.log(`   📊 K fixo: ${k}`);

    // Executar clusterização
    const result = await clusteringEngineService.executeClustering(seeds, nicho, k);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Erro ao executar clusterização'
      });
    }

    // Se campaign_id fornecido, salvar resultado na campanha
    if (campaign_id) {
      // Extrair subnichos (clusters) para related_clusters
      const relatedClusters = result.clusters?.map((c: any) => ({
        cluster_id: c.cluster_id,
        cluster_name: c.cluster_name,
        hashtag_count: c.hashtag_count,
        total_leads: c.total_leads,
        avg_contact_rate: c.avg_contact_rate,
        theme_keywords: c.theme_keywords?.slice(0, 10) || [],
        top_hashtags: c.top_hashtags?.slice(0, 5).map((h: any) => h.hashtag) || [],
        relevance_score: c.silhouette_score || 0.5
      })) || [];

      const { error: updateError } = await supabase
        .from('cluster_campaigns')
        .update({
          clustering_result: result,
          related_clusters: relatedClusters, // Subnichos estruturados
          cluster_status: 'clustered',
          last_clustering_at: new Date().toISOString()
        })
        .eq('id', campaign_id);

      if (updateError) {
        console.error('⚠️ Erro ao salvar clustering na campanha:', updateError);
      } else {
        console.log(`   💾 Resultado salvo na campanha ${campaign_id}`);
        console.log(`   📊 ${relatedClusters.length} subnichos salvos em related_clusters`);
      }
    }

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Erro em /execute-clustering:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/suggest-seeds
 * Sugere seeds adicionais para expandir um nicho
 *
 * Body:
 * {
 *   "current_seeds": ["gestao", "trafego"]
 * }
 */
router.post('/suggest-seeds', async (req, res) => {
  try {
    const { current_seeds } = req.body;

    if (!current_seeds || !Array.isArray(current_seeds) || current_seeds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Campo "current_seeds" é obrigatório e deve ser um array de strings'
      });
    }

    console.log(`\n📊 [API] POST /suggest-seeds - Seeds atuais: [${current_seeds.join(', ')}]`);

    const suggestions = await nicheValidatorService.suggestSeedExpansion(current_seeds);

    return res.json({
      success: true,
      data: {
        current_seeds,
        suggestions
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /suggest-seeds:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================
// GERAÇÃO DE CONTEÚDO COM GPT-4
// ============================================

/**
 * POST /api/hashtag-intelligence/generate-persona
 * Gera persona ICP baseada nos dados do nicho e clusters
 * Se campaign_id fornecido, persiste no banco
 */
router.post('/generate-persona', async (req, res) => {
  try {
    const {
      campaign_id,
      nicho,
      service_description,
      target_audience,
      target_details,
      clusters,
      top_hashtags,
      total_leads,
      contact_rate
    } = req.body;

    if (!nicho || !service_description || !target_audience) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: nicho, service_description, target_audience'
      });
    }

    console.log(`\n🎭 [API] POST /generate-persona - Nicho: ${nicho}${campaign_id ? ` (Campaign: ${campaign_id})` : ''}`);

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Preparar contexto dos clusters se disponível
    let clusterContext = '';
    if (clusters && clusters.length > 0) {
      clusterContext = `\n\nCLUSTERS IDENTIFICADOS (${clusters.length} grupos de interesse):\n`;
      clusters.forEach((c: any, i: number) => {
        clusterContext += `${i+1}. ${c.cluster_name}: ${c.hashtag_count} hashtags, ${c.total_leads} leads, ${c.avg_contact_rate}% contact rate\n`;
        clusterContext += `   Temas: ${c.theme_keywords?.slice(0, 5).join(', ')}\n`;
      });
    }

    // Preparar contexto de hashtags
    let hashtagContext = '';
    if (top_hashtags && top_hashtags.length > 0) {
      hashtagContext = `\n\nTOP HASHTAGS DO NICHO:\n`;
      top_hashtags.slice(0, 10).forEach((h: any, i: number) => {
        hashtagContext += `${i+1}. #${h.hashtag}: ${h.unique_leads} leads, ${h.contact_rate}% contact rate\n`;
      });
    }

    const systemPrompt = `Você é um especialista em marketing digital e criação de personas ICP (Ideal Customer Profile) para campanhas de outreach via Instagram DM e WhatsApp.

Sua tarefa é criar uma PERSONA DETALHADA baseada nos dados reais de leads coletados via Instagram.

FORMATO OBRIGATÓRIO (em markdown):
## 🎭 Persona: [Nome Fictício]

### Perfil Demográfico
- **Idade:** X-Y anos
- **Gênero predominante:** X
- **Localização:** X
- **Profissão/Cargo:** X

### Características Psicográficas
- **Motivações:** (3 bullets)
- **Dores principais:** (3 bullets)
- **Objetivos:** (3 bullets)
- **Objeções comuns:** (3 bullets)

### Comportamento Digital
- **Horários de maior atividade:** X
- **Tipo de conteúdo que consome:** X
- **Tom de comunicação preferido:** X

### Gatilhos de Conversão
- **O que os faz responder DMs:** (3 bullets)
- **O que os afasta:** (3 bullets)

### Resumo Executivo
Uma frase que resume esta persona para uso da equipe de vendas.`;

    const userPrompt = `Crie uma persona ICP para o seguinte contexto:

NICHO: ${nicho}
SERVIÇO/PRODUTO: ${service_description}
PÚBLICO-ALVO DEFINIDO: ${target_audience}
${target_details?.age_range ? `FAIXA ETÁRIA: ${target_details.age_range}` : ''}
${target_details?.gender ? `GÊNERO: ${target_details.gender}` : ''}
${target_details?.location ? `LOCALIZAÇÃO: ${target_details.location}` : ''}
${target_details?.income_class ? `CLASSE SOCIAL: ${target_details.income_class}` : ''}

DADOS REAIS COLETADOS:
- Total de leads no nicho: ${total_leads || 'N/A'}
- Taxa de contato média: ${contact_rate || 'N/A'}%
${clusterContext}
${hashtagContext}

Baseie-se nos dados reais para criar uma persona REALISTA e ACIONÁVEL.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const persona = completion.choices[0]?.message?.content || '';

    console.log(`   ✅ Persona gerada com sucesso (${persona.length} chars)`);

    // Persistir no banco se campaign_id fornecido
    let persisted = false;
    if (campaign_id) {
      const { error: updateError } = await supabase
        .from('cluster_campaigns')
        .update({
          generated_persona: persona,
          generated_persona_at: new Date().toISOString()
        })
        .eq('id', campaign_id);

      if (updateError) {
        console.error('   ⚠️ Erro ao persistir persona:', updateError.message);
      } else {
        persisted = true;
        console.log(`   💾 Persona persistida na campanha ${campaign_id}`);
      }
    }

    return res.json({
      success: true,
      data: {
        persona,
        nicho,
        generated_at: new Date().toISOString(),
        model: 'gpt-4o-mini',
        tokens_used: completion.usage?.total_tokens || 0,
        persisted,
        campaign_id: campaign_id || null
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /generate-persona:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/generate-dm
 * Gera scripts de DM para abordagem cold outreach
 * Se campaign_id fornecido, persiste no banco
 */
router.post('/generate-dm', async (req, res) => {
  try {
    const {
      campaign_id,
      nicho,
      service_description,
      target_audience,
      persona,
      clusters,
      tone = 'profissional-amigável'
    } = req.body;

    if (!nicho || !service_description) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: nicho, service_description'
      });
    }

    console.log(`\n✉️ [API] POST /generate-dm - Nicho: ${nicho}${campaign_id ? ` (Campaign: ${campaign_id})` : ''}`);

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Contexto de clusters para personalização
    let clusterNames = '';
    if (clusters && clusters.length > 0) {
      clusterNames = clusters.map((c: any) => c.cluster_name).join(', ');
    }

    const systemPrompt = `Você é um copywriter especialista em cold outreach via Instagram DM.

Crie scripts de DM que:
- São curtos (máx 3-4 frases)
- Não parecem spam
- Geram curiosidade
- São personalizáveis
- Têm CTA claro mas suave

FORMATO OBRIGATÓRIO (em markdown):

## ✉️ Scripts de DM para Outreach

### DM 1: Abordagem Curiosidade
\`\`\`
[Script aqui - use {nome} como placeholder]
\`\`\`
**Quando usar:** X
**Taxa de resposta esperada:** X%

### DM 2: Abordagem Valor Direto
\`\`\`
[Script aqui]
\`\`\`
**Quando usar:** X
**Taxa de resposta esperada:** X%

### DM 3: Abordagem Social Proof
\`\`\`
[Script aqui]
\`\`\`
**Quando usar:** X
**Taxa de resposta esperada:** X%

### DM 4: Abordagem Conteúdo
\`\`\`
[Script aqui]
\`\`\`
**Quando usar:** X
**Taxa de resposta esperada:** X%

### Follow-up (se não responder em 3 dias)
\`\`\`
[Script de follow-up]
\`\`\`

### 🚫 O que NUNCA fazer
- (3 bullets de erros comuns)

### ✅ Dicas de Personalização
- (3 bullets de como personalizar)`;

    const userPrompt = `Crie scripts de DM para:

NICHO: ${nicho}
SERVIÇO/PRODUTO: ${service_description}
PÚBLICO-ALVO: ${target_audience || 'Profissionais do nicho'}
TOM DE VOZ: ${tone}
${persona ? `\nPERSONA BASE:\n${persona.substring(0, 500)}...` : ''}
${clusterNames ? `\nTEMAS/INTERESSES IDENTIFICADOS: ${clusterNames}` : ''}

Os scripts devem ser:
1. Naturais (não parecer bot)
2. Curtos e diretos
3. Com CTA suave (não venda direta)
4. Personalizáveis por cluster/interesse`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 2000
    });

    const dm_scripts = completion.choices[0]?.message?.content || '';

    console.log(`   ✅ Scripts de DM gerados com sucesso (${dm_scripts.length} chars)`);

    // Persistir no banco se campaign_id fornecido
    let persisted = false;
    if (campaign_id) {
      const { error: updateError } = await supabase
        .from('cluster_campaigns')
        .update({
          generated_dm_scripts: dm_scripts,
          generated_dm_scripts_at: new Date().toISOString()
        })
        .eq('id', campaign_id);

      if (updateError) {
        console.error('   ⚠️ Erro ao persistir DM scripts:', updateError.message);
      } else {
        persisted = true;
        console.log(`   💾 DM scripts persistidos na campanha ${campaign_id}`);
      }
    }

    return res.json({
      success: true,
      data: {
        dm_scripts,
        nicho,
        tone,
        generated_at: new Date().toISOString(),
        model: 'gpt-4o-mini',
        tokens_used: completion.usage?.total_tokens || 0,
        persisted,
        campaign_id: campaign_id || null
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /generate-dm:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/generate-copy
 * Gera copies para ads, landing pages e conteúdo
 * Se campaign_id fornecido, persiste no banco
 */
router.post('/generate-copy', async (req, res) => {
  try {
    const {
      campaign_id,
      nicho,
      service_description,
      target_audience,
      persona,
      clusters,
      copy_type = 'all' // 'ads', 'landing', 'posts', 'all'
    } = req.body;

    if (!nicho || !service_description) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: nicho, service_description'
      });
    }

    console.log(`\n📝 [API] POST /generate-copy - Nicho: ${nicho}, Tipo: ${copy_type}${campaign_id ? ` (Campaign: ${campaign_id})` : ''}`);

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Contexto de clusters
    let clusterInsights = '';
    if (clusters && clusters.length > 0) {
      clusterInsights = '\nINSIGHTS DOS CLUSTERS:\n';
      clusters.slice(0, 3).forEach((c: any) => {
        clusterInsights += `- ${c.cluster_name}: foco em ${c.theme_keywords?.slice(0, 3).join(', ')}\n`;
      });
    }

    const systemPrompt = `Você é um copywriter especialista em marketing digital, especializado em criar copies persuasivos para diferentes formatos.

FORMATO OBRIGATÓRIO (em markdown):

## 📝 Pack de Copies para ${nicho}

### 🎯 Headlines de Alto Impacto
1. [Headline curiosidade]
2. [Headline benefício]
3. [Headline dor]
4. [Headline prova social]
5. [Headline urgência]

### 📱 Copies para Ads (Meta/Google)

**Ad 1: Problema-Solução**
- Headline: X
- Texto primário: X (máx 125 chars)
- Descrição: X

**Ad 2: Benefício Direto**
- Headline: X
- Texto primário: X
- Descrição: X

**Ad 3: Social Proof**
- Headline: X
- Texto primário: X
- Descrição: X

### 📄 Copy para Landing Page

**Headline Principal:** X
**Subheadline:** X

**Seção Dor:**
[3 bullets de dores]

**Seção Solução:**
[Parágrafo sobre a solução]

**Seção Benefícios:**
[5 bullets de benefícios]

**CTA Principal:** X
**CTA Secundário:** X

### 📸 Copies para Posts (Instagram/Feed)

**Post 1: Educativo**
[Copy completo com emojis - máx 2200 chars]

**Post 2: Storytelling**
[Copy completo]

**Post 3: CTA Direto**
[Copy completo]

### 💡 Hooks para Reels/Stories
1. [Hook 1]
2. [Hook 2]
3. [Hook 3]
4. [Hook 4]
5. [Hook 5]

### #️⃣ Hashtags Recomendadas
[30 hashtags relevantes separadas por espaço]`;

    const userPrompt = `Crie um pack completo de copies para:

NICHO: ${nicho}
SERVIÇO/PRODUTO: ${service_description}
PÚBLICO-ALVO: ${target_audience || 'Profissionais interessados no nicho'}
${persona ? `\nPERSONA:\n${persona.substring(0, 500)}...` : ''}
${clusterInsights}

TIPO DE COPY SOLICITADO: ${copy_type}

Crie copies que:
1. Falam a língua do público-alvo
2. Usam gatilhos mentais apropriados
3. São adaptados para o mercado brasileiro
4. Têm CTAs claros e persuasivos`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 3000
    });

    const copies = completion.choices[0]?.message?.content || '';

    console.log(`   ✅ Copies gerados com sucesso (${copies.length} chars)`);

    // Persistir no banco se campaign_id fornecido
    let persisted = false;
    if (campaign_id) {
      const { error: updateError } = await supabase
        .from('cluster_campaigns')
        .update({
          generated_copies: copies,
          generated_copies_at: new Date().toISOString()
        })
        .eq('id', campaign_id);

      if (updateError) {
        console.error('   ⚠️ Erro ao persistir copies:', updateError.message);
      } else {
        persisted = true;
        console.log(`   💾 Copies persistidos na campanha ${campaign_id}`);
      }
    }

    return res.json({
      success: true,
      data: {
        copies,
        nicho,
        copy_type,
        generated_at: new Date().toISOString(),
        model: 'gpt-4o-mini',
        tokens_used: completion.usage?.total_tokens || 0,
        persisted,
        campaign_id: campaign_id || null
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /generate-copy:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================
// GESTÃO DE LEADS E SUBNICHOS DA CAMPANHA
// ============================================

/**
 * POST /api/hashtag-intelligence/campaign/:campaignId/capture-leads
 * Captura leads da campanha usando o resultado do clustering
 * Cada lead é associado ao seu subnicho (cluster) específico
 *
 * Body: {
 *   limit_per_cluster?: number (máximo de leads por cluster - default 500),
 *   only_with_contact?: boolean (apenas leads com email/telefone - default false)
 * }
 */
router.post('/campaign/:campaignId/capture-leads', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { limit_per_cluster = 500, only_with_contact = false } = req.body;

    console.log(`\n👥 [API] POST /campaign/${campaignId}/capture-leads`);
    console.log(`   📊 Limite por cluster: ${limit_per_cluster}, Apenas com contato: ${only_with_contact}`);

    // Buscar campanha com clustering_result
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, clustering_result, related_clusters')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    // Verificar se tem clustering executado
    if (!campaign.clustering_result || !campaign.clustering_result.lead_associations) {
      return res.status(400).json({
        success: false,
        message: 'Execute o clustering primeiro para capturar leads por subnicho'
      });
    }

    const clusters = campaign.clustering_result.clusters || [];
    const leadAssociations = campaign.clustering_result.lead_associations || [];

    console.log(`   📊 ${clusters.length} clusters, ${leadAssociations.length} lead associations disponíveis`);

    // Agrupar leads por cluster
    const leadsByCluster: Record<number, any[]> = {};
    for (const cluster of clusters) {
      leadsByCluster[cluster.cluster_id] = [];
    }

    // Processar associações de leads
    for (const assoc of leadAssociations) {
      const clusterId = assoc.primary_cluster;
      if (leadsByCluster[clusterId] !== undefined) {
        // Aplicar filtro de contato se solicitado
        if (only_with_contact && !assoc.has_contact) continue;

        // Aplicar limite por cluster
        if (leadsByCluster[clusterId].length < limit_per_cluster) {
          leadsByCluster[clusterId].push(assoc);
        }
      }
    }

    // Preparar dados para inserção
    const campaignLeadsData: any[] = [];
    const statsByCluster: Record<number, { name: string; count: number }> = {};

    for (const cluster of clusters) {
      const clusterLeads = leadsByCluster[cluster.cluster_id] || [];
      statsByCluster[cluster.cluster_id] = {
        name: cluster.cluster_name,
        count: clusterLeads.length
      };

      for (const lead of clusterLeads) {
        campaignLeadsData.push({
          campaign_id: campaignId,
          lead_id: lead.lead_id,
          cluster_id: cluster.cluster_id,
          cluster_name: cluster.cluster_name,
          match_source: 'clustering',
          match_hashtags: lead.top_hashtags || [],
          fit_score: Math.round(lead.score * 100), // Converter score 0-1 para 0-100
          status: 'pending'
        });
      }
    }

    console.log(`   ✅ ${campaignLeadsData.length} leads preparados para captura`);

    if (campaignLeadsData.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhum lead encontrado com os critérios especificados',
        data: {
          captured: 0,
          by_cluster: statsByCluster
        }
      });
    }

    // Limpar leads anteriores da campanha (opcional - pode ser configurável)
    // await supabase.from('campaign_leads').delete().eq('campaign_id', campaignId);

    // Inserir em batches de 500
    let totalInserted = 0;
    for (let i = 0; i < campaignLeadsData.length; i += 500) {
      const batch = campaignLeadsData.slice(i, i + 500);
      const { error: insertError } = await supabase
        .from('campaign_leads')
        .upsert(batch, { onConflict: 'campaign_id,lead_id' });

      if (insertError) {
        console.error(`   ⚠️ Erro no batch ${i / 500 + 1}:`, insertError.message);
      } else {
        totalInserted += batch.length;
      }
    }

    console.log(`   💾 ${totalInserted} leads capturados e associados aos subnichos`);

    return res.json({
      success: true,
      message: `${totalInserted} leads capturados para "${campaign.campaign_name}"`,
      data: {
        captured: totalInserted,
        by_cluster: statsByCluster,
        campaign_id: campaignId
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /campaign/:campaignId/capture-leads:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/campaign/:campaignId/leads
 * Lista leads associados a uma campanha (com info do cluster)
 */
router.get('/campaign/:campaignId/leads', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string;
    const cluster_id = req.query.cluster_id as string;

    console.log(`\n👥 [API] GET /campaign/${campaignId}/leads (page: ${page}, cluster: ${cluster_id || 'all'})`);

    let query = supabase
      .from('campaign_leads')
      .select(`
        id,
        lead_id,
        cluster_id,
        cluster_name,
        match_source,
        match_hashtags,
        fit_score,
        status,
        contacted_at,
        created_at,
        instagram_leads (
          id,
          username,
          full_name,
          email,
          phone,
          bio,
          followers_count,
          following_count
        )
      `)
      .eq('campaign_id', campaignId)
      .order('cluster_id', { ascending: true })
      .order('fit_score', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (cluster_id !== undefined && cluster_id !== '') {
      query = query.eq('cluster_id', parseInt(cluster_id));
    }

    const { data, error } = await query;

    if (error) throw error;

    // Contar total
    let countQuery = supabase
      .from('campaign_leads')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    if (cluster_id !== undefined && cluster_id !== '') {
      countQuery = countQuery.eq('cluster_id', parseInt(cluster_id));
    }

    const { count: totalCount } = await countQuery;

    return res.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        pages: Math.ceil((totalCount || 0) / limit)
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /campaign/:campaignId/leads:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/campaign/:campaignId/leads-by-cluster
 * Retorna leads agrupados por subnicho/cluster
 * Ideal para gerar DMs personalizadas por subnicho
 */
router.get('/campaign/:campaignId/leads-by-cluster', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const only_pending = req.query.only_pending === 'true';

    console.log(`\n👥 [API] GET /campaign/${campaignId}/leads-by-cluster`);

    // Buscar campanha para pegar info dos clusters
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('related_clusters, generated_dm_scripts')
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    // Buscar leads agrupados por cluster
    let query = supabase
      .from('campaign_leads')
      .select(`
        id,
        lead_id,
        cluster_id,
        cluster_name,
        match_hashtags,
        fit_score,
        status,
        instagram_leads (
          id,
          username,
          full_name,
          email,
          phone,
          bio
        )
      `)
      .eq('campaign_id', campaignId)
      .order('cluster_id', { ascending: true })
      .order('fit_score', { ascending: false });

    if (only_pending) {
      query = query.eq('status', 'pending');
    }

    const { data: leads, error: leadsError } = await query;

    if (leadsError) throw leadsError;

    // Agrupar por cluster
    const clusters: Record<number, any> = {};

    for (const lead of (leads || [])) {
      const clusterId = lead.cluster_id ?? -1;

      if (!clusters[clusterId]) {
        // Buscar info completa do cluster
        const clusterInfo = (campaign.related_clusters || []).find(
          (c: any) => c.cluster_id === clusterId
        );

        clusters[clusterId] = {
          cluster_id: clusterId,
          cluster_name: lead.cluster_name || `Cluster ${clusterId + 1}`,
          theme_keywords: clusterInfo?.theme_keywords || [],
          top_hashtags: clusterInfo?.top_hashtags || [],
          total_leads: clusterInfo?.total_leads || 0,
          avg_contact_rate: clusterInfo?.avg_contact_rate || 0,
          leads: []
        };
      }

      // instagram_leads pode ser array ou objeto dependendo da relação
      const instagramLead = Array.isArray(lead.instagram_leads)
        ? lead.instagram_leads[0]
        : lead.instagram_leads;

      clusters[clusterId].leads.push({
        id: lead.id,
        lead_id: lead.lead_id,
        username: instagramLead?.username,
        full_name: instagramLead?.full_name,
        email: instagramLead?.email,
        phone: instagramLead?.phone,
        bio: instagramLead?.bio,
        fit_score: lead.fit_score,
        match_hashtags: lead.match_hashtags,
        status: lead.status
      });
    }

    // Converter para array ordenado
    const clustersArray = Object.values(clusters).sort(
      (a: any, b: any) => a.cluster_id - b.cluster_id
    );

    // Estatísticas gerais
    const totalLeads = (leads || []).length;
    const totalPending = (leads || []).filter(l => l.status === 'pending').length;
    const totalWithContact = (leads || []).filter(l => {
      const il = Array.isArray(l.instagram_leads) ? l.instagram_leads[0] : l.instagram_leads;
      return il?.email || il?.phone;
    }).length;

    return res.json({
      success: true,
      data: {
        campaign_id: campaignId,
        has_dm_scripts: !!campaign.generated_dm_scripts,
        stats: {
          total_leads: totalLeads,
          total_pending: totalPending,
          total_with_contact: totalWithContact,
          total_clusters: clustersArray.length
        },
        clusters: clustersArray
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /campaign/:campaignId/leads-by-cluster:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/campaign/:campaignId/export-for-dm
 * Exporta leads para envio de DM com contexto do subnicho
 * Retorna dados estruturados para uso no sistema de outreach
 */
router.get('/campaign/:campaignId/export-for-dm', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const cluster_id = req.query.cluster_id as string;
    const limit = parseInt(req.query.limit as string) || 100;
    const only_with_contact = req.query.only_with_contact === 'true';

    console.log(`\n📤 [API] GET /campaign/${campaignId}/export-for-dm`);

    // Buscar campanha com DM scripts e persona
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select(`
        campaign_name,
        nicho_principal,
        service_description,
        target_audience,
        generated_persona,
        generated_dm_scripts,
        related_clusters
      `)
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    // Buscar leads pendentes
    let query = supabase
      .from('campaign_leads')
      .select(`
        id,
        lead_id,
        cluster_id,
        cluster_name,
        match_hashtags,
        fit_score,
        instagram_leads (
          id,
          username,
          full_name,
          email,
          phone,
          bio
        )
      `)
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .order('fit_score', { ascending: false })
      .limit(limit);

    if (cluster_id !== undefined && cluster_id !== '') {
      query = query.eq('cluster_id', parseInt(cluster_id));
    }

    const { data: leads, error: leadsError } = await query;

    if (leadsError) throw leadsError;

    // Filtrar por contato se necessário
    let filteredLeads = leads || [];
    if (only_with_contact) {
      filteredLeads = filteredLeads.filter(l => {
        const il = Array.isArray(l.instagram_leads) ? l.instagram_leads[0] : l.instagram_leads;
        return il?.email || il?.phone;
      });
    }

    // Preparar export com contexto
    const exportData = filteredLeads.map(lead => {
      // instagram_leads pode ser array ou objeto dependendo da relação
      const instagramLead = Array.isArray(lead.instagram_leads)
        ? lead.instagram_leads[0]
        : lead.instagram_leads;

      // Buscar info do cluster
      const clusterInfo = (campaign.related_clusters || []).find(
        (c: any) => c.cluster_id === lead.cluster_id
      );

      return {
        // Info do lead
        campaign_lead_id: lead.id,
        lead_id: lead.lead_id,
        username: instagramLead?.username,
        full_name: instagramLead?.full_name,
        email: instagramLead?.email,
        phone: instagramLead?.phone,
        bio: instagramLead?.bio,
        fit_score: lead.fit_score,

        // Contexto do subnicho para personalização da DM
        cluster: {
          id: lead.cluster_id,
          name: lead.cluster_name,
          theme_keywords: clusterInfo?.theme_keywords || [],
          top_hashtags: clusterInfo?.top_hashtags || lead.match_hashtags || []
        },

        // Contexto da campanha
        campaign: {
          name: campaign.campaign_name,
          nicho: campaign.nicho_principal,
          service: campaign.service_description
        }
      };
    });

    return res.json({
      success: true,
      data: {
        campaign_id: campaignId,
        campaign_name: campaign.campaign_name,
        total_exported: exportData.length,
        has_persona: !!campaign.generated_persona,
        has_dm_scripts: !!campaign.generated_dm_scripts,
        persona_summary: campaign.generated_persona?.substring(0, 500),
        leads: exportData
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /campaign/:campaignId/export-for-dm:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/campaign/:campaignId/clusters
 * Associa clusters/subnichos à campanha
 *
 * Body: {
 *   clusters: Array<{ cluster_name: string, cluster_id?: string, relevance_score?: number }>
 * }
 */
router.post('/campaign/:campaignId/clusters', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { clusters } = req.body;

    if (!clusters || !Array.isArray(clusters)) {
      return res.status(400).json({
        success: false,
        message: 'Forneça um array de clusters'
      });
    }

    console.log(`\n🏷️ [API] POST /campaign/${campaignId}/clusters`);
    console.log(`   📊 ${clusters.length} clusters para associar`);

    // Formatar clusters com score default se não fornecido
    const formattedClusters = clusters.map((c: any) => ({
      cluster_id: c.cluster_id || null,
      cluster_name: c.cluster_name,
      relevance_score: c.relevance_score || 0.5
    }));

    // Atualizar campanha com clusters
    const { error: updateError } = await supabase
      .from('cluster_campaigns')
      .update({
        related_clusters: formattedClusters
      })
      .eq('id', campaignId);

    if (updateError) throw updateError;

    console.log(`   ✅ Clusters associados à campanha`);

    return res.json({
      success: true,
      message: `${clusters.length} clusters associados à campanha`,
      data: {
        campaign_id: campaignId,
        clusters: formattedClusters
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /campaign/:campaignId/clusters:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/campaign/:campaignId/stats
 * Retorna estatísticas da campanha (leads, clusters, conteúdo gerado)
 */
router.get('/campaign/:campaignId/stats', async (req, res) => {
  try {
    const { campaignId } = req.params;

    console.log(`\n📊 [API] GET /campaign/${campaignId}/stats`);

    // Buscar campanha
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    // Contar leads por status
    const { data: leadStats } = await supabase.rpc('execute_sql', {
      query_text: `
        SELECT
          COUNT(*) as total_leads,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
          COUNT(*) FILTER (WHERE status = 'responded') as responded,
          COUNT(*) FILTER (WHERE status = 'converted') as converted,
          AVG(fit_score) as avg_fit_score
        FROM campaign_leads
        WHERE campaign_id = '${campaignId}'
      `
    });

    const stats = leadStats?.[0] || {
      total_leads: 0,
      pending: 0,
      contacted: 0,
      responded: 0,
      converted: 0,
      avg_fit_score: 0
    };

    return res.json({
      success: true,
      data: {
        campaign_id: campaignId,
        campaign_name: campaign.campaign_name,
        cluster_status: campaign.cluster_status,
        leads: {
          total: parseInt(stats.total_leads) || 0,
          pending: parseInt(stats.pending) || 0,
          contacted: parseInt(stats.contacted) || 0,
          responded: parseInt(stats.responded) || 0,
          converted: parseInt(stats.converted) || 0,
          avg_fit_score: parseFloat(stats.avg_fit_score) || 0
        },
        clusters: campaign.related_clusters || [],
        content_generated: {
          persona: !!campaign.generated_persona,
          persona_at: campaign.generated_persona_at,
          dm_scripts: !!campaign.generated_dm_scripts,
          dm_scripts_at: campaign.generated_dm_scripts_at,
          copies: !!campaign.generated_copies,
          copies_at: campaign.generated_copies_at
        }
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /campaign/:campaignId/stats:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
