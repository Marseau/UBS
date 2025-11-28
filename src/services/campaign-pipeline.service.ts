/**
 * CAMPAIGN PIPELINE SERVICE
 *
 * Executa o pipeline completo de uma campanha:
 * 1. Recebe campanha com viabilidade aprovada
 * 2. Executa clustering (KMeans) nos leads
 * 3. Cria subclusters na tabela campaign_subclusters
 * 4. Associa leads aos subclusters em campaign_leads
 * 5. Gera persona para cada subcluster
 * 6. Gera DM scripts (Instagram, WhatsApp, Email) para cada persona
 * 7. Gera copies de marketing para cada subcluster
 * 8. Popula campaign_outreach_queue para n8n processar
 *
 * IMPORTANTE: Os subclusters NASCEM da campanha, não existem independentemente
 */

import { createClient } from '@supabase/supabase-js';
import { executeClustering, ClusteringResult, ClusterResult, LeadClusterAssociation } from './clustering-engine.service';
import {
  generateAllInsights,
  generatePainPoints,
  generateTrends,
  detectAwarenessLevel,
  detectBuyingStage,
  detectCommunicationTone,
  detectMentalTriggers,
  generateObjections,
  calculatePriorityScore
} from './unified-clustering-insights.service';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================
// TIPOS
// ============================================

export interface CampaignData {
  id: string;
  campaign_name: string;
  nicho_principal: string;
  nicho_secundario?: string;
  keywords: string[];
  service_description: string;
  target_audience: string;
  target_age_range?: string;
  target_gender?: string;
  target_location?: string;
  preferred_channel?: string;
  analysis_result?: any;
}

export interface Persona {
  name: string;
  description: string;
  age_range: string;
  profession: string;
  pain_points: string[];
  desires: string[];
  communication_tone: string;
  awareness_level: string;
  buying_stage: string;
  mental_triggers: string[];
  common_objections: string[];
}

export interface DMScript {
  opener: string;
  followup1: string;
  followup2: string;
  cta: string;
}

export interface DMScripts {
  instagram: DMScript[];
  whatsapp: DMScript[];
  email: DMScript[];
}

export interface Copies {
  hooks: string[];
  hashtags_recomendadas: string[];
  ctas: string[];
  value_propositions: string[];
}

export interface SubclusterData {
  cluster_index: number;
  cluster_name: string;
  total_leads: number;
  avg_contact_rate: number;
  hashtag_count: number;
  relevance_score: number;
  priority_score: number;
  top_hashtags: any[];
  theme_keywords: string[];
  persona: Persona;
  dm_scripts: DMScripts;
  copies: Copies;
  behavioral_insights: any;
}

export interface PipelineResult {
  success: boolean;
  error?: string;
  campaign_id: string;
  campaign_name: string;
  pipeline_status: string;
  total_subclusters: number;
  total_leads_assigned: number;
  total_outreach_queued: number;
  subclusters: SubclusterData[];
  execution_time_ms: number;
}

// ============================================
// FUNÇÕES DE GERAÇÃO
// ============================================

/**
 * Gera persona para um subcluster baseado nas keywords e insights
 */
function generatePersona(
  cluster: ClusterResult,
  campaign: CampaignData,
  insights: any
): Persona {
  const themeKeywords = cluster.theme_keywords || [];
  const topHashtags = cluster.top_hashtags.map(h => h.hashtag);
  const nicho = campaign.nicho_principal;

  // Nome da persona baseado no cluster
  const personaNames = [
    'Ana', 'Maria', 'Carla', 'Julia', 'Fernanda',
    'Patricia', 'Camila', 'Luciana', 'Renata', 'Beatriz'
  ];
  const personaName = personaNames[cluster.cluster_id % personaNames.length] || 'Cliente';

  // Profissão inferida das hashtags
  const professionMap: Record<string, string> = {
    'estetica': 'Profissional de Estética',
    'manicure': 'Manicure/Nail Designer',
    'cabelo': 'Cabeleireira',
    'maquiagem': 'Maquiadora',
    'sobrancelha': 'Designer de Sobrancelhas',
    'personal': 'Personal Trainer',
    'nutricionista': 'Nutricionista',
    'coach': 'Coach',
    'advogado': 'Advogado(a)',
    'dentista': 'Dentista',
    'psicologo': 'Psicólogo(a)',
    'fisioterapeuta': 'Fisioterapeuta',
    'arquiteto': 'Arquiteto(a)',
    'fotografo': 'Fotógrafo(a)',
    'designer': 'Designer',
    'consultor': 'Consultor(a)'
  };

  let profession = 'Profissional autônomo(a)';
  for (const [key, value] of Object.entries(professionMap)) {
    if (themeKeywords.some(k => k.includes(key)) || topHashtags.some(h => h.includes(key))) {
      profession = value;
      break;
    }
  }

  return {
    name: personaName,
    description: `${personaName} é ${profession.toLowerCase()} que busca ${campaign.service_description.substring(0, 100)}`,
    age_range: campaign.target_age_range || '25-45',
    profession,
    pain_points: insights.pain_points || generatePainPoints(themeKeywords, nicho),
    desires: [
      'Mais clientes qualificados',
      'Automatizar atendimento',
      'Ter mais tempo livre',
      'Aumentar faturamento',
      'Profissionalizar o negócio'
    ],
    communication_tone: insights.communication_tone || detectCommunicationTone(themeKeywords),
    awareness_level: insights.audience_awareness_level || detectAwarenessLevel(themeKeywords),
    buying_stage: insights.buying_stage || detectBuyingStage(themeKeywords),
    mental_triggers: insights.mental_triggers || detectMentalTriggers(themeKeywords),
    common_objections: insights.common_objections || generateObjections(nicho)
  };
}

/**
 * Gera scripts de DM para cada canal
 */
function generateDMScripts(
  persona: Persona,
  campaign: CampaignData,
  cluster: ClusterResult
): DMScripts {
  const nicho = campaign.nicho_principal;
  const service = campaign.service_description;
  const painPoint = persona.pain_points[0] || 'crescer o negócio';

  // Templates base
  const openers = [
    `Oi ${persona.name}! Vi que você trabalha com ${nicho} e achei incrível seu trabalho!`,
    `Olá! Percebi pelo seu perfil que você é ${persona.profession.toLowerCase()}. Posso te fazer uma pergunta rápida?`,
    `Oi! Tudo bem? Vi que você atua na área de ${nicho} e fiquei curiosa sobre uma coisa...`
  ];

  const followups1 = [
    `Você já pensou em como seria ter ${service}?`,
    `Muitas profissionais como você têm enfrentado ${painPoint}. Você também passa por isso?`,
    `Sei que ${painPoint} é um desafio comum. Você consegue lidar bem com isso hoje?`
  ];

  const followups2 = [
    `Temos uma solução que já ajudou +500 profissionais como você a resolver isso.`,
    `Desenvolvemos algo que pode te ajudar muito com isso. Posso te contar mais?`,
    `Quer ver como outras profissionais da sua área resolveram esse problema?`
  ];

  const ctas = [
    `Posso te mostrar como funciona em uma conversa rápida de 10 min?`,
    `Quer agendar um papo sem compromisso para te mostrar?`,
    `Tenho um material exclusivo sobre isso. Posso te enviar?`
  ];

  // Montar scripts por canal
  const instagramScripts: DMScript[] = openers.map((opener, i) => ({
    opener,
    followup1: followups1[i] || followups1[0] || '',
    followup2: followups2[i] || followups2[0] || '',
    cta: ctas[i] || ctas[0] || ''
  }));

  // WhatsApp: Mais direto e profissional
  const whatsappScripts: DMScript[] = [
    {
      opener: `Olá! Meu nome é [Nome] e trabalho ajudando profissionais de ${nicho} a ${service.substring(0, 50)}...`,
      followup1: `Vi seu perfil no Instagram e achei que você poderia se interessar por isso.`,
      followup2: `Já ajudamos mais de 500 profissionais como você. Posso te contar como funciona?`,
      cta: `Quer agendar uma conversa rápida de 10 minutos? Sem compromisso!`
    }
  ];

  // Email: Mais formal e completo
  const emailScripts: DMScript[] = [
    {
      opener: `Olá ${persona.name},\n\nMeu nome é [Nome] e encontrei seu perfil através do Instagram.`,
      followup1: `Notei que você é ${persona.profession.toLowerCase()} e imagino que já tenha enfrentado desafios como ${painPoint}.`,
      followup2: `Desenvolvemos uma solução que tem ajudado centenas de profissionais como você a ${service.substring(0, 100)}.\n\nNossos clientes relatam resultados como:\n- Mais tempo livre\n- Aumento de faturamento\n- Clientes mais qualificados`,
      cta: `Gostaria de conversar sobre como isso poderia funcionar para você?\n\nPodemos agendar uma call de 15 minutos.\n\nAguardo seu retorno!\n\n[Assinatura]`
    }
  ];

  return {
    instagram: instagramScripts,
    whatsapp: whatsappScripts,
    email: emailScripts
  };
}

/**
 * Gera copies de marketing para o subcluster
 */
function generateCopies(
  persona: Persona,
  campaign: CampaignData,
  cluster: ClusterResult
): Copies {
  const nicho = campaign.nicho_principal;
  const service = campaign.service_description;
  const painPoint = persona.pain_points[0] || 'crescer o negócio';

  return {
    hooks: [
      `Cansada de ${painPoint}? Conheça a solução!`,
      `O que você faria com mais tempo livre?`,
      `Agende atendimentos enquanto dorme!`,
      `Um atendente digital que trabalha 24h para você!`,
      `Dicas para automatizar seu atendimento de forma fácil!`,
      `Pare de perder clientes por falta de tempo!`
    ],
    hashtags_recomendadas: [
      `#${nicho.replace(/\s+/g, '')}`,
      '#atendimentodigital',
      '#whatsappbusiness',
      '#agendamentoonline',
      '#empreendedorismo',
      '#negociosdigitais',
      '#automacao',
      '#produtividade',
      '#marketingdigital',
      '#sucesso'
    ],
    ctas: [
      'Saiba mais no link da bio!',
      'Clique no link e agende uma demonstração gratuita!',
      'Quer saber como? Me chama no direct!',
      'Comente "QUERO" que eu te explico!',
      'Envie uma mensagem para começar hoje!'
    ],
    value_propositions: [
      `${service.substring(0, 100)}`,
      'Atendimento 24/7 sem você precisar estar online',
      'Agende clientes automaticamente pelo WhatsApp',
      'Pare de perder clientes por demora no atendimento',
      'Mais tempo para você, mais clientes para seu negócio'
    ]
  };
}

// ============================================
// FUNÇÕES DO PIPELINE
// ============================================

/**
 * Busca dados completos da campanha
 */
async function fetchCampaignData(campaignId: string): Promise<CampaignData | null> {
  const { data, error } = await supabase
    .from('cluster_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (error || !data) {
    console.error('Erro ao buscar campanha:', error);
    return null;
  }

  return data as CampaignData;
}

/**
 * Atualiza status do pipeline na campanha
 */
async function updatePipelineStatus(
  campaignId: string,
  status: string,
  additionalData?: Record<string, any>
): Promise<void> {
  const updateData: Record<string, any> = {
    pipeline_status: status,
    updated_at: new Date().toISOString()
  };

  if (additionalData) {
    Object.assign(updateData, additionalData);
  }

  await supabase
    .from('cluster_campaigns')
    .update(updateData)
    .eq('id', campaignId);
}

/**
 * Salva subclusters no banco de dados
 */
async function saveSubclusters(
  campaignId: string,
  subclusters: SubclusterData[]
): Promise<string[]> {
  const subclusterIds: string[] = [];

  for (const subcluster of subclusters) {
    // Normalizar valores numéricos para evitar overflow NUMERIC(5,4)
    // avg_contact_rate deve ser <= 9.9999 (0-100% / 10)
    // relevance_score deve ser <= 9.9999 (normalizado 0-1, então OK)
    const safeAvgContactRate = Math.min(subcluster.avg_contact_rate / 10, 9.9999);
    const safeRelevanceScore = Math.min(subcluster.relevance_score, 9.9999);

    const { data, error } = await supabase
      .from('campaign_subclusters')
      .insert({
        campaign_id: campaignId,
        cluster_index: subcluster.cluster_index,
        cluster_name: subcluster.cluster_name,
        total_leads: subcluster.total_leads,
        avg_contact_rate: safeAvgContactRate,
        hashtag_count: subcluster.hashtag_count,
        relevance_score: safeRelevanceScore,
        priority_score: subcluster.priority_score,
        top_hashtags: subcluster.top_hashtags,
        theme_keywords: subcluster.theme_keywords,
        persona: subcluster.persona,
        persona_generated_at: new Date().toISOString(),
        persona_generation_method: 'rules',
        dm_scripts: subcluster.dm_scripts,
        dm_scripts_generated_at: new Date().toISOString(),
        copies: subcluster.copies,
        copies_generated_at: new Date().toISOString(),
        behavioral_insights: subcluster.behavioral_insights,
        status: 'ready'
      })
      .select('id')
      .single();

    if (error) {
      console.error(`Erro ao salvar subcluster ${subcluster.cluster_index}:`, error);
      continue;
    }

    if (data) {
      subclusterIds.push(data.id);
    }
  }

  return subclusterIds;
}

/**
 * Associa leads aos subclusters em campaign_leads
 */
async function assignLeadsToSubclusters(
  campaignId: string,
  leadAssociations: LeadClusterAssociation[],
  clusterToSubclusterId: Map<number, string>,
  subclusters: SubclusterData[]
): Promise<number> {
  let assignedCount = 0;
  const batchSize = 100;

  for (let i = 0; i < leadAssociations.length; i += batchSize) {
    const batch = leadAssociations.slice(i, i + batchSize);
    const inserts: any[] = [];

    for (const assoc of batch) {
      const subclusterId = clusterToSubclusterId.get(assoc.primary_cluster);
      const subcluster = subclusters.find(s => s.cluster_index === assoc.primary_cluster);

      if (!subclusterId || !subcluster) continue;

      inserts.push({
        campaign_id: campaignId,
        lead_id: assoc.lead_id,
        subcluster_id: subclusterId,
        cluster_id: assoc.primary_cluster,
        cluster_name: subcluster.cluster_name,
        fit_score: Math.round(assoc.score * 10),
        fit_reasons: assoc.clusters,
        match_source: 'clustering',
        match_hashtags: assoc.clusters.map(c => ({ cluster_id: c.cluster_id, count: c.hashtag_count })),
        status: 'pending'
      });
    }

    if (inserts.length > 0) {
      const { error } = await supabase
        .from('campaign_leads')
        .upsert(inserts, { onConflict: 'campaign_id,lead_id' });

      if (error) {
        console.error('Erro ao inserir leads:', error);
      } else {
        assignedCount += inserts.length;
      }
    }
  }

  return assignedCount;
}

/**
 * Popula a fila de outreach para n8n processar
 */
async function populateOutreachQueue(
  campaignId: string,
  channel: string,
  subclusters: SubclusterData[],
  clusterToSubclusterId: Map<number, string>,
  leadAssociations: LeadClusterAssociation[],
  limit: number = 2000
): Promise<number> {
  // Buscar dados dos leads
  const leadIds = leadAssociations.slice(0, limit).map(a => a.lead_id);

  const { data: leads, error } = await supabase
    .from('instagram_leads')
    .select('id, username, full_name, phone, email, bio, business_category, hashtags_bio, hashtags_posts')
    .in('id', leadIds);

  if (error || !leads) {
    console.error('Erro ao buscar leads:', error);
    return 0;
  }

  const leadMap = new Map(leads.map(l => [l.id, l]));
  let queuedCount = 0;
  const batchSize = 100;

  for (let i = 0; i < leadAssociations.length && queuedCount < limit; i += batchSize) {
    const batch = leadAssociations.slice(i, Math.min(i + batchSize, limit));
    const inserts: any[] = [];

    for (const assoc of batch) {
      const lead = leadMap.get(assoc.lead_id);
      if (!lead) continue;

      const subclusterId = clusterToSubclusterId.get(assoc.primary_cluster);
      const subcluster = subclusters.find(s => s.cluster_index === assoc.primary_cluster);

      if (!subclusterId || !subcluster) continue;

      // Selecionar script apropriado para o canal
      const scripts = subcluster.dm_scripts[channel as keyof DMScripts] || subcluster.dm_scripts.instagram;
      const script = scripts[0]; // Primeira variante

      inserts.push({
        campaign_id: campaignId,
        lead_id: lead.id,
        subcluster_id: subclusterId,
        subcluster_name: subcluster.cluster_name,
        channel,
        lead_username: lead.username,
        lead_full_name: lead.full_name,
        lead_phone: lead.phone,
        lead_email: lead.email,
        lead_bio: lead.bio,
        lead_business_category: lead.business_category,
        lead_hashtags_bio: lead.hashtags_bio,
        lead_hashtags_posts: lead.hashtags_posts,
        priority_score: subcluster.priority_score,
        fit_score: assoc.score,
        persona_snapshot: subcluster.persona,
        dm_script_used: script,
        dm_variant: 0,
        status: 'pending'
      });
    }

    if (inserts.length > 0) {
      const { error } = await supabase
        .from('campaign_outreach_queue')
        .insert(inserts);

      if (error) {
        console.error('Erro ao popular fila de outreach:', error);
      } else {
        queuedCount += inserts.length;
      }
    }
  }

  return queuedCount;
}

// ============================================
// FUNÇÃO PRINCIPAL DO PIPELINE
// ============================================

/**
 * Executa o pipeline completo de uma campanha
 *
 * @param campaignId ID da campanha
 * @param options Opções de execução
 * @returns Resultado do pipeline
 */
export async function executeCampaignPipeline(
  campaignId: string,
  options: {
    kOverride?: number;
    maxLeads?: number;
    channel?: string;
    skipOutreachQueue?: boolean;
  } = {}
): Promise<PipelineResult> {
  const startTime = Date.now();
  // Normalizar channel para valores aceitos pelo banco: 'instagram_dm' ou 'whatsapp'
  const rawChannel = options.channel || 'instagram_dm';
  const channel = rawChannel === 'instagram' ? 'instagram_dm' : rawChannel;
  const { kOverride, maxLeads = 2000, skipOutreachQueue = false } = options;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 [CAMPAIGN PIPELINE] Iniciando execução`);
  console.log(`   Campaign ID: ${campaignId}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // 1. Buscar dados da campanha
    console.log('📋 Buscando dados da campanha...');
    const campaign = await fetchCampaignData(campaignId);

    if (!campaign) {
      return {
        success: false,
        error: 'Campanha não encontrada',
        campaign_id: campaignId,
        campaign_name: '',
        pipeline_status: 'error',
        total_subclusters: 0,
        total_leads_assigned: 0,
        total_outreach_queued: 0,
        subclusters: [],
        execution_time_ms: Date.now() - startTime
      };
    }

    console.log(`   ✅ Campanha: ${campaign.campaign_name}`);
    console.log(`   📍 Nicho: ${campaign.nicho_principal}`);
    console.log(`   🔑 Keywords: [${campaign.keywords.join(', ')}]`);

    // Atualizar status
    await updatePipelineStatus(campaignId, 'clustering_in_progress', {
      pipeline_started_at: new Date().toISOString()
    });

    // 2. Executar clustering
    console.log('\n🔬 Executando clustering...');
    const clusteringResult = await executeClustering(
      campaign.keywords,
      campaign.nicho_principal,
      kOverride
    );

    if (!clusteringResult.success) {
      await updatePipelineStatus(campaignId, 'clustering_failed');
      return {
        success: false,
        error: clusteringResult.error || 'Clustering falhou',
        campaign_id: campaignId,
        campaign_name: campaign.campaign_name,
        pipeline_status: 'clustering_failed',
        total_subclusters: 0,
        total_leads_assigned: 0,
        total_outreach_queued: 0,
        subclusters: [],
        execution_time_ms: Date.now() - startTime
      };
    }

    console.log(`   ✅ ${clusteringResult.clusters.length} clusters gerados`);
    console.log(`   ✅ ${clusteringResult.total_leads} leads associados`);

    // 3. Gerar subclusters com personas, DMs e copies
    console.log('\n👥 Gerando personas e conteúdo para cada subcluster...');
    const subclusters: SubclusterData[] = [];

    for (const cluster of clusteringResult.clusters) {
      // Gerar insights comportamentais
      const insights = generateAllInsights(cluster, campaign.nicho_principal);

      // Gerar persona
      const persona = generatePersona(cluster, campaign, insights);

      // Gerar DM scripts
      const dmScripts = generateDMScripts(persona, campaign, cluster);

      // Gerar copies
      const copies = generateCopies(persona, campaign, cluster);

      // Calcular priority score
      const priorityScore = calculatePriorityScore({
        total_leads: cluster.total_leads,
        avg_contact_rate: cluster.avg_contact_rate,
        relevance_score: insights.opportunity_score / 100
      });

      subclusters.push({
        cluster_index: cluster.cluster_id,
        cluster_name: cluster.cluster_name,
        total_leads: cluster.total_leads,
        avg_contact_rate: cluster.avg_contact_rate,
        hashtag_count: cluster.hashtag_count,
        relevance_score: insights.opportunity_score / 100,
        priority_score: priorityScore,
        top_hashtags: cluster.top_hashtags,
        theme_keywords: cluster.theme_keywords,
        persona,
        dm_scripts: dmScripts,
        copies,
        behavioral_insights: insights
      });

      console.log(`   ✅ Subcluster ${cluster.cluster_id}: "${cluster.cluster_name}" (${cluster.total_leads} leads, persona: ${persona.name})`);
    }

    // 4. Salvar subclusters no banco
    console.log('\n💾 Salvando subclusters...');
    const subclusterIds = await saveSubclusters(campaignId, subclusters);
    console.log(`   ✅ ${subclusterIds.length} subclusters salvos`);

    // Criar mapa cluster_index → subcluster_id
    const clusterToSubclusterId = new Map<number, string>();
    for (let i = 0; i < subclusters.length; i++) {
      const subcluster = subclusters[i];
      const subclusterId = subclusterIds[i];
      if (subcluster && subclusterId) {
        clusterToSubclusterId.set(subcluster.cluster_index, subclusterId);
      }
    }

    await updatePipelineStatus(campaignId, 'clustering_done', {
      total_subclusters: subclusters.length,
      clustering_result: clusteringResult,
      last_clustering_at: new Date().toISOString()
    });

    // 5. Associar leads aos subclusters
    console.log('\n🔗 Associando leads aos subclusters...');
    const assignedCount = await assignLeadsToSubclusters(
      campaignId,
      clusteringResult.lead_associations,
      clusterToSubclusterId,
      subclusters
    );
    console.log(`   ✅ ${assignedCount} leads associados`);

    await updatePipelineStatus(campaignId, 'personas_generated', {
      total_leads_in_campaign: assignedCount
    });

    // 6. Popular fila de outreach (se não skipado)
    let queuedCount = 0;
    if (!skipOutreachQueue) {
      console.log(`\n📬 Populando fila de outreach (canal: ${channel})...`);
      queuedCount = await populateOutreachQueue(
        campaignId,
        channel,
        subclusters,
        clusterToSubclusterId,
        clusteringResult.lead_associations,
        maxLeads
      );
      console.log(`   ✅ ${queuedCount} leads na fila de outreach`);
    }

    // 7. Finalizar
    await updatePipelineStatus(campaignId, 'ready_for_outreach', {
      pipeline_completed_at: new Date().toISOString()
    });

    const executionTime = Date.now() - startTime;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [CAMPAIGN PIPELINE] Concluído em ${(executionTime / 1000).toFixed(1)}s`);
    console.log(`   📊 ${subclusters.length} subclusters criados`);
    console.log(`   👥 ${assignedCount} leads associados`);
    console.log(`   📬 ${queuedCount} leads na fila de outreach`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      success: true,
      campaign_id: campaignId,
      campaign_name: campaign.campaign_name,
      pipeline_status: 'ready_for_outreach',
      total_subclusters: subclusters.length,
      total_leads_assigned: assignedCount,
      total_outreach_queued: queuedCount,
      subclusters,
      execution_time_ms: executionTime
    };

  } catch (error: any) {
    console.error('❌ Erro no pipeline:', error);

    await updatePipelineStatus(campaignId, 'error');

    return {
      success: false,
      error: error.message || 'Erro desconhecido',
      campaign_id: campaignId,
      campaign_name: '',
      pipeline_status: 'error',
      total_subclusters: 0,
      total_leads_assigned: 0,
      total_outreach_queued: 0,
      subclusters: [],
      execution_time_ms: Date.now() - startTime
    };
  }
}

/**
 * Obtém status detalhado do pipeline de uma campanha
 */
export async function getCampaignPipelineStatus(campaignId: string): Promise<{
  campaign: any;
  subclusters: any[];
  leads_summary: any;
  outreach_summary: any;
}> {
  // Buscar campanha
  const { data: campaign } = await supabase
    .from('cluster_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  // Buscar subclusters
  const { data: subclusters } = await supabase
    .from('campaign_subclusters')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('priority_score', { ascending: false });

  // Buscar resumo de leads
  const { data: leadsSummary } = await supabase
    .from('campaign_leads')
    .select('status')
    .eq('campaign_id', campaignId);

  // Buscar resumo de outreach
  const { data: outreachSummary } = await supabase
    .from('campaign_outreach_queue')
    .select('status, channel')
    .eq('campaign_id', campaignId);

  // Agregar status
  const leadsAgg = (leadsSummary || []).reduce((acc: any, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, { total: leadsSummary?.length || 0 });

  const outreachAgg = (outreachSummary || []).reduce((acc: any, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    acc[`${o.channel}_${o.status}`] = (acc[`${o.channel}_${o.status}`] || 0) + 1;
    return acc;
  }, { total: outreachSummary?.length || 0 });

  return {
    campaign,
    subclusters: subclusters || [],
    leads_summary: leadsAgg,
    outreach_summary: outreachAgg
  };
}

export const campaignPipelineService = {
  executeCampaignPipeline,
  getCampaignPipelineStatus
};
