import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { aicEngineService } from '../services/aic-engine.service';
import { nicheValidatorService, DEFAULT_CRITERIA, ViabilityCriteria } from '../services/niche-validator.service';
import { clusteringEngineService } from '../services/clustering-engine.service';
import { vectorClusteringService, executeHashtagVectorClustering, executeGraphClustering } from '../services/vector-clustering.service';
import { campaignDocumentProcessor } from '../services/campaign-document-processor.service';
import { suggestSeeds, validateSeeds } from '../services/seed-suggester.service';
import { leadPreFilterService, PreFilterContext, LeadToFilter } from '../services/lead-prefilter.service';

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Dicionário de palavras comuns com acentuação correta
 * Usado para humanizar hashtags: "gestaodeleads" → "gestão de leads"
 */
const WORD_DICTIONARY: Record<string, string> = {
  // Palavras de negócios/marketing
  'gestao': 'gestão',
  'prospeccao': 'prospecção',
  'automacao': 'automação',
  'integracao': 'integração',
  'solucao': 'solução',
  'solucoes': 'soluções',
  'inovacao': 'inovação',
  'transformacao': 'transformação',
  'digitalizacao': 'digitalização',
  'otimizacao': 'otimização',
  'producao': 'produção',
  'operacao': 'operação',
  'operacoes': 'operações',
  'comunicacao': 'comunicação',
  'informacao': 'informação',
  'informacoes': 'informações',
  'estrategia': 'estratégia',
  'estrategias': 'estratégias',
  'negocios': 'negócios',
  'negocio': 'negócio',
  'comercio': 'comércio',
  'servico': 'serviço',
  'servicos': 'serviços',
  'atencao': 'atenção',
  'promocao': 'promoção',
  'promocoes': 'promoções',
  'aquisicao': 'aquisição',
  'retencao': 'retenção',
  'conversao': 'conversão',
  'geracao': 'geração',
  'captacao': 'captação',
  'fidelizacao': 'fidelização',
  'analise': 'análise',
  'analises': 'análises',
  'analitico': 'analítico',
  'metricas': 'métricas',
  'metrica': 'métrica',
  'relatorio': 'relatório',
  'relatorios': 'relatórios',
  'grafico': 'gráfico',
  'graficos': 'gráficos',
  'estatistica': 'estatística',
  'estatisticas': 'estatísticas',

  // Tecnologia
  'tecnologia': 'tecnologia',
  'tecnico': 'técnico',
  'tecnica': 'técnica',
  'logistica': 'logística',
  'robotica': 'robótica',
  'eletronica': 'eletrônica',
  'eletronico': 'eletrônico',
  'eletronicos': 'eletrônicos',
  'automatico': 'automático',
  'automatica': 'automática',
  'inteligencia': 'inteligência',
  'artificial': 'artificial',
  'maquina': 'máquina',
  'maquinas': 'máquinas',
  'codigo': 'código',
  'codigos': 'códigos',
  'aplicacao': 'aplicação',
  'aplicacoes': 'aplicações',

  // Profissões/Áreas
  'medico': 'médico',
  'medica': 'médica',
  'medicos': 'médicos',
  'medicina': 'medicina',
  'odontologia': 'odontologia',
  'odontologico': 'odontológico',
  'dentario': 'dentário',
  'estetica': 'estética',
  'estetico': 'estético',
  'cosmetico': 'cosmético',
  'cosmeticos': 'cosméticos',
  'nutricao': 'nutrição',
  'nutricionista': 'nutricionista',
  'psicologia': 'psicologia',
  'psicologo': 'psicólogo',
  'psicologa': 'psicóloga',
  'terapia': 'terapia',
  'terapeutico': 'terapêutico',
  'terapeutica': 'terapêutica',
  'fisioterapia': 'fisioterapia',
  'fisioterapeuta': 'fisioterapeuta',
  'advocacia': 'advocacia',
  'juridico': 'jurídico',
  'juridica': 'jurídica',
  'advogado': 'advogado',
  'contabil': 'contábil',
  'contabilidade': 'contabilidade',
  'financeiro': 'financeiro',
  'financeira': 'financeira',
  'financas': 'finanças',
  'economia': 'economia',
  'economico': 'econômico',
  'economica': 'econômica',
  'imobiliario': 'imobiliário',
  'imobiliaria': 'imobiliária',
  'arquitetura': 'arquitetura',
  'arquitetonico': 'arquitetônico',
  'engenharia': 'engenharia',
  'consultoria': 'consultoria',
  'assessoria': 'assessoria',
  'agencia': 'agência',
  'agencias': 'agências',
  'industria': 'indústria',
  'industrial': 'industrial',
  'fabrica': 'fábrica',
  'fabricacao': 'fabricação',

  // Beleza/Saúde
  'saude': 'saúde',
  'saudavel': 'saudável',
  'bem-estar': 'bem-estar',
  'bemestar': 'bem-estar',
  'beleza': 'beleza',
  'cabelo': 'cabelo',
  'cabelos': 'cabelos',
  'capilar': 'capilar',
  'maquiagem': 'maquiagem',
  'unha': 'unha',
  'unhas': 'unhas',
  'manicure': 'manicure',
  'pedicure': 'pedicure',
  'corporal': 'corporal',
  'facial': 'facial',
  'massagem': 'massagem',
  'tratamento': 'tratamento',
  'tratamentos': 'tratamentos',
  'depilacao': 'depilação',
  'sobrancelha': 'sobrancelha',
  'sobrancelhas': 'sobrancelhas',
  'cilios': 'cílios',
  'extensao': 'extensão',
  'micropigmentacao': 'micropigmentação',
  'microblading': 'microblading',
  'harmonizacao': 'harmonização',
  'botox': 'botox',
  'preenchimento': 'preenchimento',

  // Educação
  'educacao': 'educação',
  'educacional': 'educacional',
  'pedagogia': 'pedagogia',
  'pedagogico': 'pedagógico',
  'ensino': 'ensino',
  'aprendizado': 'aprendizado',
  'aprendizagem': 'aprendizagem',
  'capacitacao': 'capacitação',
  'treinamento': 'treinamento',
  'formacao': 'formação',
  'curso': 'curso',
  'cursos': 'cursos',
  'aula': 'aula',
  'aulas': 'aulas',
  'professor': 'professor',
  'professora': 'professora',
  'mentoria': 'mentoria',
  'coaching': 'coaching',

  // Alimentação
  'alimentacao': 'alimentação',
  'alimentar': 'alimentar',
  'gastronomia': 'gastronomia',
  'gastronomico': 'gastronômico',
  'culinaria': 'culinária',
  'culinario': 'culinário',
  'restaurante': 'restaurante',
  'cafeteria': 'cafeteria',
  'confeitaria': 'confeitaria',
  'padaria': 'padaria',
  'organico': 'orgânico',
  'organica': 'orgânica',
  'organicos': 'orgânicos',
  'vegano': 'vegano',
  'vegana': 'vegana',
  'vegetariano': 'vegetariano',
  'vegetariana': 'vegetariana',
  'dieta': 'dieta',
  'dietetico': 'dietético',
  'nutricional': 'nutricional',

  // Artigos/Preposições comuns
  'de': 'de',
  'da': 'da',
  'do': 'do',
  'das': 'das',
  'dos': 'dos',
  'para': 'para',
  'pra': 'pra',
  'com': 'com',
  'sem': 'sem',
  'em': 'em',
  'no': 'no',
  'na': 'na',
  'nos': 'nos',
  'nas': 'nas',
  'por': 'por',
  'pelo': 'pelo',
  'pela': 'pela',
  'pelos': 'pelos',
  'pelas': 'pelas',
  'ao': 'ao',
  'aos': 'aos',
  'e': 'e',
  'ou': 'ou',
  'um': 'um',
  'uma': 'uma',
  'uns': 'uns',
  'umas': 'umas',
  'o': 'o',
  'a': 'a',
  'os': 'os',
  'as': 'as',
  'que': 'que',
  'como': 'como',
  'seu': 'seu',
  'sua': 'sua',
  'seus': 'seus',
  'suas': 'suas',
  'meu': 'meu',
  'minha': 'minha',

  // Palavras comuns
  'digital': 'digital',
  'digitais': 'digitais',
  'online': 'online',
  'virtual': 'virtual',
  'presencial': 'presencial',
  'profissional': 'profissional',
  'profissionais': 'profissionais',
  'especialista': 'especialista',
  'especialistas': 'especialistas',
  'especializado': 'especializado',
  'especializada': 'especializada',
  'cliente': 'cliente',
  'clientes': 'clientes',
  'empresa': 'empresa',
  'empresas': 'empresas',
  'empresarial': 'empresarial',
  'corporativo': 'corporativo',
  'corporativa': 'corporativa',
  'empreendedor': 'empreendedor',
  'empreendedora': 'empreendedora',
  'empreendedorismo': 'empreendedorismo',
  'autonomo': 'autônomo',
  'autonoma': 'autônoma',
  'autonomos': 'autônomos',
  'freelancer': 'freelancer',
  'freelancers': 'freelancers',
  'marketing': 'marketing',
  'vendas': 'vendas',
  'venda': 'venda',
  'compra': 'compra',
  'compras': 'compras',
  'leads': 'leads',
  'lead': 'lead',
  'funil': 'funil',
  'trafego': 'tráfego',
  'conteudo': 'conteúdo',
  'conteudos': 'conteúdos',
  'redes': 'redes',
  'rede': 'rede',
  'sociais': 'sociais',
  'social': 'social',
  'instagram': 'Instagram',
  'whatsapp': 'WhatsApp',
  'facebook': 'Facebook',
  'linkedin': 'LinkedIn',
  'youtube': 'YouTube',
  'tiktok': 'TikTok',
  'sucesso': 'sucesso',
  'resultado': 'resultado',
  'resultados': 'resultados',
  'crescimento': 'crescimento',
  'lucro': 'lucro',
  'lucros': 'lucros',
  'receita': 'receita',
  'receitas': 'receitas',
  'faturamento': 'faturamento',
  'investimento': 'investimento',
  'investimentos': 'investimentos',
  'dinheiro': 'dinheiro',
  'renda': 'renda',
  'rendimento': 'rendimento',
  'extra': 'extra',
  'passiva': 'passiva',
  'ativo': 'ativo',
  'ativa': 'ativa',
  'ativos': 'ativos',
  'ativas': 'ativas',
  'qualidade': 'qualidade',
  'excelencia': 'excelência',
  'premium': 'premium',
  'vip': 'VIP',
  'exclusivo': 'exclusivo',
  'exclusiva': 'exclusiva',
  'personalizado': 'personalizado',
  'personalizada': 'personalizada',
  'sob': 'sob',
  'medida': 'medida',
  'brasil': 'Brasil',
  'brasileiro': 'brasileiro',
  'brasileira': 'brasileira',
  'sao': 'São',
  'paulo': 'Paulo',
  'rio': 'Rio',
  'janeiro': 'Janeiro',
  'minas': 'Minas',
  'gerais': 'Gerais'
};

/**
 * Lista de palavras ordenadas por tamanho (maior primeiro) para matching
 */
const SORTED_WORDS = Object.keys(WORD_DICTIONARY).sort((a, b) => b.length - a.length);

/**
 * Humaniza uma hashtag: separa palavras e adiciona acentuação
 * Exemplo: "gestaodeleads" → "gestão de leads"
 */
function humanizeHashtag(hashtag: string): string {
  // Normalizar: lowercase, remover # se houver
  let text = hashtag.toLowerCase().replace(/^#/, '');

  // Se já tem espaços, apenas aplicar acentuação
  if (text.includes(' ')) {
    return text.split(' ').map(word => WORD_DICTIONARY[word] || word).join(' ');
  }

  // Algoritmo de segmentação por palavras conhecidas
  const words: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let matched = false;

    // Tentar encontrar a maior palavra conhecida no início
    for (const word of SORTED_WORDS) {
      if (remaining.startsWith(word)) {
        const dictWord = WORD_DICTIONARY[word];
        if (dictWord) {
          words.push(dictWord);
          remaining = remaining.slice(word.length);
          matched = true;
          break;
        }
      }
    }

    // Se não encontrou palavra conhecida, extrair caracteres até encontrar uma
    if (!matched) {
      let unknownPart = '';
      while (remaining.length > 0) {
        // Verificar se alguma palavra conhecida começa aqui
        const foundWord = SORTED_WORDS.find(w => remaining.startsWith(w));
        if (foundWord && unknownPart.length > 0) {
          break; // Encontrou palavra, parar de acumular
        }
        unknownPart += remaining[0];
        remaining = remaining.slice(1);

        // Se a parte desconhecida é uma palavra conhecida, usar
        const dictMatch = WORD_DICTIONARY[unknownPart];
        if (dictMatch) {
          words.push(dictMatch);
          unknownPart = '';
          break;
        }
      }
      if (unknownPart.length > 0) {
        words.push(unknownPart);
      }
    }
  }

  return words.join(' ');
}

/**
 * GET /api/hashtag-intelligence/kpis
 * Retorna KPIs principais do dashboard
 * - Leads: últimos 45 dias (Zona Ativa)
 * - Hashtags: últimos 90 dias (janela de inteligência)
 */
router.get('/kpis', async (_req, res) => {
  try {
    console.log('\n📊 [API] Buscando KPIs detalhados do dashboard (Leads: 45d, Hashtags: 90d)');

    // Query otimizada para KPIs com filtros de tempo
    // Leads: últimos 45 dias | Hashtags: últimos 90 dias
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH
        -- LEADS: últimos 45 dias (Zona Ativa) - criado OU revalidado
        leads_classified AS (
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
                whatsapp_number,
                additional_emails,
                additional_phones
            FROM instagram_leads
            WHERE captured_at >= CURRENT_DATE - INTERVAL '45 days'
               OR updated_at >= CURRENT_DATE - INTERVAL '45 days'
        ),
        lead_stats AS (
            SELECT
                COUNT(*) as total_leads,
                COUNT(*) FILTER (WHERE contact_status = 'with_contact') as leads_with_contact,
                COUNT(*) FILTER (WHERE contact_status = 'without_contact') as leads_without_contact,
                COUNT(*) FILTER (WHERE email IS NOT NULL) as leads_with_email,
                COUNT(*) FILTER (WHERE whatsapp_number IS NOT NULL) as leads_with_whatsapp,
                COUNT(*) FILTER (WHERE additional_emails IS NOT NULL AND jsonb_array_length(additional_emails) > 0) as leads_with_additional_emails,
                COUNT(*) FILTER (WHERE additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0) as leads_with_additional_phones,
                ROUND(COUNT(*) FILTER (WHERE contact_status = 'with_contact')::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 1) as contact_rate
            FROM leads_classified
        ),
        -- HASHTAGS: últimos 90 dias (janela de inteligência) - criado OU revalidado
        leads_for_hashtags AS (
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
                END as contact_status
            FROM instagram_leads
            WHERE captured_at >= CURRENT_DATE - INTERVAL '90 days'
               OR updated_at >= CURRENT_DATE - INTERVAL '90 days'
        ),
        -- Hashtags TOTAL (90 dias)
        hashtags_total AS (
            SELECT
                COUNT(DISTINCT hashtag) as unique_hashtags_total,
                COUNT(*) as occurrences_total
            FROM (
                SELECT jsonb_array_elements_text(hashtags_bio) as hashtag FROM leads_for_hashtags WHERE hashtags_bio IS NOT NULL AND jsonb_array_length(hashtags_bio) > 0
                UNION ALL
                SELECT jsonb_array_elements_text(hashtags_posts) as hashtag FROM leads_for_hashtags WHERE hashtags_posts IS NOT NULL AND jsonb_array_length(hashtags_posts) > 0
            ) t WHERE hashtag IS NOT NULL AND hashtag != ''
        ),
        -- Hashtags COM CONTATO (90 dias)
        hashtags_with_contact AS (
            SELECT
                COUNT(DISTINCT hashtag) as unique_hashtags_with_contact,
                COUNT(*) as occurrences_with_contact
            FROM (
                SELECT jsonb_array_elements_text(hashtags_bio) as hashtag FROM leads_for_hashtags WHERE contact_status = 'with_contact' AND hashtags_bio IS NOT NULL AND jsonb_array_length(hashtags_bio) > 0
                UNION ALL
                SELECT jsonb_array_elements_text(hashtags_posts) as hashtag FROM leads_for_hashtags WHERE contact_status = 'with_contact' AND hashtags_posts IS NOT NULL AND jsonb_array_length(hashtags_posts) > 0
            ) t WHERE hashtag IS NOT NULL AND hashtag != ''
        ),
        -- Hashtags SEM CONTATO (90 dias)
        hashtags_without_contact AS (
            SELECT
                COUNT(DISTINCT hashtag) as unique_hashtags_without_contact,
                COUNT(*) as occurrences_without_contact
            FROM (
                SELECT jsonb_array_elements_text(hashtags_bio) as hashtag FROM leads_for_hashtags WHERE contact_status = 'without_contact' AND hashtags_bio IS NOT NULL AND jsonb_array_length(hashtags_bio) > 0
                UNION ALL
                SELECT jsonb_array_elements_text(hashtags_posts) as hashtag FROM leads_for_hashtags WHERE contact_status = 'without_contact' AND hashtags_posts IS NOT NULL AND jsonb_array_length(hashtags_posts) > 0
            ) t WHERE hashtag IS NOT NULL AND hashtag != ''
        ),
        -- Detalhamento por fonte (90 dias)
        hashtag_sources AS (
            SELECT
                SUM(COALESCE(jsonb_array_length(hashtags_bio), 0)) as total_hashtags_in_bio,
                SUM(COALESCE(jsonb_array_length(hashtags_posts), 0)) as total_hashtags_in_posts,
                COUNT(*) FILTER (WHERE hashtags_bio IS NOT NULL AND jsonb_array_length(hashtags_bio) > 0) as leads_with_hashtags_bio,
                COUNT(*) FILTER (WHERE hashtags_posts IS NOT NULL AND jsonb_array_length(hashtags_posts) > 0) as leads_with_hashtags_posts
            FROM leads_for_hashtags
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
      leads_with_whatsapp: 0,
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
 *
 * OTIMIZADO: Usa apenas top 100 hashtags mais frequentes para evitar O(n²)
 * Antes: 284k hashtags × 284k = timeout
 * Agora: 100 hashtags × 100 = ~5000 combinações (rápido)
 */
router.get('/cooccurrences', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    console.log(`\n🔗 [API] Buscando top ${limit} co-ocorrências (otimizado)`);

    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH
        -- Passo 1: Identificar top 100 hashtags mais frequentes (últimos 45 dias)
        top_hashtags AS (
            SELECT hashtag, COUNT(*) as freq
            FROM (
                SELECT jsonb_array_elements_text(hashtags_bio) as hashtag, id
                FROM instagram_leads
                WHERE hashtags_bio IS NOT NULL
                  AND (captured_at >= CURRENT_DATE - INTERVAL '45 days'
                       OR updated_at >= CURRENT_DATE - INTERVAL '45 days')
                UNION ALL
                SELECT jsonb_array_elements_text(hashtags_posts) as hashtag, id
                FROM instagram_leads
                WHERE hashtags_posts IS NOT NULL
                  AND (captured_at >= CURRENT_DATE - INTERVAL '45 days'
                       OR updated_at >= CURRENT_DATE - INTERVAL '45 days')
            ) t
            WHERE hashtag IS NOT NULL AND hashtag != ''
            GROUP BY hashtag
            ORDER BY freq DESC
            LIMIT 100
        ),
        -- Passo 2: Pegar apenas leads que têm essas top hashtags
        lead_hashtags AS (
            SELECT DISTINCT l.id as lead_id, th.hashtag
            FROM instagram_leads l,
            LATERAL jsonb_array_elements_text(
                COALESCE(l.hashtags_bio, '[]'::jsonb) || COALESCE(l.hashtags_posts, '[]'::jsonb)
            ) as h(hashtag)
            JOIN top_hashtags th ON th.hashtag = h.hashtag
            WHERE (l.captured_at >= CURRENT_DATE - INTERVAL '45 days'
                   OR l.updated_at >= CURRENT_DATE - INTERVAL '45 days')
        ),
        -- Passo 3: Calcular co-ocorrências apenas entre top hashtags
        hashtag_pairs AS (
            SELECT
                a.hashtag as hashtag1,
                b.hashtag as hashtag2,
                COUNT(*) as cooccurrence
            FROM lead_hashtags a
            JOIN lead_hashtags b ON a.lead_id = b.lead_id AND a.hashtag < b.hashtag
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
    // 🔧 SEPARAÇÃO: bio vs posts + WhatsApp rate (usando whatsapp_number)
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
                'bio' as source,
                (whatsapp_number IS NOT NULL) as has_whatsapp
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
                'posts' as source,
                (whatsapp_number IS NOT NULL) as has_whatsapp
            FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
            WHERE hashtags_posts IS NOT NULL
        ),
        hashtag_frequency AS (
            SELECT
                hashtag_clean as hashtag,
                COUNT(*) as frequency,
                COUNT(*) FILTER (WHERE source = 'bio') as freq_bio,
                COUNT(*) FILTER (WHERE source = 'posts') as freq_posts,
                COUNT(DISTINCT lead_id) as unique_leads,
                COUNT(DISTINCT lead_id) FILTER (WHERE has_whatsapp) as leads_with_whatsapp
            FROM hashtag_normalized
            WHERE hashtag_clean IS NOT NULL
              AND hashtag_clean != ''
              AND hashtag_clean ~ '^[a-z0-9_]+$'  -- Apenas hashtags válidas (sem acentos/caracteres especiais)
            GROUP BY hashtag_clean
        )
        SELECT
            hashtag,
            frequency,
            freq_bio,
            freq_posts,
            unique_leads,
            leads_with_whatsapp,
            ROUND(leads_with_whatsapp::numeric / NULLIF(unique_leads, 0)::numeric * 100, 1) as contact_rate
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
        freq_bio: h.freq_bio || 0,
        freq_posts: h.freq_posts || 0,
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
      whapi_channel_uuid,
      analysis_result,
      lead_ids  // IDs dos leads do nicho para persistir em campaign_leads
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
          nicho_principal: nicho || '',
          nicho_secundario: nicho_secundario || null,
          keywords,
          // Preservar valores enviados (colunas NOT NULL não aceitam null)
          service_description: service_description ?? '',
          target_audience: target_audience ?? '',
          target_age_range: target_age_range || null,
          target_gender: target_gender || null,
          target_location: target_location || null,
          target_income_class: target_income_class || null,
          whapi_channel_uuid: whapi_channel_uuid || null,
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
          whapi_channel_uuid: whapi_channel_uuid || null,
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

    // === 3. PERSISTIR LEADS DO NICHO EM CAMPAIGN_LEADS ===
    if (lead_ids && Array.isArray(lead_ids) && lead_ids.length > 0) {
      console.log(`   👥 Persistindo ${lead_ids.length} leads do nicho em campaign_leads...`);

      // Remover leads antigos da campanha (se update)
      if (isUpdate) {
        const { error: deleteError } = await supabase
          .from('campaign_leads')
          .delete()
          .eq('campaign_id', campaignId);

        if (deleteError) {
          console.error(`   ⚠️ Erro ao remover leads antigos: ${deleteError.message}`);
        } else {
          console.log(`   🗑️ Leads antigos removidos`);
        }
      }

      // Inserir novos leads em batches de 500
      const batchSize = 500;
      let insertedCount = 0;

      for (let i = 0; i < lead_ids.length; i += batchSize) {
        const batch = lead_ids.slice(i, i + batchSize);
        const records = batch.map((lead_id: string) => ({
          campaign_id: campaignId,
          lead_id,
          status: 'pending',
          created_at: new Date().toISOString()
        }));

        const { error: insertError } = await supabase
          .from('campaign_leads')
          .upsert(records, { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true });

        if (insertError) {
          console.error(`   ⚠️ Erro ao inserir batch ${i / batchSize + 1}: ${insertError.message}`);
        } else {
          insertedCount += batch.length;
        }
      }

      console.log(`   ✅ ${insertedCount} leads persistidos em campaign_leads`);
    } else {
      console.log(`   ⚠️ Nenhum lead_id fornecido para persistir`);
    }

    // 4. Salvar insights comportamentais da IA (se houver dados de IA)
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
 * GET /api/hashtag-intelligence/whapi-channels
 * Lista todos os canais Whapi disponíveis para seleção
 */
router.get('/whapi-channels', async (_req, res) => {
  try {
    console.log('\n📱 [API] Listando canais Whapi...');

    const { data, error } = await supabase
      .from('whapi_channels')
      .select('id, name, channel_id, phone_number, status, rate_limit_hourly, rate_limit_daily, warmup_mode')
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (error) throw error;

    return res.json({
      success: true,
      data: data || []
    });
  } catch (error: any) {
    console.error('❌ Erro em /whapi-channels:', error);
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
 * PATCH /api/hashtag-intelligence/campaign/:campaignId/fields
 * Atualiza campos editáveis de uma campanha em modo Rascunho
 * Não requer validação prévia - usado para edição rápida
 */
router.patch('/campaign/:campaignId/fields', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const {
      nicho_principal,
      service_description,
      target_audience,
      target_age_range,
      target_gender,
      target_location,
      target_income_class,
      keywords
    } = req.body;

    console.log(`\n✏️ [API] Atualizando campos da campanha: ${campaignId}`);

    // Verificar se campanha existe e está em modo draft
    const { data: campaign, error: fetchError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, pipeline_status')
      .eq('id', campaignId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    // Permitir edição apenas em modo draft ou rascunho
    if (campaign.pipeline_status && !['draft', 'pending', 'analyzing'].includes(campaign.pipeline_status)) {
      return res.status(400).json({
        success: false,
        message: `Campanha não pode ser editada no status "${campaign.pipeline_status}". Apenas campanhas em rascunho podem ser editadas.`
      });
    }

    // Montar objeto de atualização apenas com campos fornecidos
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (nicho_principal !== undefined) updateData.nicho_principal = nicho_principal || '';
    if (service_description !== undefined) updateData.service_description = service_description ?? '';
    if (target_audience !== undefined) updateData.target_audience = target_audience ?? '';
    if (target_age_range !== undefined) updateData.target_age_range = target_age_range || null;
    if (target_gender !== undefined) updateData.target_gender = target_gender || null;
    if (target_location !== undefined) updateData.target_location = target_location || null;
    if (target_income_class !== undefined) updateData.target_income_class = target_income_class || null;
    if (keywords !== undefined) updateData.keywords = keywords;

    const { error: updateError } = await supabase
      .from('cluster_campaigns')
      .update(updateData)
      .eq('id', campaignId);

    if (updateError) throw updateError;

    console.log(`   ✅ Campos atualizados: ${Object.keys(updateData).join(', ')}`);

    return res.json({
      success: true,
      message: 'Campos atualizados com sucesso',
      data: {
        campaign_id: campaignId,
        updated_fields: Object.keys(updateData)
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em PATCH /campaign/:campaignId/fields:', error);
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

    // Buscar projeto associado (se existir)
    let project = null;
    if (campaign.project_id) {
      const { data: projectData, error: projectError } = await supabase
        .from('cluster_projects')
        .select('*')
        .eq('id', campaign.project_id)
        .single();

      if (!projectError) {
        project = projectData;
      }
    }

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

// ═══════════════════════════════════════════════════════════════
// CAMPAIGN LIFECYCLE - Status Management
// ═══════════════════════════════════════════════════════════════

/**
 * Estados válidos do pipeline de campanha:
 * - draft: Pode editar tudo (clustering, captura, conteúdo)
 * - ready: Bloqueado para edição, pronto para outreach
 * - active: Outreach em andamento
 * - completed: Campanha finalizada
 * - paused: Temporariamente pausada
 */
const CAMPAIGN_STATES = {
  DRAFT: 'draft',
  READY: 'ready',
  READY_FOR_OUTREACH: 'ready_for_outreach',  // Legacy status
  ACTIVE: 'active',
  COMPLETED: 'completed',
  PAUSED: 'paused'
} as const;

// Estados que permitem edição (clustering, captura de leads, geração de conteúdo)
const EDITABLE_STATES = [CAMPAIGN_STATES.DRAFT];

// Transições válidas de estado
const VALID_TRANSITIONS: Record<string, string[]> = {
  'draft': ['ready'],
  'ready': ['draft', 'active'],  // Pode voltar para draft se necessário
  'ready_for_outreach': ['draft', 'active'],  // Legacy - tratar como 'ready'
  'active': ['paused', 'completed'],
  'paused': ['active', 'completed'],
  'completed': []  // Estado final, não permite transição
};

/**
 * Helper: Verifica se campanha permite edição
 */
async function checkCampaignEditable(campaignId: string): Promise<{ editable: boolean; status: string; message?: string }> {
  const { data: campaign, error } = await supabase
    .from('cluster_campaigns')
    .select('pipeline_status, campaign_name')
    .eq('id', campaignId)
    .single();

  if (error || !campaign) {
    return { editable: false, status: 'unknown', message: 'Campanha não encontrada' };
  }

  const status = campaign.pipeline_status || 'draft';
  const editable = EDITABLE_STATES.includes(status as any);

  return {
    editable,
    status,
    message: editable ? undefined : `Campanha "${campaign.campaign_name}" está em status "${status}" e não pode ser editada. Retorne para "draft" primeiro.`
  };
}

/**
 * PUT /api/hashtag-intelligence/campaign/:campaignId/status
 * Transiciona o status da campanha
 * Body: { status: 'draft' | 'ready' | 'active' | 'completed' | 'paused' }
 */
router.put('/campaign/:campaignId/status', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { status: newStatus } = req.body;

    console.log(`\n🔄 [API] PUT /campaign/${campaignId}/status -> ${newStatus}`);

    // Validar novo status
    if (!Object.values(CAMPAIGN_STATES).includes(newStatus)) {
      return res.status(400).json({
        success: false,
        message: `Status inválido. Valores permitidos: ${Object.values(CAMPAIGN_STATES).join(', ')}`
      });
    }

    // Buscar status atual
    const { data: campaign, error: fetchError } = await supabase
      .from('cluster_campaigns')
      .select('pipeline_status, campaign_name, clustering_result, total_leads_in_campaign')
      .eq('id', campaignId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    const currentStatus = campaign.pipeline_status || 'draft';

    // Validar transição
    const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus) && currentStatus !== newStatus) {
      return res.status(400).json({
        success: false,
        message: `Transição inválida: ${currentStatus} → ${newStatus}. Transições permitidas: ${allowedTransitions.join(', ') || 'nenhuma'}`
      });
    }

    // Validações específicas para transição para "ready"
    if (newStatus === 'ready') {
      if (!campaign.clustering_result) {
        return res.status(400).json({
          success: false,
          message: 'Execute o clustering antes de marcar como "ready"'
        });
      }
      if (!campaign.total_leads_in_campaign || campaign.total_leads_in_campaign === 0) {
        return res.status(400).json({
          success: false,
          message: 'Capture leads antes de marcar como "ready"'
        });
      }
    }

    // Atualizar status
    const updateData: any = {
      pipeline_status: newStatus,
      updated_at: new Date().toISOString()
    };

    // Registrar timestamps de transição
    if (newStatus === 'active' && currentStatus !== 'active') {
      updateData.pipeline_started_at = new Date().toISOString();
    }
    if (newStatus === 'completed') {
      updateData.pipeline_completed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('cluster_campaigns')
      .update(updateData)
      .eq('id', campaignId);

    if (updateError) throw updateError;

    console.log(`   ✅ Status alterado: ${currentStatus} → ${newStatus}`);

    return res.json({
      success: true,
      message: `Status alterado para "${newStatus}"`,
      data: {
        campaign_id: campaignId,
        previous_status: currentStatus,
        current_status: newStatus
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em PUT /campaign/:campaignId/status:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/campaign/:campaignId/status
 * Retorna status atual da campanha e ações permitidas
 */
router.get('/campaign/:campaignId/status', async (req, res) => {
  try {
    const { campaignId } = req.params;

    const { data: campaign, error } = await supabase
      .from('cluster_campaigns')
      .select('pipeline_status, campaign_name, clustering_result, total_leads_in_campaign, pipeline_started_at, pipeline_completed_at')
      .eq('id', campaignId)
      .single();

    if (error || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    const status = campaign.pipeline_status || 'draft';
    const editable = EDITABLE_STATES.includes(status as any);
    const allowedTransitions = VALID_TRANSITIONS[status] || [];

    return res.json({
      success: true,
      data: {
        campaign_id: campaignId,
        campaign_name: campaign.campaign_name,
        status,
        editable,
        allowed_transitions: allowedTransitions,
        has_clustering: !!campaign.clustering_result,
        has_leads: campaign.total_leads_in_campaign > 0,
        pipeline_started_at: campaign.pipeline_started_at,
        pipeline_completed_at: campaign.pipeline_completed_at,
        can_start_outreach: status === 'ready' || status === 'active'
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em GET /campaign/:campaignId/status:', error);
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

    // Coletar todas as hashtags normalizadas
    const allHashtags: string[] = [];

    // 1. Adicionar hashtags raiz (≥70 freq)
    if (hashtags_raiz && Array.isArray(hashtags_raiz)) {
      for (const h of hashtags_raiz) {
        const hashtag = h.hashtag.replace(/^#/, '').toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        if (!allHashtags.includes(hashtag)) {
          allHashtags.push(hashtag);
        }
      }
    }

    // 2. Adicionar hashtags recomendadas (20-69 freq)
    if (hashtags_recomendadas && Array.isArray(hashtags_recomendadas)) {
      for (const h of hashtags_recomendadas) {
        const cleanHashtag = h.replace(/^#/, '').replace(/\s*\(\d+\)\s*$/, '').toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        if (!allHashtags.includes(cleanHashtag)) {
          allHashtags.push(cleanHashtag);
        }
      }
    }

    if (allHashtags.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum search term para gerar. Forneça hashtags_raiz ou hashtags_recomendadas.'
      });
    }

    console.log(`   📊 Total de hashtags: ${allHashtags.length}`);

    // Humanizar via GPT (batch)
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    console.log('   🤖 Humanizando hashtags via GPT...');
    const humanizePrompt = `Converta cada hashtag abaixo em texto legível em português (com espaços e acentos corretos).
Retorne APENAS um JSON array com os textos humanizados, na mesma ordem.

Hashtags:
${allHashtags.map((h, i) => `${i + 1}. ${h}`).join('\n')}

Exemplo:
- gestaodeleads → gestão de leads
- marketingdigital → marketing digital

Retorne apenas o JSON array, sem markdown:`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: humanizePrompt }],
      temperature: 0.1
    });

    let humanizedTerms: string[] = [];
    try {
      const responseText = completion.choices[0].message.content.trim();
      humanizedTerms = JSON.parse(responseText);
      console.log('   ✅ Humanização concluída');
    } catch (parseError) {
      console.warn('   ⚠️ Erro ao parsear resposta GPT, usando hashtags originais');
      humanizedTerms = allHashtags;
    }

    // Montar search_terms
    const searchTerms = allHashtags.map((hashtag, i) => ({
      termo: humanizedTerms[i] || hashtag,
      hashtag: hashtag
    }));

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
 *   "mode": "vector" | "hashtag" // opcional - default hashtag; vector usa embeddings
 *   "similarity_threshold": 0.65 // opcional (apenas vector)
 *   "target_states": ["SP", "RJ"] // opcional - filtrar por estados brasileiros
 *   "lead_max_age_days": 45 // opcional - máximo 45 dias para leads (default)
 *   "hashtag_max_age_days": 90 // opcional - máximo 90 dias para hashtags (default)
 * }
 */
router.post('/execute-clustering', async (req, res) => {
  try {
    const {
      seeds = [],
      nicho,
      k,
      campaign_id,
      mode = 'hashtag',
      similarity_threshold,
      // Novos filtros de localização e recência
      target_states,
      lead_max_age_days,
      hashtag_max_age_days,
      // Mínimo de leads por cluster (opcional)
      min_leads_per_cluster,
      // Limite de leads desejados (default: 2000)
      max_leads,
      // === FILTROS DE NICHO (NOVO) ===
      filter_by_seeds = true, // Por padrão, filtra leads que têm as seeds
      lead_ids                // IDs específicos dos leads do nicho (alternativa)
    } = req.body;

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

    // Validar se campanha permite edição (se campaign_id fornecido)
    if (campaign_id) {
      const editCheck = await checkCampaignEditable(campaign_id);
      if (!editCheck.editable) {
        return res.status(403).json({
          success: false,
          message: editCheck.message,
          status: editCheck.status
        });
      }
    }

    // Determinar modo de clusterização
    const normalizedMode = String(mode).toLowerCase();
    const isVectorMode = normalizedMode === 'vector';
    const isGraphMode = normalizedMode === 'graph';
    const isHashtagVectorMode = normalizedMode === 'vector_hashtag';

    // Construir objeto de filtros
    const filters = {
      target_states: target_states as string[] | undefined,
      lead_max_age_days: lead_max_age_days as number | undefined,
      hashtag_max_age_days: hashtag_max_age_days as number | undefined,
      max_leads: max_leads as number | undefined,
      // === FILTROS DE NICHO (NOVO) ===
      filter_by_seeds: filter_by_seeds as boolean,
      lead_ids: lead_ids as string[] | undefined
    };

    console.log(`\n🔬 [API] POST /execute-clustering - Nicho: ${nicho}, Seeds: [${(seeds || []).join(', ')}]`);
    if (k) console.log(`   📊 K fixo: ${k}`);
    console.log(`   🧠 Modo: ${isGraphMode ? 'graph (HNSW connected components)' : isVectorMode ? 'vector (pgvector)' : isHashtagVectorMode ? 'vector_hashtag' : 'hashtag'}`);
    if (target_states?.length) console.log(`   🗺️  Estados: [${target_states.join(', ')}]`);
    console.log(`   📅 Recência: leads ≤${lead_max_age_days || 45}d, hashtags ≤${hashtag_max_age_days || 90}d`);
    console.log(`   📊 Limite de leads: ${max_leads || 2000}`);
    console.log(`   🎯 Filtro nicho: ${lead_ids?.length ? `${lead_ids.length} lead_ids` : filter_by_seeds ? 'por seeds' : 'DESATIVADO'}`);

    let result;
    if (isGraphMode) {
      // NOVO: Clustering por grafo de similaridade via HNSW
      // Descobre K automaticamente baseado em densidade
      result = await executeGraphClustering(
        campaign_id,
        nicho,
        seeds || [],
        filters,
        30,   // kNeighbors
        similarity_threshold || 0.72,  // threshold mais alto para graph
        min_leads_per_cluster || 10
      );
    } else if (isVectorMode) {
      result = await vectorClusteringService.executeVectorClustering(
        campaign_id,
        nicho,
        seeds || [],
        k,
        similarity_threshold || 0.65,
        filters,
        min_leads_per_cluster || 1
      );
    } else if (isHashtagVectorMode) {
      result = await executeHashtagVectorClustering(
        campaign_id,
        nicho,
        seeds || [],
        k || 5,
        similarity_threshold || 0.65,
        filters
      );
    } else {
      // Modo hashtag tradicional - também aplicar filtros
      result = await clusteringEngineService.executeClustering(seeds, nicho, k, filters);
    }

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
          last_clustering_at: new Date().toISOString(),
          total_subclusters: relatedClusters.length,
          total_leads_in_campaign: result.total_leads || 0
        })
        .eq('id', campaign_id);

      if (updateError) {
        console.error('⚠️ Erro ao salvar clustering na campanha:', updateError);
      } else {
        console.log(`   💾 Resultado salvo na campanha ${campaign_id}`);
        console.log(`   📊 ${relatedClusters.length} subnichos salvos em related_clusters`);
      }

      // === TAMBÉM SALVAR EM campaign_subclusters (tabela normalizada) ===
      // Primeiro, deletar subclusters anteriores desta campanha
      await supabase
        .from('campaign_subclusters')
        .delete()
        .eq('campaign_id', campaign_id);

      // Inserir novos subclusters
      const subclustersToInsert = result.clusters?.map((c: any, index: number) => ({
        campaign_id: campaign_id,
        cluster_index: c.cluster_id ?? index,
        cluster_name: c.cluster_name || `Cluster ${index + 1}`,
        total_leads: c.total_leads || 0,
        avg_contact_rate: Math.min((c.avg_contact_rate || 0) / 10, 9.9999), // Normalizar para NUMERIC(5,4)
        hashtag_count: c.hashtag_count || 0,
        relevance_score: Math.min(c.silhouette_score || 0.5, 9.9999),
        priority_score: index + 1, // Prioridade por ordem
        top_hashtags: c.top_hashtags?.slice(0, 10) || [],
        theme_keywords: c.theme_keywords?.slice(0, 10) || [],
        status: 'pending' // Aguardando geração de persona/DM/copy
      })) || [];

      if (subclustersToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('campaign_subclusters')
          .insert(subclustersToInsert);

        if (insertError) {
          console.error('⚠️ Erro ao salvar em campaign_subclusters:', insertError);
        } else {
          console.log(`   ✅ ${subclustersToInsert.length} subclusters salvos em campaign_subclusters`);
        }
      }

      // NOTA: A persistência de leads em campaign_leads é feita no /save-analysis
      // O clustering apenas retorna os lead_ids em cada cluster para o frontend coletar
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
 * GET /api/hashtag-intelligence/platform-demo-campaign
 * Retorna ou cria a campanha "Platform Demo" para clustering genérico
 */
router.get('/platform-demo-campaign', async (_req, res) => {
  try {
    console.log('\n🏷️ [API] GET /platform-demo-campaign');

    // Buscar campanha demo existente
    const { data: existing, error: searchError } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, nicho_principal, cluster_status, last_clustering_at')
      .eq('campaign_name', 'Platform Demo')
      .single();

    if (existing && !searchError) {
      console.log('   ✅ Campanha Platform Demo encontrada:', existing.id);
      return res.json({
        success: true,
        data: existing,
        created: false
      });
    }

    // Criar nova campanha demo
    console.log('   🆕 Criando campanha Platform Demo...');
    const { data: newCampaign, error: createError } = await supabase
      .from('cluster_campaigns')
      .insert({
        campaign_name: 'Platform Demo',
        nicho_principal: 'Demonstração',
        keywords: ['demo', 'teste', 'plataforma'],
        service_description: 'Campanha de demonstração para testes de clustering na plataforma',
        target_audience: 'Usuários de teste da plataforma',
        cluster_status: 'pending'
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Erro ao criar campanha: ${createError.message}`);
    }

    console.log('   ✅ Campanha Platform Demo criada:', newCampaign.id);
    return res.json({
      success: true,
      data: newCampaign,
      created: true
    });

  } catch (error: any) {
    console.error('❌ Erro em /platform-demo-campaign:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================
// VECTOR CLUSTERING (Embedding-based)
// ============================================

/**
 * POST /api/hashtag-intelligence/vector-clustering
 * Clustering de leads usando embeddings e cosine similarity via pgvector.
 * Mais preciso e rápido que clustering por hashtags.
 *
 * Body:
 * {
 *   "campaign_id": "uuid",       // opcional - filtra leads da campanha
 *   "num_clusters": 5,           // opcional - número de clusters (default: 5)
 *   "min_similarity": 0.65       // opcional - similaridade mínima (default: 0.65)
 * }
 */
router.post('/vector-clustering', async (req, res) => {
  try {
    const { campaign_id, num_clusters = 5, min_similarity = 0.65 } = req.body;

    console.log(`\n🔬 [API] POST /vector-clustering`);
    if (campaign_id) console.log(`   📋 Campaign: ${campaign_id}`);
    console.log(`   🎯 Clusters: ${num_clusters}, Min similarity: ${min_similarity}`);

    const result = await vectorClusteringService.clusterBySimilarity(
      campaign_id,
      num_clusters,
      10, // min leads per cluster
      min_similarity
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Erro ao executar vector clustering'
      });
    }

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Erro em /vector-clustering:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/similar-leads/:leadId
 * Busca leads similares a um lead de referência usando cosine similarity
 *
 * Query params:
 * - limit: número máximo de resultados (default: 50)
 * - min_similarity: similaridade mínima (default: 0.7)
 */
router.get('/similar-leads/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const minSimilarity = parseFloat(req.query.min_similarity as string) || 0.7;

    console.log(`\n🔍 [API] GET /similar-leads/${leadId} (limit: ${limit}, min: ${minSimilarity})`);

    const results = await vectorClusteringService.findSimilarLeads(leadId, limit, minSimilarity);

    return res.json({
      success: true,
      reference_lead_id: leadId,
      count: results.length,
      data: results
    });
  } catch (error: any) {
    console.error('❌ Erro em /similar-leads:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// NOTA: Rota /suggest-seeds movida para o final do arquivo (usa busca semântica com embeddings)

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

        // Auto-criar documento RAG para a persona
        try {
          console.log(`   📄 Criando documento RAG para persona...`);
          const docResult = await campaignDocumentProcessor.processDocument({
            campaignId: campaign_id,
            title: 'Persona ICP - Gerada Automaticamente',
            docType: 'knowledge',
            content: persona,
            metadata: {
              source: 'auto-generated',
              generatedAt: new Date().toISOString(),
              nicho: nicho
            }
          });

          if (docResult.success) {
            console.log(`   ✅ Documento RAG criado: ${docResult.chunksCreated} chunks`);
          } else {
            console.error(`   ⚠️ Erro ao criar documento RAG:`, docResult.error);
          }
        } catch (docError: any) {
          console.error(`   ⚠️ Erro ao criar documento RAG:`, docError.message);
        }
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

        // Auto-criar documento RAG para os DM scripts
        try {
          console.log(`   📄 Criando documento RAG para DM scripts...`);
          const docResult = await campaignDocumentProcessor.processDocument({
            campaignId: campaign_id,
            title: 'Scripts de DM Outreach - Gerados Automaticamente',
            docType: 'script',
            content: dm_scripts,
            metadata: {
              source: 'auto-generated',
              generatedAt: new Date().toISOString(),
              nicho: nicho,
              tone: tone
            }
          });

          if (docResult.success) {
            console.log(`   ✅ Documento RAG criado: ${docResult.chunksCreated} chunks`);
          } else {
            console.error(`   ⚠️ Erro ao criar documento RAG:`, docResult.error);
          }
        } catch (docError: any) {
          console.error(`   ⚠️ Erro ao criar documento RAG:`, docError.message);
        }
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
// GERAÇÃO DE CONTEÚDO POR CLUSTER (PERSONALIZAÇÃO)
// ============================================

/**
 * POST /api/hashtag-intelligence/generate-content-per-cluster
 * Gera persona, DM scripts e copies para CADA cluster individualmente
 * Permite personalização real por subnicho
 */
router.post('/generate-content-per-cluster', async (req, res) => {
  try {
    const {
      campaign_id,
      nicho,
      service_description,
      target_audience,
      content_types = ['persona', 'dm', 'copy'] // Quais tipos gerar
    } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'Campo "campaign_id" é obrigatório'
      });
    }

    // Validar se campanha permite edição
    const editCheck = await checkCampaignEditable(campaign_id);
    if (!editCheck.editable) {
      return res.status(403).json({
        success: false,
        message: editCheck.message,
        status: editCheck.status
      });
    }

    console.log(`\n🎯 [API] POST /generate-content-per-cluster - Campaign: ${campaign_id}`);
    console.log(`   📋 Tipos de conteúdo: ${content_types.join(', ')}`);

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Buscar subclusters da campanha
    const { data: subclusters, error: fetchError } = await supabase
      .from('campaign_subclusters')
      .select('*')
      .eq('campaign_id', campaign_id)
      .order('cluster_index', { ascending: true });

    if (fetchError || !subclusters || subclusters.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum subcluster encontrado. Execute o clustering primeiro.'
      });
    }

    console.log(`   📊 ${subclusters.length} subclusters encontrados`);

    const results: any[] = [];
    let totalTokens = 0;

    // Processar cada subcluster
    for (const subcluster of subclusters) {
      console.log(`\n   🔄 Processando cluster ${subcluster.cluster_index + 1}: ${subcluster.cluster_name}`);

      const clusterResult: any = {
        cluster_id: subcluster.id,
        cluster_index: subcluster.cluster_index,
        cluster_name: subcluster.cluster_name,
        total_leads: subcluster.total_leads,
        // Incluir dados existentes do banco (para quando geramos apenas um tipo de conteúdo)
        persona: subcluster.persona || null,
        dm_scripts: subcluster.dm_scripts || null
      };

      const clusterContext = `
CLUSTER ESPECÍFICO: "${subcluster.cluster_name}"
- ${subcluster.total_leads} leads neste cluster
- ${subcluster.hashtag_count} hashtags relacionadas
- Taxa de contato: ${(subcluster.avg_contact_rate * 10).toFixed(1)}%
- Temas principais: ${(subcluster.theme_keywords || []).slice(0, 5).join(', ')}
- Top hashtags: ${(subcluster.top_hashtags || []).slice(0, 5).map((h: any) => typeof h === 'string' ? h : h.hashtag).join(', ')}
`;

      // === GERAR PERSONA PARA ESTE CLUSTER ===
      if (content_types.includes('persona')) {
        const personaPrompt = `Você é um especialista em criação de personas ICP para marketing digital.

Crie uma PERSONA ESPECÍFICA para o seguinte subnicho/cluster:

NICHO GERAL: ${nicho}
SERVIÇO/PRODUTO: ${service_description}
PÚBLICO-ALVO: ${target_audience}
${clusterContext}

IMPORTANTE: Esta persona deve ser ESPECÍFICA para este cluster, não genérica.
Baseie-se nos temas e hashtags do cluster para definir características únicas.

FORMATO (JSON):
{
  "nome": "Nome fictício representativo",
  "perfil": "Descrição em 1-2 frases",
  "idade_tipica": "XX-YY anos",
  "dores_principais": ["dor1", "dor2", "dor3"],
  "objetivos": ["obj1", "obj2", "obj3"],
  "gatilhos_conversao": ["gatilho1", "gatilho2", "gatilho3"],
  "tom_comunicacao": "Como preferem ser abordados",
  "horarios_ativos": "Quando estão mais ativos"
}`;

        const personaCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: personaPrompt }],
          temperature: 0.7,
          max_tokens: 800
        });

        const personaContent = personaCompletion.choices[0]?.message?.content || '';
        totalTokens += personaCompletion.usage?.total_tokens || 0;

        // Tentar parsear como JSON
        let personaJson: any = null;
        try {
          const jsonMatch = personaContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            personaJson = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          personaJson = { raw: personaContent };
        }

        clusterResult.persona = personaJson;
        console.log(`      ✅ Persona gerada`);
      }

      // === GERAR DM SCRIPTS PARA ESTE CLUSTER ===
      if (content_types.includes('dm')) {
        const personaContext = clusterResult.persona ? `
PERSONA DO CLUSTER:
- Nome: ${clusterResult.persona.nome || 'N/A'}
- Perfil: ${clusterResult.persona.perfil || 'N/A'}
- Dores: ${(clusterResult.persona.dores_principais || []).join(', ')}
- Tom preferido: ${clusterResult.persona.tom_comunicacao || 'N/A'}
` : '';

        const dmPrompt = `Você é um copywriter especializado em cold outreach via Instagram DM.

Crie 3 SCRIPTS DE DM PERSONALIZADOS para este cluster específico:

NICHO: ${nicho}
SERVIÇO: ${service_description}
${clusterContext}
${personaContext}

IMPORTANTE: Os scripts devem ser:
1. Curtos (máx 3 mensagens por script)
2. Personalizáveis (com placeholders como [NOME], [INTERESSE])
3. Específicos para este cluster, não genéricos
4. Começar com gancho relacionado aos temas do cluster

FORMATO (JSON):
{
  "scripts": [
    {
      "nome": "Nome do script",
      "abertura": "Primeira mensagem",
      "follow_up": "Segunda mensagem se não responder",
      "proposta": "Mensagem de proposta de valor"
    }
  ]
}`;

        const dmCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: dmPrompt }],
          temperature: 0.8,
          max_tokens: 1200
        });

        const dmContent = dmCompletion.choices[0]?.message?.content || '';
        totalTokens += dmCompletion.usage?.total_tokens || 0;

        let dmJson: any = null;
        try {
          const jsonMatch = dmContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            dmJson = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          dmJson = { raw: dmContent };
        }

        clusterResult.dm_scripts = dmJson;
        console.log(`      ✅ DM scripts gerados`);
      }

      // === SALVAR PERSONA/DM NO BANCO (por cluster) ===
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // Determinar status baseado no que foi gerado
      if (clusterResult.persona && clusterResult.dm_scripts) {
        updateData.status = 'ready';
      } else if (clusterResult.persona) {
        updateData.status = 'persona_generated';
      } else if (clusterResult.dm_scripts) {
        updateData.status = 'dm_generated';
      }

      if (clusterResult.persona) {
        updateData.persona = clusterResult.persona;
        updateData.persona_generated_at = new Date().toISOString();
        updateData.persona_generation_method = 'gpt-4o-mini';
      }
      if (clusterResult.dm_scripts) {
        updateData.dm_scripts = clusterResult.dm_scripts;
        updateData.dm_scripts_generated_at = new Date().toISOString();
      }

      if (Object.keys(updateData).length > 1) { // Tem mais que só updated_at
        const { error: updateError } = await supabase
          .from('campaign_subclusters')
          .update(updateData)
          .eq('id', subcluster.id);

        if (updateError) {
          console.error(`      ⚠️ Erro ao salvar cluster ${subcluster.cluster_index}:`, updateError);
        } else {
          console.log(`      💾 Conteúdo salvo no banco`);
        }
      }

      results.push(clusterResult);
    }

    // === GERAR COPY ÚNICO PARA A CAMPANHA (consolidando todos os clusters) ===
    let campaignCopy: any = null;
    if (content_types.includes('copy')) {
      console.log(`\n   📝 Gerando COPY ÚNICO consolidando ${subclusters.length} clusters...`);

      // Construir contexto de TODOS os clusters
      const allClustersContext = subclusters.map((sc: any, idx: number) => {
        return `Cluster ${idx + 1} - "${sc.cluster_name}":
  - ${sc.total_leads} leads
  - Temas: ${(sc.theme_keywords || []).slice(0, 3).join(', ')}
  - Hashtags: ${(sc.top_hashtags || []).slice(0, 3).map((h: any) => typeof h === 'string' ? h : h.hashtag).join(', ')}`;
      }).join('\n');

      // Resumo das personas geradas (se disponíveis)
      const personasContext = results
        .filter(r => r.persona)
        .map(r => `- ${r.cluster_name}: ${r.persona.perfil || r.persona.nome || 'N/A'}`)
        .join('\n');

      const copyPrompt = `Você é um copywriter especializado em marketing digital.

Crie COPIES para uma campanha que atinge MÚLTIPLOS SUBNICHOS simultaneamente:

NICHO GERAL: ${nicho}
SERVIÇO/PRODUTO: ${service_description}
PÚBLICO-ALVO: ${target_audience}

CLUSTERS DA CAMPANHA (${subclusters.length} segmentos):
${allClustersContext}

${personasContext ? `PERFIS IDENTIFICADOS:\n${personasContext}\n` : ''}

IMPORTANTE: A copy deve:
1. Ser ABRANGENTE o suficiente para ressoar com todos os clusters
2. Usar linguagem que conecte os diferentes perfis
3. Destacar benefícios universais que interessam a todos os segmentos

FORMATO (JSON):
{
  "landing": {
    "headline": "Headline impactante e abrangente",
    "subheadline": "Subheadline complementar",
    "bullets": ["Benefício 1", "Benefício 2", "Benefício 3"],
    "cta": "Call to action principal"
  },
  "ads": [
    { "tipo": "feed", "texto": "Copy para feed Instagram/Facebook", "cta": "CTA" },
    { "tipo": "stories", "texto": "Copy curto para stories", "cta": "CTA" }
  ],
  "secoes_dor": ["Dor comum 1", "Dor comum 2", "Dor comum 3"],
  "secoes_solucao": ["Como resolvemos 1", "Como resolvemos 2", "Como resolvemos 3"],
  "secoes_beneficios": ["Benefício expandido 1", "Benefício expandido 2", "Benefício expandido 3"]
}`;

      const copyCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: copyPrompt }],
        temperature: 0.8,
        max_tokens: 1500
      });

      const copyContent = copyCompletion.choices[0]?.message?.content || '';
      totalTokens += copyCompletion.usage?.total_tokens || 0;

      try {
        const jsonMatch = copyContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          campaignCopy = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        campaignCopy = { raw: copyContent };
      }

      console.log(`      ✅ Copy única gerada para campanha`);

      // Salvar copy na tabela de campanhas
      const { error: copyUpdateError } = await supabase
        .from('cluster_campaigns')
        .update({
          generated_copies: JSON.stringify(campaignCopy),
          generated_copies_at: new Date().toISOString()
        })
        .eq('id', campaign_id);

      if (copyUpdateError) {
        console.error(`      ⚠️ Erro ao salvar copy na campanha:`, copyUpdateError);
      } else {
        console.log(`      💾 Copy salva na campanha`);
      }
    }

    console.log(`\n✅ Geração concluída: ${results.length} clusters processados`);
    console.log(`   📊 Total de tokens: ${totalTokens}`);
    if (campaignCopy) {
      console.log(`   📝 Copy única da campanha: GERADA`);
    }

    return res.json({
      success: true,
      data: {
        campaign_id,
        clusters_processed: results.length,
        total_tokens: totalTokens,
        content_types,
        clusters: results, // Persona e DM por cluster
        campaign_copy: campaignCopy // Copy única da campanha (se gerada)
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /generate-content-per-cluster:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/campaign/:campaignId/subclusters
 * Lista os subclusters de uma campanha com seus conteúdos gerados
 */
router.get('/campaign/:campaignId/subclusters', async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Buscar subclusters
    const { data: subclusters, error } = await supabase
      .from('campaign_subclusters')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('cluster_index', { ascending: true });

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    // Buscar generated_copies da campanha (armazenado em cluster_campaigns)
    console.log(`[API] Buscando generated_copies para campanha ${campaignId}`);
    const { data: campaign, error: campaignError } = await supabase
      .from('cluster_campaigns')
      .select('generated_copies')
      .eq('id', campaignId)
      .single();

    console.log(`[API] campaign_copies encontrado:`, campaign?.generated_copies ? 'SIM' : 'NAO', campaignError?.message || '');

    // Parse generated_copies se for string JSON
    let campaignCopies = null;
    if (campaign?.generated_copies) {
      try {
        campaignCopies = typeof campaign.generated_copies === 'string'
          ? JSON.parse(campaign.generated_copies)
          : campaign.generated_copies;
      } catch (e) {
        campaignCopies = campaign.generated_copies;
      }
    }

    return res.json({
      success: true,
      data: {
        campaign_id: campaignId,
        total_subclusters: subclusters?.length || 0,
        subclusters: subclusters || [],
        campaign_copies: campaignCopies // Copies da campanha (não dos subclusters)
      }
    });
  } catch (error: any) {
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
 *   limit_per_cluster?: number (máximo de leads por cluster - sem limite por padrão),
 *   only_with_contact?: boolean (apenas leads com email/telefone - default false)
 * }
 */
router.post('/campaign/:campaignId/capture-leads', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { limit_per_cluster, only_with_contact = false, cluster_ids } = req.body;

    // Se cluster_ids específicos fornecidos, não precisa checar editabilidade da campanha toda
    // Apenas verificar se os clusters específicos não estão bloqueados
    if (!cluster_ids || cluster_ids.length === 0) {
      // Validar se campanha permite edição (captura de todos os clusters)
      const editCheck = await checkCampaignEditable(campaignId);
      if (!editCheck.editable) {
        return res.status(403).json({
          success: false,
          message: editCheck.message,
          status: editCheck.status
        });
      }
    }

    const clusterFilter = cluster_ids && cluster_ids.length > 0 ? cluster_ids : null;
    console.log(`\n👥 [API] POST /campaign/${campaignId}/capture-leads`);
    console.log(`   📊 Limite por cluster: ${limit_per_cluster || 'SEM LIMITE'}, Apenas com contato: ${only_with_contact}`);
    console.log(`   🎯 Clusters específicos: ${clusterFilter ? clusterFilter.join(', ') : 'TODOS'}`);

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

    // Buscar subclusters para obter os IDs reais e status
    const { data: subclusters, error: subclusterError } = await supabase
      .from('campaign_subclusters')
      .select('id, cluster_index, cluster_name, persona, status')
      .eq('campaign_id', campaignId)
      .order('cluster_index', { ascending: true });

    if (subclusterError) {
      console.error('   ⚠️ Erro ao buscar subclusters:', subclusterError.message);
    }

    // Criar mapa cluster_index → subcluster_id e verificar bloqueados
    const clusterToSubclusterId = new Map<number, string>();
    const clusterToPersona = new Map<number, any>();
    const blockedClusters: number[] = [];
    for (const sc of subclusters || []) {
      clusterToSubclusterId.set(sc.cluster_index, sc.id);
      clusterToPersona.set(sc.cluster_index, sc.persona);
      // Clusters em in_outreach ou completed estão bloqueados
      if (sc.status === 'in_outreach' || sc.status === 'completed') {
        blockedClusters.push(sc.cluster_index);
      }
    }

    console.log(`   🔒 Clusters bloqueados: ${blockedClusters.length > 0 ? blockedClusters.join(', ') : 'nenhum'}`);

    console.log(`   🔗 ${clusterToSubclusterId.size} subclusters mapeados`);

    // Agrupar leads por cluster (filtrando por cluster_ids se especificado e pulando bloqueados)
    const leadsByCluster: Record<number, any[]> = {};
    const clustersToProcess: any[] = [];

    for (const cluster of clusters) {
      const clusterId = cluster.cluster_id;

      // Pular clusters bloqueados (já em outreach ou completed)
      if (blockedClusters.includes(clusterId)) {
        console.log(`   ⏭️ Pulando cluster ${clusterId} (${cluster.cluster_name}) - já bloqueado`);
        continue;
      }

      // Filtrar por cluster_ids se especificado
      if (clusterFilter && !clusterFilter.includes(clusterId)) {
        continue;
      }

      leadsByCluster[clusterId] = [];
      clustersToProcess.push(cluster);
    }

    console.log(`   🎯 ${clustersToProcess.length} clusters serão processados`);

    // Coletar todos os lead_ids que serão processados
    const allLeadIds: string[] = [];
    for (const assoc of leadAssociations) {
      const clusterId = assoc.primary_cluster;
      if (leadsByCluster[clusterId] !== undefined) {
        if (only_with_contact && !assoc.has_contact) continue;
        if (!limit_per_cluster || leadsByCluster[clusterId].length < limit_per_cluster) {
          allLeadIds.push(assoc.lead_id);
        }
      }
    }

    // VALIDAÇÃO CRÍTICA: Verificar quais lead_ids ainda existem no banco
    // Isso evita FK violation que faz o batch inteiro falhar
    // Remover duplicatas antes de validar
    const uniqueLeadIds = [...new Set(allLeadIds)];
    console.log(`   🔍 Validando ${uniqueLeadIds.length} lead_ids únicos no banco...`);

    // DEBUG: Verificar formato dos primeiros lead_ids
    if (uniqueLeadIds.length > 0) {
      console.log(`   🔍 Amostra lead_ids: [${uniqueLeadIds.slice(0, 3).join(', ')}]`);
    }

    const validLeadIds = new Set<string>();

    // Verificar em batches menores para evitar rate limiting do Supabase
    const BATCH_SIZE = 200;
    for (let i = 0; i < uniqueLeadIds.length; i += BATCH_SIZE) {
      // Pequeno delay entre batches para evitar rate limiting
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const batch = uniqueLeadIds.slice(i, i + BATCH_SIZE);

      // Filtrar IDs válidos (formato UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validUuidBatch = batch.filter(id => uuidRegex.test(String(id)));

      if (validUuidBatch.length !== batch.length) {
        console.warn(`   ⚠️ Batch ${Math.floor(i/BATCH_SIZE) + 1}: ${batch.length - validUuidBatch.length} IDs com formato inválido ignorados`);
      }

      if (validUuidBatch.length === 0) continue;

      // Retry logic para lidar com falhas de conexão
      let existingLeads: any[] | null = null;
      let lastError: any = null;
      const MAX_RETRIES = 3;

      for (let retry = 0; retry < MAX_RETRIES; retry++) {
        const { data, error: validationError } = await supabase
          .from('instagram_leads')
          .select('id')
          .in('id', validUuidBatch);

        if (!validationError && data) {
          existingLeads = data;
          break;
        }

        lastError = validationError;
        if (retry < MAX_RETRIES - 1) {
          console.log(`   🔄 Batch ${Math.floor(i/BATCH_SIZE) + 1}: retry ${retry + 1}/${MAX_RETRIES}...`);
          await new Promise(resolve => setTimeout(resolve, 500 * (retry + 1))); // Backoff progressivo
        }
      }

      if (lastError && !existingLeads) {
        console.error(`   ⚠️ Erro ao validar leads batch ${Math.floor(i/BATCH_SIZE) + 1} após ${MAX_RETRIES} tentativas:`, lastError.message || lastError);
      } else if (existingLeads) {
        // Garantir que o ID seja tratado como string
        existingLeads.forEach(l => validLeadIds.add(String(l.id)));
        console.log(`   📦 Batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(uniqueLeadIds.length/BATCH_SIZE)}: ${existingLeads.length}/${validUuidBatch.length} encontrados`);
      }
    }

    const invalidCount = uniqueLeadIds.length - validLeadIds.size;
    if (invalidCount > 0) {
      console.log(`   ⚠️ ${invalidCount} leads não existem mais no banco (serão ignorados)`);
    }
    console.log(`   ✅ ${validLeadIds.size} leads válidos encontrados`);

    // Processar associações de leads (apenas os válidos)
    for (const assoc of leadAssociations) {
      const clusterId = assoc.primary_cluster;
      if (leadsByCluster[clusterId] !== undefined) {
        // Aplicar filtro de contato se solicitado
        if (only_with_contact && !assoc.has_contact) continue;

        // FILTRAR: Só adicionar se o lead existe no banco (usando String para garantir comparação correta)
        if (!validLeadIds.has(String(assoc.lead_id))) continue;

        // Aplicar limite por cluster apenas se especificado
        if (!limit_per_cluster || leadsByCluster[clusterId].length < limit_per_cluster) {
          leadsByCluster[clusterId].push(assoc);
        }
      }
    }

    // Preparar dados para inserção (agrupados por subcluster para rastrear sucesso)
    const leadsBySubcluster: Map<string, any[]> = new Map();
    const statsByCluster: Record<number, { name: string; count: number; subcluster_id: string | null; has_persona: boolean }> = {};

    for (const cluster of clustersToProcess) {
      const clusterLeads = leadsByCluster[cluster.cluster_id] || [];
      const subclusterId = clusterToSubclusterId.get(cluster.cluster_id) || null;
      const persona = clusterToPersona.get(cluster.cluster_id);

      statsByCluster[cluster.cluster_id] = {
        name: cluster.cluster_name,
        count: clusterLeads.length,
        subcluster_id: subclusterId,
        has_persona: !!persona
      };

      // Agrupar leads por subcluster_id para rastrear inserções
      if (subclusterId && clusterLeads.length > 0) {
        const leadsForSubcluster: any[] = [];
        for (const lead of clusterLeads) {
          leadsForSubcluster.push({
            campaign_id: campaignId,
            lead_id: lead.lead_id,
            subcluster_id: subclusterId,
            cluster_id: cluster.cluster_id,
            cluster_name: cluster.cluster_name,
            match_source: 'clustering',
            match_hashtags: lead.clusters || [],
            fit_score: Math.round(lead.score * 10),
            fit_reasons: lead.clusters,
            status: 'pending'
          });
        }
        leadsBySubcluster.set(subclusterId, leadsForSubcluster);
      }
    }

    // Flatten para contagem total
    const campaignLeadsData = Array.from(leadsBySubcluster.values()).flat();

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

    // Inserir por subcluster e rastrear quais tiveram sucesso
    let totalInserted = 0;
    const successfulSubclusterIds: string[] = [];
    const insertedBySubcluster: Record<string, number> = {};

    for (const [subclusterId, leads] of leadsBySubcluster.entries()) {
      let subclusterInserted = 0;

      // Inserir em batches de 500 para cada subcluster
      for (let i = 0; i < leads.length; i += 500) {
        const batch = leads.slice(i, i + 500);
        const { error: insertError, data: insertedData } = await supabase
          .from('campaign_leads')
          .upsert(batch, { onConflict: 'campaign_id,lead_id' })
          .select('id');

        if (insertError) {
          console.error(`   ⚠️ Erro no batch subcluster ${subclusterId}:`, insertError.message);
        } else {
          const insertedCount = insertedData?.length || batch.length;
          subclusterInserted += insertedCount;
          totalInserted += insertedCount;
        }
      }

      // Só marcar subcluster como sucesso se REALMENTE inseriu leads
      if (subclusterInserted > 0) {
        successfulSubclusterIds.push(subclusterId);
        insertedBySubcluster[subclusterId] = subclusterInserted;
        console.log(`   ✅ Subcluster ${subclusterId}: ${subclusterInserted} leads inseridos`);
      } else {
        console.log(`   ⚠️ Subcluster ${subclusterId}: 0 leads inseridos (NÃO será bloqueado)`);
      }
    }

    console.log(`   💾 ${totalInserted} leads capturados e associados aos subnichos`);

    // Bloquear APENAS subclusters que realmente tiveram inserções bem-sucedidas
    if (successfulSubclusterIds.length > 0) {
      const { error: blockError } = await supabase
        .from('campaign_subclusters')
        .update({ status: 'in_outreach', updated_at: new Date().toISOString() })
        .in('id', successfulSubclusterIds);

      if (blockError) {
        console.error('   ⚠️ Erro ao bloquear subclusters:', blockError.message);
      } else {
        console.log(`   🔒 ${successfulSubclusterIds.length} subclusters bloqueados (com leads inseridos)`);
      }
    }

    return res.json({
      success: true,
      message: `${totalInserted} leads capturados para "${campaign.campaign_name}"`,
      data: {
        captured: totalInserted,
        by_cluster: statsByCluster,
        inserted_by_subcluster: insertedBySubcluster,
        blocked_subclusters: successfulSubclusterIds,
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
    const cluster_id = req.query.cluster_id !== undefined ? parseInt(req.query.cluster_id as string, 10) : null;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit as string, 10) || 50));
    const offset = (page - 1) * limit;

    console.log(`\n👥 [API] GET /campaign/${campaignId}/leads-by-cluster`, cluster_id !== null ? `(cluster ${cluster_id}, page ${page})` : '');

    // Se cluster_id especificado, retornar leads desse cluster apenas
    if (cluster_id !== null) {
      // Contar total de leads no cluster primeiro
      const { count } = await supabase
        .from('campaign_leads')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('cluster_id', cluster_id);

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

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
        .eq('cluster_id', cluster_id)
        .order('fit_score', { ascending: false })
        .range(offset, offset + limit - 1);

      if (only_pending) {
        query = query.eq('status', 'pending');
      }

      const { data: leads, error: leadsError } = await query;
      if (leadsError) throw leadsError;

      const formattedLeads = (leads || []).map(lead => {
        const il = Array.isArray(lead.instagram_leads) ? lead.instagram_leads[0] : lead.instagram_leads;
        return {
          id: lead.id,
          lead_id: lead.lead_id,
          username: il?.username,
          full_name: il?.full_name,
          email: il?.email,
          phone: il?.phone,
          bio: il?.bio,
          fit_score: lead.fit_score,
          match_hashtags: lead.match_hashtags,
          status: lead.status
        };
      });

      return res.json({
        success: true,
        data: {
          campaign_id: campaignId,
          cluster_id: cluster_id,
          total: total,
          page: page,
          limit: limit,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1,
          leads: formattedLeads
        }
      });
    }

    // Caso sem cluster_id - comportamento original (agrupado)
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
      .order('fit_score', { ascending: false })
      .limit(3000);

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

// =====================================================
// ENDPOINTS DE NICHOS SUGERIDOS POR CAMPANHA
// =====================================================

/**
 * GET /api/hashtag-intelligence/campaign/:campaignId/niches
 * Retorna os nichos sugeridos de uma campanha
 */
router.get('/campaign/:campaignId/niches', async (req, res) => {
  try {
    const { campaignId } = req.params;
    console.log(`\n📊 [API] Buscando nichos sugeridos da campanha ${campaignId}`);

    const { data: campaign, error } = await supabase
      .from('cluster_campaigns')
      .select('id, campaign_name, suggested_niches, active_niche_index')
      .eq('id', campaignId)
      .single();

    if (error || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    return res.json({
      success: true,
      data: {
        campaign_id: campaign.id,
        campaign_name: campaign.campaign_name,
        niches: campaign.suggested_niches || [],
        active_index: campaign.active_niche_index || 0
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em /campaign/:campaignId/niches:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/campaign/:campaignId/niches
 * Adiciona um novo nicho sugerido à campanha
 */
router.post('/campaign/:campaignId/niches', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { name, seeds } = req.body;

    if (!name || !seeds || !Array.isArray(seeds) || seeds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nome do nicho e seeds são obrigatórios'
      });
    }

    console.log(`\n📊 [API] Adicionando nicho "${name}" à campanha ${campaignId}`);

    // Buscar nichos atuais
    const { data: campaign, error: fetchError } = await supabase
      .from('cluster_campaigns')
      .select('suggested_niches')
      .eq('id', campaignId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    // Criar novo nicho
    const newNiche = {
      name,
      seeds,
      is_validated: false,
      validation_result: null,
      clustering_result: null,
      created_at: new Date().toISOString()
    };

    // Adicionar ao array
    const updatedNiches = [...(campaign.suggested_niches || []), newNiche];

    // Atualizar campanha
    const { error: updateError } = await supabase
      .from('cluster_campaigns')
      .update({
        suggested_niches: updatedNiches,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    if (updateError) {
      throw updateError;
    }

    return res.json({
      success: true,
      message: 'Nicho adicionado com sucesso',
      data: {
        niche: newNiche,
        niche_index: updatedNiches.length - 1,
        total_niches: updatedNiches.length
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em POST /campaign/:campaignId/niches:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/hashtag-intelligence/campaign/:campaignId/niches/:nicheIndex/validate
 * Valida um nicho e armazena o resultado
 */
router.put('/campaign/:campaignId/niches/:nicheIndex/validate', async (req, res) => {
  try {
    const { campaignId, nicheIndex } = req.params;
    const { validation_result, is_validated } = req.body;
    const idx = parseInt(nicheIndex);

    console.log(`\n📊 [API] Atualizando validação do nicho ${idx} na campanha ${campaignId}`);

    // Buscar nichos atuais
    const { data: campaign, error: fetchError } = await supabase
      .from('cluster_campaigns')
      .select('suggested_niches')
      .eq('id', campaignId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    const niches = campaign.suggested_niches || [];
    if (idx < 0 || idx >= niches.length) {
      return res.status(400).json({
        success: false,
        message: 'Índice de nicho inválido'
      });
    }

    // Atualizar nicho
    niches[idx] = {
      ...niches[idx],
      is_validated: is_validated ?? true,
      validation_result,
      validated_at: new Date().toISOString()
    };

    // Salvar
    const { error: updateError } = await supabase
      .from('cluster_campaigns')
      .update({
        suggested_niches: niches,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    if (updateError) {
      throw updateError;
    }

    return res.json({
      success: true,
      message: 'Validação do nicho atualizada',
      data: {
        niche: niches[idx],
        niche_index: idx
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em PUT /campaign/:campaignId/niches/:nicheIndex/validate:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/hashtag-intelligence/campaign/:campaignId/niches/:nicheIndex/clustering
 * Atualiza o resultado do clustering de um nicho
 */
router.put('/campaign/:campaignId/niches/:nicheIndex/clustering', async (req, res) => {
  try {
    const { campaignId, nicheIndex } = req.params;
    const { clustering_result } = req.body;
    const idx = parseInt(nicheIndex);

    console.log(`\n📊 [API] Atualizando clustering do nicho ${idx} na campanha ${campaignId}`);

    // Buscar nichos atuais
    const { data: campaign, error: fetchError } = await supabase
      .from('cluster_campaigns')
      .select('suggested_niches')
      .eq('id', campaignId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    const niches = campaign.suggested_niches || [];
    if (idx < 0 || idx >= niches.length) {
      return res.status(400).json({
        success: false,
        message: 'Índice de nicho inválido'
      });
    }

    // Atualizar nicho
    niches[idx] = {
      ...niches[idx],
      clustering_result,
      clustered_at: new Date().toISOString()
    };

    // Salvar
    const { error: updateError } = await supabase
      .from('cluster_campaigns')
      .update({
        suggested_niches: niches,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    if (updateError) {
      throw updateError;
    }

    return res.json({
      success: true,
      message: 'Clustering do nicho atualizado',
      data: {
        niche: niches[idx],
        niche_index: idx
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em PUT /campaign/:campaignId/niches/:nicheIndex/clustering:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/hashtag-intelligence/campaign/:campaignId/niches/:nicheIndex/activate
 * Define um nicho como ativo e sincroniza com campos principais da campanha
 */
router.put('/campaign/:campaignId/niches/:nicheIndex/activate', async (req, res) => {
  try {
    const { campaignId, nicheIndex } = req.params;
    const idx = parseInt(nicheIndex);

    console.log(`\n📊 [API] Ativando nicho ${idx} na campanha ${campaignId}`);

    // Buscar nichos atuais
    const { data: campaign, error: fetchError } = await supabase
      .from('cluster_campaigns')
      .select('suggested_niches')
      .eq('id', campaignId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    const niches = campaign.suggested_niches || [];
    if (idx < 0 || idx >= niches.length) {
      return res.status(400).json({
        success: false,
        message: 'Índice de nicho inválido'
      });
    }

    const activeNiche = niches[idx];

    // Atualizar campanha com nicho ativo
    const { error: updateError } = await supabase
      .from('cluster_campaigns')
      .update({
        active_niche_index: idx,
        nicho_principal: activeNiche.name,
        nicho: activeNiche.name,
        keywords: activeNiche.seeds,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    if (updateError) {
      throw updateError;
    }

    return res.json({
      success: true,
      message: `Nicho "${activeNiche.name}" ativado com sucesso`,
      data: {
        active_niche: activeNiche,
        active_index: idx
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em PUT /campaign/:campaignId/niches/:nicheIndex/activate:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/hashtag-intelligence/campaign/:campaignId/niches/:nicheIndex
 * Remove um nicho sugerido da campanha
 */
router.delete('/campaign/:campaignId/niches/:nicheIndex', async (req, res) => {
  try {
    const { campaignId, nicheIndex } = req.params;
    const idx = parseInt(nicheIndex);

    console.log(`\n📊 [API] Removendo nicho ${idx} da campanha ${campaignId}`);

    // Buscar nichos atuais
    const { data: campaign, error: fetchError } = await supabase
      .from('cluster_campaigns')
      .select('suggested_niches, active_niche_index')
      .eq('id', campaignId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campanha não encontrada'
      });
    }

    const niches = campaign.suggested_niches || [];
    if (idx < 0 || idx >= niches.length) {
      return res.status(400).json({
        success: false,
        message: 'Índice de nicho inválido'
      });
    }

    // Verificar se o nicho está em uso (tem leads capturados)
    if (niches[idx].clustering_result && niches[idx].clustering_result.total_leads > 0) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível remover um nicho com leads capturados'
      });
    }

    // Remover nicho
    const removedNiche = niches.splice(idx, 1)[0];

    // Ajustar active_niche_index se necessário
    let newActiveIndex = campaign.active_niche_index || 0;
    if (idx < newActiveIndex) {
      newActiveIndex--;
    } else if (idx === newActiveIndex && niches.length > 0) {
      newActiveIndex = Math.min(newActiveIndex, niches.length - 1);
    } else if (niches.length === 0) {
      newActiveIndex = 0;
    }

    // Salvar
    const { error: updateError } = await supabase
      .from('cluster_campaigns')
      .update({
        suggested_niches: niches,
        active_niche_index: newActiveIndex,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    if (updateError) {
      throw updateError;
    }

    return res.json({
      success: true,
      message: `Nicho "${removedNiche.name}" removido com sucesso`,
      data: {
        removed_niche: removedNiche,
        remaining_niches: niches.length
      }
    });
  } catch (error: any) {
    console.error('❌ Erro em DELETE /campaign/:campaignId/niches/:nicheIndex:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/daily-scraping-stats
 * Retorna estatísticas diárias de scraping (novos vs atualizados) desde uma data
 */
router.get('/daily-scraping-stats', async (req, res) => {
  try {
    // Default: 90 dias atrás
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() - 90);
    const startDate = req.query.start_date as string || defaultDate.toISOString().split('T')[0];

    console.log(`\n📊 [API] Buscando estatísticas diárias de scraping desde ${startDate}`);

    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH
        -- Novos perfis: agrupados pela data de captura
        novos_por_dia AS (
          SELECT
            DATE(captured_at) as date,
            COUNT(*) as novos
          FROM instagram_leads
          WHERE captured_at >= '${startDate}'::date
          GROUP BY DATE(captured_at)
        ),
        -- Atualizações: agrupadas pela data de updated_at (quando foi atualizado)
        -- Nota: só considera atualizações a partir de 03/12/2025 (data que começou tracking real)
        -- Perfil só conta como "atualizado" se a DATA de update for diferente da DATA de captura
        atualizados_por_dia AS (
          SELECT
            DATE(updated_at) as date,
            COUNT(*) as atualizados
          FROM instagram_leads
          WHERE updated_at >= '${startDate}'::date
            AND DATE(updated_at) > DATE(captured_at)  -- só conta se atualizado em dia diferente
            AND DATE(updated_at) >= '2025-12-03'  -- ignora atualizações antes do tracking real
          GROUP BY DATE(updated_at)
        ),
        -- Combina as duas métricas
        all_dates AS (
          SELECT date FROM novos_por_dia
          UNION
          SELECT date FROM atualizados_por_dia
        )
        SELECT
          ad.date,
          COALESCE(n.novos, 0) as novos,
          COALESCE(a.atualizados, 0) as atualizados
        FROM all_dates ad
        LEFT JOIN novos_por_dia n ON n.date = ad.date
        LEFT JOIN atualizados_por_dia a ON a.date = ad.date
        WHERE ad.date IS NOT NULL
        ORDER BY ad.date ASC
      `
    });

    if (error) throw error;

    return res.json({
      success: true,
      start_date: startDate,
      data: data || []
    });
  } catch (error: any) {
    console.error('❌ Erro em /daily-scraping-stats:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/daily-metrics-evolution
 * Lê métricas pré-calculadas da tabela instagram_daily_metrics
 */
router.get('/daily-metrics-evolution', async (req, res) => {
  try {
    console.log(`\n📊 [API] Buscando métricas diárias pré-calculadas`);

    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        SELECT
          metric_date as date,
          total_leads,
          leads_with_contact,
          total_hashtags,
          hashtags_with_contact,
          scraped_new,
          scraped_updated
        FROM instagram_daily_metrics
        WHERE metric_date >= CURRENT_DATE - INTERVAL '89 days'
        ORDER BY metric_date ASC
      `
    });

    if (error) throw error;

    return res.json({
      success: true,
      data: data || []
    });
  } catch (error: any) {
    console.error('❌ Erro em /daily-metrics-evolution:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/calculate-daily-metrics
 * Calcula e armazena métricas para uma data específica (ou hoje)
 * - Usado pelo cron a cada 5 minutos para atualizar o dia atual
 * - Usado para backfill de datas históricas
 */
router.post('/calculate-daily-metrics', async (req, res) => {
  try {
    const targetDate = req.body.date || new Date().toISOString().split('T')[0];
    console.log(`\n📊 [API] Calculando métricas para ${targetDate}`);

    // Tabela instagram_daily_metrics criada via migration (scripts/migration-instagram-daily-metrics.sql)

    // Calcular métricas para a data específica
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH
        -- Leads válidos (45d window a partir da data alvo)
        leads_valid AS (
          SELECT
            id,
            email,
            phone,
            additional_emails,
            additional_phones,
            hashtags_bio,
            hashtags_posts
          FROM instagram_leads
          WHERE captured_at <= '${targetDate}'::date
            AND (
              captured_at >= '${targetDate}'::date - INTERVAL '44 days'
              OR updated_at >= '${targetDate}'::date - INTERVAL '44 days'
            )
        ),
        lead_counts AS (
          SELECT
            COUNT(*) as total_leads,
            COUNT(*) FILTER (WHERE
              email IS NOT NULL
              OR phone IS NOT NULL
              OR (additional_emails IS NOT NULL AND jsonb_array_length(additional_emails) > 0)
              OR (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0)
            ) as leads_with_contact
          FROM leads_valid
        ),
        -- Leads para hashtags (90d window)
        leads_for_hashtags AS (
          SELECT
            id,
            email,
            phone,
            additional_emails,
            additional_phones,
            hashtags_bio,
            hashtags_posts
          FROM instagram_leads
          WHERE captured_at <= '${targetDate}'::date
            AND (
              captured_at >= '${targetDate}'::date - INTERVAL '89 days'
              OR updated_at >= '${targetDate}'::date - INTERVAL '89 days'
            )
        ),
        hashtag_counts AS (
          SELECT
            COUNT(DISTINCT LOWER(h.hashtag)) as total_hashtags,
            COUNT(DISTINCT LOWER(h.hashtag)) FILTER (WHERE
              l.email IS NOT NULL
              OR l.phone IS NOT NULL
              OR (l.additional_emails IS NOT NULL AND jsonb_array_length(l.additional_emails) > 0)
              OR (l.additional_phones IS NOT NULL AND jsonb_array_length(l.additional_phones) > 0)
            ) as hashtags_with_contact
          FROM leads_for_hashtags l,
          LATERAL (
            SELECT jsonb_array_elements_text(l.hashtags_bio) as hashtag
            WHERE l.hashtags_bio IS NOT NULL AND jsonb_array_length(l.hashtags_bio) > 0
            UNION ALL
            SELECT jsonb_array_elements_text(l.hashtags_posts) as hashtag
            WHERE l.hashtags_posts IS NOT NULL AND jsonb_array_length(l.hashtags_posts) > 0
          ) h
          WHERE h.hashtag IS NOT NULL AND h.hashtag != ''
        ),
        -- Scraping do dia
        scraping_stats AS (
          SELECT
            COUNT(*) FILTER (WHERE DATE(captured_at) = '${targetDate}'::date) as scraped_new,
            COUNT(*) FILTER (WHERE DATE(updated_at) = '${targetDate}'::date AND updated_at > captured_at) as scraped_updated
          FROM instagram_leads
          WHERE DATE(captured_at) = '${targetDate}'::date
             OR (DATE(updated_at) = '${targetDate}'::date AND updated_at > captured_at)
        )
        SELECT
          lc.total_leads,
          lc.leads_with_contact,
          hc.total_hashtags,
          hc.hashtags_with_contact,
          ss.scraped_new,
          ss.scraped_updated
        FROM lead_counts lc, hashtag_counts hc, scraping_stats ss
      `
    });

    if (error) throw error;

    const metrics = data && data[0] ? data[0] : {
      total_leads: 0,
      leads_with_contact: 0,
      total_hashtags: 0,
      hashtags_with_contact: 0,
      scraped_new: 0,
      scraped_updated: 0
    };

    // Usar RPC para upsert (SECURITY DEFINER garante permissões)
    const { error: upsertError } = await supabase.rpc('upsert_daily_metrics', {
      p_metric_date: targetDate,
      p_total_leads: metrics.total_leads || 0,
      p_leads_with_contact: metrics.leads_with_contact || 0,
      p_total_hashtags: metrics.total_hashtags || 0,
      p_hashtags_with_contact: metrics.hashtags_with_contact || 0,
      p_scraped_new: metrics.scraped_new || 0,
      p_scraped_updated: metrics.scraped_updated || 0
    });

    if (upsertError) throw upsertError;

    console.log(`✅ Métricas salvas para ${targetDate}:`, metrics);

    return res.json({
      success: true,
      date: targetDate,
      metrics
    });
  } catch (error: any) {
    console.error('❌ Erro ao calcular métricas:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/backfill-daily-metrics
 * Preenche métricas históricas para os últimos N dias
 */
router.post('/backfill-daily-metrics', async (req, res) => {
  try {
    const days = parseInt(req.body.days) || 90;
    console.log(`\n📊 [API] Iniciando backfill de ${days} dias de métricas`);

    const results: any[] = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      try {
        // Chamar o endpoint de cálculo para cada data
        const calcResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/hashtag-intelligence/calculate-daily-metrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateStr })
        });
        const calcResult = await calcResponse.json() as { success: boolean };
        results.push({ date: dateStr, success: calcResult.success });
        console.log(`  ✓ ${dateStr} processado`);
      } catch (err: any) {
        results.push({ date: dateStr, success: false, error: err.message });
        console.log(`  ✗ ${dateStr} falhou: ${err.message}`);
      }
    }

    return res.json({
      success: true,
      processed: results.length,
      results
    });
  } catch (error: any) {
    console.error('❌ Erro no backfill:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/hashtag-intelligence/aggregated-metrics-90d
 * Retorna métricas agregadas considerando apenas perfis dos últimos 90 dias
 * - Total de leads vs leads com contato
 * - Total de hashtags únicas vs hashtags com contato
 */
router.get('/aggregated-metrics-90d', async (req, res) => {
  try {
    const daysBack = parseInt(req.query.days as string) || 90;

    console.log(`\n📊 [API] Buscando métricas agregadas dos últimos ${daysBack} dias`);

    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH leads_recent AS (
          SELECT
            id,
            hashtags_bio,
            hashtags_posts,
            CASE
              WHEN email IS NOT NULL
                OR phone IS NOT NULL
                OR (additional_emails IS NOT NULL AND jsonb_array_length(additional_emails) > 0)
                OR (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0)
              THEN true
              ELSE false
            END as has_contact
          FROM instagram_leads
          WHERE captured_at >= CURRENT_DATE - INTERVAL '${daysBack} days'
        ),
        lead_metrics AS (
          SELECT
            COUNT(*) as total_leads,
            COUNT(*) FILTER (WHERE has_contact = true) as leads_with_contact
          FROM leads_recent
        ),
        hashtags_all AS (
          SELECT DISTINCT
            LOWER(TRANSLATE(
              hashtag,
              'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
              'aaaaaeeeeiiiioooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
            )) as hashtag_clean,
            l.id as lead_id,
            l.has_contact
          FROM leads_recent l,
            LATERAL (
              SELECT jsonb_array_elements_text(l.hashtags_bio) as hashtag
              WHERE l.hashtags_bio IS NOT NULL AND jsonb_array_length(l.hashtags_bio) > 0
              UNION ALL
              SELECT jsonb_array_elements_text(l.hashtags_posts) as hashtag
              WHERE l.hashtags_posts IS NOT NULL AND jsonb_array_length(l.hashtags_posts) > 0
            ) h
          WHERE hashtag IS NOT NULL AND hashtag != ''
        ),
        hashtag_metrics AS (
          SELECT
            COUNT(DISTINCT hashtag_clean) as total_hashtags,
            COUNT(DISTINCT hashtag_clean) FILTER (WHERE has_contact = true) as hashtags_with_contact
          FROM hashtags_all
        )
        SELECT
          lm.total_leads,
          lm.leads_with_contact,
          hm.total_hashtags,
          hm.hashtags_with_contact,
          ${daysBack} as days_period
        FROM lead_metrics lm, hashtag_metrics hm
      `
    });

    if (error) throw error;

    const metrics = data && data.length > 0 ? data[0] : {
      total_leads: 0,
      leads_with_contact: 0,
      total_hashtags: 0,
      hashtags_with_contact: 0,
      days_period: daysBack
    };

    return res.json({
      success: true,
      data: metrics
    });
  } catch (error: any) {
    console.error('❌ Erro em /aggregated-metrics-90d:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================
// GERADOR DE SEEDS COM IA
// ============================================

/**
 * POST /api/hashtag-intelligence/generate-seeds
 * Gera seeds otimizadas para clustering usando IA
 *
 * Body:
 * {
 *   "service_description": "Clínica de estética facial especializada em harmonização",
 *   "target_audience": "Mulheres 25-45 anos, classe média-alta",
 *   "location": "São Paulo", // opcional
 *   "objective": "prospecção" // opcional: prospecção, parceria, influenciadores
 * }
 */
router.post('/generate-seeds', async (req, res) => {
  try {
    const {
      service_description,
      target_audience,
      location,
      objective = 'prospecção'
    } = req.body;

    if (!service_description || !target_audience) {
      return res.status(400).json({
        success: false,
        message: 'Campos "service_description" e "target_audience" são obrigatórios'
      });
    }

    console.log('\n🎯 [API] POST /generate-seeds');
    console.log(`   📝 Serviço: ${service_description.substring(0, 50)}...`);
    console.log(`   👥 Público: ${target_audience.substring(0, 50)}...`);
    if (location) console.log(`   📍 Local: ${location}`);

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `Você é um especialista em marketing digital e prospecção de leads no Instagram.

Dado o seguinte contexto de negócio, gere EXATAMENTE 5 seeds (termos de busca) otimizadas para encontrar leads qualificados no Instagram.

## CONTEXTO DO NEGÓCIO:
- **Serviço/Produto:** ${service_description}
- **Público-alvo:** ${target_audience}
${location ? `- **Localização:** ${location}` : ''}
- **Objetivo:** ${objective}

## REGRAS PARA AS SEEDS:
1. Use termos que aparecem em bios e hashtags do Instagram
2. Inclua variações (ex: "nutricionista" e "nutri")
3. Misture termos de profissão, serviço e qualificadores
4. Evite termos muito genéricos (ex: "saúde", "beleza")
5. Prefira termos em português brasileiro
6. Cada seed deve ter 1-3 palavras no máximo

## FORMATO DE RESPOSTA:
Retorne APENAS um JSON válido no formato:
{
  "seeds": ["seed1", "seed2", "seed3", "seed4", "seed5"],
  "explanation": "Breve explicação de 1 linha sobre a estratégia"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Você retorna apenas JSON válido, sem markdown ou explicações extras.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    const responseText = completion.choices[0]?.message?.content || '{}';

    // Limpar possíveis marcadores de código
    const cleanJson = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let result;
    try {
      result = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('❌ Erro ao parsear resposta da IA:', responseText);
      return res.status(500).json({
        success: false,
        message: 'Erro ao processar resposta da IA'
      });
    }

    console.log(`   ✅ Seeds geradas: [${result.seeds?.join(', ')}]`);

    return res.json({
      success: true,
      data: {
        seeds: result.seeds || [],
        explanation: result.explanation || '',
        input: {
          service_description,
          target_audience,
          location,
          objective
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Erro em /generate-seeds:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/suggest-seeds
 * Sugere seeds para campanha baseado em análise de hashtags
 *
 * Body: { campaign_description: string }
 *
 * Metodologia:
 * 1. GPT normaliza descrição → hashtags
 * 2. Verifica quais existem no banco com freq >= 20
 * 3. Busca hashtags similares por embedding
 * 4. V11.1: Retorna TODAS as seeds que passam no filtro de similaridade
 *    (sem limite artificial - a similaridade define naturalmente)
 */
router.post('/suggest-seeds', async (req, res) => {
  try {
    const { campaign_description } = req.body;

    if (!campaign_description) {
      return res.status(400).json({
        success: false,
        message: 'campaign_description é obrigatório'
      });
    }

    console.log('\n🌱 [API] POST /suggest-seeds');
    console.log(`   📝 Descrição: ${campaign_description.substring(0, 100)}...`);

    const result = await suggestSeeds(campaign_description);

    return res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('❌ Erro em /suggest-seeds:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/validate-seeds
 * Valida se seeds existem no banco com frequência adequada
 *
 * Body: { seeds: string[] }
 */
router.post('/validate-seeds', async (req, res) => {
  try {
    const { seeds } = req.body;

    if (!seeds || !Array.isArray(seeds)) {
      return res.status(400).json({
        success: false,
        message: 'seeds deve ser um array de strings'
      });
    }

    console.log('\n✅ [API] POST /validate-seeds');
    console.log(`   🌱 Validando ${seeds.length} seeds...`);

    const result = await validateSeeds(seeds);

    return res.json({
      success: true,
      data: {
        total: seeds.length,
        valid_count: result.valid.length,
        invalid_count: result.invalid.length,
        valid: result.valid,
        invalid: result.invalid,
        frequencies: result.frequencies
      }
    });

  } catch (error: any) {
    console.error('❌ Erro em /validate-seeds:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/extract-from-docs
 * Extrai Nicho, Público Alvo e Descrição dos documentos da campanha
 *
 * Body: { campaign_id: string }
 *
 * Resposta:
 * {
 *   success: true,
 *   data: {
 *     nicho: "string",
 *     publicoAlvo: "string",
 *     descricaoServico: "string"
 *   }
 * }
 */
router.post('/extract-from-docs', async (req, res) => {
  try {
    const { campaign_id } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id é obrigatório'
      });
    }

    console.log('\n📄 [API] POST /extract-from-docs');
    console.log(`   📋 Campaign ID: ${campaign_id}`);

    const { campaignDocumentProcessor } = await import('../services/campaign-document-processor.service');
    const result = await campaignDocumentProcessor.extractCampaignFields(campaign_id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Erro ao extrair campos dos documentos'
      });
    }

    return res.json({
      success: true,
      data: {
        nicho: result.nicho,
        publicoAlvo: result.publicoAlvo,
        descricaoServico: result.descricaoServico
      }
    });

  } catch (error: any) {
    console.error('❌ Erro em /extract-from-docs:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/save-search-terms
 * Salva as hashtags sugeridas para scraping na tabela lead_search_terms
 */
router.post('/save-search-terms', async (req, res) => {
  try {
    const { campaign_name, client_name, nicho_alvo, hashtags } = req.body;

    // Validações
    if (!campaign_name || !client_name || !nicho_alvo) {
      return res.status(400).json({
        success: false,
        message: 'campaign_name, client_name e nicho_alvo são obrigatórios'
      });
    }

    if (!hashtags || !Array.isArray(hashtags) || hashtags.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'hashtags deve ser um array não vazio'
      });
    }

    console.log('\n💾 [API] POST /save-search-terms');
    console.log(`   📋 Campanha: ${campaign_name}`);
    console.log(`   👤 Cliente: ${client_name}`);
    console.log(`   🎯 Nicho: ${nicho_alvo}`);
    console.log(`   #️⃣ Hashtags: ${hashtags.length}`);

    // Formatar data para target_segment (dd-mm-hh:mm)
    const now = new Date();
    const dateStr = now.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(',', '').replace(' ', '-');

    const targetSegment = `${campaign_name} ${dateStr}`;

    // Normalizar hashtags primeiro
    const normalizedHashtags = hashtags.map((tag: string) =>
      tag.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
    );

    // Humanizar via GPT (batch para eficiência)
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    console.log('   🤖 Humanizando hashtags via GPT...');
    const humanizePrompt = `Converta cada hashtag abaixo em texto legível em português (com espaços e acentos corretos).
Retorne APENAS um JSON array com os textos humanizados, na mesma ordem.

Hashtags:
${normalizedHashtags.map((h, i) => `${i + 1}. ${h}`).join('\n')}

Exemplo de conversão:
- gestaodeleads → gestão de leads
- marketingdigital → marketing digital
- inteligenciaartificial → inteligência artificial

Retorne apenas o JSON array, sem markdown:`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: humanizePrompt }],
      temperature: 0.1
    });

    let humanizedTerms: string[] = [];
    try {
      const responseText = completion.choices[0].message.content.trim();
      humanizedTerms = JSON.parse(responseText);
    } catch (parseError) {
      console.warn('   ⚠️ Erro ao parsear resposta GPT, usando hashtags originais');
      humanizedTerms = normalizedHashtags;
    }

    // Montar search_terms com termo humanizado e hashtag normalizada
    const searchTerms = normalizedHashtags.map((hashtag, i) => ({
      termo: humanizedTerms[i] || hashtag,
      hashtag: hashtag
    }));

    // Inserir na tabela lead_search_terms usando insert direto do Supabase
    // Nota: terms_count é coluna gerada automaticamente (jsonb_array_length)
    const { data, error } = await supabase
      .from('lead_search_terms')
      .insert({
        target_segment: targetSegment,
        categoria_geral: nicho_alvo,
        area_especifica: client_name,
        search_terms: searchTerms,
        generated_at: new Date().toISOString(),
        generated_by_model: 'gpt-4o-mini'
      })
      .select('id, target_segment, terms_count, generated_at')
      .single();

    if (error) {
      console.error('❌ Erro ao salvar search terms:', error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    console.log('✅ Search terms salvos com sucesso:', data);

    return res.json({
      success: true,
      data: data,
      message: `${searchTerms.length} hashtags salvas com sucesso`
    });

  } catch (error: any) {
    console.error('❌ Erro em /save-search-terms:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/update-campaign-seeds
 * Atualiza as seeds/keywords de uma campanha
 */
router.post('/update-campaign-seeds', async (req, res) => {
  try {
    const { campaign_id, seeds } = req.body;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: 'campaign_id é obrigatório'
      });
    }

    if (!seeds || !Array.isArray(seeds)) {
      return res.status(400).json({
        success: false,
        message: 'seeds deve ser um array'
      });
    }

    console.log('\n🌱 [API] POST /update-campaign-seeds');
    console.log(`   📋 Campanha: ${campaign_id}`);
    console.log(`   #️⃣ Seeds: ${seeds.length}`);

    // Atualizar campanha com as novas seeds
    const { error } = await supabase
      .from('cluster_campaigns')
      .update({
        keywords: seeds,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaign_id);

    if (error) {
      throw new Error(`Erro ao atualizar seeds: ${error.message}`);
    }

    console.log('   ✅ Seeds atualizadas com sucesso');

    return res.json({
      success: true,
      message: 'Seeds atualizadas com sucesso',
      data: {
        campaign_id,
        seeds_count: seeds.length
      }
    });

  } catch (error: any) {
    console.error('❌ Erro em /update-campaign-seeds:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/prefilter-leads
 *
 * Pré-filtra leads de um nicho usando IA (GPT-4o-mini).
 * Analisa a bio de cada lead e classifica como POTENCIAL ou NÃO POTENCIAL
 * baseado no contexto específico da campanha.
 *
 * Body:
 * {
 *   hashtags: string[],           // Hashtags do nicho selecionadas
 *   campaign_target: string,      // "Agências de marketing digital"
 *   campaign_description?: string, // "Vender plataforma AIC de prospecção"
 *   ideal_customer?: string,      // "Agências que fazem tráfego pago para clientes"
 *   exclude_types?: string[],     // ["dentistas", "restaurantes", "lojas"]
 *   limit?: number,               // Limite de leads (default: sem limite)
 *   campaign_id?: string          // ID da campanha para salvar resultado
 * }
 */
router.post('/prefilter-leads', async (req, res) => {
  try {
    const {
      hashtags,
      campaign_target,
      campaign_description,
      ideal_customer,
      exclude_types,
      limit,
      campaign_id
    } = req.body;

    // Validação
    if (!hashtags || !Array.isArray(hashtags) || hashtags.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetro "hashtags" é obrigatório (array de strings)'
      });
    }

    if (!campaign_target || typeof campaign_target !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Parâmetro "campaign_target" é obrigatório'
      });
    }

    console.log(`\n🎯 [API] POST /prefilter-leads`);
    console.log(`📌 Target: ${campaign_target}`);
    console.log(`#️⃣ Hashtags: ${hashtags.length}`);

    // Construir contexto do pré-filtro
    const context: PreFilterContext = {
      campaign_target,
      campaign_description,
      ideal_customer,
      exclude_types
    };

    // Buscar leads do nicho
    const leads = await leadPreFilterService.getLeadsFromNiche(hashtags, limit);

    if (leads.length === 0) {
      return res.json({
        success: true,
        data: {
          total_leads: 0,
          potential_leads: 0,
          filtered_out_leads: 0,
          filter_rate: 0,
          leads: [],
          processing_time_ms: 0,
          tokens_used: 0,
          estimated_cost_usd: 0
        },
        message: 'Nenhum lead encontrado para as hashtags selecionadas'
      });
    }

    // Aplicar pré-filtro IA
    const result = await leadPreFilterService.filterLeads(leads, context);

    // Salvar resultado se campaign_id foi fornecido
    if (campaign_id) {
      await leadPreFilterService.savePreFilterResult(campaign_id, result, context);
    }

    return res.json({
      success: true,
      data: {
        total_leads: result.total_leads,
        potential_leads: result.potential_leads,
        filtered_out_leads: result.filtered_out_leads,
        filter_rate: Math.round(result.filter_rate * 10) / 10,
        processing_time_ms: result.processing_time_ms,
        tokens_used: result.tokens_used,
        estimated_cost_usd: Math.round(result.estimated_cost_usd * 10000) / 10000,
        // Retornar apenas leads potenciais com resumo
        leads: result.leads.filter(l => l.is_potential).map(l => ({
          id: l.id,
          username: l.username,
          bio: l.bio?.substring(0, 200) + (l.bio && l.bio.length > 200 ? '...' : ''),
          business_category: l.business_category,
          filter_reason: l.filter_reason,
          confidence: l.confidence,
          whatsapp_number: l.whatsapp_number ? 'Sim' : 'Não'
        })),
        // Stats dos filtrados
        filtered_out_summary: result.leads
          .filter(l => !l.is_potential)
          .reduce((acc, l) => {
            const reason = l.filter_reason || 'Outro';
            acc[reason] = (acc[reason] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
      },
      message: `Pré-filtro aplicado: ${result.potential_leads} leads potenciais de ${result.total_leads} (${Math.round(result.filter_rate)}%)`
    });

  } catch (error: any) {
    console.error('❌ Erro em /prefilter-leads:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/hashtag-intelligence/prefilter-leads-direct
 *
 * Versão direta do pré-filtro - recebe leads já carregados.
 * Útil para integração com outros endpoints que já têm os leads.
 *
 * Body:
 * {
 *   leads: LeadToFilter[],        // Array de leads com id, username, bio, business_category
 *   campaign_target: string,      // "Agências de marketing digital"
 *   campaign_description?: string,
 *   ideal_customer?: string,
 *   exclude_types?: string[]
 * }
 */
router.post('/prefilter-leads-direct', async (req, res) => {
  try {
    const {
      leads,
      campaign_target,
      campaign_description,
      ideal_customer,
      exclude_types
    } = req.body;

    // Validação
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetro "leads" é obrigatório (array de objetos com id, username, bio)'
      });
    }

    if (!campaign_target) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetro "campaign_target" é obrigatório'
      });
    }

    console.log(`\n🎯 [API] POST /prefilter-leads-direct`);
    console.log(`📌 Target: ${campaign_target}`);
    console.log(`👥 Leads: ${leads.length}`);

    const context: PreFilterContext = {
      campaign_target,
      campaign_description,
      ideal_customer,
      exclude_types
    };

    const result = await leadPreFilterService.filterLeads(leads, context);

    return res.json({
      success: true,
      data: result,
      message: `Pré-filtro aplicado: ${result.potential_leads} leads potenciais de ${result.total_leads}`
    });

  } catch (error: any) {
    console.error('❌ Erro em /prefilter-leads-direct:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
