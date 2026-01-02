/**
 * Script para re-extrair localização de leads já enriquecidos
 *
 * Este script processa todos os leads com dado_enriquecido=true mas sem
 * state preenchido, usando o novo LocationExtractor aprimorado.
 *
 * Uso:
 *   npx ts-node scripts/re-extract-locations.ts [--dry-run] [--limit N] [--all]
 *
 * Opções:
 *   --dry-run   Apenas simula, não persiste no banco
 *   --limit N   Limita processamento a N leads
 *   --all       Processa todos os leads (não apenas os sem state)
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  extractLocation,
  inferStateFromCity,
  LocationResult
} from '../src/services/location-extractor.service';

// Carregar variáveis de ambiente
config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// INTERFACES
// ============================================

interface Lead {
  id: string;
  username: string;
  bio: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
}

interface ExtractionResult {
  id: string;
  username: string;
  original: { city: string | null; state: string | null };
  extracted: LocationResult | null;
  action: 'updated' | 'inferred' | 'skipped' | 'no_data';
}

interface Stats {
  total_processed: number;
  updated: number;
  inferred: number;
  skipped: number;
  no_data: number;
  errors: number;
  by_source: Record<string, number>;
}

// ============================================
// CONFIGURAÇÃO
// ============================================

const BATCH_SIZE = 500;

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function parseArgs(): { dryRun: boolean; limit: number | null; all: boolean } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let limit: number | null = null;
  let all = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--all') {
      all = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1] as string);
      i++;
    }
  }

  return { dryRun, limit, all };
}

function formatPercent(value: number, total: number): string {
  if (total === 0) return '0.00%';
  return ((value / total) * 100).toFixed(2) + '%';
}

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

async function fetchLeadsToProcess(all: boolean, limit: number | null): Promise<Lead[]> {
  console.log('\n📊 Buscando leads para processar...');

  const PAGE_SIZE = 1000;
  const allLeads: Lead[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('instagram_leads')
      .select('id, username, bio, phone, city, state')
      .eq('dado_enriquecido', true);

    // Se não for --all, buscar apenas os sem state
    if (!all) {
      query = query.is('state', null);
    }

    // Ordenar por created_at para consistência
    query = query.order('created_at', { ascending: false });

    // Paginação
    query = query.range(offset, offset + PAGE_SIZE - 1);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Erro ao buscar leads: ${error.message}`);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allLeads.push(...data);
      offset += PAGE_SIZE;
      process.stdout.write(`\r   Carregados: ${allLeads.length} leads...`);

      // Se temos limite e já atingimos, parar
      if (limit && allLeads.length >= limit) {
        hasMore = false;
      }

      // Se retornou menos que PAGE_SIZE, não há mais dados
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      }
    }
  }

  console.log('');

  // Aplicar limite se especificado
  if (limit && allLeads.length > limit) {
    return allLeads.slice(0, limit);
  }

  return allLeads;
}

async function processLead(lead: Lead): Promise<ExtractionResult> {
  const result: ExtractionResult = {
    id: lead.id,
    username: lead.username,
    original: { city: lead.city, state: lead.state },
    extracted: null,
    action: 'no_data'
  };

  // Se já tem state, verificar se precisa pular
  if (lead.state) {
    // Se também tem city, nada a fazer
    if (lead.city) {
      result.action = 'skipped';
      return result;
    }
    // Se tem state mas não city, tentar extrair city
  }

  // Tentar extrair localização
  const extracted = extractLocation(lead.bio, lead.phone);
  result.extracted = extracted;

  if (extracted) {
    // Caso 1: Extraiu state novo (lead não tinha)
    if (!lead.state && extracted.state) {
      result.action = 'updated';
      return result;
    }

    // Caso 2: Lead tem city mas não state - inferir
    if (lead.city && !lead.state) {
      const inferredState = inferStateFromCity(lead.city);
      if (inferredState) {
        result.extracted = {
          city: lead.city,
          state: inferredState,
          source: 'inferred-from-existing-city',
          confidence: 'high'
        };
        result.action = 'inferred';
        return result;
      }
    }

    // Caso 3: Extraiu city nova
    if (!lead.city && extracted.city) {
      result.action = 'updated';
      return result;
    }
  }

  // Caso especial: Lead tem city mas não state - tentar inferir mesmo sem extração
  if (lead.city && !lead.state) {
    const inferredState = inferStateFromCity(lead.city);
    if (inferredState) {
      result.extracted = {
        city: lead.city,
        state: inferredState,
        source: 'inferred-from-existing-city',
        confidence: 'high'
      };
      result.action = 'inferred';
      return result;
    }
  }

  return result;
}

async function persistResults(
  results: ExtractionResult[],
  dryRun: boolean
): Promise<number> {
  // Filtrar apenas os que precisam de update
  const toUpdate = results.filter(r =>
    r.action === 'updated' || r.action === 'inferred'
  );

  if (toUpdate.length === 0) {
    return 0;
  }

  if (dryRun) {
    console.log(`\n🔍 [DRY-RUN] ${toUpdate.length} leads seriam atualizados:`);
    toUpdate.slice(0, 10).forEach(r => {
      console.log(`   @${r.username}: ${r.extracted?.city || '-'}/${r.extracted?.state || '-'} (${r.extracted?.source})`);
    });
    if (toUpdate.length > 10) {
      console.log(`   ... e mais ${toUpdate.length - 10} leads`);
    }
    return 0;
  }

  // Persistir em batches
  let updated = 0;

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE);

    const updates = batch.map(r => ({
      id: r.id,
      city: r.extracted?.city || r.original.city,
      state: r.extracted?.state || r.original.state
    }));

    // Usar upsert para atualizar em batch
    for (const update of updates) {
      const { error } = await supabase
        .from('instagram_leads')
        .update({
          city: update.city,
          state: update.state,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.id);

      if (error) {
        console.error(`   ❌ Erro ao atualizar ${update.id}: ${error.message}`);
      } else {
        updated++;
      }
    }

    // Progresso
    const progress = Math.min(i + BATCH_SIZE, toUpdate.length);
    process.stdout.write(`\r   💾 Persistindo: ${progress}/${toUpdate.length}`);
  }

  console.log('');
  return updated;
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🔄 RE-EXTRAÇÃO DE LOCALIZAÇÃO DE LEADS\n');
  console.log('=' .repeat(50));

  const { dryRun, limit, all } = parseArgs();

  if (dryRun) {
    console.log('⚠️  MODO DRY-RUN: Nenhuma alteração será persistida\n');
  }

  if (limit) {
    console.log(`📌 Limite: ${limit} leads\n`);
  }

  if (all) {
    console.log('📌 Processando TODOS os leads (--all)\n');
  }

  // Buscar leads
  const leads = await fetchLeadsToProcess(all, limit);
  console.log(`✅ ${leads.length} leads encontrados para processar\n`);

  if (leads.length === 0) {
    console.log('✨ Nenhum lead para processar!');
    return;
  }

  // Estatísticas iniciais
  const initialStats = {
    withCity: leads.filter(l => l.city).length,
    withState: leads.filter(l => l.state).length,
    withBoth: leads.filter(l => l.city && l.state).length,
    withNeither: leads.filter(l => !l.city && !l.state).length
  };

  console.log('📊 ESTADO INICIAL:');
  console.log(`   Com city: ${initialStats.withCity} (${formatPercent(initialStats.withCity, leads.length)})`);
  console.log(`   Com state: ${initialStats.withState} (${formatPercent(initialStats.withState, leads.length)})`);
  console.log(`   Com ambos: ${initialStats.withBoth} (${formatPercent(initialStats.withBoth, leads.length)})`);
  console.log(`   Sem nenhum: ${initialStats.withNeither} (${formatPercent(initialStats.withNeither, leads.length)})`);

  // Processar leads
  console.log('\n🔄 Processando leads...\n');

  const results: ExtractionResult[] = [];
  const stats: Stats = {
    total_processed: 0,
    updated: 0,
    inferred: 0,
    skipped: 0,
    no_data: 0,
    errors: 0,
    by_source: {}
  };

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i]!;

    try {
      const result = await processLead(lead);
      results.push(result);

      // Atualizar estatísticas
      stats.total_processed++;
      stats[result.action as keyof Pick<Stats, 'updated' | 'inferred' | 'skipped' | 'no_data'>]++;

      if (result.extracted?.source) {
        stats.by_source[result.extracted.source] = (stats.by_source[result.extracted.source] || 0) + 1;
      }

      // Log de progresso a cada 100 leads
      if ((i + 1) % 100 === 0 || i === leads.length - 1) {
        const pct = formatPercent(i + 1, leads.length);
        process.stdout.write(`\r   Processados: ${i + 1}/${leads.length} (${pct})`);
      }

    } catch (error) {
      stats.errors++;
      console.error(`\n   ❌ Erro em @${lead.username}: ${error}`);
    }
  }

  console.log('\n');

  // Persistir resultados
  console.log('💾 Persistindo resultados...');
  const persisted = await persistResults(results, dryRun);

  // Relatório final
  console.log('\n' + '=' .repeat(50));
  console.log('📊 RELATÓRIO FINAL\n');

  console.log('📈 AÇÕES:');
  console.log(`   Total processados: ${stats.total_processed}`);
  console.log(`   ✅ Atualizados (nova extração): ${stats.updated} (${formatPercent(stats.updated, stats.total_processed)})`);
  console.log(`   🔄 Inferidos (city→state): ${stats.inferred} (${formatPercent(stats.inferred, stats.total_processed)})`);
  console.log(`   ⏭️  Pulados (já completos): ${stats.skipped} (${formatPercent(stats.skipped, stats.total_processed)})`);
  console.log(`   ❌ Sem dados: ${stats.no_data} (${formatPercent(stats.no_data, stats.total_processed)})`);
  console.log(`   ⚠️  Erros: ${stats.errors}`);

  if (Object.keys(stats.by_source).length > 0) {
    console.log('\n📍 FONTES DE EXTRAÇÃO:');
    Object.entries(stats.by_source)
      .sort(([, a], [, b]) => b - a)
      .forEach(([source, count]) => {
        console.log(`   ${source}: ${count} (${formatPercent(count, stats.updated + stats.inferred)})`);
      });
  }

  // Exemplos de extrações
  const successfulExtractions = results.filter(r =>
    r.action === 'updated' || r.action === 'inferred'
  );

  if (successfulExtractions.length > 0) {
    console.log('\n📋 EXEMPLOS DE EXTRAÇÕES:');
    successfulExtractions.slice(0, 15).forEach(r => {
      const original = `${r.original.city || '-'}/${r.original.state || '-'}`;
      const extracted = `${r.extracted?.city || '-'}/${r.extracted?.state || '-'}`;
      console.log(`   @${r.username.padEnd(25)} ${original.padEnd(25)} → ${extracted} (${r.extracted?.source})`);
    });
  }

  // Estatísticas finais simuladas
  if (!dryRun) {
    const finalWithState = initialStats.withState + stats.updated + stats.inferred;
    console.log('\n📊 ESTADO FINAL (estimado):');
    console.log(`   Com state: ${finalWithState} (${formatPercent(finalWithState, leads.length)})`);
    console.log(`   Melhoria: +${stats.updated + stats.inferred} leads com localização`);
  }

  console.log('\n✨ Processamento concluído!');
}

// Executar
main().catch(error => {
  console.error('\n❌ Erro fatal:', error);
  process.exit(1);
});
