/**
 * MARKET TRENDS SERVICE
 *
 * Descoberta dinâmica de demandas de mercado.
 * Analisa a base de leads para identificar o que o mercado está procurando.
 *
 * Abordagem:
 * 1. Extrai sinais de demanda das bios (palavras-chave que indicam problemas/desejos)
 * 2. Agrupa por categoria semântica
 * 3. Rankeia por frequência
 * 4. Identifica tendências emergentes (comparando períodos)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Dicionário de sinais de demanda organizados por categoria
const DEMAND_SIGNALS: Record<string, { keywords: string[]; description: string }> = {
  // Saúde & Bem-estar
  'emagrecimento': {
    keywords: ['emagrecer', 'emagrecimento', 'perder peso', 'perda de peso', 'dieta', 'secar', 'definição', 'gordura', 'obesidade', 'sobrepeso'],
    description: 'Perda de peso e emagrecimento'
  },
  'saude_mental': {
    keywords: ['ansiedade', 'depressão', 'estresse', 'stress', 'burnout', 'saúde mental', 'bem-estar emocional', 'equilíbrio', 'mindfulness', 'terapia', 'psicólogo', 'autoconhecimento'],
    description: 'Saúde mental e bem-estar emocional'
  },
  'dor_cronica': {
    keywords: ['dor', 'dores', 'coluna', 'lombar', 'cervical', 'articulação', 'fibromialgia', 'enxaqueca', 'cefaleia'],
    description: 'Tratamento de dores e desconfortos'
  },
  'sono': {
    keywords: ['insônia', 'dormir', 'sono', 'descanso', 'qualidade do sono'],
    description: 'Problemas de sono e descanso'
  },

  // Fitness & Performance
  'hipertrofia': {
    keywords: ['hipertrofia', 'massa muscular', 'ganho de massa', 'musculação', 'academia', 'treino', 'bodybuilding'],
    description: 'Ganho de massa muscular'
  },
  'performance': {
    keywords: ['performance', 'desempenho', 'atleta', 'esporte', 'rendimento', 'alta performance'],
    description: 'Performance atlética e esportiva'
  },
  'energia': {
    keywords: ['energia', 'disposição', 'cansaço', 'fadiga', 'vitalidade', 'ânimo'],
    description: 'Mais energia e disposição'
  },

  // Beleza & Estética
  'autoestima': {
    keywords: ['autoestima', 'confiança', 'amor próprio', 'autoimagem', 'se sentir bem'],
    description: 'Autoestima e confiança'
  },
  'pele': {
    keywords: ['pele', 'acne', 'manchas', 'rugas', 'envelhecimento', 'rejuvenescimento', 'skincare', 'dermatologia'],
    description: 'Cuidados com a pele'
  },
  'cabelo': {
    keywords: ['cabelo', 'queda de cabelo', 'calvície', 'capilar', 'crescimento capilar'],
    description: 'Saúde capilar'
  },

  // Negócios & Carreira
  'vendas': {
    keywords: ['vendas', 'vender', 'faturamento', 'receita', 'lucro', 'mais clientes', 'captação', 'prospecção'],
    description: 'Aumentar vendas e faturamento'
  },
  'marketing': {
    keywords: ['marketing', 'marketing digital', 'tráfego', 'leads', 'redes sociais', 'instagram', 'engajamento', 'seguidores', 'visibilidade'],
    description: 'Marketing e presença digital'
  },
  'empreendedorismo': {
    keywords: ['empreender', 'empreendedorismo', 'negócio próprio', 'startup', 'empresa', 'empresário'],
    description: 'Empreendedorismo e negócios'
  },
  'carreira': {
    keywords: ['carreira', 'emprego', 'recolocação', 'promoção', 'crescimento profissional', 'trabalho'],
    description: 'Desenvolvimento de carreira'
  },

  // Produtividade & Organização
  'produtividade': {
    keywords: ['produtividade', 'produtivo', 'organização', 'gestão de tempo', 'foco', 'disciplina', 'rotina'],
    description: 'Produtividade e organização'
  },
  'financeiro': {
    keywords: ['financeiro', 'finanças', 'dívidas', 'investimento', 'renda extra', 'independência financeira', 'dinheiro', 'economizar'],
    description: 'Organização financeira'
  },

  // Relacionamentos
  'relacionamento': {
    keywords: ['relacionamento', 'casal', 'casamento', 'namoro', 'amor', 'vida amorosa', 'término', 'separação'],
    description: 'Relacionamentos amorosos'
  },
  'familia': {
    keywords: ['família', 'filhos', 'maternidade', 'paternidade', 'criação', 'educação infantil'],
    description: 'Família e parentalidade'
  },

  // Educação & Desenvolvimento
  'aprendizado': {
    keywords: ['aprender', 'curso', 'certificação', 'capacitação', 'conhecimento', 'estudar', 'formação'],
    description: 'Aprendizado e capacitação'
  },
  'idiomas': {
    keywords: ['inglês', 'espanhol', 'idioma', 'fluência', 'língua estrangeira'],
    description: 'Aprender idiomas'
  },
};

export interface DemandTrend {
  category: string;
  description: string;
  count: number;
  percentage: number;
  sample_keywords: string[];
  top_niches: { niche: string; count: number }[];
  trend: 'rising' | 'stable' | 'declining' | 'new';
}

export interface MarketTrendsResult {
  analyzed_at: string;
  total_leads_analyzed: number;
  leads_with_signals: number;
  coverage_percentage: number;
  trends: DemandTrend[];
  emerging_keywords: { keyword: string; count: number }[];
  top_niches_by_demand: { niche: string; demands: string[] }[];
}

/**
 * Descobre tendências de demanda do mercado analisando bios dos leads
 */
export async function discoverMarketTrends(
  options: {
    daysBack?: number;
    minCount?: number;
    businessCategory?: string;
  } = {}
): Promise<MarketTrendsResult> {
  const { daysBack = 45, minCount = 50, businessCategory } = options;

  // Buscar leads com bio
  let query = supabase
    .from('instagram_leads')
    .select('id, bio, business_category, hashtags_bio')
    .not('bio', 'is', null)
    .gte('updated_at', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());

  if (businessCategory) {
    query = query.eq('business_category', businessCategory);
  }

  const { data: leads, error } = await query.limit(50000);

  if (error) {
    throw new Error(`Erro ao buscar leads: ${error.message}`);
  }

  if (!leads || leads.length === 0) {
    throw new Error('Nenhum lead encontrado para análise');
  }

  // Contadores
  const demandCounts = new Map<string, {
    count: number;
    keywords: Map<string, number>;
    niches: Map<string, number>;
  }>();

  // Inicializar contadores
  for (const [category] of Object.entries(DEMAND_SIGNALS)) {
    demandCounts.set(category, {
      count: 0,
      keywords: new Map(),
      niches: new Map(),
    });
  }

  // Contador de palavras emergentes (não categorizadas)
  const emergingKeywords = new Map<string, number>();
  const demandPatterns = [
    /precis[oa]?\s+de?\s+(\w+)/gi,
    /quer[oe]?\s+(\w+)/gi,
    /busc[oa]?\s+(\w+)/gi,
    /ajud[oa]?\s+(?:a|com)\s+(\w+)/gi,
    /problem[aa]?\s+(?:com|de)\s+(\w+)/gi,
    /dificuldade\s+(?:com|de|em|para)\s+(\w+)/gi,
  ];

  let leadsWithSignals = 0;

  // Analisar cada lead
  for (const lead of leads) {
    const bio = (lead.bio || '').toLowerCase();
    let hasSignal = false;

    // Verificar cada categoria de demanda
    for (const [category, config] of Object.entries(DEMAND_SIGNALS)) {
      const stats = demandCounts.get(category)!;

      for (const keyword of config.keywords) {
        if (bio.includes(keyword.toLowerCase())) {
          stats.count++;
          stats.keywords.set(keyword, (stats.keywords.get(keyword) || 0) + 1);

          const niche = lead.business_category || 'outros';
          stats.niches.set(niche, (stats.niches.get(niche) || 0) + 1);

          hasSignal = true;
          break; // Conta apenas uma vez por categoria por lead
        }
      }
    }

    // Extrair palavras emergentes (padrões de necessidade)
    for (const pattern of demandPatterns) {
      const matches = bio.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 3) {
          const word = match[1].toLowerCase();
          emergingKeywords.set(word, (emergingKeywords.get(word) || 0) + 1);
        }
      }
    }

    if (hasSignal) {
      leadsWithSignals++;
    }
  }

  // Montar resultado
  const trends: DemandTrend[] = [];

  for (const [category, stats] of demandCounts.entries()) {
    if (stats.count >= minCount) {
      const config = DEMAND_SIGNALS[category];
      if (!config) continue;

      // Top keywords encontradas
      const topKeywords = Array.from(stats.keywords.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k]) => k);

      // Top niches
      const topNiches = Array.from(stats.niches.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([niche, count]) => ({ niche, count }));

      trends.push({
        category,
        description: config.description,
        count: stats.count,
        percentage: (stats.count / leads.length) * 100,
        sample_keywords: topKeywords,
        top_niches: topNiches,
        trend: 'stable', // TODO: comparar com período anterior
      });
    }
  }

  // Ordenar por contagem
  trends.sort((a, b) => b.count - a.count);

  // Top palavras emergentes (excluir comuns)
  const stopWords = ['que', 'para', 'com', 'uma', 'mais', 'seu', 'sua', 'você', 'como', 'isso', 'esse', 'essa'];
  const emerging = Array.from(emergingKeywords.entries())
    .filter(([word, count]) => count >= 20 && !stopWords.includes(word) && word.length > 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([keyword, count]) => ({ keyword, count }));

  // Top niches por demanda
  const nicheDemandsMap = new Map<string, Set<string>>();
  for (const trend of trends) {
    for (const { niche } of trend.top_niches) {
      if (!nicheDemandsMap.has(niche)) {
        nicheDemandsMap.set(niche, new Set());
      }
      nicheDemandsMap.get(niche)!.add(trend.category);
    }
  }

  const topNichesByDemand = Array.from(nicheDemandsMap.entries())
    .map(([niche, demands]) => ({
      niche,
      demands: Array.from(demands),
    }))
    .sort((a, b) => b.demands.length - a.demands.length)
    .slice(0, 10);

  return {
    analyzed_at: new Date().toISOString(),
    total_leads_analyzed: leads.length,
    leads_with_signals: leadsWithSignals,
    coverage_percentage: (leadsWithSignals / leads.length) * 100,
    trends,
    emerging_keywords: emerging,
    top_niches_by_demand: topNichesByDemand,
  };
}

/**
 * Analisa demandas específicas de um nicho
 */
export async function analyzeNicheDemands(
  businessCategory: string
): Promise<MarketTrendsResult> {
  return discoverMarketTrends({ businessCategory, minCount: 10 });
}

/**
 * Compara tendências entre dois períodos
 */
export async function compareTrendPeriods(
  currentDays: number = 15,
  previousDays: number = 30
): Promise<{
  current: MarketTrendsResult;
  previous: MarketTrendsResult;
  changes: { category: string; change: number; direction: 'up' | 'down' | 'stable' }[];
}> {
  const current = await discoverMarketTrends({ daysBack: currentDays, minCount: 20 });

  // Para o período anterior, ajustar a query seria mais complexo
  // Por simplicidade, vamos usar o período completo como "anterior"
  const previous = await discoverMarketTrends({ daysBack: previousDays, minCount: 20 });

  const changes = current.trends.map(trend => {
    const prevTrend = previous.trends.find(t => t.category === trend.category);
    const prevPct = prevTrend?.percentage || 0;
    const change = trend.percentage - prevPct;

    return {
      category: trend.category,
      change,
      direction: change > 1 ? 'up' : change < -1 ? 'down' : 'stable' as 'up' | 'down' | 'stable',
    };
  });

  return { current, previous, changes };
}

export const marketTrendsService = {
  discoverMarketTrends,
  analyzeNicheDemands,
  compareTrendPeriods,
  DEMAND_SIGNALS,
};

export default marketTrendsService;
