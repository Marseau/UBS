import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

interface BehavioralInsight {
  pain_points: string[];
  pain_intensity: 'baixa' | 'média' | 'alta' | 'crítica';
  emerging_trends: string[];
  trend_direction: 'crescente' | 'estável' | 'decrescente';
  trend_velocity: number;
  audience_awareness_level: 'inconsciente' | 'consciente_problema' | 'consciente_solucao' | 'pronto_compra';
  buying_stage: 'descoberta' | 'consideração' | 'decisão' | 'pós-compra';
  communication_tone: string;
  approach_recommendations: string[];
  mental_triggers: string[];
  common_objections: string[];
  market_gaps: string[];
  underserved_niches: string[];
  confidence_score: number;
}

/**
 * Serviço de Análise Comportamental via GPT-4
 *
 * Analisa clusters de hashtags para extrair:
 * - Dores e aspirações do público
 * - Tendências emergentes
 * - Perfil psicográfico (consciência, estágio de compra)
 * - Recomendações de abordagem
 * - Oportunidades de mercado
 */
export class BehavioralAnalyzerService {

  /**
   * Analisa um cluster e extrai insights comportamentais profundos
   */
  async analyzeCluster(clusterId: string): Promise<BehavioralInsight | null> {
    console.log(`\n🧠 Analisando comportamento do cluster ${clusterId}...\n`);

    // Buscar dados do cluster
    const { data: cluster, error: clusterError } = await supabase
      .from('hashtag_clusters_dynamic')
      .select('*')
      .eq('id', clusterId)
      .single();

    if (clusterError || !cluster) {
      console.error('❌ Cluster não encontrado:', clusterError);
      return null;
    }

    const hashtags = cluster.hashtags as string[];
    const hashtagList = hashtags.join(', ');

    const prompt = `Você é um psicólogo comportamental e especialista em marketing estratégico.

Analise profundamente este cluster de hashtags do Instagram:

CLUSTER: ${cluster.cluster_name}
DESCRIÇÃO: ${cluster.cluster_description}
HASHTAGS: ${hashtagList}
TOTAL DE LEADS: ${cluster.total_leads}
TAXA DE CONTATO: ${(cluster.avg_contact_rate * 100).toFixed(1)}%

Faça uma análise comportamental PROFUNDA e retorne um JSON com:

{
  "pain_points": ["dor 1", "dor 2", "dor 3"],
  "pain_intensity": "baixa|média|alta|crítica",
  "emerging_trends": ["tendência 1", "tendência 2"],
  "trend_direction": "crescente|estável|decrescente",
  "trend_velocity": 0-100,
  "audience_awareness_level": "inconsciente|consciente_problema|consciente_solucao|pronto_compra",
  "buying_stage": "descoberta|consideração|decisão|pós-compra",
  "communication_tone": "aspiracional|técnico|emocional|educacional",
  "approach_recommendations": ["recomendação 1", "recomendação 2"],
  "mental_triggers": ["escassez", "autoridade", "prova social", ...],
  "common_objections": ["objeção 1", "objeção 2"],
  "market_gaps": ["gap 1", "gap 2"],
  "underserved_niches": ["nicho 1", "nicho 2"],
  "confidence_score": 0.0-1.0
}

INSTRUÇÕES:
1. **Pain Points**: Identifique as 3-5 maiores DORES e FRUSTRAÇÕES que este público enfrenta
2. **Pain Intensity**: Avalie a intensidade emocional das dores (crítica = dores urgentes e profundas)
3. **Emerging Trends**: Detecte tendências emergentes ou mudanças de comportamento
4. **Trend Direction**: Analise se este mercado está crescendo, estável ou decrescendo
5. **Trend Velocity**: Velocidade do crescimento (0-100, onde 100 = crescimento explosivo)
6. **Awareness Level**: Nível de consciência segundo Eugene Schwartz
7. **Buying Stage**: Em que etapa da jornada de compra este público está
8. **Communication Tone**: Qual tom de comunicação ressoa melhor com este público
9. **Approach Recommendations**: Como abordar este público (4-5 estratégias específicas)
10. **Mental Triggers**: Gatilhos mentais mais efetivos para este público
11. **Common Objections**: Principais objeções/resistências à compra
12. **Market Gaps**: Necessidades NÃO atendidas pelo mercado
13. **Underserved Niches**: Sub-nichos promissores dentro deste cluster
14. **Confidence Score**: Sua confiança nesta análise (0.0-1.0)

Retorne APENAS o JSON, sem explicações.`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Você é um psicólogo comportamental e especialista em segmentação de mercado com PhD em Consumer Psychology.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 1500
      });

      const responseText = completion.choices[0]?.message.content || '{}';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);

      let insight: BehavioralInsight;
      try {
        insight = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
      } catch (parseError) {
        console.error('❌ Erro ao parsear resposta GPT-4:', parseError);
        console.error('   Resposta recebida:', responseText);
        return null;
      }

      // Validar campos obrigatórios
      if (!insight.pain_points || !insight.emerging_trends) {
        console.error('❌ Resposta GPT-4 incompleta - campos obrigatórios faltando');
        return null;
      }

      console.log(`✅ Análise comportamental concluída:`);
      console.log(`   🔥 Dores identificadas: ${insight.pain_points.length}`);
      console.log(`   📈 Tendências: ${insight.emerging_trends.length}`);
      console.log(`   🎯 Oportunidades: ${insight.market_gaps.length}`);
      console.log(`   📊 Confiança: ${(insight.confidence_score * 100).toFixed(0)}%\n`);

      return insight;

    } catch (error) {
      console.error('❌ Erro na análise comportamental:', error);
      return null;
    }
  }

  /**
   * Persiste insights no banco de dados
   */
  async persistInsights(clusterId: string, insights: BehavioralInsight, analysisPrompt: string, cost: number): Promise<void> {
    try {
      const insightData = {
        cluster_id: clusterId,
        pain_points: insights.pain_points,
        pain_intensity: insights.pain_intensity,
        emerging_trends: insights.emerging_trends,
        trend_direction: insights.trend_direction,
        trend_velocity: insights.trend_velocity,
        audience_awareness_level: insights.audience_awareness_level,
        buying_stage: insights.buying_stage,
        communication_tone: insights.communication_tone,
        approach_recommendations: insights.approach_recommendations,
        mental_triggers: insights.mental_triggers,
        common_objections: insights.common_objections,
        market_gaps: insights.market_gaps,
        underserved_niches: insights.underserved_niches,
        analyzed_by_model: 'gpt-4',
        analysis_prompt: analysisPrompt,
        analysis_cost_usd: cost,
        confidence_score: insights.confidence_score
      };

      // Verificar se já existe
      const { data: existing } = await supabase
        .from('cluster_behavioral_insights')
        .select('id')
        .eq('cluster_id', clusterId)
        .single();

      if (existing) {
        // Atualizar
        const { error } = await supabase
          .from('cluster_behavioral_insights')
          .update(insightData)
          .eq('cluster_id', clusterId);

        if (error) throw error;
        console.log(`   ✅ Insights atualizados para cluster ${clusterId}`);
      } else {
        // Criar
        const { error } = await supabase
          .from('cluster_behavioral_insights')
          .insert(insightData);

        if (error) throw error;
        console.log(`   ✅ Insights criados para cluster ${clusterId}`);
      }

    } catch (error) {
      console.error(`   ❌ Erro ao persistir insights:`, error);
      throw error;
    }
  }

  /**
   * Analisa todos os clusters ativos
   */
  async analyzeAllClusters(): Promise<void> {
    console.log('\n🚀 INICIANDO ANÁLISE COMPORTAMENTAL DE CLUSTERS\n');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      // Buscar clusters ativos
      const { data: clusters, error } = await supabase
        .from('hashtag_clusters_dynamic')
        .select('id, cluster_name')
        .eq('is_active', true);

      if (error || !clusters) {
        console.error('❌ Erro ao buscar clusters:', error);
        return;
      }

      console.log(`📊 ${clusters.length} clusters ativos para análise\n`);
      console.log(`⚡ Processamento paralelo: ATIVO\n`);

      let totalCost = 0;

      // Processar em paralelo com Promise.all para reduzir tempo drasticamente
      const analysisPromises = clusters.map(async (cluster, index) => {
        // Delay escalonado para não sobrecarregar API (500ms entre cada)
        await new Promise(resolve => setTimeout(resolve, index * 500));

        console.log(`\n📁 [${index + 1}/${clusters.length}] Analisando: ${cluster.cluster_name}`);

        // Analisar cluster
        const insights = await this.analyzeCluster(cluster.id);

        if (insights) {
          // Estimar custo (GPT-4: ~$0.03 por 1k tokens, média 1.5k tokens)
          const estimatedCost = 0.045;

          // Persistir insights
          await this.persistInsights(
            cluster.id,
            insights,
            'Behavioral analysis prompt',
            estimatedCost
          );

          return estimatedCost;
        }

        return 0;
      });

      // Aguardar todas as análises concluírem
      const costs = await Promise.all(analysisPromises);
      totalCost = costs.reduce((sum: number, cost: number) => sum + cost, 0);

      console.log('\n════════════════════════════════════════════════════════════');
      console.log('\n🎉 ANÁLISE COMPORTAMENTAL CONCLUÍDA!\n');
      console.log(`📊 Resumo:`);
      console.log(`   • ${clusters.length} clusters analisados`);
      console.log(`   • Custo total estimado: $${totalCost.toFixed(2)}`);
      console.log(`   • Insights gerados: dores, tendências, oportunidades`);
      console.log(`   • Modelo: GPT-4 (Consumer Psychology Expert)\n`);

    } catch (error) {
      console.error('\n❌ ERRO NA ANÁLISE COMPORTAMENTAL:', error);
      throw error;
    }
  }
}

// Exportar instância singleton
export const behavioralAnalyzer = new BehavioralAnalyzerService();
