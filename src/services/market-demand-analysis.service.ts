/**
 * D2P Framework - Decision-to-Product
 *
 * 100% DINAMICO - Sem mercados hardcoded
 *
 * Pipeline:
 *   MERCADO → EMBEDDING → LEADS SIMILARES → KEYWORDS EXTRAIDAS → WORKAROUNDS → DECISOES → SCORE → PRODUTO
 *
 * Regra de Ouro:
 *   Dor SaaS = decisao humana repetitiva + impacto financeiro
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Dimensao dos embeddings (text-embedding-3-small)
const EMBEDDING_DIMENSION = 1536;

// =============================================================================
// TIPOS D2P
// =============================================================================

interface WorkaroundPattern {
  category: 'FERRAMENTA' | 'CANAL' | 'PROCESSO';
  pattern: string;
  keywords: string[];
  decision_template?: string;
}

interface AnalysisResult {
  pattern: string;
  count: number;
  percentage: number;
}

type ProductType = 'gatekeeper' | 'triage' | 'operational_decision';

interface Friction {
  id: number;
  name: string;
  decision: string;
  sources: string[];
  product_type: ProductType;
  is_dominant: boolean;
}

interface D2PScore {
  frequency: boolean;
  volume: boolean;
  manual: boolean;
  cost: boolean;
  rule: boolean;
  total: number;
}

export interface MarketAnalysis {
  market_name: string;
  market_slug: string;
  keywords_used: string[];
  total_leads: number;
  leads_with_embedding: number;
  embedding_coverage: number;
  workarounds: AnalysisResult[];
  pain_signals: AnalysisResult[];
  frictions: Friction[];
  dominant_pain: string;
  product_type: ProductType;
  product_definition: string;
  product_tagline: string;
  mvp_does: string[];
  mvp_does_not: string[];
  d2p_score: D2PScore;
  checklist: Record<string, boolean>;
  potential_score: number;
  analysis_date?: string;
}

// =============================================================================
// PADROES DE WORKAROUND (UNIVERSAIS - APLICAM A QUALQUER MERCADO)
// =============================================================================

const WORKAROUND_PATTERNS: WorkaroundPattern[] = [
  // Canais improvisados
  { category: 'CANAL', pattern: 'WhatsApp', keywords: ['whatsapp', 'whats', 'zap', 'wa.me'] },
  { category: 'CANAL', pattern: 'DM/Direct', keywords: ['dm', 'direct', 'inbox', 'chama no'] },
  { category: 'CANAL', pattern: 'Link na bio', keywords: ['link na bio', 'link bio', 'linktree'] },

  // Ferramentas manuais
  { category: 'FERRAMENTA', pattern: 'Agenda/Agende', keywords: ['agend', 'agende', 'agenda', 'horario'] },
  { category: 'FERRAMENTA', pattern: 'Consulta/Atendimento', keywords: ['consulta', 'atendimento', 'atendo'] },
  { category: 'FERRAMENTA', pattern: 'Orcamento', keywords: ['orcamento', 'orçamento', 'proposta'] },
  { category: 'FERRAMENTA', pattern: 'Delivery/Entrega', keywords: ['delivery', 'entrega', 'entregas'] },
  { category: 'FERRAMENTA', pattern: 'Reserva', keywords: ['reserv', 'reserva', 'mesa'] },
  { category: 'FERRAMENTA', pattern: 'Pedido', keywords: ['pedido', 'peca', 'encomenda'] },
  { category: 'FERRAMENTA', pattern: 'Online/Digital', keywords: ['online', 'digital', 'remoto'] },

  // Processos de qualificacao
  { category: 'PROCESSO', pattern: 'Aplicacao/Apply', keywords: ['aplicacao', 'apply', 'inscreva', 'formulario'] },
  { category: 'PROCESSO', pattern: 'Diagnostico/Sessao', keywords: ['diagnostico', 'sessao', 'gratuita', 'gratis'] },
  { category: 'PROCESSO', pattern: 'Fale comigo', keywords: ['fale comigo', 'fale conosco', 'entre em contato'] },
  { category: 'PROCESSO', pattern: 'Call/Reuniao', keywords: ['call', 'reuniao', 'meeting'] }
];

const PAIN_PATTERNS: WorkaroundPattern[] = [
  { category: 'PROCESSO', pattern: 'Marque/Agende', keywords: ['marque', 'agende sua', 'agende seu'] },
  { category: 'PROCESSO', pattern: 'Resultado', keywords: ['resultado', 'resultados'] },
  { category: 'PROCESSO', pattern: 'Cliente', keywords: ['cliente', 'clientes'] },
  { category: 'PROCESSO', pattern: 'Venda', keywords: ['venda', 'vendas', 'vender'] },
  { category: 'PROCESSO', pattern: 'Escala', keywords: ['escal', 'escalar', 'escale'] },
  { category: 'PROCESSO', pattern: 'Urgencia', keywords: ['urgent', 'emergencia', 'urgente'] },
  { category: 'PROCESSO', pattern: 'Evento', keywords: ['evento', 'encomenda', 'festa'] },
  { category: 'PROCESSO', pattern: 'Horario', keywords: ['horario', 'disponivel', 'disponibilidade'] },
  { category: 'PROCESSO', pattern: 'Pronta entrega', keywords: ['pronta entrega', 'imediato'] },
  { category: 'PROCESSO', pattern: 'Personalizado', keywords: ['personalizado', 'sob medida', 'exclusivo'] }
];

// =============================================================================
// FUNCOES CORE
// =============================================================================

/**
 * Gera slug a partir do nome
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Gera embedding para um texto usando OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  return response.data[0]?.embedding || [];
}

/**
 * ETAPA 1 - Busca leads similares por embedding (busca vetorial)
 */
async function getLeadsByEmbedding(
  marketName: string,
  limit: number = 2000
): Promise<{ id: string; bio: string; profession?: string; similarity: number }[]> {
  console.log(`[D2P] Gerando embedding para: "${marketName}"`);

  // Gerar embedding do nome do mercado
  const marketEmbedding = await generateEmbedding(marketName);

  if (marketEmbedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Embedding invalido: esperado ${EMBEDDING_DIMENSION} dimensoes, recebido ${marketEmbedding.length}`);
  }

  console.log(`[D2P] Buscando leads similares via pgvector...`);

  // Busca vetorial usando pgvector (cosine similarity)
  const { data, error } = await supabase.rpc('match_leads_by_embedding', {
    query_embedding: marketEmbedding,
    match_threshold: 0.3, // Similaridade minima (0.3 = 30%)
    match_count: limit
  });

  if (error) {
    console.error('[D2P] Erro na busca vetorial:', error);
    throw error;
  }

  console.log(`[D2P] Encontrados ${data?.length || 0} leads similares`);
  return data || [];
}

/**
 * ETAPA 1b - Extrai keywords mais frequentes das bios dos leads
 */
function extractKeywordsFromLeads(
  leads: { bio: string; profession?: string }[],
  topN: number = 20
): string[] {
  // Stopwords em portugues
  const stopwords = new Set([
    'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'por', 'que',
    'na', 'no', 'nas', 'nos', 'um', 'uma', 'uns', 'umas', 'o', 'a', 'os', 'as',
    'seu', 'sua', 'seus', 'suas', 'meu', 'minha', 'meus', 'minhas',
    'voce', 'você', 'te', 'ti', 'lhe', 'nos', 'vos', 'se', 'si',
    'ao', 'aos', 'à', 'às', 'pelo', 'pela', 'pelos', 'pelas',
    'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas',
    'aquele', 'aquela', 'aqueles', 'aquelas', 'isto', 'isso', 'aquilo',
    'mais', 'menos', 'muito', 'muita', 'muitos', 'muitas', 'pouco', 'pouca',
    'todo', 'toda', 'todos', 'todas', 'outro', 'outra', 'outros', 'outras',
    'qual', 'quais', 'quanto', 'quanta', 'quantos', 'quantas',
    'algum', 'alguma', 'alguns', 'algumas', 'nenhum', 'nenhuma',
    'cada', 'qualquer', 'quaisquer', 'tal', 'tais',
    'como', 'quando', 'onde', 'porque', 'porquê', 'pois', 'assim',
    'ser', 'estar', 'ter', 'haver', 'fazer', 'ir', 'vir', 'ver', 'dar',
    'sou', 'somos', 'são', 'era', 'eram', 'foi', 'foram', 'seja', 'sejam',
    'estou', 'está', 'estão', 'estava', 'estavam',
    'tenho', 'tem', 'temos', 'têm', 'tinha', 'tinham',
    'aqui', 'ali', 'lá', 'cá', 'aí', 'onde', 'aonde',
    'bem', 'mal', 'sim', 'não', 'nao', 'já', 'ainda', 'sempre', 'nunca',
    'só', 'so', 'apenas', 'mesmo', 'mesma', 'mesmos', 'mesmas',
    'entre', 'sobre', 'sob', 'ante', 'após', 'até', 'contra', 'desde',
    'www', 'http', 'https', 'com', 'br', 'net', 'org',
    'link', 'bio', 'contato', 'email', 'tel', 'fone', 'whatsapp', 'whats', 'zap',
    'instagram', 'insta', 'face', 'facebook', 'twitter', 'tiktok', 'youtube'
  ]);

  // Contador de palavras
  const wordCount: Record<string, number> = {};

  for (const lead of leads) {
    const text = `${lead.bio || ''} ${lead.profession || ''}`.toLowerCase();

    // Extrair palavras (minimo 3 caracteres)
    const words = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopwords.has(w));

    for (const word of words) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  }

  // Ordenar por frequencia e pegar top N
  const sorted = Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);

  return sorted;
}

/**
 * ETAPA 2 - Extracao de workarounds
 */
function countPatterns(
  leads: { bio: string }[],
  patterns: WorkaroundPattern[]
): AnalysisResult[] {
  const results: AnalysisResult[] = [];
  const totalLeads = leads.length;

  for (const pattern of patterns) {
    let count = 0;
    for (const lead of leads) {
      const bioLower = (lead.bio || '').toLowerCase();
      if (pattern.keywords.some(kw => bioLower.includes(kw.toLowerCase()))) {
        count++;
      }
    }

    if (count > 0) {
      results.push({
        pattern: pattern.pattern,
        count,
        percentage: Math.round((count / totalLeads) * 1000) / 10
      });
    }
  }

  return results.sort((a, b) => b.count - a.count);
}

/**
 * ETAPAS 3-6 - Analise GPT com D2P Framework
 */
async function analyzeWithGPT(
  marketName: string,
  totalLeads: number,
  workarounds: AnalysisResult[],
  painSignals: AnalysisResult[]
): Promise<{
  frictions: Friction[];
  dominant_pain: string;
  product_type: ProductType;
  product_definition: string;
  product_tagline: string;
  mvp_does: string[];
  mvp_does_not: string[];
  d2p_score: D2PScore;
  checklist: Record<string, boolean>;
  potential_score: number;
}> {
  const prompt = `Voce e um analista D2P (Decision-to-Product) especializado em descobrir produtos SaaS a partir de dados comportamentais.

## FRAMEWORK D2P

REGRA FUNDAMENTAL:
- Workaround NAO e a dor
- A dor real e sempre: UMA DECISAO que o humano e forcado a tomar repetidamente, manualmente e sob incerteza
- Produto = "Sistema que decide [X] automaticamente"

TIPOS DE PRODUTO:
- "gatekeeper": Protege recursos escassos (agenda, estoque, tempo, atencao)
- "triage": Classifica entradas caoticas (leads, pedidos, mensagens)
- "operational_decision": Decide acoes operacionais (aceitar pedido, encaixar horario)

SCORE D2P (cada criterio vale 1 ponto):
1. frequency: Acontece todo dia?
2. volume: Acontece varias vezes por dia?
3. manual: Depende de humano decidir?
4. cost: Erro custa tempo ou dinheiro?
5. rule: Da pra transformar em regra simples?

Se score >= 4 = produto candidato forte

## DADOS DO MERCADO: ${marketName}
Total de leads: ${totalLeads}

### WORKAROUNDS DETECTADOS:
${workarounds.slice(0, 12).map(w => `- ${w.pattern}: ${w.count} leads (${w.percentage}%)`).join('\n')}

### SINAIS DE DOR:
${painSignals.slice(0, 10).map(p => `- ${p.pattern}: ${p.count} leads (${p.percentage}%)`).join('\n')}

## TAREFA

Analise os dados e retorne JSON:

{
  "frictions": [
    {
      "id": 1,
      "name": "Nome curto",
      "decision": "A pergunta que o profissional faz varias vezes por dia",
      "sources": ["Workaround1", "Workaround2"],
      "product_type": "gatekeeper|triage|operational_decision",
      "is_dominant": true
    }
  ],
  "dominant_pain": "O [profissional] precisa decidir, via [canal], se [decisao], [frequencia]. Cada erro custa [impacto].",
  "product_type": "gatekeeper|triage|operational_decision",
  "product_definition": "Sistema que decide automaticamente [DECISAO].",
  "product_tagline": "Frase de impacto (max 8 palavras)",
  "mvp_does": ["O que faz (4 itens)"],
  "mvp_does_not": ["O que NAO faz (4 itens)"],
  "d2p_score": {
    "frequency": true/false,
    "volume": true/false,
    "manual": true/false,
    "cost": true/false,
    "rule": true/false,
    "total": 0-5
  },
  "checklist": {
    "recurring_decision": true/false,
    "daily_occurrence": true/false,
    "manual_today": true/false,
    "clear_workaround": true/false,
    "financial_impact": true/false
  },
  "potential_score": 0-100
}

Responda APENAS com o JSON valido.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content || '{}';
  return JSON.parse(content);
}

// =============================================================================
// FUNCOES EXPORTADAS
// =============================================================================

/**
 * Analisa mercado por nome (100% dinamico via embedding)
 *
 * Pipeline:
 * 1. Gera embedding do nome do mercado
 * 2. Busca leads similares via pgvector
 * 3. Extrai keywords das bios dos leads encontrados
 * 4. Analisa workarounds e sinais de dor
 * 5. GPT traduz em decisoes e define produto
 */
export async function analyzeMarket(marketName: string): Promise<MarketAnalysis> {
  const marketSlug = generateSlug(marketName);

  console.log(`[D2P] ========================================`);
  console.log(`[D2P] Iniciando analise: ${marketName}`);
  console.log(`[D2P] ========================================`);

  // ETAPA 1 - Buscar leads similares via embedding
  console.log(`[D2P] ETAPA 1: Busca vetorial por similaridade...`);
  const leadsWithSimilarity = await getLeadsByEmbedding(marketName, 2000);

  if (leadsWithSimilarity.length < 30) {
    throw new Error(`Base insuficiente: ${leadsWithSimilarity.length} leads similares. Tente um nome de mercado mais generico.`);
  }

  // Converter para formato esperado
  const leads = leadsWithSimilarity.map(l => ({
    id: l.id,
    bio: l.bio,
    profession: l.profession,
    has_embedding: true // Todos tem embedding (vieram da busca vetorial)
  }));

  const avgSimilarity = leadsWithSimilarity.reduce((sum, l) => sum + l.similarity, 0) / leadsWithSimilarity.length;
  console.log(`[D2P] Etapa 1: ${leads.length} leads (similaridade media: ${(avgSimilarity * 100).toFixed(1)}%)`);

  // ETAPA 1b - Extrair keywords das bios
  console.log(`[D2P] ETAPA 1b: Extraindo keywords das bios...`);
  const extractedKeywords = extractKeywordsFromLeads(leads, 20);
  console.log(`[D2P] Keywords extraidas: ${extractedKeywords.slice(0, 10).join(', ')}...`);

  // Metricas de embedding (todos tem embedding neste fluxo)
  const leadsWithEmbedding = leads.length;
  const embeddingCoverage = 100;

  // ETAPA 2 - Workarounds
  console.log(`[D2P] ETAPA 2: Detectando workarounds...`);
  const workarounds = countPatterns(leads, WORKAROUND_PATTERNS);
  console.log(`[D2P] Etapa 2: ${workarounds.length} workarounds detectados`);

  // ETAPA 2b - Sinais de dor
  console.log(`[D2P] ETAPA 2b: Detectando sinais de dor...`);
  const painSignals = countPatterns(leads, PAIN_PATTERNS);
  console.log(`[D2P] Etapa 2b: ${painSignals.length} sinais de dor detectados`);

  // ETAPAS 3-6 - GPT
  console.log(`[D2P] ETAPAS 3-6: Analise GPT (traducao para decisoes)...`);
  const gptAnalysis = await analyzeWithGPT(marketName, leads.length, workarounds, painSignals);

  // Montar resultado
  const analysis: MarketAnalysis = {
    market_name: marketName,
    market_slug: marketSlug,
    keywords_used: extractedKeywords,
    total_leads: leads.length,
    leads_with_embedding: leadsWithEmbedding,
    embedding_coverage: embeddingCoverage,
    workarounds,
    pain_signals: painSignals,
    ...gptAnalysis
  };

  // Salvar no banco
  const { error } = await supabase
    .from('market_demand_analysis')
    .upsert({
      market_name: analysis.market_name,
      market_slug: analysis.market_slug,
      keywords_used: analysis.keywords_used,
      total_leads: analysis.total_leads,
      leads_with_embedding: analysis.leads_with_embedding,
      embedding_coverage: analysis.embedding_coverage,
      workarounds: analysis.workarounds,
      pain_signals: analysis.pain_signals,
      frictions: analysis.frictions,
      dominant_pain: analysis.dominant_pain,
      product_type: analysis.product_type,
      product_definition: analysis.product_definition,
      product_tagline: analysis.product_tagline,
      mvp_does: analysis.mvp_does,
      mvp_does_not: analysis.mvp_does_not,
      d2p_score: analysis.d2p_score,
      checklist: analysis.checklist,
      potential_score: analysis.potential_score,
      status: 'analyzed',
      analysis_date: new Date().toISOString()
    }, {
      onConflict: 'market_slug'
    });

  if (error) {
    console.error('[D2P] Erro ao salvar:', error);
    throw error;
  }

  console.log(`[D2P] Concluido: ${marketName} | Score: ${analysis.potential_score} | D2P: ${analysis.d2p_score.total}/5`);
  return analysis;
}

/**
 * Busca analise salva
 */
export async function getMarketAnalysis(marketSlug: string): Promise<MarketAnalysis | null> {
  const { data, error } = await supabase
    .from('market_demand_analysis')
    .select('*')
    .eq('market_slug', marketSlug)
    .single();

  if (error || !data) return null;
  return data as MarketAnalysis;
}

/**
 * Lista todas as analises
 */
export async function listMarketAnalyses(): Promise<MarketAnalysis[]> {
  const { data, error } = await supabase
    .from('market_demand_analysis')
    .select('*')
    .order('potential_score', { ascending: false });

  if (error) throw error;
  return (data || []) as MarketAnalysis[];
}

/**
 * Deleta uma analise
 */
export async function deleteMarketAnalysis(marketSlug: string): Promise<void> {
  const { error } = await supabase
    .from('market_demand_analysis')
    .delete()
    .eq('market_slug', marketSlug);

  if (error) throw error;
}

export default {
  analyzeMarket,
  getMarketAnalysis,
  listMarketAnalyses,
  deleteMarketAnalysis
};
