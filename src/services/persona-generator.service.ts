import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

interface PersonaData {
  persona_key: string;
  persona_name: string;
  persona_avatar_emoji: string;
  age_range: string;
  gender_distribution: Record<string, number>;
  location_focus: string[];
  income_level: string;
  primary_occupation: string;
  secondary_occupations: string[];
  experience_level: string;
  business_stage: string;
  instagram_behavior: Record<string, any>;
  content_preferences: string[];
  engagement_patterns: Record<string, any>;
  hashtag_affinity: string[];
  primary_motivations: string[];
  core_pain_points: string[];
  aspirations: string[];
  fears_and_objections: string[];
  values_and_beliefs: string[];
  awareness_level: string;
  decision_factors: string[];
  preferred_communication_style: string;
  trust_triggers: string[];
  ideal_first_contact: string;
  content_strategy: string;
  offer_positioning: string;
  objection_handling: Record<string, string>;
}

interface ClusterData {
  id: string;
  cluster_name: string;
  cluster_key: string;
  hashtags: string[];
  total_leads: number;
  conversion_rate: number;
  priority_score: number;
  pain_points: string[];
  cluster_description: string;
}

interface GenerationResult {
  success: boolean;
  personas_created: number;
  personas_updated: number;
  leads_assigned: number;
  errors: string[];
}

class PersonaGeneratorService {

  /**
   * Executa pipeline completo de geração de personas
   */
  async generatePersonas(): Promise<GenerationResult> {
    console.log('\n🎭 INICIANDO GERAÇÃO DE PERSONAS DINÂMICAS\n');
    console.log('════════════════════════════════════════════════════════════\n');

    const result: GenerationResult = {
      success: true,
      personas_created: 0,
      personas_updated: 0,
      leads_assigned: 0,
      errors: []
    };

    try {
      // 1. Buscar clusters dinâmicos ativos
      console.log('📊 Etapa 1/4: Buscando clusters dinâmicos...');
      const clusters = await this.fetchActiveClusters();
      console.log(`   ✅ ${clusters.length} clusters encontrados\n`);

      if (clusters.length === 0) {
        throw new Error('Nenhum cluster dinâmico ativo encontrado');
      }

      // 2. Buscar dados agregados dos leads
      console.log('📈 Etapa 2/4: Agregando dados dos leads...');
      const leadStats = await this.aggregateLeadData();
      console.log(`   ✅ ${leadStats.total_leads} leads analisados\n`);

      // 3. Gerar personas via GPT
      console.log('🤖 Etapa 3/4: Gerando personas via GPT...');
      const personas = await this.generatePersonasWithGPT(clusters, leadStats);
      console.log(`   ✅ ${personas.length} personas geradas\n`);

      // 4. Persistir personas
      console.log('💾 Etapa 4/4: Persistindo personas...');
      const persistResult = await this.persistPersonas(personas, clusters);
      result.personas_created = persistResult.created;
      result.personas_updated = persistResult.updated;
      console.log(`   ✅ Criadas: ${persistResult.created}, Atualizadas: ${persistResult.updated}\n`);

      // 5. Associar leads às personas
      console.log('🔗 Etapa Extra: Associando leads às personas...');
      result.leads_assigned = await this.assignLeadsToPersonas();
      console.log(`   ✅ ${result.leads_assigned} leads associados\n`);

      console.log('════════════════════════════════════════════════════════════');
      console.log('🎉 GERAÇÃO DE PERSONAS CONCLUÍDA COM SUCESSO!\n');

    } catch (error: any) {
      console.error('❌ Erro na geração de personas:', error.message);
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Busca clusters dinâmicos ativos
   */
  private async fetchActiveClusters(): Promise<ClusterData[]> {
    const { data, error } = await supabase
      .from('hashtag_clusters_dynamic')
      .select('*')
      .eq('is_active', true)
      .order('priority_score', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Agrega dados estatísticos dos leads
   */
  private async aggregateLeadData(): Promise<any> {
    // Query direta ao Supabase para evitar problemas com execute_sql RPC
    const { data: leads, error } = await supabase
      .from('instagram_leads')
      .select('email, phone, city, followers_count, following_count, posts_count')
      .eq('is_business_account', true);

    if (error) throw error;

    if (!leads || leads.length === 0) {
      return { total_leads: 0, valid_leads: 0, unique_cities: 0, avg_followers: 0, avg_following: 0, avg_posts: 0 };
    }

    // Calcular agregações manualmente
    const totalLeads = leads.length;
    const validLeads = leads.filter(l => l.email || l.phone).length;
    const uniqueCities = new Set(leads.map(l => l.city || 'unknown')).size;
    const avgFollowers = leads.reduce((sum, l) => sum + (l.followers_count || 0), 0) / totalLeads;
    const avgFollowing = leads.reduce((sum, l) => sum + (l.following_count || 0), 0) / totalLeads;
    const avgPosts = leads.reduce((sum, l) => sum + (l.posts_count || 0), 0) / totalLeads;

    return {
      total_leads: totalLeads,
      valid_leads: validLeads,
      unique_cities: uniqueCities,
      avg_followers: avgFollowers,
      avg_following: avgFollowing,
      avg_posts: avgPosts
    };
  }

  /**
   * 🔍 Compara hashtags de leads COM contato vs SEM contato
   * Revela quais hashtags indicam maior probabilidade de ter contato
   */
  private async compareHashtagsByContactStatus(): Promise<{
    with_contact: { hashtag: string; count: number; percentage: number }[];
    without_contact: { hashtag: string; count: number; percentage: number }[];
    contact_indicators: { hashtag: string; lift: number; contact_rate: number }[];
    insights: string[];
  }> {
    console.log('📊 Analisando hashtags por status de contato...');

    // Buscar leads COM contato
    const { data: leadsWithContact, error: err1 } = await supabase
      .from('instagram_leads')
      .select('hashtags_bio, hashtags_posts')
      .eq('is_business_account', true)
      .or('email.neq.null,phone.neq.null');

    // Buscar leads SEM contato
    const { data: leadsWithoutContact, error: err2 } = await supabase
      .from('instagram_leads')
      .select('hashtags_bio, hashtags_posts')
      .eq('is_business_account', true)
      .is('email', null)
      .is('phone', null);

    if (err1 || err2) {
      console.error('Erro ao buscar leads:', err1?.message || err2?.message);
      return { with_contact: [], without_contact: [], contact_indicators: [], insights: [] };
    }

    // Função para contar hashtags
    const countHashtags = (leads: any[]): Map<string, number> => {
      const counts = new Map<string, number>();
      for (const lead of leads) {
        const allTags = [
          ...(lead.hashtags_bio || []),
          ...(lead.hashtags_posts || [])
        ];
        const uniqueTags = new Set(allTags.map((h: string) => h.toLowerCase().replace(/#/g, '').trim()));
        for (const tag of uniqueTags) {
          if (tag.length > 0) {
            counts.set(tag, (counts.get(tag) || 0) + 1);
          }
        }
      }
      return counts;
    };

    const withContactCounts = countHashtags(leadsWithContact || []);
    const withoutContactCounts = countHashtags(leadsWithoutContact || []);

    const totalWithContact = leadsWithContact?.length || 0;
    const totalWithoutContact = leadsWithoutContact?.length || 0;
    const totalLeads = totalWithContact + totalWithoutContact;

    console.log(`  ✅ Leads COM contato: ${totalWithContact}`);
    console.log(`  ❌ Leads SEM contato: ${totalWithoutContact}`);

    // Converter para array ordenado
    const sortByCount = (counts: Map<string, number>, total: number) => {
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([hashtag, count]) => ({
          hashtag,
          count,
          percentage: Number(((count / total) * 100).toFixed(1))
        }));
    };

    const topWithContact = sortByCount(withContactCounts, totalWithContact);
    const topWithoutContact = sortByCount(withoutContactCounts, totalWithoutContact);

    // Calcular LIFT: quais hashtags indicam maior chance de ter contato
    const contactIndicators: { hashtag: string; lift: number; contact_rate: number }[] = [];
    const baseContactRate = totalWithContact / totalLeads;

    for (const [hashtag, countWith] of withContactCounts) {
      const countWithout = withoutContactCounts.get(hashtag) || 0;
      const totalWithHashtag = countWith + countWithout;

      if (totalWithHashtag >= 5) { // Mínimo 5 ocorrências para relevância
        const hashtagContactRate = countWith / totalWithHashtag;
        const lift = hashtagContactRate / baseContactRate;

        if (lift > 1.2) { // Lift > 20% acima da média
          contactIndicators.push({
            hashtag,
            lift: Number(lift.toFixed(2)),
            contact_rate: Number((hashtagContactRate * 100).toFixed(1))
          });
        }
      }
    }

    // Ordenar por lift
    contactIndicators.sort((a, b) => b.lift - a.lift);

    // Gerar insights automáticos
    const insights: string[] = [];
    if (contactIndicators.length > 0) {
      const topIndicator = contactIndicators[0]!;
      insights.push(`#${topIndicator.hashtag} tem ${topIndicator.lift}x mais chance de ter contato (${topIndicator.contact_rate}% vs ${(baseContactRate * 100).toFixed(1)}% média)`);
    }

    if (topWithContact.length > 0 && topWithoutContact.length > 0) {
      const exclusiveWithContact = topWithContact.filter(h => !topWithoutContact.some(w => w.hashtag === h.hashtag));
      if (exclusiveWithContact.length > 0) {
        insights.push(`Hashtags exclusivas de leads com contato: ${exclusiveWithContact.slice(0, 3).map(h => '#' + h.hashtag).join(', ')}`);
      }
    }

    insights.push(`Taxa base de contato: ${(baseContactRate * 100).toFixed(1)}% (${totalWithContact}/${totalLeads})`);

    console.log(`  📈 Indicadores de contato encontrados: ${contactIndicators.length}`);

    return {
      with_contact: topWithContact,
      without_contact: topWithoutContact,
      contact_indicators: contactIndicators.slice(0, 15),
      insights
    };
  }

  /**
   * Gera personas usando GPT-4/5
   */
  private async generatePersonasWithGPT(clusters: ClusterData[], leadStats: any): Promise<PersonaData[]> {
    const prompt = this.buildPersonaPrompt(clusters, leadStats);

    const completion = await openai.chat.completions.create({
      model: process.env.PERSONA_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em criação de buyer personas para marketing B2B no mercado brasileiro de estética e beleza.

Sua tarefa é analisar clusters de hashtags e dados de leads do Instagram para criar personas detalhadas e acionáveis.

IMPORTANTE:
- Crie personas DISTINTAS e bem definidas
- Base suas análises nos dados fornecidos, não invente
- Foque em insights práticos para vendas e marketing
- Use linguagem do mercado brasileiro
- Cada persona deve ter características únicas e identificáveis`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 8000
    });

    const messageContent = completion.choices[0]?.message?.content || '{}';
    const response = JSON.parse(messageContent);
    return response.personas || [];
  }

  /**
   * Constrói prompt para geração de personas
   */
  private buildPersonaPrompt(clusters: ClusterData[], leadStats: any): string {
    const clusterSummary = clusters.map(c => `
**Cluster: ${c.cluster_name}**
- Hashtags: ${(c.hashtags || []).slice(0, 10).join(', ')}
- Total de leads: ${c.total_leads || 0}
- Taxa de conversão: ${(c.conversion_rate || 0).toFixed(1)}%
- Pain points: ${(c.pain_points || []).join(', ')}
- Descrição: ${c.cluster_description || 'Sem descrição'}
`).join('\n');

    return `
Analise os seguintes clusters de leads do Instagram (mercado de estética/beleza brasileiro) e crie personas detalhadas:

## DADOS GERAIS
- Total de leads: ${leadStats.total_leads}
- Leads com contato: ${leadStats.valid_leads}
- Cidades únicas: ${leadStats.unique_cities}
- Média de seguidores: ${Math.round(leadStats.avg_followers || 0)}
- Média de posts: ${Math.round(leadStats.avg_posts || 0)}

## CLUSTERS IDENTIFICADOS
${clusterSummary}

## SUA TAREFA
Crie de 3 a 6 personas distintas baseadas nesses clusters. Para cada persona, forneça:

1. **Identificação**: Nome criativo, emoji avatar, key único
2. **Demografia**: Idade, gênero, localização, renda
3. **Profissional**: Ocupação, experiência, estágio do negócio
4. **Comportamento Digital**: Como usa Instagram, preferências de conteúdo
5. **Psicografia**: Motivações, dores, aspirações, medos, valores
6. **Jornada de Compra**: Nível de consciência, fatores de decisão, estilo de comunicação
7. **Estratégia**: Como abordar, conteúdo ideal, posicionamento de oferta, objeções comuns

Retorne um JSON no formato:
{
  "personas": [
    {
      "persona_key": "string_unico_sem_espacos",
      "persona_name": "Nome Descritivo da Persona",
      "persona_avatar_emoji": "👩‍💼",
      "age_range": "25-35",
      "gender_distribution": {"feminino": 80, "masculino": 20},
      "location_focus": ["São Paulo", "Rio de Janeiro"],
      "income_level": "classe_media_alta",
      "primary_occupation": "Esteticista Autônoma",
      "secondary_occupations": ["Nail Designer", "Micropigmentadora"],
      "experience_level": "intermediario",
      "business_stage": "crescimento",
      "instagram_behavior": {
        "posting_frequency": "3-5x/semana",
        "best_times": ["10h", "19h"],
        "story_usage": "alto"
      },
      "content_preferences": ["antes_depois", "tutoriais", "bastidores"],
      "engagement_patterns": {
        "comments_style": "perguntas_tecnicas",
        "dm_openness": "alto"
      },
      "hashtag_affinity": ["#estetica", "#beleza", "#designdeunhas"],
      "primary_motivations": ["independencia_financeira", "reconhecimento_profissional"],
      "core_pain_points": ["dificuldade_captar_clientes", "precificacao_servicos"],
      "aspirations": ["ter_clinica_propria", "formar_equipe"],
      "fears_and_objections": ["investir_e_nao_ter_retorno", "tecnologia_complexa"],
      "values_and_beliefs": ["qualidade_acima_quantidade", "educacao_continua"],
      "awareness_level": "consciente_do_problema",
      "decision_factors": ["prova_social", "roi_claro", "suporte_disponivel"],
      "preferred_communication_style": "direto_pratico_com_exemplos",
      "trust_triggers": ["casos_de_sucesso_similares", "garantia", "trial_gratuito"],
      "ideal_first_contact": "Texto específico de como abordar esta persona pela primeira vez",
      "content_strategy": "Estratégia de conteúdo específica para engajar esta persona",
      "offer_positioning": "Como posicionar sua oferta para esta persona",
      "objection_handling": {
        "muito_caro": "Resposta específica para esta objeção",
        "nao_tenho_tempo": "Resposta específica para esta objeção"
      }
    }
  ]
}

Garanta que cada persona seja ÚNICA e baseada nos dados reais dos clusters.`;
  }

  /**
   * Persiste personas no banco de dados
   */
  private async persistPersonas(personas: PersonaData[], clusters: ClusterData[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const persona of personas) {
      // Encontrar cluster mais relacionado
      const primaryCluster = this.findMostRelatedCluster(persona, clusters);

      const personaRecord = {
        ...persona,
        primary_cluster_id: primaryCluster?.id || null,
        generated_by_model: process.env.PERSONA_MODEL || 'gpt-4o',
        confidence_score: 0.85,
        last_recalculated_at: new Date().toISOString()
      };

      // Verificar se já existe
      const { data: existing } = await supabase
        .from('dynamic_personas')
        .select('id')
        .eq('persona_key', persona.persona_key)
        .single();

      if (existing) {
        // Atualizar existente
        const { error } = await supabase
          .from('dynamic_personas')
          .update(personaRecord)
          .eq('id', existing.id);

        if (!error) updated++;
      } else {
        // Criar nova
        const { error } = await supabase
          .from('dynamic_personas')
          .insert(personaRecord);

        if (!error) created++;
      }
    }

    return { created, updated };
  }

  /**
   * Encontra cluster mais relacionado com a persona
   */
  private findMostRelatedCluster(persona: PersonaData, clusters: ClusterData[]): ClusterData | null {
    let bestMatch: ClusterData | null = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      // Calcular overlap de hashtags
      const personaHashtags = new Set(persona.hashtag_affinity.map(h => h.toLowerCase().replace('#', '')));
      const clusterHashtags = new Set(cluster.hashtags.map(h => h.toLowerCase().replace('#', '')));

      const intersection = [...personaHashtags].filter(h => clusterHashtags.has(h));
      const score = intersection.length / Math.max(personaHashtags.size, 1);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = cluster;
      }
    }

    return bestMatch;
  }

  /**
   * Associa leads às personas baseado em características
   */
  private async assignLeadsToPersonas(): Promise<number> {
    // Buscar todas as personas ativas
    const { data: personas } = await supabase
      .from('dynamic_personas')
      .select('id, persona_key, hashtag_affinity, primary_cluster_id')
      .eq('is_active', true);

    if (!personas || personas.length === 0) return 0;

    // Buscar leads com hashtags
    const { data: leads } = await supabase
      .from('instagram_leads')
      .select('id, extracted_hashtags')
      .not('extracted_hashtags', 'is', null)
      .limit(10000); // Processar em lotes

    if (!leads) return 0;

    let assigned = 0;

    for (const lead of leads) {
      const leadHashtags = new Set(
        (lead.extracted_hashtags || []).map((h: string) => h.toLowerCase().replace('#', ''))
      );

      // Encontrar melhor persona para este lead
      let bestPersona: { id: string; persona_key: string; hashtag_affinity: string[]; primary_cluster_id: string } | null = null;
      let bestScore = 0;

      for (const persona of personas) {
        const personaHashtags = new Set(
          (persona.hashtag_affinity || []).map((h: string) => h.toLowerCase().replace('#', ''))
        );

        const intersection = [...leadHashtags].filter(h => personaHashtags.has(h));
        const score = (intersection.length / Math.max(leadHashtags.size, 1)) * 100;

        if (score > bestScore && score > 20) { // Mínimo 20% de match
          bestScore = score;
          bestPersona = persona as any;
        }
      }

      if (bestPersona) {
        // Inserir ou atualizar associação
        await supabase
          .from('lead_persona_assignments')
          .upsert({
            lead_id: lead.id,
            persona_id: (bestPersona as any).id,
            match_score: bestScore,
            confidence: bestScore / 100,
            is_primary: true,
            match_factors: { hashtag_overlap: bestScore }
          }, {
            onConflict: 'lead_id,persona_id'
          });

        assigned++;
      }
    }

    // Atualizar métricas das personas
    await this.updatePersonaMetrics();

    return assigned;
  }

  /**
   * Atualiza métricas calculadas das personas
   */
  private async updatePersonaMetrics(): Promise<void> {
    const { data: personas } = await supabase
      .from('dynamic_personas')
      .select('id')
      .eq('is_active', true);

    if (!personas) return;

    for (const persona of personas) {
      // Calcular métricas baseadas nos leads associados
      const { data: metrics } = await supabase.rpc('execute_sql', {
        query_text: `
          SELECT
            COUNT(DISTINCT lpa.lead_id) as total_leads,
            AVG(lpa.match_score) as avg_match_score,
            COUNT(CASE WHEN il.email IS NOT NULL OR il.phone IS NOT NULL THEN 1 END)::float /
              NULLIF(COUNT(*), 0) * 100 as conversion_rate
          FROM lead_persona_assignments lpa
          JOIN instagram_leads il ON il.id = lpa.lead_id
          WHERE lpa.persona_id = '${persona.id}'
        `
      });

      if (metrics && metrics[0]) {
        const totalLeadsInBase = await this.getTotalLeads();
        const m = metrics[0];

        await supabase
          .from('dynamic_personas')
          .update({
            total_leads: m.total_leads || 0,
            percentage_of_base: totalLeadsInBase > 0
              ? ((m.total_leads || 0) / totalLeadsInBase * 100)
              : 0,
            avg_conversion_rate: m.conversion_rate || 0,
            avg_quality_score: (m.avg_match_score || 0) / 20, // Converter para 0-5
            engagement_score: this.calculateEngagementScore(m),
            monetization_potential: this.calculateMonetizationPotential(m)
          })
          .eq('id', persona.id);
      }
    }
  }

  /**
   * Obtém total de leads na base
   */
  private async getTotalLeads(): Promise<number> {
    const { count } = await supabase
      .from('instagram_leads')
      .select('*', { count: 'exact', head: true });

    return count || 0;
  }

  /**
   * Calcula score de engajamento
   */
  private calculateEngagementScore(metrics: any): number {
    const matchScore = metrics.avg_match_score || 0;
    const conversionRate = metrics.conversion_rate || 0;

    // Fórmula: 60% match + 40% conversão
    return (matchScore * 0.6) + (conversionRate * 0.4);
  }

  /**
   * Calcula potencial de monetização
   */
  private calculateMonetizationPotential(metrics: any): number {
    const totalLeads = metrics.total_leads || 0;
    const conversionRate = metrics.conversion_rate || 0;
    const matchScore = metrics.avg_match_score || 0;

    // Fórmula: volume * qualidade * conversão
    const volumeScore = Math.min(totalLeads / 100 * 30, 30); // Max 30 pontos
    const qualityScore = matchScore * 0.4; // Max 40 pontos
    const conversionScore = conversionRate * 0.3; // Max 30 pontos

    return volumeScore + qualityScore + conversionScore;
  }

  /**
   * Recalcula métricas sem gerar novas personas
   */
  async recalculateMetricsOnly(): Promise<{ updated: number }> {
    console.log('\n📊 Recalculando métricas das personas...\n');

    await this.updatePersonaMetrics();

    const { count } = await supabase
      .from('dynamic_personas')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    console.log(`   ✅ ${count} personas atualizadas\n`);

    return { updated: count || 0 };
  }
}

// Exportar instância singleton
export const personaGenerator = new PersonaGeneratorService();
