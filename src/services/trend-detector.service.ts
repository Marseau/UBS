import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface HashtagFrequency {
  hashtag: string;
  frequency: number;
  period: string;
}

interface TrendData {
  hashtag: string;
  current_frequency: number;
  previous_frequency: number;
  growth_rate: number;
  trend_type: 'emergente' | 'crescente' | 'viral' | 'estável' | 'decrescente' | 'morta';
  velocity: 'muito_rapida' | 'rapida' | 'moderada' | 'lenta';
  cluster_id?: string;
}

/**
 * Serviço de Detecção de Tendências
 *
 * Identifica hashtags emergentes e mudanças de comportamento:
 * - Crescimento >50% = emergente
 * - Crescimento >200% = viral
 * - Compara períodos: 7d, 30d, 90d
 * - Classifica velocidade: muito_rápida → lenta
 */
export class TrendDetectorService {

  /**
   * Busca frequência de hashtags em um período específico
   */
  async getHashtagFrequencies(daysAgo: number): Promise<HashtagFrequency[]> {
    const periodName = `${daysAgo}d`;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH hashtag_occurrences AS (
          SELECT
            hashtag,
            il.created_at
          FROM instagram_leads il, jsonb_array_elements_text(hashtags_bio) as hashtag
          WHERE hashtags_bio IS NOT NULL
            AND il.created_at >= '${cutoffDate.toISOString()}'
          UNION ALL
          SELECT
            hashtag,
            il.created_at
          FROM instagram_leads il, jsonb_array_elements_text(hashtags_posts) as hashtag
          WHERE hashtags_posts IS NOT NULL
            AND il.created_at >= '${cutoffDate.toISOString()}'
        )
        SELECT
          hashtag,
          COUNT(*) as frequency
        FROM hashtag_occurrences
        GROUP BY hashtag
        HAVING COUNT(*) >= 2
        ORDER BY COUNT(*) DESC
      `
    });

    if (error) {
      console.error(`❌ Erro ao buscar frequências (${periodName}):`, error);
      return [];
    }

    return data.map((row: any) => ({
      hashtag: row.hashtag,
      frequency: row.frequency,
      period: periodName
    }));
  }

  /**
   * Encontra o cluster ao qual uma hashtag pertence
   */
  async findClusterForHashtag(hashtag: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('hashtag_clusters_dynamic')
      .select('id, hashtags')
      .eq('is_active', true);

    if (error || !data) return null;

    for (const cluster of data) {
      const hashtags = cluster.hashtags as string[];
      if (hashtags.includes(hashtag)) {
        return cluster.id;
      }
    }

    return null;
  }

  /**
   * Classifica tipo de tendência baseado na taxa de crescimento
   */
  classifyTrendType(growthRate: number): TrendData['trend_type'] {
    if (growthRate >= 200) return 'viral';
    if (growthRate >= 50) return 'emergente';
    if (growthRate >= 20) return 'crescente';
    if (growthRate >= -20) return 'estável';
    if (growthRate >= -50) return 'decrescente';
    return 'morta';
  }

  /**
   * Classifica velocidade do crescimento
   */
  classifyVelocity(growthRate: number): TrendData['velocity'] {
    if (growthRate >= 150) return 'muito_rapida';
    if (growthRate >= 75) return 'rapida';
    if (growthRate >= 30) return 'moderada';
    return 'lenta';
  }

  /**
   * Detecta tendências comparando dois períodos
   */
  async detectTrends(
    currentPeriod: number = 30,
    previousPeriod: number = 60
  ): Promise<TrendData[]> {
    console.log(`\n📈 Detectando tendências (${currentPeriod}d vs ${previousPeriod}d)...\n`);

    // Buscar frequências nos dois períodos
    const currentFreqs = await this.getHashtagFrequencies(currentPeriod);
    const previousFreqs = await this.getHashtagFrequencies(previousPeriod);

    console.log(`   • Período atual: ${currentFreqs.length} hashtags`);
    console.log(`   • Período anterior: ${previousFreqs.length} hashtags\n`);

    // Criar mapa de frequências anteriores
    const prevMap = new Map<string, number>();
    previousFreqs.forEach(h => prevMap.set(h.hashtag, h.frequency));

    // Calcular tendências
    const trends: TrendData[] = [];

    for (const current of currentFreqs) {
      const previous = prevMap.get(current.hashtag) || 0;

      // Normalizar por período (ajustar para mesma janela temporal)
      const normalizedPrevious = previous * (currentPeriod / previousPeriod);

      // Calcular crescimento
      const growthRate = normalizedPrevious > 0
        ? ((current.frequency - normalizedPrevious) / normalizedPrevious) * 100
        : current.frequency > 5 ? 100 : 0; // Nova hashtag

      // Encontrar cluster
      const clusterId = await this.findClusterForHashtag(current.hashtag);

      const trendType = this.classifyTrendType(growthRate);
      const velocity = this.classifyVelocity(growthRate);

      trends.push({
        hashtag: current.hashtag,
        current_frequency: current.frequency,
        previous_frequency: Math.round(normalizedPrevious),
        growth_rate: parseFloat(growthRate.toFixed(2)),
        trend_type: trendType,
        velocity: velocity,
        cluster_id: clusterId || undefined
      });
    }

    // Ordenar por crescimento
    trends.sort((a, b) => b.growth_rate - a.growth_rate);

    return trends;
  }

  /**
   * Persiste tendências no banco
   */
  async persistTrends(trends: TrendData[], periodAnalyzed: string): Promise<void> {
    console.log('\n💾 Persistindo tendências detectadas...\n');

    let emergentes = 0;
    let virais = 0;
    let crescentes = 0;

    for (const trend of trends) {
      try {
        const trendData = {
          hashtag: trend.hashtag,
          cluster_id: trend.cluster_id,
          current_frequency: trend.current_frequency,
          previous_frequency: trend.previous_frequency,
          growth_rate: trend.growth_rate,
          trend_type: trend.trend_type,
          velocity: trend.velocity,
          period_analyzed: periodAnalyzed,
          detected_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('hashtag_trends')
          .insert(trendData);

        if (error) {
          // Ignorar duplicatas
          if (!error.message.includes('duplicate key')) {
            throw error;
          }
        } else {
          if (trend.trend_type === 'emergente') emergentes++;
          if (trend.trend_type === 'viral') virais++;
          if (trend.trend_type === 'crescente') crescentes++;
        }

      } catch (error) {
        console.error(`   ❌ Erro ao persistir ${trend.hashtag}:`, error);
      }
    }

    console.log(`✅ Tendências persistidas:`);
    console.log(`   🔥 Virais: ${virais}`);
    console.log(`   📈 Emergentes: ${emergentes}`);
    console.log(`   ⬆️  Crescentes: ${crescentes}\n`);
  }

  /**
   * Executa detecção completa de tendências
   */
  async executeTrendDetection(): Promise<void> {
    console.log('\n🚀 INICIANDO DETECÇÃO DE TENDÊNCIAS\n');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      // Detectar tendências em múltiplos períodos
      const periods = [
        { current: 7, previous: 14, name: '7d' },
        { current: 30, previous: 60, name: '30d' },
        { current: 90, previous: 180, name: '90d' }
      ];

      for (const period of periods) {
        console.log(`\n📊 Analisando período: ${period.name}\n`);

        const trends = await this.detectTrends(period.current, period.previous);

        // Filtrar apenas tendências relevantes (crescimento >50% ou decrescimento >50%)
        const relevantTrends = trends.filter(t =>
          Math.abs(t.growth_rate) >= 50 || t.trend_type === 'viral'
        );

        console.log(`   ✅ ${relevantTrends.length} tendências relevantes detectadas\n`);

        if (relevantTrends.length > 0) {
          // Mostrar top 5
          console.log(`   🔝 Top 5 em crescimento:`);
          relevantTrends.slice(0, 5).forEach((t, i) => {
            console.log(`      ${i + 1}. ${t.hashtag}: +${t.growth_rate.toFixed(0)}% (${t.trend_type})`);
          });
          console.log('');

          await this.persistTrends(relevantTrends, period.name);
        }

        // Delay entre períodos
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log('\n════════════════════════════════════════════════════════════');
      console.log('\n🎉 DETECÇÃO DE TENDÊNCIAS CONCLUÍDA!\n');
      console.log(`📊 Resumo:`);
      console.log(`   • 3 períodos analisados (7d, 30d, 90d)`);
      console.log(`   • Crescimento >50% = emergente`);
      console.log(`   • Crescimento >200% = viral`);
      console.log(`   • Sistema: 100% automatizado\n`);

    } catch (error) {
      console.error('\n❌ ERRO NA DETECÇÃO DE TENDÊNCIAS:', error);
      throw error;
    }
  }
}

// Exportar instância singleton
export const trendDetector = new TrendDetectorService();
