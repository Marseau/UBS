import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Interface para sugestões de hashtags baseadas em co-ocorrência
 */
export interface HashtagSuggestion {
  hashtag: string;
  cooccurrence_count: number;
  source_hashtags: string[];
  confidence_score: number;
  estimated_leads: number;
  already_scraped: boolean;
}

/**
 * Interface para resultado de análise de co-ocorrência
 */
export interface CooccurrenceAnalysis {
  input_hashtags: string[];
  suggestions: HashtagSuggestion[];
  total_suggestions: number;
  high_confidence: HashtagSuggestion[];
  medium_confidence: HashtagSuggestion[];
  low_confidence: HashtagSuggestion[];
}

/**
 * Classe para sugerir novos termos de scraping baseados em co-ocorrência de hashtags
 */
export class HashtagCooccurrenceSuggester {
  /**
   * Analisa hashtags de um lead e sugere novos termos de busca
   * @param leadHashtags - Hashtags extraídas de um lead (bio ou posts)
   * @param minCooccurrence - Mínimo de co-ocorrências para considerar (default: 10)
   * @param maxSuggestions - Número máximo de sugestões (default: 20)
   */
  async suggestFromHashtags(
    leadHashtags: string[],
    minCooccurrence: number = 10,
    maxSuggestions: number = 20
  ): Promise<CooccurrenceAnalysis> {
    console.log(`\n🔍 Analisando co-ocorrência para ${leadHashtags.length} hashtags...`);

    // Normalizar hashtags (remover #, lowercase)
    const normalizedHashtags = leadHashtags.map(h =>
      h.toLowerCase().replace(/^#/, '').replace(/"/g, '')
    );

    // Buscar termos já scrapeados
    const { data: scrapedTerms } = await supabase
      .from('instagram_leads')
      .select('search_term_used')
      .not('search_term_used', 'is', null);

    const scrapedSet = new Set(
      scrapedTerms?.map(t => t.search_term_used?.toLowerCase().replace(/\s/g, '')) || []
    );

    // Query para encontrar hashtags co-ocorrentes
    const suggestions = await this.findCooccurrentHashtags(
      normalizedHashtags,
      minCooccurrence,
      maxSuggestions * 2 // Buscar mais para filtrar depois
    );

    // Filtrar e enriquecer sugestões
    const enrichedSuggestions: HashtagSuggestion[] = suggestions
      .map(s => ({
        hashtag: s.hashtag,
        cooccurrence_count: s.cooccurrence,
        source_hashtags: s.source_hashtags,
        confidence_score: this.calculateConfidenceScore(
          s.cooccurrence,
          s.source_hashtags.length,
          normalizedHashtags.length
        ),
        estimated_leads: s.estimated_leads,
        already_scraped: scrapedSet.has(s.hashtag.toLowerCase().replace(/\s/g, ''))
      }))
      .sort((a, b) => b.confidence_score - a.confidence_score)
      .slice(0, maxSuggestions);

    // Classificar por confiança
    const highConfidence = enrichedSuggestions.filter(s => s.confidence_score >= 0.7 && !s.already_scraped);
    const mediumConfidence = enrichedSuggestions.filter(s => s.confidence_score >= 0.4 && s.confidence_score < 0.7 && !s.already_scraped);
    const lowConfidence = enrichedSuggestions.filter(s => s.confidence_score < 0.4 && !s.already_scraped);

    console.log(`✅ Encontradas ${enrichedSuggestions.length} sugestões:`);
    console.log(`   🔥 Alta confiança: ${highConfidence.length}`);
    console.log(`   🟡 Média confiança: ${mediumConfidence.length}`);
    console.log(`   ⚪ Baixa confiança: ${lowConfidence.length}`);

    return {
      input_hashtags: normalizedHashtags,
      suggestions: enrichedSuggestions,
      total_suggestions: enrichedSuggestions.length,
      high_confidence: highConfidence,
      medium_confidence: mediumConfidence,
      low_confidence: lowConfidence
    };
  }

  /**
   * Busca hashtags que aparecem frequentemente junto com as hashtags fornecidas
   */
  private async findCooccurrentHashtags(
    inputHashtags: string[],
    minCooccurrence: number,
    limit: number
  ): Promise<Array<{
    hashtag: string;
    cooccurrence: number;
    source_hashtags: string[];
    estimated_leads: number;
  }>> {
    const hashtagsQuoted = inputHashtags.map(h => `"${h}"`).join(',');

    // Query complexa para encontrar co-ocorrências
    const query = `
      WITH input_hashtags AS (
        SELECT unnest(ARRAY[${hashtagsQuoted}]) as hashtag
      ),
      leads_with_input AS (
        SELECT DISTINCT il.id
        FROM instagram_leads il,
             jsonb_array_elements_text(il.hashtags_posts) h
        WHERE LOWER(REPLACE(h::text, '"', '')) IN (
          SELECT LOWER(hashtag) FROM input_hashtags
        )
      ),
      cooccurrent_hashtags AS (
        SELECT
          LOWER(REPLACE(h::text, '"', '')) as hashtag,
          COUNT(*) as cooccurrence,
          ARRAY_AGG(DISTINCT ih.hashtag) as source_hashtags
        FROM instagram_leads il
        INNER JOIN leads_with_input lwi ON il.id = lwi.id
        CROSS JOIN jsonb_array_elements_text(il.hashtags_posts) h
        CROSS JOIN input_hashtags ih
        WHERE il.hashtags_posts IS NOT NULL
          AND LOWER(REPLACE(h::text, '"', '')) NOT IN (
            SELECT LOWER(hashtag) FROM input_hashtags
          )
        GROUP BY LOWER(REPLACE(h::text, '"', ''))
        HAVING COUNT(*) >= ${minCooccurrence}
      ),
      hashtag_frequencies AS (
        SELECT
          LOWER(REPLACE(h::text, '"', '')) as hashtag,
          COUNT(DISTINCT il.id) as total_leads
        FROM instagram_leads il,
             jsonb_array_elements_text(il.hashtags_posts) h
        WHERE il.hashtags_posts IS NOT NULL
        GROUP BY LOWER(REPLACE(h::text, '"', ''))
      )
      SELECT
        ch.hashtag,
        ch.cooccurrence,
        ch.source_hashtags,
        COALESCE(hf.total_leads, 0) as estimated_leads
      FROM cooccurrent_hashtags ch
      LEFT JOIN hashtag_frequencies hf ON ch.hashtag = hf.hashtag
      ORDER BY ch.cooccurrence DESC, hf.total_leads DESC
      LIMIT ${limit}
    `;

    const { data, error } = await supabase.rpc('exec_sql', { sql: query });

    if (error) {
      console.error('❌ Erro ao buscar co-ocorrências:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Calcula score de confiança para uma sugestão (0-1)
   * Leva em conta:
   * - Número de co-ocorrências
   * - Número de hashtags de origem que geraram a sugestão
   * - Proporção em relação às hashtags de entrada
   */
  private calculateConfidenceScore(
    cooccurrence: number,
    sourceHashtagsCount: number,
    inputHashtagsCount: number
  ): number {
    // Peso da co-ocorrência (normalizado entre 0-1)
    const cooccurrenceScore = Math.min(cooccurrence / 50, 1); // 50+ co-ocorrências = score máximo

    // Peso da cobertura de hashtags de origem
    const coverageScore = sourceHashtagsCount / inputHashtagsCount;

    // Combinação ponderada: 70% co-ocorrência, 30% cobertura
    const finalScore = cooccurrenceScore * 0.7 + Math.min(coverageScore, 1) * 0.3;

    return Math.round(finalScore * 100) / 100;
  }

  /**
   * Sugere hashtags para scraping baseado em um lead recém-coletado
   * @param leadId - ID do lead no Supabase
   * @param autoAdd - Se true, adiciona automaticamente termos de alta confiança à fila
   */
  async suggestFromLead(
    leadId: string,
    autoAdd: boolean = false
  ): Promise<CooccurrenceAnalysis> {
    console.log(`\n📌 Analisando lead ${leadId} para sugestões...`);

    // Buscar hashtags do lead
    const { data: lead, error } = await supabase
      .from('instagram_leads')
      .select('username, hashtags_bio, hashtags_posts')
      .eq('id', leadId)
      .single();

    if (error || !lead) {
      throw new Error(`Lead ${leadId} não encontrado`);
    }

    // Combinar hashtags de bio e posts
    const allHashtags: string[] = [
      ...(lead.hashtags_bio || []),
      ...(lead.hashtags_posts || [])
    ];

    if (allHashtags.length === 0) {
      console.log(`⚠️  Lead @${lead.username} não possui hashtags`);
      return {
        input_hashtags: [],
        suggestions: [],
        total_suggestions: 0,
        high_confidence: [],
        medium_confidence: [],
        low_confidence: []
      };
    }

    console.log(`   📊 @${lead.username} tem ${allHashtags.length} hashtags`);

    // Gerar sugestões
    const analysis = await this.suggestFromHashtags(allHashtags);

    // Auto-adicionar termos de alta confiança (se solicitado)
    if (autoAdd && analysis.high_confidence.length > 0) {
      console.log(`\n🤖 Auto-adicionando ${analysis.high_confidence.length} termos de alta confiança...`);
      // TODO: Implementar adição automática à tabela de search_terms ou fila de scraping
      // Por enquanto apenas loga
      analysis.high_confidence.forEach(s => {
        console.log(`   ➕ #${s.hashtag} (score: ${s.confidence_score}, leads estimados: ${s.estimated_leads})`);
      });
    }

    return analysis;
  }

  /**
   * Análise em lote: sugere hashtags para múltiplos leads
   * Útil para análise de leads recém-scrapeados de uma tag
   */
  async suggestFromMultipleLeads(
    leadIds: string[],
    consolidate: boolean = true
  ): Promise<CooccurrenceAnalysis[]> {
    console.log(`\n📦 Analisando ${leadIds.length} leads em lote...`);

    const analyses: CooccurrenceAnalysis[] = [];

    for (const leadId of leadIds) {
      try {
        const analysis = await this.suggestFromLead(leadId, false);
        analyses.push(analysis);
      } catch (error) {
        console.error(`❌ Erro ao processar lead ${leadId}:`, error);
      }
    }

    if (consolidate) {
      return [this.consolidateAnalyses(analyses)];
    }

    return analyses;
  }

  /**
   * Consolida múltiplas análises em uma única
   * Agrupa sugestões comuns e recalcula scores
   */
  private consolidateAnalyses(analyses: CooccurrenceAnalysis[]): CooccurrenceAnalysis {
    const suggestionMap = new Map<string, HashtagSuggestion>();

    // Agregar todas as sugestões
    for (const analysis of analyses) {
      for (const suggestion of analysis.suggestions) {
        const existing = suggestionMap.get(suggestion.hashtag);

        if (existing) {
          // Atualizar sugestão existente
          existing.cooccurrence_count += suggestion.cooccurrence_count;
          existing.source_hashtags = [
            ...new Set([...existing.source_hashtags, ...suggestion.source_hashtags])
          ];
          existing.confidence_score = Math.max(existing.confidence_score, suggestion.confidence_score);
          existing.estimated_leads = Math.max(existing.estimated_leads, suggestion.estimated_leads);
        } else {
          suggestionMap.set(suggestion.hashtag, { ...suggestion });
        }
      }
    }

    // Converter para array e ordenar
    const consolidatedSuggestions = Array.from(suggestionMap.values())
      .sort((a, b) => b.confidence_score - a.confidence_score);

    // Classificar por confiança
    const highConfidence = consolidatedSuggestions.filter(s => s.confidence_score >= 0.7 && !s.already_scraped);
    const mediumConfidence = consolidatedSuggestions.filter(s => s.confidence_score >= 0.4 && s.confidence_score < 0.7 && !s.already_scraped);
    const lowConfidence = consolidatedSuggestions.filter(s => s.confidence_score < 0.4 && !s.already_scraped);

    // Combinar todas as hashtags de entrada
    const allInputHashtags = analyses.flatMap(a => a.input_hashtags);
    const uniqueInputHashtags = [...new Set(allInputHashtags)];

    return {
      input_hashtags: uniqueInputHashtags,
      suggestions: consolidatedSuggestions,
      total_suggestions: consolidatedSuggestions.length,
      high_confidence: highConfidence,
      medium_confidence: mediumConfidence,
      low_confidence: lowConfidence
    };
  }
}

// Exportar instância singleton
export const hashtagSuggester = new HashtagCooccurrenceSuggester();
