import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Definição de clusters de negócio baseados em hashtags
 */
export const BUSINESS_CLUSTERS = {
  'empreendedorismo_negocios': {
    name: 'Empreendedorismo & Negócios',
    hashtags: [
      'empreendedorismo', 'marketingdigital', 'vendas', 'negócios', 'negocios',
      'gestaoempresarial', 'gestãoempresarial', 'inovação', 'inovacao',
      'tecnologia', 'produtividade', 'liderança', 'lideranca', 'networking',
      'transformaçãodigital', 'transformacaodigital'
    ],
    priority_score: 85,
    avg_contact_rate: 0.62
  },
  'saude_bemestar': {
    name: 'Saúde & Bem-estar',
    hashtags: [
      'autoconhecimento', 'autocuidado', 'bemestar', 'saudemental', 'saúdemental',
      'psicologia', 'terapia', 'desenvolvimentopessoal', 'espiritualidade',
      'meditacao', 'qualidadedevida', 'gratidão', 'gratidao', 'motivação',
      'motivacao', 'fé', 'fe'
    ],
    priority_score: 80,
    avg_contact_rate: 0.64
  },
  'fitness_estetica': {
    name: 'Fitness & Estética',
    hashtags: [
      'treino', 'academia', 'fitness', 'emagrecimento', 'hipertrofia',
      'vidasaudavel', 'nutrição', 'nutricao', 'estetica', 'perderpeso',
      'treinos', 'musculacao', 'fit', 'dieta', 'saude', 'saúde'
    ],
    priority_score: 90,
    avg_contact_rate: 0.69
  },
  'juridico_contabil': {
    name: 'Jurídico & Contábil',
    hashtags: [
      'advocacia', 'direito', 'advogado', 'justiça', 'inss',
      'contabilidade', 'contador', 'mei', 'planejamentofinanceiro',
      'gestaofinanceira', 'gestãofinanceira', 'impostos', 'tributario'
    ],
    priority_score: 95,
    avg_contact_rate: 0.68
  },
  'servicos_especializados': {
    name: 'Serviços Especializados',
    hashtags: [
      'odontologia', 'arquitetura', 'fisioterapia', 'engenharia',
      'medicina', 'enfermagem', 'farmacia', 'veterinaria',
      'design', 'fotografia', 'educacao', 'educação'
    ],
    priority_score: 100,
    avg_contact_rate: 0.71
  }
};

/**
 * Interface para resultado de scoring
 */
export interface LeadScore {
  lead_id: string;
  username: string;
  total_score: number;
  cluster: string;
  cluster_confidence: number;
  contact_quality_score: number;
  audience_quality_score: number;
  hashtag_match_score: number;
  business_potential: 'Alto' | 'Médio' | 'Baixo';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  recommendations: string[];
}

/**
 * Interface para análise de cluster
 */
export interface ClusterAnalysis {
  cluster_name: string;
  total_leads: number;
  avg_score: number;
  top_leads: LeadScore[];
  hashtag_distribution: Array<{ hashtag: string; count: number }>;
}

/**
 * Classe para scoring de leads baseado em hashtags e cluster
 */
export class HashtagLeadScorer {
  /**
   * Calcula score completo para um lead
   * @param leadId - ID do lead no Supabase
   */
  async scoreLead(leadId: string): Promise<LeadScore> {
    // Buscar dados do lead
    const { data: lead, error } = await supabase
      .from('instagram_leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (error || !lead) {
      throw new Error(`Lead ${leadId} não encontrado`);
    }

    // Extrair hashtags do lead
    const allHashtags = [
      ...(lead.hashtags_bio || []),
      ...(lead.hashtags_posts || [])
    ].map((h: string) => h.toLowerCase().replace(/"/g, '').replace(/#/g, ''));

    // Identificar cluster
    const { cluster, confidence, matchedHashtags } = this.identifyCluster(allHashtags);

    // Calcular scores parciais
    const contactQualityScore = this.calculateContactQualityScore(lead);
    const audienceQualityScore = this.calculateAudienceQualityScore(lead);
    const hashtagMatchScore = (matchedHashtags.length / allHashtags.length) * 100;

    // Score total (média ponderada)
    const clusterPriorityScore = cluster ? BUSINESS_CLUSTERS[cluster].priority_score : 50;
    const totalScore = Math.round(
      clusterPriorityScore * 0.3 +
      contactQualityScore * 0.3 +
      audienceQualityScore * 0.2 +
      hashtagMatchScore * 0.2
    );

    // Classificar potencial de negócio
    const businessPotential: 'Alto' | 'Médio' | 'Baixo' =
      totalScore >= 80 ? 'Alto' :
        totalScore >= 60 ? 'Médio' : 'Baixo';

    // Definir prioridade
    const priority: 'P0' | 'P1' | 'P2' | 'P3' =
      totalScore >= 90 ? 'P0' :
        totalScore >= 75 ? 'P1' :
          totalScore >= 60 ? 'P2' : 'P3';

    // Gerar recomendações
    const recommendations = this.generateRecommendations(lead, totalScore, cluster);

    return {
      lead_id: leadId,
      username: lead.username,
      total_score: totalScore,
      cluster: cluster ? BUSINESS_CLUSTERS[cluster].name : 'Outros',
      cluster_confidence: confidence,
      contact_quality_score: contactQualityScore,
      audience_quality_score: audienceQualityScore,
      hashtag_match_score: Math.round(hashtagMatchScore),
      business_potential: businessPotential,
      priority,
      recommendations
    };
  }

  /**
   * Identifica o cluster de negócio mais provável para um conjunto de hashtags
   */
  private identifyCluster(hashtags: string[]): {
    cluster: string | null;
    confidence: number;
    matchedHashtags: string[];
  } {
    let bestCluster: string | null = null;
    let maxMatches = 0;
    let bestMatchedHashtags: string[] = [];

    for (const [clusterId, clusterData] of Object.entries(BUSINESS_CLUSTERS)) {
      const matches = hashtags.filter(h =>
        clusterData.hashtags.some(ch => ch.toLowerCase() === h.toLowerCase())
      );

      if (matches.length > maxMatches) {
        maxMatches = matches.length;
        bestCluster = clusterId;
        bestMatchedHashtags = matches;
      }
    }

    const confidence = hashtags.length > 0
      ? Math.round((maxMatches / hashtags.length) * 100)
      : 0;

    return {
      cluster: bestCluster,
      confidence,
      matchedHashtags: bestMatchedHashtags
    };
  }

  /**
   * Calcula score de qualidade de contato (0-100)
   * Baseado em: email, telefone, business account, verified
   */
  private calculateContactQualityScore(lead: any): number {
    let score = 0;

    // Email (+30 pontos)
    if (lead.email) score += 30;

    // Telefone (+30 pontos)
    if (lead.phone) score += 30;

    // Business account (+20 pontos)
    if (lead.is_business_account) score += 20;

    // Verified (+10 pontos)
    if (lead.is_verified) score += 10;

    // Website (+10 pontos)
    if (lead.website) score += 10;

    return Math.min(score, 100);
  }

  /**
   * Calcula score de qualidade de audiência (0-100)
   * Baseado em: followers, posts, engagement
   */
  private calculateAudienceQualityScore(lead: any): number {
    let score = 0;

    // Faixa ideal: 1k-100k seguidores
    const followers = lead.followers_count || 0;
    if (followers >= 1000 && followers <= 100000) {
      score += 40; // Faixa ideal
    } else if (followers >= 500 && followers < 1000) {
      score += 30; // Micro-influencer
    } else if (followers > 100000) {
      score += 20; // Muito grande (pode ser mais difícil converter)
    } else {
      score += 10; // Muito pequeno
    }

    // Posts (atividade)
    const posts = lead.posts_count || 0;
    if (posts >= 50) {
      score += 30; // Muito ativo
    } else if (posts >= 20) {
      score += 20; // Ativo
    } else if (posts >= 10) {
      score += 10; // Pouco ativo
    }

    // Ratio followers/following (autoridade)
    const following = lead.following_count || 1;
    const ratio = followers / following;
    if (ratio >= 2) {
      score += 30; // Boa autoridade
    } else if (ratio >= 1) {
      score += 20; // Autoridade média
    } else if (ratio >= 0.5) {
      score += 10; // Baixa autoridade
    }

    return Math.min(score, 100);
  }

  /**
   * Gera recomendações de ação baseadas no score
   */
  private generateRecommendations(lead: any, totalScore: number, cluster: string | null): string[] {
    const recommendations: string[] = [];

    // Recomendações baseadas em score
    if (totalScore >= 90) {
      recommendations.push('🔥 PRIORIDADE MÁXIMA: Lead premium, abordar imediatamente');
      recommendations.push('Personalizar outreach com base no cluster');
    } else if (totalScore >= 75) {
      recommendations.push('⭐ Alta prioridade: Incluir em campanha prioritária');
    } else if (totalScore >= 60) {
      recommendations.push('📌 Prioridade média: Incluir em campanha regular');
    } else {
      recommendations.push('📋 Baixa prioridade: Nurturing de longo prazo');
    }

    // Recomendações baseadas em dados faltantes
    if (!lead.email && !lead.phone) {
      recommendations.push('⚠️ Enriquecer dados de contato via API (Hunter.io, Clearbit)');
    }

    if (!lead.website && lead.is_business_account) {
      recommendations.push('🔗 Verificar bio novamente para extrair website');
    }

    // Recomendações baseadas em cluster
    if (cluster) {
      const clusterData = BUSINESS_CLUSTERS[cluster];
      recommendations.push(`🎯 Cluster: ${clusterData.name} (${Math.round(clusterData.avg_contact_rate * 100)}% taxa de contato média)`);

      if (cluster === 'servicos_especializados') {
        recommendations.push('💎 Segmento premium: Oferecer demo personalizada');
      } else if (cluster === 'juridico_contabil') {
        recommendations.push('⚖️ Enfatizar compliance e automação fiscal');
      } else if (cluster === 'fitness_estetica') {
        recommendations.push('💪 Destacar agendamentos e pagamentos recorrentes');
      }
    }

    // Recomendação de follow baseado em audiência
    const followers = lead.followers_count || 0;
    if (followers >= 10000 && followers <= 300000) {
      recommendations.push('👥 Audiência relevante: Considerar scrape de seguidores para leads B2C');
    }

    return recommendations;
  }

  /**
   * Score em lote: múltiplos leads
   */
  async scoreMultipleLeads(leadIds: string[]): Promise<LeadScore[]> {
    console.log(`\n📊 Scoring ${leadIds.length} leads...`);

    const scores: LeadScore[] = [];

    for (const leadId of leadIds) {
      try {
        const score = await this.scoreLead(leadId);
        scores.push(score);
        console.log(`   ✅ ${score.username}: ${score.total_score} (${score.priority})`);
      } catch (error) {
        console.error(`   ❌ Erro ao scorar lead ${leadId}:`, error);
      }
    }

    return scores.sort((a, b) => b.total_score - a.total_score);
  }

  /**
   * Análise completa por cluster
   */
  async analyzeByCluster(): Promise<ClusterAnalysis[]> {
    console.log('\n🎯 Analisando leads por cluster...');

    const analyses: ClusterAnalysis[] = [];

    for (const [clusterId, clusterData] of Object.entries(BUSINESS_CLUSTERS)) {
      console.log(`\n   📁 Cluster: ${clusterData.name}`);

      // Buscar leads que contém hashtags deste cluster
      const hashtagsQuoted = clusterData.hashtags
        .map(h => `"${h}"`)
        .join(',');

      const { data: leads } = await supabase
        .from('instagram_leads')
        .select('id, username, hashtags_bio, hashtags_posts')
        .or(`hashtags_bio.cs.{${hashtagsQuoted}},hashtags_posts.cs.{${hashtagsQuoted}}`)
        .limit(100);

      if (!leads || leads.length === 0) {
        console.log(`      ⚠️ Nenhum lead encontrado`);
        continue;
      }

      // Score de cada lead
      const leadScores = await this.scoreMultipleLeads(leads.map(l => l.id));

      // Top 10 leads do cluster
      const topLeads = leadScores
        .slice(0, 10);

      // Distribuição de hashtags
      const hashtagCounts = new Map<string, number>();
      for (const lead of leads) {
        const allHashtags = [
          ...(lead.hashtags_bio || []),
          ...(lead.hashtags_posts || [])
        ];

        for (const hashtag of allHashtags) {
          const normalized = hashtag.toLowerCase().replace(/"/g, '').replace(/#/g, '');
          if (clusterData.hashtags.includes(normalized)) {
            hashtagCounts.set(normalized, (hashtagCounts.get(normalized) || 0) + 1);
          }
        }
      }

      const hashtagDistribution = Array.from(hashtagCounts.entries())
        .map(([hashtag, count]) => ({ hashtag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const avgScore = Math.round(
        leadScores.reduce((sum, l) => sum + l.total_score, 0) / leadScores.length
      );

      analyses.push({
        cluster_name: clusterData.name,
        total_leads: leads.length,
        avg_score: avgScore,
        top_leads: topLeads,
        hashtag_distribution: hashtagDistribution
      });

      console.log(`      ✅ ${leads.length} leads | Score médio: ${avgScore}`);
    }

    return analyses;
  }

  /**
   * Atualiza score de um lead no banco de dados
   * (cria coluna lead_score se não existir)
   */
  async updateLeadScore(leadId: string): Promise<void> {
    const score = await this.scoreLead(leadId);

    const { error } = await supabase
      .from('instagram_leads')
      .update({
        lead_score: score.total_score,
        // Salvar metadados em campo JSONB (se existir)
        // scoring_metadata: {
        //   cluster: score.cluster,
        //   priority: score.priority,
        //   business_potential: score.business_potential,
        //   last_scored_at: new Date().toISOString()
        // }
      })
      .eq('id', leadId);

    if (error) {
      console.error(`❌ Erro ao atualizar score do lead ${leadId}:`, error);
      throw error;
    }

    console.log(`✅ Score atualizado: ${score.username} → ${score.total_score}`);
  }

  /**
   * Score em massa: todos os leads com hashtags
   */
  async scoreAllLeads(batchSize: number = 100): Promise<void> {
    console.log('\n🚀 Iniciando scoring em massa...');

    let offset = 0;
    let totalProcessed = 0;

    while (true) {
      // Buscar lote de leads
      const { data: leads, error } = await supabase
        .from('instagram_leads')
        .select('id')
        .not('hashtags_bio', 'is', null)
        .range(offset, offset + batchSize - 1);

      if (error || !leads || leads.length === 0) {
        break;
      }

      console.log(`\n📦 Lote ${Math.floor(offset / batchSize) + 1} (${leads.length} leads)`);

      // Processar lote
      for (const lead of leads) {
        try {
          await this.updateLeadScore(lead.id);
          totalProcessed++;
        } catch (error) {
          console.error(`❌ Falha em ${lead.id}`);
        }
      }

      offset += batchSize;

      // Pequeno delay para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n✅ Scoring em massa concluído: ${totalProcessed} leads processados`);
  }
}

// Exportar instância singleton
export const hashtagLeadScorer = new HashtagLeadScorer();
