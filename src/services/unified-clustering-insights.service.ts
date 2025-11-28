/**
 * Unified Clustering Insights Service
 * Funções auxiliares para gerar insights SEM GPT-4
 * Usado pelos endpoints unificados que substituem o clustering GPT-4
 */

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES PARA GERAÇÃO DE INSIGHTS (SEM GPT)
// ═══════════════════════════════════════════════════════════════════════════════

export function calculatePriorityScore(cluster: any): number {
  const leads = cluster.total_leads || 0;
  const contactRate = cluster.avg_contact_rate || 0;
  const relevance = cluster.relevance_score || 0.5;

  // Score composto: leads (40%) + taxa contato (40%) + relevância (20%)
  const leadsScore = Math.min(leads / 100, 1) * 40;
  const contactScore = contactRate * 40;
  const relevanceScore = relevance * 20;

  return Math.round(leadsScore + contactScore + relevanceScore);
}

export function generateClusterDescription(keywords: string[], nicho: string): string {
  if (!keywords || keywords.length === 0) {
    return `Cluster de ${nicho || 'leads'} identificado por análise de hashtags`;
  }

  const topKeywords = keywords.slice(0, 3).join(', ');
  return `Profissionais focados em ${topKeywords} no segmento de ${nicho || 'negócios'}`;
}

export function generatePainPoints(keywords: string[], nicho: string): string[] {
  const painPointsMap: Record<string, string[]> = {
    // Beleza e Estética
    'unhas': ['Dificuldade em fidelizar clientes', 'Concorrência com preços baixos', 'Gestão de agenda'],
    'manicure': ['Captação de novos clientes', 'Precificação adequada', 'Marketing digital'],
    'cabelo': ['Manter clientes recorrentes', 'Acompanhar tendências', 'Gestão de equipe'],
    'estetica': ['Alto custo de equipamentos', 'Certificações e cursos', 'Rotatividade de clientes'],
    'sobrancelhas': ['Diferenciação no mercado', 'Fidelização', 'Precificação'],
    'micropigmentacao': ['Investimento inicial alto', 'Atualização técnica', 'Marketing'],

    // Saúde e Fitness
    'fitness': ['Manter alunos motivados', 'Diferenciação de serviço', 'Gestão de horários'],
    'personal': ['Captação de clientes', 'Precificação do serviço', 'Concorrência online'],
    'nutricionista': ['Adesão dos pacientes', 'Marketing profissional', 'Diferenciação'],
    'pilates': ['Retenção de alunos', 'Custos fixos altos', 'Concorrência'],

    // Profissionais Liberais
    'advogado': ['Captação de clientes', 'Gestão de processos', 'Marketing jurídico'],
    'contador': ['Retenção de clientes', 'Automação de processos', 'Precificação'],
    'arquiteto': ['Portfólio e visibilidade', 'Gestão de projetos', 'Captação'],

    // Educação
    'professor': ['Captação de alunos', 'Plataformas digitais', 'Precificação de cursos'],
    'coach': ['Credibilidade no mercado', 'Diferenciação', 'Marketing pessoal'],
    'mentor': ['Autoridade no nicho', 'Conversão de leads', 'Escalabilidade'],

    // Default
    'default': [
      'Captação de novos clientes',
      'Fidelização de clientes existentes',
      'Marketing digital eficiente',
      'Gestão de tempo e agenda',
      'Precificação competitiva'
    ]
  };

  const foundPains: string[] = [];

  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    for (const [key, pains] of Object.entries(painPointsMap)) {
      if (lowerKeyword.includes(key) || key.includes(lowerKeyword)) {
        foundPains.push(...pains);
      }
    }
  }

  // Se não encontrou nada específico, usar default
  if (foundPains.length === 0) {
    return painPointsMap['default'] || [];
  }

  // Remover duplicatas e limitar
  return [...new Set(foundPains)].slice(0, 5);
}

export function generateTrends(keywords: string[]): string[] {
  const trends = [
    'Crescimento de agendamento online',
    'Demanda por atendimento personalizado',
    'Busca por profissionais certificados',
    'Interesse em pacotes e planos recorrentes',
    'Valorização de conteúdo educativo'
  ];

  // Adicionar trends baseados em keywords
  if (keywords.some(k => k.toLowerCase().includes('digital') || k.toLowerCase().includes('online'))) {
    trends.unshift('Migração para atendimento digital');
  }
  if (keywords.some(k => k.toLowerCase().includes('premium') || k.toLowerCase().includes('luxo'))) {
    trends.unshift('Busca por serviços premium');
  }

  return trends.slice(0, 5);
}

export function detectAwarenessLevel(keywords: string[]): string {
  const awarenessKeywords = {
    unaware: ['iniciante', 'começando', 'novo', 'aprender'],
    problem_aware: ['problema', 'dificuldade', 'ajuda', 'solução'],
    solution_aware: ['melhor', 'comparar', 'opções', 'escolher'],
    product_aware: ['curso', 'serviço', 'programa', 'método'],
    most_aware: ['comprar', 'contratar', 'agendar', 'inscrever']
  };

  for (const [level, keys] of Object.entries(awarenessKeywords)) {
    if (keywords.some(k => keys.some(key => k.toLowerCase().includes(key)))) {
      return level;
    }
  }

  return 'solution_aware'; // Default
}

export function detectBuyingStage(keywords: string[]): string {
  const stages = {
    'Descoberta': ['conhecer', 'aprender', 'iniciante', 'primeiro'],
    'Consideração': ['melhor', 'comparar', 'diferença', 'qual'],
    'Decisão': ['comprar', 'agendar', 'contratar', 'preço'],
    'Pós-compra': ['resultado', 'depoimento', 'experiência', 'recomendo']
  };

  for (const [stage, keys] of Object.entries(stages)) {
    if (keywords.some(k => keys.some(key => k.toLowerCase().includes(key)))) {
      return stage;
    }
  }

  return 'Consideração'; // Default
}

export function detectCommunicationTone(keywords: string[]): string {
  if (keywords.some(k => ['profissional', 'corporativo', 'executivo', 'empresarial'].some(t => k.toLowerCase().includes(t)))) {
    return 'Formal e profissional';
  }
  if (keywords.some(k => ['jovem', 'moderno', 'tendência', 'style'].some(t => k.toLowerCase().includes(t)))) {
    return 'Descontraído e moderno';
  }
  if (keywords.some(k => ['premium', 'luxo', 'exclusivo', 'vip'].some(t => k.toLowerCase().includes(t)))) {
    return 'Sofisticado e exclusivo';
  }

  return 'Amigável e consultivo';
}

export function detectMentalTriggers(keywords: string[]): string[] {
  const triggers = ['Autoridade', 'Prova Social', 'Escassez'];

  if (keywords.some(k => k.toLowerCase().includes('resultado') || k.toLowerCase().includes('antes'))) {
    triggers.push('Resultados comprovados');
  }
  if (keywords.some(k => k.toLowerCase().includes('exclusiv') || k.toLowerCase().includes('vip'))) {
    triggers.push('Exclusividade');
  }
  if (keywords.some(k => k.toLowerCase().includes('garantia') || k.toLowerCase().includes('segur'))) {
    triggers.push('Garantia');
  }

  return triggers.slice(0, 5);
}

export function generateObjections(nicho: string): string[] {
  const objectionsByNicho: Record<string, string[]> = {
    'beleza': ['Preço muito alto', 'Já tenho profissional de confiança', 'Não tenho tempo'],
    'saude': ['Muito caro', 'Não vejo resultados rápidos', 'Já tentei antes'],
    'educacao': ['Não tenho tempo para estudar', 'Será que funciona?', 'Posso encontrar grátis'],
    'servicos': ['Prefiro fazer sozinho', 'Conheço alguém que faz', 'Vou pensar'],
    'default': [
      'Preciso pensar melhor',
      'Está muito caro',
      'Não é o momento certo',
      'Preciso consultar alguém',
      'Já tenho fornecedor'
    ]
  };

  const nichoLower = nicho?.toLowerCase() || '';

  for (const [key, objections] of Object.entries(objectionsByNicho)) {
    if (nichoLower.includes(key)) {
      return objections;
    }
  }

  return objectionsByNicho['default'] || [];
}

export function generateMarketGaps(keywords: string[], nicho: string): string[] {
  return [
    `Poucos profissionais de ${nicho || 'qualidade'} com presença digital forte`,
    'Falta de conteúdo educativo no segmento',
    'Oportunidade em pacotes de serviços recorrentes',
    'Demanda por atendimento personalizado não atendida',
    'Espaço para posicionamento premium'
  ];
}

export function generateUnderservedNiches(keywords: string[], nicho: string): string[] {
  return [
    `${nicho || 'Profissionais'} iniciantes buscando formação`,
    'Clientes que buscam pacotes econômicos',
    'Público corporativo/empresarial',
    'Atendimento domiciliar/à distância',
    'Nichos específicos dentro do segmento'
  ];
}

export function generateApproachRecommendations(keywords: string[], nicho: string): string[] {
  return [
    'Iniciar com conteúdo de valor gratuito',
    'Oferecer diagnóstico ou avaliação inicial',
    'Apresentar cases e depoimentos de clientes',
    'Criar senso de urgência com ofertas limitadas',
    'Personalizar abordagem baseada no perfil do lead'
  ];
}

/**
 * Gera todos os insights para um cluster
 */
export function generateAllInsights(cluster: any, nicho: string) {
  const themeKeywords = cluster.theme_keywords || [];
  const painPoints = generatePainPoints(themeKeywords, nicho);
  const emergingTrends = generateTrends(themeKeywords);

  return {
    pain_points: painPoints,
    pain_intensity: painPoints.length > 3 ? 'alta' : painPoints.length > 1 ? 'média' : 'baixa',
    emerging_trends: emergingTrends,
    audience_awareness_level: detectAwarenessLevel(themeKeywords),
    buying_stage: detectBuyingStage(themeKeywords),
    communication_tone: detectCommunicationTone(themeKeywords),
    mental_triggers: detectMentalTriggers(themeKeywords),
    common_objections: generateObjections(nicho),
    market_gaps: generateMarketGaps(themeKeywords, nicho),
    underserved_niches: generateUnderservedNiches(themeKeywords, nicho),
    approach_recommendations: generateApproachRecommendations(themeKeywords, nicho),
    opportunity_score: (cluster.relevance_score || 0.5) * 100,
    trend_direction: 'growing',
    trend_velocity: 'moderada'
  };
}
