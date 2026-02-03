/**
 * D2P Unified Service - Decision-to-Product Framework
 *
 * Architecture:
 * - Node.js generates market embedding (OpenAI) and searches pgvector (RPC)
 * - Python does BERTopic clustering + friction detection + D2P scoring
 *
 * Pipeline:
 *   API Request → OpenAI embedding → pgvector RPC → Python (BERTopic) → Save to DB
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import * as path from 'path';

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ==============================================================================
// TYPES
// ==============================================================================

export interface AnalysisParams {
  minSimilarity?: number;  // Default: 0.65
  minLeads?: number;       // Default: 100
  viewMode?: 'empresa' | 'cliente';  // Default: 'empresa'
}

interface PgvectorLead {
  lead_id: string;
  username: string;
  bio: string;
  profession: string;
  business_category: string;
  similarity: number;
}

export interface FrictionUnit {
  topic_id: number;
  label: string;
  count: number;
  percentage: number;
  keywords: string[];
  representative_bios: string[];
  decision: string;
  friction: string;
  product_type: string;
  friction_score: number;
  is_friction: boolean;
  detected_workarounds: string[];
  detected_professions: string[];
  has_volume_signal: boolean;
  has_frequency_signal: boolean;
}

export interface D2PScore {
  frequency: boolean;
  volume: boolean;
  manual: boolean;
  cost: boolean;
  rule: boolean;
  total: number;
}

export interface D2PProduct {
  suggested_name: string;
  product_definition: string;
  tagline: string;
  one_liner: string;
  type: string;
  type_name: string;
  type_description: string;
  value_proposition: string;
  mvp_does: string[];
  mvp_does_not: string[];
  target_market: string;
  core_decision: string;
  core_friction: string;
  replaced_tools: string[];
  d2p_score: number;
  d2p_verdict: string;
  is_viable: boolean;
}

export interface D2PAnalysis {
  id: string;
  market_name: string;
  market_slug: string;
  version_id: string;
  version_number: number;
  parent_version_id: string | null;
  is_latest: boolean;
  search_params: AnalysisParams;
  leads_searched: number;
  leads_selected: number;
  leads_with_embedding: number;
  embedding_coverage: number;
  min_similarity: number;
  similarity_threshold: number;
  avg_similarity: number;
  topics_discovered: number;
  topics_detail: { topic_id: number; label: string; count: number; keywords: string[] }[];
  coverage_percentage: number;
  friction_units: FrictionUnit[];
  friction_count: number;
  total_friction_score: number;
  avg_friction_score: number;
  friction_density: number;
  dominant_pain: string | null;
  dominant_decision: string | null;
  product_type: string | null;
  product_type_name: string | null;
  product_definition: string | null;
  product_tagline: string | null;
  mvp_does: string[] | null;
  mvp_does_not: string[] | null;
  d2p_score: D2PScore | null;
  d2p_binary_score: any | null;
  product_potential_score: number | null;
  product: D2PProduct | null;
  workaround_tools: string[] | null;
  detected_workarounds: string[] | null;
  detected_professions: string[] | null;
  status: string;
  error_message: string | null;
  analysis_duration_ms: number | null;
  created_at: string;
}

export interface MarketSummary {
  market_slug: string;
  market_name: string;
  latest_version_id: string;
  version_count: number;
  latest_analysis_at: string;
  latest_leads_searched: number;
  latest_topics_discovered: number | null;
  latest_product_potential: number | null;
  view_mode: string;
}

export interface VersionComparison {
  v1: D2PAnalysis;
  v2: D2PAnalysis;
  changes: {
    leads_delta: number;
    topics_delta: number;
    friction_delta: number;
    potential_delta: number;
    new_frictions: string[];
    removed_frictions: string[];
  };
}

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function addCompatibilityFields(data: any): D2PAnalysis {
  const d2pScore = data.d2p_score || {};
  const isBinaryScore = typeof d2pScore.frequency !== 'undefined';

  return {
    ...data,
    leads_with_embedding: data.leads_selected || 0,
    embedding_coverage: data.leads_selected > 0 ? 100 : 0,
    detected_workarounds: data.workarounds || [],
    detected_professions: data.pain_signals || [],
    dominant_decision: isBinaryScore
      ? (data.friction_units?.[0]?.decision || data.dominant_pain)
      : null,
    product_type_name: isBinaryScore
      ? { gatekeeper: 'Gatekeeper', triage: 'Triage', operational_decision: 'Decisao Operacional' }[data.product_type as string] || data.product_type
      : null,
    d2p_binary_score: isBinaryScore ? {
      scores: d2pScore,
      total: d2pScore.total || 0,
      max_score: 5,
      is_product_candidate: (d2pScore.total || 0) >= 4,
      verdict: (d2pScore.total || 0) >= 4 ? 'EXCELENTE' : (d2pScore.total || 0) >= 3 ? 'MODERADO' : 'FRACO'
    } : null,
    product: data.product_definition ? {
      suggested_name: `${data.product_type === 'gatekeeper' ? 'Gate' : data.product_type === 'triage' ? 'Sort' : 'Auto'}${(data.market_name || '').split(' ')[0]?.slice(0,4) || 'Biz'}`,
      product_definition: data.product_definition,
      tagline: data.product_tagline,
      one_liner: `${data.product_type === 'gatekeeper' ? 'Decide automaticamente quem/o que passa' : data.product_type === 'triage' ? 'Prioriza automaticamente por criterios' : 'Responde perguntas operacionais'} para ${(data.market_name || '').toLowerCase()}`,
      type: data.product_type,
      type_name: { gatekeeper: 'Gatekeeper', triage: 'Triage', operational_decision: 'Decisao Operacional' }[data.product_type as string] || data.product_type,
      type_description: data.product_type === 'gatekeeper' ? 'Protege recursos escassos' : data.product_type === 'triage' ? 'Classifica entradas caoticas' : 'Decide acoes operacionais',
      value_proposition: data.product_type === 'gatekeeper' ? 'Decide automaticamente quem/o que passa' : data.product_type === 'triage' ? 'Prioriza automaticamente por criterios definidos' : 'Responde "posso/nao posso" automaticamente',
      mvp_does: data.mvp_does || [],
      mvp_does_not: data.mvp_does_not || [],
      target_market: data.market_name,
      core_decision: data.friction_units?.[0]?.decision || data.dominant_pain || '',
      core_friction: data.dominant_pain || '',
      replaced_tools: data.workaround_tools || [],
      d2p_score: d2pScore.total || 0,
      d2p_verdict: (d2pScore.total || 0) >= 4 ? 'EXCELENTE' : (d2pScore.total || 0) >= 3 ? 'MODERADO' : 'FRACO',
      is_viable: (d2pScore.total || 0) >= 4
    } : null
  } as D2PAnalysis;
}

// ==============================================================================
// PGVECTOR SEARCH (NEW)
// ==============================================================================

/**
 * Generate embedding for market name via OpenAI
 */
/**
 * Generate embedding for market search.
 * Strategy: find a reference lead whose d2p_text starts with the market name
 * and use its actual embedding_d2p (same vector space as stored embeddings).
 * Fallback: generate via OpenAI.
 */
async function generateMarketEmbedding(
  marketName: string
): Promise<number[]> {
  // Use a real embedding_d2p from a matching lead as reference vector.
  // This ensures the query is in the same vector space as stored D2P embeddings
  // (which encode "profession. category. bio snippet").
  const { data: refData } = await supabase.rpc('get_reference_d2p_embedding' as any, {
    market_query: marketName
  });

  if (refData && refData.length > 0 && refData[0].embedding) {
    console.log(`[D2P] Using reference embedding from DB (d2p_text match for "${marketName}")`);
    const raw = refData[0].embedding;
    if (typeof raw === 'string') {
      return JSON.parse(raw);
    }
    return raw as number[];
  }

  // Fallback: Generate via OpenAI (for brand-new markets not in DB)
  console.log(`[D2P] No reference lead found, generating embedding via OpenAI`);
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: marketName
  });

  return response.data[0]!.embedding;
}

/**
 * Search leads using pgvector RPC with embedding_d2p
 */
async function searchLeadsForD2P(
  queryEmbedding: number[],
  minSimilarity: number
): Promise<PgvectorLead[]> {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  const pageSize = 1000;

  // Step 1: Run full vector search and store results in staging table.
  // This bypasses PostgREST's 1000 row cap — the INSERT happens server-side.
  console.log(`[D2P] Running d2p_search_and_store (SECURITY DEFINER, 60s timeout)...`);

  const { data: storeResult, error: storeError } = await supabase.rpc('d2p_search_and_store', {
    query_embedding: embeddingStr,
    min_similarity: minSimilarity
  });

  if (storeError) {
    throw new Error(`d2p_search_and_store failed: ${storeError.message}`);
  }

  const sessionId = storeResult?.[0]?.session_id;
  const totalCount = storeResult?.[0]?.total_count ?? 0;

  if (!sessionId || totalCount === 0) {
    console.log(`[D2P] No leads found above similarity threshold ${minSimilarity}`);
    return [];
  }

  console.log(`[D2P] Stored ${totalCount} leads in session ${sessionId}. Reading pages...`);

  // Step 2: Read results from staging table in pages (PostgREST caps at 1000 per request).
  const allResults: PgvectorLead[] = [];
  let offset = 0;

  while (offset < totalCount) {
    const { data: page, error: pageError } = await supabase
      .from('d2p_search_results')
      .select('lead_id, username, bio, profession, business_category, similarity')
      .eq('session_id', sessionId)
      .order('similarity', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (pageError) {
      throw new Error(`Failed to read d2p_search_results page: ${pageError.message}`);
    }

    if (!page || page.length === 0) break;
    allResults.push(...(page as PgvectorLead[]));

    console.log(`[D2P] Page ${Math.floor(offset / pageSize) + 1}: ${page.length} rows (total: ${allResults.length})`);

    offset += pageSize;
  }

  // Step 3: Cleanup session
  await supabase.from('d2p_search_results').delete().eq('session_id', sessionId);

  console.log(`[D2P] Total leads fetched: ${allResults.length}`);
  return allResults;
}

/**
 * Generate embedding for client/demand search (embedding_bio space).
 * Uses a real embedding_bio from a lead whose profession matches the market,
 * ensuring the query vector is in the same vector space as stored bio embeddings.
 */
async function generateClientEmbedding(marketName: string): Promise<number[]> {
  const { data: refData } = await supabase.rpc('get_reference_bio_embedding' as any, {
    market_query: marketName
  });

  if (refData && refData.length > 0 && refData[0].embedding) {
    console.log(`[D2P] Using reference BIO embedding from DB (d2p_text match for "${marketName}")`);
    const raw = refData[0].embedding;
    if (typeof raw === 'string') {
      return JSON.parse(raw);
    }
    return raw as number[];
  }

  // Fallback: Generate via OpenAI (for markets with no leads in DB)
  console.log(`[D2P] No reference bio lead found, generating demand embedding via OpenAI`);
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const demandText = `Preciso de ${marketName}. Busco serviços de ${marketName}. Procurando ${marketName} para me ajudar.`;

  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: demandText
  });

  return response.data[0]!.embedding;
}

/**
 * Search leads using pgvector RPC with embedding_bio (client/demand perspective)
 */
async function searchClientsForD2P(
  queryEmbedding: number[],
  minSimilarity: number
): Promise<PgvectorLead[]> {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  const pageSize = 1000;

  console.log(`[D2P] Running d2p_client_search_and_store (embedding_bio, SECURITY DEFINER, 60s timeout)...`);

  const { data: storeResult, error: storeError } = await supabase.rpc('d2p_client_search_and_store', {
    query_embedding: embeddingStr,
    min_similarity: minSimilarity
  });

  if (storeError) {
    throw new Error(`d2p_client_search_and_store failed: ${storeError.message}`);
  }

  const sessionId = storeResult?.[0]?.session_id;
  const totalCount = storeResult?.[0]?.total_count ?? 0;

  if (!sessionId || totalCount === 0) {
    console.log(`[D2P] No client leads found above similarity threshold ${minSimilarity}`);
    return [];
  }

  console.log(`[D2P] Stored ${totalCount} client leads in session ${sessionId}. Reading pages...`);

  const allResults: PgvectorLead[] = [];
  let offset = 0;

  while (offset < totalCount) {
    const { data: page, error: pageError } = await supabase
      .from('d2p_search_results')
      .select('lead_id, username, bio, profession, business_category, similarity')
      .eq('session_id', sessionId)
      .order('similarity', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (pageError) {
      throw new Error(`Failed to read d2p_search_results page: ${pageError.message}`);
    }

    if (!page || page.length === 0) break;
    allResults.push(...(page as PgvectorLead[]));

    console.log(`[D2P] Page ${Math.floor(offset / pageSize) + 1}: ${page.length} rows (total: ${allResults.length})`);

    offset += pageSize;
  }

  await supabase.from('d2p_search_results').delete().eq('session_id', sessionId);

  console.log(`[D2P] Total client leads fetched: ${allResults.length}`);
  return allResults;
}

/**
 * Run Python D2P analysis engine with pre-filtered leads
 */
async function runPythonAnalysis(
  marketName: string,
  versionId: string,
  leads: PgvectorLead[],
  viewMode: 'empresa' | 'cliente' = 'empresa'
): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(process.cwd(), 'scripts', 'd2p_analysis_engine.py');
    const pythonPath = path.join(process.cwd(), 'scripts', '.venv', 'bin', 'python3');

    console.log(`[D2P] Starting Python analysis for "${marketName}" with ${leads.length} leads...`);

    const python = spawn(pythonPath, [pythonScript], {
      cwd: process.cwd(),
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log(data.toString().trim());
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error(`[D2P] Python exited with code ${code}`);
        reject(new Error(`Python failed: ${stderr || 'Unknown error'}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (!result.success) {
          reject(new Error(result.error || 'Python returned error'));
          return;
        }
        console.log(`[D2P] Python completed in ${result.analysis_duration_ms}ms`);
        console.log(`[D2P] Python owner_analysis: ${JSON.stringify(result.owner_analysis)?.substring(0, 200)}`);
        console.log(`[D2P] Python micro_decisions: ${JSON.stringify(result.micro_decisions)}`);
        console.log(`[D2P] Python dominant_decision: ${result.dominant_decision}`);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${e}`));
      }
    });

    python.on('error', (err) => {
      reject(new Error(`Failed to start Python: ${err.message}`));
    });

    // Send pre-filtered leads to Python
    const inputData = JSON.stringify({
      market_name: marketName,
      version_id: versionId,
      view_mode: viewMode,
      leads: leads.map(l => ({
        lead_id: l.lead_id,
        username: l.username,
        bio: l.bio,
        profession: l.profession,
        business_category: l.business_category,
        similarity: l.similarity
      }))
    });

    python.stdin.write(inputData);
    python.stdin.end();
  });
}

async function getNextVersionNumber(marketSlug: string, viewMode: string = 'empresa'): Promise<number> {
  const { data } = await supabase
    .from('d2p_analyses')
    .select('version_number')
    .eq('market_slug', marketSlug)
    .eq('view_mode', viewMode)
    .order('version_number', { ascending: false })
    .limit(1);

  return (data?.[0]?.version_number || 0) + 1;
}

async function getParentVersionId(marketSlug: string, viewMode: string = 'empresa'): Promise<string | null> {
  const { data } = await supabase
    .from('d2p_analyses')
    .select('version_id')
    .eq('market_slug', marketSlug)
    .eq('view_mode', viewMode)
    .eq('is_latest', true)
    .limit(1)
    .single();

  return data?.version_id || null;
}

// ==============================================================================
// MAIN EXPORTED FUNCTIONS
// ==============================================================================

/**
 * Analyze a market using pgvector D2P search + BERTopic
 */
export async function analyzeMarket(
  marketName: string,
  params: AnalysisParams = {}
): Promise<D2PAnalysis> {
  const startTime = Date.now();
  const marketSlug = generateSlug(marketName);
  const viewMode = params.viewMode ?? 'empresa';
  const defaultThreshold = viewMode === 'cliente' ? 0.55 : 0.65;
  const minSimilarity = params.minSimilarity ?? defaultThreshold;
  const minLeads = params.minLeads ?? 100;

  console.log('[D2P] ========================================');
  console.log(`[D2P] Analyzing: ${marketName} [${viewMode.toUpperCase()}]`);
  console.log(`[D2P] Params: minSimilarity=${minSimilarity}, minLeads=${minLeads}, viewMode=${viewMode}`);
  console.log('[D2P] ========================================');

  // Version info (scoped by view_mode)
  const versionNumber = await getNextVersionNumber(marketSlug, viewMode);
  const parentVersionId = await getParentVersionId(marketSlug, viewMode);
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const versionId = `${marketSlug}_v${versionNumber}_${timestamp}`;

  console.log(`[D2P] Version: ${versionId}`);

  // Create pending record
  const { data: inserted, error: insertError } = await supabase
    .from('d2p_analyses')
    .insert({
      market_name: marketName,
      market_slug: marketSlug,
      version_id: versionId,
      version_number: versionNumber,
      parent_version_id: parentVersionId,
      is_latest: true,
      view_mode: viewMode,
      search_params: { ...params },
      status: 'running'
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(`Database error: ${insertError.message}`);
  }

  try {
    // Step 1: Generate embedding (different strategy per view mode)
    let marketEmbedding: number[];
    let leads: PgvectorLead[];

    if (viewMode === 'cliente') {
      console.log(`[D2P] Generating CLIENT embedding (demand-oriented)...`);
      marketEmbedding = await generateClientEmbedding(marketName);

      console.log(`[D2P] Searching pgvector (embedding_bio, threshold=${minSimilarity})...`);
      leads = await searchClientsForD2P(marketEmbedding, minSimilarity);
    } else {
      console.log(`[D2P] Generating EMPRESA embedding (identity-oriented)...`);
      marketEmbedding = await generateMarketEmbedding(marketName);

      console.log(`[D2P] Searching pgvector (embedding_d2p, threshold=${minSimilarity})...`);
      leads = await searchLeadsForD2P(marketEmbedding, minSimilarity);
    }
    console.log(`[D2P] pgvector returned ${leads.length} leads`);

    if (leads.length < minLeads) {
      const errorMsg = `Insufficient leads: ${leads.length} (minimum: ${minLeads}). Try lowering similarity threshold.`;
      await supabase
        .from('d2p_analyses')
        .update({
          status: 'error',
          error_message: errorMsg,
          leads_selected: leads.length,
          analysis_duration_ms: Date.now() - startTime
        })
        .eq('id', inserted.id);

      throw new Error(errorMsg);
    }

    // Save market embedding for future reference
    await supabase
      .from('d2p_analyses')
      .update({ market_embedding: `[${marketEmbedding.join(',')}]` })
      .eq('id', inserted.id);

    // Step 3: Send pre-filtered leads to Python for BERTopic + D2P
    const pythonResult = await runPythonAnalysis(marketName, versionId, leads, viewMode);

    // Step 4: Save results
    const updateData: Record<string, any> = {
      leads_searched: leads.length,
      leads_selected: pythonResult.leads_selected,
      min_similarity: minSimilarity,
      avg_similarity: pythonResult.avg_similarity,
      topics_discovered: pythonResult.topics_discovered,
      topics_detail: pythonResult.topics_detail,
      coverage_percentage: pythonResult.coverage_percentage,
      friction_units: pythonResult.friction_units,
      friction_count: pythonResult.friction_count,
      total_friction_score: pythonResult.total_friction_score,
      avg_friction_score: pythonResult.avg_friction_score,
      friction_density: pythonResult.friction_density,
      dominant_pain: pythonResult.dominant_pain,
      product_type: pythonResult.product_type,
      product_definition: pythonResult.product_definition,
      product_tagline: pythonResult.product_tagline,
      mvp_does: pythonResult.mvp_does,
      mvp_does_not: pythonResult.mvp_does_not,
      d2p_score: pythonResult.d2p_score,
      product_potential_score: pythonResult.product_potential_score,
      workaround_tools: pythonResult.workaround_tools,
      workarounds: pythonResult.detected_workarounds || [],
      pain_signals: pythonResult.detected_professions || [],
      owner_analysis: pythonResult.owner_analysis || null,
      micro_decisions: pythonResult.micro_decisions || [],
      status: 'completed',
      analysis_duration_ms: Date.now() - startTime
    };

    const { data: updated, error: updateError } = await supabase
      .from('d2p_analyses')
      .update(updateData)
      .eq('id', inserted.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to save results: ${updateError.message}`);
    }

    console.log(`[D2P] Analysis complete in ${Date.now() - startTime}ms`);
    return addCompatibilityFields(updated);

  } catch (error: any) {
    await supabase
      .from('d2p_analyses')
      .update({
        status: 'error',
        error_message: error.message,
        analysis_duration_ms: Date.now() - startTime
      })
      .eq('id', inserted.id);

    throw error;
  }
}

export async function reanalyzeMarket(
  marketSlug: string,
  params: AnalysisParams = {}
): Promise<D2PAnalysis> {
  const viewMode = params.viewMode ?? 'empresa';
  const { data: existing } = await supabase
    .from('d2p_analyses')
    .select('market_name')
    .eq('market_slug', marketSlug)
    .eq('view_mode', viewMode)
    .limit(1)
    .single();

  if (!existing) {
    throw new Error(`Market not found: ${marketSlug} (view_mode=${viewMode})`);
  }

  return analyzeMarket(existing.market_name, params);
}

export async function getLatestAnalysis(marketSlug: string): Promise<D2PAnalysis | null> {
  const { data, error } = await supabase
    .from('d2p_analyses')
    .select('*')
    .eq('market_slug', marketSlug)
    .eq('is_latest', true)
    .single();

  if (error || !data) return null;
  return addCompatibilityFields(data);
}

export async function getAnalysisByVersion(versionId: string): Promise<D2PAnalysis | null> {
  const { data, error } = await supabase
    .from('d2p_analyses')
    .select('*')
    .eq('version_id', versionId)
    .single();

  if (error || !data) return null;
  return addCompatibilityFields(data);
}

export async function getAnalysisHistory(marketSlug: string, limit: number = 10, viewMode?: string): Promise<D2PAnalysis[]> {
  let query = supabase
    .from('d2p_analyses')
    .select('*')
    .eq('market_slug', marketSlug);

  if (viewMode) {
    query = query.eq('view_mode', viewMode);
  }

  const { data, error } = await query
    .order('version_number', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data || []).map(addCompatibilityFields);
}

export async function compareVersions(versionId1: string, versionId2: string): Promise<VersionComparison | null> {
  const [v1, v2] = await Promise.all([
    getAnalysisByVersion(versionId1),
    getAnalysisByVersion(versionId2)
  ]);

  if (!v1 || !v2) return null;

  const v1Frictions = new Set((v1.friction_units || []).map(f => f.label));
  const v2Frictions = new Set((v2.friction_units || []).map(f => f.label));

  const newFrictions = (v2.friction_units || [])
    .filter(f => !v1Frictions.has(f.label))
    .map(f => f.label);

  const removedFrictions = (v1.friction_units || [])
    .filter(f => !v2Frictions.has(f.label))
    .map(f => f.label);

  return {
    v1,
    v2,
    changes: {
      leads_delta: v2.leads_selected - v1.leads_selected,
      topics_delta: v2.topics_discovered - v1.topics_discovered,
      friction_delta: v2.friction_count - v1.friction_count,
      potential_delta: (v2.product_potential_score || 0) - (v1.product_potential_score || 0),
      new_frictions: newFrictions,
      removed_frictions: removedFrictions
    }
  };
}

export async function listAnalyzedMarkets(): Promise<MarketSummary[]> {
  const { data, error } = await supabase
    .from('d2p_analyses')
    .select('market_slug, market_name, version_id, version_number, created_at, leads_selected, topics_discovered, product_potential_score, view_mode')
    .eq('is_latest', true)
    .order('created_at', { ascending: false });

  if (error) return [];

  return (data || []).map(row => ({
    market_slug: row.market_slug,
    market_name: row.market_name,
    latest_version_id: row.version_id,
    version_count: row.version_number,
    latest_analysis_at: row.created_at,
    latest_leads_searched: row.leads_selected,
    latest_topics_discovered: row.topics_discovered,
    latest_product_potential: row.product_potential_score,
    view_mode: row.view_mode || 'empresa'
  }));
}

export async function deleteMarketAnalyses(marketSlug: string, viewMode?: string): Promise<void> {
  let query = supabase
    .from('d2p_analyses')
    .delete()
    .eq('market_slug', marketSlug);

  if (viewMode) {
    query = query.eq('view_mode', viewMode);
  }

  const { error } = await query;

  if (error) {
    throw new Error(`Failed to delete: ${error.message}`);
  }

  console.log(`[D2P] Deleted analyses for ${marketSlug}${viewMode ? ` (${viewMode})` : ''}`);
}

export async function getEmbeddingStatus(): Promise<{
  embedded: number;
  eligible: number;
  percentage: number;
  complete: boolean;
}> {
  const { data } = await supabase.rpc('get_d2p_embedding_status' as any);
  const row = data?.[0] || { embedded: 0, eligible: 0 };
  const pct = row.eligible > 0 ? Math.round((row.embedded / row.eligible) * 100) : 0;

  return {
    embedded: row.embedded,
    eligible: row.eligible,
    percentage: pct,
    complete: pct >= 99
  };
}
