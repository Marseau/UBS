const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAllPaginated(tableName, selectFields, filters = {}, pageSize = 1000) {
  let allData = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(tableName).select(selectFields);

    // Apply filters
    for (const [key, value] of Object.entries(filters)) {
      if (value === null) {
        query = query.is(key, null);
      } else if (value === 'NOT_NULL') {
        query = query.not(key, 'is', null);
      } else {
        query = query.eq(key, value);
      }
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data, error } = await query;
    if (error) throw error;

    if (data && data.length > 0) {
      allData = allData.concat(data);
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }
  return allData;
}

async function checkPendingLeads() {
  console.log('Buscando dados... (pode demorar alguns segundos)');
  console.log('');

  // Get IDs of leads with all enrichment flags true
  const enrichedLeads = await fetchAllPaginated(
    'instagram_leads',
    'id',
    { dado_enriquecido: true, hashtags_extracted: true, url_enriched: true }
  );

  const enrichedIds = enrichedLeads.map(l => l.id);
  console.log('Total leads com flags de enriquecimento true:', enrichedIds.length);

  // Get IDs of leads with embedding_final NOT NULL (from lead_embedding_final)
  const embeddedLeads = await fetchAllPaginated(
    'lead_embedding_final',
    'lead_id',
    { embedding_final: 'NOT_NULL' }
  );

  const embeddedIds = new Set(embeddedLeads.map(l => l.lead_id));
  console.log('Leads com embedding_final:', embeddedIds.size);

  // Get IDs of leads with components but needing recompute
  const needsRecompute = await fetchAllPaginated(
    'lead_embedding_components',
    'lead_id',
    { needs_final_recompute: true }
  );

  const needsRecomputeIds = new Set(needsRecompute.map(l => l.lead_id));
  console.log('Leads com needs_final_recompute = true:', needsRecomputeIds.size);

  // Get all component records
  const componentLeads = await fetchAllPaginated(
    'lead_embedding_components',
    'lead_id',
    {}
  );
  const componentIds = new Set(componentLeads.map(l => l.lead_id));

  // Calculate pending (sem registro em components)
  const pendingNoRecord = enrichedIds.filter(id => !componentIds.has(id));
  console.log('');
  console.log('=== LEADS PENDENTES PARA EMBEDDING ===');
  console.log('Sem registro em lead_embedding_components:', pendingNoRecord.length);

  // Leads with components but no final
  const enrichedNoFinal = enrichedIds.filter(id => componentIds.has(id) && !embeddedIds.has(id));
  console.log('Com componentes mas sem embedding_final:', enrichedNoFinal.length);

  // Total needing embedding
  const allPending = enrichedIds.filter(id => !embeddedIds.has(id));
  console.log('');
  console.log('=== TOTAL QUE PRECISA EMBEDDING ===');
  console.log('(que o workflow vai pegar):', allPending.length);

  // Get some details about pending leads
  if (allPending.length > 0) {
    const sampleIds = allPending.slice(0, 500);

    let sampleLeads = [];
    for (let i = 0; i < sampleIds.length; i += 100) {
      const batch = sampleIds.slice(i, i + 100);
      const { data } = await supabase
        .from('instagram_leads')
        .select('id, bio, website_text, hashtags_posts, hashtags_bio')
        .in('id', batch);
      if (data) sampleLeads = sampleLeads.concat(data);
    }

    let withBio = 0, withWebsite = 0, withHashtags = 0;
    for (const l of sampleLeads) {
      if (l.bio && l.bio !== '') withBio++;
      if (l.website_text && l.website_text !== '') withWebsite++;
      const hp = l.hashtags_posts ? (Array.isArray(l.hashtags_posts) ? l.hashtags_posts.length : 0) : 0;
      const hb = l.hashtags_bio ? (Array.isArray(l.hashtags_bio) ? l.hashtags_bio.length : 0) : 0;
      if (hp > 0 || hb > 0) withHashtags++;
    }

    console.log('');
    console.log('Da amostra de ' + sampleLeads.length + ' leads pendentes:');
    console.log('  - Com bio:', withBio);
    console.log('  - Com website_text:', withWebsite);
    console.log('  - Com hashtags:', withHashtags);
  }
}

checkPendingLeads().catch(console.error);
